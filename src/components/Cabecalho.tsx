import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { EVENTO_INSTANCIA, apiPost } from "../lib/api";
import { usePerfil } from "../lib/PerfilContext";
import { TrocadorUtilizador } from "./TrocadorUtilizador";
import { PainelNotificacoes } from "./PainelNotificacoes";
import { ITENS_INICIO, NAV_POR_PERFIL, type ItemNav } from "../lib/navegacao";
import {
  Stethoscope,
  RotateCcw,
  AlertTriangle,
  Activity,
  Layers,
  Filter,
  Inbox,
  Building2,
  BarChart3,
  HelpCircle,
  Wrench,
  Settings2,
} from "lucide-react";

const ICONES_NAV: Record<string, React.ElementType> = {
  "/": Activity,
  "/oasis/medico": Stethoscope,
  "/oasis/agendas": Layers,
  "/triagem": Filter,
  "/meus-pedidos": Inbox,
  "/servico": Building2,
  "/tecnico": Wrench,
  "/gestao": BarChart3,
  "/guiao": HelpCircle,
  "/definicoes": Settings2,
};

const ITEM_GUIAO: ItemNav = { caminho: "/guiao", etiqueta: "Guião" };

export function Cabecalho() {
  const { utilizador } = usePerfil();
  const [aRepor, setARepor] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const itens = utilizador ? NAV_POR_PERFIL[utilizador.perfil] ?? ITENS_INICIO : ITENS_INICIO;
  // O estado vive na memória do servidor: se ele reiniciar (ou houver mais de uma instância), avisa.
  const [outraInstancia, setOutraInstancia] = useState(false);
  useEffect(() => {
    const f = () => setOutraInstancia(true);
    window.addEventListener(EVENTO_INSTANCIA, f);
    return () => window.removeEventListener(EVENTO_INSTANCIA, f);
  }, []);

  async function reporDemo() {
    setARepor(true);
    setMensagem(null);
    try {
      await apiPost("/repor-demo");
      // A página aberta tem dados antigos em memória: recarregar para não mostrar estado fantasma.
      window.location.reload();
    } catch (erro) {
      setMensagem(erro instanceof Error ? erro.message : "Falha ao repor a demo.");
    } finally {
      setARepor(false);
      setTimeout(() => setMensagem(null), 4000);
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-2xs">
      {outraInstancia && (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-900">
          O servidor reiniciou ou está a correr em mais de uma instância: os dados podem não coincidir entre ecrãs. Carregue em "Repor
          demo" — e, no Cloud Run, use 1 instância (mínimo e máximo).
        </div>
      )}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        {/* Marca & Identidade */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-oasis-header text-white font-black text-sm tracking-wider shadow-sm">
            IPO
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-sm tracking-tight">IPO-2030</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-none">Servir é dever</p>
          </div>
        </div>

        {/* Navegação — específica do perfil activo (o Guião fica sempre visível, à parte) */}
        <nav className="-mx-4 order-last flex w-full items-center gap-1 overflow-x-auto px-4 pb-1 md:order-none md:mx-0 md:w-auto md:flex-1 md:justify-center md:overflow-visible md:px-2 md:pb-0">
          {itens.map((item) => {
            const Icone = ICONES_NAV[item.caminho] || Activity;
            return (
              <NavLink
                key={item.caminho}
                to={item.caminho}
                className={({ isActive }) =>
                  `inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
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

          <span className="mx-1.5 h-4 w-px shrink-0 bg-slate-200" aria-hidden="true" />

          <NavLink
            to={ITEM_GUIAO.caminho}
            title="Guião da demonstração — orquestra a troca de perfis para apresentar o sistema todo"
            className={({ isActive }) =>
              `inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                isActive
                  ? "border-amber-400 bg-amber-500 text-white shadow-2xs"
                  : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
              }`
            }
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>{ITEM_GUIAO.etiqueta}</span>
          </NavLink>
        </nav>

        {/* Perfil Ativo, Notificações & Ações */}
        <div className="flex items-center gap-2">
          <PainelNotificacoes />
          <TrocadorUtilizador />

          <button
            type="button"
            onClick={reporDemo}
            disabled={aRepor}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 shadow-2xs transition-colors"
            title="Repor a base de dados para o estado inicial da demonstração"
          >
            <RotateCcw className={`h-3 w-3 ${aRepor ? "animate-spin" : ""}`} />
            <span>{aRepor ? "A repor…" : "Repor demo"}</span>
          </button>

          {mensagem && (
            <span className="flex items-center gap-1 text-xs font-medium text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{mensagem}</span>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
