import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, History, ShieldCheck, XCircle } from "lucide-react";

/** Um candidato avaliado pelas regras de remarcação (server/motor/remarcacao.ts). */
export interface CandidatoTroca {
  ato_id: string;
  doente_id: string;
  doente_nome: string;
  data_hora: string;
  data_destino: string;
  prazo_limite: string;
  estadio_cuidado: string;
  idade: number;
  concelho: string;
  distancia_km: number;
  contacto_digital: string;
  transporte_nao_urgente: boolean;
  dia_agrupado: boolean;
  remarcacoes_hospital: number;
  folga_dias: number;
  excluido: boolean;
  motivo_exclusao: string;
  parcelas: { rotulo: string; pontos: number }[];
  custo: number;
  escolhido: boolean;
  escolhido_regra_antiga: boolean;
}

const ESTADIO: Record<string, string> = {
  NOVO: "Novo",
  PRE_TRATAMENTO: "Pré-tratamento",
  EM_TRATAMENTO: "Em tratamento",
  FOLLOW_UP: "Follow-up",
};

export function dataHoraCurta(iso: string): string {
  if (!iso) return "—";
  const [d, h] = iso.split("T");
  const [, m, dia] = d.split("-");
  return h ? `${dia}/${m} ${h.slice(0, 5)}` : `${dia}/${m}`;
}

/**
 * "Porquê esta escolha?": todos os doentes que o motor avaliou para ceder a vaga, com as exclusões
 * (regras duras) e o custo de remarcar parcela a parcela. Mostra também quem a regra antiga (só
 * folga) teria escolhido — é a diferença que as regras de prioridade fazem.
 */
export function PorqueEstaEscolha({
  candidatos,
  aberto: abertoInicial = false,
  compacto = false,
}: {
  candidatos: CandidatoTroca[];
  aberto?: boolean;
  compacto?: boolean;
}) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [mostrarTodosExcluidos, setMostrarTodosExcluidos] = useState(false);
  if (candidatos.length === 0) return null;
  const escolhido = candidatos.find((c) => c.escolhido);
  const antigo = candidatos.find((c) => c.escolhido_regra_antiga);
  const elegiveis = candidatos.filter((c) => !c.excluido);
  // Exclusões por regra de prioridade primeiro (as que contam a história); congelamento no fim.
  const excluidos = candidatos
    .filter((c) => c.excluido)
    .sort((a, b) => Number(a.motivo_exclusao.startsWith("faltam")) - Number(b.motivo_exclusao.startsWith("faltam")));
  const excluidosVisiveis = mostrarTodosExcluidos ? excluidos : excluidos.slice(0, 4);

  return (
    <div className="mt-2 rounded-lg border border-indigo-200 bg-white">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-bold text-indigo-900 hover:bg-indigo-50"
      >
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-indigo-600" />
          Porquê esta escolha? — {candidatos.length} doentes avaliados
          {escolhido && <span className="font-normal text-slate-600">· escolhido: {escolhido.doente_nome}</span>}
        </span>
        {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {aberto && (
        <div className="border-t border-indigo-100 p-3">
          {antigo && escolhido && antigo.doente_id !== escolhido.doente_id && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <History className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                <strong>Pela regra antiga (só a folga até ao prazo) seria escolhido {antigo.doente_nome}</strong>
                {antigo.parcelas.length > 0 && <> — {antigo.parcelas.filter((p) => p.pontos > 0).map((p) => p.rotulo).join(", ")}</>}
                . As regras de prioridade evitam mexer em quem tem mais a perder com uma remarcação.
              </span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="py-1.5 pr-2">Doente</th>
                  <th className="py-1.5 pr-2">Marcado</th>
                  {!compacto && <th className="py-1.5 pr-2">Perfil</th>}
                  <th className="py-1.5 pr-2">Custo de remarcar</th>
                  <th className="py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {elegiveis.map((c) => (
                  <tr key={c.ato_id} className={`border-b border-slate-100 align-top ${c.escolhido ? "bg-emerald-50" : ""}`}>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-1 font-semibold text-slate-800">
                        {c.escolhido && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                        {c.doente_nome}
                      </div>
                      {c.escolhido && <div className="text-[10px] font-bold uppercase text-emerald-700">Cede a vaga → {dataHoraCurta(c.data_destino)}</div>}
                      {c.escolhido_regra_antiga && !c.escolhido && (
                        <div className="text-[10px] font-bold uppercase text-amber-700">Escolha da regra antiga</div>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-slate-600">
                      {dataHoraCurta(c.data_hora)}
                      <div className="text-[10px] text-slate-400">prazo {dataHoraCurta(c.prazo_limite)}</div>
                    </td>
                    {!compacto && (
                      <td className="py-2 pr-2 text-slate-600">
                        {ESTADIO[c.estadio_cuidado] ?? "—"} · {c.idade} anos
                        <div className="text-[10px] text-slate-400">
                          {c.concelho} ({c.distancia_km} km) · {c.contacto_digital === "NENHUM" ? "sem contacto digital" : c.contacto_digital}
                        </div>
                      </td>
                    )}
                    <td className="py-2 pr-2">
                      <div className="flex flex-wrap gap-1">
                        {c.parcelas.map((p) => (
                          <span
                            key={p.rotulo}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              p.pontos > 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {p.rotulo} {p.pontos > 0 ? `+${p.pontos}` : p.pontos}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={`py-2 text-right font-bold ${c.escolhido ? "text-emerald-700" : "text-slate-700"}`}>{c.custo}</td>
                  </tr>
                ))}
                {excluidosVisiveis.map((c) => (
                  <tr key={c.ato_id} className="border-b border-slate-100 align-top text-slate-400">
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-1 font-semibold">
                        <XCircle className="h-3.5 w-3.5" />
                        {c.doente_nome}
                      </div>
                      {c.escolhido_regra_antiga && <div className="text-[10px] font-bold uppercase text-amber-700">Escolha da regra antiga</div>}
                    </td>
                    <td className="py-2 pr-2">{dataHoraCurta(c.data_hora)}</td>
                    {!compacto && (
                      <td className="py-2 pr-2">
                        {ESTADIO[c.estadio_cuidado] ?? "—"} · {c.idade} anos
                      </td>
                    )}
                    <td className="py-2 pr-2 italic" colSpan={2}>
                      Excluído: {c.motivo_exclusao}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {excluidos.length > 4 && (
            <button
              type="button"
              onClick={() => setMostrarTodosExcluidos((m) => !m)}
              className="mt-2 text-[11px] font-semibold text-indigo-700 hover:underline"
            >
              {mostrarTodosExcluidos ? "Mostrar menos" : `Mostrar mais ${excluidos.length - 4} excluídos`}
            </button>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            Regras duras: não se mexe a 7 dias ou menos, em quem já foi remarcado pelo hospital, nem em quem está em tratamento. Entre os
            restantes, cede a vaga quem tem menor custo de remarcar. Os pesos são definidos pela direcção clínica (parâmetros).
          </p>
        </div>
      )}
    </div>
  );
}
