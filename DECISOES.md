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

