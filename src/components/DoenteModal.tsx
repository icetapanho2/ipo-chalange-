import { useEffect } from "react";
import { abrirDoente } from "./NomeDoente";

/**
 * Compatibilidade: quem ainda usa <DoenteModal> abre a mesma ficha no painel lateral (GavetaDoente).
 * Há uma só ficha do doente na aplicação (FichaDoente).
 */
export function DoenteModal({ doenteId, onFechar }: { doenteId: string; onFechar: () => void }) {
  useEffect(() => {
    abrirDoente(doenteId);
    onFechar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doenteId]);
  return null;
}
