import { store } from "../store.ts";
import { agora } from "../clock.ts";
import { amanha, apenasData, diferencaDias, formatarDataHoraPt, formatarDataPt, isoDataHora, minData, parseIso, somarDias } from "../util.ts";
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
    const vaga = encontrarVagaLivre(ato.especialidade_codigo, ato.ato_codigo, amanha(hoje), somarDias(hoje, 60));
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
    const sugestao = sugerirVaga(pedido, ato, quando);

    // Que vaga teria este doente se os anteriores do plano não tivessem escolhido primeiro?
    const reservadas = criadas.map((c) => store.vagas.find((v) => v.vaga_id === c.vaga_sugerida_id)).filter((v): v is Vaga => !!v);
    for (const v of reservadas) v.reserva_id = "";
    const semConcorrencia = sugerirVaga(pedido, ato, quando);
    for (const v of reservadas) v.reserva_id = criadas.find((c) => c.vaga_sugerida_id === v.vaga_id)!.proposta_id;
    // Só se explica "a vaga foi para outro" quando isso deixou este doente fora do prazo.
    let perdeu = "";
    if (semConcorrencia.vaga && semConcorrencia.dentro && sugestao.dentro === false && semConcorrencia.vaga.vaga_id !== sugestao.vaga?.vaga_id) {
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
      avisos.push("2.ª remarcação pelo hospital (inevitável: avaria) — ligar ao doente a explicar");
    }
    if (sugestao.dentro === false && sugestao.vaga) avisos.push(`Fica ${sugestao.diasFora} dia(s) fora do prazo — considerar vaga extra ou outsourcing`);
    if (!sugestao.vaga) avisos.push("Sem vaga — precisa de vaga extra ou outsourcing");
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
        (sugestao.vaga
          ? `Sugerido ${formatarDataHoraPt(parseIso(sugestao.vaga.data_hora))}: ${sugestao.motivo.replace(/\.$/, "")}.`
          : `${sugestao.motivo}.`) +
        perdeu,
      avisos,
      estado: "PENDENTE",
      criado_em: isoDataHora(quando),
      decidido_por: "",
      decidido_em: "",
    };
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
    .filter((p) => p.avaria_id === avariaId && p.estado === "PENDENTE")
    .sort((a, b) => a.ordem - b.ordem);
  for (const p of pendentes) aceitarPropostaRemarcacao(p.proposta_id, utilizadorId, quando);
  return pendentes.length;
}

/** Proposta pendente de falta para um pedido (usada pelo botão "Remarcar exame" da ficha do doente). */
export function propostaFaltaPendente(pedidoId: string): PropostaRemarcacao | undefined {
  return store.propostasRemarcacao.find((p) => p.pedido_id === pedidoId && p.origem === "FALTA" && p.estado === "PENDENTE");
}
