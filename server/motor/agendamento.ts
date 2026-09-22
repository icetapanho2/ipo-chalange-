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
import { ordenarFila, type ItemFila } from "./prioridade.ts";
import { avaliarFactos, factosDoCandidato, justificacaoTroca } from "./remarcacao.ts";
import { comunicarMarcacao } from "./comunicacoes.ts";
import type { AtoMedico, CandidatoTroca, FactosCandidato, Pedido, PropostaTroca, Vaga } from "../types.ts";

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

/**
 * Vagas protegidas (secção 8A, R-D): num serviço com regra em regras_capacidade.csv, uma vaga livre
 * nos próximos `horizonte_protegido_dias` fica guardada para pedidos MP/P, para quem já está fora
 * do prazo, ou para quem tem o prazo dentro desse horizonte. A partir de D-libertar_protegidas_dias
 * fica aberta a todos. Evita que quem pode esperar gaste as vagas de curto prazo — que é o que
 * obriga, mais tarde, a trocas e remarcações. Devolve "" se o pedido pode usar a vaga.
 */
export function motivoVagaProtegida(vaga: Vaga, pedido: Pedido, quando: Date): string {
  const regra = store.regrasCapacidade.find((r) => r.especialidade_codigo === vaga.especialidade_codigo);
  if (!regra) return "";
  const hoje = apenasData(quando);
  const dias = diferencaDias(apenasData(parseIso(vaga.data_hora)), hoje);
  if (dias > regra.horizonte_protegido_dias) return "";
  if (dias <= store.parametros.libertar_protegidas_dias) return "";
  if (regra.niveis_permitidos.includes(pedido.prioridade)) return "";
  if (diferencaDias(parseIso(pedido.prazo_limite), hoje) <= regra.horizonte_protegido_dias) return "";
  return `vaga protegida para pedidos ${regra.niveis_permitidos.join("/")} (próximos ${regra.horizonte_protegido_dias} dias)`;
}

/** Nº de vagas livres compatíveis na janela [inicio, fim] (para detectar sobrelotação antes de faltar vaga a alguém). */
export function contarVagasLivres(especialidadeCodigo: string, atoCodigo: string, inicio: Date, fim: Date): number {
  return store.vagas.filter(
    (v) =>
      v.especialidade_codigo === especialidadeCodigo &&
      !v.ato_id &&
      !v.oferta_id &&
      v.atos_permitidos.includes(atoCodigo) &&
      dentroDaJanela(v.data_hora, inicio, fim) &&
      !vagaBloqueadaPorAvaria(v, atoCodigo),
  ).length;
}

/** Vagas livres compatíveis (especialidade, atos_permitidos, médico se pedido) na janela, por ordem de data. */
export function vagasLivresCompativeis(
  especialidadeCodigo: string,
  atoCodigo: string,
  inicio: Date,
  fim: Date,
  medicoId?: string,
  opts: { pedido?: Pedido; quando?: Date } = {},
): Vaga[] {
  const candidatas = store.vagas.filter(
    (v) =>
      v.especialidade_codigo === especialidadeCodigo &&
      !v.ato_id &&
      !v.oferta_id &&
      v.atos_permitidos.includes(atoCodigo) &&
      dentroDaJanela(v.data_hora, inicio, fim) &&
      (!medicoId || v.medico_id === medicoId) &&
      !vagaBloqueadaPorAvaria(v, atoCodigo) &&
      !(opts.pedido && motivoVagaProtegida(v, opts.pedido, opts.quando ?? agora())),
  );
  candidatas.sort((a, b) => a.data_hora.localeCompare(b.data_hora));
  return candidatas;
}

/** Primeira vaga livre compatível (especialidade, atos_permitidos, médico se pedido) na janela [inicio, fim]. */
export function encontrarVagaLivre(
  especialidadeCodigo: string,
  atoCodigo: string,
  inicio: Date,
  fim: Date,
  medicoId?: string,
  opts: { pedido?: Pedido; quando?: Date } = {},
): Vaga | null {
  return vagasLivresCompativeis(especialidadeCodigo, atoCodigo, inicio, fim, medicoId, opts)[0] ?? null;
}

const MINUTOS_ENTRE_MARCACOES = 30;
const HORA_MINIMA_LONGE = 10;

/**
 * Dia único (secção 8A, R-H): para um doente que mora a >= distancia_agrupar_km, prefere uma vaga
 * num dia em que ele já vem ao hospital (com >= 30 min de intervalo das outras marcações). Entre
 * vagas do mesmo dia, evita as de antes das 10:00. Nunca sai da janela (logo, nunca do prazo).
 */
function vagaDiaUnico(
  pedido: Pedido,
  inicio: Date,
  fim: Date,
  medicoId: string | undefined,
  quando: Date,
): { vaga: Vaga; motivo: string } | null {
  const doente = store.doentes.find((d) => d.doente_id === pedido.doente_id);
  if (!doente || (doente.distancia_km ?? 0) < store.parametros.distancia_agrupar_km) return null;
  const outras = store.atosMedicos.filter(
    (a) => a.doente_id === pedido.doente_id && a.estado === "MARCADA" && dentroDaJanela(a.data_hora, inicio, fim),
  );
  const dias = [...new Set(outras.map((a) => a.data_hora.slice(0, 10)))].sort();
  for (const dia of dias) {
    const d = parseIso(dia);
    const noDia = outras.filter((a) => a.data_hora.startsWith(dia));
    const livres = vagasLivresCompativeis(pedido.especialidade_destino, pedido.ato_codigo, maxData(inicio, d) ?? d, d, medicoId, {
      pedido,
      quando,
    }).filter((v) => {
      const ini = parseIso(v.data_hora).getTime();
      const fimV = ini + v.duracao_min * 60000;
      return noDia.every((a) => {
        const aIni = parseIso(a.data_hora).getTime();
        const aFim = aIni + a.duracao_min * 60000;
        return ini >= aFim + MINUTOS_ENTRE_MARCACOES * 60000 || fimV + MINUTOS_ENTRE_MARCACOES * 60000 <= aIni;
      });
    });
    const vaga = livres.find((v) => parseIso(v.data_hora).getHours() >= HORA_MINIMA_LONGE) ?? livres[0];
    if (vaga) {
      const outrasTxt = noDia
        .map((a) => `${a.ato_descricao || a.especialidade_descricao} às ${a.data_hora.slice(11, 16)}`)
        .join(" e ");
      return {
        vaga,
        motivo: `Dia único: marcado a ${formatarDataPt(d)}, dia em que já vem ao hospital (${outrasTxt}). Mora em ${doente.concelho} (${doente.distancia_km} km): evita uma deslocação.`,
      };
    }
  }
  return null;
}

/** Para doentes de longe, dentro do mesmo dia evita vagas antes das 10:00 (R-H). */
function preferirHoraTardiaSeLonge(pedido: Pedido, vaga: Vaga | null, inicio: Date, fim: Date, medicoId: string | undefined, quando: Date): Vaga | null {
  if (!vaga || parseIso(vaga.data_hora).getHours() >= HORA_MINIMA_LONGE) return vaga;
  const doente = store.doentes.find((d) => d.doente_id === pedido.doente_id);
  if (!doente || (doente.distancia_km ?? 0) < store.parametros.distancia_agrupar_km) return vaga;
  const dia = apenasData(parseIso(vaga.data_hora));
  const alternativa = vagasLivresCompativeis(pedido.especialidade_destino, pedido.ato_codigo, maxData(inicio, dia) ?? dia, dia, medicoId, {
    pedido,
    quando,
  }).find((v) => parseIso(v.data_hora).getHours() >= HORA_MINIMA_LONGE && apenasData(parseIso(v.data_hora)).getTime() <= apenasData(fim).getTime());
  return alternativa ?? vaga;
}

export function marcarPedidoNaVaga(pedido: Pedido, vaga: Vaga, quando: Date, motivo = ""): AtoMedico {
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
    motivo,
    detalhe: `${vaga.vaga_id} ${formatarDataHoraPt(parseIso(vaga.data_hora))}`,
    dataHora: quando,
  });
  comunicarMarcacao(pedido, ato, "MARCACAO", quando);
  return ato;
}

/** Agenda um único pedido ACEITE: vaga directa, troca segura, ou SEM_VAGA (secção 10). */
export function agendar(pedido: Pedido, quando: Date = agora()): ResultadoAgendamento {
  if (pedido.estado !== "ACEITE" && pedido.estado !== "SEM_VAGA") return { tipo: "ESTADO_INVALIDO" };
  if (!dependenciasProntas(pedido)) return { tipo: "AGUARDA_DEPENDENCIA" };

  const hoje = apenasData(quando);
  const { inicio, fim } = janelaAgendamento(pedido, hoje);
  const medicoFiltro = pedido.continuidade_obrigatoria ? pedido.medico_preferido_id || undefined : undefined;

  const opts = { pedido, quando };
  const diaUnico = vagaDiaUnico(pedido, inicio, fim, medicoFiltro, quando) ?? (medicoFiltro ? vagaDiaUnico(pedido, inicio, fim, undefined, quando) : null);
  let vaga = diaUnico?.vaga ?? encontrarVagaLivre(pedido.especialidade_destino, pedido.ato_codigo, inicio, fim, medicoFiltro, opts);
  let medicoUsado = medicoFiltro;
  if (!vaga && medicoFiltro) {
    // sem vaga com o médico de continuidade -> repetir com qualquer médico (passo 3)
    vaga = encontrarVagaLivre(pedido.especialidade_destino, pedido.ato_codigo, inicio, fim, undefined, opts);
    medicoUsado = undefined;
  }
  if (!diaUnico) vaga = preferirHoraTardiaSeLonge(pedido, vaga, inicio, fim, medicoUsado, quando);

  if (vaga) {
    const ato = marcarPedidoNaVaga(pedido, vaga, quando, diaUnico?.motivo ?? "");
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
/**
 * Todos os doentes marcados na janela que poderiam ceder a vaga, avaliados pelas regras da secção
 * 8A (exclusões R-A + custo R-B). Não altera o estado — usada tanto pela troca segura como pelo
 * Laboratório de prioridades (/api/prioridades/simular), para a demo mostrar a lógica real.
 */
export function factosCandidatosTroca(pedidoUrgente: Pedido, inicio: Date, fim: Date, quando: Date): FactosCandidato[] {
  const factos: FactosCandidato[] = [];
  for (const ato of store.atosMedicos) {
    if (ato.especialidade_codigo !== pedidoUrgente.especialidade_destino) continue;
    if (ato.estado !== "MARCADA") continue;
    if (ato.doente_id === pedidoUrgente.doente_id) continue;
    if (!dentroDaJanela(ato.data_hora, inicio, fim)) continue;
    const vagaOrigem = store.vagas.find((v) => v.vaga_id === ato.mvp_vaga_id);
    if (!vagaOrigem || !vagaOrigem.atos_permitidos.includes(pedidoUrgente.ato_codigo)) continue;
    const pedidoOcupante = store.pedidos.find((p) => p.pedido_id === ato.mvp_pedido_id);
    if (!pedidoOcupante) continue; // marcação sem pedido no sistema: não sabemos o prazo, não se mexe

    const medicoOcupante = pedidoOcupante.continuidade_obrigatoria ? pedidoOcupante.medico_preferido_id || undefined : undefined;
    const vagaDestino = encontrarVagaLivre(
      pedidoOcupante.especialidade_destino,
      pedidoOcupante.ato_codigo,
      amanha(apenasData(quando)),
      parseIso(pedidoOcupante.prazo_limite),
      medicoOcupante,
      { pedido: pedidoOcupante, quando },
    );
    factos.push(factosDoCandidato(ato, pedidoOcupante, vagaDestino, quando));
  }
  return factos;
}

export function avaliarCandidatosTroca(pedidoUrgente: Pedido, inicio: Date, fim: Date, quando: Date): CandidatoTroca[] {
  return avaliarFactos(factosCandidatosTroca(pedidoUrgente, inicio, fim, quando));
}

function procurarTrocaSegura(
  pedidoUrgente: Pedido,
  inicio: Date,
  fim: Date,
  quando: Date,
): PropostaTroca | null {
  const avaliacao = avaliarCandidatosTroca(pedidoUrgente, inicio, fim, quando);
  const escolhido = avaliacao.find((c) => c.escolhido);
  if (!escolhido) return null;
  const regraAntiga = avaliacao.find((c) => c.escolhido_regra_antiga);

  const proposta: PropostaTroca = {
    proposta_id: store.proximoId("proposta"),
    pedido_urgente: pedidoUrgente.pedido_id,
    ato_a_mover: escolhido.ato_id,
    vaga_origem: escolhido.vaga_origem_id,
    vaga_destino: escolhido.vaga_destino_id,
    justificacao: justificacaoTroca(avaliacao),
    estado: "PENDENTE",
    decidido_por: "",
    decidido_em: "",
    criado_em: isoDataHora(quando),
    especialidade: pedidoUrgente.especialidade_destino,
    avaliacao,
    escolhido_regra_antiga: regraAntiga?.doente_nome ?? "",
  };
  store.propostasTroca.push(proposta);
  registarEvento(pedidoUrgente, "PROPOSTA_TROCA", "", "AGENTE", {
    motivo: "Sem vaga directa; proposta de troca segura gerada",
    detalhe: proposta.proposta_id,
    dataHora: quando,
  });
  return proposta;
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
  comunicarMarcacao(pedidoOcupante, atoOcupante, "REMARCACAO", quando);

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
