export interface ItemNav {
  caminho: string;
  etiqueta: string;
}

const INICIO: ItemNav = { caminho: "/", etiqueta: "Início" };

/**
 * O que cada perfil vê no cabeçalho — cada utilizador só tem acesso ao que lhe compete, tal como
 * aconteceria já integrado num sistema hospitalar real. O Guião fica de fora (sempre visível).
 */
export const NAV_POR_PERFIL: Record<string, ItemNav[]> = {
  MEDICO: [INICIO, { caminho: "/oasis/medico", etiqueta: "Oasis · Médico" }, { caminho: "/meus-pedidos", etiqueta: "Meus Pedidos" }, { caminho: "/oasis/agendas", etiqueta: "Agendas" }, { caminho: "/definicoes", etiqueta: "Definições" }],
  ADMINISTRATIVO: [INICIO, { caminho: "/servico", etiqueta: "Serviço" }, { caminho: "/oasis/agendas", etiqueta: "Agendas" }],
  TRIADOR: [INICIO, { caminho: "/triagem", etiqueta: "Triagem" }, { caminho: "/oasis/agendas", etiqueta: "Agendas" }],
  GESTAO: [INICIO, { caminho: "/gestao", etiqueta: "Gestão" }],
  TECNICO: [INICIO, { caminho: "/tecnico", etiqueta: "Técnico" }],
};

export const ITENS_INICIO: ItemNav[] = [INICIO];

/** A página de trabalho de um perfil: a primeira do menu depois do Início. */
export function paginaPrincipal(perfil: string | undefined): string {
  return (perfil && NAV_POR_PERFIL[perfil]?.[1]?.caminho) || "/";
}
