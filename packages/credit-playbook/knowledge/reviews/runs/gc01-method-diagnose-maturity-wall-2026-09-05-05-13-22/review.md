# Revisão independente por IA: método diagnose-maturity-wall v2026.09.05-v5

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-diagnose-maturity-wall-2026-09-05-05-13-22, commit ba9fb28. Fingerprint 574ba9d87a3a05cbe6335f2b2a3676c4f4952c412abfeeb3b6414db44dd786d1.

Resultado: **fail**. Evidências: 13 confirmed, 1 unverifiable, 3 limitation, 4 corrected.

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
| confirmed | 1. Integridade do corpus: os 43 arquivos correspondem ao manifesto. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries[0..42]: bytes e sha256 | Recalculados SHA-256 e tamanhos: 43/43 correspondem. |
| confirmed | 2. O gold usa dívida bruta de 5.670.186 e o cronograma corrente/anterior 1.229.828/1.074.636; 776.868/712.945; 1.228.475/886.187; 694.497/586.660; 994.544/989.147; 809.198/805.151; ajuste -63.224/-66.343, em R$ mil consolidado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, pp. 39-40, tabela do cronograma de amortizações | Todos os valores do fixture gold foram localizados; o ajuste usa corretamente a tabela do cronograma, que traz -63.224. |
| confirmed | 3. Caixa e equivalentes de 1.430.714 não prova liquidez D0, pois as aplicações podem ser resgatadas em até 90 dias. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 3, p. 20 | Confere com cash.definition=accounting_equivalents_up_to_90_days e com a ressalva do executor. |
| confirmed | 4. As operações de 251.000 e até 535.000 foram apenas aprovadas; o corpus não traz contrato final nem desembolso. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ca_notas_comerciais_2026-05-27.txt | ata de 18/05/2026, pp. 1-2, itens 4-5(i)(c),(g) | A ata aprova R$251 milhões e prazo de quatro anos; busca no corpus encontrou essa operação apenas nesta ata. |
| confirmed | 5. A CPR aprovada é de até 535.000, prazo de até três anos, com amortizações anuais. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ca_operacao_estruturada_2026-05-27.txt | ata de 18/05/2026, p. 2, item 5(i)(a) | É autorização para formalização; não prova contratação ou desembolso. |
| unverifiable | 6. O limiar 0,20 e a versão policy.structure.maturity_wall/2026.09.05-v8 sustentam a classificação dos dois picos como paredes. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 9, 38-49 e 113-117 | O valor e a versão aparecem somente no teste. O método apenas referencia a chave da política; nenhum artefato permitido contém seu valor/versionamento. |
| confirmed | 7. Soma, participações, pico e variações do gold conferem. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 40 | Soma dos vencimentos=5.733.410; menos 63.224=5.670.186. Participações: 0,21689377; 0,13700926; 0,21665515; 0,12248223; 0,17539883; 0,14271102. Variações: 155.192; 63.923; 342.288; 107.837; 5.397; 4.047. O pico é 2026/27 por 1.353 acima de 2028/29. |
| confirmed | 8. A cobertura sequencial cash-only do gold produz 1,16334479x, caixa final 200.886 e déficit acumulado final de 3.493.498. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 53-69 e 168-178 | Recálculo: 1.430.714/1.229.828=1,16334479; sobra 200.886. Depois: déficits 575.982, 1.228.475, 694.497 e 994.544; acumulados 575.982, 1.804.457, 2.498.954 e 3.493.498. O bucket aberto fica não avaliado. |
| confirmed | 9. A aritmética dos cenários hipotéticos com fonte, CFADS e juros está correta. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 76-110 | Fonte de 251.000 leva a 451.886. Com CFADS 500.000 e juros 100.000: serviço inicial 1.329.828, sobras 600.886 e 224.018, depois déficit 604.457. |
| limitation | 10. Dívida líquida contratual, EBITDA, degraus e headroom não são calculados por este executor; EBITDA é corretamente recusado como substituto de CFADS. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 5, 6 e 13.1; linhas 124-155, 176-180 e 367-388 | Recálculo externo ao executor: 5.670.186+14.335-235-1.430.714-25.095=4.228.477; 4.228.477/4,72=895.863,77; 4,72x está 0,72x acima de 4,00x. O executor não possui campos de dívida líquida, EBITDA, degrau ou headroom. |
| limitation | 11. As escrituras definem dívida líquida, EBITDA e degraus de 3,50x/4,00x; a aplicação definitiva de 4,00x depende da quitação dos CRA de referência. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definições nas pp. 7-8; cláusula 7.24.3(VIII)(a)-(b), pp. 54-55 | As definições textuais conferem com o gabarito, mas a quitação ordinária necessária ao degrau de 4,00x permanece não comprovada no corpus. |
| confirmed | 12. Sem CFADS ou juros futuros por período, o executor retorna incomplete, cria uncovered_terms/insufficient_evidence e não exibe valores inventados. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 207-217 e 223-248 | Ausências viram geração/juros nulos na saída e cobertura explicitamente principal_only/cash-only; zero é usado apenas como operando interno dessa visão nomeada. |
| confirmed | 13. Cronograma vazio, dívida bruta zero ou falta de conciliação bloqueiam e suprimem paredes, pico e cobertura. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 167-184 | Corresponde às stop conditions e aos outputs bloqueados do método, linhas 73-91. |
| corrected | 14. Uma fonte fica provada apenas pela presença de dois documentos, sem provar que o valor ou o período atribuídos correspondem ao desembolso. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 59-70 e 199-205 | O schema não registra valor desembolsado nem período comprovado nos documentos. Assim, qualquer amount/claimedPeriod pode entrar integralmente após anexar contrato e prova de desembolso não reconciliados ao número. Isso viola a promessa do método, linha 87, de valor e período provados. |
| corrected | 15. O teste ancora a aceleração da 13ª emissão na cláusula 7.1.2. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.24.3(VIII) e 7.24.5, pp. 54-55 | Não há cláusula 7.1.2 no extrato. O covenant é evento não automático em 7.24.3(VIII), e o default de declaração salvo deliberação contrária está em 7.24.5. O saldo 306.038 está confirmado na nota 15, p. 39. |
| corrected | 16. Com acceleration=null, o executor não afirma o mecanismo de aceleração. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 161-166 | Apesar de marcar o cenário not_asserted, a nota sem âncora afirma que descumprimento de covenant é evento não automático. O método, linhas 89-91, exige que sem cláusula isso não seja afirmado. O teste linhas 189-192 codifica a contradição. |
| corrected | 17. Ajustes nunca funcionam como períodos de juros, geração ou fontes. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 84-100, 167-169 e 223-249 | A validação usa o mesmo conjunto para maturities e adjustments. Mutação executada mostrou juros/geração e uma fonte provada aceitos no período 'cost'; a fonte fica atribuída ao ajuste e é silenciosamente ignorada na cobertura. Os testes não cobrem isso. |
| confirmed | 18. As mutações cobertas rejeitam escala/unidade incoerente, período passado, duplicidade, fonte sem prova, desembolso anterior, dívida não conciliada, maturidade negativa e limiar acima de um. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 76-89, 113-130, 150-166 e 187-203 | A suíte específica executada passou: 9 testes de 9. |
| confirmed | 19. Ordem de entrada e fingerprints são determinísticos para as permutações testadas. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 143-152, 251-252 | Objetos são serializados com chaves ordenadas; períodos e fontes são canonizados. O teste, linhas 132-143, confirma fingerprints idênticos em vinte permutações e o output fingerprint inclui cálculos e inputFingerprint. |
| limitation | 20. Os testes de consistência cobrem completamente todas as coleções aceitas. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 132-143 | Não permutam chaves de interestByPeriod/operatingGeneration, múltiplos ajustes ou evidência de aceleração; também não comparam profundamente o output, apenas os fingerprints. A leitura do código sustenta determinismo, mas o teste isolado não o prova para todo o domínio. |
| confirmed | 21. O teste de contrato confirma exatamente os campos superiores declarados pelo método. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 146-148 | O teste passou; ele não valida semanticamente os objetos aninhados, cuja correção depende dos demais testes e desta revisão. |

## Condições

- Fornecer o artefato versionado de policy.structure.maturity_wall/2026.09.05-v8 antes de tratar as duas classificações de parede como verificadas; método linhas 24, 63 e 83, teste linha 9.
- Vincular valor e período de cada fonte às evidências de contrato/desembolso antes de incluí-la na cobertura; método linha 87 e executor linhas 59-70/199-205.
- Remover a afirmação não ancorada quando acceleration=null e corrigir a âncora da 13ª emissão para 7.24.3(VIII)/7.24.5; método linhas 89-91, executor linhas 161-166, escritura pp. 54-55.
- Separar maturities de adjustments na validação de juros, geração e claimedPeriod; método linhas 86 e 88, executor linhas 84-100.
- Qualquer conclusão jurídica além da leitura textual das cláusulas permanece sujeita a especialista; gc01-gabarito-rascunho.md, condições 1 e 7.

## Notas do revisor

Codex, modelo GPT-5, com leitura local e execução via shell; sem internet.

A aritmética gold confere, mas há três comportamentos materiais incorretos: prova numérica insuficiente de fontes, afirmação de aceleração sem cláusula e aceitação de ajustes como períodos; há ainda uma âncora contratual errada no teste. Por isso, suíte verde não sustenta aprovação e o resultado é fail.
