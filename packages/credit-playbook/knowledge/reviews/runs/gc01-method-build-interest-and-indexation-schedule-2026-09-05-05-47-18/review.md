# Revisão independente por IA: método build-interest-and-indexation-schedule v2026.09.05-v6

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-build-interest-and-indexation-schedule-2026-09-05-05-47-18, commit ff8c1a1. Fingerprint c9f215fa7f6137068844d15a1f295347ad38f9f9b6dcda110cf51cb58a0a7835.

Resultado: **fail**. Evidências: 18 confirmed, 4 unverifiable, 5 corrected, 3 limitation.

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
| confirmed | E01 — Integridade do corpus: os 43 arquivos declarados no manifesto mantêm tamanho e SHA-256. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries, linhas 5-220 | Recálculo local encontrou zero divergências. |
| confirmed | E02 — Unidade do caso gold: R$ mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, linhas 2034-2077; página 39 | A fonte declara “Em milhares de reais – R$”. |
| confirmed | E03 — Saldos contábeis usados pelo fixture, dívida bruta de 5.670.186 e 16 famílias/séries do ledger. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, linhas 2038-2065; página 39 | Os quatro empréstimos, doze séries de debêntures e respectivos saldos conferem com o fixture. |
| confirmed | E04 — Termos das doze séries: CDI +1,55%, CDI +0,65%, 104% e 105% do DI, prefixada 14,15% e seis séries IPCA entre 6,3416% e 8,70%. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 11.1, linhas 242-263 | Os indexadores e spreads do fixture coincidem com a tabela do gabarito. |
| confirmed | E05 — CDI diário de 0,051660% convertido para 0,0005166 e anualizado para 0,13899875. | docs/product/gold-cases/runs/gc01/ai-review-corpus/bcb_sgs_cdi_diario.json | registros de 01/09/2026 a 03/09/2026 | Recálculo: (1+0,0005166)^252−1 = 0,138998748001425871…, arredondado a 8 casas = 0,13899875. |
| unverifiable | E06 — A mesma taxa diária é usada nos quatro períodos futuros, com 63 dias úteis por trimestre e posições 9/10/52/53/54. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 12-23 e 28-50 | O corpus contém CDI apenas de 01-03/09/2026. “calendario_sintetico_teste.md” não consta do manifesto; portanto dias úteis, posições e fluxos projetados são hipóteses, não números gold verificáveis. |
| confirmed | E07 — 13ª, 1ª série: nominal 304.160, DI +0,65%, pagamentos em 13/11/2026 e 14/05/2027, principal somente em 14/11/2028. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.10.1.2, linhas 1483-1616; Anexo I, eventos 6-10 | A posição de 304.160 títulos também consta de af_13a_emissao.txt, linhas 249-259. |
| unverifiable | E08 — Resultados do executor para a 13ª, 1ª série. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 58-88 | Aritmética reproduzida: fatores 63/53/10/52/11 dias = 0,034747196/0,029152219/0,005436496/0,028594380/0,005981763; cupons pagos = 0, 19.743,74733135, 0, 21.328,12633639; total = 41.071,87366774. Confere com o executor, mas depende do calendário sintético, curva extrapolada e juros corridos ausentes. |
| confirmed | E09 — 14ª, 1ª série: nominal 411.643, remuneração de 104% do DI e pagamentos em 12/06/2026 e 14/12/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_14a_emissao.txt | linhas 36-55 e 243-253 | As datas e amortização final em 14/06/2029 constam do Anexo I da escritura. |
| corrected | E10 — O teste aplica fator final com 9 casas à 14ª, embora a escritura exija Fator DI com 8 casas. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_14a_emissao.txt | cláusula 7.10.1.2, linhas 1536-1607 | A escritura exige acumulação diária truncada em 16 casas e Fator DI final arredondado em 8. Para 9 dias: fator correto 0,00484578, não 0,004845781 usado no valor. Cupom correto: 1.994,73141654, não 1.994,73182818. Total caixa corrigido: 31.054,50964764, não 31.054,50918466. |
| confirmed | E11 — 15ª, 2ª série: nominal 406.349 e taxa prefixada de 14,15%. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_15a_emissao.txt | linhas 89-106 e 289-301 | A escritura, cláusula 7.10.1.2.1, exige Fator Juros com 9 casas e J truncado em 8. |
| unverifiable | E12 — Resultados do executor para a 15ª, 2ª série. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 37 e 90-107 | Aritmética reproduzida: cupons pagos = 0, 25.524,30745810, 0, 27.570,40680551; total = 53.094,71426361. Confere com o executor, mas depende dos dias úteis sintéticos e não inclui juros corridos de abertura. |
| confirmed | E13 — Agregados atuais: principal 1.122.152; participação 0,19790391; caixa por período 1.994,73182818 / 45.268,05478945 / 29.059,77735648 / 48.898,53314190. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | linhas 464-492 | Recálculos: 304.160+411.643+406.349=1.122.152; 1.122.152/5.670.186=0,19790391; CDI=41.071,87366774+31.054,50918466=72.126,38285240; prefixada=53.094,71426361. Após corrigir E10, o CDI passa a 72.126,38331538. |
| confirmed | E14 — A participação de 19,790391% é “nominal projetado contra saldo contábil”, não cobertura nominal. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, linhas 2038-2065; página 39 | O executor rotula corretamente a comparação como participação aritmética entre bases diferentes. |
| corrected | E15 — O teste gold reproduz a seção 11.1 série a série. | packages/credit-playbook/knowledge/procedures/financial/build-interest-and-indexation-schedule.md | linhas 99-110 | O teste exige apenas 3 schedules e 13 lacunas; nove das doze séries de debêntures não são projetadas. Isso não comprova a promessa “seção 11.1 reproduzida série a série”. |
| confirmed | E16 — A atualização IPCA contratual é incorporada ao valor nominal atualizado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.9.2, linhas 1263-1301 | A escritura sustenta tratamento “capitalized_principal” para as séries IPCA da 13ª; cláusulas equivalentes existem nas 14ª e 15ª. |
| corrected | E17 — O algoritmo hipotético IPCA usa corretamente lag de dois meses, arredondamento genérico e variação mensal simples. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.9.2, linhas 1300-1370 | A escritura usa razões de números-índice NI, regra distinta antes/depois do aniversário, fator parcial truncado em 8 casas e intermediários truncados em 16. No aniversário de junho, o mês anterior é maio, não abril como afirma o teste. A curva plana de 0,40% mascara a divergência. |
| unverifiable | E18 — Números dos casos hipotéticos IPCA e amortização (100.000, 500, 0,40%, 11/21, 104.160 e 200.000). | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | lista integral de arquivos, linhas 5-220 | “fixture_hipotetico.md” e “calendario_sintetico_teste.md” não pertencem ao corpus. A subtração 304.160−104.160=200.000 confere apenas como teste sintético. |
| corrected | E19 — Ponte contábil compara juros caixa mais indexação paga/capitalizada com somente a linha contábil “Juros” de 170.548. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 22, linhas 2558-2565; página 48 | A fonte mostra Juros (170.548) e Atualização monetária (1.247) separadamente. Se o projetado inclui ambos, a base comparável por magnitude é 171.795, ou os componentes devem permanecer separados. O fixture também perde o sinal contábil sem declarar convenção. |
| confirmed | E20 — Base insuficiente nunca vira zero: principal sem cronograma permanece nulo; série sem nominal/termos/curva vira insufficient_evidence; nenhuma série projetável bloqueia. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | linhas 267-302, 440-443, 480-515 | Os testes cobrem saldo final nulo, curva/mês ausente, unidade inválida e estado blocked. |
| confirmed | E21 — Tratamento IPCA desconhecido produz dois cenários e nenhum entra no agregado. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | linhas 446-478 | O teste verifica rows/totals nulos no resultado principal e tratamento pendente no agregado. |
| confirmed | E22 — Curva sem fonte é recusada. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | schema da curva, linhas 54-63 | A mutação falha na validação porque source, asOf e anchor são obrigatórios; porém o arquivo de testes não remove source explicitamente, portanto não registra essa mutação adversarial prometida. |
| corrected | E23 — Posições de todos os eventos avançam e eventos cruzados são validados. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | linhas 137-160 e 380-398 | Cupons e amortizações são validados apenas dentro de listas separadas; anniversaryDates não têm validação de duplicidade, limite ou avanço. Posições contraditórias entre aniversário, cupom e amortização são aceitas e reordenadas pelo número informado. |
| limitation | E24 — As mutações adversariais do gabarito estão cobertas. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 10, 11.6 e 13.4; linhas 228-232, 329-336 e 424-429 | Escala e curva fora da data-base são tratadas. Covenant rompido, EBITDA anualizado, arrendamento, degraus, dívida líquida do release e comparabilidade não pertencem ao contrato deste executor e não são testados aqui. |
| limitation | E25 — Dívida líquida, EBITDA, degraus de 3,50x/4,00x e comparabilidade do 4,72x são definições codificadas por este método. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.1, linhas 366-388 | Essas definições existem no gabarito, mas não no método nem no executor de cronograma de juros; não é possível aprová-las ou reprová-las por estes testes. |
| confirmed | E26 — Determinismo por ordem de entrada e fingerprints. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 205-221 | As 20 permutações mantiveram inputFingerprint 70a542b8347e4422514e93a0bc28a284852a0446892e9968ef5e5d34d0199d3c e outputFingerprint ecc76bd4363a925fc1a01380e34b4f79bf9edb95321d007ae63c7d043404da11f. Não foram permutadas listas com múltiplos aniversários ou amortizações. |
| confirmed | E27 — Fingerprint de saída inclui corpo, cálculos e fingerprint de entrada. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | linhas 514-521 | A composição coincide com a promessa do método. |
| limitation | E28 — O teste de contrato prova o contrato completo do resultado. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 224-226 | Ele comprova apenas os campos de primeiro nível declarados no Markdown; não valida estruturas internas, fórmulas, unidades ou semântica das comparações. |
| confirmed | E29 — Situação da suíte examinada. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 57-241 | Execução local: 8 testes passaram; isso não elimina as divergências de fonte em E10, E15, E17, E19 e E23. |
| confirmed | E30 — Esta revisão é por modelo, sem aprovação humana. | packages/credit-playbook/src/procedure-contract.ts | linhas 12-16 e 157-168 | O contrato distingue revisão independente por modelo de aprovação do fundador. |

## Condições

- C1 — Substituir o calendário sintético por contagens e posições ancoradas antes de tratar os fluxos de E08 e E12 como gold.
- C2 — Corrigir a camada final da 14ª série conforme E10 e atualizar números agregados afetados.
- C3 — Implementar e testar literalmente a fórmula IPCA das escrituras, inclusive NI, regra de aniversário e truncamentos de E17.
- C4 — Alinhar o escopo e o sinal da ponte contábil conforme E19.
- C5 — Um gold válido deve cobrir todas as séries da seção 11.1 ou declarar formalmente que o caso gold é parcial, conforme E15.
- C6 — A separação histórica entre indexação reconhecida e paga no ITR continua dependendo de conciliação da companhia, embora as escrituras definam a capitalização contratual.
- C7 — Questões jurídicas de covenant, arrendamento e aplicabilidade dos degraus exigem revisão própria e, quando indicado pelo gabarito, especialista.

## Notas do revisor

Codex (GPT-5), revisão local com shell, Vitest e aritmética Decimal.js independente; sem internet.

Falha material por divergências de arredondamento, fórmula IPCA, escopo da ponte, cobertura do gold e validação de eventos. A aritmética do executor confere para os próprios inputs sintéticos, mas esses inputs não demonstram o caso gold integral.
