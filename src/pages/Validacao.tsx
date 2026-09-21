import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { EditarPedido, type Catalogo } from "../components/EditarPedido";
import { DoenteModal } from "../components/DoenteModal";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Edit3,
  PlusCircle,
  FileText,
  Sparkles,
  Layers,
  Activity,
  Check,
} from "lucide-react";

interface PedidoValidacao {
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
  origem_dicionario: boolean;
  estado: string;
  estado_legivel: string;
}

interface AlertaValidacao {
  alerta_id: string;
  tipo: string;
  descricao: string;
  gravidade: string;
}

interface GrupoValidacao {
  chave: string;
  consulta_ato_id: string;
  doente_id: string;
  doente_nome: string;
  medico_id: string;
  medico_nome: string;
  criado_em: string;
  texto_original: string;
  confianca_minima: number;
  pedidos: PedidoValidacao[];
  alertas: AlertaValidacao[];
}

export function Validacao() {
  const [grupos, setGrupos] = useState<GrupoValidacao[] | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aEditar, setAEditar] = useState<PedidoValidacao | null>(null);
  const [alertaParaPedido, setAlertaParaPedido] = useState<{ grupo: GrupoValidacao; alerta: AlertaValidacao } | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [doenteModalId, setDoenteModalId] = useState<string | null>(null);
  const [aAprovarChave, setAAprovarChave] = useState<string | null>(null);

  function recarregar() {
    apiGet<GrupoValidacao[]>("/validacao/consultas")
      .then(setGrupos)
      .catch((e) => setErro(String(e)));
  }

  useEffect(() => {
    recarregar();
    apiGet<Catalogo>("/catalogo").then(setCatalogo);
  }, []);

  async function aprovarTudo(grupo: GrupoValidacao) {
    setMensagem(null);
    setAAprovarChave(grupo.chave);
    try {
      await apiPost("/validacao/aprovar", { pedidoIds: grupo.pedidos.map((p) => p.pedido_id) });
      setMensagem(`Pedidos de ${grupo.doente_nome} validados e encaminhados com sucesso!`);
      recarregar();
      setTimeout(() => setMensagem(null), 5000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAAprovarChave(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Cabeçalho da Página de Validação */}
      <div className="border-b border-slate-200 pb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Validação Administrativa de Pedidos Extraídos
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Confirme a fidelidade da transcrição gerada pelo agente de IA. O pessoal administrativo valida prazos e atos do catálogo hospitalar antes de avançar para agendamento ou triagem.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 shadow-2xs text-xs flex items-center gap-2">
          <Layers className="h-4 w-4 text-oasis-accent" />
          <span className="text-slate-500">Consultas por Validar:</span>
          <strong className="text-slate-900 text-sm">{grupos?.length ?? 0}</strong>
        </div>
      </div>

      {erro && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <strong>Aviso:</strong> {erro}
        </div>
      )}

      {mensagem && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 animate-in fade-in">
          <Check className="h-4 w-4 text-emerald-600" />
          <span>{mensagem}</span>
        </div>
      )}

      {!grupos && !erro && (
        <div className="mt-8 flex justify-center text-sm text-slate-400 gap-2 items-center">
          <Clock className="h-4 w-4 animate-spin text-oasis-header" />
          <span>A carregar consultas por validar…</span>
        </div>
      )}

      {grupos && grupos.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500 mb-2" />
          <h3 className="font-bold text-slate-700">Tudo Validado!</h3>
          <p className="text-xs text-slate-500 mt-1">
            Não existem pedidos pós-consulta pendentes de validação administrativa no momento.
          </p>
        </div>
      )}

      {/* Lista de Consultas com Pedidos a Validar */}
      <div className="mt-5 space-y-5">
        {grupos?.map((grupo) => (
          <div
            key={grupo.chave}
            className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
          >
            {/* Cabeçalho do Grupo */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDoenteModalId(grupo.doente_id)}
                  className="font-bold text-slate-900 text-sm hover:text-oasis-accent flex items-center gap-1.5 group text-left"
                  title="Clique para ver o histórico e prontidão do utente"
                >
                  <User className="h-4 w-4 text-slate-500 group-hover:text-oasis-accent" />
                  <span>{grupo.doente_nome}</span>
                  <Activity className="h-3.5 w-3.5 text-sky-600 opacity-60 group-hover:opacity-100" />
                </button>
                <span className="text-slate-300">|</span>
                <span className="text-xs text-slate-500">
                  Médico: <strong className="text-slate-700">{grupo.medico_nome}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-xs text-slate-400 font-mono">
                  {grupo.criado_em.replace("T", " ")}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={aAprovarChave === grupo.chave}
                  onClick={() => aprovarTudo(grupo)}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 transition-transform active:scale-95"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{aAprovarChave === grupo.chave ? "A validar…" : "Aprovar Todos os Pedidos"}</span>
                </button>
              </div>
            </div>

            {/* Comparativo: Texto Original vs Pedidos Extraídos */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {/* Lado Esquerdo: Texto Original do SOAP (P) */}
              <div className="p-4 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-slate-400" />
                    <span>Texto do Plano Médico (Oasis)</span>
                  </h3>
                  <span className="text-[10px] text-slate-400">Transcrição original</span>
                </div>
                <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800 leading-relaxed shadow-2xs">
                  {grupo.texto_original}
                </div>
              </div>

              {/* Lado Direito: Pedidos Estruturados pelo Agente */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-oasis-accent" />
                    <span>Pedidos Estruturados ({grupo.pedidos.length})</span>
                  </h3>
                  <span className="text-[10px] font-semibold text-emerald-700">
                    Confiança mínima: {(grupo.confianca_minima * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="space-y-2">
                  {grupo.pedidos.map((p) => (
                    <div
                      key={p.pedido_id}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-2xs hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-800 text-sm">
                              {p.tipo_pedido_legivel}: {p.descricao}
                            </span>
                            {p.origem_dicionario && (
                              <span className="rounded bg-purple-100 px-1.5 py-0.2 text-[10px] font-bold text-purple-700">
                                Dicionário
                              </span>
                            )}
                            {p.baixa_confianca && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
                                Rever
                              </span>
                            )}
                          </div>
                          <p className="text-slate-500 mt-1">
                            Destino: <strong className="text-slate-700">{p.especialidade_destino_legivel}</strong> · Prioridade:{" "}
                            <strong className="text-slate-700">{p.prioridade_legivel}</strong>{" "}
                            {p.prioridade_por_defeito && <span className="text-slate-400">(padrão)</span>}
                          </p>
                          <p className="text-slate-500 mt-0.5">
                            Prazo limite: <span className="font-mono text-slate-700 font-semibold">{p.prazo_limite || "—"}</span>
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setAEditar(p)}
                          className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs flex items-center gap-1"
                        >
                          <Edit3 className="h-3 w-3 text-slate-400" />
                          <span>Editar</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Alertas Detectados no Grupo */}
                {grupo.alertas.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {grupo.alertas.map((alerta) => (
                      <div
                        key={alerta.alerta_id}
                        className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs shadow-2xs"
                      >
                        <div className="flex items-center gap-1.5 font-bold text-amber-900 mb-1">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <span>{alerta.descricao}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAlertaParaPedido({ grupo, alerta })}
                          className="mt-1 inline-flex items-center gap-1 rounded bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 shadow-2xs"
                        >
                          <PlusCircle className="h-3 w-3" />
                          <span>Adicionar pedido a partir deste alerta</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de Edição de Pedido */}
      {aEditar && catalogo && (
        <EditarPedido
          pedido={aEditar}
          catalogo={catalogo}
          onFechar={() => setAEditar(null)}
          onGravado={() => {
            setAEditar(null);
            recarregar();
          }}
        />
      )}

      {/* Modal de Criação a partir de Alerta */}
      {alertaParaPedido && catalogo && (
        <EditarPedido
          catalogo={catalogo}
          alertaOrigem={alertaParaPedido}
          onFechar={() => setAlertaParaPedido(null)}
          onGravado={() => {
            setAlertaParaPedido(null);
            recarregar();
          }}
        />
      )}

      {/* Modal de Prontidão do Doente */}
      {doenteModalId && (
        <DoenteModal
          doenteId={doenteModalId}
          onFechar={() => setDoenteModalId(null)}
        />
      )}
    </div>
  );
}
