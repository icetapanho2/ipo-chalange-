import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";

interface ResumoPedido {
  pedido_id: string;
  doente_nome: string;
  tipo_pedido_legivel: string;
  especialidade_destino_legivel: string;
  descricao: string;
  estado: string;
  estado_legivel: string;
  criado_em: string;
  pergunta_triagem: string;
  motivo_recusa: string;
}

interface Resposta {
  devolvidos: ResumoPedido[];
  recusados: ResumoPedido[];
  todos: ResumoPedido[];
}

export function MeusPedidos() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<Record<string, string>>({});

  function recarregar() {
    apiGet<Resposta>("/meus-pedidos").then(setDados).catch((e) => setErro(String(e)));
  }

  useEffect(recarregar, []);

  async function responder(pedidoId: string) {
    setErro(null);
    try {
      await apiPost(`/meus-pedidos/${pedidoId}/responder`, { resposta: respostas[pedidoId] ?? "" });
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-lg font-semibold text-slate-800">Os meus pedidos</h1>
      {erro && <p className="mt-3 text-red-600">{erro}</p>}
      {!dados && !erro && <p className="mt-3 text-slate-500">A carregar…</p>}

      {dados && (
        <>
          <section className="mt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Devolvidos (à espera de resposta)</h2>
            {dados.devolvidos.length === 0 && <p className="mt-1 text-sm text-slate-400">Nenhum.</p>}
            <div className="mt-2 space-y-2">
              {dados.devolvidos.map((p) => (
                <div key={p.pedido_id} className="rounded border border-amber-300 bg-amber-50 p-3">
                  <p className="font-medium text-slate-700">
                    {p.doente_nome} — {p.descricao}
                  </p>
                  <p className="mt-1 text-sm text-amber-800">Pergunta do triador: {p.pergunta_triagem}</p>
                  <textarea
                    className="mt-2 w-full rounded border border-slate-300 p-2 text-sm"
                    rows={2}
                    value={respostas[p.pedido_id] ?? ""}
                    onChange={(e) => setRespostas((r) => ({ ...r, [p.pedido_id]: e.target.value }))}
                    placeholder="A sua resposta…"
                  />
                  <button
                    type="button"
                    onClick={() => responder(p.pedido_id)}
                    className="mt-2 rounded bg-slate-800 px-3 py-1 text-sm text-white hover:bg-slate-900"
                  >
                    Responder
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recusados</h2>
            {dados.recusados.length === 0 && <p className="mt-1 text-sm text-slate-400">Nenhum.</p>}
            <div className="mt-2 space-y-2">
              {dados.recusados.map((p) => (
                <div key={p.pedido_id} className="rounded border border-red-200 bg-red-50 p-3 text-sm">
                  <p className="font-medium text-slate-700">
                    {p.doente_nome} — {p.descricao}
                  </p>
                  <p className="text-red-700">Motivo: {p.motivo_recusa}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Todos os pedidos</h2>
            <table className="mt-2 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-xs uppercase text-slate-500">
                  <th className="py-1 pr-2">Doente</th>
                  <th className="py-1 pr-2">Pedido</th>
                  <th className="py-1 pr-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {dados.todos.map((p) => (
                  <tr key={p.pedido_id} className="border-b border-slate-100">
                    <td className="py-1 pr-2">{p.doente_nome}</td>
                    <td className="py-1 pr-2">{p.descricao}</td>
                    <td className="py-1 pr-2">{p.estado_legivel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dados.todos.length === 0 && <p className="mt-2 text-sm text-slate-400">Ainda não fez nenhum pedido.</p>}
          </section>
        </>
      )}
    </div>
  );
}
