// Modo navegador (site estático, ex.: Vercel): o servidor corre dentro da página. As mesmas rotas e o
// mesmo motor do server/ respondem aos pedidos a /api/…, sem rede; os dados vêm embutidos no site.
// Cada pessoa que abre o site tem a sua demo; recarregar a página (ou "Repor demo") volta ao início.
import { store } from "../../server/store.ts";
import { agora } from "../../server/clock.ts";
import { prepararEstadoInicial } from "../../server/motor/arranque.ts";
import { criarRotasSistema } from "../../server/routes/sistema.ts";
import { criarRotasOasis } from "../../server/routes/oasis.ts";
import { criarRotasTriagem } from "../../server/routes/triagem.ts";
import { criarRotasMeusPedidos } from "../../server/routes/meusPedidos.ts";
import { criarRotasServico } from "../../server/routes/servico.ts";
import { criarRotasDoente } from "../../server/routes/doente.ts";
import { criarRotasGestao } from "../../server/routes/gestao.ts";
import { criarRotasNotificacoes } from "../../server/routes/notificacoes.ts";
import { criarRotasTecnico } from "../../server/routes/tecnico.ts";
import { criarRotasPrioridades } from "../../server/routes/prioridades.ts";
import { RespostaFalsa, type PedidoFalso, type RouterFalso } from "./shims/express.ts";

prepararEstadoInicial(agora());

// A mesma ordem de server/app.ts.
const montagens: [string, RouterFalso][] = [
  ["/api", criarRotasSistema(store) as unknown as RouterFalso],
  ["/api/oasis", criarRotasOasis(store) as unknown as RouterFalso],
  ["/api/triagem", criarRotasTriagem(store) as unknown as RouterFalso],
  ["/api/meus-pedidos", criarRotasMeusPedidos(store) as unknown as RouterFalso],
  ["/api/servico", criarRotasServico(store) as unknown as RouterFalso],
  ["/api/doente", criarRotasDoente(store) as unknown as RouterFalso],
  ["/api/gestao", criarRotasGestao(store) as unknown as RouterFalso],
  ["/api/notificacoes", criarRotasNotificacoes(store) as unknown as RouterFalso],
  ["/api/tecnico", criarRotasTecnico(store) as unknown as RouterFalso],
  ["/api/prioridades", criarRotasPrioridades(store) as unknown as RouterFalso],
];

let versaoDados = 0;
const INSTANCIA = "navegador";

async function responder(metodo: string, url: URL, corpoTexto: string, cabecalhos: Headers): Promise<Response> {
  if (metodo !== "GET") versaoDados += 1;
  const headers = { "Content-Type": "application/json", "X-Versao-Dados": `${INSTANCIA}:${versaoDados}` };
  if (url.pathname === "/api/versao") return new Response(JSON.stringify({ versao: versaoDados, instancia: INSTANCIA }), { headers });
  let body: unknown = {};
  try {
    body = corpoTexto ? JSON.parse(corpoTexto) : {};
  } catch {
    body = {};
  }
  const req: PedidoFalso = {
    method: metodo,
    path: "",
    params: {},
    query: Object.fromEntries(url.searchParams.entries()),
    body,
    utilizadorId: cabecalhos.get("x-utilizador-id") ?? "",
    header: (n) => cabecalhos.get(n) ?? undefined,
  };
  const res = new RespostaFalsa();
  try {
    for (const [prefixo, router] of montagens) {
      if (url.pathname !== prefixo && !url.pathname.startsWith(`${prefixo}/`)) continue;
      req.path = url.pathname.slice(prefixo.length) || "/";
      if (await router.tratar(req, res)) {
        return new Response(res.corpo === undefined ? null : JSON.stringify(res.corpo), { status: res.statusCode, headers });
      }
    }
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ erro: e instanceof Error ? e.message : String(e) }), { status: 500, headers });
  }
  return new Response(JSON.stringify({ erro: `Rota não encontrada: ${metodo} ${url.pathname}` }), { status: 404, headers });
}

const fetchOriginal = window.fetch.bind(window);
window.fetch = async (entrada: RequestInfo | URL, opcoes: RequestInit = {}) => {
  const pedido = entrada instanceof Request ? entrada : null;
  const url = new URL(pedido ? pedido.url : String(entrada), window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return fetchOriginal(entrada, opcoes);
  const metodo = (opcoes.method ?? pedido?.method ?? "GET").toUpperCase();
  const cabecalhos = new Headers(opcoes.headers ?? pedido?.headers);
  const corpo = typeof opcoes.body === "string" ? opcoes.body : pedido ? await pedido.text() : "";
  return responder(metodo, url, corpo, cabecalhos);
};
