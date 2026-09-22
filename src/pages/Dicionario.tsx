import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api";
import { usePerfil } from "../lib/PerfilContext";
import { BookOpen, Globe2, User } from "lucide-react";

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
  const { utilizadores, utilizador } = usePerfil();
  const [entradas, setEntradas] = useState<EntradaDicionario[] | null>(null);
  const [soAprendidos, setSoAprendidos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Ficha por médico: por omissão mostra a do utilizador actual (se for médico), senão "Todos".
  const [medicoId, setMedicoId] = useState<string>("TODOS");

  useEffect(() => {
    apiGet<EntradaDicionario[]>("/dicionario").then(setEntradas).catch((e) => setErro(String(e)));
  }, []);

  useEffect(() => {
    if (utilizador?.e_medico) setMedicoId(utilizador.utilizador_id);
  }, [utilizador?.utilizador_id, utilizador?.e_medico]);

  const medicos = useMemo(() => utilizadores.filter((u) => u.e_medico), [utilizadores]);

  const visiveis = useMemo(() => {
    let lista = entradas ?? [];
    if (medicoId !== "TODOS") {
      lista = lista.filter((e) => e.ambito === "GLOBAL" || e.ambito === medicoId);
    }
    if (soAprendidos) lista = lista.filter((e) => e.aprendido);
    return lista;
  }, [entradas, medicoId, soAprendidos]);

  const medicoSelecionado = medicos.find((m) => m.utilizador_id === medicoId);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-oasis-accent" />
        <h1 className="text-lg font-semibold text-slate-800">Dicionário</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Termos globais (partilhados por todo o hospital) e termos aprendidos por correcções de cada médico — a
        ficha de cada médico é adaptada automaticamente: quando a administrativa corrige um termo, essa correcção
        fica associada ao médico que fez o pedido e passa a ser reconhecida da próxima vez que ele a usar.
      </p>

      {/* Ficha por médico */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">Ficha do médico</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setMedicoId("TODOS")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              medicoId === "TODOS"
                ? "border-oasis-header bg-oasis-header text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Globe2 className="h-3 w-3" />
            <span>Todos / Global</span>
          </button>
          {medicos.map((m) => (
            <button
              key={m.utilizador_id}
              type="button"
              onClick={() => setMedicoId(m.utilizador_id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                medicoId === m.utilizador_id
                  ? "border-oasis-header bg-oasis-header text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <User className="h-3 w-3" />
              <span>{m.nome}</span>
            </button>
          ))}
        </div>
        {medicoSelecionado && (
          <p className="mt-2 text-[11px] text-slate-500">
            A mostrar os termos globais + os que foram aprendidos especificamente para {medicoSelecionado.nome}.
          </p>
        )}
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={soAprendidos} onChange={(e) => setSoAprendidos(e.target.checked)} />
        Mostrar só os aprendidos
      </label>

      {erro && <p className="mt-3 text-red-600">{erro}</p>}
      {!entradas && !erro && <p className="mt-4 text-slate-500">A carregar…</p>}

      {entradas && (
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-xs uppercase text-slate-500">
              <th className="py-1 pr-2">Termo</th>
              <th className="py-1 pr-2">Significado</th>
              <th className="py-1 pr-2">Ficha</th>
              <th className="py-1 pr-2">Origem</th>
              <th className="py-1 pr-2">Ocorrências</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((e, i) => (
              <tr key={`${e.termo}-${e.ambito}-${i}`} className="border-b border-slate-100">
                <td className="py-1 pr-2 font-medium">{e.termo}</td>
                <td className="py-1 pr-2">{e.significado}</td>
                <td className="py-1 pr-2">
                  {e.ambito === "GLOBAL" ? (
                    <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-sky-700">
                      <Globe2 className="h-3 w-3" />
                      Global
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                      <User className="h-3 w-3" />
                      {e.ambito_legivel}
                    </span>
                  )}
                </td>
                <td className="py-1 pr-2">
                  {e.aprendido ? <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-700">aprendido</span> : "inicial"}
                </td>
                <td className="py-1 pr-2 tabular-nums">{e.ocorrencias}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {entradas && visiveis.length === 0 && <p className="mt-4 text-slate-500">Sem entradas para mostrar.</p>}
    </div>
  );
}
