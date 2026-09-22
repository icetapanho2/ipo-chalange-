import { useEffect, useState } from "react";
import { dataHoraPT, dataPT } from "../lib/datas";
import { apiGet, apiPost } from "../lib/api";
import { DoenteModal } from "../components/DoenteModal";
import { PorqueEstaEscolha, type CandidatoTroca } from "../components/PorqueEstaEscolha";
import { VagasLibertadas } from "../components/VagasLibertadas";
import { ListaChamadas } from "../components/ListaChamadas";
import { PlanoRemarcacoes } from "../components/PlanoRemarcacoes";
import {
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Activity,
  Layers,
  Check,
  X,
  AlertCircle,
  Wrench,
  CalendarClock,
  Users,
  ClipboardList,
  Inbox,
  Building2,
  HelpCircle,
  Settings2,
  RotateCcw,
  BarChart3,
  CalendarX2,
  Phone,
} from "lucide-react";

interface ResumoPedido {
  pedido_id: string;
  doente_id?: string;
  doente_nome: string;
  medico_requisitante_nome: string;
  tipo_pedido_legivel: string;
  descricao: string;
  prioridade_legivel: string;
  prazo_limite: string;
  estado: string;
  estado_legivel: string;
  n_remarcacoes: number;
  decisao_pendente?: boolean;
}

interface RespostaPedidos {
  especialidade: string;
  especialidade_legivel: string;
  porEstado: Record<string, ResumoPedido[]>;
}

interface AlertaServico {
  alerta_id: string;
  tipo: string;
  gravidade: string;
  descricao: string;
  doente_nome: string;
  criado_em: string;
}

interface PropostaServico {
  proposta_id: string;
  justificacao: string;
  criado_em: string;
  pedido_urgente_doente: string;
  avaliacao: CandidatoTroca[];
  escolhido_regra_antiga: string;
}

type AbaServico = "risco" | "pendencias" | "remarcacoes" | "carteira" | "vagas" | "chamadas" | "estatisticas" | "definicoes";
const ABAS_VALIDAS: AbaServico[] = ["risco", "pendencias", "remarcacoes", "carteira", "vagas", "chamadas", "estatisticas", "definicoes"];

/** Separador inicial: ?aba=... (usado pelo Guião) ou, se houver propostas de troca, "pendencias". */
function abaInicial(): AbaServico {
  const pedida = new URLSearchParams(window.location.search).get("aba") as AbaServico | null;
  return pedida && ABAS_VALIDAS.includes(pedida) ? pedida : "risco";
}

interface ConsultaEmRisco {
  pedido_id: string;
  doente_id: string;
  doente_nome: string;
  descricao: string;
  data_hora: string;
  porque: string;
}

interface SinalOverbooking {
  prioridade_legivel: string;
  ato_legivel: string;
  prazo_limite: string;
  n_pedidos: number;
  vagas_livres_estimadas: number;
  deficit: number;
  pedidos: { pedido_id: string; doente_nome: string }[];
}

interface AvariaServico {
  avaria_id: string;
  ato_legivel: string;
  descricao: string;
  duracao_dias: number;
  reportado_por_nome: string;
  criado_em: string;
  estado: "ABERTA" | "RESOLVIDA";
  decisao: string;
  pedidos_afetados: number;
}

interface ItemParaRever {
  pedido_id: string;
  doente_nome: string;
  descricao: string;
  prioridade_legivel: string;
  prazo_limite: string;
  n_remarcacoes: number;
  sugestao: string;
  accao: "remarcar" | "adiar";
}

interface ParaRever {
  faltas: ItemParaRever[];
  emRisco: ItemParaRever[];
}

interface Pesos {
  urgencia: number;
  tipo: number;
  paciente: number;
}

interface RespostaPrioridade {
  especialidade_legivel: string;
  personalizado: boolean;
  pesos: Pesos;
  pesosOmissao: Pesos;
}

interface ResumoEstatistica {
  total: number;
  medianaDias: number | null;
  percentDentroPrazo: number | null;
}

interface EstatisticaPorEstadio extends ResumoEstatistica {
  chave: string;
  legivel: string;
}

interface OutlierEstatistica {
  pedido_id: string;
  doente_nome: string;
  descricao: string;
  dias: number;
  dentro_prazo: boolean;
  estadio_cuidado_legivel: string;
}

interface RespostaEstatisticas {
  especialidade_legivel: string;
  periodo: string;
  geral: ResumoEstatistica;
  porEstadio: EstatisticaPorEstadio[];
  outliers: OutlierEstatistica[];
}

const ORDEM_ESTADOS = [
  { chave: "SEM_VAGA", titulo: "Sem Vaga", cor: "bg-amber-100 text-amber-800" },
  { chave: "EM_TRIAGEM", titulo: "Em Triagem", cor: "bg-sky-100 text-sky-800" },
  { chave: "ACEITE", titulo: "Aceites (A Agendar)", cor: "bg-indigo-100 text-indigo-800" },
  { chave: "MARCADO", titulo: "Marcados", cor: "bg-emerald-100 text-emerald-800" },
  { chave: "DEVOLVIDO", titulo: "Devolvidos ao Médico", cor: "bg-orange-100 text-orange-800" },
  { chave: "FALTOU", titulo: "Faltas", cor: "bg-red-100 text-red-800" },
  { chave: "REALIZADO", titulo: "Realizados", cor: "bg-slate-100 text-slate-700" },
];

export function Servico() {
  const [pedidos, setPedidos] = useState<RespostaPedidos | null>(null);
  const [alertas, setAlertas] = useState<AlertaServico[] | null>(null);
  const [propostas, setPropostas] = useState<PropostaServico[] | null>(null);
  const [emRisco, setEmRisco] = useState<ConsultaEmRisco[] | null>(null);
  const [overbooking, setOverbooking] = useState<SinalOverbooking[] | null>(null);
  const [avarias, setAvarias] = useState<AvariaServico[] | null>(null);
  const [paraRever, setParaRever] = useState<ParaRever | null>(null);
  const [remarcacoesPendentes, setRemarcacoesPendentes] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [accoes, setAccoes] = useState<Record<string, string>>({});
  const [doenteModalId, setDoenteModalId] = useState<string | null>(null);
  const [estadoAtivo, setEstadoAtivo] = useState<string>("SEM_VAGA");
  const [abaAtiva, setAbaAtiva] = useState<AbaServico>(abaInicial);
  const [notasOutsourcing, setNotasOutsourcing] = useState<Record<string, string>>({});
  const [motivosDecisao, setMotivosDecisao] = useState<Record<string, string>>({});
  const [aProcessarPedido, setAProcessarPedido] = useState<string | null>(null);
  const [formSemVagaAberto, setFormSemVagaAberto] = useState<{ pedidoId: string; tipo: "outsourcing" | "decisao" } | null>(
    null,
  );
  const [prioridade, setPrioridade] = useState<RespostaPrioridade | null>(null);
  const [pesosForm, setPesosForm] = useState<Pesos | null>(null);
  const [aGuardarPesos, setAGuardarPesos] = useState(false);
  const [estatisticas, setEstatisticas] = useState<RespostaEstatisticas | null>(null);
  const [filtroPeriodoEstatisticas, setFiltroPeriodoEstatisticas] = useState<"semana" | "mes" | "todos">("mes");
  const [filtroEstadiosEstatisticas, setFiltroEstadiosEstatisticas] = useState<Set<string>>(new Set());

  function recarregar() {
    apiGet<RespostaPedidos>("/servico/pedidos")
      .then(setPedidos)
      .catch((e) => setErro(String(e)));
    apiGet<AlertaServico[]>("/servico/alertas").then(setAlertas);
    apiGet<PropostaServico[]>("/servico/propostas").then(setPropostas);
    apiGet<ConsultaEmRisco[]>("/servico/consultas-em-risco").then(setEmRisco);
    apiGet<SinalOverbooking[]>("/servico/overbooking").then(setOverbooking);
    apiGet<AvariaServico[]>("/servico/avarias").then(setAvarias);
    apiGet<ParaRever>("/servico/para-rever").then(setParaRever);
    apiGet<{ pendentes: number }>("/servico/remarcacoes").then((r) => setRemarcacoesPendentes(r.pendentes));
    apiGet<RespostaPrioridade>("/servico/prioridade").then((r) => {
      setPrioridade(r);
      setPesosForm(r.pesos);
    });
  }

  useEffect(recarregar, []);

  function recarregarEstatisticas() {
    const params = new URLSearchParams({ periodo: filtroPeriodoEstatisticas });
    if (filtroEstadiosEstatisticas.size > 0) params.set("estadio", [...filtroEstadiosEstatisticas].join(","));
    apiGet<RespostaEstatisticas>(`/servico/estatisticas?${params.toString()}`).then(setEstatisticas);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(recarregarEstatisticas, [filtroPeriodoEstatisticas, filtroEstadiosEstatisticas]);

  async function fecharAlerta(id: string) {
    setErro(null);
    try {
      await apiPost(`/servico/alertas/${id}/fechar`, { accao: accoes[id] || "Verificado" });
      setMensagemSucesso("Alerta resolvido com sucesso.");
      recarregar();
      setTimeout(() => setMensagemSucesso(null), 4000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function decidirProposta(id: string, decisao: "aprovar" | "rejeitar") {
    setErro(null);
    try {
      await apiPost(`/servico/propostas/${id}/${decisao}`);
      setMensagemSucesso(`Proposta ${decisao === "aprovar" ? "aprovada" : "rejeitada"} com sucesso.`);
      recarregar();
      setTimeout(() => setMensagemSucesso(null), 4000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function actuarParaRever(item: ItemParaRever) {
    setErro(null);
    try {
      await apiPost(`/servico/pedidos/${item.pedido_id}/${item.accao === "remarcar" ? "remarcar" : "adiar"}`);
      setMensagemSucesso(item.accao === "remarcar" ? "Pedido remarcado." : "Consulta adiada; vaga libertada.");
      recarregar();
      setTimeout(() => setMensagemSucesso(null), 4000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function confirmarOutsourcing(pedidoId: string) {
    setErro(null);
    setAProcessarPedido(pedidoId);
    try {
      await apiPost(`/servico/pedidos/${pedidoId}/outsourcing`, { nota: notasOutsourcing[pedidoId] ?? "" });
      setMensagemSucesso("Pedido resolvido por capacidade externa (outsourcing).");
      setFormSemVagaAberto(null);
      recarregar();
      setTimeout(() => setMensagemSucesso(null), 4000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAProcessarPedido(null);
    }
  }

  async function confirmarPedirDecisao(pedidoId: string) {
    setErro(null);
    const motivo = motivosDecisao[pedidoId] ?? "";
    if (!motivo.trim()) {
      setErro("Descreva porque não há solução interna nem externa.");
      return;
    }
    setAProcessarPedido(pedidoId);
    try {
      await apiPost(`/servico/pedidos/${pedidoId}/pedir-decisao`, { motivo });
      setMensagemSucesso("O médico requisitante foi notificado para decidir.");
      setFormSemVagaAberto(null);
      recarregar();
      setTimeout(() => setMensagemSucesso(null), 4000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAProcessarPedido(null);
    }
  }

  async function guardarPesos() {
    if (!pesosForm) return;
    setErro(null);
    setAGuardarPesos(true);
    try {
      const r = await apiPost<{ pesos: Pesos }>("/servico/prioridade/pesos", pesosForm);
      setMensagemSucesso("Pesos da equação de prioridade actualizados para este serviço.");
      setPrioridade((p) => (p ? { ...p, pesos: r.pesos, personalizado: true } : p));
      setTimeout(() => setMensagemSucesso(null), 4000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAGuardarPesos(false);
    }
  }

  async function reporPesos() {
    setErro(null);
    setAGuardarPesos(true);
    try {
      const r = await apiPost<{ pesos: Pesos }>("/servico/prioridade/repor", {});
      setPesosForm(r.pesos);
      setPrioridade((p) => (p ? { ...p, pesos: r.pesos, personalizado: false } : p));
      setMensagemSucesso("Pesos repostos para os valores por omissão.");
      setTimeout(() => setMensagemSucesso(null), 4000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAGuardarPesos(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Cabeçalho do Painel do Serviço */}
      <div className="border-b border-slate-200 pb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800">
              Gestão Operacional do Serviço
            </h1>
            {pedidos && (
              <span className="rounded-full bg-oasis-header px-3 py-0.5 text-xs font-bold text-white shadow-2xs">
                {pedidos.especialidade_legivel}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Acompanhe pedidos sem vaga, consultas em risco de faltas de exames, trocas de agenda propostas pelo motor e alertas clínicos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {emRisco && emRisco.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-800 flex items-center gap-1.5 shadow-2xs">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span>{emRisco.length} Consulta(s) em Risco</span>
            </div>
          )}
        </div>
      </div>

      {erro && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <strong>Aviso:</strong> {erro}
        </div>
      )}

      {mensagemSucesso && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 animate-in fade-in">
          <Check className="h-4 w-4 text-emerald-600" />
          <span>{mensagemSucesso}</span>
        </div>
      )}

      {/* Separadores para não misturar tudo numa só lista longa */}
      <div className="mt-5 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          {
            chave: "risco" as const,
            titulo: "Marcações em risco",
            icone: AlertTriangle,
            contagem: (overbooking?.length ?? 0) + (emRisco?.length ?? 0),
          },
          {
            chave: "pendencias" as const,
            titulo: "Alertas e Pendências",
            icone: Inbox,
            contagem:
              (avarias?.filter((a) => a.estado === "ABERTA").length ?? 0) +
              (paraRever ? paraRever.faltas.length + paraRever.emRisco.length : 0) +
              (propostas?.length ?? 0) +
              (alertas?.length ?? 0),
          },
          {
            chave: "remarcacoes" as const,
            titulo: "Remarcações",
            icone: Wrench,
            contagem: remarcacoesPendentes,
          },
          {
            chave: "carteira" as const,
            titulo: "Carteira de Pedidos",
            icone: ClipboardList,
            contagem: pedidos ? Object.values(pedidos.porEstado).reduce((soma, l) => soma + l.length, 0) : 0,
          },
          {
            chave: "vagas" as const,
            titulo: "Vagas libertadas",
            icone: CalendarX2,
            contagem: 0,
          },
          {
            chave: "chamadas" as const,
            titulo: "Lista de chamadas",
            icone: Phone,
            contagem: 0,
          },
          {
            chave: "estatisticas" as const,
            titulo: "Estatísticas",
            icone: BarChart3,
            contagem: 0,
          },
          {
            chave: "definicoes" as const,
            titulo: "Definições",
            icone: Settings2,
            contagem: 0,
          },
        ].map((aba) => (
          <button
            key={aba.chave}
            type="button"
            onClick={() => setAbaAtiva(aba.chave)}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors flex items-center gap-1.5 ${
              abaAtiva === aba.chave
                ? "bg-oasis-header text-white shadow-2xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <aba.icone className="h-3.5 w-3.5" />
            <span>{aba.titulo}</span>
            {aba.contagem > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  abaAtiva === aba.chave ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                }`}
              >
                {aba.contagem}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* SECÇÃO 2: PROPOSTAS DE TROCA DE VAGA */}
      {abaAtiva === "pendencias" && propostas && propostas.length > 0 && (
        <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-indigo-200 pb-2 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-indigo-600" />
              <span>Propostas de troca de vaga</span>
            </h2>
            <span className="text-[11px] text-indigo-700">Nada muda sem a sua aprovação</span>
          </div>

          <div className="space-y-2.5">
            {propostas.map((p) => (
              <div
                key={p.proposta_id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-indigo-200 bg-white p-3.5 shadow-2xs"
              >
                <div className="min-w-0 flex-1 basis-[28rem]">
                  <h4 className="text-sm font-bold text-slate-800">
                    Proposta para Doente Urgente: {p.pedido_urgente_doente}
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-600">{p.justificacao}</p>
                  <PorqueEstaEscolha candidatos={p.avaliacao} />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => decidirProposta(p.proposta_id, "aprovar")}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 flex items-center gap-1"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Aprovar Troca</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => decidirProposta(p.proposta_id, "rejeitar")}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Rejeitar</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECÇÃO 0A: SOBRELOTAÇÃO — MESMA PRIORIDADE/PRAZO, SEM VAGAS SUFICIENTES */}
      {abaAtiva === "risco" && overbooking && overbooking.length > 0 && (
        <div className="mt-5 rounded-xl border border-rose-300 bg-rose-50/60 p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-rose-200 pb-2 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
              <Users className="h-4 w-4 text-rose-600" />
              <span>Sobrelotação Detectada — Vagas Extra ou Outsourcing Necessários</span>
            </h2>
            <span className="text-[11px] text-rose-700 font-semibold">Antes de cair em "Sem Vaga"</span>
          </div>
          <div className="space-y-2.5">
            {overbooking.map((s, i) => (
              <div key={i} className="rounded-lg border border-rose-200 bg-white p-3.5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      {s.ato_legivel} · {s.prioridade_legivel} · prazo {dataPT(s.prazo_limite)}
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {s.n_pedidos} pedido(s) a competir por {s.vagas_livres_estimadas} vaga(s) livre(s) estimada(s) —
                      faltam <strong className="text-rose-700">{s.deficit}</strong>.
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {s.pedidos.slice(0, 4).map((p) => p.doente_nome).join(", ")}
                      {s.pedidos.length > 4 ? ` +${s.pedidos.length - 4}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800 shrink-0">
                    Défice de {s.deficit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECÇÃO 0B: AVARIAS REPORTADAS PELOS TÉCNICOS */}
      {abaAtiva === "pendencias" && avarias && avarias.some((a) => a.estado === "ABERTA") && (
        <div className="mt-5 rounded-xl border border-orange-300 bg-orange-50/60 p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-orange-200 pb-2 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-orange-900 flex items-center gap-1.5">
              <Wrench className="h-4 w-4 text-orange-600" />
              <span>Avarias Reportadas — Plano de Remarcação Pronto</span>
            </h2>
          </div>
          <div className="space-y-2.5">
            {avarias
              .filter((a) => a.estado === "ABERTA")
              .map((a) => (
                <div key={a.avaria_id} className="rounded-lg border border-orange-200 bg-white p-3.5 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">{a.ato_legivel}</h4>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {a.descricao} · ~{a.duracao_dias} dia(s) · reportado por {a.reportado_por_nome}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAbaAtiva("remarcacoes")}
                        className="rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-800"
                      >
                        Ver plano de remarcação ({a.pedidos_afetados})
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* SECÇÃO 0C: FALTAS E RISCOS PARA REVER (O SISTEMA SUGERE, A ADMIN DECIDE) */}
      {abaAtiva === "pendencias" && paraRever && (paraRever.faltas.length > 0 || paraRever.emRisco.length > 0) && (
        <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-sky-200 pb-2 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-sky-900 flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-sky-600" />
              <span>Faltas e Remarcações Para Rever</span>
            </h2>
          </div>
          <div className="space-y-2.5">
            {[...paraRever.faltas, ...paraRever.emRisco].map((item) => (
              <div key={item.pedido_id} className="rounded-lg border border-sky-200 bg-white p-3.5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      {item.doente_nome} · {item.descricao}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">{item.sugestao}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => actuarParaRever(item)}
                    className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-800 shrink-0"
                  >
                    {item.accao === "remarcar" ? "Remarcar agora" : "Adiar e libertar vaga"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECÇÃO 1: CONSULTAS EM RISCO (PRÓXIMOS 14 DIAS) */}
      {abaAtiva === "risco" && emRisco && emRisco.length > 0 && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-red-200 pb-2 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-red-900 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span>Consultas com Exames/Análises Atrasados ou em Risco (Próximos 14 Dias)</span>
            </h2>
            <span className="text-[11px] text-red-700 font-semibold">Exige intervenção</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {emRisco.map((c) => (
              <div
                key={c.pedido_id}
                className="rounded-lg border border-red-200 bg-white p-3.5 shadow-2xs hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <button
                      type="button"
                      onClick={() => setDoenteModalId(c.doente_id)}
                      className="font-bold text-sm text-slate-900 hover:text-oasis-accent flex items-center gap-1.5 text-left"
                      title="Ver o que falta no perfil do doente"
                    >
                      <span>{c.doente_nome}</span>
                      <Activity className="h-3.5 w-3.5 text-sky-600" />
                    </button>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5">{c.descricao}</p>
                    <p className="text-xs text-slate-500">
                      Data marcada: <span className="font-mono text-slate-700 font-semibold">{c.data_hora.replace("T", " às ")}</span>
                    </p>
                  </div>
                  <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800 shrink-0">
                    Em Risco
                  </span>
                </div>

                <p className="mt-2 text-xs text-red-700 bg-red-50/80 p-2 rounded border border-red-100 leading-relaxed">
                  {c.porque}
                </p>

                <div className="mt-3 pt-2 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setDoenteModalId(c.doente_id)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 hover:text-sky-900"
                  >
                    <span>Abrir Prontuário & Remarcar</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {abaAtiva === "remarcacoes" && (
        <PlanoRemarcacoes
          aoMudar={(m) => {
            setMensagemSucesso(m);
            recarregar();
            setTimeout(() => setMensagemSucesso(null), 6000);
          }}
        />
      )}

      {abaAtiva === "vagas" && (
        <VagasLibertadas
          aoMudar={(m) => {
            setMensagemSucesso(m);
            recarregar();
            setTimeout(() => setMensagemSucesso(null), 6000);
          }}
        />
      )}

      {abaAtiva === "chamadas" && (
        <ListaChamadas
          aoMudar={(m) => {
            setMensagemSucesso(m);
            recarregar();
            setTimeout(() => setMensagemSucesso(null), 6000);
          }}
        />
      )}

      {/* Nada a mostrar nesta aba */}
      {abaAtiva === "risco" &&
        (!overbooking || overbooking.length === 0) &&
        (!emRisco || emRisco.length === 0) && (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Sem consultas em risco de momento.
          </div>
        )}

      {/* SECÇÃO 3: ALERTAS DO SERVIÇO */}
      {abaAtiva === "pendencias" && alertas && alertas.length > 0 && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-amber-200 pb-2 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span>Alertas e Pendências do Serviço ({alertas.length})</span>
            </h2>
          </div>

          <div className="space-y-2.5">
            {alertas.map((a) => (
              <div
                key={a.alerta_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3 shadow-2xs"
              >
                <div>
                  <span className="font-bold text-slate-800 text-xs">{a.doente_nome}: </span>
                  <span className="text-xs text-slate-600">{a.descricao}</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">Criado em {dataHoraPT(a.criado_em)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Ação tomada…"
                    className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-800"
                    value={accoes[a.alerta_id] || ""}
                    onChange={(e) => setAccoes({ ...accoes, [a.alerta_id]: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => fecharAlerta(a.alerta_id)}
                    className="rounded-lg bg-amber-700 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-amber-800"
                  >
                    Resolver
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nada a mostrar nesta aba */}
      {abaAtiva === "pendencias" &&
        (!avarias || !avarias.some((a) => a.estado === "ABERTA")) &&
        (!paraRever || (paraRever.faltas.length === 0 && paraRever.emRisco.length === 0)) &&
        (!propostas || propostas.length === 0) &&
        (!alertas || alertas.length === 0) && (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Sem alertas ou pendências de momento.
          </div>
        )}

      {/* SECÇÃO 4: QUADRO DE PEDIDOS POR ESTADO */}
      {abaAtiva === "carteira" && (
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-oasis-accent" />
          <span>Carteira de Pedidos do Serviço por Estado</span>
        </h2>

        {/* Separadores de Estado com Contadores */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
          {ORDEM_ESTADOS.map((est) => {
            const lista = pedidos?.porEstado[est.chave] ?? [];
            return (
              <button
                key={est.chave}
                type="button"
                onClick={() => setEstadoAtivo(est.chave)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  estadoAtivo === est.chave
                    ? "bg-oasis-header text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <span>{est.titulo}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    estadoAtivo === est.chave ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {lista.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Lista de Pedidos do Estado Ativo */}
        <div className="mt-4">
          {pedidos && (!pedidos.porEstado[estadoAtivo] || pedidos.porEstado[estadoAtivo].length === 0) ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">
              Não existem pedidos neste estado.
            </div>
          ) : (
            <div className="space-y-2">
              {pedidos?.porEstado[estadoAtivo]?.map((p) => (
                <div
                  key={p.pedido_id}
                  className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-slate-300 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => p.doente_id && setDoenteModalId(p.doente_id)}
                          className="font-bold text-sm text-slate-900 hover:text-oasis-accent flex items-center gap-1 text-left"
                        >
                          <span>{p.doente_nome}</span>
                          <Activity className="h-3 w-3 text-sky-600" />
                        </button>
                        <span className="text-slate-300">·</span>
                        <span className="text-xs font-semibold text-slate-600">{p.tipo_pedido_legivel}</span>
                      </div>
                      <h4 className="text-xs font-semibold text-slate-800 mt-0.5">{p.descricao}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Requisitante: {p.medico_requisitante_nome} · Prazo limite: <span className="font-mono">{dataPT(p.prazo_limite)}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        {p.prioridade_legivel}
                      </span>
                      {p.doente_id && (
                        <button
                          type="button"
                          onClick={() => setDoenteModalId(p.doente_id!)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                        >
                          Ver Perfil
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sem vaga: vaga extra/outsourcing, ou pedir decisão ao médico se não houver solução */}
                  {p.estado === "SEM_VAGA" && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      {p.decisao_pendente ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                          <HelpCircle className="h-3.5 w-3.5" />
                          <span>Aguarda decisão do médico requisitante</span>
                        </span>
                      ) : formSemVagaAberto?.pedidoId === p.pedido_id ? (
                        formSemVagaAberto.tipo === "outsourcing" ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              placeholder="Ex: Marcado em clínica convencionada, resultado até dd/mm…"
                              className="min-w-[240px] flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-800"
                              value={notasOutsourcing[p.pedido_id] ?? ""}
                              onChange={(e) => setNotasOutsourcing((n) => ({ ...n, [p.pedido_id]: e.target.value }))}
                            />
                            <button
                              type="button"
                              disabled={aProcessarPedido === p.pedido_id}
                              onClick={() => confirmarOutsourcing(p.pedido_id)}
                              className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-800 disabled:opacity-50"
                            >
                              Confirmar outsourcing
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormSemVagaAberto(null)}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              placeholder="Porque não há vaga interna nem outsourcing…"
                              className="min-w-[240px] flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-800"
                              value={motivosDecisao[p.pedido_id] ?? ""}
                              onChange={(e) => setMotivosDecisao((m) => ({ ...m, [p.pedido_id]: e.target.value }))}
                            />
                            <button
                              type="button"
                              disabled={aProcessarPedido === p.pedido_id}
                              onClick={() => confirmarPedirDecisao(p.pedido_id)}
                              className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-50"
                            >
                              Notificar médico
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormSemVagaAberto(null)}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              Cancelar
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-slate-500">Sem vaga interna dentro do prazo:</span>
                          <button
                            type="button"
                            onClick={() => setFormSemVagaAberto({ pedidoId: p.pedido_id, tipo: "outsourcing" })}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                          >
                            <Building2 className="h-3 w-3" />
                            <span>Marcar outsourcing</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormSemVagaAberto({ pedidoId: p.pedido_id, tipo: "decisao" })}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                          >
                            <HelpCircle className="h-3 w-3" />
                            <span>Pedir decisão ao médico</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ABA: ESTATÍSTICAS DO SERVIÇO */}
      {abaAtiva === "estatisticas" && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-oasis-accent" />
                <span>Estatísticas — {estatisticas?.especialidade_legivel ?? ""}</span>
              </h2>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3 mb-4">
              <div>
                <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Período</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { valor: "semana" as const, legivel: "Última semana" },
                    { valor: "mes" as const, legivel: "Último mês" },
                    { valor: "todos" as const, legivel: "Todo o histórico" },
                  ].map((op) => (
                    <button
                      key={op.valor}
                      type="button"
                      onClick={() => setFiltroPeriodoEstatisticas(op.valor)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        filtroPeriodoEstatisticas === op.valor
                          ? "border-oasis-header bg-oasis-header text-white"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {op.legivel}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Estádio do doente</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { valor: "NOVO", legivel: "Novo" },
                    { valor: "PRE_TRATAMENTO", legivel: "Pré-tratamento" },
                    { valor: "EM_TRATAMENTO", legivel: "Em tratamento" },
                    { valor: "FOLLOW_UP", legivel: "Follow-up" },
                  ].map((op) => (
                    <button
                      key={op.valor}
                      type="button"
                      onClick={() =>
                        setFiltroEstadiosEstatisticas((s) => {
                          const novo = new Set(s);
                          if (novo.has(op.valor)) novo.delete(op.valor);
                          else novo.add(op.valor);
                          return novo;
                        })
                      }
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        filtroEstadiosEstatisticas.has(op.valor)
                          ? "border-oasis-header bg-oasis-header text-white"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {op.legivel}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {estatisticas && (
              <>
                {/* Resumo geral */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                    <span className="block text-2xl font-bold text-slate-800">{estatisticas.geral.total}</span>
                    <span className="text-[11px] text-slate-500">pedidos marcados no período</span>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                    <span className="block text-2xl font-bold text-slate-800">
                      {estatisticas.geral.medianaDias ?? "—"}
                    </span>
                    <span className="text-[11px] text-slate-500">dias, mediana até à consulta/exame</span>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                    <span
                      className={`block text-2xl font-bold ${
                        (estatisticas.geral.percentDentroPrazo ?? 100) >= 85 ? "text-emerald-700" : "text-amber-700"
                      }`}
                    >
                      {estatisticas.geral.percentDentroPrazo ?? "—"}%
                    </span>
                    <span className="text-[11px] text-slate-500">agendados dentro do prazo</span>
                  </div>
                </div>

                {/* Comparação por estádio: medianas lado a lado */}
                <div className="mb-4">
                  <h3 className="text-[11px] font-bold uppercase text-slate-400 mb-2">
                    Mediana de dias até agendamento, por estádio do doente
                  </h3>
                  <div className="space-y-2">
                    {estatisticas.porEstadio
                      .filter((e) => e.total > 0)
                      .map((e) => {
                        const maiorMediana = Math.max(1, ...estatisticas.porEstadio.map((x) => x.medianaDias ?? 0));
                        const largura = Math.round(((e.medianaDias ?? 0) / maiorMediana) * 100);
                        return (
                          <div key={e.chave} className="flex items-center gap-2">
                            <span className="w-28 shrink-0 text-xs font-semibold text-slate-700">{e.legivel}</span>
                            <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden">
                              <div className="h-full bg-oasis-accent rounded" style={{ width: `${largura}%` }} />
                            </div>
                            <span className="w-24 shrink-0 text-right text-xs font-mono text-slate-600">
                              {e.medianaDias ?? "—"} dias · {e.total}
                            </span>
                          </div>
                        );
                      })}
                    {estatisticas.porEstadio.every((e) => e.total === 0) && (
                      <p className="text-xs text-slate-400">Sem pedidos marcados no período para comparar.</p>
                    )}
                  </div>
                </div>

                {/* Outliers */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase text-slate-400 mb-2">
                    Outliers — casos mais demorados a agendar
                  </h3>
                  {estatisticas.outliers.length === 0 ? (
                    <p className="text-xs text-slate-400">Sem casos a destacar.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {estatisticas.outliers.map((o) => (
                        <div
                          key={o.pedido_id}
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                            o.dentro_prazo ? "border-slate-200 bg-white" : "border-red-200 bg-red-50"
                          }`}
                        >
                          <span>
                            <strong className="text-slate-800">{o.doente_nome}</strong>
                            <span className="text-slate-500"> — {o.descricao} · {o.estadio_cuidado_legivel}</span>
                          </span>
                          <span className={`font-mono font-bold ${o.dentro_prazo ? "text-slate-600" : "text-red-700"}`}>
                            {o.dias} dias{!o.dentro_prazo ? " · fora do prazo" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ABA: DEFINIÇÕES (pesos da equação de prioridade deste serviço) */}
      {abaAtiva === "definicoes" && prioridade && pesosForm && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Settings2 className="h-4 w-4 text-oasis-accent" />
              <span>Pesos da Equação de Prioridade — {prioridade.especialidade_legivel}</span>
            </h2>
            {prioridade.personalizado && (
              <span className="rounded-full bg-oasis-accent/20 px-2 py-0.5 text-[10px] font-bold text-oasis-header">
                personalizado
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mb-3">
            A prioridade automática de cada pedido combina 3 factores. Ajuste o peso de cada um consoante o que
            importa mais neste serviço (ex.: dar mais valor ao prazo/urgência do que ao tipo de pedido). Os valores
            são normalizados para somar 100%. Só afecta este serviço; os restantes mantêm os pesos por omissão.
          </p>
          <div className="space-y-3">
            {(
              [
                { chave: "urgencia" as const, titulo: "Urgência clínica / prazo" },
                { chave: "tipo" as const, titulo: "Tipo de pedido" },
                { chave: "paciente" as const, titulo: "Perfil clínico do doente" },
              ]
            ).map((f) => (
              <div key={f.chave}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700">{f.titulo}</span>
                  <span className="font-mono font-bold text-oasis-header">
                    {Math.round(
                      (pesosForm[f.chave] / (pesosForm.urgencia + pesosForm.tipo + pesosForm.paciente || 1)) * 100,
                    )}
                    %
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(pesosForm[f.chave] * 100)}
                  onChange={(e) => setPesosForm((p) => (p ? { ...p, [f.chave]: Number(e.target.value) / 100 } : p))}
                  className="w-full"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={aGuardarPesos}
              onClick={guardarPesos}
              className="rounded-lg bg-oasis-header px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
            >
              {aGuardarPesos ? "A guardar…" : "Guardar pesos deste serviço"}
            </button>
            <button
              type="button"
              disabled={aGuardarPesos || !prioridade.personalizado}
              onClick={reporPesos}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Repor por omissão</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal Universal de Feedback do Doente */}
      {doenteModalId && (
        <DoenteModal
          doenteId={doenteModalId}
          onFechar={() => setDoenteModalId(null)}
        />
      )}
    </div>
  );
}
