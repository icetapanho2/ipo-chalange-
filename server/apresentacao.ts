// Texto legível para o utilizador a partir de códigos (secção "Regras para todas as fases"
// ponto 5 de PROMPTS.md: nunca mostrar códigos, ex. "TC Tórax, Abdominal e Pélvica", não "7000002").
import { store } from "./store.ts";
import type { Pedido } from "./types.ts";

export function descreverEspecialidade(codigo: string): string {
  return store.especialidades.find((e) => e.codigo === codigo)?.descricao ?? codigo;
}

export function descreverAto(especialidadeCodigo: string, atoCodigo: string): string {
  const catalogo = store.catalogoAtos.find(
    (c) => c.especialidade_codigo === especialidadeCodigo && c.ato_codigo === atoCodigo,
  );
  return catalogo?.ato_descricao ?? `${especialidadeCodigo}/${atoCodigo}`;
}

export function descreverExames(codigos: string[]): string {
  return codigos.map((c) => store.exames.find((e) => e.codigo_exame === c)?.descricao_exame ?? c).join(", ");
}

export function descreverAnalises(codigos: string[]): string {
  return codigos.map((c) => store.analises.find((a) => a.codigo === c)?.descricao ?? c).join(", ");
}

export function descreverUtilizador(id: string): string {
  if (!id) return "";
  if (id === "AGENTE") return "Agente";
  if (id === "SISTEMA") return "Sistema";
  return store.utilizadores.find((u) => u.utilizador_id === id)?.nome ?? id;
}

export function descreverDoente(id: string): string {
  return store.doentes.find((d) => d.doente_id === id)?.nome ?? id;
}

const NOME_ESTADIO_CUIDADO: Record<string, string> = {
  NOVO: "Novo",
  PRE_TRATAMENTO: "Diagnóstico",
  EM_TRATAMENTO: "Tratamento",
  FOLLOW_UP: "Follow-up",
};

export function descreverEstadioCuidado(estadio?: string): string {
  return (estadio && NOME_ESTADIO_CUIDADO[estadio]) || "Não classificado";
}

/** Frase legível de um pedido, sem códigos: acto + exames/análises + especificação. */
export function descreverPedido(pedido: Pick<Pedido, "especialidade_destino" | "ato_codigo" | "exames" | "analises" | "especificacao">): string {
  const base = descreverAto(pedido.especialidade_destino, pedido.ato_codigo);
  const partes: string[] = [];
  if (pedido.exames.length > 0) partes.push(descreverExames(pedido.exames));
  if (pedido.analises.length > 0) partes.push(descreverAnalises(pedido.analises));
  if (pedido.especificacao) partes.push(pedido.especificacao);
  return partes.length > 0 ? `${base} — ${partes.join("; ")}` : base;
}

const NOME_TIPO_PEDIDO: Record<Pedido["tipo_pedido"], string> = {
  consulta: "Consulta de revisão",
  pedido_consulta: "Pedido de consulta",
  pedido_hd: "Pedido de Hospital de Dia",
  exame: "Exame",
  analises: "Análises",
  tratamento: "Tratamento",
};

export function descreverTipoPedido(tipo: Pedido["tipo_pedido"]): string {
  return NOME_TIPO_PEDIDO[tipo] ?? tipo;
}

const NOME_PRIORIDADE: Record<Pedido["prioridade"], string> = {
  MP: "Muito prioritário",
  P: "Prioritário",
  N: "Normal",
};

export function descreverPrioridade(prioridade: Pedido["prioridade"]): string {
  return NOME_PRIORIDADE[prioridade] ?? prioridade;
}

const NOME_ESTADO: Record<Pedido["estado"], string> = {
  EXTRAIDO: "Extraído",
  VALIDADO: "Validado",
  EM_TRIAGEM: "Em triagem",
  ACEITE: "Aceite",
  MARCADO: "Marcado",
  REALIZADO: "Realizado",
  DEVOLVIDO: "Devolvido ao médico",
  RECUSADO: "Recusado",
  REENCAMINHADO: "Reencaminhado",
  SEM_VAGA: "Sem vaga",
  FALTOU: "Faltou",
  CANCELADO: "Cancelado",
};

export function descreverEstado(estado: Pedido["estado"]): string {
  return NOME_ESTADO[estado] ?? estado;
}

export function pedidoParaJson(p: Pedido, limiarConfianca = 0.8) {
  return {
    pedido_id: p.pedido_id,
    tipo_pedido: p.tipo_pedido,
    tipo_pedido_legivel: descreverTipoPedido(p.tipo_pedido),
    especialidade_destino: p.especialidade_destino,
    especialidade_destino_legivel: descreverEspecialidade(p.especialidade_destino),
    ato_codigo: p.ato_codigo,
    exames: p.exames,
    analises: p.analises,
    especificacao: p.especificacao,
    descricao: descreverPedido(p),
    prioridade: p.prioridade,
    prioridade_legivel: descreverPrioridade(p.prioridade),
    prioridade_por_defeito: !!p.prioridade_por_defeito,
    prazo_limite: p.prazo_limite,
    nao_antes: p.nao_antes,
    confianca: p.confianca,
    baixa_confianca: p.confianca < limiarConfianca,
    texto_origem: p.texto_origem,
    origem_dicionario: !!p.origem_dicionario,
    estado: p.estado,
    estado_legivel: descreverEstado(p.estado),
    fluxo: p.fluxo,
  };
}
