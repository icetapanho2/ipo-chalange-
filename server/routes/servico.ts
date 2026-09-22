import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { apenasData } from "../util.ts";
import { aprovarPropostaTroca, rejeitarPropostaTroca, contarVagasLivres, janelaAgendamento } from "../motor/agendamento.ts";
import { resolverAlerta } from "../motor/alertas.ts";
import { calcularSemaforo } from "../motor/semaforo.ts";
import { resolverAvaria } from "../motor/avarias.ts";
import { remarcarPedido, adiarConsulta } from "../motor/fluxo.ts";
import {
  descreverDoente,
  descreverEspecialidade,
  descreverEstado,
  descreverPedido,
  descreverPrioridade,
  descreverTipoPedido,
  descreverUtilizador,
  descreverAto,
} from "../apresentacao.ts";
import type { Avaria, Pedido } from "../types.ts";

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
        pedido_urgente_doente: descreverDoente(store.pedidos.find((x) => x.pedido_id === p.pedido_urgente)?.doente_id ?? ""),
      }));
    res.json(propostas);
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

  return router;
}
