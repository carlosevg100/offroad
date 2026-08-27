# -*- coding: utf-8 -*-
"""Definicao da empresa ficticia. Tudo o mais deriva daqui."""

CO = dict(
    razao="Vertentes Distribuidora de Materiais Elétricos e Hidráulicos Ltda.",
    fantasia="Vertentes Distribuidora",
    cnpj="08.412.663/0001-47",
    ie="062.418.997.00-31",
    abertura="14/03/2006",
    cnae_principal="46.73-7-00 · Comércio atacadista de material elétrico",
    cnae_sec=["46.79-6-01 · Comércio atacadista de tintas, vernizes e similares",
              "46.72-9-00 · Comércio atacadista de ferragens e ferramentas",
              "47.44-0-99 · Comércio varejista de materiais de construção em geral"],
    capital=4_800_000,
    matriz="Rod. Fernão Dias, km 20, Distrito Industrial, Contagem, MG, CEP 32371-620",
    filial="Av. Barão do Rio Branco, 3.180, Alto dos Passos, Juiz de Fora, MG",
    site="www.vertentesdistribuidora.com.br",
    tel="(31) 3399-4100",
    funcionarios=138,
    fundacao=2006,
)

SOCIOS = [("Nelson Prado Ribeiro", "Sócio administrador, fundador", 62.0, "desde 2006"),
          ("Marcelo Prado Ribeiro", "Diretor comercial", 19.0, "desde 2014"),
          ("Cristina Prado Ribeiro", "Diretora administrativa e financeira", 19.0, "desde 2016")]

MARCAS = ["Condutex", "Elétron Componentes", "Hidroplast", "Lumitec", "Vega Metais",
          "Tubotec", "Sigma Quadros", "Aquaflex"]

LINHAS = [("Fios e cabos", 27.5), ("Tubos e conexões", 19.0), ("Disjuntores e quadros", 14.5),
          ("Iluminação e LED", 12.0), ("Metais e louças sanitárias", 11.0),
          ("Eletrodutos e canaletas", 8.5), ("Ferramentas e acessórios", 7.5)]

UNIDADES = [("Contagem, MG", "Matriz e centro de distribuição", "8.400 m²", 2006),
            ("Juiz de Fora, MG", "Filial e estoque avançado", "2.100 m²", 2014),
            ("Vitória, ES", "Centro de distribuição planejado", "4.500 m²", None)]

# --- numeros declarados pela companhia (nem todos batem com a contabilidade) ---
DECLARADO = dict(receita_bruta_2025=62_000_000, receita_liquida_2025=54_000_000,
                 clientes_ativos=1_200, prazo_medio="30 a 60 dias",
                 divida_bancaria=12_000_000, pedido=15_000_000)

# --- numeros contabeis reais, que o sistema tem que apurar ---
REAL = dict(
    receita_bruta=[48_900_000, 55_200_000, 61_740_000],       # 2023, 2024, 2025
    receita_liquida=[40_900_000, 46_100_000, 51_580_000],
    cmv=[31_900_000, 35_700_000, 39_720_000],
    despesas=[6_450_000, 7_180_000, 8_020_000],
    ebitda=[2_550_000, 3_220_000, 3_840_000],
    ebitda_ajustado=[2_710_000, 3_410_000, 4_160_000],
    lucro_liquido=[820_000, 1_140_000, 1_390_000],
    clientes_saldo=[7_940_000, 9_120_000, 10_460_000],
    estoque=[9_200_000, 10_800_000, 12_400_000],
    # divida bancaria declarada, aberta por contrato
    capital_giro=8_400_000,
    conta_garantida=2_100_000,
    finame=2_000_000,
    # o que a companhia nao declara como divida, e e
    cessoes_com_regresso=4_180_000,   # desconto de duplicatas com regresso
    risco_sacado=2_960_000,           # convenio com fornecedores
    factoring=1_740_000,              # fomento mercantil, taxa mensal alta
    parcelamento_fiscal=880_000,      # PERT
    caixa=1_320_000,
    # giro
    dso_dias=61,                      # implicito no saldo de clientes
    prazo_contratado_dias=42,         # media ponderada da emissao dos titulos
)
REAL["divida_bancaria"] = REAL["capital_giro"] + REAL["conta_garantida"] + REAL["finame"]
REAL["nao_declarado"] = (REAL["cessoes_com_regresso"] + REAL["risco_sacado"]
                         + REAL["factoring"] + REAL["parcelamento_fiscal"])
REAL["divida_ajustada"] = REAL["divida_bancaria"] + REAL["nao_declarado"]
REAL["divida_liquida"] = REAL["divida_ajustada"] - REAL["caixa"]

# --- parametros da carteira de recebiveis ---
CART = dict(titulos_ano=17_000, ticket_medio=3_650, sacados=1_200,
            prazo_medio_dias=42, maior_sacado_pct=4.2, top10_pct=22.0,
            perda_liquida_pct=1.8, diluicao_pct=2.4, atraso30_pct=6.5)
