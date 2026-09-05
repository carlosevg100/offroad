---
id: compare-refinancing-before-after
version: 2026.09.05-v2
maturity: implemented
title_pt: Comparar antes e depois de cada alternativa de refinanciamento
title_en: Compare before and after for each refinancing alternative
role: credit_structuring
blueprint_stage: 7
owner_role: Head de DCM
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/executors/compare-refinancing-before-after
implementation_export: compareRefinancingBeforeAfter
result_contract: method.compare-refinancing-before-after.v2
connected_states: [understanding_in_progress]
persistence_mode: derived_on_demand
persistence_target: method_results
unit_test_files: [packages/credit-playbook/src/executors/compare-refinancing-before-after.test.ts]
gold_case_ids: [gc01-analista-ib-camil]
adversarial_case_ids: [adversarial:gc01:unpriced-exit-blocks-alternative]
e2e_scenario_ids: [pending:case01-frozen-run]
cost_eval_ids: [deterministic:no-model-calls]
house_procedure_ids: [ES-10, ES-40, ES-45, PR-01]
authorities: [CASA, MERCADO]
reference_data_keys: [policy.structure.covenant_headroom, policy.capacity.minimum_headroom]
task_specs: [S05, S10, S11]
calculation_ids: [operation.pro_forma_position, structure.maturity_concentration, structure.covenant_headroom, structure.coverage_series, financial.all_in_cost]
gold_cases: [gc01-analista-ib-camil, gc05-banker-expansao-camil]
dependencies: [build-debt-ledger, diagnose-maturity-wall, estimate-exit-cost-by-series, declare-scenarios]
---

# Objetivo
Para cada alternativa, mostrar a posição antes e depois com os mesmos objetos: cronograma, custo
all-in, alavancagem pela definição contratual, headroom de covenant, cobertura por período e
concentração de vencimentos, incluindo o custo de saída, para que a comparação seja entre
estruturas e não entre narrativas.

# Produto
Tabela antes e depois por alternativa, ranking com o discriminador declarado, motivos de inclusão
e descarte de cada alternativa, e a lista do que a base não sustenta.

# Quando ativar
- Existem ao menos duas alternativas desenhadas ou o status quo e uma alternativa.

# Quando não ativar
- Nenhuma alternativa foi desenhada; o método não inventa uma.

# Inputs mínimos e substitutos
- Ledger, parede de vencimentos, custo de saída por série, cenários declarados.
- Termos indicativos de cada alternativa com origem (mercado, precedente, faixa do usuário).

# Sequência operacional
1. [deterministic] Fixar o antes :: Posição atual com cronograma, custo, alavancagem contratual, headroom, cobertura e concentração | tools: structure.covenant_headroom, structure.coverage_series, structure.maturity_concentration | evidence: ledger, cronograma
2. [deterministic] Construir o depois de cada alternativa :: Retirar as séries pré-pagas com o custo de saída, adicionar a nova dívida com os termos indicativos, recalcular os mesmos objetos ; Custo all-in inclui prêmio de saída e despesas | tools: operation.pro_forma_position, financial.all_in_cost | evidence: alternativas, custo de saída
3. [deterministic] Ranquear :: Ordenar pelo discriminador declarado (headroom, custo, concentração ou combinação versionada) ; Registrar motivos de inclusão e descarte | evidence: política de ranking
4. [model_assisted] Redigir :: Dizer o que cada alternativa muda, o que custa e o que a derruba, com os números da tabela

# Cálculos determinísticos
- operation.pro_forma_position: posição pro forma por alternativa.
- structure.maturity_concentration: concentração antes e depois.
- structure.covenant_headroom: headroom pela definição contratual e limite aplicável.
- structure.coverage_series: cobertura por período.
- financial.all_in_cost: custo all-in com prêmio de saída.

# Julgamentos permitidos
- Escolher o discriminador de ranking quando a política não fixa um: escrever qual e por quê.

# Perguntas que mudam o trabalho
- A companhia aceita alongar com troca de indexador? Muda o universo.
- Há limite de alavancagem interno abaixo do contratual? Muda o headroom relevante.

# Red flags
- Alternativa que melhora o custo e piora a concentração sem dizer.
- Depois calculado sem o custo de saída.

# Stop conditions
- Custo de saída indisponível para uma série que a alternativa retira.

# Outputs
- before_after (array, required): por alternativa, os mesmos objetos antes e depois
- ranking (array, required): ordem, discriminador, motivos de inclusão e descarte
- unsupported (array, required): o que a base não sustenta por alternativa

# Exemplos
## Bom
- Camil: alongar o degrau de 2028/29 retirando as séries DI (saída barata) e mantendo as IPCA (carência até 2027 e 2028), com headroom contra 4,00x e concentração recalculados; custo all-in inclui o prêmio de 0,40% ao ano.
## Ruim
- Comparar "custo médio" antes e depois sem cronograma; ranquear sem discriminador.

# Testes
## Unit
- antes e depois usam os mesmos objetos; custo de saída entra no all-in
## Gold
- gc01-analista-ib-camil: alternativas da devolutiva com tabela antes e depois
## Adversarial
- alternativa que retira série sem custo de saída é bloqueada; ranking sem discriminador é recusado
## Aceitação
- reproduzível; motivos de inclusão e descarte presentes

# Evidência
## Hierarquia
- Ledger e cronograma conciliados
- Escrituras para custo de saída e covenant
- Termos indicativos com origem
## Regras
- Comparação só entre os mesmos objetos.
- Ranking sem discriminador declarado não é ranking.
