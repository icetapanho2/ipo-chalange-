// Fornecedor "anthropic". SDK @anthropic-ai/sdk, modelo em ANTHROPIC_MODEL, saída forçada
// via tool use com input_schema (o mesmo JSON schema dos outros fornecedores).
import Anthropic from "@anthropic-ai/sdk";
import { schemaExtracao } from "../schema.ts";
import type { AlertaExtraido, PedidoExtraido } from "../schema.ts";
import type { RespostaProvider } from "./gemini.ts";

const NOME_FERRAMENTA = "extrair_pedidos";

export function anthropicDisponivel(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function extrairComAnthropic(prompt: string): Promise<RespostaProvider> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada");

  const client = new Anthropic({ apiKey });
  const modelo = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

  const resposta = await client.messages.create({
    model: modelo,
    max_tokens: 4096,
    tools: [
      {
        name: NOME_FERRAMENTA,
        description: "Devolve os pedidos e alertas extraídos do plano da consulta.",
        input_schema: schemaExtracao() as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: NOME_FERRAMENTA },
    messages: [{ role: "user", content: prompt }],
  });

  const usoFerramenta = resposta.content.find(
    (bloco): bloco is Anthropic.ToolUseBlock => bloco.type === "tool_use",
  );
  if (!usoFerramenta) throw new Error("O Claude não devolveu o tool use esperado");
  const json = usoFerramenta.input as { pedidos?: PedidoExtraido[]; alertas?: AlertaExtraido[] };
  if (!Array.isArray(json.pedidos) || !Array.isArray(json.alertas)) {
    throw new Error("Resposta do Claude não tem o formato esperado (pedidos[]/alertas[])");
  }
  return json as RespostaProvider;
}
