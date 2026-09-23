import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { apiGet, apiPost } from "../lib/api";

interface Definicoes {
  assistente_plano: boolean;
  abreviaturas: { termo: string; significado: string }[];
}

/** Definições do médico: o assistente que lê o "P/" do diário e pré-selecciona os pedidos. */
export function DefinicoesMedico() {
  const [dados, setDados] = useState<Definicoes | null>(null);
  const [verAbreviaturas, setVerAbreviaturas] = useState(false);

  useEffect(() => {
    apiGet<Definicoes>("/oasis/medico/definicoes").then(setDados).catch(() => undefined);
  }, []);

  async function mudar(ligado: boolean) {
    const r = await apiPost<{ assistente_plano: boolean }>("/oasis/medico/definicoes", { assistente_plano: ligado });
    setDados((d) => (d ? { ...d, assistente_plano: r.assistente_plano } : d));
  }

  if (!dados) return <p className="px-4 py-6 text-sm text-slate-500">A carregar…</p>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-bold text-slate-800">Definições</h1>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4" data-tour="definicao-assistente">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <Sparkles className="h-4 w-4 text-oasis-accent" /> Assistente de pedidos
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Quando o diário tem um plano escrito depois de <strong>P/</strong> (por exemplo{" "}
              <span className="font-mono">P/ TC TAP c/ contraste; ana c/ marcadores; rev c/ exames comigo</span>), o assistente lê-o e, no ecrã
              seguinte, os pedidos já vêm pré-seleccionados e preenchidos. Pode sempre alterar ou retirar o que quiser — nada segue sem a sua
              confirmação. O que não perceber, diz; nunca adivinha.
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              role="switch"
              className="peer sr-only"
              checked={dados.assistente_plano}
              onChange={(e) => mudar(e.target.checked)}
            />
            <span className="relative h-5 w-9 rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-emerald-600 peer-checked:after:translate-x-4" />
            {dados.assistente_plano ? "Ligado" : "Desligado"}
          </label>
        </div>

        <button type="button" onClick={() => setVerAbreviaturas((v) => !v)} className="mt-3 text-xs font-semibold text-oasis-accent hover:underline">
          {verAbreviaturas ? "Esconder" : "Ver"} as abreviaturas que o assistente conhece ({dados.abreviaturas.length})
        </button>
        {verAbreviaturas && (
          <div className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            {dados.abreviaturas.map((a) => (
              <div key={a.termo} className="flex gap-2 border-b border-slate-100 py-1">
                <span className="w-28 shrink-0 font-mono font-semibold text-slate-800">{a.termo}</span>
                <span className="text-slate-600">{a.significado}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
