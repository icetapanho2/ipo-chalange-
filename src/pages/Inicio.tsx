import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";

interface Estado {
  demoDate: string;
  contagens: Record<string, number>;
}

export function Inicio() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Estado>("/estado").then(setEstado).catch((e) => setErro(String(e)));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-800">MVP Pedidos pós-consulta (Oasis 2.0)</h1>
      <p className="mt-1 text-sm text-slate-500">Demo com dados simulados. Data de hoje: {estado?.demoDate ?? "…"}</p>
      {erro && <p className="mt-4 text-red-600">{erro}</p>}
      {estado && (
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(estado.contagens).map(([chave, valor]) => (
            <div key={chave} className="rounded border border-slate-200 bg-white p-3">
              <dt className="text-xs uppercase tracking-wide text-slate-400">{chave}</dt>
              <dd className="text-lg font-semibold text-slate-700">{valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
