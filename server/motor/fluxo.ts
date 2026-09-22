import { store } from "../store.ts";
import { agora } from "../clock.ts";
import { formatarDataHoraPt, isoDataHora, parseIso } from "../util.ts";
import { registarEvento } from "./estados.ts";
import { agendar, agendarLote, type ResultadoAgendamento } from "./agendamento.ts";
import { recalcularAlertas } from "./alertas.ts";
import { notificar, utilizadoresPorPerfil } from "./notificacoes.ts";
import { descreverDoente, descreverEspecialidade, descreverPedido, descreverPrioridade } from "../apresentacao.ts";
import type { Pedido, Prioridade } from "../types.ts";

/** Avisa o médico requisitante e a administração do serviço de origem do resultado da marcação (secção N2). */
function notificarResultadoAgendamento(pedido: Pedido, resultado: ResultadoAgendamento, quando: Date): void {
  const destinatarios = [
    pedido.medico_requisitante_id,
    ...utilizadoresPorPerfil("ADMINISTRATIVO", pedido.especialidade_origem),
    // pedidos que passaram por triagem: o triador do serviço de destino também é notificado do desfecho.
    ...(pedido.fluxo === "TRIAGEM" ? utilizadoresPorPerfil("TRIADOR", pedido.especialidade_destino) : []),
  ];
  if (resultado.tipo === "MARCADO") {
    notificar({
      tipo: "PEDIDO_MARCADO",
      destinatarios,
      titulo: `Marcado: ${descreverPedido(pedido)}`,
      mensagem: `${descreverDoente(pedido.doente_id)} · ${formatarDataHoraPt(parseIso(resultado.ato.data_hora))} · ${descreverEspecialidade(pedido.especialidade_destino)}`,
      pedidoId: pedido.pedido_id,
      doenteId: pedido.doente_id,
      consultaAtoId: pedido.consulta_origem_ato_id,
      quando,
    });
  } else if (resultado.tipo === "SEM_VAGA") {
    notificar({
      tipo: "PEDIDO_SEM_VAGA",
      destinatarios,
      titulo: `Sem vaga: ${descreverPedido(pedido)}`,
      mensagem: `${descreverDoente(pedido.doente_id)} · não foi possível marcar dentro do prazo (${pedido.prazo_limite}). O serviço tem de rever vagas extra ou outsourcing.`,
      pedidoId: pedido.pedido_id,
      doenteId: pedido.doente_id,
      consultaAtoId: pedido.consulta_origem_ato_id,
      quando,
    });
  }
}

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

  const emTriagem = pedidos.filter((p) => p.estado === "EM_TRIAGEM");
  for (const pedido of emTriagem) {
    notificar({
      tipo: "PEDIDO_EM_TRIAGEM",
      destinatarios: utilizadoresPorPerfil("TRIADOR", pedido.especialidade_destino),
      titulo: `Novo pedido para triagem: ${descreverPedido(pedido)}`,
      mensagem: `${descreverDoente(pedido.doente_id)} · ${descreverPrioridade(pedido.prioridade)} · prazo ${pedido.prazo_limite}`,
      pedidoId: pedido.pedido_id,
      doenteId: pedido.doente_id,
      consultaAtoId: pedido.consulta_origem_ato_id,
      quando,
    });
  }

  const aceites = pedidos.filter((p) => p.estado === "ACEITE").map((p) => p.pedido_id);
  const resultados = agendarLote(aceites, quando);
  for (const [pedidoId, resultado] of resultados) {
    const pedido = pedidos.find((p) => p.pedido_id === pedidoId);
    if (pedido) notificarResultadoAgendamento(pedido, resultado, quando);
  }

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
  const resultado = agendar(pedido, quando);
  notificarResultadoAgendamento(pedido, resultado, quando);
  recalcularAlertas(quando);
}

export function recusarTriagem(pedido: Pedido, utilizadorId: string, motivo: string, quando: Date = agora()): void {
  pedido.triado_por = utilizadorId;
  pedido.triado_em = isoDataHora(quando);
  pedido.decisao_triagem = "RECUSADO";
  pedido.motivo_recusa = motivo;
  registarEvento(pedido, "RECUSA", "RECUSADO", utilizadorId, { motivo, dataHora: quando });
  notificar({
    tipo: "PEDIDO_RECUSADO",
    destinatarios: [pedido.medico_requisitante_id, ...utilizadoresPorPerfil("ADMINISTRATIVO", pedido.especialidade_origem)],
    titulo: `Recusado por ${descreverEspecialidade(pedido.especialidade_destino)}: ${descreverPedido(pedido)}`,
    mensagem: `${descreverDoente(pedido.doente_id)} · Motivo: ${motivo}`,
    pedidoId: pedido.pedido_id,
    doenteId: pedido.doente_id,
    consultaAtoId: pedido.consulta_origem_ato_id,
    quando,
  });
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
  notificar({
    tipo: "PEDIDO_DEVOLVIDO",
    destinatarios: [pedido.medico_requisitante_id, ...utilizadoresPorPerfil("ADMINISTRATIVO", pedido.especialidade_origem)],
    titulo: `${descreverEspecialidade(pedido.especialidade_destino)} pediu mais informação: ${descreverPedido(pedido)}`,
    mensagem: `${descreverDoente(pedido.doente_id)} · Pergunta: ${pergunta}`,
    pedidoId: pedido.pedido_id,
    doenteId: pedido.doente_id,
    consultaAtoId: pedido.consulta_origem_ato_id,
    quando,
  });
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
 * SEM_VAGA sem solução interna: a administração conseguiu capacidade externa (outsourcing) para
 * este pedido. Não há vaga/gabinete interno associado — fica directamente por realizado, com a
 * justificação em linguagem simples (regra de ouro #6).
 */
export function marcarOutsourcing(pedido: Pedido, utilizadorId: string, nota: string, quando: Date = agora()): void {
  const detalhe = nota.trim() || "Capacidade externa (outsourcing)";
  registarEvento(pedido, "OUTSOURCING", "MARCADO", utilizadorId, { motivo: "Outsourcing", detalhe, dataHora: quando });
  registarEvento(pedido, "REALIZACAO", "REALIZADO", utilizadorId, { motivo: "Realizado em outsourcing", detalhe, dataHora: quando });
  notificar({
    tipo: "PEDIDO_MARCADO",
    destinatarios: [pedido.medico_requisitante_id, ...utilizadoresPorPerfil("ADMINISTRATIVO", pedido.especialidade_origem)],
    titulo: `Resolvido por capacidade externa: ${descreverPedido(pedido)}`,
    mensagem: `${descreverDoente(pedido.doente_id)} · ${detalhe}.`,
    pedidoId: pedido.pedido_id,
    doenteId: pedido.doente_id,
    consultaAtoId: pedido.consulta_origem_ato_id,
    quando,
  });
  recalcularAlertas(quando);
}

/**
 * SEM_VAGA sem solução (nem vaga extra, nem outsourcing): a administração pede ao médico
 * requisitante para decidir se mantém o pedido em espera ou cancela. O pedido continua SEM_VAGA
 * até o médico responder (secção "Os Meus Pedidos" do médico).
 */
export function pedirDecisaoMedico(pedido: Pedido, utilizadorId: string, motivo: string, quando: Date = agora()): void {
  pedido.decisao_pendente = true;
  registarEvento(pedido, "DECISAO_MEDICO", "", utilizadorId, { motivo, dataHora: quando });
  notificar({
    tipo: "PEDIDO_DECISAO_NECESSARIA",
    destinatarios: [pedido.medico_requisitante_id],
    titulo: `Decisão necessária — sem vaga: ${descreverPedido(pedido)}`,
    mensagem: `${descreverDoente(pedido.doente_id)} · ${motivo}. Quer manter o pedido em espera ou cancelá-lo?`,
    pedidoId: pedido.pedido_id,
    doenteId: pedido.doente_id,
    consultaAtoId: pedido.consulta_origem_ato_id,
    quando,
  });
}

/** O médico decide o desfecho de um pedido SEM_VAGA para o qual a administração pediu decisão. */
export function decidirSemVaga(
  pedido: Pedido,
  utilizadorId: string,
  decisao: "MANTER" | "CANCELAR",
  quando: Date = agora(),
): void {
  pedido.decisao_pendente = false;
  if (decisao === "CANCELAR") {
    registarEvento(pedido, "CANCELAMENTO", "CANCELADO", utilizadorId, {
      motivo: "O médico decidiu cancelar: sem vaga disponível dentro do prazo",
      dataHora: quando,
    });
  } else {
    registarEvento(pedido, "DECISAO_MEDICO", "", utilizadorId, {
      motivo: "O médico decidiu manter o pedido em espera",
      dataHora: quando,
    });
  }
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
