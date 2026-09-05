# Revisão independente por IA: método diagnose-maturity-wall v2026.09.05-v4

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-diagnose-maturity-wall-2026-09-05-04-46-04, commit a10b3cc. Fingerprint c435c18e519089a650ece95e823c05dffda2995907413892866a8ca5819d9a97.

Resultado: **fail**. Evidências: 25 confirmed, 1 unverifiable, 8 corrected, 6 limitation.

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
| confirmed | #1 Integridade do corpus gold. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries, linhas 5-220 | Os 43 arquivos passaram na verificação SHA-256. |
| confirmed | #2 Data-base, unidade e dívida bruta do teste: 31/05/2026, R$ mil consolidado e 5.670.186. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39, linhas 2014-2077 |  |
| confirmed | #3 Cronograma atual/anterior: 1.229.828/1.074.636; 776.868/712.945; 1.228.475/886.187; 694.497/586.660; 994.544/989.147; 809.198/805.151; custos -63.224/-66.343. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40, linhas 2097-2109 | Todos os valores do array periods e seus priors conferem. |
| confirmed | #4 Caixa e equivalentes de 1.430.714, com aplicações resgatáveis em até 90 dias. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 3, página 20, linhas 971-985 | A fonte não prova disponibilidade integral em D0. |
| confirmed | #5 Notas comerciais autorizadas por R$ 251.000 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ca_notas_comerciais_2026-05-27.txt | página 2, linhas 45-67 | A ata usa linguagem de aprovação e termo a ser celebrado; não prova desembolso. |
| confirmed | #6 CPR autorizada em até R$ 535.000 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ca_operacao_estruturada_2026-05-27.txt | página 2, linhas 45-64 | A ata não prova desembolso. |
| unverifiable | #7 Limiar de parede de 20% e policyVersion 2026.09.05-v8. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 3, linhas 81-95 | O gabarito confirma os dois picos, mas o material autorizado não contém a fonte da política de 20% nem dessa versão. |
| confirmed | #8 Fechamento dos cronogramas. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40, linhas 2102-2109 | Atual: 1.229.828+776.868+1.228.475+694.497+994.544+809.198−63.224=5.670.186. Anterior: 1.074.636+712.945+886.187+586.660+989.147+805.151−66.343=4.988.383. |
| confirmed | #9 Participações na dívida bruta. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, páginas 39-40 | Por ordem: 0,21689377; 0,13700926; 0,21665515; 0,12248223; 0,17539883; 0,14271102; −0,01115025. Com limiar de 0,20, apenas 2026/27 e 2028/29 são paredes. |
| confirmed | #10 Variações contra 28/02/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40, linhas 2100-2108 | Diferenças: 155.192; 63.923; 342.288; 107.837; 5.397; 4.047; 3.119. |
| confirmed | #11 Pico em 2026/27. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40, linhas 2102-2104 | 1.229.828 excede 1.228.475 por 1.353; participação 0,21689377. |
| confirmed | #12 Cobertura sequencial do caso gold. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 51-67 | Recálculo: 2026/27: 1.430.714/1.229.828=1,16334479 e sobra 200.886; 2027/28: déficit 575.982; 2028/29: déficit acumulado 1.804.457; 2029/30: 2.498.954; 2030/31: 3.493.498. |
| confirmed | #13 Déficit final de 3.493.498. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40; nota 3, página 20 | Principal avaliado=4.924.212; 4.924.212−1.430.714=3.493.498. |
| corrected | #14 Coberturas negativas depois de o caixa acabar. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 189-209 | O executor carrega déficit como caixa negativo e produz coberturas −0,46885936, −2,59822145 e −2,51266309. Caixa disponível não pode ser negativo: após a exaustão, opening_cash e cobertura do período deveriam ser zero, mantendo o déficit anterior separadamente no acumulado. |
| limitation | #15 Dívida líquida, EBITDA implícito e headroom. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 124-155; seção 13.1, linhas 366-388 | Recálculo: dívida líquida=5.670.186+14.335−235−1.430.714−25.095=4.228.477; EBITDA implícito=4.228.477/4,72=895.863,77; headroom interino=−0,72x, ou excesso indicativo de 645.021,92 sobre 4x. A comparabilidade integral e o degrau aplicável permanecem condicionados; o executor não calcula nenhum desses valores. |
| confirmed | #16 Parede somente quando a participação arredondada a oito casas é estritamente superior ao limiar. | packages/credit-playbook/knowledge/procedures/refinance/diagnose-maturity-wall.md | linhas 63 e 83-85 | O teste de igualdade exata em 0,21689377 confirma que igualdade não classifica parede. |
| confirmed | #17 Significado de contra. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 3, linhas 81-95 | É a variação da mesma faixa de vencimento entre as datas-base 31/05/2026 e 28/02/2026, não a diferença para a faixa imediatamente anterior. |
| limitation | #18 Comparabilidade do prior. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 73-75 e 163-165 | O executor testa data anterior, unidade e perímetro, mas não representa nem compara os limites temporais ou a definição do bucket anterior. Labels iguais com limites redefinidos seriam declarados comparáveis. |
| confirmed | #19 EBITDA não substitui CFADS. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 6, linhas 157-180 | O gabarito distingue proxies de EBITDA de cobertura contratual, caixa e DSCR; o schema aceita apenas CFADS LTM ou projeção declarada. |
| limitation | #20 Dívida líquida, EBITDA de covenant e degraus 3,50x/4,00x. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | schema de entrada, linhas 31-87; saída, linhas 92-118 | Essas definições não são codificadas nem testadas pelo executor. Ele não consegue reconciliar os degraus ou produzir headroom, embora emita uma conclusão sobre quebra de covenant. |
| corrected | #21 Separação entre cronograma contratual e cenário de aceleração. | packages/credit-playbook/knowledge/procedures/refinance/diagnose-maturity-wall.md | objetivo, linhas 31-34; sequência 3, linha 55 | O método promete registrar os dois cronogramas separadamente. O executor não recebe evento, saldo acelerável ou escritura e não produz cronograma de aceleração; apenas emite uma nota fixa. |
| corrected | #22 Mecânica da quebra de covenant. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusulas 7.26.3-7.26.6, linhas 2751-2906 | A quebra é evento não automático, mas a assembleia delibera eventual não declaração; ausência de instalação, quórum ou aprovação leva à declaração. A frase fixa do executor — titulares decidem se declaram — omite esse default contratual. |
| confirmed | #23 Aprovações do conselho permanecem fontes não provadas no gold. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 11.3, linhas 284-297 | O executor não soma os R$ 786 milhões ao caixa ou cronograma e cria uncovered_terms para as duas fontes. |
| corrected | #24 Regra para transformar fonte em proven. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 74-83 | Dois nomes de documentos hipotéticos com flags kind bastam para adicionar 251.000 à cobertura. Não há data, disponibilidade residual nem conciliação com caixa/razão; um desembolso anterior pode ser contado novamente sobre o caixa e gerar dupla contagem. |
| confirmed | #25 Bloqueios por cronograma vazio, dívida bruta zero ou falta de reconciliação. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 139-153 | O estado blocked devolve walls, peak e coverage.by_period vazios. |
| confirmed | #26 Ausência de CFADS, juros, liquidez D0 e fontes provadas no gold. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 181-186 e 218-223 | O resultado fica incomplete, registra insufficient_evidence e não preenche CFADS ou juros com fatos inventados. |
| corrected | #27 Juros informados apenas para parte dos períodos. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 184-188 e 218-223 | Com juros somente em p1, o executor declara coverage_basis=full_debt_service, embora p2 seja principal-only, e não cria uncovered_terms para os juros ausentes. Isso contraria o output prometido nas linhas 86-88 do método. |
| confirmed | #28 Geração declarada somente para um período. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 95-104 | O valor não é repetido nos demais anos; o estado permanece incomplete. |
| confirmed | #29 Buckets sem data final. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 177-198 | Após 2031 e custos ficam not_assessed e não entram no déficit do horizonte avaliado. |
| corrected | #30 Mutação coerente de escala sob outro rótulo. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 28 e 67-68 | A proteção verifica apenas palavras na nota livre do anchor. Alterar unit/grossDebt.unit para BRL million e escrever “BRL million” na nota passa, embora a fonte ancorada declare R$ mil. |
| corrected | #31 Principal negativo adversarial. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 19-20, 40 e 189-208 | Qualquer bucket aceita valor negativo. Um bucket p1=−100 seguido de p2=200, total 100, passa e cria 100 de caixa. O ajuste negativo de custos deveria ser tipado separadamente e nunca tratado como amortização. |
| confirmed | #32 Mutações efetivamente cobertas pelos testes. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 107-124 e 144-160 | Cobrem igualdade ao limiar, escala que não fecha, unidade incompatível, período passado, fonte fora do cronograma, IDs duplicados, prior futuro, unidade/perímetro distintos e fonte não provada. |
| limitation | #33 Mutações do gabarito sobre arrendamento, definições de dívida líquida e degraus. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 10, linhas 228-232; seção 13.4, linhas 424-429 | Não há testes para essas mutações. Um cronograma e grossDebt reconciliados que incluam arrendamento passam, pois o executor não representa a definição da dívida. |
| confirmed | #34 Determinismo por ordenação canônica. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 120-129 e 225-226 | Chaves de objetos são ordenadas; períodos são ordenados por endsAt/label e fontes por id antes dos hashes e cálculos. |
| confirmed | #35 Consistência sob vinte permutações. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 126-138 | As vinte execuções preservam inputFingerprint e outputFingerprint. |
| limitation | #36 Alcance da prova de consistência. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 126-138 | O teste permuta períodos, fontes, chaves de período e chaves de topo; não permuta explicitamente anchors aninhados, evidence, interestByPeriod ou operatingGeneration.byPeriod. |
| confirmed | #37 Inclusão do trace no fingerprint de saída. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 152-153 e 225-226 | O hash inclui body, calculations e inputFingerprint; não inclui recursivamente o próprio outputFingerprint, o que é necessário para evitar autorreferência. |
| corrected | #38 Evidência exigida para afirmações materiais. | packages/credit-playbook/src/procedure-contract.ts | linhas 52-60 | O contrato declara evidenceRequired, mas o output do executor perde os anchors individuais de interestByPeriod e não ancora a nota jurídica; o trace contém operandos, porém não referências às fontes. |
| limitation | #39 Teste de aderência ao contrato. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 140-142 | Prova apenas a lista de campos de topo; não prova schemas aninhados, semântica, proveniência ou preservação de anchors. |
| confirmed | #40 Execução da suíte indicada. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 37-161 | Vitest: 1 arquivo, 7 testes, todos passaram; as falhas acima estão fora das asserções existentes. |

## Condições

- A fonte e a versão do limiar de 20% não constam do material autorizado [gc01-gabarito-rascunho.md, seção 3, linhas 81-95].
- CFADS, juros por período e liquidez integral em D0 não são provados no caso gold [01_ITR_1T26_31mai2026.txt, nota 3, página 20; diagnose-maturity-wall.md, linhas 47-50].
- A comparabilidade do headroom e a aplicação definitiva de 4,00x dependem das condições registradas no gabarito [gc01-gabarito-rascunho.md, linhas 5-14 e 376-388].
- A qualificação jurídica final de titulares de CRA e da mecânica de decisão requer especialista [gc01-gabarito-rascunho.md, linhas 431-444].
- A classificação dos documentos como contrato ou prova de desembolso precisa ser assegurada antes do executor; hoje ele confia nos flags de entrada [diagnose-maturity-wall.ts, linhas 52-64 e 169-175].

## Notas do revisor

Codex (GPT-5), com leitura local, Node e Vitest; revisão por modelo, sem internet.

Fail pelos comportamentos materiais corrigidos nos itens #14, #21, #22, #24, #27, #30, #31 e #38.
