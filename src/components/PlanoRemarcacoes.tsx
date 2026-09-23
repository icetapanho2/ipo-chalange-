import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { dataHoraCurta } from "./PorqueEstaEscolha";
import { AlertTriangle, ArrowRight, Building2, CalendarOff, CalendarPlus, Check, CheckCheck, ChevronDown, ChevronUp, Stethoscope, Shuffle, UserX, Wrench } from "lucide-react";

interface Parcela {
  rotulo: string;
  pontos: number;
}

interface Proposta {
  proposta_id: string;
  origem: "AVARIA" | "FALTA";
  doente_id: string;
  doente_nome: string;
  descricao: string;
  prioridade: string;
  prazo_limite: string;
  data_hora_atual: string;
  data_hora_sugerida: string;
  dentro_do_prazo: boolean | null;
  dias_fora_do_prazo: number;
  ordem: number;
  indice: number;
  indice_parcelas: Parcela[];
  justificacao: string;
  avisos: string[];
  estado: "PENDENTE" | "ACEITE" | "REJEITADA" | "AGUARDA_MEDICO";
  sem_vaga_a_tempo?: boolean;
  consulta_dependente?: { data_hora: string; descricao: string };
  alternativa_data_hora?: string;
  vaga_extra_sugerida?: string;
  resolucao?: string;
}

export interface AccoesSemVaga {
  vagaExtra: (id: string, dataHora: string) => void;
  outsourcing: (id: string, nota: string) => void;
  pedirMedico: (id: string) => void;
  escolher: (id: string, vagaId: string, dataHora: string) => void;
}

interface Alternativa {
  vaga_id: string;
  data_hora: string;
  medico_nome: string;
  dentro_do_prazo: boolean | null;
  a_tempo_da_consulta: boolean | null;
}

/**
 * "Outra solução": a administrativa não quer a vaga sugerida. Em vez de rejeitar e deixar o doente onde
 * estava (numa avaria essa vaga já não existe), escolhe outra vaga, abre uma vaga extra, manda fazer
 * fora, ou — se uma consulta depende do exame — passa a decisão ao médico.
 */
function OutraSolucao({ p, accoes, aoFechar }: { p: Proposta; accoes: AccoesSemVaga; aoFechar: () => void }) {
  const [alternativas, setAlternativas] = useState<Alternativa[] | null>(null);
  const [dataHora, setDataHora] = useState(p.vaga_extra_sugerida ?? "");
  const [nota, setNota] = useState("");
  useEffect(() => {
    apiGet<Alternativa[]>(`/servico/remarcacoes/${p.proposta_id}/alternativas`).then(setAlternativas).catch(() => setAlternativas([]));
  }, [p.proposta_id]);

  return (
    <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/60 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold text-indigo-900">Outra solução para {p.doente_nome}</span>
        <button type="button" onClick={aoFechar} className="text-[11px] text-slate-500 hover:underline">
          Fechar
        </button>
      </div>
      <div className="mb-1 text-[10px] font-bold uppercase text-slate-500">Outra vaga</div>
      {!alternativas ? (
        <p className="text-[11px] text-slate-400">A procurar…</p>
      ) : alternativas.length === 0 ? (
        <p className="text-[11px] text-slate-500">Não há outras vagas livres compatíveis.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {alternativas.map((a) => {
            const mau = a.dentro_do_prazo === false || a.a_tempo_da_consulta === false;
            return (
              <button
                key={a.vaga_id}
                type="button"
                onClick={() => accoes.escolher(p.proposta_id, a.vaga_id, a.data_hora)}
                className={`rounded-lg border bg-white px-2 py-1 text-left text-[11px] hover:shadow-sm ${mau ? "border-amber-300" : "border-emerald-300"}`}
              >
                <span className="block font-bold text-slate-800">{dataHoraCurta(a.data_hora)}</span>
                <span className="block text-[10px] text-slate-500">{a.medico_nome}</span>
                <span className={`block text-[10px] font-semibold ${mau ? "text-amber-700" : "text-emerald-700"}`}>
                  {a.a_tempo_da_consulta === false ? "depois da consulta" : a.dentro_do_prazo === false ? "fora do prazo" : "dentro do prazo"}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <div className="rounded border border-indigo-100 bg-white p-2">
          <input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} className="mb-1.5 w-full rounded border border-slate-300 px-1.5 py-0.5 text-[11px]" />
          <button type="button" onClick={() => accoes.vagaExtra(p.proposta_id, dataHora)} disabled={!dataHora} className="flex w-full items-center justify-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
            <CalendarPlus className="h-3 w-3" /> Abrir vaga extra
          </button>
        </div>
        <div className="rounded border border-indigo-100 bg-white p-2">
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Onde e quando (ex.: Clínica X, 25/09)" className="mb-1.5 w-full rounded border border-slate-300 px-1.5 py-0.5 text-[11px]" />
          <button type="button" onClick={() => accoes.outsourcing(p.proposta_id, nota)} className="flex w-full items-center justify-center gap-1 rounded bg-slate-700 px-2 py-1 text-[11px] font-bold text-white hover:bg-slate-800">
            <Building2 className="h-3 w-3" /> Fazer fora (outsourcing)
          </button>
        </div>
        {p.consulta_dependente ? (
          <div className="flex flex-col justify-between rounded border border-indigo-100 bg-white p-2">
            <p className="mb-1.5 text-[10px] text-slate-500">O médico decide se avança com a consulta ou a adia.</p>
            <button type="button" onClick={() => accoes.pedirMedico(p.proposta_id)} className="flex w-full items-center justify-center gap-1 rounded bg-rose-700 px-2 py-1 text-[11px] font-bold text-white hover:bg-rose-800">
              <Stethoscope className="h-3 w-3" /> Enviar ao médico
            </button>
          </div>
        ) : (
          <p className="self-center text-[10px] text-slate-500">Escolha a vaga que servir melhor ao doente (por exemplo, depois de lhe ligar). Fica registado quem escolheu e porquê.</p>
        )}
      </div>
    </div>
  );
}

/** Sem vaga a tempo da consulta: a administrativa resolve (vaga extra, outsourcing) ou passa ao médico. */
function ResolverSemVaga({ p, accoes }: { p: Proposta; accoes: AccoesSemVaga }) {
  const [dataHora, setDataHora] = useState(p.vaga_extra_sugerida ?? "");
  const [nota, setNota] = useState("");
  return (
    <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5">
      <div className="mb-2 text-[11px] font-bold text-rose-900">
        Sem vaga a tempo da {p.consulta_dependente?.descricao ?? "consulta"} de {dataHoraCurta(p.consulta_dependente?.data_hora ?? "")}. Como resolver?
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded border border-rose-100 bg-white p-2">
          <input
            type="datetime-local"
            value={dataHora}
            onChange={(e) => setDataHora(e.target.value)}
            className="mb-1.5 w-full rounded border border-slate-300 px-1.5 py-0.5 text-[11px]"
          />
          <button
            type="button"
            onClick={() => accoes.vagaExtra(p.proposta_id, dataHora)}
            className="flex w-full items-center justify-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
          >
            <CalendarPlus className="h-3 w-3" /> Resolvi com vaga extra
          </button>
        </div>
        <div className="rounded border border-rose-100 bg-white p-2">
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ex.: Clínica X, 25/09"
            className="mb-1.5 w-full rounded border border-slate-300 px-1.5 py-0.5 text-[11px]"
          />
          <button
            type="button"
            onClick={() => accoes.outsourcing(p.proposta_id, nota)}
            className="flex w-full items-center justify-center gap-1 rounded bg-slate-700 px-2 py-1 text-[11px] font-bold text-white hover:bg-slate-800"
          >
            <Building2 className="h-3 w-3" /> Resolvi com outsourcing
          </button>
        </div>
        <div className="flex flex-col justify-between rounded border border-rose-100 bg-white p-2">
          <p className="mb-1.5 text-[10px] text-slate-500">Sem vaga extra nem outsourcing: o médico decide se avança com a consulta ou a adia.</p>
          <button
            type="button"
            onClick={() => accoes.pedirMedico(p.proposta_id)}
            className="flex w-full items-center justify-center gap-1 rounded bg-rose-700 px-2 py-1 text-[11px] font-bold text-white hover:bg-rose-800"
          >
            <Stethoscope className="h-3 w-3" /> Não há solução — enviar ao médico
          </button>
        </div>
      </div>
    </div>
  );
}

interface AvariaPlano {
  avaria_id: string;
  descricao: string;
  data_inicio: string;
  duracao_dias: number;
  estado: string;
  reportado_por: string;
  ato_legivel: string;
  tipo?: "EQUIPAMENTO" | "AUSENCIA_MEDICO";
  propostas: Proposta[];
}

interface Resposta {
  avarias: AvariaPlano[];
  faltas: Proposta[];
  pendentes: number;
}

const COR_PRIORIDADE: Record<string, string> = {
  MP: "bg-red-100 text-red-800",
  P: "bg-amber-100 text-amber-800",
  N: "bg-slate-100 text-slate-700",
};

function Indice({ p }: { p: Proposta }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setAberto((a) => !a)} className="flex items-center gap-1 text-left">
        <span className="text-lg font-bold text-indigo-800">{p.indice}</span>
        {aberto ? <ChevronUp className="h-3 w-3 text-slate-400" /> : <ChevronDown className="h-3 w-3 text-slate-400" />}
      </button>
      {aberto && (
        <ul className="mt-1 space-y-0.5 text-[10px] text-slate-600">
          {p.indice_parcelas.map((x) => (
            <li key={x.rotulo}>
              +{x.pontos} {x.rotulo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinhaProposta({
  p,
  aoDecidir,
  mostrarOrdem,
  accoes,
}: {
  p: Proposta;
  aoDecidir: (id: string, aceitar: boolean) => void;
  mostrarOrdem: boolean;
  accoes: AccoesSemVaga;
}) {
  const decidida = p.estado !== "PENDENTE";
  const [outra, setOutra] = useState(false);
  return (
    <div className={`rounded-lg border bg-white p-3 ${decidida ? "border-slate-100 opacity-70" : "border-slate-200"}`}>
      <div className="grid gap-3 md:grid-cols-[2.5rem_1fr_5rem_14rem_auto] md:items-start">
        {mostrarOrdem && (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-white">{p.ordem}</div>
        )}
        <div className={mostrarOrdem ? "" : "md:col-span-2"}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-slate-800">{p.doente_nome}</span>
            {p.prioridade && <span className={`rounded px-1.5 text-[10px] font-bold ${COR_PRIORIDADE[p.prioridade] ?? ""}`}>{p.prioridade}</span>}
          </div>
          <div className="text-[11px] text-slate-500">
            {p.descricao}
            {p.prazo_limite && <> · prazo {dataHoraCurta(p.prazo_limite)}</>}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-400">Índice</div>
          <Indice p={p} />
        </div>
        <div className="text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 line-through">{dataHoraCurta(p.data_hora_atual)}</span>
            <ArrowRight className="h-3 w-3 text-slate-400" />
            <span className={`font-bold ${p.dentro_do_prazo === false ? "text-rose-700" : "text-emerald-700"}`}>
              {decidida && p.resolucao ? "resolvida" : p.data_hora_sugerida ? dataHoraCurta(p.data_hora_sugerida) : p.sem_vaga_a_tempo ? "sem vaga a tempo" : "sem vaga"}
            </span>
          </div>
          {p.dentro_do_prazo === true && <span className="text-[10px] font-semibold text-emerald-700">dentro do prazo</span>}
          {p.dentro_do_prazo === false && p.data_hora_sugerida && !p.sem_vaga_a_tempo && (
            <span className="text-[10px] font-semibold text-rose-700">{p.dias_fora_do_prazo} dia(s) fora do prazo</span>
          )}
        </div>
        <div className="flex gap-1.5">
          {decidida ? (
            <span
              className={`rounded px-2 py-1 text-[10px] font-bold ${
                p.estado === "ACEITE" ? "bg-emerald-100 text-emerald-800" : p.estado === "AGUARDA_MEDICO" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600"
              }`}
            >
              {p.estado === "ACEITE" ? "Resolvida" : p.estado === "AGUARDA_MEDICO" ? "A aguardar o médico" : "Rejeitada"}
            </span>
          ) : p.sem_vaga_a_tempo ? null : (
            <>
              <button
                type="button"
                onClick={() => aoDecidir(p.proposta_id, true)}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
              >
                <Check className="h-3 w-3" /> Aceitar
              </button>
              <button
                type="button"
                onClick={() => setOutra((o) => !o)}
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Shuffle className="h-3 w-3" /> Outra solução
              </button>
            </>
          )}
        </div>
      </div>
      <p className="mt-2 rounded bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-700">
        <strong>Porquê:</strong> {p.justificacao}
      </p>
      {p.resolucao && <p className="mt-1 text-[11px] font-semibold text-emerald-800">✓ {p.resolucao}</p>}
      {p.sem_vaga_a_tempo && p.estado === "PENDENTE" && <ResolverSemVaga p={p} accoes={accoes} />}
      {outra && !decidida && !p.sem_vaga_a_tempo && <OutraSolucao p={p} accoes={accoes} aoFechar={() => setOutra(false)} />}
      {p.avisos.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {p.avisos.map((a) => (
            <span key={a} className="flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
              <AlertTriangle className="h-3 w-3" /> {a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Remarcações propostas (ESPECIFICACAO.md secção 8A): o sistema já traz a solução e a justificação;
 * a administrativa só valida. Avaria → plano em lote por ordem do índice; falta → sugestão individual.
 */
export function PlanoRemarcacoes({ aoMudar }: { aoMudar?: (mensagem: string) => void }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function recarregar() {
    apiGet<Resposta>("/servico/remarcacoes").then(setDados).catch((e) => setErro(String(e)));
  }
  useEffect(recarregar, []);

  async function decidir(id: string, aceitar: boolean) {
    setErro(null);
    try {
      await apiPost(`/servico/remarcacoes/${id}/${aceitar ? "aceitar" : "rejeitar"}`);
      recarregar();
      aoMudar?.(aceitar ? "Remarcação aplicada: o doente e o médico foram avisados." : "Proposta rejeitada: a vaga reservada foi libertada.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function executar(caminho: string, corpo: unknown, mensagem: string) {
    setErro(null);
    try {
      await apiPost(caminho, corpo);
      recarregar();
      aoMudar?.(mensagem);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }
  const accoes: AccoesSemVaga = {
    vagaExtra: (id, dataHora) => executar(`/servico/remarcacoes/${id}/vaga-extra`, { dataHora }, "Resolvido com vaga extra: exame marcado a tempo da consulta. Alerta fechado."),
    outsourcing: (id, nota) => executar(`/servico/remarcacoes/${id}/outsourcing`, { nota }, "Resolvido com outsourcing. Alerta fechado."),
    pedirMedico: (id) => executar(`/servico/remarcacoes/${id}/pedir-decisao-medico`, {}, "Enviado ao médico: vai decidir se avança com a consulta ou a adia."),
    escolher: (id, vagaId, dataHora) =>
      executar(`/servico/remarcacoes/${id}/escolher`, { vagaId }, `Marcado a ${dataHoraCurta(dataHora)} (alternativa escolhida). Doente e médico avisados.`),
  };

  // Ausência de médico (férias, doença): mesmo plano que uma avaria, só na agenda desse médico.
  const [medicos, setMedicos] = useState<{ utilizador_id: string; nome: string }[]>([]);
  const [ausencia, setAusencia] = useState({ medico_id: "", data_inicio: "", duracao_dias: 1, motivo: "Férias" });
  const [mostrarAusencia, setMostrarAusencia] = useState(false);
  useEffect(() => {
    apiGet<{ utilizador_id: string; nome: string }[]>("/servico/medicos").then((m) => {
      setMedicos(m);
      if (m[0]) setAusencia((a) => ({ ...a, medico_id: a.medico_id || m[0].utilizador_id }));
    });
  }, []);

  async function aceitarTodas(avariaId: string) {
    setErro(null);
    try {
      const r = await apiPost<{ aceites: number }>(`/servico/avarias/${avariaId}/aceitar-plano`);
      recarregar();
      aoMudar?.(`${r.aceites} remarcação(ões) aplicadas pela ordem do plano. Doentes e médicos avisados.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  if (!dados) return <p className="mt-5 text-sm text-slate-500">A carregar…</p>;

  return (
    <div className="space-y-4">
      {erro && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
      {medicos.length > 0 && !mostrarAusencia && (
        <button
          type="button"
          onClick={() => setMostrarAusencia(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <CalendarOff className="h-3.5 w-3.5" /> Registar ausência de médico
        </button>
      )}
      {medicos.length > 0 && mostrarAusencia && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
            <CalendarOff className="h-4 w-4 text-slate-500" /> Registar ausência de médico
          </div>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <select
              value={ausencia.medico_id}
              onChange={(e) => setAusencia({ ...ausencia, medico_id: e.target.value })}
              className="rounded border border-slate-300 px-2 py-1"
            >
              {medicos.map((m) => (
                <option key={m.utilizador_id} value={m.utilizador_id}>
                  {m.nome}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={ausencia.data_inicio}
              onChange={(e) => setAusencia({ ...ausencia, data_inicio: e.target.value })}
              className="rounded border border-slate-300 px-2 py-1"
            />
            <label className="flex items-center gap-1 text-slate-600">
              dias
              <input
                type="number"
                min={1}
                value={ausencia.duracao_dias}
                onChange={(e) => setAusencia({ ...ausencia, duracao_dias: Math.max(1, Number(e.target.value) || 1) })}
                className="w-14 rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <select
              value={ausencia.motivo}
              onChange={(e) => setAusencia({ ...ausencia, motivo: e.target.value })}
              className="rounded border border-slate-300 px-2 py-1"
            >
              <option>Férias</option>
              <option>Doença</option>
              <option>Formação</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setMostrarAusencia(false);
                executar("/servico/ausencias", ausencia, "Ausência registada: o plano de remarcação das consultas afectadas está abaixo.");
              }}
              className="rounded bg-slate-800 px-3 py-1 font-bold text-white hover:bg-slate-900"
            >
              Registar e planear remarcações
            </button>
          </div>
        </div>
      )}

      {dados.avarias.length === 0 && dados.faltas.length === 0 && <p className="text-xs text-slate-400">Sem remarcações propostas.</p>}

      {dados.avarias.map((a) => {
        const pendentes = a.propostas.filter((p) => p.estado === "PENDENTE" && !p.sem_vaga_a_tempo).length;
        return (
          <div key={a.avaria_id} className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-orange-900">
                  <Wrench className="h-4 w-4 text-orange-600" />
                  {a.tipo === "AUSENCIA_MEDICO" ? "Ausência de médico" : "Avaria"}: plano de remarcação ({a.propostas.length} marcações)
                </h2>
                <p className="mt-1 text-xs text-slate-700">
                  {a.ato_legivel} indisponível {a.duracao_dias === 1 ? "a" : `${a.duracao_dias} dias desde`} {dataHoraCurta(a.data_inicio)} — {a.descricao}.
                  Reportado por {a.reportado_por}.
                </p>
                <p className="mt-1 text-[11px] text-orange-900">
                  A ordem é a do índice de prioridade já calculado em cada pedido: quem mais precisa escolhe primeiro. As vagas sugeridas
                  estão reservadas até decidir. Nada é mudado sem a sua validação.
                </p>
              </div>
              {pendentes > 0 && (
                <button
                  type="button"
                  onClick={() => aceitarTodas(a.avaria_id)}
                  className="flex items-center gap-1.5 rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-800"
                >
                  <CheckCheck className="h-4 w-4" /> Aceitar todas ({pendentes})
                </button>
              )}
            </div>
            <div className="space-y-2">
              {a.propostas.map((p) => (
                <LinhaProposta key={p.proposta_id} p={p} aoDecidir={decidir} mostrarOrdem accoes={accoes} />
              ))}
            </div>
          </div>
        );
      })}

      {dados.faltas.length > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4 shadow-sm">
          <h2 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-900">
            <UserX className="h-4 w-4 text-sky-600" />
            Faltas: remarcação sugerida ({dados.faltas.length})
          </h2>
          <p className="mb-3 text-[11px] text-sky-900">
            Quando um doente falta, o sistema propõe logo a nova data — a tempo da consulta que depende do exame, se houver. Não conta como
            remarcação pelo hospital.
          </p>
          <div className="space-y-2">
            {dados.faltas.map((p) => (
              <LinhaProposta key={p.proposta_id} p={p} aoDecidir={decidir} mostrarOrdem={false} accoes={accoes} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
