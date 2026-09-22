import { useEffect, useState } from "react";
import { dataPT } from "../lib/datas";
import { apiGet, apiPost } from "../lib/api";
import { usePerfil } from "../lib/PerfilContext";
import { DoenteModal } from "../components/DoenteModal";
import {
  CheckCircle2,
  XCircle,
  CornerUpRight,
  HelpCircle,
  Clock,
  Filter,
  Search,
  Check,
  Activity,
} from "lucide-react";

interface ItemFila {
  pedido_id: string;
  doente_id?: string;
  doente_nome: string;
  medico_requisitante_nome: string;
  especialidade_origem_legivel: string;
  tipo_pedido_legivel: string;
  descricao: string;
  prioridade: string;
  prioridade_legivel: string;
  prazo_limite: string;
  texto_plano: string;
  dependencias: { descricao: string; estado: string }[];
  pronto_a_agendar: boolean;
}

interface RespostaFila {
  especialidade: string;
  especialidade_legivel: string;
  fila: ItemFila[];
}

interface Especialidade {
  codigo: string;
  descricao: string;
}

export function Triagem() {
  const { utilizador } = usePerfil();
  const [resposta, setResposta] = useState<RespostaFila | null>(null);
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [aberto, setAberto] = useState<{ pedidoId: string; accao: "recusar" | "reencaminhar" | "pedir-informacao"; item: ItemFila } | null>(null);
  const [texto, setTexto] = useState("");
  const [destinoReencaminho, setDestinoReencaminho] = useState("");
  const [prioridades, setPrioridades] = useState<Record<string, string>>({});
  const [doenteModalId, setDoenteModalId] = useState<string | null>(null);
  const [filtroPrioridade, setFiltroPrioridade] = useState<string>("TODAS");
  const [pesquisa, setPesquisa] = useState("");
  const [aProcessar, setAProcessar] = useState(false);

  function recarregar() {
    apiGet<RespostaFila>("/triagem/fila")
      .then(setResposta)
      .catch((e) => setErro(String(e)));
  }

  useEffect(() => {
    recarregar();
    apiGet<Especialidade[]>("/triagem/especialidades").then(setEspecialidades);
  }, [utilizador?.utilizador_id]);

  async function aceitar(item: ItemFila) {
    setErro(null);
    setMensagemSucesso(null);
    setAProcessar(true);
    try {
      const prioridadeEscolhida = prioridades[item.pedido_id] || item.prioridade;
      await apiPost(`/triagem/${item.pedido_id}/aceitar`, { novaPrioridade: prioridadeEscolhida });
      setMensagemSucesso(`Pedido de ${item.doente_nome} aceite e agendado com prioridade "${prioridadeEscolhida}".`);
      recarregar();
      setTimeout(() => setMensagemSucesso(null), 5000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAProcessar(false);
    }
  }

  async function confirmarAccao() {
    if (!aberto) return;
    setErro(null);
    setMensagemSucesso(null);
    setAProcessar(true);
    try {
      if (aberto.accao === "recusar") {
        await apiPost(`/triagem/${aberto.pedidoId}/recusar`, { motivo: texto });
        setMensagemSucesso(`Pedido de ${aberto.item.doente_nome} recusado com o motivo registado.`);
      } else if (aberto.accao === "reencaminhar") {
        await apiPost(`/triagem/${aberto.pedidoId}/reencaminhar`, { especialidade: destinoReencaminho, motivo: texto });
        const espDesc = especialidades.find((e) => e.codigo === destinoReencaminho)?.descricao ?? destinoReencaminho;
        setMensagemSucesso(`Pedido de ${aberto.item.doente_nome} reencaminhado para ${espDesc}.`);
      } else {
        await apiPost(`/triagem/${aberto.pedidoId}/pedir-informacao`, { pergunta: texto });
        setMensagemSucesso(`Pedido de informação enviado ao Dr. ${aberto.item.medico_requisitante_nome}.`);
      }
      setAberto(null);
      setTexto("");
      setDestinoReencaminho("");
      recarregar();
      setTimeout(() => setMensagemSucesso(null), 5000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAProcessar(false);
    }
  }

  const filaFiltrada = resposta?.fila.filter((item) => {
    if (filtroPrioridade !== "TODAS" && item.prioridade !== filtroPrioridade) return false;
    if (pesquisa.trim()) {
      const q = pesquisa.toLowerCase();
      return (
        item.doente_nome.toLowerCase().includes(q) ||
        item.medico_requisitante_nome.toLowerCase().includes(q) ||
        item.descricao.toLowerCase().includes(q)
      );
    }
    return true;
  }) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Cabeçalho da Página de Triagem */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800">
              Triagem de Pedidos Inter-Serviços
            </h1>
            {resposta && (
              <span className="rounded-full bg-oasis-header px-3 py-0.5 text-xs font-bold text-white shadow-2xs">
                {resposta.especialidade_legivel}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Fila ordenada por urgência clínica e folga de prazo. Avalie a indicação, defina a prioridade final ou solicite esclarecimentos ao médico requisitante.
          </p>
        </div>

        {/* Contador */}
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-2xs flex items-center gap-2 text-xs">
            <Filter className="h-4 w-4 text-oasis-accent" />
            <span className="text-slate-500">Pedidos em Fila:</span>
            <strong className="text-slate-900 text-sm">{resposta?.fila.length ?? 0}</strong>
          </div>
        </div>
      </div>

      {erro && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <strong>Aviso:</strong> {erro}
        </div>
      )}

      {mensagemSucesso && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 animate-in fade-in">
          <Check className="h-4 w-4 text-emerald-600" />
          <span>{mensagemSucesso}</span>
        </div>
      )}

      {/* Barra de Filtros e Pesquisa */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-500 mr-1 uppercase text-[11px]">Prioridade:</span>
          {["TODAS", "MP", "P", "N"].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setFiltroPrioridade(p)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                filtroPrioridade === p
                  ? "bg-oasis-header text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {p === "TODAS" ? "Todas" : p === "MP" ? "Muito Prioritário (MP)" : p === "P" ? "Prioritário (P)" : "Normal (N)"}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-oasis-accent focus:bg-white focus:outline-none"
            placeholder="Pesquisar por doente, médico ou ato…"
            value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)}
          />
        </div>
      </div>

      {/* Lista de Pedidos em Triagem */}
      {!resposta && !erro && (
        <div className="mt-8 flex justify-center text-sm text-slate-400 gap-2 items-center">
          <Clock className="h-4 w-4 animate-spin text-oasis-header" />
          <span>A carregar fila de triagem…</span>
        </div>
      )}

      {resposta && filaFiltrada.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500 mb-2" />
          <h3 className="font-bold text-slate-700">Fila de Triagem Atualizada</h3>
          <p className="text-xs text-slate-500 mt-1">
            Não existem pedidos inter-serviços pendentes de triagem com os filtros selecionados.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-3.5">
        {filaFiltrada.map((item) => (
          <div
            key={item.pedido_id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition-all"
          >
            {/* Topo do Cartão de Triagem */}
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  {/* Nome do doente clicável com badge e modal de feedback */}
                  <button
                    type="button"
                    onClick={() => item.doente_id && setDoenteModalId(item.doente_id)}
                    className="font-bold text-base text-slate-900 hover:text-oasis-accent flex items-center gap-1.5 group text-left"
                    title="Clique para ver o que falta e o histórico clínico do doente"
                  >
                    <span>{item.doente_nome}</span>
                    <Activity className="h-3.5 w-3.5 text-sky-600 opacity-70 group-hover:opacity-100" />
                    <span className="text-[10px] rounded bg-sky-50 text-sky-700 px-1.5 py-0.2 font-medium">
                      Ver Prontidão
                    </span>
                  </button>
                  <span className="text-slate-300">·</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {item.tipo_pedido_legivel}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-slate-800 mt-1">{item.descricao}</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Requisitado por <strong className="text-slate-700">{item.medico_requisitante_nome}</strong> ({item.especialidade_origem_legivel}) · Prazo limite: <span className="font-mono text-slate-700 font-semibold">{dataPT(item.prazo_limite)}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    item.prioridade === "MP"
                      ? "bg-red-100 text-red-800"
                      : item.prioridade === "P"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {item.prioridade_legivel}
                </span>
              </div>
            </div>

            {/* Contexto Clínico: Texto do Plano de Origem */}
            <div className="mt-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Contexto Clínico Extraído da Consulta de Origem:
              </span>
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700 font-mono border border-slate-100 leading-relaxed">
                {item.texto_plano}
              </p>
            </div>

            {/* Dependências e Pré-Requisitos */}
            {item.dependencias.length > 0 && (
              <div className="mt-2.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2 text-xs">
                <span className="text-[11px] font-semibold text-slate-500">Dependências clínicas cruzadas:</span>
                <ul className="mt-1 list-disc pl-5 space-y-0.5 text-slate-600">
                  {item.dependencias.map((d, i) => (
                    <li key={i}>
                      {d.descricao} — <span className="font-medium">{d.estado}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Barra de Ação Clínica da Triagem */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              {/* Seletor de Prioridade e Ação de Aceitar */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 font-semibold">Prioridade:</label>
                <select
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs focus:border-oasis-accent focus:outline-none cursor-pointer"
                  value={prioridades[item.pedido_id] ?? item.prioridade}
                  onChange={(e) => setPrioridades((p) => ({ ...p, [item.pedido_id]: e.target.value }))}
                >
                  <option value="N">Normal (N)</option>
                  <option value="P">Prioritário (P)</option>
                  <option value="MP">Muito Prioritário (MP)</option>
                </select>
                <button
                  type="button"
                  disabled={aProcessar}
                  onClick={() => aceitar(item)}
                  className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 transition-transform active:scale-95"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Aceitar & Agendar</span>
                </button>
              </div>

              {/* Ações Secundárias: Pedir Info, Reencaminhar, Recusar */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={aProcessar}
                  onClick={() => setAberto({ pedidoId: item.pedido_id, accao: "pedir-informacao", item })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs flex items-center gap-1.5"
                  title="Devolver ao médico requisitante para esclarecimento"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-slate-500" />
                  <span>Pedir Informação</span>
                </button>

                <button
                  type="button"
                  disabled={aProcessar}
                  onClick={() => setAberto({ pedidoId: item.pedido_id, accao: "reencaminhar", item })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs flex items-center gap-1.5"
                  title="Reencaminhar para outro serviço hospitalar mais adequado"
                >
                  <CornerUpRight className="h-3.5 w-3.5 text-slate-500" />
                  <span>Reencaminhar</span>
                </button>

                <button
                  type="button"
                  disabled={aProcessar}
                  onClick={() => setAberto({ pedidoId: item.pedido_id, accao: "recusar", item })}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 shadow-2xs flex items-center gap-1.5"
                  title="Recusar pedido com fundamento clínico"
                >
                  <XCircle className="h-3.5 w-3.5 text-red-600" />
                  <span>Recusar</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de Ação da Triagem (Recusar / Reencaminhar / Pedir Informação) */}
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3 mb-3">
              {aberto.accao === "recusar" && <XCircle className="h-5 w-5 text-red-600" />}
              {aberto.accao === "reencaminhar" && <CornerUpRight className="h-5 w-5 text-oasis-accent" />}
              {aberto.accao === "pedir-informacao" && <HelpCircle className="h-5 w-5 text-amber-600" />}
              <h2 className="text-base font-bold text-slate-800">
                {aberto.accao === "recusar" && "Recusar Pedido de Consulta"}
                {aberto.accao === "reencaminhar" && "Reencaminhar Pedido para Outro Serviço"}
                {aberto.accao === "pedir-informacao" && "Pedir Esclarecimento Clínico ao Requisitante"}
              </h2>
            </div>

            <p className="text-xs text-slate-600 mb-2">
              Utente: <strong className="text-slate-800">{aberto.item.doente_nome}</strong> · Pedido: {aberto.item.descricao}
            </p>

            {aberto.accao === "reencaminhar" && (
              <div className="mb-3">
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                  Selecione o Serviço de Destino:
                </label>
                <select
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs font-semibold text-slate-800 focus:border-oasis-accent focus:bg-white focus:outline-none"
                  value={destinoReencaminho}
                  onChange={(e) => setDestinoReencaminho(e.target.value)}
                >
                  <option value="">Escolher serviço hospitalar…</option>
                  {especialidades
                    .filter((e) => e.codigo !== resposta?.especialidade)
                    .map((e) => (
                      <option key={e.codigo} value={e.codigo}>
                        {e.descricao}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Modelos rápidos de mensagem */}
            {aberto.accao === "pedir-informacao" && (
              <div className="mb-2 flex flex-wrap gap-1 text-[11px]">
                <span className="text-slate-400 self-center mr-1">Sugestões:</span>
                <button
                  type="button"
                  onClick={() => setTexto("Falta anexar relatório imagiológico ou biópsia recente.")}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600 hover:bg-slate-100"
                >
                  + Relatório imagiológico
                </button>
                <button
                  type="button"
                  onClick={() => setTexto("Solicita-se estadiamento TNM atualizado antes da avaliação cirúrgica.")}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600 hover:bg-slate-100"
                >
                  + Estadiamento
                </button>
              </div>
            )}

            <div className="mt-2">
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                {aberto.accao === "pedir-informacao" ? "Dúvida ou Documentação em Falta:" : "Justificação Clínica:"}
              </label>
              <textarea
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-oasis-accent focus:outline-none"
                rows={3}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={
                  aberto.accao === "pedir-informacao"
                    ? "Indique ao médico requisitante o que precisa de confirmar ou que exames faltam…"
                    : "Fundamento clínico para a recusa ou reencaminhamento…"
                }
              />
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  setAberto(null);
                  setTexto("");
                  setDestinoReencaminho("");
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={aProcessar || (aberto.accao === "reencaminhar" && !destinoReencaminho)}
                onClick={confirmarAccao}
                className="rounded-lg bg-oasis-header px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
              >
                {aProcessar ? "A processar…" : "Confirmar Decisão"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Universal do Doente para o Triador ver o que falta */}
      {doenteModalId && (
        <DoenteModal
          doenteId={doenteModalId}
          onFechar={() => setDoenteModalId(null)}
        />
      )}
    </div>
  );
}
