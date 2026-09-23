import { useEffect, useState, type ReactNode } from "react";
import { dataHoraPT } from "../../lib/datas";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPost } from "../../lib/api";
import { abrirDoente } from "../../components/NomeDoente";
import {
  User,
  FileText,
  Sparkles,
  ArrowRight,
  ClipboardList,
  Clock,
  Info,
  ShieldAlert,
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

  function carregar() {
    if (!atoId) return;
    apiGet<RespostaConsulta>(`/oasis/consulta/${atoId}`)
      .then((r) => {
        setDados(r);
        if (r.nota) {
          setDiario([r.nota.s, r.nota.o, r.nota.a, r.nota.p].filter((texto) => texto.trim()).join("\n\n"));
        }
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }

  useEffect(carregar, [atoId]);

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
        <div className="mt-4 space-y-4">
          {/* Doente em poucas palavras; o perfil completo (editável), a folha clínica e os exames abrem ao lado */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-slate-900">{dados.doente?.nome}</span>
                {dados.doente?.estadio_cuidado && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                    {OPCOES_ESTADIO_CUIDADO.find((o) => o.valor === dados.doente?.estadio_cuidado)?.legivel}
                  </span>
                )}
                {(dados.doente?.alergias ?? []).map((a) => (
                  <span key={a} className="flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-800">
                    <ShieldAlert className="h-3 w-3" /> {a}
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                {dados.doente?.diagnostico_principal || "Sem diagnóstico registado"} · {dados.ato.ato_descricao} ·{" "}
                {dataHoraPT(dados.ato.data_hora)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => dados.doente && abrirDoente(dados.doente.doente_id, "folha")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                title="Consultas anteriores com o diário de cada uma"
              >
                <FileText className="h-3.5 w-3.5" /> Folha clínica
              </button>
              <button
                type="button"
                onClick={() => dados.doente && abrirDoente(dados.doente.doente_id, "percurso")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-oasis-header px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
                title="Perfil completo: dados, pedidos, exames e histórico (editável)"
              >
                <User className="h-3.5 w-3.5" /> Perfil completo
              </button>
            </div>
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

    </div>
  );
}
