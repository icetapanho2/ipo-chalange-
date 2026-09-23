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

## Publicar online, grátis e permanente: Vercel (site estático)

O site pode correr **inteiro no browser**: o mesmo servidor (rotas e motor de `server/`) corre dentro da
página e os dados de `dados/` vão embutidos (`npm run build:estatico`, ver `src/navegador/`). Não há
servidor, por isso não adormece, não tem instâncias nem custos. Cada pessoa que abre o site tem a sua
própria demo; recarregar a página (ou "Repor demo") volta ao início. Não há IA (o assistente do P/ usa
o dicionário).

1. Entrar em https://vercel.com com a conta do GitHub (plano Hobby, grátis).
2. **Add New → Project** → importar `ipo-chalange-` → **Deploy** (o `vercel.json` já diz tudo).
3. O site fica em `https://ipo-chalange-….vercel.app`; cada push para a `main` publica de novo.

## Ou no GitHub Pages (grátis; em conta gratuita o repositório tem de ser público)

O workflow `.github/workflows/pages.yml` compila o site estático e publica-o a cada push para a `main`.
Uma vez só: **Settings → Pages → Source: GitHub Actions**. O site fica em
`https://<utilizador>.github.io/<repositório>/` (o nome do repositório é lido automaticamente).

## Alternativa com servidor: Render

1. Entrar em https://render.com com a conta do GitHub.
2. **New → Blueprint** → escolher o repositório `ipo-chalange-` → **Apply**. O `render.yaml` cria o
   serviço sozinho (Docker, 1 instância, ramo `main`, verificação em `/api/estado`).
3. Esperar ~5 min pela primeira publicação; o endereço fica `https://iponte.onrender.com` (ou parecido).
4. Cada push para a `main` publica de novo automaticamente.

Notas: no plano gratuito o serviço adormece ao fim de 15 min sem visitas e demora ~1 min a acordar —
abrir o site uns minutos antes da apresentação (acordar também repõe a demo, porque o estado é em
memória). Para não adormecer: plano Starter no Render, ou Railway (o `railway.json` já está pronto).
O mesmo `Dockerfile` serve Cloud Run, Railway ou Fly — sempre com **uma só instância**.

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
