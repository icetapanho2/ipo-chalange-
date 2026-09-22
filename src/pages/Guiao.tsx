import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePerfil } from "../lib/PerfilContext";
import { apiGet, apiPost, apiPut } from "../lib/api";
import { PainelImpacto } from "../components/PainelImpacto";
import {
  Sparkles,
  UserCheck,
  UserPlus,
  Play,
  CheckCircle2,
  ArrowRight,
  Stethoscope,
  RefreshCw,
  Check,
  ExternalLink,
  ShieldAlert,
  Search,
  BookOpen,
} from "lucide-react";

interface AcaoPasso {
  etiqueta: string;
  utilizadorId: string;
  caminho: string;
}

interface Passo {
  titulo: string;
  descricao: string;
  resultado: string;
  acoes: AcaoPasso[];
  /** O que dizer ao júri neste passo. */
  fala?: string;
}

interface Caso {
  id: string;
  titulo: string;
  tipo: "normal" | "problema" | "impacto";
  problema: string;
  regras?: string[];
  passos: Passo[];
}

/**
 * Guião da demo por CASOS: o caso normal (tudo corre bem) e os casos com problemas em que as
 * regras de prioridade decidem (ESPECIFICACAO.md secção 8A). Os resultados esperados são os de
 * tests/guiaoCasos.test.ts — correr os casos por esta ordem, depois de "Repor demo".
 */
const CASOS: Caso[] = [
  {
    id: "1",
    titulo: "Caso 1 — Tudo corre bem",
    tipo: "normal",
    problema:
      "Hoje o plano da consulta segue num papel (o \"cromo\"): a administrativa copia-o e cada serviço marca por si, sem saber das dependências. Aqui o médico declara os pedidos uma vez e o sistema faz o resto.",
    passos: [
      {
        titulo: "Maria Fernandes — da consulta às marcações",
        descricao:
          "Dr. Pedro, consulta das 09:30: escrever no Diário Clínico e \"Guardar & Seguinte\". No assistente escolher Análises, Exames e Consulta de revisão. Colheita com jejum (hemograma, bioquímica com creatinina, CEA, CA 19.9); TC TAP com contraste; revisão que depende dos exames desta consulta, com continuidade. Submeter.",
        resultado:
          "Marcado automaticamente: colheita 24/09 07:30 → TC 14/10 08:00 (regra R1: creatinina antes do contraste) → revisão com o Dr. Pedro 21/10 08:30 (7 dias depois do TC, para haver resultado).",
        acoes: [{ etiqueta: "Agenda do Dr. Pedro", utilizadorId: "U01", caminho: "/oasis/medico" }],
        fala: "O médico declara os pedidos uma vez. O sistema percebe as dependências e marca tudo pela ordem certa, sem papel.",
      },
      {
        titulo: "Luísa Martins — pedido para outro serviço",
        descricao: "O triador de Oncologia Médica vê que o pedido é para Radioterapia e reencaminha-o; a triadora de Radioterapia aceita.",
        resultado: "1.ª consulta de Radioterapia a 30/09 09:00, marcada no momento em que é aceite.",
        acoes: [
          { etiqueta: "Reencaminhar (Onc. Médica)", utilizadorId: "U04", caminho: "/triagem" },
          { etiqueta: "Aceitar (Radioterapia)", utilizadorId: "U06", caminho: "/triagem" },
        ],
      },
      {
        titulo: "Fernando Lopes — Hospital de Dia",
        descricao: "A triadora de Hospital de Dia aceita a sessão de quimioterapia.",
        resultado: "Sessão a 25/09 08:30; as análises pré-quimioterapia são criadas e marcadas sozinhas para 24/09 07:30 (regra R2: 1 a 3 dias antes).",
        acoes: [{ etiqueta: "Aceitar (Hospital de Dia)", utilizadorId: "U10", caminho: "/triagem" }],
      },
      {
        titulo: "Ver tudo na ficha do doente",
        descricao:
          "Abrir a ficha da Maria: em \"Marcações do doente\" aparece cada marcação, com a indicação de que está dentro do prazo, e as mensagens que ela recebeu (aviso com a preparação do exame e lembrete a D-3).",
        resultado: "Tudo o que foi pedido está marcado, dentro do prazo, e o doente já sabe o que tem de fazer.",
        acoes: [
          { etiqueta: "Ficha da Maria", utilizadorId: "U03", caminho: "/doente/100101" },
          { etiqueta: "Ficha do Fernando", utilizadorId: "U03", caminho: "/doente/100108" },
        ],
        fala: "Fim do circuito normal: pedido, triagem, marcação e aviso ao doente, sem papel e sem telefonemas.",
      },
    ],
  },
  {
    id: "2",
    titulo: "Caso 2 — O TAC está cheio: quem cede a vaga?",
    tipo: "problema",
    problema:
      "José Carvalho tem suspeita de recidiva: TC muito prioritário até 05/10. O TAC não tem vagas até 13/10. Alguém tem de ceder a vaga — mas quem? Hoje, é quem calha (ou quem tem mais folga), e às vezes é o doente de 81 anos que vem de ambulância.",
    regras: [
      "Nunca se mexe numa marcação a 7 dias ou menos.",
      "Nunca se remarca pelo hospital alguém que já foi remarcado.",
      "Nunca se mexe em quem está em tratamento.",
      "Entre os restantes, cede quem tem menor custo de remarcar: idade, sem telemóvel, distância, transporte, outra marcação no mesmo dia, em diagnóstico (a folga até ao prazo desconta).",
      "É sempre uma proposta: um humano aprova.",
    ],
    passos: [
      {
        titulo: "A administrativa aprova o TC do José",
        descricao: "Na Validação, aprovar o TC do José. Sem vaga livre, o sistema prepara uma proposta de troca para a Radiologia.",
        resultado: "Proposta de troca criada, à espera de aprovação da Radiologia.",
        acoes: [{ etiqueta: "Validação (Joana)", utilizadorId: "U03", caminho: "/validacao" }],
      },
      {
        titulo: "Radiologia: \"Porquê esta escolha?\"",
        descricao: "Abrir a proposta e o painel \"Porquê esta escolha?\" — todos os doentes avaliados, as exclusões e o custo de cada um. Aprovar.",
        resultado:
          "Cede a vaga Manuel Costa (follow-up, SMS, prazo 31/12): 02/10 10:00 → 14/10 08:20. Excluídos: Beatriz (já remarcada uma vez) e Tiago (em quimioterapia). Pela regra antiga seria o Sr. Joaquim — mais folga, mas 81 anos, sem telemóvel, Castelo Branco, ambulância e consulta no mesmo dia: custo 70 contra −30.",
        acoes: [{ etiqueta: "Propostas (Radiologia)", utilizadorId: "U07", caminho: "/servico?aba=pendencias" }],
        fala: "O sistema não decide sozinho: propõe, explica porquê em linguagem simples, e um humano aprova.",
      },
      {
        titulo: "Laboratório: e se as regras fossem outras?",
        descricao:
          "Na Gestão, abrir o Laboratório de prioridades. Pôr as \"Remarcações\" do Manuel a 1: ele passa a estar protegido e a escolha muda. Experimentar também os pesos das regras.",
        resultado: "Com o Manuel já remarcado, cede a vaga a Graça Pereira Santos (custo 49); o Sr. Joaquim continua protegido.",
        acoes: [{ etiqueta: "Laboratório de prioridades", utilizadorId: "U12", caminho: "/gestao/laboratorio" }],
        fala: "Os critérios são da direcção clínica. Aqui vê-se o efeito de cada um, sem mexer em marcações reais.",
      },
    ],
  },
  {
    id: "3",
    titulo: "Caso 3 — Um doente desmarca: quem aproveita a vaga?",
    tipo: "problema",
    problema:
      "Rui Fonseca liga a desmarcar o TC de 30/09 (vai estar fora; pode a partir de 19/10). Hoje a vaga fica vazia ou vai para quem ligar primeiro — enquanto há doentes em diagnóstico marcados semanas depois do prazo.",
    regras: [
      "Aviso de mais de 72 h: a vaga é oferecida por SMS; com menos de 24 h não se chama ninguém de fora.",
      "Primeiro quem está sem vaga ou marcado depois do prazo — em diagnóstico à frente, depois quem ficaria mais dias fora do prazo.",
      "Depois, doentes em diagnóstico que ganham pelo menos 7 dias e aceitam ser antecipados.",
      "Antecipar alguém não conta como remarcação: foi o doente que aceitou.",
    ],
    passos: [
      {
        titulo: "Radiologia regista a desmarcação",
        descricao: "Separador \"Vagas libertadas\": procurar \"Rui\" → \"Desmarcar a pedido do doente\", disponível a partir de 19/10.",
        resultado:
          "Rui reagendado para 19/10 08:40. A vaga de 30/09 09:00 é oferecida a Helena Duarte — em diagnóstico (suspeita de cancro do pâncreas), marcada a 13/10, 35 dias depois do prazo.",
        acoes: [{ etiqueta: "Vagas libertadas (Radiologia)", utilizadorId: "U07", caminho: "/servico?aba=vagas" }],
      },
      {
        titulo: "A Helena aceita",
        descricao: "Clicar em \"Doente aceitou\" (a resposta ao SMS é simulada). Abrir \"Porquê esta pessoa?\" para ver a lista ordenada.",
        resultado:
          "Helena passa para 30/09 09:00 e ganha 13 dias, sem contar como remarcação. A vaga dela de 13/10 é oferecida automaticamente a Luís Martins Alves (cascata).",
        acoes: [
          { etiqueta: "Vagas libertadas (Radiologia)", utilizadorId: "U07", caminho: "/servico?aba=vagas" },
          { etiqueta: "Ficha da Helena", utilizadorId: "U07", caminho: "/doente/100112" },
        ],
        fala: "Uma desmarcação com uma semana de aviso deixa de ser uma vaga perdida e passa a ser tempo ganho por quem espera um diagnóstico.",
      },
    ],
  },
  {
    id: "4",
    titulo: "Caso 4 — Doente de longe, idoso e sem telemóvel",
    tipo: "problema",
    problema:
      "O Sr. Joaquim (81 anos) mora em Castelo Branco, a 230 km, não tem telemóvel e vem de ambulância. Já tem TC e consulta a 01/10. Hoje o Dr. Pedro pede-lhe uma colheita — a primeira vaga é amanhã, o que obrigaria a mais uma viagem.",
    regras: [
      "Dia único: para quem mora a 50 km ou mais, o sistema prefere um dia em que o doente já vem ao hospital (nunca para lá do prazo) e evita horas antes das 10:00.",
      "Lista de chamadas: todos recebem aviso e lembrete; a administrativa só liga a quem tem risco (sem contacto digital, preparação crítica, faltas, 2.ª remarcação).",
    ],
    passos: [
      {
        titulo: "Dr. Pedro pede a colheita",
        descricao: "Consulta das 11:50 (Joaquim Pereira) → \"Guardar & Seguinte\" → Análises: colheita sem jejum (hemograma, CEA). Submeter.",
        resultado:
          "Marcada a 01/10 10:00, entre o TC (09:00) e a consulta (11:10) — não a 24/09, que era a primeira vaga. Evita uma viagem de 460 km.",
        acoes: [
          { etiqueta: "Agenda do Dr. Pedro", utilizadorId: "U01", caminho: "/oasis/medico" },
          { etiqueta: "Ficha do Joaquim", utilizadorId: "U08", caminho: "/doente/100109" },
        ],
      },
      {
        titulo: "Lista de chamadas da Radiologia",
        descricao: "Separador \"Lista de chamadas\": o Sr. Joaquim aparece (sem contacto digital, 81 anos) e a Maria aparece por causa da preparação (TC com contraste e metformina).",
        resultado: "Cerca de 1 em cada 5 marcações precisa de chamada; as restantes ficam só com o SMS/email e o lembrete a D-3.",
        acoes: [{ etiqueta: "Lista de chamadas (Radiologia)", utilizadorId: "U07", caminho: "/servico?aba=chamadas" }],
        fala: "Não ligamos a toda a gente: ligamos a quem, sem chamada, provavelmente falharia o exame.",
      },
    ],
  },
  {
    id: "5",
    titulo: "Caso 5 — Avaria: 5 doentes para remarcar de uma vez",
    tipo: "problema",
    problema:
      "O ecógrafo avariou e só fica reparado depois de amanhã: as 5 ecografias de 24/09 têm de ser remarcadas e só há uma vaga livre antes de sexta. Hoje a administrativa pega no telefone e remarca pela ordem da lista — quem calha fica com a vaga, e ninguém repara que um dos exames já não chega a tempo da consulta.",
    regras: [
      "Cada pedido já tem o índice de prioridade calculado e guardado (nível, prazo, estádio, score clínico, remarcações já sofridas, espera): a ordem já está feita antes da avaria.",
      "Dois MP com o mesmo prazo não empatam: quem está em diagnóstico fica à frente.",
      "Se uma consulta depende do exame, a nova data tem de deixar tempo para o resultado. Se não houver, é um alerta — nunca uma remarcação às cegas.",
      "Sem vaga a tempo: a administrativa resolve com vaga extra ou outsourcing; se não puder, decide o médico (avançar com a consulta ou adiá-la, e para que dia).",
    ],
    passos: [
      {
        titulo: "O técnico reporta a avaria",
        descricao:
          "Perfil Técnico → Reportar avaria: Radiologia-Geral (Ecografia), todo o serviço, \"Ecógrafo avariado (sonda); técnico da marca só amanhã ao fim do dia\", a partir de 24/09, 1 dia.",
        resultado: "A administrativa da Ecografia (Tiago Neves) recebe logo: \"Avaria em Radiologia-Geral (Ecografia): 5 marcação(ões) a remarcar — plano pronto\".",
        acoes: [{ etiqueta: "Reportar avaria (Técnico)", utilizadorId: "U13", caminho: "/tecnico" }],
      },
      {
        titulo: "A administrativa revê o plano e aceita",
        descricao:
          "Serviço → Remarcações: as 5 propostas por ordem do índice, com a vaga sugerida, o porquê e os avisos (carregar no índice mostra cada ponto). \"Aceitar todas\" aplica as 4 que têm solução.",
        resultado:
          "1.º Sónia (MP, em diagnóstico, 717) → 25/09 10:40, a única vaga no prazo. 2.º Artur (MP, 621) → 28/09 11:00, 3 dias fora do prazo, com aviso. 3.º Fátima (em QT) → 28/09 12:00, aviso \"2.ª remarcação — ligar\". 4.º Olga (84 anos, Santarém) → 01/10 11:40, no dia da consulta dela. 5.º Diogo (índice 134) → sem vaga a tempo (ver passo seguinte).",
        acoes: [{ etiqueta: "Remarcações (Ecografia)", utilizadorId: "U11", caminho: "/servico?aba=remarcacoes" }],
        fala: "Cinco remarcações em segundos, cada uma com o porquê. Quem decide continua a ser a administrativa.",
      },
      {
        titulo: "Diogo: sem vaga a tempo — alerta",
        descricao:
          "O Diogo tem revisão com a Dra. Sofia a 29/09 que precisa do resultado da ecografia (3 dias): o exame teria de ser até 26/09 e a única vaga (25/09) ficou para a Sónia, com índice 717 contra 134. O cartão fica a vermelho, com um alerta, e três saídas: \"Resolvi com vaga extra\" (já sugere 25/09 13:30), \"Resolvi com outsourcing\", ou \"Não há solução — enviar ao médico\". Para a demo: enviar ao médico.",
        resultado: "A Dra. Sofia recebe a notificação \"Decisão necessária: Diogo Almeida Reis — revisão de 29/09\". (Com vaga extra, o exame ficaria a 25/09 13:30 e a consulta mantinha-se.)",
        acoes: [{ etiqueta: "Remarcações (Ecografia)", utilizadorId: "U11", caminho: "/servico?aba=remarcacoes" }],
        fala: "Quem tem menos prioridade não fica esquecido: fica um alerta com as opções, e se a administração não resolve, decide o médico.",
      },
      {
        titulo: "A médica decide: adiar a consulta",
        descricao:
          "Perfil Dra. Sofia Lemos → Os Meus Pedidos: \"Exame sem vaga a tempo da consulta — decida\". Opções: avançar com a consulta a 29/09 e ver a ecografia depois (28/09), ou adiar a consulta (data mínima sugerida 01/10). Escolher \"Adiar\" com 01/10.",
        resultado: "Consulta adiada para 06/10 09:30 (primeiro dia livre da Dra. Sofia a partir de 01/10); ecografia a 28/09 12:40, a tempo do resultado. O doente e a administrativa são avisados; o técnico recebe \"avaria resolvida\".",
        acoes: [
          { etiqueta: "Os Meus Pedidos (Dra. Sofia)", utilizadorId: "U02", caminho: "/meus-pedidos" },
          { etiqueta: "Ficha do Diogo", utilizadorId: "U02", caminho: "/doente/100117" },
        ],
      },
    ],
  },
  {
    id: "6",
    titulo: "Caso 6 — A médica vai de férias",
    tipo: "problema",
    problema: "A Dra. Sofia Lemos falta a 08/10. As 7 consultas desse dia têm de mudar — e os doentes que ela segue devem continuar com ela.",
    regras: ["Mesmo motor da avaria, só na agenda desse médico.", "Continuidade: primeiro a agenda do mesmo médico; ordem pelo índice."],
    passos: [
      {
        titulo: "A administrativa regista a ausência",
        descricao: "Perfil Joana Moreira → Serviço → Remarcações → \"Registar ausência de médico\": Dra. Sofia Lemos, 08/10, 1 dia, Férias. Rever o plano e \"Aceitar todas\".",
        resultado: "7 consultas remarcadas pela ordem do índice, com a própria Dra. Sofia: o 1.º (MP, em diagnóstico) para 13/10 09:10 e os restantes a 13/10 e 15/10.",
        acoes: [{ etiqueta: "Remarcações (Onc. Cirúrgica)", utilizadorId: "U03", caminho: "/servico?aba=remarcacoes" }],
        fala: "Férias, doença, formação: a agenda de um médico inteiro muda em segundos, sem perder a continuidade.",
      },
    ],
  },
  {
    id: "7",
    titulo: "Caso 7 — Faltou a uma análise antes da consulta",
    tipo: "problema",
    problema: "António Ribeiro faltou ontem à colheita de que depende a revisão de 28/09. Sem o sistema, só se descobre no dia da consulta.",
    passos: [
      {
        titulo: "A administrativa recebe a sugestão e aceita",
        descricao:
          "Perfil Rita Vieira (Patologia Clínica): a notificação da falta já traz a sugestão. Serviço → Remarcações → Faltas: ler o porquê e \"Aceitar\". Na ficha do António o semáforo passa de vermelho a amarelo.",
        resultado: "Colheita a 24/09 07:40 — a primeira vaga que ainda dá tempo ao resultado (2 dias) antes da consulta de 28/09. Não conta como remarcação pelo hospital.",
        acoes: [
          { etiqueta: "Remarcações (Patologia Clínica)", utilizadorId: "U08", caminho: "/servico?aba=remarcacoes" },
          { etiqueta: "Ficha do António", utilizadorId: "U08", caminho: "/doente/100102" },
        ],
        fala: "Uma falta deixa de rebentar a consulta seguinte: a solução chega à administrativa antes de ela ter de a procurar.",
      },
    ],
  },
  {
    id: "8",
    titulo: "Gestão — antecipar em vez de apagar fogos",
    tipo: "impacto",
    problema:
      "O que isto vale para quem gere: ver os prazos que vão falhar antes de falharem, saber quem ganha com uma sessão extra antes de a pagar, e os números do antes e do depois.",
    passos: [
      {
        titulo: "Prazos em risco e sessão extra",
        descricao:
          "Gestão: \"Prazos em risco nas próximas 2 semanas\" — cada pedido com a solução já proposta (vaga livre, troca, antecipar, ou sessão/vaga extra). Ao lado, \"Sessão extra\": TAC no sábado 26/09 às 08:00, 6 vagas.",
        resultado:
          "Das 6 vagas, só 2 têm quem ganhe com elas (Paula Ribeiro Nunes e Helena Duarte Matos, em diagnóstico e fora do prazo): o sistema diz para abrir só 2. \"Abrir a sessão\" cria as vagas e envia as ofertas por SMS.",
        acoes: [{ etiqueta: "Abrir Gestão", utilizadorId: "U12", caminho: "/gestao" }],
        fala: "Antes de pagar horas extra, sabe-se quem ganha com elas — e quantas vagas chegam.",
      },
      {
        titulo: "Impacto em números",
        descricao:
          "No topo da Gestão: antes das regras (60 dias), o que as regras fizeram nesta demonstração, espera por estádio, e a projecção mensal com os pressupostos à vista. Na lista de chamadas de cada serviço há também os encaixes sugeridos por dia (só sugestão).",
        resultado:
          "0 doentes remarcados uma 2.ª vez por troca (2 inevitáveis, sinalizadas), 3 doentes vulneráveis protegidos, 12/12 remarcações por avaria/ausência justificadas e validadas, 1 vaga libertada reaproveitada (13 dias ganhos), 2 deslocações evitadas (630 km), ~23% das marcações a ligar.",
        acoes: [{ etiqueta: "Abrir Gestão", utilizadorId: "U12", caminho: "/gestao" }],
      },
    ],
  },
];

interface PedidoTraduzido {
  pedido_id: string;
  tipo_pedido: string;
  tipo_pedido_legivel?: string;
  especialidade_destino: string;
  especialidade_legivel?: string;
  ato_codigo: string;
  ato_descricao?: string;
  descricao?: string;
  exames?: string[];
  analises?: string[];
  especificacao?: string;
  prioridade: string;
  prioridade_legivel?: string;
  prazo_limite: string;
  nao_antes?: string;
  depende_de?: string[];
  confianca: number;
  texto_origem: string;
  origem_dicionario?: boolean;
}

interface RespostaTradutor {
  ok: boolean;
  textoOriginal: string;
  fornecedorUsado: string;
  usouFallback: boolean;
  totalPedidos: number;
  pedidos: PedidoTraduzido[];
  alertas: string[];
  simulado: boolean;
}

interface DoenteCompleto {
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
  total_pedidos?: number;
  total_alertas?: number;
  pedidos_em_curso?: number;
}

const EXEMPLOS_TRADUTOR = [
  {
    titulo: "Cenário 1: Prescrição Multimodal (Maria Fernandes)",
    texto: "TC TAP c/ contraste + colheita c/ jejum (hemog, bioq c/ creat, CEA, CA 19.9). Rev c/ exames 1/12 comigo.",
    medico: "U01",
    explicacao: "Extrai 3 pedidos interdependentes: Análises clínicas com jejum, TC TAP com contraste, e Consulta de Revisão em 35 dias com o Dr. Pedro (continuidade obrigatória). Aplica regras R1 e R3.",
  },
  {
    titulo: "Cenário 2: Abreviatura por Aprender (Rosa Teixeira)",
    texto: "HPC 4/4s. Colheita s/ jejum (hemog, CEA). Rev c/ resultados 1/12.",
    medico: "U01",
    explicacao: "O termo 'HPC' não está inicialmente no dicionário, gerando um alerta clínico de termo desconhecido para revisão administrativa.",
  },
  {
    titulo: "Cenário 3: Abreviatura Aprendida (Carlos Mendes)",
    texto: "Mantém vigilância. HPC 4/4s. Rev 1/12 comigo.",
    medico: "U01",
    explicacao: "Quando a entrada HPC é aprendida no dicionário do Dr. Pedro, gera automaticamente o tratamento de manutenção de cateter venoso central (CVC).",
  },
  {
    titulo: "Cenário 4: Interconsulta Cirúrgica Urgente",
    texto: "Pedido de consulta urgente de Cirurgia Geral para avaliação de nódulo hepático secundário. Urgente hoje.",
    medico: "U01",
    explicacao: "Extrai pedido inter-serviços com fluxo de Triagem, prioridade Muito Prioritário (MP) e alerta de comunicação telefónica fora do sistema.",
  },
];

export function Guiao() {
  const { definirUtilizadorId, utilizadores } = usePerfil();
  const navigate = useNavigate();

  // Separador ativo: 'guiao' | 'tradutor' | 'perfil'
  const [separador, setSeparador] = useState<"guiao" | "tradutor" | "perfil">("guiao");

  // Estado do Testador de Tradução
  const [textoTradutor, setTextoTradutor] = useState(EXEMPLOS_TRADUTOR[0].texto);
  const [medicoSelecionado, setMedicoSelecionado] = useState("U01");
  const [apenasSimular, setApenasSimular] = useState(true);
  const [aTraduzir, setATraduzir] = useState(false);
  const [resultadoTradutor, setResultadoTradutor] = useState<RespostaTradutor | null>(null);
  const [erroTradutor, setErroTradutor] = useState<string | null>(null);

  // Estado da Gestão de Perfil do Paciente
  const [modoPerfil, setModoPerfil] = useState<"completar" | "criar">("completar");
  const [listaDoentes, setListaDoentes] = useState<DoenteCompleto[]>([]);
  const [doenteSelecionadoId, setDoenteSelecionadoId] = useState("");
  const [doenteEmEdicao, setDoenteEmEdicao] = useState<Partial<DoenteCompleto>>({});
  const [aGuardarPerfil, setAGuardarPerfil] = useState(false);
  const [feedbackPerfil, setFeedbackPerfil] = useState<string | null>(null);
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);

  // Formulário de Novo Utente
  const [novoNome, setNovoNome] = useState("");
  const [novoUtente, setNovoUtente] = useState("");
  const [novoSexo, setNovoSexo] = useState("F");
  const [novaDataNascimento, setNovaDataNascimento] = useState("1978-05-14");
  const [novoDiagnostico, setNovoDiagnostico] = useState("Neoplasia da mama esquerda cT2N0M0");
  const [novoEstadiamento, setNovoEstadiamento] = useState("Estádio IIa");
  const [novasAlergias, setNovasAlergias] = useState("Alergia a contraste iodado");
  const [novoContacto, setNovoContacto] = useState("912 345 678");
  const [novasNotas, setNovasNotas] = useState("Primeira consulta com suspeita diagnóstica, aguarda biópsia.");

  // Carregar lista de doentes
  function carregarDoentes() {
    apiGet<DoenteCompleto[]>("/doente")
      .then((dados) => {
        setListaDoentes(dados);
        if (dados.length > 0 && !doenteSelecionadoId) {
          setDoenteSelecionadoId(dados[0].doente_id);
          setDoenteEmEdicao(dados[0]);
        }
      })
      .catch((err) => console.error("Erro ao carregar doentes:", err));
  }

  useEffect(() => {
    carregarDoentes();
  }, []);

  useEffect(() => {
    if (doenteSelecionadoId) {
      const d = listaDoentes.find((item) => item.doente_id === doenteSelecionadoId);
      if (d) {
        setDoenteEmEdicao({ ...d });
        setFeedbackPerfil(null);
      }
    }
  }, [doenteSelecionadoId, listaDoentes]);

  function ir(acao: AcaoPasso) {
    definirUtilizadorId(acao.utilizadorId);
    navigate(acao.caminho);
  }

  async function executarTraducao() {
    if (!textoTradutor.trim()) return;
    setATraduzir(true);
    setErroTradutor(null);
    setResultadoTradutor(null);

    try {
      const resp = await apiPost<RespostaTradutor>("/oasis/tradutor/testar", {
        texto: textoTradutor,
        medicoId: medicoSelecionado,
        doenteId: doenteSelecionadoId || "100101",
        apenasSimular,
      });
      setResultadoTradutor(resp);
    } catch (e) {
      setErroTradutor(e instanceof Error ? e.message : "Falha na tradução.");
    } finally {
      setATraduzir(false);
    }
  }

  async function guardarPerfilExistente() {
    if (!doenteSelecionadoId) return;
    setAGuardarPerfil(true);
    setFeedbackPerfil(null);
    setErroPerfil(null);

    try {
      await apiPut(`/doente/${doenteSelecionadoId}`, doenteEmEdicao);
      setFeedbackPerfil(`Perfil do utente ${doenteEmEdicao.nome} atualizado com sucesso no sistema hospitalar.`);
      carregarDoentes();
    } catch (e) {
      setErroPerfil(e instanceof Error ? e.message : "Erro ao atualizar perfil.");
    } finally {
      setAGuardarPerfil(false);
    }
  }

  async function criarNovoUtente() {
    if (!novoNome.trim()) {
      setErroPerfil("Nome do utente é obrigatório.");
      return;
    }
    setAGuardarPerfil(true);
    setFeedbackPerfil(null);
    setErroPerfil(null);

    try {
      const resp = await apiPost<{ ok: boolean; doente: DoenteCompleto }>("/doente", {
        nome: novoNome,
        n_utente: novoUtente || `999${Math.floor(100000 + Math.random() * 900000)}`,
        sexo: novoSexo,
        data_nascimento: novaDataNascimento,
        diagnostico_principal: novoDiagnostico,
        estadiamento: novoEstadiamento,
        alergias: novasAlergias.split(",").map((s) => s.trim()).filter(Boolean),
        contacto: novoContacto,
        notas_clinicas: novasNotas,
      });

      setFeedbackPerfil(`Utente ${resp.doente.nome} registado com sucesso (ID: ${resp.doente.doente_id}).`);
      carregarDoentes();
      setDoenteSelecionadoId(resp.doente.doente_id);
      setModoPerfil("completar");
    } catch (e) {
      setErroPerfil(e instanceof Error ? e.message : "Erro ao registar novo utente.");
    } finally {
      setAGuardarPerfil(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header Institucional */}
      <div className="border-b border-slate-200 pb-6 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Hospital Central de Lisboa · Ambiente de Demonstração
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">Centro de Testes e Guião Clínico</h1>
            <p className="text-sm text-slate-600 mt-1">
              Explore o circuito ponta-a-ponta, teste o tradutor de linguagem natural médica com IA ou gira perfis clínicos de pacientes.
            </p>
          </div>

          {/* Navegação por Separadores */}
          <div className="flex rounded-lg border border-slate-300 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setSeparador("guiao")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                separador === "guiao"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Play className="h-3.5 w-3.5 text-oasis-accent" />
              <span>Casos da Demo</span>
            </button>

            <button
              type="button"
              onClick={() => setSeparador("tradutor")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                separador === "tradutor"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-600" />
              <span>Testador Tradutor IA</span>
            </button>

            <button
              type="button"
              onClick={() => setSeparador("perfil")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                separador === "perfil"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>Gestão de Perfil do Doente</span>
            </button>
          </div>
        </div>
      </div>

      {/* SEPARADOR 1: GUIÃO DA DEMO */}
      {separador === "guiao" && (
        <div>
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-2xs">
            <strong className="text-slate-800">Como apresentar:</strong> carregar em \"Repor demo\" e seguir os casos por esta ordem. O Caso 1
            mostra o circuito normal; os Casos 2 a 7 mostram problemas reais em que as regras de prioridade decidem; o último mostra o impacto
            em números. Cada botão já troca para o perfil certo.
          </div>

          <div className="space-y-6">
            {CASOS.map((caso) => (
              <section
                key={caso.id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  caso.tipo === "normal"
                    ? "border-emerald-200 bg-emerald-50/40"
                    : caso.tipo === "impacto"
                      ? "border-indigo-200 bg-indigo-50/40"
                      : "border-amber-200 bg-amber-50/40"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">{caso.titulo}</h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      caso.tipo === "normal"
                        ? "bg-emerald-100 text-emerald-800"
                        : caso.tipo === "impacto"
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {caso.tipo === "normal" ? "caso normal" : caso.tipo === "impacto" ? "gestão" : "a prioridade decide"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                  <strong>{caso.tipo === "impacto" ? "Para quê:" : "Problema:"}</strong> {caso.problema}
                </p>
                {caso.regras && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <ShieldAlert className="h-3 w-3" /> Regras que decidem
                    </div>
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                      {caso.regras.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <ol className="mt-3 space-y-2.5">
                  {caso.passos.map((passo, i) => (
                    <li key={passo.titulo} className="rounded-xl border border-slate-200 bg-white p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-800 text-xs font-bold text-white">
                          {caso.id}.{i + 1}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">{passo.titulo}</h3>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{passo.descricao}</p>
                      <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-1.5 text-xs font-medium text-emerald-800">
                        <strong className="text-emerald-900">Resultado esperado:</strong> {passo.resultado}
                      </div>
                      {passo.fala && (
                        <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-1.5 text-xs italic text-sky-900">
                          <strong className="not-italic">Dizer ao júri:</strong> “{passo.fala}”
                        </div>
                      )}
                      <div className="mt-2.5 flex flex-wrap gap-2 border-t border-slate-100 pt-2">
                        {passo.acoes.map((acao) => (
                          <button
                            key={acao.etiqueta}
                            type="button"
                            onClick={() => ir(acao)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:border-slate-400 hover:bg-slate-50"
                          >
                            <span>{acao.etiqueta}</span>
                            <ArrowRight className="h-3 w-3 text-slate-400" />
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
                {caso.tipo === "impacto" && (
                  <div className="mt-3">
                    <PainelImpacto recarregarCada={5000} />
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      )}

      {/* SEPARADOR 2: TESTADOR DO TRADUTOR CLÍNICO */}
      {separador === "tradutor" && (
        <div className="space-y-6">
          {/* Caixa de Configuração e Entrada */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-sky-600" />
                  <span>Laboratório de Tradução Clínica de Linguagem Natural</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Teste a extração de pedidos, catálogo de atos SNS, inferência de prazos e dependências R1/R3 a partir de texto médico livre.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={apenasSimular}
                    onChange={(e) => setApenasSimular(e.target.checked)}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span>Modo Simulação (não polui a base de dados)</span>
                </label>
              </div>
            </div>

            {/* Presets Rápidos */}
            <div className="mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                Exemplos de Prescrições Médicas Reais:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EXEMPLOS_TRADUTOR.map((ex, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setTextoTradutor(ex.texto);
                      setMedicoSelecionado(ex.medico);
                    }}
                    className={`text-left p-2.5 rounded-lg border text-xs transition-colors ${
                      textoTradutor === ex.texto
                        ? "border-sky-500 bg-sky-50 text-sky-950 font-medium"
                        : "border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 text-slate-700"
                    }`}
                  >
                    <div className="font-semibold">{ex.titulo}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 font-mono">{ex.texto}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Contexto Médico */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Médico Requisitante / Contexto:
                </label>
                <select
                  value={medicoSelecionado}
                  onChange={(e) => setMedicoSelecionado(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 bg-white"
                >
                  {utilizadores
                    .filter((u) => u.e_medico)
                    .map((m) => (
                      <option key={m.utilizador_id} value={m.utilizador_id}>
                        {m.nome} ({m.especialidade_codigo}) {m.utilizador_id === "U01" ? "— Tem Dicionário Pessoal" : ""}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Paciente de Referência:
                </label>
                <select
                  value={doenteSelecionadoId}
                  onChange={(e) => setDoenteSelecionadoId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 bg-white"
                >
                  {listaDoentes.map((d) => (
                    <option key={d.doente_id} value={d.doente_id}>
                      {d.nome} (SNS {d.n_utente})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Caixa de Texto Clínico */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Texto Clínico Livre (Campo 'P' do SOAP):
                </label>
                <span className="text-[11px] text-slate-400">
                  Experimente acrónimos, exames com contraste, ou interconsultas urgentes
                </span>
              </div>
              <textarea
                value={textoTradutor}
                onChange={(e) => setTextoTradutor(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 p-3 text-xs font-mono text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                placeholder="Exemplo: TC TAP c/ contraste + colheita c/ jejum... Rev 1/12 comigo"
              />
            </div>

            {/* Botão de Tradução */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                O agente normaliza abreviaturas, consulta atos no catálogo e calcula dependências.
              </span>
              <button
                type="button"
                onClick={executarTraducao}
                disabled={aTraduzir || !textoTradutor.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50 transition-colors shadow-2xs"
              >
                {aTraduzir ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>A Processar com IA...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Traduzir e Extrair Pedidos</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {erroTradutor && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-xs text-red-700">
              <strong>Erro no processamento:</strong> {erroTradutor}
            </div>
          )}

          {/* Resultado Estruturado */}
          {resultadoTradutor && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Resultado da Tradução Estruturada
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-700">
                    Motor: <strong>{resultadoTradutor.fornecedorUsado}</strong>
                  </span>
                  <span className="rounded bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                    {resultadoTradutor.totalPedidos} Pedido(s) Identificado(s)
                  </span>
                  {resultadoTradutor.simulado && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      Simulação
                    </span>
                  )}
                </div>
              </div>

              {/* Alertas Gerados pelo Agente */}
              {resultadoTradutor.alertas.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldAlert className="h-4 w-4 text-amber-600" />
                    <span>Alertas Clínicos & Termos Desconhecidos:</span>
                  </div>
                  {resultadoTradutor.alertas.map((alerta, idx) => (
                    <p key={idx} className="pl-5 text-amber-800">
                      • {alerta}
                    </p>
                  ))}
                </div>
              )}

              {/* Lista de Pedidos Extraídos */}
              {resultadoTradutor.pedidos.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  Nenhum pedido estruturado pôde ser inferido a partir deste texto.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {resultadoTradutor.pedidos.map((p, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 font-semibold text-white text-[10px] uppercase tracking-wider">
                          {p.tipo_pedido}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          ID: {p.pedido_id}
                        </span>
                      </div>

                      <div>
                        <div className="font-bold text-slate-900 text-sm">
                          {p.descricao || `${p.tipo_pedido} (${p.especialidade_destino})`}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Especialidade Destino: <strong>{p.especialidade_legivel || p.especialidade_destino}</strong> (Ato: {p.ato_codigo})
                        </div>
                      </div>

                      {p.especificacao && (
                        <div className="text-[11px] text-slate-600">
                          Especificação: <em>{p.especificacao}</em>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 pt-1 border-t border-slate-200">
                        <div>
                          Prioridade: <strong>{p.prioridade}</strong> ({p.prioridade_legivel || "Normal"})
                        </div>
                        <div>
                          Prazo Limite: <strong>{p.prazo_limite}</strong>
                        </div>
                        <div>
                          Confiança: <strong>{(p.confianca * 100).toFixed(0)}%</strong>
                        </div>
                      </div>

                      {p.origem_dicionario && (
                        <div className="inline-flex items-center gap-1 rounded bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          <BookOpen className="h-3 w-3" />
                          <span>Reconhecido via Dicionário do Médico</span>
                        </div>
                      )}

                      {p.depende_de && p.depende_de.length > 0 && (
                        <div className="rounded bg-sky-50 border border-sky-100 p-2 text-[11px] text-sky-800">
                          <strong>Dependência Clínica (R1/R3):</strong> Bloqueado até realização do exame/análise prévio.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Ação rápida para testar na validação */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Quer ver como a administrativa valida estes pedidos?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    definirUtilizadorId("U03");
                    navigate("/validacao");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                  <span>Abrir Fila de Validação Administrativa</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SEPARADOR 3: GESTÃO E CRIAÇÃO DE PERFIL DO DOENTE */}
      {separador === "perfil" && (
        <div className="space-y-6">
          {/* Sub-separador: Completar Existente vs Criar Novo */}
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => {
                setModoPerfil("completar");
                setFeedbackPerfil(null);
                setErroPerfil(null);
              }}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-all ${
                modoPerfil === "completar"
                  ? "border-emerald-600 text-emerald-800"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <UserCheck className="h-4 w-4" />
              <span>Completar Perfil Existente ({listaDoentes.length} Utentes)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setModoPerfil("criar");
                setFeedbackPerfil(null);
                setErroPerfil(null);
              }}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-all ${
                modoPerfil === "criar"
                  ? "border-sky-600 text-sky-800"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <UserPlus className="h-4 w-4" />
              <span>Registar Novo Utente</span>
            </button>
          </div>

          {feedbackPerfil && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600" />
              <span>{feedbackPerfil}</span>
            </div>
          )}

          {erroPerfil && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-xs text-red-700">
              <strong>Erro:</strong> {erroPerfil}
            </div>
          )}

          {/* MODO A: COMPLETAR PERFIL EXISTENTE */}
          {modoPerfil === "completar" && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Selecione o Doente a Atualizar:
                </label>
                <select
                  value={doenteSelecionadoId}
                  onChange={(e) => setDoenteSelecionadoId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 bg-white font-medium"
                >
                  {listaDoentes.map((d) => (
                    <option key={d.doente_id} value={d.doente_id}>
                      {d.nome} (SNS: {d.n_utente} · {d.sexo} · Nasc: {d.data_nascimento}) {d.demo_cenario ? `— [${d.demo_cenario}]` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Form de Edição */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nome Completo:
                  </label>
                  <input
                    type="text"
                    value={doenteEmEdicao.nome ?? ""}
                    onChange={(e) => setDoenteEmEdicao({ ...doenteEmEdicao, nome: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    N.º Utente SNS (9 dígitos):
                  </label>
                  <input
                    type="text"
                    value={doenteEmEdicao.n_utente ?? ""}
                    onChange={(e) => setDoenteEmEdicao({ ...doenteEmEdicao, n_utente: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Contacto Telefónico:
                  </label>
                  <input
                    type="text"
                    value={doenteEmEdicao.contacto ?? "910 000 000"}
                    onChange={(e) => setDoenteEmEdicao({ ...doenteEmEdicao, contacto: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Diagnóstico Principal:
                  </label>
                  <input
                    type="text"
                    value={doenteEmEdicao.diagnostico_principal ?? ""}
                    onChange={(e) => setDoenteEmEdicao({ ...doenteEmEdicao, diagnostico_principal: e.target.value })}
                    placeholder="Ex: Neoplasia do cólon ascendente"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Estadiamento Clínico:
                  </label>
                  <input
                    type="text"
                    value={doenteEmEdicao.estadiamento ?? ""}
                    onChange={(e) => setDoenteEmEdicao({ ...doenteEmEdicao, estadiamento: e.target.value })}
                    placeholder="Ex: cT3N1M0 · Estádio III"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Alergias e Contraindicações Clínicas (separadas por vírgula):
                </label>
                <input
                  type="text"
                  value={
                    Array.isArray(doenteEmEdicao.alergias)
                      ? doenteEmEdicao.alergias.join(", ")
                      : doenteEmEdicao.alergias ?? ""
                  }
                  onChange={(e) =>
                    setDoenteEmEdicao({
                      ...doenteEmEdicao,
                      alergias: e.target.value.split(",").map((s) => s.trim()),
                    })
                  }
                  placeholder="Ex: Alergia a contraste iodado, Insuficiência renal (evitar contraste nefro-tóxico)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Notas de Enquadramento Clínico & Recomendações:
                </label>
                <textarea
                  value={doenteEmEdicao.notas_clinicas ?? ""}
                  onChange={(e) => setDoenteEmEdicao({ ...doenteEmEdicao, notas_clinicas: e.target.value })}
                  rows={2}
                  placeholder="Notas adicionais para a equipa médica e triagem..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/doente/${doenteSelecionadoId}`)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                  >
                    <Search className="h-3.5 w-3.5 text-slate-500" />
                    <span>Ver Prontuário & Semáforo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      definirUtilizadorId("U01");
                      navigate("/oasis/medico");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                  >
                    <Stethoscope className="h-3.5 w-3.5 text-slate-500" />
                    <span>Criar Consulta Médica</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={guardarPerfilExistente}
                  disabled={aGuardarPerfil}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-2xs"
                >
                  {aGuardarPerfil ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>A Guardar...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Guardar e Atualizar Perfil</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* MODO B: CRIAR NOVO PACIENTE */}
          {modoPerfil === "criar" && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Registo de Novo Utente no Sistema Hospitalar
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Adiciona um novo doente à base de dados para realizar consultas, triagens ou testes de pedidos.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nome Completo*:
                  </label>
                  <input
                    type="text"
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    placeholder="Ex: Beatriz Henriques"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    N.º Utente SNS:
                  </label>
                  <input
                    type="text"
                    value={novoUtente}
                    onChange={(e) => setNovoUtente(e.target.value)}
                    placeholder="Gerado automaticamente se vazio"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Sexo:
                    </label>
                    <select
                      value={novoSexo}
                      onChange={(e) => setNovoSexo(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 bg-white"
                    >
                      <option value="F">Feminino</option>
                      <option value="M">Masculino</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Nascimento:
                    </label>
                    <input
                      type="date"
                      value={novaDataNascimento}
                      onChange={(e) => setNovaDataNascimento(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Diagnóstico Preliminar:
                  </label>
                  <input
                    type="text"
                    value={novoDiagnostico}
                    onChange={(e) => setNovoDiagnostico(e.target.value)}
                    placeholder="Ex: Neoplasia da próstata, Nódulo pulmonar suspeito"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Estadiamento:
                  </label>
                  <input
                    type="text"
                    value={novoEstadiamento}
                    onChange={(e) => setNovoEstadiamento(e.target.value)}
                    placeholder="Ex: Estádio I, Estádio IIb"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Alergias Conhecidas:
                  </label>
                  <input
                    type="text"
                    value={novasAlergias}
                    onChange={(e) => setNovasAlergias(e.target.value)}
                    placeholder="Ex: Contraste iodado, Penicilina"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Contacto Telefónico:
                  </label>
                  <input
                    type="text"
                    value={novoContacto}
                    onChange={(e) => setNovoContacto(e.target.value)}
                    placeholder="912 345 678"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Notas de Admissão:
                </label>
                <textarea
                  value={novasNotas}
                  onChange={(e) => setNovasNotas(e.target.value)}
                  rows={2}
                  placeholder="Observações clínicas iniciais..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={criarNovoUtente}
                  disabled={aGuardarPerfil || !novoNome.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50 transition-colors shadow-2xs"
                >
                  {aGuardarPerfil ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>A Criar Registo...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Registar Utente no Sistema</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
