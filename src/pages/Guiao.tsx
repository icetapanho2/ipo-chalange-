import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePerfil } from "../lib/PerfilContext";
import { apiGet, apiPost, apiPut } from "../lib/api";
import {
  Sparkles,
  UserCheck,
  UserPlus,
  Play,
  CheckCircle2,
  ArrowRight,
  Stethoscope,
  RefreshCw,
  Check,
  ExternalLink,
  ShieldAlert,
  Search,
  BookOpen,
  Copy,
  ClipboardCheck,
} from "lucide-react";

interface AcaoPasso {
  etiqueta: string;
  utilizadorId: string;
  caminho: string;
}

interface Passo {
  numero: number;
  titulo: string;
  doente: string;
  descricao: string;
  resultado: string;
  acoes: AcaoPasso[];
  textoPlano?: string;
}

const PASSOS: Passo[] = [
  {
    numero: 1,
    titulo: "Maria Fernandes — circuito completo",
    doente: "100101",
    descricao:
      "Abrir a consulta de hoje (09:30) e colar o texto abaixo no campo P — Plano. Guardar: o Agente Oasis " +
      "extrai os pedidos e aparece o ecrã de confirmação (fundo escurecido, só o modal em foco). Ao confirmar " +
      "\"Avançar, sim\", volta à agenda já com a consulta marcada como \"Guardada\" — e a administrativa (Joana " +
      "Moreira) recebe de imediato uma notificação de fim de consulta. Trocar para o perfil dela (sino no " +
      "cabeçalho → \"Trocar utilizador\") mostra a notificação e o badge na fila de Validação; ela revê e aprova.",
    resultado: "Colheita 24/09 07:30 → TC 14/10 08:00 (depende da colheita) → Revisão 21/10 08:30 (Dr. Pedro).",
    acoes: [
      { etiqueta: "1a. Escrever o plano", utilizadorId: "U01", caminho: "/oasis/medico" },
      { etiqueta: "1b. Validar", utilizadorId: "U03", caminho: "/validacao" },
    ],
    textoPlano: "TC TAP c/ contraste + colheita c/ jejum (hemog, bioq c/ creat, CEA, CA 19.9). Rev c/ exames 1/12 comigo.",
  },
  {
    numero: 2,
    titulo: "José Carvalho — TAC cheio, troca segura",
    doente: "100104",
    descricao: "A administrativa aprova o TC já extraído (prazo 05/10); a Radiologia aprova a troca com o Manuel.",
    resultado: "José fica com 02/10 10:00; Manuel passa para 14/10 08:20 (dentro do seu prazo, 31/12).",
    acoes: [
      { etiqueta: "2a. Validar", utilizadorId: "U03", caminho: "/validacao" },
      { etiqueta: "2b. Aprovar a troca", utilizadorId: "U07", caminho: "/servico" },
    ],
  },
  {
    numero: 3,
    titulo: "Rosa Teixeira — abreviatura desconhecida",
    doente: "100105",
    descricao: "O médico escreve o plano B (09:50); a administrativa vê o alerta \"HPC\" e corrige para Manutenção CVC.",
    resultado: "Entrada \"HPC\" no dicionário do Dr. Pedro; CVC 24/09 09:00; colheita 24/09 07:30; revisão 14/10 08:50.",
    acoes: [
      { etiqueta: "3a. Escrever o plano", utilizadorId: "U01", caminho: "/oasis/medico" },
      { etiqueta: "3b. Corrigir e validar", utilizadorId: "U03", caminho: "/validacao" },
    ],
    textoPlano: "HPC 4/4s. Colheita s/ jejum (hemog, CEA). Rev c/ resultados 1/12.",
  },
  {
    numero: 4,
    titulo: "Carlos Mendes — abreviatura aprendida",
    doente: "100107",
    descricao: "O médico escreve o plano C (10:10): \"HPC\" já é reconhecida automaticamente, com selo \"aprendido\".",
    resultado: "CVC 24/09 09:30; revisão 14/10 09:30 (Dr. Pedro).",
    acoes: [
      { etiqueta: "4a. Escrever o plano", utilizadorId: "U01", caminho: "/oasis/medico" },
      { etiqueta: "4b. Validar", utilizadorId: "U03", caminho: "/validacao" },
    ],
    textoPlano: "Mantém vigilância. HPC 4/4s. Rev 1/12 comigo.",
  },
  {
    numero: 5,
    titulo: "Luísa Martins — triagem reencaminha",
    doente: "100103",
    descricao: "O triador de Onc. Médica reencaminha para Radioterapia; a triadora de RT aceita.",
    resultado: "1.ª consulta de Radioterapia marcada em 30/09 09:00.",
    acoes: [
      { etiqueta: "5a. Reencaminhar", utilizadorId: "U04", caminho: "/triagem" },
      { etiqueta: "5b. Aceitar em RT", utilizadorId: "U06", caminho: "/triagem" },
    ],
  },
  {
    numero: 6,
    titulo: "Fernando Lopes — Hospital de Dia",
    doente: "100108",
    descricao: "A triadora de Hospital de Dia aceita o pedido de HD.",
    resultado: "Sessão de HD 25/09 08:30; colheita pré-QT criada automaticamente (regra R2) para 24/09 07:40.",
    acoes: [{ etiqueta: "6. Aceitar em HD", utilizadorId: "U10", caminho: "/triagem" }],
  },
  {
    numero: 7,
    titulo: "António Ribeiro — semáforo vermelho",
    doente: "100102",
    descricao: "Abrir a timeline do doente: a revisão de 28/09 está a vermelho (faltou à colheita de 22/09).",
    resultado: "\"Remarcar exame\" agenda a colheita para 24/09 07:40 → o semáforo passa a amarelo.",
    acoes: [{ etiqueta: "7. Abrir o doente", utilizadorId: "U08", caminho: "/doente/100102" }],
  },
  {
    numero: 8,
    titulo: "Gestão",
    doente: "",
    descricao: "Abrir o dashboard de gestão, com 60 dias de histórico.",
    resultado: "Métricas preenchidas: tempos, prazos, pendentes, remarcações, aprendizagem da IA, triagem, impacto estimado.",
    acoes: [{ etiqueta: "8. Abrir Gestão", utilizadorId: "U12", caminho: "/gestao" }],
  },
];

interface PedidoTraduzido {
  pedido_id: string;
  tipo_pedido: string;
  tipo_pedido_legivel?: string;
  especialidade_destino: string;
  especialidade_legivel?: string;
  ato_codigo: string;
  ato_descricao?: string;
  descricao?: string;
  exames?: string[];
  analises?: string[];
  especificacao?: string;
  prioridade: string;
  prioridade_legivel?: string;
  prazo_limite: string;
  nao_antes?: string;
  depende_de?: string[];
  confianca: number;
  texto_origem: string;
  origem_dicionario?: boolean;
}

interface RespostaTradutor {
  ok: boolean;
  textoOriginal: string;
  fornecedorUsado: string;
  usouFallback: boolean;
  totalPedidos: number;
  pedidos: PedidoTraduzido[];
  alertas: string[];
  simulado: boolean;
}

interface DoenteCompleto {
  doente_id: string;
  n_utente: string;
  nome: string;
  sexo: string;
  data_nascimento: string;
  demo_cenario: string;
  diagnostico_principal?: string;
  estadiamento?: string;
  alergias?: string[];
  contacto?: string;
  notas_clinicas?: string;
  total_pedidos?: number;
  total_alertas?: number;
  pedidos_em_curso?: number;
}

const EXEMPLOS_TRADUTOR = [
  {
    titulo: "Cenário 1: Prescrição Multimodal (Maria Fernandes)",
    texto: "TC TAP c/ contraste + colheita c/ jejum (hemog, bioq c/ creat, CEA, CA 19.9). Rev c/ exames 1/12 comigo.",
    medico: "U01",
    explicacao: "Extrai 3 pedidos interdependentes: Análises clínicas com jejum, TC TAP com contraste, e Consulta de Revisão em 35 dias com o Dr. Pedro (continuidade obrigatória). Aplica regras R1 e R3.",
  },
  {
    titulo: "Cenário 2: Abreviatura por Aprender (Rosa Teixeira)",
    texto: "HPC 4/4s. Colheita s/ jejum (hemog, CEA). Rev c/ resultados 1/12.",
    medico: "U01",
    explicacao: "O termo 'HPC' não está inicialmente no dicionário, gerando um alerta clínico de termo desconhecido para revisão administrativa.",
  },
  {
    titulo: "Cenário 3: Abreviatura Aprendida (Carlos Mendes)",
    texto: "Mantém vigilância. HPC 4/4s. Rev 1/12 comigo.",
    medico: "U01",
    explicacao: "Quando a entrada HPC é aprendida no dicionário do Dr. Pedro, gera automaticamente o tratamento de manutenção de cateter venoso central (CVC).",
  },
  {
    titulo: "Cenário 4: Interconsulta Cirúrgica Urgente",
    texto: "Pedido de consulta urgente de Cirurgia Geral para avaliação de nódulo hepático secundário. Urgente hoje.",
    medico: "U01",
    explicacao: "Extrai pedido inter-serviços com fluxo de Triagem, prioridade Muito Prioritário (MP) e alerta de comunicação telefónica fora do sistema.",
  },
];

export function Guiao() {
  const { definirUtilizadorId, utilizadores } = usePerfil();
  const navigate = useNavigate();

  // Separador ativo: 'guiao' | 'tradutor' | 'perfil'
  const [separador, setSeparador] = useState<"guiao" | "tradutor" | "perfil">("guiao");
  const [textoCopiado, setTextoCopiado] = useState<number | null>(null);

  async function copiarTexto(numero: number, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // clipboard indisponível (ex.: contexto não seguro) — o texto continua seleccionável à mão
    }
    setTextoCopiado(numero);
    setTimeout(() => setTextoCopiado((atual) => (atual === numero ? null : atual)), 2500);
  }

  // Estado do Testador de Tradução
  const [textoTradutor, setTextoTradutor] = useState(EXEMPLOS_TRADUTOR[0].texto);
  const [medicoSelecionado, setMedicoSelecionado] = useState("U01");
  const [apenasSimular, setApenasSimular] = useState(true);
  const [aTraduzir, setATraduzir] = useState(false);
  const [resultadoTradutor, setResultadoTradutor] = useState<RespostaTradutor | null>(null);
  const [erroTradutor, setErroTradutor] = useState<string | null>(null);

  // Estado da Gestão de Perfil do Paciente
  const [modoPerfil, setModoPerfil] = useState<"completar" | "criar">("completar");
  const [listaDoentes, setListaDoentes] = useState<DoenteCompleto[]>([]);
  const [doenteSelecionadoId, setDoenteSelecionadoId] = useState("");
  const [doenteEmEdicao, setDoenteEmEdicao] = useState<Partial<DoenteCompleto>>({});
  const [aGuardarPerfil, setAGuardarPerfil] = useState(false);
  const [feedbackPerfil, setFeedbackPerfil] = useState<string | null>(null);
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);

  // Formulário de Novo Utente
  const [novoNome, setNovoNome] = useState("");
  const [novoUtente, setNovoUtente] = useState("");
  const [novoSexo, setNovoSexo] = useState("F");
  const [novaDataNascimento, setNovaDataNascimento] = useState("1978-05-14");
  const [novoDiagnostico, setNovoDiagnostico] = useState("Neoplasia da mama esquerda cT2N0M0");
  const [novoEstadiamento, setNovoEstadiamento] = useState("Estádio IIa");
  const [novasAlergias, setNovasAlergias] = useState("Alergia a contraste iodado");
  const [novoContacto, setNovoContacto] = useState("912 345 678");
  const [novasNotas, setNovasNotas] = useState("Primeira consulta com suspeita diagnóstica, aguarda biópsia.");

  // Carregar lista de doentes
  function carregarDoentes() {
    apiGet<DoenteCompleto[]>("/doente")
      .then((dados) => {
        setListaDoentes(dados);
        if (dados.length > 0 && !doenteSelecionadoId) {
          setDoenteSelecionadoId(dados[0].doente_id);
          setDoenteEmEdicao(dados[0]);
        }
      })
      .catch((err) => console.error("Erro ao carregar doentes:", err));
  }

  useEffect(() => {
    carregarDoentes();
  }, []);

  useEffect(() => {
    if (doenteSelecionadoId) {
      const d = listaDoentes.find((item) => item.doente_id === doenteSelecionadoId);
      if (d) {
        setDoenteEmEdicao({ ...d });
        setFeedbackPerfil(null);
      }
    }
  }, [doenteSelecionadoId, listaDoentes]);

  function ir(acao: AcaoPasso) {
    definirUtilizadorId(acao.utilizadorId);
    navigate(acao.caminho);
  }

  async function executarTraducao() {
    if (!textoTradutor.trim()) return;
    setATraduzir(true);
    setErroTradutor(null);
    setResultadoTradutor(null);

    try {
      const resp = await apiPost<RespostaTradutor>("/oasis/tradutor/testar", {
        texto: textoTradutor,
        medicoId: medicoSelecionado,
        doenteId: doenteSelecionadoId || "100101",
        apenasSimular,
      });
      setResultadoTradutor(resp);
    } catch (e) {
      setErroTradutor(e instanceof Error ? e.message : "Falha na tradução.");
    } finally {
      setATraduzir(false);
    }
  }

  async function guardarPerfilExistente() {
    if (!doenteSelecionadoId) return;
    setAGuardarPerfil(true);
    setFeedbackPerfil(null);
    setErroPerfil(null);

    try {
      await apiPut(`/doente/${doenteSelecionadoId}`, doenteEmEdicao);
      setFeedbackPerfil(`Perfil do utente ${doenteEmEdicao.nome} atualizado com sucesso no sistema hospitalar.`);
      carregarDoentes();
    } catch (e) {
      setErroPerfil(e instanceof Error ? e.message : "Erro ao atualizar perfil.");
    } finally {
      setAGuardarPerfil(false);
    }
  }

  async function criarNovoUtente() {
    if (!novoNome.trim()) {
      setErroPerfil("Nome do utente é obrigatório.");
      return;
    }
    setAGuardarPerfil(true);
    setFeedbackPerfil(null);
    setErroPerfil(null);

    try {
      const resp = await apiPost<{ ok: boolean; doente: DoenteCompleto }>("/doente", {
        nome: novoNome,
        n_utente: novoUtente || `999${Math.floor(100000 + Math.random() * 900000)}`,
        sexo: novoSexo,
        data_nascimento: novaDataNascimento,
        diagnostico_principal: novoDiagnostico,
        estadiamento: novoEstadiamento,
        alergias: novasAlergias.split(",").map((s) => s.trim()).filter(Boolean),
        contacto: novoContacto,
        notas_clinicas: novasNotas,
      });

      setFeedbackPerfil(`Utente ${resp.doente.nome} registado com sucesso (ID: ${resp.doente.doente_id}).`);
      carregarDoentes();
      setDoenteSelecionadoId(resp.doente.doente_id);
      setModoPerfil("completar");
    } catch (e) {
      setErroPerfil(e instanceof Error ? e.message : "Erro ao registar novo utente.");
    } finally {
      setAGuardarPerfil(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header Institucional */}
      <div className="border-b border-slate-200 pb-6 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Hospital Central de Lisboa · Ambiente de Demonstração
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">Centro de Testes e Guião Clínico</h1>
            <p className="text-sm text-slate-600 mt-1">
              Explore o circuito ponta-a-ponta, teste o tradutor de linguagem natural médica com IA ou gira perfis clínicos de pacientes.
            </p>
          </div>

          {/* Navegação por Separadores */}
          <div className="flex rounded-lg border border-slate-300 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setSeparador("guiao")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                separador === "guiao"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Play className="h-3.5 w-3.5 text-oasis-accent" />
              <span>Passos da Demo (1 a 8)</span>
            </button>

            <button
              type="button"
              onClick={() => setSeparador("tradutor")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                separador === "tradutor"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-600" />
              <span>Testador Tradutor IA</span>
            </button>

            <button
              type="button"
              onClick={() => setSeparador("perfil")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                separador === "perfil"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>Gestão de Perfil do Doente</span>
            </button>
          </div>
        </div>
      </div>

      {/* SEPARADOR 1: GUIÃO DA DEMO */}
      {separador === "guiao" && (
        <div>
          <div className="mb-4 flex items-center justify-between text-xs text-slate-500">
            <span>Sequência recomendada de validação operacional do circuito Oasis 2.0</span>
            <span className="font-semibold text-slate-700">8 passos encadeados</span>
          </div>

          <ol className="space-y-3.5">
            {PASSOS.map((passo) => (
              <li
                key={passo.numero}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-slate-300 transition-colors"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-800 text-xs font-bold text-white">
                      {passo.numero}
                    </span>
                    <h2 className="font-bold text-slate-900 text-sm">{passo.titulo}</h2>
                  </div>
                  {passo.doente && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-600">
                      Utente: {passo.doente}
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs text-slate-600 leading-relaxed">{passo.descricao}</p>

                {passo.textoPlano && (
                  <div className="mt-2.5 rounded-lg border border-sky-200 bg-sky-50/60 p-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800">
                        Texto pronto a colar no campo P — Plano
                      </span>
                      <button
                        type="button"
                        onClick={() => copiarTexto(passo.numero, passo.textoPlano!)}
                        className="inline-flex items-center gap-1 rounded border border-sky-300 bg-white px-2 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-100 shrink-0"
                      >
                        {textoCopiado === passo.numero ? (
                          <>
                            <ClipboardCheck className="h-3 w-3 text-emerald-600" />
                            <span className="text-emerald-700">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="font-mono text-xs text-slate-800 select-all">{passo.textoPlano}</p>
                  </div>
                )}

                <div className="mt-2 rounded-lg bg-emerald-50/70 border border-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800">
                  <strong className="text-emerald-900">Resultado esperado:</strong> {passo.resultado}
                </div>

                <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                  {passo.acoes.map((acao) => (
                    <button
                      key={acao.etiqueta}
                      type="button"
                      onClick={() => ir(acao)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs"
                    >
                      <span>{acao.etiqueta}</span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* SEPARADOR 2: TESTADOR DO TRADUTOR CLÍNICO */}
      {separador === "tradutor" && (
        <div className="space-y-6">
          {/* Caixa de Configuração e Entrada */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-sky-600" />
                  <span>Laboratório de Tradução Clínica de Linguagem Natural</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Teste a extração de pedidos, catálogo de atos SNS, inferência de prazos e dependências R1/R3 a partir de texto médico livre.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={apenasSimular}
                    onChange={(e) => setApenasSimular(e.target.checked)}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span>Modo Simulação (não polui a base de dados)</span>
                </label>
              </div>
            </div>

            {/* Presets Rápidos */}
            <div className="mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                Exemplos de Prescrições Médicas Reais:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EXEMPLOS_TRADUTOR.map((ex, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setTextoTradutor(ex.texto);
                      setMedicoSelecionado(ex.medico);
                    }}
                    className={`text-left p-2.5 rounded-lg border text-xs transition-colors ${
                      textoTradutor === ex.texto
                        ? "border-sky-500 bg-sky-50 text-sky-950 font-medium"
                        : "border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 text-slate-700"
                    }`}
                  >
                    <div className="font-semibold">{ex.titulo}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 font-mono">{ex.texto}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Contexto Médico */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Médico Requisitante / Contexto:
                </label>
                <select
                  value={medicoSelecionado}
                  onChange={(e) => setMedicoSelecionado(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 bg-white"
                >
                  {utilizadores
                    .filter((u) => u.e_medico)
                    .map((m) => (
                      <option key={m.utilizador_id} value={m.utilizador_id}>
                        {m.nome} ({m.especialidade_codigo}) {m.utilizador_id === "U01" ? "— Tem Dicionário Pessoal" : ""}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Paciente de Referência:
                </label>
                <select
                  value={doenteSelecionadoId}
                  onChange={(e) => setDoenteSelecionadoId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 bg-white"
                >
                  {listaDoentes.map((d) => (
                    <option key={d.doente_id} value={d.doente_id}>
                      {d.nome} (SNS {d.n_utente})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Caixa de Texto Clínico */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Texto Clínico Livre (Campo 'P' do SOAP):
                </label>
                <span className="text-[11px] text-slate-400">
                  Experimente acrónimos, exames com contraste, ou interconsultas urgentes
                </span>
              </div>
              <textarea
                value={textoTradutor}
                onChange={(e) => setTextoTradutor(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 p-3 text-xs font-mono text-slate-900 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                placeholder="Exemplo: TC TAP c/ contraste + colheita c/ jejum... Rev 1/12 comigo"
              />
            </div>

            {/* Botão de Tradução */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                O agente normaliza abreviaturas, consulta atos no catálogo e calcula dependências.
              </span>
              <button
                type="button"
                onClick={executarTraducao}
                disabled={aTraduzir || !textoTradutor.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50 transition-colors shadow-2xs"
              >
                {aTraduzir ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>A Processar com IA...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Traduzir e Extrair Pedidos</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {erroTradutor && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-xs text-red-700">
              <strong>Erro no processamento:</strong> {erroTradutor}
            </div>
          )}

          {/* Resultado Estruturado */}
          {resultadoTradutor && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Resultado da Tradução Estruturada
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-700">
                    Motor: <strong>{resultadoTradutor.fornecedorUsado}</strong>
                  </span>
                  <span className="rounded bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                    {resultadoTradutor.totalPedidos} Pedido(s) Identificado(s)
                  </span>
                  {resultadoTradutor.simulado && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      Simulação
                    </span>
                  )}
                </div>
              </div>

              {/* Alertas Gerados pelo Agente */}
              {resultadoTradutor.alertas.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldAlert className="h-4 w-4 text-amber-600" />
                    <span>Alertas Clínicos & Termos Desconhecidos:</span>
                  </div>
                  {resultadoTradutor.alertas.map((alerta, idx) => (
                    <p key={idx} className="pl-5 text-amber-800">
                      • {alerta}
                    </p>
                  ))}
                </div>
              )}

              {/* Lista de Pedidos Extraídos */}
              {resultadoTradutor.pedidos.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  Nenhum pedido estruturado pôde ser inferido a partir deste texto.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {resultadoTradutor.pedidos.map((p, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 font-semibold text-white text-[10px] uppercase tracking-wider">
                          {p.tipo_pedido}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          ID: {p.pedido_id}
                        </span>
                      </div>

                      <div>
                        <div className="font-bold text-slate-900 text-sm">
                          {p.descricao || `${p.tipo_pedido} (${p.especialidade_destino})`}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Especialidade Destino: <strong>{p.especialidade_legivel || p.especialidade_destino}</strong> (Ato: {p.ato_codigo})
                        </div>
                      </div>

                      {p.especificacao && (
                        <div className="text-[11px] text-slate-600">
                          Especificação: <em>{p.especificacao}</em>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 pt-1 border-t border-slate-200">
                        <div>
                          Prioridade: <strong>{p.prioridade}</strong> ({p.prioridade_legivel || "Normal"})
                        </div>
                        <div>
                          Prazo Limite: <strong>{p.prazo_limite}</strong>
                        </div>
                        <div>
                          Confiança: <strong>{(p.confianca * 100).toFixed(0)}%</strong>
                        </div>
                      </div>

                      {p.origem_dicionario && (
                        <div className="inline-flex items-center gap-1 rounded bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          <BookOpen className="h-3 w-3" />
                          <span>Reconhecido via Dicionário do Médico</span>
                        </div>
                      )}

                      {p.depende_de && p.depende_de.length > 0 && (
                        <div className="rounded bg-sky-50 border border-sky-100 p-2 text-[11px] text-sky-800">
                          <strong>Dependência Clínica (R1/R3):</strong> Bloqueado até realização do exame/análise prévio.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Ação rápida para testar na validação */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Quer ver como a administrativa valida estes pedidos?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    definirUtilizadorId("U03");
                    navigate("/validacao");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                  <span>Abrir Fila de Validação Administrativa</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SEPARADOR 3: GESTÃO E CRIAÇÃO DE PERFIL DO DOENTE */}
      {separador === "perfil" && (
        <div className="space-y-6">
          {/* Sub-separador: Completar Existente vs Criar Novo */}
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => {
                setModoPerfil("completar");
                setFeedbackPerfil(null);
                setErroPerfil(null);
              }}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-all ${
                modoPerfil === "completar"
                  ? "border-emerald-600 text-emerald-800"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <UserCheck className="h-4 w-4" />
              <span>Completar Perfil Existente ({listaDoentes.length} Utentes)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setModoPerfil("criar");
                setFeedbackPerfil(null);
                setErroPerfil(null);
              }}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-all ${
                modoPerfil === "criar"
                  ? "border-sky-600 text-sky-800"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <UserPlus className="h-4 w-4" />
              <span>Registar Novo Utente</span>
            </button>
          </div>

          {feedbackPerfil && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600" />
              <span>{feedbackPerfil}</span>
            </div>
          )}

          {erroPerfil && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-xs text-red-700">
              <strong>Erro:</strong> {erroPerfil}
            </div>
          )}

          {/* MODO A: COMPLETAR PERFIL EXISTENTE */}
          {modoPerfil === "completar" && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Selecione o Doente a Atualizar:
                </label>
                <select
                  value={doenteSelecionadoId}
                  onChange={(e) => setDoenteSelecionadoId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 bg-white font-medium"
                >
                  {listaDoentes.map((d) => (
                    <option key={d.doente_id} value={d.doente_id}>
                      {d.nome} (SNS: {d.n_utente} · {d.sexo} · Nasc: {d.data_nascimento}) {d.demo_cenario ? `— [${d.demo_cenario}]` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Form de Edição */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nome Completo:
                  </label>
                  <input
                    type="text"
                    value={doenteEmEdicao.nome ?? ""}
                    onChange={(e) => setDoenteEmEdicao({ ...doenteEmEdicao, nome: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    N.º Utente SNS (9 dígitos):
                  </label>
                  <input
                    type="text"
                    value={doenteEmEdicao.n_utente ?? ""}
                    onChange={(e) => setDoenteEmEdicao({ ...doenteEmEdicao, n_utente: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Contacto Telefónico:
                  </label>
                  <input
                    type="text"
                    value={doenteEmEdicao.contacto ?? "910 000 000"}
                    onChange={(e) => setDoenteEmEdicao({ ...doenteEmEdicao, contacto: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Diagnóstico Principal:
                  </label>
                  <input
                    type="text"
                    value={doenteEmEdicao.diagnostico_principal ?? ""}
                    onChange={(e) => setDoenteEmEdicao({ ...doenteEmEdicao, diagnostico_principal: e.target.value })}
                    placeholder="Ex: Neoplasia do cólon ascendente"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Estadiamento Clínico:
                  </label>
                  <input
                    type="text"
                    value={doenteEmEdicao.estadiamento ?? ""}
                    onChange={(e) => setDoenteEmEdicao({ ...doenteEmEdicao, estadiamento: e.target.value })}
                    placeholder="Ex: cT3N1M0 · Estádio III"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Alergias e Contraindicações Clínicas (separadas por vírgula):
                </label>
                <input
                  type="text"
                  value={
                    Array.isArray(doenteEmEdicao.alergias)
                      ? doenteEmEdicao.alergias.join(", ")
                      : doenteEmEdicao.alergias ?? ""
                  }
                  onChange={(e) =>
                    setDoenteEmEdicao({
                      ...doenteEmEdicao,
                      alergias: e.target.value.split(",").map((s) => s.trim()),
                    })
                  }
                  placeholder="Ex: Alergia a contraste iodado, Insuficiência renal (evitar contraste nefro-tóxico)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Notas de Enquadramento Clínico & Recomendações:
                </label>
                <textarea
                  value={doenteEmEdicao.notas_clinicas ?? ""}
                  onChange={(e) => setDoenteEmEdicao({ ...doenteEmEdicao, notas_clinicas: e.target.value })}
                  rows={2}
                  placeholder="Notas adicionais para a equipa médica e triagem..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/doente/${doenteSelecionadoId}`)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                  >
                    <Search className="h-3.5 w-3.5 text-slate-500" />
                    <span>Ver Prontuário & Semáforo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      definirUtilizadorId("U01");
                      navigate("/oasis/medico");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                  >
                    <Stethoscope className="h-3.5 w-3.5 text-slate-500" />
                    <span>Criar Consulta Médica</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={guardarPerfilExistente}
                  disabled={aGuardarPerfil}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-2xs"
                >
                  {aGuardarPerfil ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>A Guardar...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Guardar e Atualizar Perfil</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* MODO B: CRIAR NOVO PACIENTE */}
          {modoPerfil === "criar" && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Registo de Novo Utente no Sistema Hospitalar
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Adiciona um novo doente à base de dados para realizar consultas, triagens ou testes de pedidos.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nome Completo*:
                  </label>
                  <input
                    type="text"
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    placeholder="Ex: Beatriz Henriques"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    N.º Utente SNS:
                  </label>
                  <input
                    type="text"
                    value={novoUtente}
                    onChange={(e) => setNovoUtente(e.target.value)}
                    placeholder="Gerado automaticamente se vazio"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Sexo:
                    </label>
                    <select
                      value={novoSexo}
                      onChange={(e) => setNovoSexo(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800 bg-white"
                    >
                      <option value="F">Feminino</option>
                      <option value="M">Masculino</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Nascimento:
                    </label>
                    <input
                      type="date"
                      value={novaDataNascimento}
                      onChange={(e) => setNovaDataNascimento(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Diagnóstico Preliminar:
                  </label>
                  <input
                    type="text"
                    value={novoDiagnostico}
                    onChange={(e) => setNovoDiagnostico(e.target.value)}
                    placeholder="Ex: Neoplasia da próstata, Nódulo pulmonar suspeito"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Estadiamento:
                  </label>
                  <input
                    type="text"
                    value={novoEstadiamento}
                    onChange={(e) => setNovoEstadiamento(e.target.value)}
                    placeholder="Ex: Estádio I, Estádio IIb"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Alergias Conhecidas:
                  </label>
                  <input
                    type="text"
                    value={novasAlergias}
                    onChange={(e) => setNovasAlergias(e.target.value)}
                    placeholder="Ex: Contraste iodado, Penicilina"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Contacto Telefónico:
                  </label>
                  <input
                    type="text"
                    value={novoContacto}
                    onChange={(e) => setNovoContacto(e.target.value)}
                    placeholder="912 345 678"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Notas de Admissão:
                </label>
                <textarea
                  value={novasNotas}
                  onChange={(e) => setNovasNotas(e.target.value)}
                  rows={2}
                  placeholder="Observações clínicas iniciais..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={criarNovoUtente}
                  disabled={aGuardarPerfil || !novoNome.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50 transition-colors shadow-2xs"
                >
                  {aGuardarPerfil ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>A Criar Registo...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Registar Utente no Sistema</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
