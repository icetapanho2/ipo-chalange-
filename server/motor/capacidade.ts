import { store } from "../store.ts";
import { agora } from "../clock.ts";
import { apenasData, diferencaDias, formatarDataHoraPt, formatarDataPt, isoDataHora, parseIso, somarDias } from "../util.ts";
import { avaliarCandidatosTroca, encontrarVagaLivre, janelaAgendamento } from "./agendamento.ts";
import { libertarVaga, procurarAntecipaveis } from "./antecipacao.ts";
import { descreverDoente, descreverEspecialidade, descreverPedido } from "../apresentacao.ts";
import type { CandidatoAntecipacao, Vaga } from "../types.ts";

/**
 * Gestão de capacidade (ESPECIFICACAO.md secção 8A, R-L a R-N): alerta antecipado de prazos em risco
 * com a solução já proposta, sessão extra com a lista pronta, e tempo de espera por estádio. Tudo
 * determinístico e só com pedidos reais — nunca se estima procura nem se inventam doentes.
 */

export interface PrazoEmRisco {
  pedido_id: string;
  doente_id: string;
  doente_nome: string;
  especialidade: string;
  especialidade_legivel: string;
  descricao: string;
  prioridade: string;
  indice: number;
  prazo_limite: string;
  data_hora_atual: string;
  situacao: string;
  solucao: "VAGA_LIVRE" | "TROCA" | "ANTECIPAR" | "VAGA_EXTRA";
  solucao_texto: string;
}

/**
 * R-L — Prazos em risco nas próximas N semanas: pedidos marcados para depois do prazo, ou ainda sem
 * marcação com o prazo a acabar. Para cada um, a solução já proposta: vaga livre dentro do prazo →
 * troca segura possível → senão vaga extra/outsourcing. Ordenado pelo índice de prioridade.
 */
export function prazosEmRisco(quando: Date = agora(), horizonteDias = 14): PrazoEmRisco[] {
  const hoje = apenasData(quando);
  const limite = somarDias(hoje, horizonteDias);
  const itens: PrazoEmRisco[] = [];
  for (const pedido of store.pedidos) {
    if (!["MARCADO", "ACEITE", "SEM_VAGA"].includes(pedido.estado)) continue;
    const prazo = parseIso(pedido.prazo_limite);
    if (prazo.getTime() > limite.getTime()) continue;
    const ato = pedido.estado === "MARCADO" ? store.atosMedicos.find((a) => a.mvp_ato_id === pedido.ato_id) : undefined;
    if (pedido.estado === "MARCADO" && (!ato || ato.estado !== "MARCADA")) continue;
    const dataAtual = ato ? apenasData(parseIso(ato.data_hora)) : null;
    if (dataAtual && dataAtual.getTime() <= prazo.getTime()) continue; // marcado a tempo
    if (dataAtual && dataAtual.getTime() < hoje.getTime()) continue;

    const situacao = dataAtual
      ? `marcado a ${formatarDataPt(dataAtual)}, ${diferencaDias(dataAtual, prazo)} dia(s) depois do prazo`
      : prazo.getTime() < hoje.getTime()
        ? `sem marcação, prazo ultrapassado há ${diferencaDias(hoje, prazo)} dia(s)`
        : `sem marcação, prazo em ${diferencaDias(prazo, hoje)} dia(s)`;

    const { inicio } = janelaAgendamento(pedido, hoje);
    let solucao: PrazoEmRisco["solucao"] = "VAGA_EXTRA";
    let texto = "Sem vaga nem troca possível: sessão extra, vaga extra ou outsourcing.";
    const vaga = prazo.getTime() >= inicio.getTime()
      ? encontrarVagaLivre(pedido.especialidade_destino, pedido.ato_codigo, inicio, prazo, undefined, { pedido, quando })
      : null;
    if (vaga) {
      solucao = "VAGA_LIVRE";
      texto = `Há vaga livre a ${formatarDataHoraPt(parseIso(vaga.data_hora))}, dentro do prazo: antecipar.`;
    } else if (prazo.getTime() >= inicio.getTime()) {
      const escolhido = avaliarCandidatosTroca(pedido, inicio, prazo, quando).find((c) => c.escolhido);
      if (escolhido) {
        solucao = "TROCA";
        texto = `Troca segura possível: ${escolhido.doente_nome} cede ${formatarDataHoraPt(parseIso(escolhido.data_hora))} (custo ${escolhido.custo}).`;
      }
    }
    if (solucao === "VAGA_EXTRA") {
      // Já não dá para cumprir o prazo: pelo menos antecipar, se houver vaga antes da data actual.
      const ate = dataAtual ? somarDias(dataAtual, -1) : somarDias(hoje, 30);
      const antes = ate.getTime() >= inicio.getTime()
        ? encontrarVagaLivre(pedido.especialidade_destino, pedido.ato_codigo, inicio, ate, undefined, { pedido, quando })
        : null;
      if (antes) {
        solucao = "ANTECIPAR";
        const ganho = dataAtual ? diferencaDias(dataAtual, apenasData(parseIso(antes.data_hora))) : 0;
        texto = `Prazo já não se cumpre: antecipar para ${formatarDataHoraPt(parseIso(antes.data_hora))}${ganho ? ` (ganha ${ganho} dias)` : ""}.`;
      }
    }
    itens.push({
      pedido_id: pedido.pedido_id,
      doente_id: pedido.doente_id,
      doente_nome: descreverDoente(pedido.doente_id),
      especialidade: pedido.especialidade_destino,
      especialidade_legivel: descreverEspecialidade(pedido.especialidade_destino),
      descricao: descreverPedido(pedido),
      prioridade: pedido.prioridade,
      indice: pedido.indice_prioridade ?? 0,
      prazo_limite: pedido.prazo_limite,
      data_hora_atual: ato?.data_hora ?? "",
      situacao,
      solucao,
      solucao_texto: texto,
    });
  }
  return itens.sort((a, b) => b.indice - a.indice);
}

// ------------------------------------------------------------------------------ sessão extra
export interface OpcoesSessaoExtra {
  especialidade: string;
  data: string; // aaaa-mm-dd
  horaInicio: string; // hh:mm
  nVagas: number;
}

function vagasDaSessao(o: OpcoesSessaoExtra, criar: boolean): Vaga[] {
  const modelo = store.vagas.find((v) => v.especialidade_codigo === o.especialidade && !v.extra);
  if (!modelo) return [];
  const [h, m] = o.horaInicio.split(":").map(Number);
  const vagas: Vaga[] = [];
  const base = store.vagas.filter((v) => v.extra).length;
  for (let i = 0; i < o.nVagas; i++) {
    const inicio = parseIso(`${o.data}T00:00`);
    inicio.setHours(h, m + i * modelo.duracao_min, 0, 0);
    vagas.push({
      vaga_id: `VX${String(base + i + 1).padStart(4, "0")}`,
      especialidade_codigo: o.especialidade,
      gabinete_codigo: modelo.gabinete_codigo,
      medico_id: modelo.medico_id,
      data_hora: isoDataHora(inicio),
      duracao_min: modelo.duracao_min,
      atos_permitidos: [...modelo.atos_permitidos],
      ato_id: "",
      extra: true,
    });
  }
  if (criar) store.vagas.push(...vagas);
  return vagas;
}

/**
 * R-M — Sessão extra com a lista pronta: para N vagas extra num dia/hora, quem ganha mais com elas
 * (as mesmas regras da vaga libertada: sem vaga ou fora do prazo primeiro, em diagnóstico à frente).
 * A pré-visualização não altera nada.
 */
export function previsaoSessaoExtra(o: OpcoesSessaoExtra, quando: Date = agora()) {
  const vagas = vagasDaSessao(o, false);
  if (vagas.length === 0) return { vagas: 0, doentes: [] as (CandidatoAntecipacao & { data_hora_nova: string })[], dias_ganhos: 0, dentro_do_prazo: 0 };
  const candidatos = procurarAntecipaveis(vagas[0], quando).slice(0, vagas.length);
  const doentes = candidatos.map((c, i) => ({ ...c, data_hora_nova: vagas[i].data_hora }));
  const diasGanhos = doentes.reduce((s, d) => s + (d.dias_ganhos ?? 0), 0);
  const dentro = doentes.filter((d) => apenasData(parseIso(d.data_hora_nova)).getTime() <= parseIso(d.prazo_limite).getTime()).length;
  return { vagas: vagas.length, doentes, dias_ganhos: diasGanhos, dentro_do_prazo: dentro };
}

/** Abre a sessão: cria as vagas e oferece cada uma por SMS (oferta de antecipação — o doente aceita). */
export function abrirSessaoExtra(o: OpcoesSessaoExtra, quando: Date = agora()) {
  const vagas = vagasDaSessao(o, true);
  const origem = `Sessão extra de ${formatarDataPt(parseIso(o.data))}`;
  const ofertas = vagas.map((v) => libertarVaga(v, quando, origem)).filter((x) => !!x);
  return { vagas: vagas.length, ofertas: ofertas.length };
}

// ------------------------------------------------------------------------------ espera por estádio
/** R-N — Tempo de espera (pedido → marcação) e % dentro do prazo, por estádio do percurso. */
export function esperaPorEstadio() {
  const grupos = new Map<string, { esperas: number[]; dentro: number }>();
  for (const pedido of store.pedidos) {
    if (!["MARCADO", "REALIZADO"].includes(pedido.estado)) continue;
    const ato = store.atosMedicos.find((a) => a.mvp_ato_id === pedido.ato_id);
    if (!ato) continue;
    const estadio = store.doentes.find((d) => d.doente_id === pedido.doente_id)?.estadio_cuidado || "";
    const chave = estadio || "SEM_ESTADIO";
    if (!grupos.has(chave)) grupos.set(chave, { esperas: [], dentro: 0 });
    const g = grupos.get(chave)!;
    const dataAto = apenasData(parseIso(ato.data_hora));
    g.esperas.push(diferencaDias(dataAto, apenasData(parseIso(pedido.criado_em))));
    if (dataAto.getTime() <= parseIso(pedido.prazo_limite).getTime()) g.dentro += 1;
  }
  const NOMES: Record<string, string> = {
    NOVO: "Novo (diagnóstico)",
    PRE_TRATAMENTO: "Pré-tratamento",
    EM_TRATAMENTO: "Em tratamento",
    FOLLOW_UP: "Follow-up",
    SEM_ESTADIO: "Sem estádio",
  };
  return ["NOVO", "PRE_TRATAMENTO", "EM_TRATAMENTO", "FOLLOW_UP"]
    .filter((k) => grupos.has(k))
    .map((k) => {
      const g = grupos.get(k)!;
      const ord = [...g.esperas].sort((a, b) => a - b);
      return {
        estadio: k,
        legivel: NOMES[k],
        pedidos: ord.length,
        mediana_dias: ord.length ? ord[Math.floor(ord.length / 2)] : 0,
        percent_dentro_prazo: ord.length ? Math.round((g.dentro / ord.length) * 100) : 0,
      };
    });
}
