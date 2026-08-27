# -*- coding: utf-8 -*-
import json, datetime as dt, subprocess, pathlib, sys
sys.path.insert(0, "."); import empresa as E
OUT = pathlib.Path("/Users/olpi/Desktop/Offroad Capital/simulacao/empresa/documentos")
R = E.REAL
ts = json.load(open("_base_final.json"))
for t in ts:
    t["_emis"] = dt.date.fromisoformat(t["emis"]); t["_venc"] = dt.date.fromisoformat(t["venc"])
    t["_pag"] = dt.date.fromisoformat(t["pag"]) if t["pag"] else None

def clientes_em(d):
    return sum(t["valor"] - t["abat"] for t in ts
               if t["_emis"] <= d and not (t["_pag"] and t["_pag"] <= d))
CLI = [7_940_000, round(clientes_em(dt.date(2024,12,31)), -3), round(clientes_em(dt.date(2025,12,31)), -3)]
R["clientes_saldo"] = CLI

CSS = """@page{size:A4;margin:15mm 13mm}
body{font-family:"Courier New",monospace;font-size:7.5pt;line-height:1.34;color:#111}
h1{font-family:Helvetica,Arial;font-size:11.5pt;margin:0 0 1mm}
h2{font-family:Helvetica,Arial;font-size:8.4pt;margin:5mm 0 1.5mm;text-transform:uppercase}
.c{text-align:center}.r{text-align:right}
table{width:100%;border-collapse:collapse;font-size:7.3pt}
td{padding:.45mm 1mm}
.lin td{border-bottom:.3pt solid #999;font-weight:bold}
.tot td{border-top:.5pt solid #111;border-bottom:.5pt solid #111;font-weight:bold}
.sm{font-size:6.7pt;color:#555}
.jur{font-family:Helvetica,Arial;font-size:8.5pt;line-height:1.55;text-align:justify}
.jur h1{font-size:11pt}.jur h2{font-size:8.5pt;margin-top:4.5mm}
.jur p{margin:0 0 2.5mm}.jur li{margin-bottom:1.5mm}
"""
pathlib.Path("_pdf.css").write_text(CSS)
def m(v):
    if v == "" or v is None: return ""
    s = f"{abs(v):,.0f}".replace(",", ".")
    return f"({s})" if v < 0 else s
def rows(data):
    return "".join(f'<tr class="{c}"><td>{n}</td>' +
                   "".join(f'<td class="r">{m(v)}</td>' for v in vs) + "</tr>"
                   for n, vs, c in data)
def pdf(html, nome):
    p = pathlib.Path("_tmp.html"); p.write_text(html, encoding="utf-8")
    subprocess.run(["weasyprint", "_tmp.html", str(nome)], check=True,
                   capture_output=True)
    print(pathlib.Path(nome).name)

CAB = '<meta charset="utf-8"><link rel="stylesheet" href="_pdf.css">'
TOPO = ("<h1>VERTENTES DISTRIBUIDORA DE MATERIAIS ELETRICOS E HIDRAULICOS LTDA</h1>"
        "<div class='sm'>CNPJ 08.412.663/0001-47 &middot; Rod. Fernao Dias km 20, Contagem MG</div>")

# ---------------------------------------------------------- Balanco e DRE
dep = [410_000, 455_000, 498_000]; fin = [1_180_000, 1_420_000, 1_690_000]
ircs = [140_000, 205_000, 262_000]
pdd = [380_000, 520_000, 690_000]
imob = [5_900_000, 6_400_000, 6_950_000]; intg = [180_000, 210_000, 240_000]
imp_rec = [610_000, 700_000, 810_000]; caixa = [1_040_000, 1_180_000, R["caixa"]]
forn = [6_800_000, 7_900_000, 9_100_000]; trib = [980_000, 1_120_000, 1_290_000]
sal = [720_000, 810_000, 920_000]
div_cp = [7_400_000, 8_900_000, 10_600_000]; div_lp = [4_200_000, 4_800_000, 5_600_000]
at = [caixa[i] + CLI[i] - pdd[i] + R["estoque"][i] + imp_rec[i] + imob[i] + intg[i] for i in range(3)]
pas = [forn[i] + trib[i] + sal[i] + div_cp[i] + div_lp[i] for i in range(3)]
pl = [at[i] - pas[i] for i in range(3)]

html = CAB + TOPO + """
<h2>Demonstracoes contabeis dos exercicios findos em 31 de dezembro</h2>
<div class="sm">Valores em reais. Demonstracoes revisadas por auditoria independente.</div>
<h2>Demonstracao do resultado</h2>
<table><tr class="lin"><td></td><td class="r">2023</td><td class="r">2024</td><td class="r">2025</td></tr>
""" + rows([
 ("RECEITA OPERACIONAL BRUTA", R["receita_bruta"], ""),
 ("  Deducoes, impostos e devolucoes", [-(a-b) for a,b in zip(R["receita_bruta"], R["receita_liquida"])], ""),
 ("RECEITA OPERACIONAL LIQUIDA", R["receita_liquida"], "lin"),
 ("  Custo das mercadorias vendidas", [-x for x in R["cmv"]], ""),
 ("LUCRO BRUTO", [a-b for a,b in zip(R["receita_liquida"], R["cmv"])], "lin"),
 ("  Despesas com vendas", [-round(x*0.62) for x in R["despesas"]], ""),
 ("  Despesas gerais e administrativas", [-round(x*0.38) for x in R["despesas"]], ""),
 ("RESULTADO ANTES DE DEP., FIN. E IMPOSTOS", R["ebitda"], "lin"),
 ("  Depreciacao e amortizacao", [-x for x in dep], ""),
 ("  Resultado financeiro liquido", [-x for x in fin], ""),
 ("RESULTADO ANTES DO IR/CSLL", [R["ebitda"][i]-dep[i]-fin[i] for i in range(3)], "lin"),
 ("  IR e CSLL", [-x for x in ircs], ""),
 ("LUCRO LIQUIDO DO EXERCICIO", R["lucro_liquido"], "tot")]) + """
</table>
<h2>Balanco patrimonial</h2>
<table><tr class="lin"><td>ATIVO</td><td class="r">2023</td><td class="r">2024</td><td class="r">2025</td></tr>
""" + rows([
 ("CIRCULANTE", ["","",""], ""),
 ("  Caixa e equivalentes de caixa", caixa, ""),
 ("  Clientes", CLI, ""),
 ("  (-) Provisao para creditos de liquidacao duvidosa", [-x for x in pdd], ""),
 ("  Estoques", R["estoque"], ""),
 ("  Impostos a recuperar", imp_rec, ""),
 ("NAO CIRCULANTE", ["","",""], ""),
 ("  Imobilizado liquido", imob, ""),
 ("  Intangivel", intg, ""),
 ("TOTAL DO ATIVO", at, "tot")]) + """
</table><br>
<table><tr class="lin"><td>PASSIVO E PATRIMONIO LIQUIDO</td><td class="r">2023</td><td class="r">2024</td><td class="r">2025</td></tr>
""" + rows([
 ("CIRCULANTE", ["","",""], ""),
 ("  Fornecedores", forn, ""),
 ("  Emprestimos e financiamentos", div_cp, ""),
 ("  Obrigacoes tributarias", trib, ""),
 ("  Obrigacoes trabalhistas", sal, ""),
 ("NAO CIRCULANTE", ["","",""], ""),
 ("  Emprestimos e financiamentos", div_lp, ""),
 ("PATRIMONIO LIQUIDO", pl, ""),
 ("TOTAL DO PASSIVO E PL", [pas[i]+pl[i] for i in range(3)], "tot")]) + """
</table>
<h2>Notas explicativas selecionadas</h2>
<div class="sm">
<p><b>Nota 8 - Clientes.</b> O saldo e composto por duplicatas mercantis decorrentes de vendas a
prazo. A Companhia mantem operacoes de desconto de duplicatas junto a instituicoes financeiras.</p>
<p><b>Nota 12 - Emprestimos e financiamentos.</b> Refere-se a capital de giro, conta garantida e
financiamento de equipamentos. As operacoes possuem aval dos socios.</p>
<p><b>Nota 15 - Fornecedores.</b> Inclui valores de convenio de antecipacao a fornecedores mantido
junto a instituicao financeira.</p>
<p><b>Nota 19 - Obrigacoes tributarias.</b> Inclui parcelamento de tributos federais em 48 parcelas,
com saldo remanescente na data de encerramento.</p>
</div>
"""
pdf(html, OUT / "contabil" / "Balanco e DRE 2023-2024-2025.pdf")
print("  ativo = passivo + PL ?", all(abs(at[i]-(pas[i]+pl[i])) < 1 for i in range(3)))
print("  PL 2025 R$ %s" % m(pl[2]))
