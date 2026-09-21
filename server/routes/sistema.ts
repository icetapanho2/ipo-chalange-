import { Router } from "express";
import type { store as StoreType } from "../store.ts";

export function criarRotasSistema(store: typeof StoreType) {
  const router = Router();

  router.get("/utilizadores", (_req, res) => {
    res.json(store.utilizadores);
  });

  router.get("/catalogo", (_req, res) => {
    res.json({
      especialidades: store.especialidades,
      catalogoAtos: store.catalogoAtos,
      exames: store.exames,
      analises: store.analises,
    });
  });

  router.get("/estado", (_req, res) => {
    res.json({
      demoDate: store.parametros.DEMO_DATE,
      contagens: {
        doentes: store.doentes.length,
        pedidos: store.pedidos.length,
        eventos: store.eventos.length,
        dependencias: store.dependencias.length,
        alertas: store.alertas.length,
      },
    });
  });

  router.post("/repor-demo", (_req, res) => {
    store.carregar();
    res.json({ ok: true, recarregadoEm: new Date().toISOString() });
  });

  return router;
}
