# -*- coding: utf-8 -*-
"""Balancete analitico em PDF, do jeito que sai do sistema contabil."""
import json, datetime as dt, subprocess, pathlib, sys
sys.path.insert(0, "."); import empresa as E
OUT = pathlib.Path("/Users/olpi/Desktop/Offroad Capital/simulacao/empresa/documentos/contabil")
R = E.REAL
ts = json.load(open("_base_final.json"))
for t in ts:
    t["_emis"] = dt.date.fromisoformat(t["emis"])
    t["_pag"] = dt.date.fromisoformat(t["pag"]) if t["pag"] else None

# saldo de clientes conforme o razao (com o ajuste plantado)
def razao_ate(d):
    s = 0.0
    for t in ts:
        if t["_emis"] <= d: s += t["valor"]
        if t["_pag"] and t["_pag"] <= d: s -= (t["vpago"] + t["abat"])
    if d >= dt.date(2025, 9, 30): s += 1_900_000.0
    return s

def m(v):
    return f"{abs(v):,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")

CONTAS = [
 ("1", "ATIVO", None), ("1.1", "ATIVO CIRCULANTE", None),
 ("1.1.01.001", "Caixa geral", "D", 42_800),
 ("1.1.01.002", "Bancos conta movimento", "D", 1_277_200),
 ("1.1.02.001", "Clientes nacionais", "D", None),
 ("1.1.02.009", "(-) Provisao para creditos de liquidacao duvidosa", "C", 742_000),
 ("1.1.03.001", "Estoque de mercadorias para revenda", "D", 13_180_000),
 ("1.1.04.001", "ICMS a recuperar", "D", 512_000),
 ("1.1.04.002", "PIS e COFINS a recuperar", "D", 361_000),
 ("1.1.05.001", "Adiantamento a fornecedores", "D", 218_000),
 ("1.2", "ATIVO NAO CIRCULANTE", None),
 ("1.2.03.001", "Imoveis", "D", 4_900_000),
 ("1.2.03.002", "Maquinas e equipamentos", "D", 2_180_000),
 ("1.2.03.003", "Veiculos", "D", 1_940_000),
 ("1.2.03.009", "(-) Depreciacao acumulada", "C", 2_012_000),
 ("1.2.04.001", "Software e licencas", "D", 248_000),
 ("2", "PASSIVO", None), ("2.1", "PASSIVO CIRCULANTE", None),
 ("2.1.01.001", "Fornecedores nacionais", "C", 6_640_000),
 ("2.1.01.007", "Fornecedores - convenio antecipacao", "C", 2_960_000),
 ("2.1.02.001", "Emprestimos e financiamentos - curto prazo", "C", 7_820_000),
 ("2.1.02.004", "Duplicatas descontadas", "C", 4_180_000),
 ("2.1.02.006", "Operacoes de fomento mercantil", "C", 1_740_000),
 ("2.1.03.001", "Salarios e encargos a pagar", "C", 948_000),
 ("2.1.04.001", "ICMS a recolher", "C", 706_000),
 ("2.1.04.008", "Parcelamento de tributos federais", "C", 880_000),
 ("2.2", "PASSIVO NAO CIRCULANTE", None),
 ("2.2.02.001", "Emprestimos e financiamentos - longo prazo", "C", 4_680_000),
 ("2.3", "PATRIMONIO LIQUIDO", None),
 ("2.3.01.001", "Capital social", "C", 4_800_000),
 ("2.3.05.001", "Lucros acumulados", "C", None),
 ("3", "RECEITAS", None),
 ("3.1.01.001", "Receita bruta de vendas", "C", 33_420_000),
 ("3.1.02.001", "(-) Devolucoes de vendas", "D", 486_000),
 ("3.1.03.001", "(-) ICMS sobre vendas", "D", 4_910_000),
 ("3.1.03.002", "(-) PIS e COFINS sobre vendas", "D", 1_238_000),
 ("4", "CUSTOS E DESPESAS", None),
 ("4.1.01.001", "Custo das mercadorias vendidas", "D", 21_480_000),
 ("4.2.01.001", "Salarios e ordenados", "D", 2_940_000),
 ("4.2.02.001", "Aluguel e condominio", "D", 612_000),
 ("4.2.03.001", "Fretes sobre vendas", "D", 1_186_000),
 ("4.2.06.001", "Comissoes sobre vendas", "D", 892_000),
 ("4.2.09.001", "Despesas comerciais diversas", "D", 1_642_000),
 ("4.3.01.001", "Juros e encargos sobre emprestimos", "D", 1_048_000),
 ("4.3.01.004", "Despesas com desconto de duplicatas", "D", 604_000),
 ("4.3.01.006", "Despesas com fomento mercantil", "D", 498_000),
]
cli = razao_ate(dt.date(2026, 6, 30))
lucros = 1_095_000

linhas = []
for c in CONTAS:
    if c[2] is None:
        linhas.append(f'<tr class="gr"><td>{c[0]}</td><td colspan="4">{c[1]}</td></tr>')
        continue
    cod, nome, nat, val = c
    if cod == "1.1.02.001": val = cli
    if cod == "2.3.05.001": val = lucros
    ant = val * 0.93
    deb = val * 0.42 if nat == "D" else val * 0.08
    cre = val * 0.35 if nat == "D" else val * 0.15
    linhas.append(
        f'<tr><td>{cod}</td><td>{nome}</td><td class="r">{m(ant)}</td>'
        f'<td class="r">{m(deb)}</td><td class="r">{m(cre)}</td>'
        f'<td class="r">{m(val)} {nat}</td></tr>')

CSS = """@page{size:A4 landscape;margin:12mm 10mm}
body{font-family:"Courier New",monospace;font-size:7.2pt;color:#111}
h1{font-family:Helvetica;font-size:10pt;margin:0}
.sm{font-size:6.6pt;color:#555;margin-bottom:3mm}
table{width:100%;border-collapse:collapse}
td{padding:.4mm 1.5mm}
.r{text-align:right}
tr.gr td{background:#e8e8e8;font-weight:bold;padding-top:1.2mm}
thead td{border-bottom:.6pt solid #111;font-weight:bold}
"""
pathlib.Path("_bal.css").write_text(CSS)
html = f"""<meta charset="utf-8"><link rel="stylesheet" href="_bal.css">
<h1>BALANCETE ANALITICO DE VERIFICACAO</h1>
<div class="sm">VERTENTES DISTRIBUIDORA DE MATERIAIS ELETRICOS E HIDRAULICOS LTDA &middot;
CNPJ 08.412.663/0001-47<br>
Periodo: 01/01/2026 a 30/06/2026 &middot; Emitido em 08/07/2026 &middot;
Sistema Contabil Dominio v11.4 &middot; Escritorio Prado &amp; Associados</div>
<table><thead><tr><td>Conta</td><td>Descricao</td><td class="r">Saldo anterior</td>
<td class="r">Debito</td><td class="r">Credito</td><td class="r">Saldo atual</td></tr></thead>
{''.join(linhas)}
</table>
<div class="sm" style="margin-top:4mm">Balancete emitido para fins gerenciais. Contas de resultado
acumuladas no exercicio. Documento sem valor fiscal.</div>"""
pathlib.Path("_tmp.html").write_text(html, encoding="utf-8")
subprocess.run(["weasyprint", "_tmp.html", str(OUT / "BALANCETE JUN26.pdf")], check=True, capture_output=True)
print("BALANCETE JUN26.pdf")
print("  clientes no balancete  R$ %s" % m(cli))
print("  duplicatas descontadas R$ %s  <- aparece aqui, mas nao na posicao bancaria" % m(4_180_000))
print("  fomento mercantil      R$ %s  <- idem" % m(1_740_000))
print("  convenio antecipacao   R$ %s  <- risco sacado, dentro de Fornecedores" % m(2_960_000))
