import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { isoData, isoDataHora, somarDias } from "../util.ts";
import { registarEvento } from "../motor/estados.ts";
import { aprovarPedidos } from "../motor/fluxo.ts";
import { aplicarR1, aplicarR3 } from "../motor/dependencias.ts";
import { calcularPrazo } from "../motor/prioridade.ts";
import { recalcularAlertas, resolverAlerta } from "../motor/alertas.ts";
import { aprenderCorrecao } from "../extracao/dicionario.ts";
import {
  descreverDoente,
  descreverUtilizador,
  pedidoParaJson as formatarPedidoParaJson,
} from "../apresentacao.ts";
import type { Pedido, Prioridade, TipoPedido } from "../types.ts";

export function criarRotasValidacao(store: typeof StoreType) {
  const router = Router();

  function pedidoParaJson(p: Pedido) {
    return formatarPedidoParaJson(p, store.parametros.limiar_confianca);
  }

  // Lista de consultas com pedidos EXTRAIDOS, agrupadas pela consulta de origem.
  router.get("/consultas", (_req, res) => {
    const extraidos = store.pedidos.filter((p) => p.estado === "EXTRAIDO");
    const grupos = new Map<string, Pedido[]>();
    for (const p of extraidos) {
      const chave = p.consulta_origem_ato_id || `${p.doente_id}:${p.criado_em}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push(p);
    }

    const resultado = [...grupos.entries()].map(([chave, pedidos]) => {
      const primeiro = pedidos[0];
      const nota = store.notasConsulta.find((n) => n.ato_id === primeiro.consulta_origem_ato_id);
      const alertas = store.alertas.filter((a) => a.estado === "ABERTO" && a.doente_id === primeiro.doente_id && !a.pedido_id);
      return {
        chave,
        consulta_ato_id: primeiro.consulta_origem_ato_id,
        doente_id: primeiro.doente_id,
        doente_nome: descreverDoente(primeiro.doente_id),
        medico_id: primeiro.medico_requisitante_id,
        medico_nome: descreverUtilizador(primeiro.medico_requisitante_id),
        criado_em: primeiro.criado_em,
        texto_original: nota?.p || primeiro.texto_origem,
        confianca_minima: Math.min(...pedidos.map((p) => p.confianca)),
        pedidos: pedidos.map(pedidoParaJson),
        alertas: alertas.map((a) => ({ alerta_id: a.alerta_id, tipo: a.tipo, descricao: a.descricao, gravidade: a.gravidade })),
      };
    });
    resultado.sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    res.json(resultado);
  });

  // Aprovar sem alterar um ou mais pedidos EXTRAIDO da mesma consulta.
  router.post("/aprovar", (req, res) => {
    const ids: string[] = req.body?.pedidoIds ?? [];
    const pedidos = ids.map((id) => store.pedidos.find((p) => p.pedido_id === id)).filter((p): p is Pedido => !!p);
    if (pedidos.length === 0) {
      res.status(400).json({ erro: "Sem pedidos válidos para aprovar." });
      return;
    }
    aprovarPedidos(pedidos, req.utilizadorId, agora());
    res.json({ ok: true, pedidos: pedidos.map(pedidoParaJson) });
  });

  // Corrigir um pedido extraído: grava a correcção e, opcionalmente, ensina o dicionário.
  router.post("/pedidos/:id/editar", (req, res) => {
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.id);
    if (!pedido || pedido.estado !== "EXTRAIDO") {
      res.status(404).json({ erro: "Pedido não encontrado ou já não está EXTRAIDO." });
      return;
    }
    const quando = agora();
    const alteracoes = req.body?.alteracoes ?? {};
    const camposPermitidos: (keyof Pedido)[] = [
      "tipo_pedido",
      "especialidade_destino",
      "ato_codigo",
      "exames",
      "analises",
      "especificacao",
      "prioridade",
    ];
    for (const campo of camposPermitidos) {
      if (alteracoes[campo] !== undefined) (pedido as unknown as Record<string, unknown>)[campo] = alteracoes[campo];
    }
    if (alteracoes.prioridade) {
      pedido.prioridade_por_defeito = false;
      pedido.prazo_limite = isoData(calcularPrazo(pedido.tipo_pedido, pedido.prioridade, agora(), null));
    }

    const correcaoDicionario = req.body?.correcaoDicionario as
      | { termo: string; significado: string; mapeiaPara: string }
      | undefined;
    if (correcaoDicionario) {
      aprenderCorrecao({ ...correcaoDicionario, medicoId: pedido.medico_requisitante_id });
    }

    registarEvento(pedido, "CORRECAO", "EXTRAIDO", req.utilizadorId, {
      detalhe: JSON.stringify(alteracoes),
      dataHora: quando,
    });

    reaplicarDependenciasDaConsulta(store, pedido.consulta_origem_ato_id, quando);
    res.json({ ok: true, pedido: pedidoParaJson(pedido) });
  });

  // Adicionar um pedido a partir de um alerta (ex.: termo desconhecido corrigido).
  router.post("/alertas/:id/criar-pedido", (req, res) => {
    const alerta = store.alertas.find((a) => a.alerta_id === req.params.id);
    if (!alerta || alerta.estado !== "ABERTO") {
      res.status(404).json({ erro: "Alerta não encontrado ou já resolvido." });
      return;
    }
    const b = req.body ?? {};
    const consultaAtoId: string = b.consultaAtoId ?? "";
    const medicoId: string = b.medicoId ?? "";
    if (!consultaAtoId || !medicoId) {
      res.status(400).json({ erro: "Falta consultaAtoId ou medicoId." });
      return;
    }
    const quando = agora();
    const prioridade: Prioridade = b.prioridade ?? "N";
    const tipoPedido: TipoPedido = b.tipo_pedido;
    const prazo = calcularPrazo(tipoPedido, prioridade, quando, null);

    const pedido: Pedido = {
      pedido_id: store.proximoId("pedido"),
      doente_id: alerta.doente_id,
      consulta_origem_ato_id: consultaAtoId,
      especialidade_origem: alerta.especialidade,
      medico_requisitante_id: medicoId,
      criado_em: isoDataHora(quando),
      tipo_pedido: tipoPedido,
      fluxo: tipoPedido === "pedido_consulta" || tipoPedido === "pedido_hd" ? "TRIAGEM" : "DIRETO",
      especialidade_destino: b.especialidade_destino,
      ato_codigo: b.ato_codigo,
      exames: b.exames ?? [],
      analises: b.analises ?? [],
      especificacao: b.especificacao ?? "",
      prioridade,
      prazo_limite: isoData(prazo),
      nao_antes: b.nao_antes_dias != null ? isoData(somarDias(quando, b.nao_antes_dias)) : "",
      medico_preferido_id: b.medico_preferido === "REQUISITANTE" ? medicoId : b.medico_preferido ?? "",
      continuidade_obrigatoria: !!b.continuidade_obrigatoria,
      recorrencia: b.recorrencia ?? "",
      texto_origem: b.texto_origem ?? alerta.descricao,
      confianca: 1,
      aprovado_direto: false,
      validado_por: "",
      validado_em: "",
      triado_por: "",
      triado_em: "",
      decisao_triagem: "",
      marcado_em: "",
      ato_id: "",
      estado: "EXTRAIDO",
      n_remarcacoes: 0,
      prioridade_por_defeito: b.prioridade == null,
    };
    store.pedidos.push(pedido);
    registarEvento(pedido, "CORRECAO", "EXTRAIDO", req.utilizadorId, {
      detalhe: "Pedido criado a partir de um alerta",
      dataHora: quando,
    });

    const correcaoDicionario = b.correcaoDicionario as { termo: string; significado: string; mapeiaPara: string } | undefined;
    if (correcaoDicionario) {
      aprenderCorrecao({ ...correcaoDicionario, medicoId });
      pedido.origem_dicionario = false; // foi corrigido agora, não reconhecido automaticamente
    }

    resolverAlerta(alerta.alerta_id, req.utilizadorId, "Pedido criado a partir do alerta", quando);
    reaplicarDependenciasDaConsulta(store, consultaAtoId, quando);
    res.json({ ok: true, pedido: pedidoParaJson(pedido) });
  });

  return router;
}

/** Depois de editar/acrescentar um pedido, volta a aplicar R1/R3 a todo o grupo da consulta. */
function reaplicarDependenciasDaConsulta(store: typeof StoreType, consultaAtoId: string, quando: Date): void {
  if (!consultaAtoId) return;
  const grupo = store.pedidos.filter((p) => p.consulta_origem_ato_id === consultaAtoId && p.estado === "EXTRAIDO");
  for (const p of grupo) {
    if (p.tipo_pedido === "exame") aplicarR1(p, grupo, quando);
  }
  for (const p of grupo) {
    if (p.tipo_pedido === "consulta") aplicarR3(p, grupo);
  }
  recalcularAlertas(quando);
}
