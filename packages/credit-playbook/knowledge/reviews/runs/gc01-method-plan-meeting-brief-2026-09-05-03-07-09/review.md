# Revisão independente por IA: método plan-meeting-brief v2026.09.05-v1

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-plan-meeting-brief-2026-09-05-03-07-09, commit 8bf52d7. Fingerprint c42c84d786c095adb33ea4a851cca7407c6c2253c48912828512029009d1b4ed.

Resultado: **fail**. Evidências: 3 limitation, 14 confirmed, 2 unverifiable, 8 corrected.

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
| limitation | 1. O gabarito usado ainda não é um gold congelado. | docs/product/gold-cases/gc01-gabarito-rascunho.md | linhas 1-12, status rascunho v0.9 | O próprio arquivo diz que nenhuma execução deve ser medida contra ele antes do congelamento. |
| confirmed | 2. O corpus revisado corresponde ao manifesto. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries | Os SHA-256 dos 43 arquivos conferem e não há arquivo não manifestado, excluído o próprio manifesto. |
| confirmed | 3. Dívida bruta de R$ 5.670.186 mil em 31/05/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, PDF p. 39; linhas extraídas 2048-2065 | Empréstimos: 1.314.412 + 867.244 + 54.180 + 181.158 - 9.099 = 2.407.895. Debêntures: soma das séries menos 63.225 = 3.262.291. Total: 2.407.895 + 3.262.291 = 5.670.186. |
| confirmed | 4. Dívida líquida contratual de R$ 4.228.477 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | notas 3, 15 e 25; PDF pp. 20, 40 e 51 | 5.670.186 + 14.335 - 235 - 1.430.714 - 25.095 = 4.228.477. |
| confirmed | 5. Picos de R$ 1.229.828 mil em 2026/27 e R$ 1.228.475 mil em 2028/29. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, PDF p. 40; cronograma de amortizações | Cronograma completo: 1.229.828 + 776.868 + 1.228.475 + 694.497 + 994.544 + 809.198 - 63.224 = 5.670.186. O primeiro pico representa 21,689377%, arredondado para 21,7%; o segundo cresceu 1.228.475 - 886.187 = 342.288. |
| confirmed | 6. Crescimento trimestral da dívida bruta de R$ 681.803 mil, ou 13,7%. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, PDF pp. 39-40 | 5.670.186 - 4.988.383 = 681.803; 681.803 / 4.988.383 = 13,667816%. |
| confirmed | 7. Pro forma de 4,72x, limite indicado de 4,00x e próxima medição em 28/02/2027. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, PDF p. 40; linhas extraídas 2111-2124 | A fonte também informa adimplência em 28/02/2026; portanto, 4,72x não prova covenant rompido. |
| confirmed | 8. EBITDA implícito e headroom interino. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 116-142 | 4.228.477 / 4,72 = 895.863,771 mil. Excesso do índice: 4,72 - 4,00 = 0,72x. Mantido esse EBITDA, dívida líquida máxima a 4,00x seria 3.583.455,085 e o excesso seria 645.021,915; este último não deve ser tratado como headroom contratual pleno devido às condições de comparabilidade. |
| confirmed | 9. Dívida líquida, EBITDA e degraus definidos nas escrituras. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3, PDF pp. 34-35 | A escritura define dívida líquida, EBITDA UDM, degraus de 3,50x/4,00x e, apenas na 11ª, ajuste por aquisição e sellers finance. As cláusulas 7.24.3 da 13ª e 7.26.3 da 14ª/15ª confirmam a estrutura-base. |
| limitation | 10. Aplicabilidade plena de 4,00x e comparabilidade integral do 4,72x. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.1, linhas 353-375 | A quitação ordinária dos CRA de referência não está comprovada; a companhia não abre EBITDA e informações complementares. A comparação é condicionada. |
| confirmed | 11. Dividendos apresentam quatro montantes distintos. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | notas 18 e 25, PDF pp. 46 e 51 | 395.000 nominal; 338.565 a valor presente; 322.498 contábil; 420.000 valor justo. |
| confirmed | 12. Existem três apresentações de estoques. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ri_release_1t26.txt | tabela de capital de giro p. 12 e balanço gerencial p. 14 | Nota 5: 3.088.478; sem adiantamentos: 3.088.478 - 643.241 = 2.445.237; balanço gerencial: 2.437,1 milhões. |
| unverifiable | 13. Alongar as séries DI suaviza 2028/29. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 3 e 13.2 | O corpus mostra o pico e os termos das séries, mas não contém o cenário before/after necessário para quantificar ou demonstrar a suavização. |
| unverifiable | 14. O gold sustenta os turnos, audiência e títulos do plano de três páginas. | docs/product/gold-cases/gc01-gabarito-rascunho.md |  | O gabarito econômico não contém turnos de reunião, audiência, forma solicitada ou os títulos Situação atual, Alternativas e Impacto nos indicadores. |
| corrected | 15. O executor implementa o contrato estruturado do método. | packages/credit-playbook/knowledge/procedures/materials/plan-meeting-brief.md | Outputs, linhas 76-79 | O contrato compilado exige deliverable, page_plan e alignment_questions, sem propriedades adicionais. O executor retorna pagePlan e alignmentQuestions, além de campos extras; no turno 1, pagePlan é null embora page_plan seja object required. Âncoras adicionais: procedure-contract.ts linhas 304-316 e executor linhas 65-75, 113-135. |
| corrected | 16. O plano respeita o número de páginas solicitado. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | PAGE_PLANS e montagem, linhas 80-89 e 114-118 | O parâmetro pages não é usado. Mutação pages=3 para pages=4 continuou produzindo três páginas, o mesmo planId e o mesmo outputFingerprint. |
| corrected | 17. O executor distingue corretamente pontos a favor e contra a tese. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | BLOCKS, linhas 58-60; preenchimento, linhas 107-110 | Qualquer objeto covenant entra simultaneamente em points_for_thesis e points_against_thesis. No gold, o headline adverso 4,72x contra 4,00x também é colocado entre os pontos a favor. |
| confirmed | 18. Objetos bloqueados e objetos ausentes não preenchem lacunas. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 94-110 | blocked-01 é excluído; liquidity_coverage vira gap porque interest_schedule não é utilizável; company_view ausente também vira gap. |
| corrected | 19. Base insuficiente preserva uncoveredTerms e insufficient_evidence sem preencher. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | schemas, linhas 13-48; filtro, linhas 94-110 | uncoveredTerms é rejeitado como chave desconhecida e insufficient_evidence não é estado válido. Objetos incomplete, partial, conditioned e open_divergences são tratados como utilizáveis e podem preencher blocos; mutação com ledger incomplete e headline 999 inventado produziu bloco filled. |
| confirmed | 20. Pergunta marcada como respondida pelos documentos é recusada. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 20-25 e 42-43 | O teste passou e q-itr-date foi recusada quando answeredByDocuments=true. |
| corrected | 21. O executor resiste à mutação de uma pergunta já respondida na base. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 32-41 e 99-101 | A decisão é inteiramente confiada ao booleano de entrada. Com answeredByDocuments=false, q-itr-date foi perguntada; changesTheWork='nenhuma' também passa por validar apenas não vazio. |
| corrected | 22. O adversarial de número sem referência está provado pelos testes. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | arquivo completo, especialmente linhas 29-58 | Não existe teste dessa mutação. O executor não valida que fingerprint corresponda aos headlines e aceita headline alterado ou inventado, inclusive em objeto incomplete. |
| confirmed | 23. Produção só é permitida após confirmação do plano exato. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 113-119 | Sem confirmação, productionAllowed=false; confirmação pelo planId torna-o true; mudança de audiência torna a confirmação obsoleta. |
| corrected | 24. Mudanças entre versões são explicadas. | packages/credit-playbook/knowledge/procedures/materials/plan-meeting-brief.md | sequência 4 e aceitação, linhas 56 e 94-95 | O executor não recebe versão anterior nem produz nota de mudança; os testes não cobrem essa promessa. |
| confirmed | 25. O executor é consistente sob permutações cobertas pelo teste. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 60-69 | Os três testes passaram. Objetos são ordenados por id e perguntas por priority/id; reversão dessas listas preservou ambos os fingerprints. |
| corrected | 26. Os testes provam invariância geral à ordem de entrada. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 77-78, 94-99 e 116-118 | O teste cobre apenas ordem original/reversa. IDs duplicados não são proibidos: inverter dois objetos com o mesmo id alterou headlines e ambos os fingerprints. Inverter a audiência também alterou planId e fingerprints, sem regra explícita de prioridade da audiência. |
| limitation | 27. Inclusão de arrendamento na dívida onerosa contratual. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 135-138 | A expressão das escrituras pode alcançar arrendamento, mas o corpus não resolve a interpretação jurídica. |

## Condições

- O gabarito permanece rascunho e precisa ser congelado antes de servir como aprovação gold.
- Comprovar a quitação ordinária dos CRA de referência e obter o cálculo de EBITDA da companhia para comparabilidade plena.
- Submeter a inclusão de arrendamento em dívida onerosa a revisão jurídica especializada.
- Alinhar o executor ao schema compilado, representar insufficient_evidence/uncoveredTerms, impedir preenchimento por objeto incompleto, respeitar pages e implementar as mutações adversariais ausentes.
- Definir unicidade dos ids e a semântica de ordem da audiência antes de alegar invariância geral dos fingerprints.

## Notas do revisor

Codex (GPT-5), revisão por modelo com inspeção e execução local via shell; sem internet.

Os números econômicos principais conferem. O resultado é fail por divergências materiais de contrato e comportamento: nomes/tipos de saída incompatíveis, páginas ignoradas, classificação for/against incorreta, insuficiência de evidência não representada e adversariais/consistência incompletos. Este registro é revisão por modelo, não aprovação humana.
