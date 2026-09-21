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
- `DEMO_CACHE_PRIMEIRO` (por omissão `true`) — se o texto escrito coincidir com um dos
  textos da demo, usa sempre a cache (garante a demo em palco, mesmo com um fornecedor ao
  vivo ligado e a funcionar); qualquer outro texto vai ao fornecedor configurado.
- `GEMINI_API_KEY`, `GEMINI_MODEL` — fornecedor Gemini (`@google/genai`).
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` — fornecedor Anthropic (`@anthropic-ai/sdk`).
- `OLLAMA_URL`, `OLLAMA_MODEL` — fornecedor local (Ollama, para produção num servidor do
  hospital sem chamadas a uma API externa).
- `PORT` — porta do servidor; o Cloud Run define-a automaticamente, não é preciso configurar.

## Dados

Todos os dados são **sintéticos**, gerados por `gerar_dados.py` a partir de uma semente fixa
(reprodutível) e validados por `verificar_dados.py`. **Nunca editar os ficheiros em `dados/`
à mão** — mudar o gerador, voltar a gerar e a verificar. (`dados/dicionario.csv` é a única
excepção: é um ficheiro estático do dicionário inicial, não gerado pelo `gerar_dados.py`.)

## Estado da aplicação

O estado vive **em memória**, no processo do servidor, carregado dos CSV no arranque. Não há
base de dados nem ficheiros fora do repositório. Isto significa que em produção (Cloud Run) a
instância **tem de correr com mínimo de 1 e máximo de 1 instância** — várias instâncias teriam
estados divergentes (cada uma "vê" um conjunto diferente de pedidos e marcações), e deixar o
autoscaling ir a zero perderia as alterações feitas ao vivo na demo (voltaria tudo ao estado
inicial dos CSV). O botão "Repor demo" recarrega os dados originais a qualquer momento, em
menos de 5 segundos.

## Importar no Google AI Studio e publicar no Cloud Run

1. **Import from GitHub**: no AI Studio (Build mode), importar este repositório directamente
   do GitHub. O AI Studio reconhece o projecto como Vite + React + servidor Node.js/Express
   (um só `package.json`, sem módulos nativos) e configura automaticamente `GEMINI_API_KEY`
   como variável de ambiente — nesse momento, sem mais nada a fazer, `EXTRACTOR` passa a
   `gemini` por omissão (ver secção acima).
2. Publicar no **Cloud Run**: o AI Studio trata do `build` (`npm run build`) e do arranque
   (`npm start`, que lê `process.env.PORT`). Ao configurar o serviço no Cloud Run, definir
   explicitamente **Minimum instances = 1** e **Maximum instances = 1** (ver "Estado da
   aplicação" acima — é essencial, não uma optimização).
3. Confirmar, depois de publicado, que `GET /api/estado` responde e que o botão "Repor demo"
   funciona — são o sinal de que os dados em `dados/` foram incluídos no deployment e o
   servidor os carregou correctamente.
4. Opcional: configurar `ANTHROPIC_API_KEY` ou `OLLAMA_URL`/`OLLAMA_MODEL` como variáveis de
   ambiente adicionais do serviço Cloud Run, e `EXTRACTOR` para escolher explicitamente esse
   fornecedor em vez do Gemini por omissão.

## Limitações

Ver secção 16 de `ESPECIFICACAO.md`: sem autenticação, sem integração real com o Oasis, sem
persistência (estado em memória — ver acima), sem notificações ao doente, dados 100%
sintéticos (nenhum dado real de doentes), sem recorrências completas (só a próxima sessão),
sem vagas extraordinárias/outsourcing, sem gestão detalhada de salas e equipamentos.
