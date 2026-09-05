# Revisão independente por IA: método build-debt-ledger v2026.09.05-v13

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-build-debt-ledger-2026-09-05-05-35-40, commit f1c3864. Fingerprint 8463dc0e757bc30af0fc7bd563a095367ee73273df871ae9b8863f92cacd23ae.

Resultado: **fail**. Evidências: 27 confirmed, 7 limitation, 2 corrected.

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
| confirmed | 1. Integridade do corpus: os 43 arquivos correspondem ao manifesto. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries[0..42] | SHA-256 e tamanho foram recalculados; zero divergências. |
| confirmed | 2. Unidade e datas do gold: R$ mil em 31/05/2026 e 28/02/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p. 11, cabeçalho do balanço |  |
| confirmed | 3. Empréstimos: BRL 1.314.412/951.593; USD 867.244/492.857; CLP 54.180/43.397; PEN 181.158/199.398; custos (9.099)/(1.123). | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p. 39, nota 15 |  |
| confirmed | 4. As doze séries e os custos de debêntures usados no teste reproduzem a nota. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p. 39, nota 15, tabela Debêntures | Inclui 770.123/795.649 da 15ª-1ª e custos de (63.225)/(66.347). |
| confirmed | 5. Balanço: circulante 1.229.828 e não circulante 4.440.358. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p. 12, balanço consolidado, nota 15 |  |
| confirmed | 6. Cronograma gold: 1.229.828; 776.868; 1.228.475; 694.497; 994.544; 809.198; custos (63.224). | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p. 40, nota 15, Cronograma de amortizações |  |
| confirmed | 7. Caixa 1.430.714 e aplicações financeiras 25.095. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF pp. 20 e 11, nota 3 e balanço consolidado |  |
| confirmed | 8. Derivativos: ativo 235 e passivo 14.335. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p. 51, nota 25, consolidado |  |
| confirmed | 9. O release apresenta dívida bruta 5.670,2, caixa e aplicações 1.455,8 e dívida líquida 4.214,4 milhões. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ri_release_1t26.txt | PDF p. 12, tabela Endividamento e Caixa |  |
| confirmed | 10. A definição contratual soma empréstimos, financiamentos, debêntures, derivativos passivos e outra dívida onerosa; deduz caixa, aplicações e derivativos ativos. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | PDF p. 7, cláusula 1.1, definição Dívida Líquida |  |
| confirmed | 11. Termos da 11ª: vencimento 30/10/2028 e 100% CDI + 1,55% a.a. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_11a_emissao.txt | PDF pp. 1-2, Características da emissão e das séries |  |
| confirmed | 12. Termos das três séries da 13ª reproduzem vencimentos e taxas do teste. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_13a_emissao.txt | PDF pp. 2-4, Características da emissão | DI+0,65%; IPCA+6,3416%; IPCA+6,5264%. |
| confirmed | 13. Termos das três séries da 14ª reproduzem vencimentos e taxas do teste. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_14a_emissao.txt | PDF pp. 2-4, Características da emissão | 104% DI; IPCA+6,8286%; IPCA+6,9982%. |
| confirmed | 14. Termos das quatro séries da 15ª reproduzem vencimentos e taxas do teste. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_15a_emissao.txt | PDF pp. 2-5, Características da emissão | 105% DI; 14,15% prefixada; IPCA+8,20%; IPCA+8,70%. |
| confirmed | 15. Recálculo da dívida: atual 5.670.186; anterior 4.988.383; antes das linhas contra 5.742.510. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p. 39, nota 15 | Soma independente das 18 linhas: 5.670.186 e 4.988.383; custos atuais somam -72.324, logo 5.670.186-(-72.324)=5.742.510. |
| confirmed | 16. Recálculo da conciliação total. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p. 12, balanço consolidado | 1.229.828+4.440.358=5.670.186; diferença zero. |
| confirmed | 17. Recálculo do cronograma e primeiro período. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p. 40, nota 15 | 1.229.828+776.868+1.228.475+694.497+994.544+809.198-63.224=5.670.186; 1.229.828-1.229.828=0. |
| confirmed | 18. Recálculo das duas dívidas líquidas. | docs/product/gold-cases/gc01-gabarito-rascunho.md | linhas 124-136 e 299-310 | Release: 5.670.186-1.430.714-25.095=4.214.377. Contratual: 5.670.186+14.335-235-1.430.714-25.095=4.228.477. |
| limitation | 19. Diferença nominal de 23 para o release. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ri_release_1t26.txt | PDF p. 12, tabela Endividamento e Caixa | 4.214.400-4.214.377=23, mas 4.214,4 milhões é arredondado a uma casa; 23 mil não é divergência observável com precisão exata na fonte. |
| confirmed | 20. Grupos por indexador: CDI 2.172.858; IPCA 743.955; prefixado 408.703; desconhecido 2.416.994. | docs/product/gold-cases/gc01-gabarito-rascunho.md | linhas 242-263, combinadas com seção 1, linhas 31-53 | Somas independentes: IPCA=282.357+110.321+204.059+66.024+50.401+30.793=743.955; desconhecido=1.314.412+867.244+54.180+181.158=2.416.994. |
| confirmed | 21. Percentuais IPCA e moeda estrangeira. | docs/product/gold-cases/gc01-gabarito-rascunho.md | linhas 57-61 e 261-263 | 743.955/5.670.186=0,1312046906; moeda estrangeira=867.244+54.180+181.158=1.102.582 e 1.102.582/5.670.186=0,1944525277. |
| confirmed | 22. As participações sobre dívida antes das linhas contra somam 1. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 432-444 | Os grupos excluem linhas contra e usam 5.742.510 como denominador; soma exata independente=1, antes do arredondamento a oito casas. |
| confirmed | 23. Garantia quirografária das debêntures e garantia da controladora sobre dívidas das controladas no exterior. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF pp. 39-40, nota 15 | A garantia das dívidas externas não é individualizada por contrato, como o teste registra. |
| confirmed | 24. Eco é a titular formal das debêntures das 13ª, 14ª e 15ª emissões. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | PDF p. 3, preâmbulo e considerando D | As escrituras da 14ª e 15ª repetem a estrutura em seus preâmbulos, p. 3. |
| limitation | 25. Titulares dos CRA orientam o exercício de direitos sobre as debêntures. | docs/product/gold-cases/runs/gc01/ai-review-corpus/cra_292_termo_securitizacao.txt | cláusula 17.8.8 | A governança está documentada; a qualificação jurídica final como 'credores econômicos' exige especialista, conforme gabarito linhas 13 e 431-444. |
| limitation | 26. Definições de EBITDA, degraus e comparabilidade não são calculadas por este executor. | packages/credit-playbook/knowledge/procedures/financial/build-debt-ledger.md | linhas 71-73 e 114-118 | O método delega headroom e covenant a reconcile-covenant-definitions; portanto não há headroom do executor a recalcular aqui. |
| confirmed | 27. Ausências viram uncovered_terms/insufficient_evidence, sem preenchimento dos termos. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 447-457 | Remuneração ausente permanece null e o agrupamento usa 'unknown'; moeda não é convertida em indexador. |
| confirmed | 28. Base insuficiente, release sem nota, silêncio e ausência de dívida sem balanço zero bloqueiam ou ficam incomplete. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 308-339, 365-367 e 413-423 | Confirmado também pelos testes nas linhas 210-233 e 331-371; execução local: 18/18 testes passaram. |
| confirmed | 29. As mutações declaradas no frontmatter — escala unilateral, troca compensatória, polaridade da definição, datas, split e inclusão só contratual — têm caminhos de bloqueio. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 172-328 e 392-436 | A escala testada altera uma linha contra um balanço independente; definições adversariais e splits são efetivamente exercitados. |
| corrected | 30. A promessa de recusar unidade incompatível é falsa para BRL sem escala. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 100-102 e 129-131 | O regex de BRL aceita a nota 'em milhares de reais'. Mutação executada com unit='BRL' e essa âncora retornou state='complete', sem block_reasons. O teste cobre apenas BRL million (teste linhas 205-207 e 428-433). |
| corrected | 31. O cronograma prometido instrumento a instrumento não é implementado. | packages/credit-playbook/knowledge/procedures/financial/build-debt-ledger.md | linhas 30-34, 54-57 e 84-100 | O executor aceita somente períodos agregados, sem rowId ou alocação por instrumento (executor linhas 110-114 e 341-364). Assim, não pode testar se cada saldo foi alocado nem produzir simultaneamente ano civil e ano safra; ainda assim marca o gold complete. |
| limitation | 32. A mutação 'lease incluído, mas definição omite lease' não é realmente executada. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 412-421 | O corpo está sob if (leaseRow), mas camil() não possui lease; a asserção é pulada silenciosamente. |
| limitation | 33. O executor não valida o conteúdo da âncora contra a fonte. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 25, 58-68, 97-144 e 284-285 | Documento, página e nota são strings confiadas ao chamador; isso explica por que uma nota de unidade fabricada pode passar. |
| confirmed | 34. Determinismo sob ordem de entrada e fingerprints. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 273-285 e 464-478 | Linhas, períodos e views são canonicalizados; chaves são ordenadas recursivamente. Vinte permutações mantiveram os dois fingerprints e o resultado integral (teste linhas 373-385). |
| limitation | 35. O teste de contrato verifica apenas chaves de primeiro nível. | packages/credit-playbook/src/executors/contract.ts | linhas 5-32 | O teste nas linhas 388-390 não prova tipos, campos aninhados ou semântica do contrato; procedure-contract.ts linhas 41-60 define metadados genéricos, não valida este resultado concreto. |
| limitation | 36. Arrendamento dentro do residual 'outra dívida onerosa'. | docs/product/gold-cases/gc01-gabarito-rascunho.md | linhas 7 e 148-151 | A inclusão exige interpretação jurídica especializada; o gold exclui 276.768 e o executor apenas declara residualAssumedZero. |

## Condições

- Corrigir a validação de unidade para que 'em milhares de reais' não aceite unit='BRL' sem escala; fonte: executor linhas 129-131 e ITR p. 11.
- Implementar ou restringir formalmente o contrato do cronograma: alocação por instrumento e tratamento de ano civil/ano safra; método linhas 30-34 e 54-57.
- Executar sem guarda inativa a mutação de lease omitido da definição; teste linhas 412-421.
- Preservar a precisão/escala declarada do release antes de interpretar os 23 mil como diferença; release p. 12.
- Vincular ou verificar o conteúdo das âncoras em camada anterior ao executor; executor linhas 25 e 97-144.
- Submeter a qualificação de titulares de CRA como credores econômicos e a inclusão de arrendamento em outra dívida onerosa a especialista; gabarito linhas 7, 13 e 431-444.
- Avaliar EBITDA, degraus, comparabilidade e headroom no método reconcile-covenant-definitions; build-debt-ledger.md linhas 114-118.

## Notas do revisor

OpenAI Codex (GPT-5), revisão independente por modelo com shell local e Vitest; sem internet.

Os números do gold e as fórmulas financeiras conferem. O resultado é fail por duas divergências materiais de comportamento: a unidade BRL passa contra uma âncora que declara milhares, e o executor não implementa a alocação do cronograma por instrumento prometida pelo método. Esta é revisão por modelo, não aprovação humana; procedure-contract.ts linhas 158-168.
