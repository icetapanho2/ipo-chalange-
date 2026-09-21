import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Cabecalho, type ItemNav } from "./components/Cabecalho";
import { Inicio } from "./pages/Inicio";

const ITENS_NAV: ItemNav[] = [{ caminho: "/", etiqueta: "Início" }];

export function App() {
  return (
    <BrowserRouter>
      <Cabecalho itens={ITENS_NAV} />
      <Routes>
        <Route path="/" element={<Inicio />} />
      </Routes>
    </BrowserRouter>
  );
}
