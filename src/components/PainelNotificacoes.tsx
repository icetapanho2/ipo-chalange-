import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { EVENTO_MUDANCA, apiGet, apiPost } from "../lib/api";
import { dataHoraPT } from "../lib/datas";
import { usePerfil } from "../lib/PerfilContext";
import { Bell, CheckCheck, LogIn, Pin, PinOff, X } from "lucide-react";

interface Notificacao {
  notificacao_id: string;
  tipo: string;
  destinatario_utilizador_id: string;
  destinatario_nome: string;
  destinatario_perfil: string;
  titulo: string;
  mensagem: string;
  doente_id: string;
  criado_em: string;
  lida: boolean;
}

const ROTULO: Record<string, string> = {
  CONSULTA_SUBMETIDA: "Consulta submetida",
  PEDIDO_EM_TRIAGEM: "Para triagem",
  PEDIDO_MARCADO: "Marcado",
  PEDIDO_SEM_VAGA: "Sem vaga",
  PEDIDO_DEVOLVIDO: "Devolvido",
  PEDIDO_RECUSADO: "Recusado",
  AVARIA_SERVICO: "Avaria",
  AVARIA_RESOLVIDA: "Avaria resolvida",
  PEDIDO_DECISAO_NECESSARIA: "Decisão necessária",
  REMARCACAO_SUGERIDA: "Remarcação sugerida",
  VAGA_EXTRA_PEDIDA: "Vaga extra pedida",
};

const COR: Record<string, string> = {
  CONSULTA_SUBMETIDA: "bg-sky-100 text-sky-800",
  PEDIDO_EM_TRIAGEM: "bg-violet-100 text-violet-800",
  PEDIDO_MARCADO: "bg-emerald-100 text-emerald-800",
  PEDIDO_SEM_VAGA: "bg-amber-100 text-amber-800",
  PEDIDO_DEVOLVIDO: "bg-amber-100 text-amber-800",
  PEDIDO_RECUSADO: "bg-red-100 text-red-800",
  AVARIA_SERVICO: "bg-orange-100 text-orange-800",
  AVARIA_RESOLVIDA: "bg-emerald-100 text-emerald-800",
  PEDIDO_DECISAO_NECESSARIA: "bg-rose-100 text-rose-800",
  REMARCACAO_SUGERIDA: "bg-sky-100 text-sky-800",
  VAGA_EXTRA_PEDIDA: "bg-sky-100 text-sky-800",
};

/**
 * Para onde leva uma notificação: sempre para o sítio onde se age sobre ela (nunca só para a ficha).
 * Depende do tipo e de quem a recebe (a mesma "marcado" é informação para o médico e carteira para a
 * administrativa).
 */
function rotaDaNotificacao(n: Notificacao): string {
  const medico = n.destinatario_perfil === "MEDICO";
  const doMedico = `/meus-pedidos${n.doente_id ? `?doente=${n.doente_id}` : ""}`;
  switch (n.tipo) {
    case "PEDIDO_EM_TRIAGEM":
      return `/triagem${n.doente_id ? `?doente=${n.doente_id}` : ""}`;
    case "AVARIA_SERVICO":
    case "REMARCACAO_SUGERIDA":
      return "/servico?aba=decidir";
    case "PEDIDO_SEM_VAGA":
      return medico ? doMedico : "/servico?aba=decidir";
    case "PEDIDO_MARCADO":
    case "CONSULTA_SUBMETIDA":
      return medico ? doMedico : "/servico?aba=pedidos";
    case "PEDIDO_DEVOLVIDO":
    case "PEDIDO_RECUSADO":
    case "PEDIDO_DECISAO_NECESSARIA":
      return doMedico;
    case "AVARIA_RESOLVIDA":
      return "/tecnico";
    case "VAGA_EXTRA_PEDIDA":
      return "/gestao?vagas-extra=1";
    default:
      return "/";
  }
}

const CHAVE_FIXO = "oasis2:notificacoesFixas";
const CHAVE_FILTRO = "oasis2:notificacoesFiltro";

function ler(chave: string, omissao: string): string {
  try {
    return localStorage.getItem(chave) ?? omissao;
  } catch {
    return omissao;
  }
}
function guardar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* navegação privada: fica só na sessão */
  }
}

/**
 * Notificações num painel lateral (para a demo): passar o rato no sino abre-o, sair fecha-o; o
 * cadeado (ou um clique no sino) deixa-o fixo. Mostra só as do utilizador activo ou todas as do
 * sistema — para se ver, na hora, que cada acção chega a quem deve. Refresca logo a seguir a cada
 * acção feita na aplicação (evento da API), e de 3 em 3 segundos enquanto está aberto.
 */
export function PainelNotificacoes() {
  const navigate = useNavigate();
  const { utilizadorId, definirUtilizadorId, utilizadores } = usePerfil();
  const [todas, setTodas] = useState<Notificacao[]>([]);
  const [fixo, setFixo] = useState(() => ler(CHAVE_FIXO, "0") === "1");
  const [aberto, setAberto] = useState(fixo);
  const [filtro, setFiltro] = useState<"minhas" | "todas">(() => (ler(CHAVE_FILTRO, "minhas") === "todas" ? "todas" : "minhas"));
  const [novas, setNovas] = useState<Set<string>>(new Set());
  const vistas = useRef<Set<string> | null>(null);
  const fechar = useRef<ReturnType<typeof setTimeout>>();

  const carregar = useCallback(() => {
    apiGet<Notificacao[]>("/notificacoes/todas")
      .then((l) => {
        // Realça as que chegaram desde a última leitura (menos na primeira, que é o estado inicial).
        if (vistas.current) {
          const chegadas = l.filter((n) => !vistas.current!.has(n.notificacao_id)).map((n) => n.notificacao_id);
          if (chegadas.length) {
            setNovas((s) => new Set([...s, ...chegadas]));
            setTimeout(() => setNovas((s) => new Set([...s].filter((id) => !chegadas.includes(id)))), 6000);
          }
        }
        vistas.current = new Set(l.map((n) => n.notificacao_id));
        setTodas(l);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    carregar();
    // A API avisa depois de cada acção; um pequeno atraso deixa o servidor acabar de notificar.
    const aoMudar = () => setTimeout(carregar, 150);
    window.addEventListener(EVENTO_MUDANCA, aoMudar);
    const id = setInterval(carregar, aberto ? 3000 : 10000);
    return () => {
      window.removeEventListener(EVENTO_MUDANCA, aoMudar);
      clearInterval(id);
    };
  }, [carregar, aberto]);

  // Fixo em ecrã largo: o conteúdo encolhe para o painel não o tapar.
  useEffect(() => {
    document.documentElement.classList.toggle("notificacoes-fixas", fixo && aberto);
  }, [fixo, aberto]);

  function alternarFixo() {
    const novo = !fixo;
    setFixo(novo);
    setAberto(novo || aberto);
    guardar(CHAVE_FIXO, novo ? "1" : "0");
  }

  function entrar() {
    clearTimeout(fechar.current);
    setAberto(true);
  }
  function sair() {
    if (fixo) return;
    clearTimeout(fechar.current);
    fechar.current = setTimeout(() => setAberto(false), 350);
  }

  function mudarFiltro(f: "minhas" | "todas") {
    setFiltro(f);
    guardar(CHAVE_FILTRO, f);
  }

  async function abrir(n: Notificacao) {
    if (n.destinatario_utilizador_id !== utilizadorId) definirUtilizadorId(n.destinatario_utilizador_id);
    await fetch(`/api/notificacoes/${n.notificacao_id}/marcar-lida`, {
      method: "POST",
      headers: { "x-utilizador-id": n.destinatario_utilizador_id },
    }).catch(() => undefined);
    carregar();
    if (!fixo) setAberto(false);
    navigate(rotaDaNotificacao(n));
  }

  async function marcarTodasLidas() {
    await apiPost("/notificacoes/marcar-todas-lidas").catch(() => undefined);
    carregar();
  }

  const minhas = todas.filter((n) => n.destinatario_utilizador_id === utilizadorId);
  const lista = filtro === "minhas" ? minhas : todas;
  const naoLidas = minhas.filter((n) => !n.lida).length;
  const nome = utilizadores.find((u) => u.utilizador_id === utilizadorId)?.nome ?? "";

  return (
    <>
      <button
        type="button"
        data-tour="sino"
        onMouseEnter={entrar}
        onMouseLeave={sair}
        onClick={alternarFixo}
        title={fixo ? "Painel fixo — clicar para soltar" : "Passar o rato para ver; clicar para fixar"}
        className={`relative flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
          aberto ? "border-oasis-header bg-oasis-header text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
        }`}
      >
        <Bell className="h-4 w-4" />
        {naoLidas > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-white">
            {naoLidas}
          </span>
        )}
      </button>

      {createPortal(
      <aside
        onMouseEnter={entrar}
        onMouseLeave={sair}
        className={`fixed bottom-0 right-0 top-[57px] z-40 flex w-[380px] max-w-full flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ${
          aberto ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        <div className="border-b border-slate-100 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-oasis-header" />
            <span className="flex-1 text-sm font-bold text-slate-800">Notificações</span>
            <button
              type="button"
              onClick={alternarFixo}
              title={fixo ? "Soltar (fecha ao tirar o rato)" : "Fixar aberto"}
              className={`rounded p-1.5 ${fixo ? "bg-oasis-header text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {fixo ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setFixo(false);
                guardar(CHAVE_FIXO, "0");
                setAberto(false);
              }}
              title="Fechar"
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
            {(
              [
                ["minhas", `Só as de ${nome.split(" ").slice(0, 2).join(" ") || "…"} (${minhas.length})`],
                ["todas", `Todas (${todas.length})`],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                onClick={() => mudarFiltro(valor)}
                className={`flex-1 truncate rounded-md px-2 py-1 ${filtro === valor ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {filtro === "minhas" && naoLidas > 0 && (
            <button type="button" onClick={marcarTodasLidas} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-oasis-accent hover:underline">
              <CheckCheck className="h-3 w-3" /> Marcar todas como lidas
            </button>
          )}
        </div>

        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {lista.length === 0 && <li className="p-6 text-center text-xs text-slate-400">Sem notificações.</li>}
          {lista.map((n) => {
            const minha = n.destinatario_utilizador_id === utilizadorId;
            return (
              <li
                key={n.notificacao_id}
                className={`transition-colors duration-700 ${novas.has(n.notificacao_id) ? "bg-amber-50" : n.lida ? "bg-white" : "bg-sky-50/40"}`}
              >
                <button type="button" onClick={() => abrir(n)} className="block w-full px-3 py-2.5 text-left hover:bg-slate-50">
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${COR[n.tipo] ?? "bg-slate-100 text-slate-700"}`}>{ROTULO[n.tipo] ?? n.tipo}</span>
                    {!n.lida && <span className="h-1.5 w-1.5 rounded-full bg-sky-600" title="Por ler" />}
                    {novas.has(n.notificacao_id) && <span className="text-[10px] font-bold text-amber-700">agora</span>}
                    <span className="ml-auto text-[10px] text-slate-400">{dataHoraPT(n.criado_em)}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-800">{n.titulo}</p>
                  <p className="text-[11px] leading-snug text-slate-500">{n.mensagem}</p>
                  {filtro === "todas" && (
                    <p className={`mt-1 flex items-center gap-1 text-[10px] font-semibold ${minha ? "text-oasis-accent" : "text-slate-500"}`}>
                      {minha ? (
                        "Para si"
                      ) : (
                        <>
                          <LogIn className="h-3 w-3" /> Para {n.destinatario_nome} — clicar entra como este utilizador
                        </>
                      )}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>,
      document.body,
      )}
    </>
  );
}
