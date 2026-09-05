---
id: build-interest-and-indexation-schedule
version: 2026.09.05-v1
maturity: implemented
title_pt: Construir o cronograma de juros e separar IPCA capitalizado do pago
title_en: Build the interest schedule and separate capitalized from paid indexation
role: financial_analysis
blueprint_stage: 4
owner_role: Head de Modelagem
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/executors/build-interest-and-indexation-schedule
implementation_export: buildInterestAndIndexationSchedule
result_contract: method.build-interest-and-indexation-schedule.v1
connected_states: [understanding_in_progress]
persistence_mode: derived_on_demand
persistence_target: method_results
unit_test_files: [packages/credit-playbook/src/executors/build-interest-and-indexation-schedule.test.ts]
gold_case_ids: [gc01-analista-ib-camil]
adversarial_case_ids: [adversarial:gc01:curve-without-source-refused]
e2e_scenario_ids: [pending:case01-frozen-run]
cost_eval_ids: [deterministic:no-model-calls]
house_procedure_ids: [D-17, D-18, D-24]
authorities: [DEF, CASA]
reference_data_keys: [policy.debt.views]
task_specs: [C05, C07]
calculation_ids: [financial.indexed_debt_schedule, financial.indexed_debt_aggregation, financial.interest_expense_bridge]
gold_cases: [gc01-analista-ib-camil]
dependencies: [build-debt-ledger]
---

# Objetivo
Projetar, série a série, juros, atualização monetária e amortização, dizendo em cada período o que
é pago em caixa e o que é capitalizado no principal, para que cobertura, caixa e alavancagem usem
o serviço da dívida certo e não a despesa contábil.

# Produto
Cronograma por série e agregado, com juros caixa, atualização capitalizada, amortização e saldo por
período, e a ponte entre o serviço projetado e a despesa contábil do último período.

# Quando ativar
- Existe ao menos uma série indexada (IPCA, CDI, prefixada) com termos conhecidos no ledger.
- O trabalho vai projetar caixa, cobertura ou custo de saída.

# Quando não ativar
- Nenhuma série tem indexador e spread conhecidos; o cronograma nasce vazio com a lacuna nomeada.

# Inputs mínimos e substitutos
- Ledger de dívida com indexador, spread, forma de pagamento de juros e cronograma por série; sem forma de pagamento, a série é projetada nos dois tratamentos e a diferença é declarada.
- Curvas de referência da data-base com fonte registrada (CDI, IPCA, NTN-B).

# Sequência operacional
1. [deterministic] Projetar cada série :: Para cada série, aplicar indexador, spread e regra de pagamento período a período ; Separar juros pagos em caixa de atualização capitalizada no principal | tools: financial.indexed_debt_schedule | evidence: ledger de dívida, escrituras, curvas
2. [deterministic] Agregar :: Somar séries por período e por indexador ; Conferir que o saldo agregado do primeiro período é o do ledger | tools: financial.indexed_debt_aggregation | evidence: ledger de dívida
3. [deterministic] Conciliar com a contabilidade :: Confrontar o serviço projetado do último período fechado com a despesa financeira e a movimentação da nota ; Registrar a diferença | tools: financial.interest_expense_bridge | evidence: resultado, nota de dívida
4. [model_assisted] Redigir :: Dizer quanto do custo é caixa e quanto é capitalizado, por indexador, e o que a base não sustenta

# Cálculos determinísticos
- financial.indexed_debt_schedule: cronograma por instrumento com tratamento de indexação e cupom.
- financial.indexed_debt_aggregation: agregação por período.
- financial.interest_expense_bridge: ponte com a despesa contábil.

# Julgamentos permitidos
- Escolher a curva de referência exige fonte e data registradas; nunca estimativa de modelo.

# Perguntas que mudam o trabalho
- As séries IPCA pagam atualização em caixa ou capitalizam? A escritura responde; sem ela, os dois cenários.

# Red flags
- Despesa financeira contábil muito acima do serviço em caixa: capitalização escondendo custo.
- Cronograma agregado que não bate com o saldo do ledger.

# Stop conditions
- Ledger sem termos por série e sem escrituras no pack.

# Outputs
- schedule_by_series (array, required): por série e período, juros caixa, atualização capitalizada, amortização e saldo
- schedule_aggregate (array, required): por período e indexador
- accounting_bridge (object, required): serviço projetado versus despesa contábil do último período
- uncovered_series (array, required): séries sem termos suficientes e o motivo

# Exemplos
## Bom
- Camil: seis séries IPCA (743.955) projetadas com atualização pelo IPCA e cupons de 6,34% a 8,70%; séries DI a 100% do DI mais 0,65% e 1,55% ou 104% e 105% do DI; prefixada a 14,15%.
## Ruim
- Tratar a despesa financeira contábil como serviço em caixa; usar a curva de 04/09/2026 como se fosse a da data-base do ITR sem dizer.

# Testes
## Unit
- série IPCA com atualização capitalizada e cupom em caixa reproduz o saldo esperado por período
## Gold
- gc01-analista-ib-camil: seção 11.1 do gabarito reproduzida série a série
## Adversarial
- série sem escritura não recebe tratamento suposto; curva sem fonte é recusada
## Aceitação
- reproduzível; caixa e capitalizado separados; ponte contábil registrada

# Evidência
## Hierarquia
- Escritura para os termos por série
- Ledger conciliado para os saldos
- Curva de referência com fonte e data
## Regras
- Sem forma de pagamento conhecida, projetar os dois tratamentos e declarar.
- Curva sem fonte registrada não entra.
