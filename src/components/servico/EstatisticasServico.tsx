import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet } from "../../lib/api";
import { SEQUENCIAL } from "../../lib/paleta";
import { NomeDoente } from "../NomeDoente";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

interface Resumo {
  pedidos: number;
  marcados: number;
  medianaDias: number | null;
  percentDentroPrazo: number | null;
  taxaFaltas: number | null;
  remarcados: number;
}

interface Corte extends Resumo {
  chave: string;
  legivel: string;
}

interface Resposta {
  especialidade_legivel: string;
  desde: string;
  geral: Resumo;
  anterior: Resumo | null;
  pendentesAgora: number;
  serie: { rotulo: string; pedidos: number; marcados: number; percentDentroPrazo: number | null; medianaDias: number | null }[];
  porEstadio: Corte[];
  porNivel: Corte[];
  faixas: { rotulo: string; n: number }[];
  maisLentos: { pedido_id: string; doente_id: string; doente_nome: string; descricao: string; prioridade: string; dias: number; dentro_prazo: boolean; estadio_cuidado_legivel: string }[];
}

const PERIODOS = [
  { valor: "semana", legivel: "7 dias" },
  { valor: "mes", legivel: "30 dias" },
  { valor: "trimestre", legivel: "3 meses" },
  { valor: "todos", legivel: "Tudo" },
];
const ESTADIOS = [
  { valor: "NOVO", legivel: "Novo" },
  { valor: "PRE_TRATAMENTO", legivel: "Diagnóstico" },
  { valor: "EM_TRATAMENTO", legivel: "Tratamento" },
  { valor: "FOLLOW_UP", legivel: "Follow-up" },
];
const NIVEIS = [
  { valor: "MP", legivel: "Muito prioritário" },
  { valor: "P", legivel: "Prioritário" },
  { valor: "N", legivel: "Normal" },
];
const EIXO = { fontSize: 11, fill: "#64748b" };

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${activo ? "border-oasis-header bg-oasis-header text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}

/** Indicador com a variação face ao período anterior (verde quando melhora, vermelho quando piora). */
function Indicador({ valor, rotulo, anterior, sufixo = "", melhorQuando }: { valor: number | null; rotulo: string; anterior?: number | null; sufixo?: string; melhorQuando?: "sobe" | "desce" }) {
  const delta = valor !== null && anterior !== null && anterior !== undefined ? valor - anterior : null;
  const bom = delta === null || delta === 0 || !melhorQuando ? null : melhorQuando === "sobe" ? delta > 0 : delta < 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-2xl font-bold text-slate-900">
        {valor ?? "—"}
        {valor !== null && sufixo}
      </div>
      <div className="text-[11px] text-slate-500">{rotulo}</div>
      {delta !== null && (
        <div className={`mt-1 flex items-center gap-0.5 text-[11px] font-semibold ${bom === null ? "text-slate-500" : bom ? "text-emerald-700" : "text-rose-700"}`}>
          {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : delta < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {delta > 0 ? "+" : ""}
          {delta}
          {sufixo} vs período anterior
        </div>
      )}
    </div>
  );
}

function Cartao({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-800">{titulo}</h3>
      {subtitulo && <p className="mb-2 text-[11px] text-slate-500">{subtitulo}</p>}
      {children}
    </section>
  );
}

/** Tabela de corte (estádio ou nível): barra da mediana + % dentro do prazo, lado a lado. */
function TabelaCorte({ linhas }: { linhas: Corte[] }) {
  const max = Math.max(1, ...linhas.map((l) => l.medianaDias ?? 0));
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[10px] uppercase text-slate-400">
          <th className="pb-1 font-semibold" />
          <th className="pb-1 font-semibold">Pedidos</th>
          <th className="pb-1 font-semibold">Mediana até à marcação</th>
          <th className="pb-1 text-right font-semibold">No prazo</th>
          <th className="pb-1 text-right font-semibold">Faltas</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.chave} className="border-t border-slate-100">
            <td className="py-1.5 pr-2 font-semibold text-slate-700">{l.legivel}</td>
            <td className="py-1.5 pr-2 text-slate-600">{l.pedidos}</td>
            <td className="w-[40%] py-1.5 pr-2">
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full" style={{ width: `${((l.medianaDias ?? 0) / max) * 100}%`, background: SEQUENCIAL }} />
                </div>
                <span className="w-12 text-right text-slate-700">{l.medianaDias ?? "—"} d</span>
              </div>
            </td>
            <td className={`py-1.5 text-right font-semibold ${l.percentDentroPrazo !== null && l.percentDentroPrazo < 85 ? "text-rose-700" : "text-slate-800"}`}>
              {l.percentDentroPrazo ?? "—"}
              {l.percentDentroPrazo !== null && "%"}
            </td>
            <td className="py-1.5 text-right text-slate-600">
              {l.taxaFaltas ?? "—"}
              {l.taxaFaltas !== null && "%"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface LinhaComparacao extends Resumo {
  codigo: string;
  legivel: string;
  anteriorPercentDentroPrazo: number | null;
  pendentesAgora: number;
}

/**
 * Estatísticas: filtros por período, estádio e nível; tudo o resto responde a eles. A administrativa
 * vê o seu serviço; a gestão (gestao) vê primeiro todos os serviços lado a lado e escolhe um para o detalhe.
 */
export function EstatisticasServico({ gestao = false }: { gestao?: boolean }) {
  const [periodo, setPeriodo] = useState("mes");
  const [estadios, setEstadios] = useState<Set<string>>(new Set());
  const [niveis, setNiveis] = useState<Set<string>>(new Set());
  const [dados, setDados] = useState<Resposta | null>(null);
  const [comparacao, setComparacao] = useState<LinhaComparacao[] | null>(null);
  const [servico, setServico] = useState("");

  useEffect(() => {
    const q = new URLSearchParams({ periodo });
    if (estadios.size) q.set("estadio", [...estadios].join(","));
    if (niveis.size) q.set("nivel", [...niveis].join(","));
    if (!gestao) {
      apiGet<Resposta>(`/servico/estatisticas?${q}`).then(setDados).catch(() => undefined);
      return;
    }
    apiGet<LinhaComparacao[]>(`/gestao/comparar?${q}`)
      .then((l) => {
        setComparacao(l);
        setServico((s) => s || l[0]?.codigo || "");
      })
      .catch(() => undefined);
    if (servico) apiGet<Resposta>(`/gestao/estatisticas?especialidade=${servico}&${q}`).then(setDados).catch(() => undefined);
  }, [periodo, estadios, niveis, gestao, servico]);

  const alternar = (s: Set<string>, v: string) => {
    const n = new Set(s);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  const g = dados?.geral;
  const a = dados?.anterior;
  return (
    <div className="mt-5 space-y-4">
      {/* Filtros numa linha, acima de tudo */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500">Período</span>
          {PERIODOS.map((p) => (
            <Chip key={p.valor} activo={periodo === p.valor} onClick={() => setPeriodo(p.valor)}>
              {p.legivel}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500">Estádio</span>
          {ESTADIOS.map((e) => (
            <Chip key={e.valor} activo={estadios.has(e.valor)} onClick={() => setEstadios((s) => alternar(s, e.valor))}>
              {e.legivel}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500">Nível</span>
          {NIVEIS.map((n) => (
            <Chip key={n.valor} activo={niveis.has(n.valor)} onClick={() => setNiveis((s) => alternar(s, n.valor))}>
              {n.valor}
            </Chip>
          ))}
        </div>
        {(estadios.size > 0 || niveis.size > 0) && (
          <button type="button" onClick={() => (setEstadios(new Set()), setNiveis(new Set()))} className="text-xs text-oasis-accent hover:underline">
            Limpar filtros
          </button>
        )}
      </div>

      {gestao && comparacao && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="mb-1 text-xs font-bold text-slate-700">Serviços lado a lado — clique num para ver o detalhe</div>
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-400">
                <th className="py-1">Serviço</th>
                <th className="text-right">Pedidos</th>
                <th className="text-right">Dentro do prazo</th>
                <th className="text-right">vs período anterior</th>
                <th className="text-right">Mediana até marcar</th>
                <th className="text-right">Faltas</th>
                <th className="text-right">Por marcar agora</th>
              </tr>
            </thead>
            <tbody>
              {comparacao.map((l) => {
                const dif = l.percentDentroPrazo !== null && l.anteriorPercentDentroPrazo !== null ? l.percentDentroPrazo - l.anteriorPercentDentroPrazo : null;
                return (
                  <tr
                    key={l.codigo}
                    onClick={() => setServico(l.codigo)}
                    className={`cursor-pointer border-t border-slate-100 hover:bg-sky-50 ${servico === l.codigo ? "bg-sky-50 font-semibold" : ""}`}
                  >
                    <td className="py-1.5 text-slate-800">{l.legivel}</td>
                    <td className="text-right text-slate-600">{l.pedidos}</td>
                    <td className={`text-right font-bold ${l.percentDentroPrazo !== null && l.percentDentroPrazo < 80 ? "text-rose-700" : "text-emerald-700"}`}>
                      {l.percentDentroPrazo ?? "—"}
                      {l.percentDentroPrazo !== null && "%"}
                    </td>
                    <td className={`text-right ${dif === null ? "text-slate-400" : dif < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                      {dif === null ? "—" : `${dif > 0 ? "+" : ""}${dif} pp`}
                    </td>
                    <td className="text-right text-slate-600">{l.medianaDias ?? "—"}{l.medianaDias !== null && " d"}</td>
                    <td className="text-right text-slate-600">{l.taxaFaltas ?? "—"}{l.taxaFaltas !== null && "%"}</td>
                    <td className="text-right text-slate-600">{l.pendentesAgora}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {gestao && dados && <h3 className="text-sm font-bold text-slate-700">Detalhe · {dados.especialidade_legivel}</h3>}

      {!dados || !g ? (
        <p className="text-sm text-slate-400">A carregar…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Indicador valor={g.pedidos} rotulo="pedidos recebidos no período" anterior={a?.pedidos} />
            <Indicador valor={g.medianaDias} sufixo=" d" rotulo="mediana do pedido até à marcação" anterior={a?.medianaDias} melhorQuando="desce" />
            <Indicador valor={g.percentDentroPrazo} sufixo="%" rotulo="marcados dentro do prazo" anterior={a?.percentDentroPrazo} melhorQuando="sobe" />
            <Indicador valor={g.taxaFaltas} sufixo="%" rotulo="faltas" anterior={a?.taxaFaltas} melhorQuando="desce" />
            <Indicador valor={dados.pendentesAgora} rotulo="por marcar agora (triagem, sem vaga, faltas)" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Cartao titulo="Pedidos recebidos" subtitulo={periodo === "semana" ? "Por dia" : "Por semana (início da semana)"}>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dados.serie} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={false} />
                    <YAxis tick={EIXO} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(v) => [v, "pedidos"]} />
                    <Bar dataKey="pedidos" fill={SEQUENCIAL} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Cartao>
            <Cartao titulo="Marcados dentro do prazo" subtitulo="Percentagem dos pedidos recebidos em cada intervalo">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dados.serie} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={false} />
                    <YAxis tick={EIXO} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                    <Tooltip formatter={(v) => [`${v}%`, "no prazo"]} />
                    <Line type="monotone" dataKey="percentDentroPrazo" stroke={SEQUENCIAL} strokeWidth={2} dot={{ r: 4 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Cartao>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Cartao titulo="Por estádio do doente" subtitulo="Quem está em diagnóstico deve esperar menos">
              <TabelaCorte linhas={dados.porEstadio} />
            </Cartao>
            <Cartao titulo="Por nível de prioridade">
              <TabelaCorte linhas={dados.porNivel} />
            </Cartao>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <Cartao titulo="Quanto se espera" subtitulo="Dias do pedido até à data marcada">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dados.faixas} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={false} />
                    <YAxis tick={EIXO} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(v) => [v, "pedidos"]} />
                    <Bar dataKey="n" fill={SEQUENCIAL} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Cartao>
            <Cartao titulo="Os que mais esperaram" subtitulo="Clicar no nome abre a ficha">
              {dados.maisLentos.length === 0 ? (
                <p className="text-xs text-slate-400">Sem pedidos marcados com estes filtros.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {dados.maisLentos.map((o) => (
                    <li key={o.pedido_id} className="flex items-center gap-2 py-1.5 text-xs">
                      <span className="min-w-0 flex-1 truncate">
                        <NomeDoente id={o.doente_id} nome={o.doente_nome} className="font-semibold text-slate-800" />
                        <span className="text-slate-500"> · {o.descricao.split(" — ")[0]} · {o.estadio_cuidado_legivel} · {o.prioridade}</span>
                      </span>
                      <span className={`shrink-0 font-bold ${o.dentro_prazo ? "text-slate-700" : "text-rose-700"}`}>
                        {o.dias} d{!o.dentro_prazo && " · fora do prazo"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          </div>
        </>
      )}
    </div>
  );
}
