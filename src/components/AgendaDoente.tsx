import { useState } from "react";
import { CalendarCheck2, MapPin, MessageSquare, Mail, FileText, Phone } from "lucide-react";
import { dataHoraCurta } from "./PorqueEstaEscolha";

export interface MarcacaoAgenda {
  ato_id: string;
  pedido_id: string;
  data_hora: string;
  especialidade_legivel: string;
  descricao: string;
  local: string;
  medico: string;
  prazo_limite: string;
  dentro_do_prazo: boolean | null;
  motivo_marcacao: string;
}

export interface Comunicacao {
  comunicacao_id: string;
  canal: "SMS" | "EMAIL" | "CARTA";
  tipo: string;
  texto: string;
  enviar_em: string;
  estado: "ENVIADA" | "AGENDADA";
}

export interface PerfilLogistico {
  concelho?: string;
  distancia_km?: number;
  contacto_digital?: string;
  aceita_antecipacao?: boolean;
  transporte_nao_urgente?: boolean;
}

const ICONE_CANAL = { SMS: MessageSquare, EMAIL: Mail, CARTA: FileText };
const TIPO: Record<string, string> = {
  MARCACAO: "Aviso de marcação",
  LEMBRETE: "Lembrete D-3",
  REMARCACAO: "Remarcação",
  OFERTA: "Oferta de antecipação",
  ANTECIPACAO: "Antecipação confirmada",
  DESMARCACAO: "Desmarcação",
};

/** "O que ficou marcado": todas as marcações futuras do doente, as mensagens que recebeu e o perfil logístico. */
export function AgendaDoente({
  agenda,
  comunicacoes,
  perfil,
  idade,
  remarcacoes,
}: {
  agenda: MarcacaoAgenda[];
  comunicacoes: Comunicacao[];
  perfil: PerfilLogistico;
  idade?: number;
  remarcacoes?: number;
}) {
  const [verTodas, setVerTodas] = useState(false);
  const visiveis = verTodas ? comunicacoes : comunicacoes.slice(0, 4);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-900">
          <CalendarCheck2 className="h-4 w-4 text-emerald-600" />
          Marcações do doente ({agenda.length})
        </h2>
        {agenda.length === 0 && <p className="text-xs text-slate-500">Sem marcações futuras.</p>}
        <ol className="relative space-y-2 border-l-2 border-emerald-100 pl-4">
          {agenda.map((m) => (
            <li key={m.ato_id} className="relative">
              <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="font-bold text-slate-800">{dataHoraCurta(m.data_hora)}</span>
                <span className="font-semibold text-slate-700">{m.especialidade_legivel}</span>
                {m.dentro_do_prazo === true && (
                  <span className="rounded bg-emerald-50 px-1.5 text-[10px] font-bold text-emerald-700">dentro do prazo ({dataHoraCurta(m.prazo_limite)})</span>
                )}
                {m.dentro_do_prazo === false && (
                  <span className="rounded bg-rose-50 px-1.5 text-[10px] font-bold text-rose-700">fora do prazo ({dataHoraCurta(m.prazo_limite)})</span>
                )}
              </div>
              <div className="text-[11px] text-slate-500">
                {m.descricao}
                {m.local && (
                  <>
                    {" "}
                    · <MapPin className="inline h-3 w-3" /> {m.local}
                  </>
                )}
                {m.medico && <> · {m.medico}</>}
              </div>
              {m.motivo_marcacao && <div className="mt-0.5 text-[11px] font-medium text-indigo-700">{m.motivo_marcacao}</div>}
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">Perfil logístico</h2>
          <dl className="space-y-1 text-xs text-slate-600">
            <div className="flex justify-between">
              <dt>Mora em</dt>
              <dd className="font-semibold text-slate-800">
                {perfil.concelho || "—"} ({perfil.distancia_km ?? 0} km)
              </dd>
            </div>
            {idade !== undefined && (
              <div className="flex justify-between">
                <dt>Idade</dt>
                <dd className="font-semibold text-slate-800">{idade} anos</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Contacto digital</dt>
              <dd className={`font-semibold ${perfil.contacto_digital === "NENHUM" ? "text-rose-700" : "text-slate-800"}`}>
                {perfil.contacto_digital === "NENHUM" ? "Nenhum (carta + chamada)" : perfil.contacto_digital}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Aceita ser antecipado</dt>
              <dd className="font-semibold text-slate-800">{perfil.aceita_antecipacao ? "Sim" : "Não"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Transporte não urgente</dt>
              <dd className="font-semibold text-slate-800">{perfil.transporte_nao_urgente ? "Sim" : "Não"}</dd>
            </div>
            {remarcacoes !== undefined && (
              <div className="flex justify-between">
                <dt>Remarcado pelo hospital (90 dias)</dt>
                <dd className={`font-semibold ${remarcacoes > 0 ? "text-amber-700" : "text-slate-800"}`}>{remarcacoes}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
            <Phone className="h-3.5 w-3.5" /> Mensagens ao doente ({comunicacoes.length})
          </h2>
          <p className="mb-2 text-[10px] text-slate-400">Simuladas — nada é enviado na demonstração.</p>
          {comunicacoes.length === 0 && <p className="text-xs text-slate-500">Sem mensagens.</p>}
          <ul className="space-y-2">
            {visiveis.map((c) => {
              const Icone = ICONE_CANAL[c.canal];
              return (
                <li key={c.comunicacao_id} className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                  <div className="mb-0.5 flex items-center gap-1 font-semibold text-slate-700">
                    <Icone className="h-3 w-3" /> {TIPO[c.tipo] ?? c.tipo} · {c.canal}
                    <span className="ml-auto font-normal text-slate-400">
                      {c.estado === "AGENDADA" ? `agendada ${dataHoraCurta(c.enviar_em)}` : dataHoraCurta(c.enviar_em)}
                    </span>
                  </div>
                  {c.texto}
                </li>
              );
            })}
          </ul>
          {comunicacoes.length > 4 && (
            <button type="button" onClick={() => setVerTodas((v) => !v)} className="mt-2 text-[11px] font-semibold text-slate-600 hover:underline">
              {verTodas ? "Ver menos" : `Ver todas (${comunicacoes.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
