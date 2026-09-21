// Fornecedor "local": Ollama (OLLAMA_URL, OLLAMA_MODEL) com saída em JSON, para produção
// num servidor do hospital sem chamadas a uma API externa.
import { schemaExtracao } from "../schema.ts";
import type { AlertaExtraido, PedidoExtraido } from "../schema.ts";
import type { RespostaProvider } from "./gemini.ts";

export function ollamaDisponivel(): boolean {
  return !!process.env.OLLAMA_URL;
}

export async function extrairComOllama(prompt: string): Promise<RespostaProvider> {
  const url = process.env.OLLAMA_URL;
  const modelo = process.env.OLLAMA_MODEL;
  if (!url) throw new Error("OLLAMA_URL não configurado");
  if (!modelo) throw new Error("OLLAMA_MODEL não configurado");

  const resposta = await fetch(`${url.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      stream: false,
      format: "json",
      messages: [
        {
          role: "user",
          content: `${prompt}\n\nSchema JSON a cumprir exactamente:\n${JSON.stringify(schemaExtracao())}`,
        },
      ],
    }),
  });
  if (!resposta.ok) throw new Error(`Ollama devolveu ${resposta.status}`);
  const corpo = (await resposta.json()) as { message?: { content?: string } };
  const texto = corpo.message?.content;
  if (!texto) throw new Error("Resposta vazia do Ollama");
  const json = JSON.parse(texto) as { pedidos?: PedidoExtraido[]; alertas?: AlertaExtraido[] };
  if (!Array.isArray(json.pedidos) || !Array.isArray(json.alertas)) {
    throw new Error("Resposta do Ollama não tem o formato esperado (pedidos[]/alertas[])");
  }
  return json as RespostaProvider;
}
