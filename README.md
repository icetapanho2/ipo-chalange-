# MVP — Pedidos pós-consulta (Oasis 2.0)

Demo de uma camada operacional sobre o Oasis: um agente de IA lê o plano escrito pelo médico
e transforma-o em pedidos estruturados; validação, triagem, dependências, agendamento,
semáforo, alertas e métricas são regras determinísticas. Ver `ESPECIFICACAO.md` (regras e
cenários), `CLAUDE.md` (stack) e `PROMPTS.md` (plano de construção).

## Como correr localmente

Requisitos: Node.js 20+, Python 3 (só para gerar os dados sintéticos, não é necessário em runtime).

```bash
npm install
python3 gerar_dados.py      # gera dados/*.csv (só é preciso na primeira vez, ou se mudar o gerador)
python3 verificar_dados.py  # confirma que os dados e as pré-condições da demo estão coerentes
npm run dev                 # servidor Express (porta 3001) + Vite (porta 5173, com proxy /api)
```

Abrir http://localhost:5173. Sem autenticação: escolher o perfil no cabeçalho. O botão
"Repor demo" recarrega o estado a partir dos CSV em `dados/`.

Outros scripts:
- `npm test` — testes (vitest), incluindo um por cada cenário da demo.
- `npm run build` — compila o frontend para `dist/`.
- `npm start` — corre em modo produção (serve `dist/` e a API em `process.env.PORT`).
- `npm run avaliar-extracao` — corre os 12 planos de `dados/planos_teste.json` contra o
  agente de extracção e mostra a percentagem de acerto por campo.

## Variáveis de ambiente

Ver `.env.example`. Só o servidor as lê; nunca chegam ao frontend.

- `EXTRACTOR` — fornecedor da extracção: `gemini` | `anthropic` | `local` | `cache`.
  Por omissão usa `gemini` se `GEMINI_API_KEY` existir (o AI Studio configura-a
  automaticamente); sem nenhuma chave, usa `cache` sem erro.
- `GEMINI_API_KEY`, `GEMINI_MODEL` — fornecedor Gemini (`@google/genai`).
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` — fornecedor Anthropic (`@anthropic-ai/sdk`).
- `OLLAMA_URL`, `OLLAMA_MODEL` — fornecedor local (Ollama).
- `PORT` — porta do servidor; o Cloud Run define-a automaticamente.

## Dados

Todos os dados são **sintéticos**, gerados por `gerar_dados.py` a partir de uma semente fixa
(reprodutível) e validados por `verificar_dados.py`. **Nunca editar os ficheiros em `dados/`
à mão** — mudar o gerador, voltar a gerar e a verificar.

## Estado da aplicação

O estado vive **em memória**, no processo do servidor, carregado dos CSV no arranque. Não há
base de dados. Isto significa que em produção (Cloud Run) a instância deve correr com
**mínimo de 1 e máximo de 1 instância** — várias instâncias teriam estados divergentes, e o
autoscaling para zero perderia as alterações feitas na demo. "Repor demo" recarrega os dados
originais a qualquer momento.

## Limitações

Ver secção 16 de `ESPECIFICACAO.md`: sem autenticação, sem integração real com o Oasis, sem
persistência, sem notificações ao doente, dados 100% sintéticos.
