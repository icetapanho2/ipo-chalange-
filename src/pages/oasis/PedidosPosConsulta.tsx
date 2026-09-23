import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPost } from "../../lib/api";
import { usePerfil } from "../../lib/PerfilContext";
import { DoenteModal } from "../../components/DoenteModal";
import { abrirDoente } from "../../components/NomeDoente";
import { dataHoraPT } from "../../lib/datas";
import { EVENTO_ACAO_TUTORIAL } from "../../lib/tutoriais";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  User,
} from "lucide-react";

/** Cartão no estilo usado no resto do site (Triagem, Serviço): branco, cabeçalho leve. */
function Painel({ titulo, tour, children }: { titulo?: string; tour?: string; children: ReactNode }) {
  return (
    <div data-tour={tour} className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {titulo && (
        <div className="border-b border-slate-100 px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">{titulo}</div>
      )}
      <div className="p-3.5">{children}</div>
    </div>
  );
}

type TipoPedido = "consulta" | "pedido_consulta" | "pedido_hd" | "exame" | "analises" | "tratamento";
type Prioridade = "" | "MP" | "P" | "N";

interface Especialidade {
  codigo: string;
  descricao: string;
}
interface AtoCatalogo {
  especialidade_codigo: string;
  ato_codigo: string;
  ato_descricao: string;
  tipo_pedido: string;
}
interface ExameCatalogo {
  codigo_exame: string;
  descricao_exame: string;
  especialidade_codigo: string;
  ato_codigo: string;
}
interface AnaliseCatalogo {
  codigo: string;
  descricao: string;
}
interface Catalogo {
  especialidades: Especialidade[];
  catalogoAtos: AtoCatalogo[];
  exames: ExameCatalogo[];
  analises: AnaliseCatalogo[];
}

interface Ato {
  mvp_ato_id: string;
  data_hora: string;
  especialidade_codigo: string;
  ato_codigo: string;
}
interface Doente {
  doente_id: string;
  nome: string;
  n_utente: string;
  transporte_nao_urgente?: boolean;
  distancia_km?: number;
}
interface RespostaConsulta {
  ato: Ato;
  doente: Doente | null;
}

interface PedidoForm {
  id: string;
  tipo_pedido: TipoPedido;
  especialidade_destino: string;
  ato_codigo: string;
  exames: string[];
  analises: string[];
  especificacao: string;
  prioridade: Prioridade;
  nao_antes: string;
  depende_exames_consulta: boolean;
  continuidade_medico: boolean;
}

interface PedidoSubmetido {
  pedido_id: string;
  estado: string;
  data_marcada: string;
  tipo_pedido_legivel: string;
  especialidade_destino_legivel: string;
  descricao: string;
  prioridade_legivel: string;
  estado_legivel: string;
}

interface RespostaSubmissao {
  ok: boolean;
  protocolo: string;
  criadoEm: string;
  medicoNome: string;
  pedidos: PedidoSubmetido[];
}

const TIPOS_PEDIDO: { valor: TipoPedido; titulo: string; subtitulo: string }[] = [
  { valor: "consulta", titulo: "Próxima consulta", subtitulo: "No seu serviço" },
  { valor: "pedido_consulta", titulo: "Pedido de consulta", subtitulo: "Interconsulta a outra especialidade" },
  { valor: "pedido_hd", titulo: "Hospital de Dia / Tratamento", subtitulo: "Sessão de Hospital de Dia" },
  { valor: "exame", titulo: "Exames", subtitulo: "Imagiologia (TC, ecografia…)" },
  { valor: "analises", titulo: "Análises", subtitulo: "Colheitas / laboratório" },
  { valor: "tratamento", titulo: "Outros exames ou tratamentos", subtitulo: "Manutenção de CVC, enfermagem…" },
];

const PRIORIDADES: { valor: Prioridade; legivel: string }[] = [
  { valor: "", legivel: "Automática (equação do sistema)" },
  { valor: "N", legivel: "Normal" },
  { valor: "P", legivel: "Prioritário" },
  { valor: "MP", legivel: "Muito prioritário" },
];

type Etapa = "tipos" | "preenchimento" | "resumo" | "confirmacao";

export function OasisPedidosPosConsulta() {
  const { atoId } = useParams<{ atoId: string }>();
  const navigate = useNavigate();
  const [dados, setDados] = useState<RespostaConsulta | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [etapa, setEtapa] = useState<Etapa>("tipos");
  const [tiposSelecionados, setTiposSelecionados] = useState<TipoPedido[]>([]);
  const [pedidos, setPedidos] = useState<PedidoForm[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aSubmeter, setASubmeter] = useState(false);
  const [resultado, setResultado] = useState<RespostaSubmissao | null>(null);
  const [modalDoenteAberto, setModalDoenteAberto] = useState(false);
  const proximoId = useRef(0);
  const { utilizadores } = usePerfil();
  const [transporte, setTransporte] = useState<boolean | null>(null);

  useEffect(() => {
    if (!atoId) return;
    apiGet<RespostaConsulta>(`/oasis/consulta/${atoId}`)
      .then(setDados)
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
    apiGet<Catalogo>("/catalogo").then(setCatalogo);
  }, [atoId]);

  function gerarId(): string {
    proximoId.current += 1;
    return `local-${proximoId.current}`;
  }

  function novoPedido(tipo: TipoPedido): PedidoForm {
    // Serviço já escolhido quando só há um possível (a próxima consulta é sempre no serviço desta consulta).
    const unicos = especialidadesParaTipo(tipo);
    const especialidade = unicos.length === 1 ? unicos[0].codigo : "";
    const atos = especialidade ? atosParaTipoEEspecialidade(tipo, especialidade) : [];
    return {
      id: gerarId(),
      tipo_pedido: tipo,
      especialidade_destino: especialidade,
      // Próxima consulta: o mesmo tipo de consulta que está a decorrer (o médico pode mudar).
      ato_codigo:
        atos.length === 1
          ? atos[0].ato_codigo
          : tipo === "consulta"
            ? (atos.find((a) => a.ato_codigo === dados?.ato.ato_codigo) ?? atos[0])?.ato_codigo ?? ""
            : "",
      exames: [],
      analises: [],
      especificacao: "",
      prioridade: "",
      nao_antes: "",
      depende_exames_consulta: false,
      continuidade_medico: tipo === "consulta",
    };
  }

  // Tutorial do Guião: "preencher por mim" o plano da Maria (o mesmo do guião e dos testes).
  useEffect(() => {
    const aoPedir = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== "preencher-maria" || !catalogo || !dados) return;
      const tipos: TipoPedido[] = ["analises", "exame", "consulta", "pedido_consulta"];
      const base = (tipo: TipoPedido, patch: Partial<PedidoForm>): PedidoForm => ({ ...novoPedido(tipo), ...patch });
      setTiposSelecionados(tipos);
      setPedidos([
        base("analises", { especialidade_destino: "6100", ato_codigo: "9", analises: ["A001", "A002", "A003", "A004", "A005"], especificacao: "Controlo de vigilância, em jejum; creatinina antes do TC com contraste." }),
        base("exame", { especialidade_destino: "7000_2", ato_codigo: "1", exames: ["7000002", "7000004", "7000009"], especificacao: "TC TAP com contraste — reavaliação de vigilância." }),
        base("consulta", { especialidade_destino: dados.ato.especialidade_codigo, depende_exames_consulta: true, continuidade_medico: true, especificacao: "Revisão com os resultados das análises e do TC." }),
        base("pedido_consulta", { especialidade_destino: "1300", ato_codigo: "1", especificacao: "Avaliação por Oncologia Médica." }),
      ]);
      setErro(null);
      setEtapa("preenchimento");
    };
    window.addEventListener(EVENTO_ACAO_TUTORIAL, aoPedir);
    return () => window.removeEventListener(EVENTO_ACAO_TUTORIAL, aoPedir);
  });

  function alternarTipo(tipo: TipoPedido) {
    setTiposSelecionados((atual) => (atual.includes(tipo) ? atual.filter((t) => t !== tipo) : [...atual, tipo]));
  }

  function avancarParaPreenchimento() {
    setErro(null);
    setPedidos((atual) => {
      const semTipo = tiposSelecionados.filter((tipo) => !atual.some((p) => p.tipo_pedido === tipo));
      // Mantém pedidos de tipos entretanto desmarcados (não perde trabalho já feito) e garante
      // pelo menos um bloco para cada tipo recém-seleccionado.
      return [...atual, ...semTipo.map(novoPedido)];
    });
    setEtapa("preenchimento");
  }

  function adicionarPedido(tipo: TipoPedido) {
    setPedidos((atual) => [...atual, novoPedido(tipo)]);
  }

  function removerPedido(id: string) {
    setPedidos((atual) => atual.filter((p) => p.id !== id));
  }

  function atualizarPedido(id: string, patch: Partial<PedidoForm>) {
    setPedidos((atual) => atual.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  const pedidosVisiveis = useMemo(
    () => pedidos.filter((p) => tiposSelecionados.includes(p.tipo_pedido)),
    [pedidos, tiposSelecionados],
  );

  function avancarParaResumo() {
    setErro(null);
    if (pedidosVisiveis.length === 0) {
      setErro("Preencha pelo menos um pedido antes de continuar.");
      return;
    }
    for (const p of pedidosVisiveis) {
      if (!p.especialidade_destino || !p.ato_codigo) {
        setErro("Há pedidos por preencher: escolha o serviço/especialidade e o acto em cada um.");
        return;
      }
      if (!p.especificacao.trim()) {
        setErro("Escreva as observações de cada pedido (o motivo ou o que o serviço precisa de saber).");
        return;
      }
    }
    setEtapa("resumo");
  }

  async function submeter() {
    if (!atoId) return;
    setErro(null);
    setASubmeter(true);
    try {
      const corpo = {
        pedidos: pedidosVisiveis.map((p) => ({
          especialidade_destino: p.especialidade_destino,
          ato_codigo: p.ato_codigo,
          exames: p.exames,
          analises: p.analises,
          especificacao: p.especificacao,
          prioridade: p.prioridade || null,
          nao_antes: p.nao_antes,
          depende_exames_consulta: p.depende_exames_consulta,
          continuidade_medico: p.continuidade_medico,
        })),
        ...(transporte !== null ? { transporte_nao_urgente: transporte } : {}),
      };
      const r = await apiPost<RespostaSubmissao>(`/oasis/consulta/${atoId}/pedidos`, corpo);
      setResultado(r);
      setEtapa("confirmacao");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setASubmeter(false);
    }
  }

  /**
   * Só se oferecem serviços que dão seguimento ao pedido: os que passam por triagem precisam de um
   * triador nesse serviço; os restantes, de uma administrativa que trate das marcações. A próxima
   * consulta é sempre no serviço desta consulta. Uma interconsulta nunca é para o próprio serviço.
   */
  function especialidadesParaTipo(tipo: TipoPedido): Especialidade[] {
    if (!catalogo) return [];
    const servicoConsulta = dados?.ato.especialidade_codigo ?? "";
    const perfilNecessario = tipo === "pedido_consulta" || tipo === "pedido_hd" ? "TRIADOR" : "ADMINISTRATIVO";
    const comEquipa = new Set(utilizadores.filter((u) => u.perfil === perfilNecessario).map((u) => u.especialidade_codigo));
    const codigos = new Set(
      catalogo.catalogoAtos
        .filter((a) => a.tipo_pedido === tipo && comEquipa.has(a.especialidade_codigo))
        .filter((a) => (tipo === "consulta" ? a.especialidade_codigo === servicoConsulta : tipo === "pedido_consulta" ? a.especialidade_codigo !== servicoConsulta : true))
        .map((a) => a.especialidade_codigo),
    );
    return catalogo.especialidades.filter((e) => codigos.has(e.codigo));
  }

  function atosParaTipoEEspecialidade(tipo: TipoPedido, especialidade: string): AtoCatalogo[] {
    if (!catalogo) return [];
    return catalogo.catalogoAtos.filter((a) => a.tipo_pedido === tipo && a.especialidade_codigo === especialidade);
  }

  function tituloTipo(tipo: TipoPedido): string {
    return TIPOS_PEDIDO.find((t) => t.valor === tipo)?.titulo ?? tipo;
  }

  function descricaoResumo(p: PedidoForm): { titulo: string; detalhes: string } {
    const ato = catalogo?.catalogoAtos.find((a) => a.especialidade_codigo === p.especialidade_destino && a.ato_codigo === p.ato_codigo);
    const especialidade = catalogo?.especialidades.find((e) => e.codigo === p.especialidade_destino);
    const examesTxt = p.exames.map((c) => catalogo?.exames.find((e) => e.codigo_exame === c)?.descricao_exame ?? c).join(", ");
    const analisesTxt = p.analises.map((c) => catalogo?.analises.find((a) => a.codigo === c)?.descricao ?? c).join(", ");
    const detalhes = [especialidade?.descricao, examesTxt, analisesTxt, p.especificacao].filter(Boolean).join(" · ");
    return { titulo: ato?.ato_descricao ?? tituloTipo(p.tipo_pedido), detalhes: detalhes || "—" };
  }

  const dia = dados?.ato.data_hora.slice(0, 10);
  const voltarAgenda = () => navigate(dia ? `/oasis/medico?data=${dia}` : "/oasis/medico");

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Cabeçalho da página, igual ao resto do site */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Pedidos Pós-Consulta</h1>
          <p className="mt-1 text-xs text-slate-500">Escolha o que pretende pedir. Os pedidos seguem logo para triagem ou marcação, com as dependências entre eles.</p>
        </div>
        <div className="flex items-center gap-2">
          {dados?.doente && (
            <span className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs">
              <User className="h-3.5 w-3.5 text-oasis-accent" />
              <span>{dados.doente.nome}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => atoId && navigate(`/oasis/medico/${atoId}`)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
          >
            ← Voltar à consulta
          </button>
        </div>
      </div>

      {/* Barra de progresso das 4 etapas */}
      <div className="mt-4 mb-4 flex items-center gap-1.5">
        {(
          [
            { chave: "tipos" as const, titulo: "Tipo de pedidos" },
            { chave: "preenchimento" as const, titulo: "Preenchimento" },
            { chave: "resumo" as const, titulo: "Resumo" },
            { chave: "confirmacao" as const, titulo: "Confirmação" },
          ]
        ).map((passo, i) => {
          const ordem: Etapa[] = ["tipos", "preenchimento", "resumo", "confirmacao"];
          const indiceAtual = ordem.indexOf(etapa);
          const indicePasso = ordem.indexOf(passo.chave);
          const activo = indicePasso === indiceAtual;
          const concluido = indicePasso < indiceAtual;
          return (
            <div key={passo.chave} className="flex flex-1 items-center gap-1.5">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  activo
                    ? "bg-oasis-header text-white"
                    : concluido
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {concluido ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-[11px] font-semibold ${activo ? "text-slate-800" : "text-slate-400"}`}>{passo.titulo}</span>
              {i < 3 && <div className={`h-px flex-1 ${concluido ? "bg-emerald-400" : "bg-slate-200"}`} />}
            </div>
          );
        })}
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <strong>Erro:</strong> {erro}
        </div>
      )}

      {!dados || !catalogo ? (
        <div className="mt-8 flex h-64 items-center justify-center text-slate-500 gap-2">
          <span>A carregar…</span>
        </div>
      ) : (
        <>
          {/* ETAPA 2: TIPO DE PEDIDOS */}
          {etapa === "tipos" && (
            <Painel titulo="Tipo de Pedidos" tour="tipos-pedido">
              <p className="text-xs text-slate-500 mb-3">
                Escolha uma ou várias opções (equivalente ao Modelo 234). Pode juntar vários tipos na mesma submissão.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TIPOS_PEDIDO.filter((t) => especialidadesParaTipo(t.valor).length > 0).map((t) => (
                  <label
                    key={t.valor}
                    className={`flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors ${
                      tiposSelecionados.includes(t.valor) ? "border-oasis-accent bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={tiposSelecionados.includes(t.valor)}
                      onChange={() => alternarTipo(t.valor)}
                    />
                    <div>
                      <p className="text-sm font-bold text-slate-800">{t.titulo}</p>
                      <p className="text-xs text-slate-500">{t.subtitulo}</p>
                    </div>
                  </label>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => atoId && navigate(`/oasis/medico/${atoId}`)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Anterior</span>
                </button>
                <button
                  id="btn-tipos-seguinte"
                  type="button"
                  disabled={tiposSelecionados.length === 0}
                  onClick={avancarParaPreenchimento}
                  className="inline-flex items-center gap-1 rounded-lg bg-oasis-header px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-700 disabled:opacity-40"
                >
                  <span>Seguinte</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </Painel>
          )}

          {/* ETAPA 3: PREENCHIMENTO DOS PEDIDOS */}
          {etapa === "preenchimento" && (
            <Painel titulo="Preenchimento dos Pedidos" tour="preenchimento">
              <div className="space-y-6">
                {tiposSelecionados.map((tipo) => {
                  const blocos = pedidos.filter((p) => p.tipo_pedido === tipo);
                  return (
                    <div key={tipo}>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{tituloTipo(tipo)}</h4>
                      <div className="space-y-3">
                        {blocos.map((p) => {
                          const indiceGlobal = pedidosVisiveis.findIndex((x) => x.id === p.id) + 1;
                          const especialidades = especialidadesParaTipo(tipo);
                          const atos = atosParaTipoEEspecialidade(tipo, p.especialidade_destino);
                          const mostraExames = p.especialidade_destino === "7000_2" || p.especialidade_destino === "7000_3";
                          const mostraAnalises = p.especialidade_destino === "6100";
                          const examesDoAto = catalogo.exames.filter(
                            (e) => e.especialidade_codigo === p.especialidade_destino && e.ato_codigo === p.ato_codigo,
                          );
                          return (
                            <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                              <div className="flex items-center justify-between mb-2.5">
                                <span className="text-xs font-bold text-slate-700">
                                  Pedido {indiceGlobal || "—"} — {tituloTipo(tipo)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removerPedido(p.id)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:text-red-800"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Remover</span>
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <label className="text-xs">
                                  <span className="block font-semibold text-slate-700 mb-0.5">Serviço / Especialidade *</span>
                                  <select
                                    className="w-full rounded border border-slate-300 px-2 py-1.5"
                                    value={p.especialidade_destino}
                                    onChange={(e) => atualizarPedido(p.id, { especialidade_destino: e.target.value, ato_codigo: "", exames: [], analises: [] })}
                                  >
                                    <option value="">—</option>
                                    {especialidades.map((esp) => (
                                      <option key={esp.codigo} value={esp.codigo}>
                                        {esp.descricao}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="text-xs">
                                  <span className="block font-semibold text-slate-700 mb-0.5">Prioridade</span>
                                  <select
                                    className="w-full rounded border border-slate-300 px-2 py-1.5"
                                    value={p.prioridade}
                                    onChange={(e) => atualizarPedido(p.id, { prioridade: e.target.value as Prioridade })}
                                  >
                                    {PRIORIDADES.map((op) => (
                                      <option key={op.valor} value={op.valor}>
                                        {op.legivel}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="text-xs">
                                  <span className="block font-semibold text-slate-700 mb-0.5">Data/período pretendido</span>
                                  <input
                                    type="date"
                                    className="w-full rounded border border-slate-300 px-2 py-1.5"
                                    value={p.nao_antes}
                                    onChange={(e) => atualizarPedido(p.id, { nao_antes: e.target.value })}
                                  />
                                </label>
                              </div>

                              <label className="block text-xs mt-2.5">
                                <span className="block font-semibold text-slate-700 mb-0.5">Acto *</span>
                                <select
                                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                                  value={p.ato_codigo}
                                  onChange={(e) => atualizarPedido(p.id, { ato_codigo: e.target.value, exames: [], analises: [] })}
                                  disabled={!p.especialidade_destino}
                                >
                                  <option value="">—</option>
                                  {atos.map((a) => (
                                    <option key={a.ato_codigo} value={a.ato_codigo}>
                                      {a.ato_descricao}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              {mostraExames && p.ato_codigo && (
                                <div className="mt-2.5">
                                  <span className="block text-xs font-semibold text-slate-700 mb-1">Exames</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {examesDoAto.map((ex) => (
                                      <label
                                        key={ex.codigo_exame}
                                        className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px]"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={p.exames.includes(ex.codigo_exame)}
                                          onChange={() =>
                                            atualizarPedido(p.id, {
                                              exames: p.exames.includes(ex.codigo_exame)
                                                ? p.exames.filter((c) => c !== ex.codigo_exame)
                                                : [...p.exames, ex.codigo_exame],
                                            })
                                          }
                                        />
                                        {ex.descricao_exame}
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {mostraAnalises && p.ato_codigo && (
                                <div className="mt-2.5">
                                  <span className="block text-xs font-semibold text-slate-700 mb-1">Análises</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {catalogo.analises.map((an) => (
                                      <label key={an.codigo} className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px]">
                                        <input
                                          type="checkbox"
                                          checked={p.analises.includes(an.codigo)}
                                          onChange={() =>
                                            atualizarPedido(p.id, {
                                              analises: p.analises.includes(an.codigo)
                                                ? p.analises.filter((c) => c !== an.codigo)
                                                : [...p.analises, an.codigo],
                                            })
                                          }
                                        />
                                        {an.descricao}
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {tipo === "consulta" && (
                                <label className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={p.continuidade_medico}
                                    onChange={(e) => atualizarPedido(p.id, { continuidade_medico: e.target.checked })}
                                  />
                                  Continuidade — agendar comigo sempre que possível
                                </label>
                              )}

                              {tipo === "consulta" && (
                                <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={p.depende_exames_consulta}
                                    onChange={(e) => atualizarPedido(p.id, { depende_exames_consulta: e.target.checked })}
                                  />
                                  Esta consulta depende dos exames/análises pedidos agora (só marca depois de terem resultado)
                                </label>
                              )}

                              <label className="block text-xs mt-2.5">
                                <span className="block font-semibold text-slate-700 mb-0.5">Observações *</span>
                                <textarea
                                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                                  rows={2}
                                  value={p.especificacao}
                                  onChange={(e) => atualizarPedido(p.id, { especificacao: e.target.value })}
                                />
                              </label>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => adicionarPedido(tipo)}
                        className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-oasis-accent hover:underline"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Adicionar outro pedido — {tituloTipo(tipo)}</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex items-center justify-between pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEtapa("tipos")}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Anterior</span>
                </button>
                <button
                  id="btn-preenchimento-seguinte"
                  type="button"
                  onClick={avancarParaResumo}
                  className="inline-flex items-center gap-1 rounded-lg bg-oasis-header px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-700"
                >
                  <span>Seguinte</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </Painel>
          )}

          {/* ETAPA 4: RESUMO E SUBMISSÃO */}
          {etapa === "resumo" && (
            <Painel titulo="Resumo do Pedido de Marcações" tour="resumo">
              <div className="mb-3 text-xs text-slate-500">
                <strong className="text-slate-800">{dados.doente?.nome}</strong> · Médico requisitante: reveja os pedidos antes de submeter.
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-300 text-[11px] uppercase text-slate-500">
                      <th className="py-2 pr-2">#</th>
                      <th className="py-2 pr-2">Pedido</th>
                      <th className="py-2 pr-2">Detalhes</th>
                      <th className="py-2 pr-2">Prioridade</th>
                      <th className="py-2 pr-2">Estado</th>
                      <th className="py-2 pr-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidosVisiveis.map((p, i) => {
                      const { titulo, detalhes } = descricaoResumo(p);
                      return (
                        <tr key={p.id} className="border-b border-slate-100 align-top">
                          <td className="py-2 pr-2 font-mono text-slate-500">{i + 1}</td>
                          <td className="py-2 pr-2 font-semibold text-slate-800">{titulo}</td>
                          <td className="py-2 pr-2 text-slate-600">{detalhes}</td>
                          <td className="py-2 pr-2">
                            {PRIORIDADES.find((op) => op.valor === p.prioridade)?.legivel === "Automática (equação do sistema)"
                              ? "Automática"
                              : PRIORIDADES.find((op) => op.valor === p.prioridade)?.legivel}
                          </td>
                          <td className="py-2 pr-2">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">A submeter</span>
                          </td>
                          <td className="py-2 pr-2">
                            <button
                              type="button"
                              onClick={() => removerPedido(p.id)}
                              className="text-[11px] font-semibold text-red-600 hover:text-red-800"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() => setEtapa("tipos")}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-oasis-accent hover:underline"
                title="Voltar à escolha dos pedidos a fazer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Adicionar pedido</span>
              </button>

              {/* Transporte: entra no custo de remarcar e na escolha do dia (dia único para quem vem de longe) */}
              <label className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={transporte ?? !!dados.doente?.transporte_nao_urgente}
                  onChange={(e) => setTransporte(e.target.checked)}
                />
                <span>
                  <strong>O doente precisa de transporte não urgente</strong> (ambulância/táxi)
                  {dados.doente?.distancia_km ? ` · mora a ${dados.doente.distancia_km} km` : ""}. O sistema evita mudar-lhe marcações e junta-as no mesmo dia
                  sempre que possível.
                </span>
              </label>

              <div className="mt-5 flex items-center justify-between pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEtapa("preenchimento")}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Anterior</span>
                </button>
                <button
                  id="btn-submeter-pedidos"
                  type="button"
                  disabled={aSubmeter}
                  onClick={submeter}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  <span>{aSubmeter ? "A submeter…" : "Submeter pedidos"}</span>
                  {!aSubmeter && <ChevronRight className="h-3.5 w-3.5" />}
                </button>
              </div>
            </Painel>
          )}

          {/* ETAPA 5: PEDIDO SUBMETIDO */}
          {etapa === "confirmacao" && resultado && (
            <div data-tour="confirmacao" className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm max-w-xl mx-auto">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-9 w-9 text-emerald-600" />
              </div>
              <p className="mt-4 text-lg font-bold text-slate-900">{resultado.pedidos.length} pedido(s) enviados</p>
              <p className="mt-1 text-xs text-slate-500">
                {resultado.medicoNome} · {dataHoraPT(resultado.criadoEm)} · protocolo {resultado.protocolo}
              </p>

              {/* O que aconteceu a cada pedido, já — é isto que passa a aparecer no perfil do doente */}
              <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 text-left text-xs">
                {resultado.pedidos.map((p) => (
                  <li key={p.pedido_id} className="flex items-start justify-between gap-3 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-800">{p.descricao.split(" — ")[0]}</span>
                      <span className="text-slate-500">{p.especialidade_destino_legivel}</span>
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${
                        p.data_marcada ? "bg-emerald-100 text-emerald-800" : p.estado === "EM_TRIAGEM" ? "bg-violet-100 text-violet-800" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {p.data_marcada ? `Marcado ${dataHoraPT(p.data_marcada)}` : p.estado === "EM_TRIAGEM" ? "Enviado para triagem" : p.estado_legivel}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-left text-xs text-sky-900">
                <strong>Perfil de {dados.doente?.nome} actualizado:</strong>{" "}
                {resultado.pedidos.filter((p) => p.data_marcada).length} marcado(s) ·{" "}
                {resultado.pedidos.filter((p) => p.estado === "EM_TRIAGEM").length} em triagem ·{" "}
                {resultado.pedidos.filter((p) => !p.data_marcada && p.estado !== "EM_TRIAGEM").length} por marcar. Cada serviço já recebeu os seus
                pedidos; o doente recebe o aviso com a preparação de cada exame.
              </div>

              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => dados.doente && abrirDoente(dados.doente.doente_id)}
                  className="rounded-lg bg-oasis-header px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-700"
                >
                  Ver o perfil do doente
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEtapa("tipos");
                    setTiposSelecionados([]);
                    setPedidos([]);
                    setResultado(null);
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Adicionar mais pedidos a esta consulta
                </button>
                <button type="button" onClick={voltarAgenda} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50">
                  Voltar à agenda
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {modalDoenteAberto && dados?.doente && (
        <DoenteModal doenteId={dados.doente.doente_id} onFechar={() => setModalDoenteAberto(false)} />
      )}
    </div>
  );
}
