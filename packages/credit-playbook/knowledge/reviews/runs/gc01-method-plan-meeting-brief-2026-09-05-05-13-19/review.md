# Revisão independente por IA: método plan-meeting-brief v2026.09.05-v4

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-plan-meeting-brief-2026-09-05-05-13-19, commit ba9fb28. Fingerprint 1d344c8e374f5505464d40fe464c1e28584a3d2c7cccd3dc2bc5aefe48adc055.

Resultado: **fail**. Evidências: 13 confirmed, 2 unverifiable, 11 corrected, 4 limitation.

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
| confirmed | A integridade do corpus autorizado foi conferida contra o manifesto. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries, linhas 5-220 | Os SHA-256 dos 43 arquivos coincidem com o manifesto. |
| confirmed | A data-base 31/05/2026 usada pela pergunta recusada consta do ITR. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | capa, linhas 1-8 |  |
| confirmed | Dívida bruta de R$ 5.670.186 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39, linhas 2034-2065 | Empréstimos: 1.314.412 + 867.244 + 54.180 + 181.158 − 9.099 = 2.407.895. Debêntures líquidas de custos = 3.262.291. Total: 2.407.895 + 3.262.291 = 5.670.186. |
| confirmed | Picos de R$ 1.229.828 mil em 2026/27 e R$ 1.228.475 mil em 2028/29. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40, linhas 2097-2109 | O cronograma recompõe 1.229.828 + 776.868 + 1.228.475 + 694.497 + 994.544 + 809.198 − 63.224 = 5.670.186. |
| confirmed | Caixa e aplicações de R$ 1.455.809 mil excedem o principal de 2026/27 em R$ 225.981 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 3, página 20, linhas 971-985; nota 25, página 51, linhas 2764-2786 | 1.430.714 + 25.095 = 1.455.809; 1.455.809 − 1.229.828 = 225.981. A nota 3 permite resgate em até 90 dias, portanto não prova disponibilidade em D0. |
| confirmed | Dívida líquida contratual de R$ 4.228.477 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, páginas 39-40, linhas 2034-2065 e 2117-2119; nota 25, página 51, linhas 2764-2786 | 5.670.186 + 14.335 − 235 − 1.430.714 − 25.095 = 4.228.477. A visão do release sem derivativos seria 5.670.186 − 1.455.809 = 4.214.377, ou R$ 4.214,4 milhões arredondados. |
| confirmed | Pro forma de 4,72x contra 4,00x, com próxima medição em 28/02/2027. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40, linhas 2111-2124 | Headroom em índice: 4,72 − 4,00 = −0,72x. EBITDA implícito: 4.228.477 ÷ 4,72 = 895.863,77 mil; é derivação, não EBITDA aberto pela companhia. |
| unverifiable | A aplicabilidade definitiva do degrau de 4,00x depende da quitação ordinária dos CRA de referência. | docs/product/gold-cases/runs/gc01/ai-review-corpus/cra_257_relatorio_mensal_4t25.txt | linhas 47-52 e 77-101 | O relatório mostra vencimento em 29/12/2025 e saldo até novembro, mas não comprova a quitação. |
| unverifiable | O número de cenário de déficit de R$ 150.887 mil em 2027/28 tem fonte gold. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 1-17, linhas 29-494 | O valor aparece apenas na mutação do teste, em plan-meeting-brief.test.ts, linha 97; não foi localizado no gabarito nem no corpus. |
| confirmed | O executor realiza cálculos financeiros próprios. | packages/credit-playbook/knowledge/procedures/materials/plan-meeting-brief.md | Cálculos determinísticos, linhas 58-59 | O método declara nenhum cálculo próprio; o executor apenas ordena e retransmite headlines. Os recálculos acima validam os valores retransmitidos, não cálculos do executor. |
| corrected | Cada fato deve citar o campo do objeto que reproduz o fato. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | schema de headlines e validação, linhas 33-40 e 79-95 | objectPath é opcional e assume null; nenhum conteúdo do objeto ou âncora documental é validado. Todos os headlines gold do teste são aceitos sem objectPath. |
| corrected | O fingerprint do gold prova vínculo criptográfico com a fonte. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | helpers e objetos gold, linhas 7-18 e 44-45 | Os fingerprints são strings artificiais produzidas por padEnd; o teste prova apenas igualdade entre dois campos controlados pelo chamador. |
| confirmed | A definição de dívida líquida inclui empréstimos, debêntures, derivativos e outras dívidas onerosas, menos caixa, aplicações e derivativos ativos. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definições, página 7, linhas 324-357 | A definição-base coincide com o recálculo contratual do gabarito. |
| limitation | Arrendamentos ficam definitivamente fora de 'outra dívida onerosa'. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definição de Dívida Líquida, página 7, linhas 324-331 | A escritura inclui qualquer outra dívida onerosa; decidir se isso alcança arrendamentos exige interpretação jurídica especializada. |
| limitation | A comparabilidade integral do 4,72x com todas as escrituras está demonstrada. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3, páginas 34-35, linhas 1293-1337 | A 11ª inclui informações complementares, aquisições e sellers finance; o ITR não abre o EBITDA pro forma. |
| corrected | O gold do executor preserva todas as condições de comparabilidade do 4,72x. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | objeto cov-01, linhas 12 e 59-63 | O headline registra apenas a condição de quitação dos CRA; omite a condição relativa ao EBITDA e às informações complementares. |
| corrected | O gold representa os dois degraus contratuais, 3,50x e 4,00x. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 9 e 13.1, linhas 217-222 e 366-388 | O teste e sua saída mencionam somente 4,00x. Isso não resiste à mutação do próprio gabarito 'citar 4,0x como único covenant'. |
| confirmed | Pontos 'contra' são determinados pela stance declarada, não pelo kind do objeto. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | montagem dos blocos de stance, linhas 214-220 | Os testes das linhas 87-99 confirmam a separação estrutural; a correção econômica da stance continua dependente do chamador. |
| confirmed | Objetos condicionados e com divergências viram insufficient_evidence; bloqueados são excluídos e não preenchem blocos. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | classificação e uncovered_terms, linhas 191-197 e 267-283 | cov-01 e rec-01 ficam pendentes; blocked-01 fica excluído; seus fatos não preenchem blocos. |
| corrected | Todos os blocos em lacuna entram em uncovered_terms. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 210-229 e 267-270 | open_questions pode ficar em gap, mas é explicitamente excluído de uncovered_terms, contrariando a descrição ampla do método nas linhas 99-100. |
| limitation | Base vazia nunca produz fatos inventados e bloqueia produção. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 210-229, 231-243 e 267-283 | Com zero objetos, os 11 blocos ficam em gap e nenhum fato é inventado; porém um plano confirmado recebe production_allowed=true. O método não define claramente se insufficient_evidence deve impedir produção. |
| corrected | Quando páginas excedem os blocos, o caso volta como pergunta. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | fitPages e unsupported, linhas 163-185 e 235-243 | O executor retorna reason mandando perguntar, mas alignment_questions permanece vazio; não emite a pergunta prometida na linha 68 do método. |
| confirmed | A aritmética de páginas do teste gold está correta. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | PAGE_PLANS e fitPages, linhas 128-137 e 163-185 | Pitch possui 4 + 2 + 2 = 8 blocos. Duas páginas fundem as duas últimas; cinco preservam os oito blocos após divisões; nove é unsupported porque 9 > 8. |
| corrected | O executor resiste à mutação de escala milhares para milhões. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | validação de unidade, linhas 84-94 | A troca para unit='R$ milhões' foi aceita quando o texto continha 5.670.186 sem a palavra 'mil'. O teste das linhas 75-81 só rejeita porque injeta também '(R$ mil)' no texto. |
| corrected | O executor resiste às mutações econômicas do gabarito. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | schema e montagem, linhas 33-109 e 210-229 | Foi aceito como headline utilizável 'Covenant rompido: 4,72x contra 4,00x'. O executor também não possui regras para rejeitar EBITDA trimestral anualizado, inclusão silenciosa de arrendamento, dívida líquida do release como contratual ou dívida apenas autorizada. |
| corrected | Os testes de consistência provam invariância integral à ordem de entrada. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | teste de consistência, linhas 149-169 | O suposto empate de texto tem stance diferente e não é empate no comparador; searched e objectPath não são permutados. |
| corrected | Headlines semanticamente equivalentes têm fingerprint invariável sob permutação. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | stableStringify, normalização e trace, linhas 159-160, 188-190 e 285-286 | Dois headlines com mesmo texto, stance e unit, mas objectPath distintos, produziram inputFingerprint e outputFingerprint diferentes quando invertidos. |
| corrected | A ordem dos documentos em coverage.searched não altera fingerprints. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | candidateQuestionSchema e normalização, linhas 56-65 e 188-190 | Inverter ['a','b'] para ['b','a'] alterou ambos os fingerprints, embora a busca declarada seja a mesma. |
| confirmed | A revisão é registro por modelo e não aprovação humana. | packages/credit-playbook/src/procedure-contract.ts | contrato de revisão independente, linhas 157-168 |  |
| limitation | A paridade contratual testada cobre a semântica e as exceções. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | teste de contrato, linhas 172-174 | O teste verifica apenas os outputs de primeiro nível; não prova definições, proveniência, exceções internas ou determinismo completo. |

## Condições

- Obter prova documental da quitação ordinária dos CRA de referência antes de tratar 4,00x como definitivamente aplicável: cra_257_relatorio_mensal_4t25.txt, linhas 47-52 e 77-101.
- Submeter a inclusão ou exclusão de arrendamentos em 'outra dívida onerosa' a especialista jurídico: escritura_13a_emissao.txt, página 7, linhas 324-331.
- Condicionar a comparabilidade integral do 4,72x à abertura do EBITDA e das informações complementares: escritura_11a_emissao.txt, páginas 34-35, linhas 1293-1337.
- Remover ou documentar o déficit de R$ 150.887 mil: plan-meeting-brief.test.ts, linha 97.
- Tornar objectPath/âncora obrigatórios e usar fingerprints derivados de objetos auditáveis: plan-meeting-brief.ts, linhas 33-40 e 79-95.
- Cobrir e rejeitar as mutações econômicas e de escala do gabarito: gc01-gabarito-rascunho.md, linhas 228-232, 329-336 e 424-429.
- Canonicalizar objectPath e coverage.searched antes de calcular fingerprints: plan-meeting-brief.ts, linhas 159-160 e 188-190.
- Definir explicitamente se insufficient_evidence impede production_allowed e se open_questions deve entrar em uncovered_terms: plan-meeting-brief.md, linhas 84-100.

## Notas do revisor

Codex (GPT-5), revisão por modelo com leitura local, Vitest, TSX e recálculo independente em Node.js.

Os números gold principais conferem aritmeticamente, mas há falhas materiais de proveniência, cobertura das definições e mutações adversariais, além de fingerprints dependentes da ordem. Por isso, o resultado é fail.
