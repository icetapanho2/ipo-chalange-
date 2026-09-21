// Prompt partilhado por todos os fornecedores de LLM (secção 6 da especificação / CLAUDE.md):
// mesmo catálogo, mesmo dicionário, mesmas correcções anteriores do médico, para todos.
import { store } from "../store.ts";
import { termosReconhecidos } from "./dicionario.ts";

export interface ContextoPrompt {
  medicoId: string;
  s: string;
  o: string;
  a: string;
  p: string;
}

function listarCatalogo(): string {
  const linhas: string[] = [];
  for (const esp of store.especialidades) {
    linhas.push(`\n${esp.codigo} — ${esp.descricao} (entrada de pedidos externos: ${esp.entrada_pedidos_externos})`);
    for (const ato of store.catalogoAtos.filter((c) => c.especialidade_codigo === esp.codigo)) {
      linhas.push(`  ato ${ato.ato_codigo} (${ato.tipo_pedido}): ${ato.ato_descricao}`);
    }
  }
  linhas.push("\nExames (especialidade_codigo/ato_codigo → código: descrição):");
  for (const ex of store.exames) {
    linhas.push(`  ${ex.especialidade_codigo}/${ex.ato_codigo} → ${ex.codigo_exame}: ${ex.descricao_exame}`);
  }
  linhas.push("\nAnálises (código: descrição):");
  for (const an of store.analises) {
    linhas.push(`  ${an.codigo}: ${an.descricao}`);
  }
  return linhas.join("\n");
}

function listarDicionario(medicoId: string): string {
  const entradas = store.dicionario.filter(
    (d) => d.estado === "ATIVA" && (d.ambito === "GLOBAL" || d.ambito === medicoId),
  );
  return entradas.map((d) => `  "${d.termo}" → ${d.significado} (${d.mapeia_para})`).join("\n");
}

function listarCorrecoesAnteriores(medicoId: string): string {
  const correcoes = store.dicionario.filter((d) => d.ambito === medicoId && d.origem === "CORRECAO");
  if (correcoes.length === 0) return "  (nenhuma correcção anterior deste médico)";
  return correcoes.map((d) => `  "${d.termo}" → ${d.significado} (${d.mapeia_para})`).join("\n");
}

export function construirPrompt(ctx: ContextoPrompt): string {
  const pistas = termosReconhecidos(ctx.p, ctx.medicoId);
  const pistasTexto =
    pistas.length > 0
      ? pistas.map((d) => `  "${d.termo}" já reconhecido pelo dicionário → ${d.significado} (${d.mapeia_para})`).join("\n")
      : "  (nenhum termo do dicionário encontrado directamente no texto)";

  return `És o agente de extracção do MVP "Pedidos pós-consulta" de um hospital português. A tua única tarefa é ler o plano (campo P) escrito por um médico numa consulta e transformá-lo em pedidos estruturados para outros serviços, seguindo EXACTAMENTE o catálogo abaixo.

REGRA MAIS IMPORTANTE: se não reconheceres um termo, serviço ou código, NÃO INVENTES. Coloca-o em "alertas" com uma mensagem clara e não crias um pedido para essa parte. Só usa códigos que estejam literalmente no catálogo abaixo.

## Catálogo (especialidades, actos, exames, análises)
${listarCatalogo()}

## Dicionário de abreviaturas conhecidas (globais + deste médico)
${listarDicionario(ctx.medicoId)}

## Correcções anteriores deste médico (aprendizagem — dão pistas fortes de como ele escreve)
${listarCorrecoesAnteriores(ctx.medicoId)}

## Termos do dicionário encontrados neste texto (pista determinística, já resolvida)
${pistasTexto}

## Nota da consulta
S (subjectivo, só contexto): ${ctx.s || "(vazio)"}
O (objectivo, só contexto): ${ctx.o || "(vazio)"}
A (avaliação, só contexto): ${ctx.a || "(vazio)"}
P (plano — é isto que tens de transformar em pedidos): ${ctx.p}

## Instruções
- Um pedido por cada item distinto do plano (exame, análises, consulta, tratamento, HD).
- "depende_de" usa os índices (a partir de 0) de outros pedidos desta MESMA resposta.
- Prioridade: só preenche "MP" ou "P" se o médico a indicar explicitamente; caso contrário null (o sistema assume "N" por defeito).
- "1/12", "3/12", "6/12": prazo_dias/nao_antes_dias conforme o dicionário.
- "comigo": medico_preferido = "REQUISITANTE" e continuidade_obrigatoria = true.
- Termos como "urgente hoje", "emergência" ou prazos inferiores a 72 horas: cria o pedido na mesma e acrescenta um alerta de urgência.
- Responde só com JSON que cumpra o schema fornecido.`;
}
