# Revisão independente por IA: método compare-refinancing-before-after v2026.09.05-v6

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-compare-refinancing-before-after-2026-09-05-05-36-20, commit f1c3864. Fingerprint 4cfcf7212bfbae3f539992f2df3ab6a1c47d7480789c3924088479972dca4433.

Resultado: **fail**. Evidências: 16 confirmed, 7 corrected, 3 unverifiable, 1 limitation.

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
| confirmed | 1. O corpus utilizado está íntegro segundo o manifesto. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries; hashes SHA-256 | Os hashes recalculados dos 42 arquivos coincidem com o manifesto. |
| confirmed | 2. Data-base, unidade, dívida bruta e cronograma do teste gold vêm do ITR. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, pp. 39-40 | R$ mil; dívida 5.670.186; períodos 1.229.828, 776.868, 1.228.475, 694.497, 994.544 e 809.198; ajuste −63.224. |
| confirmed | 3. Caixa dedutível e derivativos usados no gold são suportados. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | notas 3 e 25, pp. 20 e 51 | Caixa 1.430.714 + aplicações 25.095 = 1.455.809; derivativo passivo 14.335 e ativo 235. |
| corrected | 4. Os valores 306.038 e 438.918 são tratados pelo fixture como principal retirado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 39 | A fonte os apresenta como saldos contábeis das séries, não como principal contratual. O executor subtrai esses saldos integralmente como principal sem reconciliação com valor nominal, remuneração acumulada ou custos. |
| confirmed | 5. Dívida líquida contratual e EBITDA implícito do gold. | docs/product/gold-cases/gc01-gabarito-rascunho.md | §5, linhas 124-155 | 5.670.186 + 14.335 − 235 − 1.455.809 = 4.228.477; 4.228.477 / 4,72 = 895.863,771186, arredondado no teste para 895.864. |
| confirmed | 6. Snapshot anterior recalculado. | packages/credit-playbook/src/executors/compare-refinancing-before-after.test.ts | linhas 55-66 | Dívida líquida simples 4.214.377; contratual 4.228.477; alavancagem 4,71999879x; pico 2026/27; participação 1.229.828 / 5.670.186 = 0,21689377. |
| confirmed | 7. O cronograma anterior concilia. | packages/credit-playbook/src/executors/compare-refinancing-before-after.ts | linhas 189-192 | Soma dos seis períodos = 5.733.410; menos o ajuste de 63.224 = 5.670.186. |
| unverifiable | 8. Custo existente de 12,46%. | docs/product/gold-cases/gc01-gabarito-rascunho.md |  | O corpus não contém o numerador 706.751 nem sustenta a base descrita no fixture como proveniente do “caso 02”. |
| corrected | 9. Termos da nova dívida: 745.000, 14,5%, 60 meses, 24 meses de carência e fee de 1%. | docs/product/gold-cases/runs/gc01/ai-review-corpus/anbima_ettj_2026-09-04.csv | linhas 1-25 | A fonte contém somente curvas ETTJ; não contém uma proposta com esses termos. Usá-la como âncora da nova dívida não satisfaz a proveniência declarada. |
| unverifiable | 10. Fee de caixa de 1.500 e prêmios de saída de 2.448 e 5.266. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries | Os documentos citados pelo teste, 03_Pedido_Simulado_CRA_2026.docx e exit-costs-gc01.json, não fazem parte do corpus permitido. |
| confirmed | 11. Regra do prêmio das séries DI. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.18.1 | Prêmio de 0,40% a.a., pro rata, base 252 dias úteis restantes; o valor monetário exige contagem de dias úteis da data de saída. |
| confirmed | 12. Pro forma da alternativa extend-di, condicionado aos inputs não verificáveis. | packages/credit-playbook/src/executors/compare-refinancing-before-after.ts | linhas 235-246 | Principal retirado 306.038 + 438.918 = 744.956; dívida após = 5.670.230; caixa após = 1.455.809 + 44 − 7.714 − 7.450 − 1.500 = 1.439.189; dívida líquida contratual = 4.245.141; alavancagem = 4,73859983x. |
| confirmed | 13. Concentração da alternativa extend-di. | packages/credit-playbook/src/executors/compare-refinancing-before-after.test.ts | linhas 78-94 e 138-143 | SAC gera 36 parcelas de 20.694,44444444; 8/12/12/4 parcelas nos quatro últimos buckets. Consolidados recalculados: 1.229.828; 776.868; 1.087.992,55555556; 503.912,33333333; 1.242.877,33333333; 891.975,77777778. Pico após = 0,21919346, pior que o status quo de 0,21689377; ranking status-quo, extend-di confere. |
| confirmed | 14. Serviço e all-in da nova dívida, condicionado aos termos do cenário. | packages/credit-playbook/src/executors/compare-refinancing-before-after.ts | linhas 258-287 | Taxa mensal efetiva 0,01134762; juros totais 359.294,01825; pico de serviço 29.148,42134444; vida média 42,5 meses; all-in simplificado = 0,145 + [0,01 + (7.714 + 1.500)/745.000]/5 = 0,1494736. |
| confirmed | 15. Definições contratuais de dívida líquida, EBITDA, medição e degraus. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definições, p. 7; cláusula 7.24.3(VIII) | A escritura define dívida líquida com derivativos, caixa e aplicações; EBITDA de doze meses; apuração anual; degraus de 3,50x e 4,00x condicionados à quitação dos CRA. |
| corrected | 16. Representação dos covenants pelo executor. | packages/credit-playbook/src/executors/compare-refinancing-before-after.ts | linhas 64-75 e 181-216 | O schema aceita somente um instrumento, um limite e um tier. O gabarito exige reconciliar as quatro escrituras e dois degraus; portanto o executor não representa nem testa integralmente a definição do caso gold. |
| confirmed | 17. Headroom do gold e mutação resolvida. | packages/credit-playbook/src/executors/compare-refinancing-before-after.test.ts | linhas 107-129 | No gold, estado e comparabilidade condicionais produzem null. Na hipótese artificial resolvida, 4 − 4,71999879 = −0,71999879, corretamente rotulado como leitura interina, não rompimento. |
| corrected | 18. Parcelamento da 13ª emissão, 2ª série. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.7.2 e 7.8.2 | A cláusula 7.7.2 ancora o vencimento final; a primeira amortização em 14/11/2029 está na cláusula 7.8.2. O fixture atribui ambas as parcelas à cláusula errada e divide o saldo contábil ao meio sem provar o principal contratual. |
| confirmed | 19. Exceções por saída sem preço, custos desconhecidos e cronograma inconciliado. | packages/credit-playbook/src/executors/compare-refinancing-before-after.test.ts | linhas 131-167, 170-240 | Saída não precificada bloqueia a alternativa; uncoveredTerms vira insufficient_evidence; fee desconhecido deixa all-in nulo; cronograma inconciliado bloqueia tudo; não há preenchimento automático. |
| corrected | 20. Evidência da cobertura de principal por período. | packages/credit-playbook/src/executors/compare-refinancing-before-after.ts | linhas 61-62 e 295-302 | cfadsByPeriod contém números sem âncoras. O executor calcula cobertura material e a registra no trace sem fonte, contrariando a exigência do método de âncora para cada operando. |
| confirmed | 21. Mutações adversariais cobertas pelos testes. | packages/credit-playbook/src/executors/compare-refinancing-before-after.test.ts | linhas 147-250 | Há cobertura para ranking sem discriminador, comparação indevida de custos, saída não permitida, preço junto de lacuna, escala relabelada, EBITDA de período curto, data inválida, limite acima de 1 e principal fora do cronograma. |
| corrected | 22. Mutações adversariais do gabarito ainda não cobertas. | docs/product/gold-cases/gc01-gabarito-rascunho.md | §10, §11.6 e §13.4 | Não há teste contra inclusão declarada de arrendamento, dívida líquida do release, 4,00x como único covenant, 3,50x sem reconciliação, prêmio de 0,40% tratado como flat, fonte de termos incompatível ou captação apenas autorizada. |
| corrected | 23. Períodos com a mesma data final. | packages/credit-playbook/src/executors/compare-refinancing-before-after.ts | linhas 165 e 193-200 | A ordenação é determinística, mas periodOf escolhe lexicograficamente o primeiro bucket com a mesma data. O teste verifica apenas fingerprints e não detecta a alocação econômica arbitrária. |
| confirmed | 24. Determinismo por ordem de entrada e fingerprint. | packages/credit-playbook/src/executors/compare-refinancing-before-after.test.ts | linhas 252-273 | Os testes passaram para inversões de alternativas, séries retiradas, cronograma, uncoveredTerms e ordem de chaves; fingerprints de entrada e saída permaneceram iguais. Não permutam as parcelas internas nem verificam semanticamente buckets sobrepostos. |
| confirmed | 25. Contrato de maturidade e natureza desta revisão. | packages/credit-playbook/src/procedure-contract.ts | linhas 12-20 e 153-177 | implemented exige executor; revisão independente é registro por modelo, não aprovação humana. |
| limitation | 26. Interpretação de arrendamentos na dívida onerosa. | docs/product/gold-cases/gc01-gabarito-rascunho.md | condição 1; §5, linhas 148-151 | A inclusão requer interpretação jurídica especializada; o executor não possui campo para carregar essa condição junto da dívida contratual. |
| unverifiable | 27. Limiar de parede de 20%. | packages/credit-playbook/src/executors/compare-refinancing-before-after.test.ts | linha 48 | O fixture declara policy.structure.maturity_wall@2026.09.05-v8, mas nenhuma fonte dessa política integra o material permitido. |

## Condições

- Substituir os termos indicativos e custos sintéticos por fontes incluídas no corpus, ou marcá-los explicitamente como cenários não verificados; ver itens 9 e 10.
- Reconciliar saldo contábil, principal contratual e preço de saída por série antes de recalcular o pro forma; ver itens 4, 11 e 18.
- Representar todos os instrumentos, degraus e estados de comparabilidade aplicáveis; ver itens 15-17 e 22.
- Adicionar âncoras aos CFADS e demais operandos materiais; ver item 20.
- Manter a inclusão de arrendamentos como questão jurídica condicionada até revisão especializada; ver item 26.

## Notas do revisor

OpenAI Codex, modelo GPT-5, com inspeção e execução local via shell.

Falha material pelos itens 4, 9, 16, 18, 20, 22 e 23. A aritmética interna confere quando condicionada aos inputs, e os testes locais passaram, mas o caso gold não está integralmente sustentado nem modelado.
