// Um teste por cenário da demo (secção 15 da especificação / tabela no fim de PROMPTS.md),
// executados pela ordem indicada a partir de uma base acabada de repor. Testa só o motor
// (server/motor/): a extracção em si (Fase 4) é simulada a partir de dados/demo_extracoes_cache.json
// pelo helper tests/helpers/planoDemo.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { store } from "../server/store.ts";
import { agora, definirRelogio, reporRelogio } from "../server/clock.ts";
import { apenasData, parseIso } from "../server/util.ts";
import {
  aceitarTriagem,
  aprovarPedidos,
  reencaminharTriagem,
  remarcarPedido,
  validarPedido,
} from "../server/motor/fluxo.ts";
import { agendarLote, aprovarPropostaTroca } from "../server/motor/agendamento.ts";
import { calcularSemaforo } from "../server/motor/semaforo.ts";
import { recalcularAlertas } from "../server/motor/alertas.ts";
import { corrigirTermoDesconhecido, extrairPlanoDemo } from "./helpers/planoDemo.ts";
import type { Pedido } from "../server/types.ts";

function atoDeHoje(doenteId: string, horaHHmm: string) {
  const ato = store.atosMedicos.find((a) => a.doente_id === doenteId && a.data_hora === `2026-09-23T${horaHHmm}`);
  if (!ato) throw new Error(`Sem acto de hoje para ${doenteId} às ${horaHHmm}`);
  return ato;
}

function pedido(id: string): Pedido {
  const p = store.pedidos.find((x) => x.pedido_id === id);
  if (!p) throw new Error(`Pedido ${id} não encontrado`);
  return p;
}

function dataMarcada(p: Pedido): string {
  const ato = store.atosMedicos.find((a) => a.mvp_ato_id === p.ato_id);
  if (!ato) throw new Error(`Pedido ${p.pedido_id} (${p.tipo_pedido}) não tem acto marcado (estado ${p.estado})`);
  return ato.data_hora;
}

function porTipo(pedidos: Pedido[], tipo: Pedido["tipo_pedido"]): Pedido {
  const p = pedidos.find((x) => x.tipo_pedido === tipo);
  if (!p) throw new Error(`Sem pedido do tipo ${tipo}`);
  return p;
}

describe("Cenários da demo (secção 15 da especificação)", () => {
  beforeAll(() => {
    store.carregar();
    definirRelogio("2026-09-23T09:00");
  });

  afterAll(() => {
    reporRelogio();
  });

  it("0. hoje é 23/09/2026 09:00 (relógio fixo do teste)", () => {
    expect(agora().getFullYear()).toBe(2026);
    expect(agora().getMonth()).toBe(8); // Setembro (0-indexado)
    expect(agora().getDate()).toBe(23);
    expect(agora().getHours()).toBe(9);
  });

  it("1. Maria Fernandes (100101): plano A → análises → TC → revisão", async () => {
    const consulta = atoDeHoje("100101", "09:30");
    const { pedidos } = await extrairPlanoDemo("100101", "U01", consulta.mvp_ato_id, "2102", agora());
    expect(pedidos).toHaveLength(3);

    aprovarPedidos(pedidos, "U03", agora());

    const colheita = porTipo(pedidos, "analises");
    const tc = porTipo(pedidos, "exame");
    const revisao = porTipo(pedidos, "consulta");

    expect(dataMarcada(colheita)).toBe("2026-09-24T07:30");
    expect(dataMarcada(tc)).toBe("2026-10-14T08:00");
    expect(dataMarcada(revisao)).toBe("2026-10-21T08:30");
    expect(revisao.medico_preferido_id).toBe("U01");
  });

  it("2. José Carvalho (100104): TC cheio → troca segura com Manuel Costa", () => {
    const p7 = pedido("P00007");
    expect(p7.estado).toBe("EXTRAIDO");

    aprovarPedidos([p7], "U03", agora());
    expect(p7.estado).toBe("ACEITE"); // ainda à espera da aprovação da troca

    const proposta = store.propostasTroca.find((p) => p.pedido_urgente === "P00007" && p.estado === "PENDENTE");
    expect(proposta).toBeDefined();
    expect(proposta!.justificacao).toContain("Manuel");
    expect(proposta!.justificacao).toContain("31/12");

    const manuel = pedido("P00008");
    const vagaOrigem = store.vagas.find((v) => v.vaga_id === proposta!.vaga_origem)!;
    const vagaDestino = store.vagas.find((v) => v.vaga_id === proposta!.vaga_destino)!;
    expect(vagaOrigem.data_hora).toBe("2026-10-02T10:00");
    expect(vagaDestino.data_hora).toBe("2026-10-14T08:20");

    aprovarPropostaTroca(proposta!.proposta_id, "U07", agora());

    expect(p7.estado).toBe("MARCADO");
    expect(dataMarcada(p7)).toBe("2026-10-02T10:00");
    expect(manuel.n_remarcacoes).toBe(1);
    expect(dataMarcada(manuel)).toBe("2026-10-14T08:20");
  });

  it("3. Rosa Teixeira (100105): plano B → alerta 'HPC' → correcção para Manutenção CVC", async () => {
    const consulta = atoDeHoje("100105", "09:50");
    const { pedidos, alertas } = await extrairPlanoDemo("100105", "U01", consulta.mvp_ato_id, "2102", agora());
    expect(pedidos).toHaveLength(2);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toContain("HPC");
    expect(store.alertas.some((a) => a.tipo === "TERMO_DESCONHECIDO" && a.doente_id === "100105")).toBe(true);

    const cvc = corrigirTermoDesconhecido("100105", "U01", consulta.mvp_ato_id, "2102", "U03", agora());
    expect(store.dicionario.some((d) => d.termo === "HPC" && d.ambito === "U01")).toBe(true);

    const analises = porTipo(pedidos, "analises");
    const revisao = porTipo(pedidos, "consulta");
    validarPedido(analises, "U03", { quando: agora() });
    validarPedido(revisao, "U03", { quando: agora() });
    validarPedido(cvc, "U03", { corrigido: true, quando: agora() });
    agendarLote([analises.pedido_id, revisao.pedido_id, cvc.pedido_id], agora());
    recalcularAlertas(agora());

    expect(dataMarcada(cvc)).toBe("2026-09-24T09:00");
    expect(dataMarcada(analises)).toBe("2026-09-24T07:30");
    expect(dataMarcada(revisao)).toBe("2026-10-14T09:30");
    expect(revisao.continuidade_obrigatoria).toBe(false);
  });

  it("4. Carlos Mendes (100107): 'HPC' reconhecida automaticamente (selo aprendido)", async () => {
    const consulta = atoDeHoje("100107", "10:10");
    const { pedidos } = await extrairPlanoDemo("100107", "U01", consulta.mvp_ato_id, "2102", agora());
    expect(pedidos).toHaveLength(2);

    const cvc = porTipo(pedidos, "tratamento");
    expect(cvc.origem_dicionario).toBe(true);

    aprovarPedidos(pedidos, "U03", agora());

    const revisao = porTipo(pedidos, "consulta");
    expect(dataMarcada(cvc)).toBe("2026-09-24T09:30");
    expect(dataMarcada(revisao)).toBe("2026-10-14T09:50");
  });

  it("5. Luísa Martins (100103): triagem reencaminha Onc. Médica → Radioterapia", () => {
    const p5 = pedido("P00005");
    expect(p5.estado).toBe("EM_TRIAGEM");
    expect(p5.especialidade_destino).toBe("1300");

    reencaminharTriagem(p5, "2300", "U04", "Pertence a Radioterapia", agora());
    expect(p5.especialidade_destino).toBe("2300");

    aceitarTriagem(p5, "U06", { quando: agora() });
    expect(p5.estado).toBe("MARCADO");
    expect(dataMarcada(p5)).toBe("2026-09-30T09:00");
  });

  it("6. Fernando Lopes (100108): HD aceite → colheita pré-QT automática (R2)", () => {
    const p9 = pedido("P00009");
    expect(p9.estado).toBe("EM_TRIAGEM");

    aceitarTriagem(p9, "U10", { quando: agora() });
    expect(p9.estado).toBe("MARCADO");
    expect(dataMarcada(p9)).toBe("2026-09-25T08:30");

    const colheita = store.pedidos.find(
      (p) => p.doente_id === "100108" && p.tipo_pedido === "analises" && p.especificacao === "pré-QT",
    );
    expect(colheita).toBeDefined();
    expect(dataMarcada(colheita!)).toBe("2026-09-24T07:40");
  });

  it("7. António Ribeiro (100102): semáforo vermelho → remarcar colheita → amarelo", () => {
    const revisao = pedido("P00004");
    const colheita = pedido("P00002");
    expect(colheita.estado).toBe("FALTOU");
    expect(dataMarcada(revisao)).toBe("2026-09-28T09:30");

    const hoje = apenasData(agora());
    const antes = calcularSemaforo(revisao, hoje, store.parametros.semaforo_horizonte_dias);
    expect(antes?.cor).toBe("vermelho");

    remarcarPedido(colheita, "U08", agora());
    expect(dataMarcada(colheita)).toBe("2026-09-24T07:40");

    const depois = calcularSemaforo(revisao, hoje, store.parametros.semaforo_horizonte_dias);
    expect(depois?.cor).toBe("amarelo");
  });

  it("8. Gestão: 60 dias de histórico disponíveis para as métricas", () => {
    const realizados = store.pedidos.filter((p) => p.estado === "REALIZADO");
    expect(realizados.length).toBeGreaterThan(100);
    expect(store.eventos.length).toBeGreaterThan(3750);
    const maisAntigo = store.eventos.reduce((a, b) => (b.data_hora < a.data_hora ? b : a));
    expect(parseIso(maisAntigo.data_hora).getTime()).toBeLessThan(parseIso("2026-08-01T00:00").getTime());
  });
});
