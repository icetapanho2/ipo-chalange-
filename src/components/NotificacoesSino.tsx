import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api";
import { usePerfil } from "../lib/PerfilContext";
import { Bell, BellOff, Check, CheckCheck } from "lucide-react";

export type TipoNotificacao =
  | "CONSULTA_SUBMETIDA"
  | "PEDIDO_EM_TRIAGEM"
  | "PEDIDO_MARCADO"
  | "PEDIDO_SEM_VAGA"
  | "PEDIDO_DEVOLVIDO"
  | "PEDIDO_RECUSADO";

interface Notificacao {
  notificacao_id: string;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  pedido_id: string;
  doente_id: string;
  consulta_ato_id: string;
  criado_em: string;
  lida: boolean;
}

interface RespostaNotificacoes {
  notificacoes: Notificacao[];
  naoLidas: number;
  tiposSilenciados: TipoNotificacao[];
}

const ROTA_POR_TIPO: Record<TipoNotificacao, string> = {
  CONSULTA_SUBMETIDA: "/validacao",
  PEDIDO_EM_TRIAGEM: "/triagem",
  PEDIDO_MARCADO: "/meus-pedidos",
  PEDIDO_SEM_VAGA: "/servico",
  PEDIDO_DEVOLVIDO: "/meus-pedidos",
  PEDIDO_RECUSADO: "/meus-pedidos",
};

const COR_POR_TIPO: Record<TipoNotificacao, string> = {
  CONSULTA_SUBMETIDA: "bg-sky-100 text-sky-700",
  PEDIDO_EM_TRIAGEM: "bg-violet-100 text-violet-700",
  PEDIDO_MARCADO: "bg-emerald-100 text-emerald-700",
  PEDIDO_SEM_VAGA: "bg-amber-100 text-amber-800",
  PEDIDO_DEVOLVIDO: "bg-amber-100 text-amber-800",
  PEDIDO_RECUSADO: "bg-red-100 text-red-700",
};

const INTERVALO_POLL_MS = 20000;

export function NotificacoesSino() {
  const navigate = useNavigate();
  const { utilizadorId } = usePerfil();
  const [dados, setDados] = useState<RespostaNotificacoes | null>(null);
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function carregar() {
    apiGet<RespostaNotificacoes>("/notificacoes")
      .then(setDados)
      .catch(() => {
        // silencioso: a barra de notificações não deve bloquear o resto da app
      });
  }

  // Recarrega ao mudar de perfil activo (a barra não deve mostrar notificações de outro utilizador)
  // e periodicamente, para captar o que outras acções no sistema forem gerando.
  useEffect(() => {
    if (!utilizadorId) return;
    setDados(null);
    carregar();
    const id = setInterval(carregar, INTERVALO_POLL_MS);
    return () => clearInterval(id);
  }, [utilizadorId]);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  async function abrirNotificacao(n: Notificacao) {
    if (!n.lida) {
      await apiPost(`/notificacoes/${n.notificacao_id}/marcar-lida`).catch(() => {});
      carregar();
    }
    setAberto(false);
    if (n.doente_id) navigate(`/doente/${n.doente_id}`);
    else navigate(ROTA_POR_TIPO[n.tipo] ?? "/");
  }

  async function marcarTodasLidas() {
    await apiPost("/notificacoes/marcar-todas-lidas").catch(() => {});
    carregar();
  }

  async function alternarSilenciar(tipo: TipoNotificacao, silenciado: boolean) {
    await apiPost(`/notificacoes/${silenciado ? "dessilenciar" : "silenciar"}`, { tipo }).catch(() => {});
    carregar();
  }

  const naoLidas = dados?.naoLidas ?? 0;
  const tiposSilenciados = new Set(dados?.tiposSilenciados ?? []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        id="btn-sino-notificacoes"
        type="button"
        onClick={() => {
          setAberto((v) => !v);
          carregar();
        }}
        className="relative inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-slate-600 hover:bg-slate-100"
        title="Notificações"
      >
        <Bell className="h-4 w-4" />
        {naoLidas > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div
          id="painel-notificacoes"
          className="absolute right-0 z-40 mt-2 w-96 max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-xs font-bold text-slate-700">Notificações</span>
            {naoLidas > 0 && (
              <button
                type="button"
                onClick={marcarTodasLidas}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-oasis-accent hover:underline"
              >
                <CheckCheck className="h-3 w-3" />
                <span>Marcar todas como lidas</span>
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {!dados || dados.notificacoes.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">Sem notificações.</p>
            ) : (
              dados.notificacoes.slice(0, 30).map((n) => (
                <div
                  key={n.notificacao_id}
                  className={`flex items-start gap-2 border-b border-slate-50 px-3 py-2.5 hover:bg-slate-50 ${
                    n.lida ? "opacity-60" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => abrirNotificacao(n)}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${COR_POR_TIPO[n.tipo]}`}>
                        {n.tipo.replace(/_/g, " ")}
                      </span>
                      {!n.lida && <span className="h-1.5 w-1.5 rounded-full bg-sky-600" />}
                    </div>
                    <p className="mt-0.5 text-xs font-semibold text-slate-800">{n.titulo}</p>
                    <p className="text-[11px] text-slate-500">{n.mensagem}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{n.criado_em.replace("T", " ")}</p>
                  </button>
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    {!n.lida && (
                      <button
                        type="button"
                        title="Marcar como lida"
                        onClick={async () => {
                          await apiPost(`/notificacoes/${n.notificacao_id}/marcar-lida`).catch(() => {});
                          carregar();
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      title={tiposSilenciados.has(n.tipo) ? "Deixar de silenciar este tipo" : "Silenciar este tipo"}
                      onClick={() => alternarSilenciar(n.tipo, tiposSilenciados.has(n.tipo))}
                      className={`rounded p-1 hover:bg-slate-200 ${
                        tiposSilenciados.has(n.tipo) ? "text-amber-600" : "text-slate-400 hover:text-slate-700"
                      }`}
                    >
                      <BellOff className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
