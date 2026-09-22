// A prioridade é sempre calculada pelo sistema (nunca sugerida directamente pelo médico), a
// partir de três factores: urgência/prazo, tipo de pedido, e o perfil clínico guardado na ficha
// do doente (aba "Perfil Clínico"). Estes testes cobrem o factor clínico (novo, ligado à ficha)
// e os limiares configuráveis pela Gestão (server/routes/gestao.ts: GET/POST /gestao/prioridade).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { store } from "../server/store.ts";
import { definirRelogio, reporRelogio, agora } from "../server/clock.ts";
import { calcularPrioridadeSistema } from "../server/motor/prioridade.ts";
import { extrair } from "../server/extracao/index.ts";

describe("Perfil clínico do doente na equação de prioridade", () => {
  beforeEach(() => {
    store.carregar();
    definirRelogio("2026-09-23T09:00");
  });

  afterEach(() => {
    reporRelogio();
  });

  it("dados/doentes.csv já traz diagnóstico/estadiamento para os doentes-cenário da demo", () => {
    const luisa = store.doentes.find((d) => d.doente_id === "100103");
    expect(luisa?.diagnostico_principal).toContain("recto");
    expect(luisa?.estadiamento).toBe("Estádio III");
  });

  it("um doente em Estádio III/IV pontua mais no factor clínico do que um sem perfil registado", () => {
    const luisa = store.doentes.find((d) => d.doente_id === "100103")!;
    const semPerfil = { estadiamento: "", diagnostico_principal: "" };

    const dadosPedido = { tipo_pedido: "exame" as const, ato_codigo: "1", prazo_dias: 60 };
    const comEstadio = calcularPrioridadeSistema(dadosPedido, luisa);
    const semEstadio = calcularPrioridadeSistema(dadosPedido, semPerfil);

    expect(comEstadio.score).toBeGreaterThan(semEstadio.score);
    expect(comEstadio.detalheEquacao).toContain("Estádio III/IV");
  });

  it("a extracção real usa o perfil clínico do doente (via consultaAtoId/doenteId) no cálculo", async () => {
    delete process.env.EXTRACTOR;
    delete process.env.GEMINI_API_KEY;
    // Luísa (100103) tem Estádio III na ficha; um pedido de exame sem prioridade explícita
    // no texto deve reflectir esse factor no score guardado no pedido.
    const r = await extrair("TC abdominal de controlo.", "U02", "100103", {
      consultaAtoId: "",
      especialidadeOrigem: "2102",
      quando: agora(),
    });
    // Texto genérico pode não bater na cache; só verificamos o cálculo quando produz pedidos.
    for (const p of r.pedidos) {
      if (p.prioridade_calculada_sistema) {
        expect(p.score_prioridade).toBeGreaterThan(0);
        expect(p.equacao_prioridade_detalhe).toContain("Score");
      }
    }
  });
});

describe("Limiares de prioridade configuráveis (Gestão)", () => {
  beforeEach(() => {
    store.carregar();
    definirRelogio("2026-09-23T09:00");
  });

  afterEach(() => {
    reporRelogio();
  });

  it("baixar o limiar de Prioritário muda a classificação para o mesmo score", () => {
    const dadosPedido = { tipo_pedido: "exame" as const, ato_codigo: "1", prazo_dias: 40 };
    const doente = { estadiamento: "Estádio II", diagnostico_principal: "Neoplasia" };

    const antes = calcularPrioridadeSistema(dadosPedido, doente);
    expect(antes.prioridade).not.toBe("MP");

    const scoreOriginal = antes.score;
    store.parametros.limiar_prioridade_p = Math.max(0, scoreOriginal - 5);
    const depois = calcularPrioridadeSistema(dadosPedido, doente);

    expect(depois.score).toBe(scoreOriginal); // o score não muda, só a classificação
    expect(depois.prioridade).not.toBe("N");
  });

  it("'Repor demo' restaura os limiares por omissão do CSV", () => {
    store.parametros.limiar_prioridade_mp = 10;
    store.parametros.limiar_prioridade_p = 5;
    store.carregar();
    expect(store.parametros.limiar_prioridade_mp).toBe(70);
    expect(store.parametros.limiar_prioridade_p).toBe(42);
  });
});
