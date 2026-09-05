# Revisão independente por IA: método estimate-exit-cost-by-series v2026.09.05-v4

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-estimate-exit-cost-by-series-2026-09-05-04-28-35, commit ce3d454. Fingerprint c56af9675c9c7a589df1c2b696349e4fbb61fcadb477485b8fb43bbc11914681.

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
| confirmed | [1] O corpus gold está íntegro contra o manifesto. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries[0..42] | Os SHA-256 dos 43 arquivos foram recalculados; todos coincidem. |
| unverifiable | [2] A data de saída gold é 04/09/2026. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.2 | A seção não determina essa data; ela é uma premissa criada pelo teste nas linhas 8 e 22-23. |
| confirmed | [3] Os saldos disponíveis são de 31/05/2026 e não fornecem nominal, remuneração acumulada e encargos em 04/09/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, páginas impressas 39-40 | A tabela traz saldos contábeis em milhares de reais em 31/05/2026; portanto as quatro bases usadas no teste ficam corretamente abertas. |
| confirmed | [4] A unidade gold é BRL thousand. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, cabeçalho 'Em milhares de reais – R$' |  |
| corrected | [5] A oferta da 11ª emissão está disponível desde 15/11/2021. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusulas 4.1.1 e 4.14.1 | A Data de Emissão é 30/10/2021 e a cláusula 4.14 não impõe carência. O teste usa 15/11/2021 na linha 26 sem suporte na escritura. |
| corrected | [6] A aquisição facultativa da 11ª está ancorada na cláusula 4.15. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusulas 4.13 e 4.15 | Aquisição facultativa está na cláusula 4.13; 4.15 proíbe amortização extraordinária. O teste fornece a âncora errada na linha 27 e o executor a aceita. |
| confirmed | [7] A oferta da 11ª exige adesão de 100%, prazo mínimo de 15 dias e prêmio não negativo. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusulas 4.14.1.1, 4.14.1.2 e 4.14.1.4 |  |
| confirmed | [8] A 13ª, 1ª série, vence em 14/11/2028; permite saída unilateral desde 14/05/2026, prêmio anual de 0,40% e amortização máxima de 98%. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.7.1, 7.16.1.1-7.16.1.2 e 7.18.1-7.18.1.5 | Os valores 2028-11-14, 2026-05-14, 0.004 e 0.98 do teste conferem. |
| confirmed | [9] A oferta negociada da 13ª está disponível desde 15/11/2023. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.1.1 e 7.14.1-7.14.4 |  |
| confirmed | [10] A 13ª, 2ª série, tem remuneração IPCA + 6,3416%, saída unilateral desde 14/05/2027, amortização com piso e cotação do segundo dia útil anterior, mas resgate total sem piso e com cotação do dia útil anterior. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.16.2.1-7.16.2.2, 7.18.2-7.18.2.6; remuneração em af_13a_emissao.txt, campo REMUNERAÇÃO VIGENTE | A distinção entre amortização e resgate total foi corretamente representada nos campos do teste. |
| confirmed | [11] A 15ª, 1ª série, foi emitida em 15/11/2025, vence em 14/11/2030 e só admite resgate unilateral desde 15/11/2027, com prêmio anual de 0,40%. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusulas 7.1.1, 7.7.1 e 7.16.1.1-7.16.1.2 |  |
| unverifiable | [12] Os números de dias úteis gold são 572 e 1.094. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | lista integral de arquivos | São apenas contagens de segunda a sexta produzidas pelo teste. O documento calendario_anbima_2026.csv citado nas linhas 11 e 13 não está no corpus, e calendario_eventos_2026.txt não é um calendário de dias úteis até 2030. |
| confirmed | [13] O resultado gold é partial, com zero séries estimadas, quatro abertas e totais estimados iguais a zero. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 212-241 e 273-286 | Recálculo: quatro séries sem base ⇒ quatro cheapest_full_exit nulos; soma sobre conjunto vazio = 0; series_estimated = 0; series_open = 4; logo state = partial. O zero não preenche os custos individuais, que permanecem nulos. |
| confirmed | [14] As permissões gold são: 13ª DI permitida; 13ª IPCA e 15ª DI não permitidas; ofertas negociadas permitidas; aquisição da 11ª com preço na contraparte. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 76-89 | As comparações entre 04/09/2026 e as janelas das escrituras produzem os estados esperados. |
| confirmed | [15] O prêmio DI hipotético foi calculado corretamente. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 92-107 | Recálculo próprio: base = 100 + 1,5 + 0 = 101,5; fator = 1,004^(504/252) − 1 = 0,008016; prêmio integral = 0,813624; retirada parcial = 101,5×0,98 = 99,47; prêmio parcial = 0,79735152; oferta = 101,5×1% = 1,015. |
| confirmed | [16] O valor presente hipotético foi reproduzido. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 48-50 e 109-124 | Recálculo próprio a 7%: 6/(1,07^(125/252)) + 106/1,07 = 104,86739704; metade = 52,43369852; duration = 244,97349764 dias úteis. A 2%, o VP prefixado é 109,86292075. |
| corrected | [17] O make-whole inclui corretamente encargos quando o critério de valor presente vence. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.16.2.2 e 7.18.2.1(B) | As cláusulas somam encargos e outros acréscimos ao valor presente. O executor, linhas 255-263, compara/paga somente o VP. Mutação executada: fluxo 200, taxa 7%, encargos 1 ⇒ executor 186,91588785; valor contratual antes de outros acréscimos = 187,91588785. |
| corrected | [18] A duration usada para escolher a NTN-B segue a fórmula contratual. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.16.2.2 e 7.18.2.1, definições de duration, i e FVPd | A escritura desconta a duration pela remuneração da própria série. O executor, linhas 255-262, chama macaulayDurationBusinessDays com a taxa da cotação da NTN-B e nem recebe a remuneração contratual como input. |
| corrected | [19] Toda regra gold está ancorada na cláusula correta. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 25-42 | Além da aquisição da 11ª, os resgates totais da 13ª apontam para 7.19, que é Local de Pagamento, não 7.16; o resgate DI da 15ª aponta para 7.14, que trata da oferta negociada, não 7.16. O executor valida apenas o tipo do documento nas linhas 123-146. |
| corrected | [20] Cotação de data contratual errada é sempre recusada. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 141-145 e 249-254 | O executor confia no campo businessDaysBeforeExit e não exige igualdade com a distância da data. Mutação executada: cotação em 01/09/2026 para saída em 04/09/2026, declarada como offset 2 embora haja três dias de semana, foi aceita como estimated. |
| corrected | [21] Contagem de dias e limite de 98% resistem a mutações adversariais. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 130-140 e 243-247 | A validação só rejeita contagem superior ao teto de dias de semana e só compara fraction com maxFraction fornecido. Mutação com count=0, maxFraction=1 e fraction=1 foi aceita e produziu prêmio zero; para 13ª/14ª/15ª a escritura limita a 98%. |
| corrected | [22] Aquisição facultativa é necessariamente uma saída integral. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.13.1 | A cláusula permite adquirir Debêntures aceitas pelo vendedor, sem exigir toda a série. O executor classifica acquisition como scope full por exclusão nas linhas 232-240. |
| confirmed | [23] Bases, fluxos, cotações e escrituras ausentes nunca são inventados. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 212-241 e 249-266 | Base ou escritura ausente gera uncovered_terms e insufficient_evidence; cotação ou fluxos ausentes deixam a rota sem preço; aquisição permanece price_at_counterparty. |
| corrected | [24] O teste gold reproduz a seção 13.2 por família. | packages/credit-playbook/knowledge/procedures/refinance/estimate-exit-cost-by-series.md | linha 109 | O fixture gold nas linhas 22-44 cobre somente 11ª/1ª, 13ª/1ª, 13ª/2ª e 15ª/1ª. Não cobre a 14ª, a prefixada da 15ª, as IPCA da 15ª nem todas as carências listadas no gabarito §13.2. |
| confirmed | [25] O executor é invariável à ordem de documentos, séries, mecanismos, fluxos e chaves. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.ts | linhas 192-203 e 286-288 | Ele ordena as coleções relevantes, serializa chaves em ordem e inclui cálculos e inputFingerprint no outputFingerprint. |
| limitation | [26] Os testes de consistência provam integralmente a qualidade do fingerprint. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 169-189 | Eles confirmam igualdade em 20 execuções, mas repetem poucas permutações e não testam sensibilidade: um fingerprint constante também satisfaria somente essas asserções. A sensibilidade é sustentada pela leitura do SHA-256 nas linhas 195-203 do executor, não pelo teste. |
| limitation | [27] Dívida líquida, EBITDA, degraus, comparabilidade e headroom são definições deste executor. | packages/credit-playbook/knowledge/procedures/refinance/estimate-exit-cost-by-series.md | linhas 32-96 | Esses conceitos pertencem ao covenant do gabarito §13.1; não aparecem nos inputs, cálculos ou outputs deste método de custo de saída. Não há headroom a recalcular neste executor. |
| confirmed | [28] A revisão automatizada existente passa. | packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts | linhas 75-190 | Execução local: 30 arquivos e 252 testes passaram, inclusive o arquivo sujeito; isso não cobre as mutações materiais [17]-[22]. |
| limitation | [29] A interpretação jurídica final pode ser aprovada por esta revisão. | packages/credit-playbook/knowledge/procedures/refinance/estimate-exit-cost-by-series.md | linha 24 | O próprio método exige revisão jurídica; este registro apenas confronta texto, cálculo e comportamento como revisão por modelo. |

## Condições

- Antes de monetizar o caso GC01, obter base na data de saída, fluxos completos, calendário de dias úteis e cotações dos dias contratuais; gabarito §13.2-13.3 e ITR nota 15, páginas impressas 39-40.
- Submeter a interpretação jurídica final das escrituras a especialista, conforme estimate-exit-cost-by-series.md:24.
- Corrigir os comportamentos materiais [5], [6], [17]-[22] e ampliar o gold conforme [24] antes de elevar a maturidade definida em procedure-contract.ts:12-20 e 208-217.

## Notas do revisor

OpenAI Codex (GPT-5), revisão independente por modelo com ferramentas locais de leitura, Vitest e execução TypeScript; não constitui aprovação humana.

Fail por erros materiais de data/âncora, encargos no make-whole, fórmula de duration, validação da data da cotação, dias úteis, limite de amortização e escopo da aquisição. Os totais gold atuais conferem apenas porque nenhuma série foi precificada.
