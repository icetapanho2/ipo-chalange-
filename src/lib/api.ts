export const PERFIL_STORAGE_KEY = "oasis2:utilizadorId";

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
  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Erro ${resposta.status} em ${caminho}: ${corpo}`);
  }
  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

export const apiGet = <T,>(caminho: string) => api<T>(caminho);
export const apiPost = <T,>(caminho: string, corpo?: unknown) =>
  api<T>(caminho, { method: "POST", body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
export const apiPut = <T,>(caminho: string, corpo?: unknown) =>
  api<T>(caminho, { method: "PUT", body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
