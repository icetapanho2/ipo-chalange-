// Formato comum devolvido pelos fornecedores de extracção (cache, e mais tarde LLM — Fase 4).
// Mesmo formato do pedido em dados/planos_teste.json (ver ESPECIFICACAO.md secção 6).
import type { Prioridade, TipoPedido } from "../types.ts";

export interface PedidoExtraido {
  /** Índice do pedido dentro da mesma resposta (só usado pela cache; o LLM usa a posição no array). */
  ref?: number;
  tipo_pedido: TipoPedido;
  /** Índices (a partir de 0) de outros pedidos desta mesma resposta de que este depende. */
  depende_de?: number[];
  especialidade_destino: string;
  ato_codigo: string;
  exames?: string[];
  analises?: string[];
  especificacao?: string;
  prioridade: Prioridade | null;
  prazo_dias?: number | null;
  nao_antes_dias?: number | null;
  medico_preferido?: string | null;
  continuidade_obrigatoria?: boolean;
  recorrencia?: string | null;
  confianca: number;
  texto_origem: string;
  /** Quando o pedido só existe por já estar no dicionário do médico: "DICIONARIO:<medicoId>:<termo>". */
  origem_regra?: string;
}

export interface AlertaExtraido {
  tipo: "TERMO_DESCONHECIDO" | string;
  texto_origem: string;
  mensagem: string;
}

export interface CorrecaoEsperada {
  termo: string;
  significado: string;
  mapeia_para: string;
  ambito: string;
  pedido: {
    tipo_pedido: TipoPedido;
    especialidade_destino: string;
    ato_codigo: string;
    exames?: string[];
    recorrencia?: string;
  };
}

export interface EntradaCacheExtracao {
  texto_plano: string;
  pedidos: PedidoExtraido[];
  alertas: AlertaExtraido[];
  correcao_esperada?: CorrecaoEsperada;
}

/**
 * JSON schema da saída estruturada, igual para todos os fornecedores de LLM (secção 6 do
 * CLAUDE.md). Mesma forma do pedido em dados/planos_teste.json.
 */
export function schemaExtracao(): Record<string, unknown> {
  const pedidoSchema = {
    type: "object",
    properties: {
      tipo_pedido: {
        type: "string",
        enum: ["consulta", "pedido_consulta", "pedido_hd", "exame", "analises", "tratamento"],
      },
      especialidade_destino: { type: "string", description: "código de especialidades.csv" },
      ato_codigo: { type: "string", description: "código de catalogo_atos.csv, dentro da especialidade indicada" },
      exames: { type: "array", items: { type: "string" }, description: "códigos de exames.csv" },
      analises: { type: "array", items: { type: "string" }, description: "códigos de analises.csv" },
      especificacao: { type: "string" },
      prioridade: { type: ["string", "null"], enum: ["MP", "P", "N", null] },
      prazo_dias: { type: ["number", "null"] },
      nao_antes_dias: { type: ["number", "null"] },
      medico_preferido: { type: ["string", "null"], description: "'REQUISITANTE' ou id de utilizador" },
      continuidade_obrigatoria: { type: "boolean" },
      recorrencia: { type: ["string", "null"] },
      depende_de: { type: "array", items: { type: "number" }, description: "índices de outros pedidos desta mesma resposta" },
      confianca: { type: "number", minimum: 0, maximum: 1 },
      texto_origem: { type: "string", description: "excerto do texto que originou este pedido" },
    },
    required: ["tipo_pedido", "especialidade_destino", "ato_codigo", "confianca", "texto_origem"],
  };
  const alertaSchema = {
    type: "object",
    properties: {
      tipo: { type: "string" },
      texto_origem: { type: "string" },
      mensagem: { type: "string" },
    },
    required: ["tipo", "texto_origem", "mensagem"],
  };
  return {
    type: "object",
    properties: {
      pedidos: { type: "array", items: pedidoSchema },
      alertas: { type: "array", items: alertaSchema },
    },
    required: ["pedidos", "alertas"],
  };
}
