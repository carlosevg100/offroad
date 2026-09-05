---
id: declare-scenarios
version: 2026.09.05-v5
maturity: implemented
title_pt: Declarar cenários com racional e sem inventar premissa
title_en: Declare scenarios with a rationale and without inventing assumptions
role: financial_analysis
blueprint_stage: 6
owner_role: Head de Modelagem
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/executors/declare-scenarios
implementation_export: declareScenarios
result_contract: method.declare-scenarios.v5
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

# Regras de declaração
- Toda âncora nomeia um documento do registro da base; cada origem só cita documentos da sua classe (dado gerencial em documento gerencial, anúncio em anúncio, histórico em ITR ou ledger, benchmark versionado, intervalo do usuário em declaração do usuário).
- Alavanca declarada sem premissa registrada (choque, haircut, refinanciamento, rolagem) bloqueia o cenário; nada vira zero.
- CFADS é declarado por período do cronograma do ledger; o executor nunca divide nem repete; haircut de CFADS é premissa própria, nunca derivada do haircut de EBITDA.
- Juros entram no serviço só quando o ledger os declara para aquele período; o período sem juros é só de principal e o delta do choque é reportado à parte, nunca rateado.
- Choque ou haircut de zero não é estresse e é recusado; EBITDA de doze meses é declarado por datas, não por rótulo; documentos entram com nome e hash conferidos contra o manifesto do corpus.
- O cenário adverso do conjunto mínimo choca a taxa e corta o EBITDA, os dois; rolagem futura nunca vem do histórico, só de dado gerencial ou intervalo declarado; EBITDA implícito de índice com duas casas é aproximado e a alavancagem sobre ele sai com duas casas; a comparabilidade do EBITDA é por instrumento e o headroom segue o instrumento do covenant.
- Headroom só contra limite resolvido, degrau aplicável e comparação comparável com EBITDA comparável; caso contrário a diferença aritmética é mostrada como condicionada.

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
- schema_version (string, required): `method.declare-scenarios.v5`
- reference_date (date, required): data-base da posição
- unit (enum, required): unidade de todos os valores monetários, ancorada na fonte que a declara (escala re-rotulada é recusada)
- state (enum, required): declared, partial (algum cenário com lacuna: CFADS ausente em período, juros não declarados, EBITDA ausente) ou blocked (um cenário do conjunto mínimo tem alavanca declarada sem premissa registrada) | values: declared, partial, blocked
- block_reasons (array, required): cenários do conjunto mínimo bloqueados e por quê
- assumption_register (array, required): cada premissa com papel, período, valor, unidade, origem e sua posição na ordem de preferência, racional, data, âncora (num documento da classe que a origem exige, ligado ao corpus pelo hash), contrato e desembolso quando é fonte contratada, confiança e se foi selecionada
- scenarios (array, required): por cenário: estado (declared, partial, blocked com motivos), parâmetros usados com racional e âncora, pró forma (dívida bruta, caixa dedutível, dívida líquida contratual, alavancagem com definição, base e comparabilidade do EBITDA), headroom só contra limite resolvido, degrau aplicável (não condicional nem inaplicável) e comparável com EBITDA comparável (senão nota com a diferença aritmética condicionada), juros com choque reportado à parte e nunca rateado pelos períodos, liquidez (base só principal, serviço integral ou mista; por período: base do período, principal, juros ou nulo, CFADS declarado e usado, haircut de CFADS próprio, fontes contratadas, principal rolado, cobertura, caixa final, déficit) ou nula quando falta CFADS em algum período, ressalva com os racionais de cada premissa, termos não cobertos; cada número com as premissas e âncoras de que depende, inclusive o caixa inicial e os períodos anteriores
- trace (object, required): cálculos do financial-core com cenário, operandos, unidade e origens; fingerprints canônicos de entrada e saída, com o trace dentro

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
