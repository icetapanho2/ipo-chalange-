import { Router } from "express";
import type { store as StoreType } from "../store.ts";
import { agora } from "../clock.ts";
import { apenasData, parseIso } from "../util.ts";
import { adiarConsulta, remarcarPedido } from "../motor/fluxo.ts";
import { avaliarDependenciasDetalhado, calcularSemaforo } from "../motor/semaforo.ts";
import { idadeDoente, remarcacoesHospital } from "../motor/remarcacao.ts";
import {
  descreverEspecialidade,
  descreverEstado,
  descreverPedido,
  descreverUtilizador,
  pedidoParaJson,
} from "../apresentacao.ts";
import type { Pedido, Doente } from "../types.ts";

export function criarRotasDoente(store: typeof StoreType) {
  const router = Router();

  // Listar todos os doentes para seleção e gestão
  router.get("/", (_req, res) => {
    const lista = store.doentes.map((d) => {
      const pedidosDoente = store.pedidos.filter((p) => p.doente_id === d.doente_id);
      const alertasDoente = store.alertas.filter((a) => a.doente_id === d.doente_id && a.estado === "ABERTO");
      return {
        ...d,
        total_pedidos: pedidosDoente.length,
        total_alertas: alertasDoente.length,
        pedidos_em_curso: pedidosDoente.filter((p) => p.estado !== "REALIZADO" && p.estado !== "FALTOU").length,
      };
    });
    res.json(lista);
  });

  // Criar novo perfil de doente
  router.post("/", (req, res) => {
    const {
      nome,
      n_utente,
      sexo = "M",
      data_nascimento = "1975-01-01",
      diagnostico_principal = "",
      estadiamento = "",
      alergias = [],
      contacto = "",
      notas_clinicas = "",
      estadio_cuidado = "NOVO",
    } = req.body ?? {};

    if (!nome || !nome.trim()) {
      res.status(400).json({ erro: "Nome do paciente é obrigatório." });
      return;
    }

    const proximoNumero = store.doentes.length + 1;
    const doente_id = `100${String(100 + proximoNumero)}`;
    const novoDoente: Doente = {
      doente_id,
      n_utente: n_utente ? String(n_utente).trim() : `999${String(100000 + proximoNumero)}`,
      nome: nome.trim(),
      sexo: String(sexo).toUpperCase(),
      data_nascimento,
      demo_cenario: "NOVO_PACIENTE",
      diagnostico_principal: diagnostico_principal || "Sem diagnóstico preliminar",
      estadiamento,
      alergias: Array.isArray(alergias)
        ? alergias
        : typeof alergias === "string"
        ? alergias.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [],
      contacto: contacto ? String(contacto).trim() : "910 000 000",
      notas_clinicas,
      estadio_cuidado,
    };

    store.doentes.push(novoDoente);
    res.json({ ok: true, doente: novoDoente });
  });

  // Atualizar / completar perfil de doente existente
  router.put("/:id", (req, res) => {
    const doente = store.doentes.find((d) => d.doente_id === req.params.id);
    if (!doente) {
      res.status(404).json({ erro: "Doente não encontrado." });
      return;
    }

    const {
      nome,
      n_utente,
      sexo,
      data_nascimento,
      diagnostico_principal,
      estadiamento,
      alergias,
      contacto,
      notas_clinicas,
      estadio_cuidado,
      concelho,
      distancia_km,
      contacto_digital,
      aceita_antecipacao,
      transporte_nao_urgente,
    } = req.body ?? {};

    if (nome) doente.nome = String(nome).trim();
    if (n_utente) doente.n_utente = String(n_utente).trim();
    if (sexo) doente.sexo = String(sexo).toUpperCase();
    if (data_nascimento) doente.data_nascimento = data_nascimento;
    if (diagnostico_principal !== undefined) doente.diagnostico_principal = diagnostico_principal;
    if (estadiamento !== undefined) doente.estadiamento = estadiamento;
    if (alergias !== undefined) {
      doente.alergias = Array.isArray(alergias)
        ? alergias
        : typeof alergias === "string"
        ? alergias.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
    }
    if (contacto !== undefined) doente.contacto = String(contacto).trim();
    if (notas_clinicas !== undefined) doente.notas_clinicas = notas_clinicas;
    if (estadio_cuidado !== undefined) doente.estadio_cuidado = estadio_cuidado;
    if (concelho !== undefined) doente.concelho = String(concelho).trim();
    if (distancia_km !== undefined && !Number.isNaN(Number(distancia_km))) doente.distancia_km = Number(distancia_km);
    if (["SMS", "EMAIL", "NENHUM"].includes(contacto_digital)) doente.contacto_digital = contacto_digital;
    if (aceita_antecipacao !== undefined) doente.aceita_antecipacao = !!aceita_antecipacao;
    if (transporte_nao_urgente !== undefined) doente.transporte_nao_urgente = !!transporte_nao_urgente;

    res.json({ ok: true, doente });
  });

  router.get("/:id", (req, res) => {
    const doente = store.doentes.find((d) => d.doente_id === req.params.id);
    if (!doente) {
      res.status(404).json({ erro: "Doente não encontrado." });
      return;
    }
    const pedidos = store.pedidos.filter((p) => p.doente_id === doente.doente_id);
    const pedidoIds = new Set(pedidos.map((p) => p.pedido_id));

    const timeline = store.eventos
      .filter((e) => pedidoIds.has(e.pedido_id))
      .map((e) => {
        const pedido = store.pedidos.find((p) => p.pedido_id === e.pedido_id)!;
        return {
          evento_id: e.evento_id,
          pedido_id: e.pedido_id,
          data_hora: e.data_hora,
          tipo: e.tipo,
          pedido_descricao: descreverPedido(pedido),
          especialidade_legivel: descreverEspecialidade(pedido.especialidade_destino),
          quem: descreverUtilizador(e.utilizador_id) || e.utilizador_id,
          motivo: e.motivo,
          detalhe: e.detalhe,
          estado_novo_legivel: e.estado_novo ? descreverEstado(e.estado_novo as Pedido["estado"]) : "",
        };
      })
      .sort((a, b) => b.data_hora.localeCompare(a.data_hora));

    const hoje = apenasData(agora());
    const marcacoesFuturas = pedidos
      .filter((p) => p.estado === "MARCADO")
      .map((pedido) => {
        const semaforo = calcularSemaforo(pedido, hoje, store.parametros.semaforo_horizonte_dias);
        if (!semaforo) return null;
        const ato = store.atosMedicos.find((a) => a.mvp_ato_id === pedido.ato_id)!;
        const dataConsulta = apenasData(parseIso(ato.data_hora));
        const dependencias = avaliarDependenciasDetalhado(pedido, dataConsulta).map(({ requisito, estado }) => ({
          pedido_id: requisito.pedido_id,
          descricao: descreverPedido(requisito),
          estado: requisito.estado,
          estado_legivel: descreverEstado(requisito.estado),
          cor: estado.cor,
          porque: estado.porque,
          pode_remarcar: requisito.estado === "FALTOU",
        }));
        return {
          pedido_id: pedido.pedido_id,
          descricao: descreverPedido(pedido),
          especialidade_legivel: descreverEspecialidade(pedido.especialidade_destino),
          data_hora: ato.data_hora,
          semaforo,
          dependencias,
        };
      })
      .filter((m): m is NonNullable<typeof m> => !!m)
      .sort((a, b) => a.data_hora.localeCompare(b.data_hora));

    const todosPedidos = pedidos.map((p) => pedidoParaJson(p, store.parametros.limiar_confianca));

    const alertas = store.alertas
      .filter((a) => a.doente_id === doente.doente_id && a.estado === "ABERTO")
      .map((a) => ({
        alerta_id: a.alerta_id,
        tipo: a.tipo,
        gravidade: a.gravidade,
        descricao: a.descricao,
        criado_em: a.criado_em,
      }));

    // Análise de prontidão clínica (o que falta)
    const oQueFalta: { nivel: "vermelho" | "amarelo" | "azul"; titulo: string; detalhe: string; pedido_id?: string }[] = [];

    // Faltas ou dependências bloqueadas
    for (const m of marcacoesFuturas) {
      for (const d of m.dependencias) {
        if (d.cor === "vermelho") {
          oQueFalta.push({
            nivel: "vermelho",
            titulo: `Exame/Análise em Falta: ${d.descricao}`,
            detalhe: `${d.porque} Bloqueia a consulta de ${m.descricao} (${m.data_hora.replace("T", " ")}).`,
            pedido_id: d.pedido_id,
          });
        } else if (d.cor === "amarelo") {
          oQueFalta.push({
            nivel: "amarelo",
            titulo: `Aviso de Prazo: ${d.descricao}`,
            detalhe: d.porque,
            pedido_id: d.pedido_id,
          });
        }
      }
    }

    // Pedidos devolvidos à espera de esclarecimento do médico
    const devolvidos = pedidos.filter((p) => p.estado === "DEVOLVIDO");
    for (const dev of devolvidos) {
      oQueFalta.push({
        nivel: "vermelho",
        titulo: `Aguardar Resposta do Médico: ${descreverPedido(dev)}`,
        detalhe: `Dúvida do triador: "${dev.pergunta_triagem || "Informação clínica pendente"}".`,
        pedido_id: dev.pedido_id,
      });
    }

    // Pedidos sem vaga
    const semVaga = pedidos.filter((p) => p.estado === "SEM_VAGA");
    for (const sv of semVaga) {
      oQueFalta.push({
        nivel: "amarelo",
        titulo: `Sem Vaga Disponível: ${descreverPedido(sv)}`,
        detalhe: `Exige encaixe ou proposta de troca de agenda na especialidade ${descreverEspecialidade(sv.especialidade_destino)}.`,
        pedido_id: sv.pedido_id,
      });
    }

    // Pedidos ainda em triagem
    const emTriagem = pedidos.filter((p) => p.estado === "EM_TRIAGEM");
    for (const et of emTriagem) {
      oQueFalta.push({
        nivel: "azul",
        titulo: `Em Triagem Externa: ${descreverPedido(et)}`,
        detalhe: `A aguardar avaliação clínica pelo serviço de ${descreverEspecialidade(et.especialidade_destino)}.`,
        pedido_id: et.pedido_id,
      });
    }

    // Todas as marcações futuras do doente (a "agenda do doente"): o que foi marcado, onde e quando.
    const agenda = store.atosMedicos
      .filter((a) => a.doente_id === doente.doente_id && a.estado === "MARCADA" && parseIso(a.data_hora).getTime() >= hoje.getTime())
      .sort((a, b) => a.data_hora.localeCompare(b.data_hora))
      .map((a) => {
        const pedido = store.pedidos.find((p) => p.pedido_id === a.mvp_pedido_id);
        const marcacao = pedido ? [...store.eventos].reverse().find((e) => e.pedido_id === pedido.pedido_id && e.tipo === "MARCACAO") : undefined;
        return {
          ato_id: a.mvp_ato_id,
          pedido_id: a.mvp_pedido_id,
          data_hora: a.data_hora,
          especialidade_legivel: descreverEspecialidade(a.especialidade_codigo),
          descricao: pedido ? descreverPedido(pedido) : a.ato_descricao,
          local: a.gabinete_descricao,
          medico: descreverUtilizador(a.mvp_medico_id) || "",
          prazo_limite: pedido?.prazo_limite ?? "",
          dentro_do_prazo: pedido ? apenasData(parseIso(a.data_hora)).getTime() <= parseIso(pedido.prazo_limite).getTime() : null,
          motivo_marcacao: marcacao?.motivo ?? "",
        };
      });
    const comunicacoes = store.comunicacoesDoente
      .filter((c) => c.doente_id === doente.doente_id)
      .sort((a, b) => b.enviar_em.localeCompare(a.enviar_em));
    const ofertas = store.ofertasAntecipacao.filter((o) => o.doente_id === doente.doente_id);
    const logistica = {
      idade: idadeDoente(doente, hoje),
      remarcacoes_hospital_90d: remarcacoesHospital(doente.doente_id, agora()),
    };

    res.json({ doente, timeline, marcacoesFuturas, todosPedidos, alertas, oQueFalta, agenda, comunicacoes, ofertas, logistica });
  });

  router.post("/:id/pedidos/:pedidoId/remarcar-exame", (req, res) => {
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.pedidoId && p.doente_id === req.params.id);
    if (!pedido) {
      res.status(404).json({ erro: "Pedido não encontrado." });
      return;
    }
    remarcarPedido(pedido, req.utilizadorId, agora());
    res.json({ ok: true, estado: pedido.estado });
  });

  router.post("/:id/pedidos/:pedidoId/adiar-consulta", (req, res) => {
    const pedido = store.pedidos.find((p) => p.pedido_id === req.params.pedidoId && p.doente_id === req.params.id);
    if (!pedido || pedido.estado !== "MARCADO") {
      res.status(404).json({ erro: "Pedido não encontrado ou não está marcado." });
      return;
    }
    adiarConsulta(pedido, req.utilizadorId, agora());
    res.json({ ok: true, estado: pedido.estado });
  });

  return router;
}
