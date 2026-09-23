import { useEffect, useState } from "react";
import { apiGet, useVersaoDados } from "../lib/api";
import { ArrowRight, ShieldCheck, TrendingUp } from "lucide-react";

interface Impacto {
  linhaDeBase: {
    periodo_dias: number;
    remarcacoes_hospital: number;
    doentes_remarcados_2_ou_mais: number;
    marcacoes: number;
    faltas: number;
    taxa_faltas: number;
    faltas_tac: number;
  };
  sessao: {
    propostas_troca: number;
    trocas_aprovadas: number;
    trocas_diferentes_da_regra_antiga: number;
    doentes_vulneraveis_protegidos: number;
    doentes_remarcados_2_vezes: number;
    segundas_remarcacoes_inevitaveis: number;
    remarcacoes_avaria_propostas: number;
    remarcacoes_avaria_validadas: number;
    remarcacoes_avaria_fora_prazo: number;
    sugestoes_falta: number;
    sugestoes_falta_aceites: number;
    vagas_libertadas: number;
    vagas_reaproveitadas: number;
    ofertas_pendentes: number;
    dias_ganhos: number;
    doentes_que_passaram_a_dentro_do_prazo: number;
    deslocacoes_evitadas: number;
    km_poupados: number;
    comunicacoes_enviadas: number;
    lembretes_agendados: number;
    chamadas_no_horizonte: number;
    marcacoes_no_horizonte: number;
    chamadas_registadas: number;
    vagas_extra_pedidas: number;
    vagas_extra_aprovadas: number;
  };
  projecaoMensal: {
    faltas_mes: number;
    faltas_tac_mes: number;
    faltas_tac_evitadas_mes: number;
    valor_recuperado_mes_eur: number;
    faltas_evitadas_mes: number;
    percentagem_marcacoes_a_ligar: number;
    custo_medio_vaga_tac: number;
    reducao_faltas_percent: number;
    pressupostos: string[];
  };
  esperaPorEstadio: { estadio: string; legivel: string; pedidos: number; mediana_dias: number; percent_dentro_prazo: number }[];
}

/** Um contador da demonstração: a cinzento enquanto o caso do guião que o activa ainda não foi feito. */
function Contador({ valor, activo, rotulo, caso }: { valor: string | number; activo: boolean; rotulo: string; caso: string }) {
  return (
    <div className={`rounded-lg border p-3 ${activo ? "border-emerald-200 bg-white" : "border-dashed border-slate-200 bg-slate-50"}`}>
      <div className={`text-2xl font-bold ${activo ? "text-emerald-700" : "text-slate-300"}`}>{valor}</div>
      <div className={`text-[11px] leading-snug ${activo ? "text-slate-600" : "text-slate-400"}`}>{rotulo}</div>
      {!activo && <div className="mt-1 text-[10px] font-semibold text-slate-400">ainda não aconteceu — {caso}</div>}
    </div>
  );
}

function LinhaComparacao({ o, antes, depois, ganho, como }: { o: string; antes: string; depois: string; ganho: string; como: string }) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-2 pr-2 font-semibold text-slate-800">{o}</td>
      <td className="py-2 pr-2 text-slate-600">{antes}</td>
      <td className="py-2 pr-2">
        <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
          <ArrowRight className="h-3 w-3" /> {depois}
        </span>
      </td>
      <td className="py-2 pr-2 font-bold text-indigo-800">{ganho}</td>
      <td className="py-2 text-[11px] text-slate-500">{como}</td>
    </tr>
  );
}

/**
 * Impacto para quem gere, em duas partes que não se misturam:
 *  1. Por mês, antes → com as regras: as mesmas medidas lado a lado (histórico real de 60 dias;
 *     o "com as regras" é estimativa, com o cálculo à vista).
 *  2. Nesta demonstração: o que as regras já fizeram ao vivo — cada contador diz que caso do guião o
 *     activa, e fica a cinzento até lá.
 */
export function PainelImpacto({ recarregarCada }: { recarregarCada?: number }) {
  const [dados, setDados] = useState<Impacto | null>(null);
  const versaoDados = useVersaoDados();

  useEffect(() => {
    const carregar = () => apiGet<Impacto>("/prioridades/impacto").then(setDados).catch(() => undefined);
    carregar();
    if (!recarregarCada) return;
    const t = setInterval(carregar, recarregarCada);
    return () => clearInterval(t);
  }, [recarregarCada, versaoDados]);

  if (!dados) return null;
  const { linhaDeBase: b, sessao: s, projecaoMensal: p } = dados;
  const euros = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const marcacoesMes = Math.round(b.marcacoes / 2);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
        <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-900">
          <TrendingUp className="h-4 w-4" /> Por mês: antes → com as regras
        </h3>
        <p className="mb-2 text-[11px] text-indigo-900">
          "Antes" é o histórico real dos últimos {b.periodo_dias} dias, a dividir por 2. "Com as regras" é uma estimativa: o cálculo está na última coluna e os
          dois pressupostos estão em parametros.csv, para validar com o hospital.
        </p>
        <div className="overflow-x-auto rounded-lg border border-indigo-100 bg-white px-3">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-400">
                <th className="py-1.5">O quê</th>
                <th>Antes</th>
                <th>Com as regras</th>
                <th>Ganho por mês</th>
                <th>Como se calcula</th>
              </tr>
            </thead>
            <tbody>
              <LinhaComparacao
                o="Faltas no TAC (o recurso mais escasso)"
                antes={`${p.faltas_tac_mes} vagas perdidas`}
                depois={`${p.faltas_tac_mes - p.faltas_tac_evitadas_mes}`}
                ganho={`${p.faltas_tac_evitadas_mes} vagas = ${euros.format(p.valor_recuperado_mes_eur)}`}
                como={`${b.faltas_tac} faltas em ${b.periodo_dias} dias ÷ 2 = ${p.faltas_tac_mes}/mês; lembrete a D-3 + chamada a quem precisa evitam ${p.reducao_faltas_percent}% → ${p.faltas_tac_evitadas_mes}; × ${p.custo_medio_vaga_tac} € por vaga de TAC = ${euros.format(p.valor_recuperado_mes_eur)}.`}
              />
              <LinhaComparacao
                o="Faltas em todos os serviços"
                antes={`${p.faltas_mes} (${b.taxa_faltas}% das marcações)`}
                depois={`${p.faltas_mes - p.faltas_evitadas_mes}`}
                ganho={`${p.faltas_evitadas_mes} vagas`}
                como={`${b.faltas} faltas em ${b.periodo_dias} dias ÷ 2; mesma redução de ${p.reducao_faltas_percent}%.`}
              />
              <LinhaComparacao
                o="Chamadas telefónicas das administrativas"
                antes={`todas as marcações (~${marcacoesMes})`}
                depois={`${p.percentagem_marcacoes_a_ligar}% (~${Math.round((marcacoesMes * p.percentagem_marcacoes_a_ligar) / 100)})`}
                ganho={`~${marcacoesMes - Math.round((marcacoesMes * p.percentagem_marcacoes_a_ligar) / 100)} chamadas`}
                como="Só se liga a quem, sem chamada, provavelmente falharia (sem contacto digital, idade, preparação, longe); os outros ficam com SMS + lembrete. Percentagem medida nas marcações das próximas semanas."
              />
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
        <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-900">
          <ShieldCheck className="h-4 w-4" /> Nesta demonstração — o que as regras já fizeram
        </h3>
        <p className="mb-2 text-[11px] text-emerald-900">
          Contam ao vivo à medida que se faz o guião (antes das regras, nenhuma destas coisas era medida nem garantida). A cinzento, o que ainda não aconteceu.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Contador
            activo={s.trocas_aprovadas > 0}
            valor={s.doentes_vulneraveis_protegidos}
            rotulo={`doentes vulneráveis protegidos numa troca de vaga (idosos, longe, já remarcados, em tratamento); ${s.doentes_remarcados_2_vezes} remarcados uma 2.ª vez`}
            caso="Caso 2"
          />
          <Contador
            activo={s.vagas_libertadas > 0}
            valor={`${s.vagas_reaproveitadas}/${s.vagas_libertadas}`}
            rotulo={`vagas libertadas reaproveitadas — ${s.dias_ganhos} dias ganhos por quem espera um diagnóstico`}
            caso="Caso 3"
          />
          <Contador
            activo={s.deslocacoes_evitadas > 0}
            valor={s.deslocacoes_evitadas}
            rotulo={`deslocações evitadas pelo dia único (${s.km_poupados} km poupados ao doente)`}
            caso="Caso 4"
          />
          <Contador
            activo={s.remarcacoes_avaria_validadas > 0}
            valor={`${s.remarcacoes_avaria_validadas}/${s.remarcacoes_avaria_propostas}`}
            rotulo={`remarcações por avaria propostas com justificação e validadas${s.remarcacoes_avaria_fora_prazo ? ` (${s.remarcacoes_avaria_fora_prazo} fora do prazo, sinalizada)` : ""}`}
            caso="Caso 5"
          />
          <Contador
            activo={s.sugestoes_falta_aceites > 0}
            valor={`${s.sugestoes_falta_aceites}/${s.sugestoes_falta}`}
            rotulo="faltas com a remarcação já sugerida e aceite antes da consulta"
            caso="Caso 6"
          />
          <Contador
            activo={s.vagas_extra_pedidas > 0}
            valor={`${s.vagas_extra_aprovadas}/${s.vagas_extra_pedidas}`}
            rotulo="vagas extra pedidas pelos serviços e decididas pela gestão"
            caso="Gestão"
          />
        </div>
      </div>

      {dados.esperaPorEstadio.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-1 text-[10px] font-bold uppercase text-slate-500">Espera por estádio do percurso (pedido → marcação, histórico)</div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] text-slate-400">
                <th>Estádio</th>
                <th>Pedidos</th>
                <th>Mediana de espera</th>
                <th>Dentro do prazo</th>
              </tr>
            </thead>
            <tbody>
              {dados.esperaPorEstadio.map((e) => (
                <tr key={e.estadio} className="border-t border-slate-100">
                  <td className="py-0.5 font-semibold text-slate-700">{e.legivel}</td>
                  <td>{e.pedidos}</td>
                  <td>{e.mediana_dias} dias</td>
                  <td className={e.percent_dentro_prazo < 90 ? "font-bold text-rose-700" : "text-emerald-700"}>{e.percent_dentro_prazo}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
