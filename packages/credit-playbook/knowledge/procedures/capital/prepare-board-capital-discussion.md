---
id: prepare-board-capital-discussion
version: 2026.10.27-v1
maturity: implemented
title_pt: Preparar a discussão de estrutura de capital no conselho
title_en: Prepare the Board Discussion of Capital Structure
role: credit_structuring
blueprint_stage: 6
owner_role: Autoria profissional da Offroad
effective_date: 2026-10-27
authorities: [CASA, DEF]
implementation_module: @offroad/financial-model
implementation_export: prepareBoardCapitalDiscussionPacket
result_contract: board-capital-discussion-packet.v1
connected_states: [framed, partial, prepared_for_human_review]
persistence_mode: derived_on_demand
persistence_target: board-capital-discussion-packet.v1
unit_test_files: [packages/financial-model/src/board-capital-discussion.test.ts, packages/financial-model/src/board-capital-discussion-properties.test.ts, packages/financial-model/src/board-capital-discussion-packet.test.ts, packages/financial-model/src/board-capital-discussion-premises.test.ts, packages/financial-model/src/board-capital-discussion-runs.test.ts]
gold_case_ids: [outline-before-material-when-there-is-time, outline-asks-only-what-changes-the-material, four-deliberations-in-urgency-order, outline-in-the-same-urgency-order, deliberations-with-authority-and-the-supposed-authority-declared, titles-pages-1-to-4-conclusion-and-number, titles-pages-5-to-8-conclusion-and-number, titles-pages-9-to-12-conclusion-and-number, every-page-carries-a-number, numbers-checked-against-the-analyses-debt-covenant-and-cash, numbers-checked-against-the-analyses-line-crop-projection-and-cost, each-number-pinned-to-method-version-and-packet, financing-plan-read-from-its-reviewed-result, turn-2-pending-only-the-credit-line-terms, staged-option-pending-never-invented, summary-for-prior-reading-names-every-decision-and-date, appendix-cites-the-reviewed-results, likely-questions-with-answer-and-number, pending-items-declared, line-before-the-recommendation-when-the-board-has-not-seen-it, line-the-board-has-seen-goes-to-the-appendix, thirteen-pages-fit-forty-five-minutes, pages-beyond-the-agenda-are-a-gap, turn-3-recommendation-withdrawn-and-facts-kept, turn-3-options-with-criteria-and-numbers, turn-3-deliberation-becomes-the-choice-and-the-notice-stays, turn-3-prior-version-kept, refuses-to-omit-the-return-on-request, refuses-to-drop-the-line-page, refuses-to-drop-the-leverage-risk, refuses-to-drop-the-notice-deadline, a-request-for-the-deck-does-not-skip-the-outline, no-time-before-the-meeting-produces-the-material-with-the-outline, ficha-divergences-follow-the-published-methods, paths-page-compares-each-path, paths-page-has-seven-paths-with-every-measure, every-material-fact-shown-in-the-current-version, refuses-removing-a-date-that-shares-a-line-with-material-facts, refuses-removing-a-date-that-carries-a-leverage-reading, refuses-withdrawing-a-recommendation-that-alone-carries-material-facts, creditor-name-outside-the-dictionary-1-shows-generic-words-and-a-gap, creditor-name-outside-the-dictionary-2-shows-generic-words-and-a-gap, creditor-name-outside-the-dictionary-3-shows-generic-words-and-a-gap, creditor-name-outside-the-dictionary-4-shows-generic-words-and-a-gap, creditor-name-outside-the-dictionary-5-shows-generic-words-and-a-gap, creditor-name-outside-the-dictionary-6-shows-generic-words-and-a-gap, creditor-registered-as-another-bank-is-named-by-its-field, program-sublimit-below-exposure-keeps-exposure-and-capacity-apart, strategic-reason-shown-as-the-chair-s-informed-fact, line-kept-with-receipts-missing-never-says-without-the-line, working-capital-of-another-year-is-shown-as-a-variation, omission-of-pages-is-refused-and-no-fact-sentence-leaves, informed-reason-outside-the-dictionary-shows-generic-words-and-a-gap, peer-cost-keeps-the-unexplained-remainder, credit-line-restricted-to-machinery-is-never-a-working-capital-line, debtor-rede-z-behind-the-old-identifiers-is-never-called-rede-a, sugar-scenario-is-never-called-wheat, boiler-investment-with-a-boiler-plan-is-named-as-the-boiler, input-label-corn-up-wheat-unchanged-never-names-an-input, input-label-corn-not-wheat-never-names-an-input, input-label-oil-up-wheat-unchanged-never-names-an-input, joint-program-shows-the-client-s-volume-without-an-owner, every-number-of-the-final-text-verified, never-presents-or-sends]
adversarial_case_ids: [material-without-decisions, material-with-no-deliberation, divergent-number, concatenated-digits-in-an-answer, sign-written-before-a-reading-in-the-summary, year-reading-used-as-money, literal-year-written-by-hand, currency-written-before-a-reading, money-in-billions-instead-of-millions, years-shown-as-months, annual-rate-shown-as-monthly, calendar-reading-used-as-reais, calendar-reading-with-an-iso-currency, calendar-reading-as-a-percent-in-words, calendar-reading-as-a-value, capitalized-scale-without-a-marker, financial-field-read-as-a-label-principal-as-label, financial-field-read-as-a-label-spread-as-label, financial-field-read-as-a-label-npv-as-label, field-outside-the-registry, date-format-on-a-number, scale-chosen-by-the-contribution, fullwidth-digits-in-a-line, arabic-indic-digits-in-an-answer, calendar-reading-as-an-amount-in-yen, calendar-reading-after-a-preposition, cents-in-free-text, thousands-in-free-text, per-week-in-free-text, per-semester-in-free-text, duration-in-parentheses, value-after-a-date-preposition, discussion-in-another-currency, unknown-template-id, slot-left-unbound, slot-the-template-does-not-have, years-bound-to-a-months-slot, value-bound-to-a-date-slot, prose-in-a-binding, literal-number-in-a-title, literal-deadline-in-a-line, reading-that-does-not-resolve, reading-of-an-unnamed-result, tampered-reviewed-result, reviewed-result-of-another-version, reviewed-result-the-basis-does-not-name, reviewed-result-of-another-company, result-of-an-unreleased-method, extra-result-beside-the-named-ones, title-without-an-economic-number, next-steps-without-a-deadline, false-number-in-a-deliberation-title, false-number-in-an-appendix-label, false-number-in-an-option-not-yet-shown, paraphrase-that-drops-a-material-fact, percent-sign-written-after-a-rate, question-text-used-as-an-answer, return-and-cost-of-capital-swapped, debt-total-bound-to-the-free-basket, program-cost-bound-to-debt-shares, positive-npv-under-a-negative-claim, path-row-reading-another-path, ebitda-of-another-year, concentration-year-that-is-not-the-largest, adverse-leverage-dated-in-another-year, notice-dated-with-the-route-deadline, fallback-dated-with-the-sounding-deadline, action-of-another-deliberation, subject-of-another-deliberation, page-line-used-as-a-deliberation-subject, answer-to-another-question, second-package-of-the-same-method, basket-occupied-by-the-creditor-of-another-row, largest-creditor-in-a-row-creditor-slot, prepaid-creditor-the-plan-does-not-prepay, amended-creditor-the-plan-does-not-amend, question-and-answer-name-different-creditors, exposure-read-from-the-program-volume, exposure-read-from-the-eligible-capacity, program-volume-under-a-sublimit-shown-as-exposure, assignment-ban-asserted-on-an-assignable-contract, policy-already-defined, sensitivity-called-smaller-economy-with-unchanged-economy, later-receivables-claimed-on-longer-inventory, larger-capex-claimed-on-front-loaded-capex-with-smaller-total, receivables-shorter-than-the-parent-with-longer-inventory, wheat-scenario-whose-shock-starts-after-the-year-shown, receivables-longer-only-in-another-year, boiler-investment-against-the-packaging-plan, packaging-line-sul-against-a-norte-plan, joint-program-called-the-client-s-own, deferral-without-a-deferred-schedule, kept-debt-with-a-new-working-capital-loan, deferral-with-operation-on-the-original-schedule, extension-path-with-an-undeclared-prepayment, extension-whose-amendment-does-not-extend, development-bank-description-on-a-bank-loan, deferral-proven-only-by-capex-and-ebitda, informed-fact-attributed-to-another-person, informed-fact-as-prose-1, informed-fact-as-prose-2, informed-fact-as-prose-3, informed-fact-as-prose-4, reading-in-an-informed-fact-slot, creditor-and-maturity-of-different-rows, tampered-envelope, free-material-in-request, fabricated-grant-in-result, fabricated-presentation-in-result, fabricated-sending-in-result]
e2e_scenario_ids: [domain:outline-before-material-when-there-is-time]
cost_eval_ids: [deterministic:no-model-calls]
task_specs: []
dependencies: [build-company-debt-table, measure-covenant-headroom, project-weekly-cash, analyze-investment-project, build-operating-projection, challenge-financial-projection, monetize-receivables-for-working-capital, analyze-relative-debt-cost, evaluate-financing-paths]
reference_data_keys: []
calculation_ids: [financial.board_capital_discussion]
templates: []
max_model_calls: 0
model_purpose: []
allowed_tools: []
consistency_run_ids: [prepare-board-capital-discussion-2026-10-27-v1-consistency]
adversarial_run_ids: [prepare-board-capital-discussion-2026-10-27-v1-adversarial]
review_ids: []
gold_run_ids: [prepare-board-capital-discussion-2026-10-27-v1-gold]
---

# Objetivo
Levar ao conselho uma decisão de capital como deliberações claras, com prazo e alçada, na ordem da urgência, sustentadas por números que resistem às perguntas: cada número lido de um resultado já revisado, pelo método, pela versão e pela impressão do pacote, sem recalcular nada.

# Produto
Pacote da discussão no conselho: antes do material, o roteiro com as deliberações em ordem de prazo e só as perguntas que mudam o material (template, tempo de pauta, o que o conselho já viu); depois, o plano de páginas com título que diz a conclusão e o número que a sustenta, a conferência de identidade econômica de cada número contra a leitura de origem, a página de síntese para envio prévio, o apêndice com as fontes, as perguntas prováveis com resposta e número, as pendências declaradas, a ordem condicionada ao que o conselho já viu e, quando alguém pede para retirar algo, a regra de omissão material com cada versão preservada.

# Quando ativar
- Há reunião de conselho com data e uma decisão de capital na pauta: "conselho na quarta, prepara a discussão de estrutura de capital".
- Pedem uma página ou um deck para o conselho com o plano de financiamento, a partir das análises já feitas.
- Pedem para ajustar o material do conselho já preparado, inclusive retirar uma recomendação.

# Quando não ativar
- Ainda não há análise revisada do assunto: primeiro a demanda da análise (tabela de dívida, covenant, caixa, projeção, projeto, recebíveis, caminhos de financiamento).
- Apresentar na reunião ou enviar o material a terceiros: fora da tarefa.
- Montar um template visual novo ou importar um arquivo de apresentação: outra demanda.

# Inputs mínimos e substitutos
- Os resultados revisados da companhia na versão vigente, cada um de um método liberado, identificados pelo método e pela impressão do pacote.
- A data da reunião e a data do pedido; o prazo e a alçada de cada decisão que precisa sair da reunião.
- O plano de páginas, o texto da página de síntese, o apêndice e as perguntas prováveis, com cada número escrito como leitura de um resultado revisado e o valor que a página mostra.
- O tempo de pauta, o template e o que o conselho já viu; sem eles, o roteiro pergunta antes de produzir.
- Quais números são fatos materiais para a decisão e quais condições são indicativas.

# Sequência operacional
1. [human_judgment] Entender :: Aprovar, informar ou responder; tempo de pauta; prazos anteriores à próxima reunião | evidence: conversa e atas
2. [deterministic] Base :: Cada resultado revisado conferido pelo método liberado, pela versão e pela impressão do pacote; mesma companhia | evidence: resultados revisados no cofre
3. [deterministic] Decisões :: Deliberações com prazo e alçada, em ordem de urgência | evidence: análises revisadas e atas
4. [human_judgment] Conversar :: Roteiro proposto antes do material quando há tempo; pergunta só o que muda o material | evidence: conversa
5. [deterministic] Produzir :: Páginas na ordem da narrativa, com o tema que o conselho não viu antes da recomendação; conferência de identidade de cada número; síntese, apêndice e orçamento de páginas | evidence: resultados revisados
6. [deterministic] Preparar :: Perguntas prováveis com resposta e número; pendências declaradas | evidence: resultados revisados
7. [deterministic] Ajustar :: Regra de omissão material; nova versão preservando a anterior | evidence: pedido na conversa

# Cálculos determinísticos
- O método não recalcula nenhuma análise. Cada número é uma leitura de um resultado revisado: o caminho no pacote, as casas decimais (0 a 2) ou o formato de data, e o valor escrito. O que o campo é sai só do registro de campos do método de origem: tipo (dinheiro, taxa, múltiplo, prazo em anos ou meses, pontos, contagem, ano, data, rótulo, sim e não), escala de origem (reais, milhões, razão) e periodicidade (anual ou nenhuma). Campo fora do registro não é lido.
- Biblioteca fechada de modelos: a contribuição adotada não escreve texto. Todo texto exibido (assuntos, títulos, linhas, respostas, pendências, motivos, quem pediu, base de autoridade) é uma referência a um modelo do método, no código, com id, posições tipadas e texto fixo revisado: id do modelo seguido de posição=leitura (ou posição=deadline:deliberação). Tipos de posição: dinheiro, taxa, múltiplo, anos, meses, pontos, contagem, data, rótulo, sim e não, prazo de deliberação. Id de modelo desconhecido, posição que o modelo não tem, posição sem ligação ou leitura de tipo diferente do da posição é recusado antes de renderizar. Referência fora do formato (qualquer prosa) é recusada pelo próprio esquema.
- Posição é conceito, não dimensão: cada posição de cada modelo declara a origem admissível exata (método, caminho registrado e, quando há, o caso, o cenário, a linha ou o período, escritos no modelo ou como variável compartilhada entre posições, por exemplo o mesmo ano no principal e no ano exibido). A leitura ligada precisa vir dessa origem; trocar dívida por cesta, TIR por custo de capital, custo por participação ou o caminho de uma linha por outro é recusado (board_capital_slot_concept_mismatch). Posição de ano admite só leitura de ano, com o valor que o modelo pede; leitura pendente só entra em posição do método que ela aguarda.
- Prazo é da ação que o modelo anuncia: o aviso ao fornecedor só com o prazo do aviso, a decisão da rota só com o prazo da rota (board_capital_deadline_action_mismatch). Os textos de uma deliberação (assunto, recomendação e ações) pertencem a ela, cada modelo só entra no campo para o qual foi escrito e cada resposta responde à sua pergunta; o resto é recusado (board_capital_deliberation_text_mismatch, board_capital_template_use_invalid, board_capital_answer_mismatch).
- Uma fonte por método no material: cada método liberado entra no máximo uma vez (um pacote, uma impressão) por material; segundo pacote do mesmo método é recusado (board_capital_source_method_repeated). Toda leitura e toda condição daquele método se referem a esse pacote; condição sobre fonte confere exatamente a origem ligada às posições, e leituras de pacotes diferentes do mesmo método num texto são recusadas (board_capital_source_mixed).
- Identidade de credor: nenhum modelo nomeia credor ou banco no texto fixo (a biblioteca se confere). O nome vem de uma posição de rótulo ligada ao campo de credor registrado da linha da tabela de dívida (rows[id].creditor); o id da linha não autoriza nome. A mesma linha liga o nome e as demais leituras daquela obrigação (vencimento), e as condições conferem que a linha é a que o texto afirma: a única que ocupa a exceção para garantias, a pré-paga pelo caminho recomendado, a substituída pela versão aditada no alongamento. Pergunta e resposta que nomeiam o credor ligam a mesma leitura.
- Afirmações do texto fixo conferidas contra as leituras: cada modelo declara as condições que afirma (sinal, comparação entre posições, comparação com o resultado de origem, o único caminho dentro de todos os critérios igual ao recomendado, o ano de maior vencimento, o ano do cenário adverso, todas as medições abaixo da política). Condição falsa é recusa (board_capital_template_condition_failed); condição que não se pode conferir também (board_capital_template_condition_unverified). Textos sem como conferir saíram da biblioteca ("curta", "disputa o caixa mais apertado", "perto do custo de capital").
- Toda afirmação fixa material (contratual ou econômica) de cada modelo declara o campo verificável que a sustenta e a condição, conferidos no pacote ligado; sem campo verificável, a afirmação sai do modelo. A vedação de cessão só aparece se o contrato registrado da rede diz cessão vedada sem consentimento (termo adotado entre as contribuições do resultado de recebíveis); contrato cedível é recusa. A lista completa, modelo a modelo, está na ficha de implementação.
- Recebíveis por conceito: o registro de campos declara o conceito de cada campo de monetize-receivables-for-working-capital (saldo da carteira por devedor, capacidade elegível, volume antecipável do programa, volume do programa por devedor, excesso sobre sublimite, volume acumulado no plano, pico da necessidade, carteira bruta, spread). A exposição ao cliente lê o saldo da rede na carteira; capacidade, sublimite ou volume do programa só aparecem com esse nome.
- Política sem definição: o texto que diz que a política precisa de uma definição de EBITDA só é usado se o resultado do covenant registra a política sem definição (questão aberta ebitda_definition_not_written); política já definida é recusa.
- Cenários descritos, sem causa: nenhum modelo afirma causa; as frases descrevem o cenário pelo que ele é na fonte. Um cenário só é nomeado se difere da sua referência (o cenário de que deriva, o caso de que herda ou o caso base) exatamente nos drivers que a frase nomeia, ativos no período mostrado; se muda mais coisas, só o rótulo genérico do caso. A tabela de definição de cenários (drivers, referência e vigência) está no código e na ficha de implementação.
- Adiamento: no plano, todos os componentes registrados da variante (capex, EBITDA, depreciação, manutenção e giro de partida) começam estritamente depois da referência; no caso do projeto, onde depreciação e manutenção começam junto com a base, a frase diz só o que comprova (capex e início de operação adiados). Quando o resultado publicado não guarda a definição (fluxos de cada caso do caixa de curto prazo), o cenário não é nomeado.
- Saldo, fluxo e valor: o registro de campos marca cada dinheiro pela natureza, e cada posição declara a leitura que a frase faz; variação anual só com frase de variação.
- Caminhos com definição exata, pelos termos do pacote e nunca por identificador: cada instrumento novo é descrito pela sua natureza registrada (debênture pelo mercado de capitais, financiamento de banco de fomento pelo credor de fomento, crédito bancário de curto prazo ou financiamento bancário com amortização programada pelo cronograma após o horizonte, aditamento pelo papel), e o conjunto completo de movimentos (novos, retirados, pré-pagamentos, encargos e variante) precisa ser igual ao declarado. Alongada exige vencimento final posterior ao da obrigação original e menos principal pago em cada período. Os caminhos aparecem com rótulo genérico e números, e os movimentos completos ficam numa página própria.
- Fato informado sem texto livre: o que alguém informou entra como código de um dicionário fechado de motivos do método (por exemplo reduzir a dependência de um único fornecedor, diversificar fornecedores, ganhar capacidade própria, reduzir risco operacional, atender contrato de cliente), com origem informada e autor; o material mostra a frase revisada do código, atribuída ao autor. Código fora do dicionário mostra "a confirmar" e uma lacuna; nenhum texto do fato chega ao material.
- Decomposição sem atribuição causal: quando a ponte não atribui causa, a resposta diz quanto vem de cada ajuste conhecido e quanto fica sem explicação, sem transformar o restante em explicação.
- Significado pela identidade registrada, nunca por identificador: nome exibido, modalidade, finalidade, papel, devedor e programa vêm do que a fonte registra (credor, debtorKey casado com o dicionário de devedores, tipo e status do limite, cenário da medição, papel e cenário da alavanca, drivers da premissa, termos do instrumento, vínculo do programa ao item); o identificador só liga leituras da mesma linha. Linha de crédito sem modalidade e finalidade registradas aparece como "linha de crédito registrada", com os termos pendentes; devedor cuja chave não está no dicionário aparece com palavras genéricas e lacuna.
- Objetos nomeados só por igualdade do campo inteiro: insumo e projeto aparecem no texto apenas quando o campo registrado na fonte (rótulo do cenário de choque, rótulo do caso base da análise de investimento), normalizado só por caixa, espaços e acentos, é igual ao termo do vocabulário fechado do método (insumos: trigo, açúcar, farinha, embalagem; projetos: linha de embalagem, caldeira) ou a um rótulo declarado dele; termo dentro de texto maior (menção, comparação, negação, qualificador) não casa. O cenário de choque também precisa diferir da referência só pelo choque de custo. Sem casamento, o texto usa a descrição genérica (o insumo, o projeto analisado) e registra a lacuna object_not_in_vocabulary. Frase que liga o plano de capital à análise de investimento exige o mesmo termo, por igualdade do rótulo inteiro, no caso base e em cada variante com projeto do plano; mesma categoria com qualificadores diferentes (unidade Sul e unidade Norte) são projetos diferentes e a frase é recusada. O ciclo sazonal não é nomeado: as frases dizem capital de giro sazonal.
- Programa e devedor: o volume antecipável de um cliente é o valor do programa para aquele devedor (byItem), nunca o volume total do programa; o programa só é chamado de próprio dele quando a fonte o liga apenas àquele devedor; ligado a mais de um, a frase diz programa de antecipação, sem dono.
- Formatador do método: conversões só as declaradas (reais para milhões dividindo por 10^6; razão para percentual multiplicando por 100), arredondamento para cima a partir da metade, e o texto inteiro do número com a unidade: "R$ 130 milhões", "R$ 0,7 milhão", "16% ao ano", "28%", "2,2x", "1,5 anos", "4 meses", "125 pontos". Dinheiro só em reais: resultado em outra moeda é recusado (board_capital_currency_not_supported), nunca mostrado como R$. Datas e anos saem com a preposição escrita pelo método: {em:id} "em 2027", {ate:id} "até jun/27", {desde:id}, {para:id}, {fim:id} "no fim de 2027", {de:id} "de 2027", {a:id}; só posições do tipo data. Formatos de data: dia e mês, dia por extenso ("21 de dezembro"), mês e ano, mês por extenso ("dezembro de 2026") e ano.
- Conferência de identidade: o valor formatado igual ao valor escrito; diferente é recusado pelo nome do número; caminho que não resolve, formato que o campo não admite, número lido como rótulo ou leitura de resultado não nomeado é número sem origem e é recusado.
- Texto livre (tudo fora dos marcadores): depois de normalização NFKC, só letras do português, espaço, hífen entre letras e a pontuação , . ; : ? ! ( ) e aspas. Qualquer dígito de qualquer escrita, símbolo de moeda, percentual ou outro símbolo é recusado. Léxico fechado proibido no texto livre: números por extenso (os artigos um e uma exceto), escalas (milhares, milhões, bilhões, centavos), moedas e códigos ISO, meses, periodicidade e prazo (ano, mês, dia, semana, semestre, trimestre, anual, mensal e afins), percentuais e pontos. Esses conceitos só existem dentro dos marcadores do formatador. O texto livre não termina em preposição antes de um marcador de data. Lista branca e léxico ficam como defesa sobre o texto final renderizado dos modelos e dos rótulos da fonte.
- Renderizar e depois verificar: cada campo exibido é lido pelo tokenizador único do material (dígitos de qualquer escrita). Cada número fica dentro de um único marcador cujo texto é o do formatador para aquela leitura; o texto livre entre marcadores passa de novo pela lista branca e pelo léxico; nenhuma letra ou dígito cola em marcador. Rótulo da fonte nunca é exibido como texto da fonte: só se casar exatamente com uma entrada do dicionário fechado de nomes do método (instituições financeiras e contrapartes nomeadas, com grafia canônica: Itaú, Bradesco, Santander, Banco do Brasil, Caixa, BTG Pactual, Banco Safra, BNDES, XP, Sicredi, Sicoob, Banrisul, Citi, JPMorgan, Debenturistas, rede A, rede B). Fora do dicionário, mesmo produzido pelo próprio método de origem, a posição mostra as palavras genéricas do modelo ("sem nome confirmado", "credor sem nome confirmado") e o material registra uma lacuna de nome (label_not_in_dictionary); no texto final, marcador de rótulo fora do dicionário é recusado. Não há ainda cadastro de entidades da companhia adotado; um nome fora do dicionário fica como lacuna. allFiguresMatch vale só depois dessa verificação.
- Suporte numérico: o título de cada página (fora decisões e próximos passos) e cada resposta carregam uma leitura econômica (dinheiro, taxa, múltiplo, prazo, pontos ou contagem); data, rótulo ou sim e não não bastam. Próximos passos carregam um prazo de deliberação.
- Fatos materiais por regra: toda leitura econômica adotada, todo número que a base marca como material e todo prazo de deliberação. Um fato conta como mostrado só se o seu marcador está no texto final de um campo exibido; assunto de deliberação substituído pela recomendação não conta. A versão composta mostra todos, ou é recusada; cada pedido de omissão é aplicado só se a versão renderizada que ele produz ainda mostra todos, senão é recusado com a frase e os fatos que sairiam.
- Resultado revisado: só de método liberado, na versão liberada, analisado pelo esquema do pacote liberado e com a impressão recalculada igual à nomeada na base; outra companhia ou moeda é recusada.
- Ordem das deliberações: o prazo mais próximo primeiro; sem prazo por último; empate na ordem adotada.
- Ordem das páginas: decisões, situação, restrição, temas que o conselho não viu (ou que não se sabe se viu), alternativas, recomendação, riscos, o que mudaria a recomendação, próximos passos. Tema já visto vai ao apêndice.
- Orçamento: páginas principais até o tempo de pauta dividido pelos minutos por página; acima disso, lacuna.
- Roteiro antes do material quando a reunião está a pelo menos o número adotado de dias do pedido e o roteiro não foi confirmado. Sem tempo, o material sai junto com o roteiro.
- Número sem resultado revisado aparece como pendente e vira lacuna nomeada onde for usado; o pacote fica parcial.

# Julgamentos permitidos
- Formular as decisões e o texto das páginas, das perguntas e da síntese.
- Dizer quais números são fatos materiais e quais condições são indicativas.
- Retirar a recomendação de uma página a pedido, mostrando as opções com critérios e números.

# Perguntas que mudam o trabalho
- Qual é o template e o padrão da última apresentação ao conselho?
- Quanto tempo há na pauta?
- O conselho já viu a análise deste tema? Quem vai apresentar cada parte?

# Red flags
- Material sem as decisões pedidas, ou com as decisões na última página.
- Número diferente da análise revisada, ou arredondado de formas diferentes em páginas diferentes.
- Omitir risco ou fato material a pedido.
- Produzir o material antes de alinhar o roteiro quando há tempo.
- Quarenta páginas para quarenta minutos.

# Stop conditions
- Material sem página de decisões ou sem deliberação é recusado.
- Número divergente, número sem origem, resultado adulterado, de outra versão, de outra companhia ou não nomeado pela base é recusado pelo nome.
- Página sem número e resposta sem número são recusadas.
- Omissão estreita por construção: um pedido de omissão só retira frases do tipo recomendação (marcadas assim no modelo); páginas, linhas, fatos e prazos nunca saem, e o pedido é recusado com a frase de motivo. Não há julgamento de materialidade por presença de números. A retirada da recomendação ainda é recusada se ela for o único lugar de um fato da regra.
- O pacote não recalcula análises, não apresenta, não importa template, não envia material a terceiros, não aprova crédito e não publica nem altera a base.

# Outputs
- schemaVersion (string, required): Versão do pacote | values: board-capital-discussion-packet.v1
- status (enum, required): Suficiência do pacote | values: framed, partial, prepared_for_human_review
- result (object, required): Resultados lidos, roteiro, conferência de identidade, versões do material, pedidos de omissão, lacunas e pendências
- readings (object, required): Etapa, deliberações, perguntas antes do material, resumo do material, pendências e decisões sobre omissão
- exclusions (array, required): Recálculo, apresentação, importação de template, distribuição a terceiros, aprovação de crédito
- grantsExecution (boolean, required): Sempre falso
- grantsPublication (boolean, required): Sempre falso
- fingerprint (string, required): Hash do pacote

# Exemplos
## Bom
- Antes de montar, a proposta de roteiro em quatro deliberações, nesta ordem, porque três têm prazo: linha de embalagem, com o aviso ao fornecedor até 2/out; capital de giro sazonal de 2026, com a adesão aos programas até 16/out; vencimentos de 2027, com a sondagem até 31/out e a decisão da rota até 15/nov; política de endividamento, definir qual EBITDA mede o limite de 2,5x. Para acertar o material: a última apresentação ao conselho, o tempo de pauta e se o conselho já viu a revisão da linha.
## Ruim
- "Segue o deck de 25 páginas com contexto macroeconômico e próximos passos no fim." (não diz o que o conselho decide nem quando)
- "Tirei a página da linha, como o presidente pediu." (sem o retorno e a sensibilidade, a decisão fica sem base)

# Testes
## Unit
- packages/financial-model/src/board-capital-discussion.test.ts: leitura por caminho, arredondamento e conferência, números literais, ordem das deliberações e das páginas, regra de omissão.
- packages/financial-model/src/board-capital-discussion-packet.test.ts e packages/financial-model/src/board-capital-discussion-premises.test.ts: os três turnos, ida e volta das premissas e composição a partir dos resultados guardados.
## Gold
- outline-before-material-when-there-is-time, outline-asks-only-what-changes-the-material, four-deliberations-in-urgency-order, outline-in-the-same-urgency-order, deliberations-with-authority-and-the-supposed-authority-declared, titles-pages-1-to-4-conclusion-and-number, titles-pages-5-to-8-conclusion-and-number, titles-pages-9-to-12-conclusion-and-number, every-page-carries-a-number, numbers-checked-against-the-analyses-debt-covenant-and-cash, numbers-checked-against-the-analyses-line-crop-projection-and-cost, each-number-pinned-to-method-version-and-packet, financing-plan-read-from-its-reviewed-result, turn-2-pending-only-the-credit-line-terms, staged-option-pending-never-invented, summary-for-prior-reading-names-every-decision-and-date, appendix-cites-the-reviewed-results, likely-questions-with-answer-and-number, pending-items-declared, line-before-the-recommendation-when-the-board-has-not-seen-it, line-the-board-has-seen-goes-to-the-appendix, thirteen-pages-fit-forty-five-minutes, pages-beyond-the-agenda-are-a-gap, turn-3-recommendation-withdrawn-and-facts-kept, turn-3-options-with-criteria-and-numbers, turn-3-deliberation-becomes-the-choice-and-the-notice-stays, turn-3-prior-version-kept, refuses-to-omit-the-return-on-request, refuses-to-drop-the-line-page, refuses-to-drop-the-leverage-risk, refuses-to-drop-the-notice-deadline, a-request-for-the-deck-does-not-skip-the-outline, no-time-before-the-meeting-produces-the-material-with-the-outline, ficha-divergences-follow-the-published-methods, paths-page-compares-each-path, paths-page-has-seven-paths-with-every-measure, every-material-fact-shown-in-the-current-version, refuses-removing-a-date-that-shares-a-line-with-material-facts, refuses-removing-a-date-that-carries-a-leverage-reading, refuses-withdrawing-a-recommendation-that-alone-carries-material-facts, creditor-name-outside-the-dictionary-1-shows-generic-words-and-a-gap, creditor-name-outside-the-dictionary-2-shows-generic-words-and-a-gap, creditor-name-outside-the-dictionary-3-shows-generic-words-and-a-gap, creditor-name-outside-the-dictionary-4-shows-generic-words-and-a-gap, creditor-name-outside-the-dictionary-5-shows-generic-words-and-a-gap, creditor-name-outside-the-dictionary-6-shows-generic-words-and-a-gap, creditor-registered-as-another-bank-is-named-by-its-field, program-sublimit-below-exposure-keeps-exposure-and-capacity-apart, strategic-reason-shown-as-the-chair-s-informed-fact, line-kept-with-receipts-missing-never-says-without-the-line, working-capital-of-another-year-is-shown-as-a-variation, omission-of-pages-is-refused-and-no-fact-sentence-leaves, informed-reason-outside-the-dictionary-shows-generic-words-and-a-gap, peer-cost-keeps-the-unexplained-remainder, credit-line-restricted-to-machinery-is-never-a-working-capital-line, debtor-rede-z-behind-the-old-identifiers-is-never-called-rede-a, sugar-scenario-is-never-called-wheat, boiler-investment-with-a-boiler-plan-is-named-as-the-boiler, input-label-corn-up-wheat-unchanged-never-names-an-input, input-label-corn-not-wheat-never-names-an-input, input-label-oil-up-wheat-unchanged-never-names-an-input, joint-program-shows-the-client-s-volume-without-an-owner, every-number-of-the-final-text-verified, never-presents-or-sends
## Adversarial
- material-without-decisions, material-with-no-deliberation, divergent-number, concatenated-digits-in-an-answer, sign-written-before-a-reading-in-the-summary, year-reading-used-as-money, literal-year-written-by-hand, currency-written-before-a-reading, money-in-billions-instead-of-millions, years-shown-as-months, annual-rate-shown-as-monthly, calendar-reading-used-as-reais, calendar-reading-with-an-iso-currency, calendar-reading-as-a-percent-in-words, calendar-reading-as-a-value, capitalized-scale-without-a-marker, financial-field-read-as-a-label-principal-as-label, financial-field-read-as-a-label-spread-as-label, financial-field-read-as-a-label-npv-as-label, field-outside-the-registry, date-format-on-a-number, scale-chosen-by-the-contribution, fullwidth-digits-in-a-line, arabic-indic-digits-in-an-answer, calendar-reading-as-an-amount-in-yen, calendar-reading-after-a-preposition, cents-in-free-text, thousands-in-free-text, per-week-in-free-text, per-semester-in-free-text, duration-in-parentheses, value-after-a-date-preposition, discussion-in-another-currency, unknown-template-id, slot-left-unbound, slot-the-template-does-not-have, years-bound-to-a-months-slot, value-bound-to-a-date-slot, prose-in-a-binding, literal-number-in-a-title, literal-deadline-in-a-line, reading-that-does-not-resolve, reading-of-an-unnamed-result, tampered-reviewed-result, reviewed-result-of-another-version, reviewed-result-the-basis-does-not-name, reviewed-result-of-another-company, result-of-an-unreleased-method, extra-result-beside-the-named-ones, title-without-an-economic-number, next-steps-without-a-deadline, false-number-in-a-deliberation-title, false-number-in-an-appendix-label, false-number-in-an-option-not-yet-shown, paraphrase-that-drops-a-material-fact, percent-sign-written-after-a-rate, question-text-used-as-an-answer, return-and-cost-of-capital-swapped, debt-total-bound-to-the-free-basket, program-cost-bound-to-debt-shares, positive-npv-under-a-negative-claim, path-row-reading-another-path, ebitda-of-another-year, concentration-year-that-is-not-the-largest, adverse-leverage-dated-in-another-year, notice-dated-with-the-route-deadline, fallback-dated-with-the-sounding-deadline, action-of-another-deliberation, subject-of-another-deliberation, page-line-used-as-a-deliberation-subject, answer-to-another-question, second-package-of-the-same-method, basket-occupied-by-the-creditor-of-another-row, largest-creditor-in-a-row-creditor-slot, prepaid-creditor-the-plan-does-not-prepay, amended-creditor-the-plan-does-not-amend, question-and-answer-name-different-creditors, exposure-read-from-the-program-volume, exposure-read-from-the-eligible-capacity, program-volume-under-a-sublimit-shown-as-exposure, assignment-ban-asserted-on-an-assignable-contract, policy-already-defined, sensitivity-called-smaller-economy-with-unchanged-economy, later-receivables-claimed-on-longer-inventory, larger-capex-claimed-on-front-loaded-capex-with-smaller-total, receivables-shorter-than-the-parent-with-longer-inventory, wheat-scenario-whose-shock-starts-after-the-year-shown, receivables-longer-only-in-another-year, boiler-investment-against-the-packaging-plan, packaging-line-sul-against-a-norte-plan, joint-program-called-the-client-s-own, deferral-without-a-deferred-schedule, kept-debt-with-a-new-working-capital-loan, deferral-with-operation-on-the-original-schedule, extension-path-with-an-undeclared-prepayment, extension-whose-amendment-does-not-extend, development-bank-description-on-a-bank-loan, deferral-proven-only-by-capex-and-ebitda, informed-fact-attributed-to-another-person, informed-fact-as-prose-1, informed-fact-as-prose-2, informed-fact-as-prose-3, informed-fact-as-prose-4, reading-in-an-informed-fact-slot, creditor-and-maturity-of-different-rows, tampered-envelope, free-material-in-request, fabricated-grant-in-result, fabricated-presentation-in-result, fabricated-sending-in-result
## Aceitação
- Reproduzir o caso de calibração da ficha C47 sobre as calibrações publicadas dos métodos liberados, sem alterar seus números.
- Executar a conversa da ficha C47 turno a turno pela interface real; guardar roteiro, versões, conferência, resposta, custo e latência.

# Evidência
## Hierarquia
- Resultados revisados dos métodos liberados, na versão vigente; atas, política de endividamento e estatuto; a última apresentação ao conselho.
- Ficha C47 como calibração, sobre as calibrações publicadas das fichas C10, C12, C18, C24, C26, C32 (linha de embalagem e plano de financiamento de 2027), C35 e C03. A opção de executar a linha em etapas não é caso revisado e fica pendente.
## Regras
- Nenhum valor de calibração vira parâmetro de produção.
- Cada número do material abre até o resultado revisado, o método, a versão, a impressão do pacote e o caminho do valor.

# Aprovação profissional e publicação governada
Conteúdo profissional pendente de aprovação do fundador para esta versão. Revisão técnica independente separada da autoria. Publicação e ativação seguem os atos de operador já existentes; nada neste documento concede execução.

# Narrativa
## N1. A decisão que organiza o trabalho
O CFO precisa sair da reunião com as decisões que destravam o plano. O material é consequência da análise revisada: o trabalho está em transformar a análise em decisões claras, na ordem certa, com os números que o conselho vai cobrar e as respostas para as perguntas que ele vai fazer.

## N2. Árvore de decisão
- Há tempo antes da reunião: propor o roteiro e perguntar só o que muda o material; produzir depois.
- Sem tempo: produzir com o roteiro no topo.
- O conselho não viu um tema: a página do tema vem antes da recomendação, com os números e o argumento a favor lado a lado. Já viu: a página vai ao apêndice.
- Pedido de retirar algo: a recomendação pode sair e a página mostra as opções; fato material, risco e prazo ficam.

## N3. Suficiência por conclusão
- Para cada página: um número de resultado revisado ou uma deliberação datada.
- Para cada decisão: prazo e alçada; alçada suposta é pendência declarada.
- O que faltar vira lacuna nomeada; nada é estimado para preencher a página.

## N4. Voz e três níveis de afirmação
Fato (os números das análises), leitura (o que eles dizem para cada decisão) e recomendação (o que pedimos ao conselho) separados. Sem veredito binário, sem certeza sobre o banco e sem adjetivo em título.

# Template
## T1. Uma leitura útil, com evidência aprofundável
1. Decisões pedidas, com prazo e alçada.
2. Situação: dívida, calendário e caixa.
3. Restrição: escritura, covenant e política.
4. Temas que o conselho não viu.
5. Alternativas avaliadas.
6. Recomendação.
7. Riscos e o que mudaria a recomendação.
8. Próximos passos e datas.

## T2. Peças
Página de síntese para envio prévio; apêndice com tabela de dívida, projeção e premissas, plano da companhia contra a base, fontes e datas; perguntas prováveis com resposta e número.

# Regra
## R1. Origem
Todo número do material é leitura de um resultado revisado, conferida contra ele; nenhum número é escrito à mão.

## R2. Omissão material
Pode ajustar a forma e retirar a recomendação; não pode omitir fato material, risco ou prazo. Cada versão preserva a anterior.

## R3. Terceiros
O material não é apresentado nem enviado pelo método; o envio depende de autorização.

# Qualidade
## Q1. Teste do MD
As decisões estão na primeira página, com prazo? A ordem é a da urgência? Cada título diz a conclusão? Cada número bate com a análise revisada? As pendências estão ditas? As perguntas difíceis têm resposta com número? Um pedido de retirada deixou os fatos? Um MD de mercado assinaria?

## Q2. Verificação
Corridas gold, adversarial e de consistência reexecutadas a cada versão; revisão técnica independente; aprovação de conteúdo registrada; conversa real pela interface antes de declarar a demanda atendida.

# Fundamentação profissional
## Decisões primeiro
O conselho decide melhor quando sabe o que está decidindo e até quando. A sustentação vem depois das decisões.

## Identidade econômica
Um número divergente desmoraliza o material inteiro. Cada número aponta para a análise e a versão de onde veio.

## Omissão
Retirar a recomendação a pedido de quem apresenta é aceitável; retirar o retorno e a sensibilidade torna a decisão sem base e o material enganoso por omissão.

# Composição tipada
```offroad-procedure
{
  "schemaVersion": "procedure-composition.v1",
  "authoringStatus": "ready_for_review",
  "pendingContent": [],
  "budget": {
    "maxModelCalls": 0,
    "maxDurationMs": 31000,
    "maxCostMinorUnits": 0,
    "currency": "BRL"
  },
  "allowedTools": [],
  "maximumEffect": "none",
  "components": [
    {
      "id": "board-capital-discussion.request-framing",
      "version": "2026.10.27-v1",
      "kind": "narrative",
      "title": "Enquadramento profissional da discussão no conselho",
      "inputs": {
        "id": "board-capital-discussion.framing-input",
        "version": "2026.10.27-v1",
        "value": {
          "type": "object",
          "fields": {
            "question": {
              "required": true,
              "value": {
                "type": "string"
              }
            }
          }
        }
      },
      "outputs": {
        "id": "board-capital-discussion.framing-output",
        "version": "2026.10.27-v1",
        "value": {
          "type": "object",
          "fields": {
            "scope": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "gaps": {
              "required": true,
              "value": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            }
          }
        }
      },
      "dependencies": [],
      "tools": [],
      "effect": "none",
      "rights": {
        "inheritSourceRestrictions": true,
        "purposes": [
          "decision_support"
        ],
        "sourceClasses": [
          "authorized_context"
        ]
      },
      "competencies": [
        "financial_analysis",
        "capital_structure"
      ],
      "invariants": [
        "law",
        "contractual_definition",
        "traceability",
        "verification",
        "access_barriers",
        "deterministic_financial_math"
      ],
      "overridePoints": [],
      "budget": {
        "maxModelCalls": 0,
        "maxDurationMs": 1000,
        "maxCostMinorUnits": 0,
        "currency": "BRL"
      },
      "evidence": [],
      "text": "Narrativa\nN1. A decisão que organiza o trabalho\nO CFO precisa sair da reunião com as decisões que destravam o plano. O material é consequência da análise revisada: o trabalho está em transformar a análise em decisões claras, na ordem certa, com os números que o conselho vai cobrar e as respostas para as perguntas que ele vai fazer.\n\nN2. Árvore de decisão\n- Há tempo antes da reunião: propor o roteiro e perguntar só o que muda o material; produzir depois.\n- Sem tempo: produzir com o roteiro no topo.\n- O conselho não viu um tema: a página do tema vem antes da recomendação, com os números e o argumento a favor lado a lado. Já viu: a página vai ao apêndice.\n- Pedido de retirar algo: a recomendação pode sair e a página mostra as opções; fato material, risco e prazo ficam.\n\nN3. Suficiência por conclusão\n- Para cada página: um número de resultado revisado ou uma deliberação datada.\n- Para cada decisão: prazo e alçada; alçada suposta é pendência declarada.\n- O que faltar vira lacuna nomeada; nada é estimado para preencher a página.\n\nN4. Voz e três níveis de afirmação\nFato (os números das análises), leitura (o que eles dizem para cada decisão) e recomendação (o que pedimos ao conselho) separados. Sem veredito binário, sem certeza sobre o banco e sem adjetivo em título."
    },
    {
      "id": "board-capital-discussion.packet",
      "version": "2026.10.27-v1",
      "kind": "rule",
      "title": "Levar ao conselho decisões com prazo sobre números revisados",
      "authority": "house",
      "statement": "Reunir os resultados revisados dos métodos liberados, conferidos pelo método, pela versão e pela impressão do pacote, sem recalcular nada; formular as deliberações com prazo e alçada em ordem de urgência; propor o roteiro antes do material quando há tempo, perguntando só o que muda o material; montar as páginas com título que diz a conclusão e o número que a sustenta, cada número lido de um resultado revisado e conferido contra o valor escrito, a síntese, o apêndice e as perguntas com resposta e número; declarar as pendências; pôr antes da recomendação o tema que o conselho não viu; aceitar retirar a recomendação e recusar omitir fato material, risco ou prazo, preservando cada versão; sem apresentar, sem importar template, sem enviar a terceiros, sem aprovar crédito e sem adotar ou publicar por cálculo.",
      "executor": {
        "module": "@offroad/financial-model",
        "exportName": "prepareBoardCapitalDiscussionPacket",
        "version": "2026.10.27-v1"
      },
      "inputs": {
        "id": "board-capital-discussion-packet-input",
        "version": "2026.10.27-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "board-capital-discussion-packet-input.v1"
                ]
              }
            },
            "question": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "analysis": {
              "required": true,
              "value": {
                "type": "object",
                "fields": {
                  "sources": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "id": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "packet": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          }
                        }
                      }
                    }
                  },
                  "discussion": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "envelope": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "canonical": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "fingerprint": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              }
                            }
                          }
                        },
                        "scope": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "workId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "purpose": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "versionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              }
                            }
                          }
                        },
                        "entityId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "perimeter": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "currency": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "openingDate": {
                          "required": true,
                          "value": {
                            "type": "date"
                          }
                        },
                        "endDate": {
                          "required": true,
                          "value": {
                            "type": "date"
                          }
                        },
                        "numericInterpretations": {
                          "required": false,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "mode": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "members": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "analysisId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "scenario": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "meeting": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "date": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "definitionKind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported",
                                          "managerial",
                                          "contractual"
                                        ]
                                      }
                                    },
                                    "missingReason": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              },
                              "askedOn": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "definitionKind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported",
                                          "managerial",
                                          "contractual"
                                        ]
                                      }
                                    },
                                    "missingReason": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              },
                              "leadDays": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "definitionKind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported",
                                          "managerial",
                                          "contractual"
                                        ]
                                      }
                                    },
                                    "missingReason": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              },
                              "minutesPerPage": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "definitionKind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported",
                                          "managerial",
                                          "contractual"
                                        ]
                                      }
                                    },
                                    "missingReason": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              },
                              "agendaMinutes": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "object",
                                      "fields": {
                                        "decisionId": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "definitionVersionId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "definitionKind": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "reported",
                                              "managerial",
                                              "contractual"
                                            ]
                                          }
                                        },
                                        "missingReason": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "nextMeetingDate": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "object",
                                      "fields": {
                                        "decisionId": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "definitionVersionId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "definitionKind": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "reported",
                                              "managerial",
                                              "contractual"
                                            ]
                                          }
                                        },
                                        "missingReason": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "template": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "object",
                                      "fields": {
                                        "decisionId": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "definitionVersionId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "definitionKind": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "reported",
                                              "managerial",
                                              "contractual"
                                            ]
                                          }
                                        },
                                        "missingReason": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "outlineConfirmed": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "definitionKind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported",
                                          "managerial",
                                          "contractual"
                                        ]
                                      }
                                    },
                                    "missingReason": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "sources": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "reading": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "topics": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "label": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "seen": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          }
                        },
                        "deliberations": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "topicId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "title": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "subject": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "recommendation": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "authority": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "deadlines": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "id": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "reading": {
                                          "required": true,
                                          "value": {
                                            "type": "object",
                                            "fields": {
                                              "decisionId": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "definitionVersionId": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "definitionKind": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "reported",
                                                    "managerial",
                                                    "contractual"
                                                  ]
                                                }
                                              },
                                              "missingReason": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "figures": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "kind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reading",
                                      "pending"
                                    ]
                                  }
                                },
                                "reading": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "materialFigureIds": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "indicative": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "figureId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "reason": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "pages": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "topicId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "role": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "title": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "lines": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "recommendation": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "options": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          }
                        },
                        "summary": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "opening": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "definitionKind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported",
                                          "managerial",
                                          "contractual"
                                        ]
                                      }
                                    },
                                    "missingReason": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              },
                              "closing": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "definitionKind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported",
                                          "managerial",
                                          "contractual"
                                        ]
                                      }
                                    },
                                    "missingReason": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "appendix": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "reading": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "questions": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "question": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "answer": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "omissions": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "reading": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "informed": {
                          "required": false,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "reading": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "outputs": {
        "id": "board-capital-discussion-packet-output",
        "version": "2026.10.27-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "board-capital-discussion-packet.v1"
                ]
              }
            },
            "executorVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "2026.10.27-v1"
                ]
              }
            },
            "financialCoreVersion": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "question": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "basisFingerprint": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "scope": {
              "required": true,
              "value": {
                "type": "object",
                "fields": {
                  "workId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "purpose": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "versionId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  }
                }
              }
            },
            "entityId": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "currency": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "result": {
              "required": true,
              "value": {
                "type": "object",
                "fields": {
                  "financialCoreVersion": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "scope": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "workId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "purpose": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "versionId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        }
                      }
                    }
                  },
                  "entityId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "currency": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "basisFingerprint": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "status": {
                    "required": true,
                    "value": {
                      "type": "enum",
                      "values": [
                        "missing_inputs",
                        "partial_composition"
                      ]
                    }
                  },
                  "gaps": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "operand": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "reason": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          }
                        }
                      }
                    }
                  },
                  "bindings": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "operand": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "decisionId": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "string"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "interpretationDecisionIds": {
                            "required": true,
                            "value": {
                              "type": "array",
                              "items": {
                                "type": "string"
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "normalization": {
                    "required": true,
                    "value": {
                      "type": "union",
                      "variants": [
                        {
                          "type": "object",
                          "fields": {
                            "schemaVersion": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "adopted-currency-representation.v1"
                                ]
                              }
                            },
                            "scope": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "workId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "purpose": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "versionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  }
                                }
                              }
                            },
                            "basisFingerprint": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "status": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "partial",
                                  "resolved"
                                ]
                              }
                            },
                            "values": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "number",
                                          "list"
                                        ]
                                      }
                                    },
                                    "interpretationDecisionIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "trace": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "schemaVersion": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "currency-representation.v1"
                                                  ]
                                                }
                                              },
                                              "engineVersion": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "operands": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "values": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "array",
                                                        "items": {
                                                          "type": "string"
                                                        }
                                                      }
                                                    },
                                                    "declaredScale": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "representation": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "reported_in_declared_scale",
                                                          "already_in_currency_units"
                                                        ]
                                                      }
                                                    }
                                                  }
                                                }
                                              },
                                              "factor": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "outputScale": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "1"
                                                  ]
                                                }
                                              },
                                              "values": {
                                                "required": true,
                                                "value": {
                                                  "type": "array",
                                                  "items": {
                                                    "type": "string"
                                                  }
                                                }
                                              },
                                              "rounding": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "none"
                                                  ]
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "gaps": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "reason": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "representation_not_adopted"
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "contributions": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "slotKey": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "kind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "observation",
                                          "hypothesis"
                                        ]
                                      }
                                    },
                                    "fieldPath": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "dimensions": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "entityId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "perimeter": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "periodStart": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "date"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "periodEnd": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "date"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "currency": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "unit": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "scale": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "scenario": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "type": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "number"
                                                  ]
                                                }
                                              },
                                              "value": {
                                                "required": true,
                                                "value": {
                                                  "type": "decimal_string"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "object",
                                            "fields": {
                                              "type": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "text"
                                                  ]
                                                }
                                              },
                                              "value": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "object",
                                            "fields": {
                                              "type": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "date"
                                                  ]
                                                }
                                              },
                                              "value": {
                                                "required": true,
                                                "value": {
                                                  "type": "date"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "object",
                                            "fields": {
                                              "type": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "boolean"
                                                  ]
                                                }
                                              },
                                              "value": {
                                                "required": true,
                                                "value": {
                                                  "type": "boolean"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "object",
                                            "fields": {
                                              "type": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "list"
                                                  ]
                                                }
                                              },
                                              "value": {
                                                "required": true,
                                                "value": {
                                                  "type": "array",
                                                  "items": {
                                                    "type": "string"
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    "observationId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "referenceValue": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "type": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "number"
                                                      ]
                                                    }
                                                  },
                                                  "value": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "decimal_string"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "type": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "text"
                                                      ]
                                                    }
                                                  },
                                                  "value": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "type": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "date"
                                                      ]
                                                    }
                                                  },
                                                  "value": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "date"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "type": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "boolean"
                                                      ]
                                                    }
                                                  },
                                                  "value": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "boolean"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "type": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "list"
                                                      ]
                                                    }
                                                  },
                                                  "value": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "array",
                                                      "items": {
                                                        "type": "string"
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            ]
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "referenceDimensions": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "entityId": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "perimeter": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "periodStart": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "date"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "periodEnd": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "date"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "currency": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "unit": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "scale": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "scenario": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "definitionVersionId": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionKind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported",
                                          "managerial",
                                          "contractual"
                                        ]
                                      }
                                    },
                                    "actorId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "reason": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "grantsExecution": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "classification": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "working_hypothesis",
                                  "working_selection"
                                ]
                              }
                            },
                            "fingerprint": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            }
                          }
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  },
                  "contributions": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "decisionId": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "slotKey": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "kind": {
                            "required": true,
                            "value": {
                              "type": "enum",
                              "values": [
                                "observation",
                                "hypothesis"
                              ]
                            }
                          },
                          "fieldPath": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "dimensions": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "entityId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "perimeter": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "periodStart": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "date"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "periodEnd": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "date"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "currency": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "unit": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "scale": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "scenario": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "value": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "number"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "decimal_string"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "text"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "date"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "date"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "boolean"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "list"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                }
                              ]
                            }
                          },
                          "observationId": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "string"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "referenceValue": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "number"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "decimal_string"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "text"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "date"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "boolean"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "boolean"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "list"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  ]
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "referenceDimensions": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "object",
                                  "fields": {
                                    "entityId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "perimeter": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "periodStart": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "date"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "periodEnd": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "date"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "currency": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "unit": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "scale": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "scenario": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "definitionKind": {
                            "required": true,
                            "value": {
                              "type": "enum",
                              "values": [
                                "reported",
                                "managerial",
                                "contractual"
                              ]
                            }
                          },
                          "actorId": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "reason": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          }
                        }
                      }
                    }
                  },
                  "derivedDependencies": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "result": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "decisionIds": {
                            "required": true,
                            "value": {
                              "type": "array",
                              "items": {
                                "type": "string"
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "classification": {
                    "required": true,
                    "value": {
                      "type": "enum",
                      "values": [
                        "working_hypothesis",
                        "working_selection"
                      ]
                    }
                  },
                  "grantsExecution": {
                    "required": true,
                    "value": {
                      "type": "boolean"
                    }
                  },
                  "grantsPublication": {
                    "required": true,
                    "value": {
                      "type": "boolean"
                    }
                  },
                  "fingerprint": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "schemaVersion": {
                    "required": true,
                    "value": {
                      "type": "enum",
                      "values": [
                        "adopted-board-capital-discussion.v1"
                      ]
                    }
                  },
                  "analysisId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "perimeter": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "sources": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "id": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "methodId": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "methodVersion": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "executorVersion": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "string"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "packetSchemaVersion": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "packetFingerprint": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "status": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          }
                        }
                      }
                    }
                  },
                  "discussion": {
                    "required": true,
                    "value": {
                      "type": "union",
                      "variants": [
                        {
                          "type": "object",
                          "fields": {
                            "version": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "2026.10.27-v1"
                                ]
                              }
                            },
                            "stage": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "outline",
                                  "material"
                                ]
                              }
                            },
                            "timeToAlign": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "daysBefore": {
                              "required": true,
                              "value": {
                                "type": "integer"
                              }
                            },
                            "outline": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "deliberations": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "id": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "number": {
                                            "required": true,
                                            "value": {
                                              "type": "integer"
                                            }
                                          },
                                          "title": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "text": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "authority": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "board",
                                                "executive",
                                                "shareholders"
                                              ]
                                            }
                                          },
                                          "deadlines": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "object",
                                                "fields": {
                                                  "id": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "date": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "date"
                                                    }
                                                  },
                                                  "action": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "narrative": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "enum",
                                        "values": [
                                          "decisions",
                                          "situation",
                                          "constraint",
                                          "topic",
                                          "alternatives",
                                          "recommendation",
                                          "risk",
                                          "what_changes",
                                          "next_steps"
                                        ]
                                      }
                                    }
                                  },
                                  "questions": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "code": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "template",
                                                "agenda_minutes",
                                                "board_has_seen"
                                              ]
                                            }
                                          },
                                          "topicId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "label": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "identity": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "figureId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "sourceId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "methodId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "methodVersion": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "packetFingerprint": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "path": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "unit": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "money",
                                          "rate",
                                          "multiple",
                                          "years",
                                          "months",
                                          "bps",
                                          "count",
                                          "calendar",
                                          "date",
                                          "label",
                                          "flag"
                                        ]
                                      }
                                    },
                                    "scale": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reais",
                                          "millions",
                                          "ratio",
                                          "native"
                                        ]
                                      }
                                    },
                                    "period": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "annual",
                                          "none"
                                        ]
                                      }
                                    },
                                    "presentation": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "rounded": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "stated": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "display": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "matches": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "omissions": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "target": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "recommendation",
                                          "page",
                                          "figure",
                                          "deadline"
                                        ]
                                      }
                                    },
                                    "targetId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "requestedBy": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "outcome": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "applied",
                                          "refused"
                                        ]
                                      }
                                    },
                                    "reason": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "keptFigureIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "versions": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "version": {
                                      "required": true,
                                      "value": {
                                        "type": "integer"
                                      }
                                    },
                                    "deliberations": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "id": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "number": {
                                              "required": true,
                                              "value": {
                                                "type": "integer"
                                              }
                                            },
                                            "title": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "text": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "recommendationShown": {
                                              "required": true,
                                              "value": {
                                                "type": "boolean"
                                              }
                                            },
                                            "authority": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "board",
                                                  "executive",
                                                  "shareholders"
                                                ]
                                              }
                                            },
                                            "authorityBasis": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "deadlines": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "object",
                                                  "fields": {
                                                    "id": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "date": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "date"
                                                      }
                                                    },
                                                    "display": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "action": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            },
                                            "figureIds": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "string"
                                                }
                                              }
                                            },
                                            "pendingFigureIds": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "pages": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "id": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "number": {
                                              "required": true,
                                              "value": {
                                                "type": "integer"
                                              }
                                            },
                                            "placement": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "main",
                                                  "appendix"
                                                ]
                                              }
                                            },
                                            "role": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "decisions",
                                                  "situation",
                                                  "constraint",
                                                  "topic",
                                                  "alternatives",
                                                  "recommendation",
                                                  "risk",
                                                  "what_changes",
                                                  "next_steps"
                                                ]
                                              }
                                            },
                                            "topicId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "title": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "lines": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "string"
                                                }
                                              }
                                            },
                                            "recommendation": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "options": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "string"
                                                }
                                              }
                                            },
                                            "figureIds": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "string"
                                                }
                                              }
                                            },
                                            "pendingFigureIds": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "string"
                                                }
                                              }
                                            },
                                            "deadlineIds": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "summary": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "summaryFigureIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "appendix": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "id": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "label": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "sourceIds": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "string"
                                                }
                                              }
                                            },
                                            "figureIds": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "questions": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "id": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "question": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "answer": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "figureIds": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "string"
                                                }
                                              }
                                            },
                                            "pendingFigureIds": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "verifiedNumbers": {
                                      "required": true,
                                      "value": {
                                        "type": "integer"
                                      }
                                    },
                                    "bindings": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "field": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "templateId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "slot": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "figureId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "deadlineId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "informedId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "agenda": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "minutes": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "integer"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "minutesPerPage": {
                                            "required": true,
                                            "value": {
                                              "type": "integer"
                                            }
                                          },
                                          "mainPages": {
                                            "required": true,
                                            "value": {
                                              "type": "integer"
                                            }
                                          },
                                          "capacity": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "integer"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "fits": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "boolean"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "fingerprint": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "gaps": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "item": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "reason": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "figure_pending_reviewed_result",
                                          "layout_exceeds_page",
                                          "pages_exceed_agenda",
                                          "recommendation_removed_without_options",
                                          "label_not_in_dictionary",
                                          "informed_reason_not_in_dictionary",
                                          "object_not_in_vocabulary"
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "pending": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "indicative": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "figureId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "reason": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "sources": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "sourceId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "methodId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "status": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "reasons": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "string"
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "authority": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "string"
                                      }
                                    }
                                  },
                                  "template": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "not_supplied",
                                        "supplied_not_applied"
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "materialFacts": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "figures": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "string"
                                      }
                                    }
                                  },
                                  "deadlines": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "informed": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "origin": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "informed"
                                        ]
                                      }
                                    },
                                    "author": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "chair",
                                          "cfo",
                                          "ceo"
                                        ]
                                      }
                                    },
                                    "code": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "priorVersionsKept": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "sentToThirdParties": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "presented": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            }
                          }
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  },
                  "exclusions": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "enum",
                        "values": [
                          "recalculation",
                          "presentation_delivery",
                          "template_import",
                          "third_party_distribution",
                          "credit_approval",
                          "method_release"
                        ]
                      }
                    }
                  }
                }
              }
            },
            "readings": {
              "required": true,
              "value": {
                "type": "union",
                "variants": [
                  {
                    "type": "object",
                    "fields": {
                      "stage": {
                        "required": true,
                        "value": {
                          "type": "enum",
                          "values": [
                            "outline_proposed",
                            "material_prepared"
                          ]
                        }
                      },
                      "materialWithheld": {
                        "required": true,
                        "value": {
                          "type": "boolean"
                        }
                      },
                      "deliberations": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "id": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "number": {
                                "required": true,
                                "value": {
                                  "type": "integer"
                                }
                              },
                              "title": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "text": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "deadlines": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "date"
                                  }
                                }
                              }
                            }
                          }
                        }
                      },
                      "questionsBeforeMaterial": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "code": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "topicId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        }
                      },
                      "material": {
                        "required": true,
                        "value": {
                          "type": "union",
                          "variants": [
                            {
                              "type": "object",
                              "fields": {
                                "version": {
                                  "required": true,
                                  "value": {
                                    "type": "integer"
                                  }
                                },
                                "fingerprint": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "mainPages": {
                                  "required": true,
                                  "value": {
                                    "type": "integer"
                                  }
                                },
                                "appendixPages": {
                                  "required": true,
                                  "value": {
                                    "type": "integer"
                                  }
                                },
                                "titles": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "pageId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "number": {
                                          "required": true,
                                          "value": {
                                            "type": "integer"
                                          }
                                        },
                                        "placement": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "main",
                                              "appendix"
                                            ]
                                          }
                                        },
                                        "title": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    }
                                  }
                                },
                                "fitsAgenda": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "boolean"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "questions": {
                                  "required": true,
                                  "value": {
                                    "type": "integer"
                                  }
                                },
                                "figuresChecked": {
                                  "required": true,
                                  "value": {
                                    "type": "integer"
                                  }
                                },
                                "allFiguresMatch": {
                                  "required": true,
                                  "value": {
                                    "type": "boolean"
                                  }
                                },
                                "materialFacts": {
                                  "required": true,
                                  "value": {
                                    "type": "integer"
                                  }
                                },
                                "materialFactsShown": {
                                  "required": true,
                                  "value": {
                                    "type": "boolean"
                                  }
                                },
                                "verifiedNumbers": {
                                  "required": true,
                                  "value": {
                                    "type": "integer"
                                  }
                                },
                                "priorVersionFingerprint": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            },
                            {
                              "type": "null"
                            }
                          ]
                        }
                      },
                      "pending": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "indicative": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "string"
                                }
                              }
                            },
                            "sources": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "string"
                                }
                              }
                            },
                            "authority": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "string"
                                }
                              }
                            },
                            "template": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "not_supplied",
                                  "supplied_not_applied"
                                ]
                              }
                            }
                          }
                        }
                      },
                      "omissions": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "id": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "outcome": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "applied",
                                    "refused"
                                  ]
                                }
                              },
                              "reason": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "keptFigureIds": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "string"
                                  }
                                }
                              }
                            }
                          }
                        }
                      },
                      "priorVersionsKept": {
                        "required": true,
                        "value": {
                          "type": "boolean"
                        }
                      },
                      "sentToThirdParties": {
                        "required": true,
                        "value": {
                          "type": "boolean"
                        }
                      },
                      "presented": {
                        "required": true,
                        "value": {
                          "type": "boolean"
                        }
                      }
                    }
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "gaps": {
              "required": true,
              "value": {
                "type": "array",
                "items": {
                  "type": "object",
                  "fields": {
                    "operand": {
                      "required": true,
                      "value": {
                        "type": "string"
                      }
                    },
                    "reason": {
                      "required": true,
                      "value": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "status": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "framed",
                  "partial",
                  "prepared_for_human_review"
                ]
              }
            },
            "exclusions": {
              "required": true,
              "value": {
                "type": "array",
                "items": {
                  "type": "enum",
                  "values": [
                    "recalculation",
                    "presentation_delivery",
                    "template_import",
                    "third_party_distribution",
                    "credit_approval"
                  ]
                }
              }
            },
            "grantsExecution": {
              "required": true,
              "value": {
                "type": "boolean"
              }
            },
            "grantsPublication": {
              "required": true,
              "value": {
                "type": "boolean"
              }
            },
            "fingerprint": {
              "required": true,
              "value": {
                "type": "string"
              }
            }
          }
        }
      },
      "dependencies": [
        {
          "id": "board-capital-discussion.request-framing",
          "version": "2026.10.27-v1"
        }
      ],
      "tools": [],
      "effect": "none",
      "rights": {
        "inheritSourceRestrictions": true,
        "purposes": [
          "decision_support"
        ],
        "sourceClasses": [
          "authorized_context"
        ]
      },
      "competencies": [
        "financial_analysis",
        "capital_structure"
      ],
      "invariants": [
        "law",
        "contractual_definition",
        "traceability",
        "verification",
        "access_barriers",
        "deterministic_financial_math"
      ],
      "overridePoints": [],
      "budget": {
        "maxModelCalls": 0,
        "maxDurationMs": 30000,
        "maxCostMinorUnits": 0,
        "currency": "BRL"
      },
      "evidence": [
        "packages/credit-playbook/knowledge/reviews/runs/prepare-board-capital-discussion-2026-10-27-v1-gold/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/prepare-board-capital-discussion-2026-10-27-v1-adversarial/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/prepare-board-capital-discussion-2026-10-27-v1-consistency/run.json"
      ]
    }
  ]
}
```
