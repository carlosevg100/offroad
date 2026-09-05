# Revisão independente por IA: método declare-scenarios v2026.09.05-v1

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-declare-scenarios-2026-09-05-03-07-04, commit 8bf52d7. Fingerprint 3edc016e5724b792e36627050ae3ffc7bc9815bf3dae507eb366d2cdada6ae50.

Resultado: **fail**. Evidências: 12 confirmed, 14 corrected, 2 unverifiable, 3 limitation.

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
| confirmed | Os 43 arquivos do corpus correspondem ao manifesto. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries, linhas 5–220 | Bytes e SHA-256 foram recalculados; todos coincidem. |
| confirmed | Dívida bruta de 5.670.186 e caixa de 1.430.714. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, PDF p.39–40, linhas 2034–2065; nota 3, PDF p.20, linhas 971–984 | Os valores conferem, mas o teste atribui um único anchor de p.40 também ao caixa, cuja fonte é p.20. |
| confirmed | Dívida líquida contratual de 4.228.477 e EBITDA implícito de 895.864. | docs/product/gold-cases/gc01-gabarito-rascunho.md | §5, linhas 111–142 | 5.670.186 + 14.335 - 235 - 1.430.714 - 25.095 = 4.228.477; 4.228.477 / 4,72 = 895.863,771, arredondado a 895.864. |
| corrected | Saldo médio da dívida de 5.329.284. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, PDF p.40, linhas 2085–2094 | A fonte não informa saldo médio. A média simples dos saldos inicial e final é (4.988.383 + 5.670.186) / 2 = 5.329.284,5, não 5.329.284. |
| unverifiable | Taxa-base de 14%, choque de 2% e haircut de EBITDA de 15%. | docs/product/gold-cases/runs/gc01/ai-review-corpus/bcb_sgs_selic_meta.json | observações de 01/09/2026 a 04/09/2026 | 14% aparece como meta Selic de setembro, não como custo médio da dívida em 31/05. O corpus permitido não contém os valores das chaves reference-data usadas para 2% e 15%. |
| corrected | CFADS de 450.000 em cada semestre, derivado de metade do EBITDA menos capex de manutenção. | docs/product/gold-cases/gc01-gabarito-rascunho.md | §6, linhas 163–167; §8, linhas 184–193 | 895.864 / 2 = 447.932 antes de qualquer capex; portanto 450.000 não pode ser metade menos capex. O gabarito diz que DSCR depende de CFADS não disponível. Os dois CFADS foram preenchidos sem suporte. |
| unverifiable | Principal de 614.914 e juros de 340.000 em cada semestre. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, PDF p.40, linhas 2097–2109 | 1.229.828 / 2 = 614.914, mas a fonte só traz o total do ano-safra, sem divisão semestral. Não há projeção de juros de 340.000 por semestre. |
| confirmed | Autorizações de 251.000 e até 535.000, total máximo de 786.000. | docs/product/gold-cases/gc01-gabarito-rascunho.md | §11.3, linhas 271–284 | 251.000 + 535.000 = 786.000; são autorizações, não desembolsos ou fontes contratadas demonstradas. |
| corrected | Os 786.000 podem ser usados como refinancedDebt e contractedSources. | docs/product/gold-cases/gc01-gabarito-rascunho.md | §11.3, linhas 278–284; §11.6, linhas 318–323 | O gabarito proíbe alocar esse máximo no cronograma sem prova de contrato e desembolso. O teste ainda ancora o total somente na ata das notas comerciais, embora 535.000 pertença à ata da CPR. |
| confirmed | Delta de juros adverso de 106.585,68. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 17 e 35–39 | Com o input do executor: 5.329.284 × 14% = 746.099,76; × 16% = 852.685,44; delta = 106.585,68. Com a média corrigida de 5.329.284,5, o delta seria 106.585,69. |
| confirmed | Pro forma base: dívida bruta 4.884.186, líquida 3.453.472 e leverage 3,85490655; adverso 4,53518417. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 106–117 | Aritmética executada: 5.670.186 - 786.000 = 4.884.186; menos caixa = 3.453.472; 3.453.472 / 895.864 = 3,85490655. EBITDA adverso = 895.864 × 85% = 761.484,4; leverage = 4,53518417. |
| corrected | O pro forma representa economicamente um refinanciamento. | docs/product/gold-cases/gc01-gabarito-rascunho.md | §11.3, linhas 278–284 | O executor subtrai 786.000 da dívida sem adicionar dívida substituta e ainda usa o mesmo montante como liquidez. Isso modela perdão/amortização financiada externamente, não refinanciamento demonstrado. |
| confirmed | Liquidez base termina em 1.992.886. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 119–124 | P1: (1.430.714 + 450.000 + 786.000) / 954.914 = 2,79262216; fechamento 1.711.800. P2: (1.711.800 + 450.000 + 786.000) / 954.914 = 3,08697956; fechamento 1.992.886. |
| confirmed | Liquidez adversa termina em 1.751.300,32. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 114–124 | CFADS = 382.500; juros adicionais por semestre = 53.292,84; serviço = 1.008.206,84. Fechamentos recalculados: 1.591.007,16 e 1.751.300,32. |
| corrected | A fonte de refinanciamento de 786.000 é usada uma única vez. | packages/credit-playbook/src/executors/declare-scenarios.ts | linha 122 | contractedSources recebe 786.000 em cada período; o cenário base contabiliza 1.572.000 no total. |
| corrected | O cenário sem rolagem mostra déficit. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 42–47 | O teste verifica apenas caixa inferior ao base. O recálculo produz fechamentos de 925.800 e 420.886, com deficit = 0 nos dois períodos; portanto o título do teste não é provado. |
| corrected | A dívida líquida usada no leverage corresponde à definição contratual. | docs/product/gold-cases/gc01-gabarito-rascunho.md | §5, linhas 111–142; §13.1, linhas 353–375 | O executor usa apenas dívida bruta menos caixa, omitindo derivativos e aplicações. Sem a operação de 786.000, daria 4.239.472, contra 4.228.477 contratual; a definição não é identificada na saída. |
| corrected | O EBITDA do executor é comparável ao EBITDA de covenant. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3, linhas 1293–1337 | O executor aceita qualquer ltmEbitdaProxy e basis livre. Não valida a definição contratual nem o ajuste de aquisições e sellers finance exclusivo da 11ª emissão. |
| corrected | A hierarquia de origem do método é aplicada pelo executor. | packages/credit-playbook/knowledge/procedures/scenarios/declare-scenarios.md | linhas 49–55 e 97–105 | O executor calcula originRank, mas não escolhe nem exige a origem superior disponível; a classificação é fornecida livremente pelo chamador. |
| corrected | A presença dos IDs garante base, adverso e sem rolagem semanticamente válidos. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 41–64 | Adverse passa sem choque ou haircut; no_rollover passa com rolloverAllowed omitido, cujo default é true. Só os IDs são exigidos. |
| confirmed | Parâmetro não registrado e conjunto mínimo incompleto são recusados. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 49–56 | As duas mutações geram erro como esperado. A primeira testa referência inexistente, não falsificação da origem declarada. |
| confirmed | EBITDA ausente não é inventado. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 110–111 | Com ltmEbitdaProxy nulo, leverage permanece null. |
| corrected | Base insuficiente produz uncoveredTerms, insufficient_evidence e bloqueio explícito. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 67–79 e 92–135 | Esses estados não existem no contrato de saída. Ausências de choque, haircut e sem-rolagem recebem defaults silenciosos; apenas referências inexistentes bloqueiam. |
| corrected | A ressalva acompanha cada número derivado e suas fontes. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 125–134 | Há uma ressalva por cenário, separada dos números. Ela omite as origens da posição inicial e não acompanha individualmente cada resultado. |
| confirmed | Faixa do usuário é rotulada quando corretamente declarada. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 58–66 | A caveat contém 'faixa dada pelo usuário' e originRank = 4. |
| corrected | As mutações adversariais de escala, origem disfarçada, EBITDA impróprio, arrendamento e captação não desembolsada são resistidas. | docs/product/gold-cases/gc01-gabarito-rascunho.md | §10, linhas 215–219; §11.6, linhas 316–323 | Unidades são strings sem validação dimensional; origem e basis são livres; não há decomposição de dívida; e o próprio gold usa a autorização não desembolsada como fonte. Os testes não cobrem essas mutações. |
| confirmed | Ordem de arrays não altera fingerprints no caso gold. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 68–79 | O teste passa, mas as 20 iterações repetem somente duas ordenações das assumptions e sempre a mesma reversão de scenarios e periods. |
| corrected | O executor é determinístico para toda entrada válida independentemente da ordem. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 51–64 e 88–95 | Chaves duplicadas são aceitas. A ordenação mantém a ordem relativa dos duplicados e Map usa o último valor; inverter dois assumptions com a mesma key alterou cálculo e ambos os fingerprints. IDs e períodos duplicados também não são recusados. |
| limitation | Headroom contratual pode ser afirmado diretamente a partir dos leverages produzidos. | docs/product/gold-cases/gc01-gabarito-rascunho.md | §11.2, linhas 252–269; §13.1, linhas 363–375 | O executor não produz headroom nem recebe degrau contratual. Comparações mecânicas contra 4,00x seriam +0,14509345x no base e -0,53518417x no adverso, mas não são headroom contratual verificável. |
| limitation | Arrendamento integra 'qualquer outra dívida onerosa'. | docs/product/gold-cases/gc01-gabarito-rascunho.md | §5, linhas 135–138 | O corpus não resolve essa interpretação jurídica. |
| limitation | O degrau de 4,00x e a comparabilidade integral do 4,72x estão definitivamente comprovados. | docs/product/gold-cases/gc01-gabarito-rascunho.md | §13.1, linhas 360–375; §13.3, linhas 403–409 | A quitação ordinária dos CRA de referência e o cálculo completo do EBITDA da companhia permanecem insufficient_evidence. |

## Condições

- Revisão jurídica especializada necessária para decidir se arrendamento entra em 'outra dívida onerosa' (§5, linhas 135–138 do gabarito).
- Comprovar a quitação ordinária dos CRA de referência antes de aplicar definitivamente o degrau de 4,00x (§13.1, linhas 360–375).
- Obter o cálculo de EBITDA e as informações complementares da companhia antes de afirmar comparabilidade integral do 4,72x com cada escritura (§13.1, linhas 371–375).

## Notas do revisor

Codex (GPT-5), com inspeção local, SHA-256, execução via tsx e Vitest; revisão exclusivamente por modelo.

Falha material: o gold inventa CFADS, transforma autorizações não desembolsadas em refinanciamento e liquidez repetida, não demonstra o déficit anunciado, omite estados explícitos de insuficiência e não é determinístico com duplicatas. Os testes locais passam, mas não provam essas propriedades. Este registro é revisão por modelo, não aprovação humana.
