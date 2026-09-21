// Se EXTRACTOR foi injectado pelo ambiente como "cache", mas existe GEMINI_API_KEY real,
// desactiva essa sobreposição para que o Gemini seja utilizado por defeito como pedido.
if (process.env.EXTRACTOR === "cache" && process.env.GEMINI_API_KEY) {
  delete process.env.EXTRACTOR;
}

import "./server/index.ts";
