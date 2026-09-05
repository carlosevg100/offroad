# Revisão independente por IA: método reconcile-financial-statements v2026.09.05-v4

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-reconcile-financial-statements-2026-09-05-04-00-38, commit e427c5f. Fingerprint a3391e0de246a6f80b36bbf0ac7f83176a95ec77f3702bad224e2c271ee2289d.

Resultado: **fail**. Evidências: 19 confirmed, 10 corrected, 2 limitation, 1 unverifiable.

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
| confirmed | O corpus gold está íntegro. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries | Os SHA-256 dos 43 arquivos conferem com o manifesto. |
| confirmed | Data-base 31/05/2026 e unidade R$ mil consolidado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | balanço patrimonial, pp. 11-12 |  |
| confirmed | Identidade do balanço: ativos 12.021.830; passivos 9.032.723; patrimônio 2.989.107. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | pp. 11-12; nota 28, p. 57 | 9.032.723 + 2.989.107 = 12.021.830; diferença zero. |
| confirmed | Ponte da dívida: 4.988.383 + 2.046.140 + 172.359 - 4.741 - 1.285.146 - 229.611 + 60 - 17.258 = 5.670.186. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 40 | Recálculo independente fecha exatamente. |
| confirmed | Ponte de caixa: 1.997.608 - 566.894 = 1.430.714. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | DFC consolidada, p. 16; nota 3, p. 20 | Diferença zero. |
| confirmed | Ponte de juros registra 172.359 contra 170.548 e diferença 1.811. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 40; nota 22, p. 48 | 172.359 - 170.548 = 1.811; as rubricas não são comparáveis porque a primeira inclui variações monetárias. |
| confirmed | Dividendos: 395.000 nominais, 338.565 a valor presente, 322.498 contábil e 420.000 valor justo. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 18(e), p. 46; nota 25, p. 51 | 140.000 + 255.000 = 395.000; 395.000 - 6.911 - 49.524 = 338.565; spread mecânico 420.000 - 322.498 = 97.502. |
| corrected | A definição do teste afirma total aprovado de 420.000 em doze parcelas, com onze remanescentes. | docs/product/gold-cases/runs/gc01/ai-review-corpus/02_Proposta_Administracao_AGOE_2026.txt | pp. 36-40 | A afirmação confere, mas a âncora única do teste, nota 18(e), p. 46, não prova doze parcelas; deve incluir a proposta da administração. |
| corrected | Os quatro dividendos podem ser tratados integralmente como not_comparable. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 18(e), p. 46; nota 25, p. 51 | 338.565 e 322.498 são ambos valores contábeis consolidados na mesma data e divergem em 16.067. O executor perde essa comparação ao classificar a conta inteira como not_comparable. |
| confirmed | Estoques da nota 5: 3.088.478, incluindo 643.241 de adiantamentos; circulante 3.013.060 e não circulante 75.418. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 5, p. 21; balanço, p. 11 | 3.013.060 + 75.418 = 3.088.478. |
| corrected | Release: estoques 2.445,2 milhões no capital de giro e 2.437,1 milhões mais 576,0 milhões de adiantamentos a produtores no balanço gerencial. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ri_release_1t26.txt | Capital de Giro, p. 13; Balanço Patrimonial Consolidado, p. 15 | Os números conferem, mas o teste ancora respectivamente nas pp. 12 e 14; ambas estão uma página antes do conteúdo no corpus. |
| confirmed | Resíduos das duas explicações de estoque são -40 e 37. | packages/credit-playbook/src/executors/reconcile-financial-statements.test.ts | linhas 24-32 e 69-73 | 3.013.060 - (2.437.100 + 576.000) = -40; 3.088.478 - (2.445.200 + 643.241) = 37. |
| corrected | No gold, os estoques formam dois grupos desconectados e permanecem open. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 5, p. 21 | O fixture omite a ponte explícita 3.088.478 - 75.418 = 3.013.060. Ao acrescentá-la, execução independente produz um único grupo, state explained e nenhuma divergência aberta de estoques. |
| corrected | Dívida líquida do release: 4.214,4 milhões. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ri_release_1t26.txt | Endividamento e Caixa, p. 12 | O valor confere, mas o teste usa p. 11. Recálculo pelas notas: 5.670.186 - 1.430.714 - 25.095 = 4.214.377; diferença para o release arredondado = 23. |
| confirmed | Dívida líquida contratual: 4.228.477. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | balanço, p. 11; notas 15 e 25, pp. 39-40 e 51 | 5.670.186 + 14.335 - 235 - 1.430.714 - 25.095 = 4.228.477. |
| confirmed | Dívida líquida do release contra a contratual é not_comparable. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 11.4, linhas 301-310 | O release exclui derivativos; a definição contratual os inclui. O spread mecânico dos valores apresentados é 14.077. |
| confirmed | Passivo de arrendamento: 67.399 + 209.369 = 276.768. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | balanço, p. 12; nota 12, p. 34 | O executor o registra como fonte única e insufficient_evidence para reconciliação. |
| limitation | A definição contratual de dívida líquida está integralmente representada pelo executor. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definição de Dívida Líquida, p. 7 | A escritura também inclui qualquer outra dívida onerosa; o executor omite esse componente e não registra a dúvida sobre arrendamentos. Determinar se arrendamentos entram exige interpretação jurídica especializada. |
| limitation | As definições de EBITDA e os degraus 3,50x/4,00x foram testados pelo executor. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3, pp. 34-35 | As escrituras definem EBITDA LTM e os degraus; apenas a 11ª inclui aquisições e sellers finance. O executor não possui campos ou regras para EBITDA, degraus ou headroom; o teste cobre somente tags genéricas annualized versus ltm. |
| unverifiable | As tolerâncias gold de 1.000 e 2.000 possuem política verificável no material autorizado. | packages/credit-playbook/src/executors/reconcile-financial-statements.test.ts | linha 16 | O gabarito e o corpus não contêm a política versionada; o arquivo de referência importado pelo teste não integra o material autorizado nesta revisão. |
| corrected | A comparabilidade exige que o texto nomeie todos os componentes declarados. | packages/credit-playbook/src/executors/reconcile-financial-statements.ts | linhas 45-56 e 114-119 | Somente tags presentes em COMPONENT_WORDS são verificadas. Uma mutação com fake_component e texto que não o menciona foi aceita como comparable e closes. |
| confirmed | Uma explicação é direcional: to = from + adjustment, preservando o sinal. | packages/credit-playbook/src/executors/reconcile-financial-statements.ts | linhas 215-223 | A mutação de sentido do teste produz residual -1.286.519 e holds=false. |
| confirmed | Base vazia bloqueia; identidades e pontes ausentes viram insufficient_evidence; dados ausentes não são preenchidos. | packages/credit-playbook/src/executors/reconcile-financial-statements.ts | linhas 189-196 e 243-273 | Os testes cobrem base vazia, quatro uncovered_terms, ausência de pontes e ponte de juros não comparável. |
| confirmed | Uma identidade comparável que falha interrompe a conclusão normal. | packages/credit-playbook/src/executors/reconcile-financial-statements.ts | linhas 282-286 | O estado é identity_failed; blocked fica reservado à base vazia, conforme os outputs do método. |
| corrected | Tolerância zero com metadados de política inválidos é recusada. | packages/credit-playbook/src/executors/reconcile-financial-statements.ts | linhas 28-42 | A validação retorna imediatamente para zero. Execução adversarial aceitou fake.policy/fake.version e os reproduziu na saída, criando proveniência falsa. |
| corrected | O trace contém operandos ancorados, como prometido pelo método. | packages/credit-playbook/src/executors/reconcile-financial-statements.ts | linhas 143-168 e 188-266 | Calculation.operands contém somente strings; âncoras das derivações e linhas da ponte não entram no trace. Isso contradiz o método, linhas 77 e 84, e o contrato de evidência, procedure-contract.ts linhas 57-58. |
| confirmed | Resultados mecânicos completos do gold fornecido ao executor. | packages/credit-playbook/src/executors/reconcile-financial-statements.ts | linhas 198-292 | Spreads: dividendos 97.502; estoques 651.378; dívida líquida release 23; release versus contratual 14.077. Resíduos: -40 e 37. Identidades: balanço 0, dívida 0, caixa 0, juros 1.811. Não há percentuais ou headroom no contrato de saída. |
| confirmed | As mutações implementadas nos testes passam. | packages/credit-playbook/src/executors/reconcile-financial-statements.test.ts | linhas 60-145 | Vitest executado: 5 testes passaram. Há cobertura de escala em uma linha, fonte mutada, ajuste invertido, explicação parcial, data, definiçãoKey, annualized/LTM, duplicatas, política positiva inválida, unidade, base vazia e ausência de pontes. |
| corrected | As mutações do gabarito estão integralmente cobertas. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 10, 11.6 e 13.4 | Não há testes para covenant rompido, EBITDA contratual, degraus condicionais, arrendamento, pro forma tratado como cálculo próprio ou headroom. Também faltam as mutações de componente desconhecido, política falsa com tolerância zero e a ponte omitida de estoques. |
| confirmed | As vinte permutações provam consistência para contas, fontes, explicações, linhas, componentes de pairedAccounts, tolerâncias e chaves de objeto. | packages/credit-playbook/src/executors/reconcile-financial-statements.test.ts | linhas 147-161 | Também confirmam que o outputFingerprint muda quando a descrição material muda e que inclui os cálculos e o inputFingerprint. |
| corrected | O executor é determinístico sob toda ordem de entrada semanticamente irrelevante. | packages/credit-playbook/src/executors/reconcile-financial-statements.ts | linhas 173-182 e 261-271 | Os componentes de interestBridge não são canonicalizados. Inverter interest, monetary_variation alterou a mensagem e ambos os fingerprints, embora a comparação econômica permanecesse igual; essa permutação não está nos vinte testes. |
| confirmed | A revisão é registro por modelo, não aprovação humana. | packages/credit-playbook/src/procedure-contract.ts | linhas 158-167 |  |

## Condições

- A inclusão de arrendamentos em outra dívida onerosa exige especialista jurídico; escritura_13a_emissao.txt, definição de Dívida Líquida, p. 7, e gc01-gabarito-rascunho.md, linhas 148-151.
- A divergência de dividendos só pode ser encerrada por conciliação da companhia; 01_ITR_1T26_31mai2026.txt, notas 18(e) e 25, pp. 46 e 51.
- As tolerâncias 1.000/2.000 não são verificáveis no material autorizado; reconcile-financial-statements.test.ts, linha 16, e método, linhas 46-48.
- Qualquer conclusão sobre EBITDA, degrau aplicável ou headroom permanece condicionada à abertura do EBITDA e à prova de quitação ordinária dos CRA; gc01-gabarito-rascunho.md, linhas 366-388.

## Notas do revisor

Codex (GPT-5), usando shell local, SHA-256, Vitest e execuções tsx; sem internet.

Falha por correções materiais: o gold omite a ponte de estoques de 75.418; dividendos contábeis comparáveis são escondidos por not_comparable; validação de componentes e política zero é contornável; o trace não ancora operandos; e a ordem de componentes da ponte de juros altera saída e fingerprints.
