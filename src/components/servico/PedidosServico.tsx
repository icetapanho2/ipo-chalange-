import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { dataHoraPT, dataPT } from "../../lib/datas";
import { DoenteModal } from "../DoenteModal";
import { AlertTriangle, Bell, Check, Search, Users } from "lucide-react";

interface ResumoPedido {
  pedido_id: string;
  doente_id: string;
  doente_nome: string;
  medico_requisitante_nome: string;
  tipo_pedido_legivel: string;
  descricao: string;
  prioridade_legivel: string;
  prazo_limite: string;
  estado: string;
  n_remarcacoes: number;
  data_marcada: string;
  criado_em: string;
}

interface Aviso {
  alerta_id: string;
  tipo: string;
  descricao: string;
  doente_id: string;
  doente_nome: string;
  pedido_descricao: string;
  data_marcada: string;
  tratado: string;
}

interface SinalCapacidade {
  prioridade_legivel: string;
  ato_legivel: string;
  prazo_limite: string;
  n_pedidos: number;
  vagas_livres_estimadas: number;
  deficit: number;
}

const ESTADOS = [
  { chave: "MARCADO", titulo: "Marcados" },
  { chave: "EM_TRIAGEM", titulo: "Em triagem" },
  { chave: "ACEITE", titulo: "Por marcar" },
  { chave: "SEM_VAGA", titulo: "Sem vaga" },
  { chave: "FALTOU", titulo: "Faltas" },
  { chave: "DEVOLVIDO", titulo: "Devolvidos" },
  { chave: "REALIZADO", titulo: "Realizados" },
];

/** Os tipos de aviso que ficam aqui (os que pedem decisão estão em "Para decidir"), e o que fazer com cada um. */
const AVISOS: Record<string, { titulo: string; oQueFazer: (a: Aviso) => string }> = {
  SEMAFORO_VERMELHO: {
    titulo: "Marcação em risco por dependência",
    oQueFazer: (a) => a.tratado || "Falta um exame de que esta marcação depende. Abrir a ficha do doente para ver qual e remarcá-lo a tempo.",
  },
  FALTA_DEPENDENCIA: {
    titulo: "Faltou a um exame de que outro depende",
    oQueFazer: (a) => a.tratado || "Remarcar o exame em falta antes da marcação que depende dele.",
  },
  PRAZO_ULTRAPASSADO: {
    titulo: "Prazo ultrapassado",
    oQueFazer: (a) =>
      a.data_marcada
        ? `Já tem data (${dataHoraPT(a.data_marcada)}). Se vagar uma mais cedo, o sistema oferece-lha automaticamente.`
        : "Ainda sem data: ver em Para decidir → Sem vaga no prazo.",
  },
  SEGUNDA_REMARCACAO: { titulo: "2.ª remarcação pelo hospital", oQueFazer: () => "Ligar ao doente a explicar — já está na lista de chamadas." },
  REMARCACOES_EXCESSIVAS: { titulo: "Doente remarcado várias vezes", oQueFazer: () => "Evitar voltar a mexer nesta marcação; qualquer mudança deve ser falada por telefone." },
  TRIAGEM_PARADA: { titulo: "Parado na triagem", oQueFazer: () => "Lembrar o triador do serviço." },
};

/** Carteira do serviço (todos os pedidos, por estado, com pesquisa), avisos a acompanhar e sinais de falta de capacidade. */
export function PedidosServico({ aoMudar }: { aoMudar: (mensagem: string) => void }) {
  const [porEstado, setPorEstado] = useState<Record<string, ResumoPedido[]> | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [capacidade, setCapacidade] = useState<SinalCapacidade[]>([]);
  const [estado, setEstado] = useState("MARCADO");
  const [pesquisa, setPesquisa] = useState("");
  const [doenteId, setDoenteId] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [ordem, setOrdem] = useState<"recentes" | "data">("recentes");
  const [hoje, setHoje] = useState("");

  useEffect(() => {
    apiGet<{ porEstado: Record<string, ResumoPedido[]> }>("/servico/pedidos").then((r) => setPorEstado(r.porEstado));
    apiGet<Aviso[]>("/servico/alertas").then((l) => setAvisos(l.filter((a) => AVISOS[a.tipo])));
    apiGet<SinalCapacidade[]>("/servico/overbooking").then(setCapacidade);
    apiGet<{ demoDate: string }>("/estado").then((e) => setHoje(e.demoDate)).catch(() => undefined);
  }, [versao]);

  async function visto(id: string) {
    await apiPost(`/servico/alertas/${id}/fechar`, { accao: "Visto pela administrativa" });
    setVersao((v) => v + 1);
    aoMudar("Aviso marcado como visto.");
  }

  if (!porEstado) return <p className="mt-5 text-sm text-slate-500">A carregar…</p>;
  const termo = pesquisa.trim().toLowerCase();
  const lista = (termo ? Object.values(porEstado).flat() : porEstado[estado] ?? []).filter(
    (p) => !termo || p.doente_nome.toLowerCase().includes(termo) || p.descricao.toLowerCase().includes(termo),
  ).sort((a, b) =>
    ordem === "recentes"
      ? b.criado_em.localeCompare(a.criado_em)
      : (a.data_marcada || a.prazo_limite).localeCompare(b.data_marcada || b.prazo_limite),
  );
  const tiposAviso = [...new Set(avisos.map((a) => a.tipo))];

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      {/* Carteira */}
      <section className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold text-slate-800">Pedidos do serviço</h2>
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as "recentes" | "data")} className="ml-auto rounded-lg border border-slate-300 px-2 py-1 text-xs">
            <option value="recentes">Mais recentes primeiro</option>
            <option value="data">Por data marcada</option>
          </select>
          <label className="relative">
            <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-400" />
            <input
              value={pesquisa}
              onChange={(e) => setPesquisa(e.target.value)}
              placeholder="Procurar doente ou exame"
              className="w-56 rounded-lg border border-slate-300 py-1 pl-7 pr-2 text-xs"
            />
          </label>
        </div>
        {!termo && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {ESTADOS.map((e) => (
              <button
                key={e.chave}
                type="button"
                onClick={() => setEstado(e.chave)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  estado === e.chave ? "bg-oasis-header text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {e.titulo} <span className="opacity-70">{porEstado[e.chave]?.length ?? 0}</span>
              </button>
            ))}
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {lista.length === 0 ? (
            <p className="p-4 text-xs text-slate-400">Nenhum pedido.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lista.slice(0, 60).map((p) => (
                <li key={p.pedido_id}>
                  <button type="button" onClick={() => setDoenteId(p.doente_id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">
                        {p.doente_nome}
                        {hoje && p.criado_em.startsWith(hoje) && (
                          <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">Novo · {p.criado_em.slice(11, 16)}</span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {p.descricao} · pedido por {p.medico_requisitante_nome}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-[11px] text-slate-500">
                      {p.data_marcada && <span className="block font-semibold text-slate-800">{dataHoraPT(p.data_marcada)}</span>}
                      <span className="block">{p.prioridade_legivel}</span>
                      prazo {dataPT(p.prazo_limite)}
                      {p.n_remarcacoes > 0 && <span className="block text-amber-700">{p.n_remarcacoes}× remarcado</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {lista.length > 60 && <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">… e mais {lista.length - 60}. Use a pesquisa.</p>}
        </div>
      </section>

      <div className="space-y-5">
        {/* Avisos */}
        <section>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <Bell className="h-4 w-4 text-slate-500" /> Avisos a acompanhar
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{avisos.length}</span>
          </h2>
          <p className="mb-2 text-xs text-slate-500">Não pedem decisão agora; cada um diz o que fazer. As remarcações e trocas estão em "Para decidir".</p>
          {avisos.length === 0 && <p className="text-xs text-slate-400">Sem avisos.</p>}
          <div className="space-y-3">
            {tiposAviso.map((tipo) => (
              <div key={tipo} className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                  {AVISOS[tipo].titulo} ({avisos.filter((a) => a.tipo === tipo).length})
                </div>
                <ul className="divide-y divide-slate-100">
                  {avisos
                    .filter((a) => a.tipo === tipo)
                    .map((a) => (
                      <li key={a.alerta_id} className="px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <button type="button" onClick={() => a.doente_id && setDoenteId(a.doente_id)} className="text-left text-xs font-semibold text-slate-800 hover:text-oasis-accent">
                            {a.doente_nome}
                            {a.pedido_descricao && <span className="font-normal text-slate-500"> · {a.pedido_descricao}</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => visto(a.alerta_id)}
                            title="Marcar como visto"
                            className="flex shrink-0 items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            <Check className="h-3 w-3" /> Visto
                          </button>
                        </div>
                        <p className={`mt-0.5 text-[11px] ${a.tratado ? "text-emerald-700" : "text-slate-600"}`}>{AVISOS[tipo].oQueFazer(a)}</p>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Capacidade */}
        {capacidade.length > 0 && (
          <section>
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <Users className="h-4 w-4 text-slate-500" /> Vagas que não chegam
            </h2>
            <p className="mb-2 text-xs text-slate-500">Pedidos à espera de marcação com mais procura do que vagas livres até ao prazo — antes de caírem em "sem vaga".</p>
            <ul className="space-y-1.5">
              {capacidade.map((c, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>
                    <strong>{c.ato_legivel}</strong> · {c.prioridade_legivel} · prazo {dataPT(c.prazo_limite)}: {c.n_pedidos} pedidos para {c.vagas_livres_estimadas} vaga(s) —
                    faltam <strong>{c.deficit}</strong>. Considerar vaga extra.
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {doenteId && <DoenteModal doenteId={doenteId} onFechar={() => setDoenteId(null)} />}
    </div>
  );
}
