import { useState } from "react";
import {
  Stethoscope,
  FileSearch,
  FlaskConical,
  HeartPulse,
  Plus,
  Trash2,
  Sparkles,
  ArrowRight,
  Check,
} from "lucide-react";

export interface ItemConstrutor {
  id: string;
  categoria: "consulta" | "pedido_consulta" | "exame" | "analises" | "tratamento";
  especialidade?: string;
  prazoTexto: string;
  prioridade: "N" | "P" | "MP";
  detalhes: string[];
  especificacao?: string;
}

interface ConstrutorPedidosProps {
  especialidadeAtual: string;
  onAdicionarAoPlano: (textoGerado: string) => void;
}

const ESPECIALIDADES_DISPONIVEIS = [
  { codigo: "ONC", nome: "Oncologia Médica" },
  { codigo: "CIR", nome: "Cirurgia Geral" },
  { codigo: "GAS", nome: "Gastrenterologia" },
  { codigo: "IMG", nome: "Imagiologia / Radiologia" },
  { codigo: "PAT", nome: "Patologia Clínica (Laboratório)" },
  { codigo: "CAR", nome: "Cardiologia" },
  { codigo: "PNE", nome: "Pneumologia" },
  { codigo: "URO", nome: "Urologia" },
];

const EXAMES_SUGERIDOS = [
  "TC Tórax, Abdominal e Pélvica com contraste",
  "Ecografia Abdominal",
  "TC Tórax sem contraste",
  "Ressonância Magnética Pélvica",
  "Endoscopia Digestiva Alta",
  "Colonoscopia Total",
  "RX Tórax PA e Perfil",
];

const ANALISES_SUGERIDAS = [
  "Hemograma completo",
  "Creatinina, Ureia e Taxa de Filtração Glomerular",
  "Painel Hepático (AST, ALT, GGT, FA, Bilirrubinas)",
  "Ionograma (Sódio, Potássio, Cloro)",
  "Marcadores tumorais (CEA, CA 19-9)",
  "Perfil de Coagulação (PT, INR, aPTT)",
  "Urina II com Sedimento",
];

export function ConstrutorPedidos({ especialidadeAtual: _especialidadeAtual, onAdicionarAoPlano }: ConstrutorPedidosProps) {
  const [itens, setItens] = useState<ItemConstrutor[]>([
    {
      id: "1",
      categoria: "exame",
      prazoTexto: "em 3 semanas",
      prioridade: "P",
      detalhes: ["TC Tórax, Abdominal e Pélvica com contraste"],
      especificacao: "com contraste IV",
    },
    {
      id: "2",
      categoria: "analises",
      prazoTexto: "antes do TC",
      prioridade: "N",
      detalhes: ["Creatinina, Ureia e Taxa de Filtração Glomerular", "Hemograma completo"],
    },
    {
      id: "3",
      categoria: "consulta",
      prazoTexto: "em 4 semanas",
      prioridade: "P",
      detalhes: ["Consulta de Revisão com resultados de TC"],
    },
  ]);

  const [categoriaSel, setCategoriaSel] = useState<ItemConstrutor["categoria"]>("consulta");
  const [especialidadeSel, setEspecialidadeSel] = useState<string>("CIR");
  const [prazoSel, setPrazoSel] = useState<string>("em 3 semanas");
  const [prioridadeSel, setPrioridadeSel] = useState<"N" | "P" | "MP">("P");
  const [itensTextoLivre, setItensTextoLivre] = useState<string>("");

  function adicionarItem() {
    let detalhesFinais: string[] = [];
    if (itensTextoLivre.trim()) {
      detalhesFinais = itensTextoLivre.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      if (categoriaSel === "consulta") detalhesFinais = ["Consulta de seguimento"];
      else if (categoriaSel === "pedido_consulta") detalhesFinais = [`Interconsulta de ${ESPECIALIDADES_DISPONIVEIS.find(e => e.codigo === especialidadeSel)?.nome ?? especialidadeSel}`];
      else if (categoriaSel === "exame") detalhesFinais = ["TC Tórax, Abdominal e Pélvica com contraste"];
      else if (categoriaSel === "analises") detalhesFinais = ["Creatinina", "Hemograma"];
      else if (categoriaSel === "tratamento") detalhesFinais = ["Sessão de Tratamento em Hospital de Dia"];
    }

    const novo: ItemConstrutor = {
      id: String(Date.now()),
      categoria: categoriaSel,
      especialidade: categoriaSel === "pedido_consulta" ? especialidadeSel : undefined,
      prazoTexto: prazoSel,
      prioridade: prioridadeSel,
      detalhes: detalhesFinais,
    };

    setItens((prev) => [...prev, novo]);
    setItensTextoLivre("");
  }

  function removerItem(id: string) {
    setItens((prev) => prev.filter((it) => it.id !== id));
  }

  function alternarChip(texto: string, tipo: "exame" | "analises") {
    const arr = itensTextoLivre ? itensTextoLivre.split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (arr.includes(texto)) {
      setItensTextoLivre(arr.filter((t) => t !== texto).join(", "));
    } else {
      arr.push(texto);
      setItensTextoLivre(arr.join(", "));
    }
    if (tipo !== categoriaSel) {
      setCategoriaSel(tipo);
    }
  }

  function gerarTextoParaPlano(): string {
    const linhas: string[] = [];
    for (const it of itens) {
      const prioridadeDesc = it.prioridade === "MP" ? " (Muito Prioritário)" : it.prioridade === "P" ? " (Prioritário)" : "";
      if (it.categoria === "consulta") {
        linhas.push(`- Consulta de revisão da especialidade ${it.prazoTexto}${prioridadeDesc}`);
      } else if (it.categoria === "pedido_consulta") {
        const espNome = ESPECIALIDADES_DISPONIVEIS.find((e) => e.codigo === it.especialidade)?.nome ?? it.especialidade;
        linhas.push(`- Pedido de consulta / interconsulta a ${espNome} ${it.prazoTexto}${prioridadeDesc}`);
      } else if (it.categoria === "exame") {
        linhas.push(`- Pedir exame: ${it.detalhes.join(", ")} ${it.prazoTexto}${prioridadeDesc}${it.especificacao ? ` (${it.especificacao})` : ""}`);
      } else if (it.categoria === "analises") {
        linhas.push(`- Pedir análises: ${it.detalhes.join(", ")} ${it.prazoTexto}`);
      } else if (it.categoria === "tratamento") {
        linhas.push(`- Hospital de Dia: ${it.detalhes.join(", ")} ${it.prazoTexto}`);
      }
    }
    return linhas.join("\n");
  }

  function aplicarAoPlano() {
    const texto = gerarTextoParaPlano();
    onAdicionarAoPlano(texto);
  }

  return (
    <div className="rounded-xl border border-sky-200 bg-gradient-to-b from-sky-50/50 to-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Assistente Visual de Pedidos Clínicos</h3>
            <p className="text-xs text-slate-500">
              Construa pedidos estruturados com chips rápidos. O Agente Oasis traduz automaticamente para o catálogo hospitalar.
            </p>
          </div>
        </div>

        {/* Pré-configurações / Templates Rápidos */}
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="text-slate-400 self-center mr-1">Templates:</span>
          <button
            type="button"
            onClick={() => {
              setItens([
                {
                  id: "1",
                  categoria: "exame",
                  prazoTexto: "em 3 semanas",
                  prioridade: "P",
                  detalhes: ["TC Tórax, Abdominal e Pélvica com contraste"],
                  especificacao: "com contraste IV",
                },
                {
                  id: "2",
                  categoria: "analises",
                  prazoTexto: "antes do TC",
                  prioridade: "N",
                  detalhes: ["Creatinina, Ureia e Taxa de Filtração Glomerular", "Hemograma completo"],
                },
                {
                  id: "3",
                  categoria: "consulta",
                  prazoTexto: "em 4 semanas",
                  prioridade: "P",
                  detalhes: ["Consulta de Revisão com resultados de TC"],
                },
              ]);
            }}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 shadow-2xs"
          >
            Oncologia (TC + Sangue + Rev)
          </button>
          <button
            type="button"
            onClick={() => {
              setItens([
                {
                  id: "1",
                  categoria: "pedido_consulta",
                  especialidade: "CIR",
                  prazoTexto: "urgente (7 dias)",
                  prioridade: "MP",
                  detalhes: ["Interconsulta de Cirurgia Geral para avaliação cirúrgica"],
                },
                {
                  id: "2",
                  categoria: "exame",
                  prazoTexto: "em 1 semana",
                  prioridade: "MP",
                  detalhes: ["Ecografia Abdominal"],
                },
              ]);
            }}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 shadow-2xs"
          >
            Interconsulta Cirurgia (Urgente)
          </button>
        </div>
      </div>

      {/* Formulário de Inserção de Novo Pedido */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Tipo de Pedido</label>
          <select
            className="w-full rounded border border-slate-300 p-1.5 text-xs text-slate-800 bg-slate-50 focus:bg-white"
            value={categoriaSel}
            onChange={(e) => setCategoriaSel(e.target.value as ItemConstrutor["categoria"])}
          >
            <option value="consulta">Consulta de Revisão (Meu Serviço)</option>
            <option value="pedido_consulta">Pedido a Outro Serviço (Interconsulta)</option>
            <option value="exame">Exame Imagiológico / Diagnóstico</option>
            <option value="analises">Análises Clínicas (Laboratório)</option>
            <option value="tratamento">Hospital de Dia / Tratamento</option>
          </select>
        </div>

        {categoriaSel === "pedido_consulta" ? (
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Especialidade Destino</label>
            <select
              className="w-full rounded border border-slate-300 p-1.5 text-xs text-slate-800 bg-slate-50 focus:bg-white"
              value={especialidadeSel}
              onChange={(e) => setEspecialidadeSel(e.target.value)}
            >
              {ESPECIALIDADES_DISPONIVEIS.map((esp) => (
                <option key={esp.codigo} value={esp.codigo}>
                  {esp.nome}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Prazo Clínico</label>
            <select
              className="w-full rounded border border-slate-300 p-1.5 text-xs text-slate-800 bg-slate-50 focus:bg-white"
              value={prazoSel}
              onChange={(e) => setPrazoSel(e.target.value)}
            >
              <option value="em 1 semana">Urgente (1 semana / 7 dias)</option>
              <option value="em 2 semanas">Em 2 semanas (14 dias)</option>
              <option value="em 3 semanas">Em 3 semanas (21 dias)</option>
              <option value="em 1 mês">Em 1 mês (30 dias)</option>
              <option value="em 2 meses">Em 2 meses (60 dias)</option>
              <option value="em 3 meses">Em 3 meses (90 dias)</option>
              <option value="antes do TC">Antes do TC / Com antecedência</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Prioridade</label>
          <select
            className="w-full rounded border border-slate-300 p-1.5 text-xs text-slate-800 bg-slate-50 focus:bg-white"
            value={prioridadeSel}
            onChange={(e) => setPrioridadeSel(e.target.value as "N" | "P" | "MP")}
          >
            <option value="N">Normal (N)</option>
            <option value="P">Prioritário (P)</option>
            <option value="MP">Muito Prioritário (MP)</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={adicionarItem}
            className="w-full rounded bg-sky-700 py-1.5 px-3 text-xs font-semibold text-white shadow-sm hover:bg-sky-800 flex items-center justify-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Adicionar Pedido</span>
          </button>
        </div>
      </div>

      {/* Chips Rápidos de Exames e Análises */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-semibold text-slate-500 mr-1 text-[11px] uppercase">Atalhos rápidos:</span>
        {EXAMES_SUGERIDOS.slice(0, 4).map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => alternarChip(ex, "exame")}
            className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] text-sky-800 hover:bg-sky-100 transition-colors"
          >
            + {ex}
          </button>
        ))}
        {ANALISES_SUGERIDAS.slice(0, 3).map((an) => (
          <button
            key={an}
            type="button"
            onClick={() => alternarChip(an, "analises")}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] text-emerald-800 hover:bg-emerald-100 transition-colors"
          >
            + {an}
          </button>
        ))}
      </div>

      {/* Lista de Itens Criados */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
          <span>Pedidos a incluir no plano desta consulta ({itens.length})</span>
          <span className="text-[11px] font-normal text-slate-400">Arraste ou remova se necessário</span>
        </div>

        {itens.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
            Nenhum pedido adicionado ainda. Escolha os parâmetros acima ou clique num dos atalhos.
          </div>
        ) : (
          <div className="space-y-1.5">
            {itens.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-2xs hover:border-sky-300"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1 rounded bg-slate-100 text-slate-600">
                    {it.categoria === "consulta" && <Stethoscope className="h-4 w-4 text-sky-600" />}
                    {it.categoria === "pedido_consulta" && <HeartPulse className="h-4 w-4 text-purple-600" />}
                    {it.categoria === "exame" && <FileSearch className="h-4 w-4 text-indigo-600" />}
                    {it.categoria === "analises" && <FlaskConical className="h-4 w-4 text-emerald-600" />}
                    {it.categoria === "tratamento" && <HeartPulse className="h-4 w-4 text-rose-600" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800">
                        {it.categoria === "consulta"
                          ? "Consulta de Revisão"
                          : it.categoria === "pedido_consulta"
                          ? `Interconsulta a ${ESPECIALIDADES_DISPONIVEIS.find(e => e.codigo === it.especialidade)?.nome ?? it.especialidade}`
                          : it.categoria === "exame"
                          ? "Exame Imagiológico"
                          : it.categoria === "analises"
                          ? "Análises Clínicas"
                          : "Hospital de Dia"}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                          it.prioridade === "MP"
                            ? "bg-red-100 text-red-800"
                            : it.prioridade === "P"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {it.prioridade === "MP" ? "Muito Prioritário" : it.prioridade === "P" ? "Prioritário" : "Normal"}
                      </span>
                      <span className="text-[11px] text-slate-400">· {it.prazoTexto}</span>
                    </div>
                    <p className="text-slate-600 mt-0.5">{it.detalhes.join("; ")}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removerItem(it.id)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ação: Copiar/Transferir para o P */}
      <div className="mt-4 pt-3 border-t border-sky-100 flex items-center justify-between">
        <p className="text-[11px] text-slate-500">
          Ao clicar, o texto clínico gerado é inserido no campo <strong>P — Plano</strong> do formulário Oasis.
        </p>
        <button
          type="button"
          onClick={aplicarAoPlano}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 flex items-center gap-2 transition-transform active:scale-95"
        >
          <Check className="h-4 w-4" />
          <span>Sincronizar com Plano SOAP</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
