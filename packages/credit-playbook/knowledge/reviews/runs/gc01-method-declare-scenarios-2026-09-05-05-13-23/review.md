# Revisão independente por IA: método declare-scenarios v2026.09.05-v4

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-declare-scenarios-2026-09-05-05-13-23, commit ba9fb28. Fingerprint d500e49989ccf82f16dda47c595ce182808a9fcfafa502b0f78dd4e8fb084e67.

Resultado: **fail**. Evidências: 8 corrected, 14 confirmed, 1 unverifiable, 2 limitation.

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
| corrected | 1. O caso gold estaria ligado ao corpus pelos hashes do manifesto. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 12-16 | Os hashes são valores sintéticos preenchidos com zeros e não coincidem com manifest.json; o executor verifica apenas o formato hexadecimal. O ITR real tem SHA-256 05c8f9e9..., não a1000.... |
| confirmed | 2. Dívida bruta consolidada de R$ 5.670.186 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 39, nota 15 |  |
| confirmed | 3. Caixa de 1.430.714, aplicações de 25.095, derivativo ativo de 235 e passivo de 14.335, em R$ mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | páginas 11, 20 e 51, notas 3 e 25 |  |
| confirmed | 4. Principais de 1.229.828 em 2026/27 e 776.868 em 2027/28. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 40, nota 15, cronograma de amortizações |  |
| confirmed | 5. Saldo médio de dívida de 5.329.284,5. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 39, nota 15 | (4.988.383 + 5.670.186) / 2 = 5.329.284,5. |
| corrected | 6. EBITDA LTM exato de 895.864. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 138-155 | 4.228.477 / 4,72 = 895.863,771..., mas 4,72 é um índice reportado com duas casas. O gabarito o qualifica como cerca de 895.900; 895.864 e os índices derivados com oito casas não têm precisão factual demonstrada. |
| confirmed | 7. Pro forma de 4,72x, limite indicado de 4,0x e próxima medição em 28/02/2027. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 40, nota 15 |  |
| corrected | 8. Até prova da quitação, 3,50x seria definitivamente o degrau vigente. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.24.3(VIII), páginas 54-55 | A escritura prevê 3,50x até vencimento ou liquidação e 4,00x no exercício encerrado após quitação integral, salvo vencimento antecipado. O gabarito classifica 4,00x como aplicável condicionado à prova da quitação; não resolve 3,50x como vigente. A âncora do teste também deveria incluir a página 55, onde está 4,00x. |
| unverifiable | 9. CFADS de 200.000 por período, haircuts de 15% e 10%, choque de 2% e taxa-base de 12,46% possuem fontes verificáveis no corpus. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 30-34 e 42 | declaracao_do_usuario.md, reference-data.ts e gc02-gabarito-rascunho.md não integram o material autorizado nem o manifesto do corpus. |
| corrected | 10. O histórico da companhia sustenta rolagem de 100% de todo principal projetado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 16, demonstração dos fluxos de caixa | A fonte mostra captações de 2.046.140 e liquidações de 1.285.146 no trimestre, mas não uma política ou premissa de rolagem integral de cada vencimento futuro. O executor deveria exigir origem para o valor 1, não apenas para a narrativa genérica. |
| confirmed | 11. Caixa dedutível de 1.455.809 e dívida líquida contratual de 4.228.477. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 4-5, linhas 97-140 | 1.430.714 + 25.095 = 1.455.809; 5.670.186 + 14.335 - 235 - 1.430.714 - 25.095 = 4.228.477. |
| confirmed | 12. Alavancagem-base de 4,71999879x e diferença condicionada de -0,71999879x. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 72-74 | Aritmeticamente: 4.228.477 / 895.864 = 4,71999879; 4,00 - 4,71999879 = -0,71999879. Economicamente, a precisão suportada pelo corpus é aproximadamente 4,72x e -0,72x. |
| confirmed | 13. No adverso, EBITDA de 761.484,4, alavancagem de 5,55293976x e CFADS usado de 180.000. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 91-94 | 895.864 × 0,85 = 761.484,4; 4.228.477 / 761.484,4 = 5,55293976; 200.000 × 0,90 = 180.000. São cálculos corretos, condicionados às premissas não verificáveis do item 9. |
| confirmed | 14. Delta anual do choque de taxa de 106.585,69. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 41-42 e 87-90 | 5.329.284,5 × 2% = 106.585,69. Com a taxa-base declarada, juros-base = 664.028,8487 e estressados = 770.614,5387; a taxa-base e o choque permanecem sem fonte verificável. |
| confirmed | 15. No cenário sem rolagem, déficit final de 150.887. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 99-103 | 1.455.809 + 200.000 - 1.229.828 = 425.981; 425.981 + 200.000 - 776.868 = -150.887. O recálculo é correto, condicionado ao CFADS não verificável. |
| confirmed | 16. A definição de dívida líquida usada pelo executor corresponde à definição-base das escrituras. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | página 7, definição de Dívida Líquida | Inclui empréstimos/financiamentos/debêntures e derivativos passivos, menos caixa, aplicações e derivativos ativos, no consolidado. |
| corrected | 17. O campo ebitda_definition representa suficientemente a definição contratual e sua comparabilidade por instrumento. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.1, linhas 366-388 | O executor recebe apenas uma chave livre e flags de comparabilidade. Não codifica a definição-base nem o ajuste de aquisições e sellers finance exclusivo da 11ª; o teste torna a comparação 'comparable' alterando apenas flags, sem evidência. |
| confirmed | 18. Headroom só é emitido para limite resolvido, degrau aplicável e comparabilidades plenas. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 250-285 | Nos demais estados, headroom fica nulo e a diferença aritmética é explicitamente condicionada. Os testes das linhas 131-145 exercitam aplicável, condicional, inaplicável e EBITDA condicional. |
| corrected | 19. O cenário adverso sempre contém choque de taxa e queda de EBITDA, como promete o método. | packages/credit-playbook/knowledge/procedures/scenarios/declare-scenarios.md | linha 55 | O executor, linha 150, aceita adverso com qualquer uma entre taxa, EBITDA ou CFADS. Uma mutação com apenas haircut de CFADS passa, contrariando o conjunto mínimo definido pelo método. |
| confirmed | 20. Premissas ausentes geram insufficient_evidence, bloqueio de alavancas e nenhuma repetição de CFADS. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 107-129 | Ausência de haircut, rolagem ou uma das duas pernas do refinanciamento bloqueia; ausência de CFADS deixa liquidez nula e estado partial, sem copiar outro período. |
| corrected | 21. Aprovação pública de R$ 251 milhões não é tratada como fonte contratada sem contrato e desembolso verificáveis. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 148-159 | O primeiro caso é recusado, mas o teste seguinte cadastra contrato_hipotetico.pdf e extrato_hipotetico.pdf, inexistentes no corpus e com hashes sintéticos, e o executor aceita 251.000 como fonte contratada. A ata real, página 2, prova somente autorização; o gabarito, seção 11.3, exige contrato/desembolso demonstrados. |
| corrected | 22. As mutações adversariais do gabarito estão integralmente cobertas. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 10, 11.6 e 13.4 | Há testes para troca simples de unidade, EBITDA trimestral com datas curtas, origem de classe errada, anúncio sem desembolso, limites numéricos e juros ausentes. Não há cobertura resistente para relabelagem coordenada de unidade e nota, hash falso de 64 caracteres, arrendamento somado ao grossDebt, âncora cujo conteúdo não sustenta o número, adverso sem taxa/EBITDA ou uso da dívida líquida do release. |
| confirmed | 23. A ordem de entrada e a ordem de chaves não alteram os fingerprints no caso testado. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 175-185 | Vinte permutações de premissas, documentos, períodos, cenários, razões e chaves produzem os mesmos fingerprints; a canonicalização está nas linhas 191-199 do executor. Isso demonstra consistência para essas coleções do fixture, não uma prova universal para entradas não exercitadas. |
| limitation | 24. O teste contratual prova todo o contrato semântico e aninhado do método. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 188-190 | O teste afirma apenas ausência de divergência nos campos de topo. Não prova definições, evidência ou invariantes dos objetos aninhados. |
| limitation | 25. A inclusão de arrendamentos em outra dívida onerosa pode ser resolvida por esta revisão. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | página 7, definição de Dívida Líquida | A escritura inclui outras dívidas onerosas e o ITR, nota 25, página 51, apresenta arrendamentos separadamente. A inclusão exige interpretação jurídica especializada. |

## Condições

- Validar nomes e hashes contra um manifesto confiável; formato SHA-256 isolado não basta.
- Substituir declaracao_do_usuario.md, reference-data.ts, gc02-gabarito-rascunho.md e documentos hipotéticos por evidência integrante do corpus, ou bloquear os resultados dependentes.
- Retirar ou fundamentar a premissa de rolagem integral e recalcular os cenários afetados.
- Preservar a natureza aproximada do EBITDA implícito e limitar a precisão de alavancagem/headroom.
- Fazer o adverso mínimo exigir choque de taxa e queda de EBITDA, conforme o método, ou alterar formalmente o método.
- Representar a definição e a comparabilidade de EBITDA por instrumento, não apenas por chave e flags fornecidas pelo chamador.
- Manter condicionadas a quitação ordinária dos CRA, a comparabilidade integral do EBITDA e a interpretação jurídica de arrendamentos.

## Notas do revisor

Codex (GPT-5), revisão por modelo com leitura local, recálculo próprio e Vitest; sem internet.

Os oito testes passam localmente, e a aritmética implementada confere quando suas premissas são aceitas. O resultado é fail porque o gold aceita evidência e hashes sintéticos, uma rolagem material sem suporte, falsa precisão no EBITDA implícito e comportamentos adversariais incompatíveis com o método e o gabarito.
