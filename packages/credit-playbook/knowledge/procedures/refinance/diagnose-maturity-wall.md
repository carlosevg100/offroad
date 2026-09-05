---
id: diagnose-maturity-wall
version: 2026.09.05-v1
maturity: candidate
title_pt: Diagnosticar a parede de vencimentos
title_en: Diagnose the maturity wall
role: financial_analysis
blueprint_stage: 5
owner_role: Head de DCM
effective_date: 2026-09-05
house_procedure_ids: [D-03, D-05, D-28]
authorities: [CASA, MERCADO]
reference_data_keys: [policy.seasonality.materiality]
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
- walls (array, required): períodos com valor, participação, variação e classificação de concentração
- coverage (object, required): cobertura por período com a definição de caixa e a fonte de geração
- unproven_sources (array, required): fontes de pagamento citadas sem prova (linhas, aprovações, desembolsos)

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
