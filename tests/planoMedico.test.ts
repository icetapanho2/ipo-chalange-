// Assistente de pedidos (DECISOES.md, 23/09/2026): lê o "P/" do diário e pré-selecciona os pedidos
// no assistente; o médico confirma. Nunca adivinha, pode ser desligado nas Definições do médico.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { criarApp } from "../server/app.ts";
import { definirRelogio, reporRelogio } from "../server/clock.ts";
import { DIARIO_MARIA } from "../src/lib/casosDemo.ts";

let servidor: Server;
let baseUrl: string;

async function api<T>(caminho: string, u: string, corpo?: unknown): Promise<T> {
  const r = await fetch(`${baseUrl}${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "x-utilizador-id": u },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`${caminho} → ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

interface PrePedido {
  tipo_pedido: string;
  especialidade_destino: string;
  ato_codigo: string;
  exames: string[];
  analises: string[];
  especificacao: string;
  prioridade: string;
  nao_antes: string;
  depende_exames_consulta: boolean;
  continuidade_medico: boolean;
  texto_origem: string;
}
interface Interpretacao {
  ativo: boolean;
  plano: string | null;
  pedidos: PrePedido[];
  avisos: string[];
  fonte: string;
}

let atoMaria = "";

describe("Assistente de pedidos (P/)", () => {
  beforeAll(async () => {
    definirRelogio("2026-09-23T09:00");
    servidor = criarApp().listen(0);
    await new Promise((r) => servidor.once("listening", r));
    const e = servidor.address();
    if (!e || typeof e === "string") throw new Error("sem porta");
    baseUrl = `http://127.0.0.1:${e.port}`;
    await api("/api/repor-demo", "U12", {});
    const agenda = await api<{ atos: { ato_id: string; doente_id: string }[] }>("/api/oasis/medico/agenda", "U01");
    atoMaria = agenda.atos.find((a) => a.doente_id === "100101")!.ato_id;
  });
  afterAll(async () => {
    reporRelogio();
    await new Promise((r) => servidor.close(r));
  });

  it("traduz o plano do guião nos 3 pedidos, sem avisos", async () => {
    const r = await api<Interpretacao>(`/api/oasis/consulta/${atoMaria}/interpretar-plano`, "U01", { diario: DIARIO_MARIA });
    expect(r.ativo).toBe(true);
    expect(r.plano).toBe("TC TAP; cons. Onco; rev c/ exames comigo");
    expect(r.avisos).toEqual([]);
    expect(r.pedidos.map((p) => [p.tipo_pedido, p.especialidade_destino, p.ato_codigo])).toEqual([
      ["exame", "7000_2", "1"],
      ["pedido_consulta", "1300", "1"],
      ["consulta", "2102", ""],
    ]);
    expect(r.pedidos[0].exames).toEqual(["7000002", "7000004", "7000009"]);
    expect(r.pedidos[2]).toMatchObject({ depende_exames_consulta: true, continuidade_medico: true, texto_origem: "rev c/ exames comigo" });
  });

  it("lê também análises e contraste (abreviaturas)", async () => {
    const r = await api<Interpretacao>(`/api/oasis/consulta/${atoMaria}/interpretar-plano`, "U01", {
      diario: "P/ colheita c/ jejum: hemog, bioq, creat, CEA, CA 19.9; TC TAP c/ contraste",
    });
    expect(r.avisos).toEqual([]);
    expect(r.pedidos[0]).toMatchObject({ tipo_pedido: "analises", ato_codigo: "9", analises: ["A001", "A002", "A003", "A004", "A005"] });
    expect(r.pedidos[1].especificacao).toContain("contraste");
  });

  it("o que não percebe fica assinalado, nunca adivinhado", async () => {
    const r = await api<Interpretacao>(`/api/oasis/consulta/${atoMaria}/interpretar-plano`, "U01", {
      diario: "Bem.\nP/ TC AP s/ contraste, rev 3/12 MP; fisioterapia",
    });
    expect(r.pedidos.map((p) => p.tipo_pedido)).toEqual(["exame", "consulta"]);
    expect(r.pedidos[1]).toMatchObject({ prioridade: "MP", nao_antes: "2026-12-12" });
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toContain("fisioterapia");
  });

  it("sem P/ não há plano", async () => {
    const r = await api<Interpretacao>(`/api/oasis/consulta/${atoMaria}/interpretar-plano`, "U01", { diario: "Doente bem, rever em 3 meses." });
    expect(r).toMatchObject({ ativo: true, plano: null, pedidos: [] });
  });

  it("o médico desliga o assistente nas Definições (e só para ele)", async () => {
    expect((await api<{ assistente_plano: boolean }>("/api/oasis/medico/definicoes", "U01")).assistente_plano).toBe(true);
    await api("/api/oasis/medico/definicoes", "U01", { assistente_plano: false });
    expect((await api<Interpretacao>(`/api/oasis/consulta/${atoMaria}/interpretar-plano`, "U01", { diario: DIARIO_MARIA })).ativo).toBe(false);
    expect((await api<{ assistente_plano: boolean }>("/api/oasis/medico/definicoes", "U02")).assistente_plano).toBe(true);
    await api("/api/oasis/medico/definicoes", "U01", { assistente_plano: true });
    expect((await api<Interpretacao>(`/api/oasis/consulta/${atoMaria}/interpretar-plano`, "U01", { diario: DIARIO_MARIA })).pedidos).toHaveLength(3);
  });

  it("submeter a pré-selecção dá as marcações do guião e fica registado no evento", async () => {
    const r = await api<Interpretacao>(`/api/oasis/consulta/${atoMaria}/interpretar-plano`, "U01", { diario: DIARIO_MARIA });
    const consulta = await api<{ ato: { ato_codigo: string } }>(`/api/oasis/consulta/${atoMaria}`, "U01");
    // Como o assistente do médico faz: a próxima consulta sem acto fica com o acto desta consulta.
    const pedidos = r.pedidos.map((p) => ({
      ...p,
      ato_codigo: p.ato_codigo || consulta.ato.ato_codigo,
      pre_selecionado: p.texto_origem,
    }));
    const sub = await api<{ pedidos: { estado: string; data_marcada: string; pedido_id: string }[] }>(`/api/oasis/consulta/${atoMaria}/pedidos`, "U01", {
      pedidos,
    });
    expect(sub.pedidos.map((p) => p.data_marcada || p.estado)).toEqual(["2026-10-14T08:20", "EM_TRIAGEM", "2026-10-21T08:30"]);
    // A triagem de Oncologia Médica recebe-o em primeiro; aceite, a ficha fica com 3 marcados.
    const fila = await api<{ fila: { pedido_id: string; doente_id: string }[] }>("/api/triagem/fila", "U04");
    expect(fila.fila[0].doente_id).toBe("100101");
    await api(`/api/triagem/${fila.fila[0].pedido_id}/aceitar`, "U04", {});
    const depois = await api<{ progresso: { total: number; marcados: number; por_marcar: number } }>("/api/doente/100101", "U01");
    expect(depois.progresso).toMatchObject({ total: 3, marcados: 3, por_marcar: 0 });
    const ficha = await api<{ historico: { detalhe: string }[] }>("/api/doente/100101", "U01");
    expect(JSON.stringify(ficha)).toContain("pré-seleccionado pelo assistente");
  });

  it("reencaminhar: só para serviços com triagem; o novo triador é avisado e, aceite, a ficha fica marcada", async () => {
    await api("/api/repor-demo", "U12", {});
    const destinos = await api<{ codigo: string }[]>("/api/triagem/especialidades", "U04");
    expect(destinos.map((d) => d.codigo).sort()).toEqual(["2300", "9610"]);
    const consulta = await api<{ ato: { ato_codigo: string } }>(`/api/oasis/consulta/${atoMaria}`, "U01");
    const r = await api<Interpretacao>(`/api/oasis/consulta/${atoMaria}/interpretar-plano`, "U01", { diario: DIARIO_MARIA });
    await api(`/api/oasis/consulta/${atoMaria}/pedidos`, "U01", { pedidos: r.pedidos.map((p) => ({ ...p, ato_codigo: p.ato_codigo || consulta.ato.ato_codigo })) });
    const pedido = (await api<{ fila: { pedido_id: string; doente_id: string }[] }>("/api/triagem/fila", "U04")).fila[0];
    await expect(api(`/api/triagem/${pedido.pedido_id}/reencaminhar`, "U04", { especialidade: "7000_2" })).rejects.toThrow("400");
    await api(`/api/triagem/${pedido.pedido_id}/reencaminhar`, "U04", { especialidade: "2300", motivo: "Pertence a Radioterapia" });
    const notifs = (await api<{ notificacoes: { tipo: string; doente_id: string }[] }>("/api/notificacoes", "U06")).notificacoes;
    expect(notifs.some((n) => n.tipo === "PEDIDO_EM_TRIAGEM" && n.doente_id === "100101")).toBe(true);
    const filaRt = (await api<{ fila: { pedido_id: string; doente_id: string }[] }>("/api/triagem/fila", "U06")).fila;
    expect(filaRt.some((f) => f.pedido_id === pedido.pedido_id)).toBe(true);
    await api(`/api/triagem/${pedido.pedido_id}/aceitar`, "U06", {});
    const ficha = await api<{ progresso: { total: number; marcados: number } }>("/api/doente/100101", "U01");
    expect(ficha.progresso).toMatchObject({ total: 3, marcados: 3 });
  });
});
