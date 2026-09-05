# Revisão independente por IA: método build-debt-ledger v2026.09.05-v5

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-build-debt-ledger-2026-09-05-03-02-08, commit 8bf52d7. Fingerprint 9e1648e5e1aff815be1ab4274eeca661e91d014ea697586fdf2c8b5ed59f7a4f.

Resultado: **fail**. Evidências: 24 confirmed, 3 limitation, 1 unverifiable, 4 corrected.

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
| confirmed | 1. O corpus corresponde ao manifesto congelado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries, linhas 5–220 | Todos os arquivos produziram exatamente o SHA-256 registrado. |
| confirmed | 2. Os 18 saldos correntes e anteriores usados nas linhas do gold estão nas demonstrações. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | p. 39, nota 15, tabela por instrumento e série | Conferidos individualmente: quatro empréstimos, dois custos contra, duas séries da 11ª, três da 13ª, três da 14ª e quatro da 15ª. |
| confirmed | 3. Circulante 1.229.828, não circulante 4.440.358 e dívida reportada 5.670.186 em 31/05/2026; dívida anterior 4.988.383. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | p. 12, balanço consolidado; p. 39, nota 15 | 1.229.828 + 4.440.358 = 5.670.186. |
| confirmed | 4. O cronograma gold contém 1.229.828, 776.868, 1.228.475, 694.497, 994.544, 809.198 e custo de (63.224). | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | p. 40, nota 15, cronograma de amortizações | A soma independente é 5.670.186; o primeiro período coincide com o circulante. |
| confirmed | 5. Caixa 1.430.714, aplicações 25.095, derivativos ativos 235 e passivos 14.335. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | pp. 11–12, balanço; p. 20, nota 3; p. 51, nota 25 |  |
| confirmed | 6. O release reporta dívida líquida de R$ 4.214,4 milhões. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ri_release_1t26.txt | p. 12, tabela Endividamento e Caixa | A tabela também mostra dívida bruta 5.670,2 e caixa mais aplicações 1.455,8. |
| confirmed | 7. Vencimento e remuneração da 11ª: 30/10/2028 e 100% do CDI + 1,55% a.a. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_11a_emissao.txt | p. 1, vencimento; p. 2, remuneração das séries |  |
| confirmed | 8. Vencimentos e remunerações das três séries da 13ª usados no gold. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_13a_emissao.txt | pp. 2–4, características das séries | Confirmados CDI + 0,65%, IPCA + 6,3416% e IPCA + 6,5264%, com os respectivos vencimentos. |
| confirmed | 9. A 3ª série da 14ª vence em 15/06/2034 e remunera IPCA + 6,9982% a.a.; os demais termos também conferem. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_14a_emissao.txt | pp. 2–4, características das séries | As páginas usadas pelo teste correspondem às páginas de cada série. |
| confirmed | 10. Os termos das quatro séries da 15ª, inclusive prefixada 14,15% e 4ª série vencendo em 16/11/2035, conferem. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_15a_emissao.txt | pp. 2–5, características das séries |  |
| confirmed | 11. Securitizadora como titular formal, orientação pelos titulares de CRA e garantia da controladora para dívidas externas têm suporte documental. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_14a_emissao.txt | p. 3, considerando D; p. 55, cláusula 7.26.5 | A garantia externa também consta da nota 15, p. 40; a 292ª explicita a orientação na cláusula 17.8.8. |
| limitation | 12. A qualificação jurídica final de “credor econômico” não é decidida pelo corpus. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.5, linhas 418–431 | Os fatos de titularidade e orientação estão documentados; a qualificação jurídica exige revisão especializada. |
| confirmed | 13. Totais recalculados do ledger. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 41–60 e 93–118 | Atual: 5.670.186; anterior: 4.988.383; antes das linhas contra: 5.742.510. Custos contra: 9.099 + 63.225 = 72.324; 5.742.510 − 72.324 = 5.670.186. |
| confirmed | 14. Cronograma e percentuais recalculados. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 263–282 | Participações: 21,689377%; 13,700926%; 21,665515%; 12,248223%; 17,539883%; 14,271102%; custo −1,115025%. Diferença do primeiro período para o circulante: zero. |
| confirmed | 15. As duas visões de dívida líquida e a diferença para o release foram recalculadas. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 287–321 | Release: 5.670.186 − 1.430.714 − 25.095 = 4.214.377. Contratual: 5.670.186 + 14.335 − 235 − 1.430.714 − 25.095 = 4.228.477. Reportado menos recalculado: 4.214.400 − 4.214.377 = 23. |
| confirmed | 16. Estoques por indexador e participações foram recalculados. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 47–58 e 111–130 | CDI 2.172.858 (37,838123%); IPCA 743.955 (12,955223%); prefixada 408.703 (7,117149%); desconhecido 2.416.994 (42,089504%). Soma arredondada: 99,999999%. |
| confirmed | 17. Estoques por moeda e participações foram recalculados. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 42–60 e 114–117 | BRL 4.639.928 (80,799650%); CLP 54.180 (0,943490%); PEN 181.158 (3,154683%); USD 867.244 (15,102177%). Moedas estrangeiras: 1.102.582. |
| unverifiable | 18. O texto “dívida bruta menos caixa e aplicações financeiras” é apresentado pelo teste como definição literal do release. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ri_release_1t26.txt | p. 12, tabela Endividamento e Caixa | A tabela sustenta numericamente a fórmula, mas o texto literal fornecido pelo teste não aparece no documento. |
| corrected | 19. O gold retorna estado complete embora o método exija definição literal para cada visão. | packages/credit-playbook/knowledge/procedures/financial/build-debt-ledger.md | sequência 5 e Outputs, linhas 59 e 88–90 | Sem fonte literal para a definição do release, o contrato escrito determina que essa visão não seja produzida e o estado deveria ser incomplete, salvo se o método declarar que a estrutura da tabela vale como definição literal. |
| confirmed | 20. A definição contratual executada corresponde literalmente à escritura da 13ª. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | p. 7, definição de Dívida Líquida | Ela soma empréstimos, financiamentos, debêntures, derivativos passivos e residual oneroso; deduz disponibilidades, aplicações e derivativos ativos. |
| limitation | 21. EBITDA, degraus de 3,50x/4,00x e comparabilidade integral não são calculados por este executor. | packages/credit-playbook/knowledge/procedures/financial/build-debt-ledger.md | Gold, linha 102 | O método delega headroom e covenant a reconcile-covenant-definitions. As escrituras confirmam os degraus e a definição-base, mas o ITR não abre o EBITDA pro forma integral. |
| confirmed | 22. Linhas contra são negativas, não são obrigações e reduzem a visão contábil reportada. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 53–78 e 222–229 | O teste também confirma obligation=null para custos de transação. |
| confirmed | 23. Termos ausentes ficam em uncoveredTerms como insufficient_evidence e não recebem valores inventados. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 340–350 | Empréstimos permanecem sem remuneração, vencimento e credores; moeda não é convertida em indexador. |
| confirmed | 24. Ausência integral de cronograma, definição ou caixa gera incomplete; release sem nota, silêncio e contradições geram blocked. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 231–260, 263–315 e 352–356 | Nenhum desses caminhos preenche o dado faltante. |
| limitation | 25. Base de caixa parcialmente disponível não possui representação estruturada de insuficiência. | packages/credit-playbook/src/executors/build-debt-ledger.ts | schema de cash, linhas 106–111 | Omitir apenas aplicações ou derivativos causa erro de validação, não incomplete/insufficient_evidence; o contrato precisa definir se entradas parciais são permitidas. |
| confirmed | 26. As mutações adversariais declaradas e cobertas pelos testes passam. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 163–280 | Incluem escala, split compensatório, primeiro período, definição contraditória simples, silêncio, release-only, âncoras, linha contra, desembolso, duplicidade e tolerância. |
| corrected | 27. O verificador de definição não garante concordância integral entre texto e fórmula. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 173–198 e 287–303 | Mutações independentes “dívida menos caixa” e “derivativos ativos” somados/“passivos” deduzidos foram aceitas como complete. A fórmula ainda deduziu aplicações e inverteu os derivativos. Os testes não cobrem ausência de aplicações nem troca ativo/passivo. |
| corrected | 28. Um arrendamento contratual corretamente ancorado contamina a conciliação contábil reportada. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 223–258 e 287–304 | Mutação independente com dívida reportada 100 e lease contratual 10 produziu grossDebt 110 e bloqueio contra balanço 100, embora as visões fossem release 100 e contratual 110. O executor precisa separar o total reportado das inclusões exclusivas da visão contratual. |
| corrected | 29. O executor aceita período anterior à data-base como “primeiro período dentro de doze meses”. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 270–280 | Mutação com período vencido em 31/05/2025 e período corrente em 31/05/2027 selecionou o vencido e bloqueou. Falta exigir endsAt > referenceDate; o teste cobre rótulos, mas não períodos passados. |
| confirmed | 30. A determinização declarada é provada para ordem de linhas, períodos, views e chaves de objetos. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 282–294 | Vinte permutações preservam os fingerprints de entrada e saída; ids duplicados são recusados. Isso não cobre todas as mutações semânticas, apenas ordem. |
| confirmed | 31. A suíte específica executa sem falhas. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 92–295 | Vitest local: 1 arquivo, 11 testes, 11 aprovados. |
| confirmed | 32. Este registro é revisão independente por modelo, não aprovação humana. | packages/credit-playbook/src/procedure-contract.ts | linhas 152–168 |  |

## Condições

- Definir formalmente se a tabela do release constitui uma definição literal; caso contrário, o gold não pode ser complete.
- Substituir a busca lexical da definição por validação completa dos operandos e das polaridades ativo/passivo.
- Separar reconciliação contábil de itens exclusivos da visão contratual, como eventual arrendamento.
- Excluir datas anteriores à data-base da seleção do primeiro período corrente.
- Definir o tratamento estruturado de componentes de caixa parcialmente ausentes.
- A inclusão de arrendamento como outra dívida onerosa e a qualificação jurídica de credor econômico continuam condicionadas a especialista.
- EBITDA, degraus, comparabilidade e headroom devem ser avaliados no executor de covenant; não são produzidos por build-debt-ledger.

## Notas do revisor

Codex (GPT-5), revisão por modelo com shell local, SHA-256, Node e Vitest; sem internet.

Os números do caso gold conferem. A reprovação decorre de comportamentos materiais nas definições, no tratamento de visão contratual exclusiva e na seleção temporal, além da inconsistência sobre a definição literal do release.
