# Aurora Distribuidora, sala de dados sintética

Empresa inventada. Nenhum número aqui descreve um negócio real.

## Por que ela existe

O `rede-horizonte` mede extração desde o começo, e tem dois limites que só aparecem quando
alguém olha o gabarito dele: **79 campos esperados e zero em `debt` e `customers`**, e nenhuma
contradição entre documentos. Ou seja, o mapa de dívida, que é a primeira coisa que uma mesa de
crédito abre, nunca foi medido, e a reconciliação nunca teve nada para reconciliar.

A Aurora foi construída para preencher exatamente isso.

| | rede-horizonte | fakeco |
|---|---|---|
| campos esperados | 79 | 111 |
| campos de dívida | 0 | 40 |
| campos de clientes | 0 | 11 |
| contradições entre documentos | 0 | 3 |
| documento que chega como foto | não | sim |
| planilha em formato legado | não | sim (`.xls`) |

## O que a sala exercita de propósito

**A armadilha de escala.** As demonstrações auditadas são impressas em milhares de reais e o
balancete gerencial em reais. Ler as duas na mesma unidade erra por um fator de mil, que é o
erro mais caro que este produto pode cometer. O parser já detecta a declaração de escala do PDF
(`1000x`), e o gabarito espera o valor em reais.

**Três contradições, com resoluções diferentes.** Duas se resolvem por precedência e uma não:

- receita de 2025: auditado diz 191,2M, a carta arredonda para 190M, a projeção usa 193,5M
  como base preliminar. Resolve por rank: o auditado ganha.
- dívida bruta: o balanço diz 45,3M, o mapa soma 38,5M. A diferença é o arrendamento que o
  mapa não lista. Resolve por precedência: o balanço ganha.
- valor pedido: a carta diz R$ 40 milhões, o plano diz R$ 42,3 milhões. **Nenhuma fonte manda
  na outra.** Isso não é conflito de evidência, é a empresa tendo dito duas coisas, e a resposta
  certa é perguntar, não escolher.

**Quatro faltas.** Balanço revisado de 2026, licença ambiental do CD, aging de recebíveis e
contratos dos dois maiores clientes. Cada uma deve voltar como pergunta, nunca como suposição.

**O OCR.** O contrato social chega como fotografia de uma página sobre uma mesa, levemente
torta, que é como esse documento chega na vida real. E é o único lugar da sala que afirma a
forma societária, que por sua vez bloqueia metade do catálogo de instrumentos: uma limitada não
emite debênture.

## Como regerar

```
pnpm --filter @offroad/testing-fixtures fakeco         # os seis arquivos de escritório
./packages/testing-fixtures/scripts/render-fakeco.sh   # os dois PDFs e a foto
pnpm --filter @offroad/testing-fixtures fakeco:gold    # o gabarito
pnpm --filter @offroad/evals fakeco:verify              # os parsers do produto leem tudo?
```

Documentos e gabarito saem os dois de `src/fakeco/truth.ts`. Isso é o que impede o gabarito de
divergir dos arquivos que ele corrige, e é a diferença deste caso para o outro, cujo gerador
mora fora do repositório (AGENTS.md §9 registra o que isso custa).
