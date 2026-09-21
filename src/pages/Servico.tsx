import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api";

interface ResumoPedido {
  pedido_id: string;
  doente_nome: string;
  medico_requisitante_nome: string;
  tipo_pedido_legivel: string;
  descricao: string;
  prioridade_legivel: string;
  prazo_limite: string;
  estado: string;
  estado_legivel: string;
  n_remarcacoes: number;
}

interface RespostaPedidos {
  especialidade: string;
  especialidade_legivel: string;
  porEstado: Record<string, ResumoPedido[]>;
}

interface AlertaServico {
  alerta_id: string;
  tipo: string;
  gravidade: string;
  descricao: string;
  doente_nome: string;
  criado_em: string;
}

interface PropostaServico {
  proposta_id: string;
  justificacao: string;
  criado_em: string;
  pedido_urgente_doente: string;
}

interface ConsultaEmRisco {
  pedido_id: string;
  doente_id: string;
  doente_nome: string;
  descricao: string;
  data_hora: string;
  porque: string;
}

const ORDEM_ESTADOS = ["EM_TRIAGEM", "ACEITE", "SEM_VAGA", "MARCADO", "DEVOLVIDO", "FALTOU", "REALIZADO", "RECUSADO", "CANCELADO"];

export function Servico() {
  const [pedidos, setPedidos] = useState<RespostaPedidos | null>(null);
  const [alertas, setAlertas] = useState<AlertaServico[] | null>(null);
  const [propostas, setPropostas] = useState<PropostaServico[] | null>(null);
  const [emRisco, setEmRisco] = useState<ConsultaEmRisco[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [accoes, setAccoes] = useState<Record<string, string>>({});

  function recarregar() {
    apiGet<RespostaPedidos>("/servico/pedidos").then(setPedidos).catch((e) => setErro(String(e)));
    apiGet<AlertaServico[]>("/servico/alertas").then(setAlertas);
    apiGet<PropostaServico[]>("/servico/propostas").then(setPropostas);
    apiGet<ConsultaEmRisco[]>("/servico/consultas-em-risco").then(setEmRisco);
  }

  useEffect(recarregar, []);

  async function fecharAlerta(id: string) {
    setErro(null);
    try {
      await apiPost(`/servico/alertas/${id}/fechar`, { accao: accoes[id] || "Verificado" });
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function decidirProposta(id: string, decisao: "aprovar" | "rejeitar") {
    setErro(null);
    try {
      await apiPost(`/servico/propostas/${id}/${decisao}`);
      recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-lg font-semibold text-slate-800">
        Serviço{pedidos ? ` — ${pedidos.especialidade_legivel}` : ""}
      </h1>
      {erro && <p className="mt-3 text-red-600">{erro}</p>}

      {emRisco && emRisco.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Consultas em risco (próximos 14 dias)</h2>
          <div className="mt-2 space-y-2">
            {emRisco.map((c) => (
              <Link
                key={c.pedido_id}
                to={`/doente/${c.doente_id}`}
                className="block rounded border border-red-300 bg-red-50 p-3 text-sm hover:bg-red-100"
              >
                <p className="font-medium text-red-900">
                  🔴 {c.doente_nome} — {c.descricao} ({c.data_hora.replace("T", " ")})
                </p>
                <p className="text-red-700">{c.porque}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {propostas && propostas.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Propostas de troca</h2>
          <div className="mt-2 space-y-2">
            {propostas.map((p) => (
              <div key={p.proposta_id} className="rounded border border-sky-300 bg-sky-50 p-3 text-sm">
                <p className="text-slate-700">{p.justificacao}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => decidirProposta(p.proposta_id, "aprovar")}
                    className="rounded bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-700"
                  >
                    Aprovar
                  </button>
                  <button
                    type="button"
                    onClick={() => decidirProposta(p.proposta_id, "rejeitar")}
                    className="rounded border border-red-300 px-3 py-1 text-red-700 hover:bg-red-50"
                  >
                    Rejeitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {alertas && alertas.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Alertas abertos</h2>
          <div className="mt-2 space-y-2">
            {alertas.map((a) => (
              <div key={a.alerta_id} className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="text-amber-900">
                  {a.gravidade === "alta" ? "🔴" : "🟡"} {a.descricao} {a.doente_nome && `(${a.doente_nome})`}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="flex-1 rounded border border-slate-300 p-1 text-sm"
                    placeholder="Acção tomada…"
                    value={accoes[a.alerta_id] ?? ""}
                    onChange={(e) => setAccoes((s) => ({ ...s, [a.alerta_id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => fecharAlerta(a.alerta_id)}
                    className="rounded bg-slate-800 px-3 py-1 text-white hover:bg-slate-900"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Pedidos por estado</h2>
        {pedidos &&
          ORDEM_ESTADOS.filter((estado) => pedidos.porEstado[estado]?.length).map((estado) => (
            <div key={estado} className="mt-3">
              <h3 className="text-sm font-medium text-slate-600">
                {pedidos.porEstado[estado][0].estado_legivel} ({pedidos.porEstado[estado].length})
              </h3>
              <table className="mt-1 w-full border-collapse text-left text-sm">
                <tbody>
                  {pedidos.porEstado[estado].map((p) => (
                    <tr key={p.pedido_id} className="border-b border-slate-100">
                      <td className="py-1 pr-2">{p.doente_nome}</td>
                      <td className="py-1 pr-2">{p.descricao}</td>
                      <td className="py-1 pr-2 text-slate-500">{p.medico_requisitante_nome}</td>
                      <td className="py-1 pr-2 text-slate-500">{p.prioridade_legivel}</td>
                      <td className="py-1 pr-2 text-slate-500">{p.prazo_limite}</td>
                      {p.n_remarcacoes > 0 && <td className="py-1 pr-2 text-amber-600">{p.n_remarcacoes}× remarcado</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </section>
    </div>
  );
}
