// "node:url" mínimo para o browser.
export function fileURLToPath(u: string | URL): string {
  return String(u);
}
export default { fileURLToPath };
