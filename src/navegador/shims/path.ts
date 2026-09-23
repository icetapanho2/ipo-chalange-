// "node:path" mínimo para o browser (só se usa para chegar aos ficheiros de dados/ pelo nome).
export function join(...partes: string[]): string {
  return partes.filter(Boolean).join("/");
}
export function dirname(p: string): string {
  return String(p).split("/").slice(0, -1).join("/");
}
export function basename(p: string): string {
  return String(p).split("/").pop() ?? "";
}
export default { join, dirname, basename };
