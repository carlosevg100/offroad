# Revisão independente por IA: método diagnose-maturity-wall v2026.09.05-v1

Registro `ai_independent_review`, nunca aprovação humana. Revisor: openai/gpt-5.6-sol (high) via codex-cli 0.153.4. Run gc01-method-diagnose-maturity-wall-2026-09-05-03-06-55, commit 8bf52d7. Fingerprint c92d4b1437b64c88d8ac985097eb62b471f7bb4143bafc4392e96198ca6e2411.

Resultado: **fail**. Evidências: 18 confirmed, 13 corrected, 1 limitation.

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
| confirmed | C01 — O corpus revisado corresponde ao manifesto. | docs/product/gold-cases/runs/gc01/ai-review-corpus/manifest.json | 43 entries | Os 43 tamanhos e hashes SHA-256 conferem; não há arquivo extra ou ausente. |
| confirmed | C02 — Dívida bruta de 5.670.186 em 31/05/2026 e 4.988.383 em 28/02/2026. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF pp.39–40, nota 15; linhas 2034–2065 e 2080–2094 |  |
| confirmed | C03 — 2026/27: 1.229.828 contra 1.074.636. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p.40, nota 15; linha 2102 |  |
| confirmed | C04 — 2027/28: 776.868 contra 712.945. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p.40, nota 15; linha 2103 |  |
| confirmed | C05 — 2028/29: 1.228.475 contra 886.187. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p.40, nota 15; linha 2104 |  |
| confirmed | C06 — 2029/30: 694.497 contra 586.660. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p.40, nota 15; linha 2105 |  |
| confirmed | C07 — 2030/31: 994.544 contra 989.147. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p.40, nota 15; linha 2106 |  |
| confirmed | C08 — Após junho de 2031: 809.198 contra 805.151. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p.40, nota 15; linha 2107 |  |
| confirmed | C09 — Caixa e equivalentes de 1.430.714, incluindo aplicações resgatáveis em até 90 dias. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p.20, nota 3; linhas 971–985 | A fonte não prova disponibilidade integral em D0. |
| corrected | C10 — Notas comerciais autorizadas por R$ 251.000 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ca_notas_comerciais_2026-05-27.txt | PDF p.2, itens 5(i)(c)–(g); linhas 45–70 | O valor confere, mas o teste aponta página 1; o valor e o prazo estão na página 2. |
| corrected | C11 — CPR autorizada por até R$ 535.000 mil. | docs/product/gold-cases/runs/gc01/ai-review-corpus/ca_operacao_estruturada_2026-05-27.txt | PDF p.2, item 5(i)(a); linhas 45–53 | O valor confere, mas o teste aponta página 1; os termos estão na página 2. |
| confirmed | C12 — Variações corrente menos fevereiro. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p.40, nota 15; linhas 2102–2107 | Recálculo: 155.192; 63.923; 342.288; 107.837; 5.397; 4.047. O destaque de 342.288 confere. |
| confirmed | C13 — Participações na dívida bruta e classificação das duas paredes. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 3, linhas 68–82 | Recálculo sobre 5.670.186: 0,21689377; 0,13700926; 0,21665515; 0,12248223; 0,17539883; 0,14271102. Com corte de 20%, somente 2026/27 e 2028/29 passam. |
| confirmed | C14 — Cobertura individual pelo caixa. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF pp.20 e 40, notas 3 e 15; linhas 971–985 e 2102–2107 | Recálculo: 1,16334479; 1,84164363; 1,16462606; 2,06007225; 1,43856280; 1,76806418. |
| confirmed | C15 — Reconciliação do cronograma com a dívida. | docs/product/gold-cases/runs/gc01/ai-review-corpus/01_ITR_1T26_31mai2026.txt | PDF p.40, nota 15; linhas 2102–2109 | 31/05: soma dos períodos 5.733.410 menos custo de debêntures 63.224 = 5.670.186. Fevereiro: 5.054.726 menos 66.343 = 4.988.383. |
| confirmed | C16 — As duas autorizações somam até R$ 786.000 mil, sem prova de desembolso ou alocação temporal. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 11.3, linhas 271–284 | 251.000 + 535.000 = 786.000; o executor corretamente não soma isso ao cronograma no caso gold. |
| confirmed | C17 — Os quatro testes fornecidos passam. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 27–52 | Vitest: 1 arquivo, 4 testes aprovados. |
| corrected | C18 — Parede exige ultrapassar a faixa versionada. | packages/credit-playbook/knowledge/procedures/refinance/diagnose-maturity-wall.md | linhas 53 e 62–63 | O executor usa >=, não >; exatamente 20% é classificado como parede. Além disso, 0,20 é default interno sem identificador da política versionada. |
| corrected | C19 — O método entrega quanto depende de rolagem ou nova dívida. | packages/credit-playbook/knowledge/procedures/refinance/diagnose-maturity-wall.md | linhas 31–38 e 52–60 | O executor retorna apenas razões independentes, reutilizando o mesmo caixa em todos os períodos; não retorna déficit, excedente, cobertura acumulada ou dependência de rolagem. |
| corrected | C20 — Cada afirmação numérica conserva sua âncora. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 36–51 e 90–100 | scheduleAnchor e as âncoras de caixa/geração são descartadas da saída; só claimedSources preserva âncora. |
| corrected | C21 — Base insuficiente produz uncoveredTerms, insufficient_evidence e bloqueio estruturado. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 15–33 e 36–51 | Não existem state, blockReasons, uncoveredTerms ou estados insufficient_evidence. Cronograma vazio gera exceção Zod; geração ausente gera resultado cash-only sem registrar a lacuna; não há prova de conciliação do ledger. |
| corrected | C22 — Aprovação em ata nunca vira fonte provada sem contrato e desembolso. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 29–30 e 97–98 | O executor confia em um booleano proven fornecido pelo chamador. A mutação proven=true com a mesma ata promove a autorização a provenSources; o teste só exercita proven=false. |
| corrected | C23 — A mutação de escala ou da definição de caixa é rejeitada. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 12–32 e 58–89 | unit é texto livre; valores não são reconciliados com a âncora. Escalar valores ou rotular a mesma evidência como day_zero_available é aceito sem bloqueio. |
| confirmed | C24 — Dívida líquida contratual, EBITDA implícito e headroom do gold. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 111–142 | Recálculo: 5.670.186 + 14.335 - 235 - 1.430.714 - 25.095 = 4.228.477; EBITDA implícito = 4.228.477 / 4,72 = 895.863,77; headroom contra 4,00x = 4,00 - 4,72 = -0,72x, condicionado. |
| corrected | C25 — O executor codifica dívida líquida, EBITDA, degraus, comparabilidade e headroom. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 15–51 | Nenhum desses campos ou cálculos existe. O executor tampouco recebe ou produz cronograma de vencimento antecipado separado do contratual. |
| confirmed | C26 — As escrituras têm uma definição-base, dois degraus e comparabilidade condicionada. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | definições, PDF pp.7–8, linhas 324–357; cláusula 7.24.3, PDF pp.54–55, linhas 2650–2683 | Dívida líquida inclui dívida onerosa e derivativos líquidos de caixa/aplicações; EBITDA é LTM; degraus são 3,50x e 4,00x conforme quitação dos CRA. |
| corrected | C27 — Quebra de covenant torna automaticamente toda a dívida à vista. | docs/product/gold-cases/runs/gc01/ai-review-corpus/escritura_13a_emissao.txt | cláusulas 7.24.4–7.24.5; linhas 2685–2704 | A não manutenção do índice é evento não automático; há assembleia e possibilidade de não declarar vencimento antecipado. O método simplifica indevidamente essa contingência. |
| corrected | C28 — Geração operacional é LTM ou projeção explicitamente declarada. | packages/credit-playbook/knowledge/procedures/refinance/diagnose-maturity-wall.md | linhas 47–55 | O executor aceita qualquer valor e qualquer basis não vazio, inclusive trimestral ou de período incompatível, e o adiciona integralmente ao caixa de cada período. |
| corrected | C29 — A ordem de entrada não altera a saída nem os fingerprints. | packages/credit-playbook/src/executors/diagnose-maturity-wall.ts | linhas 56 e 62–100 | Arrays são preservados e JSON.stringify é sensível à ordem; inverter periods ou claimedSources altera a saída e ambos os fingerprints. |
| corrected | C30 — O teste de consistência prova invariância a permutações. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 49–52 | Ele repete vinte vezes a mesma entrada e prova apenas repetibilidade. Não permuta períodos, fontes ou chaves. |
| confirmed | C31 — Repetição idêntica do caso gold é determinística. | packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts | linhas 49–52 | As vinte execuções mantêm o mesmo outputFingerprint. |
| limitation | C32 — Inclusão de arrendamento em qualquer outra dívida onerosa. | docs/product/gold-cases/gc01-gabarito-rascunho.md | seção 5, linhas 135–142; condições, linhas 448–452 | O corpus não resolve a interpretação jurídica; requer especialista. |

## Condições

- A aplicação do degrau de 4,00x permanece condicionada à prova da quitação ordinária dos CRA de referência.
- A comparabilidade integral do pro forma de 4,72x com cada escritura depende da abertura do EBITDA e das informações complementares da companhia.
- A inclusão do arrendamento em qualquer outra dívida onerosa exige revisão jurídica especializada.

## Notas do revisor

Codex (GPT-5), com leitura local, SHA-256, aritmética Decimal, execução Node e Vitest.

Falha material: embora a aritmética gold reproduza as fontes e os quatro testes passem, o executor não implementa estados de insuficiência/bloqueio, cenário de covenant, rastreabilidade das paredes, política versionada nem invariância de ordem; os dois documentos de conselho também estão ancorados na página errada.
