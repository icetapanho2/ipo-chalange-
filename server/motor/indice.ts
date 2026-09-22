import { store } from "../store.ts";
import { agora } from "../clock.ts";
import { apenasData, diferencaDias, isoDataHora, parseIso } from "../util.ts";
import { calcularPrioridadeSistema } from "./prioridade.ts";
import { factosDoCandidato, parcelasCusto, pesosCusto, remarcacoesHospital } from "./remarcacao.ts";
import type { ParcelaCusto, Pedido } from "../types.ts";

/**
 * Índice de prioridade de acesso (ESPECIFICACAO.md secção 8A, R-J). Cada pedido activo tem-no
 * CALCULADO E GUARDADO (recalculado no arranque e depois de cada acção, junto com os alertas):
 * quando é preciso remarcar 20 doentes de uma vez, a ordem já está feita. Distingue doentes do
 * mesmo nível — dois MP com o mesmo prazo não empatam se um estiver em diagnóstico.
 *
 * Nível (MP 400 · P 250 · N 100) + prazo (até +200; fora do prazo +200 e +5/dia, máx +100) +
 * estádio (diagnóstico +80, tratamento +60) + score clínico da equação (0–100) + remarcações já
 * sofridas pelo hospital (+50 cada, máx +100) + tempo de espera (+1/dia, máx +30).
 */

const ESTADOS_ACTIVOS = new Set(["EXTRAIDO", "VALIDADO", "EM_TRIAGEM", "ACEITE", "MARCADO", "SEM_VAGA", "FALTOU", "DEVOLVIDO"]);

/** Variáveis da equação do índice. Cada serviço pode ajustar as suas (Serviço → Definições). */
export interface VariaveisIndice {
  nivel_mp: number;
  nivel_p: number;
  nivel_n: number;
  prazo_max: number; // pontos quando o prazo termina hoje
  prazo_por_dia: number; // perde-se isto por cada dia de folga
  fora_prazo_por_dia: number; // soma-se isto por cada dia fora do prazo
  fora_prazo_max: number;
  diagnostico: number;
  tratamento: number;
  score_clinico_peso: number; // multiplica o score clínico (0–100)
  remarcacao_por: number;
  remarcacao_max: number;
  espera_por_dia: number;
  espera_max: number;
}

export const VARIAVEIS_INDICE_OMISSAO: VariaveisIndice = {
  nivel_mp: 400,
  nivel_p: 250,
  nivel_n: 100,
  prazo_max: 200,
  prazo_por_dia: 5,
  fora_prazo_por_dia: 5,
  fora_prazo_max: 100,
  diagnostico: 80,
  tratamento: 60,
  score_clinico_peso: 1,
  remarcacao_por: 50,
  remarcacao_max: 100,
  espera_por_dia: 1,
  espera_max: 30,
};

export function variaveisIndice(especialidade: string): VariaveisIndice {
  return { ...VARIAVEIS_INDICE_OMISSAO, ...(store.indicePorServico[especialidade] ?? {}) };
}

export function calcularIndice(pedido: Pedido, quando: Date, v: VariaveisIndice = variaveisIndice(pedido.especialidade_destino)): { valor: number; parcelas: ParcelaCusto[] } {
  const hoje = apenasData(quando);
  const parcelas: ParcelaCusto[] = [];
  const nivel = { MP: v.nivel_mp, P: v.nivel_p, N: v.nivel_n }[pedido.prioridade] ?? v.nivel_n;
  parcelas.push({ rotulo: `nível ${pedido.prioridade}`, pontos: nivel });

  const folga = diferencaDias(parseIso(pedido.prazo_limite), hoje);
  if (folga < 0) parcelas.push({ rotulo: `${-folga} dias fora do prazo`, pontos: v.prazo_max + Math.min(v.fora_prazo_max, -folga * v.fora_prazo_por_dia) });
  else {
    const pontos = v.prazo_max - folga * v.prazo_por_dia;
    if (pontos > 0) parcelas.push({ rotulo: folga === 0 ? "prazo termina hoje" : `prazo em ${folga} dias`, pontos });
  }

  const doente = store.doentes.find((d) => d.doente_id === pedido.doente_id);
  if (doente?.estadio_cuidado === "NOVO" || doente?.estadio_cuidado === "PRE_TRATAMENTO") parcelas.push({ rotulo: "em diagnóstico", pontos: v.diagnostico });
  else if (doente?.estadio_cuidado === "EM_TRATAMENTO") parcelas.push({ rotulo: "em tratamento", pontos: v.tratamento });

  const score =
    pedido.score_prioridade ??
    calcularPrioridadeSistema(
      { tipo_pedido: pedido.tipo_pedido, ato_codigo: pedido.ato_codigo, especificacao: pedido.especificacao, texto_origem: pedido.texto_origem },
      doente,
      undefined,
      pedido.especialidade_destino,
    ).score;
  parcelas.push({ rotulo: `score clínico ${score}`, pontos: Math.round(score * v.score_clinico_peso) });

  const rem = remarcacoesHospital(pedido.doente_id, quando);
  if (rem > 0) parcelas.push({ rotulo: `já remarcado ${rem}× pelo hospital`, pontos: Math.min(v.remarcacao_max, rem * v.remarcacao_por) });

  const espera = diferencaDias(hoje, apenasData(parseIso(pedido.criado_em)));
  if (espera > 0) parcelas.push({ rotulo: `${espera} dias à espera`, pontos: Math.min(v.espera_max, Math.round(espera * v.espera_por_dia)) });

  return { valor: parcelas.filter((p) => p.pontos !== 0).reduce((s, p) => s + p.pontos, 0), parcelas: parcelas.filter((p) => p.pontos !== 0) };
}

/** Recalcula e guarda o índice (e, para quem está marcado, o custo de o remarcar) de todos os pedidos activos. */
export function recalcularIndices(quando: Date = agora()): void {
  const pesos = pesosCusto();
  const carimbo = isoDataHora(quando);
  for (const pedido of store.pedidos) {
    if (!ESTADOS_ACTIVOS.has(pedido.estado)) continue;
    const { valor, parcelas } = calcularIndice(pedido, quando);
    pedido.indice_prioridade = valor;
    pedido.indice_parcelas = parcelas;
    pedido.indice_calculado_em = carimbo;
    if (pedido.estado === "MARCADO") {
      const ato = store.atosMedicos.find((a) => a.mvp_ato_id === pedido.ato_id);
      if (ato) {
        const custo = parcelasCusto(factosDoCandidato(ato, pedido, null, quando), pesos);
        pedido.custo_remarcacao = custo.reduce((s, p) => s + p.pontos, 0);
        pedido.custo_remarcacao_parcelas = custo;
      }
    }
  }
}

/** Ordem de quem escolhe primeiro (índice maior; empate: prazo mais cedo, depois pedido mais antigo). */
export function compararPorIndice(a: Pedido, b: Pedido): number {
  const ia = a.indice_prioridade ?? 0;
  const ib = b.indice_prioridade ?? 0;
  if (ia !== ib) return ib - ia;
  if (a.prazo_limite !== b.prazo_limite) return a.prazo_limite.localeCompare(b.prazo_limite);
  return a.criado_em.localeCompare(b.criado_em);
}

/** Frase curta com as parcelas que mais pesam (para as justificações). */
export function resumoIndice(pedido: Pedido): string {
  const parcelas = [...(pedido.indice_parcelas ?? [])].sort((a, b) => b.pontos - a.pontos).slice(0, 3);
  return `índice ${pedido.indice_prioridade ?? 0}${parcelas.length ? ` — ${parcelas.map((p) => p.rotulo).join(", ")}` : ""}`;
}
