// Um "Express" mínimo para correr as rotas do servidor dentro da página (site estático): só o que as
// rotas usam — Router().get/post/put, req.params/query/body/utilizadorId, res.status/json/setHeader.
type Handler = (req: PedidoFalso, res: RespostaFalsa, next?: () => void) => unknown;

export interface PedidoFalso {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  utilizadorId: string;
  header: (nome: string) => string | undefined;
}

export class RespostaFalsa {
  statusCode = 200;
  corpo: unknown = undefined;
  headers: Record<string, string> = {};
  terminada = false;
  status(n: number) {
    this.statusCode = n;
    return this;
  }
  json(corpo: unknown) {
    this.corpo = corpo;
    this.terminada = true;
    return this;
  }
  send(corpo?: unknown) {
    return this.json(corpo);
  }
  end() {
    this.terminada = true;
    return this;
  }
  setHeader(nome: string, valor: string) {
    this.headers[nome] = valor;
  }
}

interface Rota {
  metodo: string;
  padrao: RegExp;
  nomes: string[];
  handler: Handler;
}

function compilar(caminho: string): { padrao: RegExp; nomes: string[] } {
  const nomes: string[] = [];
  const re = caminho.replace(/\/:([A-Za-z_]\w*)/g, (_m, n) => {
    nomes.push(n);
    return "/([^/]+)";
  });
  return { padrao: new RegExp(`^${re}/?$`), nomes };
}

export interface RouterFalso {
  rotas: Rota[];
  get: (c: string, h: Handler) => void;
  post: (c: string, h: Handler) => void;
  put: (c: string, h: Handler) => void;
  delete: (c: string, h: Handler) => void;
  /** Procura e corre a rota; devolve false se nenhuma serve. */
  tratar: (req: PedidoFalso, res: RespostaFalsa) => Promise<boolean>;
}

export function Router(): RouterFalso {
  const rotas: Rota[] = [];
  const add = (metodo: string) => (c: string, h: Handler) => {
    const { padrao, nomes } = compilar(c);
    rotas.push({ metodo, padrao, nomes, handler: h });
  };
  return {
    rotas,
    get: add("GET"),
    post: add("POST"),
    put: add("PUT"),
    delete: add("DELETE"),
    async tratar(req, res) {
      for (const r of rotas) {
        if (r.metodo !== req.method) continue;
        const m = req.path.match(r.padrao);
        if (!m) continue;
        req.params = Object.fromEntries(r.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
        await r.handler(req, res, () => undefined);
        return true;
      }
      return false;
    },
  };
}

// O servidor Express completo (server/app.ts) não é usado no browser.
function express(): never {
  throw new Error("express() não existe no site estático");
}
express.json = () => () => undefined;
express.static = () => () => undefined;
export default express;
