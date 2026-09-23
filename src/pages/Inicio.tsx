import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, useVersaoDados } from "../lib/api";
import { usePerfil } from "../lib/PerfilContext";
import { dataPT } from "../lib/datas";
import { DoenteModal } from "../components/DoenteModal";
import { ArrowRight, BookOpen, CheckCircle2, ChevronRight } from "lucide-react";

interface Estado {
  demoDate: string;
  contagens: Record<string, number>;
}

interface DoenteSumario {
  doente_id: string;
  nome: string;
  demo_cenario: string;
}

/** Uma tarefa concreta do perfil activo: quantas há e onde se resolvem. */
interface Tarefa {
  n: number | null;
  texto: string;
  para: string;
  urgente?: boolean;
}

const len = (l: unknown) => (Array.isArray(l) ? l.length : 0);

/** Lê o que cada perfil tem para fazer hoje, a partir das mesmas APIs que as páginas usam. */
async function tarefasDoPerfil(perfil: string): Promise<Tarefa[]> {
  const obter = <T,>(url: string) => apiGet<T>(url).catch(() => null);
  if (perfil === "MEDICO") {
    const [decisoes, agenda, meus] = await Promise.all([
      obter<unknown[]>("/meus-pedidos/decisoes-remarcacao"),
      obter<{ atos: { estado: string; tem_nota: boolean }[] }>("/oasis/medico/agenda"),
      obter<{ devolvidos: unknown[]; recusados: unknown[]; semVagaDecisao: unknown[] }>("/meus-pedidos"),
    ]);
    return [
      { n: len(decisoes), texto: "exame(s) sem vaga a tempo da consulta — decidir avançar ou adiar", para: "/meus-pedidos", urgente: true },
      { n: len(meus?.semVagaDecisao), texto: "pedido(s) sem vaga no prazo à espera da sua decisão", para: "/meus-pedidos", urgente: true },
      { n: len(meus?.devolvidos), texto: "pedido(s) devolvido(s) pela triagem com pergunta", para: "/meus-pedidos" },
      { n: agenda ? agenda.atos.filter((a) => !a.tem_nota).length : null, texto: "consulta(s) de hoje ainda sem diário", para: "/oasis/medico" },
    ];
  }
  if (perfil === "ADMINISTRATIVO") {
    const [remarcacoes, vagas, chamadas, propostas, pedidos] = await Promise.all([
      obter<{ pendentes: number }>("/servico/remarcacoes"),
      obter<{ pendentes: unknown[] }>("/servico/vagas-libertadas"),
      obter<{ itens: { chamada?: unknown }[] }>("/servico/chamadas"),
      obter<unknown[]>("/servico/propostas"),
      obter<{ porEstado: Record<string, { decisao_pendente?: boolean }[]> }>("/servico/pedidos"),
    ]);
    const semVaga = (pedidos?.porEstado.SEM_VAGA ?? []).filter((p) => !p.decisao_pendente).length;
    return [
      { n: remarcacoes?.pendentes ?? null, texto: "remarcação(ões) propostas (avaria, ausência ou falta) a validar", para: "/servico?aba=decidir", urgente: true },
      { n: len(propostas), texto: "troca(s) de vaga a aprovar", para: "/servico?aba=decidir", urgente: true },
      { n: semVaga, texto: "pedido(s) sem vaga no prazo, com a primeira vaga sugerida", para: "/servico?aba=decidir", urgente: true },
      { n: len(vagas?.pendentes), texto: "vaga(s) libertada(s) com oferta de antecipação", para: "/servico?aba=vagas" },
      { n: chamadas ? chamadas.itens.filter((i) => !i.chamada).length : null, texto: "chamada(s) a fazer (só marcações com risco)", para: "/servico?aba=chamadas" },
    ];
  }
  if (perfil === "TRIADOR") {
    const r = await obter<{ fila: unknown[] }>("/triagem/fila");
    return [{ n: len(r?.fila), texto: "pedido(s) na fila de triagem", para: "/triagem", urgente: true }];
  }
  if (perfil === "TECNICO") {
    const l = await obter<{ estado: string }[]>("/tecnico/avarias");
    return [{ n: l ? l.filter((a) => a.estado === "ABERTA").length : null, texto: "avaria(s) reportada(s) ainda abertas", para: "/tecnico" }];
  }
  if (perfil === "GESTAO") {
    const r = await obter<{ total: number }>("/prioridades/prazos-em-risco");
    return [
      { n: r?.total ?? null, texto: "pedido(s) em risco de falhar o prazo, com solução sugerida", para: "/gestao", urgente: true },
      { n: null, texto: "Laboratório de prioridades: simular quem cede a vaga e porquê", para: "/gestao/laboratorio" },
    ];
  }
  return [];
}

const CIRCUITO = [
  { chave: "pedidos_em_triagem", rotulo: "Em triagem" },
  { chave: "pedidos_aceites", rotulo: "Aceites, por marcar" },
  { chave: "pedidos_marcados", rotulo: "Marcados" },
  { chave: "pedidos_sem_vaga", rotulo: "Sem vaga no prazo", alerta: true },
  { chave: "pedidos_devolvidos", rotulo: "Devolvidos ao médico", alerta: true },
];

export function Inicio() {
  const { utilizador } = usePerfil();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [doentes, setDoentes] = useState<DoenteSumario[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalDoenteId, setModalDoenteId] = useState<string | null>(null);
  const versaoDados = useVersaoDados();

  useEffect(() => {
    apiGet<Estado>("/estado")
      .then(setEstado)
      .catch((e) => setErro(String(e)));
    apiGet<DoenteSumario[]>("/doente")
      .then((l) => setDoentes(l.filter((d) => d.demo_cenario)))
      .catch(() => undefined);
  }, [versaoDados]);

  useEffect(() => {
    if (utilizador) tarefasDoPerfil(utilizador.perfil).then(setTarefas);
  }, [utilizador?.utilizador_id, utilizador?.perfil, versaoDados]);

  const porFazer = (tarefas ?? []).filter((t) => t.n === null || t.n > 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs text-slate-500">
            Hoje, {dataPT(estado?.demoDate)} ·{" "}
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Dados simulados</span>
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {utilizador ? `Olá, ${utilizador.nome}` : "IPO-2030"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            O médico declara os pedidos na consulta; seguem para triagem e marcação automática, com as regras de prioridade à vista.
          </p>
        </div>
        <Link
          to="/guiao"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <BookOpen className="h-3.5 w-3.5" /> Guião da demonstração
        </Link>
      </div>

      {erro && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* O que o perfil activo tem para fazer — cada linha leva ao sítio onde se resolve */}
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">Para fazer agora</h2>
          {!utilizador ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
              Escolha um utilizador no canto superior direito.
            </p>
          ) : !tarefas ? (
            <p className="text-sm text-slate-400">A carregar…</p>
          ) : porFazer.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" /> Nada pendente.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {porFazer.map((t) => (
                <li key={t.texto}>
                  <Link to={t.para} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    {t.n !== null && (
                      <span
                        className={`min-w-[2.25rem] rounded-md px-2 py-1 text-center text-sm font-bold ${
                          t.urgente ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {t.n}
                      </span>
                    )}
                    <span className="flex-1 text-sm text-slate-800">{t.texto}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {estado && (
            <>
              <h2 className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-slate-600">Circuito — todos os serviços</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {CIRCUITO.map((m) => {
                  const v = estado.contagens[m.chave] ?? 0;
                  return (
                    <div key={m.chave} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className={`text-xl font-bold ${m.alerta && v > 0 ? "text-rose-700" : "text-slate-900"}`}>{v}</div>
                      <div className="text-[11px] text-slate-500">{m.rotulo}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* Os doentes que o guião usa, com o que cada um demonstra */}
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">Doentes da demonstração</h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {doentes.map((d) => (
              <li key={d.doente_id}>
                <button
                  type="button"
                  onClick={() => setModalDoenteId(d.doente_id)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-slate-50"
                >
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{d.nome}</span>
                    <span className="block text-xs text-slate-500">{d.demo_cenario.replace(/^[\w]+ - /, "")}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {modalDoenteId && <DoenteModal doenteId={modalDoenteId} onFechar={() => setModalDoenteId(null)} />}
    </div>
  );
}
