import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { BarChart3 } from "lucide-react";

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

/** Estatísticas do serviço: tempo até à marcação, por estádio do doente, e os casos mais demorados. */
export function EstatisticasServico() {
  const [estatisticas, setEstatisticas] = useState<RespostaEstatisticas | null>(null);
  const [filtroPeriodoEstatisticas, setFiltroPeriodoEstatisticas] = useState<"semana" | "mes" | "todos">("mes");
  const [filtroEstadiosEstatisticas, setFiltroEstadiosEstatisticas] = useState<Set<string>>(new Set());

  useEffect(() => {
    const params = new URLSearchParams({ periodo: filtroPeriodoEstatisticas });
    if (filtroEstadiosEstatisticas.size > 0) params.set("estadio", [...filtroEstadiosEstatisticas].join(","));
    apiGet<RespostaEstatisticas>(`/servico/estatisticas?${params.toString()}`).then(setEstatisticas);
  }, [filtroPeriodoEstatisticas, filtroEstadiosEstatisticas]);

  return (
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
                { valor: "PRE_TRATAMENTO", legivel: "Diagnóstico" },
                { valor: "EM_TRATAMENTO", legivel: "Tratamento" },
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
  );
}
