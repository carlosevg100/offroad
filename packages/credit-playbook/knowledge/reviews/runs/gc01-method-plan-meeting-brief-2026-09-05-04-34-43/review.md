# Revisão independente por IA: método plan-meeting-brief v2026.09.05-v3

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-plan-meeting-brief-2026-09-05-04-34-43, commit d2d346f. Fingerprint 8dcb717e53bd34760ce9d46f342e3408befaea78f24d2deff11211c49b8aef24.

Resultado: **fail**. Evidências: 19 confirmed, 2 limitation, 2 unverifiable, 7 corrected.

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
| confirmed | 1. O corpus usado corresponde ao manifesto congelado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries | 43 arquivos verificados; bytes e SHA-256 apresentaram zero divergências. |
| confirmed | 2. Dívida bruta de R$ 5.670.186 mil e dívida líquida contratual de R$ 4.228.477 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39; notas 15 e 25, páginas 40 e 51 | Recalculo: 2.407.895 + 3.262.291 = 5.670.186. Dívida líquida: 5.670.186 + 14.335 − 235 − 1.430.714 − 25.095 = 4.228.477. |
| confirmed | 3. Os picos são R$ 1.229.828 mil em 2026/27 e R$ 1.228.475 mil em 2028/29. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40, cronograma de amortizações | Recalculo do cronograma: 1.229.828 + 776.868 + 1.228.475 + 694.497 + 994.544 + 809.198 − 63.224 = 5.670.186. |
| confirmed | 4. Caixa e aplicações de R$ 1.455.809 mil excedem o vencimento de 2026/27 em R$ 225.981 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 3, página 20; nota 15, página 40 | Recalculo: 1.430.714 + 25.095 = 1.455.809; 1.455.809 − 1.229.828 = 225.981. Cobertura aritmética = 1,18375x; a nota 3 permite resgate em até 90 dias, portanto não prova liquidez em D0. |
| confirmed | 5. O pro forma era 4,72x, o indicador divulgado era ≤4,0x e a próxima medição seria em 28/02/2027. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 | Recalculo: 4,72 − 4,00 = 0,72x. EBITDA implícito: 4.228.477 ÷ 4,72 = 895.863,77, aproximadamente R$ 895.900 mil. |
| confirmed | 6. A dívida líquida contratual inclui dívida onerosa e derivativos passivos e deduz caixa, aplicações e derivativos ativos. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definição de Dívida Líquida, página 7 | A definição confere com o cálculo de R$ 4.228.477 mil do gabarito. |
| limitation | 7. Incluir arrendamentos em “outra dívida onerosa” não pode ser decidido pelo material disponível. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definição de Dívida Líquida, página 7 | A escritura usa expressão aberta; o ITR apresenta R$ 276.768 mil de arrendamentos separadamente na nota 25, página 51. A qualificação exige interpretação jurídica especializada. |
| confirmed | 8. EBITDA é lucro antes de receitas e despesas financeiras, acrescido de depreciação e amortização dos últimos doze meses. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definição de EBITDA, página 7 | A mesma definição-base aparece nas 14ª e 15ª escrituras. |
| confirmed | 9. Somente a 11ª escritura acrescenta EBITDA de sociedade adquirida e sellers finance. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3, páginas 34–35 | A simplificação de tratar as quatro definições como integralmente idênticas seria indevida. |
| limitation | 10. A comparação integral do 4,72x com cada escritura está demonstrada. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 | O ITR não abre o EBITDA nem as informações complementares; a 11ª escritura contém ajuste adicional. A comparação permanece condicionada. |
| confirmed | 11. O degrau de 4,00x sucede a quitação ordinária dos CRA de referência; vencimento antecipado preserva 3,50x. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.24.3, páginas 54–55 | A mesma mecânica consta nas cláusulas 4.22.3, 7.26.3 e 7.26.3 das 11ª, 14ª e 15ª escrituras. |
| unverifiable | 12. A quitação ordinária dos CRA de referência foi comprovada. | docs/product/gold-cases/runs/gc01/ai-review-corpus/cra_257_relatorio_mensal_4t25.txt | páginas 2–3, vencimento e evolução do saldo devedor | O relatório mostra vencimento em 29/12/2025 e saldo até novembro, mas não comprova a forma da liquidação. |
| confirmed | 13. Há quatro montantes divergentes de dividendos. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | notas 18(e) e 25, páginas 46 e 51 | 140.000 + 255.000 = 395.000 nominal; 133.089 + 205.476 = 338.565 a valor presente; a nota 25 traz 322.498 contábil e 420.000 justo. |
| confirmed | 14. Há três apresentações de estoques que precisam de conciliação. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ri_release_1t26.txt | páginas 12 e 14 | O release apresenta R$ 2.445,2 milhões e R$ 2.437,1 milhões; o ITR, nota 5, página 21, apresenta R$ 3.088.478 mil incluindo R$ 643.241 mil de adiantamentos. |
| corrected | 15. Pontos a favor e contra são selecionados exclusivamente pela posição declarada, nunca pelo tipo do objeto. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 96–107 e 192–197 | O executor restringe cada bloco a listas de tipos. Mutação executada: um objeto scenarios utilizável com stance=against foi omitido de points_against_thesis. Isso contradiz a regra da linha 66 do método. |
| confirmed | 16. No gold, o mesmo maturity_wall é corretamente separado entre fatos for e against. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 76–83 | Os dois fatos de wall-01 são separados pela stance; o fato condicionado de cov-01 não preenche o bloco. |
| confirmed | 17. Objetos condicionados ou com divergências viram pendências e uncoveredTerms; objetos bloqueados são excluídos. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 170–176 e 244–247 | Os testes cobrem conditioned, open_divergences e blocked; ambos os pendentes saem como insufficient_evidence sem preencher fatos. |
| confirmed | 18. Objeto utilizável sem fatos não preenche bloco nem inventa conteúdo. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 54–57 | sc-01 gera lacuna em assumptions; o executor não sintetiza um fato substituto. |
| corrected | 19. objects_used contém apenas objetos efetivamente citados. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 170 e 253 | O campo recebe todos os objetos em estado utilizável. No gold, exit-01 e sc-01 não têm fatos e não preenchem blocos, mas ainda são declarados como usados. |
| corrected | 20. Toda pergunta já respondida pela base é recusada pelo executor. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 178–186 | A recusa depende totalmente de coverage fornecido pelo chamador. Mutação executada: retirar coverage de “Qual é a data do último ITR?” fez o executor perguntar, embora a data conste da capa do ITR. |
| confirmed | 21. A âncora do teste para a data de 31/05/2026 existe. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | capa, página 1 | A capa identifica as informações intermediárias em 31 de maio de 2026. |
| corrected | 22. A mutação de escala milhares/milhões é recusada. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 80–83 | O executor exige somente unidade não nula para números com pontos. Mutação executada: “5.670.186” com unidade “R$ milhões” foi aceita. O teste das linhas 70–74 cobre ausência de unidade, não unidade incorreta. |
| corrected | 23. As mutações “covenant rompido”, EBITDA trimestral anualizado e arrendamento somado à dívida são impedidas. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 29–36 e 80–83 | Headlines são texto opaco; com fingerprint coincidente e unidade preenchida, essas mutações passam. Os testes das linhas 86–92 verificam apenas fingerprint divergente e ID duplicado. |
| unverifiable | 24. O headline “Alongar as séries DI suaviza 2028/29” está demonstrado no corpus permitido. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 3, 9 e 13.2 | O gabarito demonstra o pico e regras de saída, mas não contém cenário before/after que quantifique ou prove essa suavização. |
| confirmed | 25. O ajuste de páginas reproduz 3, 2 e 5 páginas e rejeita 9 quando existem 8 blocos. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 110–164 | Recalculo: plano-base 4+2+2=8 blocos; em duas páginas, os dois últimos grupos são fundidos em quatro blocos; cinco páginas preservam os oito blocos; 9>8 resulta unsupported. |
| confirmed | 26. Produção só é permitida após confirmação do ID exato do plano. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 208–220 | Plano proposto ou confirmação obsoleta mantém production_allowed=false; confirmação do fingerprint atual produz confirmed=true. |
| corrected | 27. O executor implementa também a redação das páginas prometida pelo método. | packages/credit-playbook/knowledge/procedures/materials/plan-meeting-brief.md | linhas 37–40 e 52–56 | O contrato de saída, linhas 86–98, e BriefOutput, linhas 123–135 do executor, não possuem material ou páginas redigidas; apenas devolutiva e page_plan são produzidos. |
| confirmed | 28. A consistência é provada para permutações ordinárias. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 134–155 | Vinte sementes cobrem ordem de objetos, headlines, perguntas, audiência, blocos anteriores e ordem de chaves, comparando fingerprints de entrada e saída. |
| corrected | 29. A canonicalização é invariável para toda entrada aceita pelo schema. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 63–67, 169 e 227–233 | previousVersion.blocks aceita IDs duplicados. Permutar dois blocos company_view com estados distintos alterou inputFingerprint, outputFingerprint e change_note. O teste de consistência não cobre essa entrada aceita. |
| confirmed | 30. A suíte especificada passa sem falhas. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 35–160 | Vitest executado localmente: 1 arquivo, 9 testes aprovados. |

## Condições

- A inclusão de arrendamentos na dívida onerosa exige especialista jurídico; escritura_13a_emissao.txt, definição de Dívida Líquida, página 7, e ITR, nota 25, página 51.
- O degrau definitivo de 4,00x depende de prova da quitação ordinária dos CRA; cra_257_relatorio_mensal_4t25.txt, páginas 2–3, e escrituras, cláusulas de covenant.
- A comparabilidade integral do 4,72x depende da abertura do EBITDA e das informações complementares; ITR, nota 15, página 40, e escritura_11a_emissao.txt, cláusula 4.22.3.
- A suavização de 2028/29 por alongamento das séries DI requer o objeto before_after e seu cálculo, ausentes do material permitido; gc01-gabarito-rascunho.md, seções 3, 9 e 13.2.

## Notas do revisor

Revisão independente por GPT-5 Codex, usando leitura local, Vitest e scripts Node; não constitui aprovação humana.

Falha material: a seleção de for/against ainda depende do tipo do objeto; perguntas documentadas podem ser feitas quando coverage é omitido; mutações econômicas e de escala passam como texto opaco; objects_used é inexato; a redação prometida não está implementada; e há entrada válida cuja permutação altera fingerprints.
