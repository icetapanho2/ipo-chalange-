import { describe, expect, it } from "vitest";
import { store } from "../server/store.ts";

describe("store (Fase 1 — carregamento em memória)", () => {
  it("carrega contagens iguais às dos CSV de dados/", () => {
    expect(store.doentes.length).toBe(468);
    expect(store.pedidos.length).toBe(741);
    expect(store.eventos.length).toBe(3768);
    expect(store.dependencias.length).toBe(496);
    expect(store.especialidades.length).toBeGreaterThan(0);
    expect(store.catalogoAtos.length).toBeGreaterThan(0);
    expect(store.vagas.length).toBeGreaterThan(0);
    expect(store.utilizadores.length).toBeGreaterThan(0);
  });

  it("contém os doentes 100101 a 100118 da demo", () => {
    const ids = store.doentes.map((d) => d.doente_id);
    for (let n = 100101; n <= 100118; n++) {
      expect(ids).toContain(String(n));
    }
  });

  it("agrupa oasis_atos_medicos por mvp_ato_id (um acto pode ter vários exames)", () => {
    const atoComExames = store.atosMedicos.find((a) => a.exames.length > 1);
    expect(atoComExames).toBeDefined();
  });

  it("lê a data da demo de parametros.csv", () => {
    expect(store.parametros.DEMO_DATE).toBe("2026-09-23");
    expect(store.parametros.congelamento_dias).toBe(7);
    expect(store.parametros.limiar_confianca).toBe(0.8);
  });

  it("repor demo recarrega o estado a partir dos CSV", () => {
    store.pedidos.pop();
    const antes = store.pedidos.length;
    expect(antes).toBe(740);
    store.carregar();
    expect(store.pedidos.length).toBe(741);
  });
});
