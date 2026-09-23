import { useEffect, useRef, useState } from "react";
import { NomeDoente } from "../../components/NomeDoente";
import { OasisPainel, OasisShell } from "../../oasis/OasisShell";
import { apiGet } from "../../lib/api";

interface Especialidade {
  codigo: string;
  descricao: string;
}

interface Vaga {
  vaga_id: string;
  data_hora: string;
  duracao_min: number;
  gabinete_descricao: string;
  medico_nome: string;
  livre: boolean;
  doente_id?: string;
  doente_nome?: string;
  ato_descricao?: string;
  ato_estado?: string;
}

interface RespostaAgendas {
  especialidade: string;
  dia: string;
  vagas: Vaga[];
}

const INTERVALO_ACTUALIZACAO_MS = 4000;
const DURACAO_DESTAQUE_MS = 5000;

export function OasisAgendas() {
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [especialidade, setEspecialidade] = useState("");
  const [dia, setDia] = useState("");
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [destacadas, setDestacadas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const ocupadasAntes = useRef<Set<string>>(new Set());

  useEffect(() => {
    apiGet<Especialidade[]>("/oasis/especialidades").then((lista) => {
      setEspecialidades(lista);
      setEspecialidade((actual) => actual || lista[0]?.codigo || "");
    });
    apiGet<{ demoDate: string }>("/estado").then((r) => setDia(r.demoDate));
  }, []);

  useEffect(() => {
    if (!especialidade || !dia) return;
    let activo = true;
    async function actualizar() {
      try {
        const r = await apiGet<RespostaAgendas>(`/oasis/agendas?especialidade=${especialidade}&dia=${dia}`);
        if (!activo) return;
        const ocupadasAgora = new Set(r.vagas.filter((v) => !v.livre).map((v) => v.vaga_id));
        const novas = [...ocupadasAgora].filter((id) => !ocupadasAntes.current.has(id));
        if (novas.length > 0) {
          setDestacadas((atual) => new Set([...atual, ...novas]));
          novas.forEach((id) => {
            setTimeout(() => {
              setDestacadas((atual) => {
                const seguinte = new Set(atual);
                seguinte.delete(id);
                return seguinte;
              });
            }, DURACAO_DESTAQUE_MS);
          });
        }
        ocupadasAntes.current = ocupadasAgora;
        setVagas(r.vagas);
        setErro(null);
      } catch (e) {
        if (activo) setErro(e instanceof Error ? e.message : String(e));
      } finally {
        if (activo) setACarregar(false);
      }
    }
    actualizar();
    const intervalo = setInterval(actualizar, INTERVALO_ACTUALIZACAO_MS);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, [especialidade, dia]);

  return (
    <OasisShell titulo="Agendas dos serviços">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          value={especialidade}
          onChange={(e) => setEspecialidade(e.target.value)}
          className="rounded border border-slate-400 bg-white px-2 py-1"
        >
          {especialidades.map((e) => (
            <option key={e.codigo} value={e.codigo}>
              {e.descricao}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dia}
          onChange={(e) => setDia(e.target.value)}
          className="rounded border border-slate-400 bg-white px-2 py-1"
        />
      </div>

      {erro && <p className="text-red-700">{erro}</p>}

      <OasisPainel>
        {aCarregar ? (
          <p className="text-slate-500">A carregar…</p>
        ) : vagas.length === 0 ? (
          <p className="text-slate-500">Sem vagas nesta especialidade para este dia.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-oasis-border text-xs uppercase text-slate-500">
                <th className="py-1 pr-2">Hora</th>
                <th className="py-1 pr-2">Gabinete</th>
                <th className="py-1 pr-2">Médico</th>
                <th className="py-1 pr-2">Estado</th>
                <th className="py-1 pr-2">Doente / acto</th>
              </tr>
            </thead>
            <tbody>
              {vagas.map((v) => (
                <tr
                  key={v.vaga_id}
                  className={`border-b border-slate-300 transition-colors duration-1000 ${
                    destacadas.has(v.vaga_id) ? "bg-amber-200" : v.livre ? "odd:bg-white even:bg-slate-100" : "bg-slate-200"
                  }`}
                >
                  <td className="py-1 pr-2 tabular-nums">{v.data_hora.slice(11, 16)}</td>
                  <td className="py-1 pr-2 text-slate-500">{v.gabinete_descricao}</td>
                  <td className="py-1 pr-2 text-slate-500">{v.medico_nome}</td>
                  <td className="py-1 pr-2 font-medium">{v.livre ? "Livre" : v.ato_estado ?? "Ocupada"}</td>
                  <td className="py-1 pr-2">
                    {v.livre ? <span className="text-slate-400">—</span> : <><NomeDoente id={v.doente_id} nome={v.doente_nome ?? ""} /> · {v.ato_descricao}</>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </OasisPainel>
    </OasisShell>
  );
}
