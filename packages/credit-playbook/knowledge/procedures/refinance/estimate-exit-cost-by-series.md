---
id: estimate-exit-cost-by-series
version: 2026.09.05-v3
maturity: implemented
title_pt: Estimar o custo de saída por série
title_en: Estimate the exit cost by series
role: credit_structuring
blueprint_stage: 6
owner_role: Head de DCM
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/executors/estimate-exit-cost-by-series
implementation_export: estimateExitCostBySeries
result_contract: method.estimate-exit-cost-by-series.v3
connected_states: [understanding_in_progress]
persistence_mode: derived_on_demand
persistence_target: method_results
unit_test_files: [packages/credit-playbook/src/executors/estimate-exit-cost-by-series.test.ts]
gold_case_ids: [gc01-analista-ib-camil]
adversarial_case_ids: [adversarial:gc01:make-whole-without-quote-is-insufficient]
e2e_scenario_ids: [pending:case01-frozen-run]
cost_eval_ids: [deterministic:no-model-calls]
house_procedure_ids: [D-26, ES-02, ES-03]
authorities: [LEI, DEF, MERCADO]
legal_review_required: true
reference_data_keys: [policy.structure.covenant_headroom]
task_specs: [S07, S10]
calculation_ids: [structure.debt_service_schedule, financial.weighted_average_life]
gold_cases: [gc01-analista-ib-camil]
dependencies: [build-debt-ledger, reconcile-covenant-definitions]
---

# Objetivo
Para cada série que uma alternativa de refinanciamento pretende retirar, dizer se a saída é
permitida na data, por qual mecanismo (amortização extraordinária, resgate total, oferta de
resgate, aquisição), quanto custa (prêmio flat, make-whole a taxa de referência, prêmio negociado)
e com que cotação da data-base, citando a cláusula.

# Produto
Tabela por série com janela de saída, mecanismo, fórmula do prêmio, taxa de referência e sua fonte
na data-base, custo estimado e o que falta para fechar o número.

# Quando ativar
- Uma alternativa prevê pré-pagar, trocar ou recomprar uma série existente.

# Quando não ativar
- A alternativa só adiciona dívida sem retirar nenhuma; o método registra custo de saída zero com a razão.

# Inputs mínimos e substitutos
- Escritura ou contrato de cada série; substituto: relatório fiduciário só para dizer que a regra não está coberta.
- Cronograma de juros e amortização por série; curvas da data-base (NTN-B pela ANBIMA, Pré x DI da B3).

# Sequência operacional
1. [deterministic] Ler a cláusula de saída :: Para cada série, extrair janela (data a partir da qual é permitido), mecanismo e fórmula do prêmio ; Registrar cláusula e página | evidence: escrituras
2. [deterministic] Montar os fluxos remanescentes :: Fluxos de amortização e remuneração da série até o vencimento a partir do cronograma ; Calcular duration remanescente | tools: structure.debt_service_schedule, financial.weighted_average_life | evidence: cronograma por série
3. [deterministic] Aplicar a fórmula :: Prêmio flat pro rata sobre dias úteis remanescentes; make-whole pelo maior entre valor atualizado e valor presente à taxa de referência da duration mais próxima ; Registrar a cotação usada, sua fonte e data | evidence: curvas ANBIMA e B3
4. [model_assisted] Redigir :: Dizer por série o que é possível, quando e a que custo, e o que continua sem cotação

# Cálculos determinísticos
- structure.exit_premium: prêmio DI igual a [(1 + p)^(DU/252) - 1] vezes a base, truncado em oito casas; oferta negociada igual a base vezes a taxa do edital.
- structure.exit_make_whole: amortização extraordinária IPCA paga o maior entre a base e o valor presente à cotação do segundo dia útil anterior; resgate total IPCA paga o valor presente à cotação do dia útil imediatamente anterior.
- financial.exit_base: nominal atualizado mais remuneração acumulada mais encargos na data de saída, cada um com âncora.
- structure.debt_service_schedule: fluxos remanescentes por série.
- financial.weighted_average_life: duration remanescente para escolher o vértice ou o título de referência.

# Julgamentos permitidos
- Escolher o título NTN-B de duration mais próxima entre dois candidatos: a escritura manda a mais próxima; empate é registrado.

# Perguntas que mudam o trabalho
- A data pretendida de saída cai antes da janela de alguma série? Então a alternativa muda.
- Existe cotação indicativa da data-base para o título de referência no pack?

# Red flags
- Prêmio percentual tratado como flat quando a escritura o define pro rata sobre o prazo remanescente.
- Série IPCA "pré-pagável" antes da data de carência da escritura.

# Stop conditions
- Nenhuma escritura da série no pack e a alternativa depende dela.

# Outputs
- schema_version (string, required): identificador do contrato de resultado, `method.estimate-exit-cost-by-series.v3`
- exit_date (date, required): data da saída avaliada
- unit (string, required): unidade dos valores
- state (enum, required): complete, partial (alguma série sem preço) ou empty (nenhuma série) | values: complete, partial, empty
- exit_costs (array, required): por série: a base do preço (nominal atualizado, remuneração acumulada e encargos na data de saída, cada um com âncora; `insufficient_evidence` quando a base não os traz, nunca zero), cada mecanismo que a escritura oferece na data (amortização extraordinária DI, resgate total DI, amortização extraordinária IPCA, resgate total IPCA, oferta negociada, aquisição facultativa) com permissão na data, janela, estado, prêmio, total a pagar, motivo, cláusula e a cotação usada (taxa, data, título, fonte), e o mecanismo unilateral mais barato
- uncovered_terms (array, required): bases de preço que a base não traz, com estado `insufficient_evidence` e motivo
- totals (object, required): prêmio e total estimados pelos mecanismos unilaterais mais baratos, séries estimadas e séries em aberto
- trace (object, required): cada base e cada prêmio com fórmula, operandos (prêmio anual, dias úteis, vencimento, base; cotação e data) e resultado, com unidade; fingerprints de entrada e saída com o trace dentro

# Exemplos
## Bom
- Camil: séries DI da 13ª e da 14ª a partir de maio e junho de 2026 com prêmio de 0,40% ao ano sobre os dias úteis remanescentes; séries IPCA só de 2027 e 2028 por make-whole à TIR da NTN-B; prefixada da 15ª pelo maior entre atualizado e valor presente à curva Pré x DI; 11ª por oferta com prêmio negociado: a base (nominal mais remuneração pro rata e encargos) é precificada pela escritura e o prêmio e a adesão ficam como incógnitas declaradas, nunca como preço inteiro desconhecido.
## Ruim
- Assumir que a 13ª 2ª série pode ser pré-paga em 2026; aplicar 0,40% flat.

# Testes
## Unit
- dias úteis conferidos contra os dias de semana entre a data de saída e o vencimento (uma contagem que não cabe é recusada); cotação anterior à data de saída; valores datados na data de saída; prêmio negociado nunca negativo; mecanismo listado duas vezes e séries duplicadas recusados; nenhuma série devolve zero com razão; fingerprints iguais sob vinte permutações de séries, mecanismos e ordem de chaves
- prêmio pro rata e make-whole reproduzem valores calculados à mão sobre um fluxo de teste
## Gold
- gc01-analista-ib-camil: seção 13.2 do gabarito reproduzida por família
## Adversarial
- série sem escritura fica bloqueada; data antes da janela é recusada
## Aceitação
- toda regra com cláusula; toda cotação com fonte e data

# Evidência
## Hierarquia
- Escritura e aditamentos
- Cronograma por série do ledger
- Curvas de referência com fonte e data
## Regras
- Sem cláusula, não há custo de saída afirmável.
- Cotação sem fonte e data não entra.
