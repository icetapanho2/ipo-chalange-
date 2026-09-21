// Agente de extracção (secção 6 da especificação). Interface única:
//   extrair(texto, medicoId, doenteId, contexto) → { pedidos[], alertas[] }
//
// Fase 3 (actual): só o fornecedor "cache" está ligado — chama-se sempre, como stub, até a
// Fase 4 construir o pipeline completo (dicionário → LLM → validação contra o catálogo →
// R1-R3 → confiança, com EXTRACTOR=gemini|anthropic|local|cache). Esta função já aplica R1/R3
// e cria os pedidos EXTRAIDO + evento EXTRACAO, para o resto do sistema (validação, triagem,
// agendamento) já poder ser construído e testado contra ela.
import { store } from "../store.ts";
import { agora } from "../clock.ts";
import { isoData, isoDataHora, somarDias } from "../util.ts";
import { registarEvento } from "../motor/estados.ts";
import { aplicarR1, aplicarR3 } from "../motor/dependencias.ts";
import { calcularPrazo } from "../motor/prioridade.ts";
import { resolverTermo } from "../motor/dicionario.ts";
import { criarAlerta } from "../motor/alertas.ts";
import { procurarNaCachePorTexto } from "./providers/cache.ts";
import type { Pedido, Prioridade } from "../types.ts";
import type { PedidoExtraido } from "./schema.ts";

export interface ContextoExtracao {
  consultaAtoId: string;
  especialidadeOrigem: string;
  quando?: Date;
}

export interface ResultadoExtracao {
  pedidos: Pedido[];
  alertas: string[];
}

export function extrair(texto: string, medicoId: string, doenteId: string, contexto: ContextoExtracao): ResultadoExtracao {
  const quando = contexto.quando ?? agora();
  const entrada = procurarNaCachePorTexto(texto);

  if (!entrada) {
    const alerta = criarAlerta(
      {
        tipo: "TERMO_DESCONHECIDO",
        gravidade: "media",
        especialidade: contexto.especialidadeOrigem,
        pedido_id: "",
        doente_id: doenteId,
        descricao: "Texto não reconhecido (só o fornecedor de cache está ligado nesta fase; ver Fase 4).",
      },
      quando,
    );
    return { pedidos: [], alertas: [alerta.descricao] };
  }

  const pedidos: Pedido[] = [];
  const mensagensAlerta: string[] = [];

  for (const base of entrada.pedidos) {
    if (base.origem_regra?.startsWith("DICIONARIO:")) {
      const [, medico, termo] = base.origem_regra.split(":");
      if (!resolverTermo(termo, medico)) {
        const alerta = criarAlerta(
          {
            tipo: "TERMO_DESCONHECIDO",
            gravidade: "media",
            especialidade: contexto.especialidadeOrigem,
            pedido_id: "",
            doente_id: doenteId,
            descricao: `Termo '${termo}' não reconhecido. Não foi criado pedido. Confirmar o que significa.`,
          },
          quando,
        );
        mensagensAlerta.push(alerta.descricao);
        continue;
      }
      const pedido = construirPedido(base, doenteId, medicoId, contexto, quando);
      pedido.origem_dicionario = true;
      pedidos.push(pedido);
      continue;
    }
    pedidos.push(construirPedido(base, doenteId, medicoId, contexto, quando));
  }

  for (const pedido of pedidos) {
    if (pedido.tipo_pedido === "exame") aplicarR1(pedido, pedidos, quando);
  }
  for (const pedido of pedidos) {
    if (pedido.tipo_pedido === "consulta") aplicarR3(pedido, pedidos);
  }

  for (const alertaCache of entrada.alertas) {
    const alerta = criarAlerta(
      {
        tipo: "TERMO_DESCONHECIDO",
        gravidade: "media",
        especialidade: contexto.especialidadeOrigem,
        pedido_id: "",
        doente_id: doenteId,
        descricao: alertaCache.mensagem,
      },
      quando,
    );
    mensagensAlerta.push(alerta.descricao);
  }

  return { pedidos, alertas: mensagensAlerta };
}

function construirPedido(
  base: PedidoExtraido,
  doenteId: string,
  medicoId: string,
  contexto: ContextoExtracao,
  quando: Date,
): Pedido {
  const prioridade: Prioridade = base.prioridade ?? "N";
  const prazoExplicito = base.prazo_dias != null ? somarDias(quando, base.prazo_dias) : null;
  const prazo = calcularPrazo(base.tipo_pedido, prioridade, quando, prazoExplicito);
  const naoAntes = base.nao_antes_dias != null ? somarDias(quando, base.nao_antes_dias) : null;
  const medicoPreferido = base.medico_preferido === "REQUISITANTE" ? medicoId : base.medico_preferido ?? "";

  const pedido: Pedido = {
    pedido_id: store.proximoId("pedido"),
    doente_id: doenteId,
    consulta_origem_ato_id: contexto.consultaAtoId,
    especialidade_origem: contexto.especialidadeOrigem,
    medico_requisitante_id: medicoId,
    criado_em: isoDataHora(quando),
    tipo_pedido: base.tipo_pedido,
    fluxo: base.tipo_pedido === "pedido_consulta" || base.tipo_pedido === "pedido_hd" ? "TRIAGEM" : "DIRETO",
    especialidade_destino: base.especialidade_destino,
    ato_codigo: base.ato_codigo,
    exames: base.exames ?? [],
    analises: base.analises ?? [],
    especificacao: base.especificacao ?? "",
    prioridade,
    prazo_limite: isoData(prazo),
    nao_antes: naoAntes ? isoData(naoAntes) : "",
    medico_preferido_id: medicoPreferido,
    continuidade_obrigatoria: !!base.continuidade_obrigatoria,
    recorrencia: base.recorrencia ?? "",
    texto_origem: base.texto_origem,
    confianca: base.confianca,
    aprovado_direto: true,
    validado_por: "",
    validado_em: "",
    triado_por: "",
    triado_em: "",
    decisao_triagem: "",
    marcado_em: "",
    ato_id: "",
    estado: "EXTRAIDO",
    n_remarcacoes: 0,
    prioridade_por_defeito: base.prioridade == null,
  };
  store.pedidos.push(pedido);
  registarEvento(pedido, "EXTRACAO", "EXTRAIDO", "AGENTE", {
    detalhe: `confiança ${base.confianca}`,
    dataHora: quando,
  });
  return pedido;
}
