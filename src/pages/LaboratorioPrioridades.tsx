import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api";
import { PorqueEstaEscolha, type CandidatoTroca } from "../components/PorqueEstaEscolha";
import { ArrowLeft, FlaskConical, RotateCcw, ArrowRight } from "lucide-react";

interface Cenario {
  pedido_id: string;
  titulo: string;
  estado: string;
}

type Pesos = Record<string, number>;

interface RespostaSimulacao {
  origem: string;
  pesos: Pesos;
  candidatos: CandidatoTroca[];
  escolhido: string;
  escolhido_original: string;
  escolhido_regra_antiga: string;
}

type Sobreposicao = Partial<Pick<CandidatoTroca, "idade" | "distancia_km" | "contacto_digital" | "transporte_nao_urgente" | "dia_agrupado" | "estadio_cuidado" | "remarcacoes_hospital">>;

const ROTULO_PESO: Record<string, string> = {
  custo_idade_75: "75 anos ou mais",
  custo_sem_contacto_digital: "Sem telemóvel nem email",
  custo_distancia_50km: "Mora a 50 km ou mais",
  custo_distancia_150km: "Mora a 150 km ou mais",
  custo_transporte: "Transporte não urgente",
  custo_dia_agrupado: "Outra marcação no mesmo dia",
  custo_estadio_novo: "Em diagnóstico",
  bonus_folga_max: "Desconto máximo pela folga",
  max_remarcacoes_hospital: "Remarcações a partir das quais nunca mais cede",
};

/**
 * Laboratório de prioridades: para o júri/direcção mexer nas regras e ver a decisão mudar na hora.
 * Usa exactamente a mesma função que o motor (avaliarFactos) e NUNCA altera o estado.
 */
export function LaboratorioPrioridades() {
  const [cenarios, setCenarios] = useState<Cenario[]>([]);
  const [pedidoId, setPedidoId] = useState("P00007");
  const [pesosBase, setPesosBase] = useState<Pesos>({});
  const [pesos, setPesos] = useState<Pesos>({});
  const [sobreposicoes, setSobreposicoes] = useState<Record<string, Sobreposicao>>({});
  const [resultado, setResultado] = useState<RespostaSimulacao | null>(null);
  const [base, setBase] = useState<RespostaSimulacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ cenarios: Cenario[]; pesos: Pesos }>("/prioridades/cenarios").then((r) => {
      setCenarios(r.cenarios);
      setPesosBase(r.pesos);
      setPesos(r.pesos);
      if (r.cenarios.length && !r.cenarios.some((c) => c.pedido_id === pedidoId)) setPedidoId(r.cenarios[0].pedido_id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiPost<RespostaSimulacao>("/prioridades/simular", { pedidoId })
      .then((r) => {
        setBase(r);
        setErro(null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
    setSobreposicoes({});
  }, [pedidoId]);

  useEffect(() => {
    const t = setTimeout(() => {
      apiPost<RespostaSimulacao>("/prioridades/simular", { pedidoId, sobreposicoes, pesos })
        .then(setResultado)
        .catch(() => undefined);
    }, 150);
    return () => clearTimeout(t);
  }, [pedidoId, sobreposicoes, pesos]);

  // Os doentes que vale a pena editar: os elegíveis e os excluídos por regra de prioridade.
  const editaveis = useMemo(
    () => (base?.candidatos ?? []).filter((c) => !c.excluido || !c.motivo_exclusao.startsWith("faltam")).slice(0, 6),
    [base],
  );

  function sobrepor(doenteId: string, campo: keyof Sobreposicao, valor: unknown) {
    setSobreposicoes((s) => ({ ...s, [doenteId]: { ...s[doenteId], [campo]: valor } }));
  }

  function valor<K extends keyof Sobreposicao>(c: CandidatoTroca, campo: K): CandidatoTroca[K] {
    return (sobreposicoes[c.doente_id]?.[campo] as CandidatoTroca[K]) ?? c[campo];
  }

  const mudou = resultado && resultado.escolhido !== resultado.escolhido_original;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Link to="/gestao" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-oasis-header">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar à Gestão
      </Link>
      <div className="border-b border-slate-200 pb-4">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          <FlaskConical className="h-5 w-5 text-indigo-600" />
          Laboratório de prioridades
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          O TAC está cheio e um doente urgente precisa de uma vaga. Quem a deve ceder? Altere os dados dos doentes ou o peso de cada regra e veja
          a decisão mudar — é a mesma função que o sistema usa para decidir. Nada aqui altera marcações reais.
        </p>
        <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">Dados simulados</span>
      </div>

      {erro && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <label className="font-semibold text-slate-600">Cenário:</label>
        <select value={pedidoId} onChange={(e) => setPedidoId(e.target.value)} className="rounded border border-slate-300 px-2 py-1">
          {cenarios.map((c) => (
            <option key={c.pedido_id} value={c.pedido_id}>
              {c.titulo} ({c.estado.toLowerCase()})
            </option>
          ))}
        </select>
        {resultado && <span className="text-slate-400">{resultado.origem}</span>}
      </div>

      {resultado && (
        <div className={`mt-4 rounded-xl border p-4 ${mudou ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">Cede a vaga:</span>
            {mudou && (
              <>
                <span className="text-slate-400 line-through">{resultado.escolhido_original}</span>
                <ArrowRight className="h-4 w-4 text-amber-600" />
              </>
            )}
            <span className={`text-lg font-bold ${mudou ? "text-amber-800" : "text-emerald-800"}`}>{resultado.escolhido || "ninguém (sem vaga)"}</span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Pela regra antiga (só folga até ao prazo) seria: <strong>{resultado.escolhido_regra_antiga || "—"}</strong>
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">Mexer nos doentes</h2>
            <button
              type="button"
              onClick={() => setSobreposicoes({})}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
            >
              <RotateCcw className="h-3 w-3" /> Repor
            </button>
          </div>
          <div className="space-y-3">
            {editaveis.map((c) => (
              <div key={c.doente_id} className="rounded-lg border border-slate-100 p-2.5 text-xs">
                <div className="mb-1.5 font-semibold text-slate-800">{c.doente_nome}</div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-slate-600">
                  <label className="flex items-center gap-1">
                    Idade
                    <input
                      type="number"
                      value={valor(c, "idade")}
                      onChange={(e) => sobrepor(c.doente_id, "idade", Number(e.target.value))}
                      className="w-14 rounded border border-slate-300 px-1 py-0.5"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    km
                    <input
                      type="number"
                      value={valor(c, "distancia_km")}
                      onChange={(e) => sobrepor(c.doente_id, "distancia_km", Number(e.target.value))}
                      className="w-16 rounded border border-slate-300 px-1 py-0.5"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    Contacto
                    <select
                      value={valor(c, "contacto_digital")}
                      onChange={(e) => sobrepor(c.doente_id, "contacto_digital", e.target.value)}
                      className="rounded border border-slate-300 px-1 py-0.5"
                    >
                      <option value="SMS">SMS</option>
                      <option value="EMAIL">Email</option>
                      <option value="NENHUM">Nenhum</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1">
                    Estádio
                    <select
                      value={valor(c, "estadio_cuidado")}
                      onChange={(e) => sobrepor(c.doente_id, "estadio_cuidado", e.target.value)}
                      className="rounded border border-slate-300 px-1 py-0.5"
                    >
                      <option value="NOVO">Novo</option>
                      <option value="PRE_TRATAMENTO">Diagnóstico</option>
                      <option value="EM_TRATAMENTO">Tratamento</option>
                      <option value="FOLLOW_UP">Follow-up</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1">
                    Remarcações
                    <input
                      type="number"
                      min={0}
                      value={valor(c, "remarcacoes_hospital")}
                      onChange={(e) => sobrepor(c.doente_id, "remarcacoes_hospital", Number(e.target.value))}
                      className="w-12 rounded border border-slate-300 px-1 py-0.5"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={!!valor(c, "dia_agrupado")}
                      onChange={(e) => sobrepor(c.doente_id, "dia_agrupado", e.target.checked)}
                    />
                    Outra marcação no dia
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={!!valor(c, "transporte_nao_urgente")}
                      onChange={(e) => sobrepor(c.doente_id, "transporte_nao_urgente", e.target.checked)}
                    />
                    Transporte
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">Peso de cada regra</h2>
            <button
              type="button"
              onClick={() => setPesos(pesosBase)}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
            >
              <RotateCcw className="h-3 w-3" /> Repor
            </button>
          </div>
          <div className="space-y-2">
            {Object.keys(ROTULO_PESO).map((k) => (
              <label key={k} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                <span>{ROTULO_PESO[k]}</span>
                <input
                  type="number"
                  value={pesos[k] ?? 0}
                  onChange={(e) => setPesos((p) => ({ ...p, [k]: Number(e.target.value) }))}
                  className="w-14 rounded border border-slate-300 px-1 py-0.5 text-right"
                />
              </label>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-slate-400">Valores definidos pela direcção clínica em parametros.csv (aqui só se simula).</p>
        </div>
      </div>

      {resultado && (
        <div className="mt-4">
          <PorqueEstaEscolha candidatos={resultado.candidatos} aberto />
        </div>
      )}
    </div>
  );
}
