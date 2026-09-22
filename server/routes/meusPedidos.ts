import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { apenasData, isoData } from "../util.ts";
import { calcularSemaforo } from "../motor/semaforo.ts";
import { decidirSemVaga, responderDevolucao } from "../motor/fluxo.ts";
import { dataMinimaParaAdiar, decidirRemarcacaoMedico } from "../motor/propostasRemarcacao.ts";
import {
  descreverDoente,
  descreverEspecialidade,
  descreverEstadioCuidado,
  descreverEstado,
  descreverPedido,
  descreverTipoPedido,
} from "../apresentacao.ts";
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

  // Exame sem vaga a tempo da consulta (avaria/falta), sem vaga extra nem outsourcing: o médico decide.
  router.get("/decisoes-remarcacao", (req, res) => {
    const pendentes = store.propostasRemarcacao
      .filter((p) => p.estado === "AGUARDA_MEDICO" && p.consulta_dependente?.medico_id === req.utilizadorId)
      .map((p) => {
        const exame = store.pedidos.find((x) => x.pedido_id === p.pedido_id);
        return {
          proposta_id: p.proposta_id,
          origem: p.origem,
          doente_id: p.doente_id,
          doente_nome: descreverDoente(p.doente_id),
          exame: exame ? descreverPedido(exame) : "",
          consulta: p.consulta_dependente,
          alternativa_data_hora: p.alternativa_data_hora ?? "",
          data_minima_adiar: dataMinimaParaAdiar(p),
          justificacao: p.justificacao,
        };
      });
    res.json(pendentes);
  });

  router.post("/decisoes-remarcacao/:id", (req, res) => {
    const decisao = req.body?.decisao;
    if (decisao !== "AVANCAR" && decisao !== "ADIAR") {
      res.status(400).json({ erro: "Decisão inválida." });
      return;
    }
    const novaData: string | null = req.body?.novaData || null;
    if (novaData && !/^\d{4}-\d{2}-\d{2}$/.test(novaData)) {
      res.status(400).json({ erro: "Data inválida (aaaa-mm-dd)." });
      return;
    }
    const r = decidirRemarcacaoMedico(req.params.id, decisao, req.utilizadorId, novaData, agora());
    if (!r) {
      res.status(404).json({ erro: "Decisão já tomada, ou sem vaga para a consulta a partir dessa data." });
      return;
    }
    res.json({ ok: true, consulta: r.consulta, exame: r.exame });
  });

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

  // Acompanhamento do médico: um item por doente com o percurso dos pedidos que fez para ele (datas,
  // prazos, dependências) e uma situação única — "precisa de atenção" diz porquê. O filtro e a
  // pesquisa são feitos no ecrã, para ser imediato.
  router.get("/painel", (req, res) => {
    const meus = store.pedidos.filter((p) => p.medico_requisitante_id === req.utilizadorId);
    const hoje = apenasData(agora());
    const horizonte = store.parametros.semaforo_horizonte_dias;

    const porDoente = new Map<string, Pedido[]>();
    for (const p of meus) porDoente.set(p.doente_id, [...(porDoente.get(p.doente_id) ?? []), p]);

    const doentes = [...porDoente.entries()].map(([doenteId, pedidos]) => {
      const doente = store.doentes.find((d) => d.doente_id === doenteId);
      const percurso = pedidos
        .map((p) => {
          const ato = p.ato_id ? store.atosMedicos.find((a) => a.mvp_ato_id === p.ato_id) : undefined;
          const dataMarcada = ato && (p.estado === "MARCADO" || p.estado === "REALIZADO" || p.estado === "FALTOU") ? ato.data_hora : "";
          const foraDoPrazo = !!dataMarcada && p.estado === "MARCADO" && dataMarcada.slice(0, 10) > p.prazo_limite;
          const semaforo = calcularSemaforo(p, hoje, horizonte);
          const problema =
            p.estado === "SEM_VAGA"
              ? "Sem vaga no prazo"
              : p.estado === "FALTOU"
                ? "O doente faltou"
                : p.estado === "DEVOLVIDO"
                  ? "Devolvido pela triagem"
                  : semaforo?.cor === "vermelho"
                    ? semaforo.porque
                    : foraDoPrazo
                      ? "Marcado depois do prazo"
                      : "";
          return {
            pedido_id: p.pedido_id,
            descricao: descreverPedido(p),
            tipo_pedido_legivel: descreverTipoPedido(p.tipo_pedido),
            especialidade_destino_legivel: descreverEspecialidade(p.especialidade_destino),
            estado: p.estado,
            estado_legivel: descreverEstado(p.estado),
            prioridade: p.prioridade,
            prazo_limite: p.prazo_limite,
            criado_em: p.criado_em,
            data_marcada: dataMarcada,
            depende_de: store.dependencias.filter((d) => d.pedido_id === p.pedido_id).map((d) => d.depende_de_pedido_id),
            semaforo: semaforo ? { cor: semaforo.cor, porque: semaforo.porque } : null,
            problema,
          };
        })
        .sort((a, b) => (a.data_marcada || a.prazo_limite).localeCompare(b.data_marcada || b.prazo_limite));

      const problemas = percurso.filter((p) => p.problema);
      const ativos = percurso.filter((p) => !["REALIZADO", "RECUSADO", "CANCELADO"].includes(p.estado));
      const situacao = problemas.length > 0 ? "atencao" : ativos.some((p) => p.estado !== "MARCADO") ? "por_marcar" : ativos.length > 0 ? "marcado" : "concluido";
      const proxima = percurso.filter((p) => p.data_marcada && p.estado === "MARCADO" && p.data_marcada.slice(0, 10) >= isoData(hoje))[0];
      return {
        doente_id: doenteId,
        doente_nome: descreverDoente(doenteId),
        estadio_cuidado: doente?.estadio_cuidado || "",
        estadio_cuidado_legivel: descreverEstadioCuidado(doente?.estadio_cuidado),
        situacao,
        problemas: problemas.map((p) => `${p.problema} — ${p.descricao}`),
        proxima: proxima ? { data_hora: proxima.data_marcada, descricao: proxima.descricao } : null,
        percurso,
      };
    });

    const ordem: Record<string, number> = { atencao: 0, por_marcar: 1, marcado: 2, concluido: 3 };
    doentes.sort(
      (a, b) =>
        ordem[a.situacao] - ordem[b.situacao] ||
        (a.proxima?.data_hora ?? "9").localeCompare(b.proxima?.data_hora ?? "9") ||
        a.doente_nome.localeCompare(b.doente_nome),
    );
    res.json(doentes);
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
