import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { apenasData, parseIso } from "../util.ts";
import { responderDevolucao } from "../motor/fluxo.ts";
import { descreverDoente, descreverEspecialidade, descreverEstado, descreverPedido, descreverTipoPedido } from "../apresentacao.ts";
import type { Pedido } from "../types.ts";

const ESTADOS_PENDENTES: Pedido["estado"][] = ["EXTRAIDO", "VALIDADO", "EM_TRIAGEM", "ACEITE", "SEM_VAGA"];
const ESTADOS_ATENCAO: Pedido["estado"][] = ["DEVOLVIDO", "RECUSADO", "SEM_VAGA", "FALTOU"];

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

  // Painel do médico por doente (secção N2): um cartão por doente, com a próxima marcação,
  // quantos pedidos fez/quantos já têm desfecho, e uma luz resumo do que falta.
  router.get("/painel", (req, res) => {
    const meus = store.pedidos.filter((p) => p.medico_requisitante_id === req.utilizadorId);
    const hoje = apenasData(agora());

    const porDoente = new Map<string, Pedido[]>();
    for (const p of meus) {
      if (!porDoente.has(p.doente_id)) porDoente.set(p.doente_id, []);
      porDoente.get(p.doente_id)!.push(p);
    }

    const cartoes = [...porDoente.entries()].map(([doenteId, pedidos]) => {
      const marcacoesFuturas = pedidos
        .filter((p) => p.estado === "MARCADO" && p.ato_id)
        .map((p) => store.atosMedicos.find((a) => a.mvp_ato_id === p.ato_id))
        .filter((a): a is NonNullable<typeof a> => !!a && apenasData(parseIso(a.data_hora)).getTime() >= hoje.getTime())
        .sort((a, b) => a.data_hora.localeCompare(b.data_hora));

      const pendentes = pedidos.filter((p) => ESTADOS_PENDENTES.includes(p.estado)).length;
      const comAtencao = pedidos.some((p) => ESTADOS_ATENCAO.includes(p.estado));
      const luz: "verde" | "amarelo" | "vermelho" | "cinza" =
        pedidos.length === 0 ? "cinza" : comAtencao ? "vermelho" : pendentes > 0 ? "amarelo" : "verde";

      return {
        doente_id: doenteId,
        doente_nome: descreverDoente(doenteId),
        proxima_marcacao: marcacoesFuturas[0]?.data_hora ?? "",
        total_pedidos: pedidos.length,
        total_respondidos: pedidos.length - pendentes,
        luz,
      };
    });

    cartoes.sort((a, b) => {
      const ordemLuz: Record<string, number> = { vermelho: 0, amarelo: 1, verde: 2, cinza: 3 };
      if (ordemLuz[a.luz] !== ordemLuz[b.luz]) return ordemLuz[a.luz] - ordemLuz[b.luz];
      if (a.proxima_marcacao && b.proxima_marcacao) return a.proxima_marcacao.localeCompare(b.proxima_marcacao);
      return a.doente_nome.localeCompare(b.doente_nome);
    });

    res.json(cartoes);
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
