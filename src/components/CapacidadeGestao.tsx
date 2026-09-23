import { useEffect, useState } from "react";
import { NomeDoente } from "./NomeDoente";
import { apiGet, apiPost } from "../lib/api";
import { dataHoraCurta } from "./PorqueEstaEscolha";
import { AlarmClock, CalendarPlus } from "lucide-react";

interface ItemPrazo {
  doente_id: string;
  pedido_id: string;
  doente_nome: string;
  especialidade_legivel: string;
  descricao: string;
  prioridade: string;
  indice: number;
  situacao: string;
  solucao: "VAGA_LIVRE" | "TROCA" | "ANTECIPAR" | "VAGA_EXTRA";
  solucao_texto: string;
}

interface RespostaPrazos {
  total: number;
  porServico: { servico: string; n: number }[];
  porSolucao: { vaga_livre: number; troca: number; antecipar: number; vaga_extra: number };
  itens: ItemPrazo[];
}

const COR_SOLUCAO: Record<ItemPrazo["solucao"], string> = {
  VAGA_LIVRE: "bg-emerald-100 text-emerald-800",
  TROCA: "bg-indigo-100 text-indigo-800",
  ANTECIPAR: "bg-sky-100 text-sky-800",
  VAGA_EXTRA: "bg-rose-100 text-rose-800",
};
const NOME_SOLUCAO: Record<ItemPrazo["solucao"], string> = {
  VAGA_LIVRE: "Vaga livre",
  TROCA: "Troca segura",
  ANTECIPAR: "Antecipar",
  VAGA_EXTRA: "Sessão/vaga extra",
};

/** R-L — Alerta antecipado: prazos que vão falhar nas próximas 2 semanas, com a solução já proposta. */
export function PrazosEmRisco() {
  const [dados, setDados] = useState<RespostaPrazos | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    apiGet<RespostaPrazos>("/prioridades/prazos-em-risco").then(setDados).catch(() => undefined);
  }, []);
  if (!dados) return null;
  const itens = verTodos ? dados.itens : dados.itens.slice(0, 8);
  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-xs font-semibold text-amber-900 hover:underline">
        Ver os {dados.total} doentes em risco e a solução proposta para cada um →
      </button>
    );
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900">
        <AlarmClock className="h-4 w-4" /> Prazos em risco nas próximas 2 semanas ({dados.total})
      </h3>
      <p className="mb-2 text-[11px] text-amber-900">
        Pedidos marcados para depois do prazo, ou ainda sem marcação com o prazo a acabar — cada um já com a solução proposta. Ordenados pelo índice de
        prioridade.
      </p>
      <div className="mb-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
        {dados.porServico.map((s) => (
          <span key={s.servico} className="rounded bg-white px-2 py-0.5 text-slate-700">
            {s.servico}: {s.n}
          </span>
        ))}
        <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">vaga livre {dados.porSolucao.vaga_livre}</span>
        <span className="rounded bg-indigo-100 px-2 py-0.5 text-indigo-800">troca {dados.porSolucao.troca}</span>
        <span className="rounded bg-sky-100 px-2 py-0.5 text-sky-800">antecipar {dados.porSolucao.antecipar}</span>
        <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-800">sessão/vaga extra {dados.porSolucao.vaga_extra}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="border-b border-amber-200 text-[10px] uppercase text-slate-500">
              <th className="py-1 pr-2">Doente</th>
              <th className="py-1 pr-2">Situação</th>
              <th className="py-1 pr-2">Índice</th>
              <th className="py-1">Solução proposta</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.pedido_id} className="border-b border-amber-100 align-top">
                <td className="py-1.5 pr-2">
                  <div className="font-semibold text-slate-800">
                    <NomeDoente id={i.doente_id} nome={i.doente_nome} /> <span className="text-[10px] font-bold text-red-700">{i.prioridade}</span>
                  </div>
                  <div className="text-[10px] text-slate-500">{i.especialidade_legivel}</div>
                </td>
                <td className="py-1.5 pr-2 text-slate-600">{i.situacao}</td>
                <td className="py-1.5 pr-2 font-bold text-indigo-800">{i.indice}</td>
                <td className="py-1.5">
                  <span className={`mr-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${COR_SOLUCAO[i.solucao]}`}>{NOME_SOLUCAO[i.solucao]}</span>
                  <span className="text-slate-600">{i.solucao_texto}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dados.itens.length > 8 && (
        <button type="button" onClick={() => setVerTodos((v) => !v)} className="mt-2 text-[11px] font-semibold text-amber-900 hover:underline">
          {verTodos ? "Ver menos" : `Ver todos (${dados.itens.length})`}
        </button>
      )}
    </div>
  );
}

interface Previsao {
  vagas: number;
  doentes: { pedido_id: string; doente_id: string; doente_nome: string; data_hora_nova: string; data_hora_atual: string; dias_ganhos: number | null; motivo: string }[];
  dias_ganhos: number;
  dentro_do_prazo: number;
}

/** R-M — Sessão extra com a lista pronta: quem ganha com cada vaga, antes de a abrir. */
export interface OpcoesSessao {
  especialidade: string;
  data: string;
  horaInicio: string;
  nVagas: number;
}
export const OPCOES_SESSAO_INICIAIS: OpcoesSessao = { especialidade: "7000_2", data: "2026-09-26", horaInicio: "08:00", nVagas: 6 };

export function SessaoExtra({ opcoes, setOpcoes, aoAbrir }: { opcoes: OpcoesSessao; setOpcoes: (o: OpcoesSessao) => void; aoAbrir?: () => void }) {
  const [especialidades, setEspecialidades] = useState<{ codigo: string; descricao: string }[]>([]);
  const [previsao, setPrevisao] = useState<Previsao | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ codigo: string; descricao: string }[]>("/gestao/especialidades").then(setEspecialidades).catch(() => undefined);
  }, []);
  useEffect(() => {
    setResultado(null);
    apiPost<Previsao>("/prioridades/sessao-extra/previsao", opcoes)
      .then((p) => {
        setPrevisao(p);
        setErro(null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }, [opcoes]);

  async function abrir() {
    try {
      const r = await apiPost<{ vagas: number; ofertas: number }>("/prioridades/sessao-extra", opcoes);
      aoAbrir?.();
      setResultado(`Sessão aberta: ${r.vagas} vaga(s) criada(s), ${r.ofertas} oferta(s) enviada(s) por SMS. As respostas aparecem no serviço, em "Vagas libertadas".`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div id="sessao-extra" className="rounded-xl border border-sky-200 bg-sky-50/50 p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-900">
        <CalendarPlus className="h-4 w-4" /> Sessão extra — com a lista pronta
      </h3>
      <p className="mb-2 text-[11px] text-sky-900">
        Antes de pagar horas extra, veja quem ganha com elas: as mesmas regras da vaga libertada (sem vaga ou fora do prazo primeiro, em diagnóstico à frente).
      </p>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <select
          value={opcoes.especialidade}
          onChange={(e) => setOpcoes({ ...opcoes, especialidade: e.target.value })}
          className="rounded border border-slate-300 px-2 py-1"
        >
          {especialidades.map((e) => (
            <option key={e.codigo} value={e.codigo}>
              {e.descricao}
            </option>
          ))}
        </select>
        <input type="date" value={opcoes.data} onChange={(e) => setOpcoes({ ...opcoes, data: e.target.value })} className="rounded border border-slate-300 px-2 py-1" />
        <input
          type="time"
          value={opcoes.horaInicio}
          onChange={(e) => setOpcoes({ ...opcoes, horaInicio: e.target.value })}
          className="rounded border border-slate-300 px-2 py-1"
        />
        <label className="flex items-center gap-1 text-slate-600">
          vagas
          <input
            type="number"
            min={1}
            max={30}
            value={opcoes.nVagas}
            onChange={(e) => setOpcoes({ ...opcoes, nVagas: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })}
            className="w-14 rounded border border-slate-300 px-2 py-1"
          />
        </label>
      </div>
      {erro && <p className="text-xs text-red-700">{erro}</p>}
      {previsao && (
        <>
          <p className="mb-2 text-xs font-semibold text-slate-800">
            {previsao.doentes.length} de {previsao.vagas} vaga(s) têm quem ganhe com elas · {previsao.dias_ganhos} dias ganhos no total ·{" "}
            {previsao.dentro_do_prazo} doente(s) passam a estar dentro do prazo.
            {previsao.doentes.length < previsao.vagas && (
              <span className="ml-1 text-amber-800">Chega abrir {previsao.doentes.length} vaga(s) — as restantes ficariam vazias.</span>
            )}
          </p>
          <ol className="mb-2 space-y-1 text-xs">
            {previsao.doentes.map((d, i) => (
              <li key={d.pedido_id} className="rounded bg-white px-2 py-1 text-slate-700">
                <strong>
                  {i + 1}. <NomeDoente id={d.doente_id} nome={d.doente_nome} />
                </strong>{" "}
                — {dataHoraCurta(d.data_hora_atual)} → <strong className="text-sky-800">{dataHoraCurta(d.data_hora_nova)}</strong>
                <span className="text-slate-500"> · {d.motivo}</span>
              </li>
            ))}
          </ol>
          {previsao.doentes.length > 0 && (
            <button type="button" onClick={abrir} className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-800">
              Abrir a sessão e oferecer as vagas por SMS
            </button>
          )}
          {resultado && <p className="mt-2 text-xs font-semibold text-emerald-800">{resultado}</p>}
        </>
      )}
    </div>
  );
}

interface CapacidadeServico {
  especialidade: string;
  especialidade_legivel: string;
  em_risco: number;
  resolve_o_servico: number;
  sessao_extra_ajuda: number;
  a_espera_de_outro_servico: { servico: string; n: number }[];
  outros: { motivo: string; n: number }[];
  trava_outros_servicos: number;
  recomendacao: string;
}

/**
 * Para o gestor: onde falta capacidade nas próximas 2 semanas e onde uma sessão extra ajuda de
 * facto — incluindo quando não ajuda, porque os doentes esperam por exames de outro serviço.
 */
export function OndePorCapacidade({ opcoes, versao, aoPreparar }: { opcoes: OpcoesSessao; versao: number; aoPreparar: (especialidade: string, nVagas: number) => void }) {
  const [linhas, setLinhas] = useState<CapacidadeServico[] | null>(null);
  useEffect(() => {
    apiGet<CapacidadeServico[]>(`/prioridades/capacidade?data=${opcoes.data}&hora=${encodeURIComponent(opcoes.horaInicio)}`)
      .then(setLinhas)
      .catch(() => undefined);
  }, [opcoes.data, opcoes.horaInicio, versao]);
  if (!linhas) return null;
  const total = linhas.reduce((s, l) => s + l.em_risco, 0);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900">
        <AlarmClock className="h-4 w-4" /> Onde falta capacidade — próximas 2 semanas ({total} pedidos fora do prazo)
      </h3>
      <p className="mb-3 text-[11px] text-amber-900">
        Por serviço: o que a administrativa já resolve com as vagas que tem, o que só uma sessão extra resolve (a {dataHoraCurta(`${opcoes.data}T${opcoes.horaInicio}`)}),
        e o que está parado à espera de exames de outro serviço — aí, pagar horas extra no próprio serviço não adianta.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead>
            <tr className="border-b border-amber-200 text-[10px] uppercase text-slate-500">
              <th className="py-1 pr-2">Serviço</th>
              <th className="py-1 pr-2 text-center">Em risco</th>
              <th className="py-1 pr-2 text-center">O serviço resolve</th>
              <th className="py-1 pr-2 text-center">Sessão extra resolve</th>
              <th className="py-1 pr-2">Parados por outro motivo</th>
              <th className="py-1">Recomendação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.especialidade} className="border-b border-amber-100 align-top">
                <td className="py-2 pr-2 font-semibold text-slate-800">
                  {l.especialidade_legivel}
                  {l.trava_outros_servicos > 0 && (
                    <div className="mt-0.5 text-[10px] font-bold text-rose-700">estrangulamento: {l.trava_outros_servicos} pedido(s) de outros serviços esperam aqui</div>
                  )}
                </td>
                <td className="py-2 pr-2 text-center font-bold text-slate-800">{l.em_risco}</td>
                <td className="py-2 pr-2 text-center text-emerald-800">{l.resolve_o_servico || "—"}</td>
                <td className="py-2 pr-2 text-center font-bold text-sky-800">{l.sessao_extra_ajuda || "—"}</td>
                <td className="py-2 pr-2 text-slate-600">
                  {l.a_espera_de_outro_servico.map((m) => (
                    <div key={m.servico}>
                      {m.n} à espera de <strong>{m.servico}</strong>
                    </div>
                  ))}
                  {l.outros.map((o) => (
                    <div key={o.motivo}>
                      {o.n} — {o.motivo}
                    </div>
                  ))}
                  {!l.a_espera_de_outro_servico.length && !l.outros.length && "—"}
                </td>
                <td className="py-2 text-slate-700">
                  <p>{l.recomendacao}</p>
                  {l.sessao_extra_ajuda > 0 && (
                    <button
                      type="button"
                      onClick={() => aoPreparar(l.especialidade, l.sessao_extra_ajuda)}
                      className="mt-1 inline-flex items-center gap-1 rounded-lg bg-sky-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-sky-800"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" /> Preparar sessão extra ({l.sessao_extra_ajuda} vagas)
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
