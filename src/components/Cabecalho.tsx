import { NavLink } from "react-router-dom";
import { useState } from "react";
import { usePerfil } from "../lib/PerfilContext";
import { apiPost } from "../lib/api";
import {
  Stethoscope,
  RotateCcw,
  CheckCircle,
  Activity,
  Layers,
  FileCheck2,
  BookOpen,
  Filter,
  Inbox,
  Building2,
  BarChart3,
  HelpCircle,
  UserCheck,
} from "lucide-react";

export interface ItemNav {
  caminho: string;
  etiqueta: string;
}

const ICONES_NAV: Record<string, React.ElementType> = {
  "/": Activity,
  "/oasis/medico": Stethoscope,
  "/oasis/agendas": Layers,
  "/validacao": FileCheck2,
  "/dicionario": BookOpen,
  "/triagem": Filter,
  "/meus-pedidos": Inbox,
  "/servico": Building2,
  "/gestao": BarChart3,
  "/guiao": HelpCircle,
};

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
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-2xs">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        {/* Marca & Identidade */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-oasis-header text-white font-black text-sm tracking-wider shadow-sm">
            O2
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-sm tracking-tight">OASIS 2.0</span>
              <span className="rounded bg-sky-100 px-1.5 py-0.2 text-[10px] font-bold text-sky-800">
                IA Clínica
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-none">Gestão Inteligente Pós-Consulta</p>
          </div>
        </div>

        {/* Navegação Principal */}
        <nav className="flex flex-1 flex-wrap items-center justify-center gap-1 px-2">
          {itens.map((item) => {
            const Icone = ICONES_NAV[item.caminho] || Activity;
            return (
              <NavLink
                key={item.caminho}
                to={item.caminho}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-oasis-header text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`
                }
              >
                <Icone className="h-3.5 w-3.5" />
                <span>{item.etiqueta}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Perfil Ativo & Ações */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
            <UserCheck className="h-3.5 w-3.5 text-oasis-header shrink-0" />
            <select
              aria-label="Perfil do Utilizador"
              className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              value={utilizadorId}
              disabled={aCarregar}
              onChange={(e) => definirUtilizadorId(e.target.value)}
            >
              {utilizadores.map((u) => (
                <option key={u.utilizador_id} value={u.utilizador_id}>
                  {u.nome} ({u.perfil})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={reporDemo}
            disabled={aRepor}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 shadow-2xs transition-colors"
            title="Repor a base de dados para o estado inicial da demonstração"
          >
            <RotateCcw className={`h-3 w-3 ${aRepor ? "animate-spin" : ""}`} />
            <span>{aRepor ? "A repor…" : "Repor"}</span>
          </button>

          {mensagem && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 animate-in fade-in">
              <CheckCircle className="h-3.5 w-3.5" />
              <span>{mensagem}</span>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
