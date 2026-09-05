---
id: diagnose-maturity-wall
version: 2026.09.05-v5
maturity: implemented
title_pt: Diagnosticar a parede de vencimentos
title_en: Diagnose the maturity wall
role: financial_analysis
blueprint_stage: 5
owner_role: Head de DCM
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/executors/diagnose-maturity-wall
implementation_export: diagnoseMaturityWall
result_contract: method.diagnose-maturity-wall.v5
connected_states: [understanding_in_progress]
persistence_mode: derived_on_demand
persistence_target: method_results
unit_test_files: [packages/credit-playbook/src/executors/diagnose-maturity-wall.test.ts]
gold_case_ids: [gc01-analista-ib-camil]
adversarial_case_ids: [adversarial:gc01:board-approvals-are-not-sources]
e2e_scenario_ids: [pending:case01-frozen-run]
cost_eval_ids: [deterministic:no-model-calls]
house_procedure_ids: [D-03, D-05, D-28]
authorities: [CASA, MERCADO]
reference_data_keys: [policy.seasonality.materiality, policy.structure.maturity_wall]
task_specs: [C05, C08]
calculation_ids: [financial.maturity_buckets, financial.liquidity_coverage]
gold_cases: [gc01-analista-ib-camil, gc05-banker-expansao-camil]
dependencies: [build-debt-ledger]
---

# Objetivo
Dizer, com âncora, em que períodos a dívida vence, quanto de cada parede pode ser paga com caixa
e geração operacional e quanto depende de rolagem ou de nova dívida, separando o cronograma
contratual do cronograma em cenário de quebra de covenant.

# Produto
Tabela de vencimentos por período com cobertura de caixa, leitura da concentração e dos picos, e
a lista das fontes de pagamento que a base não prova.

# Quando ativar
- O ledger de dívida está construído e conciliado.
- O trabalho envolve refinanciamento, alongamento, nova dívida ou avaliação de liquidez.

# Quando não ativar
- Não há dívida com vencimento nos próximos cinco anos e o ledger prova isso.

# Inputs mínimos e substitutos
- Cronograma do ledger por período; substituto: cronograma da nota de dívida com a ressalva de que não está por instrumento.
- Caixa, equivalentes e aplicações com prazo de resgate; sem o prazo, a cobertura é marcada como contábil, não operacional.
- Geração operacional dos últimos doze meses ou projeção declarada como cenário.

# Sequência operacional
1. [deterministic] Medir cada parede :: Para cada período, registrar o valor, a participação na dívida bruta e a variação contra o período anterior ; Identificar picos acima da faixa versionada de concentração | tools: financial.maturity_buckets | evidence: ledger de dívida
2. [deterministic] Medir a cobertura :: Comparar cada parede com caixa disponível pela definição usada e com geração operacional ; Declarar a definição de caixa (contábil, resgatável em até 90 dias, D0) ao lado do número | tools: financial.liquidity_coverage | evidence: nota de caixa, fluxo de caixa
3. [deterministic] Separar contratual e cenário :: Registrar o cronograma contratual e, à parte, o que vira dívida à vista em quebra de covenant ; Nunca somar os dois | evidence: escrituras
4. [model_assisted] Redigir o diagnóstico :: Nomear as paredes, o que já tem fonte de pagamento e o que depende de rolagem ; Cada afirmação com número cita a linha

# Cálculos determinísticos
- financial.maturity_buckets: paredes por período e concentração.
- financial.liquidity_coverage: cobertura de cada parede por caixa e por geração, com a definição declarada.

# Julgamentos permitidos
- Chamar um pico de "parede" só quando ultrapassa a faixa versionada de concentração, e dizer qual faixa.

# Perguntas que mudam o trabalho
- Há linhas de crédito aprovadas e não sacadas que contem como fonte de pagamento? Sem contrato, não contam.
- Operações aprovadas em ata foram desembolsadas? Sem prova, não entram no cronograma.

# Red flags
- Dois picos da mesma ordem em anos diferentes, o segundo crescendo entre divulgações.
- Caixa caindo enquanto a dívida bruta sobe no mesmo trimestre.

# Stop conditions
- Ledger sem cronograma conciliado.

# Outputs
- schema_version (string, required): identificador do contrato de resultado, `method.diagnose-maturity-wall.v5`
- reference_date (date, required): data-base
- unit (enum, required): unidade dos valores monetários, igual à unidade em que o ledger reporta a dívida bruta e ancorada na fonte que a declara (uma reescala coerente sob outro rótulo é recusada); participações e coberturas levam a unidade `x`
- state (enum, required): complete, incomplete (sem CFADS declarado, cobertura só de caixa) ou blocked (o diagnóstico para, sem paredes nem cobertura) | values: complete, incomplete, blocked
- block_reasons (array, required): motivos estruturados de bloqueio (cronograma vazio, dívida bruta zero, cronograma que não fecha com a dívida bruta)
- incomplete_reasons (array, required): o que a base não permitiu (geração não declarada em algum período, juros não declarados)
- wall_threshold (object, required): participação limite com chave e versão da política; parede é participação estritamente acima do limiar, comparada nas oito casas em que é escrita
- walls (array, required): períodos com valor, participação sobre a dívida bruta, variação contra a data anterior (só quando a data anterior é mesmo anterior, na mesma unidade e perímetro; caso contrário nula com o motivo em prior_comparability), classificação de parede e âncora do cronograma; vazio quando o ledger está bloqueado, porque o diagnóstico para
- peak (object, required): o período de maior concentração pelo `financial-core`, ou nulo
- coverage (object, required): definição de caixa com âncora, geração de caixa para o serviço da dívida (CFADS, LTM ou projeção declarada, por período; um valor único nunca é repetido pelos anos; EBITDA não serve) com âncora e os períodos declarados, base da cobertura (só principal quando a base não traz juros por período, serviço integral quando traz), cobertura sequencial por período pelo `financial-core`, com o caixa nunca abaixo de zero (caixa esgotado abre o período seguinte em zero e o déficit é carregado à parte) (principal, juros ou nulo com âncora e base do período, serviço, caixa carregado, geração ou nulo com o sinal de declarada, fontes contratadas, cobertura, caixa final, déficit incremental do período, déficit acumulado carregado e a dependência de rolagem em palavras), períodos em aberto marcados como não avaliados, déficit carregado ao fim do horizonte e ressalva sobre a liquidez
- sources (array, required): cada fonte de pagamento citada com id, valor, período (só quando provada; o período reivindicado pelo arquivo fica em claimed_period e não é usado), estado provado ou não provado (provada só com um contrato e uma prova de desembolso datados na base, em dois documentos distintos, cada um da sua classe, desembolso depois da data-base para não contar duas vezes o caixa; uma ata não é contrato; nunca por sinalizador), motivo e as três âncoras com datas (aprovação, contrato, desembolso)
- schedule_adjustments (array, required): linhas do cronograma que não pertencem a período (custos de transação), tipadas como ajuste; conciliam o total e nunca entram na concentração nem na cobertura
- acceleration_scenario (object, required): leitura de aceleração só a partir da cláusula da escritura na base (com o default contratual: declarado salvo deliberação da assembleia, ou só por deliberação) e do saldo acelerável, registrada à parte do cronograma contratual e nunca somada; sem cláusula na base, não afirmada
- uncovered_terms (array, required): geração ausente ou não declarada em períodos, juros ausentes, disponibilidade do caixa não provada e fontes não provadas, com estado `insufficient_evidence` e motivo
- notes (array, required): notas com âncora (a quebra de covenant como evento de vencimento antecipado não automático com o default da cláusula quando ela está na base; cronograma contratual e cenário de aceleração nunca somados)
- trace (object, required): concentração por período, cobertura por período (operandos: caixa inicial, geração, fontes contratadas, principal) com unidade; fingerprints de entrada e saída com o trace dentro

# Exemplos
## Bom
- Camil: paredes de 1.229.828 em 2026/27 e 1.228.475 em 2028/29, a segunda crescendo 342.288 no trimestre; cobertura pelo caixa de 1.430.714 declarada como contábil (resgate em até 90 dias).
## Ruim
- Contar R$ 786 milhões de notas comerciais e CPR aprovados em ata como fonte de pagamento ou como nova parede sem prova de desembolso.

# Testes
## Unit
- concentração e cobertura reproduzem a seção 3 do gabarito do caso 01
## Gold
- gc01-analista-ib-camil: dois picos identificados com a variação contra fevereiro
## Adversarial
- aprovação em ata não vira parede nem fonte; caixa D0 não é assumido a partir de equivalentes
## Aceitação
- reproduzível; definição de caixa declarada; contratual e cenário separados

# Evidência
## Hierarquia
- Ledger de dívida conciliado
- Nota de caixa e equivalentes com prazo de resgate
- Escrituras para vencimento antecipado
## Regras
- Fonte de pagamento sem contrato ou demonstração não conta.
- Cronograma contratual e cronograma em cenário nunca se somam.
