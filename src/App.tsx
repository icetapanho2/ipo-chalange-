import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Cabecalho, type ItemNav } from "./components/Cabecalho";
import { Inicio } from "./pages/Inicio";
import { OasisMedico } from "./pages/oasis/Medico";
import { OasisConsulta } from "./pages/oasis/Consulta";
import { OasisAgendas } from "./pages/oasis/Agendas";
import { Validacao } from "./pages/Validacao";
import { Dicionario } from "./pages/Dicionario";

const ITENS_NAV: ItemNav[] = [
  { caminho: "/", etiqueta: "Início" },
  { caminho: "/oasis/medico", etiqueta: "Oasis · Médico" },
  { caminho: "/oasis/agendas", etiqueta: "Oasis · Agendas" },
  { caminho: "/validacao", etiqueta: "Validação" },
  { caminho: "/dicionario", etiqueta: "Dicionário" },
];

export function App() {
  return (
    <BrowserRouter>
      <Cabecalho itens={ITENS_NAV} />
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/oasis/medico" element={<OasisMedico />} />
        <Route path="/oasis/medico/:atoId" element={<OasisConsulta />} />
        <Route path="/oasis/agendas" element={<OasisAgendas />} />
        <Route path="/validacao" element={<Validacao />} />
        <Route path="/dicionario" element={<Dicionario />} />
      </Routes>
    </BrowserRouter>
  );
}
