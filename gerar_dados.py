"""
Gerador de dados SINTÉTICOS para o MVP "Oasis 2.0 + Sistema de Pedidos pós-consulta".
Nenhum dado é real. Nomes, números de utente e processos são inventados.
Correr: python gerar_dados.py  -> escreve CSV em ./dados/
Data de referência da demo (HOJE): DEMO_DATE.
"""
import csv, json, os, random
from datetime import date, datetime, timedelta, time

random.seed(7)
DEMO_DATE = date(2026, 9, 23)          # dia da apresentação = "hoje" na demo
DEMO_NOW = datetime.combine(DEMO_DATE, time(8, 0))
START = DEMO_DATE - timedelta(days=60)  # 60 dias de histórico
END = DEMO_DATE + timedelta(days=42)    # 6 semanas de agenda futura
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dados")
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- utilitários
def is_wd(d): return d.weekday() < 5
def next_wd(d):
    while not is_wd(d): d += timedelta(days=1)
    return d
def prev_wd(d):
    while not is_wd(d): d -= timedelta(days=1)
    return d
def add_business_minutes(dt, minutes):
    dt = dt + timedelta(minutes=minutes)
    while not is_wd(dt.date()): dt += timedelta(days=1)
    return dt
def pt(dt): return dt.strftime("%d/%m/%Y %H:%M") if dt else ""
def iso(x):
    if x is None: return ""
    return x.isoformat(timespec="minutes") if isinstance(x, datetime) else x.isoformat()
def t(s): h, m = map(int, s.split(":")); return time(h, m)
def dur_txt(mins): return f"{mins // 60:02d}:{mins % 60:02d}"

# ---------------------------------------------------------------- directório
ESPECIALIDADES = [
    # codigo, descricao, tipo_atividade, entrada_pedidos_externos
    ("2102", "Onc. Cirúrgica-C. Digestivo", "Consultas", "TRIAGEM"),
    ("1300", "Oncologia Médica-Geral", "Consultas", "TRIAGEM"),
    ("2300", "Radioterapia-Geral", "Consultas", "TRIAGEM"),
    ("7000_2", "Radiologia-Geral (TAC)", "MCDT", "DIRETO"),
    ("7000_3", "Radiologia-Geral (Ecografia)", "MCDT", "DIRETO"),
    ("6100", "Patologia Clínica-Geral", "MCDT", "DIRETO"),
    ("9610", "Hospital de Dia-Oncologia", "Hospital de Dia", "TRIAGEM"),
    ("9602", "Cons. Enferm.-Onc. Cirúrgica", "ENF Consultas", "DIRETO"),
]
ESP = {e[0]: e for e in ESPECIALIDADES}

# (esp, ato) -> descricao, tipo_atividade, tipo_ato_medico, duracao, tipo_pedido
CATALOGO = {
    ("2102", "22"): ("CE PRESENCIAL ESÓFAGO/GÁSTRICO", "Consultas", "Presencial", 20, "consulta"),
    ("2102", "23"): ("CE PRESENCIAL CÓLON/RECTO", "Consultas", "Presencial", 20, "consulta"),
    ("2102", "7"): ("CE PÓS-OPERATÓRIO", "Consultas", "Presencial", 20, "consulta"),
    ("2102", "5"): ("CE TELEFÓNICA", "Consultas", "Não Presencial", 10, "consulta"),
    ("1300", "1"): ("CE PRIMEIRA ONCOLOGIA MÉDICA", "Consultas", "Presencial", 40, "pedido_consulta"),
    ("1300", "2"): ("CE SUBSEQUENTE ONCOLOGIA MÉDICA", "Consultas", "Presencial", 20, "consulta"),
    ("2300", "1"): ("CE PRIMEIRA RADIOTERAPIA", "Consultas", "Presencial", 40, "pedido_consulta"),
    ("7000_2", "1"): ("TC CORPO", "MCDT", "Presencial", 20, "exame"),
    ("7000_3", "1"): ("ECOGRAFIA", "MCDT", "Presencial", 20, "exame"),
    ("6100", "4"): ("COLHEITA S/ JEJUM", "MCDT", "Presencial", 10, "analises"),
    ("6100", "9"): ("COLHEITA C/ JEJUM", "MCDT", "Presencial", 10, "analises"),
    ("9610", "1"): ("SESSÃO HOSPITAL DE DIA", "Hospital de Dia", "Presencial", 240, "pedido_hd"),
    ("9602", "3"): ("MANUTENÇÃO CVC", "ENF Consultas", "Presencial", 30, "tratamento"),
    ("9602", "1"): ("CE ENFERMAGEM", "ENF Consultas", "Presencial", 30, "tratamento"),
}
EXAMES = [
    ("7000002", "TC Tórax", "7000_2", "1"),
    ("7000004", "TC Abdominal", "7000_2", "1"),
    ("7000009", "TC Pélvica (Visceral)", "7000_2", "1"),
    ("7100010", "Ecografia Abdominal", "7000_3", "1"),
    ("65270", "Manutenção e heparinização de cateter com ou sem reservatório subcutâneo", "9602", "3"),
    ("9610001", "Administração de terapêutica antineoplásica", "9610", "1"),
]
EXAME_DESC = {e[0]: e[1] for e in EXAMES}
TC_TAP = ["7000002", "7000004", "7000009"]
TC_AP = ["7000004", "7000009"]
ANALISES = [("A001", "Hemograma"), ("A002", "Bioquímica (função renal e hepática)"),
            ("A003", "Creatinina"), ("A004", "CEA"), ("A005", "CA 19.9")]

GABINETES = [
    ("A031707", "Gabinete de consulta 3", "2102", "Gabinete"),
    ("A031708", "Gabinete de consulta 4", "2102", "Gabinete"),
    ("A032101", "Gabinete de consulta 1", "1300", "Gabinete"),
    ("A032102", "Gabinete de consulta 2", "1300", "Gabinete"),
    ("A032501", "Gabinete RT 1", "2300", "Gabinete"),
    ("A033403", "Sala de Exames TC Siemens", "7000_2", "Equipamento"),
    ("A033410", "Sala Ecografia 2", "7000_3", "Equipamento"),
    ("E020305", "Sala colheita 1", "6100", "Sala"),
    ("E020306", "Sala colheita 2", "6100", "Sala"),
    ("H010101", "Cadeirão HD 1", "9610", "Cadeirão"),
    ("H010102", "Cadeirão HD 2", "9610", "Cadeirão"),
    ("H010103", "Cadeirão HD 3", "9610", "Cadeirão"),
    ("H010104", "Cadeirão HD 4", "9610", "Cadeirão"),
    ("A031903", "Gabinete de Enfermagem 1", "9602", "Gabinete"),
]
GAB = {g[0]: g for g in GABINETES}

UTILIZADORES = [
    # id, nome, perfil, especialidade, e_medico
    ("U01", "Dr. Pedro Almeida", "MEDICO", "2102", 1),
    ("U02", "Dra. Sofia Lemos", "MEDICO", "2102", 1),
    ("U03", "Joana Moreira", "ADMINISTRATIVO", "2102", 0),
    ("U04", "Dr. Rui Carvalho", "TRIADOR", "1300", 1),
    ("U05", "Dra. Inês Faria", "MEDICO", "1300", 1),
    ("U06", "Dra. Marta Sousa", "TRIADOR", "2300", 1),
    ("U07", "Paula Gomes", "ADMINISTRATIVO", "7000_2", 0),
    ("U08", "Rita Vieira", "ADMINISTRATIVO", "6100", 0),
    ("U09", "Enf. Carla Dias", "ADMINISTRATIVO", "9602", 0),
    ("U10", "Dra. Helena Pinto", "TRIADOR", "9610", 1),
    ("U11", "Tiago Neves", "ADMINISTRATIVO", "7000_3", 0),
    ("U12", "Dr. Nuno Reis", "GESTAO", "", 0),
    ("U13", "Vítor Amaral", "TECNICO", "", 0),
]

# ---------------------------------------------------------------- regras
# prazos por nível (dias). PROVISÓRIO: confirmar com direcção clínica / TMRG.
PRAZOS = {
    "pedido_consulta": {"MP": 30, "P": 60, "N": 120},
    "exame": {"MP": 15, "P": 30, "N": 90},
    "analises": {"MP": 7, "P": 15, "N": 45},
    "pedido_hd": {"MP": 14, "P": 30, "N": 60},
    "tratamento": {"MP": 7, "P": 15, "N": 45},
    "consulta": {"MP": 15, "P": 30, "N": 90},
}
INTERVALO_RESULTADO = {"7000_2": 7, "7000_3": 3, "6100": 2, "9602": 0, "2102": 0, "1300": 0, "2300": 0, "9610": 0}

# ---------------------------------------------------------------- nomes
NOMES_F = ["Maria", "Ana", "Isabel", "Rosa", "Teresa", "Fernanda", "Lurdes", "Conceição", "Graça", "Helena",
           "Luísa", "Paula", "Rita", "Sandra", "Fátima", "Cristina", "Manuela", "Alice", "Glória", "Olga"]
NOMES_M = ["José", "António", "Manuel", "Joaquim", "Carlos", "Fernando", "Luís", "Jorge", "Rui", "Paulo",
           "Domingos", "Armando", "Álvaro", "Mário", "Alberto", "Artur", "Vítor", "Hélder", "Abel", "Belmiro"]
APELIDOS = ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Rodrigues", "Martins", "Sousa",
            "Fernandes", "Gonçalves", "Gomes", "Lopes", "Marques", "Alves", "Almeida", "Ribeiro", "Pinto",
            "Carvalho", "Teixeira", "Moreira", "Correia", "Mendes", "Nunes", "Soares", "Vieira", "Monteiro"]

# Estádio do doente no percurso oncológico (não confundir com "estadiamento" TNM): as 4 fases
# grandes do percurso hospitalar, usadas para agrupar/filtrar "Os Meus Pedidos" do médico.
ESTADIOS_CUIDADO = ["NOVO", "PRE_TRATAMENTO", "EM_TRATAMENTO", "FOLLOW_UP"]
PESOS_ESTADIO_CUIDADO = [0.15, 0.15, 0.25, 0.45]  # maioria em vigilância, coerente com um serviço oncológico maduro

doentes = {}
def novo_doente(pid=None, nome=None, sexo=None, idade=None):
    while pid is None or pid in doentes:
        pid = str(random.randint(200000, 899999))
    sexo = sexo or random.choice("FM")
    if nome is None:
        nome = f"{random.choice(NOMES_F if sexo == 'F' else NOMES_M)} {random.choice(APELIDOS)} {random.choice(APELIDOS)}"
    idade = idade or random.randint(38, 86)
    nasc = date(DEMO_DATE.year - idade, random.randint(1, 12), random.randint(1, 28))
    doentes[pid] = dict(doente_id=pid, n_utente=str(random.randint(100000000, 399999999)), nome=nome,
                        sexo=sexo, data_nascimento=nasc.isoformat(), demo_cenario="",
                        # Perfil clínico usado no factor 3 da equação de prioridade (server/motor/prioridade.ts);
                        # vazio por omissão — só os doentes-cenário da demo têm isto preenchido abaixo.
                        diagnostico_principal="", estadiamento="", alergias=[], contacto="", notas_clinicas="",
                        estadio_cuidado=random.choices(ESTADIOS_CUIDADO, weights=PESOS_ESTADIO_CUIDADO)[0])
    return pid

for _ in range(450):
    novo_doente()
BACKGROUND = list(doentes.keys())

# ---------------------------------------------------------------- agendas / vagas
def series(start, end, step, dur, atos):
    out, cur = [], datetime.combine(date.today(), t(start))
    stop = datetime.combine(date.today(), t(end))
    while cur + timedelta(minutes=dur) <= stop:
        out.append((cur.time(), dur, atos)); cur += timedelta(minutes=step)
    return out

om_slots = [(t("09:00"), 40, "1"), (t("09:40"), 40, "1")] + series("10:20", "13:00", 20, 20, "2")
AGENDAS = [
    # esp, gabinete, medico, dias_semana, slots
    ("2102", "A031707", "U01", {0, 2, 4}, series("08:30", "12:30", 20, 20, "22|23|7|5")),
    ("2102", "A031708", "U02", {1, 3}, series("08:30", "12:30", 20, 20, "22|23|7|5")),
    ("1300", "A032101", "U04", {0, 3}, om_slots),
    ("1300", "A032102", "U05", {1, 4}, om_slots),
    ("2300", "A032501", "U06", {2}, series("09:00", "12:20", 40, 40, "1")),
    ("7000_2", "A033403", "", {0, 1, 2, 3, 4}, series("08:00", "16:00", 20, 20, "1")),
    ("7000_3", "A033410", "", {0, 1, 2, 3, 4}, series("09:00", "13:00", 20, 20, "1")),
    ("6100", "E020305", "", {0, 1, 2, 3, 4}, series("07:30", "10:30", 10, 10, "4|9")),
    ("6100", "E020306", "", {0, 1, 2, 3, 4}, series("07:30", "10:30", 10, 10, "4|9")),
    ("9610", "H010101", "", {0, 1, 2, 3, 4}, [(t("08:30"), 240, "1"), (t("13:30"), 240, "1")]),
    ("9610", "H010102", "", {0, 1, 2, 3, 4}, [(t("08:30"), 240, "1"), (t("13:30"), 240, "1")]),
    ("9610", "H010103", "", {0, 1, 2, 3, 4}, [(t("08:30"), 240, "1"), (t("13:30"), 240, "1")]),
    ("9610", "H010104", "", {0, 1, 2, 3, 4}, [(t("08:30"), 240, "1"), (t("13:30"), 240, "1")]),
    ("9602", "A031903", "U09", {0, 1, 2, 3, 4}, series("09:00", "12:00", 30, 30, "3|1")),
]

vagas, vagas_by_esp = [], {}
RESERVA = set()
d = START
while d <= END:
    if is_wd(d):
        for esp, gab, med, dias, slots in AGENDAS:
            if d.weekday() not in dias: continue
            for tm, dur, atos in slots:
                v = dict(vaga_id=f"V{len(vagas) + 1:05d}", especialidade_codigo=esp, gabinete_codigo=gab,
                         medico_id=med, data_hora=datetime.combine(d, tm), duracao_min=dur,
                         atos_permitidos=atos, ato_id=None)
                vagas.append(v); vagas_by_esp.setdefault(esp, []).append(v)
    d += timedelta(days=1)
for lst in vagas_by_esp.values(): lst.sort(key=lambda v: v["data_hora"])

def get_vaga(esp, dt_, medico=None):
    for v in vagas_by_esp[esp]:
        if v["data_hora"] == dt_ and (medico is None or v["medico_id"] == medico): return v
    raise ValueError(f"vaga não encontrada {esp} {dt_} {medico}")

def find_slot(esp, ato, earliest, latest=None, medico=None, k=3):
    cands = []
    for v in vagas_by_esp[esp]:
        vd = v["data_hora"].date()
        if vd < earliest: continue
        if latest and vd > latest: break
        if v["ato_id"] or v["vaga_id"] in RESERVA or ato not in v["atos_permitidos"].split("|"): continue
        if medico and v["medico_id"] != medico: continue
        cands.append(v)
        if len(cands) >= k: break
    if not cands: return None
    return random.choices(cands, weights=[6, 3, 1][:len(cands)])[0]

# ---------------------------------------------------------------- atos (formato Oasis)
atos = []
def book(vaga, doente, esp, ato, exames=(), criado=None, estado=None, pedido_id="", prazo=None,
         prio="", n_rem=0, dt_=None, medico=None, atualizado=None):
    dt_ = vaga["data_hora"] if vaga else dt_
    if estado is None:
        estado = "MARCADA" if dt_ < DEMO_NOW else "MARCADA"
        if dt_.date() < DEMO_DATE: estado = "REALIZADA"
    a = dict(ato_id=f"AT{len(atos) + 1:06d}", doente_id=doente, estado=estado, data_hora=dt_,
             duracao=CATALOGO[(esp, ato)][3], esp=esp, gab=vaga["gabinete_codigo"] if vaga else "",
             ato=ato, exames=list(exames), criado=criado, atualizado=atualizado,
             medico=(vaga["medico_id"] if vaga else medico) or "", vaga_id=vaga["vaga_id"] if vaga else "",
             pedido_id=pedido_id, prazo=prazo, prio=prio, n_rem=n_rem)
    if vaga: vaga["ato_id"] = a["ato_id"]
    atos.append(a)
    return a

# ---------------------------------------------------------------- pedidos / dependências / eventos
pedidos, dependencias, eventos = [], [], []
def ev(pedido_id, dt_, tipo, de, para, user, motivo="", detalhe=""):
    eventos.append(dict(evento_id=f"E{len(eventos) + 1:06d}", pedido_id=pedido_id, data_hora=iso(dt_),
                        tipo=tipo, estado_anterior=de, estado_novo=para, utilizador_id=user,
                        motivo=motivo, detalhe=detalhe))

def novo_pedido(doente, origem_ato, medico, criado, tipo, esp, ato, prio, exames=(), analises=(),
                especificacao="", prazo=None, nao_antes=None, med_pref="", continuidade=0, recorrencia="",
                texto="", confianca=None, aprovado_direto=1):
    fluxo = "TRIAGEM" if tipo in ("pedido_consulta", "pedido_hd") else "DIRETO"
    if prazo is None: prazo = criado.date() + timedelta(days=PRAZOS[tipo][prio])
    p = dict(pedido_id=f"P{len(pedidos) + 1:05d}", doente_id=doente, consulta_origem_ato_id=origem_ato,
             especialidade_origem="2102", medico_requisitante_id=medico, criado_em=criado, tipo_pedido=tipo,
             fluxo=fluxo, especialidade_destino=esp, ato_codigo=ato, exames="|".join(exames),
             analises="|".join(analises), especificacao=especificacao, prioridade=prio, prazo_limite=prazo,
             nao_antes=nao_antes, medico_preferido_id=med_pref, continuidade_obrigatoria=continuidade,
             recorrencia=recorrencia, texto_origem=texto,
             confianca=confianca if confianca is not None else round(random.uniform(0.82, 0.99), 2),
             aprovado_direto=aprovado_direto, validado_por="", validado_em=None, triado_por="",
             triado_em=None, decisao_triagem="", marcado_em=None, ato_id="", estado="EXTRAIDO",
             n_remarcacoes=0)
    pedidos.append(p)
    ev(p["pedido_id"], criado, "EXTRACAO", "", "EXTRAIDO", "AGENTE", detalhe=f"confiança {p['confianca']}")
    return p

def validar(p, dt_, user="U03", corrigido=False):
    p["validado_por"], p["validado_em"] = user, dt_
    p["aprovado_direto"] = 0 if corrigido else 1
    if corrigido:
        ev(p["pedido_id"], dt_, "CORRECAO", "EXTRAIDO", "EXTRAIDO", user,
           detalhe=random.choice(["exame corrigido", "serviço corrigido", "prazo corrigido", "prioridade corrigida"]))
    nxt = "EM_TRIAGEM" if p["fluxo"] == "TRIAGEM" else "ACEITE"
    ev(p["pedido_id"], dt_, "VALIDACAO", "EXTRAIDO", "VALIDADO", user)
    ev(p["pedido_id"], dt_, "ENVIO", "VALIDADO", nxt, "SISTEMA")
    p["estado"] = nxt

def marcar(p, vaga, dt_):
    a = book(vaga, p["doente_id"], p["especialidade_destino"], p["ato_codigo"],
             exames=p["exames"].split("|") if p["exames"] else [], criado=dt_, pedido_id=p["pedido_id"],
             prazo=p["prazo_limite"], prio=p["prioridade"], atualizado=dt_)
    p["marcado_em"], p["ato_id"], p["estado"] = dt_, a["ato_id"], "MARCADO"
    ev(p["pedido_id"], dt_, "MARCACAO", "ACEITE", "MARCADO", "AGENTE", detalhe=f"{vaga['vaga_id']} {pt(vaga['data_hora'])}")
    return a

def dep(dependente, requisito, intervalo, origem="MEDICO", regra="", critica=1):
    dependencias.append(dict(dependencia_id=f"D{len(dependencias) + 1:05d}", pedido_id=dependente["pedido_id"],
                             depende_de_pedido_id=requisito["pedido_id"], intervalo_min_dias=intervalo,
                             critica=critica, origem=origem, regra_id=regra))

# ================================================================ CENÁRIOS DEMO (reservados primeiro)
def demo_doente(pid, nome, sexo, idade, cen):
    novo_doente(pid, nome, sexo, idade); doentes[pid]["demo_cenario"] = cen; return pid

D1 = demo_doente("100101", "Maria Fernandes Costa", "F", 67, "1 - circuito completo (ao vivo)")
D2 = demo_doente("100102", "António Ribeiro Sousa", "M", 72, "2 - dependência falhada / semáforo vermelho")
D3 = demo_doente("100103", "Luísa Martins Pinto", "F", 58, "3 - triagem: reencaminhar para Radioterapia")
D4 = demo_doente("100104", "José Carvalho Nunes", "M", 64, "4 - TAC cheio: troca segura")
D5 = demo_doente("100105", "Rosa Teixeira Lopes", "F", 71, "5a - abreviatura desconhecida (correcção)")
D6 = demo_doente("100106", "Manuel Costa Ferreira", "M", 69, "4 - doente com maior folga (candidato à troca)")
D7 = demo_doente("100107", "Carlos Mendes Rocha", "M", 60, "5b - abreviatura aprendida")
D8 = demo_doente("100108", "Fernando Lopes Gomes", "M", 55, "6 - pedido Hospital de Dia + dependência automática")

# Perfil clínico dos doentes-cenário (factor 3 da equação de prioridade) — coerente com o texto
# dos pedidos de cada um, gerados mais abaixo (secção "CENÁRIOS DEMO").
PERFIL_CLINICO = {
    D1: dict(diagnostico_principal="Adenocarcinoma do cólon, sob vigilância pós-adjuvante",
             estadiamento="Estádio III", alergias=[], contacto="912 345 001",
             notas_clinicas="Consulta de vigilância; sem queixas de novo até à última avaliação.",
             estadio_cuidado="FOLLOW_UP"),
    D2: dict(diagnostico_principal="Neoplasia esófago-gástrica, pós-tratamento",
             estadiamento="Estádio II", alergias=["Penicilina"], contacto="912 345 002",
             notas_clinicas="Reestadiamento periódico com TC TAP e marcadores tumorais.",
             estadio_cuidado="FOLLOW_UP"),
    D3: dict(diagnostico_principal="Adenocarcinoma do recto médio, cT3N1",
             estadiamento="Estádio III", alergias=[], contacto="912 345 003",
             notas_clinicas="Referenciado para avaliação de radioterapia neoadjuvante.",
             estadio_cuidado="PRE_TRATAMENTO"),
    D4: dict(diagnostico_principal="Neoplasia cólon-recto, suspeita de recidiva",
             estadiamento="Estádio III (suspeita de recidiva)", alergias=["Contraste iodado — pré-medicar"],
             contacto="912 345 004", notas_clinicas="TC TAP urgente para reestadiamento.",
             estadio_cuidado="PRE_TRATAMENTO"),
    D5: dict(diagnostico_principal="Neoplasia cólon-recto, sob vigilância", estadiamento="Estádio II",
             alergias=[], contacto="912 345 005", notas_clinicas="", estadio_cuidado="FOLLOW_UP"),
    D6: dict(diagnostico_principal="Neoplasia esófago-gástrica, em remissão", estadiamento="Estádio I",
             alergias=[], contacto="912 345 006", notas_clinicas="Controlo anual de rotina.",
             estadio_cuidado="FOLLOW_UP"),
    D7: dict(diagnostico_principal="Neoplasia cólon-recto, sob vigilância", estadiamento="Estádio II",
             alergias=[], contacto="912 345 007", notas_clinicas="", estadio_cuidado="FOLLOW_UP"),
    D8: dict(diagnostico_principal="Neoplasia cólon-recto, quimioterapia adjuvante em curso (FOLFOX)",
             estadiamento="Estádio III", alergias=["Oxaliplatina — vigiar neuropatia"], contacto="912 345 008",
             notas_clinicas="Ciclo 1 de QT adjuvante FOLFOX em Hospital de Dia.", estadio_cuidado="EM_TRATAMENTO"),
}
for _pid, _perfil in PERFIL_CLINICO.items():
    doentes[_pid].update(_perfil)

# Agenda de hoje do Dr. Pedro (Oasis 2.0 - ecrã do médico)
for pid, hh, ato in [(D1, "09:30", "22"), (D5, "09:50", "23"), (D7, "10:10", "23")]:
    v = get_vaga("2102", datetime.combine(DEMO_DATE, t(hh)), "U01")
    book(v, pid, "2102", ato, criado=datetime.combine(DEMO_DATE - timedelta(days=30), t("11:00")), estado="MARCADA")
# histórico anterior (sem vaga, importado)
for pid, ato, dd in [(D1, "7", 95), (D5, "23", 90), (D7, "23", 88)]:
    dt_ = datetime.combine(prev_wd(DEMO_DATE - timedelta(days=dd)), t("10:00"))
    book(None, pid, "2102", ato, criado=dt_ - timedelta(days=30), estado="REALIZADA", dt_=dt_, medico="U01")
for pid, hh in ((D5, "09:30"), (D7, "10:00")):
    dt_ = datetime.combine(prev_wd(DEMO_DATE - timedelta(days=28)), t(hh))
    v = get_vaga("9602", dt_)
    book(v, pid, "9602", "3", exames=["65270"], criado=dt_ - timedelta(days=28), estado="REALIZADA")

# D2 António: consulta 04/09 (Dr. Pedro), TC realizado, colheita FALTOU ontem, revisão daqui a 5 dias
c_dt = datetime.combine(DEMO_DATE - timedelta(days=19), t("09:10"))
c2 = book(get_vaga("2102", c_dt, "U01"), D2, "2102", "22", criado=c_dt - timedelta(days=35), estado="REALIZADA")
dcr = datetime.combine(prev_wd(DEMO_DATE - timedelta(days=55)), t("08:00"))  # creatinina antiga (válida p/ R1)
p_cr = novo_pedido(D2, "", "U01", dcr - timedelta(days=6), "analises", "6100", "9", "N",
                   analises=["A001", "A002", "A003"], texto="Colheita c/ jejum (hemog, bioq c/ creat).")
validar(p_cr, dcr - timedelta(days=6, minutes=-30))
marcar(p_cr, get_vaga("6100", dcr, None), dcr - timedelta(days=6, minutes=-40))
p_cr["estado"] = "REALIZADO"; atos[-1]["estado"] = "REALIZADA"; atos[-1]["atualizado"] = dcr
ev(p_cr["pedido_id"], dcr, "REALIZACAO", "MARCADO", "REALIZADO", "U08")
cr = c_dt + timedelta(minutes=15)
txt2 = "TC TAP c/ contraste + colheita c/ jejum (hemog, bioq, CEA, CA 19.9). Rev c/ exames 1/12 comigo."
p_an = novo_pedido(D2, c2["ato_id"], "U01", cr, "analises", "6100", "9", "P",
                   analises=["A001", "A002", "A004", "A005"], texto=txt2, prazo=DEMO_DATE + timedelta(days=3))
p_tc = novo_pedido(D2, c2["ato_id"], "U01", cr, "exame", "7000_2", "1", "P", exames=TC_TAP,
                   especificacao="com contraste", texto=txt2)
p_rv = novo_pedido(D2, c2["ato_id"], "U01", cr, "consulta", "2102", "22", "P",
                   nao_antes=cr.date() + timedelta(days=21), prazo=cr.date() + timedelta(days=35),
                   med_pref="U01", continuidade=1, texto=txt2)
for p in (p_an, p_tc, p_rv): validar(p, cr + timedelta(minutes=40))
dep(p_rv, p_tc, 7); dep(p_rv, p_an, 2)
m_dt = cr + timedelta(minutes=55)
marcar(p_tc, get_vaga("7000_2", datetime.combine(DEMO_DATE - timedelta(days=9), t("11:20"))), m_dt)
a_col = marcar(p_an, get_vaga("6100", datetime.combine(DEMO_DATE - timedelta(days=1), t("08:10")), None), m_dt)
marcar(p_rv, get_vaga("2102", datetime.combine(DEMO_DATE + timedelta(days=5), t("09:30")), "U01"), m_dt)
p_tc["estado"] = "REALIZADO"
for a in atos:
    if a["pedido_id"] == p_tc["pedido_id"]: a["estado"] = "REALIZADA"; a["atualizado"] = a["data_hora"]
ev(p_tc["pedido_id"], datetime.combine(DEMO_DATE - timedelta(days=9), t("11:40")), "REALIZACAO", "MARCADO", "REALIZADO", "U07")
a_col["estado"] = "FALTOU"; a_col["atualizado"] = datetime.combine(DEMO_DATE - timedelta(days=1), t("11:00"))
p_an["estado"] = "FALTOU"
ev(p_an["pedido_id"], a_col["atualizado"], "FALTA", "MARCADO", "FALTOU", "U08", motivo="Doente faltou")

# D3 Luísa: pedido consulta Oncologia Médica em triagem (deveria ir para Radioterapia)
c_dt = datetime.combine(DEMO_DATE - timedelta(days=1), t("10:30"))
c3 = book(get_vaga("2102", c_dt, "U02"), D3, "2102", "23", criado=c_dt - timedelta(days=20), estado="REALIZADA")
p = novo_pedido(D3, c3["ato_id"], "U02", c_dt + timedelta(minutes=15), "pedido_consulta", "1300", "1", "P",
                texto="Adenoca recto médio cT3N1. Ped. cons. Onco p/ avaliação de RT neoadjuvante. Prio.",
                confianca=0.86)
validar(p, c_dt + timedelta(minutes=70))

# D4 José: TC estadiamento MP até 2 semanas -> EXTRAÍDO, à espera de validação ao vivo
c_dt = datetime.combine(DEMO_DATE - timedelta(days=2), t("11:10"))
c4 = book(get_vaga("2102", c_dt, "U01"), D4, "2102", "22", criado=c_dt - timedelta(days=15), estado="REALIZADA")
dtc = datetime.combine(prev_wd(DEMO_DATE - timedelta(days=20)), t("08:20"))
p_old = novo_pedido(D4, "", "U01", dtc - timedelta(days=5), "analises", "6100", "9", "P",
                    analises=["A001", "A002", "A003"], texto="Colheita c/ jejum (hemog, bioq c/ creat).")
validar(p_old, dtc - timedelta(days=5, minutes=-30))
marcar(p_old, get_vaga("6100", dtc, None), dtc - timedelta(days=5, minutes=-45))
p_old["estado"] = "REALIZADO"; atos[-1]["estado"] = "REALIZADA"
ev(p_old["pedido_id"], dtc, "REALIZACAO", "MARCADO", "REALIZADO", "U08")
p4 = novo_pedido(D4, c4["ato_id"], "U01", c_dt + timedelta(minutes=15), "exame", "7000_2", "1", "MP",
                 exames=TC_TAP, especificacao="com contraste; reestadiamento",
                 prazo=c_dt.date() + timedelta(days=14),
                 texto="Suspeita de recidiva. TC TAP c/ contraste urgente p/ reestadiamento, até 2 sem.",
                 confianca=0.93)

# D6 Manuel: TAC marcado daqui a 9 dias, prazo largo -> candidato à troca
c_dt = datetime.combine(DEMO_DATE - timedelta(days=1), t("11:30"))
c6 = book(get_vaga("2102", c_dt, "U02"), D6, "2102", "22", criado=c_dt - timedelta(days=25), estado="REALIZADA")
p6 = novo_pedido(D6, c6["ato_id"], "U02", c_dt + timedelta(minutes=15), "exame", "7000_2", "1", "N",
                 exames=TC_AP, prazo=date(2026, 12, 31), texto="TC AP de controlo até ao final do ano.")
validar(p6, c_dt + timedelta(minutes=45))
marcar(p6, get_vaga("7000_2", datetime.combine(DEMO_DATE + timedelta(days=9), t("10:00"))), c_dt + timedelta(minutes=50))

# D8 Fernando: pedido de Hospital de Dia em triagem
c_dt = datetime.combine(DEMO_DATE - timedelta(days=2), t("09:50"))
c8 = book(get_vaga("2102", c_dt, "U01"), D8, "2102", "23", criado=c_dt - timedelta(days=21), estado="REALIZADA")
p8 = novo_pedido(D8, c8["ato_id"], "U01", c_dt + timedelta(minutes=15), "pedido_hd", "9610", "1", "P",
                 exames=["9610001"], especificacao="QT adjuvante FOLFOX, ciclo 1",
                 texto="Decidido em reunião de grupo: QT adjuvante FOLFOX. Ped. HD Onco.", confianca=0.9)
validar(p8, c_dt + timedelta(minutes=60))

DEMO_PEDIDOS = {p["pedido_id"] for p in pedidos}

# vagas que TÊM de ficar livres para os cenários da demo funcionarem
def reservar(esp, dia, n, medico=None):
    c = [v for v in vagas_by_esp[esp] if v["data_hora"].date() == dia and not v["ato_id"]
         and (medico is None or v["medico_id"] == medico)][:n]
    assert len(c) == n, f"impossível reservar {esp} {dia}"
    RESERVA.update(v["vaga_id"] for v in c)
reservar("9610", date(2026, 9, 25), 2)             # Fernando (HD)
for dd in (24, 25): reservar("6100", date(2026, 9, dd), 6)   # colheitas: António, Maria, Rosa, Fernando
for dd in (24, 25): reservar("9602", date(2026, 9, dd), 2)   # Rosa / Carlos (CVC)
reservar("2300", date(2026, 9, 30), 1)             # Luísa (RT)
reservar("7000_2", date(2026, 10, 14), 4)          # Manuel + Maria + Rosa + Carlos
for dd in (21, 23): reservar("2102", date(2026, 10, dd), 3, "U01")  # revisões Dr. Pedro

# ================================================================ HISTÓRICO (60 dias)
def prob_aprov(d):  # curva de aprendizagem simulada
    frac = (d - START).days / 60
    return 0.70 + 0.23 * frac

def outcome_and_maybe_reschedule(p, a, faltou_p=0.045):
    """Se passado: REALIZADA ou FALTOU (+ reagendamento)."""
    if a["data_hora"].date() >= DEMO_DATE: return a
    if random.random() < faltou_p:
        a["estado"] = "FALTOU"; a["atualizado"] = a["data_hora"] + timedelta(hours=3)
        ev(p["pedido_id"], a["atualizado"], "FALTA", "MARCADO", "FALTOU", "SISTEMA", motivo="Doente faltou")
        v = find_slot(p["especialidade_destino"], p["ato_codigo"], a["data_hora"].date() + timedelta(days=2),
                      medico=p["medico_preferido_id"] or None)
        if v:
            dt_ = a["atualizado"] + timedelta(hours=1)
            na = book(v, p["doente_id"], p["especialidade_destino"], p["ato_codigo"],
                      exames=a["exames"], criado=dt_, pedido_id=p["pedido_id"], prazo=p["prazo_limite"],
                      prio=p["prioridade"], n_rem=1, atualizado=dt_)
            p["ato_id"], p["n_remarcacoes"] = na["ato_id"], p["n_remarcacoes"] + 1
            ev(p["pedido_id"], dt_, "REMARCACAO", "FALTOU", "MARCADO", "AGENTE", motivo="Falta do doente",
               detalhe=f"nova data {pt(na['data_hora'])}")
            return outcome_and_maybe_reschedule(p, na, faltou_p=0.0)
        p["estado"] = "FALTOU"; return a
    a["estado"] = "REALIZADA"; a["atualizado"] = a["data_hora"]
    p["estado"] = "REALIZADO"
    ev(p["pedido_id"], a["data_hora"] + timedelta(minutes=a["duracao"]), "REALIZACAO", "MARCADO", "REALIZADO", "SISTEMA")
    return a

def random_service_remarcacao(p, a):
    if random.random() > 0.04: return
    motivos = {"7000_2": "Equipamento avariado", "7000_3": "Equipamento avariado"}
    motivo = motivos.get(p["especialidade_destino"], random.choice(["Médico indisponível", "Pedido do doente"]))
    anterior = prev_wd(a["data_hora"].date() - timedelta(days=random.randint(2, 8)))
    if p["marcado_em"] and anterior <= p["marcado_em"].date(): return
    if datetime.combine(anterior - timedelta(days=1), t("15:00")) >= DEMO_NOW: return
    p["n_remarcacoes"] += 1; a["n_rem"] += 1
    ev(p["pedido_id"], max(p["marcado_em"] + timedelta(hours=2), datetime.combine(anterior - timedelta(days=1), t("15:00"))), "REMARCACAO", "MARCADO",
       "MARCADO", "SISTEMA", motivo=motivo, detalhe=f"de {anterior.strftime('%d/%m/%Y')} para {pt(a['data_hora'])}")

def schedule_direct(p, earliest, latest_pref=None):
    # realismo: ~10% dos pedidos apanham constrangimentos de capacidade (atraso extra)
    med = p["medico_preferido_id"] if p["continuidade_obrigatoria"] else None
    v = None
    if p["pedido_id"] not in DEMO_PEDIDOS and random.random() < 0.10 and p["tipo_pedido"] != "consulta":
        v = find_slot(p["especialidade_destino"], p["ato_codigo"], earliest + timedelta(days=random.randint(15, 45)), medico=med)
    if not v:
        v = find_slot(p["especialidade_destino"], p["ato_codigo"], earliest, medico=med)
    if not v:
        p["estado"] = "SEM_VAGA"
        ev(p["pedido_id"], p["validado_em"], "SEM_VAGA", "ACEITE", "SEM_VAGA", "AGENTE", motivo="Sem vaga no horizonte da agenda")
        return None
    dt_ = add_business_minutes(p["validado_em"] if not p["triado_em"] else p["triado_em"], random.randint(1, 20))
    if dt_ >= DEMO_NOW: dt_ = DEMO_NOW - timedelta(minutes=random.randint(20, 300))
    a = marcar(p, v, dt_)
    random_service_remarcacao(p, a)
    return outcome_and_maybe_reschedule(p, a)

def triagem(p, user):
    dt_ = add_business_minutes(p["validado_em"], random.randint(180, 60 * 24 * 4))
    if dt_ >= DEMO_NOW:
        return False  # ainda em triagem
    r = random.random()
    if r < 0.05:
        p["triado_por"], p["triado_em"], p["decisao_triagem"], p["estado"] = user, dt_, "RECUSADO", "RECUSADO"
        ev(p["pedido_id"], dt_, "TRIAGEM", "EM_TRIAGEM", "RECUSADO", user, motivo="Sem indicação para a consulta")
        return False
    if r < 0.12 and p["especialidade_destino"] == "1300":
        ev(p["pedido_id"], dt_, "TRIAGEM", "EM_TRIAGEM", "REENCAMINHADO", user, motivo="Pertence a Radioterapia")
        p["especialidade_destino"], p["decisao_triagem"] = "2300", "REENCAMINHADO"
        dt2 = add_business_minutes(dt_, random.randint(120, 60 * 24 * 2))
        if dt2 >= DEMO_NOW:
            p["estado"] = "EM_TRIAGEM"; return False
        dt_, user = dt2, "U06"
    if random.random() < 0.1:
        p["prioridade"] = random.choice(["MP", "P", "N"])
        p["prazo_limite"] = p["criado_em"].date() + timedelta(days=PRAZOS[p["tipo_pedido"]][p["prioridade"]])
    p["triado_por"], p["triado_em"] = user, dt_
    p["decisao_triagem"] = p["decisao_triagem"] or "ACEITE"
    ev(p["pedido_id"], dt_, "TRIAGEM", "EM_TRIAGEM", "ACEITE", user)
    p["estado"] = "ACEITE"
    return True

PRIOS = (["MP", "P", "N"], [15, 30, 55])
PACOTES = (["a", "b", "c", "d", "e", "f", "g"], [30, 20, 15, 12, 6, 10, 7])
TXT = {
    "a": ["TC TAP c/ contraste + colheita c/ jejum (hemog, bioq, CEA, CA 19.9). Rev c/ exames 1/12 comigo.",
          "Ped. TAC TAP c/ ctr e análises c/ marcadores. Reavaliação c/ resultados dentro de 1 mês.",
          "TC TAP + ana (hgm, bioq c/ creat, CEA, CA19.9). CE rev em 4 sem c/ exames."],
    "b": ["Colheita s/ jejum (hemog, CEA). Rev 1/12.", "Análises (hemograma, CEA) e cons. de revisão num mês."],
    "d": ["Ped. cons. Onco Médica p/ discussão de QT adjuvante.", "Referenciar a Oncologia Médica."],
    "e": ["Ped. HD p/ QT adjuvante (FOLFOX). Análises pré-QT.", "Iniciar CAPOX em HD. Ana na véspera."],
    "f": ["Manut. CVC 4/4 sem no enf.", "Heparinização do CVC mensal (enfermagem)."],
    "g": ["Eco abd e rev c/ resultado.", "Ecografia abdominal; reavaliação após exame."],
}

def gerar_pacote(consulta, medico):
    t0 = consulta["data_hora"]; doente = consulta["doente_id"]; d0 = t0.date()
    cr = t0 + timedelta(minutes=consulta["duracao"] + 5)
    pac = random.choices(*PACOTES)[0]
    if pac == "c": return
    prio = random.choices(*PRIOS)[0]
    corr = random.random() > prob_aprov(d0)
    val_dt = cr + timedelta(minutes=random.randint(5, 150))
    txt = random.choice(TXT[pac])
    ato_ce = consulta["ato"] if consulta["ato"] in ("22", "23") else "22"

    def P(*a, **k):
        p = novo_pedido(doente, consulta["ato_id"], medico, cr, *a, texto=txt, **k)
        validar(p, val_dt, corrigido=corr and random.random() < 0.6)
        return p

    if pac in ("a", "b", "g"):
        rv_kw = dict(nao_antes=d0 + timedelta(days=21), prazo=d0 + timedelta(days=35), med_pref=medico, continuidade=1)
        if pac == "a":
            an = P("analises", "6100", "9", prio, analises=["A001", "A002", "A003", "A004", "A005"])
            tc = P("exame", "7000_2", "1", prio, exames=TC_TAP, especificacao="com contraste")
            rv = P("consulta", "2102", ato_ce, prio, **rv_kw)
            dep(tc, an, 1, "REGRA", "R1"); dep(rv, tc, 7); dep(rv, an, 2)
            a1 = schedule_direct(an, d0 + timedelta(days=1))
            e2 = (a1["data_hora"].date() + timedelta(days=1)) if a1 else d0 + timedelta(days=2)
            a2 = schedule_direct(tc, e2)
            reqs = [(a1, 2), (a2, 7)]
        elif pac == "b":
            an = P("analises", "6100", "4", prio, analises=["A001", "A004"])
            rv = P("consulta", "2102", ato_ce, prio, **rv_kw)
            dep(rv, an, 2)
            a1 = schedule_direct(an, d0 + timedelta(days=1)); reqs = [(a1, 2)]
        else:
            ec = P("exame", "7000_3", "1", prio, exames=["7100010"])
            rv = P("consulta", "2102", ato_ce, prio, **rv_kw)
            dep(rv, ec, 3)
            a1 = schedule_direct(ec, d0 + timedelta(days=1)); reqs = [(a1, 3)]
        earliest = rv["nao_antes"]
        faltou_req = False
        for a, gap in reqs:
            if a: earliest = max(earliest, a["data_hora"].date() + timedelta(days=gap))
            if a and any(x["pedido_id"] == a["pedido_id"] and x["estado"] == "FALTOU" for x in atos): faltou_req = True
        if any(a is None for a, _ in reqs):
            ev(rv["pedido_id"], rv["validado_em"], "AGUARDA_DEPENDENCIA", "ACEITE", "ACEITE", "AGENTE",
               motivo="Requisito sem marcação")
            return
        ar = schedule_direct(rv, earliest)
        if ar and faltou_req:
            rv["n_remarcacoes"] += 1
            ev(rv["pedido_id"], ar["criado"], "REMARCACAO", "MARCADO", "MARCADO", "SISTEMA",
               motivo="Dependência não cumprida (falta a exame)")
    elif pac == "d":
        p = P("pedido_consulta", "1300", "1", prio)
        if triagem(p, "U04"):
            schedule_direct(p, p["triado_em"].date() + timedelta(days=1))
    elif pac == "e":
        hd = P("pedido_hd", "9610", "1", prio, exames=["9610001"], especificacao="QT adjuvante")
        if triagem(hd, "U10"):
            ahd = schedule_direct(hd, hd["triado_em"].date() + timedelta(days=2))
            if ahd:
                dh = ahd["data_hora"].date()
                v = find_slot("6100", "4", max(dh - timedelta(days=3), hd["marcado_em"].date() + timedelta(days=1)),
                              latest=dh - timedelta(days=1))
                if v:
                    an = novo_pedido(doente, consulta["ato_id"], medico, hd["marcado_em"], "analises", "6100", "4",
                                     prio, analises=["A001", "A002"], especificacao="pré-QT (regra R2)",
                                     texto="[criado pela regra R2]", confianca=1.0)
                    validar(an, hd["marcado_em"], user="SISTEMA")
                    dep(hd, an, 1, "REGRA", "R2")
                    a = marcar(an, v, hd["marcado_em"]); outcome_and_maybe_reschedule(an, a, 0.0)
    elif pac == "f":
        tr = P("tratamento", "9602", "3", prio, exames=["65270"], recorrencia="4 semanas")
        schedule_direct(tr, d0 + timedelta(days=1))

d = START
while d < DEMO_DATE:
    if is_wd(d):
        med = "U01" if d.weekday() in (0, 2, 4) else "U02"
        dia = [v for v in vagas_by_esp["2102"] if v["data_hora"].date() == d and v["medico_id"] == med]
        ocup = sum(1 for v in dia if v["ato_id"])
        for v in dia:
            if v["ato_id"] or ocup >= 10: continue
            book(v, random.choice(BACKGROUND), "2102", random.choice(["22", "23", "7", "5"]),
                 criado=v["data_hora"] - timedelta(days=random.randint(20, 60)), estado="REALIZADA")
            ocup += 1
        for v in dia:
            if not v["ato_id"]: continue
            a = next(x for x in atos if x["ato_id"] == v["ato_id"])
            if a["doente_id"] in (D1, D2, D3, D4, D5, D6, D7, D8): continue
            if a["estado"] != "REALIZADA": continue
            gerar_pacote(a, med)
    d += timedelta(days=1)

# ================================================================ OCUPAÇÃO DE FUNDO (outros serviços de origem)
P_PAST = {"7000_2": .85, "7000_3": .7, "6100": .6, "1300": .8, "2300": .7, "9610": .8, "9602": .5, "2102": 0}
def p_future(esp, days):
    if esp == "7000_2": return 1.0 if days <= 20 else .45
    base = {"7000_3": .6, "6100": .45, "1300": .7, "2300": .5, "9610": .7, "9602": .4, "2102": .55}[esp]
    return base if days <= 21 else base * .55

for v in vagas:
    if v["ato_id"] or v["vaga_id"] in RESERVA: continue
    esp, dt_ = v["especialidade_codigo"], v["data_hora"]
    days = (dt_.date() - DEMO_DATE).days
    if dt_.date() == DEMO_DATE and esp == "2102" and v["medico_id"] == "U01":
        pr = .9
    else:
        pr = P_PAST[esp] if days < 0 else p_future(esp, days)
    if random.random() > pr: continue
    ato = random.choice(v["atos_permitidos"].split("|"))
    ex = []
    if esp == "7000_2": ex = random.choice([TC_TAP, TC_AP, ["7000002"], ["7000004"]])
    elif esp == "7000_3": ex = ["7100010"]
    elif esp == "9602" and ato == "3": ex = ["65270"]
    elif esp == "9610": ex = ["9610001"]
    criado = datetime.combine(prev_wd(dt_.date() - timedelta(days=random.randint(3, 80))), t("14:00"))
    if criado >= DEMO_NOW: criado = DEMO_NOW - timedelta(days=1)
    estado = None
    if days < 0: estado = "FALTOU" if random.random() < .06 else "REALIZADA"
    prazo = dt_.date() + timedelta(days=random.randint(0, 20)) if days >= 0 else None
    book(v, random.choice(BACKGROUND), esp, ato, exames=ex, criado=criado, estado=estado,
         prazo=prazo, prio=random.choices(*PRIOS)[0] if days >= 0 else "",
         n_rem=1 if random.random() < .15 else 0, atualizado=criado)

# agenda de hoje dos serviços: estados coerentes
for a in atos:
    if a["data_hora"].date() >= DEMO_DATE and a["estado"] not in ("FALTOU",): a["estado"] = "MARCADA"

# ================================================================ PERFIL LOGÍSTICO + CENÁRIOS DE PRIORIDADE
# Tudo o que está abaixo corre DEPOIS de toda a geração aleatória acima e usa um gerador
# aleatório próprio (rng), para não alterar a sequência aleatória principal — e, com ela, as
# datas exactas dos cenários 1-8 da demo. Os doentes novos (100109-100113) reaproveitam
# marcações de fundo que já existiam no TAC (só muda quem lá está), em vez de ocupar vagas novas.
rng = random.Random(2026)
CONCELHOS_PERTO = [("Lisboa", 6), ("Amadora", 12), ("Odivelas", 14), ("Loures", 18), ("Oeiras", 16),
                   ("Sintra", 28), ("Cascais", 30), ("Almada", 15), ("Seixal", 22), ("Barreiro", 35),
                   ("Vila Franca de Xira", 32)]
CONCELHOS_LONGE = [("Setúbal", 50), ("Santarém", 85), ("Évora", 135), ("Leiria", 145), ("Beja", 180),
                   ("Portalegre", 220), ("Castelo Branco", 230), ("Faro", 280)]

def idade_em(nasc_iso, ref=DEMO_DATE):
    n = date.fromisoformat(nasc_iso)
    return ref.year - n.year - ((ref.month, ref.day) < (n.month, n.day))

for x in doentes.values():
    longe = rng.random() < 0.15
    conc, km = rng.choice(CONCELHOS_LONGE if longe else CONCELHOS_PERTO)
    p_sem = 0.35 if idade_em(x["data_nascimento"]) >= 75 else 0.06
    r = rng.random()
    x.update(concelho=conc, distancia_km=km,
             contacto_digital="NENHUM" if r < p_sem else ("EMAIL" if r < p_sem + 0.15 else "SMS"),
             aceita_antecipacao=int(rng.random() < (0.25 if longe else 0.5)),
             transporte_nao_urgente=int(rng.random() < (0.5 if longe else 0.08)))

# doentes-cenário 1-8: todos perto de Lisboa e contactáveis por SMS (o Manuel tem de ter custo de
# remarcação mínimo: é ele que cede a vaga ao José, tal como antes)
for _pid, conc, km in [(D1, "Lisboa", 8), (D2, "Loures", 18), (D3, "Oeiras", 16), (D4, "Amadora", 12),
                       (D5, "Odivelas", 14), (D6, "Lisboa", 12), (D7, "Almada", 15), (D8, "Seixal", 22)]:
    doentes[_pid].update(concelho=conc, distancia_km=km, contacto_digital="SMS", aceita_antecipacao=1,
                         transporte_nao_urgente=0)
doentes[D1]["notas_clinicas"] += " Diabetes tipo 2 — metformina."

def demo_doente_prioridade(pid, nome, sexo, idade, cen, **perfil):
    nasc = date(DEMO_DATE.year - idade, rng.randint(1, 8), rng.randint(1, 28))
    doentes[pid] = dict(doente_id=pid, n_utente=str(rng.randint(100000000, 399999999)), nome=nome, sexo=sexo,
                        data_nascimento=nasc.isoformat(), demo_cenario=cen, diagnostico_principal="",
                        estadiamento="", alergias=[], contacto="", notas_clinicas="", estadio_cuidado="",
                        concelho="", distancia_km=0, contacto_digital="SMS", aceita_antecipacao=0,
                        transporte_nao_urgente=0)
    doentes[pid].update(perfil)
    return pid

D9 = demo_doente_prioridade(
    "100109", "Joaquim Alves Pereira", "M", 81, "9 - custo de remarcação alto (idoso, longe, sem telemóvel)",
    diagnostico_principal="Neoplasia do cólon, em remissão", estadiamento="Estádio II", contacto="272 000 109 (fixo)",
    notas_clinicas="Vive sozinho. Vem de transporte não urgente (ambulância) a partir de Castelo Branco.",
    estadio_cuidado="FOLLOW_UP", concelho="Castelo Branco", distancia_km=230, contacto_digital="NENHUM",
    aceita_antecipacao=0, transporte_nao_urgente=1)
D10 = demo_doente_prioridade(
    "100110", "Beatriz Sousa Rocha", "F", 52, "9 - já remarcada uma vez (excluída de nova troca)",
    diagnostico_principal="Neoplasia da mama, em vigilância", estadiamento="Estádio I", contacto="913 000 110",
    estadio_cuidado="FOLLOW_UP", concelho="Lisboa", distancia_km=7, contacto_digital="SMS", aceita_antecipacao=1)
D11 = demo_doente_prioridade(
    "100111", "Tiago Marques Silva", "M", 47, "9 - em tratamento (excluído de trocas)",
    diagnostico_principal="Adenocarcinoma do recto, QT neoadjuvante em curso", estadiamento="Estádio III",
    contacto="913 000 111", notas_clinicas="TC de avaliação de resposta a meio da quimioterapia.",
    estadio_cuidado="EM_TRATAMENTO", concelho="Oeiras", distancia_km=16, contacto_digital="SMS", aceita_antecipacao=1)
D12 = demo_doente_prioridade(
    "100112", "Helena Duarte Matos", "F", 58, "10 - em diagnóstico, marcada fora do prazo (antecipação)",
    diagnostico_principal="Suspeita de neoplasia do pâncreas (em estudo)", contacto="913 000 112",
    notas_clinicas="Perda de peso e icterícia. Aguarda TC para estadiamento.", estadio_cuidado="NOVO",
    concelho="Almada", distancia_km=15, contacto_digital="SMS", aceita_antecipacao=1)
D13 = demo_doente_prioridade(
    "100113", "Rui Fonseca Lima", "M", 66, "10 - desmarca o TC com uma semana de aviso",
    diagnostico_principal="Neoplasia do cólon, em vigilância", estadiamento="Estádio I", contacto="913 000 113",
    estadio_cuidado="FOLLOW_UP", concelho="Lisboa", distancia_km=9, contacto_digital="EMAIL", aceita_antecipacao=0)

def assumir_vaga(p, vaga, marcado_em, user="AGENTE"):
    """Coloca o pedido p na marcação de fundo que já ocupava esta vaga (sem gastar vagas novas)."""
    a = next(x for x in atos if x["ato_id"] == vaga["ato_id"])
    a.update(doente_id=p["doente_id"], exames=p["exames"].split("|") if p["exames"] else [], pedido_id=p["pedido_id"],
             prazo=p["prazo_limite"], prio=p["prioridade"], estado="MARCADA", criado=marcado_em, atualizado=marcado_em,
             n_rem=p["n_remarcacoes"])
    p["marcado_em"], p["ato_id"], p["estado"] = marcado_em, a["ato_id"], "MARCADO"
    ev(p["pedido_id"], marcado_em, "MARCACAO", "ACEITE", "MARCADO", user, detalhe=f"{vaga['vaga_id']} {pt(vaga['data_hora'])}")
    return a

def tac(dia, hh): return get_vaga("7000_2", datetime.combine(dia, t(hh)))

# Joaquim: TC AP de controlo 01/10 09:00 e consulta no MESMO dia (dia agrupado) — tem mais folga
# do que o Manuel (pela regra antiga seria ele a ceder a vaga ao José). Hoje: consulta com o Dr. Pedro.
cr = datetime.combine(date(2026, 9, 10), t("11:20"))
pj = novo_pedido(D9, "", "U02", cr, "exame", "7000_2", "1", "N", exames=TC_AP, prazo=date(2027, 1, 31),
                 texto="TC AP de controlo antes da próxima consulta.", confianca=0.95)
validar(pj, cr + timedelta(minutes=40))
assumir_vaga(pj, tac(date(2026, 10, 1), "09:00"), cr + timedelta(minutes=50))
pjr = novo_pedido(D9, "", "U02", cr, "consulta", "2102", "22", "N", nao_antes=date(2026, 9, 28),
                  prazo=date(2026, 10, 15), texto="Consulta de vigilância no mesmo dia do TC.", confianca=0.95)
validar(pjr, cr + timedelta(minutes=40))
marcar(pjr, get_vaga("2102", datetime.combine(date(2026, 10, 1), t("11:10")), "U02"), cr + timedelta(minutes=55))
book(get_vaga("2102", datetime.combine(DEMO_DATE, t("11:50")), "U01"), D9, "2102", "22",
     criado=datetime.combine(DEMO_DATE - timedelta(days=21), t("10:00")), estado="MARCADA")

# Beatriz: TC 01/10 10:00, prazo largo, mas já foi remarcada uma vez pelo hospital há 3 semanas
cr = datetime.combine(date(2026, 8, 20), t("10:10"))
pb = novo_pedido(D10, "", "U02", cr, "exame", "7000_2", "1", "N", exames=TC_AP, prazo=date(2027, 1, 15),
                 texto="TC AP de vigilância.", confianca=0.96)
validar(pb, cr + timedelta(minutes=30))
assumir_vaga(pb, tac(date(2026, 10, 1), "10:00"), cr + timedelta(minutes=45))
pb["n_remarcacoes"] = 1
next(x for x in atos if x["ato_id"] == pb["ato_id"])["n_rem"] = 1
ev(pb["pedido_id"], datetime.combine(date(2026, 9, 2), t("15:00")), "REMARCACAO", "MARCADO", "MARCADO", "SISTEMA",
   motivo="Equipamento avariado", detalhe="de 03/09/2026 para 01/10/2026 10:00")

# Tiago: em quimioterapia, TC de avaliação de resposta 02/10 08:00 (prazo curto)
cr = datetime.combine(date(2026, 9, 18), t("09:40"))
pt_ = novo_pedido(D11, "", "U01", cr, "exame", "7000_2", "1", "P", exames=TC_TAP, especificacao="com contraste",
                  prazo=date(2026, 10, 9), texto="TC TAP c/ contraste de avaliação de resposta a meio da QT.", confianca=0.97)
validar(pt_, cr + timedelta(minutes=30))
assumir_vaga(pt_, tac(date(2026, 10, 2), "08:00"), cr + timedelta(minutes=40))

# Helena: em diagnóstico, TC MP pedido a 25/08 com prazo 08/09, marcada à mão no Oasis na primeira
# vaga que havia (13/10) — está marcada FORA do prazo.
cr = datetime.combine(date(2026, 8, 25), t("12:00"))
ph = novo_pedido(D12, "", "U01", cr, "exame", "7000_2", "1", "MP", exames=TC_TAP, especificacao="com contraste",
                 prazo=date(2026, 9, 8), texto="Suspeita de neoplasia do pâncreas. TC TAP c/ contraste urgente p/ estadiamento.",
                 confianca=0.94)
validar(ph, cr + timedelta(minutes=35))
assumir_vaga(ph, tac(date(2026, 10, 13), "09:00"), cr + timedelta(days=1), user="U07")

# Rui: TC AP de controlo 30/09 09:00, prazo largo — vai desmarcar ao vivo (viagem)
cr = datetime.combine(date(2026, 9, 10), t("10:30"))
pr_ = novo_pedido(D13, "", "U01", cr, "exame", "7000_2", "1", "N", exames=TC_AP, prazo=date(2026, 12, 31),
                  texto="TC AP de controlo até ao final do ano.", confianca=0.97)
validar(pr_, cr + timedelta(minutes=30))
assumir_vaga(pr_, tac(date(2026, 9, 30), "09:00"), cr + timedelta(minutes=45))

# ---- Cenário "avaria na Ecografia a 24/09": 5 doentes marcados nesse dia, uma só vaga livre a
# 25/09 (disputada por dois MP com o mesmo prazo), e uma doente de longe com consulta a 01/10.
ECO_DIA = date(2026, 9, 24)
def ato_de(v): return next(x for x in atos if x["ato_id"] == v["ato_id"])
eco_24 = [v for v in vagas_by_esp["7000_3"] if v["data_hora"].date() == ECO_DIA and v["ato_id"]]
assert len(eco_24) >= 5, "Ecografia de 24/09 com menos de 5 marcações"
for v in eco_24[5:]:  # o dia fica com exactamente 5 marcações (as restantes tinham sido desmarcadas)
    a = ato_de(v); assert not a["pedido_id"]
    a["estado"], a["vaga_id"], v["ato_id"] = "DESMARCADA", "", None
for v in vagas_by_esp["7000_3"]:  # a 25/09 só fica livre a vaga das 10:40
    if v["data_hora"].date() == date(2026, 9, 25) and not v["ato_id"] and v["data_hora"].time() != t("10:40"):
        book(v, rng.choice(BACKGROUND), "7000_3", "1", exames=["7100010"],
             criado=datetime.combine(date(2026, 9, 1), t("14:00")), estado="MARCADA")
assert not get_vaga("7000_3", datetime.combine(date(2026, 9, 25), t("10:40")))["ato_id"]

ECO = ["7100010"]
D14 = demo_doente_prioridade(
    "100114", "Sónia Marques Lopes", "F", 54, "11 - avaria Eco: MP em diagnóstico (ganha a única vaga)",
    diagnostico_principal="Suspeita de metástases hepáticas (em estudo)", contacto="913 000 114",
    notas_clinicas="Lesões hepáticas de novo no TC; eco para caracterizar antes da biópsia.", estadio_cuidado="NOVO",
    concelho="Lisboa", distancia_km=10, contacto_digital="SMS", aceita_antecipacao=1)
D15 = demo_doente_prioridade(
    "100115", "Artur Nunes Gomes", "M", 63, "11 - avaria Eco: MP em vigilância (mesmo prazo, índice menor)",
    diagnostico_principal="Neoplasia do cólon em vigilância; CEA a subir", estadiamento="Estádio II", contacto="913 000 115",
    estadio_cuidado="FOLLOW_UP", concelho="Amadora", distancia_km=12, contacto_digital="SMS", aceita_antecipacao=1)
D16 = demo_doente_prioridade(
    "100116", "Fátima Correia Dias", "F", 49, "11 - avaria Eco: em QT e já remarcada (2.ª remarcação)",
    diagnostico_principal="Adenocarcinoma gástrico, quimioterapia em curso", estadiamento="Estádio III", contacto="913 000 116",
    estadio_cuidado="EM_TRATAMENTO", concelho="Loures", distancia_km=18, contacto_digital="SMS", aceita_antecipacao=1)
D17 = demo_doente_prioridade(
    "100117", "Diogo Almeida Reis", "M", 41, "11 - avaria Eco: rotina com muita folga",
    diagnostico_principal="Neoplasia do recto, em remissão", estadiamento="Estádio I", contacto="913 000 117",
    estadio_cuidado="FOLLOW_UP", concelho="Lisboa", distancia_km=6, contacto_digital="EMAIL", aceita_antecipacao=1)
D18 = demo_doente_prioridade(
    "100118", "Olga Santos Ferreira", "F", 84, "11 - avaria Eco: idosa de longe (dia único com a consulta)",
    diagnostico_principal="Neoplasia gástrica, em vigilância", estadiamento="Estádio I", contacto="243 000 118 (fixo)",
    estadio_cuidado="FOLLOW_UP", concelho="Santarém", distancia_km=85, contacto_digital="NENHUM", aceita_antecipacao=0,
    transporte_nao_urgente=1)
for (pid, prio, prazo, cr_d, txt, med), v in zip([
    (D14, "MP", date(2026, 9, 25), date(2026, 9, 18), "Eco abdominal urgente: caracterizar lesões hepáticas antes da biópsia.", "U01"),
    (D15, "MP", date(2026, 9, 25), date(2026, 9, 11), "CEA a subir. Eco abdominal prioritária.", "U02"),
    (D16, "P", date(2026, 9, 30), date(2026, 9, 2), "Eco abdominal de controlo durante a QT.", "U01"),
    (D17, "N", date(2026, 11, 30), date(2026, 9, 8), "Eco abdominal de vigilância.", "U02"),
    (D18, "N", date(2026, 11, 30), date(2026, 9, 4), "Eco abdominal de vigilância.", "U02"),
], eco_24[:5]):
    cr = datetime.combine(cr_d, t("10:00"))
    pe = novo_pedido(pid, "", med, cr, "exame", "7000_3", "1", prio, exames=ECO, prazo=prazo, texto=txt, confianca=0.96)
    validar(pe, cr + timedelta(minutes=30))
    assumir_vaga(pe, v, cr + timedelta(minutes=45))
    if pid == D16:  # já foi remarcada uma vez pelo hospital
        pe["n_remarcacoes"] = 1; ato_de(v)["n_rem"] = 1
        ev(pe["pedido_id"], datetime.combine(date(2026, 9, 10), t("15:00")), "REMARCACAO", "MARCADO", "MARCADO", "SISTEMA",
           motivo="Médico indisponível", detalhe="de 14/09/2026 para 24/09/2026")
book(get_vaga("2102", datetime.combine(date(2026, 10, 1), t("10:50")), "U02"), D18, "2102", "22",
     criado=datetime.combine(date(2026, 9, 4), t("10:30")), estado="MARCADA")

# Preparação dos exames (texto PROVISÓRIO — a validar com cada serviço). requer_confirmacao = o
# serviço quer confirmar por telefone quando há um factor de risco (ver server/motor/chamadas.ts).
PREPARACOES = [
    ("7000_2", "1", "Jejum de 6 horas. Beber 1 litro de água na hora antes do exame. Se toma metformina, tem "
                    "diabetes ou doença renal, avise o serviço: o contraste pode exigir cuidados.", 1),
    ("7000_3", "1", "Jejum de 6 horas. Bexiga cheia: beber 1 litro de água 1 hora antes.", 0),
    ("6100", "9", "Jejum de 8 a 12 horas (pode beber água). Traga a lista da medicação habitual.", 0),
    ("6100", "4", "Não precisa de jejum.", 0),
    ("9610", "1", "Traga a medicação habitual. As análises pré-tratamento são marcadas 1 a 3 dias antes.", 0),
    ("9602", "3", "Sem preparação especial.", 0),
    ("9602", "1", "Sem preparação especial.", 0),
    ("2102", "22", "Traga os exames realizados fora do IPO e a lista da medicação habitual.", 0),
    ("2102", "23", "Traga os exames realizados fora do IPO e a lista da medicação habitual.", 0),
    ("1300", "1", "Traga os exames e relatórios anteriores.", 0),
    ("2300", "1", "Traga os exames de imagem e relatórios anteriores.", 0),
]

# ================================================================ ESCRITA
def wcsv(name, rows, cols):
    with open(os.path.join(OUT, name), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(cols)
        for r in rows: w.writerow(r)

wcsv("especialidades.csv", ESPECIALIDADES, ["codigo", "descricao", "tipo_atividade", "entrada_pedidos_externos"])
wcsv("catalogo_atos.csv", [(k[0], k[1], *v) for k, v in CATALOGO.items()],
     ["especialidade_codigo", "ato_codigo", "ato_descricao", "tipo_atividade", "tipo_ato_medico", "duracao_min", "tipo_pedido"])
wcsv("exames.csv", EXAMES, ["codigo_exame", "descricao_exame", "especialidade_codigo", "ato_codigo"])
wcsv("analises.csv", ANALISES, ["codigo", "descricao"])
wcsv("gabinetes.csv", GABINETES, ["codigo", "descricao", "especialidade_codigo", "tipo_recurso"])
wcsv("utilizadores.csv", UTILIZADORES, ["utilizador_id", "nome", "perfil", "especialidade_codigo", "e_medico"])
wcsv("doentes.csv", [(x["doente_id"], x["n_utente"], x["nome"], x["sexo"], x["data_nascimento"], x["demo_cenario"],
                      x["diagnostico_principal"], x["estadiamento"], "|".join(x["alergias"]), x["contacto"],
                      x["notas_clinicas"], x["estadio_cuidado"], x["concelho"], x["distancia_km"],
                      x["contacto_digital"], x["aceita_antecipacao"], x["transporte_nao_urgente"])
                     for x in doentes.values()],
     ["doente_id", "n_utente", "nome", "sexo", "data_nascimento", "demo_cenario",
      "diagnostico_principal", "estadiamento", "alergias", "contacto", "notas_clinicas", "estadio_cuidado",
      "concelho", "distancia_km", "contacto_digital", "aceita_antecipacao", "transporte_nao_urgente"])
wcsv("preparacoes.csv", PREPARACOES, ["especialidade_codigo", "ato_codigo", "instrucoes", "requer_confirmacao"])
# Vagas protegidas (regra R-D): só o TAC, que é o recurso escasso da demo. As restantes especialidades
# não têm linha e mantêm o comportamento de "primeira vaga livre".
wcsv("regras_capacidade.csv", [("7000_2", 10, "MP|P")],
     ["especialidade_codigo", "horizonte_protegido_dias", "niveis_permitidos"])
wcsv("vagas.csv", [(v["vaga_id"], v["especialidade_codigo"], v["gabinete_codigo"], v["medico_id"], iso(v["data_hora"]),
                    v["duracao_min"], v["atos_permitidos"], v["ato_id"] or "") for v in vagas],
     ["vaga_id", "especialidade_codigo", "gabinete_codigo", "medico_id", "data_hora", "duracao_min", "atos_permitidos", "ato_id"])

# atos no formato do export real do Oasis (uma linha por exame, como no original) + colunas extra do MVP
rows = []
for a in atos:
    c = CATALOGO[(a["esp"], a["ato"])]
    exs = a["exames"] or [""]
    for ex in exs:
        rows.append([a["doente_id"], a["estado"], pt(a["data_hora"]), dur_txt(a["duracao"]), ESP[a["esp"]][1], a["esp"],
                     GAB[a["gab"]][1] if a["gab"] else "", a["gab"], a["ato"], c[0], pt(a["criado"]),
                     pt(a["atualizado"] or a["criado"]), ex, EXAME_DESC.get(ex, ""), c[1], c[2],
                     a["ato_id"], a["medico"], a["vaga_id"], a["pedido_id"], iso(a["prazo"]), a["prio"], a["n_rem"]])
wcsv("oasis_atos_medicos.csv", rows,
     ["ID", "Ato Médico_Estado", "Ato Médico_Data e hora", "Ato Médico_Duração", "Especialidade_Descrição",
      "Especialidade_Código", "Gabinete_Descrição", "Gabinete_Código", "Ato Médico_Código", "Ato Médico_Descrição",
      "Ato Médico_Data Criação", "Ato Médico_Data Última Atualização", "Ato Médico_Código Exame",
      "Ato Médico_Descrição Exame", "Tipo Atividade", "Tipo de Ato Médico",
      "mvp_ato_id", "mvp_medico_id", "mvp_vaga_id", "mvp_pedido_id", "mvp_prazo_limite", "mvp_prioridade",
      "mvp_n_remarcacoes"])

pcols = ["pedido_id", "doente_id", "consulta_origem_ato_id", "especialidade_origem", "medico_requisitante_id",
         "criado_em", "tipo_pedido", "fluxo", "especialidade_destino", "ato_codigo", "exames", "analises",
         "especificacao", "prioridade", "prazo_limite", "nao_antes", "medico_preferido_id",
         "continuidade_obrigatoria", "recorrencia", "texto_origem", "confianca", "aprovado_direto",
         "validado_por", "validado_em", "triado_por", "triado_em", "decisao_triagem", "marcado_em", "ato_id",
         "estado", "n_remarcacoes"]
wcsv("pedidos.csv", [[iso(p[c]) if isinstance(p[c], (date, datetime)) else ("" if p[c] is None else p[c])
                      for c in pcols] for p in pedidos], pcols)
dcols = ["dependencia_id", "pedido_id", "depende_de_pedido_id", "intervalo_min_dias", "critica", "origem", "regra_id"]
wcsv("dependencias.csv", [[x[c] for c in dcols] for x in dependencias], dcols)
ecols = ["evento_id", "pedido_id", "data_hora", "tipo", "estado_anterior", "estado_novo", "utilizador_id", "motivo", "detalhe"]
eventos.sort(key=lambda e: e["data_hora"])
wcsv("eventos.csv", [[x[c] for c in ecols] for x in eventos], ecols)

wcsv("regras_prazos.csv", [(tp, n, dias) for tp, m in PRAZOS.items() for n, dias in m.items()],
     ["tipo_pedido", "prioridade", "prazo_dias"])
wcsv("intervalos_resultado.csv", INTERVALO_RESULTADO.items(), ["especialidade_codigo", "dias_ate_resultado"])
wcsv("regras_dependencia.csv", [
    ("R1", "exame 7000_2 com contraste", "analises com Creatinina (A003)", 90, 1, 1,
     "TC com contraste exige creatinina com menos de 90 dias; se não existir, cria pedido de análises antes"),
    ("R2", "pedido_hd (QT)", "analises Hemograma+Bioquímica", 3, 1, 1,
     "Sessão de HD exige análises entre 1 e 3 dias antes"),
    ("R3", "consulta com 'c/ exames' / 'c/ resultados'", "todos os MCDT pedidos na mesma consulta", 0, 0, 1,
     "Revisão com exames depende dos exames pedidos na mesma consulta; intervalo = intervalos_resultado"),
], ["regra_id", "quando", "exige", "validade_dias", "intervalo_min_dias", "critica", "descricao"])
wcsv("parametros.csv", [
    ("DEMO_DATE", DEMO_DATE.isoformat(), "Data 'hoje' da demo"),
    ("congelamento_dias", 7, "Nunca propor mexer em marcações a menos de N dias"),
    ("limiar_confianca", 0.80, "Abaixo disto o pedido fica destacado na validação"),
    ("promover_regra_apos", 3, "Correcções iguais (em médicos diferentes ou aprovadas) para uma regra do médico passar a GLOBAL"),
    ("alerta_triagem_parada_dias", 3, "Pedido em triagem há mais de N dias úteis gera alerta"),
    ("semaforo_horizonte_dias", 14, "Consultas com dependências avaliadas nos próximos N dias"),
    ("alerta_remarcacoes", 2, "Doente remarcado N ou mais vezes gera alerta"),
    ("cromos_dia", 300, "Estimativa do utilizador (a validar)"),
    ("copias_por_cromo", 3, "Pressuposto (a validar)"),
    ("minutos_admin_por_cromo", 5, "Pressuposto (a validar)"),
    ("dias_uteis_mes", 22, ""),
    ("limiar_prioridade_mp", 70, "Score da equação (0-100) a partir do qual a prioridade calculada é Muito Prioritário"),
    ("limiar_prioridade_p", 42, "Score da equação (0-100) a partir do qual a prioridade calculada é Prioritário"),
    # --- regras de remarcação e de vagas libertadas (ESPECIFICACAO.md secção 8A) — a validar com a direcção clínica
    ("max_remarcacoes_hospital", 1, "Remarcações por iniciativa do hospital (90 dias) a partir das quais o doente nunca mais cede a vaga"),
    ("custo_idade_75", 20, "Custo de remarcar: doente com 75 anos ou mais"),
    ("custo_sem_contacto_digital", 25, "Custo de remarcar: sem SMS nem email (risco de não ver o aviso)"),
    ("custo_distancia_50km", 15, "Custo de remarcar: mora a 50 km ou mais"),
    ("custo_distancia_150km", 25, "Custo de remarcar: mora a 150 km ou mais (substitui o anterior)"),
    ("custo_transporte", 10, "Custo de remarcar: transporte não urgente já combinado"),
    ("custo_dia_agrupado", 20, "Custo de remarcar: tem outra marcação no hospital no mesmo dia"),
    ("custo_estadio_novo", 30, "Custo de remarcar: doente em diagnóstico (NOVO ou PRE_TRATAMENTO)"),
    ("bonus_folga_max", 30, "Desconto máximo no custo pela folga até ao prazo (1 ponto por cada 3 dias)"),
    ("libertar_protegidas_dias", 3, "Uma vaga protegida fica aberta a qualquer pedido a partir de D-N"),
    ("antecipacao_ganho_min_dias", 3, "Só se oferece uma antecipação se o doente ganhar pelo menos N dias"),
    ("antecipacao_ganho_diagnostico_dias", 7, "Doente em diagnóstico dentro do prazo: ganho mínimo para lhe oferecer a vaga"),
    ("oferta_resposta_horas", 24, "Prazo para o doente responder a uma oferta de antecipação"),
    ("cascata_max", 3, "Níveis máximos de cascata quando uma antecipação liberta outra vaga"),
    ("distancia_agrupar_km", 50, "A partir desta distância, o agendamento prefere dias em que o doente já vem ao hospital"),
    ("lista_chamadas_dias", 10, "Horizonte da lista de chamadas da administrativa"),
    ("idade_chamada", 80, "Idade a partir da qual o doente entra na lista de chamadas"),
    ("custo_medio_vaga_tac", 120, "Estimativa (a validar): valor de uma vaga de TAC, em euros, para o impacto"),
    ("reducao_faltas_lembrete", 0.3, "Pressuposto (a validar): fracção das faltas evitadas com lembrete + chamada"),
], ["parametro", "valor", "descricao"])

print("doentes", len(doentes), "vagas", len(vagas), "atos", len(atos), "pedidos", len(pedidos),
      "dependencias", len(dependencias), "eventos", len(eventos))
from collections import Counter
print(Counter(p["estado"] for p in pedidos))
print(Counter(p["tipo_pedido"] for p in pedidos))
fut_tac_free = [v for v in vagas_by_esp["7000_2"] if not v["ato_id"] and DEMO_DATE <= v["data_hora"].date() <= DEMO_DATE + timedelta(days=20)]
print("TAC livres próximos 20 dias:", len(fut_tac_free))
