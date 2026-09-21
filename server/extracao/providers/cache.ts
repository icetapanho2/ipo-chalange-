// Fornecedor "cache": dados/demo_extracoes_cache.json — fallback determinístico da extracção
// para os textos da demo (secção 6 da especificação, EXTRACTOR=cache).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "../../csv.ts";
import type { EntradaCacheExtracao } from "../schema.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO = path.join(__dirname, "..", "..", "..", "dados", "demo_extracoes_cache.json");

/** Remove o prefixo "P:", passa a minúsculas e colapsa espaços (secção Extracção do CLAUDE.md). */
export function normalizarTexto(texto: string): string {
  return texto
    .replace(/^\s*p:\s*/i, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

let entradasPorDoente: Record<string, EntradaCacheExtracao> | null = null;
let indicePorTexto: Map<string, EntradaCacheExtracao> | null = null;

function carregar(): Record<string, EntradaCacheExtracao> {
  if (!entradasPorDoente) {
    const bruto = readJson<Record<string, unknown>>(CAMINHO);
    const { _nota, ...entradas } = bruto as Record<string, EntradaCacheExtracao> & { _nota?: unknown };
    void _nota;
    entradasPorDoente = entradas;
  }
  return entradasPorDoente;
}

function indice(): Map<string, EntradaCacheExtracao> {
  if (!indicePorTexto) {
    indicePorTexto = new Map();
    for (const entrada of Object.values(carregar())) {
      indicePorTexto.set(normalizarTexto(entrada.texto_plano), entrada);
    }
  }
  return indicePorTexto;
}

/** Procura pelo texto normalizado (o que a demo ao vivo faz: o texto tem de coincidir). */
export function procurarNaCachePorTexto(texto: string): EntradaCacheExtracao | null {
  return indice().get(normalizarTexto(texto)) ?? null;
}

/** Atalho por doente, útil para simular a demo sem repetir o texto exacto (usado nos testes). */
export function procurarNaCachePorDoente(doenteId: string): EntradaCacheExtracao | null {
  return carregar()[doenteId] ?? null;
}
