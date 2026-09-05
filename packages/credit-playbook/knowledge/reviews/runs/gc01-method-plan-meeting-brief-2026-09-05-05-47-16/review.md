# Revisão independente por IA: método plan-meeting-brief v2026.09.05-v6

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-plan-meeting-brief-2026-09-05-05-47-16, commit ff8c1a1. Fingerprint 7159a9d964a6577542e94c640cf78c0c931a62114b4a5cba5bcdd73526140615.

Resultado: **fail**. Evidências: 24 confirmed, 2 unverifiable, 3 limitation, 6 corrected.

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
| confirmed | 1.0 — O corpus usado corresponde ao manifesto congelado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries, linhas 5-220 | Os SHA-256 dos 43 arquivos foram recalculados; todos coincidem. |
| confirmed | 1.1 — Dívida bruta de R$ 5.670.186 mil em 31/05/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p.39, linhas 2034-2065 |  |
| confirmed | 1.2 — Picos de R$ 1.229.828 mil em 2026/27 e R$ 1.228.475 mil em 2028/29. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p.40, linhas 2097-2109 |  |
| confirmed | 1.3 — Caixa e equivalentes mais aplicações de R$ 1.455.809 mil e excedente de R$ 225.981 mil sobre 2026/27. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 3, p.20, linhas 971-985; nota 15, p.40, linha 2102 | 1.430.714 + 25.095 = 1.455.809; 1.455.809 − 1.229.828 = 225.981. A fonte também informa resgate dos equivalentes em até 90 dias, portanto não prova disponibilidade em D0. |
| confirmed | 1.4 — Dívida líquida contratual de R$ 4.228.477 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p.40, linhas 2117-2119; nota 25, p.51, linhas 2764-2786 | 5.670.186 + 14.335 − 235 − 1.430.714 − 25.095 = 4.228.477. |
| confirmed | 1.5 — Pro forma de 4,72x, limite divulgado de 4,00x e próxima medição em 28/02/2027. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p.40, linhas 2111-2124 | A fonte também afirma adimplência na medição de 28/02/2026; não sustenta “covenant rompido” em 31/05/2026. |
| confirmed | 1.6 — A 13ª emissão contém degraus de 3,50x e 4,00x, com o segundo dependente da quitação integral ordinária dos CRA de referência. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.24.3(VIII), p.54, linhas 2650-2683 |  |
| confirmed | 1.7 — Os mesmos degraus aparecem na 11ª, 14ª e 15ª emissões. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3(j), pp.34-35, linhas 1293-1337 | A 14ª confirma em 7.26.3(VIII), p.54; a 15ª em 7.26.3(VIII), p.55. |
| unverifiable | 1.8 — A quitação ordinária dos CRA de referência está comprovada. | docs/product/gold-cases/runs/gc01/ai-review-corpus/cra_257_relatorio_mensal_4t25.txt | características e saldo devedor, linhas 47-102 | O relatório mostra vencimento em 29/12/2025 e saldo até novembro, mas não comprova a quitação nem sua natureza ordinária. |
| confirmed | 1.9 — “Dividendos com quatro valores; estoques em três apresentações”. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 18(e), p.46, linhas 2466-2492; nota 25, p.51, linhas 2764-2786; nota 5, p.21, linhas 1054-1071 | Dividendos: 395.000 nominal, 338.565 a valor presente, 322.498 contábil e 420.000 justo. Estoques: nota 5 e as duas apresentações do release, incluindo ri_release_1t26.txt, linhas 1305-1318 e 1434-1444. |
| unverifiable | 1.10 — “Alongar as séries DI suaviza 2028/29”. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 17 e 29 | O conteúdo congelado do objeto contém apenas ranking/status-quo; o gabarito e o corpus permitidos não trazem o cenário ou cálculo que sustente essa conclusão. |
| confirmed | 2.1 — Reconstituição da dívida bruta. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p.39, linhas 2038-2060 | Empréstimos: 1.314.412 + 867.244 + 54.180 + 181.158 − 9.099 = 2.407.895. Debêntures líquidas do custo = 3.262.291. Total = 5.670.186. |
| confirmed | 2.2 — Reconstituição integral do cronograma. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p.40, linhas 2101-2109 | 1.229.828 + 776.868 + 1.228.475 + 694.497 + 994.544 + 809.198 − 63.224 = 5.670.186; diferença entre os dois picos = 1.353. |
| confirmed | 2.3 — Cobertura aritmética do vencimento 2026/27. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 3-5, linhas 81-151 | 1.455.809 ÷ 1.229.828 = 1,183750085x, ou 118,375%; excedente de 18,375% e R$ 225.981 mil. |
| confirmed | 2.4 — Headroom interino contra 4,00x. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 5 e 13.1, linhas 124-155 e 366-388 | 4,00 − 4,72 = −0,72x; 4,72 é 18,0% superior ao limite. EBITDA implícito = 4.228.477 ÷ 4,72 = 895.863,77; excesso de dívida implícito contra 4,00x ≈ R$ 645.021,92 mil. Comparação permanece condicionada. |
| confirmed | 2.5 — Ajuste de páginas e contagem de blocos. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 145-153 e 190-213 | Pitch contém 4 + 2 + 2 = 8 blocos. Duas páginas fundem a cauda; cinco dividem páginas preservando os oito blocos; nove excedem oito e retornam unsupported. |
| confirmed | 2.6 — Contagens do caso gold. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 23-47 e 51-81 | 8 objetos: 5 utilizáveis, 2 pendentes e 1 bloqueado; 3 usados e 2 utilizáveis não citados. Das 7 perguntas, 3 são feitas e 4 recusadas. |
| confirmed | 3.1 — Definição de dívida líquida usada no gabarito. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definição “Dívida Líquida”, p.7, linhas 324-331 | Inclui empréstimos, financiamentos, debêntures, derivativos passivos e outra dívida onerosa; deduz caixa, aplicações e derivativos ativos. |
| confirmed | 3.2 — Definição-base de EBITDA e ajuste exclusivo da 11ª. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3, p.35, linhas 1329-1337 | EBITDA usa últimos 12 meses; a 11ª acrescenta aquisição e sellers finance. As definições-base das 13ª, 14ª e 15ª aparecem nas respectivas páginas 7. |
| limitation | 3.3 — Arrendamento fica necessariamente fora de “outra dívida onerosa”. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definição “Dívida Líquida”, p.7, linhas 324-331 | A escritura não resolve se o passivo de arrendamento é alcançado por “qualquer outra dívida onerosa”; isso exige interpretação jurídica especializada. |
| limitation | 3.4 — Comparabilidade integral do 4,72x com todas as escrituras. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p.40, linhas 2111-2124 | O ITR não abre o EBITDA nem as informações complementares; a 11ª ainda possui ajustes adicionais. A comparação integral não é verificável. |
| corrected | 3.5 — Pontos “for/against” são posições declaradas pelo objeto e protegidas pelo fingerprint. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 38-48, 93-110 e 241-247 | A stance fica fora de content e, portanto, fora do fingerprint recalculado. Alterá-la reclassifica o fato sem invalidar o objeto. A correção exige vincular stance e payload factual ao conteúdo assinado. |
| corrected | 3.6 — Cada headline reproduz o campo indicado do objeto. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 12-29 | No gold, coverage.by_period[0].coverage contém apenas 1.18375, mas a headline afirma 1.455.809 e 225.981. O objeto de covenant contém 4.72 e tiers, mas não data, quitação ou comparabilidade. O executor verifica somente que o caminho existe. |
| confirmed | 4.1 — Estados condicionados, parciais ou divergentes viram insufficient_evidence; bloqueados são excluídos. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 218-255 e 301-317 | cov-01 e rec-01 entram como pendentes/uncovered; blocked-01 é excluído e não preenche bloco. |
| confirmed | 4.2 — Objeto utilizável sem fatos não preenche bloco. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 76-79 | sc-01 permanece lacuna nomeada; não há preenchimento sintético. |
| confirmed | 4.3 — Lacunas não impedem produção após confirmação, mas plano não confirmado bloqueia produção. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 258-276 e 305-320 | production_allowed só é verdadeiro quando confirmedPlanId coincide exatamente com o plano atual; uncovered_terms permanecem explícitos. |
| confirmed | 5.1 — Pergunta cuja resposta foi declarada com âncora é recusada. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 38-46 e 63-70 | q-itr-date é recusada e conserva a âncora. |
| corrected | 5.2 — O executor resiste a uma pergunta que a fonte responde quando coverage falsamente declara silêncio. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 226-235 | Mutação executada com q-itr-date, documento pesquisado e answer/answeredBy nulos: a pergunta foi feita. O executor confia integralmente na declaração do chamador e não prova o adversarial prometido. |
| corrected | 5.3 — Escala/unidade não pode ser omitida ou trocada. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 98-110 | A validação reconhece apenas números com pontos de milhar. As mutações “5670186” sem unidade e escala com separadores não reconhecidos foram aceitas. É necessário valor e unidade estruturados, não inferência por regex. |
| confirmed | 5.4 — As formas testadas “covenant rompido” e “covenant violado” são recusadas. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 103-108 |  |
| corrected | 5.5 — Toda afirmação equivalente de evento jurídico é recusada. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linha 101 | A mutação “Covenant quebrado: 4,72x contra 4,00x” foi aceita. A regex também não cobre todas as variantes acentuadas; o evento precisa ser estruturado ou enumerado. |
| corrected | 5.6 — As mutações econômicas do gabarito estão cobertas pelos testes. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 10, 11.6 e 13.4, linhas 228-232, 329-336 e 424-429 | Não há testes para EBITDA trimestral anualizado, arrendamento silenciosamente somado, pro forma tratado como cálculo próprio, release usado no covenant, degrau sem condição, prêmio flat ou carências de saída. Como headlines não são reconciliadas ao conteúdo, essas mutações podem atravessar o executor. |
| confirmed | 6.1 — Ordem de objetos, headlines, perguntas, audiência, blocos anteriores e chaves não altera fingerprints. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 200-220 | Vinte permutações com chaves invertidas preservaram inputFingerprint e outputFingerprint. |
| confirmed | 6.2 — A implementação canoniza a entrada e deriva deterministicamente os dois fingerprints. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 176-177, 215-217 e 319-320 | Os testes provam as dimensões de permutação exercitadas, não validade semântica dos fatos. |
| limitation | 6.3 — O teste contratual valida integralmente o contrato do método. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 223-225 | contractMismatch prova apenas as saídas de nível superior; não prova os vínculos semânticos internos entre headline, path, valor, unidade, stance e evidência. |

## Condições

- Vincular texto, valores, unidade e stance ao conteúdo efetivamente coberto pelo fingerprint e validar igualdade semântica; hoje fatos falsos passam (plan-meeting-brief.ts, linhas 38-48 e 93-110).
- Substituir detecção de unidade e evento jurídico por campos estruturados e ampliar adversariais (plan-meeting-brief.test.ts, linhas 92-148).
- Autenticar ou verificar a cobertura documental das perguntas; a declaração unilateral de silêncio não prova o caso adversarial (plan-meeting-brief.ts, linhas 226-235).
- Remover ou sustentar “Alongar as séries DI suaviza 2028/29”, ausente do conteúdo f6 e das fontes permitidas (plan-meeting-brief.test.ts, linhas 17 e 29).
- Manter como condições especializadas: classificação de arrendamento como dívida onerosa, comparabilidade integral do 4,72x e prova da quitação ordinária dos CRA (gc01-gabarito-rascunho.md, linhas 5-14).

## Notas do revisor

Codex (GPT-5), revisão independente por modelo com leitura e execução local, sem internet.

A suíte focal passou 9/9, mas seus próprios casos gold contêm headlines não reproduzidas pelos objectPath declarados. Isso viola as regras do método nas linhas 63 e 67-68 e é material; por isso o resultado é fail.
