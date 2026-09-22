import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  AlertTriangle,
  XCircle,
  CalendarClock,
  User,
  Filter,
} from "lucide-react";

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

type Cor = "vermelho" | "laranja" | "verde" | "cinza";

interface PedidoCard {
  pedido_id: string;
  descricao: string;
  tipo_pedido_legivel: string;
  especialidade_destino_legivel: string;
  estado: string;
  estado_legivel: string;
  prazo_limite: string;
  cor: Exclude<Cor, "cinza">;
}

interface CartaoDoente {
  doente_id: string;
  doente_nome: string;
  estadio_cuidado: string;
  estadio_cuidado_legivel: string;
  proxima_marcacao: string;
  cor: Cor;
  contagens: { pendentes: number; agendados: number; realizados: number; total: number };
  pedidos: PedidoCard[];
}

const ESTADIOS: { valor: string; legivel: string }[] = [
  { valor: "NOVO", legivel: "Novo" },
  { valor: "PRE_TRATAMENTO", legivel: "Pré-tratamento" },
  { valor: "EM_TRATAMENTO", legivel: "Em tratamento" },
  { valor: "FOLLOW_UP", legivel: "Follow-up" },
];

const CORES: { valor: Cor; legivel: string; dot: string }[] = [
  { valor: "vermelho", legivel: "Por agendar", dot: "bg-red-500" },
  { valor: "laranja", legivel: "Agendado", dot: "bg-amber-500" },
  { valor: "verde", legivel: "Realizado", dot: "bg-emerald-500" },
];

const JANELAS: { valor: string; legivel: string }[] = [
  { valor: "todos", legivel: "Todas as datas" },
  { valor: "semana", legivel: "Esta semana" },
  { valor: "mes", legivel: "Este mês" },
];

const ESTILO_COR_CARD: Record<Cor, string> = {
  vermelho: "border-l-red-500",
  laranja: "border-l-amber-500",
  verde: "border-l-emerald-500",
  cinza: "border-l-slate-300",
};

const ESTILO_BADGE_PEDIDO: Record<Exclude<Cor, "cinza">, string> = {
  vermelho: "border-red-200 bg-red-50 text-red-800",
  laranja: "border-amber-200 bg-amber-50 text-amber-800",
  verde: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

function formatarDataHora(iso: string): string {
  if (!iso) return "";
  const [data, hora] = iso.split("T");
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}${hora ? ` às ${hora}` : ""}`;
}

export function MeusPedidos() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [cartoes, setCartoes] = useState<CartaoDoente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const [filtroEstadios, setFiltroEstadios] = useState<Set<string>>(new Set());
  const [filtroCores, setFiltroCores] = useState<Set<Cor>>(new Set());
  const [filtroJanela, setFiltroJanela] = useState("todos");

  function recarregar() {
    apiGet<Resposta>("/meus-pedidos").then(setDados).catch((e) => setErro(String(e)));
  }

  function recarregarPainel() {
    const params = new URLSearchParams();
    if (filtroEstadios.size > 0) params.set("estadio", [...filtroEstadios].join(","));
    if (filtroCores.size > 0) params.set("cor", [...filtroCores].join(","));
    if (filtroJanela !== "todos") params.set("janela", filtroJanela);
    const query = params.toString();
    apiGet<CartaoDoente[]>(`/meus-pedidos/painel${query ? `?${query}` : ""}`)
      .then(setCartoes)
      .catch((e) => setErro(String(e)));
  }

  useEffect(recarregar, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(recarregarPainel, [filtroEstadios, filtroCores, filtroJanela]);

  async function responder(pedidoId: string) {
    setErro(null);
    try {
      await apiPost(`/meus-pedidos/${pedidoId}/responder`, { resposta: respostas[pedidoId] ?? "" });
      recarregar();
      recarregarPainel();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  function alternarEstadio(valor: string) {
    setFiltroEstadios((s) => {
      const novo = new Set(s);
      if (novo.has(valor)) novo.delete(valor);
      else novo.add(valor);
      return novo;
    });
  }

  function alternarCor(valor: Cor) {
    setFiltroCores((s) => {
      const novo = new Set(s);
      if (novo.has(valor)) novo.delete(valor);
      else novo.add(valor);
      return novo;
    });
  }

  function alternarExpandido(doenteId: string) {
    setExpandidos((s) => {
      const novo = new Set(s);
      if (novo.has(doenteId)) novo.delete(doenteId);
      else novo.add(doenteId);
      return novo;
    });
  }

  const totalCartoes = cartoes?.length ?? 0;
  const resumoCores = useMemo(() => {
    const c = { vermelho: 0, laranja: 0, verde: 0 };
    for (const cartao of cartoes ?? []) {
      if (cartao.cor !== "cinza") c[cartao.cor]++;
    }
    return c;
  }, [cartoes]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-slate-800">Os Meus Pedidos</h1>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 font-bold text-red-800">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> {resumoCores.vermelho} por agendar
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-bold text-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {resumoCores.laranja} agendados
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {resumoCores.verde} concluídos
          </span>
        </div>
      </div>

      {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}

      {/* Pedidos devolvidos: precisam de resposta do médico antes de tudo o resto */}
      {dados && dados.devolvidos.length > 0 && (
        <section className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Devolvidos pelo triador — aguardam a sua resposta ({dados.devolvidos.length})</span>
          </h2>
          <div className="mt-2 space-y-2">
            {dados.devolvidos.map((p) => (
              <div key={p.pedido_id} className="rounded-lg border border-amber-300 bg-white p-3">
                <p className="text-sm font-semibold text-slate-800">
                  {p.doente_nome} — {p.descricao}
                </p>
                <p className="mt-1 text-xs text-amber-800">Pergunta do triador: {p.pergunta_triagem}</p>
                <textarea
                  className="mt-2 w-full rounded border border-slate-300 p-2 text-xs"
                  rows={2}
                  value={respostas[p.pedido_id] ?? ""}
                  onChange={(e) => setRespostas((r) => ({ ...r, [p.pedido_id]: e.target.value }))}
                  placeholder="A sua resposta…"
                />
                <button
                  type="button"
                  onClick={() => responder(p.pedido_id)}
                  className="mt-2 rounded-lg bg-oasis-header px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
                >
                  Responder
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recusados: informativo, sem acção pendente */}
      {dados && dados.recusados.length > 0 && (
        <section className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-red-800">
            <XCircle className="h-3.5 w-3.5" />
            <span>Recusados pelo serviço de destino ({dados.recusados.length})</span>
          </h2>
          <div className="mt-2 space-y-1.5">
            {dados.recusados.map((p) => (
              <div key={p.pedido_id} className="rounded-lg border border-red-200 bg-white p-2.5 text-xs">
                <p className="font-semibold text-slate-800">
                  {p.doente_nome} — {p.descricao}
                </p>
                <p className="mt-0.5 text-red-700">Motivo: {p.motivo_recusa}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filtros: estádio do percurso oncológico, janela da próxima marcação, cor do cartão */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 mb-2.5">
          <Filter className="h-3.5 w-3.5" />
          <span>Filtros</span>
        </div>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div>
            <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Estádio do doente</span>
            <div className="flex flex-wrap gap-1.5">
              {ESTADIOS.map((e) => (
                <button
                  key={e.valor}
                  type="button"
                  onClick={() => alternarEstadio(e.valor)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    filtroEstadios.has(e.valor)
                      ? "border-oasis-header bg-oasis-header text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {e.legivel}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Próxima consulta</span>
            <div className="flex flex-wrap gap-1.5">
              {JANELAS.map((j) => (
                <button
                  key={j.valor}
                  type="button"
                  onClick={() => setFiltroJanela(j.valor)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    filtroJanela === j.valor
                      ? "border-oasis-header bg-oasis-header text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {j.legivel}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Estado do cartão</span>
            <div className="flex flex-wrap gap-1.5">
              {CORES.map((c) => (
                <button
                  key={c.valor}
                  type="button"
                  onClick={() => alternarCor(c.valor)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    filtroCores.has(c.valor)
                      ? "border-oasis-header bg-oasis-header text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${filtroCores.has(c.valor) ? "bg-white" : c.dot}`} />
                  {c.legivel}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Cartões por doente */}
      <div className="mt-4">
        {!cartoes && !erro && <p className="text-sm text-slate-500">A carregar…</p>}
        {cartoes && totalCartoes === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Sem doentes a corresponder aos filtros escolhidos.
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cartoes?.map((cartao) => {
            const aberto = expandidos.has(cartao.doente_id);
            return (
              <div
                key={cartao.doente_id}
                className={`rounded-xl border border-slate-200 border-l-4 bg-white shadow-sm ${ESTILO_COR_CARD[cartao.cor]}`}
              >
                <button
                  type="button"
                  onClick={() => alternarExpandido(cartao.doente_id)}
                  className="w-full p-3.5 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{cartao.doente_nome}</p>
                        <span className="inline-block rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold uppercase text-slate-600">
                          {cartao.estadio_cuidado_legivel}
                        </span>
                      </div>
                    </div>
                    {aberto ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-500">
                    <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                    {cartao.proxima_marcacao ? (
                      <span>
                        Próxima consulta: <strong className="text-slate-700">{formatarDataHora(cartao.proxima_marcacao)}</strong>
                      </span>
                    ) : (
                      <span>Sem marcação futura</span>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center gap-3 text-[11px] font-semibold">
                    <span className="flex items-center gap-1 text-red-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> {cartao.contagens.pendentes}
                    </span>
                    <span className="flex items-center gap-1 text-amber-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {cartao.contagens.agendados}
                    </span>
                    <span className="flex items-center gap-1 text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {cartao.contagens.realizados}
                    </span>
                    <span className="ml-auto text-slate-400">{cartao.contagens.total} pedido(s)</span>
                  </div>
                </button>

                {aberto && (
                  <div className="space-y-1.5 border-t border-slate-100 p-3">
                    {cartao.pedidos.map((p) => (
                      <div
                        key={p.pedido_id}
                        className={`rounded-lg border px-2.5 py-2 text-xs ${ESTILO_BADGE_PEDIDO[p.cor]}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold">{p.descricao}</span>
                          <span className="shrink-0 rounded bg-white/70 px-1.5 py-0.2 text-[10px] font-bold">
                            {p.estado_legivel}
                          </span>
                        </div>
                        <p className="mt-0.5 opacity-80">
                          {p.especialidade_destino_legivel} · Prazo: {p.prazo_limite}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {dados && dados.todos.length === 0 && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          <Clock className="h-4 w-4" />
          <span>Ainda não fez nenhum pedido.</span>
        </div>
      )}
    </div>
  );
}
