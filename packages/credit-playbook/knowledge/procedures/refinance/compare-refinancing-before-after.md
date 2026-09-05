---
id: compare-refinancing-before-after
version: 2026.09.05-v3
maturity: implemented
title_pt: Comparar antes e depois de cada alternativa de refinanciamento
title_en: Compare before and after for each refinancing alternative
role: credit_structuring
blueprint_stage: 7
owner_role: Head de DCM
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/executors/compare-refinancing-before-after
implementation_export: compareRefinancingBeforeAfter
result_contract: method.compare-refinancing-before-after.v3
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
- O cronograma vem do ledger nos períodos dele, cada um com a data em que termina; o principal novo cai no período que contém a data de cada parcela, e o que passa do último período datado cai no bucket aberto.
- A série retirada sai do período em que vence; se o período não existe ou não comporta o principal, a alternativa bloqueia.
- Participação de cada período sobre a dívida bruta (antes: reportada; depois: pró forma).
- Cobertura de principal por período só com geração de caixa declarada por período; um valor único nunca é repetido pelos anos.
- All-in da dívida nova: cupom mais taxa de estruturação, prêmios de saída e custos pagos com caixa, amortizados pelo prazo; o custo da dívida existente é outra base e nunca é ordenado contra ele.
- Alavancagem só com EBITDA positivo e definição declarada; headroom só com limite resolvido e comparável.
- Cronograma que não soma a dívida bruta (com as linhas de ajuste do ledger) bloqueia a comparação inteira.
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
- schema_version (string, required): method.compare-refinancing-before-after.v3
- reference_date (date, required): data-base do ledger que a comparação usa
- unit (enum, required): unidade declarada e única de todos os valores monetários (BRL, BRL thousand, BRL million, USD, USD thousand)
- state (enum, required): compared quando o cronograma concilia com a dívida bruta; blocked quando não concilia
- block_reasons (array, required): motivos do bloqueio; vazio quando compared
- wall_threshold (object, required): participação, chave e versão da política de parede usada na concentração
- schedule_adjustments (array, required): linhas do cronograma do ledger que não pertencem a período (custos de transação); conciliam o cronograma à dívida bruta e nunca entram na concentração
- before (object, required): posição antes: dívida bruta, caixa livre, dívida líquida, dívida líquida contratual, alavancagem (com definição e base do EBITDA) ou null, headroom só com limite resolvido e comparável, pico com participação sobre a dívida bruta, custo da dívida existente na sua própria base (nunca comparável ao all-in) e âncora de cada operando
- alternatives (array, required): por alternativa: estado (compared ou blocked com motivos), posição depois com os mesmos objetos, custo de saída com as âncoras de cada prêmio, concentração por período do cronograma (existente, proposto, consolidado, participação sobre a dívida bruta depois, parede, cobertura de principal quando a geração por período foi declarada), serviço da nova dívida (pico, juros, prazo médio, all-in com prêmios e custos pagos com caixa) e termos não cobertos carregados como lacuna
- ranking (object, optional): discriminador declarado, racional e ordem; empate é nomeado e ordenado por id, não por mérito; all_in_cost só ordena alternativas com dívida nova
- unsupported (array, required): o que não foi medido e por quê (headroom, alavancagem, cobertura, ranking, alternativas bloqueadas)
- trace (object, required): cálculos (todos do financial-core, com unidade), fingerprint canônico da entrada e da saída

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
