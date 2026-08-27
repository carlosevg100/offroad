# -*- coding: utf-8 -*-
"""Cadastro de sacados, devolucoes, razao de clientes, faturamento e posicao bancaria."""
import json, datetime as dt, random, pathlib, xlsxwriter, collections
import sys
sys.path.insert(0, ".")
import empresa as E

random.seed(20260826)
OUT = pathlib.Path("/Users/olpi/Desktop/Offroad Capital/simulacao/empresa/documentos")
HOJE = dt.date(2026, 6, 30)
ts = json.load(open("_base_final.json")); sac = json.load(open("_sacados.json"))
for t in ts:
    t["_emis"] = dt.date.fromisoformat(t["emis"]); t["_venc"] = dt.date.fromisoformat(t["venc"])
    t["_pag"] = dt.date.fromisoformat(t["pag"]) if t["pag"] else None

def novo(nome):
    wb = xlsxwriter.Workbook(nome)
    return wb, (wb.add_format({"bold": True, "bg_color": "#D9D9D9", "border": 1}),
                wb.add_format({"num_format": "#,##0.00"}),
                wb.add_format({"bold": True}))

# ---------------------------------------------------- Cadastro de Sacados
wb, (F, M, B) = novo(OUT / "recebiveis" / "Cadastro de Sacados.xlsx")
ws = wb.add_worksheet("Cadastro")
ws.write(0, 0, "VERTENTES DISTRIBUIDORA - CADASTRO DE CLIENTES", B)
ws.write(1, 0, "Extraido do sistema em 30/06/2026")
for c, h in enumerate(["Codigo", "CNPJ", "Razao Social", "Cidade", "UF", "Limite de Credito",
                       "Data Cadastro", "Situacao", "Vendedor"]): ws.write(3, c, h, F)
CID = [("Contagem", "MG"), ("Belo Horizonte", "MG"), ("Betim", "MG"), ("Juiz de Fora", "MG"),
       ("Vitoria", "ES"), ("Serra", "ES"), ("Uberlandia", "MG"), ("Divinopolis", "MG"),
       ("Cariacica", "ES"), ("Sete Lagoas", "MG")]
vol = collections.Counter()
for t in ts: vol[t["sac"]] += t["valor"]
for r, s in enumerate(sac, 4):
    cid, uf = random.choice(CID)
    # DEFEITO: CNPJ ora com mascara, ora sem
    cnpj = s["cnpj"] if r % 4 else s["cnpj"].replace(".", "").replace("/", "").replace("-", "")
    lim = round(max(5_000, vol[s["id"]] / 24 * random.uniform(0.8, 3.2)), -2)
    ws.write(r, 0, 10000 + s["id"]); ws.write(r, 1, cnpj); ws.write(r, 2, s["nome"])
    ws.write(r, 3, cid); ws.write(r, 4, uf); ws.write_number(r, 5, lim, M)
    ws.write(r, 6, (dt.date(2006, 1, 1) + dt.timedelta(days=random.randint(0, 7000))).strftime("%d/%m/%Y"))
    ws.write(r, 7, "ATIVO" if vol[s["id"]] > 0 else "INATIVO")
    ws.write(r, 8, random.choice(["R.SOUZA", "M.ALVES", "P.GOMES", "L.FARIA", "A.DUARTE"]))
ws.set_column(0, 0, 9); ws.set_column(1, 1, 20); ws.set_column(2, 2, 48); ws.set_column(5, 5, 16)
wb.close(); print("Cadastro de Sacados.xlsx    %d linhas" % len(sac))

# ---------------------------------------------------- Devolucoes e abatimentos
# DEFEITO 7: registro parcial e conta contabil errada
wb, (F, M, B) = novo(OUT / "recebiveis" / "Devolucoes e abatimentos.xlsx")
ws = wb.add_worksheet("2025-2026")
ws.write(0, 0, "CONTROLE DE DEVOLUCOES, BONIFICACOES E ABATIMENTOS", B)
ws.write(1, 0, "Lancado na conta 4.2.09.001 - Despesas Comerciais Diversas")
for c, h in enumerate(["Mes", "Devolucao de venda", "Bonificacao", "Abatimento comercial",
                       "Total", "Conta contabil"]): ws.write(3, c, h, F)
por_mes = collections.OrderedDict()
for t in ts:
    if t["abat"] > 0 and t["_pag"]:
        k = t["_pag"].strftime("%m/%Y"); por_mes[k] = por_mes.get(k, 0) + t["abat"]
r = 4
for k in sorted(por_mes, key=lambda x: (x[3:], x[:2])):
    v = por_mes[k]
    dev, bon = v * 0.46, v * 0.19
    ws.write(r, 0, k); ws.write_number(r, 1, round(dev, 2), M)
    ws.write_number(r, 2, round(bon, 2), M); ws.write_number(r, 3, round(v - dev - bon, 2), M)
    ws.write_number(r, 4, round(v, 2), M); ws.write(r, 5, "4.2.09.001"); r += 1
ws.write(r, 0, "TOTAL", B); ws.write_formula(r, 4, f"=SUM(E5:E{r})", M)
ws.set_column(0, 0, 12); ws.set_column(1, 4, 18); ws.set_column(5, 5, 16)
wb.close(); print("Devolucoes e abatimentos.xlsx")

# ---------------------------------------------------- Razao de clientes
# DEFEITO 5: nao bate com a base analitica. Cabecalho na linha 7, valores como texto
wb, (F, M, B) = novo(OUT / "contabil" / "razao clientes 2024-2025.xlsx")
ws = wb.add_worksheet("Razao")
ws.merge_range(0, 0, 0, 5, "VERTENTES DISTRIBUIDORA DE MATERIAIS ELETRICOS E HIDRAULICOS LTDA", B)
ws.merge_range(1, 0, 1, 5, "CNPJ 08.412.663/0001-47")
ws.merge_range(2, 0, 2, 5, "RAZAO ANALITICO - CONTA 1.1.02.001 CLIENTES NACIONAIS")
ws.merge_range(3, 0, 3, 5, "PERIODO: 01/07/2024 A 30/06/2026")
ws.write(5, 0, "Escritorio Contabil Prado & Associados")
for c, h in enumerate(["Data", "Historico", "Documento", "Debito", "Credito", "Saldo"]):
    ws.write(6, c, h, F)
d = dt.date(2024, 7, 31); saldo = 0.0; r = 7
PLANTA_MES = dt.date(2025, 9, 30)   # DEFEITO 5: lancamento manual sem lastro na base
while d <= HOJE:
    deb = sum(t["valor"] for t in ts if t["_emis"].year == d.year and t["_emis"].month == d.month)
    cre = sum(t["vpago"] + t["abat"] for t in ts if t["_pag"] and t["_pag"].year == d.year and t["_pag"].month == d.month)
    saldo += deb - cre
    ws.write(r, 0, d.strftime("%d/%m/%Y"))
    ws.write(r, 1, "Faturamento do mes - vendas a prazo"); ws.write(r, 2, "RESUMO")
    ws.write_string(r, 3, f"{deb:,.2f}".replace(",", "@").replace(".", ",").replace("@", "."))
    ws.write_string(r, 4, f"{cre:,.2f}".replace(",", "@").replace(".", ",").replace("@", "."))
    ws.write_string(r, 5, f"{saldo:,.2f}".replace(",", "@").replace(".", ",").replace("@", "."))
    r += 1
    if d == PLANTA_MES:
        saldo += 1_900_000.0
        ws.write(r, 0, d.strftime("%d/%m/%Y"))
        ws.write(r, 1, "Ajuste de conciliacao - reclassificacao"); ws.write(r, 2, "AJ-0917")
        ws.write_string(r, 3, "1.900.000,00"); ws.write_string(r, 4, "")
        ws.write_string(r, 5, f"{saldo:,.2f}".replace(",", "@").replace(".", ",").replace("@", "."))
        r += 1
    nxt = (d.replace(day=28) + dt.timedelta(days=8)).replace(day=1)
    d = (nxt.replace(day=28) + dt.timedelta(days=8)).replace(day=1) - dt.timedelta(days=1)
ws.write(r, 1, "SALDO FINAL EM 30/06/2026", B)
ws.write_string(r, 5, f"{saldo:,.2f}".replace(",", "@").replace(".", ",").replace("@", "."), B)
ws.set_column(0, 0, 12); ws.set_column(1, 1, 42); ws.set_column(3, 5, 18)
wb.close()
aberto = sum(t["valor"] - t["abat"] for t in ts if t["status"] in ("ABERTO", "VENCIDO"))
perda = sum(t["valor"] for t in ts if t["status"] == "PERDA")
base = aberto + perda
print("razao contabil    R$ %s" % format(int(saldo), ",d").replace(",", "."))
print("base analitica    R$ %s   (aberto %s + perda %s)"
      % tuple(format(int(x), ",d").replace(",", ".") for x in (base, aberto, perda)))
print("divergencia       R$ %s   <- defeito 5, plantado" % format(int(saldo - base), ",d").replace(",", "."))
