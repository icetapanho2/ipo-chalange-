# CLAUDE.md — MVP Pedidos pós-consulta (Oasis 2.0)

Lê isto no início de cada sessão. A especificação completa está em `ESPECIFICACAO.md` — é a fonte de verdade. Se algo aqui contradizer a especificação, a especificação ganha; pergunta antes de inventar.

## Objectivo
Demo para apresentar a um director hospitalar: o médico escreve o plano no "Oasis 2.0" simulado, um agente transforma-o em pedidos estruturados, os pedidos seguem para validação, triagem e agendamento automático, com dependências, semáforo, alertas e métricas. **Tem de funcionar ao vivo, sem surpresas.** Simplicidade acima de tudo: nada de funcionalidades fora da especificação.

## Stack (não mudar sem perguntar)
O projecto vai ser importado mais tarde para o **Google AI Studio (Build mode)** via GitHub e publicado no **Cloud Run**. O AI Studio espera frontend React + servidor Node.js, por isso:
- **Frontend:** Vite + React + TypeScript + Tailwind (sem Next.js).
- **Servidor:** Node.js + Express (TypeScript), no mesmo repositório e no mesmo `package.json`. Em produção serve a API em `/api/*` e o frontend compilado; escuta em `process.env.PORT` (Cloud Run).
- **Dados:** **em memória**, carregados dos CSV de `dados/` no arranque (sem base de dados, sem módulos nativos como better-sqlite3). "Repor demo" = recarregar os CSV. O estado vive só no servidor; o frontend fala sempre com a API.
- **Sem Python em runtime:** os CSV são gerados offline e ficam no repositório.
- Scripts: `npm run dev` (servidor + Vite em modo dev), `npm run build`, `npm start` (produção), `npm test` (vitest).
- Segredos só no servidor, via variáveis de ambiente; nunca no frontend.
- Sem autenticação. Interface em **português de Portugal**.
- Tem de correr localmente num portátil (12 GB RAM, sem GPU) **e** no Cloud Run com uma só instância.

## Dados
- `dados/*.csv` (separador `;`, UTF-8 com BOM) gerados por `gerar_dados.py`; `verificar_dados.py` valida-os. **Não editar os CSV à mão**: se for preciso mudar dados, mudar o gerador e voltar a correr ambos.
- `oasis_atos_medicos.csv` mantém o formato real do Oasis (datas `dd/mm/aaaa hh:mm`, uma linha por exame; agrupar por `mvp_ato_id`). As restantes tabelas usam ISO.
- Chave de um ato no catálogo = `especialidade_codigo + ato_codigo` (o código sozinho não é único).
- `dados/planos_teste.json` — planos com resultado esperado (testar a extracção).
- `dados/demo_extracoes_cache.json` — fallback da extracção para os textos da demo.
- `dados/dicionario.csv` — dicionário inicial.

## Regras de ouro
1. **Relógio único:** "hoje" é sempre `DEMO_DATE` de `parametros.csv` (23/09/2026) com a hora real do dia. Nunca usar `new Date()` directamente fora de `server/clock.ts`.
2. **IA só na extracção** (`server/extracao/`). Prioridade, routing, dependências, agendamento, semáforo e alertas são funções puras e determinísticas em `server/motor/`.
3. **Quando não sabe, não inventa:** termo/serviço/código desconhecido → alerta, nunca um palpite.
4. **Toda a mudança de estado grava um evento** (`eventos`) com autor, motivo e detalhe. Métricas, timeline e auditoria saem daí.
5. **Mexer na marcação de outro doente é sempre uma proposta** (`propostas_troca`) que um humano aprova.
6. Cada decisão automática guarda a **justificação em linguagem simples** (ex.: "Vaga de 02/10 cedida por Manuel Costa: prazo até 31/12, passa para 14/10").
7. Botão **"Repor demo"** recarrega o estado a partir dos CSV em < 5 s.
8. Etiqueta visível **"Dados simulados"** no dashboard de gestão.

## Extracção
> **Desde 23/09/2026** o médico declara os pedidos no assistente da consulta: a extracção por IA, a Validação e o Dicionário saíram da interface (decisão do utilizador, ver `DECISOES.md`). `server/extracao/` fica com os seus testes, sem uso nos ecrãs. Não voltar a pôr estas páginas sem perguntar.

- Interface única: `extrair(texto, medicoId, doenteId) → { pedidos[], alertas[] }`.
- Pipeline: dicionário (global + do médico) → LLM → validação contra o catálogo → regras R1–R3 → confiança.
- Fornecedores (variável `EXTRACTOR`):
  - `gemini` (**por defeito se existir `GEMINI_API_KEY`**, que o AI Studio configura automaticamente): SDK `@google/genai`, modelo em `GEMINI_MODEL`, saída estruturada com JSON schema.
  - `anthropic`: SDK `@anthropic-ai/sdk`, modelo em `ANTHROPIC_MODEL`, saída forçada via tool use com `input_schema`.
  - `local`: Ollama (`OLLAMA_URL`, `OLLAMA_MODEL`) com saída JSON.
  - `cache`: só `demo_extracoes_cache.json`.
- O mesmo JSON schema e o mesmo prompt servem todos os fornecedores (`server/extracao/schema.ts` e `server/extracao/prompt.ts`).
- Em qualquer modo, se falhar ou demorar > 15 s e o texto existir em `demo_extracoes_cache.json`, usar a cache e registar no evento.

## Estrutura sugerida
```
server/index.ts        Express: /api/*, serve dist/ em produção, PORT
server/store.ts        estado em memória + carregar CSV + repor demo
server/clock.ts
server/motor/          prioridade.ts, dependencias.ts, agendamento.ts, semaforo.ts, alertas.ts, estados.ts
server/extracao/       dicionario.ts, schema.ts, prompt.ts, providers/{gemini,anthropic,ollama,cache}.ts, index.ts
server/routes/         uma rota por área (oasis, validacao, triagem, servico, doente, gestao)
src/                   React: páginas oasis/medico, oasis/agendas, validacao, triagem, servico, doente, gestao, guiao
dados/                 CSV e JSON
tests/cenarios.test.ts um teste por cenário da demo
```

## Definição de "feito"
- `npm test` passa, incluindo um teste por cada cenário da secção 15 da especificação, com o resultado esperado exacto (datas incluídas).
- O guião da demo corre do início ao fim duas vezes seguidas após "Repor demo".
