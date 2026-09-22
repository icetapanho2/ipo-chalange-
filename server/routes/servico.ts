import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { apenasData, diferencaDias, parseIso, somarDias } from "../util.ts";
import { aprovarPropostaTroca, rejeitarPropostaTroca, contarVagasLivres, janelaAgendamento } from "../motor/agendamento.ts";
import { resolverAlerta } from "../motor/alertas.ts";
import { calcularSemaforo } from "../motor/semaforo.ts";
import { resolverAvaria } from "../motor/avarias.ts";
import { remarcarPedido, adiarConsulta, marcarOutsourcing, pedirDecisaoMedico } from "../motor/fluxo.ts";
import { desmarcarAPedidoDoDoente, expirarOfertas, responderOferta } from "../motor/antecipacao.ts";
import { listaChamadas, registarChamada } from "../motor/chamadas.ts";
import { PESOS_PRIORIDADE_OMISSAO, pesosPrioridadeDoServico } from "../motor/prioridade.ts";
import {
  descreverDoente,
  descreverEspecialidade,
  descreverEstadioCuidado,
  descreverEstado,
  descreverPedido,
  descreverPrioridade,
  descreverTipoPedido,
  descreverUtilizador,
  descreverAto,
} from "../apresentacao.ts";
import type { Avaria, Pedido } from "../types.ts";

/** Mediana de uma lista de números (não altera o array original). */
function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 === 0 ? Math.round((ord[meio - 1] + ord[meio]) / 2) : ord[meio];
}

export function criarRotasServico(store: typeof StoreType) {
  const router = Router();

  function especialidadeDoUtilizador(utilizadorId: string): string | null {
    return store.utilizadores.find((u) => u.utilizador_id === utilizadorId)?.especialidade_codigo || null;
  }

  function pedidoResumo(p: Pedido) {
    return {
      pedido_id: p.pedido_id,
      doente_id: p.doente_id,
      doente_nome: descreverDoente(p.doente_id),
      medico_requisitante_nome: descreverUtilizador(p.medico_requisitante_id),
      tipo_pedido_legivel: descreverTipoPedido(p.tipo_pedido),
      descricao: descreverPedido(p),
      prioridade_legivel: descreverPrioridade(p.prioridade),
      prazo_limite: p.prazo_limite,
      estado: p.estado,
      estado_legivel: descreverEstado(p.estado),
      n_remarcacoes: p.n_remarcacoes,
      decisao_pendente: !!p.decisao_pendente,
    };
  }

  router.get("/pedidos", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    if (!especialidade) {
      res.status(400).json({ erro: "O perfil seleccionado não tem especialidade associada." });
      return;
    }
    const pedidos = store.pedidos.filter((p) => p.especialidade_destino === especialidade);
    const porEstado = new Map<string, Pedido[]>();
    for (const p of pedidos) {
      if (!porEstado.has(p.estado)) porEstado.set(p.estado, []);
      porEstado.get(p.estado)!.push(p);
    }
    res.json({
      especialidade,
      especialidade_legivel: descreverEspecialidade(especialidade),
      porEstado: Object.fromEntries([...porEstado.entries()].map(([estado, lista]) => [estado, lista.map(pedidoResumo)])),
    });
  });

  router.get("/alertas", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const alertas = store.alertas
      .filter((a) => a.estado === "ABERTO" && a.especialidade === especialidade)
      .map((a) => ({
        alerta_id: a.alerta_id,
        tipo: a.tipo,
        gravidade: a.gravidade,
        descricao: a.descricao,
        doente_nome: a.doente_id ? descreverDoente(a.doente_id) : "",
        criado_em: a.criado_em,
      }));
    res.json(alertas);
  });

  router.post("/alertas/:id/fechar", (req, res) => {
    const alerta = store.alertas.find((a) => a.alerta_id === req.params.id);
    if (!alerta || alerta.estado !== "ABERTO") {
      res.status(404).json({ erro: "Alerta não encontrado ou já resolvido." });
      return;
    }
    const accao: string = req.body?.accao ?? "";
    if (!accao.trim()) {
      res.status(400).json({ erro: "Descreva a acção tomada para fechar o alerta." });
      return;
    }
    resolverAlerta(alerta.alerta_id, req.utilizadorId, accao, agora());
    res.json({ ok: true });
  });

  router.get("/propostas", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const propostas = store.propostasTroca
      .filter((p) => p.estado === "PENDENTE" && p.especialidade === especialidade)
      .map((p) => ({
        proposta_id: p.proposta_id,
        justificacao: p.justificacao,
        criado_em: p.criado_em,
        pedido_urgente: p.pedido_urgente,
        pedido_urgente_doente: descreverDoente(store.pedidos.find((x) => x.pedido_id === p.pedido_urgente)?.doente_id ?? ""),
        avaliacao: p.avaliacao ?? [],
        escolhido_regra_antiga: p.escolhido_regra_antiga ?? "",
      }));
    res.json(propostas);
  });

  // ------------------------------------------------ marcações do serviço (para desmarcar a pedido do doente)
  router.get("/marcacoes", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const hoje = apenasData(agora());
    const marcacoes = store.pedidos
      .filter((p) => p.especialidade_destino === especialidade && p.estado === "MARCADO")
      .map((p) => ({ p, ato: store.atosMedicos.find((a) => a.mvp_ato_id === p.ato_id) }))
      .filter((x) => x.ato && diferencaDias(apenasData(parseIso(x.ato.data_hora)), hoje) >= 1)
      .map(({ p, ato }) => ({ ...pedidoResumo(p), data_hora: ato!.data_hora, ato_id: ato!.mvp_ato_id }))
      .sort((a, b) => a.data_hora.localeCompare(b.data_hora));
    res.json(marcacoes);
  });

  router.post("/pedidos/:id/desmarcar", (req, res) => {
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.id);
    if (!pedido || pedido.estado !== "MARCADO") {
      res.status(404).json({ erro: "Pedido não encontrado ou não está marcado." });
      return;
    }
    const disponivel: string | null = req.body?.disponivelAPartirDe || null;
    if (disponivel && !/^\d{4}-\d{2}-\d{2}$/.test(disponivel)) {
      res.status(400).json({ erro: "Data 'disponível a partir de' inválida (aaaa-mm-dd)." });
      return;
    }
    const r = desmarcarAPedidoDoDoente(pedido, req.utilizadorId, disponivel, agora());
    const novoAto = store.atosMedicos.find((a) => a.mvp_ato_id === pedido.ato_id);
    res.json({
      ok: true,
      oferta: r?.oferta ?? null,
      reagendado_para: pedido.estado === "MARCADO" ? novoAto?.data_hora ?? null : null,
    });
  });

  // ------------------------------------------------ vagas libertadas / ofertas de antecipação (secção 8A, R-E)
  function ofertaJson(o: (typeof store.ofertasAntecipacao)[number]) {
    return {
      ...o,
      doente_nome: descreverDoente(o.doente_id),
      pedido_descricao: descreverPedido(store.pedidos.find((p) => p.pedido_id === o.pedido_id)!),
    };
  }

  router.get("/vagas-libertadas", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    expirarOfertas(agora());
    const ofertas = store.ofertasAntecipacao.filter((o) => o.especialidade === especialidade);
    res.json({
      pendentes: ofertas.filter((o) => o.estado === "PENDENTE").map(ofertaJson),
      historico: ofertas.filter((o) => o.estado !== "PENDENTE").reverse().map(ofertaJson),
      libertadas: store.vagasLibertadas.filter((v) => v.especialidade === especialidade),
    });
  });

  router.post("/ofertas/:id/responder", (req, res) => {
    const r = responderOferta(req.params.id, !!req.body?.aceita, req.utilizadorId, agora());
    if (!r) {
      res.status(404).json({ erro: "Oferta não encontrada ou já respondida." });
      return;
    }
    res.json({ ok: true, oferta: ofertaJson(r.oferta), seguinte: r.seguinte ? ofertaJson(r.seguinte) : null });
  });

  // ------------------------------------------------ lista de chamadas (secção 8A, R-G)
  router.get("/chamadas", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId) ?? undefined;
    res.json(listaChamadas(especialidade, agora()));
  });

  router.post("/chamadas/:atoId", (req, res) => {
    const resultado = req.body?.resultado;
    if (!["CONFIRMADO", "NAO_ATENDEU", "VAI_DESMARCAR"].includes(resultado)) {
      res.status(400).json({ erro: "Resultado inválido." });
      return;
    }
    const chamada = registarChamada(
      req.params.atoId,
      resultado,
      req.utilizadorId,
      { nota: req.body?.nota ?? "", disponivelAPartirDe: req.body?.disponivelAPartirDe || null },
      agora(),
    );
    if (!chamada) {
      res.status(404).json({ erro: "Marcação não encontrada." });
      return;
    }
    res.json({ ok: true, chamada });
  });

  router.post("/propostas/:id/aprovar", (req, res) => {
    aprovarPropostaTroca(req.params.id, req.utilizadorId, agora());
    res.json({ ok: true });
  });

  router.post("/propostas/:id/rejeitar", (req, res) => {
    rejeitarPropostaTroca(req.params.id, req.utilizadorId, agora());
    res.json({ ok: true });
  });

  // Consultas em risco (semáforo vermelho) nos próximos `semaforo_horizonte_dias` (secção 11).
  router.get("/consultas-em-risco", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const hoje = apenasData(agora());
    const horizonte = store.parametros.semaforo_horizonte_dias;
    const emRisco = store.pedidos
      .filter((p) => p.especialidade_destino === especialidade)
      .map((p) => ({ pedido: p, semaforo: calcularSemaforo(p, hoje, horizonte) }))
      .filter((x) => x.semaforo?.cor === "vermelho")
      .map(({ pedido, semaforo }) => {
        const ato = store.atosMedicos.find((a) => a.mvp_ato_id === pedido.ato_id);
        return {
          pedido_id: pedido.pedido_id,
          doente_id: pedido.doente_id,
          doente_nome: descreverDoente(pedido.doente_id),
          descricao: descreverPedido(pedido),
          data_hora: ato?.data_hora ?? "",
          porque: semaforo!.porque,
        };
      })
      .sort((a, b) => a.data_hora.localeCompare(b.data_hora));
    res.json(emRisco);
  });

  // Fila para rever: faltas por remarcar e consultas em risco (semáforo vermelho) que o sistema
  // já sugere resolver, mas a admin decide (ou aplica directamente) — nunca acontece sozinho.
  router.get("/para-rever", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const hoje = apenasData(agora());
    const horizonte = store.parametros.semaforo_horizonte_dias;

    const faltas = store.pedidos
      .filter((p) => p.estado === "FALTOU" && p.especialidade_destino === especialidade)
      .map((p) => ({
        pedido_id: p.pedido_id,
        doente_nome: descreverDoente(p.doente_id),
        descricao: descreverPedido(p),
        prioridade_legivel: descreverPrioridade(p.prioridade),
        prazo_limite: p.prazo_limite,
        n_remarcacoes: p.n_remarcacoes,
        sugestao: "O doente faltou; o sistema sugere remarcar para a primeira vaga livre dentro do prazo.",
        accao: "remarcar" as const,
      }));

    const emRisco = store.pedidos
      .filter((p) => p.especialidade_destino === especialidade && p.estado === "MARCADO")
      .map((p) => ({ pedido: p, semaforo: calcularSemaforo(p, hoje, horizonte) }))
      .filter((x) => x.semaforo?.cor === "vermelho")
      .map(({ pedido, semaforo }) => ({
        pedido_id: pedido.pedido_id,
        doente_nome: descreverDoente(pedido.doente_id),
        descricao: descreverPedido(pedido),
        prioridade_legivel: descreverPrioridade(pedido.prioridade),
        prazo_limite: pedido.prazo_limite,
        n_remarcacoes: pedido.n_remarcacoes,
        sugestao: `Dependência em risco: ${semaforo!.porque}. O sistema sugere adiar esta marcação para libertar a vaga.`,
        accao: "adiar" as const,
      }));

    res.json({ faltas, emRisco });
  });

  router.post("/pedidos/:id/remarcar", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.id && p.especialidade_destino === especialidade);
    if (!pedido || pedido.estado !== "FALTOU") {
      res.status(404).json({ erro: "Pedido não encontrado ou não está em falta por remarcar." });
      return;
    }
    remarcarPedido(pedido, req.utilizadorId, agora());
    res.json({ ok: true, pedido: pedidoResumo(pedido) });
  });

  router.post("/pedidos/:id/adiar", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.id && p.especialidade_destino === especialidade);
    if (!pedido || pedido.estado !== "MARCADO") {
      res.status(404).json({ erro: "Pedido não encontrado ou não está marcado." });
      return;
    }
    adiarConsulta(pedido, req.utilizadorId, agora());
    res.json({ ok: true, pedido: pedidoResumo(pedido) });
  });

  // Sem vaga, sem solução interna: a administração conseguiu capacidade externa (outsourcing).
  router.post("/pedidos/:id/outsourcing", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.id && p.especialidade_destino === especialidade);
    if (!pedido || pedido.estado !== "SEM_VAGA") {
      res.status(404).json({ erro: "Pedido não encontrado ou não está sem vaga." });
      return;
    }
    marcarOutsourcing(pedido, req.utilizadorId, req.body?.nota ?? "", agora());
    res.json({ ok: true, pedido: pedidoResumo(pedido) });
  });

  // Sem vaga, sem solução (nem vaga extra, nem outsourcing): pede ao médico para decidir.
  router.post("/pedidos/:id/pedir-decisao", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.id && p.especialidade_destino === especialidade);
    if (!pedido || pedido.estado !== "SEM_VAGA") {
      res.status(404).json({ erro: "Pedido não encontrado ou não está sem vaga." });
      return;
    }
    const motivo: string = req.body?.motivo ?? "";
    if (!motivo.trim()) {
      res.status(400).json({ erro: "Descreva porque não há solução interna nem externa." });
      return;
    }
    pedirDecisaoMedico(pedido, req.utilizadorId, motivo.trim(), agora());
    res.json({ ok: true, pedido: pedidoResumo(pedido) });
  });

  /**
   * Sobrelotação: agrupa pedidos ACEITE/EM_TRIAGEM do serviço por (prioridade, prazo), e para
   * cada grupo compara com as vagas ainda livres na janela — sinaliza défice antes de qualquer
   * pedido cair em SEM_VAGA, para a admin poder agir com antecedência (vaga extra/outsourcing).
   */
  router.get("/overbooking", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const hoje = apenasData(agora());
    const pendentes = store.pedidos.filter(
      (p) => p.especialidade_destino === especialidade && (p.estado === "ACEITE" || p.estado === "EM_TRIAGEM"),
    );

    const grupos = new Map<string, Pedido[]>();
    for (const p of pendentes) {
      const chave = `${p.prioridade}::${p.prazo_limite}::${p.ato_codigo}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push(p);
    }

    const sinais = [...grupos.values()]
      .map((pedidos) => {
        const referencia = pedidos[0];
        const { inicio, fim } = janelaAgendamento(referencia, hoje);
        const vagasLivres = contarVagasLivres(especialidade!, referencia.ato_codigo, inicio, fim);
        const deficit = pedidos.length - vagasLivres;
        if (deficit <= 0) return null;
        return {
          prioridade_legivel: descreverPrioridade(referencia.prioridade),
          ato_legivel: descreverAto(especialidade!, referencia.ato_codigo),
          prazo_limite: referencia.prazo_limite,
          n_pedidos: pedidos.length,
          vagas_livres_estimadas: vagasLivres,
          deficit,
          pedidos: pedidos.map((p) => ({ pedido_id: p.pedido_id, doente_nome: descreverDoente(p.doente_id) })),
        };
      })
      .filter((s): s is NonNullable<typeof s> => !!s)
      .sort((a, b) => a.prazo_limite.localeCompare(b.prazo_limite));

    res.json(sinais);
  });

  function avariaResumo(a: Avaria) {
    return {
      avaria_id: a.avaria_id,
      especialidade_codigo: a.especialidade_codigo,
      ato_codigo: a.ato_codigo,
      ato_legivel: a.ato_codigo ? descreverAto(a.especialidade_codigo, a.ato_codigo) : "Todo o serviço",
      descricao: a.descricao,
      duracao_dias: a.duracao_dias,
      reportado_por_nome: descreverUtilizador(a.reportado_por),
      criado_em: a.criado_em,
      estado: a.estado,
      decisao: a.decisao,
      pedidos_afetados: a.pedidos_afetados,
    };
  }

  router.get("/avarias", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const avarias = store.avarias
      .filter((a) => a.especialidade_codigo === especialidade)
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .map(avariaResumo);
    res.json(avarias);
  });

  router.post("/avarias/:id/resolver", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const avaria = store.avarias.find((a) => a.avaria_id === req.params.id && a.especialidade_codigo === especialidade);
    if (!avaria || avaria.estado !== "ABERTA") {
      res.status(404).json({ erro: "Avaria não encontrada ou já resolvida." });
      return;
    }
    const decisao = req.body?.decisao as "REMARCACAO_TOTAL" | "REMARCACAO_PARCIAL";
    if (decisao !== "REMARCACAO_TOTAL" && decisao !== "REMARCACAO_PARCIAL") {
      res.status(400).json({ erro: "Escolha remarcação total ou parcial." });
      return;
    }
    const resolvida = resolverAvaria(avaria.avaria_id, decisao, req.utilizadorId, agora());
    res.json({ ok: true, avaria: resolvida ? avariaResumo(resolvida) : null });
  });

  // Pesos da equação de prioridade deste serviço: personalizados, ou os por omissão do sistema.
  router.get("/prioridade", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    if (!especialidade) {
      res.status(400).json({ erro: "O perfil seleccionado não tem especialidade associada." });
      return;
    }
    const pesos = pesosPrioridadeDoServico(store, especialidade);
    res.json({
      especialidade,
      especialidade_legivel: descreverEspecialidade(especialidade),
      personalizado: !!store.pesosPrioridadePorServico[especialidade],
      pesos,
      pesosOmissao: PESOS_PRIORIDADE_OMISSAO,
    });
  });

  // Ajusta os pesos deste serviço (têm de somar 1; normalizamos para tolerar pequenos arredondamentos).
  router.post("/prioridade/pesos", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    if (!especialidade) {
      res.status(400).json({ erro: "O perfil seleccionado não tem especialidade associada." });
      return;
    }
    const urgencia = Number(req.body?.urgencia);
    const tipo = Number(req.body?.tipo);
    const paciente = Number(req.body?.paciente);
    if (![urgencia, tipo, paciente].every((n) => Number.isFinite(n) && n >= 0)) {
      res.status(400).json({ erro: "Os três pesos têm de ser números não negativos." });
      return;
    }
    const soma = urgencia + tipo + paciente;
    if (soma <= 0) {
      res.status(400).json({ erro: "Os pesos não podem ser todos zero." });
      return;
    }
    store.pesosPrioridadePorServico[especialidade] = {
      urgencia: urgencia / soma,
      tipo: tipo / soma,
      paciente: paciente / soma,
    };
    res.json({ ok: true, pesos: store.pesosPrioridadePorServico[especialidade] });
  });

  router.post("/prioridade/repor", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    if (!especialidade) {
      res.status(400).json({ erro: "O perfil seleccionado não tem especialidade associada." });
      return;
    }
    delete store.pesosPrioridadePorServico[especialidade];
    res.json({ ok: true, pesos: PESOS_PRIORIDADE_OMISSAO });
  });

  // Estatísticas do serviço: tempo até agendamento (mediana + outliers), filtrável por estádio
  // do percurso oncológico do doente e por período (última semana/mês/todos).
  router.get("/estatisticas", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    if (!especialidade) {
      res.status(400).json({ erro: "O perfil seleccionado não tem especialidade associada." });
      return;
    }
    const hoje = apenasData(agora());
    const periodo = String(req.query.periodo ?? "mes"); // "semana" | "mes" | "todos"
    const desde = periodo === "semana" ? somarDias(hoje, -7) : periodo === "mes" ? somarDias(hoje, -30) : null;
    const estadiosFiltro = String(req.query.estadio ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    let pedidos = store.pedidos.filter((p) => p.especialidade_destino === especialidade);
    if (desde) pedidos = pedidos.filter((p) => apenasData(parseIso(p.criado_em)).getTime() >= desde.getTime());
    if (estadiosFiltro.length > 0) {
      pedidos = pedidos.filter((p) => {
        const doente = store.doentes.find((d) => d.doente_id === p.doente_id);
        return doente && estadiosFiltro.includes(doente.estadio_cuidado || "");
      });
    }

    interface Amostra {
      pedido: Pedido;
      dias: number;
      dentroPrazo: boolean;
      estadioCuidado: string;
    }
    // Tempo de espera real = da criação do pedido até à data da consulta/exame marcado (não até
    // ao instante em que o sistema processou a marcação, que é quase sempre no mesmo dia).
    const amostras: Amostra[] = [];
    for (const p of pedidos) {
      if (!p.ato_id) continue;
      const ato = store.atosMedicos.find((a) => a.mvp_ato_id === p.ato_id);
      if (!ato) continue;
      const doente = store.doentes.find((d) => d.doente_id === p.doente_id);
      amostras.push({
        pedido: p,
        dias: diferencaDias(parseIso(ato.data_hora), parseIso(p.criado_em)),
        dentroPrazo: parseIso(ato.data_hora).getTime() <= parseIso(p.prazo_limite).getTime(),
        estadioCuidado: doente?.estadio_cuidado || "",
      });
    }

    function resumoDe(lista: Amostra[]) {
      const dias = lista.map((a) => a.dias);
      return {
        total: lista.length,
        medianaDias: mediana(dias),
        percentDentroPrazo: lista.length > 0 ? Math.round((lista.filter((a) => a.dentroPrazo).length / lista.length) * 100) : null,
      };
    }

    const porEstadio = ["NOVO", "PRE_TRATAMENTO", "EM_TRATAMENTO", "FOLLOW_UP"].map((chave) => ({
      chave,
      legivel: descreverEstadioCuidado(chave),
      ...resumoDe(amostras.filter((a) => a.estadioCuidado === chave)),
    }));

    // Outliers: os casos mais demorados a agendar (mediana + desvio grande é menos legível numa
    // demo do que simplesmente mostrar os piores casos concretos, com nome e justificação).
    const outliers = [...amostras]
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 5)
      .map((a) => ({
        pedido_id: a.pedido.pedido_id,
        doente_nome: descreverDoente(a.pedido.doente_id),
        descricao: descreverPedido(a.pedido),
        dias: a.dias,
        dentro_prazo: a.dentroPrazo,
        estadio_cuidado_legivel: descreverEstadioCuidado(a.estadioCuidado),
      }));

    res.json({
      especialidade,
      especialidade_legivel: descreverEspecialidade(especialidade),
      periodo,
      geral: resumoDe(amostras),
      porEstadio,
      outliers,
    });
  });

  return router;
}
