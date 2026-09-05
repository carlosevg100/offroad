# Revisão independente por IA: método plan-meeting-brief v2026.09.05-v5

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-plan-meeting-brief-2026-09-05-05-28-44, commit d564708. Fingerprint 8c7f8b8710b1b2fa9707b9d31ea0e66e57ef02aebd32158dd2a2bf4e56d4f596.

Resultado: **fail**. Evidências: 16 confirmed, 3 unverifiable, 4 limitation, 6 corrected.

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
| confirmed | 1. A integridade do corpus gold foi conferida. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | entries | Os SHA-256 recalculados de todos os arquivos coincidem com o manifesto. |
| confirmed | 2. Dívida bruta de R$ 5.670.186 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 39 | Empréstimos: 1.314.412 + 867.244 + 54.180 + 181.158 − 9.099 = 2.407.895. Debêntures recalculadas = 3.262.291. Total = 5.670.186. |
| confirmed | 3. Dívida líquida contratual de R$ 4.228.477 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | notas 3, 15 e 25, páginas 20, 39–40 e 51 | 5.670.186 + 14.335 − 235 − 1.430.714 − 25.095 = 4.228.477. |
| confirmed | 4. Picos de R$ 1.229.828 mil em 2026/27 e R$ 1.228.475 mil em 2028/29. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40, cronograma de amortizações | O cronograma soma 5.670.186; os picos representam 21,689% e 21,666% da dívida bruta e diferem por 1.353. |
| confirmed | 5. Caixa e aplicações de R$ 1.455.809 mil excedem o principal de 2026/27 em R$ 225.981 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 3, página 20; nota 15, página 40 | 1.430.714 + 25.095 = 1.455.809; 1.455.809 − 1.229.828 = 225.981. Cobertura aritmética = 118,375%, sem provar disponibilidade em D0. |
| confirmed | 6. Pro forma de 4,72x e próxima medição em 28/02/2027. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | nota 15, página 40 | O ITR informa 4,72 e diz que a próxima medição usará as demonstrações encerradas em 28/02/2027. |
| confirmed | 7. Degraus contratuais de 3,50x e 4,00x. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3, páginas 33–34 | 4,72x fica 1,22x acima de 3,50x e 0,72x acima de 4,00x; o degrau de 4,00x depende da forma de quitação dos CRA. |
| confirmed | 8. Os mesmos degraus e a condição de quitação aparecem nas emissões posteriores. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusula 7.24.3, páginas 53–54 | A cláusula preserva 3,50x quando a liquidação decorre de vencimento antecipado. |
| unverifiable | 9. A quitação ordinária definitiva dos CRA de referência não está comprovada. | docs/product/gold-cases/runs/gc01/ai-review-corpus/cra_257_relatorio_mensal_4t25.txt | Características das Séries e gráfico Saldo Devedor, páginas 1–2 | O relatório mostra vencimento em 29/12/2025 e saldo até novembro, mas não documenta a quitação. |
| confirmed | 10. O EBITDA implícito associado ao pro forma. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 138–155 | 4.228.477 ÷ 4,72 = 895.863,77, arredondável para aproximadamente R$ 895,9 milhões; é derivação, não EBITDA aberto pela companhia. |
| limitation | 11. A comparabilidade integral do 4,72x permanece condicionada. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_11a_emissao.txt | cláusula 4.22.3, definição de EBITDA, página 34 | A 11ª inclui aquisições e sellers finance; o ITR não abre EBITDA nem informações complementares. |
| confirmed | 12. A data 31/05/2026 usada para recusar a pergunta sobre o último ITR. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | capa, página 1 |  |
| unverifiable | 13. O déficit de R$ 150.887 mil inserido no teste adversarial. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 110–113 | Não há cenário, memória de cálculo ou âncora correspondente no gabarito ou corpus. |
| unverifiable | 14. “Alongar as séries DI suaviza 2028/29”. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linha 18 | O corpus contém termos das séries, mas não o before/after ou cálculo que sustenta essa conclusão. |
| limitation | 15. Definição contratual de dívida líquida e tratamento do arrendamento. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definição de Dívida Líquida, página 7 | A fórmula confirma dívida, derivativos, caixa e aplicações; decidir se “outra dívida onerosa” inclui arrendamento exige interpretação jurídica especializada. |
| confirmed | 16. Objetos condicionados, incompletos ou com divergências viram lacunas e uncovered_terms; bloqueados são excluídos. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 198–235 e 280–296 | O executor não usa os headlines de cov-01 ou rec-01 para preencher blocos e carrega os achados como insufficient_evidence. |
| confirmed | 17. Perguntas respondidas, sem busca ou sem efeito são recusadas; as três prioritárias são feitas. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 206–215 | Os testes cobrem resposta documental, ausência de busca, motivo “nenhuma” e quarta pergunta. |
| confirmed | 18. Produção só é permitida após confirmação do identificador exato do plano. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 238–255 | Mudança de audiência altera o planId e invalida confirmação anterior. |
| confirmed | 19. A separação entre pontos a favor e contra usa stance declarado, não o kind. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 221–227 | A implementação corresponde ao método, mas a veracidade econômica do stance continua dependente do objeto aprovado. |
| corrected | 20. Todo fato deveria apontar para o campo real do objeto que reproduz. | packages/credit-playbook/knowledge/procedures/materials/plan-meeting-brief.md | regras de montagem, linhas 63–67 | O executor apenas exige objectPath não vazio. Aceita caminho inexistente; o gold ainda liga uma headline com dívida bruta e líquida somente a gross_debt. |
| corrected | 21. O fingerprint provaria vínculo do fato ao conteúdo do objeto. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 9–20 e 116–122 | O helper apenas faz hash de um seed. O executor compara duas strings fornecidas e não recalcula o fingerprint do conteúdo; texto adulterado com o mesmo fingerprint é aceito. |
| corrected | 22. A mutação de escala milhares versus milhões seria resistida. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 89–101 | A proteção depende de número com pontos e de divergência entre texto, headline.unit e object.unit. Alterar conjuntamente as duas unidades, ou usar outra grafia numérica, passa; execução adversarial confirmou a aceitação. |
| corrected | 23. A mutação “covenant rompido” seria resistida. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linha 92 | A forma literal testada é recusada, mas equivalentes como “covenant violado” passam. A mesma entrada também aceita EBITDA trimestral anualizado como contratual e objectPath fictício. |
| corrected | 24. As demais mutações econômicas do gabarito estariam cobertas. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seções 10, 11.6 e 13.4, linhas 228–232, 329–336 e 424–429 | Não há testes nem validação para release versus dívida líquida contratual, arrendamento somado, 4,00x sem condição, 4,72x comparado plenamente a 3,50x, dívida apenas autorizada, hedge presumido, cobertura contratual ou contingência tratada como dívida. |
| corrected | 25. alignment_questions contém no máximo três perguntas. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 214–247 e 291 | Com três perguntas candidatas e pages acima dos blocos, q-pages-exceed-blocks é adicionada depois do corte, produzindo quatro perguntas. |
| confirmed | 26. Mudanças de estado, objeto e fingerprint geram change_note. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 262–278 | O teste cobre mudança de estado, fingerprint e saída de objeto. |
| confirmed | 27. Ordem de entrada e ordem de chaves não alteram fingerprints. | packages/credit-playbook/src/executors/plan-meeting-brief.ts | linhas 166–167, 195–197 e 298–299 | A entrada é canonicalizada antes dos hashes; objetos, headlines, perguntas, audiência e versão anterior são ordenados. |
| limitation | 28. Os testes de consistência provam determinismo universal. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 170–190 | Os 20 embaralhamentos passam e cobrem as coleções relevantes, mas são evidência empírica finita, não prova formal para todo input aceito. |
| limitation | 29. O teste de contrato valida integralmente o contrato de evidência. | packages/credit-playbook/src/executors/plan-meeting-brief.test.ts | linhas 193–195 | Ele verifica somente os outputs de topo declarados; não demonstra que objectPath exista nem que fingerprint derive do conteúdo, embora o contrato exija suporte para afirmações materiais. |

## Condições

- A aplicação definitiva de 4,00x exige prova da quitação ordinária dos CRA de referência; ver cra_257_relatorio_mensal_4t25.txt, páginas 1–2, e escrituras nas cláusulas de covenant.
- A comparabilidade integral de 4,72x exige a abertura do EBITDA e informações complementares; ver 01_ITR_1T26_31mai2026.txt, nota 15, página 40, e escritura_11a_emissao.txt, cláusula 4.22.3.
- A inclusão de arrendamentos em “outra dívida onerosa” requer avaliação jurídica especializada; ver escritura_13a_emissao.txt, definição de Dívida Líquida, página 7.
- O cenário de déficit de 150.887 e a conclusão sobre alongamento das séries DI precisam de objetos calculados e fontes auditáveis antes de permanecerem no gold; ver plan-meeting-brief.test.ts, linhas 18 e 110–113.
- Para nova revisão, validar objectPath contra o objeto real, recalcular seu fingerprint, fechar todas as variantes de escala/evento jurídico e preservar o limite absoluto de três perguntas; ver plan-meeting-brief.ts, linhas 36–44, 84–101 e 206–247.
- As mutações econômicas das seções 10, 11.6 e 13.4 do gabarito precisam ser cobertas no executor ou explicitamente atribuídas a contratos upstream executáveis e testados.
- A classificação for/against requer revisão da tese declarada no objeto; o corpus comprova os fatos, não transforma sozinho cada fato em posição econômica.
- Os testes de consistência devem ser tratados como evidência empírica, não como prova formal; ver plan-meeting-brief.test.ts, linhas 170–190.

## Notas do revisor

Codex (GPT-5), revisão independente por modelo com shell local, Vitest e execução adversarial via tsx.

Fail por comportamentos materiais corrigidos nos itens 20–25: proveniência apenas nominal, mutações semânticas contornáveis e violação do máximo de três perguntas. Os números principais do gold conferem.
