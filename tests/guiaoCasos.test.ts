// Guião da demo organizado por CASOS (página /guiao): o caso normal (tudo corre bem) e os casos
// com problemas em que as regras de prioridade decidem (ESPECIFICACAO.md secção 8A). Corre pela
// API, pela ordem exacta em que a demo é apresentada, duas vezes seguidas após "Repor demo".
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
const get = <T,>(caminho: string, u: string) => api<T>(caminho, u);
const post = <T,>(caminho: string, u: string, corpo?: unknown) =>
  api<T>(caminho, u, { method: "POST", body: corpo !== undefined ? JSON.stringify(corpo) : undefined });

interface Agenda { agenda: { pedido_id: string; data_hora: string; especialidade_legivel: string; motivo_marcacao: string; dentro_do_prazo: boolean | null }[] }
interface Candidato { doente_nome: string; excluido: boolean; motivo_exclusao: string; escolhido: boolean; escolhido_regra_antiga: boolean; custo: number }

async function correrCasos() {
  const r: Record<string, unknown> = {};
  const agendaU01 = await get<{ atos: { ato_id: string; data_hora: string }[] }>("/api/oasis/medico/agenda", "U01");

  // Caso A — tudo corre bem. A1: Maria (consulta → pedidos → marcados, com dependências)
  const atoMaria = agendaU01.atos.find((a) => a.data_hora === "2026-09-23T08:30")!;
  await post(`/api/oasis/consulta/${atoMaria.ato_id}/pedidos`, "U01", {
    pedidos: [
      // O plano do guião (P/ TC TAP; cons. Onco; rev c/ exames comigo): 3 pedidos.
      { especialidade_destino: "7000_2", ato_codigo: "1", exames: ["7000002", "7000004", "7000009"], especificacao: "TC TAP" },
      { especialidade_destino: "1300", ato_codigo: "1", especificacao: "cons. Onco" },
      { especialidade_destino: "2102", ato_codigo: "22", especificacao: "rev c/ exames comigo", depende_exames_consulta: true, continuidade_medico: true },
    ],
  });
  const maria = await get<Agenda>("/api/doente/100101", "U03");
  r.maria = maria.agenda.map((m) => `${m.especialidade_legivel} ${m.data_hora}`);

  // A2: a triagem de Oncologia Médica recebe o pedido da Maria em primeiro e aceita-o
  const filaOM = await get<{ fila: { pedido_id: string; doente_id: string }[] }>("/api/triagem/fila", "U04");
  r.maria_primeira_na_triagem = filaOM.fila[0].doente_id === "100101";
  await post(`/api/triagem/${filaOM.fila[0].pedido_id}/aceitar`, "U04", {});
  const fichaMaria = await get<{ progresso: { marcados: number; problemas: number } }>("/api/doente/100101", "U01");
  r.maria_ficha = `${fichaMaria.progresso.marcados} marcados, ${fichaMaria.progresso.problemas} problemas`;

  // Caso B — TAC cheio: quem cede a vaga ao José?
  // O TC do José (P00007) segue o circuito no arranque: sem vaga, a proposta de troca já está à espera da Radiologia.
  const propostas = await get<{ proposta_id: string; pedido_urgente_doente: string; avaliacao: Candidato[]; escolhido_regra_antiga: string }[]>(
    "/api/servico/propostas",
    "U07",
  );
  const pJose = propostas.find((p) => p.pedido_urgente_doente.includes("José"))!;
  r.jose_escolhido = pJose.avaliacao.find((c) => c.escolhido)?.doente_nome;
  r.jose_regra_antiga = pJose.escolhido_regra_antiga;
  r.jose_excluidos = pJose.avaliacao.filter((c) => c.excluido && !c.motivo_exclusao.startsWith("faltam")).map((c) => c.doente_nome);
  r.jose_custos = pJose.avaliacao.filter((c) => !c.excluido).map((c) => `${c.doente_nome}:${c.custo}`);
  await post(`/api/servico/propostas/${pJose.proposta_id}/aprovar`, "U07");
  r.jose = (await get<Agenda>("/api/doente/100104", "U03")).agenda.map((m) => m.data_hora);
  r.manuel = (await get<Agenda>("/api/doente/100106", "U03")).agenda.map((m) => m.data_hora);
  // Laboratório: e se o Manuel já tivesse sido remarcado uma vez?
  const lab = await post<{ escolhido: string; escolhido_original: string }>("/api/prioridades/simular", "U12", {
    pedidoId: "P00007",
    sobreposicoes: { "100106": { remarcacoes_hospital: 1 } },
  });
  r.lab_original = lab.escolhido_original;
  r.lab_manuel_remarcado = lab.escolhido;

  // Caso C — o Rui desmarca com uma semana de aviso: quem aproveita a vaga?
  const marcacoes = await get<{ pedido_id: string; doente_nome: string }[]>("/api/servico/marcacoes", "U07");
  const pRui = marcacoes.find((m) => m.doente_nome.includes("Rui Fonseca"))!;
  const desm = await post<{ oferta: { oferta_id: string; doente_id: string; motivo: string } | null; reagendado_para: string | null }>(
    `/api/servico/pedidos/${pRui.pedido_id}/desmarcar`,
    "U07",
    { disponivelAPartirDe: "2026-10-19" },
  );
  r.rui_reagendado = desm.reagendado_para;
  r.oferta_para = desm.oferta?.doente_id;
  const resp = await post<{ seguinte: { doente_nome: string; data_hora_vaga: string } | null }>(
    `/api/servico/ofertas/${desm.oferta!.oferta_id}/responder`,
    "U07",
    { aceita: true },
  );
  r.helena = (await get<Agenda>("/api/doente/100112", "U07")).agenda.map((m) => `${m.data_hora} ${m.dentro_do_prazo ? "dentro" : "fora"}`);
  r.cascata = resp.seguinte ? `${resp.seguinte.doente_nome} ${resp.seguinte.data_hora_vaga}` : null;

  // Caso D — doente de longe e sem telemóvel: dia único + lista de chamadas
  const atoJoaquim = agendaU01.atos.find((a) => a.data_hora === "2026-09-23T11:50")!;
  await post(`/api/oasis/consulta/${atoJoaquim.ato_id}/pedidos`, "U01", {
    pedidos: [{ especialidade_destino: "6100", ato_codigo: "4", analises: ["A001", "A004"] }],
  });
  const joaquim = await get<Agenda>("/api/doente/100109", "U08");
  r.joaquim = joaquim.agenda.map((m) => `${m.especialidade_legivel} ${m.data_hora}`);
  r.joaquim_motivo = joaquim.agenda.find((m) => m.motivo_marcacao.startsWith("Dia único"))?.motivo_marcacao ?? null;
  const chamadasTac = await get<{ itens: { doente_nome: string; motivos: { codigo: string }[] }[]; marcacoesNoHorizonte: number }>(
    "/api/servico/chamadas",
    "U07",
  );
  r.chamadas_tac = `${chamadasTac.itens.length}/${chamadasTac.marcacoesNoHorizonte}`;
  r.chamada_joaquim = chamadasTac.itens.find((i) => i.doente_nome.includes("Joaquim"))?.motivos.map((m) => m.codigo).join(",") ?? null;
  r.chamada_maria = chamadasTac.itens.find((i) => i.doente_nome.includes("Maria Fernandes"))?.motivos.map((m) => m.codigo).join(",") ?? null;

  // Caso E — avaria na Ecografia a 24/09: o técnico reporta, a administrativa recebe o plano e valida
  await post("/api/tecnico/avarias", "U13", {
    especialidade_codigo: "7000_3",
    descricao: "Ecógrafo avariado (sonda); técnico da marca só amanhã ao fim do dia",
    duracao_dias: 1,
    data_inicio: "2026-09-24",
  });
  const notifEco = await get<{ notificacoes: { tipo: string; titulo: string }[] }>("/api/notificacoes", "U11");
  r.notificacao_eco = notifEco.notificacoes.find((n) => n.tipo === "AVARIA_SERVICO")?.titulo ?? null;
  interface PR { proposta_id: string; ordem: number; doente_nome: string; indice: number; data_hora_sugerida: string; dentro_do_prazo: boolean | null; justificacao: string; avisos: string[] }
  const planoEco = await get<{ avarias: { avaria_id: string; propostas: PR[] }[] }>("/api/servico/remarcacoes", "U11");
  const plano = planoEco.avarias[0];
  r.plano_eco = plano.propostas.map((p) => `${p.ordem} ${p.doente_nome} ${p.indice} → ${p.data_hora_sugerida}${p.dentro_do_prazo === false ? " FORA" : ""}`);
  r.plano_artur = plano.propostas.find((p) => p.doente_nome.startsWith("Artur"))!.justificacao;
  r.plano_fatima_avisos = plano.propostas.find((p) => p.doente_nome.startsWith("Fátima"))!.avisos;
  const aceites = await post<{ aceites: number }>(`/api/servico/avarias/${plano.avaria_id}/aceitar-plano`, "U11");
  r.plano_aceites = aceites.aceites;
  r.olga = (await get<Agenda>("/api/doente/100118", "U11")).agenda.map((m) => `${m.especialidade_legivel} ${m.data_hora}`);
  // Diogo (o de menor índice) ficou sem vaga a tempo da revisão de 29/09: alerta → a administrativa
  // não tem vaga extra nem outsourcing → envia ao médico → a Dra. Sofia adia a consulta.
  const diogo = plano.propostas.find((p) => p.doente_nome.startsWith("Diogo"))!;
  r.diogo_plano = `${diogo.data_hora_sugerida || "sem vaga a tempo"}`;
  r.diogo_justificacao = diogo.justificacao;
  const alertasEco = await get<{ tipo: string; descricao: string }[]>("/api/servico/alertas", "U11");
  r.alerta_diogo = alertasEco.some((a) => a.tipo === "SEM_VAGA_A_TEMPO" && a.descricao.includes("Diogo"));
  await post(`/api/servico/remarcacoes/${diogo.proposta_id}/pedir-decisao-medico`, "U11");
  const decisoes = await get<{ proposta_id: string; data_minima_adiar: string }[]>("/api/meus-pedidos/decisoes-remarcacao", "U02");
  r.decisao_medico_data_minima = decisoes[0]?.data_minima_adiar;
  const decisao = await post<{ consulta: string; exame: string }>(`/api/meus-pedidos/decisoes-remarcacao/${decisoes[0].proposta_id}`, "U02", {
    decisao: "ADIAR",
    novaData: decisoes[0].data_minima_adiar,
  });
  r.diogo_decisao = `consulta ${decisao.consulta} · eco ${decisao.exame}`;
  const tecnico = await get<{ notificacoes: { tipo: string }[] }>("/api/notificacoes", "U13");
  r.tecnico_avisado = tecnico.notificacoes.some((n) => n.tipo === "AVARIA_RESOLVIDA");

  // Caso F — falta a uma análise: a administrativa recebe a sugestão com justificação e aceita
  interface MF { semaforo: { cor: string }; dependencias: { pedido_id: string; pode_remarcar: boolean }[] }
  const antes = await get<{ marcacoesFuturas: MF[] }>("/api/doente/100102", "U08");
  r.antonio_antes = antes.marcacoesFuturas[0].semaforo.cor;
  const faltas = await get<{ faltas: PR[] }>("/api/servico/remarcacoes", "U08");
  const sugestao = faltas.faltas.find((p) => p.doente_nome.startsWith("António"))!;
  r.antonio_sugestao = sugestao.justificacao;
  await post(`/api/servico/remarcacoes/${sugestao.proposta_id}/aceitar`, "U08");
  const dep = antes.marcacoesFuturas[0].dependencias.find((d) => d.pode_remarcar)!;
  r.antonio_depois = (await get<{ marcacoesFuturas: MF[] }>("/api/doente/100102", "U08")).marcacoesFuturas[0].semaforo.cor;
  r.antonio_colheita = (await get<Agenda>("/api/doente/100102", "U08")).agenda.find((m) => m.pedido_id === dep.pedido_id)?.data_hora;

  // Caso G0 — sem vaga a tempo: a Joana pede vaga extra para a Fernanda e a gestão aprova
  const fern = (await get<{ porEstado: Record<string, { pedido_id: string; doente_nome: string; vaga_extra_sugerida: string }[]> }>("/api/servico/pedidos", "U03")).porEstado.SEM_VAGA.find((p) => p.doente_nome.startsWith("Fernanda"))!;
  await post(`/api/servico/pedidos/${fern.pedido_id}/pedir-vaga-extra`, "U03", { dataHora: fern.vaga_extra_sugerida });
  const ve = (await get<{ id: string; estado: string }[]>("/api/gestao/vagas-extra", "U12")).find((v) => v.estado === "PENDENTE")!;
  r.vaga_extra = (await post<{ data_hora: string }>(`/api/gestao/vagas-extra/${ve.id}/aprovar`, "U12", {})).data_hora;

  // Caso G — gestão: prazos em risco e sessão extra de TAC no sábado 26/09
  const prazos = await get<{ total: number; itens: { doente_nome: string; solucao: string }[] }>("/api/prioridades/prazos-em-risco", "U12");
  r.prazos_total = prazos.total;
  const previsao = await post<{ vagas: number; doentes: { doente_nome: string; data_hora_nova: string }[]; dias_ganhos: number }>(
    "/api/prioridades/sessao-extra/previsao",
    "U12",
    { especialidade: "7000_2", data: "2026-09-26", horaInicio: "08:00", nVagas: 6 },
  );
  r.sessao_previsao = previsao.doentes.map((d) => `${d.doente_nome} ${d.data_hora_nova}`);
  r.sessao_dias_ganhos = previsao.dias_ganhos;
  const sessao = await post<{ vagas: number; ofertas: number }>("/api/prioridades/sessao-extra", "U12", {
    especialidade: "7000_2",
    data: "2026-09-26",
    horaInicio: "08:00",
    nVagas: previsao.doentes.length,
  });
  r.sessao_aberta = `${sessao.vagas} vagas, ${sessao.ofertas} ofertas`;

  // Impacto
  const imp = await get<{ sessao: Record<string, number>; linhaDeBase: Record<string, number>; projecaoMensal: Record<string, unknown> }>(
    "/api/prioridades/impacto",
    "U12",
  );
  r.impacto = { sessao: imp.sessao, linhaDeBase: imp.linhaDeBase, projecao: imp.projecaoMensal };
  return r;
}

describe("Guião por casos (caso normal + casos em que a prioridade decide)", () => {
  beforeAll(async () => {
    definirRelogio("2026-09-23T09:00");
    const app = criarApp();
    await new Promise<void>((resolve) => {
      servidor = app.listen(0, resolve);
    });
    const endereco = servidor.address();
    if (!endereco || typeof endereco === "string") throw new Error("Sem porta");
    baseUrl = `http://127.0.0.1:${endereco.port}`;
  });

  afterAll(async () => {
    reporRelogio();
    await new Promise<void>((resolve, reject) => servidor.close((e) => (e ? reject(e) : resolve())));
  });

  it("corre duas vezes seguidas depois de 'Repor demo' com os resultados esperados", async () => {
    await post("/api/repor-demo", "U12");
    const primeira = await correrCasos();

    // Caso A — tudo corre bem (ficha do doente mostra tudo marcado)
    expect(primeira.maria).toEqual([
      "Onc. Cirúrgica-C. Digestivo 2026-09-23T08:30",
      "Radiologia-Geral (TAC) 2026-10-14T08:20",
      "Onc. Cirúrgica-C. Digestivo 2026-10-21T08:30",
    ]);
    expect(primeira.maria_primeira_na_triagem).toBe(true);
    expect(primeira.maria_ficha).toBe("3 marcados, 0 problemas");

    // Caso B — TAC cheio: as regras escolhem o Manuel; a regra antiga teria escolhido o Joaquim
    expect(primeira.jose_escolhido).toBe("Manuel Costa Ferreira");
    expect(primeira.jose_regra_antiga).toBe("Joaquim Alves Pereira");
    expect(primeira.jose_excluidos).toEqual(expect.arrayContaining(["Beatriz Sousa Rocha", "Tiago Marques Silva"]));
    expect(primeira.jose_custos).toEqual(["Manuel Costa Ferreira:-30", "Graça Pereira Santos:49", "Joaquim Alves Pereira:70"]);
    expect(primeira.jose).toEqual(["2026-10-02T10:00"]);
    expect(primeira.manuel).toEqual(["2026-10-14T08:00"]);
    expect(primeira.lab_original).toBe("Manuel Costa Ferreira");
    expect(primeira.lab_manuel_remarcado).toBe("Graça Pereira Santos");

    // Caso C — desmarcação com aviso: a vaga vai para a Helena (em diagnóstico, fora do prazo)
    expect(primeira.oferta_para).toBe("100112");
    expect(primeira.helena).toEqual(["2026-09-30T09:00 fora"]);
    expect(primeira.cascata).toBe("Luís Martins Alves 2026-10-13T09:00");
    expect(primeira.rui_reagendado).toBe("2026-10-19T08:40");

    // Caso D — dia único e lista de chamadas
    expect(primeira.joaquim).toContain("Patologia Clínica-Geral 2026-10-01T10:00");
    expect(primeira.joaquim_motivo).toContain("Castelo Branco");
    expect(primeira.chamada_joaquim).toBe("SEM_CONTACTO,IDADE");
    // A Maria (TC sem contraste) fica só com SMS + lembrete: não precisa de chamada.
    expect(primeira.chamada_maria).toBeNull();

    // Caso E — avaria na Ecografia
    expect(primeira.notificacao_eco).toBe("Avaria em Radiologia-Geral (Ecografia): 5 marcação(ões) a remarcar");
    expect(primeira.plano_eco).toEqual([
      "1 Sónia Marques Lopes 717 → 2026-09-25T10:40",
      "2 Artur Nunes Gomes 621 → 2026-09-28T11:00 FORA",
      "3 Fátima Correia Dias 566 → 2026-09-28T12:00",
      "4 Olga Santos Ferreira 138 → 2026-10-01T11:40",
      "5 Diogo Almeida Reis 134 →  FORA",
    ]);
    expect(primeira.plano_artur).toContain("A única vaga dentro do prazo (25/09/2026 10:40) ficou para Sónia Marques Lopes: índice 717 contra 621");
    expect(primeira.plano_fatima_avisos).toEqual(["2.ª remarcação pelo hospital (inevitável: avaria) — ligar ao doente a explicar"]);
    expect(primeira.plano_aceites).toBe(4); // o Diogo não entra no "Aceitar todas": precisa de uma escolha humana
    expect(primeira.diogo_plano).toBe("sem vaga a tempo");
    expect(primeira.diogo_justificacao).toContain("A única vaga a tempo (25/09/2026 10:40) ficou para Sónia Marques Lopes: índice 717 contra 134");
    expect(primeira.alerta_diogo).toBe(true);
    expect(primeira.decisao_medico_data_minima).toBe("2026-10-01");
    expect(primeira.diogo_decisao).toBe("consulta 2026-10-06T09:30 · eco 2026-09-28T12:40");
    expect(primeira.sessao_previsao).toEqual(["Paula Ribeiro Nunes 2026-09-26T08:00", "Helena Duarte Matos 2026-09-26T08:20"]);
    expect(primeira.sessao_aberta).toBe("2 vagas, 2 ofertas");
    expect(primeira.vaga_extra).toBe("2026-11-09T18:00");
    expect(primeira.olga).toEqual(["Onc. Cirúrgica-C. Digestivo 2026-10-01T10:50", "Radiologia-Geral (Ecografia) 2026-10-01T11:40"]);
    expect(primeira.tecnico_avisado).toBe(true);
    expect(primeira.antonio_sugestao).toContain("Sugerido 24/09/2026 07:30: primeira vaga que ainda dá tempo ao resultado antes da consulta");

    // Caso F — falta a uma análise
    expect(primeira.antonio_antes).toBe("vermelho");
    expect(primeira.antonio_depois).toBe("amarelo");
    expect(primeira.antonio_colheita).toBe("2026-09-24T07:30");

    // Impacto
    const impacto = primeira.impacto as { sessao: Record<string, number> };
    expect(impacto.sessao.doentes_remarcados_2_vezes).toBe(0);
    expect(impacto.sessao.doentes_vulneraveis_protegidos).toBe(3);
    expect(impacto.sessao.vagas_reaproveitadas).toBe(1);
    expect(impacto.sessao.dias_ganhos).toBe(13);
    expect(impacto.sessao.deslocacoes_evitadas).toBe(2);
    expect(impacto.sessao.segundas_remarcacoes_inevitaveis).toBe(2);
    expect(impacto.sessao.remarcacoes_avaria_validadas).toBe(5);
    expect(impacto.sessao.sugestoes_falta_aceites).toBe(1);

    await post("/api/repor-demo", "U12");
    const segunda = await correrCasos();
    expect(segunda).toEqual(primeira);
  });

  // A ausência de um médico (férias) saiu do guião apresentado, mas continua a funcionar.
  it("ausência de um médico: o plano de remarcação sai com continuidade", async () => {
    await post("/api/repor-demo", "U12");
    interface PR { ordem: number; doente_nome: string; data_hora_sugerida: string }
    const aus = await post<{ afetadas: number }>("/api/servico/ausencias", "U03", { medico_id: "U02", data_inicio: "2026-10-08", duracao_dias: 1, motivo: "Férias" });
    expect(aus.afetadas).toBe(7);
    const plano = await get<{ avarias: { tipo: string; propostas: PR[] }[] }>("/api/servico/remarcacoes", "U03");
    const p = plano.avarias.find((a) => a.tipo === "AUSENCIA_MEDICO")!;
    expect(p.propostas).toHaveLength(7);
    expect(p.propostas.every((x) => x.data_hora_sugerida)).toBe(true);
  });

  // Luísa (reencaminhamento) e Fernando (Hospital de Dia + R2) saíram do guião, mas continuam a funcionar.
  it("reencaminhar para Radioterapia e Hospital de Dia com a colheita pré-QT a tempo (sem semáforo vermelho)", async () => {
    await post("/api/repor-demo", "U12");
    const filaOM = await get<{ fila: { pedido_id: string; doente_nome: string }[] }>("/api/triagem/fila", "U04");
    const pLuisa = filaOM.fila.find((f) => f.doente_nome.includes("Luísa"))!;
    await post(`/api/triagem/${pLuisa.pedido_id}/reencaminhar`, "U04", { especialidade: "2300", motivo: "Pertence a Radioterapia" });
    await post(`/api/triagem/${pLuisa.pedido_id}/aceitar`, "U06", {});
    expect((await get<Agenda>("/api/doente/100103", "U04")).agenda.map((m) => m.data_hora)).toEqual(["2026-09-30T09:00"]);
    const filaHd = await get<{ fila: { pedido_id: string; doente_nome: string }[] }>("/api/triagem/fila", "U10");
    const pFernando = filaHd.fila.find((f) => f.doente_nome.includes("Fernando"))!;
    await post(`/api/triagem/${pFernando.pedido_id}/aceitar`, "U10", {});
    const ficha = await get<{ agenda: { especialidade_legivel: string; data_hora: string }[]; percurso: { problema: string }[] }>("/api/doente/100108", "U10");
    expect(ficha.agenda.map((m) => `${m.especialidade_legivel} ${m.data_hora}`)).toEqual(["Patologia Clínica-Geral 2026-09-24T07:30", "Hospital de Dia-Oncologia 2026-09-25T08:30"]);
    expect(ficha.percurso.every((e) => !e.problema)).toBe(true);
  });
});
