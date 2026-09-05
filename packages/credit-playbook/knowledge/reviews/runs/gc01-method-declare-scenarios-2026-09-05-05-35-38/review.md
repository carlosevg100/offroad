# Revisão independente por IA: método declare-scenarios v2026.09.05-v5

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-declare-scenarios-2026-09-05-05-35-38, commit f1c3864. Fingerprint e458e31bb8f4608156984e30158feb5c31bea44201560c08e992fb6d6e178029.

Resultado: **fail**. Evidências: 20 confirmed, 3 unverifiable, 4 corrected, 4 limitation.

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
| confirmed | 1. O manifesto congelado identifica corretamente o corpus. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries, linhas 5-224 | Os SHA-256 dos arquivos foram recalculados e coincidem com o manifesto. |
| confirmed | 2. A unidade do caso é R$ mil, consolidado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 39, nota 15 |  |
| confirmed | 3. Dívida bruta de 5.670.186 e saldo anterior de 4.988.383. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 39, nota 15 | Média recalculada: (5.670.186 + 4.988.383) / 2 = 5.329.284,5. |
| confirmed | 4. Caixa de 1.430.714, aplicações de 25.095, derivativo ativo de 235 e passivo de 14.335. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | páginas 20 e 51, notas 3 e 25 | Caixa dedutível recalculado: 1.430.714 + 25.095 = 1.455.809. |
| confirmed | 5. Dívida líquida contratual de 4.228.477. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | páginas 39-40, nota 15; página 51, nota 25 | 5.670.186 + 14.335 - 235 - 1.430.714 - 25.095 = 4.228.477. |
| confirmed | 6. Principais de 1.229.828 em 2026/27 e 776.868 em 2027/28. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 40, nota 15, cronograma de amortizações |  |
| confirmed | 7. EBITDA LTM implícito de 895.864 e alavancagem aproximada de 4,72x. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 124-155 | 4.228.477 / 4,72 = 895.863,771..., arredondado a 895.864; 4.228.477 / 895.864 = 4,71999879x, exibido corretamente como 4,72x. |
| confirmed | 8. Limite de 4,00x condicionado e diferença aritmética de -0,72x, sem headroom definitivo. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.24.3(VIII), páginas 54-55 | 4,00 - 4,72 = -0,72x; a escritura condiciona o degrau à quitação dos CRA de referência. |
| confirmed | 9. Choque adverso produz delta de juros de 106.585,69. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 37 e 92-99 | Condicional aos inputs do teste: 5.329.284,5 × 0,02 = 106.585,69. Juros-base = 664.028,8487 e estressados = 770.614,5387. |
| unverifiable | 10. A taxa-base de 12,46% e o choque de 2% têm fonte gold verificável. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 14-20, 37 e 47 | `gc02-gabarito-rascunho.md` e `reference-data.ts` não pertencem ao manifesto gc01 fornecido. |
| confirmed | 11. No adverso, EBITDA usado é 761.484,4 e alavancagem é 5,55x. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 38-39 e 92-102 | 895.864 × 0,85 = 761.484,4; 4.228.477 / 761.484,4 = 5,55293976x, arredondado a 5,55x; diferença condicionada contra 4,00x = -1,55x. |
| unverifiable | 12. CFADS de 200.000 por período, haircuts de 10% e 15% e rolagem de 100% têm origem verificável no corpus gold. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 35-40 | São declarações de usuário/benchmark em arquivos sintéticos ausentes do manifesto real; podem ser premissas declaradas, mas não fatos confirmados do caso. |
| confirmed | 13. Liquidez do cenário base com rolagem integral. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 83-89 e 103-106 | 2026/27: cobertura 2,34637445x e caixa final 1.655.809. 2027/28: cobertura 3,38883440x e caixa final 1.855.809. Déficits zero; principal rolado no segundo período = 776.868. |
| confirmed | 14. Liquidez adversa separa haircut de CFADS do haircut de EBITDA. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 315-340 | CFADS usado = 200.000 × 0,90 = 180.000. Coberturas recalculadas: 2,33011202x e 3,33734560x; caixas finais 1.635.809 e 1.815.809. |
| confirmed | 15. O cenário sem rolagem termina com déficit de 150.887. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 107-112 | 1.455.809 + 200.000 - 1.229.828 = 425.981; 425.981 + 200.000 - 776.868 = -150.887. Coberturas: 1,34637445x e 0,80577524x. |
| confirmed | 16. A definição de dívida líquida implementada corresponde à escritura. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definição de Dívida Líquida, página 7 | Inclui dívida e derivativos passivos e deduz caixa, aplicações e derivativos ativos, em base consolidada. |
| confirmed | 17. A comparabilidade do EBITDA é corretamente condicionada por instrumento. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3, páginas 34-35 | A 11ª acrescenta EBITDA de adquirida e sellers finance; a abertura necessária não consta do ITR. |
| confirmed | 18. Headroom só é calculado contra limite resolvido, degrau aplicável e EBITDA comparável. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 265-305 | O caso gold retorna `null` e apenas diferença condicionada. O teste cobre limite máximo; o ramo de limite mínimo não tem caso dedicado. |
| confirmed | 19. Alavanca ausente bloqueia sem preencher zero. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 250-282 | O código cobre rolagem, choque, haircuts e os dois lados do refinanciamento; os testes exercitam EBITDA, rolagem e refinanciamento, mas não isoladamente choque e haircut de CFADS. |
| confirmed | 20. CFADS ausente não é repetido e juros ausentes permanecem nulos. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 131-137 e 184-188 | CFADS ausente torna liquidez nula com `insufficient_evidence`; juros ausentes produzem base `principal_only` e termo descoberto. |
| corrected | 21. O teste denominado gold está vinculado ao manifesto real do gc01. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 9-20 e 28-59 | O teste usa nomes `.pdf`, hashes artificiais (`a1`/`e5` preenchidos com zeros) e documentos hipotéticos. O manifesto real usa arquivos `.txt` e hashes distintos; portanto o teste prova apenas consistência contra um manifesto fabricado, não contra o corpus gold congelado. |
| corrected | 22. A validação impede reescala apoiando-se no conteúdo da fonte. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 36, 68-73 e 103-115 | A unidade é conferida somente contra `unitAnchor.note`, texto fornecido pelo chamador. Alterar coordenadamente `unit`, valores e a nota para “milhões” passa sem conferir que a página 39 diz “Em milhares de reais”. |
| confirmed | 23. As mutações adversariais explicitamente exercidas são recusadas. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 160-193 | Há cobertura para classe documental errada, rolagem histórica, hash divergente do manifesto fornecido, manifesto ausente, adverso incompleto, fonte contratada sem desembolso, reescala simples, EBITDA trimestral anualizado, zero stress e razões fora da faixa. |
| corrected | 24. O executor resiste a adulteração do valor ancorado ou da nota da âncora. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 103-159 e 235-238 | O executor não confronta valores ou notas com o conteúdo do documento. Dívida bruta adulterada, arrendamento embutido ou dívida líquida do release podem passar mantendo uma âncora nominalmente válida. |
| limitation | 25. As demais mutações do gabarito estão provadas por esta suíte. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 10, 11.6 e 13.4 | Não há testes dedicados para arrendamento, dívida líquida do release, escolha indevida de 3,50x, curva em data errada, dividendos, hedge, contingências ou prepayment; vários estão fora da saída deste executor. |
| confirmed | 26. Ordem de entrada e fingerprints são determinísticos para as permutações testadas. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 195-205 | Vinte permutações de arrays e ordem de chaves preservam os fingerprints; a implementação canonicaliza documentos, premissas, cenários, períodos, manifesto e comparabilidade. |
| corrected | 27. A consistência vale também para entradas duplicadas semanticamente conflitantes. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 105-113, 205-218 e 273-275 | Duplicatas no manifesto não são recusadas: `Map` escolhe a última, de modo que inverter dois hashes do mesmo nome pode alternar entre aceitar e rejeitar. Comparabilidades duplicadas para o mesmo instrumento também não são recusadas e `.find` escolhe a primeira. |
| limitation | 28. O teste de consistência permuta efetivamente os arrays de `reasons`. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 195-203; fixture nas linhas 45-46 | Apesar do título, apenas `comparabilityByInstrument` é permutado; cada `reasons` da fixture tem um único elemento, portanto sua ordenação não é demonstrada pelo teste. |
| limitation | 29. O contrato comprova toda a estrutura aninhada da saída. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 208-210 | O teste de contrato verifica exatamente os campos de topo declarados; a estrutura interna de cenários, origens e trace é verificada apenas por expectativas parciais. |
| limitation | 30. Arrendamento integra definitivamente “outra dívida onerosa”. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definição de Dívida Líquida, página 7 | A escritura não resolve de modo inequívoco a classificação do passivo de arrendamento; exige interpretação jurídica especializada. |
| unverifiable | 31. O degrau de 4,00x está definitivamente aplicável. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.1, linhas 366-388 | Falta prova da quitação ordinária dos CRA de referência; o tratamento `insufficient_evidence` do executor está correto. |

## Condições

- Substituir a fixture chamada gold por entrada construída com `docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json`, usando os nomes e hashes reais; hoje a divergência está em `declare-scenarios.test.ts`, linhas 9-20.
- Vincular unidade, valores e hashes a conteúdo verificado em fronteira confiável; a validação atual de `declare-scenarios.ts`, linhas 103-159, confia em notas e manifesto fornecidos pelo chamador.
- Recusar nomes duplicados no manifesto e instrumentos duplicados em `comparabilityByInstrument`; a ordem atualmente afeta `Map`/`.find` em `declare-scenarios.ts`, linhas 105-113 e 273-275.
- Manter o degrau de 4,00x como condicionado até prova da quitação ordinária dos CRA: `gc01-gabarito-rascunho.md`, seção 13.1.
- Manter a comparabilidade de 4,72x condicionada até abertura do EBITDA e informações complementares: ITR, página 40; escritura da 11ª, cláusula 4.22.3.
- A inclusão de arrendamentos em outra dívida onerosa exige revisão jurídica especializada: escritura da 13ª, página 7; ITR, página 51.

## Notas do revisor

Codex (GPT-5), revisão por modelo com shell local, Node.js e Vitest.

A aritmética do caso confere quando condicionada às premissas da fixture, e os oito testes passam. O resultado é `fail` porque a evidência chamada gold não usa o corpus congelado, a validação de escala não lê a fonte e existem entradas duplicadas cuja ordem muda o comportamento.
