// No site estático não há chaves de IA (seriam públicas): o assistente do P/ usa só o dicionário.
export class GoogleGenAI {
  constructor() {
    throw new Error("IA não disponível no site estático");
  }
}
export default class Anthropic {
  constructor() {
    throw new Error("IA não disponível no site estático");
  }
}
