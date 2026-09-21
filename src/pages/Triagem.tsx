import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { usePerfil } from "../lib/PerfilContext";

interface ItemFila {
  pedido_id: string;
  doente_nome: string;
  medico_requisitante_nome: string;
  especialidade_origem_legivel: string;
  tipo_pedido_legivel: string;
  descricao: string;
  prioridade: string;
  prioridade_legivel: string;
  prazo_limite: string;
  texto_plano: string;
  dependencias: { descricao: string; estado: string }[];
  pronto_a_agendar: boolean;
}

interface RespostaFila {
  especialidade: string;
  especialidade_legivel: string;
  fila: ItemFila[];
}

interface Especialidade {
  codigo: string;
  descricao: string;
}

export function Triagem() {
  const { utilizador } = usePerfil();
  const [resposta, setResposta] = useState<RespostaFila | null>(null);
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<{ pedidoId: string; accao: "recusar" | "reencaminhar" | "pedir-informacao" } | null>(null);
  const [texto, setTexto] = useState("");
  const [destinoReencaminho, setDestinoReencaminho] = useState("");
  const [prioridades, setPrioridades] = useState<Record<string, string>>({});

  function recarregar() {
    apiGet<RespostaFila>("/triagem/fila").then(setResposta).catch((e) => setErro(String(e)));
  }

  useEffect(() => {
    recarregar();
    apiGet<Especialidade[]>("/triagem/especialidades").then(setEspecialidades);
  }, [utilizador?.utilizador_id]);

  async function aceitar(pedidoId: string) {
    setErro(null);
    try {
      await apiPost(`/triagem/${pedidoId}/aceitar`, { novaPrioridade: prioridades[pedidoId] });
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function confirmarAccao() {
    if (!aberto) return;
    setErro(null);
    try {
      if (aberto.accao === "recusar") {
        await apiPost(`/triagem/${aberto.pedidoId}/recusar`, { motivo: texto });
      } else if (aberto.accao === "reencaminhar") {
        await apiPost(`/triagem/${aberto.pedidoId}/reencaminhar`, { especialidade: destinoReencaminho, motivo: texto });
      } else {
        await apiPost(`/triagem/${aberto.pedidoId}/pedir-informacao`, { pergunta: texto });
      }
      setAberto(null);
      setTexto("");
      setDestinoReencaminho("");
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-lg font-semibold text-slate-800">Triagem{resposta ? ` — ${resposta.especialidade_legivel}` : ""}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Fila ordenada por urgência (folga → nível → antiguidade). Só se vê o pedido e o plano de origem.
      </p>
      {erro && <p className="mt-3 text-red-600">{erro}</p>}
      {!resposta && !erro && <p className="mt-6 text-slate-500">A carregar…</p>}

      {resposta?.fila.length === 0 && <p className="mt-6 text-slate-500">Sem pedidos em triagem.</p>}

      <div className="mt-4 space-y-3">
        {resposta?.fila.map((item) => (
          <div key={item.pedido_id} className="rounded border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-medium text-slate-700">
                  {item.doente_nome} <span className="font-normal text-slate-500">— {item.tipo_pedido_legivel}</span>
                </p>
                <p className="text-sm text-slate-600">{item.descricao}</p>
                <p className="text-xs text-slate-500">
                  Pedido por {item.medico_requisitante_nome} ({item.especialidade_origem_legivel}) · prazo {item.prazo_limite}
                </p>
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{item.prioridade_legivel}</span>
            </div>

            <p className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-2 text-sm text-slate-600">{item.texto_plano}</p>

            {item.dependencias.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-slate-500">
                {item.dependencias.map((d, i) => (
                  <li key={i}>
                    {d.descricao} — {d.estado}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                className="rounded border border-slate-300 px-2 py-1 text-sm"
                value={prioridades[item.pedido_id] ?? item.prioridade}
                onChange={(e) => setPrioridades((p) => ({ ...p, [item.pedido_id]: e.target.value }))}
              >
                <option value="N">Normal</option>
                <option value="P">Prioritário</option>
                <option value="MP">Muito prioritário</option>
              </select>
              <button
                type="button"
                onClick={() => aceitar(item.pedido_id)}
                className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Aceitar
              </button>
              <button
                type="button"
                onClick={() => setAberto({ pedidoId: item.pedido_id, accao: "recusar" })}
                className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
              >
                Recusar
              </button>
              <button
                type="button"
                onClick={() => setAberto({ pedidoId: item.pedido_id, accao: "reencaminhar" })}
                className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                Reencaminhar
              </button>
              <button
                type="button"
                onClick={() => setAberto({ pedidoId: item.pedido_id, accao: "pedir-informacao" })}
                className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                Pedir informação
              </button>
            </div>
          </div>
        ))}
      </div>

      {aberto && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded bg-white p-4 shadow-lg">
            <h2 className="text-base font-semibold text-slate-800">
              {aberto.accao === "recusar" && "Motivo da recusa"}
              {aberto.accao === "reencaminhar" && "Reencaminhar para outro serviço"}
              {aberto.accao === "pedir-informacao" && "Pergunta ao médico"}
            </h2>
            {aberto.accao === "reencaminhar" && (
              <select
                className="mt-2 w-full rounded border border-slate-300 p-1.5 text-sm"
                value={destinoReencaminho}
                onChange={(e) => setDestinoReencaminho(e.target.value)}
              >
                <option value="">Escolher serviço…</option>
                {especialidades
                  .filter((e) => e.codigo !== resposta?.especialidade)
                  .map((e) => (
                    <option key={e.codigo} value={e.codigo}>
                      {e.descricao}
                    </option>
                  ))}
              </select>
            )}
            <textarea
              className="mt-2 w-full rounded border border-slate-300 p-2 text-sm"
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={aberto.accao === "pedir-informacao" ? "O que precisa de confirmar…" : "Motivo…"}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAberto(null);
                  setTexto("");
                }}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm"
              >
                Cancelar
              </button>
              <button type="button" onClick={confirmarAccao} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-900">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
