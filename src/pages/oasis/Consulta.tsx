import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { OasisPainel, OasisShell } from "../../oasis/OasisShell";
import { apiGet, apiPost, apiPut } from "../../lib/api";
import { DoenteModal } from "../../components/DoenteModal";
import {
  User,
  Activity,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileEdit,
  Wand2,
  ExternalLink,
  ChevronRight,
  Info,
  Pencil,
  Stethoscope,
  ShieldAlert,
  Phone,
  Hourglass,
  CalendarCheck2,
  BadgeCheck,
} from "lucide-react";

interface Ato {
  mvp_ato_id: string;
  data_hora: string;
  ato_descricao: string;
  especialidade_codigo: string;
  especialidade_descricao: string;
  gabinete_descricao: string;
}

interface Doente {
  doente_id: string;
  nome: string;
  n_utente: string;
  data_nascimento: string;
  sexo: string;
  diagnostico_principal?: string;
  estadiamento?: string;
  alergias?: string[];
  contacto?: string;
  notas_clinicas?: string;
}

interface ResumoPedidos {
  total: number;
  pendentes: number;
  agendados: number;
  realizados: number;
}

const OPCOES_ESTADIAMENTO = ["", "Estádio I", "Estádio II", "Estádio III", "Estádio IV", "Metastático"];

interface Nota {
  s: string;
  o: string;
  a: string;
  p: string;
  guardado_em: string;
}

interface PedidoDetalhado {
  pedido_id: string;
  tipo_pedido: string;
  tipo_pedido_legivel: string;
  especialidade_destino: string;
  especialidade_destino_legivel: string;
  ato_codigo: string;
  exames: string[];
  analises: string[];
  especificacao: string;
  descricao: string;
  prioridade: string;
  prioridade_legivel: string;
  prioridade_por_defeito: boolean;
  prazo_limite: string;
  nao_antes: string;
  confianca: number;
  baixa_confianca: boolean;
  texto_origem: string;
  estado: string;
  estado_legivel: string;
}

interface RespostaConsulta {
  ato: Ato;
  doente: Doente | null;
  nota: Nota | null;
  pedidosExistentes?: PedidoDetalhado[];
  resumoPedidos?: ResumoPedidos;
}

interface NotificacaoAdministrativa {
  nome: string;
  cargo: string;
  especialidade_legivel: string;
}

interface RespostaGuardar {
  ok: boolean;
  pedidosCriados: number;
  pedidos: PedidoDetalhado[];
  alertas: string[];
  notificacaoAdministrativa?: NotificacaoAdministrativa | null;
}

const SECAO_CLINICA = {
  titulo: "S/O/A — Registo Clínico",
  subtitulo: "Subjectivo, objectivo e avaliação: sintomas, achados do exame físico e diagnóstico/evolução, em texto livre",
  ajuda:
    "Ex: Doente refere cansaço ligeiro, nega dor abdominal. ECOG 0, abdómen mole e indolor. Adenocarcinoma do " +
    "cólon estádio III sob vigilância, boa evolução.",
};

const SECAO_PLANO = {
  chave: "p" as const,
  titulo: "P — Plano Terapêutico & Pedidos Pós-Consulta",
  subtitulo: "Exames, análises, consultas de revisão e interconsultas a outros serviços",
  ajuda: "O Agente Oasis analisa este plano para extrair pedidos, marcar no serviço e enviar a triagem.",
};

export function OasisConsulta() {
  const { atoId } = useParams<{ atoId: string }>();
  const navigate = useNavigate();
  const [dados, setDados] = useState<RespostaConsulta | null>(null);
  const [campos, setCampos] = useState({ soa: "", p: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const [resultado, setResultado] = useState<RespostaGuardar | null>(null);
  const [modalDoenteAberto, setModalDoenteAberto] = useState(false);
  const [modoFormulario, setModoFormulario] = useState<"soap" | "interativo">("soap");
  const [confirmacaoPendente, setConfirmacaoPendente] = useState(false);
  const [aEditarClinico, setAEditarClinico] = useState(false);
  const [formClinico, setFormClinico] = useState({
    diagnostico_principal: "",
    estadiamento: "",
    alergias: "",
    contacto: "",
    notas_clinicas: "",
  });
  const [aGuardarClinico, setAGuardarClinico] = useState(false);

  function carregar() {
    if (!atoId) return;
    apiGet<RespostaConsulta>(`/oasis/consulta/${atoId}`)
      .then((r) => {
        setDados(r);
        if (r.nota) {
          const soa = [r.nota.s, r.nota.o, r.nota.a].filter((texto) => texto.trim()).join("\n\n");
          setCampos({ soa, p: r.nota.p });
        }
        if (r.pedidosExistentes && r.pedidosExistentes.length > 0) {
          setResultado({
            ok: true,
            pedidosCriados: r.pedidosExistentes.length,
            pedidos: r.pedidosExistentes,
            alertas: [],
          });
        }
        setFormClinico({
          diagnostico_principal: r.doente?.diagnostico_principal ?? "",
          estadiamento: r.doente?.estadiamento ?? "",
          alergias: (r.doente?.alergias ?? []).join(", "),
          contacto: r.doente?.contacto ?? "",
          notas_clinicas: r.doente?.notas_clinicas ?? "",
        });
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }

  useEffect(carregar, [atoId]);

  async function guardarClinico() {
    if (!dados?.doente) return;
    setErro(null);
    setAGuardarClinico(true);
    try {
      await apiPut(`/doente/${dados.doente.doente_id}`, formClinico);
      setAEditarClinico(false);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAGuardarClinico(false);
    }
  }

  async function guardar() {
    if (!atoId) return;
    setAGuardar(true);
    setErro(null);
    setResultado(null);
    try {
      // O S/O/A fica junto num único campo de escrita livre; o servidor continua a guardar
      // s/o/a/p em separado, por isso todo o texto clínico vai para "s" e o P fica à parte.
      const r = await apiPost<RespostaGuardar>(`/oasis/consulta/${atoId}/guardar`, {
        s: campos.soa,
        o: "",
        a: "",
        p: campos.p,
      });
      setResultado(r);
      setConfirmacaoPendente(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAGuardar(false);
    }
  }

  function avancarParaAgenda() {
    setConfirmacaoPendente(false);
    const dia = dados?.ato.data_hora.slice(0, 10);
    const destino = dia ? `/oasis/medico?data=${dia}` : "/oasis/medico";
    navigate(destino, {
      state: resultado?.notificacaoAdministrativa ? { toastAdministrativo: resultado.notificacaoAdministrativa } : undefined,
    });
  }

  return (
    <OasisShell
      titulo="Registo Clínico da Consulta"
      acoes={
        <div className="flex items-center gap-2">
          <div className="group relative">
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-white hover:bg-white/10 transition-colors"
              title="Como funciona o Agente Oasis"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
            <div className="invisible absolute right-0 top-full z-20 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 text-left text-slate-700 opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Sparkles className="h-3.5 w-3.5 text-oasis-accent" />
                <span>Como funciona o Agente</span>
              </h4>
              <p className="text-[11px] leading-relaxed text-slate-600">
                1. Digite no <strong>P — Plano</strong> ou use o <strong>Construtor Assistido</strong>.
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                2. Ao clicar em <strong>Guardar & Extrair</strong>, o agente traduz linguagem clínica livre para pedidos formais.
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                3. Consultas do mesmo serviço e exames são preparados para agendamento direto; interconsultas seguem para triagem.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/oasis/medico")}
            className="rounded border border-slate-300 px-2.5 py-1 text-xs text-white hover:bg-white/10 transition-colors"
          >
            ← Voltar à agenda
          </button>
        </div>
      }
    >
      {erro && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <strong>Erro:</strong> {erro}
        </div>
      )}

      {!dados ? (
        <div className="flex h-64 items-center justify-center text-slate-500 gap-2">
          <Clock className="h-5 w-5 animate-spin text-oasis-header" />
          <span>A carregar consulta e prontuário do utente…</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
          {/* PAINEL ESQUERDO: DOENTE E DADOS DO ATO */}
          <div className="space-y-3">
            <OasisPainel titulo="Identificação do Utente">
              <div className="space-y-3">
                <div
                  onClick={() => setModalDoenteAberto(true)}
                  className="group -m-1 cursor-pointer rounded-lg p-2.5 transition-all hover:bg-slate-100 border border-transparent hover:border-slate-200"
                  title="Clique para ver o que falta e o histórico completo do doente"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-oasis-header text-white font-bold shadow-2xs group-hover:bg-oasis-accent">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 group-hover:text-oasis-accent flex items-center gap-1.5">
                          {dados.doente?.nome ?? "Sem nome"}
                          <span
                            id="icone-prontidao-doente"
                            role="button"
                            title="Ver prontidão e o que falta"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalDoenteAberto(true);
                            }}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-sky-700 hover:bg-sky-200"
                          >
                            <Activity className="h-3 w-3" />
                          </span>
                        </p>
                        <p className="text-xs text-slate-500">Nº {dados.doente?.n_utente}</p>
                      </div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-600 bg-white p-1.5 rounded border border-slate-200">
                    <span>Nasc: {dados.doente?.data_nascimento}</span>
                    <span>Sexo: {dados.doente?.sexo === "M" ? "Masc" : "Fem"}</span>
                  </div>
                </div>

                <div className="border-t border-oasis-border pt-2 text-xs space-y-1 text-slate-700">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Especialidade:</span>
                    <span className="font-semibold text-slate-800">{dados.ato.especialidade_descricao}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tipo de Acto:</span>
                    <span className="font-medium">{dados.ato.ato_descricao}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Gabinete:</span>
                    <span>{dados.ato.gabinete_descricao}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Data e Hora:</span>
                    <span className="font-mono text-slate-800">{dados.ato.data_hora.replace("T", " ")}</span>
                  </div>
                </div>

                {dados.nota && (
                  <div className="rounded bg-slate-100 p-2 text-[11px] text-slate-500 border border-slate-200">
                    Última gravação: {dados.nota.guardado_em.replace("T", " às ")}
                  </div>
                )}

                {/* Ícones de estado dos pedidos do doente: visão rápida antes de escrever o plano */}
                {dados.resumoPedidos && dados.resumoPedidos.total > 0 && (
                  <button
                    type="button"
                    onClick={() => setModalDoenteAberto(true)}
                    className="grid w-full grid-cols-3 gap-1.5 text-center"
                    title="Ver todos os pedidos do doente"
                  >
                    <span className="flex flex-col items-center gap-0.5 rounded-lg border border-red-200 bg-red-50 py-1.5">
                      <Hourglass className="h-3.5 w-3.5 text-red-600" />
                      <span className="text-xs font-bold text-red-800">{dados.resumoPedidos.pendentes}</span>
                      <span className="text-[9px] font-semibold uppercase text-red-700">Pendentes</span>
                    </span>
                    <span className="flex flex-col items-center gap-0.5 rounded-lg border border-amber-200 bg-amber-50 py-1.5">
                      <CalendarCheck2 className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-xs font-bold text-amber-800">{dados.resumoPedidos.agendados}</span>
                      <span className="text-[9px] font-semibold uppercase text-amber-700">Agendados</span>
                    </span>
                    <span className="flex flex-col items-center gap-0.5 rounded-lg border border-emerald-200 bg-emerald-50 py-1.5">
                      <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-800">{dados.resumoPedidos.realizados}</span>
                      <span className="text-[9px] font-semibold uppercase text-emerald-700">Realizados</span>
                    </span>
                  </button>
                )}
              </div>
            </OasisPainel>

            {/* Perfil Clínico: mais detalhe + edição directa, sem sair da consulta */}
            <OasisPainel
              titulo="Perfil Clínico"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-slate-500">Usado no factor clínico da equação de prioridade</span>
                {!aEditarClinico && (
                  <button
                    type="button"
                    onClick={() => setAEditarClinico(true)}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shrink-0"
                  >
                    <Pencil className="h-3 w-3" />
                    <span>Editar</span>
                  </button>
                )}
              </div>

              {!aEditarClinico ? (
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-1.5">
                    <Stethoscope className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-500">Diagnóstico: </span>
                      <span className="text-slate-800 font-medium">{dados.doente?.diagnostico_principal || "— Não registado"}</span>
                      {dados.doente?.estadiamento && (
                        <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                          {dados.doente.estadiamento}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-500">Alergias: </span>
                      <span className="text-slate-800">
                        {dados.doente?.alergias && dados.doente.alergias.length > 0
                          ? dados.doente.alergias.join(", ")
                          : "— Nenhuma registada"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-500">Contacto: </span>
                      <span className="text-slate-800">{dados.doente?.contacto || "— Não registado"}</span>
                    </div>
                  </div>
                  {dados.doente?.notas_clinicas && (
                    <p className="rounded bg-slate-50 p-2 text-[11px] text-slate-600 border border-slate-100 leading-relaxed">
                      {dados.doente.notas_clinicas}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-0.5">Diagnóstico principal</label>
                    <input
                      type="text"
                      value={formClinico.diagnostico_principal}
                      onChange={(e) => setFormClinico((f) => ({ ...f, diagnostico_principal: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-0.5">Estadiamento</label>
                    <select
                      value={formClinico.estadiamento}
                      onChange={(e) => setFormClinico((f) => ({ ...f, estadiamento: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-800"
                    >
                      {OPCOES_ESTADIAMENTO.map((op) => (
                        <option key={op} value={op}>
                          {op || "— Não registado"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-0.5">Alergias (vírgula)</label>
                    <input
                      type="text"
                      value={formClinico.alergias}
                      onChange={(e) => setFormClinico((f) => ({ ...f, alergias: e.target.value }))}
                      placeholder="Ex: Penicilina, Contraste iodado"
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-0.5">Contacto</label>
                    <input
                      type="text"
                      value={formClinico.contacto}
                      onChange={(e) => setFormClinico((f) => ({ ...f, contacto: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-0.5">Notas clínicas</label>
                    <textarea
                      value={formClinico.notas_clinicas}
                      onChange={(e) => setFormClinico((f) => ({ ...f, notas_clinicas: e.target.value }))}
                      rows={2}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={guardarClinico}
                      disabled={aGuardarClinico}
                      className="rounded-lg bg-oasis-header px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
                    >
                      {aGuardarClinico ? "A guardar…" : "Guardar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAEditarClinico(false);
                        carregar();
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </OasisPainel>

            {/* Toggle: Formulário SOAP vs Construtor Interativo */}
            <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-2xs">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md">
                <button
                  type="button"
                  onClick={() => setModoFormulario("soap")}
                  className={`flex-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                    modoFormulario === "soap" ? "bg-white text-oasis-header shadow-2xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <FileEdit className="h-3.5 w-3.5" />
                  <span>Formulário SOAP</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModoFormulario("interativo")}
                  className={`flex-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                    modoFormulario === "interativo" ? "bg-white text-oasis-header shadow-2xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  <span>Construtor Interativo</span>
                </button>
              </div>
            </div>
          </div>

          {/* PAINEL DIREITO: REGISTO CLÍNICO & CONSTRUTOR */}
          <div className="space-y-4">
            {/* SEPARADOR: CONSTRUTOR DE PEDIDOS ASSISTIDO — em desenvolvimento, fica em stand-by */}
            {modoFormulario === "interativo" && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <Wand2 className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                <h4 className="text-sm font-bold text-slate-600">Construtor Interativo — em trabalho, brevemente disponível</h4>
                <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                  Este formulário assistido para preencher pedidos por selecção visual está em desenvolvimento. Por
                  agora, use o Formulário SOAP para registar a consulta e gerar pedidos.
                </p>
                <button
                  type="button"
                  onClick={() => setModoFormulario("soap")}
                  className="mt-3 rounded-lg bg-oasis-header px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  Usar Formulário SOAP
                </button>
              </div>
            )}

            {/* SEPARADOR: REGISTO SOAP REALISTA DO OASIS */}
            {modoFormulario === "soap" && (
              <OasisPainel titulo="Folha Clínica de Registo Médico (SOAP)">
                <div className="space-y-4">
                  {/* S/O/A num único campo de escrita livre */}
                  <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                    <div className="mb-1.5">
                      <label className="text-xs font-bold text-slate-800">{SECAO_CLINICA.titulo}</label>
                      <span className="text-[11px] text-slate-400 block">{SECAO_CLINICA.subtitulo}</span>
                    </div>
                    <textarea
                      id="campo-soap-soa"
                      className="w-full rounded border border-slate-300 bg-white p-2.5 text-xs text-slate-800 transition-colors focus:outline-none focus:border-oasis-accent"
                      rows={5}
                      value={campos.soa}
                      onChange={(e) => setCampos((c) => ({ ...c, soa: e.target.value }))}
                      placeholder={SECAO_CLINICA.ajuda}
                    />
                  </div>

                  {/* P — Plano, à parte e por último: é o campo que o Agente Oasis lê */}
                  <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <div>
                        <label className="text-xs font-bold text-slate-800">{SECAO_PLANO.titulo}</label>
                        <span className="text-[11px] text-slate-400 block">{SECAO_PLANO.subtitulo}</span>
                      </div>
                      <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800 flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        <span>Lido pelo Agente Oasis</span>
                      </span>
                    </div>
                    <textarea
                      id="campo-soap-p"
                      className="w-full rounded border border-sky-300 bg-sky-50/20 p-2.5 text-xs text-slate-800 font-mono leading-relaxed transition-colors focus:outline-none focus:border-sky-600 focus:bg-white"
                      rows={5}
                      value={campos.p}
                      onChange={(e) => setCampos((c) => ({ ...c, p: e.target.value }))}
                      placeholder={SECAO_PLANO.ajuda}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between pt-2 border-t border-slate-200">
                  <div className="text-xs text-slate-500">
                    O formulário cumpre as normas de documentação clínica hospitalar do SNS.
                  </div>
                  <button
                    id="btn-guardar-consulta"
                    type="button"
                    onClick={guardar}
                    disabled={aGuardar}
                    className="rounded-lg bg-oasis-header px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2 transition-transform active:scale-95"
                  >
                    {aGuardar ? (
                      <>
                        <Clock className="h-4 w-4 animate-spin" />
                        <span>Agente a processar plano…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 text-sky-300" />
                        <span>Guardar Consulta & Extrair com IA</span>
                      </>
                    )}
                  </button>
                </div>
              </OasisPainel>
            )}

            {/* PAINEL DINÂMICO DE RESULTADOS DO AGENTE DE IA */}
            {resultado && (
              <div
                id="resultado-extracao-agente"
                className="rounded-xl border border-sky-300 bg-white p-4 shadow-sm animate-in fade-in duration-300"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-2xs">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">
                        {resultado.pedidosCriados > 0
                          ? `Agente Oasis traduziu com sucesso ${resultado.pedidosCriados} pedido(s) estruturado(s)`
                          : "Agente Oasis não identificou pedidos pendentes no plano"}
                      </h4>
                      <p className="text-xs text-slate-500">
                        Traduzido para os atos, especialidades e prazos do catálogo hospitalar
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      to="/validacao"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
                    >
                      <span>Aceder à Validação</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>

                {/* Lista Detalhada de Pedidos Extraídos */}
                {resultado.pedidos.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Pedidos estruturados gerados a partir do plano:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {resultado.pedidos.map((p) => (
                        <div
                          key={p.pedido_id}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs shadow-2xs hover:border-sky-300 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="inline-block rounded bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">
                                {p.tipo_pedido_legivel || p.tipo_pedido}
                              </span>
                              <h5 className="font-bold text-slate-800 text-sm">{p.descricao || p.ato_codigo}</h5>
                              <p className="text-slate-600 mt-0.5">
                                Destino: <strong className="text-slate-700">{p.especialidade_destino_legivel || p.especialidade_destino}</strong>
                              </p>
                            </div>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                p.prioridade === "MP"
                                  ? "bg-red-100 text-red-800"
                                  : p.prioridade === "P"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {p.prioridade_legivel || p.prioridade}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center justify-between text-[11px] text-slate-500 border-t border-slate-200 pt-1.5">
                            <span>Prazo limite: <strong>{p.prazo_limite || "—"}</strong></span>
                            {p.confianca !== undefined && (
                              <span className="text-emerald-700 font-semibold">
                                Confiança IA: {(p.confianca * 100).toFixed(0)}%
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alertas Detectados pelo Agente */}
                {resultado.alertas && resultado.alertas.length > 0 && (
                  <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    <div className="flex items-center gap-1.5 font-bold mb-1">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <span>Alertas Clínicos & Regras Detectadas:</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-1">
                      {resultado.alertas.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Próximos Passos */}
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 rounded-lg p-2.5 border border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 text-slate-400" />
                    <span>
                      Estes pedidos seguem para o ecrã de <strong>Validação</strong> administrativa para confirmação antes do agendamento ou triagem externa.
                    </span>
                  </div>
                  <Link
                    to="/validacao"
                    className="text-oasis-accent font-semibold hover:underline inline-flex items-center gap-0.5 shrink-0"
                  >
                    <span>Ir para Validação</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de confirmação pós-gravação: exige confirmação explícita do médico antes de sair */}
      {confirmacaoPendente && resultado && (
        <div
          id="toast-confirmacao-submissao"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-300">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <p className="mt-4 text-base font-bold text-slate-900">Consulta guardada com sucesso</p>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              {resultado.pedidosCriados > 0
                ? `O Agente Oasis gerou ${resultado.pedidosCriados} pedido(s) a partir do plano. Confirme que submeteu todas as requisições necessárias para o que foi prescrito nesta consulta.`
                : "Não foram identificados pedidos no plano. Confirme que não há requisições pendentes para esta consulta."}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                id="btn-confirmar-submissao"
                type="button"
                onClick={avancarParaAgenda}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
              >
                Avançar, sim — voltar à agenda
              </button>
              <button
                type="button"
                onClick={() => setConfirmacaoPendente(false)}
                className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
              >
                Rever plano primeiro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Universal de Feedback do Doente */}
      {modalDoenteAberto && dados?.doente && (
        <DoenteModal
          doenteId={dados.doente.doente_id}
          onFechar={() => setModalDoenteAberto(false)}
        />
      )}
    </OasisShell>
  );
}
