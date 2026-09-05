---
id: build-interest-and-indexation-schedule
version: 2026.09.05-v3
maturity: implemented
title_pt: Construir o cronograma de juros e separar IPCA capitalizado do pago
title_en: Build the interest schedule and separate capitalized from paid indexation
role: financial_analysis
blueprint_stage: 4
owner_role: Head de Modelagem
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/executors/build-interest-and-indexation-schedule
implementation_export: buildInterestAndIndexationSchedule
result_contract: method.build-interest-and-indexation-schedule.v3
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
calculation_ids: [financial.indexed_debt_schedule, financial.indexed_debt_aggregation, financial.interest_expense_bridge, financial.daily_rate_annualized, financial.ipca_anniversary_update, financial.coupon_payment, financial.ledger_coverage]
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
- financial.business_day_accrual: (1 + taxa anual)^(dias úteis/252) - 1, o fator que as escrituras escrevem; nunca taxa anual dividida por quatro.
- financial.di_spread_factor: (1 + fator DI) × (1 + fator spread) - 1, com o termo cruzado.
- financial.di_percent_accrual: (1 + ((1 + DI)^(1/252) - 1) × p)^dias úteis - 1 para p% do DI.
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
- schema_version (string, required): identificador do contrato de resultado, `method.build-interest-and-indexation-schedule.v3`
- reference_date (date, required): data-base da projeção (início do primeiro período)
- unit (enum, required): unidade dos valores monetários (BRL, BRL thousand, BRL million, USD, USD thousand); fatores e taxas levam a unidade `x`
- state (enum, required): complete, partial (série não projetada, principal sem cronograma, tratamento IPCA em cenários ou primeiro cupom incompleto) ou blocked | values: complete, partial, blocked
- block_reasons (array, required): motivos estruturados de bloqueio (nenhuma série projetável)
- assumptions (array, required): premissas declaradas (curva datada fora da data-base usada como cenário; atualização IPCA por aniversário sem o pro rata intramês; juros corridos na data-base ausentes; arredondamento não informado; tratamento IPCA projetado nos dois cenários)
- schedule_by_series (array, required): por série: nominal de abertura com base e âncora (saldo contábil com juros nunca é nominal), juros corridos de abertura, indicação de primeiro cupom completo, curva com título e âncora, arredondamento da escritura, projeção de principal, tratamento, cenários de tratamento quando a base não diz, e por período: saldo inicial, fator e valor da atualização (capitalizada ou paga), fator do cupom, cupom acumulado, cupom pago na data de pagamento (acumulado até a data), cupom carregado depois da data, principal pago (nulo sem cronograma), saldo final e âncora do calendário
- schedule_aggregate (object, required): por período e por indexador: juros caixa, atualização paga em caixa, atualização capitalizada, principal pago e saldo (nulos quando alguma série não tem cronograma), saldo inicial projetado, completude da projeção de principal e séries com tratamento IPCA pendente; nulo quando nada se projeta
- ledger_coverage (object, optional): nominal projetado contra a dívida bruta do ledger, com a participação e as séries do ledger que a projeção não recebeu
- accounting_bridge (object, optional): despesa projetada (juros caixa mais atualização paga e capitalizada) contra a despesa contábil do último período fechado; insufficient_evidence com projetado nulo e motivo quando o período não está na projeção, alguma série não foi projetada ou o tratamento IPCA não está resolvido; nunca zeros inventados
- uncovered_series (array, required): séries sem nominal, sem termos, sem âncora de termos, sem datas de pagamento, sem curva do indexador certo, sem variação mensal ou aniversário, com remuneração incompatível, ou presentes no ledger e ausentes da entrada, cada uma com o motivo
- trace (object, required): cada fator, aniversário, pagamento e linha com fórmula, operandos e unidade; fingerprints canônicos de entrada e saída, com o trace e o fingerprint de entrada dentro do de saída

# Exemplos
## Bom
- Camil: seis séries IPCA (743.955) projetadas com atualização pelo IPCA e cupons de 6,34% a 8,70%; séries DI a 100% do DI mais 0,65% e 1,55% ou 104% e 105% do DI; prefixada a 14,15%.
## Ruim
- Tratar a despesa financeira contábil como serviço em caixa; usar a curva de 04/09/2026 como se fosse a da data-base do ITR sem dizer.

# Testes
## Unit
- fator de atualização e de cupom por período iguais aos do financial-core sobre os dias úteis declarados; cupom pago só no período com data de pagamento e igual ao acumulado desde o pagamento anterior; série a p% do DI e prefixada com os fatores próprios; curva do indexador errado, termos sem âncora, datas de pagamento ausentes e tratamento da atualização ausente viram lacunas nomeadas; unidade fora do catálogo, períodos que não se encadeiam a partir da data-base e ids duplicados são recusados; fingerprints iguais sob vinte permutações de séries, curvas, períodos, datas, chaves de registro e ordem de chaves
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
