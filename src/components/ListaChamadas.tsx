import { useEffect, useState } from "react";
import { NomeDoente } from "./NomeDoente";
import { apiGet, apiPost } from "../lib/api";
import { dataHoraCurta } from "./PorqueEstaEscolha";
import { Phone, PhoneOff, Check, CalendarX2 } from "lucide-react";

interface Motivo {
  codigo: string;
  texto: string;
  peso: number;
}

interface ItemChamada {
  ato_id: string;
  doente_id: string;
  doente_nome: string;
  contacto: string;
  data_hora: string;
  ato_descricao: string;
  motivos: Motivo[];
  risco: number;
  chamada?: { resultado: string; registado_em: string };
}

interface RespostaChamadas {
  itens: ItemChamada[];
  marcacoesNoHorizonte: number;
  horizonteDias: number;
  encaixes: { taxa_historica: number; dias: { dia: string; marcacoes: number; faltas_esperadas: number; encaixes_sugeridos: number }[] };
}

const COR_MOTIVO: Record<string, string> = {
  SEM_CONTACTO: "bg-rose-50 text-rose-700",
  PREPARACAO: "bg-violet-50 text-violet-700",
  FALTAS: "bg-amber-50 text-amber-800",
  IDADE: "bg-slate-100 text-slate-700",
  SEGUNDA_REMARCACAO: "bg-red-100 text-red-800",
};

const RESULTADO: Record<string, string> = {
  CONFIRMADO: "Confirmado",
  NAO_ATENDEU: "Não atendeu",
  VAI_DESMARCAR: "Desmarcou — vaga libertada",
};

/**
 * Lista de chamadas (ESPECIFICACAO.md secção 8A, R-G): em vez de ligar a toda a gente, a
 * administrativa liga só às marcações com um motivo concreto de risco.
 */
export function ListaChamadas({ aoMudar }: { aoMudar?: (mensagem: string) => void }) {
  const [dados, setDados] = useState<RespostaChamadas | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function recarregar() {
    apiGet<RespostaChamadas>("/servico/chamadas").then(setDados).catch((e) => setErro(String(e)));
  }
  useEffect(recarregar, []);

  async function registar(atoId: string, resultado: string) {
    setErro(null);
    try {
      await apiPost(`/servico/chamadas/${atoId}`, { resultado });
      recarregar();
      aoMudar?.(
        resultado === "VAI_DESMARCAR"
          ? "Chamada registada: o doente não vem. A vaga foi libertada e oferecida por regras (ver Vagas libertadas)."
          : "Chamada registada.",
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  if (!dados) return <p className="mt-5 text-sm text-slate-500">A carregar…</p>;
  const porFazer = dados.itens.filter((i) => !i.chamada);
  const feitas = dados.itens.filter((i) => i.chamada);
  const pct = dados.marcacoesNoHorizonte ? Math.round((dados.itens.length / dados.marcacoesNoHorizonte) * 100) : 0;

  return (
    <div className="mt-5 space-y-4" data-tour="chamadas">
      {erro && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-2xl font-bold text-slate-800">{dados.marcacoesNoHorizonte}</div>
          <div className="text-[11px] text-slate-500">marcações nos próximos {dados.horizonteDias} dias</div>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <div className="text-2xl font-bold text-indigo-800">{dados.itens.length}</div>
          <div className="text-[11px] text-indigo-700">precisam de chamada ({pct}%)</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-2xl font-bold text-emerald-800">{Math.max(0, dados.marcacoesNoHorizonte - dados.itens.length)}</div>
          <div className="text-[11px] text-emerald-700">ficam só com SMS/email + lembrete a D-3</div>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        Todos os doentes recebem o aviso com a preparação do exame e um lembrete a D-3 (responder 2 desmarca e liberta a vaga). Só entram aqui
        os casos com risco: sem contacto digital, preparação crítica (contraste com diabetes/metformina), faltas anteriores ou 2.ª remarcação.
        A ordem nunca baixa a prioridade clínica de ninguém.
      </p>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700">
          A ligar ({porFazer.length})
        </div>
        <div className="divide-y divide-slate-100">
          {porFazer.slice(0, 25).map((i) => (
            <div key={i.ato_id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5">
              <div className="text-xs">
                <div className="font-semibold text-slate-800">
                  <NomeDoente id={i.doente_id} nome={i.doente_nome} /> <span className="font-normal text-slate-500">· {i.contacto}</span>
                </div>
                <div className="text-slate-500">
                  {dataHoraCurta(i.data_hora)} · {i.ato_descricao}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {i.motivos.map((m) => (
                    <span key={m.codigo} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${COR_MOTIVO[m.codigo] ?? "bg-slate-100"}`}>
                      {m.texto}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => registar(i.ato_id, "CONFIRMADO")}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                >
                  <Check className="h-3 w-3" /> Confirmado
                </button>
                <button
                  type="button"
                  onClick={() => registar(i.ato_id, "NAO_ATENDEU")}
                  className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <PhoneOff className="h-3 w-3" /> Não atendeu
                </button>
                <button
                  type="button"
                  onClick={() => registar(i.ato_id, "VAI_DESMARCAR")}
                  className="flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                >
                  <CalendarX2 className="h-3 w-3" /> Não vem
                </button>
              </div>
            </div>
          ))}
          {porFazer.length > 25 && <p className="px-4 py-2 text-[11px] text-slate-500">… e mais {porFazer.length - 25}.</p>}
          {porFazer.length === 0 && <p className="px-4 py-3 text-xs text-slate-500">Nada por ligar.</p>}
        </div>
      </div>

      {dados.encaixes.dias.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-700">Encaixes sugeridos (só sugestão)</h3>
          <p className="mb-2 text-[11px] text-slate-500">
            Faltas esperadas por dia = taxa histórica do serviço ({dados.encaixes.taxa_historica}%), ×3 para quem já faltou e ×2 para quem não tem contacto
            digital. Nada é marcado: é um número para o serviço decidir (a validar).
          </p>
          <div className="flex flex-wrap gap-1.5">
            {dados.encaixes.dias.map((d) => (
              <div key={d.dia} className="rounded border border-slate-200 px-2 py-1 text-[11px]">
                <div className="font-semibold text-slate-800">{dataHoraCurta(d.dia)}</div>
                <div className="text-slate-500">
                  {d.marcacoes} marc. · {d.faltas_esperadas} faltas esp.
                </div>
                <div className={d.encaixes_sugeridos > 0 ? "font-bold text-indigo-700" : "text-slate-400"}>
                  {d.encaixes_sugeridos > 0 ? `+${d.encaixes_sugeridos} encaixe(s)` : "sem encaixe"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {feitas.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
            <Phone className="h-3.5 w-3.5" /> Chamadas feitas ({feitas.length})
          </h3>
          <ul className="space-y-1 text-xs text-slate-600">
            {feitas.map((i) => (
              <li key={i.ato_id}>
                <strong className="text-slate-800"><NomeDoente id={i.doente_id} nome={i.doente_nome} /></strong> — {RESULTADO[i.chamada!.resultado] ?? i.chamada!.resultado}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
