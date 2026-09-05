# Revisão independente por IA: método diagnose-maturity-wall v2026.09.05-v6

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-diagnose-maturity-wall-2026-09-05-05-28-37, commit d564708. Fingerprint 5eaf9f6f3d07d806b15ee137c9a0318ca8a406560ba1db0aad5383c1d877e0e7.

Resultado: **fail**. Evidências: 23 confirmed, 1 unverifiable, 2 corrected, 5 limitation.

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
| confirmed | Integridade do corpus gold. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | schemaVersion e 43 entries | SHA-256 recalculado para os 43 arquivos; nenhuma divergência. |
| confirmed | Unidade R$ mil, dívida bruta 5.670.186 e data-base 31/05/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, pp. 39-40, linhas 2060-2065 e 2094 |  |
| confirmed | Cronograma atual 1.229.828; 776.868; 1.228.475; 694.497; 994.544; 809.198 e ajuste (63.224), com comparativos 1.074.636; 712.945; 886.187; 586.660; 989.147; 805.151 e (66.343). | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 40, linhas 2097-2109 |  |
| confirmed | Caixa e equivalentes de 1.430.714, com aplicações resgatáveis em até 90 dias. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 3, p. 20, linhas 971-985 | A fonte não prova disponibilidade integral em D0. |
| confirmed | Notas comerciais de R$ 251 milhões eram somente aprovadas. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ca_notas_comerciais_2026-05-27.txt | pp. 2-3, linhas 45-70 e 100-108 | Equivale a 251.000 em R$ mil; data de emissão e cronograma dependiam do futuro Termo de Emissão. |
| confirmed | CPR de até R$ 535 milhões era somente aprovada. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ca_operacao_estruturada_2026-05-27.txt | p. 2, linhas 45-69 | Equivale a até 535.000 em R$ mil; a ata prevê contratos e desembolsos posteriores. |
| unverifiable | Limiar gold de 0,20, política 2026.09.05-v8. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 8-10 | O material permitido contém a chave da política, mas não a fonte versionada que estabelece 20%. |
| confirmed | Conciliação do cronograma. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 40, linhas 2102-2109 | 5.733.410 de vencimentos − 63.224 de ajuste = 5.670.186. Comparativo: 5.054.726 − 66.343 = 4.988.383. |
| confirmed | Participações dos seis períodos e classificação das paredes. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 40, linhas 2102-2109 | Dividindo por 5.670.186: 0,21689377; 0,13700926; 0,21665515; 0,12248223; 0,17539883; 0,14271102. Condicionado ao limiar não verificado de 0,20, somente 2026/27 e 2028/29 são paredes. |
| confirmed | Variações contra 28/02/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 40, linhas 2102-2108 | Recalculo: 155.192; 63.923; 342.288; 107.837; 5.397; 4.047. Mesma unidade, perímetro consolidado e data anterior. |
| confirmed | Pico em 2026/27, 1.229.828. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 40, linhas 2102-2107 | É 1.353 maior que o segundo pico, 1.228.475. |
| confirmed | Cobertura sequencial gold dos cinco períodos datados. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 3, p. 20, linhas 971-985; nota 15, p. 40, linhas 2102-2107 | 2026/27: 1.430.714 ÷ 1.229.828 = 1,16334479x, caixa final 200.886. 2027/28: 200.886 ÷ 776.868 = 0,25858447x, déficit 575.982. Depois: déficits 1.228.475, 694.497 e 994.544; acumulados 1.804.457, 2.498.954 e 3.493.498. |
| confirmed | Déficit total do horizonte avaliado de 3.493.498. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 40, linhas 2102-2107; nota 3, p. 20, linhas 976-985 | Principal datado 4.924.212 − caixa 1.430.714 = 3.493.498. |
| corrected | Linha aberta 'after 2031' é não avaliada, mas recebe zeros numéricos. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linha 229; método, linha 86 | Embora state seja not_assessed, opening_cash, sources, closing_cash, incremental_deficit e cumulative_deficit são preenchidos com "0" sem cálculo. Devem ser nulos/não avaliados; o déficit válido permanece apenas no total do horizonte avaliado. O teste só verifica state, nas linhas 67 e 183-200. |
| confirmed | Aprovações não entram como fontes nem no cronograma. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 202-210 e 232-240 | No gold, ambas ficam unproven, amount/period nulos e contracted_sources igual a 0. |
| confirmed | Ausência de CFADS deixa state incomplete e cria insufficient_evidence sem usar EBITDA. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 215-220 e 249-253 | O teste cobre ausência total, declaração parcial e rejeição do formato de EBITDA nas linhas 105-125. |
| confirmed | Juros ausentes não são afirmados como zero. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 219-224 e 231-240 | O cálculo interno usa zero somente para produzir a visão explicitamente principal_only; a saída mantém interest=null e registra insufficient_evidence. |
| confirmed | Caixa contábil não é promovido a liquidez D0. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 222 e 244-248 | Produz cash_availability=insufficient_evidence e ressalva de que não é day-zero liquidity. |
| confirmed | Cronograma vazio, dívida bruta zero ou falta de conciliação bloqueiam paredes e cobertura. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 170-186 | Os testes de bloqueio estão nas linhas 128-145. |
| confirmed | Definição de comparabilidade contra período anterior. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 189-200 | Exige data anterior, mesma unidade e mesmo perímetro; as mutações constam das linhas 165-180 do teste. |
| confirmed | Dívida líquida, EBITDA de covenant e degraus não são calculados por este executor; EBITDA é separado de CFADS. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definições, p. 7, linhas 324-357; cláusula 7.24.3(VIII), pp. 54-55, linhas 2650-2683 | A escritura define dívida líquida, EBITDA LTM e degraus 3,50x/4,00x. O executor limita-se à parede e rejeita EBITDA como geração disponível; não produz headroom. |
| confirmed | Controle de dívida líquida e headroom do gabarito. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | notas 3 e 15, pp. 20 e 40, linhas 976-985 e 2111-2124 | 5.670.186 + 14.335 − 235 − 1.430.714 − 25.095 = 4.228.477; EBITDA implícito = 4.228.477 ÷ 4,72 = 895.863,77; distância para 4,00x = −0,72x. São controles externos, não outputs deste executor. |
| corrected | Gold afirma que não há cláusula de aceleração na base. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 53-74 e 202-216 | O corpus contém a cláusula: quebra do índice é evento não automático e, salvo deliberação pela não decretação, deve haver declaração. O gold deve fornecer essa cláusula e produzir acceleration_scenario=recorded, não not_asserted. |
| confirmed | Mecânica de aceleração por quebra do índice. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.24.3(VIII) e 7.24.5, pp. 54-55, linhas 2650-2704 | Default contratual compatível com declared_unless_assembly_waives; cenário deve permanecer separado do cronograma contratual. |
| limitation | Valor monetário exato acelerável no gold. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.24.1 e 7.24.5, pp. 48 e 55, linhas 2365-2384 e 2690-2704 | A escritura exige principal/valor atualizado, remuneração e possíveis encargos na data da declaração. O saldo contábil isolado de 306.038 usado no teste hipotético não prova o montante acelerável integral. |
| confirmed | Mutações de escala, limiar exato, data passada, ajuste negativo, aprovação e separação da aceleração. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 76-145 e 165-220 | Todas passaram na execução local: 9 testes, 9 aprovados. |
| limitation | Mutações do gabarito sobre covenant rompido, EBITDA anualizado, arrendamento e pro forma. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 10, linhas 228-232 | As duas primeiras e a mutação de pro forma estão fora do contrato deste executor. Arrendamento somado simultaneamente à dívida bruta e ao cronograma pode reconciliar e ser aceito; essa mutação não é coberta pelos testes. |
| limitation | Prova de contrato e desembolso depende da classificação recebida no input. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 59-70, 98-107 e 202-210 | O executor valida datas, valores, classes declaradas e nomes distintos de documentos, mas não verifica conteúdo ou hash. Dois nomes arbitrários marcados como contract/disbursement_proof podem passar; o teste não cobre essa fronteira. |
| confirmed | Determinismo de ordem e fingerprints. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 146-155 e 250-257 | Objetos são serializados com chaves ordenadas; períodos e fontes são canonizados; o outputFingerprint incorpora body, cálculos e inputFingerprint. |
| limitation | Prova de consistência nos testes. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 147-159 | As 20 permutações provam períodos, fontes e reversão de chaves com registros de juros/CFADS vazios. Não provam permutações de interestByPeriod/operatingGeneration preenchidos nem que alterar o trace altera o outputFingerprint. |
| limitation | Compatibilidade com o contrato declarado. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 161-163; procedure-contract.ts, linhas 52-60 | O teste prova apenas nomes top-level. Não valida tipos, nulabilidade ou evidência dos campos internos; por isso não detecta os zeros da linha não avaliada. |

## Condições

- Corrigir o gold para registrar a cláusula de aceleração existente no corpus e remover a afirmação de ausência: escritura_13a_emissao.txt, cláusulas 7.24.3(VIII) e 7.24.5, pp. 54-55.
- Tornar nulos/não avaliados os campos quantitativos sem cálculo do bucket aberto e adicionar regressão: diagnose-maturity-wall.ts, linha 229; método, linha 86.
- Anexar ao material revisável a política que prova o limiar de 20% e sua versão: diagnose-maturity-wall.test.ts, linhas 8-10; método, linhas 24 e 83.
- Antes de afirmar valor acelerável ou alcance sobre arrendamentos e múltiplas emissões, obter reconciliação instrumento a instrumento e revisão jurídica: escritura_13a_emissao.txt, cláusulas 7.24.1, 7.24.3(VIII) e 7.24.5.
- Explicitar e testar a fronteira de confiança da classificação documental, idealmente vinculando contrato e desembolso a conteúdo/hash do corpus: diagnose-maturity-wall.ts, linhas 59-70 e 98-107.

## Notas do revisor

Codex (GPT-5), revisão independente por modelo com leitura, hashing, aritmética e testes locais; sem internet.

Falha por duas divergências materiais: o gold omite uma cláusula existente e o executor sintetiza zeros em um período declarado não avaliado. Os cálculos das paredes e da cobertura dos períodos datados conferem.
