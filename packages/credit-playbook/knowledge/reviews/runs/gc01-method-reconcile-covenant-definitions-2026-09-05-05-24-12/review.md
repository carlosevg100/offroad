# Revisão independente por IA: método reconcile-covenant-definitions v2026.09.05-v12

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-reconcile-covenant-definitions-2026-09-05-05-24-12, commit be91e40. Fingerprint cc2668c2f21a5247e732b862af65a7e523c1df4521f02b012b9cc46d8d4c154e.

Resultado: **fail**. Evidências: 24 confirmed, 5 limitation, 1 unverifiable, 3 corrected.

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
| confirmed | 1. Os 43 arquivos do corpus mantêm os tamanhos e SHA-256 declarados. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries, linhas 5-220 | Recálculo local: 43/43 sem divergência. |
| confirmed | 2. Dívida bruta consolidada: 5.670.186 BRL mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, páginas 39-40 |  |
| confirmed | 3. Caixa e equivalentes: 1.430.714; aplicações financeiras: 25.095 BRL mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | balanço, página 11; nota 3, página 20 |  |
| confirmed | 4. Derivativos passivos: 14.335; derivativos ativos: 235 BRL mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 25, página 51 |  |
| confirmed | 5. Passivo de arrendamento consolidado: 276.768 BRL mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 12, página 34; nota 25, página 51 | 67.399 circulante + 209.369 não circulante = 276.768. |
| confirmed | 6. Candidatos relacionados à aquisição: 27.119 e 51.290 BRL mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 16, página 41 | São custo de aquisição e passivo contingente; a fonte não os classifica como sellers finance contratual. |
| confirmed | 7. Dívida líquida calculada: 4.228.477 BRL mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | notas 15 e 25, páginas 39-40 e 51 | 5.670.186 + 14.335 - 235 - 1.430.714 - 25.095 = 4.228.477. |
| confirmed | 8. Índice pro forma reportado: 4,72x em 31/05/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 |  |
| confirmed | 9. EBITDA implícito: 895.863,77 BRL mil. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 138-155 | 4.228.477 / 4,72 = 895.863,7711864407; o executor o marca como derivado. |
| confirmed | 10. Definições-base e âncoras das 13ª, 14ª e 15ª emissões. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 1.1, Dívida Líquida p. 7 e EBITDA p. 8 | As escrituras da 14ª e 15ª repetem a definição nas mesmas páginas e cláusula. |
| limitation | 11. Definições e ajustes da 11ª emissão. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3(j), página 35 | A escritura manda considerar EBITDA da adquirida e sellers finance, mas não explicita inequivocamente o lado algébrico deste último; tratá-lo como obrigação do numerador exige revisão jurídica. |
| confirmed | 12. Degraus 3,50x e 4,00x e suas páginas nas quatro escrituras. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.1, linhas 368-388 | 11ª p. 34; 13ª p. 54-55; 14ª p. 54; 15ª p. 56. |
| confirmed | 13. O degrau 3,50x termina no primeiro vencimento ou liquidação ordinária aplicável; o degrau 4,00x depende da quitação integral, exceto vencimento antecipado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.24.3(VIII)(a)-(b), páginas 54-55 | A mesma estrutura consta da 11ª, 14ª e 15ª nas cláusulas citadas pelo gabarito. |
| confirmed | 14. Vencimentos de referência: 15/04/2025, 16/04/2025 e 29/12/2025. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3(j)(a), página 34 | 16/04/2025 e 29/12/2025 constam das cláusulas 7.24.3(VIII) e 7.26.3(VIII) das demais escrituras. |
| unverifiable | 15. A quitação ordinária dos CRA de referência não está comprovada no corpus. | docs/product/gold-cases/runs/gc01/ai-review-corpus/cra_257_relatorio_mensal_4t25.txt | páginas 2-3, vencimento em 29/12/2025 e saldo até novembro de 2025 | A fonte comprova vencimento e saldo anterior, não a quitação; ausência de documento posterior não prova o evento. |
| confirmed | 16. O gold gera quatro condições não provadas, uma por escritura, e nenhum limite aplicável resolvido. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 92-108 | O comportamento corresponde à condição registrada no gabarito, seção 13.1. |
| confirmed | 17. Próxima medição: 28/02/2027. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 | A fonte declara medição anual e a próxima data expressamente. |
| confirmed | 18. Comparar 4,72x diretamente contra 3,50x não é suportado; 4,00x permanece condicionado. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 11.2, linhas 265-282; seção 13.1, linhas 376-388 | O executor não emite headroom no gold. |
| confirmed | 19. Headroom aritmético contra 4,00x seria -0,72x, ou -18%, mas não deve ser emitido no estado condicionado. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 142-155; seção 13.1, linhas 384-388 | 4,00 - 4,72 = -0,72; -0,72 / 4,00 = -0,18. |
| confirmed | 20. Residual não enumerado é assumido zero de forma explícita e mantém a comparação condicionada. | packages/credit-playbook/knowledge/procedures/financial/reconcile-covenant-definitions.md | linha 56; gold nas linhas 104-105 | O executor não apresenta a suposição como fato nem libera headroom. |
| limitation | 21. Arrendamento permanece condição jurídica e não é somado silenciosamente. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 148-155; linha 486 | Determinar se arrendamento integra “outra dívida onerosa” exige especialista. |
| confirmed | 22. Obrigações sem valor classificado e candidatos ficam em uncovered_terms como insufficient_evidence, sem inclusão no numerador. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 395-410 | Os três registros esperados são dois candidatos e a obrigação sellers-finance não classificada. |
| confirmed | 23. Base sem instrumento bloqueia; relatório fiduciário sem escritura não gera headroom; componentes ou EBITDA insuficientes não são inventados. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 247-253, 293-309 e 334-353 |  |
| corrected | 24. A mutação que retira derivativos da lista estruturada não é realmente resistida. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 168-179 | O teste mantém o texto literal citando derivativos, remove apenas os componentes estruturados e aceita 4.214.377. A escritura continua exigindo derivativos; o correto é rejeitar a divergência texto/lista, salvo alteração simultânea do literal. |
| corrected | 25. O validador das escrituras verifica somente se cada componente estruturado aparece no texto, não se cada componente textual aparece na lista. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 149-161 | A validação bidirecional existe para o índice reportado nas linhas 191-210, mas não para netDebtDefinition da escritura; isso permite a falha material do item 24. |
| corrected | 26. O veto de headroom por legal_conditions diverge entre método e executor. | packages/credit-playbook/knowledge/procedures/financial/reconcile-covenant-definitions.md | output legal_conditions, linha 91 | O método diz que, enquanto houver condição jurídica consolidada, não há headroom; o executor limita o veto ao covenant local (linha 499), e o teste das linhas 134-146 espera headroom na 13ª enquanto a 11ª ainda tem sellers finance aberto. |
| limitation | 27. A mutação de escala uniforme não prova resistência a uma unidade falsamente extraída da fonte. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 256-266 | O teste apenas confirma mudança de unidade e fingerprint; o executor aceita relabelar todos os valores de BRL mil para BRL milhões sem confrontar a unidade com a âncora documental. |
| confirmed | 28. As demais mutações declaradas são exercitadas e os 27 testes passam. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 72-441 | Execução local do arquivo: 27/27 testes aprovados. |
| confirmed | 29. Ordem de instrumentos, fatos, linhas, ajustes, referências e componentes reportados é canonicalizada. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | função canonical, linhas 280-297 |  |
| confirmed | 30. Vinte permutações preservam cálculos e fingerprints de entrada e saída. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 355-373 | Prova as coleções permutadas pelo teste, não todas as coleções possíveis. |
| limitation | 31. A consistência de candidateObligations e incorporatesAdjustments não é provada pelo teste de vinte permutações. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 355-373 | O código as ordena nas linhas 283 e 294, mas o teste de consistência não as permuta. |
| confirmed | 32. O contrato independente exige revisão de fontes, recálculo, definições, exceções, adversarial e consistência, sem aprovação humana. | packages/credit-playbook/src/procedure-contract.ts | linhas 152-177 |  |
| limitation | 33. O teste contratual prova somente a paridade das chaves superiores declaradas. | packages/credit-playbook/src/executors/contract.ts | linhas 5-32 | Não valida tipos ou invariantes internos de covenants, trace, uncovered_terms e legal_conditions. |

## Condições

- Rejeitar divergências bidirecionais entre o texto literal da escritura e netDebtComponents.
- Resolver explicitamente se o veto de headroom por legal_conditions é global ou por instrumento e alinhar método, executor e testes.
- Obter revisão jurídica sobre arrendamentos dentro de “outra dívida onerosa”.
- Obter revisão jurídica e classificação datada do sellers finance da 11ª emissão.
- Obter prova documental da quitação ordinária dos CRA de referência.
- Fortalecer o teste de escala contra unidade incompatível com a fonte e ampliar as permutações às demais coleções ordenáveis.

## Notas do revisor

Codex (GPT-5), usando somente inspeção local, terminal, Vitest e aritmética independente; sem internet.

Os números e o tratamento condicionado do gold conferem. O fail decorre de duas divergências materiais: lista estruturada capaz de contrariar a escritura e contrato inconsistente para o veto de headroom.
