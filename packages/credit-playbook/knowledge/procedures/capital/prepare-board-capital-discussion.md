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
gold_case_ids: [outline-before-material-when-there-is-time, outline-asks-only-what-changes-the-material, four-deliberations-in-urgency-order, outline-in-the-same-urgency-order, deliberations-with-authority-and-the-supposed-authority-declared, titles-pages-1-to-4-conclusion-and-number, titles-pages-5-to-8-conclusion-and-number, titles-pages-9-to-12-conclusion-and-number, every-page-carries-a-number, numbers-checked-against-the-analyses-debt-covenant-and-cash, numbers-checked-against-the-analyses-line-crop-projection-and-cost, each-number-pinned-to-method-version-and-packet, financing-plan-read-from-its-reviewed-result, turn-2-without-pending-numbers, staged-option-pending-never-invented, summary-for-prior-reading-names-every-decision-and-date, appendix-cites-the-reviewed-results, likely-questions-with-answer-and-number, pending-items-declared, line-before-the-recommendation-when-the-board-has-not-seen-it, line-the-board-has-seen-goes-to-the-appendix, twelve-pages-fit-forty-five-minutes, pages-beyond-the-agenda-are-a-gap, turn-3-recommendation-withdrawn-and-facts-kept, turn-3-options-with-criteria-and-numbers, turn-3-deliberation-becomes-the-choice-and-the-notice-stays, turn-3-prior-version-kept, refuses-to-omit-the-return-on-request, refuses-to-drop-the-line-page, refuses-to-drop-the-leverage-risk, refuses-to-drop-the-notice-deadline, a-request-for-the-deck-does-not-skip-the-outline, no-time-before-the-meeting-produces-the-material-with-the-outline, ficha-divergences-follow-the-published-methods, paths-page-compares-each-path, paths-page-has-seven-paths-with-every-measure, every-material-fact-shown-in-the-current-version, refuses-removing-a-date-that-shares-a-line-with-material-facts, refuses-removing-a-label-that-carries-the-sensitivities, refuses-withdrawing-a-recommendation-that-alone-carries-material-facts, never-presents-or-sends]
adversarial_case_ids: [material-without-decisions, material-with-no-deliberation, divergent-number, literal-number-in-a-title, literal-deadline-in-a-line, reading-that-does-not-resolve, reading-of-an-unnamed-result, tampered-reviewed-result, reviewed-result-of-another-version, reviewed-result-the-basis-does-not-name, reviewed-result-of-another-company, result-of-an-unreleased-method, extra-result-beside-the-named-ones, title-without-an-economic-number, next-steps-without-a-deadline, false-number-in-a-deliberation-title, false-number-in-an-appendix-label, false-number-in-an-option-not-yet-shown, paraphrase-that-drops-a-material-fact, spread-without-its-percent-sign, answer-without-an-economic-number, tampered-envelope, free-material-in-request, fabricated-grant-in-result, fabricated-presentation-in-result, fabricated-sending-in-result]
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
- O método não recalcula nenhuma análise. Cada número é uma leitura de um resultado revisado: caminho no pacote, escala em potência de dez, casas decimais e o valor escrito na página.
- Conferência de identidade: valor de origem multiplicado pela escala, arredondado para cima a partir da metade nas casas declaradas, igual ao valor escrito. Diferente é recusado pelo nome do número; caminho que não resolve, ou leitura de resultado não nomeado, é número sem origem e é recusado.
- Texto do material: dígito literal só como ano ou mês de um ano (2027, dez/26); qualquer outro número vem de uma leitura, de uma deliberação (prazo) ou da contagem das deliberações. Vale para todo texto gerado, inclusive título de deliberação, rótulo de apêndice, pergunta, síntese, opção ainda não exibida, tema, base de alçada e nota de pendência. Número escrito à mão é recusado.
- Unidade explícita: percentual seguido de "%" e múltiplo seguido de "x"; sem o sinal, recusa.
- Suporte numérico: o título de cada página (fora decisões e próximos passos) e cada resposta carregam uma leitura econômica (valor, percentual, múltiplo, prazo, pontos ou contagem de resultado revisado); texto, data ou sim e não não bastam. Próximos passos carregam um prazo de deliberação.
- Fatos materiais por regra: toda leitura econômica adotada, todo número que a base marca como material e todo prazo de deliberação. A versão composta mostra todos, ou é recusada; cada pedido de omissão é aplicado só se a versão que ele produz ainda mostra todos, conferido depois de renderizar, senão é recusado com a frase e os fatos que sairiam.
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
- Pedido de omissão que deixaria de mostrar um fato material (direto, por rótulo ou data na mesma linha, pela retirada da recomendação ou da página) ou um prazo é recusado com uma frase; a recomendação pode sair quando os fatos continuam. Base reescrita que deixa de mostrar um fato material é recusada.
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
- Antes de montar, a proposta de roteiro em quatro deliberações, nesta ordem, porque três têm prazo: linha de embalagem, com o aviso ao fornecedor até 2/out; safra de 2026, com a adesão aos programas até 16/out; vencimentos de 2027, com a sondagem até 31/out e a decisão da rota até 15/nov; política de endividamento, definir qual EBITDA mede o limite de 2,5x. Para acertar o material: a última apresentação ao conselho, o tempo de pauta e se o conselho já viu a revisão da linha.
## Ruim
- "Segue o deck de 25 páginas com contexto macroeconômico e próximos passos no fim." (não diz o que o conselho decide nem quando)
- "Tirei a página da linha, como o presidente pediu." (sem o retorno e a sensibilidade, a decisão fica sem base)

# Testes
## Unit
- packages/financial-model/src/board-capital-discussion.test.ts: leitura por caminho, arredondamento e conferência, números literais, ordem das deliberações e das páginas, regra de omissão.
- packages/financial-model/src/board-capital-discussion-packet.test.ts e packages/financial-model/src/board-capital-discussion-premises.test.ts: os três turnos, ida e volta das premissas e composição a partir dos resultados guardados.
## Gold
- outline-before-material-when-there-is-time, outline-asks-only-what-changes-the-material, four-deliberations-in-urgency-order, outline-in-the-same-urgency-order, deliberations-with-authority-and-the-supposed-authority-declared, titles-pages-1-to-4-conclusion-and-number, titles-pages-5-to-8-conclusion-and-number, titles-pages-9-to-12-conclusion-and-number, every-page-carries-a-number, numbers-checked-against-the-analyses-debt-covenant-and-cash, numbers-checked-against-the-analyses-line-crop-projection-and-cost, each-number-pinned-to-method-version-and-packet, financing-plan-read-from-its-reviewed-result, turn-2-without-pending-numbers, staged-option-pending-never-invented, summary-for-prior-reading-names-every-decision-and-date, appendix-cites-the-reviewed-results, likely-questions-with-answer-and-number, pending-items-declared, line-before-the-recommendation-when-the-board-has-not-seen-it, line-the-board-has-seen-goes-to-the-appendix, twelve-pages-fit-forty-five-minutes, pages-beyond-the-agenda-are-a-gap, turn-3-recommendation-withdrawn-and-facts-kept, turn-3-options-with-criteria-and-numbers, turn-3-deliberation-becomes-the-choice-and-the-notice-stays, turn-3-prior-version-kept, refuses-to-omit-the-return-on-request, refuses-to-drop-the-line-page, refuses-to-drop-the-leverage-risk, refuses-to-drop-the-notice-deadline, a-request-for-the-deck-does-not-skip-the-outline, no-time-before-the-meeting-produces-the-material-with-the-outline, ficha-divergences-follow-the-published-methods, paths-page-compares-each-path, paths-page-has-seven-paths-with-every-measure, every-material-fact-shown-in-the-current-version, refuses-removing-a-date-that-shares-a-line-with-material-facts, refuses-removing-a-label-that-carries-the-sensitivities, refuses-withdrawing-a-recommendation-that-alone-carries-material-facts, never-presents-or-sends
## Adversarial
- material-without-decisions, material-with-no-deliberation, divergent-number, literal-number-in-a-title, literal-deadline-in-a-line, reading-that-does-not-resolve, reading-of-an-unnamed-result, tampered-reviewed-result, reviewed-result-of-another-version, reviewed-result-the-basis-does-not-name, reviewed-result-of-another-company, result-of-an-unreleased-method, extra-result-beside-the-named-ones, title-without-an-economic-number, next-steps-without-a-deadline, false-number-in-a-deliberation-title, false-number-in-an-appendix-label, false-number-in-an-option-not-yet-shown, paraphrase-that-drops-a-material-fact, spread-without-its-percent-sign, answer-without-an-economic-number, tampered-envelope, free-material-in-request, fabricated-grant-in-result, fabricated-presentation-in-result, fabricated-sending-in-result
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
                                          "brl_millions",
                                          "brl",
                                          "percent",
                                          "multiple",
                                          "years",
                                          "months",
                                          "bps",
                                          "number",
                                          "date_day_month",
                                          "date_month_year",
                                          "text",
                                          "boolean"
                                        ]
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
                                          "recommendation_removed_without_options"
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
