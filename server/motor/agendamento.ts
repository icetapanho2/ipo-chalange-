import { store } from "../store.ts";
import { agora } from "../clock.ts";
import {
  amanha,
  apenasData,
  diferencaDias,
  formatarDataHoraPt,
  formatarDataPt,
  isoDataHora,
  maxData,
  parseIso,
  proximoDiaUtil,
  somarDias,
} from "../util.ts";
import { registarEvento } from "./estados.ts";
import { dataMinimaPorDependencias, dependenciasProntas, criarDependencia, criarPedidoColheitaPreQt } from "./dependencias.ts";
import { folgaDias, ordenarFila, type ItemFila } from "./prioridade.ts";
import type { AtoMedico, Pedido, PropostaTroca, Vaga } from "../types.ts";

export type ResultadoAgendamento =
  | { tipo: "MARCADO"; ato: AtoMedico }
  | { tipo: "PROPOSTA_TROCA"; proposta: PropostaTroca }
  | { tipo: "SEM_VAGA" }
  | { tipo: "AGUARDA_DEPENDENCIA" }
  | { tipo: "ESTADO_INVALIDO" };

/** Início/fim da janela de agendamento (secção 10.1). Sessões de HD só podem começar amanhã + 1 dia útil. */
export function janelaAgendamento(pedido: Pedido, hoje: Date): { inicio: Date; fim: Date } {
  let inicioBase = amanha(hoje);
  if (pedido.tipo_pedido === "pedido_hd") inicioBase = proximoDiaUtil(inicioBase);
  const naoAntes = pedido.nao_antes ? parseIso(pedido.nao_antes) : null;
  const depsMin = dependenciasProntas(pedido) ? dataMinimaPorDependencias(pedido) : null;
  const inicio = maxData(inicioBase, naoAntes, depsMin) ?? inicioBase;
  const fim = parseIso(pedido.prazo_limite);
  return { inicio, fim };
}

function dentroDaJanela(dataHoraIso: string, inicio: Date, fim: Date): boolean {
  const dh = parseIso(dataHoraIso);
  return dh.getTime() >= inicio.getTime() && apenasData(dh).getTime() <= apenasData(fim).getTime();
}

/** Uma avaria ABERTA (N2) tira temporariamente do pool as vagas do serviço (ou só de um acto) na sua janela. */
export function vagaBloqueadaPorAvaria(vaga: Vaga, atoCodigo: string): boolean {
  return store.avarias.some((av) => {
    if (av.estado !== "ABERTA" || av.especialidade_codigo !== vaga.especialidade_codigo) return false;
    if (av.ato_codigo && av.ato_codigo !== atoCodigo) return false;
    const inicio = parseIso(av.criado_em);
    const fim = somarDias(inicio, av.duracao_dias);
    const dh = parseIso(vaga.data_hora);
    return dh.getTime() >= inicio.getTime() && dh.getTime() <= fim.getTime();
  });
}

/** Nº de vagas livres compatíveis na janela [inicio, fim] (para detectar sobrelotação antes de faltar vaga a alguém). */
export function contarVagasLivres(especialidadeCodigo: string, atoCodigo: string, inicio: Date, fim: Date): number {
  return store.vagas.filter(
    (v) =>
      v.especialidade_codigo === especialidadeCodigo &&
      !v.ato_id &&
      v.atos_permitidos.includes(atoCodigo) &&
      dentroDaJanela(v.data_hora, inicio, fim) &&
      !vagaBloqueadaPorAvaria(v, atoCodigo),
  ).length;
}

/** Primeira vaga livre compatível (especialidade, atos_permitidos, médico se pedido) na janela [inicio, fim]. */
export function encontrarVagaLivre(
  especialidadeCodigo: string,
  atoCodigo: string,
  inicio: Date,
  fim: Date,
  medicoId?: string,
): Vaga | null {
  const candidatas = store.vagas.filter(
    (v) =>
      v.especialidade_codigo === especialidadeCodigo &&
      !v.ato_id &&
      v.atos_permitidos.includes(atoCodigo) &&
      dentroDaJanela(v.data_hora, inicio, fim) &&
      (!medicoId || v.medico_id === medicoId) &&
      !vagaBloqueadaPorAvaria(v, atoCodigo),
  );
  candidatas.sort((a, b) => a.data_hora.localeCompare(b.data_hora));
  return candidatas[0] ?? null;
}

function marcarPedidoNaVaga(pedido: Pedido, vaga: Vaga, quando: Date): AtoMedico {
  const catalogo = store.catalogoAtos.find(
    (c) => c.especialidade_codigo === vaga.especialidade_codigo && c.ato_codigo === pedido.ato_codigo,
  );
  const especialidade = store.especialidades.find((e) => e.codigo === vaga.especialidade_codigo);
  const gabinete = store.gabinetes.find((g) => g.codigo === vaga.gabinete_codigo);
  const ato: AtoMedico = {
    mvp_ato_id: store.proximoId("ato"),
    doente_id: pedido.doente_id,
    estado: "MARCADA",
    data_hora: vaga.data_hora,
    duracao_min: vaga.duracao_min,
    especialidade_codigo: vaga.especialidade_codigo,
    especialidade_descricao: especialidade?.descricao ?? "",
    gabinete_codigo: vaga.gabinete_codigo,
    gabinete_descricao: gabinete?.descricao ?? "",
    ato_codigo: pedido.ato_codigo,
    ato_descricao: catalogo?.ato_descricao ?? "",
    data_criacao: isoDataHora(quando),
    data_atualizacao: isoDataHora(quando),
    exames: pedido.exames.map((codigo) => ({
      codigo_exame: codigo,
      descricao_exame: store.exames.find((e) => e.codigo_exame === codigo)?.descricao_exame ?? "",
    })),
    tipo_atividade: catalogo?.tipo_atividade ?? "",
    tipo_ato_medico: catalogo?.tipo_ato_medico ?? "",
    mvp_medico_id: vaga.medico_id,
    mvp_vaga_id: vaga.vaga_id,
    mvp_pedido_id: pedido.pedido_id,
    mvp_prazo_limite: pedido.prazo_limite,
    mvp_prioridade: pedido.prioridade,
    mvp_n_remarcacoes: pedido.n_remarcacoes,
  };
  store.atosMedicos.push(ato);
  vaga.ato_id = ato.mvp_ato_id;
  pedido.marcado_em = isoDataHora(quando);
  pedido.ato_id = ato.mvp_ato_id;
  registarEvento(pedido, "MARCACAO", "MARCADO", "AGENTE", {
    detalhe: `${vaga.vaga_id} ${formatarDataHoraPt(parseIso(vaga.data_hora))}`,
    dataHora: quando,
  });
  return ato;
}

/** Agenda um único pedido ACEITE: vaga directa, troca segura, ou SEM_VAGA (secção 10). */
export function agendar(pedido: Pedido, quando: Date = agora()): ResultadoAgendamento {
  if (pedido.estado !== "ACEITE" && pedido.estado !== "SEM_VAGA") return { tipo: "ESTADO_INVALIDO" };
  if (!dependenciasProntas(pedido)) return { tipo: "AGUARDA_DEPENDENCIA" };

  const hoje = apenasData(quando);
  const { inicio, fim } = janelaAgendamento(pedido, hoje);
  const medicoFiltro = pedido.continuidade_obrigatoria ? pedido.medico_preferido_id || undefined : undefined;

  let vaga = encontrarVagaLivre(pedido.especialidade_destino, pedido.ato_codigo, inicio, fim, medicoFiltro);
  if (!vaga && medicoFiltro) {
    // sem vaga com o médico de continuidade -> repetir com qualquer médico (passo 3)
    vaga = encontrarVagaLivre(pedido.especialidade_destino, pedido.ato_codigo, inicio, fim);
  }

  if (vaga) {
    const ato = marcarPedidoNaVaga(pedido, vaga, quando);
    if (pedido.tipo_pedido === "pedido_hd") aplicarR2EAgendar(pedido, quando);
    return { tipo: "MARCADO", ato };
  }

  const proposta = procurarTrocaSegura(pedido, inicio, fim, quando);
  if (proposta) return { tipo: "PROPOSTA_TROCA", proposta };

  pedido.estado = "SEM_VAGA";
  registarEvento(pedido, "SEM_VAGA", "SEM_VAGA", "AGENTE", {
    motivo: "Sem vaga livre nem troca segura possível dentro do prazo",
    dataHora: quando,
  });
  return { tipo: "SEM_VAGA" };
}

/** Agenda vários pedidos ACEITE respeitando dependências (topológico) e a ordem da fila. */
export function agendarLote(pedidoIds: string[], quando: Date = agora()): Map<string, ResultadoAgendamento> {
  const resultados = new Map<string, ResultadoAgendamento>();
  const pendentes = new Set(pedidoIds);
  let progresso = true;
  while (pendentes.size > 0 && progresso) {
    progresso = false;
    const prontos = [...pendentes]
      .map((id) => store.pedidos.find((p) => p.pedido_id === id))
      .filter((p): p is Pedido => !!p && dependenciasProntas(p));
    if (prontos.length === 0) break;
    const hoje = apenasData(quando);
    const itens: ItemFila[] = prontos.map((pedido) => ({ pedido, dataMinima: janelaAgendamento(pedido, hoje).inicio }));
    for (const item of ordenarFila(itens)) {
      resultados.set(item.pedido.pedido_id, agendar(item.pedido, quando));
      pendentes.delete(item.pedido.pedido_id);
      progresso = true;
    }
  }
  return resultados;
}

// ---------------------------------------------------------------- troca segura
interface CandidatoTroca {
  atoOcupante: AtoMedico;
  pedidoOcupante: Pedido;
  vagaOrigem: Vaga;
  vagaDestino: Vaga;
}

function procurarTrocaSegura(
  pedidoUrgente: Pedido,
  inicio: Date,
  fim: Date,
  quando: Date,
): PropostaTroca | null {
  const congelamentoDias = store.parametros.congelamento_dias;
  const candidatos: CandidatoTroca[] = [];

  for (const ato of store.atosMedicos) {
    if (ato.especialidade_codigo !== pedidoUrgente.especialidade_destino) continue;
    if (ato.estado !== "MARCADA") continue;
    if (!dentroDaJanela(ato.data_hora, inicio, fim)) continue;
    const vagaOrigem = store.vagas.find((v) => v.vaga_id === ato.mvp_vaga_id);
    if (!vagaOrigem || !vagaOrigem.atos_permitidos.includes(pedidoUrgente.ato_codigo)) continue;
    if (diferencaDias(apenasData(parseIso(ato.data_hora)), apenasData(quando)) <= congelamentoDias) continue; // (a)

    const pedidoOcupante = store.pedidos.find((p) => p.pedido_id === ato.mvp_pedido_id);
    if (!pedidoOcupante) continue;

    const medicoOcupante = pedidoOcupante.continuidade_obrigatoria ? pedidoOcupante.medico_preferido_id || undefined : undefined;
    const vagaDestino = encontrarVagaLivre(
      pedidoOcupante.especialidade_destino,
      pedidoOcupante.ato_codigo,
      amanha(apenasData(quando)),
      parseIso(pedidoOcupante.prazo_limite),
      medicoOcupante,
    );
    if (!vagaDestino) continue; // (b) sem alternativa sem ultrapassar o próprio prazo

    candidatos.push({ atoOcupante: ato, pedidoOcupante, vagaOrigem, vagaDestino });
  }

  if (candidatos.length === 0) return null;

  candidatos.sort((a, b) => {
    const folgaA = folgaDias(a.pedidoOcupante, apenasData(quando));
    const folgaB = folgaDias(b.pedidoOcupante, apenasData(quando));
    if (folgaA !== folgaB) return folgaB - folgaA; // maior folga primeiro
    if (a.pedidoOcupante.n_remarcacoes !== b.pedidoOcupante.n_remarcacoes) {
      return a.pedidoOcupante.n_remarcacoes - b.pedidoOcupante.n_remarcacoes; // menos remarcações primeiro
    }
    const marcadoA = a.pedidoOcupante.marcado_em ? parseIso(a.pedidoOcupante.marcado_em).getTime() : 0;
    const marcadoB = b.pedidoOcupante.marcado_em ? parseIso(b.pedidoOcupante.marcado_em).getTime() : 0;
    return marcadoB - marcadoA; // marcada há menos tempo primeiro (mais recente)
  });

  const escolhido = candidatos[0];
  const proposta: PropostaTroca = {
    proposta_id: store.proximoId("proposta"),
    pedido_urgente: pedidoUrgente.pedido_id,
    ato_a_mover: escolhido.atoOcupante.mvp_ato_id,
    vaga_origem: escolhido.vagaOrigem.vaga_id,
    vaga_destino: escolhido.vagaDestino.vaga_id,
    justificacao: gerarJustificacaoTroca(escolhido),
    estado: "PENDENTE",
    decidido_por: "",
    decidido_em: "",
    criado_em: isoDataHora(quando),
    especialidade: pedidoUrgente.especialidade_destino,
  };
  store.propostasTroca.push(proposta);
  registarEvento(pedidoUrgente, "PROPOSTA_TROCA", "", "AGENTE", {
    motivo: "Sem vaga directa; proposta de troca segura gerada",
    detalhe: proposta.proposta_id,
    dataHora: quando,
  });
  return proposta;
}

function gerarJustificacaoTroca(c: CandidatoTroca): string {
  const doente = store.doentes.find((d) => d.doente_id === c.atoOcupante.doente_id);
  const dataOrigem = formatarDataPt(parseIso(c.vagaOrigem.data_hora));
  const dataDestino = formatarDataPt(parseIso(c.vagaDestino.data_hora));
  const prazoTxt = formatarDataPt(parseIso(c.pedidoOcupante.prazo_limite));
  return `Vaga de ${dataOrigem} cedida por ${doente?.nome ?? c.atoOcupante.doente_id}: prazo até ${prazoTxt}, passa para ${dataDestino}`;
}

/** O serviço aprova a troca: desloca o ocupante e marca o pedido urgente na vaga libertada. */
export function aprovarPropostaTroca(propostaId: string, utilizadorId: string, quando: Date = agora()): void {
  const proposta = store.propostasTroca.find((p) => p.proposta_id === propostaId);
  if (!proposta || proposta.estado !== "PENDENTE") return;
  const atoOcupante = store.atosMedicos.find((a) => a.mvp_ato_id === proposta.ato_a_mover);
  const vagaOrigem = store.vagas.find((v) => v.vaga_id === proposta.vaga_origem);
  const vagaDestino = store.vagas.find((v) => v.vaga_id === proposta.vaga_destino);
  const pedidoOcupante = atoOcupante ? store.pedidos.find((p) => p.pedido_id === atoOcupante.mvp_pedido_id) : undefined;
  const pedidoUrgente = store.pedidos.find((p) => p.pedido_id === proposta.pedido_urgente);
  if (!atoOcupante || !vagaOrigem || !vagaDestino || !pedidoOcupante || !pedidoUrgente) return;

  const dataAntiga = atoOcupante.data_hora;
  vagaOrigem.ato_id = "";
  atoOcupante.data_hora = vagaDestino.data_hora;
  atoOcupante.gabinete_codigo = vagaDestino.gabinete_codigo;
  atoOcupante.gabinete_descricao = store.gabinetes.find((g) => g.codigo === vagaDestino.gabinete_codigo)?.descricao ?? "";
  atoOcupante.mvp_vaga_id = vagaDestino.vaga_id;
  atoOcupante.mvp_medico_id = vagaDestino.medico_id;
  atoOcupante.mvp_n_remarcacoes += 1;
  atoOcupante.data_atualizacao = isoDataHora(quando);
  vagaDestino.ato_id = atoOcupante.mvp_ato_id;
  pedidoOcupante.n_remarcacoes += 1;
  registarEvento(pedidoOcupante, "REMARCACAO", pedidoOcupante.estado, "SISTEMA", {
    motivo: "Troca segura aprovada",
    detalhe: `de ${formatarDataHoraPt(parseIso(dataAntiga))} para ${formatarDataHoraPt(parseIso(atoOcupante.data_hora))}`,
    dataHora: quando,
  });

  marcarPedidoNaVaga(pedidoUrgente, vagaOrigem, quando);
  if (pedidoUrgente.tipo_pedido === "pedido_hd") aplicarR2EAgendar(pedidoUrgente, quando);

  proposta.estado = "APROVADA";
  proposta.decidido_por = utilizadorId;
  proposta.decidido_em = isoDataHora(quando);
}

export function rejeitarPropostaTroca(propostaId: string, utilizadorId: string, quando: Date = agora()): void {
  const proposta = store.propostasTroca.find((p) => p.proposta_id === propostaId);
  if (!proposta || proposta.estado !== "PENDENTE") return;
  proposta.estado = "REJEITADA";
  proposta.decidido_por = utilizadorId;
  proposta.decidido_em = isoDataHora(quando);
  const pedidoUrgente = store.pedidos.find((p) => p.pedido_id === proposta.pedido_urgente);
  if (pedidoUrgente && pedidoUrgente.estado === "ACEITE") {
    pedidoUrgente.estado = "SEM_VAGA";
    registarEvento(pedidoUrgente, "SEM_VAGA", "SEM_VAGA", "AGENTE", {
      motivo: "Proposta de troca rejeitada",
      dataHora: quando,
    });
  }
}

// ---------------------------------------------------------------- R2 (HD)
function aplicarR2EAgendar(pedidoHd: Pedido, quando: Date): void {
  const atoHd = store.atosMedicos.find((a) => a.mvp_ato_id === pedidoHd.ato_id);
  if (!atoHd) return;
  const dataHd = apenasData(parseIso(atoHd.data_hora));
  const hoje = apenasData(quando);
  const inicio = maxData(amanha(hoje), somarDias(dataHd, -3)) ?? amanha(hoje);
  const fim = somarDias(dataHd, -1);

  const colheita = criarPedidoColheitaPreQt(pedidoHd);
  criarDependencia(pedidoHd, colheita, 0, "REGRA", "R2");

  if (inicio.getTime() > fim.getTime()) {
    colheita.estado = "SEM_VAGA";
    registarEvento(colheita, "SEM_VAGA", "SEM_VAGA", "AGENTE", {
      motivo: "Sem janela possível para a colheita antes da sessão de HD",
      dataHora: quando,
    });
    return;
  }
  const vaga = encontrarVagaLivre(colheita.especialidade_destino, colheita.ato_codigo, inicio, fim);
  if (vaga) {
    marcarPedidoNaVaga(colheita, vaga, quando);
  } else {
    colheita.estado = "SEM_VAGA";
    registarEvento(colheita, "SEM_VAGA", "SEM_VAGA", "AGENTE", {
      motivo: "Sem vaga de colheita na janela pré-HD",
      dataHora: quando,
    });
  }
}
