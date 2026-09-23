import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, Gauge } from "lucide-react";
import { PainelImpacto } from "../components/PainelImpacto";
import { OPCOES_SESSAO_INICIAIS, OndePorCapacidade, PedidosVagaExtra, PrazosEmRisco, SessaoExtra, type OpcoesSessao } from "../components/CapacidadeGestao";
import { apiGet, useVersaoDados } from "../lib/api";
import { EstatisticasServico } from "../components/servico/EstatisticasServico";

interface GrupoPrazo {
  chave: string;
  legivel: string;
  total: number;
  dentroPrazo: number;
  percent: number;
}

interface GrupoPendentes {
  chave: string;
  legivel: string;
  total: number;
  antiguidadeMediaDias: number;
}

interface Metricas {
  tempos: { consultaParaPedidoMin: number | null; pedidoParaMarcacaoMin: number | null };
  prazoPorNivel: GrupoPrazo[];
  prazoPorTipo: GrupoPrazo[];
  prazoPorServico: GrupoPrazo[];
  pendentesPorServico: GrupoPendentes[];
  remarcacoesPorMotivo: { motivo: string; total: number }[];
  impactoEstimado: { cromosMes: number; folhasMes: number; horasAdminDia: number };
}

function CartaoEstatistica({ titulo, valor, sufixo }: { titulo: string; valor: string | number; sufixo?: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className="text-2xl font-semibold text-slate-800">
        {valor}
        {sufixo && <span className="ml-1 text-sm font-normal text-slate-400">{sufixo}</span>}
      </p>
    </div>
  );
}

export function Gestao() {
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sessao, setSessao] = useState<OpcoesSessao>(OPCOES_SESSAO_INICIAIS);
  const [versao, setVersao] = useState(0);
  const versaoDados = useVersaoDados();

  function preparar(especialidade: string, nVagas: number) {
    setSessao({ ...sessao, especialidade, nVagas });
    document.getElementById("sessao-extra")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  useEffect(() => {
    // Vindo da notificação "vaga extra pedida": ir directo aos pedidos por decidir.
    if (window.location.search.includes("vagas-extra")) setTimeout(() => document.getElementById("vagas-extra")?.scrollIntoView({ block: "center" }), 600);
  }, []);

  useEffect(() => {
    apiGet<Metricas>("/gestao/metricas").then(setMetricas).catch((e) => setErro(String(e)));
  }, [versaoDados]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Gestão</h1>
          <span className="mt-1 inline-block rounded bg-slate-700 px-2 py-0.5 text-xs font-medium text-white">Dados simulados</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/gestao/prioridade"
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
          >
            <Gauge className="h-3.5 w-3.5 text-oasis-accent" />
            <span>Definições da Prioridade</span>
          </Link>
          <Link
            to="/gestao/laboratorio"
            className="inline-flex items-center gap-1.5 rounded border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 shadow-2xs"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            <span>Laboratório de prioridades</span>
          </Link>
        </div>
      </div>
      {erro && <p className="mt-3 text-red-600">{erro}</p>}

      <p className="mt-2 max-w-3xl text-xs text-slate-500">
        O dia-a-dia de cada serviço (remarcações, vagas, chamadas) é da administrativa. Aqui fica só o que é do gestor: onde pôr capacidade, as
        regras de prioridade do hospital e o impacto.
      </p>

      <section className="mt-4 space-y-3" data-tour="capacidade">
        <h2 className="text-sm font-semibold text-slate-600">1 · Decidir capacidade</h2>
        <PedidosVagaExtra versao={versao + versaoDados} aoDecidir={() => setVersao((v) => v + 1)} />
        <OndePorCapacidade opcoes={sessao} versao={versao + versaoDados} aoPreparar={preparar} />
        <SessaoExtra opcoes={sessao} setOpcoes={setSessao} aoAbrir={() => setVersao((v) => v + 1)} />
        <PrazosEmRisco />
      </section>

      <section className="mt-6" data-tour="impacto">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">2 · Impacto das regras de prioridade e agendamento</h2>
        <PainelImpacto />
      </section>

      <section className="mt-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-600">3 · Comparar serviços</h2>
        <p className="mb-2 text-xs text-slate-500">
          Os mesmos números e filtros que cada administrativa vê no seu serviço, aqui para todos os serviços lado a lado.
        </p>
        {metricas && (
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CartaoEstatistica titulo="Consulta → pedido no serviço" valor={metricas.tempos.consultaParaPedidoMin ?? "—"} sufixo="min" />
            <CartaoEstatistica titulo="Pedido → marcação" valor={metricas.tempos.pedidoParaMarcacaoMin ?? "—"} sufixo="min" />
            <CartaoEstatistica titulo="Cromos eliminados / mês" valor={metricas.impactoEstimado.cromosMes.toLocaleString("pt-PT")} />
            <CartaoEstatistica titulo="Horas administrativas / dia" valor={metricas.impactoEstimado.horasAdminDia} sufixo="h" />
          </div>
        )}
        <EstatisticasServico gestao />
      </section>
    </div>
  );
}
