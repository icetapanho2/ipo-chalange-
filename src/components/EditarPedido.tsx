import { useMemo, useState } from "react";
import { apiPost } from "../lib/api";

export interface Catalogo {
  especialidades: { codigo: string; descricao: string }[];
  catalogoAtos: {
    especialidade_codigo: string;
    ato_codigo: string;
    ato_descricao: string;
    tipo_pedido: string;
  }[];
  exames: { codigo_exame: string; descricao_exame: string; especialidade_codigo: string; ato_codigo: string }[];
  analises: { codigo: string; descricao: string }[];
}

interface PedidoBase {
  pedido_id?: string;
  tipo_pedido?: string;
  especialidade_destino: string;
  ato_codigo: string;
  exames: string[];
  analises: string[];
  especificacao: string;
  prioridade: string;
}

interface AlertaOrigem {
  grupo: { consulta_ato_id: string; medico_id: string; doente_nome: string };
  alerta: { alerta_id: string; descricao: string };
}

export function EditarPedido({
  pedido,
  alertaOrigem,
  catalogo,
  onFechar,
  onGravado,
}: {
  pedido?: PedidoBase;
  alertaOrigem?: AlertaOrigem;
  catalogo: Catalogo;
  onFechar: () => void;
  onGravado: () => void;
}) {
  const [especialidade, setEspecialidade] = useState(pedido?.especialidade_destino ?? "");
  const [ato, setAto] = useState(pedido?.ato_codigo ?? "");
  const [exames, setExames] = useState<string[]>(pedido?.exames ?? []);
  const [analises, setAnalises] = useState<string[]>(pedido?.analises ?? []);
  const [especificacao, setEspecificacao] = useState(pedido?.especificacao ?? "");
  const [prioridade, setPrioridade] = useState(pedido?.prioridade || "N");
  const [ensinar, setEnsinar] = useState(false);
  const [termo, setTermo] = useState("");
  const [significado, setSignificado] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const atosDaEspecialidade = catalogo.catalogoAtos.filter((a) => a.especialidade_codigo === especialidade);
  const atoEscolhido = atosDaEspecialidade.find((a) => a.ato_codigo === ato);
  const examesDoAto = catalogo.exames.filter((e) => e.especialidade_codigo === especialidade && e.ato_codigo === ato);
  const mostraExames = especialidade === "7000_2" || especialidade === "7000_3";
  const mostraAnalises = especialidade === "6100";

  const mapeiaParaSugerido = useMemo(() => {
    if (!atoEscolhido) return "";
    const detalhe = mostraExames && exames.length ? `: ${exames.join("|")}` : mostraAnalises && analises.length ? `: ${analises.join("|")}` : "";
    return `${atoEscolhido.tipo_pedido} ${especialidade}/${ato}${detalhe}`;
  }, [atoEscolhido, especialidade, ato, exames, analises, mostraExames, mostraAnalises]);

  function alternar(lista: string[], definir: (l: string[]) => void, valor: string) {
    definir(lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);
  }

  async function gravar() {
    if (!especialidade || !ato) {
      setErro("Escolha a especialidade e o acto.");
      return;
    }
    setAGravar(true);
    setErro(null);
    const correcaoDicionario = ensinar && termo && significado ? { termo, significado, mapeiaPara: mapeiaParaSugerido } : undefined;
    try {
      if (pedido?.pedido_id) {
        await apiPost(`/validacao/pedidos/${pedido.pedido_id}/editar`, {
          alteracoes: {
            tipo_pedido: atoEscolhido?.tipo_pedido,
            especialidade_destino: especialidade,
            ato_codigo: ato,
            exames: mostraExames ? exames : [],
            analises: mostraAnalises ? analises : [],
            especificacao,
            prioridade,
          },
          correcaoDicionario,
        });
      } else if (alertaOrigem) {
        await apiPost(`/validacao/alertas/${alertaOrigem.alerta.alerta_id}/criar-pedido`, {
          consultaAtoId: alertaOrigem.grupo.consulta_ato_id,
          medicoId: alertaOrigem.grupo.medico_id,
          tipo_pedido: atoEscolhido?.tipo_pedido,
          especialidade_destino: especialidade,
          ato_codigo: ato,
          exames: mostraExames ? exames : [],
          analises: mostraAnalises ? analises : [],
          especificacao,
          prioridade,
          texto_origem: alertaOrigem.alerta.descricao,
          correcaoDicionario,
        });
      }
      onGravado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAGravar(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded bg-white p-4 shadow-lg">
        <h2 className="text-base font-semibold text-slate-800">
          {pedido ? "Editar pedido" : `Novo pedido a partir do alerta`}
        </h2>
        {alertaOrigem && <p className="mt-1 text-sm text-slate-500">{alertaOrigem.alerta.descricao}</p>}

        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              Especialidade
              <select
                className="mt-1 w-full rounded border border-slate-300 p-1.5"
                value={especialidade}
                onChange={(e) => {
                  setEspecialidade(e.target.value);
                  setAto("");
                }}
              >
                <option value="">—</option>
                {catalogo.especialidades.map((e) => (
                  <option key={e.codigo} value={e.codigo}>
                    {e.descricao}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Acto
              <select className="mt-1 w-full rounded border border-slate-300 p-1.5" value={ato} onChange={(e) => setAto(e.target.value)}>
                <option value="">—</option>
                {atosDaEspecialidade.map((a) => (
                  <option key={a.ato_codigo} value={a.ato_codigo}>
                    {a.ato_descricao}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {mostraExames && (
            <div>
              <p className="text-sm font-medium text-slate-600">Exames</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {examesDoAto.map((ex) => (
                  <label key={ex.codigo_exame} className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs">
                    <input type="checkbox" checked={exames.includes(ex.codigo_exame)} onChange={() => alternar(exames, setExames, ex.codigo_exame)} />
                    {ex.descricao_exame}
                  </label>
                ))}
              </div>
            </div>
          )}

          {mostraAnalises && (
            <div>
              <p className="text-sm font-medium text-slate-600">Análises</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {catalogo.analises.map((an) => (
                  <label key={an.codigo} className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs">
                    <input type="checkbox" checked={analises.includes(an.codigo)} onChange={() => alternar(analises, setAnalises, an.codigo)} />
                    {an.descricao}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="block text-sm">
            Especificação
            <input
              className="mt-1 w-full rounded border border-slate-300 p-1.5"
              value={especificacao}
              onChange={(e) => setEspecificacao(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            Prioridade
            <select className="mt-1 w-full rounded border border-slate-300 p-1.5" value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
              <option value="N">Normal</option>
              <option value="P">Prioritário</option>
              <option value="MP">Muito prioritário</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ensinar} onChange={(e) => setEnsinar(e.target.checked)} />
            Ensinar o dicionário deste médico (para não perguntar outra vez)
          </label>
          {ensinar && (
            <div className="grid grid-cols-2 gap-2 rounded border border-violet-200 bg-violet-50 p-2">
              <label className="text-sm">
                Termo
                <input className="mt-1 w-full rounded border border-slate-300 p-1.5" value={termo} onChange={(e) => setTermo(e.target.value)} />
              </label>
              <label className="text-sm">
                Significado
                <input
                  className="mt-1 w-full rounded border border-slate-300 p-1.5"
                  value={significado}
                  onChange={(e) => setSignificado(e.target.value)}
                />
              </label>
              <p className="col-span-2 text-xs text-slate-500">Mapeia para: {mapeiaParaSugerido || "—"}</p>
            </div>
          )}
        </div>

        {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="rounded border border-slate-300 px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            type="button"
            onClick={gravar}
            disabled={aGravar}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-900 disabled:opacity-50"
          >
            {aGravar ? "A gravar…" : "Gravar"}
          </button>
        </div>
      </div>
    </div>
  );
}
