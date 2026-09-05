# Revisão independente por IA: método reconcile-covenant-definitions v2026.09.05-v4

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-reconcile-covenant-definitions-2026-09-05-03-01-47, commit 8bf52d7. Fingerprint 0187a563a1d1d7d32a6110f6502bf899b5ba7d55b23ced835ad46b202e844026.

Resultado: **fail**. Evidências: 19 confirmed, 7 corrected, 1 unverifiable, 3 limitation.

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
| confirmed | 1. O corpus utilizado corresponde ao manifesto congelado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries, linhas 5-220 | Bytes e SHA-256 de todos os arquivos conferem. |
| confirmed | 2. Dívida bruta consolidada de 5.670.186 em 31/05/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p.39, nota 15; linhas 2035-2074 |  |
| confirmed | 3. Caixa de 1.430.714 e aplicações financeiras de 25.095. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF pp.11 e 20, nota 3; linhas 550-590 e 971-985 |  |
| confirmed | 4. Derivativos passivos de 14.335 e ativos de 235. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p.51, nota 25; linhas 2764-2786 |  |
| confirmed | 5. Passivo de arrendamento de 276.768, composto por 67.399 circulante e 209.369 não circulante. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p.12; linhas 591-620 | 67.399 + 209.369 = 276.768. |
| confirmed | 6. Dívida líquida gold de 4.228.477. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF pp.11, 20, 39, 40 e 51 | Recálculo: 5.670.186 + 14.335 − 235 − 1.430.714 − 25.095 = 4.228.477. |
| confirmed | 7. Índice pro forma de 4,72x, limite informado de 4,00x e próxima medição em 28/02/2027. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p.40, nota 15; linhas 2111-2124 |  |
| confirmed | 8. EBITDA implícito de 895.863,77. | docs/product/gold-cases/gc01-gabarito-rascunho.md | §5, linhas 127 e 140-142 | Recálculo: 4.228.477 ÷ 4,72 = 895.863,7711864407; é derivação, não valor aberto pela companhia. |
| confirmed | 9. A 11ª emissão traz limites de 3,50x e 4,00x, definição de dívida líquida, EBITDA adquirido e sellers finance. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3(j), PDF pp.34-35; linhas 1293-1337 | Degraus começam na p.34; ambas as definições e os ajustes estão na p.35. |
| confirmed | 10. Na 13ª emissão, dívida líquida está na p.7, EBITDA na p.8 e os degraus nas pp.54-55. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 1.1, PDF pp.7-8; cláusula 7.24.3(VIII), pp.54-55 | Referências: 5ª emissão, 16/04/2025; 257ª emissão, 29/12/2025. |
| confirmed | 11. Na 14ª emissão, dívida líquida está na p.7, EBITDA na p.8 e os dois limites começam na p.54. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_14a_emissao.txt | cláusula 1.1, PDF pp.7-8; cláusula 7.26.3(VIII), pp.54-55 | Referências: 5ª emissão, 16/04/2025; 257ª emissão, 29/12/2025. |
| confirmed | 12. Na 15ª emissão, dívida líquida está na p.7, EBITDA na p.8 e os dois limites na p.56. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusula 1.1, PDF pp.7-8; cláusula 7.26.3, p.56 | Referência: 257ª emissão, 29/12/2025. |
| corrected | 13. O método afirma genericamente que a definição de EBITDA do gold está na p.8. | packages/credit-playbook/knowledge/procedures/financial/reconcile-covenant-definitions.md | Gold, linha 94 | Na 11ª emissão, EBITDA está na p.35, não na p.8. O fixture do executor usa corretamente p.35. |
| unverifiable | 14. A quitação ordinária dos CRA de referência permanece sem comprovação. | docs/product/gold-cases/runs/gc01/ai-review-corpus/cra_257_relatorio_mensal_4t25.txt | Características e Saldo Devedor, linhas 47-102 | A fonte confirma vencimento em 29/12/2025 e saldo até novembro, mas não comprova a quitação; `insufficient_evidence` é o estado correto. |
| confirmed | 15. No gold, os degraus de 3,50x terminam, os de 4,00x ficam não provados, há quatro condições e nenhum headroom. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 88-118 | A execução local passou: 15/15 testes. O resultado gold permanece `conditioned`. |
| corrected | 16. O executor atribui valor zero ao sellers finance ausente. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 319-348 | A escritura não fornece valor e o gabarito o classifica como ausente, mas `numeratorObligations` recebe "0". Isso preenche numericamente uma lacuna; deveria permanecer nulo/desconhecido, embora a comparabilidade continue condicionada. |
| limitation | 17. A classificação de sellers finance como obrigação do numerador. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3(j), PDF p.35; linhas 1333-1337 | O texto manda considerá-lo no cálculo, mas não explicita algebricamente o lado do índice. A classificação final exige revisão jurídica especializada. |
| confirmed | 18. O executor resolve corretamente direção máxima e mínima no headroom. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 130-148 e 228-238 | Recálculos: 4,00 − 4,72 = −0,72; −0,72 ÷ 4,00 = −18%; para mínimo, 4,72 − 6,00 = −1,28. |
| confirmed | 19. As mutações numéricas de arrendamento, retirada de derivativos e obrigação de 100.000 conferem. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 143-173 | 4.228.477 + 276.768 = 4.505.245; 5.670.186 − 1.430.714 − 25.095 = 4.214.377; 4.228.477 + 100.000 = 4.328.477. |
| corrected | 20. Com duas referências, o degrau `until` respeita “o que ocorrer primeiro”. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.24.3(VIII)(a), PDF pp.54-55; linhas 2658-2675 | Mutação em 01/06/2025: a 5ª já venceu em 16/04/2025 e a 257ª vence em dezembro. O executor manteve 3,50x como `applies`, pois exige que nenhuma referência esteja viva; a cláusula encerra o degrau no primeiro vencimento/liquidação. |
| corrected | 21. Uma troca uniforme da escala de milhares para milhões é resistida. | docs/product/gold-cases/gc01-gabarito-rascunho.md | §10, linhas 215-219 | O executor aceitou todos os operandos relabelados de `BRL thousand` para `BRL million`, produziu os mesmos valores e o mesmo output fingerprint. A unidade não aparece na dívida líquida, índice ou trace. |
| corrected | 22. O EBITDA implícito gold é executado pelo `financial-core` antes de receber o identificador `financial.net_leverage`. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 401-405 | A divisão é feita diretamente com Decimal e registrada como `financial.net_leverage`; não há chamada ao `financial-core` nesse ramo, contrariando a aceitação do método nas linhas 97-98. |
| confirmed | 23. Base vazia bloqueia; relatório fiduciário isolado conserva limite e apuração sem headroom; valores ausentes não geram índice. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 242-264, 326-354 e 436-446 | Os testes correspondentes estão nas linhas 240-253. |
| limitation | 24. O contrato fornecido define `uncoveredTerms`. | packages/credit-playbook/src/procedure-contract.ts | linhas 41-60, 110-177 e 304-316 | Esse campo não existe no contrato, método ou executor fornecidos. Lacunas aparecem em `comparabilityReasons`, `unprovenConditions`, `legalConditions` e `blockReasons`; não é possível verificar uma obrigação de `uncoveredTerms` sem contrato adicional. |
| corrected | 25. A saída do executor satisfaz os nomes obrigatórios declarados pelo método. | packages/credit-playbook/knowledge/procedures/financial/reconcile-covenant-definitions.md | Outputs, linhas 78-82 | O método declara `unproven_conditions` e `legal_conditions`; o executor emite `unprovenConditions` e `legalConditions`. O contrato preserva os IDs e proíbe propriedades adicionais em `procedure-contract.ts`, linhas 304-316. |
| confirmed | 26. As mutações declaradas são amplamente cobertas pelos testes. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 150-253 | Cobertos: abertura inconsistente ou em data errada, EBITDA zero, unidade mista, arrendamento, derivativos, ajustes da 11ª, índice antigo/futuro, componente fora da data, liquidação sem data, duplicidades de fato/instrumento, frequências, vencimento antecipado, relatório isolado e base vazia. |
| limitation | 27. Todas as mutações relevantes têm teste de regressão. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 150-273 | Não há teste para escala uniformemente relabelada, intervalo entre vencimentos de múltiplas referências, ajuste duplicado, cobertura duplicada de componente, mês diferente de 12 ou data de liquidação futura. Algumas duplicidades e `months: 12` são rejeitadas pelo schema, mas isso não é provado pelo arquivo de testes. |
| confirmed | 28. O executor é invariável às vinte permutações exercitadas. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 255-273 | A execução local confirmou fingerprints e traces iguais nas vinte permutações. |
| confirmed | 29. O output fingerprint inclui os cálculos do trace. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linha 446 | O código inclui `calculations`; o teste de permutações, isoladamente, não provaria essa inclusão. |
| corrected | 30. O output fingerprint distingue resultados econômicos em escalas diferentes. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | tipos de saída, linhas 166-194; fingerprint, linha 446 | Na mutação milhares versus milhões, os input fingerprints diferiram, mas os output fingerprints foram idênticos porque unidade não integra saída nem cálculos. |

## Condições

- Corrigir a semântica de múltiplas referências para encerrar o degrau `until` no primeiro vencimento/liquidação, conforme escritura_13a_emissao.txt, cláusula 7.24.3(VIII)(a), pp.54-55.
- Representar sellers finance sem valor como desconhecido, nunca como zero; reconcile-covenant-definitions.ts, linhas 319-348.
- Alinhar a saída aos nomes obrigatórios do método ou fornecer e validar um contrato concreto distinto; método, linhas 78-82, e procedure-contract.ts, linhas 304-316.
- Carregar unidade na saída, trace e fingerprint e acrescentar regressão para troca uniforme de escala; gabarito §10, linhas 215-219.
- Executar o EBITDA implícito no financial-core ou usar identificação de cálculo que não alegue essa execução; método, linhas 97-98, e executor, linhas 401-405.
- Submeter a classificação algébrica de sellers finance à revisão jurídica especializada; escritura_11a_emissao.txt, cláusula 4.22.3(j), p.35.
- Definir, se necessário, o significado contratual de `uncoveredTerms`; ele não existe em procedure-contract.ts, linhas 41-177.

## Notas do revisor

OpenAI Codex (GPT-5), revisão por modelo com shell local e Vitest, sem internet.

A aritmética principal e os anchors do gold conferem, mas há erros materiais de degrau, preenchimento de valor ausente, contrato de saída, escala/fingerprint e proveniência do cálculo implícito.
