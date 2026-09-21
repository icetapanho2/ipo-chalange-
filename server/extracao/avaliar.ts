// npm run avaliar-extracao — corre os planos de dados/planos_teste.json contra o fornecedor
// de extracção configurado (EXTRACTOR) e mostra a percentagem de acerto por campo (secção 6
// da especificação / Fase 4 ponto 6 de PROMPTS.md).
import path from "node:path";
import { readJson } from "../csv.ts";
import { agora } from "../clock.ts";
import { extrair, fornecedorConfigurado } from "./index.ts";
import type { Prioridade, TipoPedido } from "../types.ts";

interface PedidoEsperado {
  tipo_pedido: TipoPedido;
  especialidade_destino: string;
  ato_codigo: string;
  exames?: string[];
  analises?: string[];
  prioridade?: Prioridade | null;
  prazo_dias?: number | null;
  nao_antes_dias?: number | null;
  continuidade_obrigatoria?: boolean;
}

interface Plano {
  id: string;
  medico: string;
  texto: string;
  esperado?: PedidoEsperado[];
  alertas?: string[];
  esperado_antes_de_aprender?: PedidoEsperado[];
  alertas_antes_de_aprender?: string[];
}

const CAMPOS = ["tipo_pedido", "especialidade_destino", "ato_codigo", "exames", "analises", "prioridade"] as const;

function conjuntoIgual(a: string[] = [], b: string[] = []): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((x) => setA.has(x));
}

async function main() {
  const caminho = path.join(process.cwd(), "dados", "planos_teste.json");
  const dados = readJson<{ planos: Plano[] }>(caminho);
  const fornecedor = fornecedorConfigurado();
  console.log(`Fornecedor configurado: ${fornecedor}\n`);

  const acertosPorCampo: Record<string, number> = Object.fromEntries(CAMPOS.map((c) => [c, 0]));
  let totalPares = 0;
  let contagemCorreta = 0;

  for (const plano of dados.planos) {
    const esperado = plano.esperado ?? plano.esperado_antes_de_aprender ?? [];
    const quando = agora();
    const resultado = await extrair(plano.texto, plano.medico, "AVALIACAO", {
      consultaAtoId: "",
      especialidadeOrigem: "2102",
      quando,
    });

    const contagemOk = resultado.pedidos.length === esperado.length;
    if (contagemOk) contagemCorreta++;

    const n = Math.min(resultado.pedidos.length, esperado.length);
    for (let i = 0; i < n; i++) {
      totalPares++;
      const produzido = resultado.pedidos[i];
      const alvo = esperado[i];
      if (produzido.tipo_pedido === alvo.tipo_pedido) acertosPorCampo.tipo_pedido++;
      if (produzido.especialidade_destino === alvo.especialidade_destino) acertosPorCampo.especialidade_destino++;
      if (produzido.ato_codigo === alvo.ato_codigo) acertosPorCampo.ato_codigo++;
      if (conjuntoIgual(produzido.exames, alvo.exames ?? [])) acertosPorCampo.exames++;
      if (conjuntoIgual(produzido.analises, alvo.analises ?? [])) acertosPorCampo.analises++;
      if (produzido.prioridade === (alvo.prioridade ?? "N")) acertosPorCampo.prioridade++;
    }

    console.log(
      `${plano.id}: ${resultado.pedidos.length}/${esperado.length} pedido(s) ${contagemOk ? "✓" : "✗"}` +
        (resultado.usouFallback ? " (fallback → cache)" : "") +
        (resultado.alertas.length > 0 ? ` — alertas: ${resultado.alertas.join(" | ")}` : ""),
    );
  }

  console.log("\n--- Acerto por campo (entre pedidos emparelhados por posição) ---");
  for (const campo of CAMPOS) {
    const pct = totalPares > 0 ? ((acertosPorCampo[campo] / totalPares) * 100).toFixed(0) : "—";
    console.log(`  ${campo.padEnd(22)} ${pct}%`);
  }
  const pctContagem = ((contagemCorreta / dados.planos.length) * 100).toFixed(0);
  console.log(`\nNúmero de pedidos certo em ${contagemCorreta}/${dados.planos.length} planos (${pctContagem}%).`);
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
