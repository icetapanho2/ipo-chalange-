import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";

interface EntradaDicionario {
  termo: string;
  significado: string;
  mapeia_para: string;
  ambito: string;
  ambito_legivel: string;
  origem: string;
  ocorrencias: number;
  estado: string;
  aprendido: boolean;
}

export function Dicionario() {
  const [entradas, setEntradas] = useState<EntradaDicionario[] | null>(null);
  const [soAprendidos, setSoAprendidos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiGet<EntradaDicionario[]>("/dicionario").then(setEntradas).catch((e) => setErro(String(e)));
  }, []);

  const visiveis = entradas?.filter((e) => !soAprendidos || e.aprendido) ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-lg font-semibold text-slate-800">Dicionário</h1>
      <p className="mt-1 text-sm text-slate-500">
        Termos globais e aprendidos por correcções dos médicos. O sistema aprende de forma visível e reversível.
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={soAprendidos} onChange={(e) => setSoAprendidos(e.target.checked)} />
        Mostrar só os aprendidos
      </label>

      {erro && <p className="mt-3 text-red-600">{erro}</p>}

      <table className="mt-4 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-xs uppercase text-slate-500">
            <th className="py-1 pr-2">Termo</th>
            <th className="py-1 pr-2">Significado</th>
            <th className="py-1 pr-2">Âmbito</th>
            <th className="py-1 pr-2">Origem</th>
            <th className="py-1 pr-2">Ocorrências</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((e, i) => (
            <tr key={`${e.termo}-${e.ambito}-${i}`} className="border-b border-slate-100">
              <td className="py-1 pr-2 font-medium">{e.termo}</td>
              <td className="py-1 pr-2">{e.significado}</td>
              <td className="py-1 pr-2">{e.ambito_legivel}</td>
              <td className="py-1 pr-2">
                {e.aprendido ? <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-700">aprendido</span> : "inicial"}
              </td>
              <td className="py-1 pr-2 tabular-nums">{e.ocorrencias}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {visiveis.length === 0 && <p className="mt-4 text-slate-500">Sem entradas para mostrar.</p>}
    </div>
  );
}
