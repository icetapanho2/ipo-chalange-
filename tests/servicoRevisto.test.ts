// Serviço reorganizado (DECISOES.md, 23/09/2026): equação do índice por serviço, avisos que não
// reabrem, semáforo com o intervalo da dependência, sugestão para "sem vaga" e rotas retiradas.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { criarApp } from "../server/app.ts";
import { definirRelogio, reporRelogio } from "../server/clock.ts";

let servidor: Server;
let baseUrl: string;

async function api<T>(caminho: string, u: string, corpo?: unknown): Promise<{ status: number; json: T }> {
  const r = await fetch(`${baseUrl}${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "x-utilizador-id": u },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as T };
}

interface Fila {
  fila: { pedido_id: string; indice: number; prioridade: string }[];
}

describe("Serviço revisto", () => {
  beforeAll(async () => {
    definirRelogio("2026-09-23T09:00");
    servidor = criarApp().listen(0);
    await new Promise((r) => servidor.once("listening", r));
    const e = servidor.address();
    if (!e || typeof e === "string") throw new Error("sem porta");
    baseUrl = `http://127.0.0.1:${e.port}`;
    await api("/api/repor-demo", "U12", {});
  });
  afterAll(async () => {
    reporRelogio();
    await new Promise((r) => servidor.close(r));
  });

  it("a equação do índice é por serviço: simular não guarda, guardar recalcula, repor volta ao original", async () => {
    const antes = (await api<Fila & { variaveis: Record<string, number> }>("/api/servico/indice", "U07")).json;
    const variaveis = { ...antes.variaveis, nivel_mp: 0, nivel_p: 0, nivel_n: 0 };
    const simulada = (await api<Fila>("/api/servico/indice/simular", "U07", variaveis)).json;
    expect(simulada.fila[0].indice).toBeLessThan(antes.fila[0].indice);
    expect((await api<Fila>("/api/servico/indice", "U07")).json.fila[0].indice).toBe(antes.fila[0].indice);

    await api("/api/servico/indice", "U07", variaveis);
    const guardada = (await api<Fila & { personalizado: boolean }>("/api/servico/indice", "U07")).json;
    expect(guardada.personalizado).toBe(true);
    expect(guardada.fila[0].indice).toBe(simulada.fila[0].indice);
    // Outro serviço mantém os valores por omissão.
    expect((await api<{ personalizado: boolean }>("/api/servico/indice", "U08")).json.personalizado).toBe(false);

    await api("/api/servico/indice/repor", "U07", {});
    expect((await api<Fila>("/api/servico/indice", "U07")).json.fila[0].indice).toBe(antes.fila[0].indice);
  });

  it("a creatinina da R1 marcada na véspera do TC não dá semáforo vermelho", async () => {
    const avisos = (await api<{ tipo: string }[]>("/api/servico/alertas", "U07")).json;
    expect(avisos.filter((a) => a.tipo === "SEMAFORO_VERMELHO")).toHaveLength(0);
  });

  it("um aviso marcado como visto não volta a abrir na acção seguinte", async () => {
    const prazos = async () => (await api<{ alerta_id: string; tipo: string }[]>("/api/servico/alertas", "U07")).json.filter((a) => a.tipo === "PRAZO_ULTRAPASSADO");
    const antes = await prazos();
    await api(`/api/servico/alertas/${antes[0].alerta_id}/fechar`, "U07", { accao: "Visto" });
    await api("/api/servico/indice/repor", "U07", {}); // qualquer acção recalcula os alertas
    expect((await prazos()).length).toBe(antes.length - 1);
  });

  it("sem vaga no prazo explica a sugestão (ou porque não há nenhuma)", async () => {
    type R = { porEstado: Record<string, { pedido_id: string; primeira_vaga: unknown; sem_sugestao: string }[]> };
    const semVaga = (await api<R>("/api/servico/pedidos", "U03")).json.porEstado.SEM_VAGA[0];
    // A revisão da Fernanda depende de exames (não pode ser antes de 09/11) e a agenda aberta acaba a 04/11.
    expect(semVaga.primeira_vaga).toBeNull();
    expect(semVaga.sem_sugestao).toBe("Não pode ser antes de 09/11/2026 (precisa dos resultados de que depende) e a agenda aberta do serviço só vai até 04/11/2026.");
    expect((await api(`/api/servico/pedidos/${semVaga.pedido_id}/aceitar-primeira-vaga`, "U03", {})).status).toBe(404);
  });

  it("validação, dicionário e tradutor já não existem", async () => {
    expect((await api("/api/validacao/consultas", "U03")).status).toBe(404);
    expect((await api("/api/dicionario", "U03")).status).toBe(404);
    expect((await api("/api/oasis/tradutor/testar", "U01", { texto: "x" })).status).toBe(404);
  });
});
