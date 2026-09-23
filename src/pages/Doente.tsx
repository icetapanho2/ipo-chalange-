import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { FichaDoente } from "../components/FichaDoente";

export function Doente() {
  const { id } = useParams();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Início
      </Link>
      {id && <FichaDoente doenteId={id} />}
    </div>
  );
}
