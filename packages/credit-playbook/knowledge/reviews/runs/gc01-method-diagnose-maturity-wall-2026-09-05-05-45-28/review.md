# Revisão independente por IA: método diagnose-maturity-wall v2026.09.05-v7

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-diagnose-maturity-wall-2026-09-05-05-45-28, commit 63dbf95. Fingerprint 874b6ef6c7980c40c992ca529e0b6b926022fee39d119e73f4800bcf06de4865.

Resultado: **fail**. Evidências: 21 confirmed, 5 corrected, 2 unverifiable, 2 limitation.

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
| confirmed | Integridade do corpus: todos os arquivos correspondem aos hashes SHA-256 do manifesto. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries | Todos os hashes foram recalculados localmente; nenhuma divergência. |
| confirmed | Gold — unidade R$ mil, dívida bruta 5.670.186 e data-base 31/05/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39 |  |
| confirmed | Gold — cronograma atual: 1.229.828; 776.868; 1.228.475; 694.497; 994.544; 809.198; ajuste (63.224). | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40, cronograma de amortizações |  |
| confirmed | Gold — cronograma anterior: 1.074.636; 712.945; 886.187; 586.660; 989.147; 805.151; ajuste (66.343). | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40, coluna 28/02/2026 |  |
| confirmed | Gold — caixa e equivalentes de 1.430.714, resgatáveis em até 90 dias, não disponibilidade D0. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 3, página 20 |  |
| confirmed | Gold — autorização de notas comerciais por R$ 251.000.000, em reunião de 18/05/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ca_notas_comerciais_2026-05-27.txt | páginas 1-2, itens 1 e 5(c) | A ata autoriza a emissão; não comprova contrato concluído nem desembolso. |
| confirmed | Gold — autorização de CPR de até R$ 535.000.000, em reunião de 18/05/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ca_operacao_estruturada_2026-05-27.txt | páginas 1-2, itens 1 e 5(i)(a) | O valor é limite máximo, não montante desembolsado. |
| corrected | Gold — claimedPeriod 2026/27 para notas comerciais e CPR. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 11.3, linhas 291-297 | As atas não atribuem as operações ao ano-safra 2026/27. No gold, claimedPeriod deveria ser null; o teste inventa essa atribuição, embora o executor corretamente não a use na cobertura. |
| confirmed | Gold — covenant é evento não automático e, salvo decisão válida pela não declaração, ocorre aceleração. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.24.3(VIII) e 7.24.5, páginas 54-55 |  |
| unverifiable | Limiar de parede 0,20 e policyVersion 2026.09.05-v8. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linha 9 | O material permitido não contém a política versionada que estabelece 20%; o gabarito chama os valores de picos, mas não ancora esse limiar. |
| unverifiable | Datas endsAt em 31 de maio de cada ano. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 | A fonte informa intervalos mensais — Jun/26 a Mai/27 etc. — mas não escreve os dias finais exatos usados pelo teste. |
| confirmed | Reconciliação do cronograma. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 | 1.229.828 + 776.868 + 1.228.475 + 694.497 + 994.544 + 809.198 = 5.733.410; menos 63.224 = 5.670.186. |
| confirmed | Variações contra 28/02/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40, duas colunas consolidadas | Recálculo: 155.192; 63.923; 342.288; 107.837; 5.397; 4.047. O teste afirma corretamente 342.288 para 2028/29. |
| confirmed | Participações na dívida bruta e classificação pelo limiar fornecido. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 190-201 | Recálculo a oito casas: 0,21689377; 0,13700926; 0,21665515; 0,12248223; 0,17539883; 0,14271102. Com limiar 0,20, somente 2026/27 e 2028/29 são paredes; 2026/27 é o pico por 1.353. |
| confirmed | Cobertura do primeiro período somente com caixa. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 55-60 | 1.430.714 / 1.229.828 = 1,16334479x; caixa final = 200.886; déficit = 0. |
| confirmed | Cobertura sequencial dos períodos seguintes. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 61-70 e 185-199 | Déficits recalculados: 575.982; 1.228.475; 694.497; 994.544. Acumulados: 575.982; 1.804.457; 2.498.954; 3.493.498. O bucket aberto 809.198 não é avaliado. |
| confirmed | Dívida líquida contratual, EBITDA implícito e headroom contextual. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | notas 15 e 25, páginas 40 e 51 | 5.670.186 + 14.335 − 235 − 1.430.714 − 25.095 = 4.228.477; 4.228.477 / 4,72 = 895.863,77; contra 4,00x, headroom aritmético = −0,72x. O executor revisado não produz headroom. |
| confirmed | Definições-base de Dívida Líquida e EBITDA. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definições, página 7; cláusula 7.24.3(VIII), páginas 54-55 | A dívida líquida inclui dívidas onerosas e derivativos passivos, menos caixa, aplicações e derivativos ativos; EBITDA é LTM. Degraus: 3,50x e 4,00x conforme quitação dos CRA. |
| confirmed | Exceção de EBITDA da 11ª emissão. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3, páginas 34-35 | Somente a 11ª acrescenta EBITDA da adquirida e sellers finance. O executor não usa EBITDA como CFADS, corretamente. |
| confirmed | Comparabilidade do cronograma anterior. | packages/credit-playbook/knowledge/procedures/refinance/diagnose-maturity-wall.md | Output walls, linha 84 | No gold, os valores vêm das duas colunas da mesma tabela, unidade e perímetro. O executor calcula atual menos anterior e recusa data não anterior, unidade ou perímetro divergentes. |
| corrected | Contrato de evidência das fontes exige três âncoras com datas. | packages/credit-playbook/knowledge/procedures/refinance/diagnose-maturity-wall.md | Output sources, linha 87 | O executor estrutura datas para contrato e desembolso, mas approval é apenas Anchor, sem campo de data. A data aparece incidentalmente no label do gold, não na evidência estruturada. |
| corrected | Vinculação do default de aceleração ao texto da escritura. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 75-80 e 165-170 | defaultOutcome é fornecido livremente pelo input e não é confrontado com clause.text. Mutar apenas o enum para declared_only_by_assembly faz o executor afirmar o oposto da cláusula 7.24.5; os testes não cobrem essa contradição. |
| corrected | Promessa de recusar reescala coerente sob rótulo incorreto. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 33 e 81-96 | A regex de BRL aceita, por exemplo, unit=BRL com nota 'values in BRL thousand'; com valores multiplicados por 1.000 e dívida igualmente reescalada, a conciliação passa. Isso viola a recusa prometida pelo método. |
| corrected | Validade civil das datas. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linha 27 e linhas 89-90 | isoDate valida apenas o formato; datas inexistentes como 2026-99-99 passam e podem alterar ordenação e alocação temporal. Não há teste dessa mutação. |
| confirmed | Base insuficiente no gold. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 211-223 e 250-255 | O estado é incomplete; CFADS, juros, liquidez D0 e ambas as fontes não provadas aparecem como insufficient_evidence. Nada ausente é preenchido com zero no output semântico. |
| confirmed | Bloqueio por cronograma vazio, dívida bruta zero ou falta de conciliação. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 171-188 | O executor devolve walls vazias, peak nulo e nenhuma cobertura por período; os testes cobrem vazio e escala que quebra a conciliação. |
| confirmed | Mutações de aprovação, D0, limiar exato, unidade/perímetro anterior, fonte sem desembolso, ajuste negativo e separação da aceleração. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 78-147 e 167-231 | As nove provas passaram localmente. As mutações materiais identificadas acima — claimedPeriod inventado, rótulo BRL/thousand, enum contraditório e data civil inválida — não são cobertas. |
| confirmed | Determinismo por ordem de entrada e fingerprints. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 149-156 e 257-258 | Períodos e fontes são canonizados e objetos são serializados com chaves ordenadas. Vinte permutações preservam os dois fingerprints. |
| limitation | Força probatória dos testes de consistência. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 149-160 | Eles provam permutações do gold com geração e juros nulos, mas não permutam records não vazios, empates de vencimento nem demonstram por mutação que alterar o trace altera o outputFingerprint. |
| limitation | Conformidade com o contrato declarado. | packages/credit-playbook/src/procedure-contract.ts | linhas 304-316 | O contrato compilado valida tipos e presença dos campos superiores, mas não descreve a estrutura interna dos objetos. O teste de contrato afirma apenas os outputs de topo; não detecta a data ausente em approval. |

## Condições

- O limiar 0,20 e a versão de política 2026.09.05-v8 precisam ser fornecidos com fonte canônica; não constam do material permitido.
- A aplicação definitiva do degrau de 4,00x continua condicionada à prova da quitação ordinária dos CRA de referência, conforme gc01-gabarito-rascunho.md, condições 3 e seção 13.1.
- A inclusão de arrendamentos em 'outra dívida onerosa' exige interpretação jurídica especializada, conforme gc01-gabarito-rascunho.md, condição 1.
- A ausência de contrato e desembolso é comprovada somente dentro do corpus congelado; não equivale a afirmar que as operações nunca ocorreram.
- As datas endsAt no último dia de maio são uma convenção de implementação não explicitada no cronograma mensal da nota 15.

## Notas do revisor

Codex (GPT-5), com inspeção, testes e recálculo local; sem internet.

Falha material: o gold atribui períodos não sustentados às operações autorizadas; o executor omite a data estruturada da aprovação e aceita mutações que burlam escala, validade de datas e o sentido da cláusula de aceleração. A aritmética do cronograma e da cobertura confere.
