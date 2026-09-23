import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readCsv } from "./csv.ts";
import { definirDataDemo } from "./clock.ts";
import type {
  Especialidade,
  AtoCatalogo,
  Exame,
  Analise,
  Gabinete,
  Utilizador,
  Doente,
  Vaga,
  AtoMedico,
  Pedido,
  Dependencia,
  Evento,
  DicionarioEntrada,
  Alerta,
  PropostaTroca,
  RegraPrazo,
  RegraDependencia,
  IntervaloResultado,
  Parametros,
  Perfil,
  TipoPedido,
  NotaConsulta,
  Notificacao,
  Silenciamento,
  Avaria,
  OfertaAntecipacao,
  VagaLibertada,
  Preparacao,
  RegraCapacidade,
  ComunicacaoDoente,
  ChamadaRegistada,
  PropostaRemarcacao,
} from "./types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DADOS_DIR = path.join(__dirname, "..", "dados");

const bool = (v: string) => v === "1" || v.toLowerCase() === "true";
const num = (v: string, fallback = 0) => (v === "" || v === undefined ? fallback : Number(v));
const list = (v: string) => (v ? v.split("|").filter(Boolean) : []);

function ptParaIso(dataHora: string): string {
  // "dd/mm/aaaa hh:mm" -> "aaaa-mm-ddThh:mm"
  const m = dataHora.trim().match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  if (!m) return "";
  const [, d, mo, y, h, mi] = m;
  return `${y}-${mo}-${d}T${h}:${mi}`;
}

class Store {
  especialidades: Especialidade[] = [];
  catalogoAtos: AtoCatalogo[] = [];
  exames: Exame[] = [];
  analises: Analise[] = [];
  gabinetes: Gabinete[] = [];
  utilizadores: Utilizador[] = [];
  doentes: Doente[] = [];
  vagas: Vaga[] = [];
  atosMedicos: AtoMedico[] = [];
  pedidos: Pedido[] = [];
  dependencias: Dependencia[] = [];
  eventos: Evento[] = [];
  dicionario: DicionarioEntrada[] = [];
  alertas: Alerta[] = [];
  propostasTroca: PropostaTroca[] = [];
  regrasPrazos: RegraPrazo[] = [];
  regrasDependencia: RegraDependencia[] = [];
  intervalosResultado: IntervaloResultado[] = [];
  parametros: Parametros = {} as Parametros;
  /** Notas SOAP do Oasis 2.0 (não vêm de CSV; estado só do MVP, perdido ao "repor demo"). */
  notasConsulta: NotaConsulta[] = [];
  /** Notificações e preferências de silenciamento (Prompt N2) — geradas pela aplicação, não vêm de CSV. */
  notificacoes: Notificacao[] = [];
  silenciamentos: Silenciamento[] = [];
  /** Avarias reportadas pelos técnicos (N2); uma avaria ABERTA bloqueia vagas do serviço/acto na janela afectada. */
  avarias: Avaria[] = [];
  /** Pesos da equação de prioridade personalizados por serviço (especialidade_codigo); um serviço
   * sem entrada aqui usa os pesos por omissão. Estado só do MVP, não vem de CSV. */
  pesosPrioridadePorServico: Record<string, { urgencia: number; tipo: number; paciente: number }> = {};
  /** Variáveis do índice de prioridade ajustadas por serviço (só as alteradas; o resto é o valor por omissão). */
  indicePorServico: Record<string, Record<string, number>> = {};
  /** Regras de preparação por acto e vagas protegidas por serviço (secção 8A) — vêm de CSV. */
  preparacoes: Preparacao[] = [];
  regrasCapacidade: RegraCapacidade[] = [];
  /** Vagas libertadas, ofertas de antecipação, comunicações ao doente e chamadas — geradas pela aplicação. */
  vagasLibertadas: VagaLibertada[] = [];
  ofertasAntecipacao: OfertaAntecipacao[] = [];
  comunicacoesDoente: ComunicacaoDoente[] = [];
  chamadas: ChamadaRegistada[] = [];
  propostasRemarcacao: PropostaRemarcacao[] = [];
  /** Médicos que desligaram o assistente que lê o "P/" do diário (ligado por omissão). */
  assistentePlanoDesligado: string[] = [];

  private contadores: Record<string, number> = {
    pedido: 0,
    dependencia: 0,
    evento: 0,
    alerta: 0,
    proposta: 0,
    ato: 0,
    notificacao: 0,
    avaria: 0,
    oferta: 0,
    comunicacao: 0,
    remarcacao: 0,
  };

  carregar(): void {
    const p = (f: string) => path.join(DADOS_DIR, f);

    this.especialidades = readCsv<Record<string, string>>(p("especialidades.csv")).map((r) => ({
      codigo: r.codigo,
      descricao: r.descricao,
      tipo_atividade: r.tipo_atividade,
      entrada_pedidos_externos: r.entrada_pedidos_externos as Especialidade["entrada_pedidos_externos"],
    }));

    this.catalogoAtos = readCsv<Record<string, string>>(p("catalogo_atos.csv")).map((r) => ({
      especialidade_codigo: r.especialidade_codigo,
      ato_codigo: r.ato_codigo,
      ato_descricao: r.ato_descricao,
      tipo_atividade: r.tipo_atividade,
      tipo_ato_medico: r.tipo_ato_medico,
      duracao_min: num(r.duracao_min),
      tipo_pedido: r.tipo_pedido as TipoPedido,
    }));

    this.exames = readCsv<Record<string, string>>(p("exames.csv")).map((r) => ({
      codigo_exame: r.codigo_exame,
      descricao_exame: r.descricao_exame,
      especialidade_codigo: r.especialidade_codigo,
      ato_codigo: r.ato_codigo,
    }));

    this.analises = readCsv<Record<string, string>>(p("analises.csv")).map((r) => ({
      codigo: r.codigo,
      descricao: r.descricao,
    }));

    this.gabinetes = readCsv<Record<string, string>>(p("gabinetes.csv")).map((r) => ({
      codigo: r.codigo,
      descricao: r.descricao,
      especialidade_codigo: r.especialidade_codigo,
      tipo_recurso: r.tipo_recurso,
    }));

    this.utilizadores = readCsv<Record<string, string>>(p("utilizadores.csv")).map((r) => ({
      utilizador_id: r.utilizador_id,
      nome: r.nome,
      perfil: r.perfil as Perfil,
      especialidade_codigo: r.especialidade_codigo,
      e_medico: bool(r.e_medico),
    }));

    this.doentes = readCsv<Record<string, string>>(p("doentes.csv")).map((r) => ({
      doente_id: r.doente_id,
      n_utente: r.n_utente,
      nome: r.nome,
      sexo: r.sexo,
      data_nascimento: r.data_nascimento,
      demo_cenario: r.demo_cenario,
      // Perfil clínico usado no factor 3 da equação de prioridade (secção calcularPrioridadeSistema);
      // pode não existir em exports antigos do CSV, daí os valores por omissão.
      diagnostico_principal: r.diagnostico_principal || "",
      estadiamento: r.estadiamento || "",
      alergias: list(r.alergias),
      contacto: r.contacto || "",
      notas_clinicas: r.notas_clinicas || "",
      estadio_cuidado: (r.estadio_cuidado || "") as Doente["estadio_cuidado"],
      concelho: r.concelho || "",
      distancia_km: num(r.distancia_km),
      contacto_digital: (r.contacto_digital || "SMS") as Doente["contacto_digital"],
      aceita_antecipacao: bool(r.aceita_antecipacao || ""),
      transporte_nao_urgente: bool(r.transporte_nao_urgente || ""),
    }));

    this.vagas = readCsv<Record<string, string>>(p("vagas.csv")).map((r) => ({
      vaga_id: r.vaga_id,
      especialidade_codigo: r.especialidade_codigo,
      gabinete_codigo: r.gabinete_codigo,
      medico_id: r.medico_id,
      data_hora: r.data_hora,
      duracao_min: num(r.duracao_min),
      atos_permitidos: list(r.atos_permitidos),
      ato_id: r.ato_id,
    }));

    this.atosMedicos = this.carregarAtosMedicos(p("oasis_atos_medicos.csv"));

    this.pedidos = readCsv<Record<string, string>>(p("pedidos.csv")).map((r) => ({
      pedido_id: r.pedido_id,
      doente_id: r.doente_id,
      consulta_origem_ato_id: r.consulta_origem_ato_id,
      especialidade_origem: r.especialidade_origem,
      medico_requisitante_id: r.medico_requisitante_id,
      criado_em: r.criado_em,
      tipo_pedido: r.tipo_pedido as TipoPedido,
      fluxo: r.fluxo as Pedido["fluxo"],
      especialidade_destino: r.especialidade_destino,
      ato_codigo: r.ato_codigo,
      exames: list(r.exames),
      analises: list(r.analises),
      especificacao: r.especificacao,
      prioridade: r.prioridade as Pedido["prioridade"],
      prazo_limite: r.prazo_limite,
      nao_antes: r.nao_antes,
      medico_preferido_id: r.medico_preferido_id,
      continuidade_obrigatoria: bool(r.continuidade_obrigatoria),
      recorrencia: r.recorrencia,
      texto_origem: r.texto_origem,
      confianca: num(r.confianca, 1),
      aprovado_direto: bool(r.aprovado_direto),
      validado_por: r.validado_por,
      validado_em: r.validado_em,
      triado_por: r.triado_por,
      triado_em: r.triado_em,
      decisao_triagem: r.decisao_triagem,
      marcado_em: r.marcado_em,
      ato_id: r.ato_id,
      estado: r.estado as Pedido["estado"],
      n_remarcacoes: num(r.n_remarcacoes),
    }));

    this.dependencias = readCsv<Record<string, string>>(p("dependencias.csv")).map((r) => ({
      dependencia_id: r.dependencia_id,
      pedido_id: r.pedido_id,
      depende_de_pedido_id: r.depende_de_pedido_id,
      intervalo_min_dias: num(r.intervalo_min_dias),
      critica: bool(r.critica),
      origem: r.origem as Dependencia["origem"],
      regra_id: r.regra_id,
    }));

    this.eventos = readCsv<Record<string, string>>(p("eventos.csv")).map((r) => ({
      evento_id: r.evento_id,
      pedido_id: r.pedido_id,
      data_hora: r.data_hora,
      tipo: r.tipo as Evento["tipo"],
      estado_anterior: r.estado_anterior,
      estado_novo: r.estado_novo,
      utilizador_id: r.utilizador_id,
      motivo: r.motivo,
      detalhe: r.detalhe,
    }));

    this.dicionario = readCsv<Record<string, string>>(p("dicionario.csv")).map((r) => ({
      termo: r.termo,
      significado: r.significado,
      mapeia_para: r.mapeia_para,
      ambito: r.ambito,
      origem: r.origem as DicionarioEntrada["origem"],
      ocorrencias: num(r.ocorrencias),
      estado: r.estado as DicionarioEntrada["estado"],
    }));

    this.regrasPrazos = readCsv<Record<string, string>>(p("regras_prazos.csv")).map((r) => ({
      tipo_pedido: r.tipo_pedido as TipoPedido,
      prioridade: r.prioridade as RegraPrazo["prioridade"],
      prazo_dias: num(r.prazo_dias),
    }));

    this.regrasDependencia = readCsv<Record<string, string>>(p("regras_dependencia.csv")).map((r) => ({
      regra_id: r.regra_id,
      quando: r.quando,
      exige: r.exige,
      validade_dias: num(r.validade_dias),
      intervalo_min_dias: num(r.intervalo_min_dias),
      critica: bool(r.critica),
      descricao: r.descricao,
    }));

    this.intervalosResultado = readCsv<Record<string, string>>(p("intervalos_resultado.csv")).map((r) => ({
      especialidade_codigo: r.especialidade_codigo,
      dias_ate_resultado: num(r.dias_ate_resultado),
    }));

    this.preparacoes = readCsv<Record<string, string>>(p("preparacoes.csv")).map((r) => ({
      especialidade_codigo: r.especialidade_codigo,
      ato_codigo: r.ato_codigo,
      instrucoes: r.instrucoes,
      requer_confirmacao: bool(r.requer_confirmacao),
    }));

    this.regrasCapacidade = readCsv<Record<string, string>>(p("regras_capacidade.csv")).map((r) => ({
      especialidade_codigo: r.especialidade_codigo,
      horizonte_protegido_dias: num(r.horizonte_protegido_dias),
      niveis_permitidos: list(r.niveis_permitidos) as RegraCapacidade["niveis_permitidos"],
    }));

    const paramRows = readCsv<Record<string, string>>(p("parametros.csv"));
    const paramMap: Record<string, string> = {};
    for (const r of paramRows) paramMap[r.parametro] = r.valor;
    this.parametros = {
      DEMO_DATE: paramMap.DEMO_DATE,
      congelamento_dias: num(paramMap.congelamento_dias),
      limiar_confianca: num(paramMap.limiar_confianca),
      promover_regra_apos: num(paramMap.promover_regra_apos),
      alerta_triagem_parada_dias: num(paramMap.alerta_triagem_parada_dias),
      semaforo_horizonte_dias: num(paramMap.semaforo_horizonte_dias),
      alerta_remarcacoes: num(paramMap.alerta_remarcacoes),
      cromos_dia: num(paramMap.cromos_dia),
      copias_por_cromo: num(paramMap.copias_por_cromo),
      minutos_admin_por_cromo: num(paramMap.minutos_admin_por_cromo),
      dias_uteis_mes: num(paramMap.dias_uteis_mes),
      limiar_prioridade_mp: num(paramMap.limiar_prioridade_mp, 70),
      limiar_prioridade_p: num(paramMap.limiar_prioridade_p, 42),
      max_remarcacoes_hospital: num(paramMap.max_remarcacoes_hospital, 1),
      custo_idade_75: num(paramMap.custo_idade_75, 20),
      custo_sem_contacto_digital: num(paramMap.custo_sem_contacto_digital, 25),
      custo_distancia_50km: num(paramMap.custo_distancia_50km, 15),
      custo_distancia_150km: num(paramMap.custo_distancia_150km, 25),
      custo_transporte: num(paramMap.custo_transporte, 10),
      custo_dia_agrupado: num(paramMap.custo_dia_agrupado, 20),
      custo_estadio_novo: num(paramMap.custo_estadio_novo, 30),
      bonus_folga_max: num(paramMap.bonus_folga_max, 30),
      libertar_protegidas_dias: num(paramMap.libertar_protegidas_dias, 3),
      antecipacao_ganho_min_dias: num(paramMap.antecipacao_ganho_min_dias, 3),
      antecipacao_ganho_diagnostico_dias: num(paramMap.antecipacao_ganho_diagnostico_dias, 7),
      oferta_resposta_horas: num(paramMap.oferta_resposta_horas, 24),
      cascata_max: num(paramMap.cascata_max, 3),
      distancia_agrupar_km: num(paramMap.distancia_agrupar_km, 50),
      lista_chamadas_dias: num(paramMap.lista_chamadas_dias, 10),
      idade_chamada: num(paramMap.idade_chamada, 80),
      custo_medio_vaga_tac: num(paramMap.custo_medio_vaga_tac, 120),
      reducao_faltas_lembrete: num(paramMap.reducao_faltas_lembrete, 0.3),
    };
    definirDataDemo(this.parametros.DEMO_DATE);

    // Alertas, propostas de troca, notas SOAP e notificações são geradas pela aplicação (não vêm de CSV).
    this.alertas = [];
    this.propostasTroca = [];
    // Diário das consultas já realizadas (folha clínica simulada, gerada por gerar_dados.py).
    this.notasConsulta = existsSync(p("notas_consulta.csv"))
      ? readCsv<Record<string, string>>(p("notas_consulta.csv")).map((r) => ({
          ato_id: r.ato_id,
          s: r.s ?? "",
          o: r.o ?? "",
          a: r.a ?? "",
          p: r.p ?? "",
          guardado_em: r.guardado_em ?? "",
          guardado_por: r.guardado_por ?? "",
        }))
      : [];
    this.notificacoes = [];
    this.silenciamentos = [];
    this.avarias = [];
    this.pesosPrioridadePorServico = {};
    this.indicePorServico = {};
    this.assistentePlanoDesligado = [];
    this.vagasLibertadas = [];
    this.ofertasAntecipacao = [];
    this.comunicacoesDoente = [];
    this.chamadas = [];
    this.propostasRemarcacao = [];

    this.contadores = {
      pedido: maxSufixo(this.pedidos.map((x) => x.pedido_id), "P"),
      dependencia: maxSufixo(this.dependencias.map((x) => x.dependencia_id), "D"),
      evento: maxSufixo(this.eventos.map((x) => x.evento_id), "E"),
      alerta: 0,
      proposta: 0,
      ato: maxSufixo(this.atosMedicos.map((x) => x.mvp_ato_id), "AT"),
      notificacao: 0,
      avaria: 0,
      oferta: 0,
      comunicacao: 0,
      remarcacao: 0,
    };
  }

  private carregarAtosMedicos(filePath: string): AtoMedico[] {
    const linhas = readCsv<Record<string, string>>(filePath);
    const porAto = new Map<string, AtoMedico>();
    for (const r of linhas) {
      const id = r.mvp_ato_id;
      let ato = porAto.get(id);
      if (!ato) {
        ato = {
          mvp_ato_id: id,
          doente_id: r.ID,
          estado: r["Ato Médico_Estado"],
          data_hora: ptParaIso(r["Ato Médico_Data e hora"]),
          duracao_min: duracaoParaMinutos(r["Ato Médico_Duração"]),
          especialidade_codigo: r["Especialidade_Código"],
          especialidade_descricao: r["Especialidade_Descrição"],
          gabinete_codigo: r["Gabinete_Código"],
          gabinete_descricao: r["Gabinete_Descrição"],
          ato_codigo: r["Ato Médico_Código"],
          ato_descricao: r["Ato Médico_Descrição"],
          data_criacao: ptParaIso(r["Ato Médico_Data Criação"]),
          data_atualizacao: ptParaIso(r["Ato Médico_Data Última Atualização"]),
          exames: [],
          tipo_atividade: r["Tipo Atividade"],
          tipo_ato_medico: r["Tipo de Ato Médico"],
          mvp_medico_id: r.mvp_medico_id,
          mvp_vaga_id: r.mvp_vaga_id,
          mvp_pedido_id: r.mvp_pedido_id,
          mvp_prazo_limite: r.mvp_prazo_limite,
          mvp_prioridade: r.mvp_prioridade,
          mvp_n_remarcacoes: num(r.mvp_n_remarcacoes),
        };
        porAto.set(id, ato);
      }
      if (r["Ato Médico_Código Exame"]) {
        ato.exames.push({
          codigo_exame: r["Ato Médico_Código Exame"],
          descricao_exame: r["Ato Médico_Descrição Exame"],
        });
      }
    }
    return [...porAto.values()];
  }

  proximoId(
    entidade: "pedido" | "dependencia" | "evento" | "alerta" | "proposta" | "ato" | "notificacao" | "avaria" | "oferta" | "comunicacao" | "remarcacao",
  ): string {
    this.contadores[entidade] += 1;
    const n = this.contadores[entidade];
    const prefixos: Record<typeof entidade, string> = {
      pedido: "P",
      dependencia: "D",
      evento: "E",
      alerta: "AL",
      proposta: "PT",
      ato: "AT",
      notificacao: "N",
      avaria: "AV",
      oferta: "OF",
      comunicacao: "CM",
      remarcacao: "PR",
    };
    const casas = entidade === "ato" ? 6 : 5;
    return `${prefixos[entidade]}${String(n).padStart(casas, "0")}`;
  }
}

function maxSufixo(ids: string[], prefixo: string): number {
  let max = 0;
  for (const id of ids) {
    const n = Number(id.replace(prefixo, ""));
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max;
}

function duracaoParaMinutos(duracao: string): number {
  // vem como "00:15" (erro de exportação do Excel, só interessa a hora)
  const m = duracao.match(/^(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

export const store = new Store();
store.carregar();
