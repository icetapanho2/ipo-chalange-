import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { OasisPainel, OasisShell } from "../../oasis/OasisShell";
import { apiGet } from "../../lib/api";
import { usePerfil } from "../../lib/PerfilContext";
import { DoenteModal } from "../../components/DoenteModal";
import {
  Clock,
  Activity,
  FileCheck,
  ChevronRight,
  ChevronLeft,
  Stethoscope,
  CalendarDays,
  BellRing,
  X,
} from "lucide-react";

interface NotificacaoAdministrativa {
  nome: string;
  cargo: string;
  especialidade_legivel: string;
}

interface ItemAgenda {
  ato_id: string;
  data_hora: string;
  duracao_min: number;
  estado: string;
  ato_descricao: string;
  gabinete_descricao: string;
  doente_id: string;
  doente_nome: string;
  tem_nota: boolean;
}

interface RespostaAgenda {
  medico: { utilizador_id: string; nome: string };
  hoje: string;
  data: string;
  atos: ItemAgenda[];
}

function hora(dataHoraIso: string): string {
  return dataHoraIso.slice(11, 16);
}

/** Aritmética de calendário pura (não lê o relógio do sistema — apenas desloca uma data dada). */
function deslocarDia(isoData: string, dias: number): string {
  const [ano, mes, dia] = isoData.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia);
  d.setDate(d.getDate() + dias);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function OasisMedico() {
  const { utilizador, definirUtilizadorId, utilizadores } = usePerfil();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [resposta, setResposta] = useState<RespostaAgenda | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [doenteModalId, setDoenteModalId] = useState<string | null>(null);
  // Uma consulta guardada pode devolver o médico a um dia específico (ex.: a revisão marcada
  // para daqui a 3 semanas); ?data=aaaa-mm-dd na URL define o dia inicial mostrado.
  const [dataVista, setDataVista] = useState<string | null>(() => searchParams.get("data"));
  const primeiraVez = useRef(true);

  // Toast no canto: a consulta que acabou de ser guardada avisa qual administrativa foi
  // notificada (ênfase no cargo/serviço — na demo importa perceber a ligação entre pessoas).
  const [toastAdministrativo, setToastAdministrativo] = useState<NotificacaoAdministrativa | null>(null);
  useEffect(() => {
    const estado = location.state as { toastAdministrativo?: NotificacaoAdministrativa } | null;
    if (estado?.toastAdministrativo) {
      setToastAdministrativo(estado.toastAdministrativo);
      navigate(location.pathname + location.search, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!toastAdministrativo) return;
    const temporizador = setTimeout(() => setToastAdministrativo(null), 6000);
    return () => clearTimeout(temporizador);
  }, [toastAdministrativo]);

  // Ao trocar de médico (não na primeira montagem), volta sempre a mostrar "hoje" desse médico.
  useEffect(() => {
    if (primeiraVez.current) {
      primeiraVez.current = false;
      return;
    }
    setDataVista(null);
  }, [utilizador?.utilizador_id]);

  useEffect(() => {
    if (!utilizador) return;
    setACarregar(true);
    setErro(null);
    const caminho = dataVista ? `/oasis/medico/agenda?data=${dataVista}` : "/oasis/medico/agenda";
    apiGet<RespostaAgenda>(caminho)
      .then((r) => {
        setResposta(r);
        if (!dataVista) setDataVista(r.data);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setACarregar(false));
  }, [utilizador?.utilizador_id, dataVista]);

  const medicosDisponiveis = utilizadores.filter((u) => u.e_medico);

  return (
    <OasisShell titulo="Agenda Médica de Consultas">
      {!utilizador?.e_medico && (
        <OasisPainel titulo="Selecione um Perfil Médico">
          <div className="p-4 text-center">
            <Stethoscope className="mx-auto h-10 w-10 text-slate-400 mb-2" />
            <p className="text-sm font-semibold text-slate-700">
              O perfil atualmente selecionado não é médico ({utilizador?.nome}).
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Para aceder à agenda e simular o registo médico no Oasis, selecione um médico clínico:
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {medicosDisponiveis.map((m) => (
                <button
                  key={m.utilizador_id}
                  type="button"
                  onClick={() => definirUtilizadorId(m.utilizador_id)}
                  className="rounded-lg bg-oasis-header px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-slate-700 transition-colors"
                >
                  Entrar como {m.nome} ({m.perfil})
                </button>
              ))}
            </div>
          </div>
        </OasisPainel>
      )}

      {utilizador?.e_medico && aCarregar && (
        <div className="flex h-48 items-center justify-center text-slate-500 gap-2">
          <Clock className="h-5 w-5 animate-spin text-oasis-header" />
          <span>A carregar agenda de hoje…</span>
        </div>
      )}

      {erro && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <strong>Aviso:</strong> {erro}
        </div>
      )}

      {utilizador?.e_medico && resposta && (
        <OasisPainel titulo={`${resposta.medico.nome} — ${formatarDataCabecalho(resposta.data)}`}>
          <div className="flex items-center justify-between gap-2 border-b border-oasis-border bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDataVista(deslocarDia(resposta.data, -1))}
                className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                title="Dia anterior"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDataVista(deslocarDia(resposta.data, 1))}
                className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                title="Dia seguinte"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              {resposta.data !== resposta.hoje && (
                <button
                  type="button"
                  onClick={() => setDataVista(resposta.hoje)}
                  className="ml-1 inline-flex items-center gap-1 rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-100"
                >
                  <CalendarDays className="h-3 w-3" />
                  <span>Voltar a hoje</span>
                </button>
              )}
            </div>
            <span className="text-[11px] text-slate-400">
              Navegue para ver consultas de revisão já marcadas noutros dias.
            </span>
          </div>

          {resposta.atos.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Sem consultas marcadas neste dia para esta agenda médica.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-oasis-border bg-slate-100 text-[11px] uppercase font-bold text-slate-600">
                    <th className="py-2.5 px-3">Hora</th>
                    <th className="py-2.5 px-3">Utente</th>
                    <th className="py-2.5 px-3">Acto Clínico</th>
                    <th className="py-2.5 px-3">Gabinete</th>
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-3">Diário</th>
                    <th className="py-2.5 px-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {resposta.atos.map((item) => (
                    <tr
                      key={item.ato_id}
                      className="group bg-white hover:bg-sky-50/50 transition-colors"
                    >
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">
                        {hora(item.data_hora)}
                      </td>
                      <td className="py-3 px-3 font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDoenteModalId(item.doente_id);
                            }}
                            className="font-bold text-slate-900 hover:text-oasis-accent flex items-center gap-1 group/btn"
                            title="Ver prontidão e o que falta"
                          >
                            <span>{item.doente_nome}</span>
                            <Activity className="h-3 w-3 text-sky-600 opacity-50 group-hover/btn:opacity-100" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-700">{item.ato_descricao}</td>
                      <td className="py-3 px-3 text-slate-500">{item.gabinete_descricao}</td>
                      <td className="py-3 px-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          {item.estado}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {item.tem_nota ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            <FileCheck className="h-3 w-3" />
                            <span>Guardada</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">— Pendente</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/oasis/medico/${item.ato_id}`)}
                          className="rounded-lg bg-oasis-header px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-slate-700 transition-colors inline-flex items-center gap-1"
                        >
                          <span>Abrir Consulta</span>
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </OasisPainel>
      )}

      {/* Modal Universal do Doente */}
      {doenteModalId && (
        <DoenteModal
          doenteId={doenteModalId}
          onFechar={() => setDoenteModalId(null)}
        />
      )}

      {/* Toast no canto: notificação administrativa enviada ao guardar a consulta anterior */}
      {toastAdministrativo && (
        <div
          id="toast-notificacao-administrativa"
          className="fixed bottom-4 right-4 z-50 w-full max-w-sm rounded-xl border border-sky-200 bg-white p-3.5 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
              <BellRing className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800">Notificação administrativa enviada</p>
              <p className="mt-0.5 text-xs text-slate-600">
                <span className="font-semibold text-sky-800">
                  {toastAdministrativo.cargo} de {toastAdministrativo.especialidade_legivel}
                </span>
                <span className="text-slate-400"> · {toastAdministrativo.nome}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setToastAdministrativo(null)}
              className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </OasisShell>
  );
}

function formatarDataCabecalho(isoData: string): string {
  const [ano, mes, dia] = isoData.split("-");
  return `${dia}/${mes}/${ano}`;
}
