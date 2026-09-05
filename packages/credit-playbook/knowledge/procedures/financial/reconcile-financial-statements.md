---
id: reconcile-financial-statements
version: 2026.09.05-v1
maturity: implemented
title_pt: Conciliar as demonstrações entre si e com o release
title_en: Reconcile the financial statements with each other and with the release
role: financial_analysis
blueprint_stage: 4
owner_role: Head de Análise Financeira
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/executors/reconcile-financial-statements
implementation_export: reconcileFinancialStatements
result_contract: method.reconcile-financial-statements.v1
connected_states: [understanding_in_progress]
persistence_mode: derived_on_demand
persistence_target: method_results
unit_test_files: [packages/credit-playbook/src/executors/reconcile-financial-statements.test.ts]
gold_case_ids: [gc01-analista-ib-camil]
adversarial_case_ids: [adversarial:gc01:scale-mutation-breaks-roll-forward]
e2e_scenario_ids: [pending:case01-frozen-run]
cost_eval_ids: [deterministic:no-model-calls]
house_procedure_ids: [Q-01, Q-02, D-24]
authorities: [DEF, CASA]
reference_data_keys: [policy.reconciliation.tolerance, policy.financial.materiality]
task_specs: [D06, C03]
calculation_ids: [financial.accounting_identity, financial.debt_balance_bridge, financial.interest_expense_bridge]
gold_cases: [gc01-analista-ib-camil]
---

# Objetivo
Provar que os números materiais fecham entre balanço, resultado, fluxo de caixa, notas e release,
registrar cada diferença com as duas âncoras, e nunca escolher um valor em silêncio quando duas
fontes da mesma divulgação discordam.

# Produto
Mapa de conciliação por conta material: valor por fonte, diferença, tolerância aplicada, estado
(fecha, diferença explicada, divergência aberta) e âncoras.

# Quando ativar
- Existe mais de uma fonte para a mesma conta material (nota e balanço, release e nota, DFP e ITR).
- Um número da divulgação vai sustentar afirmação material do trabalho.

# Quando não ativar
- Só existe uma fonte e ela é a demonstração auditada; o mapa registra a conta como de fonte única.

# Inputs mínimos e substitutos
- Demonstração do período com notas; release e apresentação quando existirem.
- Tolerância versionada de conciliação por demonstração e escala; sem ela, usa-se tolerância zero e a diferença vira divergência aberta.

# Sequência operacional
1. [deterministic] Montar identidades :: Ativo igual a passivo mais patrimônio; caixa inicial mais variação igual a caixa final; dívida inicial mais movimentação igual a dívida final ; Registrar cada identidade com as âncoras | tools: financial.accounting_identity, financial.debt_balance_bridge | evidence: balanço, fluxo de caixa, nota de dívida
2. [deterministic] Confrontar fontes da mesma conta :: Para cada conta material com duas fontes, calcular a diferença e classificá-la pela tolerância ; Diferença acima da tolerância sem explicação na nota vira divergência aberta com as duas âncoras | evidence: notas, release
3. [deterministic] Conciliar juros :: Confrontar a despesa de juros do resultado com a movimentação de juros da nota de dívida ; Diferença é registrada, não distribuída | tools: financial.interest_expense_bridge | evidence: nota de dívida, resultado
4. [model_assisted] Redigir o mapa :: Listar o que fecha, o que difere com explicação e o que fica aberto ; Nunca escrever "aproximadamente" para esconder uma diferença

# Cálculos determinísticos
- financial.accounting_identity: identidades contábeis com resultado por identidade.
- financial.debt_balance_bridge: saldo inicial, captações, juros, amortizações, variação cambial, saldo final.
- financial.interest_expense_bridge: juros calculados versus contabilizados.

# Julgamentos permitidos
- Decidir se uma diferença dentro da tolerância é arredondamento exige ver a escala e a nota, não assumir.

# Perguntas que mudam o trabalho
- Qual a tolerância versionada para esta demonstração e escala?

# Red flags
- A mesma conta com dois valores na mesma divulgação (nota e outra nota; nota e release).
- Diferença que aparece só em uma das identidades.

# Stop conditions
- Identidade material não fecha e a nota não explica.

# Outputs
- reconciliations (array, required): por conta, valores por fonte, diferença, tolerância, estado e âncoras
- open_divergences (array, required): divergências abertas com as duas âncoras e o motivo
- identities (array, required): identidades testadas com resultado

# Exemplos
## Bom
- Camil 1T26: estoques da nota 5 (3.088.478, com 643.241 de adiantamentos) e do release (2.445,2) conciliam exatamente; dividendos com 395.000 nominais e 338.565 a valor presente na nota 18 e no balanço contra 322.498 e 420.000 na nota 25 ficam como divergência aberta.
## Ruim
- Escolher 322.498 como "o" valor de dividendos; dizer que dívida líquida do release e contratual são "praticamente iguais".

# Testes
## Unit
- identidades e pontes reproduzem a seção 2 do gabarito do caso 01
## Gold
- gc01-analista-ib-camil: divergência de dividendos e conciliação de estoques detectadas e registradas
## Adversarial
- valor alterado em uma fonte é detectado pela conciliação; escala trocada é detectada pela identidade
## Aceitação
- nenhuma diferença escondida; divergências com duas âncoras

# Evidência
## Hierarquia
- Demonstração auditada ou revisada e notas
- Release e apresentação, nomeados como visão do release
## Regras
- Duas fontes que discordam ficam registradas como divergência; não se escolhe uma em silêncio.
- Tolerância só entra quando versionada.
