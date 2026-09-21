import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Cabecalho, type ItemNav } from "./components/Cabecalho";
import { Inicio } from "./pages/Inicio";
import { OasisMedico } from "./pages/oasis/Medico";
import { OasisConsulta } from "./pages/oasis/Consulta";
import { OasisAgendas } from "./pages/oasis/Agendas";
import { Validacao } from "./pages/Validacao";
import { Dicionario } from "./pages/Dicionario";
import { Triagem } from "./pages/Triagem";
import { MeusPedidos } from "./pages/MeusPedidos";
import { Servico } from "./pages/Servico";
import { Doente } from "./pages/Doente";
import { Gestao } from "./pages/Gestao";
import { Guiao } from "./pages/Guiao";

const ITENS_NAV: ItemNav[] = [
  { caminho: "/", etiqueta: "Início" },
  { caminho: "/oasis/medico", etiqueta: "Oasis · Médico" },
  { caminho: "/oasis/agendas", etiqueta: "Oasis · Agendas" },
  { caminho: "/validacao", etiqueta: "Validação" },
  { caminho: "/dicionario", etiqueta: "Dicionário" },
  { caminho: "/triagem", etiqueta: "Triagem" },
  { caminho: "/meus-pedidos", etiqueta: "Meus pedidos" },
  { caminho: "/servico", etiqueta: "Serviço" },
  { caminho: "/gestao", etiqueta: "Gestão" },
  { caminho: "/guiao", etiqueta: "Guião" },
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
        <Route path="/triagem" element={<Triagem />} />
        <Route path="/meus-pedidos" element={<MeusPedidos />} />
        <Route path="/servico" element={<Servico />} />
        <Route path="/doente/:id" element={<Doente />} />
        <Route path="/gestao" element={<Gestao />} />
        <Route path="/guiao" element={<Guiao />} />
      </Routes>
    </BrowserRouter>
  );
}
