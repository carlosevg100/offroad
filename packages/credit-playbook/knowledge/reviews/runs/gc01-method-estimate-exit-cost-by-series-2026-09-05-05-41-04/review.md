# Revisão independente por IA: método estimate-exit-cost-by-series v2026.09.05-v7

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-estimate-exit-cost-by-series-2026-09-05-05-41-04, commit d319fb0. Fingerprint c9d3f8a8e26af2eaa72631fdba13c79492eaac1c0849c8e07b752fc5a0ba9338.

Resultado: **fail**. Evidências: 14 confirmed, 1 unverifiable, 2 corrected, 5 limitation.

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
| confirmed | 1. O corpus utilizado corresponde ao manifesto congelado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries[*].sha256 | Todos os hashes SHA-256 do manifesto foram recalculados e conferiram. |
| confirmed | 2. O gold contém 12 séries: 2 da 11ª, 3 da 13ª, 3 da 14ª e 4 da 15ª. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 | 2 + 3 + 3 + 4 = 12. |
| confirmed | 3. Os 12 custos monetários do gold são insuficientes na saída de 04/09/2026. | docs/product/gold-cases/gc01-gabarito-rascunho.md | condição 6 e seção 13.2 | O corpus traz saldos de 31/05/2026, mas não nominal, remuneração acumulada e encargos em 04/09/2026; make-whole também carece dos fluxos e da cotação do dia contratual. |
| confirmed | 4. Datas, prêmio anual de 0,40%, limite de 98%, oferta negociada e regras IPCA da 13ª estão corretamente transcritos. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.14.1-7.14.6, 7.16.1-7.16.2 e 7.18.1-7.18.2 | Inclui 14/05/2026, 14/05/2027, 15/05/2028, resgate IPCA pelo dia útil anterior e amortização pelo segundo dia útil anterior. |
| confirmed | 5. Datas e mecanismos da 14ª usados no gold estão corretos. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_14a_emissao.txt | cláusulas 7.14.1, 7.16.1-7.16.2 e 7.18.1-7.18.2 | Confirmados 15/06/2026, 15/06/2027, 15/06/2028 e limite de 98%. |
| confirmed | 6. Datas e mecanismos da 15ª usados no gold estão corretos. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusulas 7.14.1, 7.16.1-7.16.3 e 7.18.1-7.18.3 | Confirmados 15/11/2027, 15/11/2028, 15/11/2029, prêmio DI de 0,40% e limite de 98%. |
| confirmed | 7. A aquisição da 11ª pode ser parcial ou integral a preço aceito pelo vendedor, e a oferta exige adesão de 100%. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusulas 4.13 e 4.14.1-4.14.1.5, páginas 22-24 |  |
| unverifiable | 8. A oferta negociada da 11ª fica disponível exatamente em 30/10/2021. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusulas 4.1.1 e 4.14 | 30/10/2021 é a data de emissão, mas a cláusula 4.14 não declara expressamente essa data como início da oferta. |
| confirmed | 9. Totais do gold: prêmio 0, pagamento 0, séries estimadas 0, séries abertas 12 e estado partial. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 283-314 e 384-399 | Recálculo: 12 bases incompletas ⇒ 12 cheapest_full_exit nulos; somas sobre conjunto vazio = 0; abertas = 12 − 0 = 12; lista não vazia com abertas > 0 ⇒ partial. |
| confirmed | 10. A aritmética dos exemplos DI e make-whole reproduz os resultados testados. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 161-218 | DI: base 101,5; fator 1,004^(504/252)−1 = 0,008016; prêmio agregado 0,813624; parcela 98% = 99,47. Make-whole a 7%: 6/1,034130356 + 106/1,07 = 104,86739704. |
| confirmed | 11. Base, escopo parcial, bloqueio sem escritura e ausência de preenchimento implícito seguem o método. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 283-315 | Qualquer nominal, remuneração ou encargo ausente produz insufficient_evidence; zero precisa ser explícito. |
| corrected | 12. A duration usada para escolher NTN-B ou vértice respeita o arredondamento contratual de nove casas. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 341-359 | O valor presente recebe factorDecimals=9, mas macaulayDurationBusinessDays e a duration em dias corridos são chamados sem esse arredondamento. Mutação de fronteira com fluxos 1 em DU 125 e 1,509708412493 em DU 252, taxa 6% e candidatos 200/201 produz duration contratual 200,49999998 (candidato 200) e duration do executor 200,50000014 (candidato 201). Isso pode selecionar taxa e custo errados. |
| corrected | 13. A definição de DU do prêmio DI coincide com a escritura. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 220-229 | O helper conta estritamente depois da saída até o vencimento inclusive; as escrituras definem saída inclusive e vencimento exclusive (13ª 7.16.1.2; 14ª 7.16.1.2; 15ª 7.16.1.2). Os testes não exercitam endpoints com classificação distinta. |
| confirmed | 14. uncoveredTerms, insufficient_evidence e bloqueio funcionam para base ou escritura ausente. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 124-159 e 250-269 | Os testes passaram e o executor não fabrica valores. |
| limitation | 15. O executor detecta todo mecanismo da escritura omitido da entrada. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 131-135 e 302 | Ele compara mechanisms apenas com indentureMechanisms fornecido pelo próprio chamador. Remover o mecanismo das duas listas evita a lacuna; o teste cobre somente remoção de mechanisms. |
| confirmed | 16. As mutações centrais — prêmio flat, saída unilateral antes da carência, ausência de escritura e negação da oferta negociada anterior — são resistidas. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 124-201 e 250-321 | Os 7 testes Vitest passaram. |
| limitation | 17. A mutação declarada make-whole-without-quote-is-insufficient está provada diretamente por teste em rota permitida e com base completa. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 204-269 | O código retorna insufficient_evidence sem cotação, mas não há teste isolado dessa mutação com rota permitida e base completa; no gold, carência ou base ausente interrompem antes. |
| limitation | 18. Os testes fixam todas as datas gold contra mutações que preservem apenas o mesmo estado permitido/não permitido. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 131-156 | Há asserções exatas para algumas datas, mas várias são verificadas apenas pelo estado booleano; deslocamentos que mantenham o estado podem escapar. |
| confirmed | 19. Ordem de séries, mecanismos, fluxos, candidatos, documentos e chaves não altera os fingerprints. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 324-346 | Vinte permutações preservaram inputFingerprint e outputFingerprint; a canonicalização correspondente está nas linhas 266-274 do executor. |
| limitation | 20. O teste de contrato prova todo o esquema aninhado do resultado. | packages/credit-playbook/src/executors/contract.ts | linhas 5-32 | contractMismatch verifica somente presença e excesso de chaves no nível superior; não valida tipos nem estruturas internas. |
| confirmed | 21. Dívida líquida, EBITDA, degraus, comparabilidade, headroom e 'contra' são definições produzidas por este executor. | packages/credit-playbook/knowledge/procedures/refinance/estimate-exit-cost-by-series.md | seções Cálculos determinísticos e Outputs, linhas 58-97 | Esses conceitos não integram o contrato deste método; aqui foram testadas apenas as definições de custo de saída. Nenhum headroom é calculado ou afirmado. |
| limitation | 22. A revisão constitui aprovação jurídica ou humana. | packages/credit-playbook/knowledge/procedures/refinance/estimate-exit-cost-by-series.md | frontmatter, legal_review_required: true | Este registro é somente revisão por modelo; interpretação jurídica final dos mecanismos permanece condicionada a especialista. |

## Condições

- Corrigir a duration para aplicar o arredondamento contratual de nove casas também na seleção do título/vértice e adicionar teste de fronteira (executor linhas 341-359; escrituras, fórmulas de FVPd).
- Alinhar DU ao intervalo saída inclusive/vencimento exclusive ou validar formalmente que ambos os endpoints são Dias Úteis (executor linhas 220-229; escrituras 7.16.1.2).
- Obter suporte textual ou revisão jurídica para usar 30/10/2021 como início exato da oferta da 11ª (escritura 11ª, cláusulas 4.1.1 e 4.14).
- Manter os custos gold como insufficient_evidence até existirem base, fluxos, calendário e cotações da data contratual (gabarito, condição 6 e seção 13.2).
- Submeter conclusões jurídicas a especialista, conforme legal_review_required no frontmatter do método.

## Notas do revisor

Codex (GPT-5), revisão independente por modelo com leitura local, recálculo próprio, SHA-256 e Vitest.

O gold bloqueia corretamente os valores não demonstráveis e seus totais foram recalculados. O fail decorre das divergências materiais de duration/arredondamento e definição de DU, que podem alterar a taxa de referência ou o prêmio.
