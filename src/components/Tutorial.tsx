import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Copy, GraduationCap, Minus, MousePointerClick, Wand2, X } from "lucide-react";
import { usePerfil } from "../lib/PerfilContext";
import { CHAVE_TUTORIAL, EVENTO_ACAO_TUTORIAL, EVENTO_TUTORIAL, obterTutorial } from "../lib/tutoriais";
import { fecharDoente } from "./NomeDoente";

interface Estado {
  id: string;
  i: number;
}

function lerEstado(): Estado | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_TUTORIAL);
    return bruto ? (JSON.parse(bruto) as Estado) : null;
  } catch {
    return null;
  }
}

function gravarEstado(e: Estado | null) {
  try {
    if (e) sessionStorage.setItem(CHAVE_TUTORIAL, JSON.stringify(e));
    else sessionStorage.removeItem(CHAVE_TUTORIAL);
  } catch {
    // sem sessionStorage: o tutorial só não sobrevive a um recarregar da página
  }
}

const MARGEM = 8;
const LARGURA_CARTAO = 380;

/**
 * Modo tutorial (montado uma vez, na App): escurece tudo menos o elemento do passo, com um cartão
 * a explicar. O destaque não bloqueia cliques — pode-se experimentar à vontade no ecrã.
 */
export function Tutorial() {
  const [estado, setEstado] = useState<Estado | null>(lerEstado);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [alturaCartao, setAlturaCartao] = useState(240);
  const [minimizado, setMinimizado] = useState(false);
  const cartao = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { utilizadorId, definirUtilizadorId } = usePerfil();

  const tutorial = estado ? obterTutorial(estado.id) : null;
  const passo = tutorial && estado ? tutorial.passos[estado.i] : null;

  const mudar = useCallback((novo: Estado | null) => {
    gravarEstado(novo);
    setEstado(novo);
  }, []);

  const seguinte = useCallback(() => {
    setEstado((atual) => {
      if (!atual) return atual;
      const t = obterTutorial(atual.id);
      const novo = t && atual.i + 1 < t.passos.length ? { ...atual, i: atual.i + 1 } : null;
      gravarEstado(novo);
      return novo;
    });
  }, []);

  // Começar (a partir do Guião).
  useEffect(() => {
    const iniciar = (e: Event) => {
      const { id, passo } = (e as CustomEvent<{ id: string; passo: number }>).detail;
      mudar({ id, i: passo });
    };
    window.addEventListener(EVENTO_TUTORIAL, iniciar);
    return () => window.removeEventListener(EVENTO_TUTORIAL, iniciar);
  }, [mudar]);

  // Ao entrar num passo: perfil certo, página certa, e a ficha fechada se o passo não for sobre ela.
  useEffect(() => {
    if (!passo) return;
    setRect(null);
    setNaoEncontrado(false);
    setCopiado(null);
    setMinimizado(false);
    if (!passo.alvo?.includes('data-tour="ficha"')) fecharDoente();
    if (passo.utilizadorId && passo.utilizadorId !== utilizadorId) definirUtilizadorId(passo.utilizadorId);
    if (passo.caminho && passo.caminho !== location.pathname + location.search) navigate(passo.caminho);
    // Só ao mudar de passo (não a cada navegação feita dentro dele).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado?.id, estado?.i]);

  // Seguir o elemento destacado (muda com o scroll, com a navegação e com os dados a carregar).
  useEffect(() => {
    if (!passo) return;
    let primeiro = true;
    const inicio = Date.now();
    const medir = () => {
      if (passo.avancarQuando && document.querySelector(passo.avancarQuando)) {
        seguinte();
        return;
      }
      if (passo.avancarQuandoSair && !primeiro && !document.querySelector(passo.avancarQuandoSair)) {
        seguinte();
        return;
      }
      const encontrado = passo.alvo ? (document.querySelector(passo.alvo) as HTMLElement | null) : null;
      // Um elemento vazio (sem tamanho) não serve de destaque.
      const el = encontrado && encontrado.getBoundingClientRect().height > 0 ? encontrado : null;
      if (el) {
        if (primeiro) {
          const r = el.getBoundingClientRect();
          if (r.top < 70 || r.bottom > window.innerHeight - 20) el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? "start" : "center" });
          primeiro = false;
        }
        setRect(el.getBoundingClientRect());
        setNaoEncontrado(false);
      } else {
        setRect(null);
        if (passo.alvo && Date.now() - inicio > 4000) setNaoEncontrado(true);
      }
    };
    medir();
    const t = window.setInterval(medir, 150);
    return () => window.clearInterval(t);
  }, [passo, seguinte]);

  // Clicar no destaque avança (depois de o clique fazer o que tem a fazer).
  useEffect(() => {
    if (!passo?.avancarAoClicar || !passo.alvo) return;
    const alvo = passo.alvo;
    const aoClicar = (e: MouseEvent) => {
      const el = document.querySelector(alvo);
      if (el && e.target instanceof Node && el.contains(e.target)) window.setTimeout(seguinte, 250);
    };
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, [passo, seguinte]);

  useLayoutEffect(() => {
    if (cartao.current) setAlturaCartao(cartao.current.offsetHeight);
  });

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && e.shiftKey) mudar(null);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [mudar]);

  if (!tutorial || !passo || !estado) return null;

  async function copiar(texto: string, rotulo: string) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const t = document.createElement("textarea");
      t.value = texto;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopiado(rotulo);
  }

  // Onde pôr o cartão: por baixo do destaque, senão por cima, senão ao lado; se o destaque ocupa o
  // ecrã quase todo, no canto inferior direito.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const largura = Math.min(LARGURA_CARTAO, vw - 2 * MARGEM);
  let pos: { top: number; left: number };
  // Destaque grande (um formulário inteiro): cartão no canto de cima, longe dos botões do fim.
  if (rect && rect.height > vh * 0.55) pos = { top: 70, left: vw - largura - 16 };
  else if (!rect) pos = { top: vh - alturaCartao - 16, left: vw - largura - 16 };
  else if (rect.bottom + MARGEM + alturaCartao + 12 < vh) pos = { top: rect.bottom + MARGEM + 6, left: rect.left };
  else if (rect.top - MARGEM - alturaCartao - 12 > 60) pos = { top: rect.top - MARGEM - alturaCartao - 6, left: rect.left };
  else if (rect.right + MARGEM + largura + 12 < vw) pos = { top: Math.max(70, Math.min(rect.top, vh - alturaCartao - 12)), left: rect.right + MARGEM + 8 };
  else if (rect.left - MARGEM - largura - 12 > 0) pos = { top: Math.max(70, Math.min(rect.top, vh - alturaCartao - 12)), left: rect.left - MARGEM - largura - 8 };
  else pos = { top: vh - alturaCartao - 16, left: vw - largura - 16 };
  pos.left = Math.max(MARGEM, Math.min(pos.left, vw - largura - MARGEM));
  pos.top = Math.max(MARGEM, pos.top);

  const ultimo = estado.i === tutorial.passos.length - 1;

  if (minimizado)
    return createPortal(
      <button
        type="button"
        onClick={() => setMinimizado(false)}
        className="fixed bottom-4 right-4 z-[9999] inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-xl hover:bg-amber-600"
      >
        <GraduationCap className="h-4 w-4" /> Tutorial {estado.i + 1}/{tutorial.passos.length} — mostrar
      </button>,
      document.body,
    );

  return createPortal(
    <>
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[9998] rounded-xl ring-2 ring-amber-400 transition-all duration-200"
          style={{
            top: rect.top - MARGEM,
            left: rect.left - MARGEM,
            width: rect.width + 2 * MARGEM,
            height: rect.height + 2 * MARGEM,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.62)",
          }}
        />
      )}
      <div
        ref={cartao}
        role="dialog"
        aria-label="Tutorial"
        className="fixed z-[9999] max-h-[80vh] overflow-y-auto rounded-2xl border border-amber-300 bg-white p-4 shadow-2xl"
        style={{ top: pos.top, left: pos.left, width: largura }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
            <GraduationCap className="h-3.5 w-3.5" /> Tutorial · {tutorial.titulo.replace(/ —.*/, "")} · {estado.i + 1}/{tutorial.passos.length}
          </span>
          <span className="flex items-center">
            <button type="button" onClick={() => setMinimizado(true)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Minimizar (o ecrã fica livre)">
              <Minus className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => mudar(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Sair do tutorial">
              <X className="h-4 w-4" />
            </button>
          </span>
        </div>
        <h3 className="mt-1 text-sm font-bold text-slate-900">{passo.titulo}</h3>
        <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-700">{passo.texto}</p>
        {passo.resultado && (
          <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-900">
            <strong>Resultado esperado:</strong> {passo.resultado}
          </p>
        )}
        {passo.fala && <p className="mt-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11px] italic text-sky-900">“{passo.fala}”</p>}
        {passo.copiar?.map((c) => (
          <div key={c.rotulo} className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{c.rotulo}</span>
              <button
                type="button"
                onClick={() => copiar(c.texto, c.rotulo)}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                {copiado === c.rotulo ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                {copiado === c.rotulo ? "Copiado" : "Copiar"}
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-700">{c.texto}</p>
          </div>
        ))}
        {passo.acao && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_ACAO_TUTORIAL, { detail: passo.acao!.nome }))}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100"
          >
            <Wand2 className="h-3.5 w-3.5" /> {passo.acao.rotulo}
          </button>
        )}
        {naoEncontrado && <p className="mt-2 text-[11px] text-slate-400">(Este elemento não está no ecrã agora — pode avançar.)</p>}
        {(passo.avancarAoClicar || passo.avancarQuando || passo.avancarQuandoSair) && (
          <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-amber-800">
            <MousePointerClick className="h-3.5 w-3.5" /> Avança sozinho quando o fizer.
          </p>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
          <button
            type="button"
            disabled={estado.i === 0}
            onClick={() => mudar({ ...estado, i: estado.i - 1 })}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-30"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Anterior
          </button>
          <button
            type="button"
            onClick={() => (ultimo ? mudar(null) : seguinte())}
            className="inline-flex items-center gap-1 rounded-lg bg-oasis-header px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
          >
            {ultimo ? "Terminar" : "Seguinte"} {!ultimo && <ArrowRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
