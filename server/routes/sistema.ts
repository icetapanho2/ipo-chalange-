import { Router } from "express";
import { gerarPropostasFaltasPendentes } from "../motor/propostasRemarcacao.ts";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { isoDataHora } from "../util.ts";
import { recalcularAlertas } from "../motor/alertas.ts";

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
    const contarEstado = (...estados: string[]) =>
      store.pedidos.filter((p) => (estados as string[]).includes(p.estado)).length;

    res.json({
      demoDate: store.parametros.DEMO_DATE,
      contagens: {
        doentes: store.doentes.length,
        pedidos: store.pedidos.length,
        eventos: store.eventos.length,
        dependencias: store.dependencias.length,
        alertas: store.alertas.length,
        // Faixa "Estado Geral dos Pedidos em Circulação" do Início — por estado do pedido.
        pedidos_total: store.pedidos.length,
        pedidos_em_triagem: contarEstado("EM_TRIAGEM"),
        pedidos_aceites: contarEstado("ACEITE"),
        pedidos_marcados: contarEstado("MARCADO"),
        pedidos_sem_vaga: contarEstado("SEM_VAGA"),
        pedidos_devolvidos: contarEstado("DEVOLVIDO"),
      },
    });
  });

  router.post("/repor-demo", (_req, res) => {
    store.carregar();
    recalcularAlertas(agora());
    gerarPropostasFaltasPendentes(agora());
    res.json({ ok: true, recarregadoEm: isoDataHora(agora()) });
  });

  return router;
}
