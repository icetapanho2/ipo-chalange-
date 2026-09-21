import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api";
import { usePerfil } from "../lib/PerfilContext";
import { DoenteModal } from "../components/DoenteModal";
import {
  Stethoscope,
  FileCheck2,
  Filter,
  Building2,
  Sparkles,
  ArrowRight,
  Activity,
  User,
  ChevronRight,
  UserCheck,
} from "lucide-react";

interface Estado {
  demoDate: string;
  contagens: Record<string, number>;
}

interface DoenteSumario {
  doente_id: string;
  n_utente: string;
  nome: string;
  demo_cenario: string;
  diagnostico_principal?: string;
  total_pedidos?: number;
  total_alertas?: number;
}

export function Inicio() {
  const { definirUtilizadorId } = usePerfil();
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [doentes, setDoentes] = useState<DoenteSumario[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [modalDoenteId, setModalDoenteId] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Estado>("/estado")
      .then(setEstado)
      .catch((e) => setErro(String(e)));

    apiGet<DoenteSumario[]>("/doente")
      .then(setDoentes)
      .catch((e) => console.error("Erro ao carregar doentes no início:", e));
  }, []);

  function iniciarComo(utilizadorId: string, rota: string) {
    definirUtilizadorId(utilizadorId);
    navigate(rota);
  }

  const metricasOperacionais = [
    { chave: "pedidos_total", rotulo: "Total Registados", cor: "text-slate-900", bg: "bg-slate-50" },
    { chave: "pedidos_em_triagem", rotulo: "Em Triagem", cor: "text-sky-700", bg: "bg-sky-50" },
    { chave: "pedidos_aceites", rotulo: "Aceites (A Agendar)", cor: "text-indigo-700", bg: "bg-indigo-50" },
    { chave: "pedidos_marcados", rotulo: "Agendados", cor: "text-emerald-700", bg: "bg-emerald-50" },
    { chave: "pedidos_sem_vaga", rotulo: "Sem Vaga / Encaixe", cor: "text-amber-700", bg: "bg-amber-50" },
    { chave: "pedidos_devolvidos", rotulo: "Devolvidos ao Médico", cor: "text-rose-700", bg: "bg-rose-50" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Cabeçalho Institucional */}
      <div className="border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Hospital Central de Lisboa · Unidade Local de Saúde
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
              Painel Operacional · Circuito Oasis 2.0
            </h1>
            <p className="mt-1 text-xs text-slate-600 max-w-3xl leading-relaxed">
              Orquestração de pedidos pós-consulta: tradução estruturada de notas clínicas SOAP, resolução inteligente de dependências de exames (regras R1/R3) e triagem especializada entre serviços hospitalares.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-right shadow-2xs">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Data do Sistema
              </span>
              <span className="font-mono text-sm font-bold text-slate-800">
                {estado?.demoDate ?? "2026-09-24"}
              </span>
            </div>

            <Link
              to="/guiao"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs"
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-600" />
              <span>Testar Tradutor & Guião</span>
            </Link>
          </div>
        </div>
      </div>

      {erro && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800">
          <strong>Aviso do Sistema:</strong> {erro}
        </div>
      )}

      {/* Faixa de Indicadores Operacionais */}
      {estado && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Estado Geral dos Pedidos em Circulação
            </span>
            <span className="text-[11px] text-slate-400">Atualização em tempo real</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {metricasOperacionais.map((m) => {
              const valor = estado.contagens[m.chave] ?? 0;
              return (
                <div
                  key={m.chave}
                  className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs hover:border-slate-300 transition-colors"
                >
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    {m.rotulo}
                  </span>
                  <span className={`mt-1 block text-2xl font-bold tracking-tight ${m.cor}`}>
                    {valor}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid Principal em Duas Colunas */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* COLUNA ESQUERDA: As 4 Estações do Circuito Clínico */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Estações do Fluxo Clínico Integrado
            </h2>
            <span className="text-xs text-slate-500">Selecione uma estação para operar</span>
          </div>

          {/* 1. Gabinete Médico */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs hover:border-slate-300 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-800">
                    Estação 1 · Médico Assistente
                  </span>
                  <span className="text-xs text-slate-400">Perfil: Dr. Pedro Almeida (U01)</span>
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Consulta & Registo Clínico Oasis
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed pt-1">
                  Mimetiza a folha de inserção hospitalar com campos SOAP (Subjectivo, Objectivo, Avaliação, Plano). Inclui o <strong>Construtor Interativo</strong> e o <strong>Agente de Tradução</strong> que converte texto médico em pedidos estruturados.
                </p>
              </div>

              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => iniciarComo("U01", "/oasis/medico")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shadow-2xs"
                >
                  <Stethoscope className="h-3.5 w-3.5" />
                  <span>Abrir Agenda</span>
                  <ChevronRight className="h-3 w-3 text-slate-400" />
                </button>
              </div>
            </div>
          </div>

          {/* 2. Validação Administrativa */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs hover:border-slate-300 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                    Estação 2 · Secretariado Clínico
                  </span>
                  <span className="text-xs text-slate-400">Perfil: Maria João (U03)</span>
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Validação e Encaminhamento de Pedidos
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed pt-1">
                  A administrative visualiza lado a lado o plano original escrito pelo médico e os pedidos estruturados pelo agente. Validação rápida de códigos de catálogo e resolução de termos clínicos desconhecidos (ex: "HPC").
                </p>
              </div>

              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => iniciarComo("U03", "/validacao")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors shadow-2xs"
                >
                  <FileCheck2 className="h-3.5 w-3.5" />
                  <span>Fila de Validação</span>
                  <ChevronRight className="h-3 w-3 text-emerald-200" />
                </button>
              </div>
            </div>
          </div>

          {/* 3. Triagem Inter-Serviços */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs hover:border-slate-300 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-800">
                    Estação 3 · Triador Clínico
                  </span>
                  <span className="text-xs text-slate-400">Perfil: Dr. Rui Santos / Dra. Ana Silva</span>
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Triagem e Aceitação de Interconsultas
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed pt-1">
                  Avaliação especializada de pedidos oriundos de outros departamentos. Permite fixar prioridade clínica (Muito Prioritário, Prioritário, Normal), solicitar exames em falta, aceitar ou reencaminhar para outra especialidade.
                </p>
              </div>

              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => iniciarComo("U04", "/triagem")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-purple-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-purple-800 transition-colors shadow-2xs"
                >
                  <Filter className="h-3.5 w-3.5" />
                  <span>Mesa de Triagem</span>
                  <ChevronRight className="h-3 w-3 text-purple-200" />
                </button>
              </div>
            </div>
          </div>

          {/* 4. Serviço & Vagas */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs hover:border-slate-300 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    Estação 4 · Gestor de Vagas & Serviço
                  </span>
                  <span className="text-xs text-slate-400">Perfil: Manuel Castro / Radiologia</span>
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Gestão do Serviço & Resolução de Encaixes
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed pt-1">
                  Monitorização da capacidade dos equipamentos e gabinetes. Aprovação de trocas inteligentes de vaga (sem ultrapassar prazos clínicos) e marcação de doentes sem vaga regular.
                </p>
              </div>

              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => iniciarComo("U07", "/servico")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-800 transition-colors shadow-2xs"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Painel do Serviço</span>
                  <ChevronRight className="h-3 w-3 text-amber-200" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: Utentes Ativos & Prontidão */}
        <div className="space-y-6">
          {/* Caixa de Utentes da Simulação */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-500" />
                  <span>Utentes do Circuito Oasis</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Clique para inspecionar prontuário, pedidos e semáforo
                </p>
              </div>

              <Link
                to="/guiao"
                className="text-[11px] font-semibold text-sky-700 hover:underline flex items-center gap-1"
              >
                <UserCheck className="h-3 w-3" />
                <span>Gerir Perfis</span>
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {doentes.slice(0, 6).map((d) => (
                <div
                  key={d.doente_id}
                  onClick={() => setModalDoenteId(d.doente_id)}
                  className="group flex cursor-pointer items-center justify-between py-2.5 px-1 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <div>
                    <div className="font-bold text-xs text-slate-900 group-hover:text-sky-700 flex items-center gap-1.5">
                      <span>{d.nome}</span>
                      <span className="font-mono text-[10px] font-normal text-slate-400">
                        ({d.n_utente})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 line-clamp-1">
                      {d.diagnostico_principal || d.demo_cenario}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700">
                      <Activity className="h-3 w-3" />
                      <span>Ver Prontidão</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 mt-2 border-t border-slate-100 text-center">
              <Link
                to="/guiao"
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
              >
                <span>Criar ou completar perfil de paciente no Guião</span>
                <ArrowRight className="h-3 w-3 text-slate-400" />
              </Link>
            </div>
          </div>

          {/* Destaque do Motor de Regras Clínicas */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-2">
            <span className="font-bold text-slate-900 block">
              Regras Clínicas Ativas no Sistema:
            </span>
            <ul className="space-y-1.5 text-[11px] text-slate-600">
              <li className="flex items-start gap-1.5">
                <span className="font-mono font-bold text-slate-800">R1:</span>
                <span>Análises pré-exame (creatinina) devem anteceder TC com contraste em pelo menos 48h.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-mono font-bold text-slate-800">R2:</span>
                <span>Sessões de Hospital de Dia agendam automaticamente colheita prévia de vigilância.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="font-mono font-bold text-slate-800">R3:</span>
                <span>Consultas de revisão médica exigem a realização prévia de todos os exames prescritos.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modal Universal do Doente */}
      {modalDoenteId && (
        <DoenteModal
          doenteId={modalDoenteId}
          onFechar={() => setModalDoenteId(null)}
        />
      )}
    </div>
  );
}
