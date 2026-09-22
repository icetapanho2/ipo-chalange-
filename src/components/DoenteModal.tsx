import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api";
import {
  X,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  User,
  Activity,
  FileText,
  AlertCircle,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

export interface DoenteModalProps {
  doenteId: string;
  onFechar: () => void;
}

interface ItemOQueFalta {
  nivel: "vermelho" | "amarelo" | "azul";
  titulo: string;
  detalhe: string;
  pedido_id?: string;
}

interface RespostaDoenteModal {
  doente: {
    doente_id: string;
    nome: string;
    n_utente: string;
    sexo: string;
    data_nascimento: string;
  };
  oQueFalta?: ItemOQueFalta[];
  alertas?: {
    alerta_id: string;
    tipo: string;
    gravidade: string;
    descricao: string;
    criado_em: string;
  }[];
  marcacoesFuturas: {
    pedido_id: string;
    descricao: string;
    especialidade_legivel: string;
    data_hora: string;
    semaforo: { cor: "verde" | "amarelo" | "vermelho"; porque: string };
    dependencias: {
      pedido_id: string;
      descricao: string;
      estado: string;
      estado_legivel: string;
      cor: "verde" | "amarelo" | "vermelho";
      porque: string;
      pode_remarcar: boolean;
    }[];
  }[];
  todosPedidos?: {
    pedido_id: string;
    tipo_pedido: string;
    tipo_pedido_legivel: string;
    descricao: string;
    especialidade_destino_legivel: string;
    exames: string[];
    analises: string[];
    prioridade_legivel: string;
    prazo_limite: string;
    estado: string;
    estado_legivel: string;
    confianca: number;
  }[];
  timeline?: {
    evento_id: string;
    data_hora: string;
    tipo: string;
    pedido_descricao: string;
    especialidade_legivel: string;
    quem: string;
    motivo: string;
    detalhe: string;
    estado_novo_legivel: string;
  }[];
}

export function DoenteModal({ doenteId, onFechar }: DoenteModalProps) {
  const [dados, setDados] = useState<RespostaDoenteModal | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<"prontidao" | "pedidos" | "historico">("prontidao");
  const [aProcessarAcao, setAProcessarAcao] = useState(false);

  function carregar() {
    setACarregar(true);
    setErro(null);
    apiGet<RespostaDoenteModal>(`/doente/${doenteId}`)
      .then((res) => {
        setDados(res);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setACarregar(false));
  }

  useEffect(() => {
    carregar();
  }, [doenteId]);

  async function executarRemarcacao(pedidoId: string) {
    setAProcessarAcao(true);
    try {
      await apiPost(`/doente/${doenteId}/pedidos/${pedidoId}/remarcar-exame`);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAProcessarAcao(false);
    }
  }

  async function executarAdiamento(pedidoId: string) {
    setAProcessarAcao(true);
    try {
      await apiPost(`/doente/${doenteId}/pedidos/${pedidoId}/adiar-consulta`);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAProcessarAcao(false);
    }
  }

  return (
    <div
      id="modal-doente-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        id="modal-doente-conteudo"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
      >
        {/* Cabeçalho do Prontuário do Doente */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-oasis-header text-white font-bold shadow-sm">
              <User className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800">
                  {dados?.doente.nome ?? "A carregar doente…"}
                </h2>
                {dados?.doente && (
                  <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
                    Nº {dados.doente.n_utente}
                  </span>
                )}
              </div>
              {dados?.doente && (
                <p className="text-xs text-slate-500">
                  {dados.doente.sexo === "M" ? "Masculino" : "Feminino"} · Nasc. {dados.doente.data_nascimento}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/doente/${doenteId}`}
              onClick={onFechar}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              title="Abrir página dedicada do doente"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Ver Perfil Completo</span>
            </Link>
            <button
              id="fechar-modal-doente-btn"
              type="button"
              onClick={onFechar}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Separadores Rápidos */}
        <div className="flex border-b border-slate-200 bg-white px-6">
          <button
            type="button"
            onClick={() => setAbaAtiva("prontidao")}
            className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              abaAtiva === "prontidao"
                ? "border-oasis-header text-oasis-header"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Prontidão & O Que Falta</span>
            {dados?.oQueFalta && dados.oQueFalta.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
                {dados.oQueFalta.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva("pedidos")}
            className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              abaAtiva === "pedidos"
                ? "border-oasis-header text-oasis-header"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Todos os Pedidos</span>
            {dados?.todosPedidos && (
              <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                {dados.todosPedidos.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva("historico")}
            className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              abaAtiva === "historico"
                ? "border-oasis-header text-oasis-header"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Timeline do Episódio</span>
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {aCarregar && (
            <div className="flex h-48 items-center justify-center text-slate-400 text-sm gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-oasis-header" />
              <span>A avaliar prontidão e histórico clínico do doente…</span>
            </div>
          )}

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold">Erro ao obter dados do doente:</p>
              <p className="mt-1">{erro}</p>
            </div>
          )}

          {!aCarregar && dados && (
            <>
              {/* ABA 1: PRONTIDÃO & O QUE FALTA */}
              {abaAtiva === "prontidao" && (
                <div className="space-y-5">
                  {/* Banner de Feedback Principal */}
                  <div
                    className={`rounded-xl border p-4 shadow-sm ${
                      dados.oQueFalta && dados.oQueFalta.some((item) => item.nivel === "vermelho")
                        ? "border-red-300 bg-red-50/80 text-red-950"
                        : dados.oQueFalta && dados.oQueFalta.length > 0
                        ? "border-amber-300 bg-amber-50/80 text-amber-950"
                        : "border-emerald-300 bg-emerald-50/80 text-emerald-950"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {dados.oQueFalta && dados.oQueFalta.some((item) => item.nivel === "vermelho") ? (
                        <AlertCircle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
                      ) : dados.oQueFalta && dados.oQueFalta.length > 0 ? (
                        <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <h3 className="font-bold text-base">
                          {dados.oQueFalta && dados.oQueFalta.some((item) => item.nivel === "vermelho")
                            ? "Atenção: Existem pendências críticas que bloqueiam consultas ou tratamentos"
                            : dados.oQueFalta && dados.oQueFalta.length > 0
                            ? "Prontidão Parcial: Existem etapas ou prazos a acompanhar"
                            : "Prontidão Total: Todos os requisitos e exames estão validados e em conformidade"}
                        </h3>
                        <p className="mt-1 text-xs opacity-90">
                          O motor inteligente do Oasis 2.0 avaliou dependências cruzadas (jejum, análises prévias de creatinina, exames de imagem e vagas).
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Checklist: O Que Falta */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      <span>Diagnóstico de Prontidão Clínica ("O Que Falta")</span>
                    </h4>

                    {(!dados.oQueFalta || dados.oQueFalta.length === 0) ? (
                      <div className="rounded-lg border border-dashed border-emerald-300 bg-white p-6 text-center">
                        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
                        <p className="text-sm font-semibold text-slate-700">Sem itens em falta para este utente</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Todas as dependências clínicas foram cumpridas com sucesso para as consultas agendadas.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {dados.oQueFalta.map((item, idx) => (
                          <div
                            key={idx}
                            className={`rounded-lg border p-3.5 transition-shadow hover:shadow-sm ${
                              item.nivel === "vermelho"
                                ? "border-red-200 bg-white text-slate-800 border-l-4 border-l-red-500"
                                : item.nivel === "amarelo"
                                ? "border-amber-200 bg-white text-slate-800 border-l-4 border-l-amber-500"
                                : "border-sky-200 bg-white text-slate-800 border-l-4 border-l-sky-500"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <span
                                  className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide mb-1 ${
                                    item.nivel === "vermelho"
                                      ? "bg-red-100 text-red-800"
                                      : item.nivel === "amarelo"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-sky-100 text-sky-800"
                                  }`}
                                >
                                  {item.nivel === "vermelho" ? "Bloqueante" : item.nivel === "amarelo" ? "Aviso" : "Informativo"}
                                </span>
                                <h5 className="font-semibold text-sm text-slate-800">{item.titulo}</h5>
                                <p className="mt-0.5 text-xs text-slate-600">{item.detalhe}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Consultas Futuras & Semáforo */}
                  {dados.marcacoesFuturas.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Próximas Marcações & Dependências Avaliadas</span>
                      </h4>
                      <div className="space-y-3">
                        {dados.marcacoesFuturas.map((mf) => (
                          <div
                            key={mf.pedido_id}
                            className={`rounded-xl border bg-white p-4 shadow-sm ${
                              mf.semaforo.cor === "vermelho"
                                ? "border-red-300"
                                : mf.semaforo.cor === "amarelo"
                                ? "border-amber-300"
                                : "border-emerald-300"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">
                                  {mf.semaforo.cor === "vermelho" ? "🔴" : mf.semaforo.cor === "amarelo" ? "🟡" : "🟢"}
                                </span>
                                <div>
                                  <h5 className="font-bold text-sm text-slate-800">{mf.descricao}</h5>
                                  <p className="text-xs text-slate-500">{mf.especialidade_legivel} · {mf.data_hora.replace("T", " ")}</p>
                                </div>
                              </div>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  mf.semaforo.cor === "vermelho"
                                    ? "bg-red-100 text-red-800"
                                    : mf.semaforo.cor === "amarelo"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {mf.semaforo.cor === "vermelho" ? "Em Risco" : mf.semaforo.cor === "amarelo" ? "Atenção" : "Pronto"}
                              </span>
                            </div>

                            <p className="text-xs text-slate-700 bg-slate-50 rounded-lg p-2.5 mb-3 font-medium">
                              {mf.semaforo.porque}
                            </p>

                            {/* Lista de Requisitos / Dependências */}
                            {mf.dependencias.length > 0 && (
                              <div className="space-y-2 mt-2">
                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                                  Pré-requisitos clínicos:
                                </span>
                                {mf.dependencias.map((dep) => (
                                  <div
                                    key={dep.pedido_id}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-xs"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span>{dep.cor === "vermelho" ? "❌" : dep.cor === "amarelo" ? "⚠️" : "✅"}</span>
                                      <div>
                                        <p className="font-medium text-slate-700">{dep.descricao}</p>
                                        <p className="text-[11px] text-slate-500">{dep.porque}</p>
                                      </div>
                                    </div>
                                    {dep.pode_remarcar && (
                                      <button
                                        type="button"
                                        disabled={aProcessarAcao}
                                        onClick={() => executarRemarcacao(dep.pedido_id)}
                                        className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                                      >
                                        Remarcar exame
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {mf.semaforo.cor === "vermelho" && (
                              <div className="mt-3 pt-2 border-t border-slate-100 flex justify-end">
                                <button
                                  type="button"
                                  disabled={aProcessarAcao}
                                  onClick={() => executarAdiamento(mf.pedido_id)}
                                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                >
                                  Adiar consulta para libertar vaga
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ABA 2: TODOS OS PEDIDOS */}
              {abaAtiva === "pedidos" && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Todos os Pedidos do Utente (Ativos e Histórico)
                  </h4>
                  {(!dados.todosPedidos || dados.todosPedidos.length === 0) ? (
                    <p className="text-sm text-slate-500">Sem pedidos registados.</p>
                  ) : (
                    <div className="space-y-2">
                      {dados.todosPedidos.map((ped) => (
                        <div
                          key={ped.pedido_id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-oasis-header">
                                {ped.tipo_pedido_legivel}
                              </span>
                              <span className="text-xs text-slate-400">·</span>
                              <span className="text-xs font-medium text-slate-600">
                                {ped.especialidade_destino_legivel}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-slate-800 mt-0.5">{ped.descricao}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Prioridade: {ped.prioridade_legivel} · Prazo limite: {ped.prazo_limite}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                ped.estado === "MARCADO"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : ped.estado === "EM_TRIAGEM"
                                  ? "bg-sky-100 text-sky-800"
                                  : ped.estado === "SEM_VAGA"
                                  ? "bg-amber-100 text-amber-800"
                                  : ped.estado === "DEVOLVIDO"
                                  ? "bg-orange-100 text-orange-800"
                                  : ped.estado === "FALTOU"
                                  ? "bg-red-100 text-red-800"
                                  : ped.estado === "REALIZADO"
                                  ? "bg-slate-100 text-slate-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {ped.estado === "REALIZADO" && (ped.tipo_pedido === "exame" || ped.tipo_pedido === "analises")
                                ? "Resultado disponível"
                                : ped.estado_legivel}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ABA 3: TIMELINE HISTÓRICO */}
              {abaAtiva === "historico" && (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Eventos e Auditoria do Episódio Clínico
                  </h4>
                  {(!dados.timeline || dados.timeline.length === 0) ? (
                    <p className="text-sm text-slate-500">Sem eventos registados.</p>
                  ) : (
                    <div className="relative border-l-2 border-slate-200 ml-3 space-y-4 pl-4 py-1">
                      {dados.timeline.map((ev) => (
                        <div key={ev.evento_id} className="relative group">
                          <div className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-white bg-oasis-accent" />
                          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-sm">
                            <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                              <span className="font-semibold text-slate-600">{ev.tipo}</span>
                              <span>{ev.data_hora.replace("T", " ")}</span>
                            </div>
                            <p className="font-semibold text-slate-800">{ev.pedido_descricao}</p>
                            <p className="text-slate-500 mt-0.5">
                              Por: <span className="text-slate-700">{ev.quem}</span> · {ev.especialidade_legivel}
                            </p>
                            {ev.motivo && (
                              <p className="mt-1 text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-100 font-mono text-[11px]">
                                {ev.motivo}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3 text-xs text-slate-500">
          <span>Oasis 2.0 · Motor de Validação & Triagem Inteligente</span>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 font-medium text-slate-700 hover:bg-slate-100 shadow-sm"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
