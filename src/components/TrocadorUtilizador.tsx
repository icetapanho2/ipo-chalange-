import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EVENTO_MUDANCA, apiGet } from "../lib/api";
import { paginaPrincipal } from "../lib/navegacao";
import { usePerfil } from "../lib/PerfilContext";
import { ChevronDown, UserCircle2 } from "lucide-react";

interface ResumoUtilizador {
  utilizador_id: string;
  naoLidas: number;
}

interface Especialidade {
  codigo: string;
  descricao: string;
}

const NOME_PERFIL: Record<string, string> = {
  MEDICO: "Médico",
  ADMINISTRATIVO: "Administrativo",
  TRIADOR: "Triador",
  GESTAO: "Gestão",
  TECNICO: "Técnico",
};

const INTERVALO_POLL_MS = 10000;

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
  const [resumo, setResumo] = useState<ResumoUtilizador[]>([]);
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiGet<{ especialidades: Especialidade[] }>("/catalogo")
      .then((r) => setEspecialidades(r.especialidades))
      .catch(() => {});
  }, []);

  function servicoDe(especialidadeCodigo: string): string {
    if (!especialidadeCodigo) return "";
    return especialidades.find((e) => e.codigo === especialidadeCodigo)?.descricao ?? especialidadeCodigo;
  }

  function carregarResumo() {
    apiGet<ResumoUtilizador[]>("/notificacoes/resumo")
      .then(setResumo)
      .catch(() => {});
  }

  useEffect(() => {
    if (!utilizadorId) return;
    carregarResumo();
    const aoMudar = () => setTimeout(carregarResumo, 150);
    window.addEventListener(EVENTO_MUDANCA, aoMudar);
    const id = setInterval(carregarResumo, INTERVALO_POLL_MS);
    return () => {
      window.removeEventListener(EVENTO_MUDANCA, aoMudar);
      clearInterval(id);
    };
  }, [utilizadorId]);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function trocarPara(id: string) {
    definirUtilizadorId(id);
    // Abre logo a página de trabalho do novo utilizador (não fica numa página de outro perfil).
    navigate(paginaPrincipal(utilizadores.find((u) => u.utilizador_id === id)?.perfil));
    setAberto(false);
  }

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
        title={
          utilizador
            ? `${utilizador.nome} — ${NOME_PERFIL[utilizador.perfil] ?? utilizador.perfil}${
                utilizador.especialidade_codigo ? ` · ${servicoDe(utilizador.especialidade_codigo)}` : ""
              }`
            : "Perfil"
        }
      >
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-oasis-header text-[10px] font-bold text-white">
          {utilizador ? iniciais(utilizador.nome) : <UserCircle2 className="h-4 w-4" />}
        </span>
        <span className="truncate text-xs font-semibold text-slate-800">{utilizador ? primeiroNomeVisivel(utilizador.nome) : "…"}</span>
        <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
      </button>

      {aberto && (
        <div
          id="painel-trocador-utilizador"
          className="absolute right-0 z-40 mt-2 w-96 max-w-[92vw] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
        >
          <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">Trocar utilizador</div>
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
                          {u.especialidade_codigo && (
                            <span className="block truncate text-[10px] text-slate-400">{servicoDe(u.especialidade_codigo)}</span>
                          )}
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
        </div>
      )}
    </div>
  );
}
