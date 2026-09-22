import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { apenasData, parseIso, somarDias } from "../util.ts";
import { avaliarCandidatosTroca, janelaAgendamento } from "../motor/agendamento.ts";
import { avaliarFactos, pesosCusto, type PesosCusto, type SobreposicaoFactos } from "../motor/remarcacao.ts";
import { listaChamadas } from "../motor/chamadas.ts";
import { descreverDoente, descreverEspecialidade, descreverPedido } from "../apresentacao.ts";
import type { CandidatoTroca, FactosCandidato } from "../types.ts";

/** O pedido de TC do José (cenário 2 da demo): o cenário por omissão do Laboratório de prioridades. */
const PEDIDO_CENARIO_JOSE = "P00007";
const MOTIVO_DO_DOENTE = /doente|falta/i;

export function criarRotasPrioridades(store: typeof StoreType) {
  const router = Router();

  /**
   * Factos do cenário: se já houve proposta de troca para o pedido, usa o retrato guardado nesse
   * momento (auditável, e não muda depois de a troca ser aprovada); senão avalia ao vivo sem
   * alterar nada (ex.: o TC do José antes de a administrativa o validar).
   */
  function factosDoCenario(pedidoId: string): { factos: FactosCandidato[]; origem: string } | null {
    const proposta = [...store.propostasTroca].reverse().find((p) => p.pedido_urgente === pedidoId && p.avaliacao);
    if (proposta) return { factos: proposta.avaliacao!, origem: `Proposta ${proposta.proposta_id} (${proposta.estado.toLowerCase()})` };
    const pedido = store.pedidos.find((p) => p.pedido_id === pedidoId);
    if (!pedido || !["EXTRAIDO", "VALIDADO", "ACEITE", "SEM_VAGA"].includes(pedido.estado)) return null;
    const quando = agora();
    const { inicio, fim } = janelaAgendamento(pedido, apenasData(quando));
    return { factos: avaliarCandidatosTroca(pedido, inicio, fim, quando), origem: "Avaliação ao vivo (ainda sem proposta)" };
  }

  router.get("/cenarios", (_req, res) => {
    const cenarios: { pedido_id: string; titulo: string; estado: string }[] = store.propostasTroca.map((p) => {
      const pedido = store.pedidos.find((x) => x.pedido_id === p.pedido_urgente);
      return {
        pedido_id: p.pedido_urgente,
        titulo: `${descreverDoente(pedido?.doente_id ?? "")} — ${pedido ? descreverPedido(pedido) : ""}`,
        estado: p.estado,
      };
    });
    if (!cenarios.some((c) => c.pedido_id === PEDIDO_CENARIO_JOSE)) {
      const jose = store.pedidos.find((p) => p.pedido_id === PEDIDO_CENARIO_JOSE);
      if (jose) cenarios.unshift({ pedido_id: jose.pedido_id, titulo: `${descreverDoente(jose.doente_id)} — ${descreverPedido(jose)}`, estado: "AO VIVO" });
    }
    res.json({ cenarios, pesos: pesosCusto() });
  });

  /** Laboratório: recalcula a escolha com atributos/pesos alterados. NUNCA altera o estado. */
  router.post("/simular", (req, res) => {
    const pedidoId: string = req.body?.pedidoId || PEDIDO_CENARIO_JOSE;
    const cenario = factosDoCenario(pedidoId);
    if (!cenario) {
      res.status(404).json({ erro: "Este pedido não tem cenário de troca para simular." });
      return;
    }
    const sobreposicoes = (req.body?.sobreposicoes ?? {}) as Record<string, SobreposicaoFactos>;
    const pesos = (req.body?.pesos ?? {}) as Partial<PesosCusto>;
    const original = avaliarFactos(cenario.factos);
    const simulado = avaliarFactos(cenario.factos, { sobreposicoes, pesos });
    const nome = (lista: CandidatoTroca[], campo: "escolhido" | "escolhido_regra_antiga") => lista.find((c) => c[campo])?.doente_nome ?? "";
    res.json({
      origem: cenario.origem,
      pesos: pesosCusto(pesos),
      candidatos: simulado,
      escolhido: nome(simulado, "escolhido"),
      escolhido_original: nome(original, "escolhido"),
      escolhido_regra_antiga: nome(simulado, "escolhido_regra_antiga"),
    });
  });

  /**
   * Impacto (dashboard de gestão e guião): o que as regras fizeram nesta sessão, a linha de base
   * dos 60 dias de histórico (antes das regras) e uma projecção mensal com pressupostos explícitos.
   */
  router.get("/impacto", (_req, res) => {
    const quando = agora();
    const hoje = apenasData(quando);
    const inicioHist = somarDias(hoje, -60);
    const pedidoDoente = new Map(store.pedidos.map((p) => [p.pedido_id, p.doente_id]));
    const dentro = (iso: string, de: Date, ate: Date) => {
      const t = parseIso(iso).getTime();
      return t >= de.getTime() && t < ate.getTime();
    };

    // --- linha de base: 60 dias de histórico, antes das regras
    const remHist = store.eventos.filter((e) => e.tipo === "REMARCACAO" && !MOTIVO_DO_DOENTE.test(e.motivo) && dentro(e.data_hora, inicioHist, hoje));
    const remPorDoente = new Map<string, number>();
    for (const e of remHist) {
      const d = pedidoDoente.get(e.pedido_id);
      if (d) remPorDoente.set(d, (remPorDoente.get(d) ?? 0) + 1);
    }
    const atosHist = store.atosMedicos.filter((a) => dentro(a.data_hora, inicioHist, hoje) && (a.estado === "REALIZADA" || a.estado === "FALTOU"));
    const faltasHist = atosHist.filter((a) => a.estado === "FALTOU");
    const faltasTacHist = faltasHist.filter((a) => a.especialidade_codigo === "7000_2");

    // --- esta sessão (desde hoje)
    const eventosHoje = store.eventos.filter((e) => parseIso(e.data_hora).getTime() >= hoje.getTime());
    const propostas = store.propostasTroca.filter((p) => p.avaliacao);
    const aprovadas = propostas.filter((p) => p.estado === "APROVADA");
    const vulneraveisProtegidos = new Set<string>();
    for (const p of propostas) {
      for (const c of p.avaliacao!) {
        if (c.escolhido) continue;
        const excluidoPorRegra = c.excluido && /remarcad|tratamento/.test(c.motivo_exclusao);
        if (excluidoPorRegra || c.escolhido_regra_antiga) vulneraveisProtegidos.add(c.doente_id);
      }
    }
    const trocasDiferentesDaRegraAntiga = propostas.filter((p) => {
      const escolhido = p.avaliacao!.find((c) => c.escolhido);
      const antigo = p.avaliacao!.find((c) => c.escolhido_regra_antiga);
      return escolhido && antigo && escolhido.doente_id !== antigo.doente_id;
    }).length;

    const libertadas = store.vagasLibertadas;
    const antecipacoes = eventosHoje.filter((e) => e.tipo === "ANTECIPACAO");
    const diasGanhos = antecipacoes.reduce((s, e) => s + Number(e.motivo.match(/ganha (\d+) dias/)?.[1] ?? 0), 0);
    const passaramADentroDoPrazo = antecipacoes.filter((e) => e.motivo.includes("dentro do prazo")).length;
    const ofertasPendentes = store.ofertasAntecipacao.filter((o) => o.estado === "PENDENTE").length;

    const diasUnicos = eventosHoje.filter((e) => e.tipo === "MARCACAO" && e.motivo.startsWith("Dia único"));
    const kmPoupados = diasUnicos.reduce((s, e) => {
      const d = store.doentes.find((x) => x.doente_id === pedidoDoente.get(e.pedido_id));
      return s + 2 * (d?.distancia_km ?? 0);
    }, 0);

    const chamadas = listaChamadas(undefined, quando);
    const limiteHorizonte = somarDias(hoje, chamadas.horizonteDias + 1).getTime();
    const chamadasNoHorizonte = chamadas.itens.filter((i) => parseIso(i.data_hora).getTime() < limiteHorizonte).length;
    const remAgora = new Map<string, number>();
    for (const e of store.eventos) {
      if (e.tipo !== "REMARCACAO" || MOTIVO_DO_DOENTE.test(e.motivo) || parseIso(e.data_hora).getTime() < hoje.getTime()) continue;
      const d = pedidoDoente.get(e.pedido_id);
      if (d) remAgora.set(d, (remAgora.get(d) ?? 0) + 1);
    }

    // --- projecção mensal (estimativa; pressupostos em parametros.csv)
    const p = store.parametros;
    const faltasTacMes = Math.round(faltasTacHist.length / 2);
    const faltasTacEvitadasMes = Math.round(faltasTacMes * p.reducao_faltas_lembrete);
    const faltasMes = Math.round(faltasHist.length / 2);
    const segundasRemarcacoesMes = Math.round([...remPorDoente.values()].filter((n) => n >= 2).length / 2);

    res.json({
      etiqueta: "Dados simulados",
      linhaDeBase: {
        periodo_dias: 60,
        remarcacoes_hospital: remHist.length,
        doentes_remarcados_2_ou_mais: [...remPorDoente.values()].filter((n) => n >= 2).length,
        marcacoes: atosHist.length,
        faltas: faltasHist.length,
        taxa_faltas: atosHist.length ? Math.round((faltasHist.length / atosHist.length) * 1000) / 10 : 0,
        faltas_tac: faltasTacHist.length,
      },
      sessao: {
        propostas_troca: propostas.length,
        trocas_aprovadas: aprovadas.length,
        trocas_diferentes_da_regra_antiga: trocasDiferentesDaRegraAntiga,
        doentes_vulneraveis_protegidos: vulneraveisProtegidos.size,
        doentes_remarcados_2_vezes: [...remAgora.values()].filter((n) => n >= 2).length,
        vagas_libertadas: libertadas.length,
        vagas_reaproveitadas: store.ofertasAntecipacao.filter((o) => o.estado === "ACEITE").length,
        ofertas_pendentes: ofertasPendentes,
        dias_ganhos: diasGanhos,
        doentes_que_passaram_a_dentro_do_prazo: passaramADentroDoPrazo,
        deslocacoes_evitadas: diasUnicos.length,
        km_poupados: kmPoupados,
        comunicacoes_enviadas: store.comunicacoesDoente.filter((c) => c.estado === "ENVIADA").length,
        lembretes_agendados: store.comunicacoesDoente.filter((c) => c.estado === "AGENDADA").length,
        chamadas_a_fazer: chamadas.itens.length,
        chamadas_no_horizonte: chamadasNoHorizonte,
        marcacoes_no_horizonte: chamadas.marcacoesNoHorizonte,
        chamadas_registadas: store.chamadas.length,
      },
      projecaoMensal: {
        faltas_mes: faltasMes,
        faltas_tac_mes: faltasTacMes,
        faltas_tac_evitadas_mes: faltasTacEvitadasMes,
        valor_recuperado_mes_eur: faltasTacEvitadasMes * p.custo_medio_vaga_tac,
        segundas_remarcacoes_evitadas_mes: segundasRemarcacoesMes,
        percentagem_marcacoes_a_ligar: chamadas.marcacoesNoHorizonte
          ? Math.round((chamadasNoHorizonte / chamadas.marcacoesNoHorizonte) * 100)
          : 0,
        pressupostos: [
          `Lembrete a D-3 + chamada dirigida evitam ${Math.round(p.reducao_faltas_lembrete * 100)}% das faltas (parâmetro reducao_faltas_lembrete, a validar)`,
          `Valor de uma vaga de TAC: ${p.custo_medio_vaga_tac} € (parâmetro custo_medio_vaga_tac, a validar)`,
          "Faltas e remarcações por mês = histórico de 60 dias ÷ 2",
        ],
      },
      servicoTac: descreverEspecialidade("7000_2"),
    });
  });

  return router;
}
