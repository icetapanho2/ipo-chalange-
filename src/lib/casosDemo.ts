// Casos da demonstração (página /guiao e modo tutorial). Os resultados esperados são os de
// tests/guiaoCasos.test.ts — correr os casos por esta ordem, depois de "Repor demo".

export interface AcaoPasso {
  etiqueta: string;
  utilizadorId: string;
  caminho: string;
  /** Selector do elemento a destacar no modo tutorial (sem ele, destaca-se a página). */
  alvo?: string;
}

export interface Passo {
  titulo: string;
  descricao: string;
  resultado: string;
  acoes: AcaoPasso[];
  /** O que dizer ao júri neste passo. */
  fala?: string;
  /** Texto pronto a copiar (ex.: o diário da consulta com o plano P/). */
  copiar?: { rotulo: string; texto: string };
}

/** Diário da Maria no Caso 1: o assistente lê o "P/" e pré-selecciona os 3 pedidos. */
export const DIARIO_MARIA =
  "Doente de 66 anos com adenocarcinoma do cólon, em vigilância após quimioterapia adjuvante. Sem queixas de novo desde a última avaliação; " +
  "peso estável, bom estado geral. Exame objectivo sem alterações. Diabetes tipo 2 medicada com metformina.\n" +
  "P/ TC TAP; cons. Onco; rev c/ exames comigo";

export interface Caso {
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
export const CASOS: Caso[] = [
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
          "Dr. Pedro, primeira doente do dia (08:30; sem pedidos pendentes). Os ícones ao lado abrem o perfil, os pedidos, a folha clínica e os exames. Colar o diário abaixo: termina com o plano em abreviaturas depois de \"P/\". Em \"Guardar & Seguinte\" o assistente lê o P/ e o ecrã seguinte já traz os 3 pedidos seleccionados e preenchidos: TC TAP (exame — marcado logo), pedido de consulta de Oncologia Médica (vai para a triagem desse serviço) e próxima consulta com o Dr. Pedro, depois do TC (marcada logo). O médico confere, pode mudar o que quiser, e submete.",
        resultado:
          "A confirmação mostra o que aconteceu a cada pedido: TC 14/10 08:20 → próxima consulta com o Dr. Pedro 21/10 08:30 (só depois do resultado do TC — dependência); a interconsulta segue para a triagem da Oncologia Médica. A ficha da Maria fica logo com 2 marcados e 1 em triagem. (O assistente desliga-se em Definições.)",
        copiar: { rotulo: "Diário da consulta (com o plano P/)", texto: DIARIO_MARIA },
        acoes: [{ etiqueta: "Agenda do Dr. Pedro", utilizadorId: "U01", caminho: "/oasis/medico" }],
        fala: "O médico declara os pedidos uma vez. O sistema percebe as dependências e marca tudo pela ordem certa, sem papel.",
      },
      {
        titulo: "Maria — cada serviço recebe o que é seu",
        descricao:
          "Triador de Oncologia Médica: a Maria está em primeiro na fila (\"Novo\") → Aceitar & Agendar (ou Reencaminhar — só para serviços com triagem: Radioterapia e Hospital de Dia; o triador de lá é avisado). Ver também a administrativa do TAC (Serviço → Pedidos e avisos): o pedido da Maria aparece em primeiro, marcado como novo. Em \"Os meus pedidos\" do Dr. Pedro, a Maria aparece com tudo marcado.",
        resultado:
          "Consulta de Oncologia Médica marcada no momento em que é aceite; o Dr. Pedro recebe a notificação e a ficha da Maria passa a \"Tudo em ordem · 3 marcados\" — sem recarregar a página.",
        acoes: [
          { etiqueta: "Triagem (Onc. Médica)", utilizadorId: "U04", caminho: "/triagem?doente=100101", alvo: '[data-tour="triagem-100101"]' },
          { etiqueta: "Pedidos (TAC)", utilizadorId: "U07", caminho: "/servico?aba=pedidos" },
          { etiqueta: "Os meus pedidos (Dr. Pedro)", utilizadorId: "U01", caminho: "/meus-pedidos?doente=100101" },
        ],
      },
      {
        titulo: "Maria — tudo na ficha",
        descricao:
          "Abrir a ficha da Maria: o percurso dos pedidos com cada marcação (e a dependência da consulta em relação ao TC), a folha clínica com o diário de hoje e as mensagens que ela recebeu (aviso com a preparação do exame e lembretes a D-3).",
        resultado: "\"Tudo em ordem · 3 marcados\": tudo o que foi pedido está marcado, dentro do prazo, e a doente já sabe o que tem de fazer.",
        acoes: [{ etiqueta: "Ficha da Maria", utilizadorId: "U01", caminho: "/doente/100101", alvo: '[data-tour="ficha-resumo"]' }],
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
        titulo: "Radiologia: \"Porquê esta escolha?\"",
        descricao:
          "O Dr. Pedro pediu o TC do José ontem; como não havia vaga, o sistema preparou logo uma proposta de troca para a Radiologia. Serviço → Para decidir → Trocas de vaga: abrir \"Porquê esta escolha?\" — todos os doentes avaliados, as exclusões e o custo de cada um. Aprovar.",
        resultado:
          "Cede a vaga Manuel Costa (follow-up, SMS, prazo 31/12): 02/10 10:00 → 14/10 08:00 (vaga reservada desde que a proposta foi criada). Excluídos: Beatriz (já remarcada uma vez) e Tiago (em quimioterapia). Pela regra antiga seria o Sr. Joaquim — mais folga, mas 81 anos, sem telemóvel, Castelo Branco, ambulância e consulta no mesmo dia: custo 70 contra −30.",
        acoes: [{ etiqueta: "Propostas (Radiologia)", utilizadorId: "U07", caminho: "/servico?aba=decidir", alvo: "#trocas" }],
        fala: "O sistema não decide sozinho: propõe, explica porquê em linguagem simples, e um humano aprova.",
      },
      {
        titulo: "Laboratório: e se as regras fossem outras?",
        descricao:
          "Na Gestão, abrir o Laboratório de prioridades. Pôr as \"Remarcações\" do Manuel a 1: ele passa a estar protegido e a escolha muda. Experimentar também os pesos das regras.",
        resultado: "Com o Manuel já remarcado, cede a vaga a Graça Pereira Santos (custo 49); o Sr. Joaquim continua protegido.",
        acoes: [{ etiqueta: "Laboratório de prioridades", utilizadorId: "U12", caminho: "/gestao/laboratorio", alvo: '[data-tour="laboratorio"]' }],
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
        acoes: [{ etiqueta: "Vagas libertadas (Radiologia)", utilizadorId: "U07", caminho: "/servico?aba=vagas", alvo: '[data-tour="vagas-libertadas"]' }],
      },
      {
        titulo: "A Helena aceita",
        descricao: "Clicar em \"Doente aceitou\" (a resposta ao SMS é simulada). Abrir \"Porquê esta pessoa?\" para ver a lista ordenada.",
        resultado:
          "Helena passa para 30/09 09:00 e ganha 13 dias, sem contar como remarcação. A vaga dela de 13/10 é oferecida automaticamente a Luís Martins Alves (cascata).",
        acoes: [
          { etiqueta: "Vagas libertadas (Radiologia)", utilizadorId: "U07", caminho: "/servico?aba=vagas", alvo: '[data-tour="vagas-libertadas"]' },
          { etiqueta: "Ficha da Helena", utilizadorId: "U07", caminho: "/doente/100112", alvo: '[data-tour="ficha-resumo"]' },
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
          { etiqueta: "Agenda do Dr. Pedro", utilizadorId: "U01", caminho: "/oasis/medico", alvo: '[data-tour="agenda"]' },
          { etiqueta: "Ficha do Joaquim", utilizadorId: "U08", caminho: "/doente/100109", alvo: '[data-tour="ficha-resumo"]' },
        ],
      },
      {
        titulo: "Lista de chamadas da Radiologia",
        descricao: "Separador \"Chamadas\": o Sr. Joaquim aparece (sem contacto digital, 81 anos); a Maria não aparece — tem SMS e o TC não precisa de preparação especial, chega o SMS com o lembrete.",
        resultado: "Cerca de 1 em cada 5 marcações precisa de chamada; as restantes ficam só com o SMS/email e o lembrete a D-3.",
        acoes: [{ etiqueta: "Lista de chamadas (Radiologia)", utilizadorId: "U07", caminho: "/servico?aba=chamadas", alvo: '[data-tour="chamadas"]' }],
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
        acoes: [{ etiqueta: "Reportar avaria (Técnico)", utilizadorId: "U13", caminho: "/tecnico", alvo: '[data-tour="tecnico-avaria"]' }],
      },
      {
        titulo: "A administrativa revê o plano e aceita",
        descricao:
          "Serviço → Para decidir → Remarcações propostas: as 5 propostas por ordem do índice, com a vaga sugerida, o porquê e os avisos (carregar no índice mostra cada ponto). \"Aceitar todas\" aplica as 4 que têm solução.",
        resultado:
          "1.º Sónia (MP, em diagnóstico, 717) → 25/09 10:40, a única vaga no prazo. 2.º Artur (MP, 621) → 28/09 11:00, 3 dias fora do prazo, com aviso. 3.º Fátima (em QT) → 28/09 12:00, aviso \"2.ª remarcação — ligar\". 4.º Olga (84 anos, Santarém) → 01/10 11:40, no dia da consulta dela. 5.º Diogo (índice 134) → sem vaga a tempo (ver passo seguinte).",
        acoes: [{ etiqueta: "Remarcações (Ecografia)", utilizadorId: "U11", caminho: "/servico?aba=decidir", alvo: "#remarcacoes" }],
        fala: "Cinco remarcações em segundos, cada uma com o porquê. Quem decide continua a ser a administrativa.",
      },
      {
        titulo: "Diogo: sem vaga a tempo — alerta",
        descricao:
          "O Diogo tem revisão com a Dra. Sofia a 29/09 que precisa do resultado da ecografia (3 dias): o exame teria de ser até 26/09 e a única vaga (25/09) ficou para a Sónia, com índice 717 contra 134. O cartão fica a vermelho, com um alerta, e três saídas: \"Resolvi com vaga extra\" (já sugere 25/09 13:30), \"Resolvi com outsourcing\", ou \"Não há solução — enviar ao médico\". Para a demo: enviar ao médico.",
        resultado: "A Dra. Sofia recebe a notificação \"Decisão necessária: Diogo Almeida Reis — revisão de 29/09\". (Com vaga extra, o exame ficaria a 25/09 13:30 e a consulta mantinha-se.)",
        acoes: [{ etiqueta: "Remarcações (Ecografia)", utilizadorId: "U11", caminho: "/servico?aba=decidir", alvo: "#remarcacoes" }],
        fala: "Quem tem menos prioridade não fica esquecido: fica um alerta com as opções, e se a administração não resolve, decide o médico.",
      },
      {
        titulo: "A médica decide: adiar a consulta",
        descricao:
          "Perfil Dra. Sofia Lemos → Os Meus Pedidos: \"Exame sem vaga a tempo da consulta — decida\". Opções: avançar com a consulta a 29/09 e ver a ecografia depois (28/09), ou adiar a consulta (data mínima sugerida 01/10). Escolher \"Adiar\" com 01/10.",
        resultado: "Consulta adiada para 06/10 09:30 (primeiro dia livre da Dra. Sofia a partir de 01/10); ecografia a 28/09 12:40, a tempo do resultado. O doente e a administrativa são avisados; o técnico recebe \"avaria resolvida\".",
        acoes: [
          { etiqueta: "Os Meus Pedidos (Dra. Sofia)", utilizadorId: "U02", caminho: "/meus-pedidos", alvo: '[data-tour="meus-pedidos"]' },
          { etiqueta: "Ficha do Diogo", utilizadorId: "U02", caminho: "/doente/100117", alvo: '[data-tour="ficha-resumo"]' },
        ],
      },
    ],
  },
  {
    id: "6",
    titulo: "Caso 6 — Faltou a uma análise antes da consulta",
    tipo: "problema",
    problema: "António Ribeiro faltou ontem à colheita de que depende a revisão de 28/09. Sem o sistema, só se descobre no dia da consulta.",
    passos: [
      {
        titulo: "A administrativa recebe a sugestão e aceita",
        descricao:
          "Perfil Rita Vieira (Patologia Clínica): a notificação da falta já traz a sugestão. Serviço → Para decidir → Remarcações propostas (falta): ler o porquê e \"Aceitar\". Na ficha do António o semáforo passa de vermelho a amarelo.",
        resultado: "Colheita a 24/09 07:30 — a primeira vaga que ainda dá tempo ao resultado (2 dias) antes da consulta de 28/09. Não conta como remarcação pelo hospital.",
        acoes: [
          { etiqueta: "Remarcações (Patologia Clínica)", utilizadorId: "U08", caminho: "/servico?aba=decidir", alvo: "#remarcacoes" },
          { etiqueta: "Ficha do António", utilizadorId: "U08", caminho: "/doente/100102", alvo: '[data-tour="ficha-resumo"]' },
        ],
        fala: "Uma falta deixa de rebentar a consulta seguinte: a solução chega à administrativa antes de ela ter de a procurar.",
      },
    ],
  },
  {
    id: "7",
    titulo: "Gestão — antecipar em vez de apagar fogos",
    tipo: "impacto",
    problema:
      "O que isto vale para quem gere: saber onde pôr capacidade antes de os prazos falharem (e onde uma sessão extra não resolve nada), quem ganha com ela antes de a pagar, e os números do antes e do depois.",
    passos: [
      {
        titulo: "Sem vaga a tempo: a administrativa pede vaga extra",
        descricao:
          "Joana (Onc. Cirúrgica) → Serviço → Para decidir → \"Sem vaga no prazo\": a consulta da Fernanda Ribeiro só pode ser depois dos exames (09/11) e a agenda acaba a 04/11. Três saídas: pedir vaga extra (horas extra — decide a gestão), outsourcing, ou enviar ao médico. Carregar em \"Pedir vaga extra\" (já vem 09/11 às 18:00) → \"Pedir à gestão\".",
        resultado: "O pedido fica \"à espera de aprovação\" e o gestor recebe a notificação \"Vaga extra pedida\".",
        acoes: [{ etiqueta: "Para decidir (Onc. Cirúrgica)", utilizadorId: "U03", caminho: "/servico?aba=decidir", alvo: "#sem-vaga" }],
      },
      {
        titulo: "A gestão decide a vaga extra",
        descricao:
          "Dr. Nuno Reis (gestão): \"Pedidos de vaga extra dos serviços\" no topo da Gestão. Aprovar e marcar — ou recusar com o motivo (volta à Joana, que resolve com outsourcing ou passa ao médico, que aceita ou adia).",
        resultado:
          "Aprovada: a Fernanda fica marcada na hora escolhida; a Joana, o médico e a doente são avisados, e o pedido sai de \"Para decidir\" sem recarregar a página.",
        acoes: [{ etiqueta: "Pedidos de vaga extra (Gestão)", utilizadorId: "U12", caminho: "/gestao?vagas-extra=1", alvo: "#vagas-extra" }],
        fala: "As horas extra deixam de ser pedidas por telefone: chegam à gestão com o doente, o prazo e o porquê, e decide-se num clique.",
      },
      {
        titulo: "Onde pôr capacidade e sessão extra",
        descricao:
          "Gestão: \"Onde falta capacidade — próximas 2 semanas\", por serviço: o que a administrativa resolve com as vagas que tem, o que só uma sessão extra resolve, e o que está parado à espera de exames de outro serviço. As consultas de Cirurgia em risco esperam pelo TAC e pelas análises: sessão extra de Cirurgia não adiantava — o estrangulamento é o TAC. \"Preparar sessão extra\" no TAC (sábado 26/09 às 08:00) mostra quem ganha com cada vaga.",
        resultado:
          "Das 6 vagas, só 2 têm quem ganhe com elas (Paula Ribeiro Nunes e Helena Duarte Matos, em diagnóstico e fora do prazo): o sistema diz para abrir só 2. \"Abrir a sessão\" cria as vagas e envia as ofertas por SMS.",
        acoes: [{ etiqueta: "Abrir Gestão", utilizadorId: "U12", caminho: "/gestao", alvo: '[data-tour="capacidade"]' }],
        fala: "Antes de pagar horas extra, sabe-se onde servem, quem ganha com elas e quantas vagas chegam — e onde não servem de nada.",
      },
      {
        titulo: "Impacto em números",
        descricao:
          "Gestão → \"Impacto\". Primeiro, por mês, antes → com as regras, com o cálculo à vista: faltas no TAC 26 → 18 (8 vagas × 120 € = 960 €/mês), faltas em todos os serviços 89 → 62, chamadas só a ~23% das marcações. Os dois pressupostos (30% de faltas evitadas com lembrete + chamada; 120 € por vaga de TAC) estão em parametros.csv para validar. Depois, os contadores do que as regras fizeram nesta demonstração — cada um diz que caso o activa.",
        resultado:
          "Depois do guião: 3 doentes vulneráveis protegidos (0 remarcados uma 2.ª vez), 1/1 vaga libertada reaproveitada (13 dias ganhos), 2 deslocações evitadas (630 km), 5/5 remarcações por avaria validadas, 1/1 falta com remarcação aceite, 1/1 vaga extra decidida.",
        acoes: [{ etiqueta: "Abrir Gestão", utilizadorId: "U12", caminho: "/gestao", alvo: '[data-tour="impacto"]' }],
      },
    ],
  },
];
