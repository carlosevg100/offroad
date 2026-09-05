# Revisão independente por IA: método estimate-exit-cost-by-series v2026.09.05-v3

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-estimate-exit-cost-by-series-2026-09-05-03-40-59, commit bfe8933. Fingerprint e1c3db8302657a402db8a2fe6ebdae4629f5d2d0a168c283a0ac5f857e26c95c.

Resultado: **fail**. Evidências: 14 confirmed, 14 corrected, 2 unverifiable, 2 limitation.

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
| confirmed | 1. Integridade do corpus gold. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries 1–43 | Os SHA-256 recalculados dos 43 arquivos coincidem com o manifesto. |
| confirmed | 2. Saldos usados: 13ª/1ª = 306.038; 13ª/2ª = 282.357; 15ª/1ª = 770.123; 11ª = 151.795 + 505.984 = 657.779, em R$ mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39 | 657.779 = 151.795 + 505.984. |
| corrected | 3. O teste trata esses saldos de 31/05/2026 como nominal em 04/09/2026. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 6–16 e 21–30 | A ITR ancora os valores em 31/05/2026; não há atualização até 04/09/2026. Declarar a hipótese não transforma saldo histórico em nominalAtExit. |
| confirmed | 4. DI da 13ª: janela em 14/05/2026 e prêmio de 0,40% a.a., base 252, pro rata pelos dias úteis restantes. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.16.1.1–7.16.1.2 e 7.18.1, páginas 39–43 |  |
| confirmed | 5. DI da 15ª: janela unilateral em 15/11/2027 e prêmio de 0,40% a.a. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusulas 7.16.1.1–7.16.1.2 e 7.18.1, páginas 37–43 |  |
| corrected | 6. Vencimentos usados para os dias úteis: 13ª/1ª = 16/11/2028 e 15ª/1ª = 18/11/2030. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.7.1, página 24; definição do vencimento do CRA na seção de definições | A debênture da 13ª/1ª vence em 14/11/2028; 16/11/2028 é o vencimento do CRA. A fórmula contratual usa o vencimento da debênture. |
| corrected | 7. Vencimento da 15ª/1ª usado como 18/11/2030. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusula 7.7.1, página 24 | O vencimento da debênture é 14/11/2030, não 18/11/2030. |
| corrected | 8. Ofertas negociadas da 13ª e da 15ª disponíveis desde 16/11/2023 e 18/11/2025. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.1.1 e 7.14.1, páginas 24 e 37 | A 13ª permite desde a Data de Emissão, 15/11/2023. Na 15ª, as cláusulas 7.1.1 e 7.14.1 dão 15/11/2025, não 18/11/2025. |
| unverifiable | 9. Contagens de 504 e 1.000 dias úteis. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | lista integral de entries; ausência de calendario_anbima_2026.csv | O calendário citado pelo teste não integra o corpus. Contagem própria de dias de semana dá 572 até 14/11/2028 e 1.094 até 14/11/2030, antes de feriados; não permite confirmar 504 ou 1.000. |
| confirmed | 10. Recálculo DI hipotético da 13ª/1ª. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 56–67 | Base 306.038; fator (1,004)^(504/252)-1 = 0,008016; prêmio = 2.453,200608; total = 308.491,200608. A aritmética confere, mas 504 dias, saldo na data, remuneração zero e encargos zero não estão comprovados. |
| confirmed | 11. Resultado do caso gold sem remuneração acumulada. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 166–224 | Quatro bases insufficient_evidence; estimated_premium = 0; estimated_payable = 0; series_estimated = 0; series_open = 4; state = partial. |
| confirmed | 12. Visão hipotética com remuneração zero. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 56–68 | Bases calculadas: 657.779, 306.038, 282.357 e 770.123; só a 13ª/1ª tem saída unilateral estimada, total 308.491,200608; prêmio agregado 2.453,200608; 1 série estimada e 3 abertas. |
| confirmed | 13. Recálculo do exemplo IPCA. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 70–87 | Base 282.357; max(282.357, 290.000) = 290.000 e diferença 7.643; resgate da 13ª pelo VP 280.000 e diferença -2.357; total agregado 280.000. |
| unverifiable | 14. Valores e cotações do exemplo IPCA. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries 1–43 | hipotetico_pu.pdf, hipotetico_vp.pdf e anbima_indicativa_hipotetica.csv não pertencem ao corpus. |
| corrected | 15. Base exige nominal, remuneração e encargos, sem preencher lacunas. | packages/credit-playbook/knowledge/procedures/refinance/estimate-exit-cost-by-series.md | linhas 61 e 84–85 | O executor, linhas 167–177, considera apenas nominal e remuneração obrigatórios e soma chargesAtExit ?? 0. Mutação com chargesAtExit=null retornou base priced e payable=100. |
| corrected | 16. Amortização extraordinária e resgate total DI são comparáveis como saídas integrais e têm o mesmo custo. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.18.1 e 7.18.1.5, páginas 43–44 | A amortização incide sobre uma parcela e está limitada a 98%; o executor não recebe a parcela, aplica a base inteira e pode escolhê-la como saída integral mais barata. |
| corrected | 17. Todo resgate total IPCA usa apenas VP e cotação do dia útil anterior. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_14a_emissao.txt | cláusulas 7.16.2.1–7.16.2.2, páginas 39–41 | Na 14ª, o resgate paga max(A,B) e usa o segundo dia útil anterior. A regra sem piso e com dia imediatamente anterior é particular da 13ª. |
| corrected | 18. A mesma regra genérica de resgate total IPCA serve à 15ª. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusulas 7.16.3.1–7.16.3.2, páginas 40–42 | A 15ª também exige max(A,B) e cotação do segundo dia útil anterior; o executor retornaria somente o VP. |
| corrected | 19. Série prefixada da 15ª está corretamente representada. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusulas 7.16.2.1–7.16.2.2 e 7.18.2–7.18.2.1, páginas 38–40 e 46 | O schema não possui mecanismos Pré; aceita curva Pré x DI dentro dos mecanismos denominados IPCA e aplicaria ao resgate total a fórmula errada, sem piso. |
| corrected | 20. O executor monta fluxos, calcula duration, escolhe o título/vértice e recalcula o VP. | packages/credit-playbook/knowledge/procedures/refinance/estimate-exit-cost-by-series.md | linhas 52–66 | O executor, linhas 43–56 e 193–199, apenas recebe presentValueAtQuote calculado upstream e aplica max/identidade; não recebe fluxos nem duration e não valida o VP. |
| corrected | 21. A cotação precisa ser exatamente do primeiro ou segundo dia útil contratual. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.16.2.2 e 7.18.2.1, páginas 40–45 | O executor só exige quoteDate < exitDate. Mutação com cotação um mês anterior e VP datado em 2020 foi aceita e estimada. |
| corrected | 22. O mecanismo unilateral mais barato é escolhido numericamente. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 210–219 | A ordenação compara strings. Mutação com totais 900 e 1000 escolheu 1000 como mais barato. |
| confirmed | 23. Falta de nominal ou remuneração gera uncovered_terms e insufficient_evidence sem fabricar preço. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 166–186 | O comportamento confere para nominal e remuneração; não confere para encargos, conforme claim 15. |
| confirmed | 24. Make-whole sem cotação/VP é bloqueado como insufficient_evidence. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 193–199 | O estado é correto; quando apenas um dos dois elementos falta, a razão diz incorretamente que nenhum está presente. |
| corrected | 25. Série sem escritura fica bloqueada. | packages/credit-playbook/knowledge/procedures/refinance/estimate-exit-cost-by-series.md | linhas 48–50, 76–77 e 101–102 | O schema exige apenas texto não vazio em anchor.document. Mutação com missing-escritura.pdf e cláusula inventada produziu preço; o teste não cobre ausência ou classe da fonte. |
| corrected | 26. O gold reproduz a seção 13.2 por família. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 12–35 e 39–87 | Não cobre a 14ª, 13ª/3ª, 15ª/2ª–4ª, fórmula Pré, nem resgates IPCA com piso da 14ª/15ª. |
| confirmed | 27. Mutações de prêmio flat, janela, saída negociada, duplicatas, prêmio negativo e data de valor. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 39–68 e 89–99 | Os testes resistem às mutações explicitamente exercidas; não cobrem encargos ausentes, calendário subcontado, data exata da cotação, VP mal datado, comparação lexical, piso da 14ª/15ª ou escritura fictícia. |
| confirmed | 28. Determinismo por ordem de entrada e fingerprints. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 108–119 | Vinte permutações de séries, mecanismos e chaves preservam os dois fingerprints. O código inclui calculations no outputFingerprint, mas o teste não prova sensibilidade a mutação do trace nem resistência a colisões. |
| confirmed | 29. A suíte indicada passa. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | testes 1–6 | Vitest: 1 arquivo, 6 testes, todos aprovados. |
| limitation | 30. Dívida líquida, EBITDA, degraus, comparabilidade, headroom e o sentido de “contra”. | packages/credit-playbook/knowledge/procedures/refinance/estimate-exit-cost-by-series.md | linhas 32–113 | Esses conceitos não são inputs, cálculos ou outputs deste executor; pertencem à dependência reconcile-covenant-definitions e não podem ser validados como definições deste método. |
| confirmed | 31. Natureza desta revisão. | packages/credit-playbook/src/procedure-contract.ts | linhas 158–168 | É ai_independent_review por modelo e não aprovação humana. |
| limitation | 32. Qualificação jurídica e exigibilidade das cláusulas. | packages/credit-playbook/knowledge/procedures/refinance/estimate-exit-cost-by-series.md | linhas 22–24 | O próprio método marca legal_review_required=true; esta revisão apenas confronta texto e implementação. |

## Condições

- O custo monetário gold permanece não verificável até haver nominal atualizado, remuneração, encargos, fluxos e cotações da data contratual, conforme gc01-gabarito-rascunho.md, condições 6 e seção 13.3.
- As contagens de dias úteis exigem calendário identificável no manifesto; calendario_anbima_2026.csv não integra manifest.json.
- Os exemplos hipotéticos não podem servir de evidência gold enquanto seus arquivos não integrarem o corpus com hashes.
- Qualificação jurídica ou exigibilidade permanece sujeita a especialista, conforme legal_review_required no frontmatter do método.
- Dívida líquida, EBITDA, degraus, comparabilidade e headroom precisam de revisão separada da dependência reconcile-covenant-definitions.

## Notas do revisor

Codex baseado em GPT-5, com inspeção local, SHA-256, Vitest e mutações via TSX; sem internet.

Falha material: fórmula de resgate IPCA incorreta para 14ª/15ª, série Pré não representada, amortização parcial tratada como saída integral, lacuna de encargos preenchida com zero, escolha de menor custo por ordem lexical e datas/vencimentos gold incorretos.
