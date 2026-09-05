# Revisão independente por IA: método build-interest-and-indexation-schedule v2026.09.05-v3

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-build-interest-and-indexation-schedule-2026-09-05-04-28-39, commit ce3d454. Fingerprint df8b55139599b85221e499540b1284b960f5e772566c4605a5d5a601bef94f5d.

Resultado: **fail**. Evidências: 12 confirmed, 12 corrected, 1 unverifiable, 3 limitation.

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
| confirmed | C1. O corpus usado na revisão está íntegro. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries, linhas 5-220 | Os 43 arquivos tiveram tamanho e SHA-256 recalculados; nenhuma divergência. |
| confirmed | C2. CDI diário de 0,051660% anualiza para 0,13899875 sob a hipótese constante de 252 dias. | docs/product/gold-cases/runs/gc01/ai-review-corpus/bcb_sgs_cdi_diario.json | linha 1; observações de 01/09/2026 a 03/09/2026 | Recálculo: (1 + 0,0005166)^252 - 1 = 0,138998747..., arredondado a 0,13899875. A fonte não sustenta, porém, sua extensão flat aos quatro períodos futuros. |
| corrected | C3. O teste afirma que 306.038 é o nominal da 13ª emissão, 1ª série. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_13a_emissao.txt | seção 2, linhas 46-54; seção 4, linhas 249-259 | O nominal verificável é 304.160 × R$1.000 = R$304.160 mil. 306.038 é o saldo contábil do ITR, não a quantidade de debêntures. |
| corrected | C4. O teste afirma que 438.918 é o nominal da 14ª emissão, 1ª série. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_14a_emissao.txt | seção 2, linhas 47-55; seção 4, linhas 243-253 | O nominal verificável é 411.643 × R$1.000 = R$411.643 mil; 438.918 é saldo contábil do ITR. |
| corrected | C5. O teste afirma que 408.703 é o nominal da 15ª emissão, 2ª série. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_15a_emissao.txt | seção 2, linhas 98-106; seção 4, linhas 289-301 | O nominal verificável é 406.349 × R$1.000 = R$406.349 mil; 408.703 é saldo contábil do ITR. |
| confirmed | C6. As remunerações 13ª/1ª = DI + 0,65%, 14ª/1ª = 104% DI e 15ª/2ª = 14,15% estão corretas. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 11.1, linhas 242-256 |  |
| confirmed | C7. As datas de cupom usadas para as três séries constam das escrituras. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | Anexo I, linhas 3898-3914 | Para a 13ª/1ª: 13/11/2026 e 14/05/2027. A 14ª aparece no Anexo I da escritura_14a_emissao, linhas 3942-3960; a 15ª/2ª, no Anexo I da escritura_15a_emissao, linhas 4080-4098. |
| confirmed | C8. Dívida bruta de 5.670.186 e despesa de juros de 170.548 são números do ITR. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39, linhas 2035-2065; nota 22, página 48, linha 2562 |  |
| unverifiable | C9. Os 63 dias úteis trimestrais e as posições intraperíodo usadas no teste gold têm fonte do caso. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 10-21 | O próprio teste os declara sintéticos. calendario_sintetico_teste.md e fixture_hipotetico.md não pertencem ao manifesto; os valores projetados não são resultados gold observáveis. |
| confirmed | C10. A aritmética do executor para as entradas sintéticas foi reproduzida independentemente. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 41-96 | 13ª/1ª: fatores 0,03474719; 0,03474720; 0,03474719; 0,03474718, juros pagos 0; 19.865,65119451; 0; 21.459,81048033 e total 41.325,46167484. 14ª/1ª: fator 0,03441758, pagos 2.126,90006604; 0; 30.985,24629750; 0 e total 33.112,14636354. 15ª/2ª: fator 0,03363922, pagos 0; 25.672,17188323; 0; 27.730,12610772 e total 53.402,29799095. Esses cálculos reproduzem o executor, mas partem dos nominais e arredondamentos incorretos do fixture. |
| confirmed | C11. As agregações produzidas para o fixture conferem com as somas das linhas. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | linhas 394-407 | Juros-caixa por período: 2.126,90006604; 45.537,82307774; 30.985,24629750; 49.189,93658805. Totais por indexador: CDI 74.437,60803838 e prefixado 53.402,29799095. |
| corrected | C12. A cobertura gold é 1.153.659 / 5.670.186 = 0,20346052. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_13a_emissao.txt | seção 4, linhas 249-259; combinado com af_14a_emissao e af_15a_emissao nas respectivas seções 4 | Com os nominais documentados: 304.160 + 411.643 + 406.349 = 1.122.152; 1.122.152 / 5.670.186 = 0,19790391. O teste soma saldos contábeis como se fossem nominais. |
| corrected | C13. O teste gold reproduz a seção 11.1 série a série e nomeia todas as séries omitidas. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 11.1, linhas 242-263 | A seção contém doze séries; o fixture projeta apenas três, rejeita uma IPCA e nem inclui as demais séries. ledgerControl também não representa integralmente o ledger, portanto series_omitted não prova cobertura completa. |
| corrected | C14. A definição do executor de que saldo contábil com juros não é nominal está correta, mas é respeitada pelo gold. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | linhas 14-21 e 235-236 | A regra é correta e rejeita a 13ª/2ª, porém o fixture rotula os saldos contábeis da 13ª/1ª, 14ª/1ª e 15ª/2ª como unit_value_x_quantity, contornando a própria proteção. |
| corrected | C15. O arredondamento do gold reproduz as escrituras. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.10.1.2, linhas 1493-1602 | A 13ª exige fator DI em 8 casas, spread e Fator Juros em 9, acumulação diária truncada em 16 e J em 8 sem arredondamento. O executor oferece um único factorDecimals e o teste usa 8. As regras também existem nas escrituras da 14ª, cláusula 7.10.1.2, e 15ª, cláusula 7.10.1.2.1, mas o fixture informa rounding=null. |
| corrected | C16. A atualização IPCA por variação mensal integral no aniversário reproduz a escritura. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.9.2, linhas 1263-1369 | A escritura exige razão entre números-índice, expoente dup/dut pro rata em dias úteis, aniversário ajustado a dia útil e truncamentos intermediários. O executor apenas multiplica variações mensais integrais e aplica toda a atualização antes dos juros do período; seu input nem contém os dias úteis necessários ao pro rata. |
| corrected | C17. O tratamento contratual das séries IPCA não consta do corpus. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.9.2, linhas 1281-1285 | A escritura determina incorporação ao Valor Nominal Unitário Atualizado, isto é, capitalização contratual. Continua não verificável apenas a separação histórica contábil entre atualização capitalizada e paga no ITR. |
| corrected | C18. A 15ª/2ª deve ficar com principal_projection=insufficient_evidence porque o cronograma não está na base. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusula 7.8.2, linhas 1257-1265; Anexo I, linhas 4080-4098 | A base traz duas parcelas, 50% em 14/11/2031 e 100% do saldo em 12/11/2032. O estado insuficiente decorre de omissão no fixture, não de ausência de evidência. |
| confirmed | C19. Quando termos, nominal, pagamentos ou curva faltam, o executor nomeia a lacuna, não projeta a série e bloqueia se nenhuma série sobreviver. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | linhas 235-260, 408-410 e 441-445 | O teste também confirma missing monthly IPCA, missing anniversary e estado blocked nas linhas 129-142. |
| confirmed | C20. Amortização ausente nunca vira zero no agregado e a ponte gold permanece insufficient_evidence. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 82-101 | principal_paid e closing_principal agregados ficam nulos; a ponte fica nula porque 2026Q2 não está na projeção e há séries não projetadas. |
| confirmed | C21. Uma curva sem fonte registrada é recusada. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | curveSchema, linhas 43-52 | Mutação executada localmente: ausência de source falha na validação Zod. Não há, contudo, teste de regressão explícito para o adversarial id declarado no método. |
| corrected | C22. A mutação de escala milhares→milhões é resistida. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | unitSchema, linha 28; input, linhas 91-100 | Mutação executada: trocar BRL thousand por BRL million é aceito e mantém os mesmos valores numéricos; apenas muda a unidade e o fingerprint. Não há conciliação de escala com a evidência. |
| corrected | C23. Datas de cupom com posições de dias úteis não monotônicas são recusadas. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.ts | validação, linhas 122-129; projeção, linhas 327-350 | Mutação executada com datas sucessivas em offsets 8 e 5: foi aceita; o segundo intervalo negativo foi silenciosamente convertido em zero por Math.max(days, 0). |
| limitation | C24. Os testes adversariais cobrem integralmente as promessas do método. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 129-142 | Faltam regressões para escala, termos sem âncora, payment anchor ausente, curva de indexador errado, mês IPCA isolado ausente, arredondamento real das escrituras, offsets não monotônicos, amortizações duplicadas e ponte com primeiro cupom incompleto. |
| confirmed | C25. O executor é invariável às permutações declaradas e os fingerprints refletem essa forma canônica. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 144-160 | As 20 permutações passaram; inputFingerprint e outputFingerprint foram idênticos. A implementação canônica está nas linhas 177-190 e 447-448 do executor. |
| limitation | C26. Os testes de consistência provam determinismo semântico do gold. | packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts | linhas 144-160 | Provam independência de ordem para o fixture, não correção econômica, estabilidade entre versões de dependências nem vínculo dos fingerprints ao conteúdo real dos documentos. |
| limitation | C27. Dívida líquida, EBITDA, degraus, comparabilidade, headroom e a semântica de contra pertencem a este executor. | packages/credit-playbook/knowledge/procedures/financial/build-interest-and-indexation-schedule.md | Objetivo, Produto e Outputs, linhas 31-90 | Esses conceitos não são codificados pelo sujeito; aqui existem ledger coverage e accounting bridge. Sua validação requer revisão separada do método de covenant. |
| confirmed | C28. Esta conclusão é uma revisão por modelo, não aprovação humana. | packages/credit-playbook/src/procedure-contract.ts | reviews, linhas 158-168 |  |

## Condições

- Substituir os três saldos contábeis usados como nominais por 304.160, 411.643 e 406.349 e recalcular cobertura e cronogramas.
- Construir um gold integral das doze séries com calendário e curvas presentes no manifesto; o calendário e a curva flat atuais são hipóteses sintéticas.
- Implementar as regras de arredondamento em camadas e o IPCA pro rata por número-índice e dias úteis antes de considerar o método completo.
- Manter como condição a impossibilidade de decompor historicamente, pelo ITR, atualização IPCA capitalizada versus paga.
- Adicionar regressões para escala, offsets não monotônicos, ponte com primeiro cupom incompleto e demais lacunas enumeradas em C24.
- Dívida líquida, EBITDA, degraus, comparabilidade e headroom não foram aprovados por esta revisão; estão fora do contrato deste executor.

## Notas do revisor

GPT-5 (Codex), revisão por modelo com leitura local, aritmética Decimal independente e Vitest 4.1.10.

Os seis testes locais passam, mas o gold é materialmente inválido: usa saldos contábeis como nominais, fontes sintéticas fora do manifesto e simplificações incompatíveis com as escrituras. Nenhuma aprovação humana é emitida.
