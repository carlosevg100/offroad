# Revisão independente por IA: método build-debt-ledger v2026.09.05-v12

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-build-debt-ledger-2026-09-05-05-13-23, commit ba9fb28. Fingerprint 8fab001d1bf1365dca7e80204129b8bf38f9a85c61d999a3d24321138c630dba.

Resultado: **fail**. Evidências: 30 confirmed, 3 limitation, 3 corrected, 1 unverifiable.

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
| confirmed | 1. Integridade do corpus: os 43 arquivos correspondem ao manifesto. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries[0..42]: bytes e sha256 | Recálculo SHA-256 encontrou zero divergências. |
| confirmed | 2. Os saldos atuais e anteriores de todas as linhas do ledger gold correspondem à nota de dívida. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | p. 39, nota 15 | Inclui quatro empréstimos, doze séries, custos de empréstimos de -9.099/-1.123 e custos de debêntures de -63.225/-66.347. |
| confirmed | 3. O balanço informa circulante 1.229.828 e não circulante 4.440.358. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | p. 12, balanço consolidado | 1.229.828 + 4.440.358 = 5.670.186. |
| confirmed | 4. O cronograma gold contém 1.229.828, 776.868, 1.228.475, 694.497, 994.544, 809.198 e -63.224. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | p. 40, nota 15, cronograma de amortizações |  |
| confirmed | 5. Caixa, aplicações e derivativos usados nas visões são 1.430.714, 25.095, ativo 235 e passivo 14.335. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | pp. 11, 20 e 51; notas 3 e 25 |  |
| confirmed | 6. O release reporta dívida bruta 5.670,2 milhões, caixa e aplicações 1.455,8 milhões e dívida líquida 4.214,4 milhões. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ri_release_1t26.txt | p. 12, tabela Endividamento e Caixa |  |
| confirmed | 7. Vencimento 30/10/2028 e remuneração de 100% do CDI + 1,55% para as duas séries da 11ª. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_11a_emissao.txt | pp. 1-2, características das séries |  |
| confirmed | 8. Os vencimentos e remunerações das três séries da 13ª conferem. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_13a_emissao.txt | pp. 2-4, características das séries | 16/11/2028 a DI+0,65%; 18/11/2030 a IPCA+6,3416%; 16/11/2033 a IPCA+6,5264%. |
| confirmed | 9. Os vencimentos e remunerações das três séries da 14ª conferem. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_14a_emissao.txt | pp. 2-4, características das séries | 15/06/2029 a 104% DI; 16/06/2031 a IPCA+6,8286%; 15/06/2034 a IPCA+6,9982%. |
| confirmed | 10. Os vencimentos e remunerações das quatro séries da 15ª conferem. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_15a_emissao.txt | pp. 2-5, características das séries | 18/11/2030 a 105% DI; 16/11/2032 prefixada 14,15%; 16/11/2032 a IPCA+8,20%; 16/11/2035 a IPCA+8,70%. |
| confirmed | 11. Dívida bruta atual, anterior e antes das linhas contra. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 98-103 | Somas próprias: atual 5.670.186; anterior 4.988.383; linhas contra = -9.099-63.225=-72.324; antes das contra = 5.670.186+72.324=5.742.510. |
| confirmed | 12. Reconciliação total e por primeiro período. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 104-108 | Ledger 5.670.186 menos balanço (1.229.828+4.440.358) = 0; primeiro período 1.229.828 menos circulante 1.229.828 = 0. |
| confirmed | 13. Soma do cronograma. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 107-108 | 1.229.828+776.868+1.228.475+694.497+994.544+809.198-63.224=5.670.186. |
| confirmed | 14. Dívida líquida contratual de 4.228.477. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | p. 7, definição de Dívida Líquida | 5.670.186+14.335-235-1.430.714-25.095=4.228.477. |
| confirmed | 15. Dívida líquida recalculada do release e diferença para o valor publicado. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 113-115 | 5.670.186-1.430.714-25.095=4.214.377; 4.214.400-4.214.377=23. |
| confirmed | 16. Estoques por indexador. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 116-118 e 137-139 | CDI=2.172.858; IPCA=743.955; prefixada=408.703; desconhecido=2.416.994; soma=5.742.510. |
| confirmed | 17. Estoques e percentuais por moeda. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 119-126 | BRL=4.639.928; USD=867.244; CLP=54.180; PEN=181.158. Estrangeira=1.102.582; 1.102.582/5.670.186=0,19445253. |
| confirmed | 18. Percentual IPCA e participações sobre os dois denominadores. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 121-126 | 743.955/5.670.186=0,13120469; 743.955/5.742.510=0,12955223. As participações antes das contra somam 0,99999999 por arredondamento. |
| confirmed | 19. Participações do cronograma produzidas pelo executor. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 308-331 | Sobre 5.670.186: 0,21689377; 0,13700926; 0,21665515; 0,12248223; 0,17539883; 0,14271102; -0,01115025. |
| confirmed | 20. A definição contratual soma derivativos passivos e deduz caixa, aplicações e derivativos ativos. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | p. 7, definição de Dívida Líquida | A fórmula do executor reproduz esses operandos e marca explicitamente o residual de outra dívida onerosa como zero assumido. |
| confirmed | 21. A definição do release decorre das linhas rotuladas da tabela e não contém derivativos. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ri_release_1t26.txt | p. 12, tabela Endividamento e Caixa |  |
| limitation | 22. EBITDA e degraus contratuais não pertencem ao cálculo deste executor. | packages/credit-playbook/knowledge/procedures/financial/build-debt-ledger.md | linhas 114-120, seção Gold/Adversarial | O método delega headroom e covenant a reconcile-covenant-definitions. |
| confirmed | 23. A escritura define EBITDA LTM e degraus de 3,50x e 4,00x. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | pp. 34-35, cláusula 4.22.3 | A 11ª também inclui EBITDA de adquirida e sellers finance; isso impede assumir comparabilidade integral sem a abertura usada pela companhia. |
| limitation | 24. O pro forma 4,72x excede 4,00x em 0,72x, mas não prova rompimento. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | p. 40, nota 15 | Recálculo: 4,72-4,00=0,72x. A fonte diz medição anual e próxima medição em 28/02/2027; o executor revisado não produz headroom. |
| confirmed | 25. Linhas contra são não positivas, não possuem obrigação e participam da identidade reportada. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 54-85 e 261-267 | Os testes cobrem polaridade atual/anterior, classificação e obrigação indevida. |
| confirmed | 26. Termos ausentes viram insufficient_evidence campo a campo, sem zeros inventados. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 414-424 | No gold, empréstimos permanecem sem remuneração, vencimento e credores; garantia também falta apenas para o empréstimo BRL. |
| confirmed | 27. Base sem cronograma, definição ou componente de caixa fica incomplete; release sem nota e silêncio documental bloqueiam. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 211-233 e 332-372 | Os testes também confirmam ledger vazio somente com evidência e balanço zero. |
| corrected | 28. A mutação de escala declarada pelo método não é integralmente resistida. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 204-208 | O teste troca apenas unit para BRL million mantendo a âncora que declara milhares e aceita o resultado; a conciliação continua zero e o executor pode rotular todos os cálculos com unidade materialmente errada. |
| corrected | 29. A validação prometida como operando a operando usa uma blacklist incompleta. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 189-236 | Mutação executada: definição do release 'dívida bruta mais royalties menos caixa e aplicações financeiras' produziu state=complete e 85, ignorando royalties. Isso contradiz o método, linha 59, que proíbe qualquer componente estranho. |
| corrected | 30. A mutação que chama a securitizadora de credor econômico não é rejeitada. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 53 e 80-81 | O executor verifica apenas string e presença de âncora. Mutação executada com economicCreditors='Eco Securitizadora' terminou complete; não há validação contra o conteúdo da cláusula. |
| confirmed | 31. O mecanismo contratual orienta a securitizadora conforme deliberação dos titulares dos CRA. | docs/product/gold-cases/runs/gc01/ai-review-corpus/cra_292_termo_securitizacao.txt | cláusula 17.8.8 | A qualificação jurídica final desses titulares como credores econômicos permanece condicionada a especialista. |
| confirmed | 32. Os testes adversariais cobrem escala numérica de uma linha, splits compensatórios, cronograma, polaridade, datas, duplicidades, ausência de âncora e definições mutadas enumeradas. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 172-330 e 393-427 | Não cobrem adequadamente unidade incompatível com a âncora, operandos estranhos fora da blacklist, credor econômico semanticamente trocado, indexador inferido da moeda com âncora inadequada ou inclusão de commercial_note/CPR não citada pela definição. |
| confirmed | 33. O executor é determinístico para as permutações exercitadas. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 374-386 | Vinte permutações de linhas, períodos, views e chaves preservam ambos os fingerprints e o objeto completo. Isso prova o caso exercitado, não todas as entradas semanticamente possíveis. |
| confirmed | 34. A ordenação e os fingerprints são implementados deterministicamente. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 240-252 e 431-445 | Linhas, períodos e views são canonizados; chaves de objetos são ordenadas antes de SHA-256. |
| confirmed | 35. O registro é revisão por modelo, não aprovação humana; maturity=implemented é compatível com o contrato. | packages/credit-playbook/src/procedure-contract.ts | linhas 12-20 e 152-177 | O contrato reserva aprovação humana à maturidade production. |
| unverifiable | 36. O corpus não resolve se IPCA é capitalizado ou pago. | docs/product/gold-cases/gc01-gabarito-rascunho.md | condição 8; seção 11.1 | O executor identifica corretamente o estoque IPCA, mas não pode inferir essa mecânica econômica. |
| limitation | 37. Incluir arrendamento no residual de outra dívida onerosa exige interpretação jurídica. | docs/product/gold-cases/gc01-gabarito-rascunho.md | condição 1; seção 5 | O cálculo gold mantém 276.768 fora da dívida contratual e declara residual zero; isso não resolve a interpretação jurídica. |

## Condições

- A inclusão de arrendamentos em “outra dívida onerosa” exige interpretação jurídica especializada; fontes: escritura_13a_emissao.txt p. 7 e 01_ITR_1T26_31mai2026.txt p. 51.
- A qualificação jurídica final dos titulares de CRA como credores econômicos exige especialista; fonte: cra_292_termo_securitizacao.txt, cláusula 17.8.8.
- Headroom, EBITDA, degraus e comparabilidade integral devem ser revistos no executor reconcile-covenant-definitions; build-debt-ledger.md, linha 118, os delega explicitamente.
- A comparação integral do pro forma 4,72x requer abertura do EBITDA e informações complementares; fontes: 01_ITR_1T26_31mai2026.txt p. 40 e escritura_11a_emissao.txt cláusula 4.22.3.
- A mecânica de IPCA capitalizado versus pago não é verificável no corpus; gc01-gabarito-rascunho.md, condição 8.

## Notas do revisor

Codex (GPT-5), revisão independente por modelo com shell local e Vitest.

Os números gold, as duas visões, reconciliação, cronograma e percentuais conferem. O resultado é fail porque o executor aceita unidade incompatível com a âncora, aceita operandos materiais desconhecidos na definição e não resiste à troca semântica do credor econômico. A suíte executada passou: 17/17 testes.
