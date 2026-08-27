# -*- coding: utf-8 -*-
"""Gera a base analitica de recebiveis com propriedades estatisticas alvo,
curvas de safra, e os defeitos plantados. Tudo o mais deriva daqui."""
import numpy as np, datetime as dt, unicodedata, json, pathlib, random

SEED = 20260826
rng = np.random.default_rng(SEED); random.seed(SEED)

INI = dt.date(2024, 7, 1)      # primeira emissao
FIM = dt.date(2026, 6, 30)     # ultima emissao
HOJE = dt.date(2026, 6, 30)    # data-base da extracao

# ---------------------------------------------------------------- sacados
RAZOES = ["COMERCIAL", "DISTRIBUIDORA", "MATERIAIS", "CONSTRUTORA", "ELETRICA",
          "INSTALACOES", "ENGENHARIA", "DEPOSITO", "CASA", "CENTRO"]
COMPL = ["DE CONSTRUCAO", "ELETRICA", "HIDRAULICA", "E FERRAGENS", "PREDIAL",
         "INDUSTRIAL", "E SERVICOS", "DO NORTE", "MINEIRA", "CAPIXABA"]
SOBRE = ["SILVA", "SANTOS", "OLIVEIRA", "PEREIRA", "COSTA", "RODRIGUES", "ALMEIDA",
         "NASCIMENTO", "MOREIRA", "BARBOSA", "CAMPOS", "TEIXEIRA", "MARTINS", "AZEVEDO",
         "FONSECA", "MACHADO", "RESENDE", "ANDRADE", "VIEIRA", "CARDOSO"]
SUFIXO = ["LTDA", "LTDA ME", "EIRELI", "S/A", "LTDA EPP"]

def cnpj(i, filial=1):
    base = 10_000_000 + i * 7919 % 89_000_000
    s = f"{base:08d}"
    return f"{s[:2]}.{s[2:5]}.{s[5:8]}/{filial:04d}-{(i*13+filial*7) % 90 + 10:02d}"

N_SAC = 1200
sacados = []
for i in range(N_SAC):
    nome = f"{random.choice(RAZOES)} {random.choice(SOBRE)} {random.choice(COMPL)} {random.choice(SUFIXO)}"
    sacados.append(dict(id=i, nome=nome, cnpj=cnpj(i), grupo=i))

# peso por sacado: construido para bater top1 = 4,2% e top10 = 22%
TOP1, TOP10 = 0.033, 0.172
cab = np.array([TOP1] + list(np.geomspace(TOP1 * 0.80, TOP1 * 0.28, 9)))
cab = cab * (TOP10 / cab.sum())
cab[0] = TOP1
cab[1:] = cab[1:] * ((TOP10 - TOP1) / cab[1:].sum())
cauda = 1.0 / (np.arange(1, N_SAC - 9) ** 0.78)
cauda = cauda * ((1.0 - TOP10) / cauda.sum())
w = np.concatenate([cab, cauda])
ordem = rng.permutation(N_SAC)          # embaralha para o id nao ordenar por tamanho
peso = np.zeros(N_SAC); peso[ordem] = w

# --------------------------------------------------- DEFEITO 1: grupo economico
# o mesmo grupo cadastrado com duas grafias e dois CNPJ de filial
a, b = ordem[1], ordem[6]               # dois sacados grandes viram o mesmo grupo
sacados[a]["nome"] = "MARTINS MATERIAIS PARA CONSTRUCAO LTDA"
sacados[b]["nome"] = "Martins Mat. Const. Ltda ME"
sacados[b]["cnpj"] = sacados[a]["cnpj"][:11] + "0002" + sacados[a]["cnpj"][15:]
sacados[b]["grupo"] = sacados[a]["grupo"]

# --------------------------------------------------- DEFEITO 3: parte relacionada
pr = ordem[14]
sacados[pr]["nome"] = "VPR PARTICIPACOES E EMPREENDIMENTOS LTDA"
sacados[pr]["parte_relacionada"] = True

# ---------------------------------------------------------------- risco
# classe de risco por sacado, correlacionada com tamanho (grandes pagam melhor)
rank = np.argsort(-peso)
classe = np.empty(N_SAC, dtype=object)
for pos, sid in enumerate(rank):
    r = pos / N_SAC
    classe[sid] = "A" if r < 0.18 else ("B" if r < 0.62 else "C")

# ---------------------------------------------------------------- emissao
meses = []
d = INI
while d <= FIM:
    meses.append(d); d = (d.replace(day=28) + dt.timedelta(days=8)).replace(day=1)

SAZ = {1: 0.78, 2: 0.92, 3: 1.16, 4: 1.05, 5: 1.02, 6: 0.98,
       7: 0.95, 8: 1.04, 9: 1.14, 10: 1.08, 11: 1.02, 12: 0.86}
BASE_MES = 4_700_000        # calibrado para ~R$ 125 mi em 24 meses
CRESC = 0.0075              # 0,75% ao mes

PRAZOS = np.array([28, 30, 35, 42, 45, 56, 60, 90])
PESO_PZ = np.array([0.10, 0.24, 0.12, 0.16, 0.14, 0.10, 0.11, 0.03])

titulos = []
tid = 100000
for k, m in enumerate(meses):
    alvo = BASE_MES * SAZ[m.month] * ((1 + CRESC) ** k)
    # DEFEITO 8: mes com faturamento inflado por operacao triangular
    if m == dt.date(2025, 11, 1): alvo *= 1.34
    acum = 0.0
    while acum < alvo:
        v = float(rng.lognormal(mean=7.751, sigma=0.95))
        v = min(max(v, 180.0), 95_000.0)
        sid = int(rng.choice(N_SAC, p=peso))
        dia = int(rng.integers(1, 29))
        emis = m.replace(day=dia)
        pz = int(rng.choice(PRAZOS, p=PESO_PZ))
        titulos.append(dict(id=tid, sac=sid, emis=emis, prazo=pz,
                            venc=emis + dt.timedelta(days=pz), valor=round(v, 2),
                            cls=classe[sid]))
        tid += 1; acum += v

print("titulos gerados:", len(titulos))
print("valor emitido:  R$ %s" % format(int(sum(t["valor"] for t in titulos)), ",d").replace(",", "."))
pathlib.Path("_titulos_raw.json").write_text(json.dumps(
    [{**t, "emis": t["emis"].isoformat(), "venc": t["venc"].isoformat()} for t in titulos]))
pathlib.Path("_sacados.json").write_text(json.dumps(sacados))
