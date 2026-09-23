import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { apenasData, isoData } from "../util.ts";
import { aceitarTriagem, pedirInformacao, recusarTriagem, reencaminharTriagem } from "../motor/fluxo.ts";
import { dependenciasDe, dependenciasProntas } from "../motor/dependencias.ts";
import { janelaAgendamento } from "../motor/agendamento.ts";
import { ordenarFila, type ItemFila } from "../motor/prioridade.ts";
import {
  descreverDoente,
  descreverEspecialidade,
  descreverPedido,
  descreverPrioridade,
  descreverTipoPedido,
  descreverUtilizador,
} from "../apresentacao.ts";
import type { Pedido, Prioridade } from "../types.ts";

export function criarRotasTriagem(store: typeof StoreType) {
  const router = Router();

  function especialidadeDoUtilizador(utilizadorId: string): string | null {
    return store.utilizadores.find((u) => u.utilizador_id === utilizadorId)?.especialidade_codigo || null;
  }

  // Fila EM_TRIAGEM do serviço do triador, pela ordem da fila (secção 8).
  // Só o pedido + o plano de origem + as dependências — não os outros pedidos do doente,
  // nem o perfil clínico completo (secção 3).
  router.get("/fila", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    if (!especialidade) {
      res.status(400).json({ erro: "O perfil seleccionado não tem especialidade associada." });
      return;
    }
    const pedidos = store.pedidos.filter((p) => p.estado === "EM_TRIAGEM" && p.especialidade_destino === especialidade);
    const hoje = apenasData(agora());
    const itens: ItemFila[] = pedidos.map((pedido) => ({ pedido, dataMinima: janelaAgendamento(pedido, hoje).inicio }));

    const fila = ordenarFila(itens).map(({ pedido }) => {
      const nota = store.notasConsulta.find((n) => n.ato_id === pedido.consulta_origem_ato_id);
      const deps = dependenciasDe(pedido).map((d) => {
        const requisito = store.pedidos.find((p) => p.pedido_id === d.depende_de_pedido_id);
        return requisito ? { descricao: descreverPedido(requisito), estado: requisito.estado } : null;
      });
      return {
        pedido_id: pedido.pedido_id,
        doente_id: pedido.doente_id,
        doente_nome: descreverDoente(pedido.doente_id),
        medico_requisitante_nome: descreverUtilizador(pedido.medico_requisitante_id),
        especialidade_origem_legivel: descreverEspecialidade(pedido.especialidade_origem),
        tipo_pedido_legivel: descreverTipoPedido(pedido.tipo_pedido),
        descricao: descreverPedido(pedido),
        prioridade: pedido.prioridade,
        prioridade_legivel: descreverPrioridade(pedido.prioridade),
        prazo_limite: pedido.prazo_limite,
        texto_plano: nota?.p || pedido.texto_origem,
        dependencias: deps.filter((d): d is NonNullable<typeof d> => !!d),
        pronto_a_agendar: dependenciasProntas(pedido),
        criado_em: pedido.criado_em,
        recebido_hoje: pedido.criado_em.slice(0, 10) === isoData(hoje),
      };
    });
    // O que chegou hoje aparece primeiro (precisa de um primeiro olhar); dentro de cada grupo mantém-se
    // a ordem de prioridade da fila.
    fila.sort((x, y) => Number(y.recebido_hoje) - Number(x.recebido_hoje));
    res.json({ especialidade, especialidade_legivel: descreverEspecialidade(especialidade), fila });
  });

  router.get("/especialidades", (_req, res) => {
    res.json(store.especialidades);
  });

  router.post("/:id/aceitar", (req, res) => {
    const pedido = obterPedidoEmTriagem(store, req.params.id, res);
    if (!pedido) return;
    const novaPrioridade = req.body?.novaPrioridade as Prioridade | undefined;
    aceitarTriagem(pedido, req.utilizadorId, { novaPrioridade, quando: agora() });
    res.json({ ok: true, pedido: resumoPedido(pedido) });
  });

  router.post("/:id/recusar", (req, res) => {
    const pedido = obterPedidoEmTriagem(store, req.params.id, res);
    if (!pedido) return;
    const motivo: string = req.body?.motivo ?? "";
    if (!motivo.trim()) {
      res.status(400).json({ erro: "O motivo é obrigatório para recusar." });
      return;
    }
    recusarTriagem(pedido, req.utilizadorId, motivo, agora());
    res.json({ ok: true, pedido: resumoPedido(pedido) });
  });

  router.post("/:id/reencaminhar", (req, res) => {
    const pedido = obterPedidoEmTriagem(store, req.params.id, res);
    if (!pedido) return;
    const novaEspecialidade: string = req.body?.especialidade ?? "";
    if (!novaEspecialidade) {
      res.status(400).json({ erro: "Escolha o serviço de destino." });
      return;
    }
    reencaminharTriagem(pedido, novaEspecialidade, req.utilizadorId, req.body?.motivo ?? "", agora());
    res.json({ ok: true, pedido: resumoPedido(pedido) });
  });

  router.post("/:id/pedir-informacao", (req, res) => {
    const pedido = obterPedidoEmTriagem(store, req.params.id, res);
    if (!pedido) return;
    const pergunta: string = req.body?.pergunta ?? "";
    if (!pergunta.trim()) {
      res.status(400).json({ erro: "A pergunta é obrigatória." });
      return;
    }
    pedirInformacao(pedido, req.utilizadorId, pergunta, agora());
    res.json({ ok: true, pedido: resumoPedido(pedido) });
  });

  function resumoPedido(p: Pedido) {
    return { pedido_id: p.pedido_id, estado: p.estado, especialidade_destino: p.especialidade_destino };
  }

  return router;
}

function obterPedidoEmTriagem(store: typeof StoreType, id: string, res: import("express").Response): Pedido | null {
  const pedido = store.pedidos.find((p) => p.pedido_id === id);
  if (!pedido || pedido.estado !== "EM_TRIAGEM") {
    res.status(404).json({ erro: "Pedido não encontrado ou já não está em triagem." });
    return null;
  }
  return pedido;
}
