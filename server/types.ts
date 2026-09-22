// Tipos do domínio. Os nomes dos campos seguem os cabeçalhos dos CSV em dados/
// (ver ESPECIFICACAO.md secção 4) para que o carregamento seja uma cópia directa.

export type Perfil =
  | "MEDICO"
  | "ADMINISTRATIVO"
  | "TRIADOR"
  | "GESTAO"
  | "TECNICO";

export interface Especialidade {
  codigo: string;
  descricao: string;
  tipo_atividade: string;
  entrada_pedidos_externos: "TRIAGEM" | "DIRETO";
}

export interface AtoCatalogo {
  especialidade_codigo: string;
  ato_codigo: string;
  ato_descricao: string;
  tipo_atividade: string;
  tipo_ato_medico: string;
  duracao_min: number;
  tipo_pedido: TipoPedido;
}

export interface Exame {
  codigo_exame: string;
  descricao_exame: string;
  especialidade_codigo: string;
  ato_codigo: string;
}

export interface Analise {
  codigo: string;
  descricao: string;
}

export interface Gabinete {
  codigo: string;
  descricao: string;
  especialidade_codigo: string;
  tipo_recurso: string;
}

export interface Utilizador {
  utilizador_id: string;
  nome: string;
  perfil: Perfil;
  especialidade_codigo: string;
  e_medico: boolean;
}

/**
 * As 4 fases grandes do percurso oncológico do doente no hospital (não confundir com o
 * "estadiamento" TNM/clínico). Usadas para agrupar e filtrar "Os Meus Pedidos" do médico e,
 * mais tarde, as estatísticas por serviço.
 */
export type EstadioCuidado = "NOVO" | "PRE_TRATAMENTO" | "EM_TRATAMENTO" | "FOLLOW_UP" | "";

export interface Doente {
  doente_id: string;
  n_utente: string;
  nome: string;
  sexo: string;
  data_nascimento: string;
  demo_cenario: string;
  diagnostico_principal?: string;
  estadiamento?: string;
  alergias?: string[];
  contacto?: string;
  notas_clinicas?: string;
  estadio_cuidado?: EstadioCuidado;
}

export interface Vaga {
  vaga_id: string;
  especialidade_codigo: string;
  gabinete_codigo: string;
  medico_id: string;
  data_hora: string; // ISO local, sem timezone
  duracao_min: number;
  atos_permitidos: string[];
  ato_id: string; // vazio = livre
}

export interface AtoMedicoExame {
  codigo_exame: string;
  descricao_exame: string;
}

/** Um "acto" do Oasis, resultado de agrupar oasis_atos_medicos.csv por mvp_ato_id. */
export interface AtoMedico {
  mvp_ato_id: string;
  doente_id: string;
  estado: string; // MARCADA | REALIZADA | FALTOU | DESMARCADA
  data_hora: string; // ISO
  duracao_min: number;
  especialidade_codigo: string;
  especialidade_descricao: string;
  gabinete_codigo: string;
  gabinete_descricao: string;
  ato_codigo: string;
  ato_descricao: string;
  data_criacao: string;
  data_atualizacao: string;
  exames: AtoMedicoExame[];
  tipo_atividade: string;
  tipo_ato_medico: string;
  mvp_medico_id: string;
  mvp_vaga_id: string;
  mvp_pedido_id: string;
  mvp_prazo_limite: string;
  mvp_prioridade: string;
  mvp_n_remarcacoes: number;
}

export type TipoPedido =
  | "consulta"
  | "pedido_consulta"
  | "pedido_hd"
  | "exame"
  | "analises"
  | "tratamento";

export type Fluxo = "DIRETO" | "TRIAGEM";

export type Prioridade = "MP" | "P" | "N";

export type EstadoPedido =
  | "EXTRAIDO"
  | "VALIDADO"
  | "EM_TRIAGEM"
  | "ACEITE"
  | "MARCADO"
  | "REALIZADO"
  | "DEVOLVIDO"
  | "RECUSADO"
  | "REENCAMINHADO"
  | "SEM_VAGA"
  | "FALTOU"
  | "CANCELADO";

export interface Pedido {
  pedido_id: string;
  doente_id: string;
  consulta_origem_ato_id: string;
  especialidade_origem: string;
  medico_requisitante_id: string;
  criado_em: string;
  tipo_pedido: TipoPedido;
  fluxo: Fluxo;
  especialidade_destino: string;
  ato_codigo: string;
  exames: string[];
  analises: string[];
  especificacao: string;
  prioridade: Prioridade;
  prazo_limite: string; // ISO data
  nao_antes: string; // ISO data ou ""
  medico_preferido_id: string;
  continuidade_obrigatoria: boolean;
  recorrencia: string; // ex.: "4/4 semanas" ou ""
  texto_origem: string;
  confianca: number;
  aprovado_direto: boolean;
  validado_por: string;
  validado_em: string;
  triado_por: string;
  triado_em: string;
  decisao_triagem: string;
  marcado_em: string;
  ato_id: string; // mvp_ato_id da marcação no Oasis, quando marcado
  estado: EstadoPedido;
  n_remarcacoes: number;
  // Campos adicionais usados internamente (não vêm do CSV original):
  prioridade_por_defeito?: boolean;
  pergunta_triagem?: string;
  resposta_medico?: string;
  motivo_recusa?: string;
  /** true quando o pedido foi reconhecido automaticamente por uma entrada do dicionário (selo "aprendido"). */
  origem_dicionario?: boolean;
  score_prioridade?: number;
  equacao_prioridade_detalhe?: string;
  prioridade_calculada_sistema?: boolean;
  /** true quando a administração pediu ao médico para decidir manter/cancelar um pedido SEM_VAGA
   * sem solução interna (nem vaga extra, nem outsourcing) — ver server/motor/fluxo.ts. */
  decisao_pendente?: boolean;
}

export interface Dependencia {
  dependencia_id: string;
  pedido_id: string; // B
  depende_de_pedido_id: string; // A
  intervalo_min_dias: number;
  critica: boolean;
  origem: "MEDICO" | "REGRA";
  regra_id: string;
}

export type TipoEvento =
  | "EXTRACAO"
  | "VALIDACAO"
  | "CORRECAO"
  | "ENVIO"
  | "TRIAGEM"
  | "REENCAMINHAMENTO"
  | "DEVOLUCAO"
  | "RESPOSTA"
  | "RECUSA"
  | "MARCACAO"
  | "SEM_VAGA"
  | "PROPOSTA_TROCA"
  | "REMARCACAO"
  | "FALTA"
  | "REALIZACAO"
  | "CANCELAMENTO"
  | "ALERTA"
  | "OUTSOURCING"
  | "DECISAO_MEDICO";

export interface Evento {
  evento_id: string;
  pedido_id: string;
  data_hora: string;
  tipo: TipoEvento;
  estado_anterior: string;
  estado_novo: string;
  utilizador_id: string; // ou AGENTE / SISTEMA
  motivo: string;
  detalhe: string;
}

export type TipoNotificacao =
  | "CONSULTA_SUBMETIDA"
  | "PEDIDO_EM_TRIAGEM"
  | "PEDIDO_MARCADO"
  | "PEDIDO_SEM_VAGA"
  | "PEDIDO_DEVOLVIDO"
  | "PEDIDO_RECUSADO"
  | "AVARIA_SERVICO"
  | "AVARIA_RESOLVIDA"
  | "PEDIDO_DECISAO_NECESSARIA";

/** Notificação dirigida a um utilizador, gerada pelo motor em cada transição relevante do fluxo (secção 5/N2). */
export interface Notificacao {
  notificacao_id: string;
  tipo: TipoNotificacao;
  destinatario_utilizador_id: string;
  titulo: string;
  mensagem: string;
  pedido_id: string;
  doente_id: string;
  consulta_ato_id: string;
  criado_em: string; // ISO data/hora
  lida: boolean;
}

/** Um utilizador silenciou um tipo de notificação (não deixa de as gerar; nascem já lidas). */
export interface Silenciamento {
  utilizador_id: string;
  tipo: TipoNotificacao;
}

/**
 * Avaria reportada por um técnico (N2): um serviço, opcionalmente um acto específico, fica
 * indisponível por X dias. A administração do serviço decide remarcação total ou parcial.
 */
export interface Avaria {
  avaria_id: string;
  especialidade_codigo: string;
  ato_codigo: string; // "" = afecta todo o serviço; preenchido = só este acto/equipamento
  descricao: string;
  duracao_dias: number;
  reportado_por: string;
  criado_em: string;
  estado: "ABERTA" | "RESOLVIDA";
  decisao: "REMARCACAO_TOTAL" | "REMARCACAO_PARCIAL" | "";
  resolvido_por: string;
  resolvido_em: string;
  pedidos_afetados: number;
}

export interface DicionarioEntrada {
  termo: string;
  significado: string;
  mapeia_para: string;
  ambito: "GLOBAL" | string; // string = utilizador_id do médico
  origem: "INICIAL" | "CORRECAO";
  ocorrencias: number;
  estado: "ATIVA" | "INATIVA";
}

export type TipoAlerta =
  | "EXTRACAO_BAIXA_CONFIANCA"
  | "TERMO_DESCONHECIDO"
  | "TRIAGEM_PARADA"
  | "SEM_VAGA"
  | "PROPOSTA_TROCA"
  | "SEMAFORO_VERMELHO"
  | "FALTA_DEPENDENCIA"
  | "REMARCACAO_QUEBRA_DEPENDENCIA"
  | "REMARCACOES_EXCESSIVAS"
  | "PRAZO_ULTRAPASSADO"
  | "URGENCIA";

export type Gravidade = "media" | "alta";

export interface Alerta {
  alerta_id: string;
  tipo: TipoAlerta;
  gravidade: Gravidade;
  especialidade: string;
  pedido_id: string;
  doente_id: string;
  criado_em: string;
  estado: "ABERTO" | "RESOLVIDO";
  resolvido_por: string;
  resolvido_em: string;
  accao: string;
  descricao: string;
}

export interface PropostaTroca {
  proposta_id: string;
  pedido_urgente: string; // pedido que precisa da vaga
  ato_a_mover: string; // mvp_ato_id do doente deslocado
  vaga_origem: string; // vaga_id onde o deslocado estava
  vaga_destino: string; // vaga_id para onde o deslocado vai
  justificacao: string;
  estado: "PENDENTE" | "APROVADA" | "REJEITADA";
  decidido_por: string;
  decidido_em: string;
  criado_em: string;
  especialidade: string;
}

export interface RegraPrazo {
  tipo_pedido: TipoPedido;
  prioridade: Prioridade;
  prazo_dias: number;
}

export interface RegraDependencia {
  regra_id: string;
  quando: string;
  exige: string;
  validade_dias: number;
  intervalo_min_dias: number;
  critica: boolean;
  descricao: string;
}

export interface IntervaloResultado {
  especialidade_codigo: string;
  dias_ate_resultado: number;
}

/** Nota SOAP guardada pelo médico no Oasis 2.0 (não existe no export real do Oasis; é do MVP). */
export interface NotaConsulta {
  ato_id: string; // mvp_ato_id da consulta
  s: string;
  o: string;
  a: string;
  p: string;
  guardado_em: string;
  guardado_por: string;
}

export interface Parametros {
  DEMO_DATE: string;
  congelamento_dias: number;
  limiar_confianca: number;
  promover_regra_apos: number;
  alerta_triagem_parada_dias: number;
  semaforo_horizonte_dias: number;
  alerta_remarcacoes: number;
  cromos_dia: number;
  copias_por_cromo: number;
  minutos_admin_por_cromo: number;
  dias_uteis_mes: number;
  /** Limiares (score 0-100, secção "Definições da Prioridade") a partir dos quais a equação do
   * sistema atribui MP/P — editáveis pela Gestão, repostos ao valor do CSV em "Repor demo". */
  limiar_prioridade_mp: number;
  limiar_prioridade_p: number;
}
