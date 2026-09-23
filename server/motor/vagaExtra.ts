// Vaga extra (horas extra) quando não há vaga a tempo: a administrativa pede, a gestão aprova ou
// recusa. Aprovada, a vaga é criada e o pedido marcado logo (doente, médico e administrativa avisados);
// recusada, volta à administrativa com o motivo, que resolve com outsourcing ou passa ao médico.
// Tudo fica nos eventos do pedido (quem pediu, quem decidiu, porquê).
import { store } from "../store.ts";
import { agora } from "../clock.ts";
import { apenasData, formatarDataHoraPt, isoData, isoDataHora, parseIso, somarDias } from "../util.ts";
import { janelaAgendamento, marcarPedidoNaVaga } from "./agendamento.ts";
import { registarEvento } from "./estados.ts";
import { recalcularAlertas } from "./alertas.ts";
import { notificar, utilizadoresPorPerfil } from "./notificacoes.ts";
import { resolverComVagaExtra } from "./propostasRemarcacao.ts";
import { descreverDoente, descreverEspecialidade, descreverPedido, descreverUtilizador } from "../apresentacao.ts";
import type { Pedido, Vaga } from "../types.ts";

export interface PedidoVagaExtra {
  id: string;
  pedido_id: string;
  /** Quando vem de uma remarcação (avaria/falta) sem vaga a tempo. */
  proposta_id: string;
  especialidade: string;
  data_hora: string;
  motivo: string;
  pedido_por: string;
  criado_em: string;
  estado: "PENDENTE" | "APROVADO" | "RECUSADO";
  decidido_por: string;
  decidido_em: string;
  motivo_recusa: string;
}

/** Sugestão de hora para a vaga extra: o primeiro dia útil em que o pedido pode ser feito, às 18:00. */
export function sugestaoVagaExtra(pedido: Pedido, quando: Date = agora()): string {
  let dia = janelaAgendamento(pedido, apenasData(quando)).inicio;
  while ([0, 6].includes(dia.getDay())) dia = somarDias(dia, 1);
  return `${isoData(dia)}T18:00`;
}

export function vagaExtraDoPedido(pedidoId: string): PedidoVagaExtra | undefined {
  return [...store.pedidosVagaExtra].reverse().find((v) => v.pedido_id === pedidoId);
}

export function pedirVagaExtra(
  pedido: Pedido,
  opts: { propostaId?: string; dataHora: string; motivo: string; utilizadorId: string; quando?: Date },
): PedidoVagaExtra | null {
  const quando = opts.quando ?? agora();
  const pendente = vagaExtraDoPedido(pedido.pedido_id);
  if (pendente?.estado === "PENDENTE") return null;
  const pedidoExtra: PedidoVagaExtra = {
    id: `VE${String(store.pedidosVagaExtra.length + 1).padStart(4, "0")}`,
    pedido_id: pedido.pedido_id,
    proposta_id: opts.propostaId ?? "",
    especialidade: pedido.especialidade_destino,
    data_hora: opts.dataHora,
    motivo: opts.motivo,
    pedido_por: opts.utilizadorId,
    criado_em: isoDataHora(quando),
    estado: "PENDENTE",
    decidido_por: "",
    decidido_em: "",
    motivo_recusa: "",
  };
  store.pedidosVagaExtra.push(pedidoExtra);
  registarEvento(pedido, "ALERTA", "", opts.utilizadorId, {
    motivo: "Vaga extra pedida à gestão",
    detalhe: `${formatarDataHoraPt(parseIso(opts.dataHora))} — ${opts.motivo}`,
    dataHora: quando,
  });
  notificar({
    tipo: "VAGA_EXTRA_PEDIDA",
    destinatarios: utilizadoresPorPerfil("GESTAO"),
    titulo: `Vaga extra pedida: ${descreverEspecialidade(pedido.especialidade_destino)} — ${descreverDoente(pedido.doente_id)}`,
    mensagem: `${descreverPedido(pedido)} · ${formatarDataHoraPt(parseIso(opts.dataHora))} · pedido por ${descreverUtilizador(opts.utilizadorId)}`,
    pedidoId: pedido.pedido_id,
    doenteId: pedido.doente_id,
    quando,
  });
  return pedidoExtra;
}

function criarVaga(pedido: Pedido, dataHora: string): Vaga | null {
  const modelo =
    store.vagas.find(
      (v) =>
        v.especialidade_codigo === pedido.especialidade_destino &&
        !v.extra &&
        v.atos_permitidos.includes(pedido.ato_codigo) &&
        (!pedido.continuidade_obrigatoria || !pedido.medico_preferido_id || v.medico_id === pedido.medico_preferido_id),
    ) ?? store.vagas.find((v) => v.especialidade_codigo === pedido.especialidade_destino && !v.extra && v.atos_permitidos.includes(pedido.ato_codigo));
  if (!modelo) return null;
  const vaga: Vaga = {
    vaga_id: `VX${String(store.vagas.filter((v) => v.extra).length + 1).padStart(4, "0")}`,
    especialidade_codigo: modelo.especialidade_codigo,
    gabinete_codigo: modelo.gabinete_codigo,
    medico_id: modelo.medico_id,
    data_hora: dataHora,
    duracao_min: modelo.duracao_min,
    atos_permitidos: [pedido.ato_codigo],
    ato_id: "",
    extra: true,
  };
  store.vagas.push(vaga);
  return vaga;
}

export function aprovarVagaExtra(id: string, gestorId: string, dataHora?: string, quando: Date = agora()): { ok: true; data_hora: string } | { ok: false; erro: string } {
  const v = store.pedidosVagaExtra.find((x) => x.id === id);
  const pedido = store.pedidos.find((p) => p.pedido_id === v?.pedido_id);
  if (!v || !pedido || v.estado !== "PENDENTE") return { ok: false, erro: "Pedido de vaga extra não encontrado ou já decidido." };
  const hora = dataHora && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dataHora) ? dataHora : v.data_hora;
  if (v.proposta_id) {
    if (!resolverComVagaExtra(v.proposta_id, hora, gestorId, quando)) return { ok: false, erro: "A remarcação já foi resolvida de outra forma." };
  } else {
    if (pedido.estado !== "SEM_VAGA") return { ok: false, erro: "O pedido já não está sem vaga." };
    const vaga = criarVaga(pedido, hora);
    if (!vaga) return { ok: false, erro: "Não há agenda-modelo neste serviço para criar a vaga." };
    pedido.decisao_pendente = false;
    marcarPedidoNaVaga(pedido, vaga, quando, `Vaga extra aprovada pela gestão (${descreverUtilizador(gestorId)}) a pedido de ${descreverUtilizador(v.pedido_por)}`);
  }
  v.estado = "APROVADO";
  v.data_hora = hora;
  v.decidido_por = gestorId;
  v.decidido_em = isoDataHora(quando);
  notificar({
    tipo: "PEDIDO_MARCADO",
    destinatarios: [v.pedido_por, pedido.medico_requisitante_id],
    titulo: `Vaga extra aprovada: ${descreverDoente(pedido.doente_id)} a ${formatarDataHoraPt(parseIso(hora))}`,
    mensagem: `${descreverPedido(pedido)} · aprovada pela gestão; o doente foi avisado.`,
    pedidoId: pedido.pedido_id,
    doenteId: pedido.doente_id,
    quando,
  });
  recalcularAlertas(quando);
  return { ok: true, data_hora: hora };
}

export function recusarVagaExtra(id: string, gestorId: string, motivo: string, quando: Date = agora()): PedidoVagaExtra | null {
  const v = store.pedidosVagaExtra.find((x) => x.id === id);
  const pedido = store.pedidos.find((p) => p.pedido_id === v?.pedido_id);
  if (!v || !pedido || v.estado !== "PENDENTE") return null;
  v.estado = "RECUSADO";
  v.decidido_por = gestorId;
  v.decidido_em = isoDataHora(quando);
  v.motivo_recusa = motivo;
  registarEvento(pedido, "ALERTA", "", gestorId, { motivo: "Vaga extra recusada pela gestão", detalhe: motivo, dataHora: quando });
  notificar({
    tipo: "PEDIDO_SEM_VAGA",
    destinatarios: [v.pedido_por],
    titulo: `Vaga extra recusada: ${descreverDoente(pedido.doente_id)}`,
    mensagem: `${motivo} — resolver com outsourcing ou passar ao médico.`,
    pedidoId: pedido.pedido_id,
    doenteId: pedido.doente_id,
    quando,
  });
  return v;
}

/** Lista para a Gestão: pendentes primeiro, depois as decisões recentes. */
export function listarVagasExtra() {
  const hoje = isoData(agora());
  return [...store.pedidosVagaExtra]
    .sort((a, b) => Number(b.estado === "PENDENTE") - Number(a.estado === "PENDENTE") || b.criado_em.localeCompare(a.criado_em))
    .map((v) => {
      const pedido = store.pedidos.find((p) => p.pedido_id === v.pedido_id)!;
      return {
        ...v,
        doente_id: pedido.doente_id,
        doente_nome: descreverDoente(pedido.doente_id),
        descricao: descreverPedido(pedido),
        especialidade_legivel: descreverEspecialidade(v.especialidade),
        prazo_limite: pedido.prazo_limite,
        prazo_ja_passou: pedido.prazo_limite < hoje,
        pedido_por_nome: descreverUtilizador(v.pedido_por),
        decidido_por_nome: v.decidido_por ? descreverUtilizador(v.decidido_por) : "",
      };
    });
}
