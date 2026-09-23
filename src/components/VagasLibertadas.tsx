import { useEffect, useState } from "react";
import { NomeDoente } from "./NomeDoente";
import { apiGet, apiPost } from "../lib/api";
import { dataHoraCurta } from "./PorqueEstaEscolha";
import { CalendarX2, Check, ChevronDown, ChevronUp, MessageSquare, Search, Sparkles, X } from "lucide-react";

interface Marcacao {
  pedido_id: string;
  doente_id: string;
  doente_nome: string;
  descricao: string;
  data_hora: string;
  prazo_limite: string;
  prioridade_legivel: string;
}

interface CandidatoAntecipacao {
  doente_id: string;
  pedido_id: string;
  doente_nome: string;
  estadio_cuidado: string;
  data_hora_atual: string;
  dias_ganhos: number | null;
  grupo: number;
  motivo: string;
}

interface Oferta {
  doente_id: string;
  oferta_id: string;
  doente_nome: string;
  pedido_descricao: string;
  data_hora_vaga: string;
  data_hora_atual: string;
  motivo: string;
  estado: string;
  expira_em: string;
  origem: string;
  nivel_cascata: number;
  candidatos: CandidatoAntecipacao[];
}

interface RespostaVagas {
  pendentes: Oferta[];
  historico: Oferta[];
  libertadas: { vaga_id: string; data_hora: string; aviso_horas: number; origem: string; desfecho: string }[];
}

const ESTADO_OFERTA: Record<string, string> = {
  ACEITE: "bg-emerald-100 text-emerald-800",
  RECUSADA: "bg-slate-100 text-slate-600",
  EXPIRADA: "bg-amber-100 text-amber-800",
};

/**
 * Vagas libertadas (ESPECIFICACAO.md secção 8A, R-E): o doente desmarca com aviso → a vaga é
 * oferecida, por regras, a quem mais ganha com ela. A resposta do doente é simulada (SMS).
 */
export function VagasLibertadas({ aoMudar }: { aoMudar?: (mensagem: string) => void }) {
  const [marcacoes, setMarcacoes] = useState<Marcacao[]>([]);
  const [vagas, setVagas] = useState<RespostaVagas | null>(null);
  const [filtro, setFiltro] = useState("");
  const [aDesmarcar, setADesmarcar] = useState<string | null>(null);
  const [disponivel, setDisponivel] = useState("");
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  function recarregar() {
    apiGet<Marcacao[]>("/servico/marcacoes").then(setMarcacoes).catch((e) => setErro(String(e)));
    apiGet<RespostaVagas>("/servico/vagas-libertadas").then(setVagas).catch((e) => setErro(String(e)));
  }
  useEffect(recarregar, []);

  async function desmarcar(pedidoId: string) {
    setErro(null);
    try {
      const r = await apiPost<{ oferta: Oferta | null; reagendado_para: string | null }>(`/servico/pedidos/${pedidoId}/desmarcar`, {
        disponivelAPartirDe: disponivel || null,
      });
      setADesmarcar(null);
      setDisponivel("");
      recarregar();
      aoMudar?.(
        `Desmarcado a pedido do doente.${r.reagendado_para ? ` Reagendado para ${dataHoraCurta(r.reagendado_para)}.` : ""}${
          r.oferta ? " A vaga foi oferecida a outro doente — ver abaixo." : " Sem candidato para a vaga: volta às vagas livres."
        }`,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function responder(ofertaId: string, aceita: boolean) {
    setErro(null);
    try {
      const r = await apiPost<{ seguinte: Oferta | null }>(`/servico/ofertas/${ofertaId}/responder`, { aceita });
      recarregar();
      aoMudar?.(
        aceita
          ? `Antecipação confirmada.${r.seguinte ? ` A vaga antiga foi oferecida a ${r.seguinte.doente_nome} (cascata).` : ""}`
          : `Oferta recusada.${r.seguinte ? ` Oferecida ao seguinte: ${r.seguinte.doente_nome}.` : " Sem mais candidatos."}`,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  const alternar = (id: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const visiveis = marcacoes.filter((m) => !filtro || m.doente_nome.toLowerCase().includes(filtro.toLowerCase())).slice(0, 8);

  return (
    <div className="mt-5 space-y-5">
      {erro && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      {/* Ofertas pendentes */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
        <h2 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-900">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          Vagas libertadas oferecidas ({vagas?.pendentes.length ?? 0})
        </h2>
        <p className="mb-3 text-[11px] text-emerald-800">
          Quando um doente desmarca com mais de 72 h de aviso, a vaga é oferecida por SMS a quem mais ganha com ela: primeiro quem está sem
          vaga ou marcado depois do prazo (em diagnóstico à frente), depois quem está em diagnóstico e ganha pelo menos 7 dias.
        </p>
        {vagas && vagas.pendentes.length === 0 && <p className="text-xs text-slate-500">Nenhuma oferta à espera de resposta.</p>}
        <div className="space-y-2.5">
          {vagas?.pendentes.map((o) => (
            <div key={o.oferta_id} className="rounded-lg border border-emerald-200 bg-white p-3.5 shadow-2xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    <NomeDoente id={o.doente_id} nome={o.doente_nome} />: {dataHoraCurta(o.data_hora_atual)} → <span className="text-emerald-700">{dataHoraCurta(o.data_hora_vaga)}</span>
                  </h4>
                  <p className="text-xs text-slate-600">{o.pedido_descricao}</p>
                  <p className="mt-1 text-xs text-slate-700">
                    <strong>Porquê:</strong> {o.motivo}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                    <MessageSquare className="h-3 w-3" /> SMS enviado · responde até {dataHoraCurta(o.expira_em)} · {o.origem}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => responder(o.oferta_id, true)}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    <Check className="h-3.5 w-3.5" /> Doente aceitou
                  </button>
                  <button
                    type="button"
                    onClick={() => responder(o.oferta_id, false)}
                    className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <X className="h-3.5 w-3.5" /> Recusou
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => alternar(o.oferta_id)}
                className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline"
              >
                {abertas.has(o.oferta_id) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Porquê esta pessoa? ({o.candidatos.length} candidatos, por ordem)
              </button>
              {abertas.has(o.oferta_id) && (
                <ol className="mt-2 space-y-1 text-xs">
                  {o.candidatos.map((c, i) => (
                    <li key={c.pedido_id} className={`rounded px-2 py-1 ${i === 0 ? "bg-emerald-50 font-semibold text-emerald-900" : "text-slate-600"}`}>
                      {i + 1}. <NomeDoente id={c.doente_id} nome={c.doente_nome} /> — {c.motivo}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Desmarcar a pedido do doente */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
          <CalendarX2 className="h-4 w-4 text-slate-500" />
          O doente ligou a desmarcar
        </h2>
        <p className="mb-3 text-[11px] text-slate-500">
          Não conta como remarcação pelo hospital. A vaga é libertada e oferecida por regras; o doente é reagendado a partir da data que indicar.
        </p>
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Procurar doente (ex.: Rui)"
            className="w-full text-xs outline-none"
          />
        </div>
        <div className="divide-y divide-slate-100">
          {visiveis.map((m) => (
            <div key={m.pedido_id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs">
                  <span className="font-semibold text-slate-800"><NomeDoente id={m.doente_id} nome={m.doente_nome} /></span>
                  <span className="text-slate-500"> · {dataHoraCurta(m.data_hora)} · {m.descricao}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setADesmarcar(aDesmarcar === m.pedido_id ? null : m.pedido_id)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Desmarcar a pedido do doente
                </button>
              </div>
              {aDesmarcar === m.pedido_id && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs">
                  <label className="text-slate-600">Disponível a partir de</label>
                  <input
                    type="date"
                    value={disponivel}
                    onChange={(e) => setDisponivel(e.target.value)}
                    className="rounded border border-slate-300 px-2 py-1"
                  />
                  <button
                    type="button"
                    onClick={() => desmarcar(m.pedido_id)}
                    className="rounded-lg bg-slate-800 px-3 py-1 font-bold text-white hover:bg-slate-900"
                  >
                    Confirmar desmarcação
                  </button>
                </div>
              )}
            </div>
          ))}
          {visiveis.length === 0 && <p className="py-2 text-xs text-slate-500">Sem marcações futuras.</p>}
        </div>
      </div>

      {/* Histórico */}
      {vagas && vagas.historico.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">Histórico de ofertas</h2>
          <ul className="space-y-1 text-xs">
            {vagas.historico.map((o) => (
              <li key={o.oferta_id} className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${ESTADO_OFERTA[o.estado] ?? "bg-slate-100"}`}>{o.estado}</span>
                <span className="font-semibold text-slate-800"><NomeDoente id={o.doente_id} nome={o.doente_nome} /></span>
                <span className="text-slate-500">
                  {dataHoraCurta(o.data_hora_atual)} → {dataHoraCurta(o.data_hora_vaga)}
                  {o.nivel_cascata > 0 ? ` · cascata nível ${o.nivel_cascata}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
