import { useEffect, useState } from "react";
import { NomeDoente } from "../NomeDoente";
import { apiGet, apiPost } from "../../lib/api";
import { dataHoraPT, dataPT } from "../../lib/datas";
import { PlanoRemarcacoes } from "../PlanoRemarcacoes";
import { PorqueEstaEscolha, type CandidatoTroca } from "../PorqueEstaEscolha";
import { ArrowLeftRight, Building2, CalendarClock, Check, CheckCircle2, HelpCircle, X } from "lucide-react";

interface PropostaTroca {
  proposta_id: string;
  justificacao: string;
  pedido_urgente_doente: string;
  pedido_urgente_doente_id: string;
  avaliacao: CandidatoTroca[];
}

interface PedidoSemVaga {
  pedido_id: string;
  doente_id: string;
  doente_nome: string;
  medico_requisitante_nome: string;
  descricao: string;
  prioridade_legivel: string;
  prazo_limite: string;
  decisao_pendente?: boolean;
  primeira_vaga: { data_hora: string; dias_fora: number } | null;
  sem_sugestao: string;
}

function Seccao({ id, icone: Icone, titulo, explicacao, n, children }: { id: string; icone: React.ElementType; titulo: string; explicacao: string; n: number; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
        <Icone className="h-4 w-4 text-slate-500" /> {titulo}
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${n > 0 ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-500"}`}>{n}</span>
      </h2>
      <p className="mb-2 text-xs text-slate-500">{explicacao}</p>
      {children}
    </section>
  );
}

function SemVaga({ p, aoMudar, aoErro }: { p: PedidoSemVaga; aoMudar: (m: string) => void; aoErro: (m: string) => void }) {
  const [form, setForm] = useState<"" | "outsourcing" | "medico">("");
  const [texto, setTexto] = useState("");

  async function executar(caminho: string, corpo: unknown, mensagem: string) {
    try {
      await apiPost(caminho, corpo);
      setForm("");
      aoMudar(mensagem);
    } catch (e) {
      aoErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">
          <NomeDoente id={p.doente_id} nome={p.doente_nome} /> <span className="font-normal text-slate-500">· {p.descricao}</span>
        </p>
        <span className="text-[11px] text-slate-500">
          {p.prioridade_legivel} · prazo {dataPT(p.prazo_limite)} · pedido por {p.medico_requisitante_nome}
        </span>
      </div>
      {p.decisao_pendente ? (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
          <HelpCircle className="h-3.5 w-3.5" /> Enviado ao médico — aguarda a decisão dele
        </p>
      ) : (
        <>
          <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
            <strong>Sugestão:</strong>{" "}
            {p.primeira_vaga
              ? `não há vaga até ${dataPT(p.prazo_limite)}. A primeira vaga é ${dataHoraPT(p.primeira_vaga.data_hora)}, ${p.primeira_vaga.dias_fora} dia(s) depois do prazo. Se o atraso não for aceitável, resolver com outsourcing ou pedir ao médico que decida.`
              : `${p.sem_sugestao} Resolver com outsourcing ou pedir ao médico que decida.`}
          </p>
          {form === "" ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.primeira_vaga && (
                <button
                  type="button"
                  onClick={() => executar(`/servico/pedidos/${p.pedido_id}/aceitar-primeira-vaga`, {}, `Marcado a ${dataHoraPT(p.primeira_vaga!.data_hora)}. Doente e médico avisados.`)}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <Check className="h-3.5 w-3.5" /> Aceitar {dataHoraPT(p.primeira_vaga.data_hora)}
                </button>
              )}
              <button type="button" onClick={() => setForm("outsourcing")} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Building2 className="h-3.5 w-3.5" /> Resolvi com outsourcing
              </button>
              <button type="button" onClick={() => setForm("medico")} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <HelpCircle className="h-3.5 w-3.5" /> Enviar ao médico
              </button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                autoFocus
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={form === "outsourcing" ? "Onde e quando (ex.: clínica convencionada, 30/09)" : "Porque não há solução interna nem externa"}
                className="min-w-[16rem] flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() =>
                  form === "outsourcing"
                    ? executar(`/servico/pedidos/${p.pedido_id}/outsourcing`, { nota: texto }, "Resolvido com outsourcing.")
                    : executar(`/servico/pedidos/${p.pedido_id}/pedir-decisao`, { motivo: texto }, "O médico requisitante foi notificado para decidir.")
                }
                className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-bold text-white hover:bg-slate-900"
              >
                Confirmar
              </button>
              <button type="button" onClick={() => setForm("")} className="text-xs text-slate-500 hover:underline">
                Cancelar
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Tudo o que precisa de uma decisão da administrativa, num só sítio. Em todos os casos o sistema já
 * traz a solução e o porquê; nada muda sem a validação dela.
 */
export function ParaDecidir({ aoMudar }: { aoMudar: (mensagem: string) => void }) {
  const [trocas, setTrocas] = useState<PropostaTroca[] | null>(null);
  const [semVaga, setSemVaga] = useState<PedidoSemVaga[] | null>(null);
  const [remarcacoes, setRemarcacoes] = useState(0);
  const [versao, setVersao] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiGet<PropostaTroca[]>("/servico/propostas").then(setTrocas).catch((e) => setErro(String(e)));
    apiGet<{ porEstado: Record<string, PedidoSemVaga[]> }>("/servico/pedidos").then((r) => setSemVaga(r.porEstado.SEM_VAGA ?? []));
    apiGet<{ pendentes: number }>("/servico/remarcacoes").then((r) => setRemarcacoes(r.pendentes));
  }, [versao]);

  function mudou(m: string) {
    setErro(null);
    setVersao((v) => v + 1);
    aoMudar(m);
  }

  async function decidirTroca(id: string, decisao: "aprovar" | "rejeitar") {
    try {
      await apiPost(`/servico/propostas/${id}/${decisao}`);
      mudou(decisao === "aprovar" ? "Troca aprovada: os dois doentes foram avisados da nova data." : "Troca rejeitada: o pedido passou para \"Sem vaga no prazo\", com as opções para o resolver.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  if (!trocas || !semVaga) return <p className="mt-5 text-sm text-slate-500">A carregar…</p>;
  const total = remarcacoes + trocas.length + semVaga.filter((p) => !p.decisao_pendente).length;

  return (
    <div className="mt-5 space-y-6">
      {erro && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      {/* Resumo: um número por tipo de decisão, com atalho */}
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          { id: "remarcacoes", n: remarcacoes, rotulo: "remarcações a validar", sub: "avaria, ausência de médico, falta" },
          { id: "trocas", n: trocas.length, rotulo: "trocas de vaga a aprovar", sub: "doente urgente sem vaga no prazo" },
          { id: "sem-vaga", n: semVaga.filter((p) => !p.decisao_pendente).length, rotulo: "pedidos sem vaga no prazo", sub: "aceitar atraso, outsourcing ou médico" },
        ].map((c) => (
          <a key={c.id} href={`#${c.id}`} className={`rounded-xl border p-3 hover:shadow-sm ${c.n > 0 ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
            <div className={`text-2xl font-bold ${c.n > 0 ? "text-rose-800" : "text-slate-400"}`}>{c.n}</div>
            <div className="text-xs font-semibold text-slate-700">{c.rotulo}</div>
            <div className="text-[11px] text-slate-500">{c.sub}</div>
          </a>
        ))}
      </div>
      {total === 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Nada por decidir neste serviço.
        </p>
      )}

      <Seccao
        id="remarcacoes"
        icone={CalendarClock}
        titulo="Remarcações propostas"
        explicacao="Quando uma marcação tem de mudar (avaria, ausência de médico, falta do doente), o sistema já propõe a nova data, pela ordem do índice de prioridade, com o porquê."
        n={remarcacoes}
      >
        <PlanoRemarcacoes key={versao} aoMudar={mudou} />
      </Seccao>

      <Seccao
        id="trocas"
        icone={ArrowLeftRight}
        titulo="Trocas de vaga"
        explicacao="Um doente urgente não tem vaga no prazo: o sistema propõe que outro, com folga e baixo custo de remarcar, lhe ceda a vaga."
        n={trocas.length}
      >
        {trocas.length === 0 ? (
          <p className="text-xs text-slate-400">Sem trocas por aprovar.</p>
        ) : (
          <div className="space-y-2">
            {trocas.map((p) => (
              <div key={p.proposta_id} className="rounded-lg border border-indigo-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-800">Vaga para <NomeDoente id={p.pedido_urgente_doente_id} nome={p.pedido_urgente_doente} /></p>
                <p className="mt-0.5 text-xs text-slate-600">{p.justificacao}</p>
                <PorqueEstaEscolha candidatos={p.avaliacao} />
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => decidirTroca(p.proposta_id, "aprovar")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
                    <Check className="h-3.5 w-3.5" /> Aprovar troca
                  </button>
                  <button type="button" onClick={() => decidirTroca(p.proposta_id, "rejeitar")} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <X className="h-3.5 w-3.5" /> Rejeitar e procurar outra solução
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Seccao>

      <Seccao
        id="sem-vaga"
        icone={HelpCircle}
        titulo="Sem vaga no prazo"
        explicacao="Não há vaga nem troca possível até ao prazo. O sistema mostra a primeira vaga que existe; a administrativa aceita o atraso, resolve fora, ou passa a decisão ao médico."
        n={semVaga.filter((p) => !p.decisao_pendente).length}
      >
        {semVaga.length === 0 ? (
          <p className="text-xs text-slate-400">Todos os pedidos têm vaga.</p>
        ) : (
          <div className="space-y-2">
            {semVaga.map((p) => (
              <SemVaga key={p.pedido_id} p={p} aoMudar={mudou} aoErro={setErro} />
            ))}
          </div>
        )}
      </Seccao>
    </div>
  );
}
