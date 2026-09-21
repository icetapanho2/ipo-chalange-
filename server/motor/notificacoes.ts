import { store } from "../store.ts";
import { isoDataHora } from "../util.ts";
import type { Perfil, TipoNotificacao } from "../types.ts";

/** Utilizadores com um dado perfil, opcionalmente restritos a uma especialidade (serviço). */
export function utilizadoresPorPerfil(perfil: Perfil, especialidadeCodigo?: string): string[] {
  return store.utilizadores
    .filter((u) => u.perfil === perfil && (!especialidadeCodigo || u.especialidade_codigo === especialidadeCodigo))
    .map((u) => u.utilizador_id);
}

function estaSilenciado(utilizadorId: string, tipo: TipoNotificacao): boolean {
  return store.silenciamentos.some((s) => s.utilizador_id === utilizadorId && s.tipo === tipo);
}

/** Cria uma notificação para cada destinatário (ignora vazios/duplicados). Nasce já lida se o tipo estiver silenciado. */
export function notificar(opts: {
  tipo: TipoNotificacao;
  destinatarios: string[];
  titulo: string;
  mensagem: string;
  pedidoId?: string;
  doenteId?: string;
  consultaAtoId?: string;
  quando: Date;
}): void {
  const destinatariosUnicos = [...new Set(opts.destinatarios.filter(Boolean))];
  for (const utilizadorId of destinatariosUnicos) {
    store.notificacoes.push({
      notificacao_id: store.proximoId("notificacao"),
      tipo: opts.tipo,
      destinatario_utilizador_id: utilizadorId,
      titulo: opts.titulo,
      mensagem: opts.mensagem,
      pedido_id: opts.pedidoId ?? "",
      doente_id: opts.doenteId ?? "",
      consulta_ato_id: opts.consultaAtoId ?? "",
      criado_em: isoDataHora(opts.quando),
      lida: estaSilenciado(utilizadorId, opts.tipo),
    });
  }
}

/** Silencia um tipo de notificação para um utilizador (regra de ouro: nunca perde o registo, só deixa de acumular por ler). */
export function silenciarTipo(utilizadorId: string, tipo: TipoNotificacao): void {
  if (!store.silenciamentos.some((s) => s.utilizador_id === utilizadorId && s.tipo === tipo)) {
    store.silenciamentos.push({ utilizador_id: utilizadorId, tipo });
  }
  for (const n of store.notificacoes) {
    if (n.destinatario_utilizador_id === utilizadorId && n.tipo === tipo) n.lida = true;
  }
}

export function dessilenciarTipo(utilizadorId: string, tipo: TipoNotificacao): void {
  store.silenciamentos = store.silenciamentos.filter((s) => !(s.utilizador_id === utilizadorId && s.tipo === tipo));
}
