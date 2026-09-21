import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { store } from "../server/store.ts";
import { definirRelogio, reporRelogio, agora } from "../server/clock.ts";
import { extrair, fornecedorConfigurado } from "../server/extracao/index.ts";

const TEXTO_MARIA =
  "TC TAP c/ contraste + colheita c/ jejum (hemog, bioq c/ creat, CEA, CA 19.9). Rev c/ exames 1/12 comigo.";

describe("server/extracao (Fase 4)", () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    store.carregar();
    definirRelogio("2026-09-23T09:00");
  });

  afterEach(() => {
    reporRelogio();
    process.env = { ...envOriginal };
  });

  it("EXTRACTOR por omissão: cache sem chaves, gemini quando GEMINI_API_KEY existe", () => {
    delete process.env.EXTRACTOR;
    delete process.env.GEMINI_API_KEY;
    expect(fornecedorConfigurado()).toBe("cache");
    process.env.GEMINI_API_KEY = "chave-de-teste";
    expect(fornecedorConfigurado()).toBe("gemini");
  });

  it("reconhece um texto da cache e cria os pedidos correspondentes", async () => {
    delete process.env.EXTRACTOR;
    delete process.env.GEMINI_API_KEY;
    const r = await extrair(TEXTO_MARIA, "U01", "100101", {
      consultaAtoId: "",
      especialidadeOrigem: "2102",
      quando: agora(),
    });
    expect(r.pedidos).toHaveLength(3);
    expect(r.fornecedorUsado).toBe("cache");
    expect(r.usouFallback).toBe(false);
  });

  it("texto desconhecido gera alerta e nenhum pedido (nunca inventa)", async () => {
    delete process.env.EXTRACTOR;
    const r = await extrair("Isto não está em lado nenhum da cache.", "U01", "100101", {
      consultaAtoId: "",
      especialidadeOrigem: "2102",
      quando: agora(),
    });
    expect(r.pedidos).toHaveLength(0);
    expect(r.alertas.length).toBeGreaterThan(0);
    expect(store.alertas.some((a) => a.tipo === "TERMO_DESCONHECIDO")).toBe(true);
  });

  it("prefixo 'P:', maiúsculas e espaços a mais não impedem o reconhecimento pela cache", async () => {
    delete process.env.EXTRACTOR;
    const variante = `  P:   ${TEXTO_MARIA.toUpperCase()}  `;
    const r = await extrair(variante, "U01", "100101", { consultaAtoId: "", especialidadeOrigem: "2102", quando: agora() });
    expect(r.pedidos).toHaveLength(3);
  });

  it("com DEMO_CACHE_PRIMEIRO=false, um fornecedor ao vivo mal configurado cai para a cache e regista o fallback", async () => {
    process.env.EXTRACTOR = "gemini";
    process.env.DEMO_CACHE_PRIMEIRO = "false";
    delete process.env.GEMINI_API_KEY;

    const r = await extrair(TEXTO_MARIA, "U01", "100101", {
      consultaAtoId: "",
      especialidadeOrigem: "2102",
      quando: agora(),
    });
    expect(r.pedidos).toHaveLength(3);
    expect(r.fornecedorUsado).toBe("gemini");
    expect(r.usouFallback).toBe(true);
    expect(store.eventos.some((e) => e.motivo?.includes("Fallback para cache"))).toBe(true);
  });

  it("sem fallback possível (texto desconhecido) devolve o motivo da falha no alerta", async () => {
    process.env.EXTRACTOR = "gemini";
    process.env.DEMO_CACHE_PRIMEIRO = "false";
    delete process.env.GEMINI_API_KEY;

    const r = await extrair("Texto qualquer que não é da demo.", "U01", "100101", {
      consultaAtoId: "",
      especialidadeOrigem: "2102",
      quando: agora(),
    });
    expect(r.pedidos).toHaveLength(0);
    expect(r.alertas[0]).toContain("gemini");
  });
});
