import { store } from "../store.ts";
import { agora } from "../clock.ts";
import { amanha, apenasData, diferencaDias, formatarDataHoraPt, formatarDataPt, isoDataHora, maxData, minData, parseIso, somarDias } from "../util.ts";
import { registarEvento } from "./estados.ts";
import {
  encontrarVagaLivre,
  janelaAgendamento,
  janelaAvaria,
  marcarPedidoNaVaga,
  preferirHoraTardiaSeLonge,
  vagaDiaUnico,
} from "./agendamento.ts";
import { intervaloResultado } from "./dependencias.ts";
import { comunicarMarcacao } from "./comunicacoes.ts";
import { criarAlerta, recalcularAlertas } from "./alertas.ts";
import { notificar, utilizadoresPorPerfil } from "./notificacoes.ts";
import { calcularIndice, resumoIndice } from "./indice.ts";
import { remarcacoesHospital } from "./remarcacao.ts";
import { descreverDoente, descreverEspecialidade } from "../apresentacao.ts";
import type { AtoMedico, Avaria, Pedido, PropostaRemarcacao, Vaga } from "../types.ts";

/**
 * Propostas de remarcação (ESPECIFICACAO.md secção 8A, R-F e R-K). A remarcação nunca é feita às
 * escondidas: o sistema já traz a solução (vaga sugerida) e a justificação em linguagem simples, e a
 * administrativa do serviço aceita ou rejeita. Duas origens:
 *  - AVARIA: plano em lote para todas as marcações afectadas, por ordem do índice de prioridade
 *    guardado em cada pedido; as vagas sugeridas ficam reservadas até à decisão.
 *  - FALTA: sugestão individual para o doente que faltou, a tempo da consulta que depende do exame.
 */

interface Sugestao {
  vaga: Vaga | null;
  dentro: boolean | null;
  diasFora: number;
  motivo: string;
}

/** Melhor vaga para um pedido: dia único → primeira dentro do prazo (e do limite) → primeira depois. */
function sugerirVaga(pedido: Pedido | null, ato: AtoMedico, quando: Date, limite: Date | null = null): Sugestao {
  const hoje = apenasData(quando);
  if (!pedido) {
    // Sem pedido não sabemos o prazo: nunca se antecipa sem o doente pedir — procura-se a partir da
    // data original, primeiro com o mesmo médico.
    const desde = maxData(amanha(hoje), apenasData(parseIso(ato.data_hora))) ?? amanha(hoje);
    const vaga =
      (ato.mvp_medico_id ? encontrarVagaLivre(ato.especialidade_codigo, ato.ato_codigo, desde, somarDias(desde, 60), ato.mvp_medico_id) : null) ??
      encontrarVagaLivre(ato.especialidade_codigo, ato.ato_codigo, desde, somarDias(desde, 60));
    return {
      vaga,
      dentro: null,
      diasFora: 0,
      motivo: vaga ? "marcação sem pedido no sistema (prazo desconhecido): primeira vaga livre" : "sem vaga livre nos próximos 60 dias",
    };
  }
  const { inicio } = janelaAgendamento(pedido, hoje);
  const prazo = parseIso(pedido.prazo_limite);
  const fim = minData(prazo, limite) ?? prazo;
  const medico = pedido.continuidade_obrigatoria ? pedido.medico_preferido_id || undefined : undefined;
  const opts = { pedido, quando };

  const diaUnico = vagaDiaUnico(pedido, inicio, fim, medico, quando);
  if (diaUnico) return { vaga: diaUnico.vaga, dentro: true, diasFora: 0, motivo: diaUnico.motivo };

  let vaga = encontrarVagaLivre(pedido.especialidade_destino, pedido.ato_codigo, inicio, fim, medico, opts);
  if (!vaga && medico) vaga = encontrarVagaLivre(pedido.especialidade_destino, pedido.ato_codigo, inicio, fim, undefined, opts);
  vaga = preferirHoraTardiaSeLonge(pedido, vaga, inicio, fim, medico, quando);
  if (vaga) {
    return {
      vaga,
      dentro: true,
      diasFora: 0,
      motivo: `primeira vaga livre dentro do prazo (até ${formatarDataPt(fim)})${medico && vaga.medico_id === medico ? ", com o mesmo médico" : ""}`,
    };
  }
  vaga = encontrarVagaLivre(pedido.especialidade_destino, pedido.ato_codigo, inicio, somarDias(prazo, 90));
  if (!vaga) return { vaga: null, dentro: false, diasFora: 0, motivo: "sem vaga livre nos próximos 90 dias" };
  const diasFora = diferencaDias(apenasData(parseIso(vaga.data_hora)), prazo);
  const dentroPrazo = diasFora <= 0;
  return {
    vaga,
    dentro: dentroPrazo,
    diasFora: Math.max(0, diasFora),
    motivo: dentroPrazo
      ? `primeira vaga livre (dentro do prazo, ${formatarDataPt(prazo)})`
      : `não há vaga até ao prazo (${formatarDataPt(prazo)}): primeira vaga livre, ${diasFora} dia${diasFora === 1 ? "" : "s"} depois — considerar vaga extra ou outsourcing`,
  };
}

function reservar(vaga: Vaga | null, propostaId: string): void {
  if (vaga) vaga.reserva_id = propostaId;
}

function libertarReserva(proposta: PropostaRemarcacao): void {
  const vaga = store.vagas.find((v) => v.vaga_id === proposta.vaga_sugerida_id);
  if (vaga && vaga.reserva_id === proposta.proposta_id) vaga.reserva_id = "";
}

// ------------------------------------------------------------------------------ AVARIA
/**
 * Plano de remarcação de uma avaria: cada marcação afectada recebe uma vaga sugerida, por ordem do
 * índice de prioridade (quem mais precisa escolhe primeiro). A justificação diz a ordem, porquê, e —
 * quando alguém ficou sem a vaga mais cedo — para quem ela foi.
 */
export function planearRemarcacoesAvaria(avaria: Avaria, quando: Date = agora()): PropostaRemarcacao[] {
  const { inicio, fim } = janelaAvaria(avaria);
  const afetados = store.atosMedicos.filter((a) => {
    if (a.estado !== "MARCADA" || a.especialidade_codigo !== avaria.especialidade_codigo) return false;
    if (avaria.ato_codigo && a.ato_codigo !== avaria.ato_codigo) return false;
    if (avaria.medico_id && a.mvp_medico_id !== avaria.medico_id) return false;
    if (store.propostasRemarcacao.some((p) => p.ato_id === a.mvp_ato_id && p.estado === "PENDENTE")) return false;
    const t = parseIso(a.data_hora).getTime();
    return t >= inicio.getTime() && t < fim.getTime();
  });

  const itens = afetados.map((ato) => {
    const pedido = store.pedidos.find((p) => p.pedido_id === ato.mvp_pedido_id) ?? null;
    // O índice já está guardado no pedido; refresca-se aqui só se faltar (ex.: pedido acabado de criar).
    if (pedido && pedido.indice_prioridade === undefined) {
      const { valor, parcelas } = calcularIndice(pedido, quando);
      pedido.indice_prioridade = valor;
      pedido.indice_parcelas = parcelas;
    }
    return { ato, pedido };
  });
  itens.sort((a, b) => {
    const ia = a.pedido?.indice_prioridade ?? -1;
    const ib = b.pedido?.indice_prioridade ?? -1;
    if (ia !== ib) return ib - ia;
    return (a.pedido?.prazo_limite ?? "9999").localeCompare(b.pedido?.prazo_limite ?? "9999");
  });

  const criadas: PropostaRemarcacao[] = [];
  itens.forEach(({ ato, pedido }, i) => {
    const propostaId = store.proximoId("remarcacao");
    // Se uma consulta depende deste exame, a nova data tem de deixar tempo para o resultado.
    const dep = pedido ? consultaDependente(pedido) : null;
    const limite = dep ? somarDias(apenasData(parseIso(dep.ato.data_hora)), -dep.intervalo) : null;
    let sugestao = sugerirVaga(pedido, ato, quando, limite);
    let semVagaATempo = false;
    let alternativa = "";
    if (dep && limite && (!sugestao.vaga || sugestao.dentro === false || parseIso(sugestao.vaga.data_hora).getTime() >= somarDias(limite, 1).getTime())) {
      semVagaATempo = true;
      alternativa = sugestao.vaga?.data_hora ?? sugerirVaga(pedido, ato, quando).vaga?.data_hora ?? "";
      sugestao = { vaga: null, dentro: false, diasFora: 0, motivo: "" };
    }

    // Que vaga teria este doente se os anteriores do plano não tivessem escolhido primeiro?
    const reservadas = criadas.map((c) => store.vagas.find((v) => v.vaga_id === c.vaga_sugerida_id)).filter((v): v is Vaga => !!v);
    for (const v of reservadas) v.reserva_id = "";
    const semConcorrencia = sugerirVaga(pedido, ato, quando);
    for (const v of reservadas) v.reserva_id = criadas.find((c) => c.vaga_sugerida_id === v.vaga_id)!.proposta_id;
    // Só se explica "a vaga foi para outro" quando isso deixou este doente fora do prazo (ou sem vaga a tempo).
    let perdeu = "";
    if (semVagaATempo) {
      for (const v of reservadas) v.reserva_id = "";
      const livre = sugerirVaga(pedido, ato, quando, limite);
      for (const v of reservadas) v.reserva_id = criadas.find((c) => c.vaga_sugerida_id === v.vaga_id)!.proposta_id;
      const quem = livre.vaga ? criadas.find((c) => c.vaga_sugerida_id === livre.vaga!.vaga_id) : undefined;
      if (quem && livre.vaga) {
        perdeu = ` A única vaga a tempo (${formatarDataHoraPt(parseIso(livre.vaga.data_hora))}) ficou para ${descreverDoente(quem.doente_id)}: índice ${quem.indice} contra ${pedido?.indice_prioridade ?? 0}.`;
      }
    } else if (semConcorrencia.vaga && semConcorrencia.dentro && sugestao.dentro === false && semConcorrencia.vaga.vaga_id !== sugestao.vaga?.vaga_id) {
      const quem = criadas.find((c) => c.vaga_sugerida_id === semConcorrencia.vaga!.vaga_id);
      if (quem) {
        const meus = new Set((pedido?.indice_parcelas ?? []).map((p) => p.rotulo));
        const diferenca = quem.indice_parcelas.filter((p) => !meus.has(p.rotulo) && !/dias à espera/.test(p.rotulo)).map((p) => p.rotulo);
        perdeu =
          ` A única vaga dentro do prazo (${formatarDataHoraPt(parseIso(semConcorrencia.vaga.data_hora))}) ficou para ${descreverDoente(quem.doente_id)}: ` +
          `índice ${quem.indice} contra ${pedido?.indice_prioridade ?? 0}${diferenca.length ? ` (${diferenca.join(", ")})` : ""}.`;
      }
    }

    const avisos: string[] = [];
    if (pedido && remarcacoesHospital(pedido.doente_id, quando) >= store.parametros.max_remarcacoes_hospital) {
      avisos.push(`2.ª remarcação pelo hospital (inevitável: ${avaria.medico_id ? "ausência do médico" : "avaria"}) — ligar ao doente a explicar`);
    }
    if (sugestao.dentro === false && sugestao.vaga) avisos.push(`Fica ${sugestao.diasFora} dia(s) fora do prazo — considerar vaga extra ou outsourcing`);
    if (semVagaATempo && dep) {
      avisos.push(`Sem vaga a tempo da ${dep.ato.ato_descricao || "consulta"} de ${formatarDataHoraPt(parseIso(dep.ato.data_hora))} — resolver: vaga extra, outsourcing ou decisão do médico`);
    } else if (!sugestao.vaga) avisos.push("Sem vaga — precisa de vaga extra ou outsourcing");
    if (store.doentes.find((d) => d.doente_id === ato.doente_id)?.contacto_digital === "NENHUM") avisos.push("Sem telemóvel nem email: avisar por telefone");

    const proposta: PropostaRemarcacao = {
      proposta_id: propostaId,
      origem: "AVARIA",
      avaria_id: avaria.avaria_id,
      pedido_id: pedido?.pedido_id ?? "",
      ato_id: ato.mvp_ato_id,
      doente_id: ato.doente_id,
      especialidade: ato.especialidade_codigo,
      data_hora_atual: ato.data_hora,
      vaga_sugerida_id: sugestao.vaga?.vaga_id ?? "",
      data_hora_sugerida: sugestao.vaga?.data_hora ?? "",
      dentro_do_prazo: sugestao.dentro,
      dias_fora_do_prazo: sugestao.diasFora,
      ordem: i + 1,
      indice: pedido?.indice_prioridade ?? 0,
      indice_parcelas: pedido?.indice_parcelas ?? [],
      justificacao:
        `${i + 1}.º a escolher — ${pedido ? resumoIndice(pedido) : "sem pedido no sistema"}. ` +
        (semVagaATempo && dep && limite
          ? `A ${dep.ato.ato_descricao || "consulta"} de ${formatarDataHoraPt(parseIso(dep.ato.data_hora))} precisa do resultado (${dep.intervalo} dias): o exame teria de ser até ${formatarDataPt(limite)} e não há vaga até lá.` +
            (alternativa ? ` Primeira vaga livre: ${formatarDataHoraPt(parseIso(alternativa))} (já depois da consulta).` : "")
          : sugestao.vaga
            ? `Sugerido ${formatarDataHoraPt(parseIso(sugestao.vaga.data_hora))}: ${sugestao.motivo.replace(/\.$/, "")}.`
            : `${sugestao.motivo}.`) +
        perdeu,
      avisos,
      estado: "PENDENTE",
      criado_em: isoDataHora(quando),
      decidido_por: "",
      decidido_em: "",
    };
    if (semVagaATempo && dep && limite && pedido) marcarSemVagaATempo(proposta, pedido, dep, limite, alternativa, quando);
    reservar(sugestao.vaga, propostaId);
    store.propostasRemarcacao.push(proposta);
    criadas.push(proposta);
  });
  avaria.pedidos_afetados = criadas.length;
  return criadas;
}

function concluirAvariaSeTerminada(avariaId: string, utilizadorId: string, quando: Date): void {
  const avaria = store.avarias.find((a) => a.avaria_id === avariaId);
  if (!avaria || avaria.estado !== "ABERTA") return;
  const doPlano = store.propostasRemarcacao.filter((p) => p.avaria_id === avariaId);
  if (doPlano.some((p) => p.estado === "PENDENTE")) return;
  avaria.estado = "RESOLVIDA";
  avaria.decisao = avaria.decisao || (avaria.ato_codigo ? "REMARCACAO_PARCIAL" : "REMARCACAO_TOTAL");
  avaria.resolvido_por = utilizadorId;
  avaria.resolvido_em = isoDataHora(quando);
  const aceites = doPlano.filter((p) => p.estado === "ACEITE").length;
  notificar({
    tipo: "AVARIA_RESOLVIDA",
    destinatarios: [avaria.reportado_por],
    titulo: `Avaria resolvida: ${descreverEspecialidade(avaria.especialidade_codigo)}`,
    mensagem: `A administração validou o plano de remarcação (${aceites} de ${doPlano.length} marcação(ões) remarcadas). A sua avaria reportada foi seguida.`,
    quando,
  });
}

/** Proposta sem vaga a tempo: dados para as três saídas e alerta para a administrativa (não é automático). */
function marcarSemVagaATempo(
  proposta: PropostaRemarcacao,
  pedido: Pedido,
  dep: { pedido: Pedido; ato: AtoMedico; intervalo: number },
  limite: Date,
  alternativa: string,
  quando: Date,
): void {
  proposta.sem_vaga_a_tempo = true;
  proposta.alternativa_data_hora = alternativa;
  proposta.consulta_dependente = {
    pedido_id: dep.pedido.pedido_id,
    data_hora: dep.ato.data_hora,
    descricao: dep.ato.ato_descricao || "consulta",
    medico_id: dep.ato.mvp_medico_id || dep.pedido.medico_requisitante_id,
    intervalo: dep.intervalo,
  };
  let diaExtra = apenasData(limite);
  while (diaExtra.getDay() === 0 || diaExtra.getDay() === 6) diaExtra = somarDias(diaExtra, -1); // último dia útil a tempo
  const extra = new Date(diaExtra.getFullYear(), diaExtra.getMonth(), diaExtra.getDate(), 13, 30);
  proposta.vaga_extra_sugerida = isoDataHora(extra.getTime() < somarDias(apenasData(quando), 1).getTime() ? somarDias(apenasData(quando), 1) : extra);
  const alerta = criarAlerta(
    {
      tipo: "SEM_VAGA_A_TEMPO",
      gravidade: "alta",
      especialidade: pedido.especialidade_destino,
      pedido_id: pedido.pedido_id,
      doente_id: pedido.doente_id,
      descricao: `${descreverDoente(pedido.doente_id)}: sem vaga a tempo da ${proposta.consulta_dependente.descricao} de ${formatarDataHoraPt(parseIso(dep.ato.data_hora))}. Resolver com vaga extra, outsourcing ou pedir decisão ao médico.`,
    },
    quando,
  );
  proposta.alerta_id = alerta.alerta_id;
}

// ------------------------------------------------------------------------------ FALTA
/** Consulta marcada que depende deste pedido (ex.: revisão que precisa do resultado da colheita). */
function consultaDependente(pedido: Pedido): { pedido: Pedido; ato: AtoMedico; intervalo: number } | null {
  for (const d of store.dependencias.filter((x) => x.depende_de_pedido_id === pedido.pedido_id)) {
    const dep = store.pedidos.find((p) => p.pedido_id === d.pedido_id);
    const ato = dep?.estado === "MARCADO" ? store.atosMedicos.find((a) => a.mvp_ato_id === dep.ato_id) : undefined;
    if (dep && ato) return { pedido: dep, ato, intervalo: d.intervalo_min_dias || intervaloResultado(pedido.especialidade_destino) };
  }
  return null;
}

/** (Re)calcula a sugestão de uma proposta de FALTA — a vaga não fica reservada, por isso vê-se sempre a actual. */
export function actualizarSugestaoFalta(proposta: PropostaRemarcacao, quando: Date = agora()): void {
  const pedido = store.pedidos.find((p) => p.pedido_id === proposta.pedido_id);
  const ato = store.atosMedicos.find((a) => a.mvp_ato_id === proposta.ato_id);
  if (!pedido || !ato || proposta.estado !== "PENDENTE") return;
  const dep = consultaDependente(pedido);
  const limite = dep ? somarDias(apenasData(parseIso(dep.ato.data_hora)), -dep.intervalo) : null;
  let sugestao = sugerirVaga(pedido, ato, quando, limite);
  let aTempo = true;
  if (dep && (!sugestao.vaga || sugestao.dentro === false || (limite && parseIso(sugestao.vaga.data_hora).getTime() >= somarDias(limite, 1).getTime()))) {
    aTempo = false;
    sugestao = sugerirVaga(pedido, ato, quando);
  }
  const faltas = store.atosMedicos.filter((a) => a.doente_id === pedido.doente_id && a.estado === "FALTOU").length;
  const quandoFaltou = `Faltou a ${ato.ato_descricao || "marcação"} de ${formatarDataHoraPt(parseIso(ato.data_hora))}`;
  const paraQue = dep
    ? ` É necessária para ${dep.ato.ato_descricao || "a consulta"} de ${formatarDataHoraPt(parseIso(dep.ato.data_hora))} (resultado demora ${dep.intervalo} dia${dep.intervalo === 1 ? "" : "s"}).`
    : "";
  const sugerida = sugestao.vaga
    ? ` Sugerido ${formatarDataHoraPt(parseIso(sugestao.vaga.data_hora))}: ${
        dep && aTempo ? "primeira vaga que ainda dá tempo ao resultado antes da consulta" : sugestao.motivo
      }.`
    : " Sem vaga disponível.";
  proposta.vaga_sugerida_id = sugestao.vaga?.vaga_id ?? "";
  proposta.data_hora_sugerida = sugestao.vaga?.data_hora ?? "";
  proposta.dentro_do_prazo = sugestao.dentro;
  proposta.dias_fora_do_prazo = sugestao.diasFora;
  proposta.indice = pedido.indice_prioridade ?? 0;
  proposta.indice_parcelas = pedido.indice_parcelas ?? [];
  proposta.justificacao = `${quandoFaltou}.${paraQue}${sugerida}`;
  if (dep && !aTempo && limite && !proposta.sem_vaga_a_tempo) {
    proposta.alternativa_data_hora = proposta.data_hora_sugerida;
    marcarSemVagaATempo(proposta, pedido, dep, limite, proposta.data_hora_sugerida, quando);
  } else if (dep && !aTempo && limite) {
    proposta.alternativa_data_hora = proposta.data_hora_sugerida;
  }
  proposta.avisos = [
    ...(dep && !aTempo ? [`Não há vaga a tempo: a consulta de ${formatarDataPt(parseIso(dep.ato.data_hora))} terá de ser adiada`] : []),
    ...(faltas >= 2 ? [`${faltas} faltas registadas: ligar ao doente para perceber o motivo`] : []),
    ...(store.doentes.find((d) => d.doente_id === pedido.doente_id)?.contacto_digital === "NENHUM" ? ["Sem telemóvel nem email: avisar por telefone"] : []),
  ];
}

/** Uma falta gera logo a sugestão de remarcação e avisa a administrativa do serviço. */
export function criarPropostaFalta(pedido: Pedido, quando: Date = agora()): PropostaRemarcacao | null {
  if (store.propostasRemarcacao.some((p) => p.pedido_id === pedido.pedido_id && p.origem === "FALTA" && p.estado === "PENDENTE")) return null;
  const ato = store.atosMedicos.find((a) => a.mvp_ato_id === pedido.ato_id);
  if (!ato) return null;
  const proposta: PropostaRemarcacao = {
    proposta_id: store.proximoId("remarcacao"),
    origem: "FALTA",
    avaria_id: "",
    pedido_id: pedido.pedido_id,
    ato_id: ato.mvp_ato_id,
    doente_id: pedido.doente_id,
    especialidade: pedido.especialidade_destino,
    data_hora_atual: ato.data_hora,
    vaga_sugerida_id: "",
    data_hora_sugerida: "",
    dentro_do_prazo: null,
    dias_fora_do_prazo: 0,
    ordem: 1,
    indice: 0,
    indice_parcelas: [],
    justificacao: "",
    avisos: [],
    estado: "PENDENTE",
    criado_em: isoDataHora(quando),
    decidido_por: "",
    decidido_em: "",
  };
  store.propostasRemarcacao.push(proposta);
  actualizarSugestaoFalta(proposta, quando);
  notificar({
    tipo: "REMARCACAO_SUGERIDA",
    destinatarios: utilizadoresPorPerfil("ADMINISTRATIVO", pedido.especialidade_destino),
    titulo: `Falta: remarcação sugerida para ${descreverDoente(pedido.doente_id)}`,
    mensagem: proposta.justificacao,
    pedidoId: pedido.pedido_id,
    doenteId: pedido.doente_id,
    quando,
  });
  return proposta;
}

/** No arranque / "Repor demo": as faltas que já estão nos dados também têm a sugestão pronta. */
export function gerarPropostasFaltasPendentes(quando: Date = agora()): void {
  for (const pedido of store.pedidos.filter((p) => p.estado === "FALTOU")) criarPropostaFalta(pedido, quando);
}

// ------------------------------------------------------------------------------ decisões
function moverAto(ato: AtoMedico, vaga: Vaga, quando: Date): string {
  const vagaAntiga = store.vagas.find((v) => v.vaga_id === ato.mvp_vaga_id);
  const dataAntiga = ato.data_hora;
  if (vagaAntiga && vagaAntiga.ato_id === ato.mvp_ato_id) vagaAntiga.ato_id = "";
  ato.data_hora = vaga.data_hora;
  ato.gabinete_codigo = vaga.gabinete_codigo;
  ato.gabinete_descricao = store.gabinetes.find((g) => g.codigo === vaga.gabinete_codigo)?.descricao ?? "";
  ato.mvp_vaga_id = vaga.vaga_id;
  ato.mvp_medico_id = vaga.medico_id;
  ato.mvp_n_remarcacoes += 1;
  ato.data_atualizacao = isoDataHora(quando);
  vaga.ato_id = ato.mvp_ato_id;
  vaga.reserva_id = "";
  return dataAntiga;
}

/** A administrativa aceita a proposta: a remarcação é aplicada, comunicada ao doente e ao médico. */
export function aceitarPropostaRemarcacao(propostaId: string, utilizadorId: string, quando: Date = agora()): PropostaRemarcacao | null {
  const proposta = store.propostasRemarcacao.find((p) => p.proposta_id === propostaId);
  if (!proposta || proposta.estado !== "PENDENTE") return null;
  if (proposta.origem === "FALTA") actualizarSugestaoFalta(proposta, quando);
  if (proposta.sem_vaga_a_tempo) return null; // resolve-se com vaga extra, outsourcing ou decisão do médico
  const ato = store.atosMedicos.find((a) => a.mvp_ato_id === proposta.ato_id);
  const pedido = store.pedidos.find((p) => p.pedido_id === proposta.pedido_id);
  const vaga = store.vagas.find((v) => v.vaga_id === proposta.vaga_sugerida_id);
  if (!ato) return null;
  proposta.estado = "ACEITE";
  proposta.decidido_por = utilizadorId;
  proposta.decidido_em = isoDataHora(quando);

  if (proposta.origem === "FALTA" && pedido) {
    pedido.estado = "ACEITE";
    pedido.n_remarcacoes += 1;
    registarEvento(pedido, "REMARCACAO", "ACEITE", utilizadorId, { motivo: "Remarcação após falta (sugestão aceite)", detalhe: proposta.justificacao, dataHora: quando });
    if (vaga) marcarPedidoNaVaga(pedido, vaga, quando, "Sugestão de remarcação após falta, validada pela administrativa");
    else {
      pedido.estado = "SEM_VAGA";
      registarEvento(pedido, "SEM_VAGA", "SEM_VAGA", "AGENTE", { motivo: "Sem vaga para remarcar após falta", dataHora: quando });
    }
    recalcularAlertas(quando);
    return proposta;
  }

  // AVARIA
  const avaria = store.avarias.find((a) => a.avaria_id === proposta.avaria_id);
  const jaRemarcado = pedido ? remarcacoesHospital(pedido.doente_id, quando) >= store.parametros.max_remarcacoes_hospital : false;
  if (vaga) {
    const dataAntiga = moverAto(ato, vaga, quando);
    if (pedido) {
      pedido.n_remarcacoes += 1;
      registarEvento(pedido, "REMARCACAO", "", utilizadorId, {
        motivo: `Avaria: ${avaria?.descricao ?? ""} (plano validado)`,
        detalhe: `de ${formatarDataHoraPt(parseIso(dataAntiga))} para ${formatarDataHoraPt(parseIso(vaga.data_hora))} · ${proposta.justificacao}`,
        dataHora: quando,
      });
      comunicarMarcacao(pedido, ato, "REMARCACAO", quando);
      notificar({
        tipo: "PEDIDO_MARCADO",
        destinatarios: [pedido.medico_requisitante_id],
        titulo: `Reagendado por avaria: ${descreverEspecialidade(pedido.especialidade_destino)}`,
        mensagem: `${descreverDoente(pedido.doente_id)} · de ${formatarDataHoraPt(parseIso(dataAntiga))} para ${formatarDataHoraPt(parseIso(vaga.data_hora))} (${avaria?.descricao ?? "avaria"}).`,
        pedidoId: pedido.pedido_id,
        doenteId: pedido.doente_id,
        consultaAtoId: pedido.consulta_origem_ato_id,
        quando,
      });
    }
  } else if (pedido) {
    const vagaAntiga = store.vagas.find((v) => v.vaga_id === ato.mvp_vaga_id);
    if (vagaAntiga) vagaAntiga.ato_id = "";
    ato.estado = "DESMARCADA";
    pedido.ato_id = "";
    pedido.marcado_em = "";
    registarEvento(pedido, "SEM_VAGA", "SEM_VAGA", utilizadorId, { motivo: `Avaria: ${avaria?.descricao ?? ""} — sem vaga alternativa`, dataHora: quando });
    notificar({
      tipo: "PEDIDO_SEM_VAGA",
      destinatarios: [pedido.medico_requisitante_id],
      titulo: `Sem vaga alternativa após avaria: ${descreverEspecialidade(pedido.especialidade_destino)}`,
      mensagem: `${descreverDoente(pedido.doente_id)} · requer vaga extra ou outsourcing.`,
      pedidoId: pedido.pedido_id,
      doenteId: pedido.doente_id,
      consultaAtoId: pedido.consulta_origem_ato_id,
      quando,
    });
  }
  if (jaRemarcado && pedido) {
    criarAlerta(
      {
        tipo: "SEGUNDA_REMARCACAO",
        gravidade: "alta",
        especialidade: pedido.especialidade_destino,
        pedido_id: pedido.pedido_id,
        doente_id: pedido.doente_id,
        descricao: `${descreverDoente(pedido.doente_id)} já tinha sido remarcado pelo hospital: 2.ª remarcação inevitável (avaria). Ligar ao doente a explicar.`,
      },
      quando,
    );
  }
  concluirAvariaSeTerminada(proposta.avaria_id, utilizadorId, quando);
  recalcularAlertas(quando);
  return proposta;
}

export function rejeitarPropostaRemarcacao(propostaId: string, utilizadorId: string, quando: Date = agora()): PropostaRemarcacao | null {
  const proposta = store.propostasRemarcacao.find((p) => p.proposta_id === propostaId);
  if (!proposta || proposta.estado !== "PENDENTE") return null;
  proposta.estado = "REJEITADA";
  proposta.decidido_por = utilizadorId;
  proposta.decidido_em = isoDataHora(quando);
  libertarReserva(proposta);
  if (proposta.origem === "AVARIA") concluirAvariaSeTerminada(proposta.avaria_id, utilizadorId, quando);
  return proposta;
}

/** "Aceitar todas": aplica o plano inteiro de uma avaria, pela ordem do índice. */
export function aceitarPlanoAvaria(avariaId: string, utilizadorId: string, quando: Date = agora()): number {
  const pendentes = store.propostasRemarcacao
    .filter((p) => p.avaria_id === avariaId && p.estado === "PENDENTE" && !p.sem_vaga_a_tempo) // estes pedem uma escolha humana
    .sort((a, b) => a.ordem - b.ordem);
  for (const p of pendentes) aceitarPropostaRemarcacao(p.proposta_id, utilizadorId, quando);
  return pendentes.length;
}

/** Proposta pendente de falta para um pedido (usada pelo botão "Remarcar exame" da ficha do doente). */
export function propostaFaltaPendente(pedidoId: string): PropostaRemarcacao | undefined {
  return store.propostasRemarcacao.find((p) => p.pedido_id === pedidoId && p.origem === "FALTA" && p.estado === "PENDENTE");
}

// ------------------------------------------------------------------------------ sem vaga a tempo
/** Vagas extra criadas pela administrativa (fora do horário normal). */
function criarVagaExtra(ato: AtoMedico, dataHora: string): Vaga {
  const n = store.vagas.filter((v) => v.extra).length + 1;
  const vaga: Vaga = {
    vaga_id: `VX${String(n).padStart(4, "0")}`,
    especialidade_codigo: ato.especialidade_codigo,
    gabinete_codigo: ato.gabinete_codigo,
    medico_id: ato.mvp_medico_id,
    data_hora: dataHora,
    duracao_min: ato.duracao_min || 20,
    atos_permitidos: [ato.ato_codigo],
    ato_id: "",
    extra: true,
  };
  store.vagas.push(vaga);
  return vaga;
}

function fecharAlertaDaProposta(proposta: PropostaRemarcacao, utilizadorId: string, accao: string, quando: Date): void {
  const alerta = store.alertas.find((a) => a.alerta_id === proposta.alerta_id && a.estado === "ABERTO");
  if (!alerta) return;
  alerta.estado = "RESOLVIDO";
  alerta.resolvido_por = utilizadorId;
  alerta.resolvido_em = isoDataHora(quando);
  alerta.accao = accao;
}

function colocarExameNaVaga(proposta: PropostaRemarcacao, pedido: Pedido, ato: AtoMedico, vaga: Vaga, utilizadorId: string, motivo: string, quando: Date): void {
  if (proposta.origem === "FALTA") {
    pedido.estado = "ACEITE";
    pedido.n_remarcacoes += 1;
    registarEvento(pedido, "REMARCACAO", "ACEITE", utilizadorId, { motivo, dataHora: quando });
    marcarPedidoNaVaga(pedido, vaga, quando, motivo);
    return;
  }
  const dataAntiga = moverAto(ato, vaga, quando);
  pedido.n_remarcacoes += 1;
  registarEvento(pedido, "REMARCACAO", "", utilizadorId, {
    motivo,
    detalhe: `de ${formatarDataHoraPt(parseIso(dataAntiga))} para ${formatarDataHoraPt(parseIso(vaga.data_hora))}`,
    dataHora: quando,
  });
  comunicarMarcacao(pedido, ato, "REMARCACAO", quando);
}

function concluir(proposta: PropostaRemarcacao, utilizadorId: string, resolucao: string, quando: Date): void {
  proposta.estado = "ACEITE";
  proposta.resolucao = resolucao;
  proposta.decidido_por = utilizadorId;
  proposta.decidido_em = isoDataHora(quando);
  fecharAlertaDaProposta(proposta, utilizadorId, resolucao, quando);
  if (proposta.origem === "AVARIA") concluirAvariaSeTerminada(proposta.avaria_id, utilizadorId, quando);
  recalcularAlertas(quando);
}

/** "Resolvi com vaga extra": a administrativa abriu uma vaga fora do horário, a tempo da consulta. */
export function resolverComVagaExtra(propostaId: string, dataHora: string, utilizadorId: string, quando: Date = agora()): PropostaRemarcacao | null {
  const proposta = store.propostasRemarcacao.find((p) => p.proposta_id === propostaId);
  const pedido = store.pedidos.find((p) => p.pedido_id === proposta?.pedido_id);
  const ato = store.atosMedicos.find((a) => a.mvp_ato_id === proposta?.ato_id);
  if (!proposta || !pedido || !ato || !["PENDENTE", "AGUARDA_MEDICO"].includes(proposta.estado)) return null;
  libertarReserva(proposta);
  const vaga = criarVagaExtra(ato, dataHora);
  colocarExameNaVaga(proposta, pedido, ato, vaga, utilizadorId, `Vaga extra aberta pela administrativa (${formatarDataHoraPt(parseIso(dataHora))})`, quando);
  pedido.decisao_pendente = false;
  concluir(proposta, utilizadorId, `Resolvido com vaga extra a ${formatarDataHoraPt(parseIso(dataHora))}`, quando);
  return proposta;
}

/** "Resolvi com outsourcing": o exame faz-se fora; a marcação interna é libertada. */
export function resolverComOutsourcing(propostaId: string, nota: string, utilizadorId: string, quando: Date = agora()): PropostaRemarcacao | null {
  const proposta = store.propostasRemarcacao.find((p) => p.proposta_id === propostaId);
  const pedido = store.pedidos.find((p) => p.pedido_id === proposta?.pedido_id);
  const ato = store.atosMedicos.find((a) => a.mvp_ato_id === proposta?.ato_id);
  if (!proposta || !pedido || !ato || !["PENDENTE", "AGUARDA_MEDICO"].includes(proposta.estado)) return null;
  libertarReserva(proposta);
  const vagaAntiga = store.vagas.find((v) => v.vaga_id === ato.mvp_vaga_id);
  if (vagaAntiga && vagaAntiga.ato_id === ato.mvp_ato_id) vagaAntiga.ato_id = "";
  if (ato.estado === "MARCADA") ato.estado = "DESMARCADA";
  const detalhe = nota.trim() || "Capacidade externa (outsourcing)";
  registarEvento(pedido, "OUTSOURCING", "MARCADO", utilizadorId, { motivo: "Outsourcing (sem vaga interna a tempo)", detalhe, dataHora: quando });
  registarEvento(pedido, "REALIZACAO", "REALIZADO", utilizadorId, { motivo: "Realizado em outsourcing", detalhe, dataHora: quando });
  pedido.decisao_pendente = false;
  concluir(proposta, utilizadorId, `Resolvido com outsourcing: ${detalhe}`, quando);
  return proposta;
}

/** Sem vaga extra nem outsourcing: passa a decisão ao médico da consulta que depende do exame. */
export function pedirDecisaoAoMedico(propostaId: string, utilizadorId: string, quando: Date = agora()): PropostaRemarcacao | null {
  const proposta = store.propostasRemarcacao.find((p) => p.proposta_id === propostaId);
  const pedido = store.pedidos.find((p) => p.pedido_id === proposta?.pedido_id);
  if (!proposta || !pedido || proposta.estado !== "PENDENTE" || !proposta.consulta_dependente) return null;
  libertarReserva(proposta);
  proposta.estado = "AGUARDA_MEDICO";
  proposta.decidido_por = utilizadorId;
  proposta.decidido_em = isoDataHora(quando);
  pedido.decisao_pendente = true;
  const c = proposta.consulta_dependente;
  registarEvento(pedido, "DECISAO_MEDICO", "", utilizadorId, {
    motivo: "Sem vaga a tempo, sem vaga extra nem outsourcing: decisão pedida ao médico",
    dataHora: quando,
  });
  notificar({
    tipo: "PEDIDO_DECISAO_NECESSARIA",
    destinatarios: [c.medico_id],
    titulo: `Decisão necessária: ${descreverDoente(pedido.doente_id)} — ${c.descricao} de ${formatarDataHoraPt(parseIso(c.data_hora))}`,
    mensagem:
      `O exame de que a consulta depende ficou sem vaga a tempo (${proposta.origem === "AVARIA" ? "avaria" : "falta"}). ` +
      `Quer avançar com a consulta e ver o exame depois${proposta.alternativa_data_hora ? ` (exame a ${formatarDataHoraPt(parseIso(proposta.alternativa_data_hora))})` : ""}, ou adiar a consulta — e para que dia?`,
    pedidoId: c.pedido_id,
    doenteId: pedido.doente_id,
    quando,
  });
  fecharAlertaDaProposta(proposta, utilizadorId, "Decisão pedida ao médico", quando);
  if (proposta.origem === "AVARIA") concluirAvariaSeTerminada(proposta.avaria_id, utilizadorId, quando);
  return proposta;
}

/** Data mínima sensata para adiar a consulta: primeira vaga do exame + tempo do resultado. */
export function dataMinimaParaAdiar(proposta: PropostaRemarcacao): string {
  if (!proposta.alternativa_data_hora || !proposta.consulta_dependente) return "";
  return isoDataHora(somarDias(apenasData(parseIso(proposta.alternativa_data_hora)), proposta.consulta_dependente.intervalo)).slice(0, 10);
}

/**
 * O médico decide: AVANCAR — a consulta mantém-se e o exame fica na primeira vaga (depois; a
 * dependência deixa de bloquear); ADIAR — a consulta passa para o primeiro dia a partir da data
 * escolhida (mesmo médico, se houver) e o exame para a primeira vaga que ainda dá tempo ao resultado.
 */
export function decidirRemarcacaoMedico(
  propostaId: string,
  decisao: "AVANCAR" | "ADIAR",
  utilizadorId: string,
  novaData: string | null,
  quando: Date = agora(),
): { proposta: PropostaRemarcacao; consulta: string; exame: string } | null {
  const proposta = store.propostasRemarcacao.find((p) => p.proposta_id === propostaId);
  const pedido = store.pedidos.find((p) => p.pedido_id === proposta?.pedido_id);
  const ato = store.atosMedicos.find((a) => a.mvp_ato_id === proposta?.ato_id);
  const c = proposta?.consulta_dependente;
  const consulta = store.pedidos.find((p) => p.pedido_id === c?.pedido_id);
  const atoConsulta = consulta ? store.atosMedicos.find((a) => a.mvp_ato_id === consulta.ato_id) : undefined;
  if (!proposta || !pedido || !ato || !c || !consulta || !atoConsulta || proposta.estado !== "AGUARDA_MEDICO") return null;
  const hoje = apenasData(quando);
  const { inicio } = janelaAgendamento(pedido, hoje);

  if (decisao === "AVANCAR") {
    store.dependencias = store.dependencias.filter((d) => !(d.pedido_id === consulta.pedido_id && d.depende_de_pedido_id === pedido.pedido_id));
    registarEvento(consulta, "DECISAO_MEDICO", "", utilizadorId, {
      motivo: `O médico decidiu manter a consulta sem esperar pelo resultado do exame (${pedido.especificacao || "exame"}); vê o exame depois`,
      dataHora: quando,
    });
    const vaga = encontrarVagaLivre(pedido.especialidade_destino, pedido.ato_codigo, inicio, somarDias(parseIso(pedido.prazo_limite), 90), undefined, { pedido, quando });
    if (vaga) colocarExameNaVaga(proposta, pedido, ato, vaga, utilizadorId, "Médico decidiu avançar com a consulta; exame na primeira vaga", quando);
    pedido.decisao_pendente = false;
    concluir(proposta, utilizadorId, "Médico: avançar com a consulta e ver o exame depois", quando);
    return { proposta, consulta: atoConsulta.data_hora, exame: vaga?.data_hora ?? "" };
  }

  // ADIAR
  const desde = novaData ? parseIso(novaData) : parseIso(dataMinimaParaAdiar(proposta) || c.data_hora);
  const medico = consulta.continuidade_obrigatoria ? consulta.medico_preferido_id || undefined : atoConsulta.mvp_medico_id || undefined;
  let vagaConsulta = encontrarVagaLivre(consulta.especialidade_destino, consulta.ato_codigo, desde, somarDias(desde, 60), medico);
  if (!vagaConsulta) vagaConsulta = encontrarVagaLivre(consulta.especialidade_destino, consulta.ato_codigo, desde, somarDias(desde, 60));
  if (!vagaConsulta) return null;
  const dataAntigaConsulta = moverAto(atoConsulta, vagaConsulta, quando);
  consulta.n_remarcacoes += 1;
  registarEvento(consulta, "REMARCACAO", "", utilizadorId, {
    motivo: "Consulta adiada por decisão do médico (exame sem vaga a tempo)",
    detalhe: `de ${formatarDataHoraPt(parseIso(dataAntigaConsulta))} para ${formatarDataHoraPt(parseIso(vagaConsulta.data_hora))}`,
    dataHora: quando,
  });
  comunicarMarcacao(consulta, atoConsulta, "REMARCACAO", quando);
  const limite = somarDias(apenasData(parseIso(vagaConsulta.data_hora)), -c.intervalo);
  const vagaExame =
    encontrarVagaLivre(pedido.especialidade_destino, pedido.ato_codigo, inicio, limite, undefined, { pedido, quando }) ??
    encontrarVagaLivre(pedido.especialidade_destino, pedido.ato_codigo, inicio, somarDias(limite, 60), undefined, { pedido, quando });
  if (vagaExame) colocarExameNaVaga(proposta, pedido, ato, vagaExame, utilizadorId, "Exame remarcado para antes da consulta adiada", quando);
  pedido.decisao_pendente = false;
  concluir(proposta, utilizadorId, `Médico: adiar a consulta para ${formatarDataHoraPt(parseIso(vagaConsulta.data_hora))}`, quando);
  notificar({
    tipo: "PEDIDO_MARCADO",
    destinatarios: utilizadoresPorPerfil("ADMINISTRATIVO", pedido.especialidade_destino),
    titulo: `Decisão do médico aplicada: ${descreverDoente(pedido.doente_id)}`,
    mensagem: `Consulta adiada para ${formatarDataHoraPt(parseIso(vagaConsulta.data_hora))}; exame a ${vagaExame ? formatarDataHoraPt(parseIso(vagaExame.data_hora)) : "definir"}.`,
    pedidoId: pedido.pedido_id,
    doenteId: pedido.doente_id,
    quando,
  });
  return { proposta, consulta: vagaConsulta.data_hora, exame: vagaExame?.data_hora ?? "" };
}
