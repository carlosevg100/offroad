# Revisão independente por IA: método plan-meeting-brief v2026.09.05-v2

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-plan-meeting-brief-2026-09-05-04-14-24, commit b849a68. Fingerprint 6e13e5cdaa3801c49043741a9cf4af01b1956a0511374431b5cc2c440d45c117.

Resultado: **fail**. Evidências: 18 confirmed, 7 corrected, 2 unverifiable, 3 limitation.

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
| confirmed | 1. Integridade do corpus: os 43 arquivos enumerados correspondem aos hashes do manifesto. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries[0..42] | SHA-256 recalculado localmente: 43 correspondências, 0 divergências. |
| confirmed | 2. Dívida bruta de 5.670.186 em 31/05/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39 | 2.407.895 de empréstimos e financiamentos + 3.262.291 de debêntures = 5.670.186, em R$ mil. |
| confirmed | 3. Dívida líquida contratual de 4.228.477. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | balanço, página 11; nota 25, página 51 | 5.670.186 + 14.335 − 235 − 1.430.714 − 25.095 = 4.228.477, em R$ mil. |
| confirmed | 4. Picos de 1.229.828 em 2026/27 e 1.228.475 em 2028/29. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40, cronograma de amortizações | Valores lidos diretamente. O primeiro representa 1.229.828 ÷ 5.670.186 = 21,6894% da dívida bruta; o segundo aumentou 1.228.475 − 886.187 = 342.288. |
| corrected | 5. A manchete gold chama 1.455.809 de “Caixa” e afirma cobertura do principal de 2026/27. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 9-10 | 1.455.809 = 1.430.714 de caixa e equivalentes + 25.095 de aplicações financeiras. A comparação é 118,3750%, com excedente aritmético de 225.981, mas não demonstra cobertura operacional/D0; a nota 3, página 20, admite resgate dos equivalentes em até 90 dias. |
| confirmed | 6. Pro forma de 4,72x, limite indicado de 4,00x e próxima medição em 28/02/2027. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 | Diferença aritmética: 4,72x − 4,00x = 0,72x. Isso não equivale a covenant rompido porque a medição é anual. |
| confirmed | 7. EBITDA implícito e headroom derivados. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 124-155 | 4.228.477 ÷ 4,72 = 895.863,77, aproximadamente 895.900. Mantido esse denominador, headroom de dívida contra 4,00x = 4 × 895.863,77 − 4.228.477 = −645.021,92; comparabilidade permanece condicionada. |
| confirmed | 8. Definição de dívida líquida usada no recálculo. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | página 7, definição de “Dívida Líquida” | Inclui empréstimos, financiamentos, debêntures, derivativos passivos e outra dívida onerosa; deduz caixa, aplicações e derivativos ativos. |
| confirmed | 9. Definição-base de EBITDA nas 13ª, 14ª e 15ª emissões. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | página 7, definição de “EBITDA” | Lucro antes de receitas e despesas financeiras, acrescido de amortização e depreciação dos últimos 12 meses. |
| confirmed | 10. A 11ª emissão acrescenta aquisições e sellers finance à definição-base. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3, páginas 34-35 | A escritura inclui EBITDA da sociedade adquirida e obrigações da aquisição quando aplicável. |
| unverifiable | 11. Aplicação definitiva do degrau de 4,00x. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.24.3, páginas 54-55 | 4,00x depende da quitação integral não decorrente de vencimento antecipado; o corpus não comprova a quitação ordinária dos CRA de referência. |
| unverifiable | 12. Comparabilidade integral do pro forma de 4,72x com cada escritura. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 13.1, linhas 376-388 | Faltam abertura do EBITDA e informações complementares; a 11ª também possui ajuste próprio de aquisições. |
| corrected | 13. Escala das manchetes financeiras do teste gold. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 8-10 | As manchetes omitem “R$ mil”, embora a fonte declare essa unidade nas páginas 39-40. Isso deixa a mutação adversarial milhares versus milhões sem defesa no material montado. |
| confirmed | 14. O executor não faz matemática financeira própria. | packages/credit-playbook/knowledge/procedures/materials/plan-meeting-brief.md | linhas 58-59 | Os valores financeiros são texto dos objetos de entrada; os recálculos acima auditam as afirmações gold, não cálculos efetuados pelo executor. |
| confirmed | 15. Limite de três perguntas e recusa das perguntas cobertas ou triviais. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 173-181 | O caso produz q-angle, q-meeting e q-format; q-itr-date, q-trivial e q-fourth são recusadas conforme prioridade e cobertura. |
| confirmed | 16. Ajuste determinístico do plano de páginas. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 137-159 e 205-213 | O pitch contém 4+2+2=8 blocos. Em 2 páginas fica 4+4; em 5, 1+1+2+2+2; 9 excede 8 e retorna unsupported. Produção só é permitida com o id exato confirmado. |
| confirmed | 17. Objetos bloqueados são excluídos. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 165-171 e 243 | blocked-01 não preenche blocos e aparece em objects_excluded. |
| corrected | 18. Objetos condicionados ou com divergências devem virar lacuna nomeada. | packages/credit-playbook/knowledge/procedures/materials/plan-meeting-brief.md | linhas 61-63 e 89-95 | No gold, cov-01 e rec-01 ficam pending, mas points_against_thesis permanece filled por wall-01 e nenhum uncovered_term registra o covenant. O achado material 4,72x/4,00x é omitido, contrariando também o exemplo das linhas 98-100. |
| corrected | 19. Bloco preenchido exige conteúdo efetivo. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 183-200 | Um objeto utilizável com headlines vazio marca o bloco como filled. No gold, sc-01 deixa assumptions preenchido sem premissa; execução adversarial reproduziu também debt_by_instrument filled com zero manchetes. |
| confirmed | 20. Definição de ponto “contra” vem da stance do fato, não do tipo do objeto. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 91-102 e 187-192 | A separação for/against respeita a stance declarada. |
| corrected | 21. Rótulo do bloco contra a tese. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linha 99 | “Pontos que derrubam a tese” é mais forte que “pontos contra” prometido pelo método. Um pico de vencimento ou condição adversa não necessariamente derruba a tese. |
| corrected | 22. Comportamento quando audiência ou forma não estão disponíveis. | packages/credit-playbook/knowledge/procedures/materials/plan-meeting-brief.md | linhas 48-50 | O método promete emitir a devolutiva e esperar o plano; o schema do executor exige audience e form, portanto rejeita essa base insuficiente antes de produzir a devolutiva. |
| confirmed | 23. Mutação de número ligado a fingerprint diferente. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 64-70 | O teste rejeita 9.999 quando o fingerprint da manchete difere do fingerprint do objeto, além de rejeitar id duplicado. |
| limitation | 24. Mutação de número inventado com ambos os fingerprints atualizados. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 71-78 | O executor aceita a manchete inventada se objeto e manchete carregarem o mesmo SHA-256 sintaticamente válido; ele não valida o hash contra conteúdo ou fonte. Essa defesa depende do controle upstream de objetos aprovados e não é coberta pelos testes. |
| limitation | 25. Mutações econômicas do gabarito. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 10, 11.6 e 13.4 | Os testes não cobrem troca de escala, covenant rompido, EBITDA trimestral anualizado, arrendamento, dívida líquida do release, degrau 3,50x/4,00x ou comparabilidade. O executor de montagem aceita essas afirmações quando internamente ligadas a um objeto utilizável. |
| confirmed | 26. Determinismo sob as permutações efetivamente testadas. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 112-123 | Vitest local passou 6/6; objetos, manchetes distintas e perguntas invertidas mantiveram os fingerprints. |
| corrected | 27. Determinismo geral de ordem e fingerprint. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 133-164 | Manchetes são ordenadas somente por text. Duas manchetes com texto igual e stances diferentes preservam a ordem de entrada; inverter essa ordem alterou inputFingerprint e outputFingerprint. O teste repete essencialmente a mesma reversão 20 vezes e não cobre empates nem permuta audiência com mais de um membro. |
| confirmed | 28. Nota de mudança contra versão anterior. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 219-235 | Detecta mudança de estado do bloco, fingerprint alterado e entrada/saída de objetos; o teste cobre os três casos. |
| confirmed | 29. Natureza desta revisão e ausência de aprovação humana. | packages/credit-playbook/src/procedure-contract.ts | linhas 12-20 e 157-177 | O contrato define ai_independent_review como verificação por modelo e reserva aprovação de produção ao fundador. |
| limitation | 30. Inclusão de arrendamentos em “outra dívida onerosa”. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | página 7, definição de “Dívida Líquida” | Determinar se a expressão alcança o passivo de arrendamento exige interpretação jurídica especializada; o recálculo de 4.228.477 o exclui conforme o gabarito condicionado. |

## Condições

- Preservar o achado condicionado de 4,72x/4,00x e registrar cov-01 em uncovered_terms até prova da quitação ordinária dos CRA; fontes: gabarito, seção 13.1, e escritura da 13ª, cláusula 7.24.3.
- Corrigir a unidade e a definição de 1.455.809: “caixa e equivalentes + aplicações financeiras, em R$ mil”, sem inferir disponibilidade D0; fonte: ITR, páginas 11 e 20.
- Não afirmar comparabilidade integral do 4,72x até obter abertura do EBITDA e informações complementares; fonte: gabarito, seção 13.1.
- Submeter a inclusão de arrendamentos em outra dívida onerosa a especialista jurídico; fonte: escritura da 13ª, página 7.
- Corrigir a ordenação de manchetes com critério total e ampliar o teste de consistência para empates, audiência múltipla e previousVersion.
- Adicionar testes das mutações econômicas do gabarito e impedir blocos filled sem fatos.

## Notas do revisor

Codex (GPT-5), usando leitura, recálculo e execução local de Vitest/TSX; revisão por modelo, sem aprovação humana.

Falha material: o executor omite o principal achado condicionado do gold, permite blocos vazios como preenchidos, perde escala/qualificação de liquidez e não é determinístico para manchetes homônimas. Nenhum número-fonte principal foi recalculado incorretamente.
