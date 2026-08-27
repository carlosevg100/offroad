# -*- coding: utf-8 -*-
"""Amostra de 200 NFe em XML. Inclui as canceladas do defeito 6."""
import json, datetime as dt, random, pathlib, zipfile, io, html, sys
sys.path.insert(0, "."); import empresa as E
random.seed(20260826)
OUT = pathlib.Path("/Users/olpi/Desktop/Offroad Capital/simulacao/empresa/documentos/recebiveis")
ts = json.load(open("_base_final.json")); sac = json.load(open("_sacados.json"))
for t in ts: t["_emis"] = dt.date.fromisoformat(t["emis"])

canc = [t for t in ts if t.get("_nf_cancelada")]
outros = [t for t in ts if not t.get("_nf_cancelada")]
random.shuffle(canc); random.shuffle(outros)
amostra = canc[:70] + outros[:130]
random.shuffle(amostra)

PROD = [("FIO FLEXIVEL 2,5MM 750V ROLO 100M", "8544.49.00", "RL", 189.90),
        ("CABO FLEXIVEL 4,0MM 750V ROLO 100M", "8544.49.00", "RL", 312.40),
        ("DISJUNTOR MONOPOLAR 20A CURVA C", "8536.20.00", "PC", 18.70),
        ("QUADRO DE DISTRIBUICAO 12 DISJUNTORES", "8537.10.90", "PC", 142.00),
        ("TUBO PVC SOLDAVEL 25MM BARRA 6M", "3917.23.00", "BR", 24.80),
        ("JOELHO PVC SOLDAVEL 25MM 90 GRAUS", "3917.40.90", "PC", 1.95),
        ("REGISTRO DE GAVETA 3/4 BRUTO", "8481.80.93", "PC", 46.30),
        ("LAMPADA LED BULBO 12W 6500K", "8539.50.00", "PC", 9.40),
        ("ELETRODUTO CORRUGADO 25MM ROLO 50M", "3917.32.90", "RL", 68.50),
        ("CAIXA DAGUA POLIETILENO 500L", "3925.10.00", "PC", 298.00),
        ("FITA ISOLANTE 19MM X 20M", "3919.10.00", "PC", 6.20),
        ("TOMADA 2P+T 10A COM PLACA", "8536.69.90", "PC", 12.80)]

def esc(s): return html.escape(s, quote=True)

def nfe_xml(t):
    s = sac[t["sac"]]
    ch = t["chave"]
    dh = dt.datetime.combine(t["_emis"], dt.time(random.randint(8, 17), random.randint(0, 59)))
    dhs = dh.strftime("%Y-%m-%dT%H:%M:%S-03:00")
    itens = []
    resta = t["valor"]; n = 0
    while resta > 5 and n < 8:
        p = random.choice(PROD)
        qtd = max(1, round(resta / p[3] * random.uniform(0.15, 0.5)))
        v = round(min(qtd * p[3], resta), 2)
        if v < 1: break
        n += 1
        itens.append(f"""    <det nItem="{n}">
      <prod><cProd>{1000+random.randint(0,8999)}</cProd><cEAN>SEM GTIN</cEAN>
        <xProd>{esc(p[0])}</xProd><NCM>{p[1].replace('.','')}</NCM><CFOP>5102</CFOP>
        <uCom>{p[2]}</uCom><qCom>{qtd:.4f}</qCom><vUnCom>{p[3]:.4f}</vUnCom>
        <vProd>{v:.2f}</vProd><indTot>1</indTot></prod>
      <imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC>
        <vBC>{v:.2f}</vBC><pICMS>18.00</pICMS><vICMS>{v*0.18:.2f}</vICMS></ICMS00></ICMS></imposto>
    </det>""")
        resta -= v
    tot = t["valor"]
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
 <NFe><infNFe versao="4.00" Id="NFe{ch}">
  <ide><cUF>31</cUF><natOp>VENDA DE MERCADORIA</natOp><mod>55</mod><serie>1</serie>
    <nNF>{t['nf']}</nNF><dhEmi>{dhs}</dhEmi><tpNF>1</tpNF><idDest>1</idDest>
    <cMunFG>3118601</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis><tpAmb>1</tpAmb>
    <finNFe>1</finNFe><indFinal>0</indFinal><indPres>9</indPres></ide>
  <emit><CNPJ>08412663000147</CNPJ>
    <xNome>{esc(E.CO['razao'])}</xNome><xFant>{esc(E.CO['fantasia'])}</xFant>
    <enderEmit><xLgr>ROD FERNAO DIAS</xLgr><nro>KM 20</nro><xBairro>DISTRITO INDUSTRIAL</xBairro>
      <cMun>3118601</cMun><xMun>CONTAGEM</xMun><UF>MG</UF><CEP>32371620</CEP></enderEmit>
    <IE>062418997003</IE><CRT>3</CRT></emit>
  <dest><CNPJ>{s['cnpj'].replace('.','').replace('/','').replace('-','')}</CNPJ>
    <xNome>{esc(s['nome'])}</xNome>
    <enderDest><xLgr>RUA COMERCIAL</xLgr><nro>{random.randint(10,2000)}</nro>
      <xBairro>CENTRO</xBairro><cMun>3106200</cMun><xMun>BELO HORIZONTE</xMun>
      <UF>MG</UF><CEP>30140071</CEP></enderDest>
    <indIEDest>1</indIEDest></dest>
{chr(10).join(itens)}
  <total><ICMSTot><vBC>{tot:.2f}</vBC><vICMS>{tot*0.18:.2f}</vICMS><vProd>{tot:.2f}</vProd>
    <vNF>{tot:.2f}</vNF></ICMSTot></total>
  <cobr><fat><nFat>{t['nf']}</nFat><vOrig>{tot:.2f}</vOrig><vLiq>{tot:.2f}</vLiq></fat>
    <dup><nDup>001</nDup><dVenc>{t['venc']}</dVenc><vDup>{tot:.2f}</vDup></dup></cobr>
 </infNFe></NFe>
 <protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>{ch}</chNFe>
   <dhRecbto>{dhs}</dhRecbto><nProt>131{random.randint(100000000000,999999999999)}</nProt>
   <cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>"""

def canc_xml(t):
    ch = t["chave"]
    d = t["_emis"] + dt.timedelta(days=random.randint(2, 20))
    dhs = dt.datetime.combine(d, dt.time(11, 3)).strftime("%Y-%m-%dT%H:%M:%S-03:00")
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<procEventoNFe versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">
 <evento versao="1.00"><infEvento>
   <cOrgao>31</cOrgao><tpAmb>1</tpAmb><CNPJ>08412663000147</CNPJ><chNFe>{ch}</chNFe>
   <dhEvento>{dhs}</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento>
   <detEvento versao="1.00"><descEvento>Cancelamento</descEvento>
     <nProt>131{random.randint(100000000000,999999999999)}</nProt>
     <xJust>ERRO DE DIGITACAO NOS DADOS DO DESTINATARIO</xJust></detEvento>
 </infEvento></evento>
 <retEvento versao="1.00"><infEvento><tpAmb>1</tpAmb><cStat>135</cStat>
   <xMotivo>Evento registrado e vinculado a NF-e</xMotivo><chNFe>{ch}</chNFe>
   <tpEvento>110111</tpEvento><dhRegEvento>{dhs}</dhRegEvento></infEvento></retEvento>
</procEventoNFe>"""

zpath = OUT / "NFs amostra.zip"
n_canc = 0
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
    for t in amostra:
        z.writestr(f"{t['chave']}-nfe.xml", nfe_xml(t))
        if t.get("_nf_cancelada"):
            z.writestr(f"{t['chave']}-110111-01-procEventoNFe.xml", canc_xml(t)); n_canc += 1
print("NFs amostra.zip  %d notas  |  %d com evento de cancelamento  |  %.1f MB"
      % (len(amostra), n_canc, zpath.stat().st_size / 1e6))
