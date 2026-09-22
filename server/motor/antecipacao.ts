import { store } from "../store.ts";
import { agora } from "../clock.ts";
import {
  apenasData,
  diferencaDias,
  formatarDataHoraPt,
  formatarDataPt,
  isoData,
  isoDataHora,
  parseIso,
} from "../util.ts";
import { registarEvento } from "./estados.ts";
import { agendar, janelaAgendamento, marcarPedidoNaVaga, vagaBloqueadaPorAvaria } from "./agendamento.ts";
import { dependenciasProntas } from "./dependencias.ts";
import { cancelarLembretes, comunicarMarcacao, comunicarTexto } from "./comunicacoes.ts";
import { notificar, utilizadoresPorPerfil } from "./notificacoes.ts";
import { recalcularAlertas } from "./alertas.ts";
import type { CandidatoAntecipacao, OfertaAntecipacao, Pedido, Vaga } from "../types.ts";

/**
 * Vagas libertadas (ESPECIFICACAO.md secção 8A, R-E). Quando um doente desmarca com aviso, a vaga
 * não fica perdida: o sistema escolhe, por regras, a quem a oferecer — primeiro a quem está sem
 * vaga ou marcado depois do prazo, depois a doentes em diagnóstico que ganham pelo menos uma
 * semana. A oferta é uma proposta ao doente (SMS simulado); só a resposta dele a concretiza.
 */

const ORDEM_ESTADIO: Record<string, number> = { NOVO: 0, PRE_TRATAMENTO: 0, EM_TRATAMENTO: 1, FOLLOW_UP: 2 };

function nomeDoente(doenteId: string): string {
  return store.doentes.find((d) => d.doente_id === doenteId)?.nome ?? doenteId;
}

function horasAte(dataHoraIso: string, quando: Date): number {
  return Math.round((parseIso(dataHoraIso).getTime() - quando.getTime()) / 3600000);
}

/**
 * Lista ordenada de doentes a quem faz sentido oferecer esta vaga. `avisoHoras` decide o universo:
 * > 72 h qualquer candidato; 24–72 h só quem aceita antecipação e mora a < 50 km; < 24 h ninguém de
 * fora (o serviço só pode propor ao balcão a quem já está no hospital nesse dia).
 */
export function procurarAntecipaveis(vaga: Vaga, quando: Date, excluirPedidoIds: string[] = []): CandidatoAntecipacao[] {
  const avisoHoras = horasAte(vaga.data_hora, quando);
  if (avisoHoras < 24) return [];
  const hoje = apenasData(quando);
  const dataVaga = parseIso(vaga.data_hora);
  const diaVaga = apenasData(dataVaga);
  const p = store.parametros;
  const comOfertaPendente = new Set(store.ofertasAntecipacao.filter((o) => o.estado === "PENDENTE").map((o) => o.pedido_id));

  const candidatos: CandidatoAntecipacao[] = [];
  for (const pedido of store.pedidos) {
    if (pedido.especialidade_destino !== vaga.especialidade_codigo) continue;
    if (!vaga.atos_permitidos.includes(pedido.ato_codigo)) continue;
    if (!["MARCADO", "SEM_VAGA", "ACEITE"].includes(pedido.estado)) continue;
    if (excluirPedidoIds.includes(pedido.pedido_id) || comOfertaPendente.has(pedido.pedido_id)) continue;
    if (vagaBloqueadaPorAvaria(vaga, pedido.ato_codigo)) continue;
    if (pedido.continuidade_obrigatoria && pedido.medico_preferido_id && vaga.medico_id && vaga.medico_id !== pedido.medico_preferido_id) continue;
    if (!dependenciasProntas(pedido)) continue;
    if (janelaAgendamento(pedido, hoje).inicio.getTime() > dataVaga.getTime()) continue; // dependências/"não antes"

    const ato = pedido.estado === "MARCADO" ? store.atosMedicos.find((a) => a.mvp_ato_id === pedido.ato_id) : undefined;
    if (pedido.estado === "MARCADO" && (!ato || ato.estado !== "MARCADA")) continue;
    const dataAtual = ato ? apenasData(parseIso(ato.data_hora)) : null;
    if (dataAtual && dataAtual.getTime() <= diaVaga.getTime()) continue; // já está marcado antes
    if (!dataAtual && pedido.estado !== "SEM_VAGA") continue; // ACEITE à espera de agendamento normal
    const diasGanhos = dataAtual ? diferencaDias(dataAtual, diaVaga) : null;
    const prazo = parseIso(pedido.prazo_limite);
    const foraDoPrazo = dataAtual ? dataAtual.getTime() > prazo.getTime() : true;
    const doente = store.doentes.find((d) => d.doente_id === pedido.doente_id);
    const estadio = doente?.estadio_cuidado ?? "";

    let grupo: 1 | 2 | 0 = 0;
    if (foraDoPrazo && (diasGanhos === null || diasGanhos >= p.antecipacao_ganho_min_dias)) grupo = 1;
    else if ((estadio === "NOVO" || estadio === "PRE_TRATAMENTO") && doente?.aceita_antecipacao && (diasGanhos ?? 0) >= p.antecipacao_ganho_diagnostico_dias) grupo = 2;
    if (!grupo) continue;
    if (avisoHoras < 72 && !(doente?.aceita_antecipacao && (doente.distancia_km ?? 0) < 50)) continue;

    const atrasoPrevisto = dataAtual ? diferencaDias(dataAtual, prazo) : diferencaDias(hoje, prazo);
    const nomeEstadio = { NOVO: "em diagnóstico", PRE_TRATAMENTO: "pré-tratamento", EM_TRATAMENTO: "em tratamento", FOLLOW_UP: "follow-up" }[estadio as string] ?? "estádio não registado";
    const motivo =
      grupo === 1
        ? dataAtual
          ? `${nomeEstadio}; marcado a ${formatarDataPt(dataAtual)}, ${atrasoPrevisto} dias depois do prazo (${formatarDataPt(prazo)}) — ganha ${diasGanhos} dias`
          : `${nomeEstadio}; sem vaga, prazo ${formatarDataPt(prazo)}`
        : `${nomeEstadio}; dentro do prazo, mas ganha ${diasGanhos} dias e aceita ser antecipado`;
    candidatos.push({
      pedido_id: pedido.pedido_id,
      doente_id: pedido.doente_id,
      doente_nome: doente?.nome ?? pedido.doente_id,
      estadio_cuidado: estadio,
      prioridade: pedido.prioridade,
      prazo_limite: pedido.prazo_limite,
      data_hora_atual: ato?.data_hora ?? "",
      dias_ganhos: diasGanhos,
      atraso_previsto_dias: atrasoPrevisto,
      grupo,
      motivo,
    });
  }

  // (1) sem vaga / fora do prazo antes de "ganha tempo"; (2) em diagnóstico primeiro; (3) quem
  // ficaria mais dias para lá do prazo (sem vaga = o pior caso); (4) mais dias ganhos.
  candidatos.sort((a, b) => {
    if (a.grupo !== b.grupo) return a.grupo - b.grupo;
    const ea = ORDEM_ESTADIO[a.estadio_cuidado] ?? 2;
    const eb = ORDEM_ESTADIO[b.estadio_cuidado] ?? 2;
    if (ea !== eb) return ea - eb;
    const aa = a.data_hora_atual ? (a.atraso_previsto_dias ?? 0) : Number.MAX_SAFE_INTEGER;
    const ab = b.data_hora_atual ? (b.atraso_previsto_dias ?? 0) : Number.MAX_SAFE_INTEGER;
    if (aa !== ab) return ab - aa;
    return (b.dias_ganhos ?? 0) - (a.dias_ganhos ?? 0);
  });
  return candidatos;
}

/**
 * Uma vaga ficou livre (desmarcação, chamada, antecipação em cascata): regista-a e, se houver
 * candidato, cria uma oferta de antecipação. Devolve a oferta criada, ou null.
 */
export function libertarVaga(
  vaga: Vaga,
  quando: Date,
  origem: string,
  nivelCascata = 0,
  excluirPedidoIds: string[] = [],
): OfertaAntecipacao | null {
  const avisoHoras = horasAte(vaga.data_hora, quando);
  const registoExistente = nivelCascata > 0 || excluirPedidoIds.length > 0;
  const candidatos = procurarAntecipaveis(vaga, quando, excluirPedidoIds);
  if (!registoExistente) {
    store.vagasLibertadas.push({
      vaga_id: vaga.vaga_id,
      especialidade: vaga.especialidade_codigo,
      data_hora: vaga.data_hora,
      libertada_em: isoDataHora(quando),
      aviso_horas: avisoHoras,
      origem,
      desfecho: avisoHoras < 24 ? "CURTO_PRAZO" : candidatos.length ? "OFERTA" : "SEM_CANDIDATO",
    });
  }
  vaga.oferta_id = "";
  const escolhido = candidatos[0];
  if (!escolhido) return null;

  const expira = new Date(quando.getTime() + store.parametros.oferta_resposta_horas * 3600000);
  const oferta: OfertaAntecipacao = {
    oferta_id: store.proximoId("oferta"),
    vaga_id: vaga.vaga_id,
    especialidade: vaga.especialidade_codigo,
    data_hora_vaga: vaga.data_hora,
    pedido_id: escolhido.pedido_id,
    doente_id: escolhido.doente_id,
    data_hora_atual: escolhido.data_hora_atual,
    motivo: escolhido.motivo,
    estado: "PENDENTE",
    criado_em: isoDataHora(quando),
    expira_em: isoDataHora(expira),
    respondido_por: "",
    respondido_em: "",
    nivel_cascata: nivelCascata,
    origem,
    candidatos,
  };
  store.ofertasAntecipacao.push(oferta);
  vaga.oferta_id = oferta.oferta_id;

  const pedido = store.pedidos.find((p) => p.pedido_id === escolhido.pedido_id)!;
  registarEvento(pedido, "OFERTA_ANTECIPACAO", "", "AGENTE", {
    motivo: `Vaga libertada oferecida: ${escolhido.motivo}`,
    detalhe: `${vaga.vaga_id} ${formatarDataHoraPt(parseIso(vaga.data_hora))} (${origem})`,
    dataHora: quando,
  });
  comunicarTexto(
    escolhido.doente_id,
    escolhido.pedido_id,
    "OFERTA",
    `IPO: vagou um horário mais cedo para o seu exame — ${formatarDataHoraPt(parseIso(vaga.data_hora))}` +
      `${escolhido.data_hora_atual ? ` (em vez de ${formatarDataHoraPt(parseIso(escolhido.data_hora_atual))})` : ""}. ` +
      `Responda 1 para aceitar até ${formatarDataHoraPt(expira)}. Se não responder, mantém a marcação actual.`,
    quando,
  );
  notificar({
    tipo: "PEDIDO_MARCADO",
    destinatarios: utilizadoresPorPerfil("ADMINISTRATIVO", vaga.especialidade_codigo),
    titulo: `Vaga libertada oferecida a ${escolhido.doente_nome}`,
    mensagem: `${formatarDataHoraPt(parseIso(vaga.data_hora))} · ${escolhido.motivo}. Aguarda resposta do doente.`,
    pedidoId: escolhido.pedido_id,
    doenteId: escolhido.doente_id,
    quando,
  });
  return oferta;
}

/** Ofertas cujo prazo de resposta passou → EXPIRADA e passa ao candidato seguinte. */
export function expirarOfertas(quando: Date = agora()): void {
  for (const oferta of store.ofertasAntecipacao) {
    if (oferta.estado !== "PENDENTE" || parseIso(oferta.expira_em).getTime() > quando.getTime()) continue;
    oferta.estado = "EXPIRADA";
    oferta.respondido_em = isoDataHora(quando);
    oferta.respondido_por = "SISTEMA";
    passarAoSeguinte(oferta, quando);
  }
}

function jaOferecidos(vagaId: string): string[] {
  return store.ofertasAntecipacao.filter((o) => o.vaga_id === vagaId).map((o) => o.pedido_id);
}

function passarAoSeguinte(oferta: OfertaAntecipacao, quando: Date): OfertaAntecipacao | null {
  const vaga = store.vagas.find((v) => v.vaga_id === oferta.vaga_id);
  if (!vaga || vaga.ato_id) return null;
  vaga.oferta_id = "";
  return libertarVaga(vaga, quando, oferta.origem, oferta.nivel_cascata, jaOferecidos(vaga.vaga_id));
}

/**
 * Resposta do doente (registada pela administrativa; o SMS de resposta é simulado na demo).
 * Aceitar move a marcação para a vaga oferecida — NÃO conta como remarcação pelo hospital, foi o
 * doente que aceitou — e a vaga antiga dele volta a correr a lista (cascata).
 */
export function responderOferta(
  ofertaId: string,
  aceita: boolean,
  utilizadorId: string,
  quando: Date = agora(),
): { oferta: OfertaAntecipacao; seguinte: OfertaAntecipacao | null } | null {
  const oferta = store.ofertasAntecipacao.find((o) => o.oferta_id === ofertaId);
  if (!oferta || oferta.estado !== "PENDENTE") return null;
  oferta.respondido_por = utilizadorId;
  oferta.respondido_em = isoDataHora(quando);
  const vaga = store.vagas.find((v) => v.vaga_id === oferta.vaga_id)!;
  const pedido = store.pedidos.find((p) => p.pedido_id === oferta.pedido_id)!;

  if (!aceita) {
    oferta.estado = "RECUSADA";
    registarEvento(pedido, "OFERTA_ANTECIPACAO", "", utilizadorId, { motivo: "Doente recusou a antecipação", dataHora: quando });
    return { oferta, seguinte: passarAoSeguinte(oferta, quando) };
  }

  oferta.estado = "ACEITE";
  vaga.oferta_id = "";
  let seguinte: OfertaAntecipacao | null = null;
  const atoAtual = pedido.estado === "MARCADO" ? store.atosMedicos.find((a) => a.mvp_ato_id === pedido.ato_id) : undefined;
  if (atoAtual) {
    const vagaAntiga = store.vagas.find((v) => v.vaga_id === atoAtual.mvp_vaga_id);
    const dataAntiga = atoAtual.data_hora;
    if (vagaAntiga) vagaAntiga.ato_id = "";
    atoAtual.data_hora = vaga.data_hora;
    atoAtual.gabinete_codigo = vaga.gabinete_codigo;
    atoAtual.gabinete_descricao = store.gabinetes.find((g) => g.codigo === vaga.gabinete_codigo)?.descricao ?? "";
    atoAtual.mvp_vaga_id = vaga.vaga_id;
    atoAtual.mvp_medico_id = vaga.medico_id;
    atoAtual.data_atualizacao = isoDataHora(quando);
    vaga.ato_id = atoAtual.mvp_ato_id;
    const ganhos = diferencaDias(apenasData(parseIso(dataAntiga)), apenasData(parseIso(vaga.data_hora)));
    const dentro = apenasData(parseIso(vaga.data_hora)).getTime() <= parseIso(pedido.prazo_limite).getTime();
    registarEvento(pedido, "ANTECIPACAO", "", utilizadorId, {
      motivo: `Antecipação aceite pelo doente: ganha ${ganhos} dias${dentro ? ", fica dentro do prazo" : ""} (não conta como remarcação)`,
      detalhe: `de ${formatarDataHoraPt(parseIso(dataAntiga))} para ${formatarDataHoraPt(parseIso(vaga.data_hora))}`,
      dataHora: quando,
    });
    comunicarMarcacao(pedido, atoAtual, "ANTECIPACAO", quando);
    if (vagaAntiga && oferta.nivel_cascata < store.parametros.cascata_max) {
      seguinte = libertarVaga(vagaAntiga, quando, `Antecipação de ${nomeDoente(pedido.doente_id)} (cascata)`, oferta.nivel_cascata + 1);
    } else if (vagaAntiga) {
      store.vagasLibertadas.push({
        vaga_id: vagaAntiga.vaga_id,
        especialidade: vagaAntiga.especialidade_codigo,
        data_hora: vagaAntiga.data_hora,
        libertada_em: isoDataHora(quando),
        aviso_horas: horasAte(vagaAntiga.data_hora, quando),
        origem: "Cascata terminada",
        desfecho: "SEM_CANDIDATO",
      });
    }
  } else {
    if (pedido.estado === "SEM_VAGA") pedido.estado = "ACEITE";
    marcarPedidoNaVaga(pedido, vaga, quando, `Vaga libertada aceite pelo doente (${oferta.origem})`);
  }
  recalcularAlertas(quando);
  return { oferta, seguinte };
}

/**
 * O doente pede para desmarcar (telefonema, resposta "2" ao lembrete, ou chamada da lista). A vaga
 * é libertada primeiro (e oferecida por R-E), só depois o pedido do doente é reagendado a partir da
 * data que ele indicou. Não conta como remarcação pelo hospital.
 */
export function desmarcarAPedidoDoDoente(
  pedido: Pedido,
  utilizadorId: string,
  disponivelAPartirDe: string | null,
  quando: Date = agora(),
): { oferta: OfertaAntecipacao | null; avisoHoras: number } | null {
  const ato = store.atosMedicos.find((a) => a.mvp_ato_id === pedido.ato_id);
  if (pedido.estado !== "MARCADO" || !ato) return null;
  const vaga = store.vagas.find((v) => v.vaga_id === ato.mvp_vaga_id);
  const avisoHoras = horasAte(ato.data_hora, quando);
  if (vaga) vaga.ato_id = "";
  ato.estado = "DESMARCADA";
  ato.data_atualizacao = isoDataHora(quando);
  cancelarLembretes(pedido.pedido_id);
  registarEvento(pedido, "DESMARCACAO", "ACEITE", utilizadorId, {
    motivo: "Desmarcado a pedido do doente (não conta como remarcação pelo hospital)",
    detalhe: `data anterior ${formatarDataHoraPt(parseIso(ato.data_hora))}; aviso de ${Math.round(avisoHoras / 24)} dias${
      disponivelAPartirDe ? `; disponível a partir de ${formatarDataPt(parseIso(disponivelAPartirDe))}` : ""
    }`,
    dataHora: quando,
  });
  pedido.ato_id = "";
  pedido.marcado_em = "";

  const nome = nomeDoente(pedido.doente_id);
  const oferta = vaga
    ? libertarVaga(vaga, quando, `Desmarcação de ${nome} (aviso de ${Math.round(avisoHoras / 24)} dias)`)
    : null;

  if (disponivelAPartirDe) {
    pedido.nao_antes = isoData(parseIso(disponivelAPartirDe));
    agendar(pedido, quando);
  } else {
    comunicarTexto(pedido.doente_id, pedido.pedido_id, "DESMARCACAO", "IPO: a sua marcação foi desmarcada. Contacte-nos quando puder vir.", quando);
  }
  recalcularAlertas(quando);
  return { oferta, avisoHoras };
}

/** Desmarcação de uma marcação que não tem pedido no sistema (ex.: marcada fora do MVP) — liberta a vaga. */
export function desmarcarAtoSemPedido(atoId: string, quando: Date = agora()): OfertaAntecipacao | null {
  const ato = store.atosMedicos.find((a) => a.mvp_ato_id === atoId);
  if (!ato || ato.estado !== "MARCADA") return null;
  const vaga = store.vagas.find((v) => v.vaga_id === ato.mvp_vaga_id);
  ato.estado = "DESMARCADA";
  ato.data_atualizacao = isoDataHora(quando);
  if (!vaga) return null;
  vaga.ato_id = "";
  return libertarVaga(vaga, quando, `Desmarcação de ${nomeDoente(ato.doente_id)} (lista de chamadas)`);
}
