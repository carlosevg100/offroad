# Revisão independente por IA: método build-debt-ledger v2026.09.05-v11

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-build-debt-ledger-2026-09-05-04-58-37, commit c86c292. Fingerprint b1845c550e51c2f91bab035ddd64ff73f9f85a286d568cb26f82605ae674b4e0.

Resultado: **fail**. Evidências: 20 confirmed, 1 limitation, 3 corrected.

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
| confirmed | 1. O corpus usado corresponde ao manifesto congelado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries | Todos os 44 arquivos passaram em sha256sum -c. |
| confirmed | 2. Os 18 saldos atuais e anteriores do ledger gold reproduzem a nota de dívida. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39 | Conferidos individualmente os quatro empréstimos, dois custos de transação e as doze séries de debêntures. |
| confirmed | 3. Dívida bruta atual 5.670.186, anterior 4.988.383 e dívida antes das linhas contra 5.742.510. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39 | Atual: 2.416.994 - 9.099 + 3.325.516 - 63.225 = 5.670.186. Anterior: 1.687.245 - 1.123 + 3.368.608 - 66.347 = 4.988.383. Antes das contra: 2.416.994 + 3.325.516 = 5.742.510. |
| confirmed | 4. A reconciliação total é zero: circulante 1.229.828 mais não circulante 4.440.358. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | balanço consolidado, página 12 | 1.229.828 + 4.440.358 = 5.670.186; diferença para o ledger = 0. A conciliação separada não é possível porque a nota não abre cada instrumento por prazo. |
| confirmed | 5. O cronograma soma 5.670.186 e o primeiro período equivale ao circulante. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 | 1.229.828 + 776.868 + 1.228.475 + 694.497 + 994.544 + 809.198 - 63.224 = 5.670.186; primeiro período menos circulante = 0. Participações recalculadas: 0,21689377; 0,13700926; 0,21665515; 0,12248223; 0,17539883; 0,14271102; -0,01115025. |
| confirmed | 6. Caixa 1.430.714, aplicações 25.095, derivativos ativos 235 e passivos 14.335 têm suporte direto. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | balanço página 11; nota 3 página 20; nota 25 página 51 |  |
| confirmed | 7. A definição contratual soma dívida e derivativos passivos e deduz caixa, aplicações e derivativos ativos. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | página 7, definição “Dívida Líquida” | O texto também contém o residual “qualquer outra rubrica que se refira à dívida onerosa”. |
| confirmed | 8. Dívida líquida contratual de 4.228.477. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | notas 15 e 25, páginas 40 e 51 | 5.670.186 + 14.335 - 235 - 1.430.714 - 25.095 = 4.228.477. |
| confirmed | 9. Dívida líquida do release recalculada em 4.214.377, contra 4.214.400 reportados, diferença 23. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ri_release_1t26.txt | página 12, tabela “Endividamento e Caixa” | 5.670.186 - 1.430.714 - 25.095 = 4.214.377; 4.214.400 - 4.214.377 = 23. |
| confirmed | 10. Vencimentos e remunerações das 11ª, 13ª, 14ª e 15ª emissões usados no gold. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_11a_emissao.txt; docs/product/gold-cases/runs/gc01/ai-review-corpus/af_13a_emissao.txt; docs/product/gold-cases/runs/gc01/ai-review-corpus/af_14a_emissao.txt; docs/product/gold-cases/runs/gc01/ai-review-corpus/af_15a_emissao.txt | 11ª páginas 1–2; 13ª páginas 2–4; 14ª páginas 2–4; 15ª páginas 2–5 | Conferidos CDI + 1,55%; DI + 0,65%; 104% e 105% do DI; prefixada 14,15%; e os seis spreads IPCA, além dos vencimentos de todas as séries. |
| confirmed | 11. As seis séries IPCA somam 743.955; desconhecido soma 2.416.994; prefixado soma 408.703. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39 | IPCA: 282.357 + 110.321 + 204.059 + 66.024 + 50.401 + 30.793 = 743.955. Participações: 0,12955223 sobre 5.742.510 e 0,13120469 sobre 5.670.186. |
| confirmed | 12. Dívida em moeda estrangeira soma 1.102.582 e representa 19,4453% da dívida reportada. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39 | 867.244 + 54.180 + 181.158 = 1.102.582; 1.102.582 / 5.670.186 = 0,19445253. As participações por moeda sobre 5.742.510 somam 1. |
| confirmed | 13. A garantia da controladora sustenta apenas a afirmação agregada sobre dívidas das controladas no exterior. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 | A fonte não individualiza contratos; o executor preserva essa ressalva. |
| limitation | 14. Eco é titular formal das debêntures privadas e os titulares dos CRA orientam o exercício dos direitos. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt; docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_14a_emissao.txt; docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt; docs/product/gold-cases/runs/gc01/ai-review-corpus/cra_292_termo_s | considerando D, página 3; cláusulas 7.26.5, páginas 55 e 56; cláusula 17.8.8, página 106 | Os fatos documentais conferem; a qualificação jurídica final de “credor econômico” exige especialista, como reconhece o próprio gabarito. |
| confirmed | 15. EBITDA, degraus de covenant e headroom não são calculados por este executor. | packages/credit-playbook/knowledge/procedures/financial/build-debt-ledger.md | Testes/Gold, linha 118 | O método os delega a reconcile-covenant-definitions. As definições e condições dos degraus constam no gabarito, seção 13.1, mas não são outputs deste executor. |
| confirmed | 16. Base insuficiente gera uncoveredTerms/incomplete e não inventa termos ou caixa. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 336–394 e 411–427 | Componentes ausentes impedem apenas a visão dependente; campos de remuneração, vencimento, garantia, credores e classificação viram insufficient_evidence. |
| confirmed | 17. Release sem nota, silêncio documental, ausência de dívida sem balanço e diferenças de conciliação bloqueiam. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 275–305 e 423–427 | Os testes correspondentes estão nas linhas 210–254 e 358–370 do arquivo de testes. |
| confirmed | 18. As mutações declaradas de escala em uma linha, troca compensatória de prazo, primeiro período, polaridade de derivativos, linha fora da visão, datas inválidas e termos sem âncora são exercitadas. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 171–328 | A execução local concluiu 16 de 16 testes com sucesso. |
| corrected | 19. A validação promete conferir todo operando estranho, mas aceita “dívida bruta mais dividendos menos caixa e aplicações”. | packages/credit-playbook/src/executors/build-debt-ledger.ts | definitionDisagreement, linhas 217–236 | FOREIGN só reconhece fornecedores, estoques, recebíveis, imobilizado, salários e tributos. “Dividendos” não é detectado; a função retorna concordância e a fórmula ignora o operando adicional, contrariando o método, linha 59. Essa mutação material não está nos testes 278–307. |
| corrected | 20. A pertença de lease/other à visão contratual não é confrontada integralmente com o texto da definição. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 360–368 | counted trata loan, debenture, commercial_note e cpr, mas não lease ou other. Uma linha contratual de arrendamento com âncora pode ser somada mesmo quando a definição não menciona arrendamento nem dívida onerosa residual. Os testes só cobrem ausência da âncora e um exemplo cuja definição menciona arrendamento. |
| corrected | 21. O método admite partes não positivas em linhas contra, mas o executor rejeita saldo contra igual a zero. | packages/credit-playbook/knowledge/procedures/financial/build-debt-ledger.md; packages/credit-playbook/src/executors/build-debt-ledger.ts | método linha 56; executor linhas 70–85 | O método estabelece polaridade não positiva; o executor usa balance.gte(0), exigindo saldo estritamente negativo. O teste cobre apenas saldo positivo. |
| confirmed | 22. Ordem de entrada e fingerprints são determinísticos para a estrutura atual. | packages/credit-playbook/src/executors/build-debt-ledger.ts; packages/credit-playbook/src/executors/build-debt-ledger.test.ts | executor linhas 240–249 e 428–442; teste linhas 373–385 | Vinte permutações de linhas, períodos, views e chaves preservam inputFingerprint, outputFingerprint e o objeto completo. Isso prova as coleções atualmente existentes, não arrays futuros que não sejam canonicalizados. |
| confirmed | 23. O resultado contém exatamente os outputs superiores declarados e usa schema v11. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts; packages/credit-playbook/src/executors/build-debt-ledger.ts | teste linhas 388–390; executor linhas 147–181 e 428–442 | O rótulo do describe ainda diz v10, mas o contrato e o schema emitido são v11. |
| confirmed | 24. Esta revisão é registro por modelo, não aprovação humana. | packages/credit-playbook/src/procedure-contract.ts | linhas 158–168 |  |

## Condições

- Corrigir a validação de definições para rejeitar qualquer operando não representado na fórmula e acrescentar mutações com dividendos, arrendamentos e outros passivos.
- Validar lease/other e toda inclusão contratual contra o texto literal da definição, não apenas contra a presença de viewInclusion.
- Alinhar a regra de saldo zero em linha contra entre método e executor e adicionar o caso-limite.
- Submeter a qualificação jurídica de titulares de CRA como credores econômicos e a eventual inclusão de arrendamentos em “outra dívida onerosa” a especialista.

## Notas do revisor

GPT-5 Codex, com leitura local do corpus, recálculo independente, verificação SHA-256 e execução Vitest.

Os números, fontes, recálculos do caso gold, exceções principais e consistência conferem. O resultado é fail porque a validação de definição e de pertença à visão pode aceitar fórmulas materialmente contraditórias; há ainda divergência explícita no limite zero das linhas contra.
