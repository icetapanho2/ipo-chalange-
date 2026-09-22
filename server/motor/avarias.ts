import { store } from "../store.ts";
import { agora } from "../clock.ts";
import { formatarDataPt, isoData, isoDataHora, parseIso } from "../util.ts";
import { recalcularAlertas } from "./alertas.ts";
import { notificar, utilizadoresPorPerfil } from "./notificacoes.ts";
import { aceitarPlanoAvaria, planearRemarcacoesAvaria } from "./propostasRemarcacao.ts";
import { descreverEspecialidade, descreverAto } from "../apresentacao.ts";
import type { Avaria } from "../types.ts";

/**
 * Um técnico reporta uma avaria (secção N2 + 8A). No mesmo instante o sistema: bloqueia as vagas da
 * janela afectada (agendamento.ts, vagaBloqueadaPorAvaria), prepara o PLANO DE REMARCAÇÃO de todas as
 * marcações afectadas — por ordem do índice de prioridade já guardado em cada pedido, com vaga
 * sugerida e justificação — e avisa a administração do serviço, que só tem de validar.
 */
export function reportarAvaria(
  opts: { especialidadeCodigo: string; atoCodigo?: string; descricao: string; duracaoDias: number; dataInicio?: string },
  utilizadorId: string,
  quando: Date = agora(),
): Avaria {
  const avaria: Avaria = {
    avaria_id: store.proximoId("avaria"),
    especialidade_codigo: opts.especialidadeCodigo,
    ato_codigo: opts.atoCodigo ?? "",
    descricao: opts.descricao,
    duracao_dias: opts.duracaoDias,
    reportado_por: utilizadorId,
    criado_em: isoDataHora(quando),
    data_inicio: opts.dataInicio || isoData(quando),
    estado: "ABERTA",
    decisao: "",
    resolvido_por: "",
    resolvido_em: "",
    pedidos_afetados: 0,
  };
  store.avarias.push(avaria);
  const plano = planearRemarcacoesAvaria(avaria, quando);

  const alvo = opts.atoCodigo ? `${descreverAto(opts.especialidadeCodigo, opts.atoCodigo)}` : "todo o serviço";
  const inicio = parseIso(avaria.data_inicio);
  const periodo =
    avaria.duracao_dias === 1 ? `a ${formatarDataPt(inicio)}` : `${avaria.duracao_dias} dias a partir de ${formatarDataPt(inicio)}`;
  const foraDoPrazo = plano.filter((p) => p.dentro_do_prazo === false).length;
  notificar({
    tipo: "AVARIA_SERVICO",
    destinatarios: utilizadoresPorPerfil("ADMINISTRATIVO", opts.especialidadeCodigo),
    titulo: `Avaria em ${descreverEspecialidade(opts.especialidadeCodigo)}: ${plano.length} marcação(ões) a remarcar`,
    mensagem:
      `${alvo} indisponível ${periodo}: ${opts.descricao}. ` +
      (plano.length
        ? `Plano de remarcação pronto (${plano.length} proposta(s)${foraDoPrazo ? `, ${foraDoPrazo} fora do prazo` : ""}) — rever e validar em Serviço → Remarcações.`
        : "Não há marcações afectadas."),
    quando,
  });
  recalcularAlertas(quando);
  return avaria;
}

/**
 * A administração valida o plano de uma vez ("Aceitar todas"). REMARCACAO_TOTAL estende uma avaria
 * restrita a um acto a todo o serviço (refaz o plano) antes de o aceitar.
 */
export function resolverAvaria(
  avariaId: string,
  decisao: "REMARCACAO_TOTAL" | "REMARCACAO_PARCIAL",
  utilizadorId: string,
  quando: Date = agora(),
): Avaria | null {
  const avaria = store.avarias.find((a) => a.avaria_id === avariaId);
  if (!avaria || avaria.estado !== "ABERTA") return null;
  avaria.decisao = decisao;
  if (decisao === "REMARCACAO_TOTAL" && avaria.ato_codigo) {
    avaria.ato_codigo = "";
    planearRemarcacoesAvaria(avaria, quando);
    avaria.pedidos_afetados = store.propostasRemarcacao.filter((p) => p.avaria_id === avaria.avaria_id).length;
  }
  aceitarPlanoAvaria(avariaId, utilizadorId, quando);
  // Sem marcações afectadas não há propostas: a avaria fecha na mesma.
  if (avaria.estado === "ABERTA" && !store.propostasRemarcacao.some((p) => p.avaria_id === avariaId && p.estado === "PENDENTE")) {
    avaria.estado = "RESOLVIDA";
    avaria.resolvido_por = utilizadorId;
    avaria.resolvido_em = isoDataHora(quando);
    notificar({
      tipo: "AVARIA_RESOLVIDA",
      destinatarios: [avaria.reportado_por],
      titulo: `Avaria resolvida: ${descreverEspecialidade(avaria.especialidade_codigo)}`,
      mensagem: "Sem marcações afectadas. A sua avaria reportada foi seguida.",
      quando,
    });
  }
  recalcularAlertas(quando);
  return avaria;
}
