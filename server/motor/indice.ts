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
const PONTOS_NIVEL = { MP: 400, P: 250, N: 100 } as const;

export function calcularIndice(pedido: Pedido, quando: Date): { valor: number; parcelas: ParcelaCusto[] } {
  const hoje = apenasData(quando);
  const parcelas: ParcelaCusto[] = [];
  parcelas.push({ rotulo: `nível ${pedido.prioridade}`, pontos: PONTOS_NIVEL[pedido.prioridade] ?? 100 });

  const folga = diferencaDias(parseIso(pedido.prazo_limite), hoje);
  if (folga < 0) parcelas.push({ rotulo: `${-folga} dias fora do prazo`, pontos: 200 + Math.min(100, -folga * 5) });
  else if (folga < 40) parcelas.push({ rotulo: folga === 0 ? "prazo termina hoje" : `prazo em ${folga} dias`, pontos: 200 - folga * 5 });

  const doente = store.doentes.find((d) => d.doente_id === pedido.doente_id);
  if (doente?.estadio_cuidado === "NOVO" || doente?.estadio_cuidado === "PRE_TRATAMENTO") parcelas.push({ rotulo: "em diagnóstico", pontos: 80 });
  else if (doente?.estadio_cuidado === "EM_TRATAMENTO") parcelas.push({ rotulo: "em tratamento", pontos: 60 });

  const score =
    pedido.score_prioridade ??
    calcularPrioridadeSistema(
      { tipo_pedido: pedido.tipo_pedido, ato_codigo: pedido.ato_codigo, especificacao: pedido.especificacao, texto_origem: pedido.texto_origem },
      doente,
      undefined,
      pedido.especialidade_destino,
    ).score;
  parcelas.push({ rotulo: `score clínico ${score}`, pontos: score });

  const rem = remarcacoesHospital(pedido.doente_id, quando);
  if (rem > 0) parcelas.push({ rotulo: `já remarcado ${rem}× pelo hospital`, pontos: Math.min(100, rem * 50) });

  const espera = diferencaDias(hoje, apenasData(parseIso(pedido.criado_em)));
  if (espera > 0) parcelas.push({ rotulo: `${espera} dias à espera`, pontos: Math.min(30, espera) });

  return { valor: parcelas.reduce((s, p) => s + p.pontos, 0), parcelas };
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
