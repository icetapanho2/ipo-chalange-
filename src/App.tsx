import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Cabecalho } from "./components/Cabecalho";
import { GavetaDoente } from "./components/NomeDoente";
import { Tutorial } from "./components/Tutorial";
import { usePerfil } from "./lib/PerfilContext";
import { vigiarDados } from "./lib/api";
import { Inicio } from "./pages/Inicio";
import { OasisMedico } from "./pages/oasis/Medico";
import { OasisConsulta } from "./pages/oasis/Consulta";
import { OasisPedidosPosConsulta } from "./pages/oasis/PedidosPosConsulta";
import { OasisAgendas } from "./pages/oasis/Agendas";
import { Triagem } from "./pages/Triagem";
import { MeusPedidos } from "./pages/MeusPedidos";
import { Servico } from "./pages/Servico";
import { Doente } from "./pages/Doente";
import { Guiao } from "./pages/Guiao";
import { DefinicoesMedico } from "./pages/DefinicoesMedico";
import { Tecnico } from "./pages/Tecnico";
import { GestaoPrioridade } from "./pages/GestaoPrioridade";
import { LaboratorioPrioridades } from "./pages/LaboratorioPrioridades";

// Carregado à parte: é a única página que usa a biblioteca de gráficos (recharts),
// de longe a maior dependência do bundle — não vale a pena pagar esse custo em todas
// as outras páginas, que a maioria dos perfis usa muito mais vezes na demo.
const Gestao = lazy(() => import("./pages/Gestao").then((m) => ({ default: m.Gestao })));

vigiarDados();

export function App() {
  // Trocar de utilizador remonta a página: cada perfil vê os seus dados, mesmo sem mudar de endereço.
  const { utilizadorId } = usePerfil();
  return (
    <BrowserRouter>
      <Cabecalho />
      <GavetaDoente />
      <Tutorial />
      <Routes key={utilizadorId}>
        <Route path="/" element={<Inicio />} />
        <Route path="/oasis/medico" element={<OasisMedico />} />
        <Route path="/oasis/medico/:atoId" element={<OasisConsulta />} />
        <Route path="/oasis/medico/:atoId/pedidos" element={<OasisPedidosPosConsulta />} />
        <Route path="/oasis/agendas" element={<OasisAgendas />} />
        <Route path="/triagem" element={<Triagem />} />
        <Route path="/meus-pedidos" element={<MeusPedidos />} />
        <Route path="/servico" element={<Servico />} />
        <Route path="/doente/:id" element={<Doente />} />
        <Route path="/tecnico" element={<Tecnico />} />
        <Route path="/gestao/prioridade" element={<GestaoPrioridade />} />
        <Route path="/gestao/laboratorio" element={<LaboratorioPrioridades />} />
        <Route
          path="/gestao"
          element={
            <Suspense fallback={<p className="px-4 py-6 text-slate-500">A carregar…</p>}>
              <Gestao />
            </Suspense>
          }
        />
        <Route path="/guiao" element={<Guiao />} />
        <Route path="/definicoes" element={<DefinicoesMedico />} />
      </Routes>
    </BrowserRouter>
  );
}
