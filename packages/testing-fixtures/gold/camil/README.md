# Camil Alimentos, companhia aberta lida dos próprios arquivamentos

Empresa real, documentos públicos, pedido simulado.

## Por que ela existe

Aurora é sintética e consistente por construção. Este caso é o oposto: dois arquivamentos reais
da CVM e o ruído que arquivamento real carrega. Exercício fiscal que termina em fevereiro, balanço
impresso em milhares, doze séries de debênture cujos saldos estão em um documento e cujas taxas e
vencimentos estão em outro, linhas em dólar, peso chileno e sol peruano sem detalhe por contrato,
e um covenant medido uma vez por ano enquanto a companhia reporta um pro forma acima dele.

| | fakeco | camil |
|---|---|---|
| origem dos documentos | gerados | CVM / RI (21/08/2026) |
| páginas | ~30 | 200 |
| campos esperados | 149 | 154 |
| linhas de dívida | 7 | 16 |
| exercício fiscal | dezembro | fevereiro |
| moedas no estoque | 1 | 4 |

## Os documentos

1. `01_ITR_1T26_31mai2026.pdf`: informações trimestrais de 31/05/2026, revisadas pela BDO RCS.
   Balanço, DRE, fluxo de caixa, nota 15 (empréstimos, cronograma por ano-safra, covenant de
   4,0x e pro forma de 4,72x).
2. `02_Proposta_Administracao_AGOE_2026.pdf`: proposta da administração para a AGOE de
   30/06/2026. Comentários dos diretores sobre o exercício findo em 28/02/2026 (receita, EBITDA,
   dívida líquida) e os termos de cada emissão de debênture e CRA (taxa, amortização, vencimento).
3. `03_Pedido_Simulado_CRA_2026.docx`: o pedido. É ficção e diz isso na primeira linha. R$ 1,5
   bilhão em CRA, 84 meses, 24 de carência, para resgatar as parcelas de Jun/26 a Mai/27.

## O que a sala exercita de propósito

**Período fiscal deslocado.** O "2025" da companhia termina em 28/02/2026. O gabarito segue a
ontologia: `historical_financials.2025` para o exercício, `interim_financials.2026_05` com janela
`_3m` para o trimestre. Um extrator que assume ano-calendário erra todos os períodos.

**O mapa de dívida em dois documentos.** O ITR traz os saldos por série; a proposta da AGOE traz
taxa, amortização e vencimento. Nenhum dos dois sozinho monta a linha completa. É o que uma mesa
faz com arquivamento público, e é a primeira vez que a extração é medida nessa junção.

**Covenant anual contra pro forma trimestral.** 4,72x em maio contra 4,0x medido em fevereiro
não é rompimento, é pressão. A leitura certa é a trajetória até a medição, e a pergunta certa é como
a companhia chega lá; a leitura errada é declarar default.

**Duas definições de caixa.** A dívida líquida da companhia desconta aplicações financeiras; o
balanço separa as rubricas. `net_debt_2026_05` usa a definição da companhia e diz que usa.

## Como regerar

```
pnpm --filter @offroad/testing-fixtures camil     # o pedido simulado
pnpm --filter @offroad/evals camil:gold           # o gabarito
```

Os dois PDFs não são gerados: são cópias dos arquivamentos. Se a companhia republicar, o hash no
manifesto muda e o caso precisa ser relido, não regenerado.
