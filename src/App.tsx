import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Cabecalho, type ItemNav } from "./components/Cabecalho";
import { Inicio } from "./pages/Inicio";
import { OasisMedico } from "./pages/oasis/Medico";
import { OasisConsulta } from "./pages/oasis/Consulta";
import { OasisAgendas } from "./pages/oasis/Agendas";

const ITENS_NAV: ItemNav[] = [
  { caminho: "/", etiqueta: "Início" },
  { caminho: "/oasis/medico", etiqueta: "Oasis · Médico" },
  { caminho: "/oasis/agendas", etiqueta: "Oasis · Agendas" },
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
      </Routes>
    </BrowserRouter>
  );
}
