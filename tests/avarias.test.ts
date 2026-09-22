// Prompt N2: um técnico reporta uma avaria, a admin do serviço é notificada de imediato,
// e ao resolver (remarcação total/parcial) o motor bloqueia as vagas afectadas e reagenda
// quem já estava marcado nessa janela, aplicando de novo prioridades/disponibilidade.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { store } from "../server/store.ts";
import { definirRelogio, reporRelogio, agora } from "../server/clock.ts";
import { reportarAvaria, resolverAvaria } from "../server/motor/avarias.ts";
import { vagaBloqueadaPorAvaria } from "../server/motor/agendamento.ts";
import type { Pedido } from "../server/types.ts";

function pedido(id: string): Pedido {
  const p = store.pedidos.find((x) => x.pedido_id === id);
  if (!p) throw new Error(`Pedido ${id} não encontrado`);
  return p;
}

describe("Avarias e remarcação (Prompt N2)", () => {
  beforeAll(() => {
    definirRelogio(new Date("2026-09-23T09:00:00"));
  });

  afterAll(() => {
    reporRelogio();
  });

  beforeEach(() => {
    store.carregar();
  });

  it("reportar avaria notifica de imediato a administração do serviço afectado", () => {
    const avaria = reportarAvaria(
      { especialidadeCodigo: "2102", atoCodigo: "22", descricao: "TAC avariado", duracaoDias: 6 },
      "U13",
      agora(),
    );
    expect(avaria.estado).toBe("ABERTA");

    const notifsAdmin = store.notificacoes.filter((n) => n.destinatario_utilizador_id === "U03");
    expect(notifsAdmin.some((n) => n.tipo === "AVARIA_SERVICO" && n.mensagem.includes("TAC avariado"))).toBe(true);
  });

  it("avaria ABERTA bloqueia as vagas do serviço/acto na janela afectada", () => {
    const vaga = store.vagas.find((v) => v.especialidade_codigo === "2102" && v.atos_permitidos.includes("22") && v.data_hora.startsWith("2026-09-28"));
    if (!vaga) throw new Error("Sem vaga de referência em 2102/22 a 28/09 nos dados de seed.");
    expect(vagaBloqueadaPorAvaria(vaga, "22")).toBe(false);

    reportarAvaria({ especialidadeCodigo: "2102", atoCodigo: "22", descricao: "TAC avariado", duracaoDias: 6 }, "U13", agora());
    expect(vagaBloqueadaPorAvaria(vaga, "22")).toBe(true);
    // não bloqueia outro acto do mesmo serviço (avaria é parcial, restrita ao ato_codigo "22")
    expect(vagaBloqueadaPorAvaria(vaga, "23")).toBe(false);
  });

  it("resolver com remarcação parcial reagenda quem estava marcado na janela e avisa o médico", () => {
    const p4 = pedido("P00004"); // MARCADO, 2102/22, AT000013 a 28/09/2026 09:30
    expect(p4.estado).toBe("MARCADO");
    const atoAntigoId = p4.ato_id;

    const avaria = reportarAvaria(
      { especialidadeCodigo: "2102", atoCodigo: "22", descricao: "TAC avariado", duracaoDias: 6 },
      "U13",
      agora(),
    );

    const resolvida = resolverAvaria(avaria.avaria_id, "REMARCACAO_PARCIAL", "U03", agora());
    expect(resolvida?.estado).toBe("RESOLVIDA");
    expect(resolvida?.pedidos_afetados).toBeGreaterThanOrEqual(1);

    // ou foi remarcado para outro ato, ou ficou sem vaga — nunca fica preso ao ato bloqueado
    expect(p4.ato_id).not.toBe(atoAntigoId);
    expect(["MARCADO", "SEM_VAGA"]).toContain(p4.estado);

    const avisoMedico = store.notificacoes.filter((n) => n.destinatario_utilizador_id === p4.medico_requisitante_id && n.pedido_id === "P00004");
    expect(avisoMedico.some((n) => n.tipo === "PEDIDO_MARCADO" || n.tipo === "PEDIDO_SEM_VAGA")).toBe(true);
  });

  it("'Repor demo' limpa as avarias", () => {
    reportarAvaria({ especialidadeCodigo: "2102", atoCodigo: "22", descricao: "TAC avariado", duracaoDias: 6 }, "U13", agora());
    expect(store.avarias.length).toBeGreaterThan(0);
    store.carregar();
    expect(store.avarias).toHaveLength(0);
  });
});
