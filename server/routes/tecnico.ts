import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { reportarAvaria } from "../motor/avarias.ts";
import { descreverEspecialidade, descreverAto } from "../apresentacao.ts";
import type { Avaria } from "../types.ts";

export function criarRotasTecnico(store: typeof StoreType) {
  const router = Router();

  function avariaResumo(a: Avaria) {
    return {
      avaria_id: a.avaria_id,
      especialidade_codigo: a.especialidade_codigo,
      especialidade_legivel: descreverEspecialidade(a.especialidade_codigo),
      ato_codigo: a.ato_codigo,
      ato_legivel: a.ato_codigo ? descreverAto(a.especialidade_codigo, a.ato_codigo) : "Todo o serviço",
      descricao: a.descricao,
      duracao_dias: a.duracao_dias,
      data_inicio: a.data_inicio,
      criado_em: a.criado_em,
      estado: a.estado,
      decisao: a.decisao,
      pedidos_afetados: a.pedidos_afetados,
    };
  }

  // Especialidades e catálogo de actos, para o formulário de reporte escolher o que ficou indisponível.
  router.get("/catalogo", (_req, res) => {
    res.json({ especialidades: store.especialidades, catalogoAtos: store.catalogoAtos });
  });

  router.get("/avarias", (req, res) => {
    const minhas = store.avarias
      .filter((a) => a.reportado_por === req.utilizadorId)
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .map(avariaResumo);
    res.json(minhas);
  });

  router.post("/avarias", (req, res) => {
    const especialidadeCodigo: string = req.body?.especialidade_codigo ?? "";
    const atoCodigo: string = req.body?.ato_codigo ?? "";
    const descricao: string = req.body?.descricao ?? "";
    const duracaoDias = Number(req.body?.duracao_dias ?? 0);
    const dataInicio: string = req.body?.data_inicio ?? "";

    if (!especialidadeCodigo || !store.especialidades.some((e) => e.codigo === especialidadeCodigo)) {
      res.status(400).json({ erro: "Escolha um serviço válido." });
      return;
    }
    if (!descricao.trim()) {
      res.status(400).json({ erro: "Descreva a avaria." });
      return;
    }
    if (dataInicio && !/^\d{4}-\d{2}-\d{2}$/.test(dataInicio)) {
      res.status(400).json({ erro: "Data de início inválida (aaaa-mm-dd)." });
      return;
    }
    if (!Number.isFinite(duracaoDias) || duracaoDias <= 0) {
      res.status(400).json({ erro: "Indique a duração estimada, em dias." });
      return;
    }

    const avaria = reportarAvaria(
      { especialidadeCodigo, atoCodigo: atoCodigo || undefined, descricao: descricao.trim(), duracaoDias, dataInicio: dataInicio || undefined },
      req.utilizadorId,
      agora(),
    );
    res.json({ ok: true, avaria: avariaResumo(avaria) });
  });

  return router;
}
