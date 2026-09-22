import { store } from "../store.ts";
import { apenasData, diferencaDias, isoData, parseIso, somarDias } from "../util.ts";
import type {
  AtoMedico,
  CandidatoTroca,
  ContactoDigital,
  Doente,
  EstadioCuidado,
  FactosCandidato,
  ParcelaCusto,
  Pedido,
} from "../types.ts";

/**
 * Regras de remarcação (ESPECIFICACAO.md secção 8A): quem pode ceder a vaga a um pedido mais
 * urgente (restrições duras R-A) e, entre os que podem, a quem custa menos mudar a marcação
 * (custo R-B). Funções puras e determinísticas; os pesos vêm de parametros.csv.
 */

/** Motivos de remarcação que NÃO contam como remarcação pelo hospital (foi o doente que faltou/pediu). */
const MOTIVO_DO_DOENTE = /doente|falta/i;

export function idadeDoente(doente: Pick<Doente, "data_nascimento"> | undefined, hoje: Date): number {
  if (!doente?.data_nascimento) return 0;
  const n = parseIso(doente.data_nascimento);
  let idade = hoje.getFullYear() - n.getFullYear();
  if (hoje.getMonth() < n.getMonth() || (hoje.getMonth() === n.getMonth() && hoje.getDate() < n.getDate())) idade -= 1;
  return idade;
}

/** Remarcações por iniciativa do hospital (troca, avaria, médico indisponível) nos últimos 90 dias. */
export function remarcacoesHospital(doenteId: string, quando: Date): number {
  const pedidosDoDoente = new Set(store.pedidos.filter((p) => p.doente_id === doenteId).map((p) => p.pedido_id));
  const desde = somarDias(quando, -90).getTime();
  return store.eventos.filter(
    (e) =>
      e.tipo === "REMARCACAO" &&
      pedidosDoDoente.has(e.pedido_id) &&
      !MOTIVO_DO_DOENTE.test(e.motivo) &&
      parseIso(e.data_hora).getTime() >= desde,
  ).length;
}

/** O doente tem outra marcação no hospital no mesmo dia (dia agrupado). */
export function temOutraMarcacaoNoDia(doenteId: string, dataHoraIso: string, excluirAtoId: string): boolean {
  const dia = dataHoraIso.slice(0, 10);
  return store.atosMedicos.some(
    (a) => a.doente_id === doenteId && a.mvp_ato_id !== excluirAtoId && a.estado === "MARCADA" && a.data_hora.startsWith(dia),
  );
}

export interface PesosCusto {
  custo_idade_75: number;
  custo_sem_contacto_digital: number;
  custo_distancia_50km: number;
  custo_distancia_150km: number;
  custo_transporte: number;
  custo_dia_agrupado: number;
  custo_estadio_novo: number;
  bonus_folga_max: number;
  max_remarcacoes_hospital: number;
}

export function pesosCusto(sobreposicao: Partial<PesosCusto> = {}): PesosCusto {
  const p = store.parametros;
  return {
    custo_idade_75: p.custo_idade_75,
    custo_sem_contacto_digital: p.custo_sem_contacto_digital,
    custo_distancia_50km: p.custo_distancia_50km,
    custo_distancia_150km: p.custo_distancia_150km,
    custo_transporte: p.custo_transporte,
    custo_dia_agrupado: p.custo_dia_agrupado,
    custo_estadio_novo: p.custo_estadio_novo,
    bonus_folga_max: p.bonus_folga_max,
    max_remarcacoes_hospital: p.max_remarcacoes_hospital,
    ...sobreposicao,
  };
}

/** Atributos de um candidato que o Laboratório de prioridades pode alterar temporariamente. */
export type SobreposicaoFactos = Partial<
  Pick<
    FactosCandidato,
    "idade" | "distancia_km" | "contacto_digital" | "transporte_nao_urgente" | "dia_agrupado" | "estadio_cuidado" | "remarcacoes_hospital"
  >
>;

/** Recolhe os factos de um candidato (a marcação `ato`, que ocupa a vaga pretendida). */
export function factosDoCandidato(
  ato: AtoMedico,
  pedidoOcupante: Pedido,
  vagaDestino: { vaga_id: string; data_hora: string } | null,
  quando: Date,
): FactosCandidato {
  const hoje = apenasData(quando);
  const doente = store.doentes.find((d) => d.doente_id === ato.doente_id);
  return {
    ato_id: ato.mvp_ato_id,
    pedido_id: pedidoOcupante.pedido_id,
    doente_id: ato.doente_id,
    doente_nome: doente?.nome ?? ato.doente_id,
    data_hora: ato.data_hora,
    vaga_origem_id: ato.mvp_vaga_id,
    vaga_destino_id: vagaDestino?.vaga_id ?? "",
    data_destino: vagaDestino?.data_hora ?? "",
    prazo_limite: pedidoOcupante.prazo_limite,
    marcado_em: pedidoOcupante.marcado_em,
    estadio_cuidado: (doente?.estadio_cuidado ?? "") as EstadioCuidado,
    idade: idadeDoente(doente, hoje),
    concelho: doente?.concelho ?? "",
    distancia_km: doente?.distancia_km ?? 0,
    contacto_digital: (doente?.contacto_digital ?? "SMS") as ContactoDigital,
    transporte_nao_urgente: !!doente?.transporte_nao_urgente,
    dia_agrupado: temOutraMarcacaoNoDia(ato.doente_id, ato.data_hora, ato.mvp_ato_id),
    remarcacoes_hospital: remarcacoesHospital(ato.doente_id, quando),
    folga_dias: diferencaDias(parseIso(pedidoOcupante.prazo_limite), hoje),
    dias_ate_marcacao: diferencaDias(apenasData(parseIso(ato.data_hora)), hoje),
  };
}

/** R-A: restrições duras. Devolve o motivo da exclusão, ou "" se o candidato pode ceder a vaga. */
export function motivoExclusao(f: FactosCandidato, pesos: PesosCusto, congelamentoDias: number): string {
  if (f.dias_ate_marcacao <= congelamentoDias) {
    return `faltam só ${f.dias_ate_marcacao} dia${f.dias_ate_marcacao === 1 ? "" : "s"} — não se mexe em marcações a ${congelamentoDias} dias ou menos`;
  }
  if (f.remarcacoes_hospital >= pesos.max_remarcacoes_hospital) {
    return `já foi remarcado${f.remarcacoes_hospital > 1 ? ` ${f.remarcacoes_hospital} vezes` : ""} pelo hospital — nunca remarcamos alguém duas vezes`;
  }
  if (f.estadio_cuidado === "EM_TRATAMENTO") return "está em tratamento activo (o intervalo entre ciclos é clínico)";
  if (!f.vaga_destino_id) return "não há alternativa dentro do seu próprio prazo";
  return "";
}

/** R-B: custo de remarcar, parcela a parcela (menor custo = cede a vaga). */
export function parcelasCusto(f: FactosCandidato, pesos: PesosCusto): ParcelaCusto[] {
  const parcelas: ParcelaCusto[] = [];
  if (f.idade >= 75) parcelas.push({ rotulo: `${f.idade} anos`, pontos: pesos.custo_idade_75 });
  if (f.contacto_digital === "NENHUM") parcelas.push({ rotulo: "sem telemóvel nem email", pontos: pesos.custo_sem_contacto_digital });
  if (f.distancia_km >= 150) parcelas.push({ rotulo: `mora a ${f.distancia_km} km`, pontos: pesos.custo_distancia_150km });
  else if (f.distancia_km >= 50) parcelas.push({ rotulo: `mora a ${f.distancia_km} km`, pontos: pesos.custo_distancia_50km });
  if (f.transporte_nao_urgente) parcelas.push({ rotulo: "transporte não urgente combinado", pontos: pesos.custo_transporte });
  if (f.dia_agrupado) parcelas.push({ rotulo: "outra marcação no mesmo dia", pontos: pesos.custo_dia_agrupado });
  if (f.estadio_cuidado === "NOVO" || f.estadio_cuidado === "PRE_TRATAMENTO") {
    parcelas.push({ rotulo: "em diagnóstico", pontos: pesos.custo_estadio_novo });
  }
  const bonus = Math.min(pesos.bonus_folga_max, Math.max(0, Math.floor(f.folga_dias / 3)));
  if (bonus > 0) parcelas.push({ rotulo: `${f.folga_dias} dias de folga até ao prazo`, pontos: -bonus });
  return parcelas;
}

function marcadoEmMs(f: FactosCandidato): number {
  return f.marcado_em ? parseIso(f.marcado_em).getTime() : 0;
}

/** Desempate comum: maior folga → menos remarcações → marcado há menos tempo. */
function desempate(a: FactosCandidato, b: FactosCandidato): number {
  if (a.folga_dias !== b.folga_dias) return b.folga_dias - a.folga_dias;
  if (a.remarcacoes_hospital !== b.remarcacoes_hospital) return a.remarcacoes_hospital - b.remarcacoes_hospital;
  return marcadoEmMs(b) - marcadoEmMs(a);
}

/**
 * Avalia todos os candidatos: exclusões (R-A), custo (R-B) e o escolhido. Marca também quem a
 * regra antiga (só folga, sem estas regras) teria escolhido. Pura: não altera o estado.
 */
export function avaliarFactos(
  factos: FactosCandidato[],
  opcoes: { pesos?: Partial<PesosCusto>; sobreposicoes?: Record<string, SobreposicaoFactos> } = {},
): CandidatoTroca[] {
  const pesos = pesosCusto(opcoes.pesos);
  const congelamento = store.parametros.congelamento_dias;
  const avaliados: CandidatoTroca[] = factos.map((f0) => {
    const f = { ...f0, ...(opcoes.sobreposicoes?.[f0.doente_id] ?? {}) };
    const motivo = motivoExclusao(f, pesos, congelamento);
    const parcelas = motivo ? [] : parcelasCusto(f, pesos);
    return {
      ...f,
      excluido: !!motivo,
      motivo_exclusao: motivo,
      parcelas,
      custo: parcelas.reduce((s, p) => s + p.pontos, 0),
      escolhido: false,
      escolhido_regra_antiga: false,
    };
  });

  const elegiveis = avaliados.filter((c) => !c.excluido);
  elegiveis.sort((a, b) => (a.custo !== b.custo ? a.custo - b.custo : desempate(a, b)));
  if (elegiveis[0]) elegiveis[0].escolhido = true;

  // Regra antiga (antes da secção 8A): só congelamento + alternativa dentro do prazo; maior folga.
  const antigos = avaliados.filter((c) => c.dias_ate_marcacao > congelamento && c.vaga_destino_id);
  antigos.sort(desempate);
  if (antigos[0]) antigos[0].escolhido_regra_antiga = true;

  // Ordem de apresentação: escolhido, restantes elegíveis por custo, depois os excluídos.
  return [...elegiveis, ...avaliados.filter((c) => c.excluido)];
}

const NOME_ESTADIO: Record<string, string> = {
  NOVO: "novo doente",
  PRE_TRATAMENTO: "pré-tratamento",
  EM_TRATAMENTO: "em tratamento",
  FOLLOW_UP: "follow-up",
};

function dataCurta(iso: string): string {
  const d = parseIso(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dataLonga(iso: string): string {
  return `${dataCurta(iso)}/${parseIso(iso).getFullYear()}`;
}

/** Justificação em linguagem simples (regra de ouro #6): porquê este doente e não os outros. */
export function justificacaoTroca(avaliados: CandidatoTroca[]): string {
  const e = avaliados.find((c) => c.escolhido);
  if (!e) return "";
  const perfil = [
    NOME_ESTADIO[e.estadio_cuidado] ?? "",
    e.remarcacoes_hospital === 0 ? "sem remarcações anteriores" : "",
    e.contacto_digital !== "NENHUM" ? `contacto por ${e.contacto_digital}` : "",
  ].filter(Boolean);
  let texto =
    `Vaga de ${dataLonga(e.data_hora)} cedida por ${e.doente_nome}: ${perfil.join(", ")}` +
    `${perfil.length ? ", " : ""}prazo até ${dataLonga(e.prazo_limite)}, passa para ${dataLonga(e.data_destino)}.`;
  const outros = avaliados.filter((c) => !c.escolhido).slice(0, 4);
  if (outros.length > 0) {
    const frases = outros.map((c) =>
      c.excluido
        ? `${c.doente_nome} (excluído: ${c.motivo_exclusao})`
        : `${c.doente_nome} (custo ${c.custo}: ${c.parcelas.filter((p) => p.pontos > 0).map((p) => p.rotulo).join(", ") || "folga menor"})`,
    );
    texto += ` Não escolhidos: ${frases.join("; ")}.`;
  }
  return texto;
}

/** Útil para as rotas: dia ISO de uma marcação. */
export function diaDe(dataHoraIso: string): string {
  return isoData(parseIso(dataHoraIso));
}
