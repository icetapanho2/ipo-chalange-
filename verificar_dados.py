"""Verifica a coerência dos dados gerados e as pré-condições dos cenários da demo.
Correr depois de gerar_dados.py:  python verificar_dados.py   (sai com erro se algo falhar)"""
import csv, os, sys
from datetime import datetime, date, timedelta

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dados")
def load(n): return list(csv.DictReader(open(os.path.join(D, n), encoding="utf-8-sig"), delimiter=";"))
def dt_pt(s): return datetime.strptime(s, "%d/%m/%Y %H:%M")
def dt_iso(s): return datetime.fromisoformat(s) if s else None

DEMO = date(2026, 9, 23); NOW = datetime(2026, 9, 23, 8, 0)
vagas = {v["vaga_id"]: v for v in load("vagas.csv")}
atos = {}
for r in load("oasis_atos_medicos.csv"): atos.setdefault(r["mvp_ato_id"], r)
pedidos = {p["pedido_id"]: p for p in load("pedidos.csv")}
deps = load("dependencias.csv"); evs = load("eventos.csv")
interval = {r["especialidade_codigo"]: int(r["dias_ate_resultado"]) for r in load("intervalos_resultado.csv")}
erros = []
def check(cond, msg):
    if not cond: erros.append(msg)

# --- agenda
for aid, a in atos.items():
    if a["mvp_vaga_id"]:
        check(vagas[a["mvp_vaga_id"]]["ato_id"] == aid, f"vaga {a['mvp_vaga_id']} não aponta para {aid}")
occ = [v["ato_id"] for v in vagas.values() if v["ato_id"]]
check(len(occ) == len(set(occ)), "ato em mais do que uma vaga")
for aid, a in atos.items():
    d = dt_pt(a["Ato Médico_Data e hora"])
    if a["Ato Médico_Estado"] == "REALIZADA": check(d.date() < DEMO, f"{aid} REALIZADA no futuro")
    if a["Ato Médico_Estado"] == "MARCADA": check(d.date() >= DEMO, f"{aid} MARCADA no passado")
    check(dt_pt(a["Ato Médico_Data Criação"]) <= d, f"{aid} criado depois da data do ato")

# --- pedidos
ESTADOS = {"EXTRAIDO", "VALIDADO", "EM_TRIAGEM", "ACEITE", "MARCADO", "REALIZADO", "DEVOLVIDO", "RECUSADO",
           "REENCAMINHADO", "SEM_VAGA", "FALTOU", "CANCELADO"}
for pid, p in pedidos.items():
    check(p["estado"] in ESTADOS, f"{pid} estado inválido {p['estado']}")
    if p["estado"] in ("MARCADO", "REALIZADO", "FALTOU"):
        check(p["ato_id"] in atos, f"{pid} sem ato")
        a = atos[p["ato_id"]]; d = dt_pt(a["Ato Médico_Data e hora"])
        check(a["mvp_pedido_id"] == pid, f"{pid} ato não aponta para o pedido")
        check(dt_iso(p["marcado_em"]) < NOW, f"{pid} marcado no futuro")
        check(dt_iso(p["marcado_em"]).date() < d.date() or p["pedido_id"] in ("P00001",), f"{pid} marcado depois/no dia do ato")
        if p["estado"] == "REALIZADO": check(d.date() < DEMO, f"{pid} REALIZADO com ato futuro")
        if p["estado"] == "MARCADO": check(d.date() >= DEMO, f"{pid} MARCADO com ato passado")
        if p["continuidade_obrigatoria"] == "1" and p["medico_preferido_id"]:
            check(a["mvp_medico_id"] == p["medico_preferido_id"], f"{pid} quebra continuidade")
        if p["nao_antes"]: check(d.date() >= date.fromisoformat(p["nao_antes"]), f"{pid} antes do 'não antes'")
    if p["validado_em"]: check(dt_iso(p["validado_em"]) >= dt_iso(p["criado_em"]), f"{pid} validado antes de criado")
    if p["triado_em"]: check(dt_iso(p["triado_em"]) >= dt_iso(p["validado_em"]), f"{pid} triado antes de validado")

# --- dependências
for dp in deps:
    b, a_ = pedidos[dp["pedido_id"]], pedidos[dp["depende_de_pedido_id"]]
    if not (b["ato_id"] and a_["ato_id"]): continue
    db = dt_pt(atos[b["ato_id"]]["Ato Médico_Data e hora"]).date()
    da = dt_pt(atos[a_["ato_id"]]["Ato Médico_Data e hora"]).date()
    if dp["regra_id"] == "R2":
        check(1 <= (db - da).days <= 3, f"R2 violada {b['pedido_id']}")
    elif a_["estado"] != "FALTOU":
        check(db >= da + timedelta(days=int(dp["intervalo_min_dias"])), f"dependência violada {b['pedido_id']}←{a_['pedido_id']}")

# --- eventos
for e in evs:
    p = pedidos[e["pedido_id"]]
    check(dt_iso(e["data_hora"]) >= dt_iso(p["criado_em"]), f"evento {e['evento_id']} antes da criação do pedido")
    check(dt_iso(e["data_hora"]) < NOW + timedelta(hours=1), f"evento {e['evento_id']} no futuro")

# --- pré-condições da demo
def livres(esp, d0, d1, med=None):
    return [v for v in vagas.values() if v["especialidade_codigo"] == esp and not v["ato_id"]
            and d0 <= datetime.fromisoformat(v["data_hora"]).date() <= d1 and (med is None or v["medico_id"] == med)]
def atos_doente(pid): return [a for a in atos.values() if a["ID"] == pid]
def ped_doente(pid): return [p for p in pedidos.values() if p["doente_id"] == pid]

check(not livres("7000_2", date(2026, 9, 24), date(2026, 10, 13)), "TAC tem vagas livres antes de 14/10")
check(len(livres("7000_2", date(2026, 10, 14), date(2026, 10, 14))) >= 2, "sem 2 vagas TAC livres a 14/10")
man = [a for a in atos_doente("100106") if a["Especialidade_Código"] == "7000_2"]
check(man and man[0]["Ato Médico_Data e hora"] == "02/10/2026 10:00", "Manuel não está no TAC de 02/10 10:00")
jose = [p for p in ped_doente("100104") if p["tipo_pedido"] == "exame"]
check(jose and jose[0]["estado"] == "EXTRAIDO" and jose[0]["prazo_limite"] == "2026-10-05", "José: pedido TC não está EXTRAIDO até 05/10")
cands = [a for a in atos.values() if a["Especialidade_Código"] == "7000_2" and a["mvp_prazo_limite"]
         and date(2026, 9, 30) <= dt_pt(a["Ato Médico_Data e hora"]).date() <= date(2026, 10, 5)]
best = max(cands, key=lambda a: (date.fromisoformat(a["mvp_prazo_limite"]) - dt_pt(a["Ato Médico_Data e hora"]).date()).days)
check(best["ID"] == "100106", f"o melhor candidato à troca não é o Manuel ({best['ID']})")
ant = {p["tipo_pedido"] + p["estado"] for p in ped_doente("100102")}
check({"analisesFALTOU", "exameREALIZADO", "consultaMARCADO"} <= ant, "António: estados do cenário incorrectos")
check(livres("6100", date(2026, 9, 24), date(2026, 9, 25)), "sem colheitas livres 24–25/09 (António)")
check(livres("2300", date(2026, 9, 30), date(2026, 9, 30)), "sem vaga RT a 30/09 (Luísa)")
check(livres("9610", date(2026, 9, 25), date(2026, 9, 25)), "sem vaga HD a 25/09 (Fernando)")
check(livres("9602", date(2026, 9, 24), date(2026, 9, 25)), "sem vagas de enfermagem 24–25/09 (Rosa/Carlos)")
check(len(livres("2102", date(2026, 10, 21), date(2026, 10, 23), "U01")) >= 3, "Dr. Pedro sem 3 vagas 21–23/10")
for pid in ("100101", "100105", "100107"):
    check(any(a["Ato Médico_Data e hora"].startswith("23/09/2026") and a["Ato Médico_Estado"] == "MARCADA"
              for a in atos_doente(pid)), f"{pid} sem consulta hoje")
for pid in ("100103", "100108"):
    check(any(p["estado"] == "EM_TRIAGEM" for p in ped_doente(pid)), f"{pid} sem pedido em triagem")

if erros:
    print(f"{len(erros)} PROBLEMAS:"); [print(" -", e) for e in erros[:40]]; sys.exit(1)
print(f"OK — {len(pedidos)} pedidos, {len(atos)} atos, {len(deps)} dependências, {len(evs)} eventos; cenários da demo válidos.")
