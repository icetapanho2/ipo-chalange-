import { store } from "../store.ts";
import { apenasData, parseIso, somarDias } from "../util.ts";
import { dependenciasDe, dataConclusao, intervaloResultado } from "./dependencias.ts";
import type { Pedido } from "../types.ts";

export type CorSemaforo = "verde" | "amarelo" | "vermelho";

export interface EstadoSemaforo {
  cor: CorSemaforo;
  porque: string;
}

/**
 * Semáforo de uma marcação com dependências (secção 11). `null` se não se aplica
 * (pedido sem dependências, ou fora do horizonte, ou ainda não marcado).
 */
export function calcularSemaforo(pedido: Pedido, hoje: Date, horizonteDias: number): EstadoSemaforo | null {
  if (pedido.estado !== "MARCADO" || !pedido.ato_id) return null;
  const deps = dependenciasDe(pedido);
  if (deps.length === 0) return null;

  const atoConsulta = store.atosMedicos.find((a) => a.mvp_ato_id === pedido.ato_id);
  if (!atoConsulta) return null;
  const dataConsulta = apenasData(parseIso(atoConsulta.data_hora));
  const diasAteConsulta = Math.round((dataConsulta.getTime() - hoje.getTime()) / (24 * 60 * 60 * 1000));
  if (diasAteConsulta < 0 || diasAteConsulta > horizonteDias) return null;

  let pior: EstadoSemaforo = { cor: "verde", porque: "Todas as dependências realizadas, resultado disponível a tempo." };

  for (const dep of deps) {
    const requisito = store.pedidos.find((p) => p.pedido_id === dep.depende_de_pedido_id);
    if (!requisito) continue;
    const nomeReq = descreverPedido(requisito);
    const estado = avaliarDependencia(requisito, dataConsulta, nomeReq);
    pior = piorCor(pior, estado);
  }
  return pior;
}

function piorCor(a: EstadoSemaforo, b: EstadoSemaforo): EstadoSemaforo {
  const ordem: Record<CorSemaforo, number> = { vermelho: 2, amarelo: 1, verde: 0 };
  return ordem[b.cor] > ordem[a.cor] ? b : a;
}

function avaliarDependencia(requisito: Pedido, dataConsulta: Date, nomeReq: string): EstadoSemaforo {
  if (requisito.estado === "FALTOU") {
    return { cor: "vermelho", porque: `${nomeReq}: doente faltou.` };
  }
  const dataReq = dataConclusao(requisito);
  if (!dataReq) {
    return { cor: "vermelho", porque: `${nomeReq}: ainda não está marcado.` };
  }
  if (apenasData(dataReq).getTime() >= dataConsulta.getTime()) {
    return { cor: "vermelho", porque: `${nomeReq}: marcado depois da consulta.` };
  }
  if (requisito.estado === "REALIZADO") {
    return { cor: "verde", porque: `${nomeReq}: realizado.` };
  }
  // MARCADO, antes da consulta: verifica se há tempo para o resultado
  const disponivelEm = somarDias(dataReq, intervaloResultado(requisito.especialidade_destino));
  if (disponivelEm.getTime() > dataConsulta.getTime()) {
    return { cor: "vermelho", porque: `${nomeReq}: marcado, mas sem tempo para o resultado antes da consulta.` };
  }
  return { cor: "amarelo", porque: `${nomeReq}: marcado, ainda por realizar, com tempo para o resultado.` };
}

function descreverPedido(p: Pedido): string {
  const catalogo = store.catalogoAtos.find(
    (c) => c.especialidade_codigo === p.especialidade_destino && c.ato_codigo === p.ato_codigo,
  );
  return catalogo?.ato_descricao ?? p.tipo_pedido;
}
