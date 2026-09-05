# Revisão independente por IA: método declare-scenarios v2026.09.05-v3

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-declare-scenarios-2026-09-05-04-46-06, commit a10b3cc. Fingerprint d7d153fbe667aee00c07cfba907feee6f10babc03790fd36d777f464be15146e.

Resultado: **fail**. Evidências: 15 confirmed, 4 unverifiable, 2 limitation, 10 corrected.

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
| confirmed | [F1] O corpus revisado corresponde ao manifesto congelado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries, linhas 5-220 | Recalculados tamanho e SHA-256: 43 de 43 arquivos conferem; não há arquivo excedente. |
| confirmed | [N1] Dívida bruta 5.670.186, caixa 1.430.714, aplicações 25.095, derivativo ativo 235 e passivo 14.335. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | balanço, p. 11, linhas 550-565; notas 15 e 25, pp. 39 e 51, linhas 2034-2065 e 2764-2785 | Valores consolidados em R$ mil. |
| confirmed | [N2] Caixa dedutível 1.455.809 e dívida líquida contratual 4.228.477. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 124-140 | 1.430.714 + 25.095 = 1.455.809; 5.670.186 + 14.335 - 235 - 1.430.714 - 25.095 = 4.228.477. |
| confirmed | [N3] EBITDA LTM implícito usado pelo teste: 895.864; alavancagem-base: 4,71999879x. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 40, linhas 2111-2124 | 4.228.477 / 4,72 = 895.863,771186..., arredondado a 895.864; 4.228.477 / 895.864 = 4,71999879x. |
| confirmed | [N4] Diferença aritmética condicionada contra 4,00x: -0,71999879x. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 5 e 13.1, linhas 137-155 e 376-388 | 4,00 - 4,71999879 = -0,71999879. Isso não demonstra rompimento porque a medição é anual e a comparabilidade é condicionada. |
| confirmed | [N5] Principal de 1.229.828 em 2026/27 e 776.868 em 2027/28. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, p. 40, linhas 2097-2109 |  |
| confirmed | [N6] Média da dívida de 5.329.284,5 usada no choque. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, pp. 39-40, linhas 2060 e 2085-2094 | (5.670.186 + 4.988.383) / 2 = 5.329.284,5. |
| unverifiable | [N7] Choque de 2%, taxa-base de 12,46%, CFADS de 200.000 por período, haircuts de 15%/10% e rolagem de 100%. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json |  | O manifesto não contém declaracao_do_usuario.md, reference-data.ts nem gc02-gabarito-rascunho.md, embora o fixture os cite nas linhas 29-41 do teste. Ocorrências coincidentes no corpus não sustentam essas premissas. |
| unverifiable | [N8] Juros-base 664.028,8487, juros estressados 770.614,5387 e delta 106.585,69. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 31, 40-41 e 81-85 | Aritmética: 5.329.284,5×12,46%=664.028,8487; ×14,46%=770.614,5387; diferença=106.585,69. As taxas de 12,46% e 2% não estão nas fontes permitidas. |
| unverifiable | [N9] Cenário adverso: EBITDA 761.484,4, alavancagem 5,55293976x e diferença condicionada -1,55293976x. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 32 e 81-88 | Aritmética confere: 895.864×(1-0,15)=761.484,4; 4.228.477/761.484,4=5,55293976; 4-5,55293976=-1,55293976. O haircut de 15% não possui fonte no corpus permitido. |
| unverifiable | [N10] Liquidez-base e adversa produzida pelo executor. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 86-94 | Aritmética condicional às premissas confere. Base: coberturas 2,34637445x e 3,3888344x; caixas finais 1.655.809 e 1.855.809. Adverso: CFADS usado 180.000; coberturas 2,33011202x e 3,3373456x; caixas finais 1.635.809 e 1.815.809. CFADS, haircuts e rolagem não têm fonte permitida. |
| confirmed | [N11] Sem rolagem: caixa de 425.981 após 2026/27 e déficit de 150.887 em 2027/28. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 93-98 | 1.455.809+200.000-1.229.828=425.981; 425.981+200.000-776.868=-150.887. Coberturas: 1,34637445x e 0,80577524x. Confirma somente a aritmética das premissas declaradas. |
| confirmed | [D1] Definição codificada de dívida líquida contratual. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definições, p. 7, linhas 324-331 | O executor inclui dívida e derivativo passivo e deduz caixa, aplicações e derivativo ativo, conforme linhas 211-214 e 259-264 do executor. |
| limitation | [D2] Definição e comparabilidade do EBITDA. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3, pp. 34-35, linhas 1317-1337 | O valor da companhia e as informações complementares não estão abertos; a 11ª ainda acrescenta aquisições e sellers finance. O executor corretamente rotula o valor como implícito/conditional, mas não pode confirmar comparabilidade plena. |
| corrected | [D3] O teste chama o degrau de 4,00x de “not applicable”. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.1, linhas 376-388 | A leitura sustentada é “4,00x condicionado à prova da quitação ordinária”, não uma conclusão categórica de inaplicabilidade. O booleano applicable:false e a mensagem das linhas 43 e 67 do teste perdem esse estado intermediário; headroom deve continuar nulo enquanto insufficient_evidence. |
| limitation | [D4] Inclusão de arrendamento em “outra dívida onerosa”. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definição de Dívida Líquida, p. 7, linhas 324-331 | A escritura contém cláusula residual; o ITR mostra arrendamentos de 276.768 na nota 25, p. 51. A qualificação exige interpretação jurídica especializada. |
| confirmed | [E1] Premissa de alavanca ausente bloqueia o cenário sem preencher zero. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 227-256 | Os testes das linhas 101-115 removem haircut, rollover ou metade do refinanciamento e confirmam blocked, insufficient_evidence e resultados nulos. |
| confirmed | [E2] CFADS ausente em um período não é repetido e torna liquidez nula/partial. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 286-309 | Coberto pelo teste das linhas 117-123. |
| confirmed | [E3] Juros ausentes em todos os períodos ficam fora da cobertura e o choque é separado. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 215, 278-308 | É o comportamento do fixture gold, cuja liquidez fica principal_only e registra interest como insufficient_evidence. |
| corrected | [E4] Base com juros apenas em alguns períodos é rotulada principal_only. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 215 e 299-308 | Mutação executada: com juros 10 no primeiro período e nulo no segundo, a saída declarou basis=principal_only, mas o serviço usado foi 60 e 50. A definição e a mensagem são falsas para o primeiro período; o teste não cobre base mista. |
| corrected | [E5] O choque anual é dividido igualmente entre períodos quando todos têm juros. | packages/credit-playbook/src/executors/declare-scenarios.ts | linha 301 | A divisão por input.periods.length não existe no método nem nas fontes. Mutação executada com delta 2 e dois períodos: o serviço virou 61/61, embora cada linha reportasse interest=10. É alocação inventada e saída internamente inconsistente. |
| corrected | [E6] Cada número de liquidez carrega todas as origens de que depende. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 295-306 | As origens das linhas não incluem o caixa inicial; na segunda linha também omitem principal, CFADS e caixa carregado da primeira. Assim, caixa final, cobertura e déficit de 150.887 não possuem trilha completa. |
| corrected | [E7] Fonte contratada preserva contrato e prova de desembolso na saída. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 122-130, 197, 290-306 e 319 | A entrada exige os dois documentos, mas origins e assumption_register descartam ambos e retêm apenas anchor. A validação existe; a proveniência prometida não sobrevive na saída. |
| corrected | [A1] Mutação de escala milhares→milhões é recusada. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 29, 61-64 e 94-100 | O teste altera apenas unit. Mutação executada alterando também a nota fornecida pelo chamador: BRL million foi aceita contra a mesma página 39, embora a fonte diga “Em milhares de reais”. O executor não lê conteúdo nem hash. |
| corrected | [A2] Um cenário adverso não pode ter choque/haircut de zero. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 20, 38-40, 131-141 e 229-234 | Mutação executada: rate_shock=0 foi aceito; cenário e execução ficaram declared e delta=0. O mesmo risco existe para haircuts zero. Os testes verificam ausência e valor acima de 1, não zero explícito. |
| corrected | [A3] Âncoras e classes documentais são verificadas contra o corpus congelado. | packages/credit-playbook/src/executors/declare-scenarios.ts | linhas 63-64 e 94-135 | O chamador fornece name/kind; não há hash nem registro confiável. Pode-se reclassificar um anúncio como itr ou inserir documentos inexistentes, como faz o próprio fixture. O teste cobre nome ausente e classe incompatível apenas dentro desse cadastro autodeclarado. |
| corrected | [A4] EBITDA trimestral anualizado é recusado. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 138-151 | O teste troca months para 3 e prova somente o literal months=12. Um valor trimestral anualizado, mas rotulado months=12 com a mesma âncora, é indistinguível para o executor. |
| confirmed | [A5] Aprovação de R$ 251 milhões não é tratada como desembolso. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ca_notas_comerciais_2026-05-27.txt | deliberação, linhas 45-70 e 86-90 | O executor exige contrato e prova de desembolso para contracted_source. O teste corretamente rejeita a ata isolada; os documentos hipotéticos usados na aceitação não pertencem ao corpus gold. |
| confirmed | [C1] Ordem de entrada e fingerprints são determinísticos nas permutações testadas. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 154-165 | O teste passou em 20 permutações de arrays, reasons e ordem de chaves; a canonicalização está nas linhas 177-190 do executor. Não prova identidade do conteúdo documental, pois hashes não fazem parte da entrada, nem equivalência lexical de decimais como 0.1/0.10. |
| confirmed | [C2] A suíte específica do executor passa. | packages/credit-playbook/src/executors/declare-scenarios.test.ts | linhas 56-170 | Execução local: 1 arquivo, 8 testes aprovados. As mutações independentes acima demonstram lacunas materiais apesar disso. |
| corrected | [C3] O teste de contrato demonstra toda a exigência de evidência aninhada. | packages/credit-playbook/src/procedure-contract.ts | linhas 52-60 e 121-126 | O teste das linhas 167-169 verifica apenas campos de topo. Não detecta origens incompletas de liquidez nem o descarte de contrato/desembolso. |

## Condições

- Obter e congelar a declaração real do usuário e os dados versionados que sustentem CFADS, haircuts, choque e rolagem; registrar seus hashes no corpus.
- Representar o degrau de 4,00x como condicional até prova da quitação ordinária dos CRA; escritura_13a_emissao.txt, cláusula 7.24.3(VIII), pp. 54-55.
- Obter abertura do EBITDA e informações complementares para comparabilidade plena; escritura_11a_emissao.txt, cláusula 4.22.3.
- Submeter a inclusão de arrendamentos em “outra dívida onerosa” à interpretação jurídica especializada; escritura_13a_emissao.txt, definição de Dívida Líquida, p. 7.
- Eliminar a divisão não declarada do choque, corrigir bases com juros parciais e preservar a proveniência cumulativa e as provas de contrato/desembolso.
- Vincular documentos a cadastro confiável e hashes; validar escala e período contra a fonte, não contra notas autodeclaradas.

## Notas do revisor

Codex (GPT-5), revisão independente por leitura local, recálculo e execução de testes/mutações; sem internet.

Falha por comportamentos materiais corrigidos: estado indevido do degrau, alocação inventada de juros, cobertura mista mal rotulada, proveniência incompleta e mutações adversariais aceitas.
