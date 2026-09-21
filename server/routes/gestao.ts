import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { parseIso } from "../util.ts";
import { descreverEspecialidade, descreverPrioridade, descreverTipoPedido } from "../apresentacao.ts";
import type { Pedido } from "../types.ts";

function minutosEntre(a: string, b: string): number | null {
  if (!a || !b) return null;
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 60000);
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}

function semanaIso(dataIso: string): string {
  const d = parseIso(dataIso);
  const alvo = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diaSemana = (alvo.getDay() + 6) % 7; // segunda = 0
  alvo.setDate(alvo.getDate() - diaSemana + 3); // quinta da mesma semana
  const primeiraQuinta = new Date(alvo.getFullYear(), 0, 4);
  const semana = 1 + Math.round(((alvo.getTime() - primeiraQuinta.getTime()) / 86400000 - 3 + ((primeiraQuinta.getDay() + 6) % 7)) / 7);
  return `${alvo.getFullYear()}-S${String(semana).padStart(2, "0")}`;
}

export function criarRotasGestao(store: typeof StoreType) {
  const router = Router();

  router.get("/especialidades", (_req, res) => {
    res.json(store.especialidades);
  });

  router.get("/metricas", (req, res) => {
    const filtroEsp = String(req.query.especialidade ?? "");
    const pedidos = filtroEsp ? store.pedidos.filter((p) => p.especialidade_destino === filtroEsp) : store.pedidos;

    // Tempos
    const temposConsultaPedido = pedidos.map((p) => minutosEntre(p.criado_em, p.validado_em)).filter((v): v is number => v !== null);
    const temposPedidoMarcacao = pedidos
      .map((p) => minutosEntre(p.triado_em || p.validado_em, p.marcado_em))
      .filter((v): v is number => v !== null);

    // % dentro do prazo (para pedidos já concluídos com marcação)
    function dentroDoPrazo(p: Pedido): boolean | null {
      if (!p.ato_id) return null;
      const ato = store.atosMedicos.find((a) => a.mvp_ato_id === p.ato_id);
      if (!ato) return null;
      return parseIso(ato.data_hora).getTime() <= parseIso(p.prazo_limite).getTime();
    }
    function percentPorGrupo<T extends string>(chave: (p: Pedido) => T): Record<T, { total: number; dentroPrazo: number; percent: number }> {
      const grupos = {} as Record<T, { total: number; dentroPrazo: number; percent: number }>;
      for (const p of pedidos) {
        const ok = dentroDoPrazo(p);
        if (ok === null) continue;
        const k = chave(p);
        if (!grupos[k]) grupos[k] = { total: 0, dentroPrazo: 0, percent: 0 };
        grupos[k].total++;
        if (ok) grupos[k].dentroPrazo++;
      }
      for (const k of Object.keys(grupos) as T[]) {
        grupos[k].percent = Math.round((grupos[k].dentroPrazo / grupos[k].total) * 100);
      }
      return grupos;
    }
    const prazoPorNivel = percentPorGrupo((p) => p.prioridade);
    const prazoPorTipo = percentPorGrupo((p) => p.tipo_pedido);
    const prazoPorServico = percentPorGrupo((p) => p.especialidade_destino);

    // Pendentes por serviço e antiguidade
    const ESTADOS_PENDENTES: Pedido["estado"][] = ["EM_TRIAGEM", "ACEITE", "SEM_VAGA"];
    const pendentesPorServico = new Map<string, { total: number; antiguidadeMediaDias: number }>();
    for (const esp of new Set(pedidos.map((p) => p.especialidade_destino))) {
      const doServico = pedidos.filter((p) => p.especialidade_destino === esp && ESTADOS_PENDENTES.includes(p.estado));
      if (doServico.length === 0) continue;
      const agoraMs = agora().getTime();
      const dias = doServico.map((p) => (agoraMs - parseIso(p.criado_em).getTime()) / 86400000);
      pendentesPorServico.set(esp, { total: doServico.length, antiguidadeMediaDias: Math.round(media(dias) ?? 0) });
    }

    // Remarcações por motivo
    const eventosRemarcacao = store.eventos.filter(
      (e) => e.tipo === "REMARCACAO" && (!filtroEsp || store.pedidos.find((p) => p.pedido_id === e.pedido_id)?.especialidade_destino === filtroEsp),
    );
    const remarcacoesPorMotivo = new Map<string, number>();
    for (const e of eventosRemarcacao) {
      const motivo = e.motivo || "Sem motivo registado";
      remarcacoesPorMotivo.set(motivo, (remarcacoesPorMotivo.get(motivo) ?? 0) + 1);
    }

    // Consultas em risco detectadas / resolvidas
    const alertasVermelho = store.alertas.filter(
      (a) => a.tipo === "SEMAFORO_VERMELHO" && (!filtroEsp || a.especialidade === filtroEsp),
    );

    // Taxa de aprovação directa por semana
    const semanas = new Map<string, { total: number; directos: number }>();
    for (const p of pedidos) {
      if (!p.validado_em) continue;
      const semana = semanaIso(p.validado_em);
      if (!semanas.has(semana)) semanas.set(semana, { total: 0, directos: 0 });
      const s = semanas.get(semana)!;
      s.total++;
      if (p.aprovado_direto) s.directos++;
    }
    const curvaAprovacaoDirecta = [...semanas.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([semana, v]) => ({ semana, percent: Math.round((v.directos / v.total) * 100), total: v.total }));

    // Triagem: aceites / recusados / reencaminhados. Identificado pela transição
    // (EM_TRIAGEM -> X), não pelo campo "tipo" do evento — os dados históricos (gerar_dados.py)
    // e o motor ao vivo (server/motor/fluxo.ts) usam tipos ligeiramente diferentes para a
    // mesma decisão, mas a transição de estado é sempre a mesma.
    const eventosTriagemDecisao = store.eventos.filter(
      (e) =>
        e.estado_anterior === "EM_TRIAGEM" &&
        (e.estado_novo === "ACEITE" || e.estado_novo === "RECUSADO" || e.estado_novo === "REENCAMINHADO") &&
        (!filtroEsp || store.pedidos.find((p) => p.pedido_id === e.pedido_id)?.especialidade_destino === filtroEsp),
    );
    const triagem = {
      aceites: eventosTriagemDecisao.filter((e) => e.estado_novo === "ACEITE").length,
      recusados: eventosTriagemDecisao.filter((e) => e.estado_novo === "RECUSADO").length,
      reencaminhados: eventosTriagemDecisao.filter((e) => e.estado_novo === "REENCAMINHADO").length,
    };

    // Impacto estimado (parametros.csv) — hospital inteiro, não filtrado
    const { cromos_dia, copias_por_cromo, minutos_admin_por_cromo, dias_uteis_mes } = store.parametros;
    const impactoEstimado = {
      cromosMes: cromos_dia * dias_uteis_mes,
      folhasMes: cromos_dia * dias_uteis_mes * copias_por_cromo,
      horasAdminDia: Math.round(((cromos_dia * minutos_admin_por_cromo) / 60) * 10) / 10,
    };

    res.json({
      filtroEspecialidade: filtroEsp,
      tempos: {
        consultaParaPedidoMin: media(temposConsultaPedido),
        pedidoParaMarcacaoMin: media(temposPedidoMarcacao),
      },
      prazoPorNivel: Object.entries(prazoPorNivel).map(([k, v]) => ({ chave: k, legivel: descreverPrioridade(k as Pedido["prioridade"]), ...v })),
      prazoPorTipo: Object.entries(prazoPorTipo).map(([k, v]) => ({ chave: k, legivel: descreverTipoPedido(k as Pedido["tipo_pedido"]), ...v })),
      prazoPorServico: Object.entries(prazoPorServico).map(([k, v]) => ({ chave: k, legivel: descreverEspecialidade(k), ...v })),
      pendentesPorServico: [...pendentesPorServico.entries()].map(([k, v]) => ({ chave: k, legivel: descreverEspecialidade(k), ...v })),
      remarcacoesPorMotivo: [...remarcacoesPorMotivo.entries()].map(([motivo, total]) => ({ motivo, total })),
      consultasEmRisco: {
        detectadas: alertasVermelho.length,
        resolvidas: alertasVermelho.filter((a) => a.estado === "RESOLVIDO").length,
      },
      curvaAprovacaoDirecta,
      triagem,
      impactoEstimado,
    });
  });

  return router;
}
