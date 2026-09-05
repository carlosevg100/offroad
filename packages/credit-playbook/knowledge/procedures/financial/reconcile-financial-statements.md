---
id: reconcile-financial-statements
version: 2026.09.05-v6
maturity: implemented
title_pt: Conciliar as demonstrações entre si e com o release
title_en: Reconcile the financial statements with each other and with the release
role: financial_analysis
blueprint_stage: 4
owner_role: Head de Análise Financeira
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/executors/reconcile-financial-statements
implementation_export: reconcileFinancialStatements
result_contract: method.reconcile-financial-statements.v6
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
- Tolerância versionada de conciliação por demonstração e escala (chave e versão da política no resultado); sem ela, usa-se tolerância zero e a diferença vira divergência aberta.

# Sequência operacional
1. [deterministic] Montar identidades :: Ativo igual a passivo mais patrimônio; caixa inicial mais variação igual a caixa final; dívida inicial mais movimentação igual a dívida final ; Registrar cada identidade com as âncoras | tools: financial.accounting_identity, financial.debt_balance_bridge | evidence: balanço, fluxo de caixa, nota de dívida
2. [deterministic] Confrontar fontes da mesma conta :: Para cada conta material com duas ou mais fontes, decidir primeiro a comparabilidade pelos componentes que cada fonte conta e pela data (nome igual não é definição igual; a dívida líquida do release e a contratual não se comparam); só então calcular a diferença e classificá-la pela tolerância; uma explicação vai de uma fonte a outra com sinal preservado; conta de fonte única fica registrada, nunca comparada ; Diferença acima da tolerância sem explicação na nota vira divergência aberta com as duas âncoras | evidence: notas, release
3. [deterministic] Conciliar juros :: Confrontar a despesa de juros do resultado com a movimentação de juros da nota de dívida ; Diferença é registrada, não distribuída | tools: financial.interest_expense_bridge | evidence: nota de dívida, resultado
4. [model_assisted] Redigir o mapa :: Listar o que fecha, o que difere com explicação e o que fica aberto ; Nunca escrever "aproximadamente" para esconder uma diferença

# Cálculos determinísticos
- financial.accounting_identity: identidades contábeis com resultado por identidade.
- financial.debt_balance_bridge: saldo inicial, captações, juros, amortizações, variação cambial, saldo final.
- financial.interest_expense_bridge: juros calculados versus contabilizados.

# Regras de comparabilidade
- Tags de componente vêm de um catálogo conhecido e o texto da definição precisa nomear cada uma; tag desconhecida é recusada.
- Metadados de política (chave e versão) são conferidos mesmo com tolerância zero; nunca entram na saída sem existir no registro.
- Dentro de uma conta não comparável no todo, fontes com a mesma definição, componentes e data são comparadas entre si; a divergência entre dois valores contábeis nunca some atrás de um nominal ou de um valor justo.

# Escala, sinal e âncoras
- Valor publicado em outra escala (release em R$ milhões com uma casa) entra com o valor, a unidade e as casas publicadas; o executor converte, registra a meia banda de arredondamento e um par cuja diferença cabe nela fecha "dentro do arredondamento publicado", nunca "exatamente".
- Sinal publicado (despesa entre parênteses) é declarado como leitura literal ou de magnitude; a normalização fica no trace.
- Cada linha da ponte de dívida, a abertura e o fechamento carregam âncora própria; derivações (nominal remanescente, valor contábil, dívida líquida contratual) entram com operandos ancorados e são recalculadas.

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
- state (enum, required): closes, differences_explained, open_divergences, incomplete, identity_failed ou blocked, nesta precedência inversa: bloqueio antes de identidade falha, antes de incompleto, antes de divergências abertas, antes de diferenças explicadas, antes de fecha | values: closes, differences_explained, open_divergences, incomplete, identity_failed, blocked
- schema_version (string, required): identificador do contrato de resultado, `method.reconcile-financial-statements.v6`
- reference_date (date, required): data-base
- unit (string, required): unidade de todos os valores, presente em cada cálculo do trace
- block_reasons (array, required): motivos estruturados de bloqueio (base vazia)
- incomplete_reasons (array, required): identidades ou pontes que a base não permitiu testar
- reconciliations (array, required): por conta, valores por fonte (definição, componentes, data, âncora), comparabilidade decidida pela chave de definição (com a âncora de onde a definição está), pelos componentes (que o texto da definição tem de nomear) e pela data, nunca desfeita por uma explicação, diferença, tolerância (valor, chave e versão da política; o valor tem de ser o que a política registrada declara para a família e a unidade, na versão corrente), estado (closes, explained, open, not_comparable, single_source), explicações direcionais (de uma fonte a outra, com sinal, esperado, real, resíduo e se fecha) e os grupos de fontes ligados por explicações que fecham: uma conta com n fontes só fica explicada quando há um único grupo; com mais de um, nenhuma fonte fica escondida e todas constam da divergência aberta; dentro de uma conta não comparável no todo, as fontes que compartilham definição, componentes e data são comparadas entre si (comparable_subsets), e um subconjunto aberto vira divergência própria
- open_divergences (array, required): divergências abertas com as duas âncoras e o motivo
- identities (array, required): identidades testadas pelo `financial-core` com estado (holds, fails, not_comparable) e uma âncora por operando: balanço (ativo, passivo e patrimônio), ponte de dívida, ponte de caixa (abertura, variação da demonstração de fluxos de caixa, fechamento) e ponte de juros, que só se compara quando as duas rubricas contam os mesmos componentes (juros e variações monetárias da nota contra juros do resultado não se comparam; a diferença fica registrada); uma ponte comparável que falha derruba o estado global
- uncovered_terms (array, required): contas de fonte única, cada ponte ou identidade ausente da base (também numa base vazia) e a ponte de juros não comparável, com estado `insufficient_evidence` e motivo
- trace (object, required): cálculos executados pelo `financial-core` (diferenças entre fontes, explicações, identidades, pontes e derivações declaradas de valores recalculados, com operandos ancorados) e fingerprints de entrada e saída com o trace dentro; cada cálculo carrega as âncoras dos seus operandos

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
- valor alterado em uma fonte é detectado pela conciliação; escala trocada é detectada pela identidade; dívida do release rotulada como contratual, fontes em datas diferentes e trimestre anualizado contra doze meses são `not_comparable`; explicação com sentido trocado deixa resíduo; duplicatas, explicação para fonte inexistente, tolerância sem política e unidade fora do catálogo são recusadas; base vazia bloqueia; sem balanço a conciliação fica `incomplete`
## Aceitação
- nenhuma diferença escondida; divergências com duas âncoras; ponte de juros entre a movimentação da nota e a despesa do resultado registrada com a diferença; fingerprints iguais sob vinte permutações de contas, fontes, linhas, componentes, chaves de tolerância e ordem de chaves, com o trace dentro do fingerprint

# Evidência
## Hierarquia
- Demonstração auditada ou revisada e notas
- Release e apresentação, nomeados como visão do release
## Regras
- Duas fontes que discordam ficam registradas como divergência; não se escolhe uma em silêncio.
- Tolerância só entra quando versionada.
