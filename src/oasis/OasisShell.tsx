import type { ReactNode } from "react";

/**
 * Visual sóbrio de software hospitalar (cinzento/azul, tabelas densas), para contrastar
 * com o resto da aplicação — este é o ecrã simulado do Oasis, não o nosso sistema.
 */
export function OasisShell({ titulo, acoes, children }: { titulo: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-49px)] bg-oasis-bg font-sans text-[13px] text-slate-800">
      <div className="flex items-center justify-between border-b-2 border-oasis-border bg-oasis-header px-4 py-2 text-white">
        <div>
          <span className="font-semibold tracking-wide">OASIS 2.0</span>
          <span className="ml-2 text-slate-300">— {titulo}</span>
        </div>
        {acoes}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function OasisPainel({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <div className="rounded border border-oasis-border bg-oasis-panel shadow-sm">
      {titulo && (
        <div className="border-b border-oasis-border bg-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {titulo}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}
