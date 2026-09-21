import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { isoDataHora } from "../util.ts";
import { extrair } from "../extracao/index.ts";

export function criarRotasOasis(store: typeof StoreType) {
  const router = Router();

  // Agenda de hoje do médico seleccionado (perfil no cabeçalho).
  router.get("/medico/agenda", (req, res) => {
    const medicoId = req.utilizadorId;
    const medico = store.utilizadores.find((u) => u.utilizador_id === medicoId);
    if (!medico || !medico.e_medico) {
      res.status(400).json({ erro: "O perfil seleccionado não é um médico." });
      return;
    }
    const hoje = store.parametros.DEMO_DATE;
    const atos = store.atosMedicos
      .filter((a) => a.mvp_medico_id === medicoId && a.data_hora.startsWith(hoje))
      .sort((a, b) => a.data_hora.localeCompare(b.data_hora))
      .map((ato) => {
        const doente = store.doentes.find((d) => d.doente_id === ato.doente_id);
        const nota = store.notasConsulta.find((n) => n.ato_id === ato.mvp_ato_id);
        return {
          ato_id: ato.mvp_ato_id,
          data_hora: ato.data_hora,
          duracao_min: ato.duracao_min,
          estado: ato.estado,
          ato_descricao: ato.ato_descricao,
          gabinete_descricao: ato.gabinete_descricao,
          doente_id: ato.doente_id,
          doente_nome: doente?.nome ?? ato.doente_id,
          tem_nota: !!nota,
        };
      });
    res.json({ medico, hoje, atos });
  });

  // Detalhe de uma consulta (para abrir o ecrã SOAP).
  router.get("/consulta/:atoId", (req, res) => {
    const ato = store.atosMedicos.find((a) => a.mvp_ato_id === req.params.atoId);
    if (!ato) {
      res.status(404).json({ erro: "Consulta não encontrada." });
      return;
    }
    const doente = store.doentes.find((d) => d.doente_id === ato.doente_id);
    const nota = store.notasConsulta.find((n) => n.ato_id === ato.mvp_ato_id) ?? null;
    res.json({ ato, doente, nota });
  });

  // Guardar a nota SOAP e chamar o agente de extracção sobre o campo P.
  router.post("/consulta/:atoId/guardar", async (req, res) => {
    const ato = store.atosMedicos.find((a) => a.mvp_ato_id === req.params.atoId);
    if (!ato) {
      res.status(404).json({ erro: "Consulta não encontrada." });
      return;
    }
    const { s = "", o = "", a = "", p = "" } = req.body ?? {};
    const quando = agora();
    const medicoId = ato.mvp_medico_id;

    const notaExistente = store.notasConsulta.find((n) => n.ato_id === ato.mvp_ato_id);
    if (notaExistente) {
      Object.assign(notaExistente, { s, o, a, p, guardado_em: isoDataHora(quando), guardado_por: medicoId });
    } else {
      store.notasConsulta.push({
        ato_id: ato.mvp_ato_id,
        s,
        o,
        a,
        p,
        guardado_em: isoDataHora(quando),
        guardado_por: medicoId,
      });
    }

    const resultado = p.trim()
      ? await extrair(p, medicoId, ato.doente_id, {
          consultaAtoId: ato.mvp_ato_id,
          especialidadeOrigem: ato.especialidade_codigo,
          soap: { s, o, a },
          quando,
        })
      : { pedidos: [], alertas: [] as string[] };

    res.json({
      ok: true,
      pedidosCriados: resultado.pedidos.length,
      pedidos: resultado.pedidos.map((pedido) => ({ pedido_id: pedido.pedido_id, tipo_pedido: pedido.tipo_pedido })),
      alertas: resultado.alertas,
    });
  });

  // Grelha das agendas dos serviços (vagas livres/ocupadas) para um dia.
  router.get("/agendas", (req, res) => {
    const especialidade = String(req.query.especialidade ?? "");
    const dia = String(req.query.dia ?? store.parametros.DEMO_DATE);
    if (!especialidade) {
      res.status(400).json({ erro: "Falta o parâmetro especialidade." });
      return;
    }
    const vagas = store.vagas
      .filter((v) => v.especialidade_codigo === especialidade && v.data_hora.startsWith(dia))
      .sort((a, b) => a.data_hora.localeCompare(b.data_hora))
      .map((v) => {
        const gabinete = store.gabinetes.find((g) => g.codigo === v.gabinete_codigo);
        const medico = store.utilizadores.find((u) => u.utilizador_id === v.medico_id);
        const ato = v.ato_id ? store.atosMedicos.find((a) => a.mvp_ato_id === v.ato_id) : undefined;
        const doente = ato ? store.doentes.find((d) => d.doente_id === ato.doente_id) : undefined;
        return {
          vaga_id: v.vaga_id,
          data_hora: v.data_hora,
          duracao_min: v.duracao_min,
          gabinete_descricao: gabinete?.descricao ?? v.gabinete_codigo,
          medico_nome: medico?.nome ?? "",
          livre: !v.ato_id,
          doente_nome: doente?.nome,
          ato_descricao: ato?.ato_descricao,
          ato_estado: ato?.estado,
        };
      });
    res.json({ especialidade, dia, vagas });
  });

  router.get("/especialidades", (_req, res) => {
    res.json(store.especialidades);
  });

  return router;
}
