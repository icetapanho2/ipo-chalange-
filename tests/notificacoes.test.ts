// Prompt N2: notificações geradas pelas transições do motor (server/motor/notificacoes.ts),
// entregues a médico/admin/triador conforme o serviço e o desfecho.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { store } from "../server/store.ts";
import { definirRelogio, reporRelogio, agora } from "../server/clock.ts";
import { aceitarTriagem, aprovarPedidos, pedirInformacao, recusarTriagem, reencaminharTriagem } from "../server/motor/fluxo.ts";
import { silenciarTipo } from "../server/motor/notificacoes.ts";
import type { Pedido } from "../server/types.ts";

function pedido(id: string): Pedido {
  const p = store.pedidos.find((x) => x.pedido_id === id);
  if (!p) throw new Error(`Pedido ${id} não encontrado`);
  return p;
}

function notificacoesDe(utilizadorId: string) {
  return store.notificacoes.filter((n) => n.destinatario_utilizador_id === utilizadorId);
}

describe("Notificações (Prompt N2)", () => {
  beforeAll(() => {
    definirRelogio(new Date("2026-09-23T09:00:00"));
  });

  afterAll(() => {
    reporRelogio();
  });

  beforeEach(() => {
    store.carregar();
  });

  it("triagem aceite: notifica o médico requisitante, a admin de origem e o triador do serviço de destino", () => {
    const p5 = pedido("P00005"); // U02 (2102) -> reencaminhado para 2300, aceite por U06
    reencaminharTriagem(p5, "2300", "U04", "Pertence a Radioterapia", agora());
    expect(notificacoesDe("U02")).toHaveLength(0); // reencaminhamento não gera notificação nesta fase

    aceitarTriagem(p5, "U06", { quando: agora() });
    expect(p5.estado).toBe("MARCADO");

    const doMedico = notificacoesDe("U02");
    expect(doMedico).toHaveLength(1);
    expect(doMedico[0].tipo).toBe("PEDIDO_MARCADO");
    expect(doMedico[0].pedido_id).toBe("P00005");
    expect(doMedico[0].lida).toBe(false);

    const daAdminOrigem = notificacoesDe("U03"); // ADMINISTRATIVO de 2102
    expect(daAdminOrigem.some((n) => n.tipo === "PEDIDO_MARCADO" && n.pedido_id === "P00005")).toBe(true);

    const doTriadorDestino = notificacoesDe("U06"); // TRIADOR de 2300
    expect(doTriadorDestino.some((n) => n.tipo === "PEDIDO_MARCADO" && n.pedido_id === "P00005")).toBe(true);
  });

  it("triagem recusada: notifica o médico requisitante e a admin de origem, com o motivo", () => {
    const p5 = pedido("P00005");
    recusarTriagem(p5, "U04", "Não cumpre critérios de referenciação", agora());
    expect(p5.estado).toBe("RECUSADO");

    const doMedico = notificacoesDe("U02");
    expect(doMedico).toHaveLength(1);
    expect(doMedico[0].tipo).toBe("PEDIDO_RECUSADO");
    expect(doMedico[0].mensagem).toContain("Não cumpre critérios de referenciação");

    expect(notificacoesDe("U03").some((n) => n.tipo === "PEDIDO_RECUSADO")).toBe(true);
  });

  it("triagem pede informação: notifica o médico requisitante e a admin de origem, com a pergunta", () => {
    const p5 = pedido("P00005");
    pedirInformacao(p5, "U04", "Tem RM pélvica recente?", agora());
    expect(p5.estado).toBe("DEVOLVIDO");

    const doMedico = notificacoesDe("U02");
    expect(doMedico).toHaveLength(1);
    expect(doMedico[0].tipo).toBe("PEDIDO_DEVOLVIDO");
    expect(doMedico[0].mensagem).toContain("Tem RM pélvica recente?");

    const daAdminOrigem = notificacoesDe("U03"); // ADMINISTRATIVO de 2102
    expect(daAdminOrigem.some((n) => n.tipo === "PEDIDO_DEVOLVIDO" && n.pedido_id === "P00005")).toBe(true);
  });

  it("aprovação de um pedido TRIAGEM notifica o triador do serviço de destino", () => {
    const extraido: Pedido = {
      pedido_id: store.proximoId("pedido"),
      doente_id: "100101",
      consulta_origem_ato_id: "AT000001",
      especialidade_origem: "2102",
      medico_requisitante_id: "U01",
      criado_em: "2026-09-23T09:00",
      tipo_pedido: "pedido_consulta",
      fluxo: "TRIAGEM",
      especialidade_destino: "1300", // TRIADOR U04
      ato_codigo: "1",
      exames: [],
      analises: [],
      especificacao: "",
      prioridade: "P",
      prazo_limite: "2026-11-21",
      nao_antes: "",
      medico_preferido_id: "",
      continuidade_obrigatoria: false,
      recorrencia: "",
      texto_origem: "Interconsulta de teste",
      confianca: 1,
      aprovado_direto: false,
      validado_por: "",
      validado_em: "",
      triado_por: "",
      triado_em: "",
      decisao_triagem: "",
      marcado_em: "",
      ato_id: "",
      estado: "EXTRAIDO",
      n_remarcacoes: 0,
    };
    store.pedidos.push(extraido);

    aprovarPedidos([extraido], "U03", agora());
    expect(extraido.estado).toBe("EM_TRIAGEM");

    const doTriadorDestino = notificacoesDe("U04");
    expect(doTriadorDestino.some((n) => n.tipo === "PEDIDO_EM_TRIAGEM" && n.pedido_id === extraido.pedido_id)).toBe(true);
  });

  it("silenciar um tipo: novas notificações desse tipo nascem já lidas, sem perder o registo", () => {
    silenciarTipo("U02", "PEDIDO_MARCADO");
    const p5 = pedido("P00005");
    aceitarTriagem(p5, "U04", { quando: agora() });

    const doMedico = notificacoesDe("U02");
    expect(doMedico).toHaveLength(1);
    expect(doMedico[0].lida).toBe(true); // não desaparece, só não conta como por ler
  });

  it("'Repor demo' limpa notificações e silenciamentos", () => {
    const p5 = pedido("P00005");
    aceitarTriagem(p5, "U04", { quando: agora() });
    expect(store.notificacoes.length).toBeGreaterThan(0);

    store.carregar();
    expect(store.notificacoes).toHaveLength(0);
    expect(store.silenciamentos).toHaveLength(0);
  });
});
