import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { apiGet, PERFIL_STORAGE_KEY } from "./api";

export interface Utilizador {
  utilizador_id: string;
  nome: string;
  perfil: "MEDICO" | "ADMINISTRATIVO" | "TRIADOR" | "GESTAO";
  especialidade_codigo: string;
  e_medico: boolean;
}

interface PerfilContextValor {
  utilizadores: Utilizador[];
  utilizadorId: string;
  utilizador: Utilizador | undefined;
  definirUtilizadorId: (id: string) => void;
  aCarregar: boolean;
}

const PerfilContext = createContext<PerfilContextValor | null>(null);

export function PerfilProvider({ children }: { children: ReactNode }) {
  const [utilizadores, setUtilizadores] = useState<Utilizador[]>([]);
  const [utilizadorId, setUtilizadorId] = useState<string>(() => {
    try {
      return localStorage.getItem(PERFIL_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [aCarregar, setACarregar] = useState(true);

  useEffect(() => {
    apiGet<Utilizador[]>("/utilizadores")
      .then((lista) => {
        setUtilizadores(lista);
        setUtilizadorId((actual) => (actual && lista.some((u) => u.utilizador_id === actual)) ? actual : lista[0]?.utilizador_id ?? "");
      })
      .finally(() => setACarregar(false));
  }, []);

  const definirUtilizadorId = useCallback((id: string) => {
    setUtilizadorId(id);
    try {
      localStorage.setItem(PERFIL_STORAGE_KEY, id);
    } catch {
      // localStorage indisponível (ex.: navegação privada); perfil só dura a sessão.
    }
  }, []);

  const utilizador = useMemo(
    () => utilizadores.find((u) => u.utilizador_id === utilizadorId),
    [utilizadores, utilizadorId],
  );

  return (
    <PerfilContext.Provider value={{ utilizadores, utilizadorId, utilizador, definirUtilizadorId, aCarregar }}>
      {children}
    </PerfilContext.Provider>
  );
}

export function usePerfil(): PerfilContextValor {
  const ctx = useContext(PerfilContext);
  if (!ctx) throw new Error("usePerfil tem de ser usado dentro de PerfilProvider");
  return ctx;
}
