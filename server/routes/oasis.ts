import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { isoData, isoDataHora } from "../util.ts";
import { pedidoParaJson, descreverUtilizador } from "../apresentacao.ts";
import { registarEvento } from "../motor/estados.ts";
import { aplicarR1, criarDependencia, intervaloResultado } from "../motor/dependencias.ts";
import { aprovarPedidos } from "../motor/fluxo.ts";
import { calcularPrazo, calcularPrioridadeSistema } from "../motor/prioridade.ts";
import type { Pedido, Prioridade, TipoPedido } from "../types.ts";

export function criarRotasOasis(store: typeof StoreType) {
  const router = Router();

  // Agenda do médico seleccionado (perfil no cabeçalho) num dia; por omissão, hoje (DEMO_DATE).
  // O médico pode navegar para um dia futuro (?data=aaaa-mm-dd) e encontrar lá uma consulta
  // de revisão entretanto marcada, abrindo-a exactamente como faria "hoje".
  router.get("/medico/agenda", (req, res) => {
    const medicoId = req.utilizadorId;
    const medico = store.utilizadores.find((u) => u.utilizador_id === medicoId);
    if (!medico || !medico.e_medico) {
      res.status(400).json({ erro: "O perfil seleccionado não é um médico." });
      return;
    }
    const hoje = store.parametros.DEMO_DATE;
    const dataPedida = typeof req.query.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.data) ? req.query.data : hoje;
    const atos = store.atosMedicos
      .filter((a) => a.mvp_medico_id === medicoId && a.data_hora.startsWith(dataPedida))
      .sort((a, b) => a.data_hora.localeCompare(b.data_hora))
      .map((ato) => {
        const doente = store.doentes.find((d) => d.doente_id === ato.doente_id);
        const nota = store.notasConsulta.find((n) => n.ato_id === ato.mvp_ato_id);
        return {
          ato_id: ato.mvp_ato_id,
          data_hora: ato.data_hora,
          duracao_min: ato.duracao_min,
          estado: ato.estado,
          ato_descricao: ato.ato_descricao,
          gabinete_descricao: ato.gabinete_descricao,
          doente_id: ato.doente_id,
          doente_nome: doente?.nome ?? ato.doente_id,
          tem_nota: !!nota,
        };
      });
    res.json({ medico, hoje, data: dataPedida, atos });
  });

  // Detalhe de uma consulta (para abrir o ecrã SOAP).
  router.get("/consulta/:atoId", (req, res) => {
    const ato = store.atosMedicos.find((a) => a.mvp_ato_id === req.params.atoId);
    if (!ato) {
      res.status(404).json({ erro: "Consulta não encontrada." });
      return;
    }
    const doente = store.doentes.find((d) => d.doente_id === ato.doente_id);
    const nota = store.notasConsulta.find((n) => n.ato_id === ato.mvp_ato_id) ?? null;
    const pedidosExistentes = store.pedidos
      .filter((p) => p.consulta_origem_ato_id === ato.mvp_ato_id)
      .map((p) => pedidoParaJson(p, store.parametros.limiar_confianca));

    // Resumo de todos os pedidos do doente (não só desta consulta): dá ao médico uma visão
    // rápida do que está pendente/agendado/realizado antes de escrever o plano de hoje.
    const pedidosDoente = doente ? store.pedidos.filter((p) => p.doente_id === doente.doente_id) : [];
    const resumoPedidos = {
      total: pedidosDoente.length,
      pendentes: pedidosDoente.filter((p) =>
        ["EXTRAIDO", "VALIDADO", "EM_TRIAGEM", "ACEITE", "SEM_VAGA", "DEVOLVIDO", "REENCAMINHADO"].includes(p.estado),
      ).length,
      agendados: pedidosDoente.filter((p) => p.estado === "MARCADO" || p.estado === "FALTOU").length,
      realizados: pedidosDoente.filter((p) => p.estado === "REALIZADO").length,
    };

    res.json({ ato, doente, nota, pedidosExistentes, resumoPedidos });
  });

  // Guardar a nota SOAP (S/O/A/P em texto livre). Já não chama o Agente Oasis: o P deixou de
  // ser interpretado automaticamente — os pedidos passam a ser declarados directamente pelo
  // médico no assistente "Tipo de pedidos" → "Preenchimento" → "Resumo" (ver /consulta/:atoId/pedidos).
  router.post("/consulta/:atoId/guardar", (req, res) => {
    const ato = store.atosMedicos.find((a) => a.mvp_ato_id === req.params.atoId);
    if (!ato) {
      res.status(404).json({ erro: "Consulta não encontrada." });
      return;
    }
    const { s = "", o = "", a = "", p = "" } = req.body ?? {};
    const quando = agora();
    const medicoId = ato.mvp_medico_id;

    const notaExistente = store.notasConsulta.find((n) => n.ato_id === ato.mvp_ato_id);
    if (notaExistente) {
      Object.assign(notaExistente, { s, o, a, p, guardado_em: isoDataHora(quando), guardado_por: medicoId });
    } else {
      store.notasConsulta.push({
        ato_id: ato.mvp_ato_id,
        s,
        o,
        a,
        p,
        guardado_em: isoDataHora(quando),
        guardado_por: medicoId,
      });
    }

    res.json({ ok: true });
  });

  // Pedido estruturado tal como declarado pelo médico no assistente (sem IA): já vem com o
  // acto/especialidade escolhidos, por isso o tipo_pedido vem sempre do catálogo, nunca de
  // texto livre.
  interface PedidoDeclarado {
    especialidade_destino: string;
    ato_codigo: string;
    exames?: string[];
    analises?: string[];
    especificacao?: string;
    prioridade?: Prioridade | "" | null;
    nao_antes?: string; // "aaaa-mm-dd" ou ""
    depende_exames_consulta?: boolean; // só relevante para tipo_pedido "consulta"
    continuidade_medico?: boolean; // "comigo": tenta agendar com o médico requisitante (só tipo "consulta")
  }

  // Cria pedidos directamente a partir do que o médico declarou no assistente (etapas 2-4):
  // sem Agente Oasis, sem validação administrativa prévia — validado e encaminhado de imediato
  // (regra de negócio: o médico passa a declarar directamente o que pretende pedir).
  router.post("/consulta/:atoId/pedidos", (req, res) => {
    const ato = store.atosMedicos.find((a) => a.mvp_ato_id === req.params.atoId);
    if (!ato) {
      res.status(404).json({ erro: "Consulta não encontrada." });
      return;
    }
    const itens: PedidoDeclarado[] = Array.isArray(req.body?.pedidos) ? req.body.pedidos : [];
    if (itens.length === 0) {
      res.status(400).json({ erro: "Sem pedidos para submeter." });
      return;
    }

    const quando = agora();
    const medicoId = ato.mvp_medico_id;
    const doente = store.doentes.find((d) => d.doente_id === ato.doente_id) ?? null;
    // O médico indica se o doente precisa de transporte não urgente (entra no custo de remarcar e no dia único).
    if (doente && typeof req.body?.transporte_nao_urgente === "boolean") doente.transporte_nao_urgente = req.body.transporte_nao_urgente;
    const criados: Pedido[] = [];
    const dependeExamesConsulta: Pedido[] = [];

    for (const item of itens) {
      const catalogo = store.catalogoAtos.find(
        (c) => c.especialidade_codigo === item.especialidade_destino && c.ato_codigo === item.ato_codigo,
      );
      if (!catalogo) {
        res.status(400).json({ erro: `Acto desconhecido (${item.especialidade_destino}/${item.ato_codigo}).` });
        return;
      }
      const tipoPedido = catalogo.tipo_pedido as TipoPedido;
      const especificacao = item.especificacao ?? "";
      const exames = catalogo.tipo_pedido === "exame" ? item.exames ?? [] : [];
      const analises = catalogo.tipo_pedido === "analises" ? item.analises ?? [] : [];

      const resultadoEquacao = calcularPrioridadeSistema(
        { tipo_pedido: tipoPedido, ato_codigo: item.ato_codigo, especificacao, prioridade_sugerida: item.prioridade || null },
        doente,
        undefined,
        item.especialidade_destino,
      );
      const prioridade: Prioridade = item.prioridade || resultadoEquacao.prioridade;
      const prazo = calcularPrazo(tipoPedido, prioridade, quando, null);
      const naoAntes = item.nao_antes && /^\d{4}-\d{2}-\d{2}$/.test(item.nao_antes) ? item.nao_antes : "";

      const pedido: Pedido = {
        pedido_id: store.proximoId("pedido"),
        doente_id: ato.doente_id,
        consulta_origem_ato_id: ato.mvp_ato_id,
        especialidade_origem: ato.especialidade_codigo,
        medico_requisitante_id: medicoId,
        criado_em: isoDataHora(quando),
        tipo_pedido: tipoPedido,
        fluxo: tipoPedido === "pedido_consulta" || tipoPedido === "pedido_hd" ? "TRIAGEM" : "DIRETO",
        especialidade_destino: item.especialidade_destino,
        ato_codigo: item.ato_codigo,
        exames,
        analises,
        especificacao,
        prioridade,
        prazo_limite: isoData(prazo),
        nao_antes: naoAntes,
        medico_preferido_id: tipoPedido === "consulta" && item.continuidade_medico ? medicoId : "",
        continuidade_obrigatoria: tipoPedido === "consulta" && !!item.continuidade_medico,
        recorrencia: "",
        texto_origem: especificacao,
        confianca: 1,
        aprovado_direto: true,
        validado_por: "",
        validado_em: "",
        triado_por: "",
        triado_em: "",
        decisao_triagem: "",
        marcado_em: "",
        ato_id: "",
        estado: "EXTRAIDO",
        n_remarcacoes: 0,
        prioridade_por_defeito: !item.prioridade,
        score_prioridade: resultadoEquacao.score,
        equacao_prioridade_detalhe: resultadoEquacao.detalheEquacao,
        prioridade_calculada_sistema: !item.prioridade,
      };
      store.pedidos.push(pedido);
      registarEvento(pedido, "CORRECAO", "EXTRAIDO", medicoId, {
        detalhe: "Pedido declarado directamente pelo médico (sem Agente Oasis)",
        dataHora: quando,
      });
      criados.push(pedido);
      if (tipoPedido === "consulta" && item.depende_exames_consulta) dependeExamesConsulta.push(pedido);
    }

    // R1 (determinística, sem IA): TC com contraste exige creatinina recente, senão cria/liga a
    // colheita. R3: em vez de "cheirar" o texto ("c/ exames"), o médico assinala explicitamente
    // que a consulta depende dos exames/análises pedidos agora.
    for (const p of criados) {
      if (p.tipo_pedido === "exame") aplicarR1(p, criados, quando);
    }
    for (const revisao of dependeExamesConsulta) {
      const mcdt = criados.filter((p) => p.pedido_id !== revisao.pedido_id && (p.tipo_pedido === "exame" || p.tipo_pedido === "analises"));
      for (const requisito of mcdt) {
        criarDependencia(revisao, requisito, intervaloResultado(requisito.especialidade_destino), "MEDICO");
      }
    }

    // Validação + encaminhamento imediato: sem passar pela fila de validação administrativa.
    aprovarPedidos(criados, medicoId, quando);

    res.json({
      ok: true,
      protocolo: `${ato.mvp_ato_id}-${isoDataHora(quando).replace(/[-:T]/g, "")}`,
      criadoEm: isoDataHora(quando),
      medicoNome: descreverUtilizador(medicoId),
      pedidos: criados.map((pedido) => pedidoParaJson(pedido, store.parametros.limiar_confianca)),
    });
  });

  router.get("/agendas", (req, res) => {
    const especialidade = String(req.query.especialidade ?? "");
    const dia = String(req.query.dia ?? store.parametros.DEMO_DATE);
    if (!especialidade) {
      res.status(400).json({ erro: "Falta o parâmetro especialidade." });
      return;
    }
    const vagas = store.vagas
      .filter((v) => v.especialidade_codigo === especialidade && v.data_hora.startsWith(dia))
      .sort((a, b) => a.data_hora.localeCompare(b.data_hora))
      .map((v) => {
        const gabinete = store.gabinetes.find((g) => g.codigo === v.gabinete_codigo);
        const medico = store.utilizadores.find((u) => u.utilizador_id === v.medico_id);
        const ato = v.ato_id ? store.atosMedicos.find((a) => a.mvp_ato_id === v.ato_id) : undefined;
        const doente = ato ? store.doentes.find((d) => d.doente_id === ato.doente_id) : undefined;
        return {
          vaga_id: v.vaga_id,
          data_hora: v.data_hora,
          duracao_min: v.duracao_min,
          gabinete_descricao: gabinete?.descricao ?? v.gabinete_codigo,
          medico_nome: medico?.nome ?? "",
          livre: !v.ato_id,
          doente_id: doente?.doente_id,
          doente_nome: doente?.nome,
          ato_descricao: ato?.ato_descricao,
          ato_estado: ato?.estado,
        };
      });
    res.json({ especialidade, dia, vagas });
  });

  router.get("/especialidades", (_req, res) => {
    res.json(store.especialidades);
  });

  return router;
}
