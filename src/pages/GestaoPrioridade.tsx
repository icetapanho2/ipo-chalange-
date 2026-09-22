import { useEffect, useState } from "react";
import { dataHoraPT, dataPT } from "../lib/datas";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api";
import { ArrowLeft, Gauge, Save, ChevronDown, ChevronUp, Info } from "lucide-react";

interface Peso {
  chave: string;
  legivel: string;
  peso: number;
}

interface Outcome {
  pedido_id: string;
  doente_nome: string;
  tipo_pedido_legivel: string;
  descricao: string;
  especialidade_destino_legivel: string;
  score: number;
  prioridade: string;
  prioridade_legivel: string;
  detalhe: string;
  criado_em: string;
  prazo_limite: string;
}

interface RespostaPrioridade {
  limiares: { mp: number; p: number };
  pesos: Peso[];
  totalCalculados: number;
  outcomes: Outcome[];
}

const COR_PRIORIDADE: Record<string, string> = {
  MP: "bg-red-100 text-red-800",
  P: "bg-amber-100 text-amber-800",
  N: "bg-slate-200 text-slate-700",
};

export function GestaoPrioridade() {
  const [dados, setDados] = useState<RespostaPrioridade | null>(null);
  const [limiarMp, setLimiarMp] = useState(70);
  const [limiarP, setLimiarP] = useState(42);
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [filtroPrioridade, setFiltroPrioridade] = useState<"TODOS" | "MP" | "P" | "N">("TODOS");
  const [abertoDetalhe, setAbertoDetalhe] = useState<string | null>(null);

  function carregar() {
    apiGet<RespostaPrioridade>("/gestao/prioridade").then((r) => {
      setDados(r);
      setLimiarMp(r.limiares.mp);
      setLimiarP(r.limiares.p);
    });
  }

  useEffect(carregar, []);

  async function guardarLimiares() {
    setErro(null);
    setSucesso(null);
    setAGuardar(true);
    try {
      await apiPost("/gestao/prioridade/limiares", { mp: limiarMp, p: limiarP });
      setSucesso("Limiares actualizados — aplicam-se já aos próximos cálculos de prioridade.");
      carregar();
      setTimeout(() => setSucesso(null), 5000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAGuardar(false);
    }
  }

  const outcomesFiltrados = dados?.outcomes.filter((o) => filtroPrioridade === "TODOS" || o.prioridade === filtroPrioridade) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-3">
        <Link to="/gestao" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-oasis-header">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Voltar a Gestão</span>
        </Link>
      </div>

      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Gauge className="h-5 w-5 text-oasis-accent" />
          <span>Definições da Prioridade</span>
        </h1>
        <p className="mt-1 text-xs text-slate-500 max-w-2xl">
          A prioridade de cada pedido é sempre calculada pelo sistema — nunca sugerida directamente pelo médico —
          combinando três factores. Esta página mostra como o cálculo funciona e os desfechos que tem produzido.
        </p>
      </div>

      {erro && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
      {sucesso && (
        <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          {sucesso}
        </div>
      )}

      {/* Explicação dos 3 factores */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">Como o score (0–100) é calculado</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {dados?.pesos.map((peso) => (
            <div key={peso.chave} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-slate-800">{peso.legivel}</span>
                <span className="text-lg font-bold text-oasis-accent">{Math.round(peso.peso * 100)}%</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                {peso.chave === "urgencia" && "Prazo explícito no plano e palavras de urgência no texto do médico."}
                {peso.chave === "tipo" && "Tipo de acto: Hospital de Dia, interconsulta, exame com contraste, etc."}
                {peso.chave === "paciente" && "Diagnóstico e estadiamento guardados na ficha do doente (aba \"Perfil Clínico\")."}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Score final = urgência × 0,5 + tipo × 0,3 + perfil clínico × 0,2. Cada pedido guarda a justificação exacta em
          linguagem simples (visível abaixo, em "Desfechos Recentes").
        </p>
      </div>

      {/* Limiares editáveis */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">Limiares de classificação</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Score mínimo para Muito Prioritário</label>
            <input
              type="number"
              min={0}
              max={100}
              value={limiarMp}
              onChange={(e) => setLimiarMp(Number(e.target.value))}
              className="w-28 rounded border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Score mínimo para Prioritário</label>
            <input
              type="number"
              min={0}
              max={100}
              value={limiarP}
              onChange={(e) => setLimiarP(Number(e.target.value))}
              className="w-28 rounded border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
            />
          </div>
          <button
            type="button"
            onClick={guardarLimiares}
            disabled={aGuardar}
            className="inline-flex items-center gap-1.5 rounded-lg bg-oasis-header px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{aGuardar ? "A guardar…" : "Guardar limiares"}</span>
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Abaixo de {limiarP}: Normal. Um prazo muito curto (≤3 dias) ou palavras de urgência classificam sempre como
          Muito Prioritário, independentemente do limiar. "Repor demo" restaura os valores por omissão.
        </p>
      </div>

      {/* Outcomes */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Desfechos Recentes ({dados?.totalCalculados ?? 0} pedido(s) calculados pelo sistema)
          </h2>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md">
            {(["TODOS", "MP", "P", "N"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltroPrioridade(f)}
                className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  filtroPrioridade === f ? "bg-white text-oasis-header shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {f === "TODOS" ? "Todos" : f}
              </button>
            ))}
          </div>
        </div>

        {outcomesFiltrados.length === 0 ? (
          <p className="text-xs text-slate-400">Sem pedidos calculados pelo sistema para este filtro.</p>
        ) : (
          <div className="space-y-1.5">
            {outcomesFiltrados.map((o) => (
              <div key={o.pedido_id} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAbertoDetalhe(abertoDetalhe === o.pedido_id ? null : o.pedido_id)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${COR_PRIORIDADE[o.prioridade]}`}>
                      {o.prioridade_legivel}
                    </span>
                    <span className="text-xs font-bold text-slate-800 truncate">{o.doente_nome}</span>
                    <span className="text-xs text-slate-500 truncate">{o.descricao}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono font-bold text-slate-700">{o.score}/100</span>
                    {abertoDetalhe === o.pedido_id ? (
                      <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    )}
                  </div>
                </button>
                {abertoDetalhe === o.pedido_id && (
                  <div className="border-t border-slate-100 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 flex items-start gap-2">
                    <Info className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p>{o.detalhe}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {o.especialidade_destino_legivel} · Prazo limite: {dataPT(o.prazo_limite)} · Criado em {dataHoraPT(o.criado_em)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
