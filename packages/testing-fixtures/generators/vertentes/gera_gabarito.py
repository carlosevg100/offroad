# -*- coding: utf-8 -*-
"""O gabarito: as respostas que o sistema tem que produzir."""
import json, datetime as dt, collections, pathlib, sys
sys.path.insert(0, "."); import empresa as E
HOJE = dt.date(2026, 6, 30)
ts = json.load(open("_base_final.json")); sac = json.load(open("_sacados.json"))
for t in ts:
    t["_emis"] = dt.date.fromisoformat(t["emis"]); t["_venc"] = dt.date.fromisoformat(t["venc"])
    t["_pag"] = dt.date.fromisoformat(t["pag"]) if t["pag"] else None
R = E.REAL

def brl(v): return "R$ " + f"{v:,.0f}".replace(",", ".")
def pc(v): return f"{v:.2f}%".replace(".", ",")

emit = sum(t["valor"] for t in ts)
r12 = sum(t["valor"] for t in ts if t["_emis"] > HOJE - dt.timedelta(days=365))
ab = [t for t in ts if t["status"] in ("ABERTO", "VENCIDO")]
cart = sum(t["valor"] - t["abat"] for t in ab)
perda = sum(t["valor"] for t in ts if t["status"] == "PERDA")
dilui = sum(t["abat"] for t in ts)
ov30 = sum(t["valor"] - t["abat"] for t in ab if (HOJE - t["_venc"]).days > 30)

vs = collections.Counter(); vg = collections.Counter()
for t in ts:
    if t["_emis"] > HOJE - dt.timedelta(days=365):
        vs[t["sac"]] += t["valor"]; vg[sac[t["sac"]]["grupo"]] += t["valor"]
top_s = sorted(vs.values(), reverse=True); top_g = sorted(vg.values(), reverse=True)

# elegibilidade tipica de FIDC
LIM_SAC = 0.03
inel = collections.OrderedDict()
pr = {s["id"] for s in sac if s.get("parte_relacionada")}
cart_sac = collections.Counter()
for t in ab: cart_sac[sac[t["sac"]]["grupo"]] += t["valor"] - t["abat"]
inel["Vencidos ha mais de 30 dias"] = ov30
inel["Parte relacionada entre os sacados"] = sum(t["valor"] - t["abat"] for t in ab if t["sac"] in pr)
inel["NF cancelada com titulo em aberto"] = sum(t["valor"] - t["abat"] for t in ab if t.get("_nf_cancelada"))
excedente = sum(max(0, v - cart * LIM_SAC) for v in cart_sac.values())
inel["Excedente de concentracao acima de 3% por grupo"] = excedente
tot_inel = sum(inel.values())

lin = []
A = lin.append
A("# Gabarito do caso E2E")
A("")
A("Respostas que o sistema tem que produzir sozinho. Data-base 30/06/2026.")
A("")
A("## 1. A carteira")
A("")
A("| Metrica | Valor |")
A("|---|---|")
A(f"| Valor emitido em 24 meses | {brl(emit)} |")
A(f"| Receita bruta dos ultimos 12 meses | {brl(r12)} |")
A(f"| Titulos emitidos | {len(ts):,}".replace(",", ".") + " |")
A(f"| Ticket medio | {brl(emit/len(ts))} |")
A(f"| Prazo medio ponderado na emissao | {sum(t['prazo']*t['valor'] for t in ts)/emit:.1f} dias |")
A(f"| Carteira em aberto | {brl(cart)} |")
A(f"| DSO implicito | {cart/r12*365:.0f} dias |")
A(f"| **Descasamento prazo contratado x DSO** | **{cart/r12*365 - sum(t['prazo']*t['valor'] for t in ts)/emit:.0f} dias, {brl(r12*(cart/r12*365 - sum(t['prazo']*t['valor'] for t in ts)/emit)/365)} de capital preso** |")
A("")
A("## 2. Perda, diluicao e atraso")
A("")
A("| Metrica | Valor | % do emitido |")
A("|---|---|---|")
A(f"| Perda acima de 180 dias | {brl(perda)} | {pc(perda/emit*100)} |")
A(f"| Diluicao (devolucao, bonificacao, abatimento) | {brl(dilui)} | {pc(dilui/emit*100)} |")
A(f"| Vencido acima de 30 dias | {brl(ov30)} | {pc(ov30/cart*100)} da carteira |")
A("")
A("## 3. Concentracao, antes e depois de consolidar grupo economico")
A("")
A("| Corte | Por sacado | Por grupo economico |")
A("|---|---|---|")
A(f"| Maior | {pc(top_s[0]/r12*100)} | {pc(top_g[0]/r12*100)} |")
A(f"| Top 5 | {pc(sum(top_s[:5])/r12*100)} | {pc(sum(top_g[:5])/r12*100)} |")
A(f"| Top 10 | {pc(sum(top_s[:10])/r12*100)} | {pc(sum(top_g[:10])/r12*100)} |")
A(f"| Top 50 | {pc(sum(top_s[:50])/r12*100)} | {pc(sum(top_g[:50])/r12*100)} |")
A("")
A("## 4. Elegibilidade, sob criterios tipicos de FIDC")
A("")
A("| Motivo de exclusao | Valor |")
A("|---|---|")
for k, v in inel.items(): A(f"| {k} | {brl(v)} |")
A(f"| **Total inelegivel** | **{brl(tot_inel)}** |")
A(f"| **Carteira elegivel** | **{brl(cart - tot_inel)}, {pc((cart-tot_inel)/cart*100)} da carteira** |")
A("")
A("## 5. A divida real")
A("")
A("| Item | Valor | Declarado pela companhia |")
A("|---|---|---|")
A(f"| Capital de giro bancario | {brl(R['capital_giro'])} | sim |")
A(f"| Conta garantida | {brl(R['conta_garantida'])} | sim |")
A(f"| FINAME | {brl(R['finame'])} | sim |")
A(f"| Cessoes com regresso (desconto de duplicatas) | {brl(R['cessoes_com_regresso'])} | **nao** |")
A(f"| Risco sacado | {brl(R['risco_sacado'])} | **nao** |")
A(f"| Fomento mercantil (factoring) | {brl(R['factoring'])} | **nao** |")
A(f"| Parcelamento tributario | {brl(R['parcelamento_fiscal'])} | **nao** |")
A(f"| **Divida ajustada** | **{brl(R['divida_ajustada'])}** | |")
A(f"| (-) Caixa | ({brl(R['caixa'])}) | |")
A(f"| **Divida liquida ajustada** | **{brl(R['divida_liquida'])}** | |")
A("")
A(f"O dono declarou {brl(E.DECLARADO['divida_bancaria'])} no intake. A diferenca e "
  f"**{brl(R['divida_ajustada'] - E.DECLARADO['divida_bancaria'])}**.")
A("")
A(f"Alavancagem sobre EBITDA ajustado de {brl(R['ebitda_ajustado'][2])}: "
  f"**{R['divida_liquida']/R['ebitda_ajustado'][2]:.2f}x**.")
A("")
A("## 6. O custo do factoring, que a companhia nao percebe")
A("")
A("Fator de 3,45% ao mes mais ad valorem de 0,60% sobre a face. Para um titulo de 42 dias:")
A("")
A("- Fator: 3,45% x 42/30 = **4,83%** sobre a face")
A("- Ad valorem: **0,60%**")
A("- Custo total no periodo: **5,43%** em 42 dias")
A("- **Taxa efetiva anual: aproximadamente 57,4% ao ano**")
A("")
A(f"Sobre o saldo de {brl(R['factoring'])}, o custo anualizado e de cerca de "
  f"{brl(R['factoring']*0.574)} por ano. Substituir essa linha e o argumento economico mais forte "
  "da operacao.")
A("")
A("## 7. Os oito defeitos plantados")
A("")
A("| # | Defeito | Onde esta | Efeito |")
A("|---|---|---|---|")
mg = [s for s in sac if s["grupo"] != s["id"]]
A(f"| 1 | Grupo economico com duas grafias e dois CNPJ de filial | Cadastro de Sacados: MARTINS "
  f"MATERIAIS PARA CONSTRUCAO LTDA e Martins Mat. Const. Ltda ME | Concentracao do top 5 sobe de "
  f"{pc(sum(top_s[:5])/r12*100)} para {pc(sum(top_g[:5])/r12*100)}, e o excedente de concentracao "
  "inelegivel cresce |")
A(f"| 2 | 340 titulos renegociados sem marcacao | Base de titulos: vencimento reescrito, sem campo "
  "de renegociacao | Perda aparente menor que a real |")
A(f"| 3 | Parte relacionada entre os sacados | VPR PARTICIPACOES E EMPREENDIMENTOS LTDA | "
  f"{brl(inel['Parte relacionada entre os sacados'])} inelegivel |")
A(f"| 4 | Cessoes, risco sacado, factoring e PERT fora da posicao de divida | posicao bancaria.xlsx "
  f"vs os tres contratos | Divida sobe {brl(R['nao_declarado'])} |")
A(f"| 5 | Razao contabil nao bate com a base analitica | Lancamento AJ-0917 de 30/09/2025 | "
  "Divergencia de R$ 1.900.000 |")
A(f"| 6 | 120 titulos com NF cancelada em aberto | Base de titulos vs amostra de XML | "
  f"{brl(inel['NF cancelada com titulo em aberto'])} sem lastro |")
A(f"| 7 | Diluicao lancada em conta de despesa | Devolucoes e abatimentos.xlsx, conta 4.2.09.001 | "
  f"Receita liquida real menor em {brl(dilui)} no periodo |")
A(f"| 8 | Mes com faturamento inflado | Novembro de 2025, 34% acima da tendencia | "
  "Qualidade da receita |")
A("")
A("## 8. O que o sistema deve recomendar")
A("")
A(f"Carteira elegivel de {brl(cart - tot_inel)} e volume cedivel anual da ordem de "
  f"{brl(r12 * 0.55)}. Custo fixo anual de um FIDC dedicado entre R$ 400 mil e R$ 700 mil, o que "
  f"representa de {pc(400000/(r12*0.55)*100)} a {pc(700000/(r12*0.55)*100)} sobre o volume cedido.")
A("")
A("A recomendacao correta **nao e FIDC dedicado**. O porte nao dilui o custo fixo. As alternativas "
  "que fazem sentido, em ordem: cota em FIDC multicedente para a parcela rotativa, e CCB com "
  "cessao fiduciaria para o capex do centro de distribuicao, que tem prazo e nao deve ser "
  "financiado com linha rotativa.")
A("")
A("O sistema tambem deve apontar que o pedido de R$ 15 milhoes mistura duas naturezas: "
  "R$ 4,5 milhoes de capex, que pede prazo, e R$ 10,5 milhoes de giro e estoque, que pede linha "
  "rotativa. Financiar as duas com o mesmo instrumento e o erro mais comum nesse porte.")

pathlib.Path("/Users/olpi/Desktop/Offroad Capital/simulacao/GABARITO.md").write_text("\n".join(lin), encoding="utf-8")
print("\n".join(lin[:1]))
print("gabarito escrito:", len(lin), "linhas")
