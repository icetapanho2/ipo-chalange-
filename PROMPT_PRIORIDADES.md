# Prompt — Prioridades, remarcações, vagas libertadas e preparação

> **Estado (22/09/2026): implementado** — ver ESPECIFICACAO.md secção 8A, DECISOES.md e o Guião por
> casos (`/guiao`, `tests/guiaoCasos.test.ts`). As datas finais dos cenários estão na tabela no fim de
> PROMPTS.md. Diferenças face a este texto: "dia agrupado" é custo e não exclusão; a Helena não fica
> dentro do prazo (o prazo dela já passou), ganha 13 dias; R-I (ausência de médico) ficou por fazer.

Como usar: abrir o Claude Code na raiz do projecto e colar **o bloco abaixo inteiro**. Está
dividido em fases; o agente deve fazer commit no fim de cada fase e só avançar com `npm test`
a passar. As regras vêm primeiro, porque tudo o resto depende delas.

---

```
Lê CLAUDE.md, ESPECIFICACAO.md, DECISOES.md e PROMPTS.md por inteiro antes de escrever código.
Esta tarefa alarga o âmbito do MVP (a secção 16 da especificação punha "lista de espera
dinâmica para cancelamentos" e "regras de no-show" fora). O dono do produto aprovou o
alargamento. Por isso, o PRIMEIRO passo é actualizar a ESPECIFICACAO.md com as regras abaixo
(nova secção "8A. Regras de prioridade e remarcação" e ajustes às secções 10, 12, 13, 15 e 16),
para que a especificação continue a ser a fonte de verdade.

Mantém todas as regras de ouro do CLAUDE.md. Em particular: tudo isto é determinístico em
server/motor/ (nada de IA), toda a mudança de estado grava um evento, mexer na marcação de
outro doente é sempre uma proposta aprovada por um humano, cada decisão guarda a justificação
em linguagem simples, e "Repor demo" continua < 5 s.

=====================================================================
PARTE 1 — REGRAS (vão para a especificação e para server/motor/)
=====================================================================

R-A. Restrições duras na troca segura (quem pode ceder a vaga). Um candidato é EXCLUÍDO se:
  1. A marcação está a <= congelamento_dias (já existe).
  2. O doente já teve >= max_remarcacoes_hospital (parâmetro, valor 1) remarcações por
     iniciativa do hospital nos últimos 90 dias (eventos REMARCACAO cujo motivo não é pedido
     do doente). Objectivo: ninguém é remarcado pelo hospital uma segunda vez.
  3. O doente está em estadio_cuidado = EM_TRATAMENTO (os intervalos entre ciclos são clínicos).
  4. Não há vaga alternativa dentro do seu próprio prazo (já existe).
  5. A marcação faz parte de um "dia agrupado" com dependência no mesmo dia que ficaria partida.
  Cada exclusão guarda o motivo em texto ("Excluída: já foi remarcada 1 vez pelo hospital").

R-B. Custo de remarcar (entre os candidatos não excluídos, cede a vaga quem tem MENOR custo).
  Pontos, todos em parametros.csv (valores iniciais, a validar com a direcção clínica):
    custo_idade_75            +20  (idade >= 75, calculada de data_nascimento com o relógio único)
    custo_sem_contacto_digital +25 (contacto_digital = NENHUM: risco de não ver o aviso)
    custo_distancia_50km      +15  (distancia_km >= 50)
    custo_distancia_150km     +25  (distancia_km >= 150; substitui o anterior)
    custo_transporte          +10  (transporte_nao_urgente = 1: transporte já combinado)
    custo_dia_agrupado        +20  (tem outra marcação no mesmo dia no hospital)
    custo_estadio_novo        +30  (NOVO ou PRE_TRATAMENTO: está em diagnóstico)
    bonus_folga               -1 ponto por cada 3 dias de folga, no máximo -30
  Empate de custo → maior folga → menos remarcações → marcada há menos tempo (a ordem actual).
  A justificação da proposta passa a dizer PORQUÊ aquele doente e não outros, por exemplo:
  "Vaga de 02/10 cedida por Manuel Costa: follow-up, sem remarcações anteriores, contacto por
  SMS, prazo até 31/12, passa para 14/10. Não escolhidos: Joaquim Pereira (81 anos, sem
  telemóvel, Bragança, tem consulta no mesmo dia — custo 70); Beatriz Rocha (excluída: já
  remarcada 1 vez); Tiago Silva (excluído: em tratamento)."

R-C. Benefício de receber (ordem da fila, secção 8). Mantém folga → nível → score → antiguidade,
  mas o estadio_cuidado entra no factor "paciente" da equação de prioridade:
  NOVO / PRE_TRATAMENTO +8 pontos, EM_TRATAMENTO +5, FOLLOW_UP 0 (somados aos pontos actuais
  do estadiamento, com o mesmo máximo de 25). Mostrar isto no detalhe da equação.

R-D. Vagas protegidas (evitar que quem pode esperar gaste as vagas de curto prazo — é esta a
  causa de raiz das trocas e, portanto, das remarcações). Novo ficheiro gerado
  dados/regras_capacidade.csv: especialidade_codigo; horizonte_protegido_dias; niveis_permitidos.
  Valor inicial: só TAC (7000_2), 10 dias, MP|P. Uma vaga livre dentro do horizonte só pode ser
  ocupada por um pedido MP/P ou por um pedido que já esteja fora do prazo; a partir de
  D-libertar_protegidas_dias (parâmetro, 3) qualquer pedido pode usá-la. Um pedido N com muita
  folga passa assim para a primeira vaga fora do horizonte. Colheitas, HD, CVC e consultas NÃO
  são protegidas (não mudar o comportamento actual desses serviços).

R-E. Vaga libertada com aviso (doente desmarca, ou a lista de chamadas apura que não vem):
  - Aviso > 72 h: o sistema procura a "lista de antecipáveis" do mesmo serviço/acto e cria uma
    OFERTA DE ANTECIPAÇÃO ao melhor candidato (SMS simulado, prazo de resposta
    oferta_resposta_horas = 24). Antecipáveis, por esta ordem: (1) SEM_VAGA ou marcados depois
    do prazo; (2) estadio NOVO/PRE_TRATAMENTO com ganho >= 7 dias e aceita_antecipacao = 1;
    dentro de cada grupo, menor folga. Respeita dependências, continuidade e janela.
  - Aviso 24–72 h: só candidatos com aceita_antecipacao = 1 e distancia_km < 50.
  - Aviso < 24 h ou falta sem aviso: NÃO se contacta ninguém de fora. O sistema só sugere
    doentes que já têm marcação no hospital nesse mesmo dia (a administrativa pode propor-lhes
    ao balcão); se não houver, a vaga conta como "vaga perdida" nas métricas.
  - Uma antecipação aceite NÃO conta como remarcação (foi o doente que aceitou). Grava evento
    ANTECIPACAO. A vaga antiga do doente antecipado volta a correr R-E (cascata, no máximo
    cascata_max = 3 níveis).
  - Recusa ou expiração → oferta ao candidato seguinte. A administrativa regista a resposta
    ("Doente aceitou" / "Recusou") — a resposta por SMS é simulada na demo, nada é enviado.
  - A desmarcação pedida pelo doente também NÃO conta como remarcação pelo hospital; o pedido
    volta a ACEITE com nao_antes = "disponível a partir de" indicado pela administrativa e é
    reagendado normalmente.

R-F. Remarcação inevitável (avaria, ausência do médico) de alguém que já foi remarcado:
  continua automática (a vaga deixou de existir), mas gera alerta ALTA "2.ª remarcação",
  o doente entra na lista de chamadas e o seu pedido fica na frente da fila para a nova vaga.

R-G. Preparação e confirmação (evitar exames perdidos por falta de jejum, contraste sem
  creatinina, medicação, etc.). NÃO é ligar a toda a gente:
  1. Novo ficheiro gerado dados/preparacoes.csv: especialidade_codigo; ato_codigo; instrucoes;
     requer_confirmacao (texto provisório, marcado "a validar com o serviço").
  2. Ao marcar, o sistema gera a comunicação ao doente (canal = contacto_digital: SMS, EMAIL ou
     CARTA) com data, hora, local e as instruções de preparação. Simulada: fica registada numa
     nova colecção comunicacoes_doente e aparece na timeline do doente.
  3. Lembrete a D-3 com pedido de confirmação ("responda 1 para confirmar, 2 para desmarcar").
  4. LISTA DE CHAMADAS diária da administrativa (novo separador na página do serviço): só
     entram os doentes dos próximos 7 dias com risco. Motivos (mostrar todos os que se aplicam):
     sem contacto digital; idade >= 80; preparação que requer confirmação (ex.: TC com contraste
     e diabetes/metformina nas notas clínicas); faltas anteriores >= 1 nos últimos 12 meses;
     2.ª remarcação (R-F); lembrete sem resposta. Acções: "Confirmado", "Não atendeu", "Vai
     desmarcar" (→ R-E com a antecedência real). Cada acção grava evento.
  5. Risco de falta = soma simples destes motivos (determinística, sem IA). Serve só para
     ordenar a lista de chamadas; nunca penaliza o doente nem baixa a sua prioridade.

R-H. Dia único para doentes de longe: se distancia_km >= distancia_agrupar_km (parâmetro, 50) e
  existe, dentro da janela do pedido, um dia em que o doente já tem marcação no hospital, o
  agendamento prefere a primeira vaga compatível desse dia (com >= 30 min de intervalo da outra
  marcação e respeitando intervalos de resultado das dependências), em vez da primeira vaga
  absoluta. Nunca ultrapassa o prazo por causa disto. Para estes doentes, evitar vagas antes das
  10:00 quando houver alternativa no mesmo dia. Justificação: "Marcado a 01/10, dia em que já
  vem à consulta (mora em Bragança, 210 km): evita uma deslocação."

R-I. Ausência de médico / bloqueio de agenda: generalizar server/motor/avarias.ts para aceitar
  também "ausência de médico" (bloqueia as vagas desse médico na janela). O reagendamento usa
  as mesmas regras (R-A a R-F). Reaproveitar o máximo possível do código das avarias.

=====================================================================
PARTE 2 — DADOS (gerar_dados.py + verificar_dados.py; NUNCA editar CSV à mão)
=====================================================================

1. Novas colunas em doentes.csv: concelho; distancia_km; contacto_digital (SMS|EMAIL|NENHUM);
   aceita_antecipacao (0|1); transporte_nao_urgente (0|1). Doentes de fundo: distribuição
   realista (maioria Grande Lisboa, ~15 % a > 50 km, ~12 % sem contacto digital, sobretudo
   os mais velhos). Faltas anteriores calculam-se do histórico (eventos FALTA), não são coluna.
2. Doentes 100101–100108: preencher estes campos de forma a NÃO mudar nenhum resultado
   esperado actual (Manuel 100106: Lisboa, 12 km, SMS, 69 anos → custo 0 + bónus de folga).
   Maria 100101: acrescentar "Diabetes tipo 2 — metformina" às notas clínicas (serve R-G).
3. Novos doentes-cenário (demo_cenario preenchido):
   - 100109 Joaquim Alves Pereira, M, 81 anos, Bragança, 210 km, contacto NENHUM (só telefone
     fixo), transporte_nao_urgente = 1, FOLLOW_UP. TC AP de controlo MARCADO a 01/10 09:00 e
     consulta de revisão (2102) MARCADA no MESMO dia 01/10 11:00. Prazo do TC 31/01/2027 (MAIS
     folga do que o Manuel: pela regra antiga seria ele a ceder a vaga ao José).
   - 100110 Beatriz Sousa Rocha, F, 52 anos, Lisboa, SMS, FOLLOW_UP. TC marcado a 01/10 10:00,
     prazo 15/01/2027, já com 1 remarcação pelo hospital há 3 semanas (evento REMARCACAO).
   - 100111 Tiago Marques Silva, M, 47 anos, Oeiras, SMS, EM_TRATAMENTO (QT). TC de avaliação de
     resposta a meio do tratamento marcado a 02/10 08:00, prazo 09/10.
   - 100112 Helena Duarte Matos, F, 58 anos, Almada, 15 km, SMS, aceita_antecipacao = 1, NOVO
     (suspeita de neoplasia do pâncreas). TC TAP MP marcado a 13/10 (TAC cheio quando foi
     marcado por um humano no Oasis), prazo 06/10 → está marcada FORA do prazo.
   - 100113 Rui Fonseca Lima, M, 66 anos, Lisboa, EMAIL, FOLLOW_UP. TC AP marcado a 30/09 09:00,
     prazo 31/12. É ele quem vai desmarcar ao vivo.
4. Reservas de vagas (função reservar do gerador): TAC suficientes a 14/10 para Manuel, Maria,
   Joaquim e Beatriz caberem como alternativas (as primeiras 4 continuam a ser as mesmas —
   acrescentar ao fim do dia); colheitas livres a 01/10 para o cenário "dia único" do Joaquim;
   TAC livres a partir de 19/10 para o Rui.
5. verificar_dados.py passa a verificar, com as regras NOVAS: Manuel é o candidato de menor
   custo para o José; Joaquim teria sido o escolhido pela regra antiga (só folga); Beatriz e
   Tiago estão excluídos; nenhum doente de fundo ganha ao Manuel; Helena é a primeira da lista
   de antecipáveis para uma vaga de TAC a 30/09; Joaquim aparece na lista de chamadas.
6. Correr gerar_dados.py e verificar_dados.py até dar OK.

=====================================================================
PARTE 3 — ALTERAÇÕES AO CÓDIGO (por fases, commit no fim de cada uma)
=====================================================================

Fase P1 — Motor (R-A, R-B, R-C, R-D, R-F)
- server/motor/prioridade.ts: estádio no factor paciente (R-C).
- Nova função pura avaliarCandidatosTroca(pedidoUrgente, quando, opcoes?) em
  server/motor/agendamento.ts (ou server/motor/remarcacao.ts): devolve TODOS os candidatos
  avaliados — excluídos com motivo, e os restantes com custo parcela a parcela. É a MESMA função
  que procurarTrocaSegura usa para escolher (a demo mostra a lógica real, não uma cópia).
  opcoes permite sobrepor atributos de doentes e pesos SEM mutar o store (para o simulador).
- procurarTrocaSegura passa a usar R-A/R-B; a justificação inclui os não escolhidos.
- Vagas protegidas (R-D) em encontrarVagaLivre, com o motivo registado no evento de marcação.
- Remarcação inevitável (R-F) nas avarias.

Fase P2 — Vagas libertadas (R-E)
- Nova colecção ofertas_antecipacao (PENDENTE|ACEITE|RECUSADA|EXPIRADA) no store.
- Funções: desmarcarAPedidoDoDoente(pedido, disponivelAPartirDe), procurarAntecipaveis(vaga),
  criarOferta, responderOferta(aceita|recusa) com cascata.
- Rotas em server/routes/servico.ts e UI na página do serviço (separador "Vagas libertadas":
  ofertas pendentes, botões "Doente aceitou" / "Recusou"). Botão "Desmarcar a pedido do doente"
  na marcação (página do serviço e ficha do doente).
- Sugestão "doentes já no hospital hoje" para vagas libertadas < 24 h.

Fase P3 — Preparação e lista de chamadas (R-G)
- comunicacoes_doente geradas na marcação e a D-3 (simuladas), visíveis na timeline do doente.
- Separador "Lista de chamadas" na página do serviço, com motivos e acções.

Fase P4 — Dia único e horários (R-H) + ausência de médico (R-I).

Fase P5 — Métricas (Gestão, com a etiqueta "Dados simulados")
- % de doentes com >= 1 e >= 2 remarcações pelo hospital (meta: >= 2 = 0).
- Vagas libertadas com aviso e % reocupadas por antecipação; vagas perdidas (falta sem aviso).
- % dentro do prazo por estádio do percurso (NOVO/PRE_TRATAMENTO vs FOLLOW_UP).
- Deslocações evitadas pelo "dia único".
- Chamadas feitas e desfecho (confirmado / desmarcou / não atendeu).
- "Pedidos que não cabem no prazo" por serviço = SEM_VAGA + marcados depois do prazo. Só
  conta pedidos reais; nunca estima procura futura nem inventa doentes.
- O gerador pode acrescentar algumas antecipações/chamadas às últimas 2 semanas do histórico
  para as métricas não aparecerem vazias.

Fase P6 — Zona da demo para o júri (ver Parte 4) + testes.

=====================================================================
PARTE 4 — DEMO: MOSTRAR AS PRIORIDADES AO JÚRI
=====================================================================

A. Painel "Porquê esta escolha?" em cada proposta de troca (página do serviço, perfil
   Radiologia): tabela com todos os candidatos avaliados por avaliarCandidatosTroca — nome,
   estádio, idade, distância, contacto, remarcações, folga, parcelas do custo, custo total,
   e "Excluído: motivo" a cinzento. O escolhido destacado. Uma linha no topo:
   "Pela regra antiga (só folga) seria escolhido Joaquim Pereira."

B. "Laboratório de prioridades" (novo separador em /gestao/prioridade), para o júri mexer ao vivo:
   - escolher o cenário "TC do José (TAC cheio)";
   - ver a tabela do painel A;
   - alterar temporariamente atributos (ex.: idade do Manuel para 82, "sem telemóvel", ou
     retirar a remarcação da Beatriz) e os pesos do custo, e ver a escolha mudar na hora;
   - botão "Repor valores". Usa POST /api/prioridades/simular, que chama
     avaliarCandidatosTroca com opcoes e NUNCA altera o estado.

C. Novos passos no Guião (/guiao), a seguir aos 8 actuais, com "Resultado esperado" e texto
   para dizer ao júri:
   9. "Quem cede a vaga?" — reabrir a proposta do José (passo 2) e mostrar o painel A.
      Fala: "O TAC está cheio até 13/10. O sistema avaliou todos os doentes marcados na janela.
      Excluiu a Beatriz porque já foi remarcada uma vez — nunca remarcamos alguém duas vezes —
      e o Tiago porque está a meio da quimioterapia. O Sr. Joaquim tem mais folga, mas tem 81
      anos, não tem telemóvel, vem de Bragança e tem consulta no mesmo dia: mexer-lhe custa
      muito mais. O Manuel está em vigilância, recebe SMS e continua dentro do prazo. A
      Radiologia aprova — é sempre um humano que decide."
   10. "Laboratório" — mudar a idade do Manuel para 82 e "sem telemóvel" → a escolha muda.
       Fala: "As regras são da direcção clínica; o sistema aplica-as e mostra sempre porquê."
   11. "Um doente desmarca" — Rui (100113) liga a desmarcar o TC de 30/09 (disponível a partir de
       19/10). O sistema oferece a vaga à Helena (100112: em diagnóstico, marcada fora do prazo
       a 13/10). "Doente aceitou" → Helena passa para 30/09 09:00, dentro do prazo, sem contar
       como remarcação; a vaga de 13/10 volta a correr a lista; o Rui é reagendado a partir de
       19/10. Fala: "Uma desmarcação com uma semana de aviso deixou de ser uma vaga perdida."
   12. "Lista de chamadas" — perfil administrativa: o Sr. Joaquim aparece (81 anos, sem
       telemóvel, TC). A Maria aparece por preparação do TC com contraste (metformina).
       Fala: "Não ligamos a toda a gente: só a quem o sistema identifica como risco."
   13. "Dia único" — o Dr. Pedro pede uma colheita s/ jejum para o Joaquim com prazo de 15 dias
       → marcada a 01/10 (dia em que já vem ao TC e à consulta), não a 24/09.
   14. Gestão — novas métricas (remarcações, vagas reocupadas, deslocações evitadas).
   Os passos 9–14 têm de funcionar a seguir aos passos 1–8, pela ordem, e de novo após
   "Repor demo".

=====================================================================
PARTE 5 — TESTES E DEFINIÇÃO DE FEITO
=====================================================================

- Os 8 resultados esperados actuais (tabela no fim de PROMPTS.md) NÃO podem mudar, datas e horas
  incluídas. Se alguma regra nova os mudar, pára e explica-me antes de alterar uma data.
- tests/cenarios.test.ts e tests/guiao.test.ts: um teste por cada passo 9–14 com o resultado
  exacto (datas e horas confirmadas contra os dados gerados). Acrescentar essas linhas à tabela
  de PROMPTS.md.
- tests/prioridade.test.ts: testes unitários de R-A (cada exclusão), R-B (cada parcela e
  empates), R-C, R-D (N com folga não entra em vaga protegida; MP entra; D-3 liberta),
  R-E (cada janela de aviso, cascata, recusa → seguinte, antecipação não conta como
  remarcação), R-F, R-G (motivos da lista de chamadas), R-H (nunca ultrapassa o prazo).
- O simulador não muta o estado (teste: snapshot do store antes/depois igual).
- npm test, tsc e npm run build limpos. Registar cada decisão ambígua em DECISOES.md.
- Correr o guião completo (1–14) duas vezes seguidas após "Repor demo", no browser.
```
