# MVP — Pedidos pós-consulta sobre o Oasis (fim do cromo)

Especificação funcional v1. Serve de base ao `CLAUDE.md` e aos prompts de construção.
Todos os dados são **sintéticos**. Data "hoje" da demo: **23/09/2026** (`parametros.csv`).

---

## 0. Princípios

1. O Oasis é o sistema clínico e de agendas. O nosso sistema é uma camada operacional por cima.
2. **IA só na extracção** (texto livre → pedidos estruturados). Tudo o resto são regras determinísticas.
3. **Quando não sabe, não inventa:** gera alerta e passa a uma pessoa.
4. A administrativa valida a **fidelidade da transcrição**; dúvidas clínicas voltam ao médico.
5. Mexer numa marcação de outro doente é sempre **proposta aprovada por um humano**.
6. Os critérios de prioridade são **definidos pela direcção clínica**; o sistema aplica-os e mostra sempre a regra usada.

## 1. As três peças

| Peça | O que é na demo |
|---|---|
| **Oasis 2.0** (simulado) | Agenda do médico, ecrã de consulta com SOAP e botão Guardar; agendas dos serviços (vagas). Dados em `oasis_atos_medicos.csv` e `vagas.csv`. |
| **Sistema de pedidos** | Validação, triagem, pedidos, dependências, semáforo, timeline, alertas, métricas. |
| **Agente** | (1) lê o SOAP guardado no Oasis 2.0 e extrai pedidos; (2) escreve marcações nas agendas do Oasis 2.0. |

## 2. Observações sobre a tabela real (confirmar)

- `ID` parece ser o **número do doente** (repete-se em várias linhas).
- `Ato Médico_Duração` vem exportada como data (erro de Excel); só interessa a hora (`00:15` = 15 min).
- `Ato Médico_Código` **não é único sozinho**: o código 7 é "CE PÓS-OPERATÓRIO" numa especialidade e "CE Dadores" noutra. A chave é **especialidade + código**.
- Um ato pode ter **vários exames** (TC Abdominal + TC Pélvica = duas linhas, mesmo ato).
- **Não há coluna de médico** → necessária para a continuidade. Existe noutra tabela?
- **Não há pedido nem prioridade**: a tabela é a agenda. O pedido hoje *é* o cromo em papel — é exactamente o que o sistema cria.
- Só vimos o estado `REALIZADA`. Assumimos também `MARCADA`, `FALTOU` (e `DESMARCADA` a confirmar).
- As colunas `mvp_*` no nosso CSV **não existem no Oasis**; são do MVP.

## 3. Tipos de pedido e fluxos

| Tipo | Exemplo | Fluxo | Destino decide? |
|---|---|---|---|
| `consulta` | revisão na própria especialidade | DIRECTO | não |
| `pedido_consulta` | consulta noutra especialidade | TRIAGEM | sim |
| `pedido_hd` | sessão de Hospital de Dia | TRIAGEM | sim |
| `exame` | TC, ecografia | DIRECTO | pode recusar com motivo |
| `analises` | colheita c/ ou s/ jejum | DIRECTO | não |
| `tratamento` | manutenção CVC, enfermagem | DIRECTO | não |

**DIRECTO:** Extraído → Validado → Aceite → agendamento automático.
**TRIAGEM:** Extraído → Validado → Em triagem → (Aceitar | Recusar | Reencaminhar | Pedir informação) → se aceite, agendamento automático.

**O que o serviço de destino vê:** identificação do doente, médico e serviço requisitante, o pedido (item, especificação, prioridade, prazo), o **texto do plano da consulta de origem** (substitui o campo "motivo") e as dependências desse pedido. Não vê os outros pedidos nem o perfil completo.

## 4. Modelo de dados

Ficheiros em `dados/` (CSV, separador `;`, UTF-8). Datas do sistema em ISO; o export do Oasis mantém o formato real `dd/mm/aaaa hh:mm`.

**Directório (Oasis):** `especialidades`, `catalogo_atos` (chave: especialidade + ato; indica `tipo_pedido`), `exames`, `analises`, `gabinetes` (inclui equipamentos e cadeirões), `utilizadores` (médicos, administrativas, triadores, gestão).

**Agenda (Oasis):**
- `vagas` — `vaga_id, especialidade, gabinete, medico_id, data_hora, duracao_min, atos_permitidos, ato_id` (vazio = livre).
- `oasis_atos_medicos` — marcações/atos no formato real + `mvp_ato_id, mvp_medico_id, mvp_vaga_id, mvp_pedido_id, mvp_prazo_limite, mvp_prioridade, mvp_n_remarcacoes`.

**Sistema:**
- `doentes` — `doente_id, n_utente, nome, sexo, data_nascimento, demo_cenario`. Só identificação; o clínico fica no Oasis.
- `pedidos` — identificação (`doente, consulta_origem_ato_id, medico_requisitante, criado_em`), o quê (`tipo_pedido, fluxo, especialidade_destino, ato_codigo, exames, analises, especificacao`), quando (`prioridade, prazo_limite, nao_antes, medico_preferido_id, continuidade_obrigatoria, recorrencia`), rastreio (`texto_origem, confianca, aprovado_direto, validado_por/em, triado_por/em, decisao_triagem, marcado_em, ato_id, estado, n_remarcacoes`).
- `dependencias` — `pedido_id` (B) depende de `depende_de_pedido_id` (A), `intervalo_min_dias, critica, origem (MEDICO|REGRA), regra_id`.
- `eventos` — cada mudança: `pedido_id, data_hora, tipo, estado_anterior, estado_novo, utilizador_id (ou AGENTE/SISTEMA), motivo, detalhe`. **É a fonte da auditoria, da timeline e das métricas.**
- `dicionario` — `termo, significado, mapeia_para, ambito (GLOBAL|id médico), origem (INICIAL|CORRECAO), ocorrencias, estado`.
- `alertas` (gerado pela aplicação) — `alerta_id, tipo, gravidade, especialidade, pedido_id, doente_id, criado_em, estado (ABERTO|RESOLVIDO), resolvido_por, resolvido_em, accao`.
- `propostas_troca` (gerado) — `pedido_urgente, ato_a_mover, vaga_origem, vaga_destino, justificacao, estado (PENDENTE|APROVADA|REJEITADA), decidido_por`.
- **Regras:** `regras_prazos`, `regras_dependencia` (R1–R3), `intervalos_resultado`, `parametros`.

## 5. Máquina de estados do pedido

```
EXTRAIDO → VALIDADO → EM_TRIAGEM (só fluxo TRIAGEM) → ACEITE → MARCADO → REALIZADO
```
Desvios: `DEVOLVIDO` (pedir informação / correcção pelo médico), `RECUSADO`, `REENCAMINHADO` (→ EM_TRIAGEM noutro serviço), `SEM_VAGA`, `FALTOU` (→ reagendar), `CANCELADO`.

- Remarcação **não é estado**: é um evento; o pedido continua `MARCADO` e `n_remarcacoes` sobe.
- Quem pode fazer cada transição: Agente (extrair, marcar), Administrativa (validar, corrigir), Triador (decisões de triagem), Serviço de destino (aprovar trocas, registar falta/realização), Médico (responder a DEVOLVIDO, decidir no semáforo vermelho).

## 6. Extracção (o único ponto com IA)

Pipeline, por esta ordem:
1. **Normalização por dicionário** (determinística): termos globais + termos do médico requisitante.
2. **LLM** com saída em JSON schema. O prompt inclui o catálogo (códigos válidos), o dicionário, as correcções anteriores desse médico e a regra: *se não reconheceres um termo ou serviço, devolve-o em `alertas` e não inventes*.
3. **Validação pós-LLM:** todos os códigos existem no catálogo? Caso contrário → alerta.
4. **Regras automáticas de dependência** R1–R3.
5. **Confiança:** abaixo de `limiar_confianca` → destacado na validação.

Fornecedor trocável por configuração: `EXTRACTOR=api|local`. Demo com API (dados sintéticos). Produção: modelo local num servidor do hospital. **Os resultados dos doentes da demo ficam em cache** como fallback, caso a API falhe ao vivo.

Testar contra `planos_teste.json` (resultado esperado incluído) e mostrar a taxa de acerto.

## 7. Aprendizagem por correcções

1. A administrativa aprova sem mexer → `aprovado_direto = 1`.
2. Corrige → guarda-se a correcção (fragmento, interpretação errada, interpretação certa, médico).
3. A correcção cria **imediatamente** uma entrada no dicionário com âmbito **desse médico**, aplicada de forma determinística no passo 1 da extracção.
4. Quando a mesma correcção aparece `promover_regra_apos` vezes (médicos diferentes) ou é aprovada por um coordenador → passa a **GLOBAL**.
5. Métrica: taxa de aprovação directa ao longo do tempo.

## 8. Prioridade

- Níveis: **MP** (muito prioritário), **P** (prioritário), **N** (normal), mais datas explícitas ("não antes de", "até").
- O nível define o **prazo** (`regras_prazos.csv`, provisório — alinhar com os TMRG / direcção clínica). Uma data escrita pelo médico, se mais cedo, prevalece.
- Nos pedidos com triagem, o triador pode ajustar o nível.
- Urgência (< 72 h) fica fora do sistema → alerta para uma pessoa.
- **Ordem da fila:** (1) menor **folga** = prazo − hoje − tempo necessário para dependências; (2) nível mais alto; (3) pedido mais antigo.

## 8A. Regras de prioridade, remarcação e vagas libertadas

Alargamento aprovado pelo dono do produto (22/09/2026). Tudo determinístico em `server/motor/` (`remarcacao.ts`, `antecipacao.ts`, `chamadas.ts`, `comunicacoes.ts`); pesos e limiares em `parametros.csv`, **a validar com a direcção clínica**.

**Perfil logístico do doente** (`doentes.csv`): `concelho`, `distancia_km`, `contacto_digital` (SMS | EMAIL | NENHUM), `aceita_antecipacao`, `transporte_nao_urgente`. A idade vem de `data_nascimento`; as faltas vêm do histórico.

- **R-A — Quem nunca cede a vaga numa troca:** marcação a `congelamento_dias` ou menos; doente já remarcado pelo hospital `max_remarcacoes_hospital` (1) vez nos últimos 90 dias (faltas e pedidos do doente não contam); doente `EM_TRATAMENTO`; sem alternativa dentro do seu próprio prazo.
- **R-B — Custo de remarcar** (cede quem tem o menor): 75+ anos +20; sem contacto digital +25; ≥ 50 km +15 (≥ 150 km +25); transporte não urgente +10; outra marcação no mesmo dia +20; em diagnóstico (NOVO/PRE_TRATAMENTO) +30; −1 por cada 3 dias de folga (máx. −30). Empate: maior folga → menos remarcações → marcado há menos tempo. A proposta guarda todos os candidatos avaliados e quem a regra antiga (só folga) teria escolhido; a justificação diz porque não foram os outros.
- **R-C — Estádio na equação de prioridade:** NOVO/PRE_TRATAMENTO +8, EM_TRATAMENTO +5 no factor paciente (máx. 25).
- **R-D — Vagas protegidas** (`regras_capacidade.csv`, só TAC, 10 dias): uma vaga livre nos próximos 10 dias fica para MP/P, para quem já está fora do prazo ou tem o prazo dentro do horizonte; a partir de D-3 fica aberta a todos.
- **R-E — Vaga libertada com aviso** (desmarcação a pedido do doente, chamada "não vem", cascata): > 72 h → oferta por SMS (simulado) ao 1.º da lista de antecipáveis, resposta em 24 h; 24–72 h → só quem aceita antecipação e mora a < 50 km; < 24 h → ninguém de fora. Ordem: (1) sem vaga ou marcado depois do prazo, ganho ≥ 3 dias; (2) em diagnóstico, ganho ≥ 7 dias, aceita antecipação; dentro de cada grupo, em diagnóstico primeiro, depois maior atraso previsto. Aceite → a marcação muda, **não conta como remarcação**, e a vaga antiga corre a lista (cascata até 3 níveis). Recusa/expiração → seguinte. A desmarcação pedida pelo doente também não conta; é reagendado a partir da data que indicar.
- **R-F — Remarcação inevitável** (avaria): continua automática; quem já tinha sido remarcado escolhe primeiro e gera alerta `SEGUNDA_REMARCACAO` (alta).
- **R-G — Aviso, preparação e lista de chamadas:** cada marcação gera aviso ao doente com a preparação (`preparacoes.csv`, texto provisório) e lembrete a D-3 (simulados). A lista de chamadas do serviço inclui só marcações dos próximos 10 dias com risco ≥ 2: sem contacto digital (2), preparação crítica — TC com contraste e diabetes/metformina (2, em qualquer data), faltas no último ano (1 falta = 1, 2+ = 2), 80+ anos (1), 2.ª remarcação (3). Nunca baixa a prioridade clínica.
- **R-H — Dia único:** doente a ≥ 50 km com outra marcação na janela → primeira vaga compatível nesse dia, com ≥ 30 min de intervalo, de preferência a partir das 10:00; nunca para lá do prazo.
- **R-J — Índice de prioridade guardado** (`server/motor/indice.ts`): cada pedido activo tem o índice calculado e guardado, refrescado no arranque e depois de cada acção (não no momento de remarcar). Nível (MP 400 · P 250 · N 100) + prazo (até +200; fora do prazo +200 e +5/dia, máx. +100) + estádio (diagnóstico +80, tratamento +60) + score clínico (0–100) + remarcações já sofridas (+50 cada, máx. +100) + espera (+1/dia, máx. +30). Distingue doentes do mesmo nível; é o critério (3) da ordem da fila. Quem está marcado guarda também o custo de o remarcar (R-B).
- **R-K — Remarcações propostas, nunca às escondidas:** (a) **avaria** — ao ser reportada (serviço, acto opcional, a partir de, dias), o sistema cria logo o plano de todas as marcações afectadas, por ordem do índice: vaga sugerida (reservada até decisão), justificação ("2.º a escolher — índice 621 …; a única vaga dentro do prazo ficou para X: índice 717 contra 621") e avisos (fora do prazo → vaga extra/outsourcing; 2.ª remarcação → ligar; sem contacto digital). A administrativa recebe a notificação com o número de marcações e aceita uma a uma ou "Aceitar todas"; o doente e o médico são avisados e o técnico recebe "avaria resolvida" quando o plano fica decidido. (b) **falta** — a falta gera logo uma sugestão individual: a primeira vaga que ainda dá tempo ao resultado antes da consulta dependente (senão avisa que a consulta terá de ser adiada); a administrativa aceita. Não conta como remarcação pelo hospital.
- Ausência de médico como bloqueio de agenda (reutilizando as avarias) fica para depois.

**Métricas de impacto** (`/api/prioridades/impacto`): linha de base dos 60 dias (remarcações pelo hospital, faltas), o que as regras fizeram (doentes protegidos, vagas reaproveitadas, dias ganhos, deslocações evitadas, % a ligar) e projecção mensal com pressupostos explícitos (`reducao_faltas_lembrete`, `custo_medio_vaga_tac`). **Laboratório de prioridades** (`/gestao/laboratorio`): simula a escolha com atributos e pesos alterados, sem alterar o estado.

## 9. Dependências

"B só pode acontecer depois de A estar feito e com resultado."
- Origem: escritas pelo médico (extraídas) ou **regras**:
  - **R1** TC com contraste → creatinina com < 90 dias; se não existir, cria pedido de análises antes.
  - **R2** Sessão de HD → hemograma + bioquímica entre 1 e 3 dias antes. **Dispara quando a sessão é marcada:** marca-se primeiro o HD (início ≥ amanhã + 1 dia útil) e depois cria-se e marca-se a colheita na janela [HD−3, HD−1], nunca antes de amanhã.
  - **R3** "rev c/ exames" → depende de todos os MCDT pedidos na mesma consulta.
- Efeito no agendamento: data mínima de B = data de A + `intervalos_resultado` (análises 2, eco 3, TC 7 dias).

## 10. Agendamento

Para cada pedido `ACEITE`, pela ordem da fila:
1. **Janela:** início = max(amanhã, `nao_antes`, fim das dependências + intervalo); fim = `prazo_limite`.
2. **Vaga livre** compatível (especialidade, `atos_permitidos`, médico se `continuidade_obrigatoria`) → a **primeira**.
3. Sem vaga e sem continuidade obrigatória → repetir com qualquer médico.
4. **Troca segura:** procurar na janela uma marcação que (a) esteja a mais de `congelamento_dias`, e (b) possa ir para uma vaga livre **sem ultrapassar o seu próprio prazo**. Entre várias, escolher por: maior folga → menos remarcações → marcada há menos tempo. Gera **proposta** para o serviço aprovar, com justificação em linguagem simples.
5. Sem troca possível → estado `SEM_VAGA` + alerta com opções (vaga extra, capacidade externa, decisão humana).

**Recorrências** (ex.: "4/4 sem"): próxima sessão = última sessão realizada do mesmo ato + intervalo; se essa data já passou ou não há histórico, primeira vaga disponível. Na demo marca-se só a próxima sessão e mostra-se a recorrência.

**Regra do "1/12", "3/12"…:** o agente devolve `nao_antes_dias` e `prazo_dias` conforme o dicionário (1/12 = 21/35; 3/12 = 80/100; 6/12 = 170/190), contados a partir da data da consulta.

**Prioridade não indicada:** assume **N**, marcada como "por defeito" no ecrã de validação.

## 11. Semáforo

Só em **marcações com dependências**, nos próximos `semaforo_horizonte_dias`:
- 🟢 todas as dependências realizadas e resultado disponível até à data;
- 🟡 dependência marcada antes da consulta, ainda por realizar, com tempo para o resultado;
- 🔴 dependência não marcada, marcada depois da consulta, ou falta do doente.

Aparece na timeline do doente e na lista **"consultas em risco"** do serviço. O vermelho gera alerta e pede **decisão humana** (antecipar o exame ou adiar a consulta).

## 12. Alertas

| Tipo | Destino | Gravidade |
|---|---|---|
| Extracção com baixa confiança / termo ou serviço desconhecido | Validação (administrativa do serviço de origem) | média |
| Triagem parada > `alerta_triagem_parada_dias` | Serviço de destino | média |
| `SEM_VAGA` dentro do prazo | Serviço de destino + gestão | alta |
| Proposta de troca pendente | Serviço de destino | média |
| Semáforo vermelho | Serviço da consulta + médico | alta |
| Falta a exame que é dependência | Serviço de origem | alta |
| Remarcação que quebra dependência | Ambos os serviços | alta |
| ≥ `alerta_remarcacoes` remarcações do mesmo doente | Serviço | média |
| Prazo ultrapassado | Gestão | alta |

Cada alerta fecha-se com uma **acção registada** (quem, quando, o quê).

## 13. Métricas (dashboard de gestão)

Calculadas a partir de `pedidos`, `eventos` e `oasis_atos_medicos`. Etiqueta visível: **"dados simulados"**.

- **Tempo consulta → pedido no serviço** (criado_em → validado_em) e **pedido → marcação** (validado/triado → marcado_em).
- **% dentro do prazo** por nível, tipo e serviço.
- **Pendentes** por serviço e antiguidade (EM_TRIAGEM, ACEITE, SEM_VAGA).
- **Remarcações** e motivos (eventos REMARCACAO).
- **Consultas em risco detectadas** (semáforo vermelho) e resolvidas.
- **Taxa de aprovação directa da IA** por semana (curva de aprendizagem).
- **Triagem:** % aceites, recusados, reencaminhados.
- **Impacto estimado** (de `parametros.csv`, marcado como estimativa): cromos eliminados (300/dia × 22 ≈ 6 600/mês), folhas (× 3 ≈ 19 800/mês), horas administrativas (× 5 min ≈ 25 h/dia).

## 14. Ecrãs

Selector de perfil no topo (sem autenticação) + botão **"Repor demo"** (recarrega o seed).
1. **Oasis 2.0 — Médico:** agenda do dia → consulta com SOAP → Guardar.
2. **Oasis 2.0 — Agendas:** grelha por serviço/dia, vagas livres/ocupadas (onde se vê o agente a marcar).
3. **Validação (administrativa):** texto original ao lado dos pedidos extraídos; aprovar / corrigir.
4. **Triagem (por serviço):** fila com Aceitar / Recusar / Reencaminhar / Pedir informação.
5. **Pedidos do serviço + alertas + propostas de troca.**
6. **Doente — timeline e semáforo.**
7. **Gestão — métricas.**

## 15. Cenários da demo

| Doente | Estado inicial | O que se faz | Resultado esperado |
|---|---|---|---|
| **Maria Fernandes** (100101) | consulta hoje 09:30, Dr. Pedro | médico escreve o plano A e guarda; administrativa valida | 3 pedidos; análises → TC → revisão (21/10, Dr. Pedro); dependências e timeline |
| **José Carvalho** (100104) | TC TAP MP até 05/10, EXTRAÍDO | administrativa valida | TAC cheio até 13/10 → proposta: José ocupa 02/10, **Manuel** (100106) passa para 14/10 (dentro do seu prazo); Radiologia aprova |
| **Rosa Teixeira** (100105) | consulta hoje 09:50 | médico escreve o plano B | "HPC" desconhecido → alerta; administrativa corrige para Manutenção CVC → entra no dicionário do Dr. Pedro |
| **Carlos Mendes** (100107) | consulta hoje 10:10 | médico escreve o plano C | "HPC" reconhecido automaticamente, com selo "aprendido" |
| **Luísa Martins** (100103) | pedido Onc. Médica em triagem | triador reencaminha para Radioterapia; RT aceita | marcada na primeira vaga de RT (30/09) |
| **Fernando Lopes** (100108) | pedido HD em triagem | triadora aceita | sessão de HD + análises pré-QT criadas pela regra R2 |
| **António Ribeiro** (100102) | TC realizado; faltou à colheita ontem; revisão a 28/09 | abrir "consultas em risco" / a administrativa aceita a sugestão da falta | 🔴 + alerta; remarcar colheita para 24–25/09 → 🟡 |
| — | 60 dias de histórico | abrir Gestão | métricas |
| **Joaquim Pereira** (100109) | 81 anos, Castelo Branco (230 km), sem telemóvel, ambulância; TC 01/10 09:00 e consulta 01/10 11:10; consulta hoje 11:50 | (troca do José) · Dr. Pedro pede colheita s/ jejum | na troca do José é o escolhido pela regra antiga, mas tem custo 70 e fica; colheita marcada a **01/10 10:00** (dia único); aparece na lista de chamadas |
| **Beatriz Rocha** (100110) | TC 01/10 10:00, já remarcada 1× pelo hospital | (troca do José) | excluída da troca |
| **Tiago Silva** (100111) | em QT, TC 02/10 08:00 | (troca do José) | excluído da troca |
| **Sónia, Artur, Fátima, Olga, Diogo** (100114–100118) | as 5 ecografias de 24/09; só há uma vaga livre a 25/09 | técnico reporta avaria na Ecografia a 24/09 (1 dia); a administrativa aceita o plano | Sónia (MP, diagnóstico, 717) **25/09 10:40**; Artur (MP, 621) **28/09 11:00** fora do prazo (aviso); Fátima **28/09 12:00** + aviso 2.ª remarcação; Olga **01/10 11:40** (dia único com a consulta das 10:50); Diogo **28/09 12:40** |
| **Rui Lima** (100113) / **Helena Matos** (100112) | Rui: TC 30/09 09:00; Helena: em diagnóstico, TC 13/10 09:00 com prazo 08/09 | Radiologia desmarca o Rui a pedido (disponível a partir de 19/10); Helena aceita | Rui → **19/10 08:40**; Helena → **30/09 09:00** (ganha 13 dias, não conta como remarcação); vaga de 13/10 oferecida a Luís Martins Alves (cascata) |

**Pré-condições garantidas pelo gerador** (e verificadas por `verificar_dados.py`): TAC sem vagas de 24/09 a 13/10 e 4 vagas livres a 14/10; Manuel no TAC de 02/10 10:00 e é o melhor candidato à troca; colheitas livres 24–25/09; enfermagem livre 24–25/09; RT livre 30/09; HD livre 25/09; Dr. Pedro com vagas a 21 e 23/10. **Ordem recomendada da demo:** Maria → José → Rosa → Carlos → Luísa → Fernando → António → Gestão. A extracção dos textos ao vivo tem fallback em `demo_extracoes_cache.json`.

**Textos para escrever ao vivo:**

- **A (Maria):**
  S: Sem queixas. Boa tolerância alimentar, peso estável.
  O: Cicatriz sem sinais inflamatórios. Abdómen mole e depressível.
  A: 3M pós gastrectomia subtotal por adenocarcinoma gástrico pT2N0.
  P: TC TAP c/ contraste + colheita c/ jejum (hemog, bioq c/ creat, CEA, CA 19.9). Rev c/ exames 1/12 comigo.
- **B (Rosa):** P: HPC 4/4s. Colheita s/ jejum (hemog, CEA). Rev c/ resultados 1/12.
- **C (Carlos):** P: Mantém vigilância. HPC 4/4s. Rev 1/12 comigo.

## 16. Pendentes (fora do MVP)

- Notificações ao doente e faltas: em princípio já feitas pelo Oasis — confirmar.
- Integração real com o Oasis (API, base de dados ou RPA).
- Confirmar os campos em falta na tabela real (médico, estados, pedidos).
- Prazos por nível: validar com a direcção clínica (TMRG).
- Enquadramento MDR / AI Act e parecer do DPO.
- Servidor e modelo local para produção.
- Capacidade detalhada (salas, preparação, equipamentos partilhados).
- ~~Lista de espera dinâmica para cancelamentos; regras de no-show~~ → feito na secção 8A (validar pesos com a direcção clínica).
- Recorrências completas (todas as sessões).
- Vagas extraordinárias e outsourcing.
- Linha de base real (validar 300 cromos/dia, cópias e tempo por cromo).
