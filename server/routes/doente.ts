import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { apenasData, parseIso } from "../util.ts";
import { adiarConsulta, remarcarPedido } from "../motor/fluxo.ts";
import { avaliarDependenciasDetalhado, calcularSemaforo } from "../motor/semaforo.ts";
import {
  descreverEspecialidade,
  descreverEstado,
  descreverPedido,
  descreverUtilizador,
} from "../apresentacao.ts";
import type { Pedido } from "../types.ts";

export function criarRotasDoente(store: typeof StoreType) {
  const router = Router();

  router.get("/:id", (req, res) => {
    const doente = store.doentes.find((d) => d.doente_id === req.params.id);
    if (!doente) {
      res.status(404).json({ erro: "Doente não encontrado." });
      return;
    }
    const pedidos = store.pedidos.filter((p) => p.doente_id === doente.doente_id);
    const pedidoIds = new Set(pedidos.map((p) => p.pedido_id));

    const timeline = store.eventos
      .filter((e) => pedidoIds.has(e.pedido_id))
      .map((e) => {
        const pedido = store.pedidos.find((p) => p.pedido_id === e.pedido_id)!;
        return {
          evento_id: e.evento_id,
          pedido_id: e.pedido_id,
          data_hora: e.data_hora,
          tipo: e.tipo,
          pedido_descricao: descreverPedido(pedido),
          especialidade_legivel: descreverEspecialidade(pedido.especialidade_destino),
          quem: descreverUtilizador(e.utilizador_id) || e.utilizador_id,
          motivo: e.motivo,
          detalhe: e.detalhe,
          estado_novo_legivel: e.estado_novo ? descreverEstado(e.estado_novo as Pedido["estado"]) : "",
        };
      })
      .sort((a, b) => b.data_hora.localeCompare(a.data_hora));

    const hoje = apenasData(agora());
    const marcacoesFuturas = pedidos
      .filter((p) => p.estado === "MARCADO")
      .map((pedido) => {
        const semaforo = calcularSemaforo(pedido, hoje, store.parametros.semaforo_horizonte_dias);
        if (!semaforo) return null;
        const ato = store.atosMedicos.find((a) => a.mvp_ato_id === pedido.ato_id)!;
        const dataConsulta = apenasData(parseIso(ato.data_hora));
        const dependencias = avaliarDependenciasDetalhado(pedido, dataConsulta).map(({ requisito, estado }) => ({
          pedido_id: requisito.pedido_id,
          descricao: descreverPedido(requisito),
          estado: requisito.estado,
          estado_legivel: descreverEstado(requisito.estado),
          cor: estado.cor,
          porque: estado.porque,
          pode_remarcar: requisito.estado === "FALTOU",
        }));
        return {
          pedido_id: pedido.pedido_id,
          descricao: descreverPedido(pedido),
          especialidade_legivel: descreverEspecialidade(pedido.especialidade_destino),
          data_hora: ato.data_hora,
          semaforo,
          dependencias,
        };
      })
      .filter((m): m is NonNullable<typeof m> => !!m)
      .sort((a, b) => a.data_hora.localeCompare(b.data_hora));

    res.json({ doente, timeline, marcacoesFuturas });
  });

  router.post("/:id/pedidos/:pedidoId/remarcar-exame", (req, res) => {
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.pedidoId && p.doente_id === req.params.id);
    if (!pedido) {
      res.status(404).json({ erro: "Pedido não encontrado." });
      return;
    }
    remarcarPedido(pedido, req.utilizadorId, agora());
    res.json({ ok: true, estado: pedido.estado });
  });

  router.post("/:id/pedidos/:pedidoId/adiar-consulta", (req, res) => {
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.pedidoId && p.doente_id === req.params.id);
    if (!pedido || pedido.estado !== "MARCADO") {
      res.status(404).json({ erro: "Pedido não encontrado ou não está marcado." });
      return;
    }
    adiarConsulta(pedido, req.utilizadorId, agora());
    res.json({ ok: true, estado: pedido.estado });
  });

  return router;
}
