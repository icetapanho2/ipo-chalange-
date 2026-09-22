import { store } from "../store.ts";
import { agora } from "../clock.ts";
import { apenasData, diferencaDias, isoDataHora, parseIso } from "../util.ts";
import { calcularSemaforo } from "./semaforo.ts";
import { recalcularIndices } from "./indice.ts";
import type { Alerta, Pedido, TipoAlerta } from "../types.ts";

/** Tipos geridos automaticamente por `recalcularAlertas` (recalculados do zero a cada chamada). */
const TIPOS_AUTOMATICOS: TipoAlerta[] = [
  "TRIAGEM_PARADA",
  "SEM_VAGA",
  "PROPOSTA_TROCA",
  "SEMAFORO_VERMELHO",
  "FALTA_DEPENDENCIA",
  "REMARCACOES_EXCESSIVAS",
  "PRAZO_ULTRAPASSADO",
];

export function criarAlerta(
  campos: Pick<Alerta, "tipo" | "gravidade" | "especialidade" | "pedido_id" | "doente_id" | "descricao">,
  quando: Date = agora(),
): Alerta {
  const alerta: Alerta = {
    alerta_id: store.proximoId("alerta"),
    criado_em: isoDataHora(quando),
    estado: "ABERTO",
    resolvido_por: "",
    resolvido_em: "",
    accao: "",
    ...campos,
  };
  store.alertas.push(alerta);
  return alerta;
}

export function resolverAlerta(alertaId: string, utilizadorId: string, accao: string, quando: Date = agora()): void {
  const alerta = store.alertas.find((a) => a.alerta_id === alertaId);
  if (!alerta || alerta.estado !== "ABERTO") return;
  alerta.estado = "RESOLVIDO";
  alerta.resolvido_por = utilizadorId;
  alerta.resolvido_em = isoDataHora(quando);
  alerta.accao = accao;
}

/**
 * Recalcula os alertas automáticos (secção 12) a partir do estado actual de pedidos/eventos.
 * Corre no arranque e depois de cada acção (Regra de ouro), para que os dashboards mostrem
 * sempre os casos em aberto. Alertas de outros tipos (ex.: TERMO_DESCONHECIDO, criados pela
 * extracção) e os já RESOLVIDOS não são tocados.
 */
export function recalcularAlertas(quando: Date = agora()): void {
  // O índice de prioridade de cada pedido é guardado e refrescado aqui (arranque + depois de cada acção).
  recalcularIndices(quando);
  store.alertas = store.alertas.filter((a) => !(TIPOS_AUTOMATICOS.includes(a.tipo) && a.estado === "ABERTO"));

  // Um alerta automático que a administrativa já marcou como visto não volta a abrir para o mesmo pedido.
  const vistos = new Set(store.alertas.filter((a) => a.estado === "RESOLVIDO").map((a) => `${a.tipo}:${a.pedido_id}`));
  const criarAlerta: typeof criarAlertaBase = (campos, q) =>
    vistos.has(`${campos.tipo}:${campos.pedido_id}`) ? (campos as Alerta) : criarAlertaBase(campos, q);

  const hoje = apenasData(quando);
  const horizonte = store.parametros.semaforo_horizonte_dias;
  const diasTriagemParada = store.parametros.alerta_triagem_parada_dias;
  const limiteRemarcacoes = store.parametros.alerta_remarcacoes;

  for (const pedido of store.pedidos) {
    // Triagem parada há mais de N dias úteis
    if (pedido.estado === "EM_TRIAGEM") {
      const desde = eventoMaisRecente(pedido.pedido_id, "ENVIO") ?? eventoMaisRecente(pedido.pedido_id, "TRIAGEM");
      if (desde && diferencaDias(hoje, apenasData(parseIso(desde))) >= diasTriagemParada) {
        criarAlerta(
          {
            tipo: "TRIAGEM_PARADA",
            gravidade: "media",
            especialidade: pedido.especialidade_destino,
            pedido_id: pedido.pedido_id,
            doente_id: pedido.doente_id,
            descricao: `Pedido em triagem há mais de ${diasTriagemParada} dias úteis.`,
          },
          quando,
        );
      }
    }

    // Sem vaga dentro do prazo
    if (pedido.estado === "SEM_VAGA") {
      criarAlerta(
        {
          tipo: "SEM_VAGA",
          gravidade: "alta",
          especialidade: pedido.especialidade_destino,
          pedido_id: pedido.pedido_id,
          doente_id: pedido.doente_id,
          descricao: "Sem vaga disponível dentro do prazo. Avaliar vaga extra, capacidade externa ou decisão humana.",
        },
        quando,
      );
    }

    // Prazo ultrapassado (para gestão)
    if (
      pedido.estado !== "REALIZADO" &&
      pedido.estado !== "RECUSADO" &&
      pedido.estado !== "CANCELADO" &&
      pedido.prazo_limite &&
      apenasData(parseIso(pedido.prazo_limite)).getTime() < hoje.getTime()
    ) {
      criarAlerta(
        {
          tipo: "PRAZO_ULTRAPASSADO",
          gravidade: "alta",
          especialidade: pedido.especialidade_destino,
          pedido_id: pedido.pedido_id,
          doente_id: pedido.doente_id,
          descricao: `Prazo (${pedido.prazo_limite}) ultrapassado sem o pedido estar concluído.`,
        },
        quando,
      );
    }

    // Remarcações a mais para o mesmo doente
    if (pedido.n_remarcacoes >= limiteRemarcacoes) {
      criarAlerta(
        {
          tipo: "REMARCACOES_EXCESSIVAS",
          gravidade: "media",
          especialidade: pedido.especialidade_destino,
          pedido_id: pedido.pedido_id,
          doente_id: pedido.doente_id,
          descricao: `${pedido.n_remarcacoes} remarcações para este pedido.`,
        },
        quando,
      );
    }

    // Semáforo vermelho
    const semaforo = calcularSemaforo(pedido, hoje, horizonte);
    if (semaforo?.cor === "vermelho") {
      criarAlerta(
        {
          tipo: "SEMAFORO_VERMELHO",
          gravidade: "alta",
          especialidade: pedido.especialidade_destino,
          pedido_id: pedido.pedido_id,
          doente_id: pedido.doente_id,
          descricao: semaforo.porque,
        },
        quando,
      );
    }

    // Falta a um exame que é dependência de outro pedido
    if (pedido.estado === "FALTOU") {
      const dependentes = store.dependencias.filter((d) => d.depende_de_pedido_id === pedido.pedido_id);
      for (const dep of dependentes) {
        const dependente = store.pedidos.find((p) => p.pedido_id === dep.pedido_id);
        if (!dependente) continue;
        criarAlerta(
          {
            tipo: "FALTA_DEPENDENCIA",
            gravidade: "alta",
            especialidade: dependente.especialidade_destino,
            pedido_id: dependente.pedido_id,
            doente_id: pedido.doente_id,
            descricao: `Faltou a ${descricaoPedido(pedido)}, do qual este pedido depende.`,
          },
          quando,
        );
      }
    }
  }

  // Propostas de troca pendentes
  for (const proposta of store.propostasTroca) {
    if (proposta.estado !== "PENDENTE") continue;
    criarAlerta(
      {
        tipo: "PROPOSTA_TROCA",
        gravidade: "media",
        especialidade: proposta.especialidade,
        pedido_id: proposta.pedido_urgente,
        doente_id: store.pedidos.find((p) => p.pedido_id === proposta.pedido_urgente)?.doente_id ?? "",
        descricao: proposta.justificacao,
      },
      quando,
    );
  }
}

function eventoMaisRecente(pedidoId: string, tipo: string): string | null {
  const eventos = store.eventos.filter((e) => e.pedido_id === pedidoId && e.tipo === tipo);
  if (eventos.length === 0) return null;
  return eventos.reduce((a, b) => (b.data_hora > a.data_hora ? b : a)).data_hora;
}

function descricaoPedido(p: Pedido): string {
  const catalogo = store.catalogoAtos.find(
    (c) => c.especialidade_codigo === p.especialidade_destino && c.ato_codigo === p.ato_codigo,
  );
  return catalogo?.ato_descricao ?? p.tipo_pedido;
}

const criarAlertaBase = criarAlerta;
