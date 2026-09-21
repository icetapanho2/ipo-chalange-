import { store } from "../store.ts";
import { agora } from "../clock.ts";
import { isoDataHora } from "../util.ts";
import { registarEvento } from "./estados.ts";
import { agendar, agendarLote } from "./agendamento.ts";
import { recalcularAlertas } from "./alertas.ts";
import type { Pedido, Prioridade } from "../types.ts";

/** EXTRAIDO -> VALIDADO -> (EM_TRIAGEM | ACEITE), conforme o fluxo do pedido (secção 5). */
export function validarPedido(
  pedido: Pedido,
  utilizadorId: string,
  opts: { corrigido?: boolean; quando?: Date } = {},
): void {
  const quando = opts.quando ?? agora();
  pedido.validado_por = utilizadorId;
  pedido.validado_em = isoDataHora(quando);
  pedido.aprovado_direto = !opts.corrigido;
  registarEvento(pedido, "VALIDACAO", "VALIDADO", utilizadorId, { dataHora: quando });
  const proximo = pedido.fluxo === "TRIAGEM" ? "EM_TRIAGEM" : "ACEITE";
  registarEvento(pedido, "ENVIO", proximo, "SISTEMA", { dataHora: quando });
}

/** Valida um conjunto de pedidos e agenda de imediato os que ficarem ACEITE (secção 5 da especificação de Validação). */
export function aprovarPedidos(pedidos: Pedido[], utilizadorId: string, quando: Date = agora()): void {
  for (const pedido of pedidos) validarPedido(pedido, utilizadorId, { quando });
  const aceites = pedidos.filter((p) => p.estado === "ACEITE").map((p) => p.pedido_id);
  agendarLote(aceites, quando);
  recalcularAlertas(quando);
}

export function aceitarTriagem(
  pedido: Pedido,
  utilizadorId: string,
  opts: { novaPrioridade?: Prioridade; quando?: Date } = {},
): void {
  const quando = opts.quando ?? agora();
  if (opts.novaPrioridade) pedido.prioridade = opts.novaPrioridade;
  pedido.triado_por = utilizadorId;
  pedido.triado_em = isoDataHora(quando);
  pedido.decisao_triagem = "ACEITE";
  registarEvento(pedido, "TRIAGEM", "ACEITE", utilizadorId, { dataHora: quando });
  agendar(pedido, quando);
  recalcularAlertas(quando);
}

export function recusarTriagem(pedido: Pedido, utilizadorId: string, motivo: string, quando: Date = agora()): void {
  pedido.triado_por = utilizadorId;
  pedido.triado_em = isoDataHora(quando);
  pedido.decisao_triagem = "RECUSADO";
  pedido.motivo_recusa = motivo;
  registarEvento(pedido, "RECUSA", "RECUSADO", utilizadorId, { motivo, dataHora: quando });
  recalcularAlertas(quando);
}

export function reencaminharTriagem(
  pedido: Pedido,
  novaEspecialidade: string,
  utilizadorId: string,
  motivo: string,
  quando: Date = agora(),
): void {
  registarEvento(pedido, "REENCAMINHAMENTO", "EM_TRIAGEM", utilizadorId, { motivo, dataHora: quando });
  pedido.especialidade_destino = novaEspecialidade;
  pedido.decisao_triagem = "REENCAMINHADO";
  recalcularAlertas(quando);
}

export function pedirInformacao(pedido: Pedido, utilizadorId: string, pergunta: string, quando: Date = agora()): void {
  pedido.pergunta_triagem = pergunta;
  registarEvento(pedido, "DEVOLUCAO", "DEVOLVIDO", utilizadorId, { motivo: pergunta, dataHora: quando });
  recalcularAlertas(quando);
}

/** O médico responde a um pedido DEVOLVIDO: volta ao mesmo sítio de onde veio (triagem do mesmo serviço, ou validação). */
export function responderDevolucao(pedido: Pedido, utilizadorId: string, resposta: string, quando: Date = agora()): void {
  pedido.resposta_medico = resposta;
  const proximo = pedido.fluxo === "TRIAGEM" ? "EM_TRIAGEM" : "VALIDADO";
  registarEvento(pedido, "RESPOSTA", proximo, utilizadorId, { motivo: resposta, dataHora: quando });
  recalcularAlertas(quando);
}

export function registarFalta(pedido: Pedido, utilizadorId: string, quando: Date = agora()): void {
  registarEvento(pedido, "FALTA", "FALTOU", utilizadorId, { motivo: "Doente faltou", dataHora: quando });
  recalcularAlertas(quando);
}

export function registarRealizacao(pedido: Pedido, utilizadorId: string, quando: Date = agora()): void {
  registarEvento(pedido, "REALIZACAO", "REALIZADO", utilizadorId, { dataHora: quando });
  recalcularAlertas(quando);
}

/** Remarca um pedido FALTOU (ex.: "Remarcar exame" no semáforo vermelho): tenta agendar de novo. */
export function remarcarPedido(pedido: Pedido, utilizadorId: string, quando: Date = agora()): void {
  pedido.estado = "ACEITE";
  pedido.n_remarcacoes += 1;
  registarEvento(pedido, "REMARCACAO", "ACEITE", utilizadorId, { motivo: "Remarcação após falta", dataHora: quando });
  agendar(pedido, quando);
  recalcularAlertas(quando);
}

/**
 * "Adiar consulta" no semáforo vermelho: liberta a marcação actual e volta a agendar,
 * respeitando de novo a janela (incluindo as dependências, que entretanto podem ter mudado).
 */
export function adiarConsulta(pedido: Pedido, utilizadorId: string, quando: Date = agora()): void {
  const vagaAntiga = store.vagas.find((v) => v.ato_id === pedido.ato_id);
  const atoAntigo = store.atosMedicos.find((a) => a.mvp_ato_id === pedido.ato_id);
  if (vagaAntiga) vagaAntiga.ato_id = "";
  if (atoAntigo) atoAntigo.estado = "DESMARCADA";
  registarEvento(pedido, "CANCELAMENTO", "ACEITE", utilizadorId, {
    motivo: "Consulta adiada: dependência em risco",
    detalhe: atoAntigo ? `data anterior ${atoAntigo.data_hora}` : "",
    dataHora: quando,
  });
  pedido.ato_id = "";
  pedido.marcado_em = "";
  agendar(pedido, quando);
  recalcularAlertas(quando);
}
