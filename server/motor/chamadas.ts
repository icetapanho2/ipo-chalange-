import { store } from "../store.ts";
import { agora } from "../clock.ts";
import { apenasData, diferencaDias, isoDataHora, parseIso, somarDias } from "../util.ts";
import { registarEvento } from "./estados.ts";
import { idadeDoente, remarcacoesHospital } from "./remarcacao.ts";
import { desmarcarAPedidoDoDoente, desmarcarAtoSemPedido } from "./antecipacao.ts";
import type { AtoMedico, ChamadaRegistada } from "../types.ts";

/**
 * Lista de chamadas da administrativa (ESPECIFICACAO.md secção 8A, R-G). Não se liga a toda a gente:
 * o doente recebe o aviso com a preparação e um lembrete a D-3; só entram aqui as marcações com um
 * motivo concreto de risco (não ver o aviso, não fazer a preparação, faltar). Determinístico, sem IA.
 * O risco serve só para ordenar a lista — nunca penaliza o doente nem baixa a sua prioridade.
 */

export interface MotivoChamada {
  codigo: "SEM_CONTACTO" | "IDADE" | "PREPARACAO" | "FALTAS" | "SEGUNDA_REMARCACAO";
  texto: string;
  peso: number;
}

export interface ItemChamada {
  ato_id: string;
  pedido_id: string;
  doente_id: string;
  doente_nome: string;
  contacto: string;
  data_hora: string;
  especialidade_codigo: string;
  ato_descricao: string;
  motivos: MotivoChamada[];
  risco: number;
  chamada?: ChamadaRegistada;
}

const LIMIAR_RISCO = 2;
const RISCO_CLINICO_CONTRASTE = /diabet|metformin|renal|insufici[êe]ncia renal/i;

function precisaContraste(ato: AtoMedico): boolean {
  if (ato.especialidade_codigo !== "7000_2") return false;
  const pedido = store.pedidos.find((p) => p.pedido_id === ato.mvp_pedido_id);
  return /contraste/i.test(pedido?.especificacao ?? "") || /c\/ ?ctr|contraste/i.test(pedido?.texto_origem ?? "");
}

function faltasUltimoAno(doenteId: string, quando: Date): number {
  const desde = somarDias(quando, -365).getTime();
  return store.atosMedicos.filter(
    (a) => a.doente_id === doenteId && a.estado === "FALTOU" && parseIso(a.data_hora).getTime() >= desde,
  ).length;
}

export function motivosChamada(ato: AtoMedico, quando: Date): MotivoChamada[] {
  const doente = store.doentes.find((d) => d.doente_id === ato.doente_id);
  if (!doente) return [];
  const p = store.parametros;
  const motivos: MotivoChamada[] = [];
  if (doente.contacto_digital === "NENHUM") {
    motivos.push({ codigo: "SEM_CONTACTO", texto: "Sem telemóvel nem email: não recebe o aviso nem o lembrete", peso: 2 });
  }
  const idade = idadeDoente(doente, apenasData(quando));
  if (idade >= p.idade_chamada) motivos.push({ codigo: "IDADE", texto: `${idade} anos`, peso: 1 });
  const prep = store.preparacoes.find((x) => x.especialidade_codigo === ato.especialidade_codigo && x.ato_codigo === ato.ato_codigo);
  if (prep?.requer_confirmacao && precisaContraste(ato) && RISCO_CLINICO_CONTRASTE.test(`${doente.notas_clinicas ?? ""} ${doente.diagnostico_principal ?? ""}`)) {
    motivos.push({ codigo: "PREPARACAO", texto: "TC com contraste e diabetes/metformina: confirmar a preparação", peso: 2 });
  }
  const faltas = faltasUltimoAno(doente.doente_id, quando);
  if (faltas > 0) motivos.push({ codigo: "FALTAS", texto: `${faltas} falta${faltas > 1 ? "s" : ""} no último ano`, peso: faltas >= 2 ? 2 : 1 });
  if (remarcacoesHospital(doente.doente_id, quando) > p.max_remarcacoes_hospital) {
    motivos.push({ codigo: "SEGUNDA_REMARCACAO", texto: "Já remarcado mais de uma vez pelo hospital: explicar e pedir desculpa", peso: 3 });
  }
  return motivos;
}

/**
 * Marcações a ligar: nos próximos `lista_chamadas_dias` dias com pelo menos um motivo; e, em
 * qualquer data futura, as que têm preparação crítica por confirmar (liga-se logo após marcar).
 */
export function listaChamadas(
  especialidadeCodigo: string | undefined,
  quando: Date = agora(),
): { itens: ItemChamada[]; marcacoesNoHorizonte: number; horizonteDias: number } {
  const hoje = apenasData(quando);
  const horizonte = store.parametros.lista_chamadas_dias;
  const itens: ItemChamada[] = [];
  let marcacoesNoHorizonte = 0;
  for (const ato of store.atosMedicos) {
    if (ato.estado !== "MARCADA") continue;
    if (especialidadeCodigo && ato.especialidade_codigo !== especialidadeCodigo) continue;
    const dias = diferencaDias(apenasData(parseIso(ato.data_hora)), hoje);
    if (dias < 1) continue;
    const noHorizonte = dias <= horizonte;
    if (noHorizonte) marcacoesNoHorizonte += 1;
    let motivos = motivosChamada(ato, quando);
    if (!noHorizonte) motivos = motivos.filter((m) => m.codigo === "PREPARACAO");
    // Entra na lista com risco >= 2: um motivo forte (sem contacto, preparação, 2+ faltas, 2.ª
    // remarcação) ou dois fracos juntos (ex.: 80+ anos e uma falta). Um só motivo fraco não chega.
    if (motivos.reduce((s, m) => s + m.peso, 0) < LIMIAR_RISCO) continue;
    const doente = store.doentes.find((d) => d.doente_id === ato.doente_id);
    itens.push({
      ato_id: ato.mvp_ato_id,
      pedido_id: ato.mvp_pedido_id,
      doente_id: ato.doente_id,
      doente_nome: doente?.nome ?? ato.doente_id,
      contacto: doente?.contacto || "(sem contacto registado)",
      data_hora: ato.data_hora,
      especialidade_codigo: ato.especialidade_codigo,
      ato_descricao: ato.ato_descricao,
      motivos,
      risco: motivos.reduce((s, m) => s + m.peso, 0),
      chamada: [...store.chamadas].reverse().find((c) => c.ato_id === ato.mvp_ato_id),
    });
  }
  itens.sort((a, b) => b.risco - a.risco || a.data_hora.localeCompare(b.data_hora));
  return { itens, marcacoesNoHorizonte, horizonteDias: horizonte };
}

/** Regista o resultado da chamada. "Vai desmarcar" liberta logo a vaga (e ela é oferecida, R-E). */
export function registarChamada(
  atoId: string,
  resultado: ChamadaRegistada["resultado"],
  utilizadorId: string,
  opts: { nota?: string; disponivelAPartirDe?: string | null } = {},
  quando: Date = agora(),
): ChamadaRegistada | null {
  const ato = store.atosMedicos.find((a) => a.mvp_ato_id === atoId);
  if (!ato) return null;
  const chamada: ChamadaRegistada = {
    ato_id: atoId,
    doente_id: ato.doente_id,
    resultado,
    utilizador_id: utilizadorId,
    registado_em: isoDataHora(quando),
    nota: opts.nota ?? "",
  };
  store.chamadas.push(chamada);
  const pedido = store.pedidos.find((p) => p.pedido_id === ato.mvp_pedido_id);
  const texto = { CONFIRMADO: "Doente confirmou presença e preparação", NAO_ATENDEU: "Doente não atendeu", VAI_DESMARCAR: "Doente vai desmarcar" }[resultado];
  if (pedido) registarEvento(pedido, "CHAMADA", "", utilizadorId, { motivo: texto, detalhe: opts.nota ?? "", dataHora: quando });
  if (resultado === "VAI_DESMARCAR") {
    if (pedido) desmarcarAPedidoDoDoente(pedido, utilizadorId, opts.disponivelAPartirDe ?? null, quando);
    else desmarcarAtoSemPedido(atoId, quando);
  }
  return chamada;
}
