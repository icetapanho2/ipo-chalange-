import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { apenasData, parseIso, somarDias } from "../util.ts";
import { decidirSemVaga, responderDevolucao } from "../motor/fluxo.ts";
import {
  descreverDoente,
  descreverEspecialidade,
  descreverEstadioCuidado,
  descreverEstado,
  descreverPedido,
  descreverTipoPedido,
} from "../apresentacao.ts";
import type { Pedido } from "../types.ts";

/** Cor do semáforo de um pedido individual (pedido "N2 — Os Meus Pedidos" em cards): vermelho =
 * ainda não agendado, laranja = agendado mas por realizar, verde = já realizado. */
function corPedido(estado: Pedido["estado"]): "vermelho" | "laranja" | "verde" {
  if (estado === "REALIZADO") return "verde";
  if (estado === "MARCADO") return "laranja";
  return "vermelho";
}

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
      // Sem vaga interna nem externa: a administração pede ao médico para decidir manter/cancelar.
      semVagaDecisao: meus.filter((p) => p.estado === "SEM_VAGA" && p.decisao_pendente).map(resumo),
      todos: meus.map(resumo).sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
    });
  });

  router.post("/:id/decidir-sem-vaga", (req, res) => {
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.id && p.medico_requisitante_id === req.utilizadorId);
    if (!pedido || pedido.estado !== "SEM_VAGA" || !pedido.decisao_pendente) {
      res.status(404).json({ erro: "Pedido não encontrado ou não aguarda decisão." });
      return;
    }
    const decisao = req.body?.decisao as "MANTER" | "CANCELAR";
    if (decisao !== "MANTER" && decisao !== "CANCELAR") {
      res.status(400).json({ erro: "Decisão inválida." });
      return;
    }
    decidirSemVaga(pedido, req.utilizadorId, decisao, agora());
    res.json({ ok: true, pedido: resumo(pedido) });
  });

  // Painel do médico por doente (secção N2): um cartão por doente, agrupando todos os pedidos
  // que fez para ele. Cada pedido tem uma cor própria (vermelho=por agendar, laranja=agendado,
  // verde=realizado); o cartão herda a cor mais "vermelha" dos seus pedidos. Filtrável por
  // estádio do percurso oncológico, janela da próxima marcação e cor do cartão.
  router.get("/painel", (req, res) => {
    const meus = store.pedidos.filter((p) => p.medico_requisitante_id === req.utilizadorId);
    const hoje = apenasData(agora());

    const estadiosFiltro = String(req.query.estadio ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const coresFiltro = String(req.query.cor ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const janela = String(req.query.janela ?? "todos"); // "semana" | "mes" | "todos"
    const limiteJanela = janela === "semana" ? somarDias(hoje, 7) : janela === "mes" ? somarDias(hoje, 30) : null;

    const porDoente = new Map<string, Pedido[]>();
    for (const p of meus) {
      if (!porDoente.has(p.doente_id)) porDoente.set(p.doente_id, []);
      porDoente.get(p.doente_id)!.push(p);
    }

    let cartoes = [...porDoente.entries()].map(([doenteId, pedidos]) => {
      const doente = store.doentes.find((d) => d.doente_id === doenteId);
      const marcacoesFuturas = pedidos
        .filter((p) => p.estado === "MARCADO" && p.ato_id)
        .map((p) => store.atosMedicos.find((a) => a.mvp_ato_id === p.ato_id))
        .filter((a): a is NonNullable<typeof a> => !!a && apenasData(parseIso(a.data_hora)).getTime() >= hoje.getTime())
        .sort((a, b) => a.data_hora.localeCompare(b.data_hora));

      const pedidosCard = [...pedidos]
        .sort((a, b) => a.prazo_limite.localeCompare(b.prazo_limite))
        .map((p) => ({
          pedido_id: p.pedido_id,
          descricao: descreverPedido(p),
          tipo_pedido_legivel: descreverTipoPedido(p.tipo_pedido),
          especialidade_destino_legivel: descreverEspecialidade(p.especialidade_destino),
          estado: p.estado,
          estado_legivel: descreverEstado(p.estado),
          prazo_limite: p.prazo_limite,
          cor: corPedido(p.estado),
        }));

      const pendentes = pedidosCard.filter((p) => p.cor === "vermelho").length;
      const agendados = pedidosCard.filter((p) => p.cor === "laranja").length;
      const realizados = pedidosCard.filter((p) => p.cor === "verde").length;
      const corCard: "vermelho" | "laranja" | "verde" | "cinza" =
        pedidosCard.length === 0 ? "cinza" : pendentes > 0 ? "vermelho" : agendados > 0 ? "laranja" : "verde";

      return {
        doente_id: doenteId,
        doente_nome: descreverDoente(doenteId),
        estadio_cuidado: doente?.estadio_cuidado || "",
        estadio_cuidado_legivel: descreverEstadioCuidado(doente?.estadio_cuidado),
        proxima_marcacao: marcacoesFuturas[0]?.data_hora ?? "",
        cor: corCard,
        contagens: { pendentes, agendados, realizados, total: pedidosCard.length },
        pedidos: pedidosCard,
      };
    });

    if (estadiosFiltro.length > 0) cartoes = cartoes.filter((c) => estadiosFiltro.includes(c.estadio_cuidado));
    if (coresFiltro.length > 0) cartoes = cartoes.filter((c) => coresFiltro.includes(c.cor));
    if (limiteJanela) {
      cartoes = cartoes.filter((c) => {
        if (!c.proxima_marcacao) return false;
        const data = apenasData(parseIso(c.proxima_marcacao));
        return data.getTime() >= hoje.getTime() && data.getTime() <= limiteJanela.getTime();
      });
    }

    cartoes.sort((a, b) => {
      const ordemCor: Record<string, number> = { vermelho: 0, laranja: 1, verde: 2, cinza: 3 };
      if (ordemCor[a.cor] !== ordemCor[b.cor]) return ordemCor[a.cor] - ordemCor[b.cor];
      if (a.proxima_marcacao && b.proxima_marcacao) return a.proxima_marcacao.localeCompare(b.proxima_marcacao);
      if (a.proxima_marcacao) return -1;
      if (b.proxima_marcacao) return 1;
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
