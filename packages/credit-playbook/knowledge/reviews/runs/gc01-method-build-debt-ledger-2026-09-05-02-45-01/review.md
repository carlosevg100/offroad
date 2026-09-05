# Revisão independente por IA: método build-debt-ledger v2026.09.05-v4

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-build-debt-ledger-2026-09-05-02-45-01, commit b1e4e84. Fingerprint f1057fb8bdf12cc9e5c9ee5cbb380f744587320ee8c764eed5fe9fbf6d2d2c15.

Resultado: **fail**. Evidências: 19 confirmed, 7 corrected, 1 limitation.

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
| confirmed | 1. Integridade do corpus congelado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries | Todos os arquivos conferiram com os SHA-256 do manifesto. |
| confirmed | 2. Saldos atuais e anteriores das 18 linhas do gold. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 39, nota 15 | Os saldos dos quatro empréstimos, doze séries e duas linhas de custos coincidem com o teste. |
| confirmed | 3. Dívida bruta 5.670.186; anterior 4.988.383; antes das linhas contra 5.742.510. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 39, nota 15 | Recálculo: soma das 18 linhas = 5.670.186; soma anterior = 4.988.383; 5.670.186 + 9.099 + 63.225 = 5.742.510. |
| confirmed | 4. Conciliação total e primeiro período: 1.229.828 + 4.440.358 = 5.670.186, diferença zero. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | páginas 12 e 39, nota 15 | O circulante e não circulante do balanço conciliam exatamente; o ITR não fornece o rateio por série, justificando split not_possible no gold. |
| confirmed | 5. Cronograma do gold e respectivas participações. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 40, nota 15, cronograma de amortizações | 1.229.828 + 776.868 + 1.228.475 + 694.497 + 994.544 + 809.198 - 63.224 = 5.670.186. Participações recalculadas: 0,21689377; 0,13700926; 0,21665515; 0,12248223; 0,17539883; 0,14271102; -0,01115025. |
| confirmed | 6. Componentes de caixa: 1.430.714, aplicações 25.095, derivativos ativos 235 e passivos 14.335. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | páginas 11, 20 e 51; notas 3 e 25 |  |
| confirmed | 7. Dívida líquida contratual de 4.228.477. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 40, nota 15; componentes nas páginas 11, 20 e 51 | Recálculo: 5.670.186 + 14.335 - 235 - 1.430.714 - 25.095 = 4.228.477. |
| confirmed | 8. Visão do release de 4.214.377, reportado arredondado em 4.214.400, diferença 23. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ri_release_1t26.txt | página 12 do PDF, tabela Endividamento e Caixa | Recálculo em R$ mil: 5.670.186 - 1.430.714 - 25.095 = 4.214.377; 4.214.400 - 4.214.377 = 23. |
| confirmed | 9. Grupos por moeda e saldo estrangeiro. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 39, nota 15, notas (i)–(iii) | BRL 4.639.928; USD 867.244; CLP 54.180; PEN 181.158. Estrangeiro = 1.102.582. Sobre 5.742.510, participações: 0,80799650; 0,15102177; 0,00943490; 0,03154683; soma 1. |
| confirmed | 10. Grupos por indexador. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 39, nota 15, saldos por série | Com a tipagem dos relatórios fiduciários: CDI 2.172.858; IPCA 743.955; prefixado 408.703; desconhecido 2.416.994. Sobre 5.742.510: 0,37838123; 0,12955223; 0,07117149; 0,42089504; soma 0,99999999 por arredondamento. |
| corrected | 11. Remuneração e vencimento da 11ª: CDI + 1,55% e 30/10/2028. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_11a_emissao.txt | página 1, vencimento; página 2, remuneração | Os valores conferem, mas o executor ancora também o vencimento na página 2. O vencimento está na página 1; somente a remuneração está na página 2. |
| confirmed | 12. Termos das três séries da 13ª emissão. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_13a_emissao.txt | páginas 2–4, características das séries | DI + 0,65%/16-11-2028; IPCA + 6,3416%/18-11-2030; IPCA + 6,5264%/16-11-2033. |
| confirmed | 13. Termos das três séries da 14ª emissão. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_14a_emissao.txt | páginas 2–4, características das séries | 104% DI/15-06-2029; IPCA + 6,8286%/16-06-2031; IPCA + 6,9982%/15-06-2034. |
| confirmed | 14. Termos das quatro séries da 15ª emissão. | docs/product/gold-cases/runs/gc01/ai-review-corpus/af_15a_emissao.txt | páginas 2–5, características das séries | 105% DI/18-11-2030; 14,15% prefixada/16-11-2032; IPCA + 8,20%/16-11-2032; IPCA + 8,70%/16-11-2035. |
| confirmed | 15. Eco Securitizadora é titular formal das debêntures das 13ª, 14ª e 15ª emissões. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_14a_emissao.txt | página 3, considerando D | A mesma estrutura aparece nas escrituras da 13ª e 15ª, página 3, considerando D. |
| corrected | 16. Âncoras dos credores econômicos das 14ª e 15ª emissões. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.5, linhas 418–431 | Os relatórios af_14a/af_15a, página 2, provam o lastro, mas não que os titulares orientam a securitizadora. Para esse fato, as âncoras adequadas são escritura_14a_emissao.txt, cláusula 7.26.5, e escritura_15a_emissao.txt, cláusula 7.26.5, ou os termos de securitização correspondentes. |
| corrected | 17. loan-usd possui uncoveredTerms de garantia por suposta ausência total de fonte. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 40, nota 15, último parágrafo | O ITR declara que a controladora garante as dívidas das controladas no exterior. A fonte não individualiza contratos, mas torna falsa a justificativa absoluta de que nenhuma fonte informa garantia para a dívida estrangeira. |
| corrected | 18. A definição contratual registrada no gold é literal e está ancorada no ITR, página 40. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 40, nota 15, composição da dívida líquida | O texto do teste é uma paráfrase mais próxima das escrituras, não o texto literal do ITR. A definição detalhada, inclusive outra dívida onerosa, está nas escrituras; por exemplo, escritura_13a_emissao.txt, página 7, definição Dívida Líquida. |
| corrected | 19. Validador bloqueia toda definição cujo texto contradiz a fórmula. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 171–181 e 264–280 | Ele testa apenas presença de caixa e derivativos. Aceitou release='dívida bruta mais caixa e aplicações financeiras' e contractual='derivativos mais caixa', embora execute subtrações e inclua dívida e aplicações ausentes do texto. |
| corrected | 20. A conferência do cronograma garante que o primeiro período corresponde ao circulante. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 249–259 | O executor confia no rótulo currentPeriod. Uma mutação com primeiro período 0, período posterior 40 marcado como currentPeriod e remanescente 60 produziu state=complete contra circulante 40. |
| corrected | 21. A conciliação por prazo valida a classificação de cada linha. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 227–236 | Só os totais agregados são conferidos. Duas linhas de saldo 100 com classificações 50/100 e 50/0, ambas individualmente inconsistentes, produziram split reconciled e state=complete. |
| confirmed | 22. Base insuficiente não é preenchida silenciosamente. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 210–215, 238–261, 283–300 e 317–333 | Silêncio e release-only bloqueiam; ausência de balanço, cronograma, caixa ou definição gera incomplete; termos ausentes ficam null e recebem insufficient_evidence. |
| confirmed | 23. Mutações adversariais já cobertas pelos testes. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 156–244 | A suíte passou para escala, troca compensatória agregada, deslocamento entre períodos, definição sem derivativos, silêncio, contradição de dívida zero, âncoras ausentes, linha contra, desembolso, arrendamento, duplicidade e tolerância. |
| confirmed | 24. Determinismo sob permutação de linhas e períodos. | packages/credit-playbook/src/executors/build-debt-ledger.test.ts | linhas 246–255 | Vinte permutações preservam inputFingerprint e outputFingerprint; a suíte completa passou com 10 testes. |
| limitation | 25. Alcance da prova de consistência. | packages/credit-playbook/src/executors/build-debt-ledger.ts | linhas 169 e 184–190 | A canonicalização cobre linhas e períodos. Os testes não provam invariância à ordem de arrays aninhados, como obligation.views, nem à ordem de propriedades dos objetos serializados por JSON.stringify. |
| confirmed | 26. EBITDA, degraus, comparabilidade e headroom não são calculados por este executor. | packages/credit-playbook/knowledge/procedures/financial/build-debt-ledger.md | linhas 98–104, especialmente teste Gold na linha 102 | O método declara que headroom e covenant pertencem a reconcile-covenant-definitions; portanto não há headroom deste executor a recalcular. |
| confirmed | 27. Esta revisão é registro por modelo, não aprovação humana ou de produção. | packages/credit-playbook/src/procedure-contract.ts | linhas 13–19 e 158–168 | O contrato separa ai_independent_review de aprovação do fundador. |

## Condições

- A inclusão de arrendamento em 'outra dívida onerosa' exige interpretação jurídica não resolvida pelo corpus (docs/product/gold-cases/gc01-gabarito-rascunho.md, seção 5, linhas 135–138).
- A qualificação jurídica final de 'credor econômico' permanece sujeita a revisão especializada (docs/product/gold-cases/gc01-gabarito-rascunho.md, seção 13.5, linhas 418–431).
- A comparabilidade integral do 4,72x e a aplicação dos degraus dependem das informações complementares e da comprovação da quitação dos CRA de referência (docs/product/gold-cases/gc01-gabarito-rascunho.md, seção 13.1, linhas 363–375).
- A prova de fingerprint limita-se às permutações de linhas e períodos testadas (packages/credit-playbook/src/executors/build-debt-ledger.test.ts, linhas 246–255).

## Notas do revisor

Codex (GPT-5), revisão por modelo com shell local, Vitest e aritmética independente; sem internet.

Os números centrais e os termos econômicos recalculam corretamente, mas há erros materiais de evidência e comportamento: garantia estrangeira tratada como totalmente desconhecida, âncoras incorretas, validação textual superficial, primeiro período manipulável e classificações por linha não conciliadas.
