import { store } from "../store.ts";
import { recalcularAlertas } from "./alertas.ts";
import { aprovarPedidos } from "./fluxo.ts";
import { gerarPropostasFaltasPendentes } from "./propostasRemarcacao.ts";

/**
 * Estado inicial da demo (arranque e "Repor demo"): alertas e índices calculados, pedidos que os
 * dados trazem por encaminhar seguem o circuito como se o médico os tivesse acabado de declarar
 * (já não há fila de validação), e as faltas já registadas têm a sugestão de remarcação pronta.
 */
export function prepararEstadoInicial(quando: Date): void {
  recalcularAlertas(quando);
  const porMedico = new Map<string, typeof store.pedidos>();
  for (const p of store.pedidos.filter((x) => x.estado === "EXTRAIDO")) {
    porMedico.set(p.medico_requisitante_id, [...(porMedico.get(p.medico_requisitante_id) ?? []), p]);
  }
  for (const [medicoId, pedidos] of porMedico) aprovarPedidos(pedidos, medicoId, quando);
  gerarPropostasFaltasPendentes(quando);
}
