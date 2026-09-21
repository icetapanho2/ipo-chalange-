import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { store } from "./store.ts";
import { criarRotasSistema } from "./routes/sistema.ts";
import { criarRotasOasis } from "./routes/oasis.ts";
import { criarRotasValidacao } from "./routes/validacao.ts";
import { criarRotasDicionario } from "./routes/dicionario.ts";
import { criarRotasTriagem } from "./routes/triagem.ts";
import { criarRotasMeusPedidos } from "./routes/meusPedidos.ts";
import { criarRotasServico } from "./routes/servico.ts";
import { criarRotasDoente } from "./routes/doente.ts";
import { criarRotasGestao } from "./routes/gestao.ts";
import { recalcularAlertas } from "./motor/alertas.ts";
import { agora } from "./clock.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Os alertas são recalculados no arranque e depois de cada acção (secção 12 da especificação).
recalcularAlertas(agora());

app.use(express.json());

// Perfil activo enviado pelo frontend (sem autenticação, cf. CLAUDE.md).
app.use((req, _res, next) => {
  req.utilizadorId = (req.header("x-utilizador-id") as string) || "";
  next();
});

app.use("/api", criarRotasSistema(store));
app.use("/api/oasis", criarRotasOasis(store));
app.use("/api/validacao", criarRotasValidacao(store));
app.use("/api/dicionario", criarRotasDicionario(store));
app.use("/api/triagem", criarRotasTriagem(store));
app.use("/api/meus-pedidos", criarRotasMeusPedidos(store));
app.use("/api/servico", criarRotasServico(store));
app.use("/api/doente", criarRotasDoente(store));
app.use("/api/gestao", criarRotasGestao(store));

if (process.env.NODE_ENV === "production") {
  const distDir = path.join(__dirname, "..", "dist");
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`Servidor a correr em http://localhost:${PORT}`);
});
