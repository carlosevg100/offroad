# Revisão independente por IA: método estimate-exit-cost-by-series v2026.09.05-v5

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-estimate-exit-cost-by-series-2026-09-05-04-58-24, commit c86c292. Fingerprint 18b226302a02286ed5621675bd91178bfff6f6a016ce47529b286a4e038e207e.

Resultado: **fail**. Evidências: 16 confirmed, 2 unverifiable, 8 corrected, 4 limitation.

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
| confirmed | 1. Integridade do corpus gold. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries[0..42] | Os 43 tamanhos e hashes SHA-256 foram recalculados e coincidem com o manifesto. |
| confirmed | 2. Versão e schema do resultado são 2026.09.05-v5 e method.estimate-exit-cost-by-series.v5. | packages/credit-playbook/knowledge/procedures/refinance/estimate-exit-cost-by-series.md | frontmatter; Outputs/schema_version |  |
| unverifiable | 3. O caso gold usa 04/09/2026 como data pretendida de saída. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 11 e 13.2 | 04/09/2026 é a data de congelamento do pack e da curva, não uma data de saída explicitamente escolhida pelo caso. |
| confirmed | 4. Em 04/09/2026 faltam nominal atualizado, remuneração corrida e encargos por série; nenhuma base pode ser precificada. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, páginas 39–40 | O ITR fornece saldos somente em 31/05/2026. O manifesto não contém ledger por série na data de saída. |
| corrected | 5. O gold cobre oito séries e reproduz a seção 13.2 por família. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39 | A fonte contém 12 séries. Faltam 11ª/2ª, 13ª/3ª, 14ª/3ª e 15ª/4ª; as três últimas têm janelas próprias e não podem ser omitidas numa reprodução por família. |
| confirmed | 6. A oferta da 11ª está disponível desde 30/10/2021; aquisição pode ocorrer a qualquer tempo, parcial ou integralmente, ao preço aceito pelo vendedor. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusulas 4.1.1, 4.13 e 4.14 | Também confere a exigência de adesão de 100% para efetivar a oferta. |
| confirmed | 7. Em 04/09/2026, resgate e amortização DI da 13ª/1ª estão permitidos desde 14/05/2026; vencimento em 14/11/2028 e prêmio de 0,40% a.a. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.7.1, 7.16.1 e 7.18.1 |  |
| confirmed | 8. Em 04/09/2026, a saída unilateral da 13ª/2ª ainda não está permitida; a oferta negociada já está. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.14.1 e 7.16.2.1 | A 2ª série abre em 14/05/2027; a omitida 3ª série somente em 15/05/2028. |
| confirmed | 9. Em 04/09/2026, a 14ª/1ª DI está permitida e a oferta da 14ª/2ª está disponível. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_14a_emissao.txt | cláusulas 7.1.1, 7.14.1, 7.16.1.1 e 7.18.1 | A 14ª/1ª abre em 15/06/2026; a oferta existe desde a emissão em 14/06/2024. |
| confirmed | 10. A 15ª/1ª DI está bloqueada em 04/09/2026 e a oferta existe desde 15/11/2025. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusulas 7.1.1, 7.14.1 e 7.16.1.1 | A saída unilateral abre em 15/11/2027. |
| corrected | 11. A janela codificada para a 15ª/2ª prefixada é 15/11/2027. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusula 7.16.2.1 | A data correta é 15/11/2028. O estado not_permitted em 04/09/2026 coincide apenas porque ambas as datas são futuras. |
| corrected | 12. A janela codificada para a 15ª/3ª IPCA é 15/11/2027. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusula 7.16.3.1 | A data correta é 15/11/2028; a 4ª série omitida abre em 15/11/2029. |
| corrected | 13. As âncoras do gold identificam as cláusulas que sustentam cada mecanismo e taxa. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_14a_emissao.txt | cláusulas 7.14, 7.16, 7.19 e 7.21 | O teste ancora ofertas da 13ª/14ª em 7.21, que trata de encargos moratórios; deveria usar 7.14. Ancora resgates da 14ª em 7.19, que trata do local de pagamento; deveria usar 7.16. Taxas também são atribuídas genericamente à cláusula 4.1, não às cláusulas 7.10 ou aos relatórios fiduciários que registram as taxas finais. |
| confirmed | 14. Totais gold: prêmio 0, pagamento 0, zero séries estimadas, oito abertas e state partial. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 306–317 | Recálculo para o input atual: soma vazia=0; estimadas=0; abertas=8−0=8. Com as 12 séries da fonte, abertas seriam 12. |
| confirmed | 15. Recálculo DI hipotético. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 119–133 | Base=100+1,5+0=101,5; fator=(1,004)^2−1=0,008016; prêmio integral=0,813624; total=102,313624; parcela 98%=99,47; prêmio parcial=0,79735152; total parcial=100,26735152; oferta 1%=1,015. |
| confirmed | 16. Recálculo make-whole hipotético. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 136–157 | Com fluxos 6 em 125 DU e 106 em 252 DU: VP a 7%=104,86739704; 50%=52,43369852; resgate 14ª com encargos=105,36739704; duration a 6%=245,00484232 DU; VP prefixado a 2% mais 0,1=109,96292075. |
| limitation | 17. O teste make-whole prova o número por cálculo manual independente. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 137–147 | O valor esperado é produzido pela mesma função presentValueByBusinessDays usada pelo executor; o recálculo acima confirma o exemplo, mas o teste é circular. |
| confirmed | 18. As definições de piso e dia de cotação diferenciam corretamente a 13ª das 14ª/15ª. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.16.2.2 e 7.18.2.1 | Na 13ª, resgate IPCA usa somente VP e cotação do dia útil anterior; amortização usa max(A,B) e segundo dia anterior. 14ª/15ª usam max(A,B) no resgate. |
| corrected | 19. Oferta negociada das 13ª, 14ª e 15ª tem escopo integral. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusulas 7.14.4 e 7.14.6 | A adesão pode ser inferior à totalidade e gera resgate proporcional. O executor fixa scope=full e amount_retired=100% para toda negotiated_offer; deveria admitir parcial ou integral conforme o aviso e a adesão. |
| corrected | 20. Dias úteis e feriados são conferidos contra calendário da base. | packages/credit-playbook/knowledge/procedures/refinance/estimate-exit-cost-by-series.md | Regras de precificação; Testes/Unit | Para prêmio DI, o executor apenas rejeita count maior que weekdaysBetween; não desconta nem valida feriados. O gold registra calendario_anbima_2026.csv, ausente do manifesto, e usa contagens de dias de semana: 572, 724 e 1094. |
| corrected | 21. O executor garante que a NTN-B ou o vértice informado é o de duration mais próxima. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 274–292 | A duration é calculada, mas nunca comparada com securityDurationBusinessDays nem com candidatos. Qualquer security não vazio é aceito. |
| unverifiable | 22. O executor reproduz os arredondamentos contratuais do make-whole. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusulas 7.16.2.2 e 7.16.3.2, definição de FVPk | A escritura manda FVPk com nove casas e arredondamento. O teste usa a mesma função do executor e não demonstra esse arredondamento intermediário. |
| confirmed | 23. Base, cotação, fluxos, remuneração ou escritura ausentes nunca são preenchidos. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 236–280 | Base/escritura geram uncovered_terms e insufficient_evidence; cotação, fluxos e remuneração ausentes mantêm valores monetários nulos; data anterior à janela gera not_permitted. |
| confirmed | 24. Make-whole permitido sem cotação retorna insufficient_evidence. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linha 277 | O comportamento existe por inspeção; o teste não contém uma mutação direta quote=null em rota já permitida e com base completa. |
| confirmed | 25. Mutações adversariais cobertas pelos testes. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 160–219 | Há cobertura para dia contratual errado, fluxos/remuneração/encargos/escritura ausentes, documento externo, escritura alheia, cláusula vazia, distância de cotação inconsistente, zero DU, cap de 100%, fração acima do cap, prêmio negativo, saldo datado incorretamente, DU impossível e série duplicada. |
| corrected | 26. Mutações materiais ainda aceitas ou não testadas. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | schemas de input e linhas 150–169, 256–292 | Não se valida conteúdo da cláusula, janela contra a escritura, unidade contra a fonte, feriados reais, tipo de referência IPCA versus Pré, título/vértice mais próximo ou arredondamento contratual. Testes também não exercitam mecanismo, fluxo ou documento duplicado, embora o schema os recuse. |
| confirmed | 27. Determinismo de ordem e fingerprints. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 219–227 e 306–317 | Documentos, séries, fluxos, mecanismos e chaves são canonicalizados; outputFingerprint inclui cálculos e inputFingerprint. O teste confirma igualdade em 20 iterações, embora repita poucas permutações de um único fixture. |
| limitation | 28. O contrato completo do resultado é provado pelo teste. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 245–246 | contractMismatch verifica somente nomes de campos top-level; não prova tipos, campos internos nem semântica das rotas descritas em Outputs. |
| limitation | 29. Dívida líquida, EBITDA, degraus, comparabilidade, headroom e contra são definições deste executor. | packages/credit-playbook/knowledge/procedures/refinance/estimate-exit-cost-by-series.md | Objetivo e Outputs | Esses conceitos não são calculados por este método; pertencem à dependência reconcile-covenant-definitions. Não há resultado de covenant a testar aqui. |
| limitation | 30. Conclusões jurídicas podem ser aprovadas por esta revisão. | packages/credit-playbook/knowledge/procedures/refinance/estimate-exit-cost-by-series.md | frontmatter: legal_review_required=true | Esta é revisão por modelo; interpretações jurídicas permanecem condicionadas a especialista. |

## Condições

- Corrigir cobertura das séries, janelas da 15ª, âncoras, escopo das ofertas negociadas e validações de calendário/duration antes de promover o método.
- Para verificar valores gold, fornecer data de saída explicitamente escolhida, base e fluxos nessa data, calendário de feriados e cotações do dia contratual.
- Submeter afirmações classificadas como LEI à revisão jurídica especializada.

## Notas do revisor

Codex (GPT-5), com inspeção local, Vitest e recálculo Decimal independente.

Falha por correções materiais nos itens 5, 11–13 e 19–21/26. Os testes atuais passam: 7 de 7.
