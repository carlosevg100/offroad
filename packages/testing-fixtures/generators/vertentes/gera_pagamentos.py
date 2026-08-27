# -*- coding: utf-8 -*-
"""Simula pagamento, atraso, renegociacao, abatimento e perda, por safra.
Planta os defeitos 2, 3, 6 e 7. Grava a base final."""
import json, datetime as dt, numpy as np, pathlib

SEED = 20260826
rng = np.random.default_rng(SEED + 1)
HOJE = dt.date(2026, 6, 30)

ts = json.load(open("_titulos_raw.json"))
sac = json.load(open("_sacados.json"))
for t in ts:
    t["emis"] = dt.date.fromisoformat(t["emis"]); t["venc"] = dt.date.fromisoformat(t["venc"])

# --- comportamento por classe: (p_pontual, p_atraso_curto, p_atraso_longo, p_perda)
COMP = {"A": (0.50, 0.455, 0.037, 0.008),
        "B": (0.34, 0.500, 0.115, 0.045),
        "C": (0.18, 0.400, 0.300, 0.120)}

# --- safra ruim: um sacado grande quebra em mai/2025
por_sac = {}
for t in ts: por_sac[t["sac"]] = por_sac.get(t["sac"], 0) + t["valor"]
grandes = sorted(por_sac, key=por_sac.get, reverse=True)
excl = {s["id"] for s in sac if s["grupo"] != s["id"] or s.get("parte_relacionada")}
excl |= {s["grupo"] for s in sac if s["grupo"] != s["id"]}
QUEBROU = next(g for g in grandes[2:] if g not in excl)
DATA_QUEBRA = dt.date(2025, 5, 1)

n_reneg = 0; n_nf_cancel = 0
for t in ts:
    cls = t["cls"]
    p = list(COMP[cls])
    # a safra de mai/2025 do sacado que quebrou vira perda
    quebra = (t["sac"] == QUEBROU and DATA_QUEBRA <= t["emis"] < DATA_QUEBRA + dt.timedelta(days=95))
    if quebra:
        p = [0.0, 0.0, 0.10, 0.90]
    # sazonal: janeiro e fevereiro pagam pior
    if t["venc"].month in (1, 2):
        p = [p[0] * 0.82, p[1] * 1.12, p[2] * 1.30, p[3] * 1.25]
    p = np.array(p) / np.array(p).sum()
    caso = rng.choice(4, p=p)

    t["abat"] = 0.0
    if caso == 0:                                   # pontual ou adiantado
        atraso = int(rng.integers(-3, 4))
    elif caso == 1:                                 # atraso curto
        atraso = int(rng.gamma(2.2, 5.0)) + 1
    elif caso == 2:                                 # atraso longo
        atraso = 31 + int(rng.gamma(1.5, 55.0))
    else:                                           # perda
        atraso = None

    if atraso is None:
        t["pag"] = None; t["vpago"] = 0.0
        t["status"] = "PERDA" if (HOJE - t["venc"]).days > 180 else "VENCIDO"
    else:
        pag = t["venc"] + dt.timedelta(days=atraso)
        if pag > HOJE:
            t["pag"] = None; t["vpago"] = 0.0
            t["status"] = "ABERTO" if t["venc"] >= HOJE else "VENCIDO"
        else:
            # abatimento comercial em parte dos titulos (diluicao)
            if rng.random() < 0.155:
                t["abat"] = round(t["valor"] * float(rng.uniform(0.05, 0.30)), 2)
            t["pag"] = pag; t["vpago"] = round(t["valor"] - t["abat"], 2)
            t["status"] = "LIQUIDADO"

# ---------------------------------------- DEFEITO 2: renegociados sem marcacao
cands = [t for t in ts if t["status"] in ("VENCIDO", "PERDA") and (HOJE - t["venc"]).days > 60]
rng.shuffle(cands)
for t in cands[:340]:
    t["venc_original"] = t["venc"].isoformat()      # fica so no gabarito
    novo = t["venc"] + dt.timedelta(days=int(rng.integers(90, 260)))
    t["venc"] = min(novo, HOJE + dt.timedelta(days=120))
    t["status"] = "ABERTO" if t["venc"] >= HOJE else "VENCIDO"
    t["_reneg"] = True
    n_reneg += 1

# ---------------------------------------- DEFEITO 6: NF cancelada, titulo em aberto
abertos = [t for t in ts if t["status"] in ("ABERTO", "VENCIDO")]
rng.shuffle(abertos)
for t in abertos[:120]:
    t["_nf_cancelada"] = True
    n_nf_cancel += 1

# ---------------------------------------- numero da NF e chave
for i, t in enumerate(ts):
    t["nf"] = 20000 + i
    t["chave"] = "3126%02d0841266300014755001%09d1%08d" % (t["emis"].month, t["nf"], 10000000 + i)

emit = sum(t["valor"] for t in ts)
perda = sum(t["valor"] for t in ts if t["status"] == "PERDA")
abat = sum(t["abat"] for t in ts)
venc30 = sum(t["valor"] for t in ts if t["status"] == "VENCIDO" and (HOJE - t["venc"]).days > 30)
aberto = sum(t["valor"] for t in ts if t["status"] in ("ABERTO", "VENCIDO"))
print("emitido em 24 meses  R$ %s" % format(int(emit), ",d").replace(",", "."))
print("perda (>180d)        R$ %s   %.2f%%" % (format(int(perda), ",d").replace(",", "."), perda/emit*100))
print("abatimento           R$ %s   %.2f%%" % (format(int(abat), ",d").replace(",", "."), abat/emit*100))
print("vencido >30d         R$ %s   %.2f%%" % (format(int(venc30), ",d").replace(",", "."), venc30/emit*100))
print("carteira em aberto   R$ %s" % format(int(aberto), ",d").replace(",", "."))
print("renegociados sem marca:", n_reneg, "| NF cancelada em aberto:", n_nf_cancel)
print("sacado que quebrou: id", QUEBROU, sac[QUEBROU]["nome"][:44])

for t in ts:
    t["emis"] = t["emis"].isoformat(); t["venc"] = t["venc"].isoformat()
    if t["pag"]: t["pag"] = t["pag"].isoformat()
pathlib.Path("_base_final.json").write_text(json.dumps(ts))
pathlib.Path("_gabarito_parcial.json").write_text(json.dumps(dict(
    emitido=emit, perda=perda, abatimento=abat, vencido30=venc30, aberto=aberto,
    n_reneg=n_reneg, n_nf_cancel=n_nf_cancel, sacado_quebrou=QUEBROU,
    grupo_merge=[s["id"] for s in sac if s["grupo"] != s["id"]],
    parte_relacionada=[s["id"] for s in sac if s.get("parte_relacionada")])))
