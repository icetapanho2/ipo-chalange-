import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { dataHoraCurta } from "./PorqueEstaEscolha";
import { AlertTriangle, ArrowRight, Check, CheckCheck, ChevronDown, ChevronUp, UserX, Wrench, X } from "lucide-react";

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
  estado: "PENDENTE" | "ACEITE" | "REJEITADA";
}

interface AvariaPlano {
  avaria_id: string;
  descricao: string;
  data_inicio: string;
  duracao_dias: number;
  estado: string;
  reportado_por: string;
  ato_legivel: string;
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

function LinhaProposta({ p, aoDecidir, mostrarOrdem }: { p: Proposta; aoDecidir: (id: string, aceitar: boolean) => void; mostrarOrdem: boolean }) {
  const decidida = p.estado !== "PENDENTE";
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
              {p.data_hora_sugerida ? dataHoraCurta(p.data_hora_sugerida) : "sem vaga"}
            </span>
          </div>
          {p.dentro_do_prazo === true && <span className="text-[10px] font-semibold text-emerald-700">dentro do prazo</span>}
          {p.dentro_do_prazo === false && p.data_hora_sugerida && (
            <span className="text-[10px] font-semibold text-rose-700">{p.dias_fora_do_prazo} dia(s) fora do prazo</span>
          )}
        </div>
        <div className="flex gap-1.5">
          {decidida ? (
            <span
              className={`rounded px-2 py-1 text-[10px] font-bold ${p.estado === "ACEITE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
            >
              {p.estado === "ACEITE" ? "Aceite" : "Rejeitada"}
            </span>
          ) : (
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
                onClick={() => aoDecidir(p.proposta_id, false)}
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                <X className="h-3 w-3" /> Rejeitar
              </button>
            </>
          )}
        </div>
      </div>
      <p className="mt-2 rounded bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-700">
        <strong>Porquê:</strong> {p.justificacao}
      </p>
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
    <div className="mt-5 space-y-5">
      {erro && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
      {dados.avarias.length === 0 && dados.faltas.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Sem remarcações propostas neste serviço.
        </div>
      )}

      {dados.avarias.map((a) => {
        const pendentes = a.propostas.filter((p) => p.estado === "PENDENTE").length;
        return (
          <div key={a.avaria_id} className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-orange-900">
                  <Wrench className="h-4 w-4 text-orange-600" />
                  Avaria: plano de remarcação ({a.propostas.length} marcações)
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
                <LinhaProposta key={p.proposta_id} p={p} aoDecidir={decidir} mostrarOrdem />
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
              <LinhaProposta key={p.proposta_id} p={p} aoDecidir={decidir} mostrarOrdem={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
