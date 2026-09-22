import { store } from "../store.ts";
import { diferencaDias, parseIso, somarDias } from "../util.ts";
import type { Pedido, Prioridade, TipoPedido } from "../types.ts";

const PESO_NIVEL: Record<Prioridade, number> = { MP: 3, P: 2, N: 1 };

/** Pesos por omissão dos 3 factores da equação (secção "Prioridade" do CLAUDE.md). Cada serviço
 * pode substituir estes pesos pelos seus próprios (server/routes/servico.ts, store.pesosPrioridadePorServico). */
export const PESOS_PRIORIDADE_OMISSAO = { urgencia: 0.5, tipo: 0.3, paciente: 0.2 };

export interface PesosPrioridade {
  urgencia: number;
  tipo: number;
  paciente: number;
}

/** Pesos efectivos de um serviço: os seus, se personalizados, senão os por omissão. */
export function pesosPrioridadeDoServico(
  store: { pesosPrioridadePorServico: Record<string, PesosPrioridade> },
  especialidadeCodigo?: string,
): PesosPrioridade {
  const pesos = especialidadeCodigo ? store.pesosPrioridadePorServico[especialidadeCodigo] : undefined;
  return pesos ?? PESOS_PRIORIDADE_OMISSAO;
}

export interface ResultadoCalculoPrioridade {
  prioridade: Prioridade;
  score: number;
  detalheEquacao: string;
}

/**
 * Equação de Cálculo de Prioridade pelo Sistema.
 * A prioridade é calculada dinamicamente pelo sistema com base em:
 * 1. Urgência clínica e prazos temporais explícitos no plano (<72h => MP)
 * 2. Tipo de ato (quimioterapia / HD, interconsultas de oncologia/cirurgia, exames com contraste)
 * 3. Dados clínicos e estadiamento do paciente (oncologia ativa, estádios III/IV)
 * 4. Prazos SNS e folga calculada
 */
export function calcularPrioridadeSistema(
  dados: {
    tipo_pedido: TipoPedido;
    ato_codigo?: string;
    prazo_dias?: number | null;
    especificacao?: string;
    texto_origem?: string;
    prioridade_sugerida?: Prioridade | null;
  },
  doente?: {
    estadiamento?: string;
    diagnostico_principal?: string;
    estadio_cuidado?: string;
  } | null,
  textoPlano?: string,
  especialidadeCodigo?: string,
): ResultadoCalculoPrioridade {
  const textoCombinado = `${dados.texto_origem || ""} ${dados.especificacao || ""} ${textoPlano || ""}`.toLowerCase();
  
  // 1. Fator Temporal / Urgência
  let pontosUrgencia = 20;
  let motivoUrgencia = "Eletivo standard";

  const prazoDias = dados.prazo_dias;
  if (
    textoCombinado.includes("urgente hoje") ||
    textoCombinado.includes("emergência") ||
    textoCombinado.includes("emergencia") ||
    (prazoDias !== null && prazoDias !== undefined && prazoDias <= 3)
  ) {
    pontosUrgencia = 90;
    motivoUrgencia = "Urgência crítica / Prazo ≤ 3 dias";
  } else if (
    textoCombinado.includes("urgente") ||
    textoCombinado.includes("muito priorit") ||
    textoCombinado.includes("mp") ||
    (prazoDias !== null && prazoDias !== undefined && prazoDias <= 15)
  ) {
    pontosUrgencia = 65;
    motivoUrgencia = "Alta urgência clínica / Prazo ≤ 15 dias";
  } else if (
    dados.prioridade_sugerida === "P" ||
    (prazoDias !== null && prazoDias !== undefined && prazoDias <= 35)
  ) {
    pontosUrgencia = 45;
    motivoUrgencia = "Prazo intermédio ≤ 35 dias";
  } else {
    pontosUrgencia = 20;
    motivoUrgencia = "Rotina / Seguimento programado";
  }

  // 2. Fator Tipo de Pedido & Procedimento
  let pontosTipo = 15;
  let motivoTipo = "Consulta geral";
  switch (dados.tipo_pedido) {
    case "pedido_hd":
      pontosTipo = 30;
      motivoTipo = "Sessão Hospital de Dia / Quimioterapia ativa";
      break;
    case "pedido_consulta":
      pontosTipo = 25;
      motivoTipo = "Interconsulta hospitalar especializada";
      break;
    case "exame":
      if (textoCombinado.includes("contraste") || textoCombinado.includes("tc tap") || textoCombinado.includes("tac")) {
        pontosTipo = 22;
        motivoTipo = "Exame de imagem com contraste / Estadiamento";
      } else {
        pontosTipo = 18;
        motivoTipo = "Exame complementar de diagnóstico";
      }
      break;
    case "analises":
      pontosTipo = 15;
      motivoTipo = "Análises laboratoriais";
      break;
    case "tratamento":
      pontosTipo = 22;
      motivoTipo = "Tratamento / Manutenção CVC";
      break;
    default:
      pontosTipo = 12;
      motivoTipo = "Consulta de revisão";
  }

  // 3. Fator Clínico do Paciente
  let pontosPaciente = 10;
  let motivoPaciente = "Perfil clínico geral";
  const estadiamento = (doente?.estadiamento || "").toLowerCase();
  const diagnostico = (doente?.diagnostico_principal || "").toLowerCase();

  if (
    estadiamento.includes("iv") ||
    estadiamento.includes("iii") ||
    estadiamento.includes("metast") ||
    diagnostico.includes("metast")
  ) {
    pontosPaciente = 25;
    motivoPaciente = "Doente oncológico avançado (Estádio III/IV ou metastático)";
  } else if (
    estadiamento.includes("ii") ||
    diagnostico.includes("neoplasia") ||
    diagnostico.includes("carcinoma") ||
    diagnostico.includes("tumor")
  ) {
    pontosPaciente = 18;
    motivoPaciente = "Neoplasia ativa / Estadiamento intermédio";
  }

  // Estádio do percurso (ESPECIFICACAO.md secção 8A, R-C): em diagnóstico o relógio até ao início
  // do tratamento é o que mais pesa; em tratamento, os intervalos entre ciclos. Máximo de 25 pontos.
  const estadioCuidado = doente?.estadio_cuidado || "";
  const bonusEstadio = estadioCuidado === "NOVO" || estadioCuidado === "PRE_TRATAMENTO" ? 8 : estadioCuidado === "EM_TRATAMENTO" ? 5 : 0;
  if (bonusEstadio > 0) {
    pontosPaciente = Math.min(25, pontosPaciente + bonusEstadio);
    motivoPaciente += estadioCuidado === "EM_TRATAMENTO" ? " + em tratamento" : " + em diagnóstico";
  }

  // Equação do Sistema — pesos por omissão, ou personalizados pelo serviço de destino (secção
  // "Prioridade configurável por serviço"; cada serviço pode valorizar mais um factor que outro).
  const pesos = pesosPrioridadeDoServico(store, especialidadeCodigo);
  const scoreCalculado = Math.min(
    100,
    Math.max(10, Math.round(pontosUrgencia * pesos.urgencia + pontosTipo * pesos.tipo + pontosPaciente * pesos.paciente)),
  );

  let prioridade: Prioridade = "N";
  if (scoreCalculado >= store.parametros.limiar_prioridade_mp || pontosUrgencia >= 85) {
    prioridade = "MP";
  } else if (scoreCalculado >= store.parametros.limiar_prioridade_p || pontosUrgencia >= 60) {
    prioridade = "P";
  } else {
    prioridade = "N";
  }

  const detalheEquacao = `Equação do Sistema: Score ${scoreCalculado}/100 [${motivoUrgencia} (${pontosUrgencia}pts×${pesos.urgencia}) + ${motivoTipo} (${pontosTipo}pts×${pesos.tipo}) + ${motivoPaciente} (${pontosPaciente}pts×${pesos.paciente})] ⇒ Nível ${prioridade}`;

  return {
    prioridade,
    score: scoreCalculado,
    detalheEquacao,
  };
}

/** Prazo por nível (regras_prazos.csv); uma data explícita mais cedo do médico prevalece. */
export function calcularPrazo(
  tipoPedido: TipoPedido,
  prioridade: Prioridade,
  criadoEm: Date,
  prazoExplicito?: Date | null,
): Date {
  const regra = store.regrasPrazos.find((r) => r.tipo_pedido === tipoPedido && r.prioridade === prioridade);
  const dias = regra?.prazo_dias ?? 90;
  const base = somarDias(criadoEm, dias);
  if (prazoExplicito && prazoExplicito.getTime() < base.getTime()) return prazoExplicito;
  return base;
}

/** Mapeamento "1/12", "3/12", "6/12" → nao_antes_dias/prazo_dias, a partir da data da consulta (secção 10). */
const PERIODOS_REVISAO: Record<string, { naoAntesDias: number; prazoDias: number }> = {
  "1/12": { naoAntesDias: 21, prazoDias: 35 },
  "3/12": { naoAntesDias: 80, prazoDias: 100 },
  "6/12": { naoAntesDias: 170, prazoDias: 190 },
};

export function janelaPorPeriodoRevisao(
  codigo: "1/12" | "3/12" | "6/12",
  dataConsulta: Date,
): { naoAntes: Date; prazo: Date } {
  const { naoAntesDias, prazoDias } = PERIODOS_REVISAO[codigo];
  return { naoAntes: somarDias(dataConsulta, naoAntesDias), prazo: somarDias(dataConsulta, prazoDias) };
}

/** folga = prazo − data mínima possível (hoje + tempo necessário para dependências). */
export function folgaDias(pedido: Pedido, dataMinima: Date): number {
  return diferencaDias(parseIso(pedido.prazo_limite), dataMinima);
}

export interface ItemFila {
  pedido: Pedido;
  dataMinima: Date;
}

/**
 * Ordem da fila (secção 8 da especificação): (1) menor folga, (2) nível mais alto,
 * (3) índice de prioridade guardado (server/motor/indice.ts; na falta dele, o score da equação),
 * (4) pedido mais antigo.
 */
export function compararFila(a: ItemFila, b: ItemFila): number {
  const folgaA = folgaDias(a.pedido, a.dataMinima);
  const folgaB = folgaDias(b.pedido, b.dataMinima);
  if (folgaA !== folgaB) return folgaA - folgaB;

  const nivelA = PESO_NIVEL[a.pedido.prioridade];
  const nivelB = PESO_NIVEL[b.pedido.prioridade];
  if (nivelA !== nivelB) return nivelB - nivelA;

  const scoreA = a.pedido.indice_prioridade ?? a.pedido.score_prioridade ?? nivelA * 30;
  const scoreB = b.pedido.indice_prioridade ?? b.pedido.score_prioridade ?? nivelB * 30;
  if (scoreA !== scoreB) return scoreB - scoreA;

  return parseIso(a.pedido.criado_em).getTime() - parseIso(b.pedido.criado_em).getTime();
}

export function ordenarFila(itens: ItemFila[]): ItemFila[] {
  return [...itens].sort(compararFila);
}
