# Revisão independente por IA: método reconcile-covenant-definitions v2026.09.05-v13

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-reconcile-covenant-definitions-2026-09-05-05-48-44, commit da8c152. Fingerprint e003fdc24b2b1542db3ef27c095064310f35793fcda38a4b860d1812179adbfa.

Resultado: **fail**. Evidências: 16 confirmed, 1 unverifiable, 1 limitation, 4 corrected.

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
| confirmed | 1.1 O corpus usado corresponde ao manifesto congelado. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries, linhas 5-220 | Os SHA-256 dos 43 arquivos foram recalculados; todos conferem. |
| confirmed | 1.2 Os operandos gold são 5.670.186, 14.335, 235, 1.430.714 e 25.095, em R$ mil consolidados. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | páginas 11, 20, 39 e 51; notas 3, 15 e 25 | Cada valor e seu período de 31/05/2026 foram localizados. |
| confirmed | 1.3 O passivo de arrendamento gold é 276.768; as candidatas da nota 16 são 27.119 e 51.290. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | páginas 12, 41 e 51; notas 12, 16 e 25 | A nota 16 soma as candidatas em 78.409, mas não as classifica como sellers finance. |
| confirmed | 1.4 O índice informado é 4,72x em 31/05/2026 e a próxima medição é 28/02/2027. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | página 40, nota 15 | A fonte informa medição anual e não abre o EBITDA usado no 4,72x. |
| confirmed | 1.5 Na 11ª emissão, os degraus são 3,50x até 15/04/2025 ou liquidação elegível e 4,00x após quitação; dívida líquida, EBITDA e ajustes estão na página seguinte. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3(j), páginas 34-35 | As páginas e números usados pelo teste gold conferem. |
| confirmed | 1.6 Na 13ª emissão, as definições estão nas páginas 7-8 e os degraus 3,50x/4,00x, com referências de 16/04/2025 e 29/12/2025, nas páginas 54-55. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 1.1 e 7.24.3(VIII), páginas 7-8 e 54-55 |  |
| confirmed | 1.7 Na 14ª emissão, as definições estão nas páginas 7-8 e os degraus começam na página 54, continuando na 55. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_14a_emissao.txt | cláusulas 1.1 e 7.26.3(VIII), páginas 7-8 e 54-55 | A âncora gold da alínea (b) na página 54 é válida porque seu texto começa nessa página. |
| confirmed | 1.8 Na 15ª emissão, as definições estão nas páginas 7-8 e ambos os degraus estão na página 56. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_15a_emissao.txt | cláusulas 1.1 e 7.26.3(VIII), páginas 7-8 e 55-56 |  |
| unverifiable | 1.9 A quitação ordinária dos CRA de referência não está demonstrada no material permitido. | docs/product/gold-cases/runs/gc01/ai-review-corpus/cra_257_relatorio_mensal_4t25.txt | páginas 2-3, vencimento e saldo devedor até novembro de 2025 | O relatório confirma vencimento em 29/12/2025 e saldo até novembro, mas não a liquidação; o gabarito registra a mesma lacuna na seção 13.1. |
| confirmed | 2.1 A dívida líquida gold e o EBITDA implícito foram recalculados. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 124-155 | 5.670.186 + 14.335 - 235 - 1.430.714 - 25.095 = 4.228.477; 4.228.477 / 4,72 = 895.863,77118644. Confere com 4.228.477 e 895.863,77 do executor. |
| confirmed | 2.2 As aritméticas adversariais e de headroom dos testes conferem. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 135-185 e 241-250 | Com arrendamento: 4.228.477 + 276.768 = 4.505.245; sem derivativos: 4.214.377; obrigação hipotética: 4.328.477; 4,00 - 4,72 = -0,72 e -0,72/4,00 = -0,18; covenant mínimo: 4,72 - 6,00 = -1,28. |
| confirmed | 3.1 A definição-base de dívida líquida e EBITDA é materialmente igual nas quatro escrituras; somente a 11ª contém o ajuste de adquirida e sellers finance. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.1, linhas 366-388 | O executor representa separadamente adição ao denominador e obrigação do numerador. |
| confirmed | 3.2 O 4,72x só pode ser colocado contra o degrau de 4,00x de forma condicionada; 3,50x não é automaticamente comparável e nenhum headroom formal deve ser emitido. | packages/credit-playbook/knowledge/procedures/financial/reconcile-covenant-definitions.md | linhas 54-69 e 99-113 | O gold mantém 4,00x como degrau não provado, registra 4,72x, comparabilidade conditional e headroom nulo. |
| limitation | 3.3 Classificar arrendamento como outra dívida onerosa e definir o lado contratual de sellers finance exige julgamento jurídico não fornecido pelo corpus. | docs/product/gold-cases/gc01-gabarito-rascunho.md | condições 1-3 e seção 13.1, linhas 5-14 e 366-388 | O executor não decide silenciosamente: exclui arrendamento, deixa sellers finance desconhecido e mantém veto jurídico. |
| confirmed | 4.1 Base vazia bloqueia; relatório fiduciário isolado não produz headroom; componentes, datas, perímetros ou EBITDA insuficientes impedem comparação plena. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 163-173, 253-260 e 298-346 | A execução local passou esses testes. |
| confirmed | 4.2 Candidatas e sellers finance sem valor classificado permanecem em uncovered_terms como insufficient_evidence e não entram no numerador. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 402-417 | 27.119 e 51.290 permanecem separados; a fórmula gold não contém obligation. |
| corrected | 5.1 A validação não garante a polaridade dos derivativos nos dois sentidos, apesar da promessa do método. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 39-48 e 157-173 | Mutação executada: texto literal nomeando somente derivativo passivo foi aceito com derivative_assets adicional. O executor produziu dívida 83, índice 4,15x e headroom -0,15x; pelo texto literal seriam 90, 4,50x e -0,50x. É erro material de definição e cálculo não coberto pelos testes. |
| corrected | 5.2 Um vencimento conhecido não encerra o degrau until quando falta o fato de outra referência, contrariando a regra do primeiro vencimento. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 364-400 | Mutação executada com referência A vencida e referência B sem fatos retornou [unproven, unproven]. Pela regra do método, o primeiro degrau deveria estar ended; somente o degrau after permaneceria unproven. |
| corrected | 5.3 A obrigação classificada do numerador não carrega nem valida unidade antes de ser somada à dívida. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 64-71, 193-206 e 438-450 | O schema da obligation contém valor, data e âncora, mas não unidade; portanto uma escala incompatível pode alterar materialmente a dívida enquanto o resultado declara a unidade geral da base. |
| confirmed | 6.1 As vinte permutações previstas para o gold produzem cálculos e fingerprints idênticos, e o fingerprint de saída inclui cálculos e fingerprint de entrada. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts | linhas 348-379 | Vitest local: 27 testes aprovados; o teste cobre instrumentos, fatos, componentes, ajustes, referências e componentes reportados. |
| corrected | 6.2 Os testes de consistência não provam invariância para candidateObligations duplicadas, e o executor não é invariável nesse caso. | packages/credit-playbook/src/executors/reconcile-covenant-definitions.ts | linhas 128-129, 298-314 e 561-564 | Duas candidatas com o mesmo id e valores distintos foram aceitas; inverter a ordem alterou inputFingerprint, outputFingerprint e a ordem da saída. Não existe teste de duplicidade ou permutação dessas candidatas. |
| confirmed | 6.3 O contrato caracteriza esta atividade como revisão independente por modelo, nunca aprovação humana. | packages/credit-playbook/src/procedure-contract.ts | linhas 13-20 e 158-177 | Este registro não aprova o método em nome de pessoa. |

## Condições

- Obter prova documental da quitação ordinária dos CRA de referência; até lá, 4,00x permanece insufficient_evidence (gabarito, seção 13.1).
- Manter revisão jurídica para arrendamento sob outra dívida onerosa e para o lado/valor de sellers finance (escritura da 11ª, cláusula 4.22.3(j), página 35; gabarito, condições 1-3).
- Obter abertura do EBITDA e informações complementares antes de comparabilidade plena ou headroom (ITR, nota 15, página 40).
- Corrigir a validação de polaridade dos derivativos, a resolução do primeiro vencimento, a unidade da obrigação do numerador e a unicidade/ordenação de candidateObligations antes de promover o método.

## Notas do revisor

Codex (GPT-5), revisão independente por modelo com ferramentas locais, Vitest e execuções adversariais; sem internet.

Os números e estados do caso gold conferem, mas quatro comportamentos materiais do executor falham sob mutações permitidas; por isso o resultado global é fail.
