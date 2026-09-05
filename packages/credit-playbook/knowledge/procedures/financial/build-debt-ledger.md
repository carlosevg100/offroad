---
id: build-debt-ledger
version: 2026.09.05-v1
maturity: implemented
title_pt: Construir o ledger de dívida
title_en: Build the debt ledger
role: financial_analysis
blueprint_stage: 4
owner_role: Head de Análise Financeira
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/executors/build-debt-ledger
implementation_export: buildDebtLedger
result_contract: method.build-debt-ledger.v2
connected_states: [understanding_in_progress]
persistence_mode: derived_on_demand
persistence_target: method_results
unit_test_files: [packages/credit-playbook/src/executors/build-debt-ledger.test.ts]
gold_case_ids: [gc01-analista-ib-camil]
adversarial_case_ids: [adversarial:gc01:scale-mutation-blocks-ledger]
e2e_scenario_ids: [pending:case01-frozen-run]
cost_eval_ids: [deterministic:no-model-calls]
house_procedure_ids: [D-01, D-03, D-24]
authorities: [DEF, CASA]
reference_data_keys: [policy.debt.views]
task_specs: [C05]
calculation_ids: [financial.debt_views, financial.maturity_buckets, financial.indexed_debt_schedule]
gold_cases: [gc01-analista-ib-camil]
---

# Objetivo
Registrar toda obrigação onerosa da companhia, instrumento a instrumento, com saldo, moeda,
indexador, spread, cronograma, garantia, credor e âncora, e conciliar esse registro com o balanço
e com as notas, de modo que qualquer número de dívida usado depois aponte para uma linha do
ledger e não para uma leitura solta.

# Produto
Ledger de dívida versionado com duas visões conciliadas (contábil reportada e contratual para
covenant), cronograma por período, mapa de indexadores e a lista explícita do que a base não
sustenta.

# Quando ativar
- Existe ao menos uma demonstração financeira com nota de empréstimos, financiamentos ou debêntures.
- O trabalho vai usar alavancagem, cobertura, vencimentos, custo de saída ou comparação de alternativas.

# Quando não ativar
- A companhia não tem dívida onerosa e o balanço prova isso; o produto vira uma linha dizendo que o ledger é vazio, com âncora.
- Só existe um release sem notas: o ledger nasce marcado como incompleto e não recebe números que a nota não confirma.

# Inputs mínimos e substitutos
- Nota de empréstimos, financiamentos e debêntures da demonstração mais recente; substituto aceitável: DFP anterior mais movimentação do trimestre, com a diferença declarada.
- Balanço patrimonial do mesmo período, para a conciliação de circulante e não circulante.
- Escrituras, contratos ou relatórios de agente fiduciário para indexador, spread, garantia e regras por série; sem eles, essas colunas ficam `insufficient_evidence`.

# Sequência operacional
1. [deterministic] Inventariar instrumentos :: Listar cada instrumento e série da nota com saldo por período, moeda e classificação de prazo ; Registrar página e nota de cada linha | evidence: nota de dívida, balanço
2. [deterministic] Conciliar com o balanço :: Somar circulante e não circulante do ledger e comparar com as rubricas do balanço ; Diferença acima da tolerância versionada bloqueia o ledger e vira lacuna nomeada | tools: financial.debt_views | evidence: balanço
3. [deterministic] Montar o cronograma :: Alocar cada saldo nos períodos do cronograma da nota, em ano civil e em ano safra quando a companhia usa exercício deslocado ; Conferir que a soma dos períodos é o total da nota | tools: financial.maturity_buckets | evidence: nota de dívida
4. [deterministic] Completar termos por série :: Preencher indexador, spread, vencimento, garantia e credor a partir de escrituras e relatórios fiduciários, com a âncora dos termos separada da âncora do saldo ; Deixar `insufficient_evidence`, campo a campo e com o motivo, o que nenhuma fonte do pack sustenta; moeda não é indexador ; Regras e custo de saída ficam com o método estimate-exit-cost-by-series | evidence: escrituras, relatórios de agente fiduciário
5. [deterministic] Fechar as visões de dívida líquida :: Recalcular a visão do release e a visão contratual com as definições literais, cada uma com a fonte da definição e a âncora de cada componente ; Registrar o valor reportado pelo release à parte, com a diferença para o recalculado ; Nunca misturar as visões | tools: financial.debt_views | evidence: escritura, release, nota de dívida
6. [model_assisted] Redigir a leitura :: Descrever concentração por período, por moeda e por indexador a partir das linhas do ledger ; Toda frase com número cita a linha e a âncora

# Cálculos determinísticos
- financial.debt_views: visões reportada e contratual, com a definição literal registrada ao lado do resultado.
- financial.maturity_buckets: soma por período e verificação de igualdade com o total da nota.
- financial.indexed_debt_schedule: estoque por indexador e por moeda.

# Julgamentos permitidos
- Decidir se uma diferença de conciliação abaixo da tolerância é arredondamento ou omissão exige olhar a nota de novo, não uma média.
- Classificar uma obrigação fora da linha de dívida (risco sacado, arrendamento) segue D-06 e D-24; o ledger só a inclui com a visão declarada.

# Perguntas que mudam o trabalho
- Existe escritura ou contrato de cada instrumento no pack? Sem eles, custo de saída e covenant por instrumento não se concluem.
- A companhia usa exercício social deslocado? Muda o cronograma e a data de medição de covenant.

# Red flags
- Captação e amortização de principal no mesmo trimestre da ordem de grandeza da dívida de curto prazo: passivo em movimento, não posição estática.
- Duas dívidas líquidas com o mesmo nome e definições diferentes na mesma divulgação.
- Cronograma da nota que não soma o total, ou circulante da nota diferente do balanço.

# Stop conditions
- Conciliação com o balanço fora da tolerância sem explicação encontrada na nota.
- Nota de dívida ausente no período mais recente disponível.

# Outputs
- ledger_rows (array, required): linhas por instrumento e série com saldo, moeda, indexador, spread, vencimento, garantia, credor, âncora do saldo e âncora dos termos
- schedule (object, required): cronograma por período com a soma conferida contra o total da nota
- net_debt_views (object, required): visão do release recalculada, visão contratual e valor reportado pelo release, com definição, fonte da definição e âncora por componente
- uncovered_terms (array, required): por linha e campo, estado `insufficient_evidence` e o motivo
- state (enum, required): complete, blocked, empty ou incomplete | values: complete, blocked, empty, incomplete

# Exemplos
## Bom
- Camil 31/05/2026: 5.670.186 de dívida bruta conciliados com o balanço; 4.228.477 de dívida líquida contratual pela definição da escritura (nota 15, p. 40; derivativos na nota 25, p. 51); 4.214.377 recalculados pela definição do release contra 4.214,4 milhões reportados (release, p. 11); seis séries IPCA somando 743.955; os quatro empréstimos com indexador `insufficient_evidence`, porque o ITR prova a moeda e não a remuneração.
## Ruim
- Usar 4.214,4 do release para o covenant; somar arrendamento à dívida bruta sem dizer; alocar operações aprovadas em ata no cronograma sem prova de desembolso.

# Testes
## Unit
- soma do cronograma igual ao total da nota; visões contratual e do release recalculadas reproduzem os valores do gabarito do caso 01; participações por indexador e por moeda somam um sobre a dívida bruta antes dos custos
## Gold
- gc01-analista-ib-camil: ledger reproduz a seção 1, o cronograma da seção 3 e as visões de dívida líquida da seção 5 do gabarito, com âncora de saldo e de termos por linha; headroom e covenant ficam com reconcile-covenant-definitions
## Adversarial
- escala trocada (milhares por milhões) é detectada pela conciliação com o balanço; release sem nota não gera linhas; ledger vazio só com evidência de ausência de dívida; linha sem âncora de saldo é recusada; tolerância negativa é recusada; moeda de empréstimo não vira indexador
## Aceitação
- resultado reproduzível sob permutação de linhas e períodos, com fingerprints de entrada e saída iguais; toda linha com âncora; lacunas nomeadas campo a campo em vez de zeros

# Evidência
## Hierarquia
- Escritura, contrato ou relatório de agente fiduciário para termos por série
- Demonstração auditada ou revisada e suas notas para saldos e cronograma
- Release e apresentação só para a visão do release, nomeada como tal
## Regras
- Conflito entre fontes não é média: registrar as duas com a diferença.
- Ausência não é zero: vira `insufficient_evidence` com o motivo.
