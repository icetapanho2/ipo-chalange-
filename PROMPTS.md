# Plano de construção — prompts para o Claude Code

Como usar: copiar a pasta `oasis2/` para a raiz do projecto, abrir o Claude Code nessa pasta e colar **um prompt de cada vez**. Só avançar quando a fase anterior estiver a funcionar e com testes a passar. Fazer commit no fim de cada fase.

Fases **1–6 são essenciais** para a demo. 7–8 são importantes. 9 é polimento.

---

## Fase 0 — Arranque
```
Lê CLAUDE.md e ESPECIFICACAO.md por inteiro. Depois corre `python gerar_dados.py` e `python verificar_dados.py` e confirma que dá OK.
Não escrevas código ainda. Resume-me em 10 linhas o que vais construir e lista as dúvidas que tiveres sobre a especificação.
```

## Fase 1 — Projecto, dados em memória e seed
```
Cria o projecto conforme a secção Stack do CLAUDE.md: Vite + React + TypeScript + Tailwind no frontend, Express em TypeScript no servidor, um só package.json, vitest. Nada de Next.js, nada de módulos nativos.
1. server/clock.ts: "agora" = DEMO_DATE de parametros.csv + hora real do dia.
2. server/store.ts: estado em memória com as entidades da secção 4 da especificação (incluindo alertas, propostas_troca e dicionario), carregado dos CSV de dados/ no arranque. Os atos do Oasis vêm uma linha por exame: agrupar por mvp_ato_id (ato + lista de exames).
3. POST /api/repor-demo recarrega o estado (< 5 s). Botão "Repor demo" num cabeçalho comum.
4. Selector de perfil no cabeçalho (Médico Dr. Pedro, Administrativa Joana, Triador Onc. Médica, Triadora RT, Triadora HD, Radiologia, Gestão), guardado em localStorage e enviado à API num header. Sem autenticação.
5. Scripts npm: dev (servidor + Vite com proxy /api), build, start (serve dist/ e /api em process.env.PORT), test.
6. Teste: após carregar, contagens iguais às dos CSV e os doentes 100101–100108 existem.
7. .gitignore e README curto (como correr, variáveis de ambiente). Cria .env.example com EXTRACTOR, GEMINI_API_KEY, GEMINI_MODEL, ANTHROPIC_API_KEY, ANTHROPIC_MODEL, OLLAMA_URL, OLLAMA_MODEL.
```

## Fase 2 — Motor de regras (sem interface)
```
Implementa server/motor/ como funções puras, seguindo as secções 5 e 8–12 da especificação:
- estados.ts: transições permitidas por perfil; cada transição grava evento.
- prioridade.ts: prazo por nível (regras_prazos), data explícita prevalece se mais cedo, ordem da fila por folga → nível → antiguidade.
- dependencias.ts: R1 (creatinina < 90 dias, verificada nos pedidos REALIZADOS de análises com A003), R2 (dispara ao marcar HD: colheita na janela [HD−3, HD−1], nunca antes de amanhã), R3 (revisão "c/ exames/resultados" depende dos MCDT da mesma consulta); data mínima = requisito + intervalos_resultado.
- agendamento.ts: janela; primeira vaga livre compatível (atos_permitidos, médico se continuidade); recorrência = última sessão + intervalo ou primeira vaga; se não houver vaga, troca segura (congelamento 7 dias, o deslocado nunca ultrapassa o seu prazo; escolher maior folga → menos remarcações → marcado há menos tempo) que cria uma proposta PENDENTE com justificação em linguagem simples; se não houver troca → SEM_VAGA + alerta.
- semaforo.ts e alertas.ts conforme as secções 11 e 12.
Escreve tests/cenarios.test.ts com os resultados esperados da tabela no fim deste ficheiro (PROMPTS.md), executados pela ordem indicada a partir de uma base acabada de repor. Todos têm de passar.
```

## Fase 3 — Oasis 2.0
```
Cria os ecrãs do Oasis 2.0 com um visual sóbrio de software hospitalar (cinzento/azul, tabelas densas, tipo aplicação clínica antiga mas limpa) para contrastar com o nosso sistema:
1. /oasis/medico: agenda de hoje do médico seleccionado; clicar num doente abre a consulta com campos S, O, A, P e botão Guardar. Ao guardar, grava a nota e chama o agente de extracção (fase 4; por agora deixa um stub que usa demo_extracoes_cache.json).
2. /oasis/agendas: grelha por especialidade e dia (vagas livres/ocupadas, nome do doente, acto). Quando o agente marca algo, a célula fica destacada durante uns segundos.
```

## Fase 4 — Agente de extracção
```
Implementa server/extracao/ conforme a secção 6 da especificação e a secção Extracção do CLAUDE.md:
1. Normalização com o dicionário (global + do médico).
2. Chamada ao LLM pelo fornecedor configurado (gemini | anthropic | local | cache), com o mesmo JSON schema (igual ao formato de pedido em planos_teste.json) e o mesmo prompt para todos. O prompt inclui: catálogo de especialidades/atos/exames/análises com códigos, dicionário, correcções anteriores do médico, e a instrução "se não reconheceres um termo ou serviço, coloca-o em alertas; nunca inventes códigos".
3. Validação: códigos inexistentes → alerta; confiança < limiar → destacado.
4. Aplicar R1–R3 e criar os pedidos em estado EXTRAIDO + evento EXTRACAO.
5. Fallback: erro ou > 15 s → usar demo_extracoes_cache.json se o texto coincidir (normalizado) e registar no evento.
6. Script `npm run avaliar-extracao` que corre os 12 planos de planos_teste.json e mostra a percentagem de acerto por campo.
```

## Fase 5 — Validação e aprendizagem
```
Ecrã /validacao (perfil Administrativa): lista de consultas com pedidos EXTRAIDOS. Para cada uma: texto original à esquerda, pedidos extraídos à direita (em linguagem legível, não códigos), confiança, alertas destacados (ex.: "HPC — termo não reconhecido").
Acções: Aprovar tudo; editar um pedido; adicionar pedido a partir de um alerta.
Ao corrigir: gravar a correcção, criar/actualizar a entrada do dicionário com âmbito do médico (secção 7), evento CORRECAO. Pedidos criados por uma entrada do dicionário mostram o selo "aprendido".
Ao aprovar: VALIDADO → envio (TRIAGEM ou ACEITE) → para os ACEITES correr logo o agendamento e mostrar o resultado (data marcada ou proposta de troca).
```

## Fase 6 — Triagem, serviço e propostas
```
1. /triagem (perfil Triador do serviço): fila EM_TRIAGEM ordenada pela ordem da fila; ver pedido + texto do plano de origem (só isso, nada do resto do doente). Acções: Aceitar (pode ajustar prioridade), Recusar (motivo obrigatório), Reencaminhar (escolher serviço; vai para a triagem desse serviço), Pedir informação (pergunta; volta ao médico como DEVOLVIDO). Ao aceitar, corre o agendamento.
2. /servico (perfil do serviço): pedidos do serviço por estado, alertas abertos (fechar com acção), propostas de troca com Aprovar/Rejeitar mostrando a justificação. Aprovar aplica a troca nas agendas do Oasis 2.0, grava eventos REMARCACAO nos dois pedidos e incrementa n_remarcacoes do deslocado.
```

## Fase 7 — Doente: timeline e semáforo
```
/doente/:id: cabeçalho com identificação; timeline vertical de todos os pedidos e eventos (data, o quê, quem, motivo); marcações futuras com dependências mostram o semáforo e o porquê ("Colheita de 22/09: doente faltou"). No vermelho, botões "Remarcar exame" (corre o agendamento do requisito) e "Adiar consulta", ambos com confirmação.
Adiciona em /servico a lista "Consultas em risco (próximos 14 dias)".
```

## Fase 8 — Gestão
```
/gestao com etiqueta "Dados simulados": cartões e gráficos (recharts) com as métricas da secção 13 da especificação, calculadas a partir de pedidos/eventos/atos: tempos, % dentro do prazo por nível e serviço, pendentes por serviço, remarcações por motivo, triagem, curva semanal de aprovação directa da IA, e o bloco de impacto estimado (300 cromos/dia, pressupostos de parametros.csv, marcados como estimativa). Tudo filtrável por serviço.
```

## Fase 9 — Polimento e ensaio
```
1. Revê todos os textos da interface (português de Portugal, sem jargão técnico).
2. Estados vazios, carregamentos e erros tratados em todos os ecrãs.
3. Cria /guiao: lista dos passos da demo pela ordem, com ligação directa para o ecrã certo e o perfil certo já seleccionado.
4. Corre o guião completo duas vezes seguidas após "Repor demo" e corrige o que falhar.
```

## Fase 10 — GitHub, AI Studio e Cloud Run (só depois de a demo correr localmente)
```
Prepara o projecto para importação no Google AI Studio e deploy no Cloud Run:
1. Confirma que `npm run build && npm start` funciona com PORT definido, sem ficheiros fora do repositório e sem dependências nativas.
2. Confirma que, sem EXTRACTOR definido e com GEMINI_API_KEY presente, o fornecedor é gemini; sem nenhuma chave, cai para cache sem erros.
3. Documenta no README que o estado é em memória: Cloud Run com 1 instância mínima e 1 máxima.
4. Actualiza o README com: como importar (Import from GitHub), variáveis de ambiente e limitações (estado em memória, dados simulados).
Não alteres a lógica do motor nesta fase.
```

---

## Resultados esperados (base acabada de repor, por esta ordem)

| # | Passo | Resultado esperado |
|---|---|---|
| 1 | Maria (100101): Dr. Pedro guarda o plano A; Joana aprova | Colheita c/ jejum **24/09 07:30**; TC TAP **14/10 08:00** (depende da colheita, R1); Revisão Dr. Pedro **21/10 08:30** (depende de ambos) |
| 2 | José (100104): Joana aprova o TC TAP MP (prazo 05/10) | Sem vaga livre até 05/10 → proposta: José fica com **02/10 10:00**, Manuel (100106) passa para **14/10 08:20** (prazo dele 31/12). Radiologia aprova → ambos actualizados; Manuel com 1 remarcação |
| 3 | Rosa (100105): plano B; Joana vê alerta "HPC" e corrige para Manutenção CVC | Entrada "HPC" no dicionário do Dr. Pedro; CVC **24/09 09:00**; colheita s/ jejum **24/09 07:30**; revisão **14/10 08:50** (sem continuidade) |
| 4 | Carlos (100107): plano C | "HPC" reconhecido com selo "aprendido"; CVC **24/09 09:30**; revisão Dr. Pedro **14/10 09:30** |
| 5 | Luísa (100103): triador de Onc. Médica reencaminha para Radioterapia; triadora RT aceita | 1.ª consulta RT **30/09 09:00** |
| 6 | Fernando (100108): triadora HD aceita | Sessão HD **25/09 08:30**; R2 cria colheita pré-QT **24/09 07:40** |
| 7 | António (100102): abrir consultas em risco | Revisão de 28/09 a 🔴 (faltou à colheita de 22/09) + alerta; "Remarcar exame" → colheita **24/09 07:40** → 🟡 |
| 8 | Gestão | Métricas preenchidas com 60 dias de histórico |

Nota: as horas exactas pressupõem esta ordem. Os testes devem seguir a mesma ordem.

## Resultados esperados — Guião por casos (`tests/guiaoCasos.test.ts`, base acabada de repor, por esta ordem)

| Caso | Passo | Resultado esperado |
|---|---|---|
| 1 | Maria: Dr. Pedro declara colheita c/ jejum + TC TAP c/ contraste + revisão dependente | Colheita **24/09 07:30**; TC **14/10 08:00**; revisão **21/10 08:30** (Dr. Pedro) |
| 1 | Luísa: reencaminhar para RT; RT aceita | RT **30/09 09:00** |
| 1 | Fernando: HD aceite | HD **25/09 08:30**; colheita pré-QT **24/09 07:30** |
| 2 | José: aprovar TC → proposta | Escolhido Manuel (custo −30): **02/10 10:00 → 14/10 08:20**; regra antiga escolheria Joaquim (70); Beatriz e Tiago excluídos; Graça 49 |
| 2 | Laboratório: Manuel com 1 remarcação | Passa a ser Graça Pereira Santos |
| 3 | Rui desmarca (a partir de 19/10); Helena aceita | Rui **19/10 08:40**; Helena **30/09 09:00** (+13 dias); cascata para Luís Martins Alves **13/10 09:00** |
| 4 | Dr. Pedro pede colheita s/ jejum ao Joaquim | **01/10 10:00** (dia único); lista de chamadas: Joaquim (sem contacto, 81 anos), Maria (preparação) |
| 5 | António: remarcar colheita | **24/09 07:40**, vermelho → amarelo |
| 6 | Gestão → Impacto | 0 remarcados 2.ª vez; 3 doentes protegidos; 1/1 vaga reaproveitada; 1 deslocação evitada |

