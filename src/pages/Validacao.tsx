import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { EditarPedido, type Catalogo } from "../components/EditarPedido";

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

  function recarregar() {
    apiGet<GrupoValidacao[]>("/validacao/consultas").then(setGrupos).catch((e) => setErro(String(e)));
  }

  useEffect(() => {
    recarregar();
    apiGet<Catalogo>("/catalogo").then(setCatalogo);
  }, []);

  async function aprovarTudo(grupo: GrupoValidacao) {
    setMensagem(null);
    try {
      await apiPost("/validacao/aprovar", { pedidoIds: grupo.pedidos.map((p) => p.pedido_id) });
      setMensagem(`Pedidos de ${grupo.doente_nome} aprovados.`);
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-lg font-semibold text-slate-800">Validação</h1>
      <p className="mt-1 text-sm text-slate-500">
        Consultas com pedidos extraídos pelo agente, à espera de validação. Confirme a fidelidade da transcrição; dúvidas
        clínicas voltam ao médico.
      </p>
      {erro && <p className="mt-3 text-red-600">{erro}</p>}
      {mensagem && <p className="mt-3 rounded bg-emerald-50 px-3 py-2 text-emerald-700">{mensagem}</p>}

      {grupos && grupos.length === 0 && <p className="mt-6 text-slate-500">Sem consultas por validar.</p>}

      <div className="mt-4 space-y-4">
        {grupos?.map((grupo) => (
          <div key={grupo.chave} className="rounded border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
              <div>
                <span className="font-medium text-slate-700">{grupo.doente_nome}</span>
                <span className="ml-2 text-sm text-slate-500">{grupo.medico_nome}</span>
              </div>
              <button
                type="button"
                onClick={() => aprovarTudo(grupo)}
                className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Aprovar tudo
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Texto original</h3>
                <p className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-700">{grupo.texto_original}</p>
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Pedidos extraídos</h3>
                <ul className="space-y-2">
                  {grupo.pedidos.map((p) => (
                    <li key={p.pedido_id} className="rounded border border-slate-200 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-700">
                            {p.tipo_pedido_legivel}: {p.descricao}
                          </p>
                          <p className="text-xs text-slate-500">
                            {p.especialidade_destino_legivel} · {p.prioridade_legivel}
                            {p.prioridade_por_defeito && " (por defeito)"} · confiança {(p.confianca * 100).toFixed(0)}%
                            {p.origem_dicionario && (
                              <span className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 text-violet-700">aprendido</span>
                            )}
                            {p.baixa_confianca && (
                              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">confirmar</span>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAEditar(p)}
                          className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                        >
                          Editar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                {grupo.alertas.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {grupo.alertas.map((alerta) => (
                      <div key={alerta.alerta_id} className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">
                        <p className="text-amber-800">⚠ {alerta.descricao}</p>
                        <button
                          type="button"
                          onClick={() => setAlertaParaPedido({ grupo, alerta })}
                          className="mt-1 rounded border border-amber-400 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100"
                        >
                          Adicionar pedido a partir deste alerta
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
    </div>
  );
}
