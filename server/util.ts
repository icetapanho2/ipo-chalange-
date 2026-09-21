/** Utilitários de datas. Datas do sistema são sempre ISO local "aaaa-mm-dd" ou "aaaa-mm-ddThh:mm", sem timezone. */

export function isoData(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isoDataHora(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${isoData(d)}T${h}:${min}`;
}

/** Interpreta "aaaa-mm-dd" ou "aaaa-mm-ddThh:mm" como data/hora local (nunca UTC). */
export function parseIso(s: string): Date {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) throw new Error(`Data ISO inválida: "${s}"`);
  const [, y, mo, d, h, mi] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), h ? Number(h) : 0, mi ? Number(mi) : 0);
}

export function apenasData(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function somarDias(d: Date, dias: number): Date {
  const r = apenasData(d);
  r.setDate(r.getDate() + dias);
  return r;
}

export function diferencaDias(a: Date, b: Date): number {
  const MS_DIA = 24 * 60 * 60 * 1000;
  return Math.round((apenasData(a).getTime() - apenasData(b).getTime()) / MS_DIA);
}

export function eDiaUtil(d: Date): boolean {
  const dia = d.getDay();
  return dia !== 0 && dia !== 6;
}

export function proximoDiaUtil(d: Date): Date {
  let r = somarDias(d, 1);
  while (!eDiaUtil(r)) r = somarDias(r, 1);
  return r;
}

/** hoje + 1 dia útil (o "amanhã" das janelas de agendamento). */
export function amanha(hoje: Date): Date {
  return proximoDiaUtil(hoje);
}

export function maxData(...datas: (Date | null | undefined)[]): Date | null {
  const validas = datas.filter((d): d is Date => !!d);
  if (validas.length === 0) return null;
  return validas.reduce((a, b) => (b.getTime() > a.getTime() ? b : a));
}

export function minData(...datas: (Date | null | undefined)[]): Date | null {
  const validas = datas.filter((d): d is Date => !!d);
  if (validas.length === 0) return null;
  return validas.reduce((a, b) => (b.getTime() < a.getTime() ? b : a));
}

const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function formatarDataPt(d: Date): string {
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()}`;
}

export function formatarDataHoraPt(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${formatarDataPt(d)} ${h}:${min}`;
}

export function formatarDataExtensoPt(d: Date): string {
  return `${d.getDate()} de ${MESES_PT[d.getMonth()]} de ${d.getFullYear()}`;
}
