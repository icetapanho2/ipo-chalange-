import { useEffect, useState, type ReactNode } from "react";
import { dataHoraPT, dataPT } from "../../lib/datas";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPost, apiPut } from "../../lib/api";
import { DoenteModal } from "../../components/DoenteModal";
import { abrirDoente } from "../../components/NomeDoente";
import {
  User,
  UserCog,
  FileText,
  FlaskConical,
  Activity,
  Sparkles,
  ArrowRight,
  ClipboardList,
  Clock,
  ExternalLink,
  Info,
  Pencil,
  Stethoscope,
  ShieldAlert,
  Phone,
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
  estadio_cuidado?: string;
}

const OPCOES_ESTADIO_CUIDADO = [
  { valor: "NOVO", legivel: "Novo" },
  { valor: "PRE_TRATAMENTO", legivel: "Diagnóstico" },
  { valor: "EM_TRATAMENTO", legivel: "Tratamento" },
  { valor: "FOLLOW_UP", legivel: "Follow-up" },
];

interface ResumoPedidos {
  total: number;
  pendentes: number;
  agendados: number;
  realizados: number;
}


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

const SECAO_DIARIO = {
  titulo: "Diário Clínico",
  subtitulo: "Registo livre da consulta: sintomas, achados, avaliação e orientação. É só documentação — não gera pedidos automaticamente.",
  ajuda:
    "Ex: Doente refere cansaço ligeiro, nega dor abdominal. ECOG 0, abdómen mole e indolor. Adenocarcinoma do " +
    "cólon estádio III sob vigilância, boa evolução. Vigilância pós-adjuvante; rever com TC de reestadiamento e analítica.",
};

/** Cartão no estilo usado no resto do site (Triagem, Serviço): branco, cabeçalho leve. */
function Painel({ titulo, acoes, children }: { titulo?: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {titulo && (
        <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-600">{titulo}</span>
          {acoes}
        </div>
      )}
      <div className="p-3.5">{children}</div>
    </div>
  );
}

export function OasisConsulta() {
  const { atoId } = useParams<{ atoId: string }>();
  const navigate = useNavigate();
  const [dados, setDados] = useState<RespostaConsulta | null>(null);
  const [diario, setDiario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const [modalDoenteAberto, setModalDoenteAberto] = useState(false);
  const [aEditarClinico, setAEditarClinico] = useState(false);
  const [formClinico, setFormClinico] = useState({
    diagnostico_principal: "",
    estadiamento: "",
    alergias: "",
    contacto: "",
    notas_clinicas: "",
    estadio_cuidado: "",
  });
  const [aGuardarClinico, setAGuardarClinico] = useState(false);

  function carregar() {
    if (!atoId) return;
    apiGet<RespostaConsulta>(`/oasis/consulta/${atoId}`)
      .then((r) => {
        setDados(r);
        if (r.nota) {
          setDiario([r.nota.s, r.nota.o, r.nota.a, r.nota.p].filter((texto) => texto.trim()).join("\n\n"));
        }
        setFormClinico({
          diagnostico_principal: r.doente?.diagnostico_principal ?? "",
          estadiamento: r.doente?.estadiamento ?? "",
          alergias: (r.doente?.alergias ?? []).join(", "),
          contacto: r.doente?.contacto ?? "",
          notas_clinicas: r.doente?.notas_clinicas ?? "",
          estadio_cuidado: r.doente?.estadio_cuidado ?? "",
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

  // Grava o diário (documentação livre) e segue directamente para o
  // assistente de pedidos: o médico declara o que pretende, sem etapa intermédia.
  async function guardarESeguir() {
    if (!atoId) return;
    setAGuardar(true);
    setErro(null);
    try {
      await apiPost(`/oasis/consulta/${atoId}/guardar`, { s: diario, o: "", a: "", p: "" });
      navigate(`/oasis/medico/${atoId}/pedidos`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setAGuardar(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Cabeçalho da página, igual ao resto do site */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800">Diário Clínico</h1>
            <div className="group relative">
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-slate-500 hover:bg-slate-100 transition-colors"
                title="Como funciona este registo"
              >
                <Info className="h-3 w-3" />
              </button>
              <div className="invisible absolute left-0 top-full z-20 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 text-left text-slate-700 opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Sparkles className="h-3.5 w-3.5 text-oasis-accent" />
                  <span>Como funciona</span>
                </h4>
                <p className="text-[11px] leading-relaxed text-slate-600">1. Registe o diário da consulta em texto livre.</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  2. Em <strong>Guardar & Seguinte</strong>, escolhe os tipos de pedido (consulta, exame, análises…) e preenche cada um.
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  3. Reveja o resumo e submeta: os pedidos seguem de imediato para agendamento ou triagem do serviço.
                </p>
              </div>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">{dados?.doente?.nome ?? "A carregar…"} · {dados?.ato.especialidade_descricao}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/oasis/medico")}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
        >
          ← Voltar à agenda
        </button>
      </div>

      {erro && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <strong>Erro:</strong> {erro}
        </div>
      )}

      {!dados ? (
        <div className="mt-8 flex h-64 items-center justify-center text-slate-500 gap-2">
          <Clock className="h-5 w-5 animate-spin text-oasis-accent" />
          <span>A carregar consulta e prontuário do utente…</span>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          {/* PAINEL ESQUERDO: DOENTE E DADOS DO ATO */}
          <div className="space-y-3">
            <Painel titulo="Identificação do Utente">
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
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-200">
                    <span>Nasc: {dataPT(dados.doente?.data_nascimento)}</span>
                    <span>Sexo: {dados.doente?.sexo === "M" ? "Masc" : "Fem"}</span>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-2 text-xs space-y-1 text-slate-700">
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
                    <span className="font-mono text-slate-800">{dataHoraPT(dados.ato.data_hora)}</span>
                  </div>
                </div>

                {dados.nota && (
                  <div className="rounded bg-slate-50 p-2 text-[11px] text-slate-500 border border-slate-200">
                    Última gravação: {dados.nota.guardado_em.replace("T", " às ")}
                  </div>
                )}

                {/* Atalhos para a ficha do doente (abre ao lado, sem sair da consulta) */}
                {dados.doente && (
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    {(
                      [
                        ["perfil", UserCog, "Perfil", "Perfil completo — ver e editar os dados do doente"],
                        ["percurso", ClipboardList, "Pedidos", "Todos os pedidos e o que está marcado, pendente ou em triagem"],
                        ["folha", FileText, "Folha clínica", "Consultas anteriores com o diário de cada uma"],
                        ["exames", FlaskConical, "Exames", "Arquivo dos exames e análises realizados"],
                      ] as const
                    ).map(([vista, Icone, rotulo, titulo]) => (
                      <button
                        key={vista}
                        type="button"
                        onClick={() => abrirDoente(dados.doente!.doente_id, vista)}
                        title={titulo}
                        className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 py-2 text-slate-700 hover:border-oasis-accent hover:bg-sky-50 hover:text-oasis-header"
                      >
                        <Icone className="h-4 w-4" />
                        <span className="text-[10px] font-semibold leading-tight">{rotulo}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Painel>

            {/* Perfil Clínico: mais detalhe + edição directa, sem sair da consulta */}
            <Painel titulo="Perfil Clínico">
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
                  {dados.doente?.estadio_cuidado && (
                    <span className="inline-block rounded-full bg-oasis-header px-2.5 py-0.5 text-[10px] font-bold text-white">
                      {OPCOES_ESTADIO_CUIDADO.find((o) => o.valor === dados.doente?.estadio_cuidado)?.legivel ?? dados.doente.estadio_cuidado}
                    </span>
                  )}
                  <div className="flex items-start gap-1.5">
                    <Stethoscope className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-500">Diagnóstico: </span>
                      <span className="text-slate-800 font-medium">{dados.doente?.diagnostico_principal || "— Não registado"}</span>
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
                    <label className="text-[11px] font-bold text-slate-700 block mb-0.5">Estádio</label>
                    <select
                      value={formClinico.estadio_cuidado}
                      onChange={(e) => setFormClinico((f) => ({ ...f, estadio_cuidado: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-800"
                    >
                      <option value="">— Não classificado</option>
                      {OPCOES_ESTADIO_CUIDADO.map((op) => (
                        <option key={op.valor} value={op.valor}>
                          {op.legivel}
                        </option>
                      ))}
                    </select>
                  </div>
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
            </Painel>
          </div>

          {/* PAINEL DIREITO: DIÁRIO CLÍNICO */}
          <div className="space-y-4">
            <Painel titulo="Diário da Consulta">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-1.5">
                  <label className="text-xs font-bold text-slate-800">{SECAO_DIARIO.titulo}</label>
                  <span className="text-[11px] text-slate-500 block">{SECAO_DIARIO.subtitulo}</span>
                </div>
                <textarea
                  id="campo-diario"
                  className="min-h-[50vh] w-full resize-y rounded border border-slate-300 bg-white p-3 text-sm text-slate-800 leading-relaxed transition-colors focus:outline-none focus:border-oasis-accent"
                  value={diario}
                  onChange={(e) => setDiario(e.target.value)}
                  placeholder={SECAO_DIARIO.ajuda}
                />
              </div>

              <div className="mt-4 flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="text-xs text-slate-500">O que pretende pedir a seguir escolhe-se no ecrã seguinte.</div>
                <button
                  id="btn-guardar-consulta"
                  type="button"
                  onClick={guardarESeguir}
                  disabled={aGuardar}
                  className="rounded-lg bg-oasis-header px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2 transition-transform active:scale-95"
                >
                  {aGuardar ? (
                    <>
                      <Clock className="h-4 w-4 animate-spin" />
                      <span>A guardar…</span>
                    </>
                  ) : (
                    <>
                      <span>Guardar & Seguinte</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </Painel>

            {/* Pedidos já submetidos nesta consulta (se o médico voltar a abrir o ecrã) */}
            {dados.pedidosExistentes && dados.pedidosExistentes.length > 0 && (
              <div id="pedidos-existentes-consulta" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <ClipboardList className="h-3.5 w-3.5 text-oasis-accent" />
                    <span>Pedidos já submetidos nesta consulta ({dados.pedidosExistentes.length})</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => atoId && navigate(`/oasis/medico/${atoId}/pedidos`)}
                    className="text-[11px] font-semibold text-oasis-accent hover:underline shrink-0"
                  >
                    + Adicionar mais pedidos
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {dados.pedidosExistentes.map((p) => (
                    <div key={p.pedido_id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
                      <span className="inline-block rounded bg-sky-100 px-1.5 py-0.2 text-[10px] font-bold text-sky-800 uppercase mb-1">
                        {p.tipo_pedido_legivel}
                      </span>
                      <p className="font-bold text-slate-800">{p.descricao}</p>
                      <p className="text-slate-500 mt-0.5">
                        {p.especialidade_destino_legivel} · {p.estado_legivel}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Universal de Feedback do Doente */}
      {modalDoenteAberto && dados?.doente && (
        <DoenteModal doenteId={dados.doente.doente_id} onFechar={() => setModalDoenteAberto(false)} />
      )}
    </div>
  );
}
