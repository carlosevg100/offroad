# Gabarito do caso E2E

Respostas que o sistema tem que produzir sozinho. Data-base 30/06/2026.

## 1. A carteira

| Metrica | Valor |
|---|---|
| Valor emitido em 24 meses | R$ 125.019.151 |
| Receita bruta dos ultimos 12 meses | R$ 66.171.556 |
| Titulos emitidos | 34.397 |
| Ticket medio | R$ 3.635 |
| Prazo medio ponderado na emissao | 42.0 dias |
| Carteira em aberto | R$ 11.897.080 |
| DSO implicito | 66 dias |
| **Descasamento prazo contratado x DSO** | **24 dias, R$ 4.276.190 de capital preso** |

## 2. Perda, diluicao e atraso

| Metrica | Valor | % do emitido |
|---|---|---|
| Perda acima de 180 dias | R$ 2.021.129 | 1,62% |
| Diluicao (devolucao, bonificacao, abatimento) | R$ 3.059.553 | 2,45% |
| Vencido acima de 30 dias | R$ 2.434.733 | 20,46% da carteira |

## 3. Concentracao, antes e depois de consolidar grupo economico

| Corte | Por sacado | Por grupo economico |
|---|---|---|
| Maior | 5,07% | 5,07% |
| Top 5 | 15,80% | 17,13% |
| Top 10 | 24,35% | 25,68% |
| Top 50 | 47,18% | 47,45% |

## 4. Elegibilidade, sob criterios tipicos de FIDC

| Motivo de exclusao | Valor |
|---|---|
| Vencidos ha mais de 30 dias | R$ 2.434.733 |
| Parte relacionada entre os sacados | R$ 104.362 |
| NF cancelada com titulo em aberto | R$ 533.086 |
| Excedente de concentracao acima de 3% por grupo | R$ 206.429 |
| **Total inelegivel** | **R$ 3.278.609** |
| **Carteira elegivel** | **R$ 8.618.471, 72,44% da carteira** |

## 5. A divida real

| Item | Valor | Declarado pela companhia |
|---|---|---|
| Capital de giro bancario | R$ 8.400.000 | sim |
| Conta garantida | R$ 2.100.000 | sim |
| FINAME | R$ 2.000.000 | sim |
| Cessoes com regresso (desconto de duplicatas) | R$ 4.180.000 | **nao** |
| Risco sacado | R$ 2.960.000 | **nao** |
| Fomento mercantil (factoring) | R$ 1.740.000 | **nao** |
| Parcelamento tributario | R$ 880.000 | **nao** |
| **Divida ajustada** | **R$ 22.260.000** | |
| (-) Caixa | (R$ 1.320.000) | |
| **Divida liquida ajustada** | **R$ 20.940.000** | |

O dono declarou R$ 12.000.000 no intake. A diferenca e **R$ 10.260.000**.

Alavancagem sobre EBITDA ajustado de R$ 4.160.000: **5.03x**.

## 6. O custo do factoring, que a companhia nao percebe

Fator de 3,45% ao mes mais ad valorem de 0,60% sobre a face. Para um titulo de 42 dias:

- Fator: 3,45% x 42/30 = **4,83%** sobre a face
- Ad valorem: **0,60%**
- Custo total no periodo: **5,43%** em 42 dias
- **Taxa efetiva anual: aproximadamente 57,4% ao ano**

Sobre o saldo de R$ 1.740.000, o custo anualizado e de cerca de R$ 998.760 por ano. Substituir essa linha e o argumento economico mais forte da operacao.

## 7. Os oito defeitos plantados

| # | Defeito | Onde esta | Efeito |
|---|---|---|---|
| 1 | Grupo economico com duas grafias e dois CNPJ de filial | Cadastro de Sacados: MARTINS MATERIAIS PARA CONSTRUCAO LTDA e Martins Mat. Const. Ltda ME | Concentracao do top 5 sobe de 15,80% para 17,13%, e o excedente de concentracao inelegivel cresce |
| 2 | 340 titulos renegociados sem marcacao | Base de titulos: vencimento reescrito, sem campo de renegociacao | Perda aparente menor que a real |
| 3 | Parte relacionada entre os sacados | VPR PARTICIPACOES E EMPREENDIMENTOS LTDA | R$ 104.362 inelegivel |
| 4 | Cessoes, risco sacado, factoring e PERT fora da posicao de divida | posicao bancaria.xlsx vs os tres contratos | Divida sobe R$ 9.760.000 |
| 5 | Razao contabil nao bate com a base analitica | Lancamento AJ-0917 de 30/09/2025 | Divergencia de R$ 1.900.000 |
| 6 | 120 titulos com NF cancelada em aberto | Base de titulos vs amostra de XML | R$ 533.086 sem lastro |
| 7 | Diluicao lancada em conta de despesa | Devolucoes e abatimentos.xlsx, conta 4.2.09.001 | Receita liquida real menor em R$ 3.059.553 no periodo |
| 8 | Mes com faturamento inflado | Novembro de 2025, 34% acima da tendencia | Qualidade da receita |

## 8. O que o sistema deve recomendar

Carteira elegivel de R$ 8.618.471 e volume cedivel anual da ordem de R$ 36.394.356. Custo fixo anual de um FIDC dedicado entre R$ 400 mil e R$ 700 mil, o que representa de 1,10% a 1,92% sobre o volume cedido.

A recomendacao correta **nao e FIDC dedicado**. O porte nao dilui o custo fixo. As alternativas que fazem sentido, em ordem: cota em FIDC multicedente para a parcela rotativa, e CCB com cessao fiduciaria para o capex do centro de distribuicao, que tem prazo e nao deve ser financiado com linha rotativa.

O sistema tambem deve apontar que o pedido de R$ 15 milhoes mistura duas naturezas: R$ 4,5 milhoes de capex, que pede prazo, e R$ 10,5 milhoes de giro e estoque, que pede linha rotativa. Financiar as duas com o mesmo instrumento e o erro mais comum nesse porte.