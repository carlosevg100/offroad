# -*- coding: utf-8 -*-
"""Gera os arquivos como a area financeira entregaria: mal formatados de proposito."""
import json, datetime as dt, random, unicodedata, pathlib
import xlsxwriter

random.seed(20260826)
OUT = pathlib.Path("/Users/olpi/Desktop/Offroad Capital/simulacao/empresa/documentos")
HOJE = dt.date(2026, 6, 30)
ts = json.load(open("_base_final.json"))
sac = json.load(open("_sacados.json"))
for t in ts:
    t["_emis"] = dt.date.fromisoformat(t["emis"])
    t["_venc"] = dt.date.fromisoformat(t["venc"])
    t["_pag"] = dt.date.fromisoformat(t["pag"]) if t["pag"] else None

def br(v, casas=2):
    s = f"{v:,.{casas}f}"
    return s.replace(",", "@").replace(".", ",").replace("@", ".")

# ============================================================ 1. CSV de titulos
# separador ponto e virgula, latin-1, data em tres formatos, decimal com virgula
def data_fmt(d, modo):
    if d is None: return ""
    if modo == 0: return d.strftime("%d/%m/%Y")
    if modo == 1: return d.strftime("%Y-%m-%d")
    return d.strftime("%d.%m.%y")

linhas = ["SEQ;NUM_TITULO;CNPJ_SACADO;NOME_SACADO;NUM_NF;CHAVE_NFE;DT_EMISSAO;DT_VENCIMENTO;"
          "DT_PAGAMENTO;VLR_TITULO;VLR_PAGO;VLR_ABATIMENTO;SITUACAO;DIAS_ATRASO;VENDEDOR"]
VEND = ["R.SOUZA", "M.ALVES", "P.GOMES", "L.FARIA", "A.DUARTE", "J.MELO", "C.PINTO"]
for i, t in enumerate(sorted(ts, key=lambda x: (x["_emis"], x["id"])), 1):
    s = sac[t["sac"]]
    modo = 0 if i % 17 else (1 if i % 2 else 2)      # a maioria dd/mm/aaaa, o resto varia
    if t["_pag"]:
        atraso = (t["_pag"] - t["_venc"]).days
    else:
        atraso = max(0, (HOJE - t["_venc"]).days)
    cnpj = s["cnpj"] if i % 3 else s["cnpj"].replace(".", "").replace("/", "").replace("-", "")
    linhas.append(";".join([
        str(i), str(t["id"]), cnpj, s["nome"], str(t["nf"]), t["chave"],
        data_fmt(t["_emis"], modo), data_fmt(t["_venc"], modo), data_fmt(t["_pag"], modo),
        br(t["valor"]), br(t["vpago"]) if t["_pag"] else "0,00", br(t["abat"]),
        t["status"], str(atraso), random.choice(VEND)]))
p = OUT / "recebiveis" / "titulos_em_aberto_e_liquidados.csv"
p.write_bytes(("\r\n".join(linhas)).encode("latin-1", "replace"))
print("CSV titulos      %6d linhas  %5.1f MB" % (len(linhas), p.stat().st_size / 1e6))

# ============================================================ 2. AGING.xlsx
# uma aba por mes, nome de aba inconsistente, faixas com nomes diferentes
wb = xlsxwriter.Workbook(OUT / "recebiveis" / "AGING.xlsx")
fmt_t = wb.add_format({"bold": True, "bg_color": "#DDDDDD", "border": 1})
fmt_m = wb.add_format({"num_format": "#,##0.00"})
MES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
FAIXAS_A = ["A vencer", "01 a 30", "31 a 60", "61 a 90", "91 a 180", "Acima de 180"]
FAIXAS_B = ["A VENCER", "1-30 DIAS", "31-60 DIAS", "61-90 DIAS", "91-180 DIAS", ">180 DIAS"]
d = dt.date(2024, 7, 31)
abas = 0
while d <= HOJE:
    nome = (f"{MES_PT[d.month-1]}-{str(d.year)[2:]}" if abas % 3
            else f"{d.month:02d}.{d.year}")
    ws = wb.add_worksheet(nome[:31])
    faixas = FAIXAS_A if abas % 2 else FAIXAS_B
    ws.write(0, 0, f"POSICAO EM {d.strftime('%d/%m/%Y')}", fmt_t)
    for c, h in enumerate(["Sacado"] + faixas + ["Total"]): ws.write(2, c, h, fmt_t)
    ag = {}
    for t in ts:
        if t["_emis"] > d: continue
        if t["_pag"] and t["_pag"] <= d: continue
        dias = (d - t["_venc"]).days
        k = (0 if dias <= 0 else 1 if dias <= 30 else 2 if dias <= 60
             else 3 if dias <= 90 else 4 if dias <= 180 else 5)
        nm = sac[t["sac"]]["nome"]
        ag.setdefault(nm, [0.0] * 6)[k] += t["valor"] - t["abat"]
    r = 3
    for nm in sorted(ag, key=lambda x: -sum(ag[x])):
        ws.write(r, 0, nm)
        for c, v in enumerate(ag[nm], 1): ws.write_number(r, c, round(v, 2), fmt_m)
        ws.write_number(r, 7, round(sum(ag[nm]), 2), fmt_m); r += 1
    ws.write(r, 0, "TOTAL GERAL", fmt_t)
    for c in range(1, 8):
        ws.write_formula(r, c, f"=SUM({chr(65+c)}4:{chr(65+c)}{r})", fmt_m)
    ws.set_column(0, 0, 46); ws.set_column(1, 7, 14)
    abas += 1
    d = (d.replace(day=28) + dt.timedelta(days=8)).replace(day=1) - dt.timedelta(days=1)
    d = (d.replace(day=28) + dt.timedelta(days=8)).replace(day=1) - dt.timedelta(days=1) if False else d
    nxt = (d.replace(day=28) + dt.timedelta(days=8)).replace(day=1)
    d = (nxt.replace(day=28) + dt.timedelta(days=8)).replace(day=1) - dt.timedelta(days=1)
wb.close()
print("AGING.xlsx       %6d abas" % abas)
