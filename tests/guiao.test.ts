// Fase 9, ponto 4: percorre os 8 passos do guião pela API (não pelo motor directamente,
// como tests/cenarios.test.ts) — como a demo ao vivo faria, um pedido HTTP de cada vez —
// faz "Repor demo" e repete, e verifica que as duas passagens dão exactamente o mesmo
// resultado (CLAUDE.md, "Definição de feito": "o guião corre do início ao fim duas vezes
// seguidas após 'Repor demo'").
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { criarApp } from "../server/app.ts";
import { definirRelogio, reporRelogio } from "../server/clock.ts";

let servidor: Server;
let baseUrl: string;

async function api<T>(caminho: string, utilizadorId: string, opcoes: RequestInit = {}): Promise<T> {
  const resposta = await fetch(`${baseUrl}${caminho}`, {
    ...opcoes,
    headers: { "Content-Type": "application/json", "x-utilizador-id": utilizadorId, ...(opcoes.headers ?? {}) },
  });
  if (!resposta.ok) throw new Error(`${opcoes.method ?? "GET"} ${caminho} → ${resposta.status}: ${await resposta.text()}`);
  return (await resposta.json()) as T;
}
const get = <T,>(caminho: string, utilizadorId: string) => api<T>(caminho, utilizadorId);
const post = <T,>(caminho: string, utilizadorId: string, corpo?: unknown) =>
  api<T>(caminho, utilizadorId, { method: "POST", body: corpo !== undefined ? JSON.stringify(corpo) : undefined });

interface AtoAgenda {
  ato_id: string;
  data_hora: string;
}
interface ItemTimeline {
  pedido_id: string;
  tipo: string;
  detalhe: string;
}

function dataDaMarcacao(timeline: ItemTimeline[], pedidoId: string): string | null {
  const evento = timeline.find((e) => e.pedido_id === pedidoId && e.tipo === "MARCACAO");
  const m = evento?.detalhe.match(/(\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : null;
}

/** Corre os 8 passos do guião pela API real e devolve um retrato dos resultados. */
async function correrGuiao() {
  const resultado: Record<string, unknown> = {};

  // 1. Maria (100101)
  const agendaU01 = await get<{ atos: AtoAgenda[] }>("/api/oasis/medico/agenda", "U01");
  const atoMaria = agendaU01.atos.find((a) => a.data_hora === "2026-09-23T08:30")!;
  await post(`/api/oasis/consulta/${atoMaria.ato_id}/guardar`, "U01", {
    s: "",
    o: "",
    a: "",
    p: "TC TAP c/ contraste + colheita c/ jejum (hemog, bioq c/ creat, CEA, CA 19.9). Rev c/ exames 1/12 comigo.",
  });
  const respMaria = await post<{ pedidos: { pedido_id: string; tipo_pedido: string }[] }>(
    `/api/oasis/consulta/${atoMaria.ato_id}/pedidos`,
    "U01",
    {
      pedidos: [
        { especialidade_destino: "6100", ato_codigo: "9", analises: ["A001", "A002", "A003", "A004", "A005"] },
        { especialidade_destino: "7000_2", ato_codigo: "1", exames: ["7000002", "7000004", "7000009"], especificacao: "com contraste" },
        { especialidade_destino: "2102", ato_codigo: "22", especificacao: "revisão com exames", depende_exames_consulta: true },
      ],
    },
  );
  const doente100101 = await get<{ timeline: ItemTimeline[] }>("/api/doente/100101", "U03");
  for (const p of respMaria.pedidos) resultado[`maria_${p.tipo_pedido}`] = dataDaMarcacao(doente100101.timeline, p.pedido_id);

  // 2. José (100104)
  const propostasRadiologia = await get<{ proposta_id: string; pedido_urgente_doente: string }[]>("/api/servico/propostas", "U07");
  const propostaJose = propostasRadiologia.find((p) => p.pedido_urgente_doente.includes("José"))!;
  await post(`/api/servico/propostas/${propostaJose.proposta_id}/aprovar`, "U07");
  const doente100104 = await get<{ timeline: ItemTimeline[] }>("/api/doente/100104", "U03");
  resultado.jose_tc = dataDaMarcacao(doente100104.timeline, "P00007");

  // 3. Rosa (100105)
  const atoRosa = agendaU01.atos.find((a) => a.data_hora === "2026-09-23T09:50")!;
  await post(`/api/oasis/consulta/${atoRosa.ato_id}/guardar`, "U01", {
    s: "",
    o: "",
    a: "",
    p: "HPC 4/4s. Colheita s/ jejum (hemog, CEA). Rev c/ resultados 1/12.",
  });
  const respRosa = await post<{ pedidos: { pedido_id: string; tipo_pedido: string }[] }>(
    `/api/oasis/consulta/${atoRosa.ato_id}/pedidos`,
    "U01",
    {
      pedidos: [
        { especialidade_destino: "6100", ato_codigo: "4", analises: ["A001", "A004"] },
        { especialidade_destino: "9602", ato_codigo: "3", exames: ["65270"], especificacao: "CVC" },
        { especialidade_destino: "2102", ato_codigo: "23", especificacao: "revisão com resultados", depende_exames_consulta: true },
      ],
    },
  );
  const doente100105 = await get<{ timeline: ItemTimeline[] }>("/api/doente/100105", "U03");
  const cvcRosaId = respRosa.pedidos.find((p) => p.tipo_pedido === "tratamento")!.pedido_id;
  resultado.rosa_cvc = dataDaMarcacao(doente100105.timeline, cvcRosaId);
  for (const p of respRosa.pedidos) resultado[`rosa_${p.tipo_pedido}`] = dataDaMarcacao(doente100105.timeline, p.pedido_id);

  // 4. Carlos (100107)
  const atoCarlos = agendaU01.atos.find((a) => a.data_hora === "2026-09-23T10:10")!;
  await post(`/api/oasis/consulta/${atoCarlos.ato_id}/guardar`, "U01", {
    s: "",
    o: "",
    a: "",
    p: "Mantém vigilância. HPC 4/4s. Rev 1/12 comigo.",
  });
  const respCarlos = await post<{ pedidos: { pedido_id: string; tipo_pedido: string }[] }>(
    `/api/oasis/consulta/${atoCarlos.ato_id}/pedidos`,
    "U01",
    {
      pedidos: [
        { especialidade_destino: "9602", ato_codigo: "3", exames: ["65270"], especificacao: "HPC" },
        { especialidade_destino: "2102", ato_codigo: "23" },
      ],
    },
  );
  const doente100107 = await get<{ timeline: ItemTimeline[] }>("/api/doente/100107", "U03");
  for (const p of respCarlos.pedidos) resultado[`carlos_${p.tipo_pedido}`] = dataDaMarcacao(doente100107.timeline, p.pedido_id);

  // 5. Luísa (100103)
  interface ItemFila {
    pedido_id: string;
    doente_nome: string;
  }
  const filaOncoMedica = await get<{ fila: ItemFila[] }>("/api/triagem/fila", "U04");
  const pedidoLuisa = filaOncoMedica.fila.find((f) => f.doente_nome.includes("Luísa"))!;
  await post(`/api/triagem/${pedidoLuisa.pedido_id}/reencaminhar`, "U04", { especialidade: "2300", motivo: "Pertence a Radioterapia" });
  await post(`/api/triagem/${pedidoLuisa.pedido_id}/aceitar`, "U06", {});
  const doente100103 = await get<{ timeline: ItemTimeline[] }>("/api/doente/100103", "U04");
  resultado.luisa_rt = dataDaMarcacao(doente100103.timeline, pedidoLuisa.pedido_id);

  // 6. Fernando (100108)
  const filaHd = await get<{ fila: ItemFila[] }>("/api/triagem/fila", "U10");
  const pedidoFernando = filaHd.fila.find((f) => f.doente_nome.includes("Fernando"))!;
  await post(`/api/triagem/${pedidoFernando.pedido_id}/aceitar`, "U10", {});
  const doente100108 = await get<{ timeline: ItemTimeline[] }>("/api/doente/100108", "U10");
  resultado.fernando_hd = dataDaMarcacao(doente100108.timeline, pedidoFernando.pedido_id);
  const colheitaFernando = doente100108.timeline.find((e) => e.tipo === "MARCACAO" && e.pedido_id !== pedidoFernando.pedido_id);
  resultado.fernando_colheita = colheitaFernando ? dataDaMarcacao(doente100108.timeline, colheitaFernando.pedido_id) : null;

  // 7. António (100102)
  interface MarcacaoFutura {
    pedido_id: string;
    semaforo: { cor: string };
    dependencias: { pedido_id: string; pode_remarcar: boolean }[];
  }
  const antesAntonio = await get<{ marcacoesFuturas: MarcacaoFutura[] }>("/api/doente/100102", "U08");
  const marcacaoAntonio = antesAntonio.marcacoesFuturas[0];
  resultado.antonio_semaforo_antes = marcacaoAntonio.semaforo.cor;
  const depParaRemarcar = marcacaoAntonio.dependencias.find((d) => d.pode_remarcar)!;
  await post(`/api/doente/100102/pedidos/${depParaRemarcar.pedido_id}/remarcar-exame`, "U08");
  const depoisAntonio = await get<{ marcacoesFuturas: MarcacaoFutura[] }>("/api/doente/100102", "U08");
  resultado.antonio_semaforo_depois = depoisAntonio.marcacoesFuturas[0].semaforo.cor;

  // 8. Gestão
  const metricas = await get<{ triagem: { aceites: number }; impactoEstimado: { cromosMes: number } }>("/api/gestao/metricas", "U12");
  resultado.gestao_aceites = metricas.triagem.aceites;
  resultado.gestao_cromos_mes = metricas.impactoEstimado.cromosMes;

  return resultado;
}

describe("Guião da demo pela API (Fase 9)", () => {
  beforeAll(async () => {
    definirRelogio("2026-09-23T09:00");
    const app = criarApp();
    await new Promise<void>((resolve) => {
      servidor = app.listen(0, resolve);
    });
    const endereco = servidor.address();
    if (!endereco || typeof endereco === "string") throw new Error("Sem porta atribuída ao servidor de teste");
    baseUrl = `http://127.0.0.1:${endereco.port}`;
  });

  afterAll(async () => {
    reporRelogio();
    await new Promise<void>((resolve, reject) => servidor.close((erro) => (erro ? reject(erro) : resolve())));
  });

  it("corre duas vezes seguidas depois de 'Repor demo' e dá sempre o mesmo resultado", async () => {
    await post("/api/repor-demo", "U12");
    const primeiraPassagem = await correrGuiao();

    expect(primeiraPassagem.maria_analises).toBe("24/09/2026 07:30");
    expect(primeiraPassagem.maria_exame).toBe("14/10/2026 08:20");
    expect(primeiraPassagem.maria_consulta).toBe("21/10/2026 08:30");
    expect(primeiraPassagem.jose_tc).toBe("02/10/2026 10:00");
    expect(primeiraPassagem.rosa_cvc).toBe("24/09/2026 09:00");
    expect(primeiraPassagem.rosa_analises).toBe("24/09/2026 07:30");
    expect(primeiraPassagem.rosa_consulta).toBe("28/09/2026 09:10");
    expect(primeiraPassagem.carlos_tratamento).toBe("24/09/2026 09:30");
    expect(primeiraPassagem.carlos_consulta).toBe("24/09/2026 09:30");
    expect(primeiraPassagem.luisa_rt).toBe("30/09/2026 09:00");
    expect(primeiraPassagem.fernando_hd).toBe("25/09/2026 08:30");
    expect(primeiraPassagem.fernando_colheita).toBe("24/09/2026 07:40");
    expect(primeiraPassagem.antonio_semaforo_antes).toBe("vermelho");
    expect(primeiraPassagem.antonio_semaforo_depois).toBe("amarelo");
    expect(primeiraPassagem.gestao_aceites).toBeGreaterThan(0);

    await post("/api/repor-demo", "U12");
    const segundaPassagem = await correrGuiao();

    expect(segundaPassagem).toEqual(primeiraPassagem);
  });
});
