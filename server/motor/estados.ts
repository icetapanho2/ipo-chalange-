import { store } from "../store.ts";
import { agora } from "../clock.ts";
import { isoDataHora } from "../util.ts";
import type { EstadoPedido, Evento, Pedido, TipoEvento } from "../types.ts";

/** Quem pode fazer cada tipo de transição (secção 5 da especificação). */
export type Ator = "AGENTE" | "SISTEMA" | string; // string = utilizador_id

export const TRANSICOES_PERMITIDAS: Record<EstadoPedido, EstadoPedido[]> = {
  EXTRAIDO: ["VALIDADO", "DEVOLVIDO", "CANCELADO"],
  VALIDADO: ["EM_TRIAGEM", "ACEITE"],
  EM_TRIAGEM: ["ACEITE", "RECUSADO", "REENCAMINHADO", "DEVOLVIDO"],
  REENCAMINHADO: ["EM_TRIAGEM"],
  DEVOLVIDO: ["EM_TRIAGEM", "VALIDADO"],
  ACEITE: ["MARCADO", "SEM_VAGA", "CANCELADO"],
  SEM_VAGA: ["MARCADO", "CANCELADO"],
  MARCADO: ["REALIZADO", "FALTOU", "CANCELADO"],
  FALTOU: ["MARCADO", "CANCELADO"],
  REALIZADO: [],
  RECUSADO: [],
  CANCELADO: [],
};

export function transicaoValida(de: EstadoPedido, para: EstadoPedido): boolean {
  return TRANSICOES_PERMITIDAS[de]?.includes(para) ?? false;
}

/** Regista um evento de auditoria e, se `estadoNovo` for um estado do pedido, aplica-o (Regra de ouro #4). */
export function registarEvento(
  pedido: Pedido,
  tipo: TipoEvento,
  estadoNovo: EstadoPedido | "",
  utilizadorId: Ator,
  opts: { motivo?: string; detalhe?: string; dataHora?: Date } = {},
): Evento {
  const evento: Evento = {
    evento_id: store.proximoId("evento"),
    pedido_id: pedido.pedido_id,
    data_hora: isoDataHora(opts.dataHora ?? agora()),
    tipo,
    estado_anterior: pedido.estado,
    estado_novo: estadoNovo || pedido.estado,
    utilizador_id: utilizadorId,
    motivo: opts.motivo ?? "",
    detalhe: opts.detalhe ?? "",
  };
  store.eventos.push(evento);
  if (estadoNovo) pedido.estado = estadoNovo;
  return evento;
}
