import { useEffect, useState } from "react";
import { dataPT } from "../lib/datas";
import { useNavigate } from "react-router-dom";
import { usePerfil } from "../lib/PerfilContext";
import { apiGet, apiPost, apiPut } from "../lib/api";
import { PainelImpacto } from "../components/PainelImpacto";
import {
  UserCheck,
  UserPlus,
  Play,
  ArrowRight,
  Stethoscope,
  RefreshCw,
  Check,
  ShieldAlert,
  Search,
  GraduationCap,
} from "lucide-react";

import { CASOS, type AcaoPasso } from "../lib/casosDemo";
import { iniciarTutorial, obterTutorial } from "../lib/tutoriais";

interface DoenteCompleto {
  doente_id: string;
  n_utente: string;
  nome: string;
  sexo: string;
  data_nascimento: string;
  demo_cenario: string;
  diagnostico_principal?: string;
  estadiamento?: string;
  estadio_cuidado?: string;
  alergias?: string[];
  contacto?: string;
  notas_clinicas?: string;
  total_pedidos?: number;
  total_alertas?: number;
  pedidos_em_curso?: number;
}

export function Guiao() {
  const { definirUtilizadorId } = usePerfil();
  const navigate = useNavigate();

  const [separador, setSeparador] = useState<"guiao" | "perfil">("guiao");

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
  const [novoEstadio, setNovoEstadio] = useState("NOVO");
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
        estadio_cuidado: novoEstadio,
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
                Dados simulados · demonstração
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">Guião da demonstração</h1>
            <p className="text-sm text-slate-600 mt-1">
              Os casos pela ordem de apresentação e os perfis dos doentes.
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
              <span>Casos da Demo</span>
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
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-2xs">
            <strong className="text-slate-800">Como apresentar:</strong> carregar em \"Repor demo\" e seguir os casos por esta ordem. O Caso 1
            mostra o circuito normal; os Casos 2 a 7 mostram problemas reais em que as regras de prioridade decidem; o último mostra o impacto
            em números. Cada botão já troca para o perfil certo. Em <strong>"Fazer em modo tutorial"</strong> o ecrã escurece e fica destacado só
            o que interessa em cada passo, com o texto do que é e do que fazer (para sair: × no cartão).
          </div>

          <div className="space-y-6">
            {CASOS.map((caso) => (
              <section
                key={caso.id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  caso.tipo === "normal"
                    ? "border-emerald-200 bg-emerald-50/40"
                    : caso.tipo === "impacto"
                      ? "border-indigo-200 bg-indigo-50/40"
                      : "border-amber-200 bg-amber-50/40"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">{caso.titulo}</h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      caso.tipo === "normal"
                        ? "bg-emerald-100 text-emerald-800"
                        : caso.tipo === "impacto"
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {caso.tipo === "normal" ? "caso normal" : caso.tipo === "impacto" ? "gestão" : "a prioridade decide"}
                  </span>
                  <button
                    type="button"
                    onClick={() => iniciarTutorial(caso.id)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-amber-600"
                    title="Percorrer o caso no ecrã, passo a passo, com o que está a ver destacado"
                  >
                    <GraduationCap className="h-3.5 w-3.5" /> Fazer em modo tutorial
                  </button>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                  <strong>{caso.tipo === "impacto" ? "Para quê:" : "Problema:"}</strong> {caso.problema}
                </p>
                {caso.regras && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <ShieldAlert className="h-3 w-3" /> Regras que decidem
                    </div>
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                      {caso.regras.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <ol className="mt-3 space-y-2.5">
                  {caso.passos.map((passo, i) => (
                    <li key={passo.titulo} className="rounded-xl border border-slate-200 bg-white p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-800 text-xs font-bold text-white">
                          {caso.id}.{i + 1}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">{passo.titulo}</h3>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{passo.descricao}</p>
                      <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-1.5 text-xs font-medium text-emerald-800">
                        <strong className="text-emerald-900">Resultado esperado:</strong> {passo.resultado}
                      </div>
                      {passo.fala && (
                        <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-1.5 text-xs italic text-sky-900">
                          <strong className="not-italic">Dizer ao júri:</strong> “{passo.fala}”
                        </div>
                      )}
                      <div className="mt-2.5 flex flex-wrap gap-2 border-t border-slate-100 pt-2">
                        <button
                          type="button"
                          onClick={() => iniciarTutorial(caso.id, obterTutorial(caso.id)?.inicioPorPassoGuiao[i] ?? 0)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-2xs hover:bg-amber-100"
                        >
                          <GraduationCap className="h-3.5 w-3.5" /> Tutorial
                        </button>
                        {passo.acoes.map((acao) => (
                          <button
                            key={acao.etiqueta}
                            type="button"
                            onClick={() => ir(acao)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:border-slate-400 hover:bg-slate-50"
                          >
                            <span>{acao.etiqueta}</span>
                            <ArrowRight className="h-3 w-3 text-slate-400" />
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
                {caso.tipo === "impacto" && (
                  <div className="mt-3">
                    <PainelImpacto recarregarCada={5000} />
                  </div>
                )}
              </section>
            ))}
          </div>
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
                      {d.nome} (SNS: {d.n_utente} · {d.sexo} · Nasc: {dataPT(d.data_nascimento)}) {d.demo_cenario ? `— [${d.demo_cenario}]` : ""}
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
                    Estádio:
                  </label>
                  <select
                    value={doenteEmEdicao.estadio_cuidado ?? ""}
                    onChange={(e) => setDoenteEmEdicao({ ...doenteEmEdicao, estadio_cuidado: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  >
                    <option value="">— Não classificado</option>
                    <option value="NOVO">Novo</option>
                    <option value="PRE_TRATAMENTO">Diagnóstico</option>
                    <option value="EM_TRATAMENTO">Tratamento</option>
                    <option value="FOLLOW_UP">Follow-up</option>
                  </select>
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
                    Estádio:
                  </label>
                  <select
                    value={novoEstadio}
                    onChange={(e) => setNovoEstadio(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                  >
                    <option value="NOVO">Novo</option>
                    <option value="PRE_TRATAMENTO">Diagnóstico</option>
                    <option value="EM_TRATAMENTO">Tratamento</option>
                    <option value="FOLLOW_UP">Follow-up</option>
                  </select>
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
