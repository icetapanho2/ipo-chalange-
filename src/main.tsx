import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PerfilProvider } from "./lib/PerfilContext";
import "./index.css";

async function iniciar() {
  // Site estático (npm run build:estatico): o servidor corre dentro da página, antes da App arrancar.
  if (import.meta.env.MODE === "navegador") await import("./navegador/instalar");
  const { App } = await import("./App");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <PerfilProvider>
        <App />
      </PerfilProvider>
    </StrictMode>,
  );
}
iniciar();
