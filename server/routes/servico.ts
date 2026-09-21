import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { aprovarPropostaTroca, rejeitarPropostaTroca } from "../motor/agendamento.ts";
import { resolverAlerta } from "../motor/alertas.ts";
import {
  descreverDoente,
  descreverEspecialidade,
  descreverEstado,
  descreverPedido,
  descreverPrioridade,
  descreverTipoPedido,
  descreverUtilizador,
} from "../apresentacao.ts";
import type { Pedido } from "../types.ts";

export function criarRotasServico(store: typeof StoreType) {
  const router = Router();

  function especialidadeDoUtilizador(utilizadorId: string): string | null {
    return store.utilizadores.find((u) => u.utilizador_id === utilizadorId)?.especialidade_codigo || null;
  }

  function pedidoResumo(p: Pedido) {
    return {
      pedido_id: p.pedido_id,
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

  return router;
}
