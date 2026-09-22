// Datas no formato português (dd/mm/aaaa). O servidor devolve ISO; a interface nunca o mostra cru.

/** "2026-09-23" ou "2026-09-23T09:30" → "23/09/2026" */
export function dataPT(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d ? `${d}/${m}/${a}` : iso;
}

/** "2026-09-23T09:30" → "23/09/2026 09:30" (sem hora, só a data) */
export function dataHoraPT(iso: string | null | undefined): string {
  if (!iso) return "—";
  const h = iso.split("T")[1];
  return h ? `${dataPT(iso)} ${h.slice(0, 5)}` : dataPT(iso);
}
