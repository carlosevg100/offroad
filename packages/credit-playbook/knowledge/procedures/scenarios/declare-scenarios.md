---
id: declare-scenarios
version: 2026.09.05-v2
maturity: implemented
title_pt: Declarar cenários com racional e sem inventar premissa
title_en: Declare scenarios with a rationale and without inventing assumptions
role: financial_analysis
blueprint_stage: 6
owner_role: Head de Modelagem
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/executors/declare-scenarios
implementation_export: declareScenarios
result_contract: method.declare-scenarios.v2
connected_states: [understanding_in_progress]
persistence_mode: derived_on_demand
persistence_target: method_results
unit_test_files: [packages/credit-playbook/src/executors/declare-scenarios.test.ts]
gold_case_ids: [gc01-analista-ib-camil]
adversarial_case_ids: [adversarial:gc01:parameter-without-origin-refused]
e2e_scenario_ids: [pending:case01-frozen-run]
cost_eval_ids: [deterministic:no-model-calls]
house_procedure_ids: [D-28, OP-05]
authorities: [CASA, HEURÍSTICA]
reference_data_keys: [scenario.interest_rate.parallel_shock, policy.seasonality.materiality]
task_specs: [C07, C08]
calculation_ids: [financial.rate_shock, financial.liquidity_coverage, operation.pro_forma_position]
gold_cases: [gc01-analista-ib-camil, gc05-banker-expansao-camil]
max_model_calls: 1
model_purpose: [redigir a frase de racional de cada cenário a partir dos parâmetros registrados]
---

# Objetivo
Quando o dado gerencial não existe, seguir com cenários declarados, cada um com origem
nomeada (histórico de capex, percentual de receita ou EBITDA, capacidade incremental de dívida,
anúncio público, benchmark, faixa dada pelo usuário) e uma frase que diz o que o cenário é e o
que ele não é, em vez de bloquear ou inventar uma premissa.

# Produto
Conjunto mínimo de cenários (base, adverso, sem rolagem) com parâmetros, racional, fonte de cada
parâmetro e a frase de ressalva que acompanha qualquer número derivado deles.

# Quando ativar
- Falta orçamento, plano de capex, política de caixa mínimo ou cronograma gerencial, e o trabalho precisa seguir.
- O usuário pediu sensibilidade ou "e se".

# Quando não ativar
- O dado gerencial existe e está autorizado; cenários viram sensibilidades sobre ele, não substitutos.

# Inputs mínimos e substitutos
- Histórico da companhia (capex, receita, EBITDA, dívida) do ledger e das demonstrações.
- Anúncios públicos com valor e prazo; benchmark setorial versionado; faixa dada pelo usuário, registrada como tal.

# Sequência operacional
1. [deterministic] Escolher a origem de cada parâmetro :: Para cada premissa necessária, registrar a origem na ordem: dado autorizado, anúncio público, histórico, benchmark versionado, faixa do usuário ; Recusar premissa sem origem | evidence: demonstrações, anúncios, benchmark
2. [deterministic] Construir o conjunto mínimo :: Base, adverso (choque de taxa e queda de EBITDA pela política versionada) e sem rolagem ; Calcular posição pro forma e cobertura por cenário | tools: financial.rate_shock, financial.liquidity_coverage, operation.pro_forma_position | evidence: ledger, cronograma
3. [model_assisted] Redigir o racional :: Uma frase por cenário com origem dos parâmetros e o que o cenário não afirma ; A frase acompanha qualquer número derivado

# Cálculos determinísticos
- financial.rate_shock: choque de taxa versionado sobre o serviço da dívida.
- financial.liquidity_coverage: cobertura por período em cada cenário.
- operation.pro_forma_position: posição pro forma com a nova dívida do cenário.

# Julgamentos permitidos
- Escolher entre histórico e benchmark quando os dois existem: prefere-se o histórico da própria companhia, com a razão escrita.

# Perguntas que mudam o trabalho
- Existe orçamento ou plano de capex autorizado? Se sim, este método vira sensibilidade.
- O usuário quer fixar uma faixa? Registrada como faixa do usuário, nunca como fato.

# Red flags
- Cenário "base" que coincide com o anúncio da companhia sem dizer que é o anúncio.
- Parâmetro sem origem.

# Stop conditions
- Nenhuma origem disponível para um parâmetro material e o usuário não deu faixa.

# Outputs
- schema_version (string, required): identificador do contrato de resultado, `method.declare-scenarios.v2`
- reference_date (date, required): data-base
- unit (string, required): unidade dos valores monetários; choques, haircuts e coberturas levam `ratio` ou `x`
- state (enum, required): declared ou blocked | values: declared, blocked
- block_reasons (array, required): motivos estruturados de bloqueio
- scenarios (array, required): por cenário, os parâmetros usados com papel, período, chave, valor, origem e âncora (a origem é escolhida pelo executor: a melhor disponível no registro para cada papel e período, nunca a preferida do chamador); resultados pró-forma sobre a dívida líquida contratual (componentes com âncora) com alavancagem sobre o EBITDA de definição declarada, juros sob choque, liquidez por período com CFADS, fontes contratadas usadas uma vez no seu período e rolagem só sob premissa registrada; cada número com as origens de que depende; a frase de ressalva; e os termos não cobertos (`insufficient_evidence`) que o cenário declarou mas o registro não tem
- assumption_register (array, required): cada premissa com papel, período, valor, unidade, origem e posto, racional, data, fonte, confiança e se foi selecionada; uma fonte contratada só existe com contrato e desembolso na base; um refinanciamento é dívida nova substituindo dívida antiga, nunca uma subtração
- trace (object, required): cada cálculo pelo `financial-core` com fórmula, operandos, resultado, unidade e origens; fingerprints de entrada e saída com o trace dentro

# Exemplos
## Bom
- Camil sem orçamento: capex base pelo histórico do release (R$ 77,5 milhões no trimestre, queda após Cambaí), adverso com choque de taxa versionado, sem rolagem da parede de 2026/27; cada número com "cenário declarado a partir de X, não é guidance da companhia".
## Ruim
- Projetar EBITDA de fevereiro de 2027 e apresentá-lo como fato; usar uma faixa do usuário sem dizer que é dele.

# Testes
## Unit
- parâmetro sem origem é recusado; conjunto mínimo tem os três cenários
## Gold
- gc01-analista-ib-camil: cenários da devolutiva com origem registrada e ressalva
## Adversarial
- anúncio público disfarçado de premissa própria é detectado; faixa do usuário rotulada
## Aceitação
- toda premissa com origem; ressalva presente em todo número derivado

# Evidência
## Hierarquia
- Dado gerencial autorizado
- Anúncio público datado
- Histórico da companhia
- Benchmark versionado
- Faixa do usuário
## Regras
- Premissa sem origem não existe.
- Cenário nunca vira fato na prosa.
