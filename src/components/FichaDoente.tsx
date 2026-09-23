import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut } from "../lib/api";
import { dataHoraPT, dataPT } from "../lib/datas";
import {
  AlertTriangle,
  CalendarCheck2,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Hourglass,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  ShieldAlert,
  Stethoscope,
  XCircle,
} from "lucide-react";

interface Etapa {
  pedido_id: string;
  descricao: string;
  especialidade_legivel: string;
  estado: string;
  estado_legivel: string;
  prioridade: string;
  prazo_limite: string;
  pedido_por: string;
  data_marcada: string;
  local: string;
  medico: string;
  fora_do_prazo: boolean;
  motivo_marcacao: string;
  dependencias: { pedido_id: string; descricao: string; cor: string; porque: string }[];
  semaforo: { cor: string; porque: string } | null;
  problema: string;
  em_curso: string;
  pode_aceitar_remarcacao: boolean;
  indice: number | null;
  indice_parcelas: { rotulo: string; pontos: number }[];
}

interface DoenteFicha {
  doente_id: string;
  n_utente: string;
  nome: string;
  sexo: string;
  data_nascimento: string;
  diagnostico_principal?: string;
  alergias?: string[];
  contacto?: string;
  notas_clinicas?: string;
  estadio_cuidado?: string;
  estadio_cuidado_legivel: string;
  concelho?: string;
  distancia_km?: number;
  contacto_digital?: string;
  aceita_antecipacao?: boolean;
  transporte_nao_urgente?: boolean;
}

interface ConsultaFolha {
  ato_id: string;
  data_hora: string;
  estado: string;
  descricao: string;
  especialidade_legivel: string;
  medico: string;
  diario: { s: string; o: string; a: string; p: string; guardado_em: string } | null;
  pedidos: { pedido_id: string; descricao: string; estado_legivel: string }[];
}

interface ExameArquivo {
  ato_id: string;
  data_hora: string;
  estado: string;
  descricao: string;
  especialidade_legivel: string;
  local: string;
  pedido_por: string;
}

interface Resposta {
  folhaClinica: ConsultaFolha[];
  arquivoExames: ExameArquivo[];
  hoje: string;
  doente: DoenteFicha;
  percurso: Etapa[];
  progresso: { total: number; realizados: number; marcados: number; por_marcar: number; fechados: number; problemas: number };
  proxima: { data_hora: string; descricao: string; local: string } | null;
  comunicacoes: { comunicacao_id: string; canal: string; tipo: string; texto: string; enviar_em: string; estado: string }[];
  timeline: { evento_id: string; data_hora: string; pedido_descricao: string; quem: string; motivo: string; detalhe: string; estado_novo_legivel: string; tipo: string }[];
  logistica: { idade: number; remarcacoes_hospital_90d: number };
}

const ESTADIOS = [
  { valor: "NOVO", legivel: "Novo" },
  { valor: "PRE_TRATAMENTO", legivel: "Diagnóstico" },
  { valor: "EM_TRATAMENTO", legivel: "Tratamento" },
  { valor: "FOLLOW_UP", legivel: "Follow-up" },
];
const COR_ESTADIO: Record<string, string> = {
  NOVO: "bg-violet-100 text-violet-800",
  PRE_TRATAMENTO: "bg-rose-100 text-rose-800",
  EM_TRATAMENTO: "bg-sky-100 text-sky-800",
  FOLLOW_UP: "bg-emerald-100 text-emerald-800",
};
const TIPO_MENSAGEM: Record<string, string> = {
  MARCACAO: "Aviso de marcação",
  LEMBRETE: "Lembrete 3 dias antes",
  REMARCACAO: "Remarcação",
  OFERTA: "Vaga mais cedo",
  ANTECIPACAO: "Antecipação confirmada",
  DESMARCACAO: "Desmarcação",
};

function Icone({ e }: { e: Etapa }) {
  if (e.problema) return <AlertTriangle className="h-4 w-4 text-rose-600" />;
  if (e.estado === "REALIZADO") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (e.estado === "MARCADO") return <CalendarCheck2 className="h-4 w-4 text-sky-600" />;
  if (e.estado === "RECUSADO" || e.estado === "CANCELADO") return <XCircle className="h-4 w-4 text-slate-400" />;
  return <Hourglass className="h-4 w-4 text-amber-600" />;
}

/** Barra do percurso: quanto já está feito, marcado, por marcar e com problema. */
function Progresso({ p }: { p: Resposta["progresso"] }) {
  const partes = [
    { n: p.realizados, cor: "bg-emerald-500", rotulo: "realizados" },
    { n: p.marcados - Math.min(p.marcados, p.problemas), cor: "bg-sky-500", rotulo: "marcados" },
    { n: p.problemas, cor: "bg-rose-500", rotulo: "com problema" },
    { n: Math.max(0, p.por_marcar - p.problemas), cor: "bg-amber-400", rotulo: "por marcar" },
    { n: p.fechados, cor: "bg-slate-300", rotulo: "recusados/cancelados" },
  ].filter((x) => x.n > 0);
  if (p.total === 0) return <p className="text-xs text-slate-400">Sem pedidos.</p>;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        {partes.map((x) => (
          <div key={x.rotulo} className={x.cor} style={{ width: `${(x.n / p.total) * 100}%` }} title={`${x.n} ${x.rotulo}`} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
        {partes.map((x) => (
          <span key={x.rotulo} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${x.cor}`} /> {x.n} {x.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}

function Indice({ e }: { e: Etapa }) {
  const [aberto, setAberto] = useState(false);
  if (e.indice === null) return null;
  return (
    <span className="inline-block">
      <button type="button" onClick={() => setAberto((a) => !a)} className="inline-flex items-center gap-0.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800">
        índice {e.indice} {aberto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {aberto && <span className="ml-1 text-[10px] text-slate-500">{e.indice_parcelas.map((x) => `+${x.pontos} ${x.rotulo}`).join(" · ")}</span>}
    </span>
  );
}

/** Uma consulta da folha clínica: abre para mostrar o diário (S/O/A/P) e os pedidos feitos nela. */
function ConsultaDiario({ c, abertaInicial }: { c: ConsultaFolha; abertaInicial: boolean }) {
  const [aberta, setAberta] = useState(abertaInicial);
  return (
    <li className="rounded-lg border border-slate-200 bg-white">
      <button type="button" onClick={() => setAberta((a) => !a)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
        {aberta ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        <span className="w-32 shrink-0 text-xs font-bold text-slate-800">{dataHoraPT(c.data_hora)}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-slate-700">
          {c.descricao} · {c.especialidade_legivel} · {c.medico}
        </span>
        {c.estado === "FALTOU" ? (
          <span className="rounded bg-rose-100 px-1.5 text-[10px] font-bold text-rose-800">faltou</span>
        ) : c.diario ? (
          <span className="rounded bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700">diário</span>
        ) : (
          <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">sem diário</span>
        )}
      </button>
      {aberta && (
        <div className="space-y-1.5 border-t border-slate-100 px-3 py-2.5 text-xs">
          {c.diario ? (
            (
              [
                ["Subjectivo", c.diario.s],
                ["Objectivo", c.diario.o],
                ["Avaliação", c.diario.a],
                ["Plano", c.diario.p],
              ] as const
            )
              .filter(([, t]) => t)
              .map(([rotulo, texto]) => (
                <p key={rotulo}>
                  <span className="font-semibold text-slate-500">{rotulo}: </span>
                  <span className="whitespace-pre-line text-slate-800">{texto}</span>
                </p>
              ))
          ) : (
            <p className="text-slate-400">{c.estado === "FALTOU" ? "O doente faltou a esta consulta." : "Sem diário registado."}</p>
          )}
          {c.pedidos.length > 0 && (
            <div className="border-t border-slate-100 pt-1.5">
              <span className="font-semibold text-slate-500">Pedidos feitos nesta consulta:</span>
              <ul className="mt-0.5 list-disc pl-4 text-slate-700">
                {c.pedidos.map((p) => (
                  <li key={p.pedido_id}>
                    {p.descricao} <span className="text-slate-400">· {p.estado_legivel}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Passo({ e, aoRemarcar }: { e: Etapa; aoRemarcar: (e: Etapa) => void }) {
  return (
    <li className="relative">
      <span className="absolute -left-[33px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white">
        <Icone e={e} />
      </span>
      <div className={`rounded-lg border p-2.5 ${e.problema ? "border-rose-200 bg-rose-50/50" : "border-slate-200 bg-white"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-sm font-semibold text-slate-800">{e.descricao}</p>
          <p className={`text-xs font-bold ${e.problema ? "text-rose-700" : e.data_marcada ? "text-slate-800" : "text-amber-700"}`}>
            {e.data_marcada ? dataHoraPT(e.data_marcada) : e.estado_legivel}
          </p>
        </div>
        <p className="text-[11px] text-slate-500">
          {e.especialidade_legivel}
          {e.local && ` · ${e.local}`}
          {e.medico && ` · ${e.medico}`} · {e.estado_legivel} · {e.prioridade} · prazo{" "}
          <span className={e.fora_do_prazo ? "font-semibold text-rose-700" : ""}>{dataPT(e.prazo_limite)}</span> · pedido por {e.pedido_por}
        </p>
        {e.dependencias.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
            <span className="text-slate-500">Precisa antes:</span>
            {e.dependencias.map((d) => (
              <span
                key={d.pedido_id}
                title={d.porque}
                className={`rounded px-1.5 py-0.5 font-semibold ${
                  d.cor === "vermelho" ? "bg-rose-100 text-rose-800" : d.cor === "amarelo" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {d.cor === "verde" ? "✓" : d.cor === "vermelho" ? "✗" : "…"} {d.descricao.split(" — ")[0]}
              </span>
            ))}
          </div>
        )}
        {e.problema && <p className="mt-1 text-[11px] font-semibold text-rose-700">{e.problema}</p>}
        {e.em_curso && <p className="mt-0.5 text-[11px] font-semibold text-indigo-700">↻ {e.em_curso}</p>}
        {!e.problema && e.semaforo && e.semaforo.cor !== "verde" && <p className="mt-0.5 text-[11px] text-amber-700">{e.semaforo.porque}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Indice e={e} />
          {e.motivo_marcacao && e.estado === "MARCADO" && <span className="text-[10px] text-slate-400">{e.motivo_marcacao}</span>}
          {e.pode_aceitar_remarcacao && (
            <button type="button" onClick={() => aoRemarcar(e)} className="ml-auto rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700">
              Aceitar a remarcação sugerida
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Ficha do doente — uma só implementação, usada na página /doente/:id e no painel lateral que abre ao
 * clicar num nome. Em cima o essencial (quem é, estádio, alergias, como se contacta, próxima marcação,
 * progresso); depois o percurso completo pela ordem das datas; ao lado o perfil e as mensagens.
 */
export function FichaDoente({ doenteId, compacta = false, vistaInicial = "percurso" }: { doenteId: string; compacta?: boolean; vistaInicial?: "percurso" | "folha" | "exames" | "perfil" }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aEditar, setAEditar] = useState(false);
  const [form, setForm] = useState<Partial<DoenteFicha> & { alergiasTexto?: string }>({});
  const [verHistorico, setVerHistorico] = useState(false);
  const [vista, setVista] = useState<"percurso" | "folha" | "exames">(vistaInicial === "perfil" ? "percurso" : vistaInicial);
  const [edicaoInicialFeita, setEdicaoInicialFeita] = useState(vistaInicial !== "perfil");
  const [mensagem, setMensagem] = useState<string | null>(null);

  function carregar() {
    apiGet<Resposta>(`/doente/${doenteId}`)
      .then((r) => {
        setDados(r);
        setErro(null);
      })
      .catch((e) => setErro(String(e)));
  }
  useEffect(carregar, [doenteId]);

  // Aberta em "perfil": o formulário de edição já vem aberto.
  useEffect(() => {
    if (dados && !edicaoInicialFeita) {
      setEdicaoInicialFeita(true);
      editar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados]);

  function editar() {
    if (!dados) return;
    setForm({ ...dados.doente, alergiasTexto: (dados.doente.alergias ?? []).join(", ") });
    setAEditar(true);
  }

  async function guardar() {
    try {
      await apiPut(`/doente/${doenteId}`, { ...form, alergias: form.alergiasTexto ?? "" });
      setAEditar(false);
      setMensagem("Perfil guardado. A prioridade dos pedidos foi recalculada.");
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function remarcar(e: Etapa) {
    try {
      await apiPost(`/doente/${doenteId}/pedidos/${e.pedido_id}/remarcar-exame`);
      setMensagem("Remarcação aplicada; o doente foi avisado.");
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    }
  }

  if (erro && !dados) return <p className="p-4 text-sm text-red-700">{erro}</p>;
  if (!dados) return <p className="p-4 text-sm text-slate-400">A carregar…</p>;
  const { doente: d, percurso, progresso, proxima } = dados;
  const hoje = dados.hoje;
  const passados = percurso.filter((e) => e.data_marcada && e.data_marcada.slice(0, 10) < hoje && e.estado !== "MARCADO");
  const seguintes = percurso.filter((e) => !passados.includes(e));
  const problemas = percurso.filter((e) => e.problema);
  const semContactoDigital = d.contacto_digital === "NENHUM";

  return (
    <div className="space-y-4">
      {mensagem && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{mensagem}</p>}
      {erro && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {/* Quem é — o essencial à vista */}
      <section data-tour="ficha-resumo" className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={`${compacta ? "text-lg" : "text-2xl"} font-bold text-slate-900`}>{d.nome}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${COR_ESTADIO[d.estadio_cuidado ?? ""] ?? "bg-slate-100 text-slate-600"}`}>{d.estadio_cuidado_legivel}</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Nº utente {d.n_utente} · {dados.logistica.idade} anos · {d.sexo === "M" ? "masculino" : "feminino"} · nasceu a {dataPT(d.data_nascimento)}
            </p>
            {d.diagnostico_principal && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
                <Stethoscope className="h-3.5 w-3.5 text-slate-400" /> {d.diagnostico_principal}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {(d.alergias ?? []).map((a) => (
                <span key={a} className="flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-800">
                  <ShieldAlert className="h-3 w-3" /> Alergia: {a}
                </span>
              ))}
              <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold ${semContactoDigital ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                {d.contacto_digital === "EMAIL" ? <Mail className="h-3 w-3" /> : semContactoDigital ? <Phone className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                {semContactoDigital ? "Sem telemóvel nem email — avisar por telefone" : `Avisos por ${d.contacto_digital}`}
                {d.contacto ? ` · ${d.contacto}` : ""}
              </span>
              {d.concelho && (
                <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold ${(d.distancia_km ?? 0) >= 50 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                  <MapPin className="h-3 w-3" /> {d.concelho} ({d.distancia_km} km)
                </span>
              )}
              {d.transporte_nao_urgente && (
                <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
                  <Car className="h-3 w-3" /> Transporte não urgente
                </span>
              )}
              {dados.logistica.remarcacoes_hospital_90d > 0 && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Já remarcado {dados.logistica.remarcacoes_hospital_90d}× pelo hospital</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className={`rounded-lg border px-3 py-2 text-right ${problemas.length ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
              <div className={`text-xs font-bold ${problemas.length ? "text-rose-800" : "text-emerald-800"}`}>
                {problemas.length ? `${problemas.length} problema(s) a resolver` : "Tudo em ordem"}
              </div>
              <div className="text-[11px] text-slate-600">
                {proxima ? (
                  <>
                    Próxima: <strong>{dataHoraPT(proxima.data_hora)}</strong> · {proxima.descricao.split(" — ")[0]}
                  </>
                ) : (
                  "Sem marcações futuras"
                )}
              </div>
            </div>
            <button type="button" onClick={editar} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Pencil className="h-3 w-3" /> Editar perfil
            </button>
          </div>
        </div>
        <div className="mt-3 border-t border-slate-100 pt-3">
          <Progresso p={progresso} />
        </div>
      </section>

      {aEditar && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
          <h2 className="mb-2 text-sm font-bold text-slate-800">Editar perfil (entra na prioridade e na escolha de vagas)</h2>
          <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <label>
              Estádio
              <select value={form.estadio_cuidado ?? ""} onChange={(e) => setForm({ ...form, estadio_cuidado: e.target.value })} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5">
                {ESTADIOS.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.legivel}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              Diagnóstico
              <input value={form.diagnostico_principal ?? ""} onChange={(e) => setForm({ ...form, diagnostico_principal: e.target.value })} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5" />
            </label>
            <label>
              Alergias (separadas por vírgula)
              <input value={form.alergiasTexto ?? ""} onChange={(e) => setForm({ ...form, alergiasTexto: e.target.value })} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5" />
            </label>
            <label>
              Contacto
              <input value={form.contacto ?? ""} onChange={(e) => setForm({ ...form, contacto: e.target.value })} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5" />
            </label>
            <label>
              Avisos por
              <select value={form.contacto_digital ?? "SMS"} onChange={(e) => setForm({ ...form, contacto_digital: e.target.value })} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5">
                <option value="SMS">SMS</option>
                <option value="EMAIL">Email</option>
                <option value="NENHUM">Sem telemóvel nem email</option>
              </select>
            </label>
            <label>
              Concelho
              <input value={form.concelho ?? ""} onChange={(e) => setForm({ ...form, concelho: e.target.value })} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5" />
            </label>
            <label>
              Distância ao hospital (km)
              <input type="number" value={form.distancia_km ?? 0} onChange={(e) => setForm({ ...form, distancia_km: Number(e.target.value) })} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5" />
            </label>
            <div className="flex flex-col justify-end gap-1">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={!!form.transporte_nao_urgente} onChange={(e) => setForm({ ...form, transporte_nao_urgente: e.target.checked })} /> Transporte não urgente
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={!!form.aceita_antecipacao} onChange={(e) => setForm({ ...form, aceita_antecipacao: e.target.checked })} /> Aceita ser antecipado
              </label>
            </div>
            <label className="sm:col-span-2 lg:col-span-3">
              Notas clínicas
              <textarea value={form.notas_clinicas ?? ""} onChange={(e) => setForm({ ...form, notas_clinicas: e.target.value })} rows={2} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5" />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={guardar} className="rounded-lg bg-oasis-header px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700">
              Guardar
            </button>
            <button type="button" onClick={() => setAEditar(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
              Cancelar
            </button>
          </div>
        </section>
      )}

      <div className={`grid gap-4 ${compacta ? "" : "lg:grid-cols-[1fr_320px]"}`}>
        {/* Percurso: tudo o que foi pedido, pela ordem das datas */}
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
            {(
              [
                ["percurso", `Percurso dos pedidos (${percurso.length})`],
                ["folha", `Folha clínica (${dados.folhaClinica.length})`],
                ["exames", `Arquivo de exames (${dados.arquivoExames.length})`],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setVista(valor)}
                className={`flex-1 rounded-md px-2 py-1.5 ${vista === valor ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {vista === "folha" && (
            <ul className="space-y-1.5">
              {dados.folhaClinica.length === 0 && <li className="text-xs text-slate-400">Sem consultas registadas.</li>}
              {dados.folhaClinica.map((c, i) => (
                <ConsultaDiario key={c.ato_id} c={c} abertaInicial={i === 0} />
              ))}
            </ul>
          )}

          {vista === "exames" && (
            <table className="w-full text-xs">
              <tbody>
                {dados.arquivoExames.length === 0 && (
                  <tr>
                    <td className="text-slate-400">Sem exames realizados.</td>
                  </tr>
                )}
                {dados.arquivoExames.map((x) => (
                  <tr key={x.ato_id} className="border-t border-slate-100 align-top first:border-t-0">
                    <td className="w-32 py-1.5 pr-2 font-semibold text-slate-800">{dataHoraPT(x.data_hora)}</td>
                    <td className="py-1.5 pr-2">
                      <span className="text-slate-800">{x.descricao}</span>
                      <span className="block text-[11px] text-slate-500">
                        {x.especialidade_legivel}
                        {x.local && ` · ${x.local}`}
                        {x.pedido_por && ` · pedido por ${x.pedido_por}`}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">
                      {x.estado === "FALTOU" ? (
                        <span className="rounded bg-rose-100 px-1.5 text-[10px] font-bold text-rose-800">faltou</span>
                      ) : (
                        <span className="rounded bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700">realizado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {vista === "percurso" && percurso.length === 0 && <p className="text-xs text-slate-400">Ainda sem pedidos.</p>}
          {vista === "percurso" && (
          <ol className="relative space-y-2.5 border-l-2 border-slate-100 pl-6">
            {passados.map((e) => (
              <Passo key={e.pedido_id} e={e} aoRemarcar={remarcar} />
            ))}
            {passados.length > 0 && seguintes.length > 0 && (
              <li className="relative -ml-6 flex items-center gap-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                <Clock className="h-3.5 w-3.5" /> Hoje
                <span className="h-px flex-1 bg-slate-200" />
              </li>
            )}
            {seguintes.map((e) => (
              <Passo key={e.pedido_id} e={e} aoRemarcar={remarcar} />
            ))}
          </ol>
          )}
        </section>

        <div className="space-y-4">
          {d.notas_clinicas && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-1 text-sm font-bold text-slate-800">Notas clínicas</h2>
              <p className="text-xs leading-relaxed text-slate-600">{d.notas_clinicas}</p>
            </section>
          )}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-800">Mensagens ao doente ({dados.comunicacoes.length})</h2>
            <p className="mb-2 text-[10px] text-slate-400">Simuladas — nada é enviado na demonstração.</p>
            {dados.comunicacoes.length === 0 && <p className="text-xs text-slate-400">Sem mensagens.</p>}
            <ul className="space-y-2">
              {dados.comunicacoes.slice(0, compacta ? 3 : 6).map((c) => (
                <li key={c.comunicacao_id} className="text-[11px]">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                    {TIPO_MENSAGEM[c.tipo] ?? c.tipo} · {c.canal}
                    <span className={`ml-auto rounded px-1 text-[10px] ${c.estado === "AGENDADA" ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"}`}>
                      {c.estado === "AGENDADA" ? `agendada ${dataPT(c.enviar_em)}` : `enviada ${dataPT(c.enviar_em)}`}
                    </span>
                  </div>
                  <p className="text-slate-500">{c.texto}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* Histórico (auditoria): tudo o que aconteceu, quem e porquê */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <button type="button" onClick={() => setVerHistorico((v) => !v)} className="flex w-full items-center gap-1.5 px-4 py-3 text-left text-sm font-bold text-slate-800">
          {verHistorico ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} Histórico completo ({dados.timeline.length} registos)
          <span className="ml-auto text-[11px] font-normal text-slate-400">quem fez o quê, quando e porquê</span>
        </button>
        {verHistorico && (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {dados.timeline.map((t) => (
              <li key={t.evento_id} className="grid gap-x-3 px-4 py-1.5 text-[11px] sm:grid-cols-[8.5rem_1fr]">
                <span className="text-slate-400">{dataHoraPT(t.data_hora)}</span>
                <span className="text-slate-700">
                  <strong>{t.pedido_descricao.split(" — ")[0]}</strong>
                  {t.estado_novo_legivel && ` → ${t.estado_novo_legivel}`} · {t.quem}
                  {t.motivo && <span className="text-slate-500"> · {t.motivo}</span>}
                  {t.detalhe && <span className="block text-slate-400">{t.detalhe}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
