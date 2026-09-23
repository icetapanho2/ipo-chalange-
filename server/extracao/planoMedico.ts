// Assistente de pedidos: lê o plano do diário (o que o médico escreve depois de "P/") e propõe uma
// pré-selecção para o assistente de pedidos. NÃO cria pedidos nem muda estado: o médico vê o que foi
// percebido no ecrã seguinte e confirma, altera ou apaga. Quando não percebe um pedaço, diz — nunca
// adivinha (regra de ouro 3).
//
// 1.º o dicionário (determinístico, instantâneo, funciona sem rede); 2.º, só se sobrar texto que o
// dicionário não percebe e houver um LLM configurado, o mesmo prompt/schema da extracção. Tudo o que
// vem do LLM é validado contra o catálogo; o que não existe no catálogo é descartado com um aviso.
import { store } from "../store.ts";
import { agora } from "../clock.ts";
import { isoData, somarDias, apenasData } from "../util.ts";
import { construirPrompt } from "./prompt.ts";
import { chamarFornecedorComTempoLimite, codigoValido, fornecedorConfigurado, fornecedorDisponivel } from "./index.ts";
import type { DicionarioEntrada, Prioridade, TipoPedido } from "../types.ts";

export interface PrePedido {
  tipo_pedido: TipoPedido;
  especialidade_destino: string;
  ato_codigo: string;
  exames: string[];
  analises: string[];
  especificacao: string;
  prioridade: Prioridade | "";
  nao_antes: string;
  depende_exames_consulta: boolean;
  continuidade_medico: boolean;
  /** O pedaço do plano de onde veio (mostrado ao médico). */
  texto_origem: string;
}

export interface InterpretacaoPlano {
  /** O texto depois de "P/" (null quando o diário não tem plano). */
  plano: string | null;
  pedidos: PrePedido[];
  avisos: string[];
  fonte: "dicionario" | "llm" | "nenhuma";
}

/** O plano é o texto depois do último "P/" do diário (é sempre esse o formato). */
export function extrairPlano(diario: string): string | null {
  const m = [...diario.matchAll(/(^|[\s(])P\/\s*/g)].pop();
  if (!m || m.index === undefined) return null;
  const plano = diario.slice(m.index + m[0].length).trim();
  return plano || null;
}

const eLetra = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

interface Ocorrencia {
  inicio: number;
  fim: number;
  entrada: DicionarioEntrada;
}

/** Termos do dicionário no texto, sem sobreposições (os mais compridos ganham) e só palavras inteiras. */
function ocorrencias(texto: string, medicoId: string): Ocorrencia[] {
  const minusculas = texto.toLowerCase();
  const entradas = store.dicionario
    .filter((d) => d.estado === "ATIVA" && (d.ambito === "GLOBAL" || d.ambito === medicoId))
    // O do médico antes do global para o mesmo termo; depois, termos mais compridos primeiro.
    .sort((a, b) => b.termo.length - a.termo.length || Number(b.ambito === medicoId) - Number(a.ambito === medicoId));
  const achadas: Ocorrencia[] = [];
  for (const entrada of entradas) {
    const termo = entrada.termo.toLowerCase();
    let desde = 0;
    for (;;) {
      const i = minusculas.indexOf(termo, desde);
      if (i < 0) break;
      desde = i + 1;
      const fim = i + termo.length;
      if (eLetra(texto[i - 1]) && eLetra(termo[0])) continue;
      if (eLetra(texto[fim]) && eLetra(termo[termo.length - 1])) continue;
      if (achadas.some((o) => i < o.fim && fim > o.inicio)) continue;
      achadas.push({ inicio: i, fim, entrada });
    }
  }
  return achadas.sort((a, b) => a.inicio - b.inicio);
}

type Mapeamento =
  | { tipo: "pedido"; tipo_pedido: TipoPedido; especialidade: string; ato: string; exames: string[] }
  | { tipo: "analises"; codigos: string[] }
  | { tipo: "especificacao" }
  | { tipo: "dependencia" }
  | { tipo: "continuidade" }
  | { tipo: "tempo"; dias: number | null }
  | { tipo: "prioridade"; valor: Prioridade }
  | { tipo: "ignorar" };

const TIPOS: TipoPedido[] = ["consulta", "pedido_consulta", "pedido_hd", "exame", "analises", "tratamento"];

function interpretarMapeamento(e: DicionarioEntrada): Mapeamento {
  const m = e.mapeia_para.trim();
  const pedido = m.match(/^(\w+)\s+([\w]+)(?:\/(\w+))?(?::\s*(.+))?$/);
  if (pedido && (TIPOS as string[]).includes(pedido[1])) {
    return {
      tipo: "pedido",
      tipo_pedido: pedido[1] as TipoPedido,
      especialidade: pedido[2],
      ato: pedido[3] ?? "",
      exames: pedido[4] ? pedido[4].split("|").map((c) => c.trim()) : [],
    };
  }
  if (/^A\d+(\|A\d+)*$/.test(m)) return { tipo: "analises", codigos: m.split("|") };
  if (m === "especificacao") return { tipo: "especificacao" };
  if (m === "dependencia") return { tipo: "dependencia" };
  if (m === "medico_preferido=REQUISITANTE") return { tipo: "continuidade" };
  if (m === "tempo") {
    const n = e.significado.match(/não antes de (\d+) dias/);
    return { tipo: "tempo", dias: n ? Number(n[1]) : null };
  }
  const prio = m.match(/^prioridade=(MP|P|N)$/);
  if (prio) return { tipo: "prioridade", valor: prio[1] as Prioridade };
  return { tipo: "ignorar" };
}

function novoPrePedido(tipo: TipoPedido, especialidade: string, ato: string, origem: string): PrePedido {
  return {
    tipo_pedido: tipo,
    especialidade_destino: especialidade,
    ato_codigo: ato,
    exames: [],
    analises: [],
    especificacao: "",
    prioridade: "",
    nao_antes: "",
    depende_exames_consulta: false,
    continuidade_medico: tipo === "consulta",
    texto_origem: origem,
  };
}

/** Pedaços do plano separados por ";", "," ou mudança de linha — cada um tem de ser percebido. */
function pedacos(plano: string): { inicio: number; fim: number; texto: string }[] {
  const r: { inicio: number; fim: number; texto: string }[] = [];
  const re = /[^;,\n]+/g;
  for (let m = re.exec(plano); m; m = re.exec(plano)) {
    const texto = m[0].trim();
    if (texto) r.push({ inicio: m.index, fim: m.index + m[0].length, texto });
  }
  return r;
}

/** Leitura pelo dicionário: devolve os pedidos e os pedaços que não percebeu. */
export function interpretarComDicionario(plano: string, medicoId: string, servicoConsulta: string, hoje: Date) {
  const achadas = ocorrencias(plano, medicoId);
  const pedidos: PrePedido[] = [];
  const naoPercebidos: string[] = [];
  let atual: PrePedido | null = null;
  const pendentes: Mapeamento[] = []; // atributos que aparecem antes de qualquer pedido
  const pedacosDoPlano = pedacos(plano);
  const pedacoDe = (i: number) => pedacosDoPlano.find((p) => i >= p.inicio && i < p.fim)?.texto ?? "";

  const aplicar = (p: PrePedido, m: Mapeamento, termo: DicionarioEntrada) => {
    if (m.tipo === "especificacao") p.especificacao = [p.especificacao, termo.significado.replace(/\s*\(.*\)$/, "")].filter(Boolean).join("; ");
    else if (m.tipo === "dependencia") p.depende_exames_consulta = true;
    else if (m.tipo === "continuidade") p.continuidade_medico = true;
    else if (m.tipo === "prioridade") p.prioridade = m.valor;
    else if (m.tipo === "tempo" && m.dias !== null) p.nao_antes = isoData(somarDias(hoje, m.dias));
  };

  for (const o of achadas) {
    const m = interpretarMapeamento(o.entrada);
    const origem = pedacoDe(o.inicio);
    if (m.tipo === "pedido") {
      // A próxima consulta é sempre no serviço desta consulta; análises e o mesmo exame juntam-se num pedido.
      const especialidade = m.tipo_pedido === "consulta" ? servicoConsulta : m.especialidade;
      const ato = m.tipo_pedido === "consulta" && m.especialidade !== servicoConsulta ? "" : m.ato;
      let p: PrePedido | undefined = pedidos.find(
        (x) =>
          (m.tipo_pedido === "analises" && x.tipo_pedido === "analises") ||
          (m.tipo_pedido === "exame" && x.tipo_pedido === "exame" && x.especialidade_destino === especialidade && x.ato_codigo === ato),
      );
      if (!p) {
        p = novoPrePedido(m.tipo_pedido, especialidade, ato, origem);
        pedidos.push(p);
      } else if (!p.ato_codigo && ato) p.ato_codigo = ato;
      for (const c of m.exames) if (!p.exames.includes(c)) p.exames.push(c);
      for (const pend of pendentes.splice(0)) aplicar(p, pend, o.entrada);
      atual = p;
    } else if (m.tipo === "analises") {
      let p = pedidos.find((x) => x.tipo_pedido === "analises");
      if (!p) {
        p = novoPrePedido("analises", "6100", "", origem);
        pedidos.push(p);
      }
      for (const c of m.codigos) if (!p.analises.includes(c)) p.analises.push(c);
      // As análises seguintes na mesma enumeração continuam a ser do mesmo pedido.
      atual = p;
    } else if (m.tipo !== "ignorar") {
      // "c/ exames", "comigo", "1/12" são da consulta; o resto aplica-se ao pedido corrente.
      const alvo =
        m.tipo === "dependencia" || m.tipo === "continuidade" || m.tipo === "tempo"
          ? [...pedidos].reverse().find((x) => x.tipo_pedido === "consulta") ?? atual
          : atual;
      if (alvo) aplicar(alvo, m, o.entrada);
      else pendentes.push(m);
    }
    // O texto de origem de cada pedido cresce com os pedaços onde aparece.
    if (atual && origem && !atual.texto_origem.includes(origem)) atual.texto_origem = [atual.texto_origem, origem].filter(Boolean).join(", ");
  }

  for (const p of pedacosDoPlano) {
    if (!achadas.some((o) => o.inicio >= p.inicio && o.inicio < p.fim)) naoPercebidos.push(p.texto);
  }
  for (const p of pedidos) {
    // As observações são obrigatórias no assistente: vão com o pedaço do plano (o médico edita).
    p.especificacao = [p.texto_origem, p.especificacao].filter(Boolean).join(" — ");
  }
  return { pedidos, naoPercebidos };
}

function deExtraido(x: import("./schema.ts").PedidoExtraido, servicoConsulta: string, hoje: Date): PrePedido {
  const p = novoPrePedido(x.tipo_pedido, x.tipo_pedido === "consulta" ? servicoConsulta : x.especialidade_destino, x.ato_codigo, x.texto_origem);
  p.exames = x.exames ?? [];
  p.analises = x.analises ?? [];
  p.especificacao = [x.texto_origem, x.especificacao].filter(Boolean).join(" — ");
  p.prioridade = x.prioridade ?? "";
  p.nao_antes = x.nao_antes_dias ? isoData(somarDias(hoje, x.nao_antes_dias)) : "";
  p.depende_exames_consulta = x.tipo_pedido === "consulta" && (x.depende_de?.length ?? 0) > 0;
  p.continuidade_medico = x.tipo_pedido === "consulta" && (!!x.continuidade_obrigatoria || x.medico_preferido === "REQUISITANTE");
  return p;
}

export async function interpretarPlano(diario: string, medicoId: string, servicoConsulta: string, quando: Date = agora()): Promise<InterpretacaoPlano> {
  const plano = extrairPlano(diario);
  if (!plano) return { plano: null, pedidos: [], avisos: [], fonte: "nenhuma" };
  const hoje = apenasData(quando);
  const porDicionario = interpretarComDicionario(plano, medicoId, servicoConsulta, hoje);
  const avisos = (naoPercebidos: string[]) =>
    naoPercebidos.map((t) => `Não percebi "${t}" — não foi seleccionado nada para isto. Escolha à mão, se for um pedido.`);

  if (porDicionario.naoPercebidos.length === 0) {
    return { plano, pedidos: porDicionario.pedidos, avisos: [], fonte: "dicionario" };
  }

  // Sobrou texto: o LLM (se houver um configurado) lê o plano inteiro; o que não existir no catálogo cai.
  const fornecedor = fornecedorConfigurado();
  if (fornecedor !== "cache" && fornecedorDisponivel(fornecedor)) {
    try {
      const prompt = construirPrompt({ medicoId, s: "", o: "", a: "", p: plano });
      const resposta = await chamarFornecedorComTempoLimite(fornecedor, prompt);
      const pedidos: PrePedido[] = [];
      const extra: string[] = resposta.alertas.map((a) => `${a.mensagem}${a.texto_origem ? ` ("${a.texto_origem}")` : ""}`);
      for (const x of resposta.pedidos) {
        const v = codigoValido(x);
        if (!v.valido) extra.push(`"${x.texto_origem}": ${v.motivo} — não seleccionado.`);
        else pedidos.push(deExtraido(x, servicoConsulta, hoje));
      }
      return { plano, pedidos, avisos: extra, fonte: "llm" };
    } catch {
      // Sem LLM a tempo: fica o que o dicionário percebeu, com o resto assinalado.
    }
  }
  return { plano, pedidos: porDicionario.pedidos, avisos: avisos(porDicionario.naoPercebidos), fonte: "dicionario" };
}
