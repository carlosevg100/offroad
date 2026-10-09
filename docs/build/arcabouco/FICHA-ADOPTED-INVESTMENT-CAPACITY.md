# C04/C32: capacidade e investimento sobre a base adotada

Os adaptadores calculateAdoptedDebtCapacity e calculateAdoptedInvestmentAnalysis ligam os motores a contribuições imutáveis, com seleção tipada, definição, campo, entidade/perímetro, moeda, cenário, intervalo e interpretação monetária. Colunas de valores mantêm horizonte longo sem JSON financeiro livre. Não há número, fluxo ou perfil livre no pedido; o leitor SQL precisa autorizar o trabalho, entidades e fontes antes da chamada. Hash verifica integridade, não autoridade.

## Capacidade

Todos os cenários e finais de período declarados entram na interseção. Valores fixos são monetários; coeficientes por unidade de dívida e fatores financeiros têm escala unitária. Limite superior, quantum de busca, regras e valor fixo para revisão precisam ser adotados. O resultado replaya o ponto máximo e o tick seguinte. Um inventário que não quita ou um horizonte que não chega à última amortização não passa full_settlement; calibration_window continua calibration_only. Não prova caixa intraperíodo ou preço não linear. Nove testes de ligação PASS, além dos 22 testes prévios do motor.

## Investimento e companhia

A composição deriva giro de partida, rampa mensal, fluxos do projeto, projeção da mesma companhia com/sem projeto e valuation. Verticalização conserva a perda do financiamento do fornecedor antigo mesmo sem receita nova. Multiplicadores de capital retido são adotados: liberação terminal não é automática. Rampa atravessa dezembro e custos fixos respeitam convenção adotada. Projeções fornecidas por estoque/período são alternativa explícita aos drivers.

O valuation escolhe caixa isolado do projeto ou caixa incremental da companhia sob tributação conjunta; nunca soma imposto isolado para fingir o efeito na companhia. Datas, WACC, intervalo de TIR, grade temporal e precisão são adotados. Sem WACC, os fluxos e a projeção independentes continuam; sem companhia, a análise isolada continua com lacuna e não vira recomendação de financiamento. Datas de todas as dívidas e saldo final são conferidos; anos ausentes não recebem zero nem repetição do último ano. Dez testes de ligação PASS, incluindo C04/C32 e os caminhos por stocks/exposição e por drivers/rampa.

## Precisão de calibração

O Python C04 arredonda os fluxos em milhões a uma casa antes do valuation. A TIR é 6.754497888348132% sob essa precisão e 6.726855701373891% com os mesmos drivers sem arredondar. O componente investment-project v2 aceita calibration_monetary_quantum explícito: 100000 BRL reproduz 0,1 milhão, sem alterar fluxos originais nem adotar derivados de volta. Um teste novo do motor confere os números independentes e rejeita quantum zero/negativo. A referência C32 usa grid t=0 no primeiro ano por calibração; desconto por datas reais é outra convenção, sem grade manual ativa.

## Publicação e limites

20 testes novos PASS no incremento (19 ligações + 1 quantum do motor). Core prospectivo v29; igualdade econômica com pino histórico v24 verificada antes de atualizar a identidade prospectiva. Nenhum executor histórico, release, migração, RPC ou permissão alterado. Gate completo local 44/44 PASS: core 396, model 466, worker 1801. CI, merge e deploy ainda precisam passar. TaskSpecs, composição governada dos procedimentos e as quatro conversas reais de ensaio continuam pendentes; estes componentes não são completion do pedido.
