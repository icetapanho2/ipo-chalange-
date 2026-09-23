import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { dataHoraPT, dataPT } from "../lib/datas";
import { apiGet, apiPost } from "../lib/api";
import { DecisoesRemarcacao } from "../components/DecisoesRemarcacao";
import { AlertTriangle, CalendarCheck2, CheckCircle2, Clock, ExternalLink, HelpCircle, Hourglass, Search, XCircle } from "lucide-react";

interface ResumoPedido {
  pedido_id: string;
  doente_nome: string;
  descricao: string;
  pergunta_triagem: string;
  motivo_recusa: string;
}

interface Resposta {
  devolvidos: ResumoPedido[];
  recusados: ResumoPedido[];
  semVagaDecisao: ResumoPedido[];
  todos: ResumoPedido[];
}

interface Etapa {
  pedido_id: string;
  descricao: string;
  tipo_pedido_legivel: string;
  especialidade_destino_legivel: string;
  estado: string;
  estado_legivel: string;
  prioridade: string;
  prazo_limite: string;
  data_marcada: string;
  depende_de: string[];
  semaforo: { cor: string; porque: string } | null;
  problema: string;
}

type Situacao = "atencao" | "por_marcar" | "marcado" | "concluido";

interface DoenteAcompanhado {
  doente_id: string;
  doente_nome: string;
  estadio_cuidado: string;
  estadio_cuidado_legivel: string;
  situacao: Situacao;
  problemas: string[];
  proxima: { data_hora: string; descricao: string } | null;
  percurso: Etapa[];
}

const SITUACOES: { valor: Situacao | "todos"; legivel: string; cor: string }[] = [
  { valor: "todos", legivel: "Todos", cor: "" },
  { valor: "atencao", legivel: "Precisa de atenção", cor: "bg-rose-500" },
  { valor: "por_marcar", legivel: "Em curso, por marcar", cor: "bg-sky-500" },
  { valor: "marcado", legivel: "Tudo marcado", cor: "bg-emerald-500" },
  { valor: "concluido", legivel: "Concluído", cor: "bg-slate-300" },
];
const ESTADIOS = [
  { valor: "", legivel: "Todos" },
  { valor: "NOVO", legivel: "Novo" },
  { valor: "PRE_TRATAMENTO", legivel: "Diagnóstico" },
  { valor: "EM_TRATAMENTO", legivel: "Tratamento" },
  { valor: "FOLLOW_UP", legivel: "Follow-up" },
];
const COR_SITUACAO = Object.fromEntries(SITUACOES.map((s) => [s.valor, s.cor])) as Record<Situacao, string>;

function IconeEtapa({ e }: { e: Etapa }) {
  if (e.problema) return <AlertTriangle className="h-4 w-4 text-rose-600" />;
  if (e.estado === "REALIZADO") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (e.estado === "MARCADO") return <CalendarCheck2 className="h-4 w-4 text-sky-600" />;
  if (e.estado === "RECUSADO" || e.estado === "CANCELADO") return <XCircle className="h-4 w-4 text-slate-400" />;
  return <Hourglass className="h-4 w-4 text-amber-600" />;
}

/** O percurso de um doente: cada pedido pela ordem das datas, com prazo, dependências e o que está mal. */
function Percurso({ d }: { d: DoenteAcompanhado }) {
  const nomes = new Map(d.percurso.map((e) => [e.pedido_id, e.descricao]));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{d.doente_nome}</h2>
          <p className="text-xs text-slate-500">
            {d.estadio_cuidado_legivel} · {d.percurso.length} pedido(s) seus
          </p>
        </div>
        <Link to={`/doente/${d.doente_id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Ficha completa <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      {d.problemas.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
          {d.problemas.map((p) => (
            <li key={p} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {p}
            </li>
          ))}
        </ul>
      )}
      <ol className="relative mt-4 space-y-3 border-l-2 border-slate-100 pl-5">
        {d.percurso.map((e) => (
          <li key={e.pedido_id} className="relative">
            <span className="absolute -left-[31px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white">
              <IconeEtapa e={e} />
            </span>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-sm font-semibold text-slate-800">{e.descricao}</p>
              <p className={`text-xs font-semibold ${e.problema ? "text-rose-700" : "text-slate-700"}`}>
                {e.data_marcada ? dataHoraPT(e.data_marcada) : e.estado_legivel}
              </p>
            </div>
            <p className="text-[11px] text-slate-500">
              {e.especialidade_destino_legivel} · {e.estado_legivel} · {e.prioridade} · prazo {dataPT(e.prazo_limite)}
            </p>
            {e.depende_de.length > 0 && (
              <p className="text-[11px] text-slate-500">Precisa antes: {e.depende_de.map((id) => nomes.get(id) ?? "exame de outra consulta").join(", ")}</p>
            )}
            {e.problema ? (
              <p className="mt-0.5 text-[11px] font-semibold text-rose-700">{e.problema}</p>
            ) : (
              e.semaforo && <p className={`mt-0.5 text-[11px] ${e.semaforo.cor === "verde" ? "text-emerald-700" : "text-amber-700"}`}>{e.semaforo.porque}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function MeusPedidos() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [doentes, setDoentes] = useState<DoenteAcompanhado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [situacao, setSituacao] = useState<Situacao | "todos">("todos");
  const [estadio, setEstadio] = useState("");
  const [pesquisa, setPesquisa] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);

  function recarregar() {
    apiGet<Resposta>("/meus-pedidos").then(setDados).catch((e) => setErro(String(e)));
    apiGet<DoenteAcompanhado[]>("/meus-pedidos/painel")
      .then((l) => {
        setDoentes(l);
        setSelecionado((s) => s ?? l[0]?.doente_id ?? null);
      })
      .catch((e) => setErro(String(e)));
  }
  useEffect(recarregar, []);

  async function executar(caminho: string, corpo: unknown) {
    setErro(null);
    try {
      await apiPost(caminho, corpo);
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  // Cada grupo de filtros conta dentro do que o outro já filtrou (situação × estádio).
  const contagens = useMemo(() => {
    const doEstadio = (doentes ?? []).filter((d) => !estadio || d.estadio_cuidado === estadio);
    const c: Record<string, number> = { todos: doEstadio.length };
    for (const d of doEstadio) c[d.situacao] = (c[d.situacao] ?? 0) + 1;
    return c;
  }, [doentes, estadio]);
  const porEstadio = useMemo(() => {
    const daSituacao = (doentes ?? []).filter((d) => situacao === "todos" || d.situacao === situacao);
    const c: Record<string, number> = { "": daSituacao.length };
    for (const d of daSituacao) c[d.estadio_cuidado] = (c[d.estadio_cuidado] ?? 0) + 1;
    return c;
  }, [doentes, situacao]);

  const termo = pesquisa.trim().toLowerCase();
  const lista = (doentes ?? []).filter(
    (d) => (situacao === "todos" || d.situacao === situacao) && (!estadio || d.estadio_cuidado === estadio) && (!termo || d.doente_nome.toLowerCase().includes(termo)),
  );
  // Se os filtros esconderem o doente seleccionado, mostra o primeiro da lista filtrada.
  const atual = lista.find((d) => d.doente_id === selecionado) ?? lista[0] ?? null;
  const porResponder = (dados?.devolvidos.length ?? 0) + (dados?.semVagaDecisao.length ?? 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Os meus doentes</h1>
          <p className="text-xs text-slate-500">O percurso de cada doente depois da sua consulta: o que já está marcado, o que falta, e o que precisa de si.</p>
        </div>
        <div className="text-xs text-slate-600">
          <strong className="text-rose-700">{contagens.atencao ?? 0}</strong> precisam de atenção · <strong>{contagens.todos}</strong> doentes
        </div>
      </div>

      {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}

      {/* O que precisa de uma resposta do médico */}
      <DecisoesRemarcacao aoMudar={recarregar} />
      {porResponder > 0 && dados && (
        <section className="mt-4 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-900">
            <HelpCircle className="h-3.5 w-3.5" /> Precisa da sua resposta ({porResponder})
          </h2>
          {dados.semVagaDecisao.map((p) => (
            <div key={p.pedido_id} className="rounded-lg border border-amber-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-800">
                {p.doente_nome} — {p.descricao}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">Sem vaga no prazo; a administração não conseguiu vaga interna nem externa. Manter em espera ou cancelar?</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => executar(`/meus-pedidos/${p.pedido_id}/decidir-sem-vaga`, { decisao: "MANTER" })} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  Manter em espera
                </button>
                <button type="button" onClick={() => executar(`/meus-pedidos/${p.pedido_id}/decidir-sem-vaga`, { decisao: "CANCELAR" })} className="rounded-lg bg-red-700 px-3 py-1 text-xs font-bold text-white hover:bg-red-800">
                  Cancelar pedido
                </button>
              </div>
            </div>
          ))}
          {dados.devolvidos.map((p) => (
            <div key={p.pedido_id} className="rounded-lg border border-amber-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-800">
                {p.doente_nome} — {p.descricao}
              </p>
              <p className="mt-0.5 text-xs text-amber-800">Pergunta do triador: {p.pergunta_triagem}</p>
              <div className="mt-2 flex gap-2">
                <input
                  value={respostas[p.pedido_id] ?? ""}
                  onChange={(e) => setRespostas((r) => ({ ...r, [p.pedido_id]: e.target.value }))}
                  placeholder="A sua resposta…"
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                />
                <button type="button" onClick={() => executar(`/meus-pedidos/${p.pedido_id}/responder`, { resposta: respostas[p.pedido_id] ?? "" })} className="rounded-lg bg-oasis-header px-3 py-1 text-xs font-bold text-white hover:bg-slate-700">
                  Responder
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
      {dados && dados.recusados.length > 0 && (
        <details className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
          <summary className="cursor-pointer font-semibold text-slate-700">{dados.recusados.length} pedido(s) recusado(s) pelo serviço de destino</summary>
          <ul className="mt-1.5 space-y-1 text-slate-600">
            {dados.recusados.map((p) => (
              <li key={p.pedido_id}>
                <strong>{p.doente_nome}</strong> — {p.descricao}
                {p.motivo_recusa && <span className="text-slate-500"> · {p.motivo_recusa}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Lista + percurso do doente seleccionado */}
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SITUACOES.map((s) => (
              <button
                key={s.valor}
                type="button"
                onClick={() => setSituacao(s.valor)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  situacao === s.valor ? "bg-oasis-header text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {s.cor && <span className={`h-2 w-2 rounded-full ${s.cor}`} />}
                {s.legivel} <span className="opacity-70">{contagens[s.valor] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="mb-2 flex gap-2">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
              <input value={pesquisa} onChange={(e) => setPesquisa(e.target.value)} placeholder="Procurar doente" className="w-full rounded-lg border border-slate-300 py-1.5 pl-7 pr-2 text-xs" />
            </label>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500">Estádio:</span>
            {ESTADIOS.map((e) => (
              <button
                key={e.valor}
                type="button"
                onClick={() => setEstadio(e.valor)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  estadio === e.valor ? "border-oasis-header bg-oasis-header text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {e.legivel} <span className="opacity-70">{porEstadio[e.valor] ?? 0}</span>
              </button>
            ))}
          </div>
          <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
            {!doentes && <li className="p-3 text-xs text-slate-400">A carregar…</li>}
            {doentes && lista.length === 0 && <li className="p-3 text-xs text-slate-400">Nenhum doente com estes filtros.</li>}
            {lista.map((d) => (
              <li key={d.doente_id}>
                <button
                  type="button"
                  onClick={() => setSelecionado(d.doente_id)}
                  className={`flex w-full items-start gap-2.5 px-3 py-2 text-left ${atual?.doente_id === d.doente_id ? "bg-sky-50" : "hover:bg-slate-50"}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${COR_SITUACAO[d.situacao]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{d.doente_nome}</span>
                    <span className={`block truncate text-[11px] ${d.problemas.length ? "text-rose-700" : "text-slate-500"}`}>
                      {d.problemas[0] ?? (d.proxima ? `${dataHoraPT(d.proxima.data_hora)} · ${d.proxima.descricao}` : d.estadio_cuidado_legivel)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-400">{d.estadio_cuidado_legivel}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          {atual ? (
            <Percurso d={atual} />
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
              <Clock className="h-4 w-4" /> Escolha um doente para ver o percurso.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
