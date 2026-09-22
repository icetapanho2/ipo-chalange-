import { Suspense, lazy } from "react";
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
import { Guiao } from "./pages/Guiao";
import { Tecnico } from "./pages/Tecnico";
import { GestaoPrioridade } from "./pages/GestaoPrioridade";

// Carregado à parte: é a única página que usa a biblioteca de gráficos (recharts),
// de longe a maior dependência do bundle — não vale a pena pagar esse custo em todas
// as outras páginas, que a maioria dos perfis usa muito mais vezes na demo.
const Gestao = lazy(() => import("./pages/Gestao").then((m) => ({ default: m.Gestao })));

const ITENS_NAV: ItemNav[] = [
  { caminho: "/", etiqueta: "Início" },
  { caminho: "/oasis/medico", etiqueta: "Oasis · Médico" },
  { caminho: "/oasis/agendas", etiqueta: "Oasis · Agendas" },
  { caminho: "/validacao", etiqueta: "Validação" },
  { caminho: "/dicionario", etiqueta: "Dicionário" },
  { caminho: "/triagem", etiqueta: "Triagem" },
  { caminho: "/meus-pedidos", etiqueta: "Meus pedidos" },
  { caminho: "/servico", etiqueta: "Serviço" },
  { caminho: "/tecnico", etiqueta: "Técnico" },
  { caminho: "/gestao", etiqueta: "Gestão" },
  { caminho: "/guiao", etiqueta: "Guião & Testes" },
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
        <Route path="/tecnico" element={<Tecnico />} />
        <Route path="/gestao/prioridade" element={<GestaoPrioridade />} />
        <Route
          path="/gestao"
          element={
            <Suspense fallback={<p className="px-4 py-6 text-slate-500">A carregar…</p>}>
              <Gestao />
            </Suspense>
          }
        />
        <Route path="/guiao" element={<Guiao />} />
      </Routes>
    </BrowserRouter>
  );
}
