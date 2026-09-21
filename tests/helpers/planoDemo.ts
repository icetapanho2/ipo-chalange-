// Ajuda os testes de cenários a conduzir o mesmo caminho que a demo ao vivo segue:
// o texto do plano é resolvido pelo agente de extracção real (server/extracao/, fornecedor
// cache) a partir de dados/demo_extracoes_cache.json — não há lógica de extracção duplicada
// aqui. `corrigirTermoDesconhecido` simula a administrativa a corrigir um alerta (Fase 5); usa
// `correcao_esperada` da cache só para saber que valores escrever, tal como um operador da
// demo escreveria — o sistema em si nunca lê esse campo.
import { store } from "../../server/store.ts";
import { registarEvento } from "../../server/motor/estados.ts";
import { aprenderCorrecao } from "../../server/extracao/dicionario.ts";
import { calcularPrazo } from "../../server/motor/prioridade.ts";
import { isoData, isoDataHora } from "../../server/util.ts";
import { extrair, type ResultadoExtracao } from "../../server/extracao/index.ts";
import { procurarNaCachePorDoente } from "../../server/extracao/providers/cache.ts";
import type { Pedido } from "../../server/types.ts";

/** Constrói os pedidos EXTRAIDO do plano de `doenteId`, tal como a demo faria ao vivo. */
export function extrairPlanoDemo(
  doenteId: string,
  medicoId: string,
  consultaAtoId: string,
  especialidadeOrigem: string,
  quando: Date,
): Promise<ResultadoExtracao> {
  const entrada = procurarNaCachePorDoente(doenteId);
  if (!entrada) throw new Error(`Sem entrada de cache para o doente ${doenteId}`);
  return extrair(entrada.texto_plano, medicoId, doenteId, { consultaAtoId, especialidadeOrigem, quando });
}

/** Simula a administrativa a corrigir um alerta de termo desconhecido (secção 7 / Fase 5). */
export function corrigirTermoDesconhecido(
  doenteId: string,
  medicoId: string,
  consultaAtoId: string,
  especialidadeOrigem: string,
  utilizadorAdministrativoId: string,
  quando: Date,
): Pedido {
  const entrada = procurarNaCachePorDoente(doenteId);
  const correcao = entrada?.correcao_esperada;
  if (!correcao) throw new Error(`Sem correcção esperada para o doente ${doenteId}`);

  aprenderCorrecao({
    termo: correcao.termo,
    significado: correcao.significado,
    mapeiaPara: correcao.mapeia_para,
    medicoId,
  });

  const prioridade = "N" as const;
  const prazo = calcularPrazo(correcao.pedido.tipo_pedido, prioridade, quando, null);
  const pedido: Pedido = {
    pedido_id: store.proximoId("pedido"),
    doente_id: doenteId,
    consulta_origem_ato_id: consultaAtoId,
    especialidade_origem: especialidadeOrigem,
    medico_requisitante_id: medicoId,
    criado_em: isoDataHora(quando),
    tipo_pedido: correcao.pedido.tipo_pedido,
    fluxo: "DIRETO",
    especialidade_destino: correcao.pedido.especialidade_destino,
    ato_codigo: correcao.pedido.ato_codigo,
    exames: correcao.pedido.exames ?? [],
    analises: [],
    especificacao: "",
    prioridade,
    prazo_limite: isoData(prazo),
    nao_antes: "",
    medico_preferido_id: "",
    continuidade_obrigatoria: false,
    recorrencia: correcao.pedido.recorrencia ?? "",
    texto_origem: correcao.termo,
    confianca: 1,
    aprovado_direto: false,
    validado_por: "",
    validado_em: "",
    triado_por: "",
    triado_em: "",
    decisao_triagem: "",
    marcado_em: "",
    ato_id: "",
    estado: "EXTRAIDO",
    n_remarcacoes: 0,
    prioridade_por_defeito: true,
  };
  store.pedidos.push(pedido);
  registarEvento(pedido, "CORRECAO", "EXTRAIDO", utilizadorAdministrativoId, {
    detalhe: `'${correcao.termo}' → ${correcao.significado}`,
    dataHora: quando,
  });
  return pedido;
}
