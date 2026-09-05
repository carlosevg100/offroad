# Revisão independente por IA: método reconcile-covenant-definitions v2026.09.05-v11

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-reconcile-covenant-definitions-2026-09-05-05-13-23, commit ba9fb28. Fingerprint c7ec3863c45ba6b9a6b21578c4b2946de00fd08358fb2110a47cedff48e8e084.

Resultado: **fail**. Evidências: 19 confirmed, 2 unverifiable, 3 corrected, 2 limitation.

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
| confirmed | 1. O manifesto representa integralmente o corpus congelado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries 1–43 | Os 43 arquivos conferem em tamanho e SHA-256. |
| confirmed | 2. A base gold usa dívida bruta consolidada de 5.670.186. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39 | 2.407.895 de empréstimos e financiamentos + 3.262.291 de debêntures = 5.670.186, em R$ mil. |
| confirmed | 3. Derivativos passivos 14.335, ativos 235, caixa 1.430.714 e aplicações 25.095 compõem a visão contratual. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | páginas 11, 20 e 51 | Valores consolidados em 31/05/2026. |
| confirmed | 4. A dívida líquida gold é 4.228.477 em cada uma das quatro escrituras. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39; nota 3, página 20; nota 25, página 51 | Recálculo: 5.670.186 + 14.335 − 235 − 1.430.714 − 25.095 = 4.228.477. |
| confirmed | 5. O pro forma reportado é 4,72x e a próxima medição é 28/02/2027. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 | A fonte também informa medição anual e adimplência em 28/02/2026. |
| confirmed | 6. O EBITDA implícito produzido no gold é 895.863,77. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 | Recálculo próprio: 4.228.477 ÷ 4,72 = 895.863,77118644. É derivação, não valor aberto pela companhia. |
| confirmed | 7. O passivo de arrendamento é 276.768 e fica fora da soma gold. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | balanço, página 12; nota 25, página 51 | 67.399 circulante + 209.369 não circulante = 276.768. |
| confirmed | 8. As 13ª, 14ª e 15ª escrituras têm a definição-base codificada de dívida líquida e EBITDA. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 1.1, páginas 7–8 | A mesma redação aparece na cláusula 1.1, páginas 7–8, das 14ª e 15ª escrituras. |
| confirmed | 9. A 11ª escritura acrescenta EBITDA de adquirida e sellers finance. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3(j), página 35 | A cláusula menciona ambos no cálculo após aquisição ocorrida nos 12 meses anteriores. |
| confirmed | 10. Os degraus da 11ª são 3,50x até 15/04/2025 ou liquidação elegível, e 4,00x após quitação integral. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3(j), páginas 34–35 | Vencimento antecipado preserva o degrau de 3,50x. |
| confirmed | 11. Os degraus da 13ª são 3,50x até o primeiro vencimento relevante e 4,00x após quitação integral dos CRA. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.24.3(VIII), páginas 54–55 | As referências vencem em 16/04/2025 e 29/12/2025. |
| confirmed | 12. A 14ª reproduz os degraus e referências da 13ª. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_14a_emissao.txt | cláusula 7.26.3(VIII), páginas 54–55 |  |
| confirmed | 13. A 15ª referencia o CRA 257, com degraus de 3,50x e 4,00x. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusula 7.26.3(VIII), página 56 | O vencimento contratual indicado é 29/12/2025. |
| unverifiable | 14. A quitação ordinária dos CRA de referência não está demonstrada no corpus. | docs/product/gold-cases/runs/gc01/ai-review-corpus/cra_257_relatorio_mensal_4t25.txt | páginas 2–3; linhas 47–89 da extração | O relatório mostra vencimento em 29/12/2025 e saldo devedor até novembro, mas não prova a quitação. Assim, quatro condições e nenhum limite resolvido no gold estão corretos. |
| unverifiable | 15. A abertura do EBITDA de covenant não consta do ITR. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 | A fonte informa apenas o índice 4,72x; a comparabilidade condicionada e a ausência de headroom conferem. |
| confirmed | 16. As linhas candidatas de aquisição são 27.119 e 51.290, sem classificação automática como sellers finance. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 16, página 41 | O executor as mantém em uncovered_terms e não as soma ao numerador. |
| confirmed | 17. O executor implementa insufficient_evidence, uncovered_terms, bloqueio da base vazia e não preenche valores ausentes. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 289, 338–360, 414–417, 462–480 e 519–522 | Os testes correspondentes estão nas linhas 92–132, 334–353 e 379–410 do arquivo de testes. |
| confirmed | 18. Os recálculos adversariais numéricos do teste conferem. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 134–179 e 235–245 | Com arrendamento: 4.228.477 + 276.768 = 4.505.245; sem derivativos: 5.670.186 − 1.430.714 − 25.095 = 4.214.377; obrigação de 100.000: 4.328.477; headroom máximo: 4,00 − 4,72 = −0,72 e −0,72 ÷ 4,00 = −0,18; mínimo: 4,72 − 6,00 = −1,28. |
| corrected | 19. A instrução afirma que as páginas das duas definições devem ser distintas. | packages/credit-playbook/knowledge/procedures/financial/reconcile-covenant-definitions.md | linha 54 | Na 11ª emissão, Dívida Líquida e EBITDA estão ambas na página 35 da cláusula 4.22.3(j). O próprio gold usa corretamente a mesma página; a instrução deve exigir âncoras separadas, não páginas necessariamente distintas. |
| corrected | 20. Texto literal e componentes estruturados em desacordo devem ser recusados. | packages/credit-playbook/knowledge/procedures/financial/reconcile-covenant-definitions.md | linhas 56 e 63–65 | O executor, linhas 153–156 e 188–193, só verifica se cada componente estruturado aparece no texto; não detecta componentes presentes no texto e omitidos da lista nem a polaridade ativo/passivo. O teste das linhas 168–179 remove derivativos apenas da lista, conserva o texto literal que os inclui e aceita um netDebtByDefinition de 4.214.377. Esse número não é, portanto, pela definição literal fornecida. |
| corrected | 21. Unidade única e data-base devem abranger toda a base monetária. | packages/credit-playbook/knowledge/procedures/financial/reconcile-covenant-definitions.md | linhas 54, 56, 85 e 108 | O executor valida unidade/data de componentValues e EBITDA nas linhas 169–178, mas exclui candidateObligations dessa validação. Uma candidata de outra data ou escala é aceita e publicada em uncovered_terms. Essa mutação não é coberta pelos testes. |
| limitation | 22. A classificação do arrendamento como outra dívida onerosa não pode ser decidida pelo corpus. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definição de Dívida Líquida, página 7 | A escritura contém o residual, enquanto o ITR registra arrendamento separadamente na página 51. O executor corretamente condiciona e não soma. |
| limitation | 23. O lado econômico definitivo de sellers finance requer interpretação especializada. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3(j), página 35 | A cláusula manda considerá-lo no cálculo, mas não oferece fórmula explícita. O tratamento como obrigação do numerador permanece condição jurídica, como prevê o método. |
| confirmed | 24. A suíte exercita as mutações declaradas e passa integralmente. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 72–426; execução local Vitest | 26 de 26 testes passaram. Permanecem descobertas as mutações descritas nos claims 20 e 21. |
| confirmed | 25. Fingerprints e cálculos são invariantes nas vinte permutações estipuladas. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 355–373 | O executor canonicaliza instrumentos, componentes, ajustes, referências, fatos e componentes reportados nas linhas 261–279. O teste é evidência empírica dessas vinte permutações, não prova exaustiva para todo input possível. |
| confirmed | 26. Esta revisão é registro por modelo, não aprovação humana. | packages/credit-playbook/src/procedure-contract.ts | linhas 158–167 e 220–224 | O contrato separa ai_independent_review da aprovação exigida para produção. |

## Condições

- Corrigir a validação bidirecional entre definição literal e componentes estruturados, incluindo polaridade de derivativos, e adicionar mutações que tentem omitir componentes presentes no texto (método linhas 56 e 64; executor linhas 153–156 e 188–193).
- Trocar “páginas distintas” por “âncoras separadas, ainda que na mesma página” (método linha 54; 11ª escritura, cláusula 4.22.3(j), página 35).
- Validar unit e asOf de candidateObligations contra a base e cobrir escala/data adversariais (método linhas 85 e 108; executor linhas 127 e 169–178).
- Manter como condições a prova da quitação ordinária dos CRA, a abertura do EBITDA, a classificação jurídica dos arrendamentos e o lado econômico de sellers finance (gabarito linhas 7–9, 148–155 e 376–388).

## Notas do revisor

Codex (GPT-5), com leitura local, recálculo em Node e execução via Vitest.

Os números e o comportamento do caso gold conferem, mas há duas divergências materiais de definição/âncora e uma falha de integridade de unidade/período em entradas candidatas. Pelas regras solicitadas, qualquer corrected material determina fail.
