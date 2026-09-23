import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { apenasData, diferencaDias, formatarDataPt, isoData, parseIso, somarDias } from "../util.ts";
import { aprovarPropostaTroca, rejeitarPropostaTroca, contarVagasLivres, encontrarVagaLivre, janelaAgendamento, marcarPedidoNaVaga } from "../motor/agendamento.ts";
import { recalcularAlertas, resolverAlerta } from "../motor/alertas.ts";
import { VARIAVEIS_INDICE_OMISSAO, calcularIndice, variaveisIndice, type VariaveisIndice } from "../motor/indice.ts";
import { reportarAvaria, resolverAvaria } from "../motor/avarias.ts";
import {
  aceitarPlanoAvaria,
  aceitarPropostaRemarcacao,
  actualizarSugestaoFalta,
  rejeitarPropostaRemarcacao,
  resolverComVagaExtra,
  resolverComOutsourcing,
  pedirDecisaoAoMedico,
  alternativasProposta,
  escolherAlternativa,
} from "../motor/propostasRemarcacao.ts";
import { marcarOutsourcing, pedirDecisaoMedico } from "../motor/fluxo.ts";
import { desmarcarAPedidoDoDoente, expirarOfertas, responderOferta } from "../motor/antecipacao.ts";
import { encaixesSugeridos, listaChamadas, registarChamada } from "../motor/chamadas.ts";
import { PESOS_PRIORIDADE_OMISSAO, pesosPrioridadeDoServico } from "../motor/prioridade.ts";
import {
  descreverDoente,
  descreverEspecialidade,
  descreverEstadioCuidado,
  descreverEstado,
  descreverPedido,
  descreverPrioridade,
  descreverTipoPedido,
  descreverUtilizador,
  descreverAto,
} from "../apresentacao.ts";
import type { Avaria, Pedido } from "../types.ts";

/** Mediana de uma lista de números (não altera o array original). */
function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 === 0 ? Math.round((ord[meio - 1] + ord[meio]) / 2) : ord[meio];
}

export function criarRotasServico(store: typeof StoreType) {
  const router = Router();

  function especialidadeDoUtilizador(utilizadorId: string): string | null {
    return store.utilizadores.find((u) => u.utilizador_id === utilizadorId)?.especialidade_codigo || null;
  }

  function pedidoResumo(p: Pedido) {
    return {
      pedido_id: p.pedido_id,
      doente_id: p.doente_id,
      doente_nome: descreverDoente(p.doente_id),
      medico_requisitante_nome: descreverUtilizador(p.medico_requisitante_id),
      tipo_pedido_legivel: descreverTipoPedido(p.tipo_pedido),
      descricao: descreverPedido(p),
      prioridade_legivel: descreverPrioridade(p.prioridade),
      prazo_limite: p.prazo_limite,
      estado: p.estado,
      estado_legivel: descreverEstado(p.estado),
      n_remarcacoes: p.n_remarcacoes,
      decisao_pendente: !!p.decisao_pendente,
      primeira_vaga: p.estado === "SEM_VAGA" ? primeiraVagaForaDoPrazo(p) : null,
      sem_sugestao: p.estado === "SEM_VAGA" && !primeiraVagaForaDoPrazo(p) ? porqueSemVaga(p) : "",
      data_marcada: p.ato_id ? store.atosMedicos.find((a) => a.mvp_ato_id === p.ato_id)?.data_hora ?? "" : "",
      criado_em: p.criado_em,
    };
  }

  /** Porque não há nenhuma vaga a sugerir (em linguagem simples). */
  function porqueSemVaga(p: Pedido): string {
    const { inicio } = janelaAgendamento(p, apenasData(agora()));
    const ultima = store.vagas
      .filter((v) => v.especialidade_codigo === p.especialidade_destino)
      .reduce((m, v) => (v.data_hora > m ? v.data_hora : m), "");
    const naoAntes = inicio.getTime() > somarDias(apenasData(agora()), 1).getTime() ? `Não pode ser antes de ${formatarDataPt(inicio)} (precisa dos resultados de que depende)` : "Não há vaga livre compatível";
    return ultima && parseIso(ultima).getTime() < inicio.getTime()
      ? `${naoAntes} e a agenda aberta do serviço só vai até ${formatarDataPt(parseIso(ultima))}.`
      : `${naoAntes} nos 90 dias seguintes ao prazo.`;
  }

  /** Sem vaga no prazo: a primeira vaga que existe depois dele (sugestão; a administrativa decide). */
  function primeiraVagaForaDoPrazo(p: Pedido): { vaga_id: string; data_hora: string; dias_fora: number } | null {
    const { inicio } = janelaAgendamento(p, apenasData(agora()));
    const prazo = parseIso(p.prazo_limite);
    const vaga = encontrarVagaLivre(p.especialidade_destino, p.ato_codigo, inicio, somarDias(prazo, 90), undefined, { pedido: p, quando: agora() });
    if (!vaga) return null;
    return { vaga_id: vaga.vaga_id, data_hora: vaga.data_hora, dias_fora: Math.max(0, diferencaDias(apenasData(parseIso(vaga.data_hora)), prazo)) };
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
      .map((a) => {
        const pedido = store.pedidos.find((p) => p.pedido_id === a.pedido_id);
        const ato = pedido?.ato_id ? store.atosMedicos.find((x) => x.mvp_ato_id === pedido.ato_id) : undefined;
        // Já há uma remarcação proposta (falta, avaria) para este doente? Então o aviso é só informativo.
        const proposta = store.propostasRemarcacao.find((r) => r.doente_id === a.doente_id && r.estado === "PENDENTE");
        return {
          alerta_id: a.alerta_id,
          tipo: a.tipo,
          gravidade: a.gravidade,
          descricao: a.descricao,
          doente_id: a.doente_id,
          doente_nome: a.doente_id ? descreverDoente(a.doente_id) : "",
          pedido_descricao: pedido ? descreverPedido(pedido) : "",
          data_marcada: pedido?.estado === "MARCADO" ? ato?.data_hora ?? "" : "",
          tratado: proposta ? `Remarcação já proposta a ${descreverEspecialidade(proposta.especialidade)}, à espera de validação.` : "",
          criado_em: a.criado_em,
        };
      });
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
        pedido_urgente: p.pedido_urgente,
        pedido_urgente_doente: descreverDoente(store.pedidos.find((x) => x.pedido_id === p.pedido_urgente)?.doente_id ?? ""),
        pedido_urgente_doente_id: store.pedidos.find((x) => x.pedido_id === p.pedido_urgente)?.doente_id ?? "",
        avaliacao: p.avaliacao ?? [],
        escolhido_regra_antiga: p.escolhido_regra_antiga ?? "",
      }));
    res.json(propostas);
  });

  // ------------------------------------------------ remarcações propostas (avaria em lote, falta individual)
  function propostaRemarcacaoJson(p: (typeof store.propostasRemarcacao)[number]) {
    const pedido = store.pedidos.find((x) => x.pedido_id === p.pedido_id);
    const doente = store.doentes.find((d) => d.doente_id === p.doente_id);
    return {
      ...p,
      doente_nome: doente?.nome ?? p.doente_id,
      doente_id: p.doente_id,
      estadio_cuidado: doente?.estadio_cuidado ?? "",
      descricao: pedido ? descreverPedido(pedido) : "Marcação sem pedido no sistema",
      prioridade: pedido?.prioridade ?? "",
      prazo_limite: pedido?.prazo_limite ?? "",
    };
  }

  router.get("/remarcacoes", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const doServico = store.propostasRemarcacao.filter((p) => p.especialidade === especialidade);
    for (const p of doServico) if (p.origem === "FALTA" && p.estado === "PENDENTE") actualizarSugestaoFalta(p, agora());
    const avarias = store.avarias
      .filter((a) => a.especialidade_codigo === especialidade && doServico.some((p) => p.avaria_id === a.avaria_id))
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .map((a) => ({
        avaria_id: a.avaria_id,
        descricao: a.descricao,
        data_inicio: a.data_inicio,
        duracao_dias: a.duracao_dias,
        estado: a.estado,
        reportado_por: descreverUtilizador(a.reportado_por),
        ato_legivel: a.medico_id
          ? `Agenda de ${descreverUtilizador(a.medico_id)}`
          : a.ato_codigo
            ? descreverAto(a.especialidade_codigo, a.ato_codigo)
            : "Todo o serviço",
        tipo: a.medico_id ? "AUSENCIA_MEDICO" : "EQUIPAMENTO",
        propostas: doServico.filter((p) => p.avaria_id === a.avaria_id).sort((x, y) => x.ordem - y.ordem).map(propostaRemarcacaoJson),
      }));
    const faltas = doServico.filter((p) => p.origem === "FALTA").reverse().map(propostaRemarcacaoJson);
    res.json({ avarias, faltas, pendentes: doServico.filter((p) => p.estado === "PENDENTE").length });
  });

  router.post("/remarcacoes/:id/aceitar", (req, res) => {
    const p = aceitarPropostaRemarcacao(req.params.id, req.utilizadorId, agora());
    if (!p) {
      res.status(404).json({ erro: "Proposta não encontrada ou já decidida." });
      return;
    }
    res.json({ ok: true, proposta: propostaRemarcacaoJson(p) });
  });

  router.post("/remarcacoes/:id/rejeitar", (req, res) => {
    const p = rejeitarPropostaRemarcacao(req.params.id, req.utilizadorId, agora());
    if (!p) {
      res.status(404).json({ erro: "Proposta não encontrada ou já decidida." });
      return;
    }
    res.json({ ok: true, proposta: propostaRemarcacaoJson(p) });
  });

  // "Outra solução": alternativas à vaga sugerida, e aplicar a escolhida.
  router.get("/remarcacoes/:id/alternativas", (req, res) => {
    res.json(alternativasProposta(req.params.id, agora()).map((a) => ({ ...a, medico_nome: descreverUtilizador(a.medico_id) })));
  });

  router.post("/remarcacoes/:id/escolher", (req, res) => {
    const p = escolherAlternativa(req.params.id, String(req.body?.vagaId ?? ""), req.utilizadorId, agora());
    if (!p) {
      res.status(404).json({ erro: "A vaga já não está disponível ou a proposta já foi decidida." });
      return;
    }
    res.json({ ok: true, proposta: propostaRemarcacaoJson(p) });
  });

  router.post("/remarcacoes/:id/vaga-extra", (req, res) => {
    const dataHora: string = req.body?.dataHora ?? "";
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dataHora)) {
      res.status(400).json({ erro: "Indique a data e hora da vaga extra." });
      return;
    }
    const p = resolverComVagaExtra(req.params.id, dataHora, req.utilizadorId, agora());
    if (!p) {
      res.status(404).json({ erro: "Proposta não encontrada ou já resolvida." });
      return;
    }
    res.json({ ok: true, proposta: propostaRemarcacaoJson(p) });
  });

  router.post("/remarcacoes/:id/outsourcing", (req, res) => {
    const p = resolverComOutsourcing(req.params.id, req.body?.nota ?? "", req.utilizadorId, agora());
    if (!p) {
      res.status(404).json({ erro: "Proposta não encontrada ou já resolvida." });
      return;
    }
    res.json({ ok: true, proposta: propostaRemarcacaoJson(p) });
  });

  router.post("/remarcacoes/:id/pedir-decisao-medico", (req, res) => {
    const p = pedirDecisaoAoMedico(req.params.id, req.utilizadorId, agora());
    if (!p) {
      res.status(404).json({ erro: "Proposta não encontrada, já resolvida, ou sem consulta dependente." });
      return;
    }
    res.json({ ok: true, proposta: propostaRemarcacaoJson(p) });
  });

  // Ausência de médico (férias, doença): mesmo motor das avarias, só bloqueia a agenda desse médico.
  router.get("/medicos", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const ids = new Set(store.vagas.filter((v) => v.especialidade_codigo === especialidade && v.medico_id).map((v) => v.medico_id));
    res.json([...ids].map((id) => ({ utilizador_id: id, nome: descreverUtilizador(id) })));
  });

  router.post("/ausencias", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const medicoId: string = req.body?.medico_id ?? "";
    const dataInicio: string = req.body?.data_inicio ?? "";
    const duracaoDias = Number(req.body?.duracao_dias ?? 1);
    const motivo: string = (req.body?.motivo ?? "").trim() || "Ausência";
    if (!especialidade || !store.vagas.some((v) => v.especialidade_codigo === especialidade && v.medico_id === medicoId)) {
      res.status(400).json({ erro: "Escolha um médico deste serviço." });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicio) || !(duracaoDias > 0)) {
      res.status(400).json({ erro: "Indique a data de início e o número de dias." });
      return;
    }
    const avaria = reportarAvaria(
      { especialidadeCodigo: especialidade, descricao: `${motivo} de ${descreverUtilizador(medicoId)}`, duracaoDias, dataInicio, medicoId },
      req.utilizadorId,
      agora(),
    );
    res.json({ ok: true, avaria_id: avaria.avaria_id, afetadas: avaria.pedidos_afetados });
  });

  router.post("/avarias/:id/aceitar-plano", (req, res) => {
    const n = aceitarPlanoAvaria(req.params.id, req.utilizadorId, agora());
    res.json({ ok: true, aceites: n });
  });

  // ------------------------------------------------ marcações do serviço (para desmarcar a pedido do doente)
  router.get("/marcacoes", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const hoje = apenasData(agora());
    const marcacoes = store.pedidos
      .filter((p) => p.especialidade_destino === especialidade && p.estado === "MARCADO")
      .map((p) => ({ p, ato: store.atosMedicos.find((a) => a.mvp_ato_id === p.ato_id) }))
      .filter((x) => x.ato && diferencaDias(apenasData(parseIso(x.ato.data_hora)), hoje) >= 1)
      .map(({ p, ato }) => ({ ...pedidoResumo(p), data_hora: ato!.data_hora, ato_id: ato!.mvp_ato_id }))
      .sort((a, b) => a.data_hora.localeCompare(b.data_hora));
    res.json(marcacoes);
  });

  router.post("/pedidos/:id/desmarcar", (req, res) => {
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.id);
    if (!pedido || pedido.estado !== "MARCADO") {
      res.status(404).json({ erro: "Pedido não encontrado ou não está marcado." });
      return;
    }
    const disponivel: string | null = req.body?.disponivelAPartirDe || null;
    if (disponivel && !/^\d{4}-\d{2}-\d{2}$/.test(disponivel)) {
      res.status(400).json({ erro: "Data 'disponível a partir de' inválida (aaaa-mm-dd)." });
      return;
    }
    const r = desmarcarAPedidoDoDoente(pedido, req.utilizadorId, disponivel, agora());
    const novoAto = store.atosMedicos.find((a) => a.mvp_ato_id === pedido.ato_id);
    res.json({
      ok: true,
      oferta: r?.oferta ?? null,
      reagendado_para: pedido.estado === "MARCADO" ? novoAto?.data_hora ?? null : null,
    });
  });

  // ------------------------------------------------ vagas libertadas / ofertas de antecipação (secção 8A, R-E)
  function ofertaJson(o: (typeof store.ofertasAntecipacao)[number]) {
    return {
      ...o,
      doente_nome: descreverDoente(o.doente_id),
      doente_id: o.doente_id,
      pedido_descricao: descreverPedido(store.pedidos.find((p) => p.pedido_id === o.pedido_id)!),
    };
  }

  router.get("/vagas-libertadas", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    expirarOfertas(agora());
    const ofertas = store.ofertasAntecipacao.filter((o) => o.especialidade === especialidade);
    res.json({
      pendentes: ofertas.filter((o) => o.estado === "PENDENTE").map(ofertaJson),
      historico: ofertas.filter((o) => o.estado !== "PENDENTE").reverse().map(ofertaJson),
      libertadas: store.vagasLibertadas.filter((v) => v.especialidade === especialidade),
    });
  });

  router.post("/ofertas/:id/responder", (req, res) => {
    const r = responderOferta(req.params.id, !!req.body?.aceita, req.utilizadorId, agora());
    if (!r) {
      res.status(404).json({ erro: "Oferta não encontrada ou já respondida." });
      return;
    }
    res.json({ ok: true, oferta: ofertaJson(r.oferta), seguinte: r.seguinte ? ofertaJson(r.seguinte) : null });
  });

  // ------------------------------------------------ lista de chamadas (secção 8A, R-G)
  router.get("/chamadas", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId) ?? undefined;
    res.json({ ...listaChamadas(especialidade, agora()), encaixes: encaixesSugeridos(especialidade, agora()) });
  });

  router.post("/chamadas/:atoId", (req, res) => {
    const resultado = req.body?.resultado;
    if (!["CONFIRMADO", "NAO_ATENDEU", "VAI_DESMARCAR"].includes(resultado)) {
      res.status(400).json({ erro: "Resultado inválido." });
      return;
    }
    const chamada = registarChamada(
      req.params.atoId,
      resultado,
      req.utilizadorId,
      { nota: req.body?.nota ?? "", disponivelAPartirDe: req.body?.disponivelAPartirDe || null },
      agora(),
    );
    if (!chamada) {
      res.status(404).json({ erro: "Marcação não encontrada." });
      return;
    }
    res.json({ ok: true, chamada });
  });

  router.post("/propostas/:id/aprovar", (req, res) => {
    aprovarPropostaTroca(req.params.id, req.utilizadorId, agora());
    res.json({ ok: true });
  });

  router.post("/propostas/:id/rejeitar", (req, res) => {
    rejeitarPropostaTroca(req.params.id, req.utilizadorId, agora());
    res.json({ ok: true });
  });

  // Sem vaga no prazo: a administrativa aceita a primeira vaga depois do prazo (fica registado porquê).
  router.post("/pedidos/:id/aceitar-primeira-vaga", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.id && p.especialidade_destino === especialidade);
    const sugestao = pedido && pedido.estado === "SEM_VAGA" ? primeiraVagaForaDoPrazo(pedido) : null;
    const vaga = sugestao ? store.vagas.find((v) => v.vaga_id === sugestao.vaga_id) : undefined;
    if (!pedido || !sugestao || !vaga) {
      res.status(404).json({ erro: "Pedido não encontrado, já tem vaga, ou não há vaga nos 90 dias seguintes ao prazo." });
      return;
    }
    marcarPedidoNaVaga(
      pedido,
      vaga,
      agora(),
      `Sem vaga até ao prazo: primeira vaga disponível, ${sugestao.dias_fora} dia(s) depois — aceite pela administrativa`,
    );
    recalcularAlertas(agora());
    res.json({ ok: true, pedido: pedidoResumo(pedido) });
  });

  // Sem vaga, sem solução interna: a administração conseguiu capacidade externa (outsourcing).
  router.post("/pedidos/:id/outsourcing", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.id && p.especialidade_destino === especialidade);
    if (!pedido || pedido.estado !== "SEM_VAGA") {
      res.status(404).json({ erro: "Pedido não encontrado ou não está sem vaga." });
      return;
    }
    marcarOutsourcing(pedido, req.utilizadorId, req.body?.nota ?? "", agora());
    res.json({ ok: true, pedido: pedidoResumo(pedido) });
  });

  // Sem vaga, sem solução (nem vaga extra, nem outsourcing): pede ao médico para decidir.
  router.post("/pedidos/:id/pedir-decisao", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.id && p.especialidade_destino === especialidade);
    if (!pedido || pedido.estado !== "SEM_VAGA") {
      res.status(404).json({ erro: "Pedido não encontrado ou não está sem vaga." });
      return;
    }
    const motivo: string = req.body?.motivo ?? "";
    if (!motivo.trim()) {
      res.status(400).json({ erro: "Descreva porque não há solução interna nem externa." });
      return;
    }
    pedirDecisaoMedico(pedido, req.utilizadorId, motivo.trim(), agora());
    res.json({ ok: true, pedido: pedidoResumo(pedido) });
  });

  /**
   * Sobrelotação: agrupa pedidos ACEITE/EM_TRIAGEM do serviço por (prioridade, prazo), e para
   * cada grupo compara com as vagas ainda livres na janela — sinaliza défice antes de qualquer
   * pedido cair em SEM_VAGA, para a admin poder agir com antecedência (vaga extra/outsourcing).
   */
  router.get("/overbooking", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const hoje = apenasData(agora());
    const pendentes = store.pedidos.filter(
      (p) =>
        p.especialidade_destino === especialidade &&
        (p.estado === "ACEITE" || p.estado === "EM_TRIAGEM") &&
        // quem já tem uma troca proposta está em "Para decidir"
        !store.propostasTroca.some((t) => t.pedido_urgente === p.pedido_id && t.estado === "PENDENTE"),
    );

    const grupos = new Map<string, Pedido[]>();
    for (const p of pendentes) {
      const chave = `${p.prioridade}::${p.prazo_limite}::${p.ato_codigo}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push(p);
    }

    const sinais = [...grupos.values()]
      .map((pedidos) => {
        const referencia = pedidos[0];
        const { inicio, fim } = janelaAgendamento(referencia, hoje);
        const vagasLivres = contarVagasLivres(especialidade!, referencia.ato_codigo, inicio, fim);
        const deficit = pedidos.length - vagasLivres;
        if (deficit <= 0) return null;
        return {
          prioridade_legivel: descreverPrioridade(referencia.prioridade),
          ato_legivel: descreverAto(especialidade!, referencia.ato_codigo),
          prazo_limite: referencia.prazo_limite,
          n_pedidos: pedidos.length,
          vagas_livres_estimadas: vagasLivres,
          deficit,
          pedidos: pedidos.map((p) => ({ pedido_id: p.pedido_id, doente_nome: descreverDoente(p.doente_id) })),
        };
      })
      .filter((s): s is NonNullable<typeof s> => !!s)
      .sort((a, b) => a.prazo_limite.localeCompare(b.prazo_limite));

    res.json(sinais);
  });

  function avariaResumo(a: Avaria) {
    return {
      avaria_id: a.avaria_id,
      especialidade_codigo: a.especialidade_codigo,
      ato_codigo: a.ato_codigo,
      ato_legivel: a.ato_codigo ? descreverAto(a.especialidade_codigo, a.ato_codigo) : "Todo o serviço",
      descricao: a.descricao,
      duracao_dias: a.duracao_dias,
      reportado_por_nome: descreverUtilizador(a.reportado_por),
      criado_em: a.criado_em,
      estado: a.estado,
      decisao: a.decisao,
      pedidos_afetados: a.pedidos_afetados,
    };
  }

  router.get("/avarias", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const avarias = store.avarias
      .filter((a) => a.especialidade_codigo === especialidade)
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .map(avariaResumo);
    res.json(avarias);
  });

  router.post("/avarias/:id/resolver", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const avaria = store.avarias.find((a) => a.avaria_id === req.params.id && a.especialidade_codigo === especialidade);
    if (!avaria || avaria.estado !== "ABERTA") {
      res.status(404).json({ erro: "Avaria não encontrada ou já resolvida." });
      return;
    }
    const decisao = req.body?.decisao as "REMARCACAO_TOTAL" | "REMARCACAO_PARCIAL";
    if (decisao !== "REMARCACAO_TOTAL" && decisao !== "REMARCACAO_PARCIAL") {
      res.status(400).json({ erro: "Escolha remarcação total ou parcial." });
      return;
    }
    const resolvida = resolverAvaria(avaria.avaria_id, decisao, req.utilizadorId, agora());
    res.json({ ok: true, avaria: resolvida ? avariaResumo(resolvida) : null });
  });

  // Pesos da equação de prioridade deste serviço: personalizados, ou os por omissão do sistema.
  router.get("/prioridade", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    if (!especialidade) {
      res.status(400).json({ erro: "O perfil seleccionado não tem especialidade associada." });
      return;
    }
    const pesos = pesosPrioridadeDoServico(store, especialidade);
    res.json({
      especialidade,
      especialidade_legivel: descreverEspecialidade(especialidade),
      personalizado: !!store.pesosPrioridadePorServico[especialidade],
      pesos,
      pesosOmissao: PESOS_PRIORIDADE_OMISSAO,
    });
  });

  // Ajusta os pesos deste serviço (têm de somar 1; normalizamos para tolerar pequenos arredondamentos).
  router.post("/prioridade/pesos", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    if (!especialidade) {
      res.status(400).json({ erro: "O perfil seleccionado não tem especialidade associada." });
      return;
    }
    const urgencia = Number(req.body?.urgencia);
    const tipo = Number(req.body?.tipo);
    const paciente = Number(req.body?.paciente);
    if (![urgencia, tipo, paciente].every((n) => Number.isFinite(n) && n >= 0)) {
      res.status(400).json({ erro: "Os três pesos têm de ser números não negativos." });
      return;
    }
    const soma = urgencia + tipo + paciente;
    if (soma <= 0) {
      res.status(400).json({ erro: "Os pesos não podem ser todos zero." });
      return;
    }
    store.pesosPrioridadePorServico[especialidade] = {
      urgencia: urgencia / soma,
      tipo: tipo / soma,
      paciente: paciente / soma,
    };
    res.json({ ok: true, pesos: store.pesosPrioridadePorServico[especialidade] });
  });

  router.post("/prioridade/repor", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    if (!especialidade) {
      res.status(400).json({ erro: "O perfil seleccionado não tem especialidade associada." });
      return;
    }
    delete store.pesosPrioridadePorServico[especialidade];
    res.json({ ok: true, pesos: PESOS_PRIORIDADE_OMISSAO });
  });

  // ------------------------------------------------ equação do índice de prioridade deste serviço
  // Cada serviço ajusta as variáveis; a pré-visualização mostra como muda a ordem da fila antes de guardar.
  const ESTADOS_FILA = new Set(["ACEITE", "SEM_VAGA", "FALTOU", "MARCADO", "EM_TRIAGEM"]);

  function filaOrdenada(especialidade: string, v: VariaveisIndice) {
    const quando = agora();
    return store.pedidos
      .filter((p) => p.especialidade_destino === especialidade && ESTADOS_FILA.has(p.estado))
      .map((p) => {
        const { valor, parcelas } = calcularIndice(p, quando, v);
        const doente = store.doentes.find((d) => d.doente_id === p.doente_id);
        return {
          pedido_id: p.pedido_id,
          doente_nome: descreverDoente(p.doente_id),
          doente_id: p.doente_id,
          prioridade: p.prioridade,
          estadio: descreverEstadioCuidado(doente?.estadio_cuidado ?? ""),
          prazo_limite: p.prazo_limite,
          indice: valor,
          parcelas,
        };
      })
      .sort((a, b) => b.indice - a.indice || a.prazo_limite.localeCompare(b.prazo_limite));
  }

  function lerVariaveis(corpo: unknown): VariaveisIndice | null {
    const v = { ...VARIAVEIS_INDICE_OMISSAO };
    for (const chave of Object.keys(v) as (keyof VariaveisIndice)[]) {
      const n = Number((corpo as Record<string, unknown>)?.[chave]);
      if (!Number.isFinite(n) || n < 0 || n > 1000) return null;
      v[chave] = n;
    }
    return v;
  }

  router.get("/indice", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    if (!especialidade) {
      res.status(400).json({ erro: "O perfil seleccionado não tem especialidade associada." });
      return;
    }
    const v = variaveisIndice(especialidade);
    res.json({
      especialidade_legivel: descreverEspecialidade(especialidade),
      variaveis: v,
      omissao: VARIAVEIS_INDICE_OMISSAO,
      personalizado: !!store.indicePorServico[especialidade],
      fila: filaOrdenada(especialidade, v).slice(0, 12),
    });
  });

  // Simula (não guarda): a mesma fila com as variáveis propostas.
  router.post("/indice/simular", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const v = lerVariaveis(req.body);
    if (!especialidade || !v) {
      res.status(400).json({ erro: "Valores inválidos (números entre 0 e 1000)." });
      return;
    }
    res.json({ fila: filaOrdenada(especialidade, v).slice(0, 12) });
  });

  router.post("/indice", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    const v = lerVariaveis(req.body);
    if (!especialidade || !v) {
      res.status(400).json({ erro: "Valores inválidos (números entre 0 e 1000)." });
      return;
    }
    store.indicePorServico[especialidade] = { ...v };
    recalcularAlertas(agora()); // recalcula e guarda o índice de todos os pedidos
    res.json({ ok: true, variaveis: v });
  });

  router.post("/indice/repor", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    if (!especialidade) {
      res.status(400).json({ erro: "O perfil seleccionado não tem especialidade associada." });
      return;
    }
    delete store.indicePorServico[especialidade];
    recalcularAlertas(agora());
    res.json({ ok: true, variaveis: VARIAVEIS_INDICE_OMISSAO });
  });

  // Estatísticas do serviço: tempo até agendamento (mediana + outliers), filtrável por estádio
  // do percurso oncológico do doente e por período (última semana/mês/todos).
  // Estatísticas do serviço: filtráveis por período, estádio do doente e nível de prioridade, com
  // comparação com o período anterior, evolução no tempo, cortes por estádio/nível e os casos mais lentos.
  router.get("/estatisticas", (req, res) => {
    const especialidade = especialidadeDoUtilizador(req.utilizadorId);
    if (!especialidade) {
      res.status(400).json({ erro: "O perfil seleccionado não tem especialidade associada." });
      return;
    }
    const hoje = apenasData(agora());
    const DIAS: Record<string, number | null> = { semana: 7, mes: 30, trimestre: 90, todos: null };
    const periodo = String(req.query.periodo ?? "mes") in DIAS ? String(req.query.periodo ?? "mes") : "mes";
    const nDias = DIAS[periodo];
    const lista = (q: unknown) => String(q ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const estadios = lista(req.query.estadio);
    const niveis = lista(req.query.nivel);

    const doDoente = new Map(store.doentes.map((d) => [d.doente_id, d]));
    const base = store.pedidos.filter(
      (p) =>
        p.especialidade_destino === especialidade &&
        (estadios.length === 0 || estadios.includes(doDoente.get(p.doente_id)?.estadio_cuidado ?? "")) &&
        (niveis.length === 0 || niveis.includes(p.prioridade)),
    );
    const criado = (p: Pedido) => apenasData(parseIso(p.criado_em)).getTime();
    const primeiro = base.reduce((m, p) => Math.min(m, criado(p)), hoje.getTime());
    const inicio = nDias ? somarDias(hoje, -nDias) : new Date(primeiro);
    const inicioAnterior = nDias ? somarDias(inicio, -nDias) : null;

    interface Amostra { pedido: Pedido; dias: number; dentroPrazo: boolean; faltou: boolean; estadio: string }
    function amostrasDe(pedidos: Pedido[]): Amostra[] {
      const r: Amostra[] = [];
      for (const p of pedidos) {
        const ato = p.ato_id ? store.atosMedicos.find((a) => a.mvp_ato_id === p.ato_id) : undefined;
        if (!ato) continue;
        r.push({
          pedido: p,
          dias: diferencaDias(parseIso(ato.data_hora), parseIso(p.criado_em)),
          dentroPrazo: parseIso(ato.data_hora).getTime() <= parseIso(p.prazo_limite).getTime(),
          faltou: p.estado === "FALTOU" || ato.estado === "FALTOU",
          estadio: doDoente.get(p.doente_id)?.estadio_cuidado ?? "",
        });
      }
      return r;
    }
    const percent = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
    function resumo(pedidos: Pedido[]) {
      const a = amostrasDe(pedidos);
      return {
        pedidos: pedidos.length,
        marcados: a.length,
        medianaDias: mediana(a.map((x) => x.dias)),
        percentDentroPrazo: percent(a.filter((x) => x.dentroPrazo).length, a.length),
        taxaFaltas: percent(a.filter((x) => x.faltou).length, a.length),
        remarcados: pedidos.filter((p) => p.n_remarcacoes > 0).length,
      };
    }

    const doPeriodo = base.filter((p) => criado(p) >= inicio.getTime() && criado(p) <= hoje.getTime());
    const anterior = inicioAnterior ? base.filter((p) => criado(p) >= inicioAnterior.getTime() && criado(p) < inicio.getTime()) : [];
    const amostras = amostrasDe(doPeriodo);

    // Evolução: por dia na última semana, por semana nos outros períodos.
    const passo = nDias === 7 ? 1 : 7;
    const serie: { rotulo: string; pedidos: number; marcados: number; percentDentroPrazo: number | null; medianaDias: number | null }[] = [];
    for (let t = new Date(inicio); t.getTime() <= hoje.getTime(); t = somarDias(t, passo)) {
      const fim = somarDias(t, passo);
      const fatia = doPeriodo.filter((p) => criado(p) >= t.getTime() && criado(p) < fim.getTime());
      const r = resumo(fatia);
      serie.push({ rotulo: formatarDataPt(t).slice(0, 5), pedidos: r.pedidos, marcados: r.marcados, percentDentroPrazo: r.percentDentroPrazo, medianaDias: r.medianaDias });
    }

    const porEstadio = ["NOVO", "PRE_TRATAMENTO", "EM_TRATAMENTO", "FOLLOW_UP"].map((chave) => ({
      chave,
      legivel: descreverEstadioCuidado(chave),
      ...resumo(doPeriodo.filter((p) => (doDoente.get(p.doente_id)?.estadio_cuidado ?? "") === chave)),
    }));
    const porNivel = (["MP", "P", "N"] as const).map((chave) => ({
      chave,
      legivel: descreverPrioridade(chave),
      ...resumo(doPeriodo.filter((p) => p.prioridade === chave)),
    }));
    const faixas = [
      { rotulo: "0–3 dias", min: 0, max: 3 },
      { rotulo: "4–7", min: 4, max: 7 },
      { rotulo: "8–14", min: 8, max: 14 },
      { rotulo: "15–30", min: 15, max: 30 },
      { rotulo: "> 30", min: 31, max: Infinity },
    ].map((f) => ({ rotulo: f.rotulo, n: amostras.filter((a) => a.dias >= f.min && a.dias <= f.max).length }));

    const maisLentos = [...amostras]
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 8)
      .map((a) => ({
        pedido_id: a.pedido.pedido_id,
        doente_id: a.pedido.doente_id,
        doente_nome: descreverDoente(a.pedido.doente_id),
        descricao: descreverPedido(a.pedido),
        prioridade: a.pedido.prioridade,
        dias: a.dias,
        dentro_prazo: a.dentroPrazo,
        estadio_cuidado_legivel: descreverEstadioCuidado(a.estadio),
      }));

    res.json({
      especialidade_legivel: descreverEspecialidade(especialidade),
      periodo,
      desde: isoData(inicio),
      geral: resumo(doPeriodo),
      anterior: inicioAnterior ? resumo(anterior) : null,
      pendentesAgora: base.filter((p) => ["ACEITE", "SEM_VAGA", "EM_TRIAGEM", "FALTOU"].includes(p.estado)).length,
      serie,
      porEstadio,
      porNivel,
      faixas,
      maisLentos,
    });
  });

  return router;
}
