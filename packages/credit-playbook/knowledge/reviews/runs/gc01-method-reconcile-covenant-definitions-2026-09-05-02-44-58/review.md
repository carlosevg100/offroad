# Revisão independente por IA: método reconcile-covenant-definitions v2026.09.05-v3

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-reconcile-covenant-definitions-2026-09-05-02-44-58, commit b1e4e84. Fingerprint 5e8bb82276375d11ae977bef0e9e3f193f973e606401beaf85db36dcd942b4a4.

Resultado: **fail**. Evidências: 22 confirmed, 9 corrected, 5 limitation.

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
| confirmed | 1.1 O corpus contém 43 arquivos e preserva os hashes e tamanhos declarados. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries, linhas 5-220 | Os 43 SHA-256 e tamanhos foram recalculados; nenhuma divergência. |
| confirmed | 1.2 A dívida bruta gold é 5.670.186 em R$ mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39 |  |
| confirmed | 1.3 Os derivativos são 14.335 no passivo e 235 no ativo. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 25, página 51 |  |
| confirmed | 1.4 Caixa e equivalentes são 1.430.714 e aplicações financeiras são 25.095. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 3, página 20; balanço consolidado, página 11 |  |
| confirmed | 1.5 O índice pro forma informado é 4,72x em 31/05/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 |  |
| confirmed | 1.6 Os degraus são 3,50x e 4,00x, com as referências e vencimentos usados no teste. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3(j), páginas 34-35 | 11ª: CRA da 8ª emissão, vencimento 15/04/2025. |
| confirmed | 1.7 Os degraus e referências da 13ª emissão conferem. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.24.3(VIII), páginas 54-55 | CRA da 5ª emissão em 16/04/2025 e CRA 257 em 29/12/2025. |
| confirmed | 1.8 Os degraus e referências da 14ª emissão conferem. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_14a_emissao.txt | cláusula 7.26.3(VIII), página 54 | CRA da 5ª emissão e CRA 257. |
| confirmed | 1.9 Os degraus e a referência da 15ª emissão conferem. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusula 7.26.3(VIII), página 56 | CRA 257, vencimento 29/12/2025. |
| corrected | 1.10 Diversas páginas gravadas pelo teste gold estão erradas. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 28-43 e 95-96 | 11ª: definições e ajustes estão na página 35, não 34; degrau 3,50x está na 34, não 33. 13ª: degrau 4,00x está na 55, não 54. 14ª: degrau 3,50x está na 54, não 53. 15ª: ambos os degraus estão na 56, não 55. Nas 13ª/14ª/15ª, Dívida Líquida está na página 7 e EBITDA na 8; um único definitionsAnchor não ancora ambos. |
| confirmed | 2.1 A dívida líquida recalculada é 4.228.477 para cada uma das quatro escrituras. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 116-127; seção 13.1, linhas 353-375 | 5.670.186 + 14.335 − 235 − 1.430.714 − 25.095 = 4.228.477. O executor repete a mesma visão quatro vezes. |
| confirmed | 2.2 O EBITDA implícito produzido pelo executor confere. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 348-353 | 4.228.477 ÷ 4,72 = 895.863,77118644, arredondado pelo executor para 895863.77118644. |
| confirmed | 2.3 A próxima medição gold é 28/02/2027. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 | A própria ITR declara essa data. |
| confirmed | 2.4 O caso gold não produz headroom ou percentual. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 81-98 | Os quatro limites ficam insufficient_evidence; headroom é null. |
| confirmed | 2.5 Os resultados hipotéticos do teste também fecham aritmeticamente. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 119-149 | 4,00 − 4,72 = −0,72; −0,72 ÷ 4,00 = −0,18; somar 100.000 de leases dá 4.328.477; retirar derivativos dá 4.214.377. |
| confirmed | 3.1 A definição-base de dívida líquida codificada corresponde às quatro escrituras. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 1.1, páginas 7-8; definição de Dívida Líquida | A mesma redação material aparece nas escrituras da 11ª, 14ª e 15ª. |
| limitation | 3.2 A definição-base de EBITDA confere; a 11ª acrescenta EBITDA adquirido e sellers finance. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3(j), página 35 | A escritura manda considerar sellers finance, mas não explicita no trecho a fórmula ou o lado aritmético. Classificá-lo definitivamente como numerator_obligation exige revisão especializada. |
| corrected | 3.3 O executor não registra sellers finance em legalConditions, embora o método o prometa. | packages/credit-playbook/knowledge/procedures/financial/reconcile-covenant-definitions.md | Outputs, linhas 78-82 | O código só adiciona condição jurídica para leases, nas linhas 290-293 do executor. |
| corrected | 3.4 No caminho calculado, declarar sellers finance em incorporatesAdjustments torna a comparação plena sem valor ou cálculo dessa obrigação. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 324-335 | Isso funde uma obrigação do numerador na declaração de EBITDA e pode emitir headroom sem calcular sellers finance; o próprio teste consagra esse comportamento nas linhas 151-163. |
| corrected | 3.5 O executor nomeia financial.debt_views e financial.net_leverage no trace sem executar essas rotinas pelo financial-core. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 301-326 | As contas são feitas diretamente com Decimal; o método exige essas ferramentas e sua aceitação diz que nada deve ser nomeado sem execução. |
| confirmed | 3.6 Residual não enumerado e EBITDA não aberto condicionam corretamente a comparação gold. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 287-318 e 337-354 | O residual é assumido zero de forma explícita e não há headroom. |
| corrected | 3.7 O gold omite da entrada o passivo de arrendamento conhecido de 276.768 e, por isso, não gera a condição jurídica real do caso. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 12 e nota 25, páginas 34 e 51 | O método manda condicionar arrendamento presente na base; componentValues do teste, linhas 21-27, não inclui a linha conhecida. |
| confirmed | 4.1 Base sem instrumentos bloqueia; relatório fiduciário sem escritura preserva a medição e não produz headroom. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 201-214 | Ambos os testes passaram. |
| confirmed | 4.2 Com instrumento mas sem componentes ou índice, o executor não inventa valores. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 293-319 e 321-355 | netDebt e index permanecem null/no_index e o estado é conditioned. |
| limitation | 4.3 Não existe campo uncoveredTerms no método nem no resultado deste executor. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | contrato de saída, linhas 147-174 | As lacunas aparecem em comparabilityReasons, unprovenConditions e legalConditions. O procedure-contract não impõe um campo chamado uncoveredTerms. |
| confirmed | 4.4 As oito condições gold e insufficient_evidence são coerentes com a ausência de prova de quitação ordinária. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.1, linhas 363-375 | O relatório do CRA 257 mostra saldo até novembro e vencimento, mas não prova liquidação. |
| confirmed | 5.1 Os testes cobrem relatório sem escritura, componentes diferentes, leases, retirada de derivativos, EBITDA fechado, datas divergentes, duplicidades, frequência, degrau isolado e base vazia. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 100-214 | A suíte executada passou com 13 de 13 testes. |
| corrected | 5.2 EBITDA aberto em data antiga é aceito como comparable e pode produzir headroom. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | schema e validação, linhas 101-140; comparação, linhas 337-365 | A validação não compara reported.ebitdaOpening.asOf com asOfDate e também não reconcilia netDebt/EBITDA com o índice reportado. |
| corrected | 5.3 Uma condição jurídica de leases não impede comparabilidade plena nem headroom quando o residual está enumerado. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 290-315 e 358-366 | A mutação local retornou comparability=comparable e headroom apesar de legalConditions não vazio. |
| corrected | 5.4 Liquidação acelerada sem data é aceita e aplicada ao degrau 3,50x. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 90-117 e 257-281 | Contraria a regra do método de resolver eventos contra fatos datados; apenas liquidação ordinária exige data no schema. |
| corrected | 5.5 Um instrumento marcado outstanding após o vencimento deixa ambos os degraus unproven. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 258-281 | A escritura encerra o degrau 3,50x na data de vencimento; outstanding prova falta de quitação para o 4,00x, mas não deveria apagar o vencimento do primeiro degrau. |
| limitation | 5.6 As mutações de escala e EBITDA trimestral anualizado do gabarito não são detectáveis pelo schema nem cobertas pelos testes. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 10, linhas 215-219 | A entrada não carrega unidade ou período econômico estruturado do EBITDA. |
| limitation | 5.7 Direção minimum, EBITDA zero, agregação de componentes com sinais opostos e virada de ano bissexto não têm cobertura adversarial. | packages/credit-playbook/knowledge/procedures/financial/reconcile-covenant-definitions.md | Testes Unit e Adversarial, linhas 90-100 | A suíte não exercita esses limites apesar de o método prometer direção mínima e máxima. |
| confirmed | 6.1 As vinte permutações preservam inputFingerprint e outputFingerprint. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 216-232 | O teste passou para instrumentos, fatos, linhas, ajustes, referências e componentes reportados. |
| limitation | 6.2 O outputFingerprint não inclui o trace de cálculos. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 382-392 | A prova de consistência cobre o corpo econômico, mas não certifica diretamente a identidade do trace nem estabilidade entre versões de runtime. |
| confirmed | 6.3 Esta revisão não constitui aprovação humana ou jurídica. | packages/credit-playbook/src/procedure-contract.ts | comentários e maturity ladder, linhas 9-16; reviews, linhas 181-193 | O contrato define ai_independent_review como verificação por modelo separada da aprovação do fundador. |

## Condições

- Corrigir as páginas e permitir âncoras distintas para Dívida Líquida, EBITDA, ajustes e cada degrau.
- Modelar sellers finance separadamente do EBITDA, com valor, evidência e condição jurídica; não resolver por incorporatesAdjustments.
- Incluir o arrendamento conhecido no gold e impedir headroom enquanto a condição jurídica afetar o numerador.
- Validar data e consistência aritmética do EBITDA aberto com o índice reportado.
- Exigir data para liquidação acelerada e corrigir a transição do degrau quando há vencimento com saldo outstanding.
- Executar financial.debt_views e financial.net_leverage pelo financial-core antes de nomeá-los no trace.
- Submeter a classificação jurídica de arrendamento e sellers finance a especialista.
- Adicionar testes para as mutações materiais não cobertas.

## Notas do revisor

Codex (GPT-5), revisão independente por modelo com leitura, busca, recálculo e execução local; sem internet.

Os valores centrais do gold e os hashes conferem, e a suíte passa. O resultado é fail porque há âncoras erradas e comportamentos capazes de declarar comparabilidade e headroom sem base temporal, jurídica ou aritmética suficiente.
