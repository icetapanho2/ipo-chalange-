import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { silenciarTipo, dessilenciarTipo } from "../motor/notificacoes.ts";
import type { TipoNotificacao } from "../types.ts";

export function criarRotasNotificacoes(store: typeof StoreType) {
  const router = Router();

  // Lista as notificações do utilizador activo (mais recentes primeiro) e os tipos que silenciou.
  router.get("/", (req, res) => {
    const minhas = store.notificacoes
      .filter((n) => n.destinatario_utilizador_id === req.utilizadorId)
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    const tiposSilenciados = store.silenciamentos.filter((s) => s.utilizador_id === req.utilizadorId).map((s) => s.tipo);
    res.json({
      notificacoes: minhas,
      naoLidas: minhas.filter((n) => !n.lida).length,
      tiposSilenciados,
    });
  });

  router.post("/:id/marcar-lida", (req, res) => {
    const notificacao = store.notificacoes.find(
      (n) => n.notificacao_id === req.params.id && n.destinatario_utilizador_id === req.utilizadorId,
    );
    if (!notificacao) {
      res.status(404).json({ erro: "Notificação não encontrada." });
      return;
    }
    notificacao.lida = true;
    res.json({ ok: true });
  });

  router.post("/marcar-todas-lidas", (req, res) => {
    for (const n of store.notificacoes) {
      if (n.destinatario_utilizador_id === req.utilizadorId) n.lida = true;
    }
    res.json({ ok: true });
  });

  router.post("/silenciar", (req, res) => {
    const tipo = req.body?.tipo as TipoNotificacao;
    if (!tipo) {
      res.status(400).json({ erro: "Falta o tipo de notificação a silenciar." });
      return;
    }
    silenciarTipo(req.utilizadorId, tipo);
    res.json({ ok: true });
  });

  router.post("/dessilenciar", (req, res) => {
    const tipo = req.body?.tipo as TipoNotificacao;
    if (!tipo) {
      res.status(400).json({ erro: "Falta o tipo de notificação a dessilenciar." });
      return;
    }
    dessilenciarTipo(req.utilizadorId, tipo);
    res.json({ ok: true });
  });

  return router;
}
