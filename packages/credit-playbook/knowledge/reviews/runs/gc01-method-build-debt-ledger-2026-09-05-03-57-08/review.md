# Revisão independente por IA: método build-debt-ledger v2026.09.05-v10

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-build-debt-ledger-2026-09-05-03-57-08, commit 7603e32. Fingerprint 3508b5d6734219b7f7198bb9f3373c27ea9d8ccff0bb6a31499869f0f08da2e7.

Resultado: **fail**. Evidências: 27 confirmed, 3 limitation, 1 corrected.

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
| confirmed | O corpus usado corresponde ao manifesto congelado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries | Recalculados bytes e SHA-256: 43 de 43 arquivos conferem. |
| confirmed | Os 18 saldos atuais e anteriores usados pelo gold correspondem à nota de dívida. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | p. 39, nota 15 | Inclui quatro empréstimos, custos de empréstimos, doze séries de debêntures e custos de debêntures. |
| confirmed | Circulante 1.229.828 e não circulante 4.440.358. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | p. 12, balanço consolidado | 1.229.828 + 4.440.358 = 5.670.186. |
| confirmed | Cronograma gold: 1.229.828; 776.868; 1.228.475; 694.497; 994.544; 809.198; e custos de -63.224. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | p. 40, nota 15, cronograma de amortizações | A soma independente é 5.670.186. |
| confirmed | Caixa 1.430.714, aplicações 25.095, derivativos ativos 235 e passivos 14.335. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | pp. 11, 20 e 51, notas 3 e 25 |  |
| confirmed | O release informa dívida bruta 5.670,2 milhões, caixa e aplicações 1.455,8 milhões e dívida líquida 4.214,4 milhões. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ri_release_1t26.txt | página impressa 12, tabela Endividamento e Caixa | O arquivo-texto contém a página impressa 12 no 13º bloco extraído. |
| confirmed | Vencimentos e remunerações da 11ª emissão usados no gold. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_11a_emissao.txt | pp. 1-2 | Vencimento 30/10/2028 e 100% CDI + 1,55% a.a. |
| confirmed | Vencimentos e remunerações das três séries da 13ª emissão. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_13a_emissao.txt | pp. 2-4 | DI + 0,65%; IPCA + 6,3416%; IPCA + 6,5264%, com os vencimentos usados no teste. |
| confirmed | Vencimentos e remunerações das três séries da 14ª emissão. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_14a_emissao.txt | pp. 2-4 | 104% DI; IPCA + 6,8286%; IPCA + 6,9982%, com os vencimentos usados no teste. |
| confirmed | Vencimentos e remunerações das quatro séries da 15ª emissão. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_15a_emissao.txt | pp. 2-5 | 105% DI; prefixada 14,15%; IPCA + 8,20%; IPCA + 8,70%, com os vencimentos usados no teste. |
| confirmed | Eco é titular formal das debêntures das 13ª, 14ª e 15ª emissões. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_14a_emissao.txt | p. 3, considerando D | A cláusula declara a securitizadora única titular; as escrituras da 13ª e 15ª repetem a estrutura. |
| confirmed | Na 11ª emissão, o agente fiduciário representa a comunhão dos debenturistas. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | p. 1, preâmbulo |  |
| confirmed | A controladora garante dívidas das controladas no exterior. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | p. 40, nota 15 | A fonte não individualiza contratos, ressalva preservada pelo executor. |
| confirmed | Dívida bruta atual 5.670.186, anterior 4.988.383 e antes das linhas contra 5.742.510. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 43-60 e 95-100 | Recálculo: empréstimos 2.407.895 + debêntures 3.262.291 = 5.670.186; anterior 1.686.122 + 3.302.261 = 4.988.383; 5.670.186 - (-9.099) - (-63.225) = 5.742.510. |
| confirmed | A reconciliação total e do primeiro período resulta em diferença zero. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 62-66 e 101-105 | 5.670.186 - (1.229.828 + 4.440.358) = 0; 1.229.828 - 1.229.828 = 0. O split por linha permanece not_possible porque as linhas gold não têm classificação individual. |
| confirmed | Dívida líquida contratual 4.228.477 e do release 4.214.377; diferença para o release reportado igual a 23. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 67-78 e 106-112 | Contratual: 5.670.186 + 14.335 - 235 - 1.430.714 - 25.095 = 4.228.477. Release: 5.670.186 - 1.430.714 - 25.095 = 4.214.377. Diferença: 4.214.400 - 4.214.377 = 23. |
| confirmed | A fórmula contratual executada coincide com a definição literal da escritura. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | p. 7, definição de Dívida Líquida | Soma empréstimos, financiamentos, debêntures, derivativos passivos e residual oneroso; deduz caixa, aplicações e derivativos ativos. |
| confirmed | Estoques por indexador: CDI 2.172.858; IPCA 743.955; prefixado 408.703; desconhecido 2.416.994. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 43-60 e 113-123 | Participações antes das linhas contra: 0,37838123; 0,12955223; 0,07117149; 0,42089504. Participações sobre 5.670.186: 0,38320753; 0,13120469; 0,07207929; 0,42626362. |
| confirmed | Estoque por moeda: BRL 4.639.928; USD 867.244; CLP 54.180; PEN 181.158. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 43-60 e 116-123 | Moeda estrangeira soma 1.102.582; 1.102.582 / 5.670.186 = 0,19445253. As participações sobre a dívida antes das linhas contra somam 1 após arredondamento. |
| confirmed | Participações do cronograma foram recalculadas. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 308-328 | Por 5.670.186: 0,21689377; 0,13700926; 0,21665515; 0,12248223; 0,17539883; 0,14271102; -0,01115025. |
| confirmed | Linhas contra são negativas, não têm obrigação e ficam fora dos agrupamentos por moeda/indexador antes de custos. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 69-85, 261-272 e 393-405 | O comportamento coincide com o método: custos de transação reduzem a dívida reportada, mas não são obrigação a credor. |
| confirmed | Termos ausentes permanecem nulos e geram uncovered_terms com insufficient_evidence, campo a campo. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 408-418 | Moeda não é promovida a indexador; empréstimos sem termos geram lacunas de remuneração, vencimento, garantia, credores e classificação. |
| confirmed | Release sem nota, silêncio documental, contradição de ausência de dívida, divergências de conciliação e definições contraditórias bloqueiam. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 275-305, 313-327 e 366-424 | Os testes exercitam esses estados e não fabricam linhas ou componentes. |
| limitation | Quando caixa e definições estão simultaneamente ausentes, o executor não enumera separadamente as duas definições faltantes. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 374-383 | Execução adversarial retornou apenas a razão agregada de caixa/derivativos; a ausência das definições só é nomeada quando input.cash existe. Não há preenchimento inventado, mas a lista de causas não é exaustiva. |
| confirmed | As mutações adversariais declaradas no frontmatter do método têm cobertura direta. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 208-353 | Cobertos: escala, troca compensatória de prazo, erro no primeiro período, contradição e polaridade de definição, seleção por data, split que não soma e inclusão somente contratual fora da identidade. |
| limitation | Strings vazias e períodos duplicados são recusados pelo schema, mas não possuem teste adversarial explícito neste arquivo. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 20-25 e 129-139 | A implementação contém a validação; a suíte não prova regressão específica dessas duas mutações prometidas pelo método. |
| corrected | A seleção de período corrente é incorreta para uma data-base em 29 de fevereiro. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 315-326 | O método exige término dentro de doze meses. setUTCFullYear sobre 2024-02-29 produz horizonte 2025-03-01; uma mutação com vencimento em 2025-03-01 foi tratada como corrente e bloqueada, embora esteja além de doze meses. Falta teste de ano bissexto. |
| confirmed | Permutações de linhas, períodos, views e chaves preservam resultado e fingerprints. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 371-384 | Vinte permutações comparam inputFingerprint, outputFingerprint e objeto integral; a execução Vitest passou. A suíte do pacote concluiu 247 testes verdes. |
| confirmed | EBITDA, degraus de 3,50x/4,00x, comparabilidade e headroom não são calculados por este executor. | packages/credit-playbook/knowledge/procedures/financial/build-debt-ledger.md | linhas 117-120 | O método os remete expressamente a reconcile-covenant-definitions; portanto não há headroom deste executor a recalcular. |
| confirmed | A definição-base de EBITDA e os degraus citados pelo gabarito constam das escrituras. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3, pp. 34-35 | A 11ª também acrescenta EBITDA de sociedade adquirida e sellers finance; 13ª, 14ª e 15ª trazem a definição-base e os degraus em suas cláusulas de covenant. |
| limitation | Arrendamento como residual oneroso e titulares de CRA como credores econômicos finais exigem qualificação jurídica. | docs/product/gold-cases/gc01-gabarito-rascunho.md | linhas 5-14 e 431-444 | O executor assume residual contratual zero e registra os titulares de CRA como credores econômicos; esta revisão não transforma essas qualificações em parecer jurídico. |

## Condições

- Corrigir o horizonte de doze meses para datas-base em 29 de fevereiro e adicionar teste regressivo antes de promover o método.
- Manter condicionada a inclusão de arrendamentos em “outra dívida onerosa”.
- Manter condicionada a qualificação jurídica final dos titulares de CRA como credores econômicos.
- Não estender este resultado a EBITDA, degraus, comparabilidade ou headroom; esses pertencem ao executor de covenant.
- Adicionar cobertura explícita para strings vazias, períodos duplicados e múltiplas lacunas simultâneas.

## Notas do revisor

Codex (GPT-5), com leitura local, Python Decimal e Vitest; revisão por modelo, não aprovação humana.

Os números e as fontes do caso gold conferem. O fail decorre do falso bloqueio material no limite de doze meses em ano bissexto; as demais ressalvas são limitações ou lacunas de cobertura.
