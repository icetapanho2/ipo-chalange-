import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { dataPT } from "../../lib/datas";
import { ArrowDown, ArrowUp, RotateCcw, Save, Settings2 } from "lucide-react";

type Variaveis = Record<string, number>;

interface LinhaFila {
  pedido_id: string;
  doente_nome: string;
  prioridade: string;
  estadio: string;
  prazo_limite: string;
  indice: number;
  parcelas: { rotulo: string; pontos: number }[];
}

interface RespostaIndice {
  especialidade_legivel: string;
  variaveis: Variaveis;
  omissao: Variaveis;
  personalizado: boolean;
  fila: LinhaFila[];
}

interface Pesos {
  urgencia: number;
  tipo: number;
  paciente: number;
}

/** Cada termo da equação, com as variáveis que o compõem e o que significam. */
const TERMOS: { titulo: string; explicacao: string; campos: { chave: string; rotulo: string; passo?: number }[] }[] = [
  {
    titulo: "Nível de prioridade",
    explicacao: "Pontos de partida conforme o nível atribuído ao pedido.",
    campos: [
      { chave: "nivel_mp", rotulo: "Muito prioritário" },
      { chave: "nivel_p", rotulo: "Prioritário" },
      { chave: "nivel_n", rotulo: "Normal" },
    ],
  },
  {
    titulo: "Proximidade do prazo",
    explicacao: "Quanto mais perto do prazo, mais pontos; fora do prazo soma por cada dia de atraso.",
    campos: [
      { chave: "prazo_max", rotulo: "No último dia" },
      { chave: "prazo_por_dia", rotulo: "Menos por dia de folga" },
      { chave: "fora_prazo_por_dia", rotulo: "Mais por dia fora" },
      { chave: "fora_prazo_max", rotulo: "Máximo fora do prazo" },
    ],
  },
  {
    titulo: "Estádio do doente",
    explicacao: "Quem está à espera de diagnóstico ou a meio de um tratamento passa à frente.",
    campos: [
      { chave: "diagnostico", rotulo: "Novo ou diagnóstico" },
      { chave: "tratamento", rotulo: "Tratamento" },
    ],
  },
  {
    titulo: "Score clínico",
    explicacao: "Score de 0 a 100 calculado quando o pedido é criado (ver pesos abaixo), multiplicado por este peso.",
    campos: [{ chave: "score_clinico_peso", rotulo: "Peso (×)", passo: 0.1 }],
  },
  {
    titulo: "Remarcações já sofridas",
    explicacao: "Quem o hospital já remarcou não deve voltar a ficar para trás.",
    campos: [
      { chave: "remarcacao_por", rotulo: "Por remarcação" },
      { chave: "remarcacao_max", rotulo: "Máximo" },
    ],
  },
  {
    titulo: "Tempo de espera",
    explicacao: "Desempate a favor de quem pediu há mais tempo.",
    campos: [
      { chave: "espera_por_dia", rotulo: "Por dia", passo: 0.5 },
      { chave: "espera_max", rotulo: "Máximo" },
    ],
  },
];

const COR_NIVEL: Record<string, string> = { MP: "bg-rose-100 text-rose-800", P: "bg-amber-100 text-amber-800", N: "bg-slate-100 text-slate-700" };

/**
 * Definições do serviço: a equação do índice de prioridade com as variáveis deste serviço. A
 * pré-visualização mostra a fila reordenada antes de guardar; guardar recalcula o índice de todos os
 * pedidos do serviço (é o índice que decide a ordem numa avaria, numa vaga libertada e na fila).
 */
export function EquacaoPrioridade({ aoMudar }: { aoMudar?: (mensagem: string) => void }) {
  const [dados, setDados] = useState<RespostaIndice | null>(null);
  const [form, setForm] = useState<Variaveis | null>(null);
  const [previsao, setPrevisao] = useState<LinhaFila[] | null>(null);
  const [pesos, setPesos] = useState<Pesos | null>(null);
  const [pesosPersonalizados, setPesosPersonalizados] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout>>();

  function carregar() {
    apiGet<RespostaIndice>("/servico/indice")
      .then((r) => {
        setDados(r);
        setForm(r.variaveis);
        setPrevisao(null);
      })
      .catch((e) => setErro(String(e)));
    apiGet<{ pesos: Pesos; personalizado: boolean }>("/servico/prioridade").then((r) => {
      setPesos(r.pesos);
      setPesosPersonalizados(r.personalizado);
    });
  }
  useEffect(carregar, []);

  const alterado = !!(dados && form && Object.keys(form).some((k) => form[k] !== dados.variaveis[k]));

  // Pré-visualização com as variáveis do formulário (sem guardar), com um pequeno atraso ao escrever.
  useEffect(() => {
    if (!form || !alterado) {
      setPrevisao(null);
      return;
    }
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      apiPost<{ fila: LinhaFila[] }>("/servico/indice/simular", form)
        .then((r) => setPrevisao(r.fila))
        .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
    }, 300);
    return () => clearTimeout(temporizador.current);
  }, [form, alterado]);

  async function guardar() {
    if (!form) return;
    setErro(null);
    setAGuardar(true);
    try {
      await apiPost("/servico/indice", form);
      carregar();
      aoMudar?.("Equação guardada: o índice de todos os pedidos do serviço foi recalculado.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAGuardar(false);
    }
  }

  async function repor() {
    setErro(null);
    try {
      await apiPost("/servico/indice/repor", {});
      if (pesosPersonalizados) await apiPost("/servico/prioridade/repor", {});
      carregar();
      aoMudar?.("Equação reposta com os valores por omissão.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function guardarPesos() {
    if (!pesos) return;
    try {
      await apiPost("/servico/prioridade/pesos", pesos);
      setPesosPersonalizados(true);
      aoMudar?.("Pesos do score clínico guardados (aplicam-se aos pedidos novos).");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  if (!dados || !form) return <p className="mt-5 text-sm text-slate-500">A carregar…</p>;

  const filaMostrada = previsao ?? dados.fila;
  const posicaoActual = new Map(dados.fila.map((l, i) => [l.pedido_id, i]));
  const somaPesos = pesos ? pesos.urgencia + pesos.tipo + pesos.paciente || 1 : 1;

  return (
    <div className="mt-5 space-y-4">
      {erro && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <Settings2 className="h-4 w-4 text-oasis-accent" /> Equação de prioridade — {dados.especialidade_legivel}
              {dados.personalizado && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">personalizada</span>}
            </h2>
            <p className="mt-1 max-w-3xl text-xs text-slate-600">
              <strong>Índice = nível + prazo + estádio + score clínico + remarcações sofridas + espera.</strong> É o índice que decide quem escolhe primeiro
              numa avaria ou ausência, a quem se oferece uma vaga libertada e a ordem da fila. Só se aplica a este serviço e nunca muda uma
              marcação sozinho.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={repor}
              disabled={!dados.personalizado && !pesosPersonalizados}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Valores por omissão
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={!alterado || aGuardar}
              className="inline-flex items-center gap-1.5 rounded-lg bg-oasis-header px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" /> {aGuardar ? "A guardar…" : "Guardar e recalcular"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* Variáveis */}
        <div className="space-y-3">
          {TERMOS.map((t) => (
            <div key={t.titulo} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-bold text-slate-800">{t.titulo}</div>
              <div className="mb-2 text-[11px] text-slate-500">{t.explicacao}</div>
              <div className="flex flex-wrap gap-3">
                {t.campos.map((c) => {
                  const mudou = form[c.chave] !== dados.omissao[c.chave];
                  return (
                    <label key={c.chave} className="text-[11px] text-slate-600">
                      <span className="mb-0.5 block">{c.rotulo}</span>
                      <input
                        type="number"
                        min={0}
                        step={c.passo ?? 1}
                        value={form[c.chave]}
                        onChange={(e) => setForm({ ...form, [c.chave]: Math.max(0, Number(e.target.value) || 0) })}
                        className={`w-24 rounded border px-2 py-1 text-sm font-semibold ${
                          mudou ? "border-indigo-400 bg-indigo-50 text-indigo-900" : "border-slate-300 text-slate-800"
                        }`}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {pesos && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-bold text-slate-800">Composição do score clínico</div>
              <div className="mb-2 text-[11px] text-slate-500">
                O score de cada pedido novo combina estes três factores (normalizados para 100%). Os pedidos já criados mantêm o seu score.
              </div>
              {(
                [
                  { chave: "urgencia" as const, titulo: "Urgência clínica / prazo" },
                  { chave: "tipo" as const, titulo: "Tipo de pedido" },
                  { chave: "paciente" as const, titulo: "Perfil clínico do doente" },
                ]
              ).map((f) => (
                <div key={f.chave} className="mb-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">{f.titulo}</span>
                    <span className="font-mono font-bold text-slate-800">{Math.round((pesos[f.chave] / somaPesos) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(pesos[f.chave] * 100)}
                    onChange={(e) => setPesos({ ...pesos, [f.chave]: Number(e.target.value) / 100 })}
                    className="w-full"
                  />
                </div>
              ))}
              <button type="button" onClick={guardarPesos} className="mt-1 rounded border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                Guardar pesos do score
              </button>
            </div>
          )}
        </div>

        {/* Pré-visualização da fila */}
        <div className="h-fit rounded-xl border border-slate-200 bg-white p-3 lg:sticky lg:top-20">
          <div className="text-xs font-bold text-slate-800">{previsao ? "Fila com os novos valores (pré-visualização)" : "Fila actual do serviço"}</div>
          <div className="mb-2 text-[11px] text-slate-500">
            {previsao ? "Ainda não foi guardado. As setas mostram quem sobe ou desce face à ordem actual." : "Altere um valor para ver a fila reordenada antes de guardar."}
          </div>
          <ol className="divide-y divide-slate-100">
            {filaMostrada.map((l, i) => {
              const antes = posicaoActual.get(l.pedido_id);
              const delta = previsao && antes !== undefined ? antes - i : 0;
              return (
                <li key={l.pedido_id} className="flex items-center gap-2 py-1.5 text-xs" title={l.parcelas.map((p) => `${p.rotulo}: ${p.pontos}`).join(" · ")}>
                  <span className="w-5 text-right font-mono text-slate-400">{i + 1}</span>
                  <span className="w-6">
                    {delta > 0 && (
                      <span className="flex items-center text-[10px] font-bold text-emerald-700">
                        <ArrowUp className="h-3 w-3" />
                        {delta}
                      </span>
                    )}
                    {delta < 0 && (
                      <span className="flex items-center text-[10px] font-bold text-rose-700">
                        <ArrowDown className="h-3 w-3" />
                        {-delta}
                      </span>
                    )}
                  </span>
                  <span className="flex-1 truncate">
                    <span className="font-semibold text-slate-800">{l.doente_nome}</span>
                    <span className="text-slate-500"> · {l.estadio} · prazo {dataPT(l.prazo_limite)}</span>
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${COR_NIVEL[l.prioridade] ?? ""}`}>{l.prioridade}</span>
                  <span className="w-10 text-right font-mono font-bold text-slate-800">{l.indice}</span>
                </li>
              );
            })}
          </ol>
          {filaMostrada.length === 0 && <p className="text-xs text-slate-400">Sem pedidos activos no serviço.</p>}
        </div>
      </div>
    </div>
  );
}
