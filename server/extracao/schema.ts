// Formato comum devolvido pelos fornecedores de extracção (cache, e mais tarde LLM — Fase 4).
// Mesmo formato do pedido em dados/planos_teste.json (ver ESPECIFICACAO.md secção 6).
import type { Prioridade, TipoPedido } from "../types.ts";

export interface PedidoExtraido {
  ref: number;
  tipo_pedido: TipoPedido;
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
