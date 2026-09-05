# Revisão independente por IA: método build-debt-ledger v2026.09.05-v14

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-build-debt-ledger-2026-09-05-05-51-53, commit 24646e0. Fingerprint a28b132888e706ebab8c8c250dc78da92f1d7a4e5da8726aae3b6ce51f8167da.

Resultado: **fail**. Evidências: 27 confirmed, 3 limitation, 2 corrected.

| Checagem | Feita |
| --- | --- |
| sourcesRevisited | sim |
| numbersRecalculated | sim |
| definitionsTested | sim |
| exceptionsTested | sim |
| adversarialTested | sim |
| consistencyTested | sim |
| baselineAdvantage | n/a |

## Evidências

| Resultado | Afirmação | Fonte | Âncora | Nota |
| --- | --- | --- | --- | --- |
| confirmed | Integridade do corpus gold. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | 43 entries, schema ai-review-corpus.v1 | Os 43 arquivos passaram na conferência SHA-256 contra o manifesto. |
| confirmed | Saldos das 18 linhas do ledger em 31/05/2026 e 28/02/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 39 | Todos os pares usados no teste coincidem com a tabela, inclusive custos de transação negativos. |
| confirmed | Dívida reportada de 5.670.186 e anterior de 4.988.383. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 39 | Recálculo das linhas: 5.670.186; anterior: 4.988.383. |
| confirmed | Dívida antes das linhas contra de 5.742.510. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 39 | 5.670.186 + 9.099 + 63.225 = 5.742.510. |
| confirmed | Conciliação com circulante 1.229.828 e não circulante 4.440.358. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | balanço patrimonial consolidado, p. 12 | 1.229.828 + 4.440.358 = 5.670.186; diferença zero. |
| confirmed | Cronograma gold e total de 5.670.186. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 40, cronograma de amortizações | 1.229.828 + 776.868 + 1.228.475 + 694.497 + 994.544 + 809.198 − 63.224 = 5.670.186. O primeiro período difere do circulante em zero. |
| confirmed | Caixa 1.430.714 e aplicações financeiras 25.095. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 3, p. 20; balanço, p. 11 |  |
| confirmed | Derivativos ativos 235 e passivos 14.335. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 25, p. 51 |  |
| confirmed | Dívida líquida contratual de 4.228.477. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 1.1, definição de Dívida Líquida, p. 7 | 5.670.186 + 14.335 − 235 − 1.430.714 − 25.095 = 4.228.477. |
| confirmed | Dívida líquida recalculada do release de 4.214.377, reportada como 4.214,4 milhões, diferença 23 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ri_release_1t26.txt | p. 12, tabela Endividamento e Caixa | 5.670.186 − 1.430.714 − 25.095 = 4.214.377; 4.214.400 − 4.214.377 = 23. |
| confirmed | 11ª emissão: vencimento 30/10/2028 e remuneração CDI + 1,55% para ambas as séries. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_11a_emissao.txt | pp. 1–2, características das séries |  |
| confirmed | 13ª emissão: vencimentos e remunerações das três séries. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_13a_emissao.txt | pp. 2–4, características das séries | 16/11/2028 e DI+0,65%; 18/11/2030 e IPCA+6,3416%; 16/11/2033 e IPCA+6,5264%. |
| confirmed | 14ª emissão: vencimentos e remunerações das três séries. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_14a_emissao.txt | pp. 2–4, características das séries | 15/06/2029 e 104% DI; 16/06/2031 e IPCA+6,8286%; 15/06/2034 e IPCA+6,9982%. |
| confirmed | 15ª emissão: vencimentos e remunerações das quatro séries. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_15a_emissao.txt | pp. 2–5, características das séries | 18/11/2030 e 105% DI; 16/11/2032 e 14,15% prefixado; 16/11/2032 e IPCA+8,20%; 16/11/2035 e IPCA+8,70%. |
| confirmed | Seis séries IPCA somam 743.955. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 39, combinado com af_13a/14a/15a, pp. 2–5 | 282.357 + 110.321 + 204.059 + 66.024 + 50.401 + 30.793 = 743.955; 743.955 / 5.670.186 = 0,13120469. |
| confirmed | Estoque de indexador desconhecido 2.416.994 e prefixado 408.703. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 39 | Empréstimos antes do custo: 1.314.412 + 867.244 + 54.180 + 181.158 = 2.416.994; a 15ª/2ª soma 408.703. |
| confirmed | Dívida em moeda estrangeira de 1.102.582 e participação de 19,4%. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 39 | 867.244 + 54.180 + 181.158 = 1.102.582; dividido por 5.670.186 = 0,19445253. |
| confirmed | As participações por indexador e moeda somam 1 sobre 5.742.510. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 465–477 | Os grupos excluem as duas linhas contra; seus numeradores somam exatamente o denominador 5.742.510. |
| confirmed | Eco é titular formal das debêntures da 13ª, 14ª e 15ª emissões. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | considerando D, p. 3; mesma estrutura nas escrituras 14ª e 15ª, p. 3 |  |
| confirmed | Os titulares dos CRA orientam o exercício dos direitos nas debêntures. | docs/product/gold-cases/runs/gc01/ai-review-corpus/cra_292_termo_securitizacao.txt | cláusula 17.8.8, p. 106 | A estrutura também aparece nas cláusulas 7.26.5 das escrituras da 14ª, p. 55, e 15ª, p. 56. |
| limitation | Qualificação final dos titulares de CRA como 'credores econômicos'. | docs/product/gold-cases/gc01-gabarito-rascunho.md | condição 7 e §13.5 | O corpus prova poder de orientação; a qualificação jurídica final exige especialista. |
| confirmed | Garantia da controladora sobre dívidas das controladas no exterior. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 40 | A fonte não individualiza contratos, conforme reconhecido pelo método e pelo teste. |
| limitation | Arrendamento excluído do gold e residual de outra dívida onerosa assumido zero. | docs/product/gold-cases/gc01-gabarito-rascunho.md | §5, linhas 148–151 | A inclusão dos 276.768 de arrendamento em 'outra dívida onerosa' exige interpretação jurídica; o executor declara residual zero. |
| confirmed | EBITDA, degraus, comparabilidade e headroom não são calculados por build-debt-ledger. | packages/credit-playbook/knowledge/procedures/financial/build-debt-ledger.md | Gold, linha 118 | O método delega covenant e headroom a reconcile-covenant-definitions; portanto não havia headroom deste executor a recalcular. |
| confirmed | Linhas contra não são obrigações, devem ser não positivas e permanecem na identidade contábil. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 69–85 e 324–335 | Os testes cobrem obrigação indevida, saldo contra positivo, polaridade anterior e decomposição por prazo. |
| confirmed | Base insuficiente gera uncovered_terms e insufficient_evidence sem preencher termos ausentes. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 480–490 | Empréstimos ficam sem remuneração, vencimento e credores; a moeda não é promovida a indexador. |
| confirmed | Ausência de caixa, definição, cronograma ou balanço produz incomplete; release sem nota, silêncio e contradições produzem blocked. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 338–399 e 438–496 | Os 19 testes Vitest passaram, incluindo essas exceções. |
| confirmed | Mutações de escala, troca compensatória de prazo, primeiro período, polaridade da definição, datas inválidas e inclusão contratual sem âncora são bloqueadas. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 174–330 |  |
| corrected | Mutação 'chamar a securitizadora de credor econômico' é rejeitada em todas as formulações equivalentes. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linha 149 | A validação é contornável: 'Eco Securitizadora, titular dos CRA' é aceita porque contém 'titular' e 'CRA'. Prova adversarial direta retornou state=incomplete com o fato falso preservado, sem erro. |
| confirmed | Permutações gold de linhas, períodos, views e chaves preservam resultado e fingerprints. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 376–388 | Vinte permutações cobrem exatamente esse subconjunto. |
| corrected | Fingerprints ignoram toda ordem semanticamente irrelevante de entrada. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 303–312 | Duas alocações válidas para a mesma linha, 40+60 versus 60+40, geraram fingerprints de entrada e saída diferentes e outputs diferentes. stableStringify não ordena arrays e canonical ordena allocations apenas por rowId, sem desempate ou unicidade. |
| limitation | O teste de contrato prova conformidade integral com o result contract. | packages/credit-playbook/src/executors/contract.ts | linhas 12–32 | Ele verifica somente nomes de campos no topo; não valida tipos, campos aninhados, nulabilidade, enums ou exigência estrutural de evidência. |

## Condições

- Corrigir a validação de credor econômico e adicionar mutações que mencionem simultaneamente securitizadora, titular e CRA.
- Canonicalizar integralmente allocations — ou proibir rowId duplicado por período — e testar permutações de alocações e seus fingerprints.
- Manter a inclusão de arrendamento condicionada a interpretação jurídica especializada.
- Manter a expressão 'credores econômicos' condicionada a revisão jurídica especializada.
- Ampliar o teste do contrato para validar tipos, estruturas aninhadas, nulabilidade e evidência, não apenas chaves superiores.

## Notas do revisor

OpenAI Codex (GPT-5), com shell, Vitest e recálculo independente em Python Decimal; sem internet.

Revisão independente por modelo. O caso gold financeiro confere integralmente e os 19 testes passam, mas duas mutações materiais escapam: rotulagem adversarial da securitizadora como credor econômico e não invariância de fingerprints para alocações semanticamente equivalentes.
