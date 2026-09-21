import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { OasisPainel, OasisShell } from "../../oasis/OasisShell";
import { apiGet, apiPost } from "../../lib/api";

interface Ato {
  mvp_ato_id: string;
  data_hora: string;
  ato_descricao: string;
  especialidade_descricao: string;
  gabinete_descricao: string;
}

interface Doente {
  doente_id: string;
  nome: string;
  n_utente: string;
  data_nascimento: string;
  sexo: string;
}

interface Nota {
  s: string;
  o: string;
  a: string;
  p: string;
  guardado_em: string;
}

interface RespostaConsulta {
  ato: Ato;
  doente: Doente | null;
  nota: Nota | null;
}

interface RespostaGuardar {
  ok: boolean;
  pedidosCriados: number;
  pedidos: { pedido_id: string; tipo_pedido: string }[];
  alertas: string[];
}

const CAMPO: { chave: keyof Pick<Nota, "s" | "o" | "a" | "p">; etiqueta: string; ajuda: string }[] = [
  { chave: "s", etiqueta: "S — Subjectivo", ajuda: "O que o doente relata." },
  { chave: "o", etiqueta: "O — Objectivo", ajuda: "Achados ao exame objectivo." },
  { chave: "a", etiqueta: "A — Avaliação", ajuda: "Diagnóstico / avaliação clínica." },
  { chave: "p", etiqueta: "P — Plano", ajuda: "O plano: exames, análises, consultas, tratamentos. É este campo que o agente lê." },
];

export function OasisConsulta() {
  const { atoId } = useParams<{ atoId: string }>();
  const navigate = useNavigate();
  const [dados, setDados] = useState<RespostaConsulta | null>(null);
  const [campos, setCampos] = useState({ s: "", o: "", a: "", p: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const [resultado, setResultado] = useState<RespostaGuardar | null>(null);

  useEffect(() => {
    if (!atoId) return;
    apiGet<RespostaConsulta>(`/oasis/consulta/${atoId}`)
      .then((r) => {
        setDados(r);
        if (r.nota) setCampos({ s: r.nota.s, o: r.nota.o, a: r.nota.a, p: r.nota.p });
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }, [atoId]);

  async function guardar() {
    if (!atoId) return;
    setAGuardar(true);
    setErro(null);
    setResultado(null);
    try {
      const r = await apiPost<RespostaGuardar>(`/oasis/consulta/${atoId}/guardar`, campos);
      setResultado(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <OasisShell
      titulo="Consulta"
      acoes={
        <button
          type="button"
          onClick={() => navigate("/oasis/medico")}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-white hover:bg-white/10"
        >
          ← Voltar à agenda
        </button>
      }
    >
      {erro && <p className="mb-3 text-red-700">{erro}</p>}
      {!dados ? (
        <p className="text-slate-500">A carregar…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_1fr]">
          <OasisPainel titulo="Doente">
            <p className="font-medium">{dados.doente?.nome ?? dados.ato.data_hora}</p>
            <p className="text-slate-500">Nº utente {dados.doente?.n_utente}</p>
            <p className="text-slate-500">Nasc. {dados.doente?.data_nascimento}</p>
            <hr className="my-2 border-oasis-border" />
            <p className="text-slate-500">{dados.ato.especialidade_descricao}</p>
            <p className="font-medium">{dados.ato.ato_descricao}</p>
            <p className="text-slate-500">{dados.ato.gabinete_descricao}</p>
            <p className="tabular-nums text-slate-500">{dados.ato.data_hora.replace("T", " ")}</p>
          </OasisPainel>

          <OasisPainel titulo="Nota da consulta (SOAP)">
            <div className="space-y-3">
              {CAMPO.map((campo) => (
                <div key={campo.chave}>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">{campo.etiqueta}</label>
                  <textarea
                    className="w-full rounded border border-slate-300 bg-white p-2 text-sm text-slate-800 focus:border-oasis-accent focus:outline-none"
                    rows={campo.chave === "p" ? 3 : 2}
                    value={campos[campo.chave]}
                    onChange={(e) => setCampos((c) => ({ ...c, [campo.chave]: e.target.value }))}
                    placeholder={campo.ajuda}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={guardar}
                disabled={aGuardar}
                className="rounded bg-oasis-header px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {aGuardar ? "A guardar…" : "Guardar"}
              </button>
              {dados.nota && <span className="text-xs text-slate-500">Última nota guardada às {dados.nota.guardado_em.slice(11)}</span>}
            </div>

            {resultado && (
              <div className="mt-4 rounded border border-oasis-border bg-white p-3 text-sm">
                <p className="font-medium text-slate-700">
                  {resultado.pedidosCriados > 0
                    ? `O agente extraiu ${resultado.pedidosCriados} pedido(s) do plano.`
                    : "O agente não extraiu nenhum pedido do plano."}
                </p>
                {resultado.pedidos.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-slate-600">
                    {resultado.pedidos.map((p) => (
                      <li key={p.pedido_id}>{p.tipo_pedido}</li>
                    ))}
                  </ul>
                )}
                {resultado.alertas.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-amber-700">
                    {resultado.alertas.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  Segue para validação da administrativa (ecrã /validacao).
                </p>
              </div>
            )}
          </OasisPainel>
        </div>
      )}
    </OasisShell>
  );
}
