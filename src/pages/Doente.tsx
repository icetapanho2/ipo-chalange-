import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api";

interface DoenteInfo {
  doente_id: string;
  nome: string;
  n_utente: string;
  sexo: string;
  data_nascimento: string;
}

interface ItemTimeline {
  evento_id: string;
  pedido_id: string;
  data_hora: string;
  tipo: string;
  pedido_descricao: string;
  especialidade_legivel: string;
  quem: string;
  motivo: string;
  detalhe: string;
  estado_novo_legivel: string;
}

interface DependenciaAvaliada {
  pedido_id: string;
  descricao: string;
  estado: string;
  estado_legivel: string;
  cor: "verde" | "amarelo" | "vermelho";
  porque: string;
  pode_remarcar: boolean;
}

interface MarcacaoFutura {
  pedido_id: string;
  descricao: string;
  especialidade_legivel: string;
  data_hora: string;
  semaforo: { cor: "verde" | "amarelo" | "vermelho"; porque: string };
  dependencias: DependenciaAvaliada[];
}

interface RespostaDoente {
  doente: DoenteInfo;
  timeline: ItemTimeline[];
  marcacoesFuturas: MarcacaoFutura[];
}

const COR_BOLA: Record<string, string> = { verde: "🟢", amarelo: "🟡", vermelho: "🔴" };

export function Doente() {
  const { id } = useParams<{ id: string }>();
  const [dados, setDados] = useState<RespostaDoente | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<{ tipo: "remarcar" | "adiar"; pedidoId: string; texto: string } | null>(null);

  function recarregar() {
    if (!id) return;
    apiGet<RespostaDoente>(`/doente/${id}`).then(setDados).catch((e) => setErro(String(e)));
  }

  useEffect(recarregar, [id]);

  async function executar() {
    if (!confirmar) return;
    setErro(null);
    try {
      const caminho = confirmar.tipo === "remarcar" ? "remarcar-exame" : "adiar-consulta";
      await apiPost(`/doente/${id}/pedidos/${confirmar.pedidoId}/${caminho}`);
      setConfirmar(null);
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  if (!dados) {
    return <div className="mx-auto max-w-3xl px-4 py-6">{erro ? <p className="text-red-600">{erro}</p> : <p>A carregar…</p>}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="rounded border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">{dados.doente.nome}</h1>
        <p className="text-sm text-slate-500">
          Nº utente {dados.doente.n_utente} · {dados.doente.sexo} · nasc. {dados.doente.data_nascimento}
        </p>
      </header>
      {erro && <p className="mt-3 text-red-600">{erro}</p>}

      {dados.marcacoesFuturas.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Marcações futuras com dependências</h2>
          <div className="mt-2 space-y-2">
            {dados.marcacoesFuturas.map((m) => (
              <div
                key={m.pedido_id}
                className={`rounded border p-3 ${
                  m.semaforo.cor === "vermelho" ? "border-red-300 bg-red-50" : m.semaforo.cor === "amarelo" ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50"
                }`}
              >
                <p className="font-medium text-slate-700">
                  {COR_BOLA[m.semaforo.cor]} {m.descricao} — {m.data_hora.replace("T", " ")}
                </p>
                <p className="text-sm text-slate-600">{m.semaforo.porque}</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-600">
                  {m.dependencias.map((d) => (
                    <li key={d.pedido_id} className="flex items-center justify-between gap-2">
                      <span>
                        {COR_BOLA[d.cor]} {d.descricao}: {d.porque}
                      </span>
                      {m.semaforo.cor === "vermelho" && d.pode_remarcar && (
                        <button
                          type="button"
                          onClick={() => setConfirmar({ tipo: "remarcar", pedidoId: d.pedido_id, texto: `Remarcar "${d.descricao}"?` })}
                          className="shrink-0 rounded border border-red-400 px-2 py-0.5 text-xs text-red-700 hover:bg-red-100"
                        >
                          Remarcar exame
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {m.semaforo.cor === "vermelho" && (
                  <button
                    type="button"
                    onClick={() => setConfirmar({ tipo: "adiar", pedidoId: m.pedido_id, texto: `Adiar "${m.descricao}"?` })}
                    className="mt-2 rounded border border-red-400 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                  >
                    Adiar consulta
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Timeline</h2>
        <ol className="mt-2 border-l-2 border-slate-200 pl-4">
          {dados.timeline.map((item) => (
            <li key={item.evento_id} className="relative mb-4">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-slate-400" />
              <p className="text-xs text-slate-400">{item.data_hora.replace("T", " ")}</p>
              <p className="text-sm text-slate-700">
                <span className="font-medium">{item.tipo}</span> — {item.pedido_descricao} ({item.especialidade_legivel})
              </p>
              <p className="text-xs text-slate-500">
                {item.quem}
                {item.estado_novo_legivel && ` → ${item.estado_novo_legivel}`}
                {item.motivo && ` · ${item.motivo}`}
              </p>
              {item.detalhe && <p className="text-xs text-slate-400">{item.detalhe}</p>}
            </li>
          ))}
        </ol>
      </section>

      {confirmar && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded bg-white p-4 shadow-lg">
            <p className="text-slate-700">{confirmar.texto}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmar(null)} className="rounded border border-slate-300 px-3 py-1.5 text-sm">
                Cancelar
              </button>
              <button type="button" onClick={executar} className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
