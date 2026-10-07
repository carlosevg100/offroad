# C02: custo equivalente e juros não pagos

`packages/financial-core/src/equivalent-financing-cost.ts` acrescenta dois motores puros, com schemas estritos e aritmética Decimal em contexto próprio de 60 dígitos. Não inferem tributo, cláusula, curva, calendário ou direito de uso e não habilitam um procedimento por si.

- `buildDeferredFinancingSchedule`: um desembolso, comissão/tributo retidos declarados, curva por intervalo, spread multiplicativo, amortização e cupom nas datas do contrato. `principal_plus_accrued` capitaliza juros não pagos até pagamento; `principal_only` conserva-os fora da base. Amortização ocorre depois da remuneração do intervalo. Principal e juros precisam estar integralmente liquidados no horizonte, caso contrário o motor recusa a prova de vida inteira.
- `solveEquivalentFinancingSpread`: desconta fluxos líquidos do tomador pela curva datada e resolve o spread anual que zera o valor presente. Curva e fluxos se encontram nas mesmas fronteiras; pagamento interno exige divisão do intervalo. ACT/365 confere os dias civis; DU/252 exige contagem adotada, que não certifica sozinho um calendário de feriados. Fração de ano adotada é identificada como tal.

O domínio do segundo motor é um desembolso líquido positivo e saídas posteriores, após compensar componentes simultâneos. Nesse domínio, a função de valor presente é monotônica e a raiz é única. Fluxo não convencional é recusado para não apresentar uma entre várias raízes arbitrariamente. Raiz fora do intervalo declarado retorna `root_not_bracketed`; custo desconhecido retorna `missing_inputs`. A lista de quatro categorias é uma declaração de cobertura do chamador, não verificação fiscal ou de completude de fontes.

Nenhum resultado é chamado automaticamente de CET regulatório. A versão do motor, todos os operandos, as convenções, vida média ponderada pelo principal, saldo, juros e o resíduo da solução são preservados. Os 128 passos da busca são fixos; tolerância e sinal usam precisão interna, antes de arredondar a exibição. Fontes/adoções, contas restritas, integração à companhia, garantias, covenants, firmeza e validade serão exigidos pelo procedimento/compositor, além do custo calculado aqui.

## Calibração independente

`equivalent-financing-cost.test.ts` confere os resultados publicados do Python de C02: spreads próximos de 4,0000%, 4,0047% e 3,5475%; vidas médias 3,5, 4 e 4,75 anos. O fluxo trimestral do oráculo é uma aproximação explicitamente identificada. Seus índices `q=6/10/20` pagam ao final dos intervalos 7/11/21 e não coincidem exatamente com as datas janeiro/julho da conversa. Esses índices não são defaults de contratos reais. A projeção datada deve usar as datas adotadas e informar essa divergência; os arquivos originais da ficha não foram corrigidos para caber no motor.

Controles adicionais: curva não constante, custo de entrada contado uma vez, raiz negativa, intervalo sem raiz, tributo desconhecido, curva incompleta, data sem curva, fluxo não convencional, identidade duplicada, fração de ano incompatível, juros compostos e simples sob convenções distintas, amortização ao final, falta de quitação, excesso de amortização e contexto Decimal global alterado.

O pacote passa a v26. O teste do consumidor atual declara essa versão nova e continua exigindo v24 no executor publicado fixado, além de negar derivações atuais que tentem entrar nele. Não houve alteração de snapshots, locks, aprovação ou liberação do método v4.
