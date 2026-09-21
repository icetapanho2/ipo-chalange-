import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { store } from "./store.ts";
import { criarRotasSistema } from "./routes/sistema.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());

// Perfil activo enviado pelo frontend (sem autenticação, cf. CLAUDE.md).
app.use((req, _res, next) => {
  req.utilizadorId = (req.header("x-utilizador-id") as string) || "";
  next();
});

app.use("/api", criarRotasSistema(store));

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
