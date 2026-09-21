import { NavLink } from "react-router-dom";
import { useState } from "react";
import { usePerfil } from "../lib/PerfilContext";
import { apiPost } from "../lib/api";

export interface ItemNav {
  caminho: string;
  etiqueta: string;
}

export function Cabecalho({ itens }: { itens: ItemNav[] }) {
  const { utilizadores, utilizadorId, definirUtilizadorId, aCarregar } = usePerfil();
  const [aRepor, setARepor] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function reporDemo() {
    setARepor(true);
    setMensagem(null);
    try {
      await apiPost("/repor-demo");
      setMensagem("Dados repostos.");
    } catch (erro) {
      setMensagem(erro instanceof Error ? erro.message : "Falha ao repor a demo.");
    } finally {
      setARepor(false);
      setTimeout(() => setMensagem(null), 4000);
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-300 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2">
        <span className="font-semibold text-slate-700">Pedidos pós-consulta</span>
        <nav className="flex flex-1 flex-wrap gap-1">
          {itens.map((item) => (
            <NavLink
              key={item.caminho}
              to={item.caminho}
              className={({ isActive }) =>
                `rounded px-2 py-1 text-sm ${
                  isActive ? "bg-oasis-header text-white" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              {item.etiqueta}
            </NavLink>
          ))}
        </nav>
        <select
          aria-label="Perfil"
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          value={utilizadorId}
          disabled={aCarregar}
          onChange={(e) => definirUtilizadorId(e.target.value)}
        >
          {utilizadores.map((u) => (
            <option key={u.utilizador_id} value={u.utilizador_id}>
              {u.nome} — {u.perfil}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={reporDemo}
          disabled={aRepor}
          className="rounded bg-slate-700 px-3 py-1 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {aRepor ? "A repor…" : "Repor demo"}
        </button>
        {mensagem && <span className="text-xs text-slate-500">{mensagem}</span>}
      </div>
    </header>
  );
}
