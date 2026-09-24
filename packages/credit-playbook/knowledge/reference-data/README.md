# Parâmetros de referência da casa

Cada arquivo desta pasta reúne os cartões de uma família de parâmetros do cadastro (`packages/credit-playbook/src/reference-data.ts`). O cartão traz o texto profissional completo; o cadastro guarda o valor, a unidade, a fonte e a data, em `src/reference-data-proposals/<família>.ts`.

Tudo o que está aqui foi preparado pela Offroad e aguarda a revisão do fundador. No cadastro, o parâmetro tem estado `draft`: telas e métodos mostram "em rascunho" e o tratam como lacuna, sem mudar nenhum cálculo, até o dono aprovar com fonte datada e validade.

## Famílias

| Arquivo | Família |
| --- | --- |
| `capital-legal.md` | IOF, convenções ANBIMA e B3, regime tributário e referências jurídicas de estruturas, instrumentos e privacidade |
| `financial-analysis.md` | Conciliação, materialidade, normalização, ponte de caixa, capex, qualidade de receita, partes relacionadas, sazonalidade, câmbio, recebíveis, concentração e faixas de pares |
| `debt-scenarios.md` | Visões de dívida, vencimentos e renovação, cenários de plano e de mercado, folga, dimensionamento, custos, desembolso, uso misto e análise de espera |
| `structure.md` | Muro de vencimentos, covenants, alavancagem e cobertura, amortização, reservas, garantias, laudos, cross-default, reporte, cura e waiver, estrutura vendável, ticket e condições precedentes |
| `pricing-market.md` | Observações e curvas de preço, qualidade de amostra, largura de faixa, regime, prêmios, prazo, tamanho e liquidez, indexadores, custos, mandatos e ondas de distribuição |
| `intake-materials-qc.md` | Lote de pedidos, exigências por arquétipo, perguntas antecipadas, arredondamento, tolerâncias de controle de qualidade e alertas vermelhos |

As escolhas explícitas que os cartões deixam para o fundador estão em `REVISAO-DO-FUNDADOR.md`.

## Formato do cartão

```
### <chave exata do cadastro>

- **Decisão que governa.** A decisão profissional que o parâmetro destrava e o que acontece sem ele.
- **Valor proposto.** O valor, com unidade e escopo, afirmado sem hesitação.
- **Regra de aplicação.** Fórmula, quando se aplica, quando não se aplica e precedência sobre outras regras.
- **Fundamento.** Por que esse valor: prática de mercado, norma e evidência.
- **Fontes.** Norma ou referência oficial, com data de consulta e endereço.
- **Uso no método.** As regras do House Playbook (IDs) que consomem o parâmetro e o efeito no resultado.
- **Revisão.** O que obriga a rever antes do prazo.
- **Estado.** Preparado pela Offroad em <data>; aguardando revisão do fundador.
```

O título do cartão é a chave exata do cadastro, e o campo `documentation` da proposta aponta para ele como `knowledge/reference-data/<arquivo>.md#<chave>`.
