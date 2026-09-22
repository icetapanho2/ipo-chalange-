import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiGet, apiPost, apiPut } from "../lib/api";
import {
  User,
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Clock,
  ArrowLeft,
  FileText,
  Check,
  Stethoscope,
  Pencil,
  Gauge,
} from "lucide-react";

interface DoenteInfo {
  doente_id: string;
  nome: string;
  n_utente: string;
  sexo: string;
  data_nascimento: string;
  diagnostico_principal?: string;
  estadiamento?: string;
  alergias?: string[];
  contacto?: string;
  notas_clinicas?: string;
}

const OPCOES_ESTADIAMENTO = ["", "Estádio I", "Estádio II", "Estádio III", "Estádio IV", "Metastático"];

/** Espelha (só para pré-visualização) o factor clínico de calcularPrioridadeSistema em server/motor/prioridade.ts. */
function pontosClinicosPreview(estadiamento: string, diagnostico: string): { pontos: number; motivo: string } {
  const e = estadiamento.toLowerCase();
  const d = diagnostico.toLowerCase();
  if (e.includes("iv") || e.includes("iii") || e.includes("metast") || d.includes("metast")) {
    return { pontos: 25, motivo: "Doente oncológico avançado (Estádio III/IV ou metastático)" };
  }
  if (e.includes("ii") || d.includes("neoplasia") || d.includes("carcinoma") || d.includes("tumor")) {
    return { pontos: 18, motivo: "Neoplasia ativa / Estadiamento intermédio" };
  }
  return { pontos: 10, motivo: "Perfil clínico geral (sem sinal de gravidade reconhecido)" };
}

interface ItemTimeline {
  evento_id: string;
  pedido_id: string;
  data_hora: string;
  tipo: string;
  pedido_descricao: string;
  especialidade_legivel: string;
  quem: string;
  motivo: string;
  detalhe: string;
  estado_novo_legivel: string;
}

interface DependenciaAvaliada {
  pedido_id: string;
  descricao: string;
  estado: string;
  estado_legivel: string;
  cor: "verde" | "amarelo" | "vermelho";
  porque: string;
  pode_remarcar: boolean;
}

interface MarcacaoFutura {
  pedido_id: string;
  descricao: string;
  especialidade_legivel: string;
  data_hora: string;
  semaforo: { cor: "verde" | "amarelo" | "vermelho"; porque: string };
  dependencias: DependenciaAvaliada[];
}

interface ItemOQueFalta {
  nivel: "vermelho" | "amarelo" | "azul";
  titulo: string;
  detalhe: string;
  pedido_id?: string;
}

interface PedidoJson {
  pedido_id: string;
  tipo_pedido_legivel: string;
  descricao: string;
  especialidade_destino_legivel: string;
  prioridade_legivel: string;
  prazo_limite: string;
  estado: string;
  estado_legivel: string;
  confianca: number;
}

interface RespostaDoente {
  doente: DoenteInfo;
  timeline: ItemTimeline[];
  marcacoesFuturas: MarcacaoFutura[];
  todosPedidos?: PedidoJson[];
  oQueFalta?: ItemOQueFalta[];
  alertas?: {
    alerta_id: string;
    tipo: string;
    gravidade: string;
    descricao: string;
    criado_em: string;
  }[];
}

export function Doente() {
  const { id } = useParams<{ id: string }>();
  const [dados, setDados] = useState<RespostaDoente | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<{ tipo: "remarcar" | "adiar"; pedidoId: string; texto: string } | null>(null);
  const [aProcessar, setAProcessar] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<"prontidao" | "clinico" | "pedidos" | "timeline">("prontidao");
  const [aEditarClinico, setAEditarClinico] = useState(false);
  const [formClinico, setFormClinico] = useState({
    diagnostico_principal: "",
    estadiamento: "",
    alergias: "",
    contacto: "",
    notas_clinicas: "",
  });
  const [aGuardarClinico, setAGuardarClinico] = useState(false);

  function recarregar() {
    if (!id) return;
    apiGet<RespostaDoente>(`/doente/${id}`)
      .then((r) => {
        setDados(r);
        setFormClinico({
          diagnostico_principal: r.doente.diagnostico_principal ?? "",
          estadiamento: r.doente.estadiamento ?? "",
          alergias: (r.doente.alergias ?? []).join(", "),
          contacto: r.doente.contacto ?? "",
          notas_clinicas: r.doente.notas_clinicas ?? "",
        });
      })
      .catch((e) => setErro(String(e)));
  }

  useEffect(recarregar, [id]);

  async function guardarClinico() {
    if (!id) return;
    setErro(null);
    setAGuardarClinico(true);
    try {
      await apiPut(`/doente/${id}`, {
        diagnostico_principal: formClinico.diagnostico_principal,
        estadiamento: formClinico.estadiamento,
        alergias: formClinico.alergias,
        contacto: formClinico.contacto,
        notas_clinicas: formClinico.notas_clinicas,
      });
      setSucesso("Perfil clínico actualizado — já é usado nos próximos cálculos de prioridade.");
      setAEditarClinico(false);
      recarregar();
      setTimeout(() => setSucesso(null), 5000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAGuardarClinico(false);
    }
  }

  async function executar() {
    if (!confirmar) return;
    setErro(null);
    setSucesso(null);
    setAProcessar(true);
    try {
      const caminho = confirmar.tipo === "remarcar" ? "remarcar-exame" : "adiar-consulta";
      await apiPost(`/doente/${id}/pedidos/${confirmar.pedidoId}/${caminho}`);
      setSucesso(
        confirmar.tipo === "remarcar"
          ? "Exame remarcado para data anterior à consulta!"
          : "Consulta adiada e vaga libertada na agenda!"
      );
      setConfirmar(null);
      recarregar();
      setTimeout(() => setSucesso(null), 5000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAProcessar(false);
    }
  }

  if (!dados) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 flex justify-center text-slate-500 gap-2 items-center">
        <Clock className="h-5 w-5 animate-spin text-oasis-header" />
        <span>A carregar perfil clínico e diagnóstico de prontidão…</span>
      </div>
    );
  }

  const temVermelhos = dados.oQueFalta?.some((it) => it.nivel === "vermelho");
  const temAmarelos = dados.oQueFalta?.some((it) => it.nivel === "amarelo");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Botão Voltar */}
      <div className="mb-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-oasis-header"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Voltar ao Início</span>
        </Link>
      </div>

      {/* Cartão de Cabeçalho do Doente */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-oasis-header text-white font-bold text-xl shadow-md">
              <User className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900">{dados.doente.nome}</h1>
                <span className="rounded-full bg-sky-100 px-3 py-0.5 text-xs font-bold text-sky-800">
                  Nº {dados.doente.n_utente}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Sexo: <strong className="text-slate-700">{dados.doente.sexo === "M" ? "Masculino" : "Feminino"}</strong> · Data de Nascimento: <strong className="text-slate-700">{dados.doente.data_nascimento}</strong>
              </p>
            </div>
          </div>

          {/* Badge Global de Prontidão Clínica */}
          <div className="flex items-center gap-2">
            <div
              className={`rounded-xl border px-3.5 py-2 flex items-center gap-2.5 shadow-2xs ${
                temVermelhos
                  ? "border-red-300 bg-red-50 text-red-900"
                  : temAmarelos
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-emerald-300 bg-emerald-50 text-emerald-900"
              }`}
            >
              {temVermelhos ? (
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
              ) : temAmarelos ? (
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              )}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">
                  Estado de Prontidão
                </span>
                <strong className="text-xs font-bold">
                  {temVermelhos
                    ? "Pendências Bloqueantes"
                    : temAmarelos
                    ? "Avisos de Prazo"
                    : "Prontidão 100% Conforme"}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Separadores Internos */}
        <div className="mt-5 flex border-t border-slate-100 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setAbaAtiva("prontidao")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 ${
              abaAtiva === "prontidao"
                ? "bg-oasis-header text-white shadow-2xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>O Que Falta & Semáforo</span>
            {dados.oQueFalta && dados.oQueFalta.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-[10px] text-slate-900 font-extrabold">
                {dados.oQueFalta.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva("clinico")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 ${
              abaAtiva === "clinico"
                ? "bg-oasis-header text-white shadow-2xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Stethoscope className="h-3.5 w-3.5" />
            <span>Perfil Clínico</span>
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva("pedidos")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 ${
              abaAtiva === "pedidos"
                ? "bg-oasis-header text-white shadow-2xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Todos os Pedidos</span>
            {dados.todosPedidos && (
              <span className="ml-1 rounded-full bg-slate-200 px-1.5 text-[10px] text-slate-700">
                {dados.todosPedidos.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva("timeline")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 ${
              abaAtiva === "timeline"
                ? "bg-oasis-header text-white shadow-2xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Timeline do Episódio</span>
          </button>
        </div>
      </div>

      {erro && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <strong>Aviso:</strong> {erro}
        </div>
      )}

      {sucesso && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 animate-in fade-in">
          <Check className="h-4 w-4 text-emerald-600" />
          <span>{sucesso}</span>
        </div>
      )}

      {/* CONTEÚDO DA ABA 1: O QUE FALTA & SEMÁFORO DE PRONTIDÃO */}
      {abaAtiva === "prontidao" && (
        <div className="mt-4 space-y-5">
          {/* SECÇÃO O QUE FALTA */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-oasis-accent" />
                <span>Diagnóstico Inteligente de Prontidão Clínica ("O Que Falta")</span>
              </h2>
              <span className="text-[11px] text-slate-400">
                Análise em tempo real do motor de regras Oasis
              </span>
            </div>

            {(!dados.oQueFalta || dados.oQueFalta.length === 0) ? (
              <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 p-5 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600 mb-1.5" />
                <p className="text-sm font-bold text-slate-800">Sem itens em falta</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Todas as dependências clínicas (exames, análises, triagens) foram cumpridas e validadas.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {dados.oQueFalta.map((item, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg border p-3.5 transition-shadow ${
                      item.nivel === "vermelho"
                        ? "border-red-200 bg-red-50/40 border-l-4 border-l-red-500"
                        : item.nivel === "amarelo"
                        ? "border-amber-200 bg-amber-50/40 border-l-4 border-l-amber-500"
                        : "border-sky-200 bg-sky-50/40 border-l-4 border-l-sky-500"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide mb-1 ${
                            item.nivel === "vermelho"
                              ? "bg-red-100 text-red-800"
                              : item.nivel === "amarelo"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-sky-100 text-sky-800"
                          }`}
                        >
                          {item.nivel === "vermelho" ? "Bloqueante" : item.nivel === "amarelo" ? "Aviso" : "Informativo"}
                        </span>
                        <h4 className="font-semibold text-sm text-slate-900">{item.titulo}</h4>
                        <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">{item.detalhe}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECÇÃO MARCAÇÕES FUTURAS & DEPENDÊNCIAS */}
          {dados.marcacoesFuturas.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-oasis-accent" />
                  <span>Marcações Futuras com Dependências Clínicas</span>
                </h2>
                <span className="text-[11px] text-slate-400">
                  Semáforo avalia se os atos prévios estão concluídos a tempo
                </span>
              </div>

              <div className="space-y-3">
                {dados.marcacoesFuturas.map((m) => (
                  <div
                    key={m.pedido_id}
                    className={`rounded-xl border p-4 shadow-2xs ${
                      m.semaforo.cor === "vermelho"
                        ? "border-red-300 bg-white"
                        : m.semaforo.cor === "amarelo"
                        ? "border-amber-300 bg-white"
                        : "border-emerald-300 bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 mb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">
                          {m.semaforo.cor === "vermelho" ? "🔴" : m.semaforo.cor === "amarelo" ? "🟡" : "🟢"}
                        </span>
                        <div>
                          <h3 className="font-bold text-sm text-slate-900">{m.descricao}</h3>
                          <p className="text-xs text-slate-500">
                            {m.especialidade_legivel} · <span className="font-mono font-semibold text-slate-700">{m.data_hora.replace("T", " às ")}</span>
                          </p>
                        </div>
                      </div>

                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          m.semaforo.cor === "vermelho"
                            ? "bg-red-100 text-red-800"
                            : m.semaforo.cor === "amarelo"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {m.semaforo.cor === "vermelho" ? "Em Risco" : m.semaforo.cor === "amarelo" ? "Atenção" : "Pronto"}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 mb-3">
                      {m.semaforo.porque}
                    </p>

                    {/* Dependências Avaliadas */}
                    {m.dependencias.length > 0 && (
                      <div className="space-y-2 mt-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                          Atos prévios necessários:
                        </span>
                        {m.dependencias.map((dep) => (
                          <div
                            key={dep.pedido_id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span>{dep.cor === "vermelho" ? "❌" : dep.cor === "amarelo" ? "⚠️" : "✅"}</span>
                              <div>
                                <p className="font-bold text-slate-800">{dep.descricao}</p>
                                <p className="text-[11px] text-slate-500">{dep.porque}</p>
                              </div>
                            </div>
                            {dep.pode_remarcar && (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmar({
                                    tipo: "remarcar",
                                    pedidoId: dep.pedido_id,
                                    texto: `Remarcar ${dep.descricao} para antes da consulta?`,
                                  })
                                }
                                className="rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-red-700"
                              >
                                Remarcar exame
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {m.semaforo.cor === "vermelho" && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmar({
                              tipo: "adiar",
                              pedidoId: m.pedido_id,
                              texto: `Adiar consulta de ${m.descricao} para libertar a vaga?`,
                            })
                          }
                          className="rounded-lg border border-red-300 bg-white px-3.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 shadow-2xs"
                        >
                          Adiar consulta para libertar vaga
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA: PERFIL CLÍNICO (usado na equação de prioridade) */}
      {abaAtiva === "clinico" && (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-4">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Stethoscope className="h-4 w-4 text-oasis-accent" />
                  <span>Perfil Clínico</span>
                </h2>
                <p className="mt-1 text-[11px] text-slate-500 max-w-xl">
                  Diagnóstico e estadiamento são guardados na ficha do doente e usados directamente pelo sistema
                  no factor clínico da equação de prioridade (secção "Definições da Prioridade", em Gestão).
                </p>
              </div>
              {!aEditarClinico && (
                <button
                  type="button"
                  onClick={() => setAEditarClinico(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs shrink-0"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Editar</span>
                </button>
              )}
            </div>

            {!aEditarClinico ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Diagnóstico principal</span>
                  <p className="text-slate-800 mt-0.5">{dados.doente.diagnostico_principal || "— Não registado"}</p>
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Estadiamento</span>
                  <p className="text-slate-800 mt-0.5">{dados.doente.estadiamento || "— Não registado"}</p>
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Alergias</span>
                  <p className="text-slate-800 mt-0.5">
                    {dados.doente.alergias && dados.doente.alergias.length > 0 ? dados.doente.alergias.join(", ") : "— Nenhuma registada"}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Contacto</span>
                  <p className="text-slate-800 mt-0.5">{dados.doente.contacto || "— Não registado"}</p>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Notas clínicas</span>
                  <p className="text-slate-700 mt-0.5 leading-relaxed">{dados.doente.notas_clinicas || "— Sem notas"}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Diagnóstico principal</label>
                    <input
                      type="text"
                      value={formClinico.diagnostico_principal}
                      onChange={(e) => setFormClinico((f) => ({ ...f, diagnostico_principal: e.target.value }))}
                      placeholder="Ex: Adenocarcinoma do cólon"
                      className="w-full rounded border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Estadiamento</label>
                    <select
                      value={formClinico.estadiamento}
                      onChange={(e) => setFormClinico((f) => ({ ...f, estadiamento: e.target.value }))}
                      className="w-full rounded border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
                    >
                      {OPCOES_ESTADIAMENTO.map((op) => (
                        <option key={op} value={op}>
                          {op || "— Não registado"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Alergias (separadas por vírgula)</label>
                    <input
                      type="text"
                      value={formClinico.alergias}
                      onChange={(e) => setFormClinico((f) => ({ ...f, alergias: e.target.value }))}
                      placeholder="Ex: Penicilina, Contraste iodado"
                      className="w-full rounded border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Contacto</label>
                    <input
                      type="text"
                      value={formClinico.contacto}
                      onChange={(e) => setFormClinico((f) => ({ ...f, contacto: e.target.value }))}
                      placeholder="912 345 678"
                      className="w-full rounded border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Notas clínicas</label>
                  <textarea
                    value={formClinico.notas_clinicas}
                    onChange={(e) => setFormClinico((f) => ({ ...f, notas_clinicas: e.target.value }))}
                    rows={3}
                    className="w-full rounded border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={guardarClinico}
                    disabled={aGuardarClinico}
                    className="rounded-lg bg-oasis-header px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
                  >
                    {aGuardarClinico ? "A guardar…" : "Guardar perfil clínico"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAEditarClinico(false);
                      recarregar();
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Transparência: como este perfil entra na equação de prioridade */}
          <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-900 flex items-center gap-1.5 mb-2">
              <Gauge className="h-3.5 w-3.5" />
              <span>Como isto entra na equação de prioridade</span>
            </h3>
            {(() => {
              const preview = pontosClinicosPreview(
                aEditarClinico ? formClinico.estadiamento : dados.doente.estadiamento ?? "",
                aEditarClinico ? formClinico.diagnostico_principal : dados.doente.diagnostico_principal ?? "",
              );
              return (
                <p className="text-xs text-sky-900">
                  Com este perfil, o factor clínico contribui com <strong>{preview.pontos} pontos</strong> (em 25) para o
                  score do doente: <em>{preview.motivo}</em>. Este factor pesa 20% do score final — ver os restantes
                  80% (urgência do prazo e tipo de pedido) em{" "}
                  <Link to="/gestao/prioridade" className="font-semibold underline hover:text-sky-700">
                    Definições da Prioridade
                  </Link>
                  .
                </p>
              );
            })()}
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA 2: TODOS OS PEDIDOS */}
      {abaAtiva === "pedidos" && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-oasis-accent" />
              <span>Lista Integral de Pedidos do Utente</span>
            </h2>

            {(!dados.todosPedidos || dados.todosPedidos.length === 0) ? (
              <p className="text-xs text-slate-500">Sem pedidos registados.</p>
            ) : (
              <div className="space-y-2">
                {dados.todosPedidos.map((ped) => (
                  <div
                    key={ped.pedido_id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-slate-300 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-oasis-header">
                          {ped.tipo_pedido_legivel}
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs font-semibold text-slate-600">
                          {ped.especialidade_destino_legivel}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-800 mt-0.5">{ped.descricao}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Prioridade: <strong>{ped.prioridade_legivel}</strong> · Prazo limite: <span className="font-mono">{ped.prazo_limite}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          ped.estado === "MARCADO"
                            ? "bg-emerald-100 text-emerald-800"
                            : ped.estado === "EM_TRIAGEM"
                            ? "bg-sky-100 text-sky-800"
                            : ped.estado === "SEM_VAGA"
                            ? "bg-amber-100 text-amber-800"
                            : ped.estado === "DEVOLVIDO"
                            ? "bg-orange-100 text-orange-800"
                            : ped.estado === "FALTOU"
                            ? "bg-red-100 text-red-800"
                            : ped.estado === "REALIZADO"
                            ? "bg-slate-100 text-slate-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {ped.estado_legivel}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA 3: TIMELINE DO EPISÓDIO */}
      {abaAtiva === "timeline" && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-4 flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-oasis-accent" />
            <span>Registo Cronológico de Eventos Clínicos (Auditoria)</span>
          </h2>

          {(!dados.timeline || dados.timeline.length === 0) ? (
            <p className="text-xs text-slate-500">Sem eventos registados.</p>
          ) : (
            <div className="relative border-l-2 border-slate-200 ml-3 space-y-4 pl-4 py-1">
              {dados.timeline.map((ev) => (
                <div key={ev.evento_id} className="relative group">
                  <div className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-oasis-accent" />
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-2xs hover:border-slate-300">
                    <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                      <span className="font-bold text-slate-700">{ev.tipo}</span>
                      <span className="font-mono">{ev.data_hora.replace("T", " ")}</span>
                    </div>
                    <p className="font-bold text-slate-900">{ev.pedido_descricao}</p>
                    <p className="text-slate-500 mt-0.5">
                      Interveniente: <strong className="text-slate-700">{ev.quem}</strong> · {ev.especialidade_legivel}
                    </p>
                    {ev.motivo && (
                      <p className="mt-1.5 rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-700 border border-slate-100">
                        {ev.motivo}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Diálogo de Confirmação para Remarcação ou Adiamento */}
      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-800">
              {confirmar.tipo === "remarcar" ? "Remarcar Exame em Falta" : "Adiar Consulta Agendada"}
            </h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">{confirmar.texto}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmar(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={aProcessar}
                onClick={executar}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
              >
                {aProcessar ? "A processar…" : "Confirmar Acção"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
