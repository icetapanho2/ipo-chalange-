import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PerfilProvider } from "./lib/PerfilContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PerfilProvider>
      <App />
    </PerfilProvider>
  </StrictMode>,
);
