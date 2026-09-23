import { useEffect, useState } from "react";
import { NomeDoente } from "./NomeDoente";
import { apiGet, apiPost } from "../lib/api";
import { dataHoraCurta } from "./PorqueEstaEscolha";
import { CalendarClock, FastForward, Stethoscope } from "lucide-react";

interface Decisao {
  proposta_id: string;
  origem: "AVARIA" | "FALTA";
  doente_id: string;
  doente_nome: string;
  exame: string;
  consulta: { data_hora: string; descricao: string; intervalo: number };
  alternativa_data_hora: string;
  data_minima_adiar: string;
  justificacao: string;
}

function Cartao({ d, aoDecidir }: { d: Decisao; aoDecidir: (id: string, decisao: "AVANCAR" | "ADIAR", data: string) => void }) {
  const [data, setData] = useState(d.data_minima_adiar);
  return (
    <div className="rounded-lg border border-rose-300 bg-white p-3">
      <p className="text-sm font-semibold text-slate-800">
        <NomeDoente id={d.doente_id} nome={d.doente_nome} /> — {d.consulta.descricao} de {dataHoraCurta(d.consulta.data_hora)}
      </p>
      <p className="mt-0.5 text-xs text-slate-600">
        O exame de que esta consulta depende ({d.exame}) ficou sem vaga a tempo {d.origem === "AVARIA" ? "depois de uma avaria" : "depois de uma falta"}. A
        administrativa não conseguiu vaga extra nem outsourcing.
      </p>
      <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
        <strong>Contexto:</strong> {d.justificacao}
      </p>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <button
          type="button"
          onClick={() => aoDecidir(d.proposta_id, "AVANCAR", "")}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
        >
          <FastForward className="h-3.5 w-3.5" />
          Avançar com a consulta a {dataHoraCurta(d.consulta.data_hora)} e ver o exame depois
          {d.alternativa_data_hora && ` (exame a ${dataHoraCurta(d.alternativa_data_hora)})`}
        </button>
        <div className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-2 py-1.5">
          <span className="text-xs font-bold text-indigo-800">Adiar a consulta para</span>
          <input
            type="date"
            value={data}
            min={d.data_minima_adiar || undefined}
            onChange={(e) => setData(e.target.value)}
            className="rounded border border-indigo-200 px-1.5 py-0.5 text-xs"
          />
          <button
            type="button"
            onClick={() => aoDecidir(d.proposta_id, "ADIAR", data)}
            className="flex items-center gap-1 rounded bg-indigo-700 px-2 py-1 text-xs font-bold text-white hover:bg-indigo-800"
          >
            <CalendarClock className="h-3.5 w-3.5" /> Adiar
          </button>
        </div>
      </div>
      {d.data_minima_adiar && (
        <p className="mt-1 text-[10px] text-slate-400">
          Data mínima sugerida: {dataHoraCurta(d.data_minima_adiar)} (primeira vaga do exame + {d.consulta.intervalo} dias para o resultado). O sistema marca a
          consulta no primeiro dia livre a partir da data escolhida, com o mesmo médico, e o exame a tempo.
        </p>
      )}
    </div>
  );
}

/** Exame sem vaga a tempo da consulta (avaria/falta), sem vaga extra nem outsourcing: o médico decide. */
export function DecisoesRemarcacao({ aoMudar }: { aoMudar?: () => void }) {
  const [itens, setItens] = useState<Decisao[]>([]);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function recarregar() {
    apiGet<Decisao[]>("/meus-pedidos/decisoes-remarcacao").then(setItens).catch((e) => setErro(String(e)));
  }
  useEffect(recarregar, []);

  async function decidir(id: string, decisao: "AVANCAR" | "ADIAR", data: string) {
    setErro(null);
    try {
      const r = await apiPost<{ consulta: string; exame: string }>(`/meus-pedidos/decisoes-remarcacao/${id}`, { decisao, novaData: data || null });
      setMensagem(
        decisao === "AVANCAR"
          ? `Consulta mantida a ${dataHoraCurta(r.consulta)}; exame a ${dataHoraCurta(r.exame)}. Doente e administrativa avisados.`
          : `Consulta adiada para ${dataHoraCurta(r.consulta)}; exame a ${dataHoraCurta(r.exame)}, a tempo do resultado. Doente e administrativa avisados.`,
      );
      recarregar();
      aoMudar?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  if (itens.length === 0 && !mensagem) return null;
  return (
    <section className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3">
      <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-rose-800">
        <Stethoscope className="h-3.5 w-3.5" />
        Exame sem vaga a tempo da consulta — decida ({itens.length})
      </h2>
      {mensagem && <p className="mt-2 rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">{mensagem}</p>}
      {erro && <p className="mt-2 text-xs text-red-700">{erro}</p>}
      <div className="mt-2 space-y-2">
        {itens.map((d) => (
          <Cartao key={d.proposta_id} d={d} aoDecidir={decidir} />
        ))}
      </div>
    </section>
  );
}
