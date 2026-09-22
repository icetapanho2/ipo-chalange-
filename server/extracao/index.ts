// Agente de extracção (secção 6 da especificação). Interface única:
//   extrair(texto, medicoId, doenteId, contexto) → { pedidos[], alertas[] }
//
// Pipeline: normalização por dicionário → fornecedor (gemini|anthropic|local|cache, por
// EXTRACTOR) → validação contra o catálogo → regras R1/R3 → confiança. Fornecedor trocável
// por configuração; se o fornecedor ao vivo falhar ou demorar mais de 15s, cai para a cache
// (dados/demo_extracoes_cache.json) quando o texto coincidir, e regista isso no evento.
import { store } from "../store.ts";
import { agora } from "../clock.ts";
import { diferencaDias, isoData, isoDataHora, somarDias } from "../util.ts";
import { registarEvento } from "../motor/estados.ts";
import { aplicarR1, aplicarR3 } from "../motor/dependencias.ts";
import { calcularPrazo, calcularPrioridadeSistema } from "../motor/prioridade.ts";
import { resolverTermo } from "./dicionario.ts";
import { criarAlerta } from "../motor/alertas.ts";
import { procurarNaCachePorTexto } from "./providers/cache.ts";
import { construirPrompt } from "./prompt.ts";
import { extrairComGemini, geminiDisponivel } from "./providers/gemini.ts";
import { extrairComAnthropic, anthropicDisponivel } from "./providers/anthropic.ts";
import { extrairComOllama, ollamaDisponivel } from "./providers/ollama.ts";
import type { RespostaProvider } from "./providers/gemini.ts";
import type { Pedido, Prioridade } from "../types.ts";
import type { EntradaCacheExtracao, PedidoExtraido } from "./schema.ts";

export type NomeFornecedor = "gemini" | "anthropic" | "local" | "cache";

const TEMPO_LIMITE_MS = 15_000;
const REGEX_URGENCIA = /urgente\s+hoje|em[eé]rg[eê]ncia/i;
const HORIZONTE_URGENCIA_DIAS = 3; // < 72h

export interface ContextoExtracao {
  consultaAtoId: string;
  especialidadeOrigem: string;
  soap?: { s?: string; o?: string; a?: string };
  quando?: Date;
}

export interface ResultadoExtracao {
  pedidos: Pedido[];
  alertas: string[];
  fornecedorUsado: NomeFornecedor;
  usouFallback: boolean;
}

export function fornecedorConfigurado(): NomeFornecedor {
  const env = (process.env.EXTRACTOR || "").trim().toLowerCase();
  if (env === "gemini" || env === "anthropic" || env === "local" || env === "cache") return env;
  return geminiDisponivel() ? "gemini" : "cache";
}

function demoCachePrimeiro(): boolean {
  return (process.env.DEMO_CACHE_PRIMEIRO ?? "true").toLowerCase() !== "false";
}

function comTimeout<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(() => reject(new Error(`Tempo excedido (${ms} ms)`)), ms);
    promessa.then(
      (valor) => {
        clearTimeout(temporizador);
        resolve(valor);
      },
      (erro) => {
        clearTimeout(temporizador);
        reject(erro);
      },
    );
  });
}

async function chamarFornecedor(nome: NomeFornecedor, prompt: string): Promise<RespostaProvider> {
  switch (nome) {
    case "gemini":
      return extrairComGemini(prompt);
    case "anthropic":
      return extrairComAnthropic(prompt);
    case "local":
      return extrairComOllama(prompt);
    case "cache":
      throw new Error("cache não é chamado como fornecedor de LLM");
  }
}

function fornecedorDisponivel(nome: NomeFornecedor): boolean {
  if (nome === "gemini") return geminiDisponivel();
  if (nome === "anthropic") return anthropicDisponivel();
  if (nome === "local") return ollamaDisponivel();
  return true;
}

export async function extrair(
  texto: string,
  medicoId: string,
  doenteId: string,
  contexto: ContextoExtracao,
): Promise<ResultadoExtracao> {
  const quando = contexto.quando ?? agora();
  const fornecedor = fornecedorConfigurado();
  const entradaCache = procurarNaCachePorTexto(texto);

  // Fornecedor cache, ou texto conhecido da demo com DEMO_CACHE_PRIMEIRO (garante a demo).
  if (fornecedor === "cache" || (entradaCache && demoCachePrimeiro())) {
    if (!entradaCache) {
      return semReconhecimento(doenteId, contexto, quando, fornecedor, false);
    }
    return processarEntrada(entradaCache, doenteId, medicoId, texto, contexto, quando, "cache", false);
  }

  // Fornecedor ao vivo (gemini | anthropic | local).
  try {
    if (!fornecedorDisponivel(fornecedor)) throw new Error(`Fornecedor '${fornecedor}' não está configurado`);
    const prompt = construirPrompt({ medicoId, s: contexto.soap?.s ?? "", o: contexto.soap?.o ?? "", a: contexto.soap?.a ?? "", p: texto });
    const resposta = await comTimeout(chamarFornecedor(fornecedor, prompt), TEMPO_LIMITE_MS);
    const entrada: EntradaCacheExtracao = { texto_plano: texto, pedidos: resposta.pedidos, alertas: resposta.alertas };
    return processarEntrada(entrada, doenteId, medicoId, texto, contexto, quando, fornecedor, false);
  } catch (erroFornecedor) {
    if (entradaCache) {
      const resultado = await processarEntrada(entradaCache, doenteId, medicoId, texto, contexto, quando, fornecedor, true);
      registarFallback(resultado.pedidos, fornecedor, erroFornecedor, quando);
      return resultado;
    }
    return semReconhecimento(doenteId, contexto, quando, fornecedor, true, erroFornecedor);
  }
}

function registarFallback(pedidos: Pedido[], fornecedor: NomeFornecedor, erro: unknown, quando: Date): void {
  const motivo = erro instanceof Error ? erro.message : String(erro);
  for (const pedido of pedidos) {
    registarEvento(pedido, "EXTRACAO", "", "AGENTE", {
      motivo: `Fallback para cache (fornecedor '${fornecedor}' falhou)`,
      detalhe: motivo,
      dataHora: quando,
    });
  }
}

function semReconhecimento(
  doenteId: string,
  contexto: ContextoExtracao,
  quando: Date,
  fornecedor: NomeFornecedor,
  usouFallback: boolean,
  erro?: unknown,
): ResultadoExtracao {
  const detalhe = erro ? ` (${erro instanceof Error ? erro.message : String(erro)})` : "";
  const alerta = criarAlerta(
    {
      tipo: "TERMO_DESCONHECIDO",
      gravidade: "media",
      especialidade: contexto.especialidadeOrigem,
      pedido_id: "",
      doente_id: doenteId,
      descricao: `Não foi possível reconhecer este texto automaticamente${detalhe}.`,
    },
    quando,
  );
  return { pedidos: [], alertas: [alerta.descricao], fornecedorUsado: fornecedor, usouFallback };
}

function codigoValido(base: PedidoExtraido): { valido: boolean; motivo?: string } {
  const catalogo = store.catalogoAtos.find(
    (c) => c.especialidade_codigo === base.especialidade_destino && c.ato_codigo === base.ato_codigo,
  );
  if (!catalogo) return { valido: false, motivo: `Acto desconhecido (${base.especialidade_destino}/${base.ato_codigo})` };
  for (const codigo of base.exames ?? []) {
    if (!store.exames.some((e) => e.codigo_exame === codigo)) return { valido: false, motivo: `Exame desconhecido (${codigo})` };
  }
  for (const codigo of base.analises ?? []) {
    if (!store.analises.some((a) => a.codigo === codigo)) return { valido: false, motivo: `Análise desconhecida (${codigo})` };
  }
  return { valido: true };
}

async function processarEntrada(
  entrada: EntradaCacheExtracao,
  doenteId: string,
  medicoId: string,
  texto: string,
  contexto: ContextoExtracao,
  quando: Date,
  fornecedor: NomeFornecedor,
  usouFallback: boolean,
): Promise<ResultadoExtracao> {
  const pedidos: Pedido[] = [];
  const mensagensAlerta: string[] = [];

  for (const base of entrada.pedidos) {
    if (base.origem_regra?.startsWith("DICIONARIO:")) {
      const [, medico, termo] = base.origem_regra.split(":");
      if (!resolverTermo(termo, medico)) {
        mensagensAlerta.push(
          registarAlertaTexto(contexto.especialidadeOrigem, doenteId, quando, `Termo '${termo}' não reconhecido. Não foi criado pedido. Confirmar o que significa.`),
        );
        continue;
      }
      const pedido = construirPedido(base, doenteId, medicoId, contexto, quando);
      pedido.origem_dicionario = true;
      pedidos.push(pedido);
      continue;
    }

    const validacao = codigoValido(base);
    if (!validacao.valido) {
      mensagensAlerta.push(registarAlertaTexto(contexto.especialidadeOrigem, doenteId, quando, `${validacao.motivo}. Não foi criado pedido.`));
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

  for (const alertaBase of entrada.alertas) {
    mensagensAlerta.push(registarAlertaTexto(contexto.especialidadeOrigem, doenteId, quando, alertaBase.mensagem));
  }

  detectarUrgencia(texto, pedidos, contexto.especialidadeOrigem, doenteId, quando);

  return { pedidos, alertas: mensagensAlerta, fornecedorUsado: fornecedor, usouFallback };
}

function registarAlertaTexto(especialidade: string, doenteId: string, quando: Date, descricao: string): string {
  return criarAlerta(
    { tipo: "TERMO_DESCONHECIDO", gravidade: "media", especialidade, pedido_id: "", doente_id: doenteId, descricao },
    quando,
  ).descricao;
}

/** Termos como "urgente hoje"/"emergência", ou prazo < 72h, geram alerta para uma pessoa (fora do sistema). */
function detectarUrgencia(texto: string, pedidos: Pedido[], especialidade: string, doenteId: string, quando: Date): void {
  const textoUrgente = REGEX_URGENCIA.test(texto);
  for (const pedido of pedidos) {
    const prazoCurto = diferencaDias(new Date(pedido.prazo_limite), quando) < HORIZONTE_URGENCIA_DIAS;
    if (!textoUrgente && !prazoCurto) continue;
    criarAlerta(
      {
        tipo: "URGENCIA",
        gravidade: "alta",
        especialidade,
        pedido_id: pedido.pedido_id,
        doente_id: doenteId,
        descricao: "Pedido urgente: avisar alguém fora do sistema (telefone/presencial), além do pedido criado.",
      },
      quando,
    );
  }
}

function construirPedido(
  base: PedidoExtraido,
  doenteId: string,
  medicoId: string,
  contexto: ContextoExtracao,
  quando: Date,
): Pedido {
  // A prioridade é calculada pelo sistema (equação em server/motor/prioridade.ts), a partir
  // dos dados estruturados já validados desta extracção — nunca por adivinhação sobre texto
  // livre. Uma prioridade explícita (do médico, do dicionário, ou de uma correcção) prevalece
  // sempre; o cálculo automático só decide quando ninguém a indicou.
  const doente = store.doentes.find((d) => d.doente_id === doenteId) ?? null;
  const resultadoEquacao = calcularPrioridadeSistema(
    {
      tipo_pedido: base.tipo_pedido,
      ato_codigo: base.ato_codigo,
      prazo_dias: base.prazo_dias,
      especificacao: base.especificacao,
      texto_origem: base.texto_origem,
      prioridade_sugerida: base.prioridade ?? null,
    },
    doente,
    undefined,
    base.especialidade_destino,
  );
  const prioridade: Prioridade = base.prioridade ?? resultadoEquacao.prioridade;
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
    score_prioridade: resultadoEquacao.score,
    equacao_prioridade_detalhe: resultadoEquacao.detalheEquacao,
    prioridade_calculada_sistema: base.prioridade == null,
  };
  store.pedidos.push(pedido);
  registarEvento(pedido, "EXTRACAO", "EXTRAIDO", "AGENTE", {
    detalhe: `confiança ${base.confianca}`,
    dataHora: quando,
  });
  return pedido;
}
