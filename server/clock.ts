/**
 * Relógio único da aplicação: "hoje" é sempre DEMO_DATE (de parametros.csv),
 * com a hora real do momento. Nunca usar `new Date()` fora deste ficheiro.
 * Injectável nos testes via `definirRelogio`.
 */

let demoDate = { ano: 2026, mes: 9, dia: 23 }; // valor por omissão; store.ts substitui a partir de parametros.csv
let relogioFixo: Date | null = null;

export function definirDataDemo(iso: string): void {
  const [ano, mes, dia] = iso.split("-").map(Number);
  demoDate = { ano, mes, dia };
}

/** Devolve "agora": DEMO_DATE com a hora real, ou a hora fixa definida em teste. */
export function agora(): Date {
  if (relogioFixo) return new Date(relogioFixo);
  const real = new Date();
  return new Date(
    demoDate.ano,
    demoDate.mes - 1,
    demoDate.dia,
    real.getHours(),
    real.getMinutes(),
    real.getSeconds(),
    real.getMilliseconds(),
  );
}

/** Só para testes: fixa "agora" a uma data/hora exacta. */
export function definirRelogio(dataHora: Date | string): void {
  relogioFixo = typeof dataHora === "string" ? new Date(dataHora) : new Date(dataHora);
}

/** Só para testes: volta ao relógio normal (DEMO_DATE + hora real). */
export function reporRelogio(): void {
  relogioFixo = null;
}

/** Início do dia de DEMO_DATE (00:00), útil para cálculos de "hoje" sem hora. */
export function hoje(): Date {
  const a = agora();
  return new Date(a.getFullYear(), a.getMonth(), a.getDate());
}
