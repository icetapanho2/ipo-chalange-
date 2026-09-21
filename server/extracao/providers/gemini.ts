// Fornecedor "gemini" (por defeito quando GEMINI_API_KEY existe — o AI Studio configura-a
// automaticamente). SDK @google/genai, modelo em GEMINI_MODEL, saída estruturada em JSON.
import { GoogleGenAI } from "@google/genai";
import { schemaExtracao } from "../schema.ts";
import type { AlertaExtraido, PedidoExtraido } from "../schema.ts";

export interface RespostaProvider {
  pedidos: PedidoExtraido[];
  alertas: AlertaExtraido[];
}

export function geminiDisponivel(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export async function extrairComGemini(prompt: string): Promise<RespostaProvider> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");

  const ai = new GoogleGenAI({ apiKey });
  const modelo = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  const resposta = await ai.models.generateContent({
    model: modelo,
    contents: `${prompt}\n\nSchema JSON a cumprir exactamente:\n${JSON.stringify(schemaExtracao())}`,
    config: {
      responseMimeType: "application/json",
    },
  });

  const texto = resposta.text;
  if (!texto) throw new Error("Resposta vazia do Gemini");
  const json = JSON.parse(texto);
  if (!Array.isArray(json.pedidos) || !Array.isArray(json.alertas)) {
    throw new Error("Resposta do Gemini não tem o formato esperado (pedidos[]/alertas[])");
  }
  return json as RespostaProvider;
}
