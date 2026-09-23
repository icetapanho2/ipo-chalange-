# Decisões

Registo de decisões tomadas durante a construção, quando a especificação era ambígua e foi necessário escolher a opção mais simples e coerente. Formato: data, fase, dúvida, decisão.

## 2026-09-21 — Fase 2 — Como testar o motor sem a extracção (Fase 4) ainda existir

PROMPTS.md pede que `tests/cenarios.test.ts` já cubra toda a tabela de resultados esperados
(incluindo os doentes Maria, Rosa e Carlos, cujo ponto de partida é o médico escrever um plano
e a IA extrair pedidos), mas a extracção só é construída na Fase 4. Decisão: `server/motor/`
mantém-se 100% independente de IA (só recebe pedidos já estruturados); criei
`tests/helpers/planoDemo.ts`, um ajudante *só de teste*, que lê `dados/demo_extracoes_cache.json`
(o mesmo ficheiro que o fornecedor `cache` da extracção vai usar na Fase 4) e constrói os
pedidos EXTRAIDO correspondentes. As dependências entre pedidos do mesmo plano (Maria: revisão
depende do TC e da colheita; Rosa: idem) não são copiadas do campo `depende_de` da cache — são
reconstruídas chamando `aplicarR1`/`aplicarR3` a partir do texto, para testar a regra a sério
em vez de aceitar um atalho. Quando a Fase 4 construir `server/extracao/`, este ajudante de
teste pode ser substituído pela chamada real ao extractor em modo `cache`; os testes do motor
continuam válidos porque testam exactamente a mesma fronteira (pedidos EXTRAIDO → motor).

## 2026-09-21 — Fase 2 — Ordem de desempate nas vagas com o mesmo horário

Várias especialidades têm mais do que um gabinete/recurso com exactamente os mesmos horários
no mesmo dia (ex.: duas salas de colheita a começar às 07:30 de 10 em 10 min; quatro cadeirões
de Hospital de Dia). `gerar_dados.py` escreve `vagas.csv` pela ordem de geração (dia → gabinete
→ hora), não por hora global; para desempatar entre vagas com a mesma `data_hora` da mesma
forma que os dados foram gerados, `encontrarVagaLivre` ordena por `data_hora` (string ISO,
ordenável lexicograficamente) com `Array.prototype.sort` — que é estável — preservando a ordem
do ficheiro CSV nos empates. Confirmado empiricamente contra `dados/vagas.csv`: reproduz
exactamente as horas esperadas na tabela da demo (ex.: colheitas de 24/09 às 07:30 e 07:40).

## 2026-09-21 — Fase 2 — R2 (colheita pré-QT): tipo de colheita e regra do "amanhã + 1 dia útil"

## 2026-09-21 — Fase 8 — Três correcções encontradas ao construir /gestao

Construir as métricas de gestão expôs três problemas nas fases anteriores, corrigidos aqui:
1. `server/index.ts`/`server/routes/sistema.ts` nunca chamavam `recalcularAlertas()` no
   arranque nem depois de "Repor demo" (só depois de acções feitas pelas rotas de
   validação/triagem/serviço) — corrigido: chamado uma vez no arranque do servidor e outra
   vez dentro de `POST /api/repor-demo`, tal como a especificação pede ("recalculados no
   arranque e depois de cada acção").
2. `server/routes/gestao.ts` e `server/routes/sistema.ts` usavam `Date.now()`/`new Date()`
   directamente para a antiguidade dos pendentes e o carimbo de "Repor demo" — contra a Regra
   de ouro #1. Corrigido para usar sempre `agora()` de `server/clock.ts`.
3. As métricas de triagem (aceites/recusados/reencaminhados) davam sempre 0 para recusados e
   reencaminhados: `gerar_dados.py` regista essas decisões com `tipo="TRIAGEM"` (distinguindo
   pelo `estado_novo`), enquanto `server/motor/fluxo.ts` usa tipos mais específicos
   (`RECUSA`, `REENCAMINHAMENTO`). Em vez de forçar os dados históricos a mudar, a métrica em
   `server/routes/gestao.ts` passou a identificar a decisão pela transição de estado
   (`estado_anterior === "EM_TRIAGEM"` e o `estado_novo`), não pelo campo `tipo` — funciona
   com os dois formatos.

## 2026-09-21 — Fase 6 — O que a triagem vê do doente

PROMPTS.md diz que a triagem só vê "o pedido + o texto do plano de origem (só isso, nada do
resto do doente)", mas ESPECIFICACAO.md secção 3 (fonte de verdade) diz que o serviço de
destino vê "identificação do doente, médico e serviço requisitante, o pedido..., o texto do
plano... e as dependências desse pedido. Não vê os outros pedidos nem o perfil completo."
Segui a especificação (CLAUDE.md manda-o fazer quando há contradição): `/api/triagem/fila`
devolve o nome do doente, o médico e serviço requisitante, o pedido, o texto do plano e as
dependências — mas nunca os outros pedidos do mesmo doente nem histórico clínico.

## 2026-09-21 — Fase 5 — Corrigido um erro de formatação em dicionario.csv

`dados/dicionario.csv` (dicionário inicial, ficheiro estático — não é gerado por
`gerar_dados.py`, por isso corrigir aqui não contraria a regra de nunca editar os CSV
gerados à mão) tinha três linhas ("1/12", "3/12", "6/12") com um `;` por escapar dentro do
campo `significado` (ex.: `1 mês (não antes de 21 dias; prazo 35 dias)`), desalinhando as
colunas seguintes. Corrigido pondo esse campo entre aspas, ao estilo RFC 4180 já usado em
`regras_dependencia.csv`. Confirmado no ecrã /dicionario (antes mostrava "1 mês (não antes de
21 dias" na coluna do significado e "tempo" na coluna do âmbito).

## 2026-09-21 — Fase 4 — Fornecedores de LLM não testados ao vivo (sem chaves de API)

Este ambiente não tem `GEMINI_API_KEY`/`ANTHROPIC_API_KEY`/Ollama configurados, por isso não é
possível testar `server/extracao/providers/{gemini,anthropic,ollama}.ts` contra uma API real.
Implementei cada um seguindo a documentação oficial do respectivo SDK (`@google/genai` com
`responseMimeType: "application/json"`, `@anthropic-ai/sdk` com tool use forçado via
`tool_choice`, Ollama via `POST /api/chat` com `format: "json"`), com o mesmo prompt e schema
para os três. O que É testado exaustivamente: (1) a selecção de fornecedor por `EXTRACTOR`
(por omissão `gemini` se houver `GEMINI_API_KEY`, senão `cache`); (2) o *fallback* para a cache
quando o fornecedor ao vivo falha ou está mal configurado, incluindo o evento registado; (3) o
caminho `DEMO_CACHE_PRIMEIRO`. Quando o projecto for importado no AI Studio (que define
`GEMINI_API_KEY` automaticamente), o fornecedor `gemini` passa a ser exercitado a sério; se
houver algum desalinhamento de versão do SDK, o erro cai sempre no *fallback* da cache em vez
de partir a demo — nunca fica sem resposta.

## 2026-09-21 — Fase 4 — `server/extracao/dicionario.ts` em vez de `server/motor/`

CLAUDE.md lista `dicionario.ts` dentro de `server/extracao/` na estrutura sugerida (não em
`server/motor/`, que só lista estados/prioridade/dependências/agendamento/semáforo/alertas).
Tinha-o colocado em `server/motor/` na Fase 2 por conveniência; mudei-o para
`server/extracao/dicionario.ts` na Fase 4 para seguir a estrutura à letra — a normalização e a
aprendizagem por dicionário são mesmo o passo 1 do pipeline de extracção, não regras do motor
de agendamento/triagem.

A especificação não diz se a colheita pré-QT criada pela regra R2 é "com" ou "sem" jejum;
escolhi `ato_codigo "4"` (sem jejum), por ser o mais comum clinicamente antes de QT e por não
haver qualquer cenário da demo que dependa da distinção. Também confirmei, a partir dos dados
gerados (só há vagas de Hospital de Dia livres reservadas para 25/09, não 24/09, com
`congelamento_dias`/pré-condições do gerador), que a frase "início ≥ amanhã + 1 dia útil" da
regra R2 se aplica à própria sessão de HD (não só à colheita): implementei isso em
`janelaAgendamento` como um caso especial só para `tipo_pedido === "pedido_hd"`.

## 2026-09-21 — Fase 10 — Modelo Gemini e avaliação ao vivo no AI Studio

Ao testar a extracção contra a API real do Gemini no AI Studio:
1. `gemini-2.0-flash` e `gemini-2.5-flash` já não se encontram activos para novas contas na API (erro 404). Actualizou-se o modelo por omissão em `server/extracao/providers/gemini.ts` para `gemini-3.6-flash`.
2. A quota do nível gratuito da API impõe 5 pedidos por minuto por modelo/projecto. Para `npm run avaliar-extracao` não esgotar a quota e cair em fallback espúrio ao correr os 12 planos de teste seguidos, adicionou-se um compasso de espera de 13s entre planos na rotina de avaliação.
3. Resultado da avaliação com o Gemini real (`gemini-3.6-flash`): 100% de acerto em todos os 6 campos estruturados (tipo_pedido, especialidade_destino, ato_codigo, exames, analises, prioridade) em 12/12 planos.

## 2026-09-21 — Correcção de duas alterações feitas no AI Studio antes de continuar

Ao retomar o trabalho depois de uma sessão no Google AI Studio (Gemini), o `main` tinha um
commit (`262b4b6`, "feat: update Gemini provider and server configuration") com boas
adições (server.ts a juntar Vite+Express num único processo/porta, `ConstrutorPedidos.tsx` e
`DoenteModal.tsx` como pontos de partida para o formulário interactivo e a ficha do doente) mas
também duas alterações que contrariavam regras de ouro do projecto, corrigidas antes de
continuar:
1. `server/extracao/index.ts` tinha `tentarExtracaoHeuristica()`: quando o texto não era
   reconhecido, em vez de gerar um alerta, **adivinhava pedidos por palavras-chave** (ex.:
   "tc"/"tac" no texto criava sempre um TC TAP com códigos fixos; "cirurgia" criava um pedido
   para uma especialidade "1101" que nem existe no catálogo). Isto viola directamente a Regra
   de ouro #3 ("quando não sabe, não inventa") e o Princípio 3 da especificação. Removida por
   completo; o comportamento voltou a ser: texto desconhecido → alerta, nunca um palpite.
2. `compararFila` (server/motor/prioridade.ts) tinha trocado a ordem dos critérios de
   desempate da fila para "nível" antes de "folga", contrariando a secção 8 da especificação
   ("(1) menor folga; (2) nível mais alto; (3) mais antigo"). Restaurada a ordem original;
   o score da equação de prioridade (ver abaixo) fica como critério extra de desempate, depois
   da folga e do nível, nunca antes.
Também reescrevi `.env.example`, que tinha perdido todos os comentários e valores por omissão
(ficou só `CHAVE=` sem contexto nenhum) — provavelmente uma normalização automática do
AI Studio ao sincronizar variáveis de ambiente.

`tests/cenarios.test.ts` e `tests/guiao.test.ts` continuam a passar sem alterar nenhuma data
esperada — confirma que nenhuma destas duas alterações erradas estava a ser exercitada pelos
cenários da demo (a equação de prioridade nunca chegou a ser chamada; ainda não havia nenhum
sítio no código a invocá-la).

## 2026-09-21 — Prioridade calculada pelo sistema (pedido explícito do utilizador)

Pedido explícito: "a prioridade é o sistema que define, através das equações definidas... e
depois é usado na altura da marcação." Isto substitui a regra mais simples da especificação
original (secção 8: "prioridade não indicada assume N"). Decisão de desenho: liguei
`calcularPrioridadeSistema` (já existente mas morta em `server/motor/prioridade.ts`) a
`construirPedido` em `server/extracao/index.ts` — só decide o **nível** (MP/P/N) quando
ninguém o indicou explicitamente (médico, dicionário ou correcção); uma prioridade explícita
continua sempre a prevalecer, para não tirar controlo a quem já o tinha. O nível calculado
continua a alimentar `calcularPrazo`/`regras_prazos.csv` exactamente como antes — a tabela de
prazos por nível continua a ser a fonte de verdade da direcção clínica, só a escolha do nível
passou a ser automática. O pedido guarda sempre `score_prioridade` e
`equacao_prioridade_detalhe` (a "justificação em linguagem simples" da Regra de ouro #6),
visíveis onde o pedido for mostrado. Verificado que isto não muda nenhuma data dos 8 cenários
da demo (os textos são todos electivos/rotina, ficam classificados como N tal como antes).

## 2026-09-22 — Revisão final pré-demo: prioridade, notificações, pontos cegos

Pedido explícito: rever todos os workflows, procurar pontos cegos e deixar tudo pronto para
apresentar. Ponto mais crítico encontrado: o **factor clínico da equação de prioridade nunca
tinha onde ser preenchido**. `doentes.csv` não tinha colunas para diagnóstico/estadiamento e
nenhuma página da app os expunha — por isso, apesar de `calcularPrioridadeSistema` já estar
ligada (decisão de 2026-09-21), o terço "perfil clínico do doente" do score era sempre 10/25
(o valor neutro) para todos os doentes da demo. Corrigido em duas frentes:
1. `gerar_dados.py` passa a gerar `diagnostico_principal`/`estadiamento`/`alergias`/
   `contacto`/`notas_clinicas` (novas colunas em `doentes.csv`); os 8 doentes-cenário (D1-D8)
   ficam com um perfil coerente com o texto dos próprios pedidos já gerados (ex.: Luísa =
   "Adenocarcinoma do recto médio, cT3N1" → Estádio III). Os ~450 doentes de fundo ficam vazios
   de propósito — sem sinal clínico, o sistema usa correctamente o valor neutro, não inventa.
2. Nova aba "Perfil Clínico" na ficha do doente (`Doente.tsx`) para ver/editar estes campos
   (o backend, `PUT /doente/:id`, já existia — tinha sido adicionado pelo AI Studio mas só era
   usado pelo formulário "Gerir Perfis" do Guião, nunca pela ficha real do paciente) — mostra
   também uma pré-visualização de quantos pontos isso vale na equação.

Outras decisões desta revisão:
- Os limiares MP/P da equação (antes fixos no código: 70 e 42) passam a vir de
  `parametros.csv` (`limiar_prioridade_mp`/`_p`) e são editáveis em runtime numa nova página
  `/gestao/prioridade`, que também lista os desfechos recentes (score + justificação) de todos
  os pedidos calculados pelo sistema — "Repor demo" volta a carregar os valores do CSV.
- O cabeçalho tinha um select de perfil + um sino de notificações separados, a ocupar bastante
  largura. Substituídos por um único botão compacto (avatar com iniciais + primeiro nome, sem
  o honorífico "Dr./Dra./Enf." no rótulo) cujo painel tem dois separadores: as notificações do
  perfil activo, e uma lista de todos os utilizadores agrupados por perfil com a contagem de
  notificações por ler de cada um — dá para ver quem tem notificações pendentes e trocar de
  perfil no mesmo sítio.
- Consulta.tsx tinha dois botões "Guardar" (um em cima, sem qualquer diferença do que está
  em baixo junto ao formulário) — removido o de cima. Removidos também os campos de "consulta
  de grupo"/"Hospital de Dia" (o pedido original do utilizador pediu para captar a opção "só
  para pensar melhor depois"; ficam de fora até haver uma decisão de desenho, em vez de UI sem
  função). O toast de confirmação pós-gravação passou a modal centrado com fundo escurecido e
  desfocado (antes era um toast no canto, fácil de ignorar); confirmar leva de volta à agenda
  do médico já actualizada (usa `?data=` para mostrar o dia certo, mesmo que a consulta não
  fosse a de hoje).
- Ponto cego encontrado a testar: uma avaria resolvida nunca informava o técnico que a
  reportou. Adicionada notificação `AVARIA_RESOLVIDA` para fechar esse ciclo.

Verificado com testes novos (`tests/prioridade.test.ts`, 5 testes) e ao vivo por browser em
cada fluxo (perfil clínico a alimentar o score, limiares a mudar a classificação, trocador de
utilizador a mostrar badges por perfil, modal de confirmação, regresso à agenda actualizada).
36/36 testes, `tsc`/`build` limpos.

## 2026-09-22 — Regras de prioridade, remarcação e vagas libertadas (secção 8A)

Pedido explícito do dono do produto (alarga o âmbito da secção 16). Decisões tomadas:
1. **Dados sem mexer na sequência aleatória.** `gerar_dados.py` usa `random.seed(7)`; qualquer chamada
   aleatória nova a meio mudaria toda a agenda e as datas exactas dos cenários 1-8. O perfil logístico e
   os doentes 100109-100113 são gerados no fim, com um `random.Random(2026)` próprio, e os doentes novos
   ocupam marcações de fundo que já existiam no TAC (muda só quem lá está). Resultado: as 8 datas
   esperadas não mudaram.
2. **Prova "antes/depois".** Com os dados novos e a regra antiga, a troca do José escolhia o Sr. Joaquim
   (mais folga). Isto fica de propósito: o painel "Porquê esta escolha?" mostra quem a regra antiga teria
   escolhido.
3. **"Dia agrupado" é custo, não exclusão** (a proposta inicial punha-o também nas regras duras) — mais
   simples de explicar e o efeito na demo é o mesmo.
4. **Lista de antecipáveis por estádio antes de atraso.** Os dados de fundo têm doentes em diagnóstico
   marcados depois do prazo (realista). A Helena ganha pela regra (em diagnóstico + maior atraso previsto),
   não por excepção nos dados; o segundo, Luís Martins Alves, recebe a vaga dela em cascata.
5. **Lista de chamadas com limiar de risco 2.** Com "qualquer motivo" entravam 51 % das marcações do TAC
   (uma falta antiga ou só a idade bastavam); com o limiar entram ~21-23 %.
6. **Impacto sem inflacionar.** O histórico simulado tem 0 doentes remarcados 2 vezes; não se mostra essa
   linha de base nem uma projecção sobre ela. A projecção usa faltas reais do histórico × pressupostos
   explícitos (`reducao_faltas_lembrete` 30 %, `custo_medio_vaga_tac` 120 €), marcados "a validar".
7. **Comunicações ao doente simuladas** (nada é enviado); a resposta ao SMS é registada pela
   administrativa ("Doente aceitou"/"Recusou").
8. **Guião reorganizado por casos** (normal + problemas em que a prioridade decide), com teste próprio
   `tests/guiaoCasos.test.ts` pela ordem da apresentação; o guião antigo (`tests/guiao.test.ts`) continua
   a passar sem alterações.
9. **Fica por fazer:** ausência de médico como bloqueio de agenda (R-I); validação dos pesos com a
   direcção clínica.

## 2026-09-22 — Índice de prioridade guardado e remarcações sempre propostas (R-J, R-K)

Pedido explícito: a prioridade de cada doente deve estar já calculada (não refeita cada vez que é
preciso remarcar 20 pessoas), distinguir MP de MP, e as remarcações por avaria/falta devem chegar à
administrativa com a solução e a justificação, para ela validar.
1. **Índice guardado no pedido** e refrescado dentro de `recalcularAlertas` (arranque + cada acção): é o
   único sítio por onde todas as acções já passam. O índice substitui o score como critério (3) da fila
   (depois de folga e nível), por isso as datas dos cenários antigos não mudaram.
2. **Avaria passa a ter "a partir de"** (`data_inicio`, por omissão hoje) e a janela é
   [início, início + dias). O teste antigo (avaria de 6 dias a partir de hoje) mantém o mesmo efeito.
3. **Remarcar por avaria move a mesma marcação** (como a troca segura) em vez de desmarcar e criar outra;
   o teste de avarias passou a verificar a data (fora da janela) em vez do id da marcação.
   `resolverAvaria` passou a significar "aceitar o plano".
4. **Vagas do plano ficam reservadas; as da falta não.** Reservar a sugestão do António no arranque
   tiraria a vaga das 07:30 de 24/09 à Maria e mudaria as datas da demo. A sugestão da falta é
   recalculada sempre que é vista e no momento de aceitar.
5. **Cenário da Ecografia** gerado depois da sequência aleatória: as 5 marcações de 24/09 passam para 5
   doentes-cenário (as restantes desse dia ficam desmarcadas) e a 25/09 só fica livre a vaga das 10:40,
   para haver disputa real entre dois MP com o mesmo prazo.
6. **2.ª remarcação na métrica**: separam-se as evitáveis (por troca — a regra impede, 0) das inevitáveis
   (avaria — sinalizadas para chamada), para o painel não se contradizer.

## 2026-09-22 — Sem vaga a tempo, ausência de médico e gestão de capacidade

1. **"Sem vaga a tempo" só existe quando uma consulta depende do exame.** Um exame de rotina sem
   dependente tem sempre vaga (mais tarde); o que se perde é o resultado para a consulta. O Diogo
   (índice mais baixo) tem revisão a 29/09 que depende da ecografia — é o caso da demo.
2. **"Resolvi com vaga extra" cria mesmo uma vaga** (fora do horário, `extra`), para o exame aparecer
   na agenda e na ficha do doente; não há lógica de capacidade por trás, é a administrativa que a abre.
   **Outsourcing** reutiliza o comportamento que já existia (registado e realizado fora).
3. **A decisão do médico** tem duas saídas: avançar (retira a dependência e marca o exame na primeira
   vaga) ou adiar (consulta no primeiro dia livre a partir da data escolhida, com o mesmo médico; exame
   a tempo do resultado). O adiamento conta como remarcação da consulta, sinalizada como inevitável.
4. **O bloqueio de uma avaria vale para toda a janela**, mesmo depois de o plano ficar decidido (estava
   a desbloquear o dia avariado quando a avaria passava a RESOLVIDA).
5. **Ausência de médico** é uma avaria com `medico_id`. Marcações sem pedido no sistema nunca são
   antecipadas (procura-se a partir da data original, mesmo médico primeiro).
6. **2.ª remarcação evitável = só por troca** (é a que a regra R-A governa); avaria, ausência e
   decisão médica contam como inevitáveis e ficam sinalizadas.
7. **Sessão extra** usa as mesmas regras da vaga libertada e diz quantas vagas chegam — com os dados
   da demo, de 6 vagas de TAC só 2 têm quem ganhe com elas; não se inventam doentes para as encher.
8. **Encaixes** ficam como sugestão (número por dia), sem marcar nada, como combinado.


## 2026-09-23 — Revisão da interface: menos texto de marketing, mais "o que fazer"

1. **Início por perfil = lista de tarefas com números** (remarcações a validar, trocas a aprovar,
   vagas libertadas, chamadas, decisões do médico, prazos em risco…), cada uma com ligação para onde
   se resolve. Saíram o hospital inventado ("Hospital Central de Lisboa"), a lista aleatória de
   doentes (agora só os da demonstração, com o que cada um mostra) e a descrição errada da R1.
2. **"Repor demo" recarrega a página**: repunha o servidor mas o ecrã aberto continuava com dados
   antigos — em demo ao vivo parecia que não tinha funcionado.
3. **Texto sem adjectivos de IA**: saíram "IA Clínica", "Inteligente", "motor inteligente",
   "SOAP" (o Oasis usa diário), "Prontidão 100% Conforme". A IA só faz a extracção; o resto são regras.
4. **Datas em dd/mm/aaaa** em toda a interface (`src/lib/datas.ts`); o ISO fica só na API.
5. `ConstrutorPedidos.tsx` removido: não era usado e apontava para um campo "P — Plano" que já não existe.
6. Navegação em telemóvel: uma linha com deslocamento horizontal em vez de empilhar os botões.

## 2026-09-23 — Validação e Dicionário saem; Serviço reorganizado; equação por serviço

Pedido do utilizador depois da revisão:
1. **Validação, Dicionário e testador de extracção removidos da interface e da API.** O médico já
   declara os pedidos no assistente; a tradução do agente deixou de ser necessária. O único pedido dos
   dados que ainda esperava validação (TC do José) segue o circuito no arranque (`server/motor/arranque.ts`),
   como se o médico o tivesse acabado de declarar: o caso 2 começa com a proposta de troca já pronta.
2. **Troca de vaga reserva a vaga de destino.** Estava por reservar: se outra marcação a ocupasse antes
   da aprovação, a troca punha dois doentes na mesma vaga. Consequência na demo: o Manuel passa para
   14/10 08:00 e o TC da Maria fica a 14/10 08:20 (testes e guião actualizados).
3. **Semáforo usa o intervalo da própria dependência** (o mesmo que o agendamento). Com os 2 dias
   genéricos das análises, as 7 creatininas da R1 marcadas na véspera do TC davam vermelho falso.
4. **Alertas: o que são e o que fazem.** Os que implicam mudar uma marcação (falta, avaria, ausência,
   sem vaga a tempo, troca, sem vaga no prazo) têm sempre sugestão + porquê + validação da administrativa
   em "Para decidir". Os restantes são avisos com o que fazer; "Visto" já não os reabre na acção seguinte.
   "Sem vaga no prazo" passa a sugerir a primeira vaga (com os dias de atraso) e a permitir aceitá-la.
5. **Serviço em 6 separadores** por tipo de trabalho: Para decidir · Vagas libertadas · Chamadas ·
   Pedidos e avisos · Estatísticas · Definições. Saíram "Marcações em risco" e "Alertas e pendências"
   (duplicavam as remarcações) e o "adiar e libertar vaga" que mudava marcações sem proposta.
6. **Equação do índice configurável por serviço** (todas as variáveis da R-J), com pré-visualização da
   fila reordenada antes de guardar. Os valores por omissão dão exactamente os índices anteriores.
7. **Os meus doentes (médico):** lista + percurso em vez de 120 cartões; situação única por doente
   (precisa de atenção / por marcar / tudo marcado / concluído) com o porquê.
8. Páginas com a mesma largura do cabeçalho; o diário da consulta ocupa metade do ecrã.

## 2026-09-23 — Estádios, troca de utilizador e "Outra solução"

1. **Estádio = Novo · Diagnóstico · Tratamento · Follow-up** em toda a interface (os códigos internos
   mantêm-se). Saiu dos ecrãs o "Estadiamento" (Estádio I–IV), que se confundia com o estádio do
   percurso; o valor continua nos dados e no score clínico.
2. **Os meus doentes:** filtro por estádio em botões com contagem, combinável com a situação.
3. **Trocar de utilizador abre a página de trabalho dele** (a primeira do menu depois do Início).
4. **Remarcação proposta: "Outra solução" em vez de "Rejeitar".** Rejeitar deixava o doente na marcação
   original — numa avaria, uma vaga que já não existe. Agora abre as próximas vagas livres (a dizer se
   cumprem o prazo e se chegam a tempo da consulta), vaga extra, outsourcing ou, se houver consulta
   dependente, enviar ao médico. A escolha fica registada com quem e porquê. Rejeitar uma troca passa o
   pedido para "Sem vaga no prazo", com as opções para o resolver.
