# -*- coding: utf-8 -*-
"""Faturamento por cliente, posicao bancaria e orcamento."""
import json, datetime as dt, random, pathlib, xlsxwriter, collections, sys
sys.path.insert(0, "."); import empresa as E
random.seed(20260826)
OUT = pathlib.Path("/Users/olpi/Desktop/Offroad Capital/simulacao/empresa/documentos")
HOJE = dt.date(2026, 6, 30)
ts = json.load(open("_base_final.json")); sac = json.load(open("_sacados.json"))
for t in ts: t["_emis"] = dt.date.fromisoformat(t["emis"])

def novo(nome):
    wb = xlsxwriter.Workbook(nome)
    return wb, wb.add_format({"bold": True, "bg_color": "#D9D9D9", "border": 1}), \
           wb.add_format({"num_format": "#,##0.00"}), wb.add_format({"bold": True})

# -------------------------------------------------- Faturamento por cliente
wb, F, M, B = novo(OUT / "comercial" / "Faturamento por cliente.xlsx")
for ano, nome_aba in ((2025, "2025"), (2026, "2026 (ate junho)")):
    ws = wb.add_worksheet(nome_aba)
    ws.write(0, 0, f"FATURAMENTO POR CLIENTE - {ano}", B)
    for c, h in enumerate(["Cliente", "CNPJ", "Valor faturado", "Qtd notas", "% do total"]):
        ws.write(2, c, h, F)
    vol = collections.Counter(); qtd = collections.Counter()
    for t in ts:
        if t["_emis"].year == ano: vol[t["sac"]] += t["valor"]; qtd[t["sac"]] += 1
    tot = sum(vol.values()); r = 3
    for sid in sorted(vol, key=vol.get, reverse=True):
        s = sac[sid]
        # DEFEITO: grafia do nome varia entre as abas
        nm = s["nome"] if ano == 2025 else s["nome"].title().replace(" Ltda", " LTDA")
        ws.write(r, 0, nm); ws.write(r, 1, s["cnpj"])
        ws.write_number(r, 2, round(vol[sid], 2), M); ws.write_number(r, 3, qtd[sid])
        ws.write_number(r, 4, round(vol[sid] / tot * 100, 2)); r += 1
    ws.write(r, 0, "TOTAL", B); ws.write_number(r, 2, round(tot, 2), M)
    ws.set_column(0, 0, 48); ws.set_column(1, 1, 20); ws.set_column(2, 4, 16)
wb.close(); print("Faturamento por cliente.xlsx")

# -------------------------------------------------- Posicao bancaria
# DEFEITO 4: so a divida bancaria. Cessoes, risco sacado, factoring e PERT ficam de fora.
R = E.REAL
wb, F, M, B = novo(OUT / "divida" / "posicao bancaria.xlsx")
ws = wb.add_worksheet("Posicao")
ws.write(0, 0, "POSICAO DE ENDIVIDAMENTO BANCARIO", B)
ws.write(1, 0, "Base: 30/06/2026 - elaborado pelo financeiro")
for c, h in enumerate(["Banco", "Modalidade", "Contrato", "Saldo devedor", "Taxa",
                       "Vencimento", "Garantia"]): ws.write(3, c, h, F)
LIN = [("Banco do Brasil", "Capital de giro", "CG-2024/8871", 4_900_000, "CDI + 3,85% a.a.", "mar/2028", "Aval dos socios"),
       ("Itau Unibanco", "Capital de giro", "44.192-7", 3_500_000, "CDI + 4,20% a.a.", "set/2027", "Aval dos socios"),
       ("Sicoob", "Conta garantida", "CC-118.442", 2_100_000, "CDI + 6,40% a.a.", "Rotativo", "Aval dos socios"),
       ("Banco do Brasil", "FINAME empilhadeiras", "FIN-2023/2214", 2_000_000, "TLP + 2,90% a.a.", "jun/2029", "Alienacao dos equipamentos")]
r = 4
for b_, mod, ctr, val, tx, vc, gar in LIN:
    ws.write(r, 0, b_); ws.write(r, 1, mod); ws.write(r, 2, ctr)
    ws.write_number(r, 3, val, M); ws.write(r, 4, tx); ws.write(r, 5, vc); ws.write(r, 6, gar); r += 1
ws.write(r, 0, "TOTAL", B); ws.write_formula(r, 3, f"=SUM(D5:D{r})", M)
ws.write(r + 2, 0, "Obs.: nao inclui o desconto de duplicatas, que e rotativo.")
ws.set_column(0, 0, 20); ws.set_column(1, 1, 24); ws.set_column(2, 2, 16)
ws.set_column(3, 3, 16); ws.set_column(4, 6, 22)
wb.close(); print("posicao bancaria.xlsx   (sem cessoes, risco sacado, factoring e PERT)")

# -------------------------------------------------- Orcamento
wb, F, M, B = novo(OUT / "comercial" / "Orcamento 2026 v4 FINAL (2).xlsx")
ws = wb.add_worksheet("Premissas")
ws.write(0, 0, "PREMISSAS", B)
PREM = [("Crescimento de receita 2026", "18%"), ("Crescimento 2027 com CD Vitoria", "26%"),
        ("Margem bruta", "35,5%"), ("Despesa comercial sobre receita", "9,8%"),
        ("Prazo medio de recebimento", "45 dias"), ("Prazo medio de estoque", "72 dias"),
        ("Prazo medio de fornecedor", "38 dias"), ("CDI medio", "10,75%")]
for r, (k, v) in enumerate(PREM, 2): ws.write(r, 0, k); ws.write(r, 1, v)
ws.set_column(0, 0, 40); ws.set_column(1, 1, 16)
ws2 = wb.add_worksheet("DRE proj")
ws2.write(0, 0, "DRE PROJETADA - R$ MIL", B)
for c, h in enumerate(["", "2026E", "2027E", "2028E"]): ws2.write(2, c, h, F)
DRE = [("Receita bruta", 73_100, 92_100, 106_800), ("Deducoes", -12_400, -15_600, -18_100),
       ("Receita liquida", 60_700, 76_500, 88_700), ("CMV", -39_200, -49_300, -57_100),
       ("Lucro bruto", 21_500, 27_200, 31_600), ("Despesas operacionais", -16_100, -19_900, -22_600),
       ("EBITDA", 5_400, 7_300, 9_000)]
for r, (k, *v) in enumerate(DRE, 3):
    ws2.write(r, 0, k, B if k in ("Receita liquida", "EBITDA") else None)
    for c, x in enumerate(v, 1): ws2.write_number(r, c, x, M)
ws2.set_column(0, 0, 28); ws2.set_column(1, 3, 14)
wb.close(); print("Orcamento 2026 v4 FINAL (2).xlsx")
