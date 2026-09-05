# Revisão independente por IA: método compare-refinancing-before-after v2026.09.05-v3

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-compare-refinancing-before-after-2026-09-05-04-14-29, commit b849a68. Fingerprint 1fc06dbb61a4314d3b153871078ca8c93b420e9cfaa4304cb17cbb6b56cc6d8e.

Resultado: **fail**. Evidências: 15 confirmed, 8 corrected, 4 unverifiable, 2 limitation.

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
| confirmed | 1. O corpus utilizado corresponde ao manifesto congelado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | schemaVersion, caseId e entries | Todos os arquivos do manifesto passaram na verificação SHA-256. |
| confirmed | 2. Dívida bruta de 5.670.186, em R$ mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 39, linhas 21-52 | O total consolidado é 5.670.186. |
| confirmed | 3. Cronograma: 1.229.828; 776.868; 1.228.475; 694.497; 994.544; 809.198; ajuste de -63.224. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 40, linhas 23-35 | Soma dos vencimentos = 5.733.410; após -63.224 = 5.670.186. |
| corrected | 4. Caixa/aplicações de 1.455.809 e derivativos passivo/ativo de 14.335/235. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 25, p. 51, linhas 34-55 | Os valores conferem: 1.430.714 + 25.095 = 1.455.809. Porém o teste ancora caixa e derivativo ativo na p. 8 e passivo na p. 9; essas páginas não contêm os números. A âncora correta é p. 51. |
| confirmed | 5. Dívida líquida contratual de 4.228.477. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 124-140 | Recálculo: 5.670.186 + 14.335 - 235 - 1.455.809 = 4.228.477. |
| confirmed | 6. EBITDA implícito 895.864, alavancagem 4,71999879x e headroom hipotético de -0,71999879x contra 4,00x. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 137-155 | 4.228.477 / 4,72 = 895.863,771..., arredondado a 895.864; 4.228.477 / 895.864 = 4,71999879x; 4,00 - 4,71999879 = -0,71999879x. No gold, o executor corretamente deixa headroom nulo por comparabilidade condicional. |
| confirmed | 7. Pico antes em 2026/27, com participação 0,21689377. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 40, linhas 27-35 | 1.229.828 / 5.670.186 = 0,21689377. O pico de 2028/29 é ligeiramente menor: 1.228.475. |
| unverifiable | 8. Custo existente de 0,1246, atribuído a 706.751 / 5.670.186. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 1-13; nenhuma ocorrência de 706.751 ou 0,1246 | A divisão resulta em 0,12464335, compatível com 0,1246, mas 706.751 e sua base não aparecem no material permitido. |
| unverifiable | 9. Termos da nova dívida: 745.000, 14,5%, 60 meses, 24 de carência, SAC, fee de 1% e custo adicional de 1.500. | docs/product/gold-cases/runs/gc01/ai-review-corpus/anbima_ettj_2026-09-04.csv | linhas 1-25 e 73-84 | A curva não sustenta montante, formato, carência, fee ou custo de 1.500. A taxa prefixada de cinco anos indicada na curva é 14,4051%, não uma proposta de 14,5%. O arquivo 03_Pedido_Simulado_CRA_2026.docx citado pelo teste não integra o corpus. |
| unverifiable | 10. Prêmios de saída de 2.448 e 5.266, totalizando 7.714. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.2, linhas 390-414 | A soma 2.448 + 5.266 = 7.714 confere, mas o corpus fornece apenas a fórmula de 0,40% a.a., base 252. O arquivo exit-costs-gc01.json citado pelo teste não integra o corpus e faltam data efetiva, dias úteis e base monetária completa para refazer os prêmios. |
| corrected | 11. A 13ª série DI sai de 2028/29; a 14ª série DI sairia de 2030/31. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_14a_emissao.txt | cláusula 7.7.1, linhas 1223-1232 | A 14ª, 1ª série vence em 14/06/2029, portanto pertence a 2029/30, não 2030/31. A 13ª vence em 14/11/2028 pela cláusula 7.7.1 da escritura_13a_emissao.txt, linhas 1185-1194. O teste também cita incorretamente a cláusula 4.1. |
| confirmed | 12. Posição pro forma produzida pelo executor. | packages/credit-playbook/src/executors/compare-refinancing-before-after.test.ts | linhas 65-81 | Condicional aos inputs não verificáveis: principal retirado = 306.038 + 438.918 = 744.956; dívida bruta depois = 5.670.186 + 745.000 - 744.956 = 5.670.230; fee upfront = 7.450; caixa depois = 1.455.809 - 7.714 - 7.450 - 1.500 = 1.439.145; dívida líquida simples = 4.231.085; contratual = 4.245.185; alavancagem = 4,73864895x. |
| confirmed | 13. Serviço da nova dívida e all-in produzidos pelo executor. | packages/credit-playbook/src/executors/compare-refinancing-before-after.ts | linhas 208-220 | Condicional aos termos não verificáveis: taxa mensal efetiva arredondada = 0,01134762; 36 parcelas SAC de principal; juros totais = 359.294,01825; serviço total = 1.104.294,01825; pico = 29.148,42134444; vida média = 42,5 meses; all-in = 0,145 + [0,01 + (7.714 + 1.500)/745.000]/5 = 0,14947356. |
| confirmed | 14. Distribuição do principal novo pelos períodos. | packages/credit-playbook/src/executors/compare-refinancing-before-after.test.ts | linhas 74-81 | Condicional aos termos indicativos: 8/12/12/4 parcelas geram aproximadamente 165.555,56; 248.333,33; 248.333,33; 82.777,78. O executor soma principal previamente arredondado e perde 0,00000016, não detectado pelo teste de duas casas. |
| corrected | 15. Concentração e ranking gold: extend-di supera status-quo. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 11.1, linhas 242-256 | Corrigindo a 14ª série para 2029/30, os consolidados relevantes são 503.912,33333333 em 2029/30 e 1.242.877,33333333 em 2030/31. O novo pico é 0,21919346, pior que os 0,21689377 do status quo. A ordem correta, mantendo os demais inputs, é status-quo e depois extend-di. |
| corrected | 16. Valores apresentados no ranking representam o discriminador declarado. | packages/credit-playbook/src/executors/compare-refinancing-before-after.ts | linhas 241-256 | Para custo, concentração, pico e dívida líquida, o executor expõe o score negado como value. No gold mostra -0,21689208 em vez da concentração positiva 0,21689208. O sinal é mecanismo interno de ordenação, não o valor econômico declarado. |
| confirmed | 17. Definições de dívida líquida e EBITDA codificadas. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.1, linhas 366-388 | A fórmula do executor inclui dívida bruta, derivativos passivos/ativos, caixa e aplicações; EBITDA exige base declarada e valor positivo. Arrendamentos permanecem fora, coerentemente com a limitação registrada. |
| corrected | 18. Representação de covenant, degraus e comparabilidade é suficiente para o caso. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.1, linhas 368-388 | O schema contém apenas um limite, sem instrumento, degrau, data de medição ou condição de quitação. O campo passes também pode sugerir cumprimento jurídico numa data interina, embora 4,72x em 31/05 não seja rompimento: a medição é anual. O gold evita o erro apenas marcando comparabilidade condicional. |
| confirmed | 19. Cobertura de principal não é preenchida sem geração de caixa por período. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 6, linhas 176-183 | No gold, todas as coberturas ficam null e unsupported registra a insuficiência. No teste com CFADS parcial, somente os períodos fornecidos são calculados. |
| confirmed | 20. Série retirada sem preço bloqueia a alternativa e uncoveredTerms permanece insufficient_evidence. | packages/credit-playbook/src/executors/compare-refinancing-before-after.ts | linhas 183-188 | retire-ipca fica bloqueada, sem after, concentração ou serviço; ipca_exit_quote é carregado sem preenchimento. A alternativa bloqueada também sai do ranking. |
| confirmed | 21. Cronograma não conciliado bloqueia toda a comparação. | packages/credit-playbook/knowledge/procedures/refinance/compare-refinancing-before-after.md | linhas 57-69 e 82-96 | Sem o ajuste de -63.224, a soma é 5.733.410 contra 5.670.186; o executor bloqueia o estado global e todas as alternativas. |
| corrected | 22. Principal posterior ao último período datado exige bucket aberto. | packages/credit-playbook/knowledge/procedures/refinance/compare-refinancing-before-after.md | linhas 57-64 | O executor, linhas 151-156, joga pagamentos posteriores no último período datado quando não existe bucket aberto. A mutação executada permaneceu compared e agregou as quatro parcelas finais a 2030/31; deveria bloquear ou exigir bucket aberto. |
| corrected | 23. Mutação de escala milhares por milhões é recusada. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 10, linhas 228-232 | Alterar apenas unit de BRL thousand para BRL million é aceito e mantém 5.670.186, produzindo uma afirmação econômica mil vezes maior. O teste cobre somente a grafia inválida BRL thousands. |
| limitation | 24. Mutações de degrau, prêmio flat e carência de saída são cobertas neste executor. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.4, linhas 424-429 | O executor confia em limit, comparability e exitPremium já resolvidos; não recebe mecanismo, data de saída, dias úteis ou degrau. Os testes não provam resistência a 3,50x indevido, 4,00x incondicional ou prêmio flat. |
| confirmed | 25. Consistência do caso gold sob permutações e ordem de chaves. | packages/credit-playbook/src/executors/compare-refinancing-before-after.test.ts | linhas 174-184 | As 20 permutações reproduzem inputFingerprint dda0d5180dc8f5e342f39a367c9e59a451fac2cd891e211a2411b3c595791ea5 e outputFingerprint f55764f263bad12e430ac39c3e3fc656829798183f323ed3f80c937cf084e19b. |
| corrected | 26. O executor é determinístico para toda entrada aceita, independentemente da ordem. | packages/credit-playbook/src/executors/compare-refinancing-before-after.ts | linhas 121-131 | scheduleOrder não desempata períodos distintos com o mesmo endsAt. Revertendo duas linhas aceitas com a mesma data final, os fingerprints de entrada mudaram de 8a7bd13e... para c0f6b7e4... e os de saída de 3f1efdc7... para 6aca8841.... Os testes usam apenas datas finais distintas. |
| unverifiable | 27. As âncoras das alternativas e custos pertencem ao corpus gold. | packages/credit-playbook/src/executors/compare-refinancing-before-after.test.ts | linhas 34-44 | release_1T26.pdf, exit-costs-gc01.json e 03_Pedido_Simulado_CRA_2026.docx não são entradas do manifesto. O teste gold não prova a origem material desses operandos. |
| limitation | 28. Questões jurídicas remanescentes podem ser decididas por esta revisão. | docs/product/gold-cases/gc01-gabarito-rascunho.md | condições 1-3, linhas 5-14; seção 13.1, linhas 376-388 | Inclusão de arrendamentos, quitação ordinária dos CRA de referência e comparabilidade integral do EBITDA exigem, respectivamente, interpretação especializada ou evidência adicional. |
| confirmed | 29. O registro é revisão independente por modelo, não aprovação humana. | packages/credit-playbook/src/procedure-contract.ts | linhas 157-177 | O contrato exige retorno às fontes, recálculo, definições, exceções, adversarial e consistência, e distingue expressamente a revisão de aprovação humana. |

## Condições

- Corrigir o vencimento e o bucket da 14ª, 1ª série, recalcular a concentração e inverter o ranking gold.
- Substituir ou remover âncoras ausentes do manifesto e fornecer fontes verificáveis para termos da nova dívida, custo existente, fees e prêmios de saída.
- Bloquear pagamentos posteriores ao último período quando não houver bucket aberto.
- Expor no ranking o valor econômico positivo e separar esse valor do score interno de ordenação.
- Tornar a canonicalização determinística quando dois períodos tiverem o mesmo endsAt e adicionar o contraexemplo ao teste de consistência.
- Cobrir as mutações de escala, degrau, comparabilidade, prêmio flat e janela de saída.
- Preservar como condições a interpretação de arrendamentos, a prova de quitação dos CRA e a abertura do EBITDA contratual.

## Notas do revisor

OpenAI Codex (GPT-5), com shell local, aritmética Decimal e Vitest; revisão por modelo, sem aprovação humana.

Os nove testes atuais passam, mas não detectam erros materiais de fonte, bucket, ranking e determinismo. A aritmética interna confere quando condicionada aos inputs fornecidos; o caso não constitui prova gold válida enquanto esses pontos permanecerem.
