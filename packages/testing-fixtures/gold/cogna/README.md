# Cogna Educação, companhia aberta de serviços lida do release de resultados

Empresa real, documento público, pedido simulado.

## Por que ela existe

Camil é indústria com ITR e proposta de AGOE. Cogna é serviços (educação), lida de um único
release de resultados: o documento que uma companhia aberta manda primeiro, com destaques em
R$ milhões, anexos em R$ mil, DRE por segmento e consolidada, fluxo de caixa com a geração
livre como a companhia define, cronograma de amortização em gráfico, covenant apurado pelas
escrituras (dívida líquida inclui contas a pagar de aquisições; EBITDA ajustado soma itens não
recorrentes e provisões sem caixa) e arrendamentos de R$ 2,76 bilhões fora da dívida bruta.

| | camil | cogna |
|---|---|---|
| setor | alimentos (indústria) | educação (serviços) |
| documentos | ITR 62 págs + AGOE 138 págs | release 34 págs |
| dívida por instrumento | 16 linhas | 4 (por natureza, não por contrato) |
| parede | Jun/26 a Mai/27, R$ 1,23 bi | 2028, R$ 2,14 bi |
| alavancagem | 4,72x pro forma contra 4,0x | 1,10x |

## O que a sala exercita de propósito

**Duas escalas no mesmo documento.** Destaques e cronograma em R$ milhões; anexos em R$ mil.
**Definições da companhia.** Disponibilidades somam caixa, equivalentes e títulos; dívida
líquida inclui derivativos e contas a pagar de aquisições; o gabarito diz qual definição usa.
**Gráfico como tabela.** O cronograma de amortização é um gráfico de barras com os valores
impressos; a extração precisa ler 2026: 254, 2027: 413, 2028: 2.140, 2029: 811, ≥2030: 309.
**Segmento contra consolidado.** Kroton e Vasta têm DREs próprias; o consolidado está nos
destaques. Um extrator que pega a primeira "Receita Líquida" que vê pega um segmento.

## Como regerar

```
pnpm --filter @offroad/testing-fixtures cogna    # o pedido simulado
pnpm --filter @offroad/evals cogna:gold          # o gabarito
```

O release não é gerado: é cópia do arquivamento público. Se a companhia republicar, o hash
no manifesto muda e o caso precisa ser relido.
