import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { responderDevolucao } from "../motor/fluxo.ts";
import { descreverEspecialidade, descreverEstado, descreverPedido, descreverTipoPedido } from "../apresentacao.ts";
import type { Pedido } from "../types.ts";

export function criarRotasMeusPedidos(store: typeof StoreType) {
  const router = Router();

  function resumo(p: Pedido) {
    return {
      pedido_id: p.pedido_id,
      doente_nome: store.doentes.find((d) => d.doente_id === p.doente_id)?.nome ?? p.doente_id,
      tipo_pedido_legivel: descreverTipoPedido(p.tipo_pedido),
      especialidade_destino_legivel: descreverEspecialidade(p.especialidade_destino),
      descricao: descreverPedido(p),
      estado: p.estado,
      estado_legivel: descreverEstado(p.estado),
      criado_em: p.criado_em,
      pergunta_triagem: p.pergunta_triagem ?? "",
      motivo_recusa: p.motivo_recusa ?? "",
    };
  }

  router.get("/", (req, res) => {
    const meus = store.pedidos.filter((p) => p.medico_requisitante_id === req.utilizadorId);
    res.json({
      devolvidos: meus.filter((p) => p.estado === "DEVOLVIDO").map(resumo),
      recusados: meus.filter((p) => p.estado === "RECUSADO").map(resumo),
      todos: meus.map(resumo).sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
    });
  });

  router.post("/:id/responder", (req, res) => {
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.id && p.medico_requisitante_id === req.utilizadorId);
    if (!pedido || pedido.estado !== "DEVOLVIDO") {
      res.status(404).json({ erro: "Pedido não encontrado ou já não está devolvido." });
      return;
    }
    const resposta: string = req.body?.resposta ?? "";
    if (!resposta.trim()) {
      res.status(400).json({ erro: "A resposta é obrigatória." });
      return;
    }
    responderDevolucao(pedido, req.utilizadorId, resposta, agora());
    res.json({ ok: true, pedido: resumo(pedido) });
  });

  return router;
}
