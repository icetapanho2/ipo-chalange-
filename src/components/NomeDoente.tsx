import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, X } from "lucide-react";
import { FichaDoente } from "./FichaDoente";

const EVENTO = "oasis:abrir-doente";

/** Abre a ficha do doente no painel lateral (de qualquer sítio da aplicação). */
export function abrirDoente(doenteId: string) {
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: doenteId }));
}

/** Nome de doente clicável: abre a ficha sem sair da página onde se está. */
export function NomeDoente({ id, nome, className = "" }: { id?: string; nome: string; className?: string }) {
  if (!id) return <span className={className}>{nome}</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        abrirDoente(id);
      }}
      className={`text-left underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-oasis-accent hover:decoration-oasis-accent ${className}`}
      title="Abrir a ficha do doente"
    >
      {nome}
    </button>
  );
}

/** Painel lateral com a ficha (montado uma vez, na App). */
export function GavetaDoente() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const abrir = (e: Event) => setId((e as CustomEvent<string>).detail);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setId(null);
    window.addEventListener(EVENTO, abrir);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener(EVENTO, abrir);
      window.removeEventListener("keydown", esc);
    };
  }, []);
  if (!id) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={() => setId(null)}>
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-slate-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Ficha do doente</span>
          <div className="flex items-center gap-2">
            <Link to={`/doente/${id}`} onClick={() => setId(null)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Abrir em página <ExternalLink className="h-3 w-3" />
            </Link>
            <button type="button" onClick={() => setId(null)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Fechar (Esc)">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="p-4">
          <FichaDoente doenteId={id} compacta />
        </div>
      </div>
    </div>
  );
}
