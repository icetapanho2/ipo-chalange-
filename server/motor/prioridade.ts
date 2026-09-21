import { store } from "../store.ts";
import { diferencaDias, parseIso, somarDias } from "../util.ts";
import type { Pedido, Prioridade, TipoPedido } from "../types.ts";

const PESO_NIVEL: Record<Prioridade, number> = { MP: 3, P: 2, N: 1 };

/** Prazo por nível (regras_prazos.csv); uma data explícita mais cedo do médico prevalece. */
export function calcularPrazo(
  tipoPedido: TipoPedido,
  prioridade: Prioridade,
  criadoEm: Date,
  prazoExplicito?: Date | null,
): Date {
  const regra = store.regrasPrazos.find((r) => r.tipo_pedido === tipoPedido && r.prioridade === prioridade);
  const dias = regra?.prazo_dias ?? 90;
  const base = somarDias(criadoEm, dias);
  if (prazoExplicito && prazoExplicito.getTime() < base.getTime()) return prazoExplicito;
  return base;
}

/** Mapeamento "1/12", "3/12", "6/12" → nao_antes_dias/prazo_dias, a partir da data da consulta (secção 10). */
const PERIODOS_REVISAO: Record<string, { naoAntesDias: number; prazoDias: number }> = {
  "1/12": { naoAntesDias: 21, prazoDias: 35 },
  "3/12": { naoAntesDias: 80, prazoDias: 100 },
  "6/12": { naoAntesDias: 170, prazoDias: 190 },
};

export function janelaPorPeriodoRevisao(
  codigo: "1/12" | "3/12" | "6/12",
  dataConsulta: Date,
): { naoAntes: Date; prazo: Date } {
  const { naoAntesDias, prazoDias } = PERIODOS_REVISAO[codigo];
  return { naoAntes: somarDias(dataConsulta, naoAntesDias), prazo: somarDias(dataConsulta, prazoDias) };
}

/** folga = prazo − data mínima possível (hoje + tempo necessário para dependências). */
export function folgaDias(pedido: Pedido, dataMinima: Date): number {
  return diferencaDias(parseIso(pedido.prazo_limite), dataMinima);
}

export interface ItemFila {
  pedido: Pedido;
  dataMinima: Date;
}

/** Ordem da fila: (1) menor folga, (2) nível mais alto, (3) pedido mais antigo. */
export function compararFila(a: ItemFila, b: ItemFila): number {
  const folgaA = folgaDias(a.pedido, a.dataMinima);
  const folgaB = folgaDias(b.pedido, b.dataMinima);
  if (folgaA !== folgaB) return folgaA - folgaB;
  const nivelA = PESO_NIVEL[a.pedido.prioridade];
  const nivelB = PESO_NIVEL[b.pedido.prioridade];
  if (nivelA !== nivelB) return nivelB - nivelA;
  return parseIso(a.pedido.criado_em).getTime() - parseIso(b.pedido.criado_em).getTime();
}

export function ordenarFila(itens: ItemFila[]): ItemFila[] {
  return [...itens].sort(compararFila);
}
