import { store } from "../store.ts";
import { agora } from "../clock.ts";
import { isoDataHora, parseIso, somarDias } from "../util.ts";
import { adiarConsulta } from "./fluxo.ts";
import { agendar } from "./agendamento.ts";
import { recalcularAlertas } from "./alertas.ts";
import { notificar, utilizadoresPorPerfil } from "./notificacoes.ts";
import { descreverEspecialidade, descreverDoente, descreverAto } from "../apresentacao.ts";
import type { Avaria } from "../types.ts";

/** Um técnico reporta uma avaria: notifica de imediato a administração do serviço afectado (secção N2). */
export function reportarAvaria(
  opts: { especialidadeCodigo: string; atoCodigo?: string; descricao: string; duracaoDias: number },
  utilizadorId: string,
  quando: Date = agora(),
): Avaria {
  const avaria: Avaria = {
    avaria_id: store.proximoId("avaria"),
    especialidade_codigo: opts.especialidadeCodigo,
    ato_codigo: opts.atoCodigo ?? "",
    descricao: opts.descricao,
    duracao_dias: opts.duracaoDias,
    reportado_por: utilizadorId,
    criado_em: isoDataHora(quando),
    estado: "ABERTA",
    decisao: "",
    resolvido_por: "",
    resolvido_em: "",
    pedidos_afetados: 0,
  };
  store.avarias.push(avaria);

  const alvo = opts.atoCodigo ? `${descreverAto(opts.especialidadeCodigo, opts.atoCodigo)}` : "todo o serviço";
  notificar({
    tipo: "AVARIA_SERVICO",
    destinatarios: utilizadoresPorPerfil("ADMINISTRATIVO", opts.especialidadeCodigo),
    titulo: `Avaria em ${descreverEspecialidade(opts.especialidadeCodigo)}`,
    mensagem: `${alvo} indisponível ~${opts.duracaoDias} dia(s): ${opts.descricao}`,
    quando,
  });

  return avaria;
}

/**
 * A administração decide como resolver: bloqueia as vagas afectadas (já reflectido em
 * agendamento.ts via vagaBloqueadaPorAvaria) e reagenda quem já estava marcado nessa janela,
 * respeitando de novo o prazo clínico. Notifica o médico de cada pedido que teve de ser mexido.
 */
export function resolverAvaria(
  avariaId: string,
  decisao: "REMARCACAO_TOTAL" | "REMARCACAO_PARCIAL",
  utilizadorId: string,
  quando: Date = agora(),
): Avaria | null {
  const avaria = store.avarias.find((a) => a.avaria_id === avariaId);
  if (!avaria || avaria.estado !== "ABERTA") return null;

  avaria.estado = "RESOLVIDA";
  avaria.decisao = decisao;
  avaria.resolvido_por = utilizadorId;
  avaria.resolvido_em = isoDataHora(quando);

  const inicioJanela = parseIso(avaria.criado_em);
  const fimJanela = somarDias(inicioJanela, avaria.duracao_dias);
  const atoRestrito = decisao === "REMARCACAO_PARCIAL" ? avaria.ato_codigo : "";

  const afetados = store.atosMedicos.filter((ato) => {
    if (ato.estado !== "MARCADA") return false;
    if (ato.especialidade_codigo !== avaria.especialidade_codigo) return false;
    if (atoRestrito && ato.ato_codigo !== atoRestrito) return false;
    const dh = parseIso(ato.data_hora);
    return dh.getTime() >= inicioJanela.getTime() && dh.getTime() <= fimJanela.getTime();
  });

  let nAfetados = 0;
  for (const ato of afetados) {
    const pedido = store.pedidos.find((p) => p.pedido_id === ato.mvp_pedido_id);
    if (!pedido) continue;
    nAfetados += 1;
    adiarConsulta(pedido, utilizadorId, quando);
    // adiarConsulta já chama agendar(); se continuar sem vaga (ex.: avaria prolongada), o
    // próprio pedido fica SEM_VAGA — o médico é avisado de qual dos dois desfechos ocorreu.
    const remarcado = pedido.estado === "MARCADO";
    notificar({
      tipo: remarcado ? "PEDIDO_MARCADO" : "PEDIDO_SEM_VAGA",
      destinatarios: [pedido.medico_requisitante_id],
      titulo: remarcado
        ? `Consulta reagendada por avaria: ${descreverEspecialidade(pedido.especialidade_destino)}`
        : `Sem vaga alternativa após avaria: ${descreverEspecialidade(pedido.especialidade_destino)}`,
      mensagem: remarcado
        ? `${descreverDoente(pedido.doente_id)} · a marcação anterior foi cancelada por avaria (${avaria.descricao}) e reagendada automaticamente.`
        : `${descreverDoente(pedido.doente_id)} · a marcação anterior foi cancelada por avaria (${avaria.descricao}) e não foi possível reagendar dentro do prazo. Requer vaga extra ou revisão do serviço.`,
      pedidoId: pedido.pedido_id,
      doenteId: pedido.doente_id,
      consultaAtoId: pedido.consulta_origem_ato_id,
      quando,
    });
  }

  // Também tenta agendar quem estava à espera (ACEITE/SEM_VAGA) para esta especialidade/acto,
  // caso a resolução tenha libertado outras vagas entretanto (ex.: parcial só bloqueava um acto).
  const pendentes = store.pedidos.filter(
    (p) =>
      (p.estado === "ACEITE" || p.estado === "SEM_VAGA") &&
      p.especialidade_destino === avaria.especialidade_codigo &&
      (!atoRestrito || p.ato_codigo === atoRestrito),
  );
  for (const pedido of pendentes) agendar(pedido, quando);

  avaria.pedidos_afetados = nAfetados;

  notificar({
    tipo: "AVARIA_RESOLVIDA",
    destinatarios: [avaria.reportado_por],
    titulo: `Avaria resolvida: ${descreverEspecialidade(avaria.especialidade_codigo)}`,
    mensagem: `A administração aplicou ${
      decisao === "REMARCACAO_TOTAL" ? "remarcação total do serviço" : "remarcação parcial"
    } (${nAfetados} marcação(ões) afectada(s)). A sua avaria reportada foi seguida.`,
    quando,
  });

  recalcularAlertas(quando);
  return avaria;
}

