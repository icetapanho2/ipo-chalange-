import { store } from "../store.ts";
import { formatarDataHoraPt, isoDataHora, parseIso, somarDias } from "../util.ts";
import type { AtoMedico, ComunicacaoDoente, Pedido } from "../types.ts";

/**
 * Comunicações ao doente (secção 8A, R-G). SIMULADAS: nada é enviado — ficam registadas e visíveis
 * na timeline do doente, para mostrar o que o doente recebe e quando. Na produção isto é feito pelo
 * canal do hospital (o Oasis já envia avisos — a confirmar, especificação secção 16).
 */

export function instrucoesPreparacao(especialidadeCodigo: string, atoCodigo: string): string {
  return store.preparacoes.find((p) => p.especialidade_codigo === especialidadeCodigo && p.ato_codigo === atoCodigo)?.instrucoes ?? "";
}

function canalDoDoente(doenteId: string): ComunicacaoDoente["canal"] {
  const c = store.doentes.find((d) => d.doente_id === doenteId)?.contacto_digital;
  return c === "EMAIL" ? "EMAIL" : c === "NENHUM" ? "CARTA" : "SMS";
}

function registar(c: Omit<ComunicacaoDoente, "comunicacao_id">): ComunicacaoDoente {
  const com = { comunicacao_id: store.proximoId("comunicacao"), ...c };
  store.comunicacoesDoente.push(com);
  return com;
}

/** Aviso de marcação/remarcação/antecipação + lembrete a D-3 com pedido de confirmação. */
export function comunicarMarcacao(
  pedido: Pedido,
  ato: AtoMedico,
  tipo: "MARCACAO" | "REMARCACAO" | "ANTECIPACAO",
  quando: Date,
): void {
  cancelarLembretes(pedido.pedido_id); // uma nova data substitui o lembrete da anterior
  const canal = canalDoDoente(pedido.doente_id);
  const quandoTxt = formatarDataHoraPt(parseIso(ato.data_hora));
  const onde = ato.gabinete_descricao || ato.especialidade_descricao;
  const prep = instrucoesPreparacao(ato.especialidade_codigo, ato.ato_codigo);
  const abertura =
    tipo === "REMARCACAO"
      ? `IPO: pedimos desculpa, a sua marcação de ${ato.ato_descricao} foi alterada para ${quandoTxt}`
      : tipo === "ANTECIPACAO"
        ? `IPO: confirmada a antecipação de ${ato.ato_descricao} para ${quandoTxt}`
        : `IPO: ${ato.ato_descricao} marcado para ${quandoTxt}`;
  registar({
    doente_id: pedido.doente_id,
    pedido_id: pedido.pedido_id,
    canal,
    tipo,
    texto: `${abertura} (${onde}).${prep ? ` Preparação: ${prep}` : ""}`,
    criado_em: isoDataHora(quando),
    enviar_em: isoDataHora(quando),
    estado: "ENVIADA",
  });
  const lembrete = somarDias(parseIso(ato.data_hora), -3);
  lembrete.setHours(10, 0, 0, 0);
  if (lembrete.getTime() > quando.getTime()) {
    registar({
      doente_id: pedido.doente_id,
      pedido_id: pedido.pedido_id,
      canal,
      tipo: "LEMBRETE",
      texto: `IPO: lembrete — ${ato.ato_descricao} a ${quandoTxt}.${prep ? ` ${prep}` : ""} Responda 1 para confirmar ou 2 para desmarcar (a vaga é oferecida a outro doente).`,
      criado_em: isoDataHora(quando),
      enviar_em: isoDataHora(lembrete),
      estado: "AGENDADA",
    });
  }
}

/** Mensagem genérica (oferta de antecipação, confirmação de desmarcação). */
export function comunicarTexto(
  doenteId: string,
  pedidoId: string,
  tipo: "OFERTA" | "DESMARCACAO",
  texto: string,
  quando: Date,
): void {
  registar({
    doente_id: doenteId,
    pedido_id: pedidoId,
    canal: canalDoDoente(doenteId),
    tipo,
    texto,
    criado_em: isoDataHora(quando),
    enviar_em: isoDataHora(quando),
    estado: "ENVIADA",
  });
}

/** Lembretes agendados de uma marcação que deixou de existir (desmarcada/antecipada) deixam de fazer sentido. */
export function cancelarLembretes(pedidoId: string): void {
  store.comunicacoesDoente = store.comunicacoesDoente.filter((c) => !(c.pedido_id === pedidoId && c.estado === "AGENDADA"));
}
