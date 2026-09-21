import { store } from "../store.ts";
import { parseIso, somarDias, diferencaDias } from "../util.ts";
import type { Dependencia, Pedido } from "../types.ts";

/** Data em que um pedido concluiu (a marcação existe no Oasis): usa a data do acto marcado, não o timestamp administrativo. */
export function dataConclusao(pedido: Pedido): Date | null {
  if (!pedido.ato_id) return null;
  if (pedido.estado !== "MARCADO" && pedido.estado !== "REALIZADO" && pedido.estado !== "FALTOU") return null;
  const ato = store.atosMedicos.find((a) => a.mvp_ato_id === pedido.ato_id);
  return ato ? parseIso(ato.data_hora) : null;
}

export function intervaloResultado(especialidadeCodigo: string): number {
  return store.intervalosResultado.find((i) => i.especialidade_codigo === especialidadeCodigo)?.dias_ate_resultado ?? 0;
}

export function criarDependencia(
  dependente: Pedido,
  requisito: Pedido,
  intervaloMinDias: number,
  origem: Dependencia["origem"],
  regraId = "",
  critica = true,
): Dependencia {
  const existente = store.dependencias.find(
    (d) => d.pedido_id === dependente.pedido_id && d.depende_de_pedido_id === requisito.pedido_id,
  );
  if (existente) return existente;
  const nova: Dependencia = {
    dependencia_id: store.proximoId("dependencia"),
    pedido_id: dependente.pedido_id,
    depende_de_pedido_id: requisito.pedido_id,
    intervalo_min_dias: intervaloMinDias,
    critica,
    origem,
    regra_id: regraId,
  };
  store.dependencias.push(nova);
  return nova;
}

export function dependenciasDe(pedido: Pedido): Dependencia[] {
  return store.dependencias.filter((d) => d.pedido_id === pedido.pedido_id);
}

/** true se todas as dependências críticas de `pedido` já têm uma data marcada (pronto para agendar). */
export function dependenciasProntas(pedido: Pedido): boolean {
  return dependenciasDe(pedido)
    .filter((d) => d.critica)
    .every((d) => {
      const requisito = store.pedidos.find((p) => p.pedido_id === d.depende_de_pedido_id);
      return requisito ? dataConclusao(requisito) !== null : true;
    });
}

/**
 * Data mínima em que `pedido` pode ser agendado, por causa das suas dependências.
 * Só deve ser chamada depois de confirmar `dependenciasProntas(pedido)`.
 */
export function dataMinimaPorDependencias(pedido: Pedido): Date | null {
  let minima: Date | null = null;
  for (const dep of dependenciasDe(pedido)) {
    const requisito = store.pedidos.find((p) => p.pedido_id === dep.depende_de_pedido_id);
    const dataReq = requisito ? dataConclusao(requisito) : null;
    if (!dataReq) continue;
    const candidata = somarDias(dataReq, dep.intervalo_min_dias);
    if (!minima || candidata.getTime() > minima.getTime()) minima = candidata;
  }
  return minima;
}

// ---------------------------------------------------------------- R1
/** TC com contraste exige creatinina com menos de `validade_dias`; sem ela, depende da colheita que a inclua. */
export function aplicarR1(pedidoExame: Pedido, pedidosDoPlano: Pedido[], hoje: Date): void {
  if (pedidoExame.tipo_pedido !== "exame" || pedidoExame.especialidade_destino !== "7000_2") return;
  if (!/contraste/i.test(pedidoExame.especificacao)) return;
  const regra = store.regrasDependencia.find((r) => r.regra_id === "R1");
  if (!regra) return;

  const creatininaValida = store.pedidos.some(
    (p) =>
      p.doente_id === pedidoExame.doente_id &&
      p.tipo_pedido === "analises" &&
      p.analises.includes("A003") &&
      p.estado === "REALIZADO" &&
      (() => {
        const dt = dataConclusao(p);
        return dt !== null && diferencaDias(hoje, dt) <= regra.validade_dias;
      })(),
  );
  if (creatininaValida) return;

  const jaTemDependencia = store.dependencias.some((d) => d.pedido_id === pedidoExame.pedido_id && d.regra_id === "R1");
  if (jaTemDependencia) return;

  let colheita = pedidosDoPlano.find(
    (p) => p.pedido_id !== pedidoExame.pedido_id && p.tipo_pedido === "analises" && p.analises.includes("A003"),
  );
  if (!colheita) {
    colheita = criarPedidoAutomatico(pedidoExame, {
      tipo_pedido: "analises",
      especialidade_destino: "6100",
      ato_codigo: "9",
      analises: ["A003"],
      exames: [],
      especificacao: "",
    });
    pedidosDoPlano.push(colheita);
  }
  criarDependencia(pedidoExame, colheita, regra.intervalo_min_dias, "REGRA", "R1");
}

// ---------------------------------------------------------------- R3
/** "rev c/ exames/resultados" depende de todos os MCDT (exame + análises) pedidos na mesma consulta. */
export function aplicarR3(pedidoRevisao: Pedido, pedidosDoPlano: Pedido[]): void {
  if (pedidoRevisao.tipo_pedido !== "consulta") return;
  const texto = `${pedidoRevisao.especificacao} ${pedidoRevisao.texto_origem}`.toLowerCase();
  if (!/c\/\s*exames|c\/\s*resultados|com exames|com resultados/.test(texto)) return;

  const mcdt = pedidosDoPlano.filter(
    (p) => p.pedido_id !== pedidoRevisao.pedido_id && (p.tipo_pedido === "exame" || p.tipo_pedido === "analises"),
  );
  for (const requisito of mcdt) {
    const jaExiste = store.dependencias.some(
      (d) => d.pedido_id === pedidoRevisao.pedido_id && d.depende_de_pedido_id === requisito.pedido_id,
    );
    if (jaExiste) continue;
    criarDependencia(pedidoRevisao, requisito, intervaloResultado(requisito.especialidade_destino), "REGRA", "R3");
  }
}

// ---------------------------------------------------------------- R2
/** Sessão de HD marcada → cria e depois agenda a colheita (hemograma + bioquímica) na janela [HD-3, HD-1]. */
export function criarPedidoColheitaPreQt(pedidoHd: Pedido): Pedido {
  return criarPedidoAutomatico(pedidoHd, {
    tipo_pedido: "analises",
    especialidade_destino: "6100",
    ato_codigo: "4",
    analises: ["A001", "A002"],
    exames: [],
    especificacao: "pré-QT",
  });
}

function criarPedidoAutomatico(
  origem: Pedido,
  campos: Pick<Pedido, "tipo_pedido" | "especialidade_destino" | "ato_codigo" | "analises" | "exames" | "especificacao">,
): Pedido {
  const novo: Pedido = {
    pedido_id: store.proximoId("pedido"),
    doente_id: origem.doente_id,
    consulta_origem_ato_id: origem.consulta_origem_ato_id,
    especialidade_origem: origem.especialidade_origem,
    medico_requisitante_id: origem.medico_requisitante_id,
    criado_em: origem.criado_em,
    tipo_pedido: campos.tipo_pedido,
    fluxo: "DIRETO",
    especialidade_destino: campos.especialidade_destino,
    ato_codigo: campos.ato_codigo,
    exames: campos.exames,
    analises: campos.analises,
    especificacao: campos.especificacao,
    prioridade: origem.prioridade,
    prazo_limite: origem.prazo_limite,
    nao_antes: "",
    medico_preferido_id: "",
    continuidade_obrigatoria: false,
    recorrencia: "",
    texto_origem: origem.texto_origem,
    confianca: 1,
    aprovado_direto: true,
    validado_por: "SISTEMA",
    validado_em: origem.criado_em,
    triado_por: "",
    triado_em: "",
    decisao_triagem: "",
    marcado_em: "",
    ato_id: "",
    estado: "ACEITE",
    n_remarcacoes: 0,
  };
  store.pedidos.push(novo);
  return novo;
}
