import { CASOS, DIARIO_MARIA } from "./casosDemo";

/**
 * Modo tutorial do Guião: escurece o ecrã menos o elemento de que se está a falar, com um cartão a
 * explicar o que é e o que fazer. Cada passo pode trocar de utilizador e de página. O Caso 1 (o ciclo
 * completo da Maria) é guiado clique a clique; os restantes casos são gerados a partir do guião, um
 * passo por página, com o destaque na zona onde se decide.
 */
export interface PassoTutorial {
  titulo: string;
  texto: string;
  /** Troca para este utilizador ao entrar no passo. */
  utilizadorId?: string;
  /** Vai para esta página ao entrar no passo (se ainda lá não estiver). */
  caminho?: string;
  /** Selector CSS do elemento a destacar; sem alvo, o cartão fica ao canto e a página à vista. */
  alvo?: string;
  resultado?: string;
  fala?: string;
  /** Textos prontos a copiar (ex.: o diário da consulta). */
  copiar?: { rotulo: string; texto: string }[];
  /** Clicar no elemento destacado passa ao passo seguinte. */
  avancarAoClicar?: boolean;
  /** Passa ao seguinte quando este elemento aparecer (ex.: a etapa seguinte do assistente). */
  avancarQuando?: string;
  /** Passa ao seguinte quando este elemento desaparecer (ex.: fechar a ficha). */
  avancarQuandoSair?: string;
  /** Botão que faz o passo pela pessoa (dispara `oasis:tutorial` com este nome). */
  acao?: { rotulo: string; nome: string };
}

export interface Tutorial {
  id: string;
  titulo: string;
  passos: PassoTutorial[];
  /** Índice do primeiro passo de cada passo do guião (para começar a meio). */
  inicioPorPassoGuiao: number[];
}

export const EVENTO_TUTORIAL = "oasis:tutorial";
export const EVENTO_ACAO_TUTORIAL = "oasis:tutorial-acao";
export const CHAVE_TUTORIAL = "oasis2:tutorial";

export function iniciarTutorial(id: string, passo = 0) {
  window.dispatchEvent(new CustomEvent(EVENTO_TUTORIAL, { detail: { id, passo } }));
}

const CASO_1: PassoTutorial[] = [
  {
    titulo: "A agenda do Dr. Pedro",
    texto:
      "Estamos no Oasis como Dr. Pedro Almeida (Onc. Cirúrgica). A primeira doente do dia é a Maria Fernandes Costa, às 08:30. Ainda não tem nenhum pedido: vamos segui-la da consulta até às marcações.",
    utilizadorId: "U01",
    caminho: "/oasis/medico",
    alvo: '[data-tour="agenda-100101"]',
  },
  {
    titulo: "Abrir a ficha sem sair da agenda",
    texto: "Clique no nome da Maria. A ficha abre ao lado, sem perder a agenda.",
    alvo: '[data-tour="nome-100101"]',
    avancarAoClicar: true,
  },
  {
    titulo: "A ficha do doente",
    texto:
      "Tudo sobre a Maria num só sítio: o percurso dos pedidos (o que está marcado, por marcar ou em triagem), a folha clínica com o diário de cada consulta anterior e o arquivo de exames. Em \"Editar perfil\" actualiza-se o contacto, o transporte ou as alergias. Explore à vontade; feche a ficha (× ou Esc) para continuar.",
    alvo: '[data-tour="ficha"]',
    avancarQuandoSair: '[data-tour="ficha"]',
  },
  {
    titulo: "Entrar na consulta",
    texto: "Clique em \"Abrir Consulta\".",
    alvo: '[data-tour="abrir-consulta-100101"]',
    avancarAoClicar: true,
  },
  {
    titulo: "Atalhos para a ficha",
    texto:
      "Durante a consulta, estes quatro atalhos abrem a ficha ao lado: Perfil (já em edição), Pedidos, Folha clínica e Exames. Experimente um, feche, e carregue em Seguinte.",
    alvo: '[data-tour="atalhos-ficha"]',
  },
  {
    titulo: "O diário da consulta",
    texto:
      "O médico escreve o diário como sempre e, no fim, o plano em abreviaturas depois de \"P/\". Copie este texto e cole-o no diário.",
    alvo: "#campo-diario",
    copiar: [{ rotulo: "Diário da consulta", texto: DIARIO_MARIA }],
  },
  {
    titulo: "O assistente viu o plano",
    texto:
      "Assim que há um \"P/\", o assistente avisa que vai ler o plano. Ele só pré-selecciona: o médico confirma tudo no ecrã seguinte. Cada médico pode desligá-lo em Definições.",
    alvo: '[data-tour="assistente-plano"]',
  },
  {
    titulo: "Guardar e seguir para os pedidos",
    texto: "\"Guardar & Seguinte\" grava o diário, o assistente lê o P/ e abre o ecrã dos pedidos.",
    alvo: "#btn-guardar-consulta",
    avancarAoClicar: true,
  },
  {
    titulo: "O plano já traduzido",
    texto:
      "O assistente traduziu o P/: Análises, Exames, Próxima consulta e Pedido de consulta já vêm seleccionados (marcados \"do plano\"). O médico pode tirar ou juntar tipos. Carregue em Seguinte.",
    alvo: '[data-tour="tipos-pedido"]',
    avancarQuando: '[data-tour="preenchimento"]',
    acao: { rotulo: "Não veio pré-seleccionado? Preencher o plano da Maria", nome: "preencher-maria" },
  },
  {
    titulo: "Cada pedido já preenchido",
    texto:
      "\"hemog, bioq, creat, CEA, CA 19.9\" → colheita com jejum com as 5 análises.\n" +
      "\"TC TAP c/ contraste\" → TC corpo: tórax, abdominal e pélvica, com contraste.\n" +
      "\"cons. Onco\" → pedido de consulta de Oncologia Médica.\n" +
      "\"rev c/ exames comigo\" → próxima consulta no serviço do Dr. Pedro, depois dos exames, com ele.\n" +
      "Cada bloco diz de que pedaço do plano veio. Tudo se pode alterar; a prioridade fica automática. Depois, Seguinte.",
    alvo: '[data-tour="preenchimento"]',
    avancarQuando: '[data-tour="resumo"]',
  },
  {
    titulo: "Resumo e submissão",
    texto: "O resumo mostra os 4 pedidos. Indique se a doente precisa de transporte e carregue em \"Submeter pedidos\".",
    alvo: '[data-tour="resumo"]',
    avancarQuando: '[data-tour="confirmacao"]',
  },
  {
    titulo: "O que aconteceu a cada pedido",
    texto:
      "Marcado no momento, pela ordem certa: colheita a 24/09 07:30 → TC a 14/10 (regra R1: a creatinina antes do contraste) → próxima consulta com o Dr. Pedro depois do TC. A interconsulta de Oncologia Médica segue para a triagem desse serviço.",
    alvo: '[data-tour="confirmacao"]',
    fala: "O médico declara os pedidos uma vez. O sistema percebe as dependências e marca tudo pela ordem certa, sem papel.",
  },
  {
    titulo: "Na triagem da Oncologia Médica",
    texto:
      "Agora somos o Dr. Rui Carvalho, triador da Oncologia Médica. O pedido da Maria chegou agora e está em primeiro, marcado como \"Novo\". O contexto clínico vem da consulta.",
    utilizadorId: "U04",
    caminho: "/triagem?doente=100101",
    alvo: '[data-tour="triagem-100101"]',
  },
  {
    titulo: "Aceitar e agendar",
    texto: "Clique em \"Aceitar & Agendar\": a consulta fica marcada no momento e o médico é avisado.",
    alvo: '[data-tour="aceitar-100101"]',
    avancarAoClicar: true,
  },
  {
    titulo: "O médico é avisado",
    texto:
      "De volta ao Dr. Pedro: as notificações dizem-lhe o que foi marcado. Passe o rato pelo sino — e clicar numa notificação leva à acção, não a um menu.",
    utilizadorId: "U01",
    caminho: "/",
    alvo: '[data-tour="sino"]',
  },
  {
    titulo: "Ciclo fechado",
    utilizadorId: "U01",
    texto: "A ficha da Maria: tudo o que foi pedido está marcado, dentro do prazo, e ela já recebeu os avisos com a preparação de cada exame.",
    caminho: "/doente/100101",
    alvo: '[data-tour="ficha-resumo"]',
    fala: "Fim do circuito normal: pedido, triagem, marcação e aviso ao doente, sem papel e sem telefonemas.",
  },
];

/** Casos 2 a 8: um passo por página do guião, com o destaque na zona onde se decide. */
function tutorialDoGuiao(casoId: string): Tutorial | null {
  const caso = CASOS.find((c) => c.id === casoId);
  if (!caso) return null;
  const passos: PassoTutorial[] = [];
  const inicio: number[] = [];
  caso.passos.forEach((p) => {
    inicio.push(passos.length);
    p.acoes.forEach((a, j) => {
      passos.push({
        titulo: j === 0 ? p.titulo : `${p.titulo} — ${a.etiqueta}`,
        texto: j === 0 ? p.descricao : `Ver em: ${a.etiqueta}.`,
        resultado: j === p.acoes.length - 1 ? p.resultado : undefined,
        fala: j === p.acoes.length - 1 ? p.fala : undefined,
        utilizadorId: a.utilizadorId,
        caminho: a.caminho,
        alvo: a.alvo,
      });
    });
  });
  return { id: casoId, titulo: caso.titulo, passos, inicioPorPassoGuiao: inicio };
}

export function obterTutorial(id: string): Tutorial | null {
  if (id === "1") {
    // 1.1 e 1.2 (a Maria) guiados clique a clique; 1.3 e 1.4 pela página; 1.5 volta à ficha da Maria.
    const geral = tutorialDoGuiao("1")!;
    const fimMaria = CASO_1.length - 1;
    const outros = geral.passos.slice(geral.inicioPorPassoGuiao[2], geral.inicioPorPassoGuiao[4]);
    const passos = [...CASO_1.slice(0, fimMaria), ...outros, CASO_1[fimMaria]];
    return {
      id: "1",
      titulo: geral.titulo,
      passos,
      inicioPorPassoGuiao: [0, CASO_1.findIndex((p) => p.titulo.startsWith("Na triagem")), fimMaria, fimMaria + (geral.inicioPorPassoGuiao[3] - geral.inicioPorPassoGuiao[2]), passos.length - 1],
    };
  }
  return tutorialDoGuiao(id);
}
