# Revisão independente por IA: método build-interest-and-indexation-schedule v2026.09.05-v4

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-build-interest-and-indexation-schedule-2026-09-05-04-58-27, commit c86c292. Fingerprint e7d137024cabe6697e960c72a4aa5c1e9890604785a4e306de73d6309dcc02a6.

Resultado: **fail**. Evidências: 15 confirmed, 2 unverifiable, 9 corrected, 3 limitation.

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
| confirmed | [1] Os 43 arquivos do corpus correspondem aos hashes manifestados. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries[0..42] | A verificação SHA-256 retornou OK para todas as 43 entradas. |
| confirmed | [2] Unidade R$ mil, dívida bruta 5.670.186, saldos contábeis 306.038, 282.357, 438.918 e 408.703 e capital de giro USD 867.244. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39, linhas 2014-2065 |  |
| confirmed | [3] Despesa de juros consolidada de 170.548. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 22, página 48, linhas 2553-2565 |  |
| confirmed | [4] CDI diário de 0,051660% em 1–3/09/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/bcb_sgs_cdi_diario.json | linha 1 | Conversão decimal usada pelo teste: 0,0005166. |
| confirmed | [5] 13ª/1ª: 304.160 títulos de R$1.000, DI + 0,65%; 13ª/2ª: IPCA + 6,3416%. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_13a_emissao.txt | seção 2, linhas 35-54 e 89-106 |  |
| confirmed | [6] 14ª/1ª: 411.643 títulos de R$1.000 e 104% da Taxa DI. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_14a_emissao.txt | seção 2, linhas 36-55 |  |
| confirmed | [7] 15ª/2ª: 406.349 títulos de R$1.000 e taxa prefixada de 14,1500%. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_15a_emissao.txt | seção 2, linhas 89-106 |  |
| unverifiable | [8] 304.160, 411.643 e 406.349 são os nominais de abertura em 31/05/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_13a_emissao.txt | posição de ativos em 31/12/2025, linhas 249-259 | Os relatórios confirmam circulação em 31/12/2025, não em 31/05/2026. Além disso, o teste ancora esses números nas escrituras, onde as quantidades finais não foram localizadas. |
| unverifiable | [9] Os períodos têm 63 dias úteis e os cupons ficam nas posições 9, 10, 52, 53 e 54. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 12-23 e 35-37 | O próprio teste declara calendário sintético; esse arquivo não existe no corpus autorizado. Logo, os valores projetados não são verificáveis como números gold do caso. |
| corrected | [10] O teste gold reproduz a seção 11.1 série a série. | packages/credit-playbook/knowledge/procedures/financial/build-interest-and-indexation-schedule.md | linhas 98-105 | A seção 11.1 do gabarito lista 11 combinações de emissão/série; o teste projeta somente 13ª/1ª, 14ª/1ª e 15ª/2ª. As demais são omitidas, agregadas como deb-11 ou recusadas. Não há reprodução série a série. |
| confirmed | [11] Annualização do CDI: 13,899875%. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 45 e 50-54 | Recálculo: (1 + 0,0005166)^252 − 1 = 0,13899874800142587108; arredondado a oito casas = 0,13899875. |
| corrected | [12] Resultados da 13ª/1ª sob a aritmética atualmente executada. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | linhas 300-306 e 340-403 | Saída atual por trimestre, em R$ mil: accrued 10.568,70591872; 10.828,60357781; 10.626,16259332; 10.867,80892364; paid 0; 19.743,74639397; 0; 21.328,12219376; total pago 41.071,86858773. A escritura 13ª, cláusula 7.10.1.2, exige Fator Spread com 9 casas; o executor recebe do cálculo-base apenas 8. Com 0,001621054 e Fator Juros 0,034747196, os pagamentos corrigidos são 19.743,74733135 e 21.328,12633639; total 41.071,87366774. |
| confirmed | [13] Resultados da 14ª/1ª sob 104% do DI. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 80-92 | Recálculo da saída: paid 1.994,73141654; 0; 29.059,77823110; 0; total 31.054,50964764. Os fatores finais de 9 e 54 dias são 0,00484578 e 0,02942919. A verificabilidade econômica continua condicionada ao calendário sintético. |
| corrected | [14] Resultados da 15ª/2ª prefixada. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusula 7.10.1.2.1, linhas 1627-1657 | A escritura exige Fator Juros com 9 casas. O correto para 63 dias é (1+0,1415)^(63/252)−1 = 0,033639218...; o executor usa 0,03363922. Total pago atual: 53.094,71764660; com a camada contratual: 53.094,71426361. |
| corrected | [15] Agregados produzidos no gold. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | linhas 423-436 | Atuais por período: 1.994,73141654; 45.268,05468771; 29.059,77823110; 48.898,53154662. Corrigindo as camadas contratuais: 1.994,73141654; 45.268,05478945; 29.059,77823110; 48.898,53314190. CDI atual 72.126,37823537; corrigido 72.126,38331538. Prefixado atual 53.094,71764660; corrigido 53.094,71426361. |
| confirmed | [16] Cobertura do ledger: projetado 1.122.152, saldo CDI 715.803 e participação 0,19790391. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 94-104 | Recálculo: 304.160 + 411.643 + 406.349 = 1.122.152; 304.160 + 411.643 = 715.803; 1.122.152 / 5.670.186 = 0,197903907..., arredondado = 0,19790391. A data dos três nominais permanece não verificável conforme claim [8]. |
| confirmed | [17] A ponte contábil fica insufficient_evidence e não inventa projetado. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | linhas 452-467 | O período contábil 2026Q2 não integra a projeção e há três séries não projetadas; projected e difference ficam nulos. |
| confirmed | [18] Principal pago é zero no horizonte para as três séries projetadas. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.7.1 e 7.8.1, linhas 1187-1234 | Os vencimentos/amortizações começam após 31/05/2027; o mesmo ocorre para 14ª/1ª e 15ª/2ª nas cláusulas correspondentes. |
| corrected | [19] A definição de atualização IPCA implementa fielmente a escritura. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.9.2, linhas 1263-1370 | A escritura define Data de Aniversário como o Dia Útil anterior à data de aniversário e usa números-índice com dup/dut e camadas truncadas. O executor usa dia-calendário, clipping de fim de mês e simples variações mensais com lag fixo; isso é uma simplificação material. |
| corrected | [20] A separação entre IPCA capitalizado e pago não consta do corpus. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.9.2, linhas 1281-1285 | A escritura diz que o produto da atualização é incorporado ao Valor Nominal Unitário Atualizado. Isso sustenta capitalização para essas séries, embora o ITR isoladamente não faça a separação. |
| corrected | [21] Quando o tratamento IPCA é desconhecido, nenhum cenário é escolhido. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | linhas 405-418 e 423-435 | O executor cria os dois cenários, mas escolhe capitalized_principal como main e usa esse cenário no agregado. treatment_scenarios_pending sinaliza a lacuna, porém o agregado contém números de um tratamento arbitrariamente escolhido. |
| confirmed | [22] Lacunas de nominal, termos, datas e curva produzem uncovered_series, partial/blocked e valores nulos. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | linhas 253-280, 437-471 | O gold recusa o saldo contábil como nominal, nomeia deb-11, deb-13-2 e loan-usd, fica partial; sem curvas, o teste obtém blocked. |
| corrected | [23] O executor nunca preenche uma variação IPCA ausente. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | linhas 326-334 | No pro rata, se o mês calculado estiver ausente, o código usa silenciosamente a variação do mês anterior. Isso contraria a regra de não preenchimento e não é coberto pelos testes. |
| corrected | [24] Amortizações dentro do período reduzem a base de juros na data correta. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | linhas 348-395 | Todos os juros do período são calculados antes de aplicar as amortizações, que são somadas e lançadas ao fim. Uma amortização no meio do período não reduz juros posteriores. O gold não alcança datas de amortização e não detecta isso. |
| limitation | [25] O contrato de saída é validado integralmente. | packages/credit-playbook/src/executors/contract.ts | linhas 5-32 | O teste confere apenas nomes das chaves de topo. Não valida tipos, nulabilidade, estruturas internas, evidências ou trace; procedure-contract.ts fornece o contrato genérico, não um schema runtime específico deste resultado. |
| limitation | [26] As mutações adversariais relevantes estão cobertas. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 112-158 | Há cobertura para cenários IPCA, curva com duas formas, posição inválida de cupom, unidade e série duplicada. Não há teste direto de curva sem source, termos sem âncora, datas ausentes, curva de indexador errado, pro rata sem o mês seguinte, amortização intraperíodo ou agregado sem escolha de cenário. |
| confirmed | [27] Fingerprints são invariantes à ordem de entrada. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 160-177 | As 20 permutações passaram e repetiram inputFingerprint 104e6358126d7fa43c9dfe3798936a223e3304c07c2cf90399071e2770671156 e outputFingerprint dac74b04acac6b84cf0a2a625fbd76eb48b7e98bf4b9328097c08a26d5659ded. O teste não permuta explicitamente amortizações, embora o código as ordene nas linhas 201-208. |
| limitation | [28] Dívida líquida, EBITDA, degraus, comparabilidade de covenant e headroom são definições deste executor. | packages/credit-playbook/knowledge/procedures/financial/build-interest-and-indexation-schedule.md | linhas 31-38 e 78-90 | Esses conceitos não pertencem aos inputs ou outputs deste método. O corpus os trata no gabarito, seção 13.1, mas este executor só implementa cronograma e ponte contábil; nenhuma conclusão de covenant pode ser atribuída a ele. |
| confirmed | [29] A suíte indicada passa integralmente. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 49-181 | Vitest: 1 arquivo, 7 testes, todos passaram. Isso não elimina as divergências porque vários valores esperados reutilizam as mesmas funções e simplificações do executor. |

## Condições

- Os cronogramas não podem ser promovidos como gold até substituir o calendário sintético por contagens ancoradas no corpus e documentar a extrapolação da curva de 04/09/2026; teste, linhas 12-23.
- Os nominais de abertura em 31/05/2026 exigem posição contemporânea ou roll-forward demonstrado desde 31/12/2025; af_13a_emissao.txt, linhas 249-259, e equivalentes das 14ª/15ª.
- É necessário um schema runtime específico para validar as estruturas internas e evidências da saída; packages/credit-playbook/src/executors/contract.ts, linhas 5-32.
- Questões de dívida líquida, EBITDA, degraus, comparabilidade e headroom devem permanecer em revisão própria de covenant; gabarito, seção 13.1.

## Notas do revisor

OpenAI Codex (GPT-5), com leitura local, Vitest e recálculo independente em Decimal.js; sem internet.

Falha por divergências materiais: gold incompleto, arredondamento contratual incorreto, simplificação da fórmula IPCA, escolha arbitrária no agregado de cenários, preenchimento silencioso de variação ausente e amortização aplicada fora da data econômica. Este registro é revisão por modelo, não aprovação humana.
