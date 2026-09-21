import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet } from "../lib/api";
import { CATEGORIAS, ESTADO, SEQUENCIAL } from "../lib/paleta";

interface GrupoPrazo {
  chave: string;
  legivel: string;
  total: number;
  dentroPrazo: number;
  percent: number;
}

interface GrupoPendentes {
  chave: string;
  legivel: string;
  total: number;
  antiguidadeMediaDias: number;
}

interface Metricas {
  tempos: { consultaParaPedidoMin: number | null; pedidoParaMarcacaoMin: number | null };
  prazoPorNivel: GrupoPrazo[];
  prazoPorTipo: GrupoPrazo[];
  prazoPorServico: GrupoPrazo[];
  pendentesPorServico: GrupoPendentes[];
  remarcacoesPorMotivo: { motivo: string; total: number }[];
  consultasEmRisco: { detectadas: number; resolvidas: number };
  curvaAprovacaoDirecta: { semana: string; percent: number; total: number }[];
  triagem: { aceites: number; recusados: number; reencaminhados: number };
  impactoEstimado: { cromosMes: number; folhasMes: number; horasAdminDia: number };
}

interface Especialidade {
  codigo: string;
  descricao: string;
}

function CartaoEstatistica({ titulo, valor, sufixo }: { titulo: string; valor: string | number; sufixo?: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className="text-2xl font-semibold text-slate-800">
        {valor}
        {sufixo && <span className="ml-1 text-sm font-normal text-slate-400">{sufixo}</span>}
      </p>
    </div>
  );
}

function PainelGrafico({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-slate-600">{titulo}</h3>
      <div style={{ width: "100%", height: 220 }}>{children}</div>
    </div>
  );
}

export function Gestao() {
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [filtro, setFiltro] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Especialidade[]>("/gestao/especialidades").then(setEspecialidades);
  }, []);

  useEffect(() => {
    const query = filtro ? `?especialidade=${filtro}` : "";
    apiGet<Metricas>(`/gestao/metricas${query}`).then(setMetricas).catch((e) => setErro(String(e)));
  }, [filtro]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Gestão</h1>
          <span className="mt-1 inline-block rounded bg-slate-700 px-2 py-0.5 text-xs font-medium text-white">Dados simulados</span>
        </div>
        <select
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        >
          <option value="">Todos os serviços</option>
          {especialidades.map((e) => (
            <option key={e.codigo} value={e.codigo}>
              {e.descricao}
            </option>
          ))}
        </select>
      </div>
      {erro && <p className="mt-3 text-red-600">{erro}</p>}
      {!metricas && !erro && <p className="mt-4 text-slate-500">A carregar métricas…</p>}

      {metricas && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CartaoEstatistica titulo="Consulta → pedido no serviço" valor={metricas.tempos.consultaParaPedidoMin ?? "—"} sufixo="min" />
            <CartaoEstatistica titulo="Pedido → marcação" valor={metricas.tempos.pedidoParaMarcacaoMin ?? "—"} sufixo="min" />
            <CartaoEstatistica titulo="Consultas em risco detectadas" valor={metricas.consultasEmRisco.detectadas} />
            <CartaoEstatistica titulo="Consultas em risco resolvidas" valor={metricas.consultasEmRisco.resolvidas} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PainelGrafico titulo="% dentro do prazo por nível de prioridade">
              <ResponsiveContainer>
                <BarChart data={metricas.prazoPorNivel}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="legivel" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="percent" fill={SEQUENCIAL} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </PainelGrafico>

            <PainelGrafico titulo="% dentro do prazo por serviço">
              <ResponsiveContainer>
                <BarChart data={metricas.prazoPorServico} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                  <YAxis type="category" dataKey="legivel" width={140} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="percent" fill={SEQUENCIAL} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </PainelGrafico>

            <PainelGrafico titulo="Pendentes por serviço (EM_TRIAGEM, ACEITE, SEM_VAGA)">
              <ResponsiveContainer>
                <BarChart data={metricas.pendentesPorServico}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="legivel" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="total" fill={ESTADO.aviso} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </PainelGrafico>

            <PainelGrafico titulo="Remarcações por motivo">
              <ResponsiveContainer>
                <BarChart data={metricas.remarcacoesPorMotivo} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="motivo" width={180} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="total" fill={CATEGORIAS[4]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </PainelGrafico>

            <PainelGrafico titulo="Taxa de aprovação directa da IA (curva de aprendizagem)">
              <ResponsiveContainer>
                <LineChart data={metricas.curvaAprovacaoDirecta}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="semana" tick={{ fontSize: 9 }} interval={1} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Line type="monotone" dataKey="percent" stroke={SEQUENCIAL} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </PainelGrafico>

            <PainelGrafico titulo="Triagem: decisões">
              <ResponsiveContainer>
                <BarChart
                  data={[
                    { nome: "Aceites", total: metricas.triagem.aceites, cor: ESTADO.bom },
                    { nome: "Recusados", total: metricas.triagem.recusados, cor: ESTADO.critico },
                    { nome: "Reencaminhados", total: metricas.triagem.reencaminhados, cor: CATEGORIAS[1] },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {[ESTADO.bom, ESTADO.critico, CATEGORIAS[1]].map((cor, i) => (
                      <Cell key={i} fill={cor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </PainelGrafico>
          </div>

          <div className="mt-4 rounded border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-600">
              Impacto estimado <span className="font-normal text-slate-400">(estimativa — parametros.csv)</span>
            </h3>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <CartaoEstatistica titulo="Cromos eliminados / mês" valor={metricas.impactoEstimado.cromosMes.toLocaleString("pt-PT")} />
              <CartaoEstatistica titulo="Folhas poupadas / mês" valor={metricas.impactoEstimado.folhasMes.toLocaleString("pt-PT")} />
              <CartaoEstatistica titulo="Horas administrativas / dia" valor={metricas.impactoEstimado.horasAdminDia} sufixo="h" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
