# Nimbus, a startup de Série A que pede venture debt

Empresa inventada. Nenhum número aqui descreve um negócio real.

## Por que ela existe

Os outros três casos são empresas que geram caixa. O arquétipo de venture debt precisa de uma
que queima caixa por desenho: ARR na casa de R$ 37 milhões, EBITDA negativo, treze meses de
runway e um pedido de dívida que compra tempo até a Série B. A mesa não pode dimensionar isso
por múltiplo de EBITDA, e o caso existe para provar que ela não tenta.

| | fakeco | nimbus |
|---|---|---|
| gera caixa | sim | não (queima R$ 1,85M/mês) |
| tamanho por | EBITDA, garantias | fração do ARR e da última rodada |
| documento que decide | mapa de dívida | export de MRR por cliente (40 clientes × 24 meses) |
| contradições | 3 | 2 |

## O que a sala exercita de propósito

**ARR de slide contra ARR de export.** O deck diz "R$ 40 milhões"; o export por cliente dá o
número real (MRR de julho × 12). O export manda. Um extrator que lê o deck e para ali errou o
número que define o tamanho da operação.

**Runway declarado contra runway calculado.** A carta diz 16 meses usando a queima do melhor
mês; o extrato dá a queima média do trimestre e o caixa de julho. Runway se calcula, não se
declara, e o gabarito espera o cálculo.

**Cap table como documento de crédito.** Última rodada (valor, data, líder, valuation) e
liquidação preferencial: é o que precifica o warrant e diz se os fundos têm reserva.

**Sem auditoria.** Só há gerencial; a auditoria de 2025 está em andamento. Isso é falta, não
bloqueio: venture debt é subscrito em gerencial mais extrato.

## Como regerar

```
pnpm --filter @offroad/testing-fixtures nimbus     # os seis arquivos
pnpm --filter @offroad/evals nimbus:gold           # o gabarito
pnpm --filter @offroad/evals verify:case nimbus    # os parsers leem tudo?
pnpm --filter @offroad/evals desk:gold nimbus      # o que a mesa diz a partir do gabarito
```

Documentos e gabarito saem os dois de `src/nimbus/truth.ts`. O gerador de MRR usa semente
fixa: os totais são o que ele produz, e o gabarito lê de lá, nunca de um slide arredondado.
