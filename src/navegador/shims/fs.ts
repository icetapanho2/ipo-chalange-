// "node:fs" no browser: os ficheiros de dados/ vão embutidos no site (Vite ?raw) e lêem-se pelo nome.
const ficheiros = import.meta.glob("../../../dados/*.{csv,json}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const porNome = new Map(Object.entries(ficheiros).map(([caminho, conteudo]) => [caminho.split("/").pop()!, conteudo]));
const nome = (p: string) => String(p).split("/").pop()!;

export function existsSync(p: string): boolean {
  return porNome.has(nome(p));
}
export function readFileSync(p: string): string {
  const c = porNome.get(nome(p));
  if (c === undefined) throw new Error(`Ficheiro de dados não embutido: ${p}`);
  return c;
}
export default { existsSync, readFileSync };
