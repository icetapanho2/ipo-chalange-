import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { descreverUtilizador } from "../apresentacao.ts";

export function criarRotasDicionario(store: typeof StoreType) {
  const router = Router();

  router.get("/", (_req, res) => {
    const entradas = store.dicionario.map((d) => ({
      termo: d.termo,
      significado: d.significado,
      mapeia_para: d.mapeia_para,
      ambito: d.ambito,
      ambito_legivel: d.ambito === "GLOBAL" ? "Global" : descreverUtilizador(d.ambito),
      origem: d.origem,
      ocorrencias: d.ocorrencias,
      estado: d.estado,
      aprendido: d.origem === "CORRECAO",
    }));
    entradas.sort((a, b) => a.termo.localeCompare(b.termo, "pt"));
    res.json(entradas);
  });

  return router;
}
