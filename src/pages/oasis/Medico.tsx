import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OasisPainel, OasisShell } from "../../oasis/OasisShell";
import { apiGet } from "../../lib/api";
import { usePerfil } from "../../lib/PerfilContext";

interface ItemAgenda {
  ato_id: string;
  data_hora: string;
  duracao_min: number;
  estado: string;
  ato_descricao: string;
  gabinete_descricao: string;
  doente_id: string;
  doente_nome: string;
  tem_nota: boolean;
}

interface RespostaAgenda {
  medico: { utilizador_id: string; nome: string };
  hoje: string;
  atos: ItemAgenda[];
}

function hora(dataHoraIso: string): string {
  return dataHoraIso.slice(11, 16);
}

export function OasisMedico() {
  const { utilizador } = usePerfil();
  const navigate = useNavigate();
  const [resposta, setResposta] = useState<RespostaAgenda | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  useEffect(() => {
    if (!utilizador) return;
    setACarregar(true);
    setErro(null);
    apiGet<RespostaAgenda>("/oasis/medico/agenda")
      .then(setResposta)
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setACarregar(false));
  }, [utilizador?.utilizador_id]);

  return (
    <OasisShell titulo="Agenda do médico">
      {!utilizador?.e_medico && (
        <OasisPainel>
          <p className="text-slate-600">
            Escolha um perfil de médico no cabeçalho (Dr. Pedro Almeida ou Dra. Sofia Lemos) para ver a agenda de hoje.
          </p>
        </OasisPainel>
      )}
      {utilizador?.e_medico && aCarregar && <p className="text-slate-500">A carregar agenda…</p>}
      {erro && <p className="text-red-700">{erro}</p>}
      {utilizador?.e_medico && resposta && (
        <OasisPainel titulo={`${resposta.medico.nome} — ${formatarDataCabecalho(resposta.hoje)}`}>
          {resposta.atos.length === 0 ? (
            <p className="text-slate-500">Sem consultas marcadas para hoje.</p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-oasis-border text-xs uppercase text-slate-500">
                  <th className="py-1 pr-2">Hora</th>
                  <th className="py-1 pr-2">Doente</th>
                  <th className="py-1 pr-2">Acto</th>
                  <th className="py-1 pr-2">Gabinete</th>
                  <th className="py-1 pr-2">Estado</th>
                  <th className="py-1 pr-2">Nota</th>
                </tr>
              </thead>
              <tbody>
                {resposta.atos.map((item) => (
                  <tr
                    key={item.ato_id}
                    onClick={() => navigate(`/oasis/medico/${item.ato_id}`)}
                    className="cursor-pointer border-b border-slate-300 odd:bg-white even:bg-slate-100 hover:bg-oasis-accent/20"
                  >
                    <td className="py-1 pr-2 tabular-nums">{hora(item.data_hora)}</td>
                    <td className="py-1 pr-2 font-medium">{item.doente_nome}</td>
                    <td className="py-1 pr-2">{item.ato_descricao}</td>
                    <td className="py-1 pr-2 text-slate-500">{item.gabinete_descricao}</td>
                    <td className="py-1 pr-2 text-slate-500">{item.estado}</td>
                    <td className="py-1 pr-2">{item.tem_nota ? "✓ guardada" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </OasisPainel>
      )}
    </OasisShell>
  );
}

function formatarDataCabecalho(isoData: string): string {
  const [ano, mes, dia] = isoData.split("-");
  return `${dia}/${mes}/${ano}`;
}
