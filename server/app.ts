import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { store } from "./store.ts";
import { criarRotasSistema } from "./routes/sistema.ts";
import { criarRotasOasis } from "./routes/oasis.ts";
import { criarRotasTriagem } from "./routes/triagem.ts";
import { criarRotasMeusPedidos } from "./routes/meusPedidos.ts";
import { criarRotasServico } from "./routes/servico.ts";
import { criarRotasDoente } from "./routes/doente.ts";
import { criarRotasGestao } from "./routes/gestao.ts";
import { criarRotasNotificacoes } from "./routes/notificacoes.ts";
import { criarRotasTecnico } from "./routes/tecnico.ts";
import { criarRotasPrioridades } from "./routes/prioridades.ts";
import { prepararEstadoInicial } from "./motor/arranque.ts";
import { agora } from "./clock.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Versão dos dados: sobe a cada acção (POST/PUT/DELETE) na API. O frontend pergunta por ela a cada
 * segundo e meio e recarrega o que está no ecrã quando muda — a triagem, a ficha e as listas
 * actualizam-se sozinhas, sem recarregar a página (mesmo com várias janelas abertas).
 */
let versaoDados = 0;
/** Identifica esta instância do servidor: se o frontend vir outra, o estado em memória não é o mesmo. */
const INSTANCIA = Math.random().toString(36).slice(2, 10);

/** Constrói a app Express (sem escutar em nenhuma porta) — usado pelo servidor e pelos testes. */
export function criarApp() {
  const app = express();

  app.use(express.json());

  // Perfil activo enviado pelo frontend (sem autenticação, cf. CLAUDE.md).
  app.use((req, _res, next) => {
    req.utilizadorId = (req.header("x-utilizador-id") as string) || "";
    next();
  });

  app.use("/api", (req, res, next) => {
    if (req.method !== "GET") versaoDados += 1;
    res.setHeader("X-Versao-Dados", `${INSTANCIA}:${versaoDados}`);
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/api/versao", (_req, res) => res.json({ versao: versaoDados, instancia: INSTANCIA }));

  app.use("/api", criarRotasSistema(store));
  app.use("/api/oasis", criarRotasOasis(store));
  app.use("/api/triagem", criarRotasTriagem(store));
  app.use("/api/meus-pedidos", criarRotasMeusPedidos(store));
  app.use("/api/servico", criarRotasServico(store));
  app.use("/api/doente", criarRotasDoente(store));
  app.use("/api/gestao", criarRotasGestao(store));
  app.use("/api/notificacoes", criarRotasNotificacoes(store));
  app.use("/api/tecnico", criarRotasTecnico(store));
  app.use("/api/prioridades", criarRotasPrioridades(store));

  if (process.env.NODE_ENV === "production") {
    const distDir = path.join(__dirname, "..", "dist");
    app.use(express.static(distDir));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  return app;
}

// Os alertas são recalculados no arranque e depois de cada acção (secção 12 da especificação).
prepararEstadoInicial(agora());
