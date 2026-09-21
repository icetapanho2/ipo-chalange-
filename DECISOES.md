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
