import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiGet } from "../lib/api";
import { VagasLibertadas } from "../components/VagasLibertadas";
import { ListaChamadas } from "../components/ListaChamadas";
import { ParaDecidir } from "../components/servico/ParaDecidir";
import { PedidosServico } from "../components/servico/PedidosServico";
import { EstatisticasServico } from "../components/servico/EstatisticasServico";
import { EquacaoPrioridade } from "../components/servico/EquacaoPrioridade";
import { BarChart3, CalendarX2, Check, ClipboardList, Inbox, Phone, Settings2 } from "lucide-react";

type Aba = "decidir" | "vagas" | "chamadas" | "pedidos" | "estatisticas" | "definicoes";

/** ?aba=... (o Guião e o Início usam-no). Nomes antigos continuam a funcionar. */
const ALIASES: Record<string, Aba> = {
  decidir: "decidir",
  remarcacoes: "decidir",
  pendencias: "decidir",
  risco: "decidir",
  vagas: "vagas",
  chamadas: "chamadas",
  pedidos: "pedidos",
  carteira: "pedidos",
  estatisticas: "estatisticas",
  definicoes: "definicoes",
};

function abaDoUrl(search: string): Aba {
  return ALIASES[new URLSearchParams(search).get("aba") ?? ""] ?? "decidir";
}

interface Contagens {
  decidir: number;
  vagas: number;
  chamadas: number;
}

/**
 * Página da administrativa do serviço. Separadores pelo tipo de trabalho:
 *  - Para decidir: tudo o que muda uma marcação (remarcações, trocas, sem vaga) — sempre proposto pelo
 *    sistema com o porquê e validado por ela;
 *  - Vagas libertadas e Chamadas: o dia-a-dia com os doentes;
 *  - Pedidos e avisos: a carteira do serviço e o que acompanhar;
 *  - Estatísticas e Definições (a equação de prioridade deste serviço).
 */
export function Servico() {
  const { search } = useLocation();
  const [aba, setAba] = useState<Aba>(() => abaDoUrl(search));
  // Uma notificação ou o Início podem mandar para outro separador estando já nesta página.
  useEffect(() => setAba(abaDoUrl(search)), [search]);
  const [servico, setServico] = useState("");
  const [contagens, setContagens] = useState<Contagens>({ decidir: 0, vagas: 0, chamadas: 0 });
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    Promise.all([
      apiGet<{ especialidade_legivel: string; porEstado: Record<string, { decisao_pendente?: boolean }[]> }>("/servico/pedidos"),
      apiGet<{ pendentes: number }>("/servico/remarcacoes"),
      apiGet<unknown[]>("/servico/propostas"),
      apiGet<{ pendentes: unknown[] }>("/servico/vagas-libertadas"),
      apiGet<{ itens: { chamada?: unknown }[] }>("/servico/chamadas"),
    ])
      .then(([pedidos, remarcacoes, trocas, vagas, chamadas]) => {
        setServico(pedidos.especialidade_legivel);
        const semVaga = (pedidos.porEstado.SEM_VAGA ?? []).filter((p) => !p.decisao_pendente).length;
        setContagens({
          decidir: remarcacoes.pendentes + trocas.length + semVaga,
          vagas: vagas.pendentes.length,
          chamadas: chamadas.itens.filter((i) => !i.chamada).length,
        });
      })
      .catch(() => undefined);
  }, [versao]);

  function aoMudar(m: string) {
    setMensagem(m);
    setVersao((v) => v + 1);
    setTimeout(() => setMensagem(null), 6000);
  }

  const abas: { chave: Aba; titulo: string; icone: React.ElementType; n?: number }[] = [
    { chave: "decidir", titulo: "Para decidir", icone: Inbox, n: contagens.decidir },
    { chave: "vagas", titulo: "Vagas libertadas", icone: CalendarX2, n: contagens.vagas },
    { chave: "chamadas", titulo: "Chamadas", icone: Phone, n: contagens.chamadas },
    { chave: "pedidos", titulo: "Pedidos e avisos", icone: ClipboardList },
    { chave: "estatisticas", titulo: "Estatísticas", icone: BarChart3 },
    { chave: "definicoes", titulo: "Definições", icone: Settings2 },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="border-b border-slate-200 pb-3">
        <h1 className="text-xl font-bold text-slate-800">Serviço · {servico}</h1>
        <p className="mt-0.5 text-xs text-slate-500">O sistema propõe sempre a solução e o porquê; nenhuma marcação muda sem a sua validação.</p>
      </div>

      <nav className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {abas.map((a) => (
          <button
            key={a.chave}
            type="button"
            onClick={() => setAba(a.chave)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              aba === a.chave ? "bg-oasis-header text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <a.icone className="h-3.5 w-3.5" />
            {a.titulo}
            {!!a.n && (
              <span className={`rounded-full px-1.5 text-[10px] ${aba === a.chave ? "bg-white/25" : a.chave === "decidir" ? "bg-rose-600 text-white" : "bg-slate-300 text-slate-800"}`}>
                {a.n}
              </span>
            )}
          </button>
        ))}
      </nav>

      {mensagem && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-sm font-semibold text-emerald-800">
          <Check className="h-4 w-4" /> {mensagem}
        </div>
      )}

      {aba === "decidir" && <ParaDecidir aoMudar={aoMudar} />}
      {aba === "vagas" && <VagasLibertadas aoMudar={aoMudar} />}
      {aba === "chamadas" && <ListaChamadas aoMudar={aoMudar} />}
      {aba === "pedidos" && <PedidosServico aoMudar={aoMudar} />}
      {aba === "estatisticas" && <EstatisticasServico />}
      {aba === "definicoes" && <EquacaoPrioridade aoMudar={aoMudar} />}
    </div>
  );
}
