import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api";
import { usePerfil } from "../lib/PerfilContext";
import { Bell, BellOff, Check, CheckCheck, ChevronDown, RefreshCcw, UserCircle2 } from "lucide-react";

type TipoNotificacao =
  | "CONSULTA_SUBMETIDA"
  | "PEDIDO_EM_TRIAGEM"
  | "PEDIDO_MARCADO"
  | "PEDIDO_SEM_VAGA"
  | "PEDIDO_DEVOLVIDO"
  | "PEDIDO_RECUSADO"
  | "AVARIA_SERVICO"
  | "AVARIA_RESOLVIDA";

interface Notificacao {
  notificacao_id: string;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  doente_id: string;
  criado_em: string;
  lida: boolean;
}

interface RespostaNotificacoes {
  notificacoes: Notificacao[];
  naoLidas: number;
  tiposSilenciados: TipoNotificacao[];
}

interface ResumoUtilizador {
  utilizador_id: string;
  naoLidas: number;
}

const ROTA_POR_TIPO: Record<TipoNotificacao, string> = {
  CONSULTA_SUBMETIDA: "/validacao",
  PEDIDO_EM_TRIAGEM: "/triagem",
  PEDIDO_MARCADO: "/meus-pedidos",
  PEDIDO_SEM_VAGA: "/servico",
  PEDIDO_DEVOLVIDO: "/meus-pedidos",
  PEDIDO_RECUSADO: "/meus-pedidos",
  AVARIA_SERVICO: "/servico",
  AVARIA_RESOLVIDA: "/tecnico",
};

const COR_POR_TIPO: Record<TipoNotificacao, string> = {
  CONSULTA_SUBMETIDA: "bg-sky-100 text-sky-700",
  PEDIDO_EM_TRIAGEM: "bg-violet-100 text-violet-700",
  PEDIDO_MARCADO: "bg-emerald-100 text-emerald-700",
  PEDIDO_SEM_VAGA: "bg-amber-100 text-amber-800",
  PEDIDO_DEVOLVIDO: "bg-amber-100 text-amber-800",
  PEDIDO_RECUSADO: "bg-red-100 text-red-700",
  AVARIA_SERVICO: "bg-orange-100 text-orange-800",
  AVARIA_RESOLVIDA: "bg-emerald-100 text-emerald-700",
};

const NOME_PERFIL: Record<string, string> = {
  MEDICO: "Médico",
  ADMINISTRATIVO: "Administrativo",
  TRIADOR: "Triador",
  GESTAO: "Gestão",
  TECNICO: "Técnico",
};

const INTERVALO_POLL_MS = 20000;

const HONORIFICOS = new Set(["dr.", "dra.", "enf."]);

function nomeSemHonorifico(nome: string): string[] {
  const partes = nome.trim().split(/\s+/);
  return HONORIFICOS.has(partes[0]?.toLowerCase()) ? partes.slice(1) : partes;
}

function iniciais(nome: string): string {
  const partes = nomeSemHonorifico(nome);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

function primeiroNomeVisivel(nome: string): string {
  return nomeSemHonorifico(nome)[0] ?? nome;
}

export function TrocadorUtilizador() {
  const navigate = useNavigate();
  const { utilizador, utilizadorId, utilizadores, definirUtilizadorId } = usePerfil();
  const [aberto, setAberto] = useState(false);
  const [separador, setSeparador] = useState<"notificacoes" | "trocar">("notificacoes");
  const [notifs, setNotifs] = useState<RespostaNotificacoes | null>(null);
  const [resumo, setResumo] = useState<ResumoUtilizador[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  function carregarNotifs() {
    apiGet<RespostaNotificacoes>("/notificacoes")
      .then(setNotifs)
      .catch(() => {});
  }

  function carregarResumo() {
    apiGet<ResumoUtilizador[]>("/notificacoes/resumo")
      .then(setResumo)
      .catch(() => {});
  }

  useEffect(() => {
    if (!utilizadorId) return;
    setNotifs(null);
    carregarNotifs();
    carregarResumo();
    const id = setInterval(() => {
      carregarNotifs();
      carregarResumo();
    }, INTERVALO_POLL_MS);
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
      carregarNotifs();
      carregarResumo();
    }
    setAberto(false);
    if (n.doente_id) navigate(`/doente/${n.doente_id}`);
    else navigate(ROTA_POR_TIPO[n.tipo] ?? "/");
  }

  async function marcarTodasLidas() {
    await apiPost("/notificacoes/marcar-todas-lidas").catch(() => {});
    carregarNotifs();
    carregarResumo();
  }

  async function alternarSilenciar(tipo: TipoNotificacao, silenciado: boolean) {
    await apiPost(`/notificacoes/${silenciado ? "dessilenciar" : "silenciar"}`, { tipo }).catch(() => {});
    carregarNotifs();
  }

  function trocarPara(id: string) {
    definirUtilizadorId(id);
    setAberto(false);
    setSeparador("notificacoes");
  }

  const naoLidas = notifs?.naoLidas ?? 0;
  const tiposSilenciados = new Set(notifs?.tiposSilenciados ?? []);
  const resumoPorId = new Map(resumo.map((r) => [r.utilizador_id, r.naoLidas]));

  const gruposPerfil = ["MEDICO", "ADMINISTRATIVO", "TRIADOR", "GESTAO", "TECNICO"]
    .map((perfil) => ({ perfil, utilizadores: utilizadores.filter((u) => u.perfil === perfil) }))
    .filter((g) => g.utilizadores.length > 0);

  return (
    <div className="relative" ref={containerRef}>
      <button
        id="btn-trocador-utilizador"
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="relative flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-2 hover:bg-slate-100 transition-colors max-w-[160px]"
        title={utilizador ? `${utilizador.nome} (${NOME_PERFIL[utilizador.perfil] ?? utilizador.perfil})` : "Perfil"}
      >
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-oasis-header text-[10px] font-bold text-white">
          {utilizador ? iniciais(utilizador.nome) : <UserCircle2 className="h-4 w-4" />}
          {naoLidas > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-red-600 ring-2 ring-slate-50" />
          )}
        </span>
        <span className="truncate text-xs font-semibold text-slate-800">{utilizador ? primeiroNomeVisivel(utilizador.nome) : "…"}</span>
        <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
      </button>

      {aberto && (
        <div
          id="painel-trocador-utilizador"
          className="absolute right-0 z-40 mt-2 w-96 max-w-[92vw] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
        >
          <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50 p-1.5">
            <button
              type="button"
              onClick={() => setSeparador("notificacoes")}
              className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                separador === "notificacoes" ? "bg-white text-oasis-header shadow-2xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Bell className="h-3.5 w-3.5" />
              <span>Notificações</span>
              {naoLidas > 0 && (
                <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{naoLidas}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setSeparador("trocar")}
              className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                separador === "trocar" ? "bg-white text-oasis-header shadow-2xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              <span>Trocar utilizador</span>
            </button>
          </div>

          {separador === "notificacoes" ? (
            <>
              {naoLidas > 0 && (
                <div className="flex justify-end border-b border-slate-100 px-3 py-1.5">
                  <button
                    type="button"
                    onClick={marcarTodasLidas}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-oasis-accent hover:underline"
                  >
                    <CheckCheck className="h-3 w-3" />
                    <span>Marcar todas como lidas</span>
                  </button>
                </div>
              )}
              <div className="max-h-96 overflow-y-auto">
                {!notifs || notifs.notificacoes.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-400">Sem notificações.</p>
                ) : (
                  notifs.notificacoes.slice(0, 30).map((n) => (
                    <div
                      key={n.notificacao_id}
                      className={`flex items-start gap-2 border-b border-slate-50 px-3 py-2.5 hover:bg-slate-50 ${n.lida ? "opacity-60" : ""}`}
                    >
                      <button type="button" onClick={() => abrirNotificacao(n)} className="flex-1 text-left">
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
                              carregarNotifs();
                              carregarResumo();
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
                          className={`rounded p-1 hover:bg-slate-200 ${tiposSilenciados.has(n.tipo) ? "text-amber-600" : "text-slate-400 hover:text-slate-700"}`}
                        >
                          <BellOff className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="max-h-96 overflow-y-auto py-1">
              {gruposPerfil.map((grupo) => (
                <div key={grupo.perfil}>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {NOME_PERFIL[grupo.perfil] ?? grupo.perfil}
                  </p>
                  {grupo.utilizadores.map((u) => {
                    const activo = u.utilizador_id === utilizadorId;
                    const n = resumoPorId.get(u.utilizador_id) ?? 0;
                    return (
                      <button
                        key={u.utilizador_id}
                        type="button"
                        onClick={() => trocarPara(u.utilizador_id)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 ${activo ? "bg-sky-50" : ""}`}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-oasis-header text-[10px] font-bold text-white">
                          {iniciais(u.nome)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`block truncate text-xs font-semibold ${activo ? "text-oasis-header" : "text-slate-800"}`}>
                            {u.nome}
                          </span>
                          {activo && <span className="block text-[10px] text-oasis-accent font-medium">Perfil activo</span>}
                        </span>
                        {n > 0 && (
                          <span className="shrink-0 rounded-full bg-red-600 px-1.5 py-0.2 text-[10px] font-bold text-white">{n}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
