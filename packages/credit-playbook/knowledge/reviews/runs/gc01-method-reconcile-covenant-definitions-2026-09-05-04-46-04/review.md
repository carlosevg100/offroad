# Revisão independente por IA: método reconcile-covenant-definitions v2026.09.05-v10

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-reconcile-covenant-definitions-2026-09-05-04-46-04, commit a10b3cc. Fingerprint a1fdcb201e717c711c136373354e1cfa974d5f19cdf6ec63422a9601dec935ba.

Resultado: **fail**. Evidências: 26 confirmed, 5 corrected, 1 unverifiable, 2 limitation.

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
| confirmed | 1.1 — O corpus gold está íntegro. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries, linhas 5-220 | Os 43 arquivos conferem em tamanho e SHA-256. |
| confirmed | 1.2 — A dívida bruta em 31/05/2026 é 5.670.186 R$ mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p.39 |  |
| confirmed | 1.3 — Caixa e equivalentes são 1.430.714 e aplicações financeiras são 25.095 R$ mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | balanço, p.11; nota 3, p.20 |  |
| confirmed | 1.4 — Derivativos passivos são 14.335 e ativos são 235 R$ mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 25, p.51 |  |
| confirmed | 1.5 — O passivo de arrendamento consolidado é 276.768 R$ mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | balanço, p.12; nota 25, p.51 | 67.399 circulante + 209.369 não circulante = 276.768. |
| confirmed | 1.6 — O índice pro forma é 4,72x em 31/05/2026 e a próxima medição é 28/02/2027. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p.40 |  |
| corrected | 1.7 — O teste gold ancora 27.119 e 51.290 R$ mil da nota 16 na p.47. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 16, p.41 | Os valores conferem, mas estão na p.41, não na p.47 usada nas linhas 398-399 do teste. |
| confirmed | 1.8 — A 11ª emissão contém dívida líquida, EBITDA, 3,50x, 4,00x, EBITDA adquirido e sellers finance. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3(j), pp.34-35 | Degraus na p.34; definições e ajustes na p.35, como no fixture. |
| confirmed | 1.9 — A 13ª emissão usa as definições das pp.7-8 e degraus nas pp.54-55, referindo 16/04/2025 e 29/12/2025. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 1.1, pp.7-8; cláusula 7.24.3(VIII), pp.54-55 |  |
| confirmed | 1.10 — A 14ª emissão usa as definições das pp.7-8 e inicia ambos os degraus na p.54. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_14a_emissao.txt | cláusula 1.1, pp.7-8; cláusula 7.26.3(VIII), p.54 |  |
| confirmed | 1.11 — A 15ª emissão usa as definições das pp.7-8 e os dois degraus na p.56. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusula 1.1, pp.7-8; cláusula 7.26.3(VIII), p.56 |  |
| unverifiable | 1.12 — A quitação ordinária dos CRA de referência ocorreu. | docs/product/gold-cases/runs/gc01/ai-review-corpus/cra_257_relatorio_mensal_4t25.txt | Características das Séries e Saldo Devedor, pp.2-3 | O corpus prova vencimento em 29/12/2025 e saldo até novembro, mas não prova quitação ordinária. |
| confirmed | 2.1 — A dívida líquida gold é 4.228.477 R$ mil. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 124-140 | 5.670.186 + 14.335 − 235 − 1.430.714 − 25.095 = 4.228.477. |
| confirmed | 2.2 — O EBITDA implícito gold começa por 895.863,77 R$ mil. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 73-86 | 4.228.477 ÷ 4,72 = 895.863,7711864407. |
| confirmed | 2.3 — As mutações numéricas de dívida líquida conferem. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 134-179 e 321-332 | Com arrendamento: 4.228.477 + 276.768 = 4.505.245; sem derivativos: 5.670.186 − 1.430.714 − 25.095 = 4.214.377; com obrigação de 100.000: 4.328.477. |
| confirmed | 2.4 — Os headrooms hipotéticos conferem aritmeticamente. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 134-153 e 235-245 | Máximo: 4,00 − 4,72 = −0,72x e −0,72/4,00 = −18%; mínimo: 4,72 − 6,00 = −1,28x. |
| confirmed | 2.5 — O caso gold não produz percentual nem headroom. | packages/credit-playbook/knowledge/procedures/financial/reconcile-covenant-definitions.md | sequência operacional, linha 56; Gold, linha 100 | Limite, residual, EBITDA e condições jurídicas permanecem condicionados; o executor retorna headroom nulo. |
| confirmed | 3.1 — A definição-base de dívida líquida codificada corresponde às quatro escrituras. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.1, linhas 366-388 | Inclui empréstimos, financiamentos, debêntures, derivativos passivos e outra dívida onerosa, menos caixa, aplicações e derivativos ativos, no consolidado. |
| confirmed | 3.2 — Vencimento encerra o degrau 3,50x, enquanto o degrau 4,00x requer quitação integral ordinária. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 303-353 | No gold, os quatro instrumentos ficam com estados ended/unproven e quatro condições escritas. |
| limitation | 3.3 — Arrendamento integra necessariamente “qualquer outra dívida onerosa”. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definição de Dívida Líquida, p.7 | A escritura usa expressão residual e o ITR separa arrendamento; a classificação exige revisão jurídica. |
| limitation | 3.4 — Sellers finance é definitivamente uma obrigação do numerador. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3(j), p.35 | A escritura manda considerá-lo no cálculo, mas não explicita algebricamente o lado; o executor conserva condição jurídica e não emite headroom. |
| corrected | 3.5 — O executor compara a definição literal reportada, e não apenas os componentes estruturados informados pelo chamador. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | schema nas linhas 129-139; comparação nas linhas 441-470 | reported.definition nunca é lido. Mutação local com texto “somente caixa e equivalentes”, componentes artificialmente iguais e abertura consistente retornou comparable e headroom +2,00x. Isso viola a mutação declarada different-net-debt-definition-not-comparable. |
| confirmed | 4.1 — Sellers finance sem valor permanece nulo e aparece em uncovered_terms como insufficient_evidence. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 364-405 e 510-513 | Nada é somado; numeratorObligations fica nulo. |
| confirmed | 4.2 — Base vazia produz bloqueio estruturado e preserva a unidade. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 334-339 |  |
| confirmed | 4.3 — Relatório fiduciário sem escritura conserva limite e apuração, mas nunca produz headroom. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 289-300 |  |
| confirmed | 4.4 — Residual não enumerado é assumido zero apenas de forma declarada e condicionada. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 357-405 | A saída marca residualAssumedZero e impede comparabilidade plena. |
| corrected | 4.5 — Índice reportado fora da data-base não é usado para derivar EBITDA implícito. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 441-470 | O executor marca not_comparable na linha 446, mas ainda executa calculateImpliedEbitda nas linhas 464-468. Mutação local com índice antigo derivou EBITDA 50 a partir de dívida 100 e índice 2. |
| confirmed | 5.1 — As mutações de arrendamento, derivativos, abertura inconsistente, EBITDA nulo, datas, duplicidades, periodicidade, aceleração e obrigação do numerador têm regressão. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 156-332 e 379-411 |  |
| corrected | 5.2 — A suíte cobre alteração isolada do texto reported.definition. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 168-180 e 321-332 | Os testes alteram componentes/definições dos instrumentos, mas não o texto literal da definição reportada mantendo os componentes iguais. |
| corrected | 5.3 — A suíte impede derivação de EBITDA a partir de índice reportado antigo. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 198-207 | O teste exige apenas not_comparable; não verifica index nulo nem ausência de financial.implied_ebitda. |
| confirmed | 6.1 — A canonicalização e os fingerprints são determinísticos para as permutações declaradas. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 228-270 e 500-516 | Instrumentos, fatos, linhas, ajustes, referências e componentes reportados são ordenados antes do SHA-256; o fingerprint de saída inclui cálculos e inputFingerprint. |
| confirmed | 6.2 — Os testes provam consistência sob vinte permutações. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 355-373 | As vinte execuções exigem igualdade dos dois fingerprints e do trace. |
| confirmed | 6.3 — O executor satisfaz os campos superiores declarados pelo contrato. | packages/credit-playbook/src/procedure-contract.ts | procedureOutputFieldSchema, linhas 52-60; outputJsonSchema, linhas 304-316 | O teste de contrato nas linhas 375-377 retorna lista vazia. |
| confirmed | 6.4 — A suíte fornecida executa sem falhas. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | arquivo completo, linhas 1-412 | Execução local: 30 arquivos e 268 testes aprovados; isso não cobre as duas mutações ausentes identificadas acima. |

## Condições

- Corrigir as âncoras da nota 16 de p.47 para p.41 no teste gold e na saída correspondente.
- Validar e confrontar reported.definition com os componentes reportados antes de declarar comparabilidade ou headroom.
- Não derivar EBITDA implícito quando data, definição, componentes ou perímetro do índice reportado forem incompatíveis.
- Obter prova da quitação ordinária dos CRA de referência antes de resolver 4,00x.
- Manter revisão jurídica especializada para arrendamentos como dívida onerosa e para o lado econômico de sellers finance.

## Notas do revisor

Codex baseado em GPT-5, usando leitura e execução local sem internet.

Falha material por proveniência incorreta e por duas vias adversariais que aceitam ou derivam números de definições/datas inelegíveis. A aritmética gold, os degraus conservadores, as exceções e a consistência sob as vinte permutações conferem.
