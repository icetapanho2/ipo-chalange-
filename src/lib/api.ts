import { useEffect, useState } from "react";

export const PERFIL_STORAGE_KEY = "oasis2:utilizadorId";

/** Disparado quando os dados no servidor mudaram (por esta janela ou por outra). */
export const EVENTO_DADOS = "oasis:dados";
let versaoConhecida: string | null = null;

function registarVersao(v: string | null) {
  if (v === null) return;
  if (versaoConhecida !== null && v !== versaoConhecida) {
    versaoConhecida = v;
    window.dispatchEvent(new Event(EVENTO_DADOS));
    window.dispatchEvent(new Event(EVENTO_MUDANCA)); // notificações e contadores do cabeçalho
  } else versaoConhecida = v;
}

/** Disparado se o servidor mudar de instância (reinício ou mais de uma instância no Cloud Run). */
export const EVENTO_INSTANCIA = "oasis:instancia";
let instanciaConhecida: string | null = null;

let aVigiar = false;
/** Pergunta ao servidor, a cada 1,5 s, se os dados mudaram (montado uma vez, na App). */
export function vigiarDados() {
  if (aVigiar) return;
  aVigiar = true;
  const perguntar = () =>
    fetch("/api/versao", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { versao: number; instancia: string }) => {
        if (instanciaConhecida && j.instancia !== instanciaConhecida) window.dispatchEvent(new Event(EVENTO_INSTANCIA));
        instanciaConhecida = j.instancia;
        registarVersao(`${j.instancia}:${j.versao}`);
      })
      .catch(() => undefined);
  perguntar();
  window.setInterval(() => {
    if (document.visibilityState === "visible") perguntar();
  }, 1500);
}

/** Número que sobe sempre que os dados mudam: pôr nas dependências de quem carrega da API. */
export function useVersaoDados(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const f = () => setV((x) => x + 1);
    window.addEventListener(EVENTO_DADOS, f);
    return () => window.removeEventListener(EVENTO_DADOS, f);
  }, []);
  return v;
}

/** Disparado depois de cada acção bem-sucedida na API. */
export const EVENTO_MUDANCA = "oasis:mudanca";

function utilizadorIdActual(): string {
  try {
    return localStorage.getItem(PERFIL_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export async function api<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const resposta = await fetch(`/api${caminho}`, {
    ...opcoes,
    headers: {
      "Content-Type": "application/json",
      "x-utilizador-id": utilizadorIdActual(),
      ...(opcoes.headers ?? {}),
    },
  });
  registarVersao(resposta.headers.get("X-Versao-Dados"));
  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Erro ${resposta.status} em ${caminho}: ${corpo}`);
  }
  // Qualquer acção (POST/PUT) pode gerar notificações: avisa quem estiver à escuta para refrescar já.
  if (opcoes.method && opcoes.method !== "GET") window.dispatchEvent(new Event(EVENTO_MUDANCA));
  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

export const apiGet = <T,>(caminho: string) => api<T>(caminho);
export const apiPost = <T,>(caminho: string, corpo?: unknown) =>
  api<T>(caminho, { method: "POST", body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
export const apiPut = <T,>(caminho: string, corpo?: unknown) =>
  api<T>(caminho, { method: "PUT", body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
