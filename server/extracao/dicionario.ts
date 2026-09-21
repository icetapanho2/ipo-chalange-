import { store } from "../store.ts";
import type { DicionarioEntrada } from "../types.ts";

const normalizar = (s: string) => s.trim().toLowerCase();

/**
 * Passo 1 do pipeline de extracção (secção 6): localiza no texto os termos do dicionário
 * (globais + do médico requisitante), termos mais compridos primeiro (para que "TC TAP" seja
 * preferido a "rev", por exemplo). Determinístico — não decide pedidos, só dá pistas fortes
 * ao LLM (e serve de atalho quando `EXTRACTOR=cache`).
 */
export function termosReconhecidos(texto: string, medicoId: string): DicionarioEntrada[] {
  const textoMin = texto.toLowerCase();
  return store.dicionario
    .filter((d) => d.estado === "ATIVA" && (d.ambito === "GLOBAL" || d.ambito === medicoId))
    .filter((d) => textoMin.includes(normalizar(d.termo)))
    .sort((a, b) => b.termo.length - a.termo.length);
}

/** Procura um termo no dicionário: âmbito do médico primeiro, depois GLOBAL (secção 7). */
export function resolverTermo(termo: string, medicoId: string): DicionarioEntrada | null {
  const alvo = normalizar(termo);
  const activos = store.dicionario.filter((d) => d.estado === "ATIVA" && normalizar(d.termo) === alvo);
  return (
    activos.find((d) => d.ambito === medicoId) ??
    activos.find((d) => d.ambito === "GLOBAL") ??
    null
  );
}

/**
 * Regista a correcção de um termo feita pela administrativa: cria (ou reforça) uma entrada
 * do dicionário com âmbito do médico requisitante (secção 7, passo 3).
 */
export function aprenderCorrecao(params: {
  termo: string;
  significado: string;
  mapeiaPara: string;
  medicoId: string;
}): DicionarioEntrada {
  const alvo = normalizar(params.termo);
  let entrada = store.dicionario.find(
    (d) => normalizar(d.termo) === alvo && d.ambito === params.medicoId,
  );
  if (entrada) {
    entrada.ocorrencias += 1;
    entrada.significado = params.significado;
    entrada.mapeia_para = params.mapeiaPara;
    entrada.estado = "ATIVA";
  } else {
    entrada = {
      termo: params.termo,
      significado: params.significado,
      mapeia_para: params.mapeiaPara,
      ambito: params.medicoId,
      origem: "CORRECAO",
      ocorrencias: 1,
      estado: "ATIVA",
    };
    store.dicionario.push(entrada);
  }
  promoverSeNecessario(params.termo, params.mapeiaPara);
  return entrada;
}

/** Quando a mesma correcção aparece em médicos diferentes `promover_regra_apos` vezes, passa a GLOBAL. */
function promoverSeNecessario(termo: string, mapeiaPara: string): void {
  const alvo = normalizar(termo);
  const entradasIguais = store.dicionario.filter(
    (d) => normalizar(d.termo) === alvo && d.mapeia_para === mapeiaPara && d.origem === "CORRECAO" && d.ambito !== "GLOBAL",
  );
  if (entradasIguais.length < store.parametros.promover_regra_apos) return;
  const jaGlobal = store.dicionario.find((d) => normalizar(d.termo) === alvo && d.ambito === "GLOBAL");
  if (jaGlobal) {
    jaGlobal.estado = "ATIVA";
    jaGlobal.mapeia_para = mapeiaPara;
    return;
  }
  store.dicionario.push({
    termo,
    significado: entradasIguais[0].significado,
    mapeia_para: mapeiaPara,
    ambito: "GLOBAL",
    origem: "CORRECAO",
    ocorrencias: entradasIguais.reduce((soma, e) => soma + e.ocorrencias, 0),
    estado: "ATIVA",
  });
}
