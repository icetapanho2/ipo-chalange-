// Ajuda os testes de cenários a simular o resultado da extracção (Fase 4, ainda por construir)
// a partir de dados/demo_extracoes_cache.json — o mesmo ficheiro que o fornecedor "cache" do
// agente de extracção vai usar. Constrói pedidos EXTRAIDO tal como a extracção os produziria,
// e deixa as regras R1/R3 (deterministas, em server/motor/) reconstruir as dependências a partir
// do texto, em vez de copiar o campo "depende_de" da cache — testa a regra, não o atalho.
import path from "node:path";
import { store } from "../../server/store.ts";
import { readJson } from "../../server/csv.ts";
import { registarEvento } from "../../server/motor/estados.ts";
import { aplicarR1, aplicarR3 } from "../../server/motor/dependencias.ts";
import { calcularPrazo } from "../../server/motor/prioridade.ts";
import { aprenderCorrecao, resolverTermo } from "../../server/motor/dicionario.ts";
import { criarAlerta } from "../../server/motor/alertas.ts";
import { isoData, isoDataHora, somarDias } from "../../server/util.ts";
import type { Pedido, Prioridade, TipoPedido } from "../../server/types.ts";

interface PedidoCache {
  ref: number;
  tipo_pedido: TipoPedido;
  especialidade_destino: string;
  ato_codigo: string;
  exames?: string[];
  analises?: string[];
  especificacao?: string;
  prioridade: Prioridade | null;
  prazo_dias?: number | null;
  nao_antes_dias?: number | null;
  medico_preferido?: string | null;
  continuidade_obrigatoria?: boolean;
  recorrencia?: string | null;
  confianca: number;
  texto_origem: string;
  origem_regra?: string;
}

interface AlertaCache {
  tipo: string;
  texto_origem: string;
  mensagem: string;
}

interface CorrecaoEsperada {
  termo: string;
  significado: string;
  mapeia_para: string;
  ambito: string;
  pedido: {
    tipo_pedido: TipoPedido;
    especialidade_destino: string;
    ato_codigo: string;
    exames?: string[];
    recorrencia?: string;
  };
}

interface EntradaCache {
  texto_plano: string;
  pedidos: PedidoCache[];
  alertas: AlertaCache[];
  correcao_esperada?: CorrecaoEsperada;
}

let cache: Record<string, EntradaCache> | null = null;
function carregarCache(): Record<string, EntradaCache> {
  if (!cache) {
    const caminho = path.join(process.cwd(), "dados", "demo_extracoes_cache.json");
    cache = readJson<Record<string, EntradaCache>>(caminho);
  }
  return cache;
}

function construirPedido(
  base: PedidoCache,
  doenteId: string,
  medicoId: string,
  consultaAtoId: string,
  especialidadeOrigem: string,
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
    consulta_origem_ato_id: consultaAtoId,
    especialidade_origem: especialidadeOrigem,
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

export interface ResultadoPlano {
  pedidos: Pedido[];
  alertas: AlertaCache[];
}

/** Constrói os pedidos EXTRAIDO do plano de `doenteId`, aplicando R1/R3 a partir do texto. */
export function extrairPlanoDemo(
  doenteId: string,
  medicoId: string,
  consultaAtoId: string,
  especialidadeOrigem: string,
  quando: Date,
): ResultadoPlano {
  const entrada = carregarCache()[doenteId];
  if (!entrada) throw new Error(`Sem entrada de cache para o doente ${doenteId}`);

  const pedidos: Pedido[] = [];
  for (const base of entrada.pedidos) {
    if (base.origem_regra?.startsWith("DICIONARIO:")) {
      const [, medico, termo] = base.origem_regra.split(":");
      const entradaDicionario = resolverTermo(termo, medico);
      if (!entradaDicionario) {
        criarAlerta(
          {
            tipo: "TERMO_DESCONHECIDO",
            gravidade: "media",
            especialidade: especialidadeOrigem,
            pedido_id: "",
            doente_id: doenteId,
            descricao: `Termo '${termo}' não reconhecido. Não foi criado pedido. Confirmar o que significa.`,
          },
          quando,
        );
        continue;
      }
      const pedido = construirPedido(base, doenteId, medicoId, consultaAtoId, especialidadeOrigem, quando);
      pedido.origem_dicionario = true;
      pedidos.push(pedido);
      continue;
    }
    pedidos.push(construirPedido(base, doenteId, medicoId, consultaAtoId, especialidadeOrigem, quando));
  }

  for (const pedido of pedidos) {
    if (pedido.tipo_pedido === "exame") aplicarR1(pedido, pedidos, quando);
  }
  for (const pedido of pedidos) {
    if (pedido.tipo_pedido === "consulta") aplicarR3(pedido, pedidos);
  }

  for (const alerta of entrada.alertas) {
    criarAlerta(
      {
        tipo: "TERMO_DESCONHECIDO",
        gravidade: "media",
        especialidade: especialidadeOrigem,
        pedido_id: "",
        doente_id: doenteId,
        descricao: alerta.mensagem,
      },
      quando,
    );
  }

  return { pedidos, alertas: entrada.alertas };
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
  const entrada = carregarCache()[doenteId];
  const correcao = entrada?.correcao_esperada;
  if (!correcao) throw new Error(`Sem correcção esperada para o doente ${doenteId}`);

  aprenderCorrecao({
    termo: correcao.termo,
    significado: correcao.significado,
    mapeiaPara: correcao.mapeia_para,
    medicoId,
  });

  const pedido = construirPedido(
    {
      ref: -1,
      tipo_pedido: correcao.pedido.tipo_pedido,
      especialidade_destino: correcao.pedido.especialidade_destino,
      ato_codigo: correcao.pedido.ato_codigo,
      exames: correcao.pedido.exames ?? [],
      analises: [],
      prioridade: null,
      recorrencia: correcao.pedido.recorrencia ?? "",
      confianca: 1,
      texto_origem: correcao.termo,
    },
    doenteId,
    medicoId,
    consultaAtoId,
    especialidadeOrigem,
    quando,
  );
  registarEvento(pedido, "CORRECAO", "EXTRAIDO", utilizadorAdministrativoId, {
    detalhe: `'${correcao.termo}' → ${correcao.significado}`,
    dataHora: quando,
  });
  return pedido;
}
