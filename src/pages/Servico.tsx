import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { DoenteModal } from "../components/DoenteModal";
import {
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Activity,
  Layers,
  Check,
  X,
  AlertCircle,
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
}

interface ConsultaEmRisco {
  pedido_id: string;
  doente_id: string;
  doente_nome: string;
  descricao: string;
  data_hora: string;
  porque: string;
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
  const [erro, setErro] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [accoes, setAccoes] = useState<Record<string, string>>({});
  const [doenteModalId, setDoenteModalId] = useState<string | null>(null);
  const [estadoAtivo, setEstadoAtivo] = useState<string>("SEM_VAGA");

  function recarregar() {
    apiGet<RespostaPedidos>("/servico/pedidos")
      .then(setPedidos)
      .catch((e) => setErro(String(e)));
    apiGet<AlertaServico[]>("/servico/alertas").then(setAlertas);
    apiGet<PropostaServico[]>("/servico/propostas").then(setPropostas);
    apiGet<ConsultaEmRisco[]>("/servico/consultas-em-risco").then(setEmRisco);
  }

  useEffect(recarregar, []);

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

      {/* SECÇÃO 1: CONSULTAS EM RISCO (PRÓXIMOS 14 DIAS) */}
      {emRisco && emRisco.length > 0 && (
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

      {/* SECÇÃO 2: PROPOSTAS DE TROCA INTELIGENTE DE VAGAS */}
      {propostas && propostas.length > 0 && (
        <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-indigo-200 pb-2 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-indigo-600" />
              <span>Propostas de Troca Inteligente de Agenda</span>
            </h2>
            <span className="text-[11px] text-indigo-700">Otimização automática de vagas</span>
          </div>

          <div className="space-y-2.5">
            {propostas.map((p) => (
              <div
                key={p.proposta_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-white p-3.5 shadow-2xs"
              >
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Proposta para Doente Urgente: {p.pedido_urgente_doente}
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-600">{p.justificacao}</p>
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

      {/* SECÇÃO 3: ALERTAS DO SERVIÇO */}
      {alertas && alertas.length > 0 && (
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
                  <span className="text-[11px] text-slate-400 block mt-0.5">Criado em {a.criado_em.replace("T", " ")}</span>
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

      {/* SECÇÃO 4: QUADRO DE PEDIDOS POR ESTADO */}
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
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-slate-300 transition-colors"
                >
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
                      Requisitante: {p.medico_requisitante_nome} · Prazo limite: <span className="font-mono">{p.prazo_limite}</span>
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
              ))}
            </div>
          )}
        </div>
      </div>

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
