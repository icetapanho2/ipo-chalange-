import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { Wrench, Send, Clock, CheckCircle2 } from "lucide-react";

interface Especialidade {
  codigo: string;
  descricao: string;
}

interface AtoCatalogo {
  especialidade_codigo: string;
  ato_codigo: string;
  ato_descricao: string;
}

interface Catalogo {
  especialidades: Especialidade[];
  catalogoAtos: AtoCatalogo[];
}

interface AvariaResumo {
  avaria_id: string;
  especialidade_legivel: string;
  ato_legivel: string;
  descricao: string;
  duracao_dias: number;
  criado_em: string;
  estado: "ABERTA" | "RESOLVIDA";
  decisao: string;
  pedidos_afetados: number;
}

const NOME_DECISAO: Record<string, string> = {
  REMARCACAO_TOTAL: "Remarcação total",
  REMARCACAO_PARCIAL: "Remarcação parcial",
};

export function Tecnico() {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [avarias, setAvarias] = useState<AvariaResumo[]>([]);
  const [especialidade, setEspecialidade] = useState("");
  const [atoCodigo, setAtoCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [duracaoDias, setDuracaoDias] = useState(1);
  // Por omissão a avaria começa amanhã (dia da demo + 1): as marcações de hoje já estão a decorrer.
  const [dataInicio, setDataInicio] = useState("");
  useEffect(() => {
    apiGet<{ demoDate: string }>("/estado")
      .then((r) => {
        const d = new Date(`${r.demoDate}T12:00`);
        d.setDate(d.getDate() + 1);
        setDataInicio(d.toISOString().slice(0, 10));
      })
      .catch(() => undefined);
  }, []);
  const [aEnviar, setAEnviar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  function carregar() {
    apiGet<Catalogo>("/tecnico/catalogo").then((c) => {
      setCatalogo(c);
      if (!especialidade && c.especialidades[0]) setEspecialidade(c.especialidades[0].codigo);
    });
    apiGet<AvariaResumo[]>("/tecnico/avarias").then(setAvarias);
  }

  useEffect(carregar, []); // eslint-disable-line react-hooks/exhaustive-deps

  const atosDoServico = catalogo?.catalogoAtos.filter((a) => a.especialidade_codigo === especialidade) ?? [];

  async function reportar() {
    setErro(null);
    setSucesso(null);
    if (!descricao.trim()) {
      setErro("Descreva a avaria.");
      return;
    }
    setAEnviar(true);
    try {
      await apiPost("/tecnico/avarias", {
        especialidade_codigo: especialidade,
        ato_codigo: atoCodigo,
        descricao: descricao.trim(),
        duracao_dias: duracaoDias,
        data_inicio: dataInicio || undefined,
      });
      setSucesso("Avaria reportada. A administração do serviço já recebeu o plano de remarcação das marcações afectadas.");
      setDescricao("");
      setAtoCodigo("");
      setDuracaoDias(1);
      carregar();
      setTimeout(() => setSucesso(null), 5000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAEnviar(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Wrench className="h-5 w-5 text-oasis-accent" />
          <span>Reportar Avaria de Serviço ou Equipamento</span>
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          A administração do serviço afectado é notificada de imediato e decide se aplica remarcação total (todo o
          serviço) ou parcial (só o acto/equipamento indicado) para o período reportado.
        </p>
      </div>

      {erro && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{erro}</div>
      )}
      {sucesso && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{sucesso}</span>
        </div>
      )}

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Serviço afectado</label>
            <select
              value={especialidade}
              onChange={(e) => {
                setEspecialidade(e.target.value);
                setAtoCodigo("");
              }}
              className="w-full rounded border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
            >
              {catalogo?.especialidades.map((e) => (
                <option key={e.codigo} value={e.codigo}>
                  {e.descricao}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Acto/equipamento específico <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <select
              value={atoCodigo}
              onChange={(e) => setAtoCodigo(e.target.value)}
              className="w-full rounded border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
            >
              <option value="">Todo o serviço</option>
              {atosDoServico.map((a) => (
                <option key={a.ato_codigo} value={a.ato_codigo}>
                  {a.ato_descricao}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1">Descrição da avaria</label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={3}
            placeholder="Ex: TAC fora de serviço por avaria no detector."
            className="w-full rounded border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
          />
        </div>

        <div className="flex items-center gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Indisponível a partir de</label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="rounded border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Duração estimada (dias)</label>
            <input
              type="number"
              min={1}
              value={duracaoDias}
              onChange={(e) => setDuracaoDias(Math.max(1, Number(e.target.value) || 1))}
              className="w-28 rounded border border-slate-300 px-2.5 py-2 text-sm text-slate-800"
            />
          </div>
          <button
            type="button"
            onClick={reportar}
            disabled={aEnviar}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-oasis-header px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{aEnviar ? "A reportar…" : "Reportar avaria"}</span>
          </button>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">As minhas avarias reportadas</h2>
        {avarias.length === 0 ? (
          <p className="text-xs text-slate-400">Ainda não reportou nenhuma avaria.</p>
        ) : (
          <div className="space-y-2">
            {avarias.map((a) => (
              <div key={a.avaria_id} className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      {a.especialidade_legivel} · {a.ato_legivel}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">{a.descricao}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{a.criado_em.replace("T", " ")}</p>
                  </div>
                  {a.estado === "ABERTA" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                      <Clock className="h-3 w-3" />
                      <span>Aguarda decisão da administração</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>
                        {NOME_DECISAO[a.decisao] ?? a.decisao} · {a.pedidos_afetados} marcação(ões) afectada(s)
                      </span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
