import { useNavigate } from "react-router-dom";
import { usePerfil } from "../lib/PerfilContext";

interface AcaoPasso {
  etiqueta: string;
  utilizadorId: string;
  caminho: string;
}

interface Passo {
  numero: number;
  titulo: string;
  doente: string;
  descricao: string;
  resultado: string;
  acoes: AcaoPasso[];
}

const PASSOS: Passo[] = [
  {
    numero: 1,
    titulo: "Maria Fernandes — circuito completo",
    doente: "100101",
    descricao: "O médico escreve o plano A na consulta de hoje (09:30) e guarda; a administrativa aprova tudo.",
    resultado: "Colheita 24/09 07:30 → TC 14/10 08:00 (depende da colheita) → Revisão 21/10 08:30 (Dr. Pedro).",
    acoes: [
      { etiqueta: "1a. Escrever o plano", utilizadorId: "U01", caminho: "/oasis/medico" },
      { etiqueta: "1b. Validar", utilizadorId: "U03", caminho: "/validacao" },
    ],
  },
  {
    numero: 2,
    titulo: "José Carvalho — TAC cheio, troca segura",
    doente: "100104",
    descricao: "A administrativa aprova o TC já extraído (prazo 05/10); a Radiologia aprova a troca com o Manuel.",
    resultado: "José fica com 02/10 10:00; Manuel passa para 14/10 08:20 (dentro do seu prazo, 31/12).",
    acoes: [
      { etiqueta: "2a. Validar", utilizadorId: "U03", caminho: "/validacao" },
      { etiqueta: "2b. Aprovar a troca", utilizadorId: "U07", caminho: "/servico" },
    ],
  },
  {
    numero: 3,
    titulo: "Rosa Teixeira — abreviatura desconhecida",
    doente: "100105",
    descricao: "O médico escreve o plano B (09:50); a administrativa vê o alerta \"HPC\" e corrige para Manutenção CVC.",
    resultado: "Entrada \"HPC\" no dicionário do Dr. Pedro; CVC 24/09 09:00; colheita 24/09 07:30; revisão 14/10 08:50.",
    acoes: [
      { etiqueta: "3a. Escrever o plano", utilizadorId: "U01", caminho: "/oasis/medico" },
      { etiqueta: "3b. Corrigir e validar", utilizadorId: "U03", caminho: "/validacao" },
    ],
  },
  {
    numero: 4,
    titulo: "Carlos Mendes — abreviatura aprendida",
    doente: "100107",
    descricao: "O médico escreve o plano C (10:10): \"HPC\" já é reconhecida automaticamente, com selo \"aprendido\".",
    resultado: "CVC 24/09 09:30; revisão 14/10 09:30 (Dr. Pedro).",
    acoes: [
      { etiqueta: "4a. Escrever o plano", utilizadorId: "U01", caminho: "/oasis/medico" },
      { etiqueta: "4b. Validar", utilizadorId: "U03", caminho: "/validacao" },
    ],
  },
  {
    numero: 5,
    titulo: "Luísa Martins — triagem reencaminha",
    doente: "100103",
    descricao: "O triador de Onc. Médica reencaminha para Radioterapia; a triadora de RT aceita.",
    resultado: "1.ª consulta de Radioterapia marcada em 30/09 09:00.",
    acoes: [
      { etiqueta: "5a. Reencaminhar", utilizadorId: "U04", caminho: "/triagem" },
      { etiqueta: "5b. Aceitar em RT", utilizadorId: "U06", caminho: "/triagem" },
    ],
  },
  {
    numero: 6,
    titulo: "Fernando Lopes — Hospital de Dia",
    doente: "100108",
    descricao: "A triadora de Hospital de Dia aceita o pedido de HD.",
    resultado: "Sessão de HD 25/09 08:30; colheita pré-QT criada automaticamente (regra R2) para 24/09 07:40.",
    acoes: [{ etiqueta: "6. Aceitar em HD", utilizadorId: "U10", caminho: "/triagem" }],
  },
  {
    numero: 7,
    titulo: "António Ribeiro — semáforo vermelho",
    doente: "100102",
    descricao: "Abrir a timeline do doente: a revisão de 28/09 está a vermelho (faltou à colheita de 22/09).",
    resultado: "\"Remarcar exame\" agenda a colheita para 24/09 07:40 → o semáforo passa a amarelo.",
    acoes: [{ etiqueta: "7. Abrir o doente", utilizadorId: "U08", caminho: "/doente/100102" }],
  },
  {
    numero: 8,
    titulo: "Gestão",
    doente: "",
    descricao: "Abrir o dashboard de gestão, com 60 dias de histórico.",
    resultado: "Métricas preenchidas: tempos, prazos, pendentes, remarcações, aprendizagem da IA, triagem, impacto estimado.",
    acoes: [{ etiqueta: "8. Abrir Gestão", utilizadorId: "U12", caminho: "/gestao" }],
  },
];

export function Guiao() {
  const { definirUtilizadorId } = usePerfil();
  const navigate = useNavigate();

  function ir(acao: AcaoPasso) {
    definirUtilizadorId(acao.utilizadorId);
    navigate(acao.caminho);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-lg font-semibold text-slate-800">Guião da demo</h1>
      <p className="mt-1 text-sm text-slate-500">
        Os 8 passos da demo, pela ordem recomendada. Cada botão muda para o perfil certo e abre o ecrã certo.
      </p>

      <ol className="mt-4 space-y-3">
        {PASSOS.map((passo) => (
          <li key={passo.numero} className="rounded border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-baseline gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-white">
                {passo.numero}
              </span>
              <h2 className="font-medium text-slate-800">{passo.titulo}</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">{passo.descricao}</p>
            <p className="mt-1 text-sm text-emerald-700">→ {passo.resultado}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {passo.acoes.map((acao) => (
                <button
                  key={acao.etiqueta}
                  type="button"
                  onClick={() => ir(acao)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  {acao.etiqueta}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
