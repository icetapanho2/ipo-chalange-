import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { History, ShieldCheck, TrendingUp } from "lucide-react";

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
  };
  projecaoMensal: {
    faltas_mes: number;
    faltas_tac_mes: number;
    faltas_tac_evitadas_mes: number;
    valor_recuperado_mes_eur: number;
    faltas_evitadas_mes: number;
    percentagem_marcacoes_a_ligar: number;
    pressupostos: string[];
  };
}

function Numero({ valor, rotulo, destaque = false }: { valor: string | number; rotulo: string; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${destaque ? "border-emerald-200 bg-white" : "border-slate-200 bg-white"}`}>
      <div className={`text-2xl font-bold ${destaque ? "text-emerald-700" : "text-slate-800"}`}>{valor}</div>
      <div className="text-[11px] leading-snug text-slate-500">{rotulo}</div>
    </div>
  );
}

/**
 * Impacto das regras de prioridade em números: a linha de base (60 dias de histórico, antes das
 * regras), o que o sistema fez nesta demo, e uma projecção mensal com os pressupostos à vista.
 */
export function PainelImpacto({ recarregarCada }: { recarregarCada?: number }) {
  const [dados, setDados] = useState<Impacto | null>(null);

  useEffect(() => {
    const carregar = () => apiGet<Impacto>("/prioridades/impacto").then(setDados).catch(() => undefined);
    carregar();
    if (!recarregarCada) return;
    const t = setInterval(carregar, recarregarCada);
    return () => clearInterval(t);
  }, [recarregarCada]);

  if (!dados) return null;
  const { linhaDeBase: b, sessao: s, projecaoMensal: p } = dados;
  const euros = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
          <History className="h-4 w-4" /> Antes das regras — últimos {b.periodo_dias} dias
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Numero valor={b.remarcacoes_hospital} rotulo="remarcações por iniciativa do hospital" />
          <Numero valor={b.faltas} rotulo={`faltas em ${b.marcacoes} marcações (${b.taxa_faltas}%) — vagas perdidas`} />
          <Numero valor={b.faltas_tac} rotulo="faltas no TAC, o recurso mais escasso" />
        </div>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-900">
          <ShieldCheck className="h-4 w-4" /> Com as regras — nesta demonstração
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Numero
            destaque
            valor={s.doentes_remarcados_2_vezes}
            rotulo={`doentes remarcados uma 2.ª vez por troca (a regra impede)${
              s.segundas_remarcacoes_inevitaveis ? ` — ${s.segundas_remarcacoes_inevitaveis} inevitável(eis) por avaria, sinalizada(s) para chamada` : ""
            }`}
          />
          <Numero
            destaque
            valor={s.doentes_vulneraveis_protegidos}
            rotulo={`doentes protegidos numa troca (idosos, longe, já remarcados, em tratamento) — ${s.trocas_diferentes_da_regra_antiga} troca(s) com escolha diferente da regra antiga`}
          />
          <Numero
            destaque
            valor={`${s.vagas_reaproveitadas}/${s.vagas_libertadas}`}
            rotulo={`vagas libertadas reaproveitadas — ${s.dias_ganhos} dias ganhos pelos doentes antecipados${
              s.doentes_que_passaram_a_dentro_do_prazo ? `, ${s.doentes_que_passaram_a_dentro_do_prazo} passaram a estar dentro do prazo` : ""
            }`}
          />
          <Numero destaque valor={s.deslocacoes_evitadas} rotulo={`deslocações evitadas pelo dia único (${s.km_poupados} km poupados ao doente)`} />
          <Numero
            valor={`${s.chamadas_no_horizonte}/${s.marcacoes_no_horizonte}`}
            rotulo="marcações que precisam de chamada (as restantes ficam só com SMS + lembrete)"
          />
          <Numero valor={s.comunicacoes_enviadas} rotulo={`avisos ao doente com preparação (+${s.lembretes_agendados} lembretes a D-3 agendados)`} />
          <Numero valor={s.trocas_aprovadas} rotulo="trocas aprovadas por um humano (nunca automáticas)" />
          <Numero
            destaque
            valor={`${s.remarcacoes_avaria_validadas}/${s.remarcacoes_avaria_propostas}`}
            rotulo={`remarcações por avaria propostas com justificação e validadas pela administrativa${
              s.remarcacoes_avaria_fora_prazo ? ` (${s.remarcacoes_avaria_fora_prazo} fora do prazo, sinalizada)` : ""
            }`}
          />
          <Numero valor={`${s.sugestoes_falta_aceites}/${s.sugestoes_falta}`} rotulo="faltas com remarcação sugerida e aceite" />
          <Numero valor={s.ofertas_pendentes} rotulo="ofertas de antecipação à espera de resposta do doente" />
        </div>
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-900">
          <TrendingUp className="h-4 w-4" /> Projecção por mês (estimativa)
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Numero valor={p.faltas_tac_evitadas_mes} rotulo={`faltas no TAC evitadas por mês (de ${p.faltas_tac_mes})`} />
          <Numero valor={euros.format(p.valor_recuperado_mes_eur)} rotulo="valor de vagas de TAC recuperadas por mês" />
          <Numero valor={p.faltas_evitadas_mes} rotulo={`vagas recuperadas por mês em todos os serviços (de ${p.faltas_mes} faltas)`} />
          <Numero valor={`${p.percentagem_marcacoes_a_ligar}%`} rotulo="das marcações precisam de chamada (em vez de 100%)" />
        </div>
        <ul className="mt-2 list-disc pl-4 text-[10px] text-indigo-800">
          {p.pressupostos.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
