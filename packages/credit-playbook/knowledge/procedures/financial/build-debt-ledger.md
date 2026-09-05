---
id: build-debt-ledger
version: 2026.09.05-v11
maturity: implemented
title_pt: Construir o ledger de dívida
title_en: Build the debt ledger
role: financial_analysis
blueprint_stage: 4
owner_role: Head de Análise Financeira
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/executors/build-debt-ledger
implementation_export: buildDebtLedger
result_contract: method.build-debt-ledger.v11
connected_states: [understanding_in_progress]
persistence_mode: derived_on_demand
persistence_target: method_results
unit_test_files: [packages/credit-playbook/src/executors/build-debt-ledger.test.ts]
gold_case_ids: [gc01-analista-ib-camil]
adversarial_case_ids: [adversarial:gc01:scale-mutation-blocks-ledger, adversarial:gc01:compensating-split-swap-blocks-ledger, adversarial:gc01:definition-text-contradicts-formula, adversarial:gc01:current-period-by-end-date-not-label, adversarial:gc01:row-split-must-add-up, adversarial:gc01:contractual-only-row-out-of-balance-identity, adversarial:gc01:definition-polarity-swapped]
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
- A companhia não tem dívida onerosa e o balanço prova isso (saldo zero no balanço, com âncora); sem o balanço, a evidência de ausência de dívida não basta e o ledger bloqueia.
- Só existe um release sem notas: o ledger bloqueia com motivo estruturado e não recebe números que a nota não confirma; um release não é ledger.

# Inputs mínimos e substitutos
- Nota de empréstimos, financiamentos e debêntures da demonstração mais recente; substituto aceitável: DFP anterior mais movimentação do trimestre, com a diferença declarada.
- Balanço patrimonial do mesmo período, para a conciliação de circulante e não circulante.
- Escrituras, contratos ou relatórios de agente fiduciário para indexador, spread, garantia e regras por série; sem eles, essas colunas ficam `insufficient_evidence`.

# Sequência operacional
1. [deterministic] Inventariar instrumentos :: Listar cada instrumento e série da nota com saldo por período, moeda e classificação de prazo ; Registrar página e nota de cada linha | evidence: nota de dívida, balanço
2. [deterministic] Conciliar com o balanço :: Comparar o total reportado do ledger (linhas da visão do release e linhas contra; uma linha que só a escritura inclui, como arrendamento, fica fora da identidade e é listada à parte) com circulante mais não circulante do balanço e, quando cada linha traz a sua classificação de prazo, conciliar circulante e não circulante separadamente, porque uma troca compensatória entre os dois não é conciliação; a classificação de cada linha tem de somar o seu saldo, com partes não negativas nas obrigações e não positivas nas linhas contra, e saldo anterior com a mesma polaridade, senão a linha é recusada ; Diferença acima da tolerância bloqueia o ledger e vira lacuna nomeada; tolerância acima de zero só existe sob política versionada (chave e versão registradas no resultado) | tools: financial.debt_views | evidence: balanço
3. [deterministic] Montar o cronograma :: Alocar cada saldo nos períodos do cronograma da nota, em ano civil e em ano safra quando a companhia usa exercício deslocado ; Conferir que a soma dos períodos é o total reportado da nota e que o primeiro período (o que termina dentro de doze meses da data-base, pela data de fim declarada, nunca por rótulo; um período terminado na data-base ou antes dela bloqueia) é igual ao circulante do balanço, para que um erro compensatório entre períodos não passe pela soma; sem datas de fim, a conferência fica em aberto | tools: financial.maturity_buckets | evidence: nota de dívida, balanço
4. [deterministic] Completar termos por série :: Preencher indexador, spread, vencimento, garantia e credor a partir de escrituras e relatórios fiduciários, com a âncora dos termos separada da âncora do saldo e uma âncora por página de série ; O credor tem dois fatos com âncoras próprias: o titular formal (preâmbulo da escritura) e os credores econômicos (a cláusula da escritura que manda a securitizadora deliberar conforme a assembleia de titulares de CRA, ou o termo de securitização; um relatório fiduciário prova o lastro, não a orientação); a garantia da controladora sobre as dívidas das controladas no exterior, declarada no ITR, é garantia com fonte, sem individualização por contrato; cada fato ausente vira lacuna própria ; Deixar `insufficient_evidence`, campo a campo e com o motivo, o que nenhuma fonte do pack sustenta; moeda não é indexador ; Linha contra (custos de transação) não é obrigação e não carrega natureza de obrigação ; Qualquer linha que só a visão contratual carregue (arrendamento ou outra) entra com a âncora da inclusão ; Regras e custo de saída ficam com o método estimate-exit-cost-by-series | evidence: escrituras, termos de securitização, relatórios de agente fiduciário
5. [deterministic] Fechar as visões de dívida líquida :: Recalcular a visão do release e a visão contratual com as definições literais, cada uma com a fonte da definição e a âncora de cada componente; um componente de caixa ausente da base deixa a visão que dele depende sem cálculo, com o motivo em `incomplete_reasons`, nunca em erro ; Conferir que o texto da definição concorda com a fórmula executada, separando o que o texto soma do que ele deduz (antes e depois de `menos`): o que se soma tem dívida, o que se deduz tem caixa, a do release não cita derivativos, a contratual soma derivativos passivos e deduz derivativos ativos; a definição contratual é o texto literal da escritura, com âncora na escritura; a definição do release, quando o release não traz prosa, é a estrutura da sua tabela com linhas rotuladas (dívida bruta, menos caixa e aplicações, dívida líquida), declarada como tal; a validação confere operando a operando e lado a lado (a base inteira da dívida somada: empréstimos e financiamentos e debêntures, os três, ou dívida bruta; caixa e aplicações deduzidos; derivativos passivos somados e ativos deduzidos na contratual; nenhum operando no lado errado; nenhum componente estranho à dívida ou ao caixa, como fornecedores ou estoques; nenhum operando de dívida deduzido, como dívida subordinada); a pertença das linhas às visões é conferida contra o texto: uma definição que conta empréstimos, financiamentos e debêntures conta todas essas linhas, e uma linha excluída da visão bloqueia; um texto que contradiz a fórmula bloqueia a visão, com ou sem os componentes de caixa na base, e um texto com `qualquer outra dívida onerosa` marca o residual assumido zero ; Registrar o valor reportado pelo release à parte, com a diferença para o recalculado ; Nunca misturar as visões | tools: financial.debt_views | evidence: escritura, release, nota de dívida
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
- schema_version (string, required): identificador do contrato de resultado, `method.build-debt-ledger.v11`
- reference_date (date, required): data-base do ledger
- prior_date (date, optional): data-base anterior; ausente quando a base não a traz
- unit (string, required): unidade de todos os valores, presente em cada cálculo do trace
- unit_anchor (object, required): onde a demonstração declara a unidade (em milhares de reais); unidade sem declaração é rótulo
- source (enum, required): note ou release_only | values: note, release_only
- block_reasons (array, required): motivos estruturados de bloqueio
- incomplete_reasons (array, required): saídas obrigatórias que a base não permitiu produzir, com o motivo
- ledger_rows (array, required): linhas por instrumento e série com saldo na data-base e na anterior, moeda, natureza da obrigação (só desembolsadas; ausente nas linhas contra) e visões a que pertence, remuneração tipada (spread sobre índice, percentual do índice ou prefixada), vencimento, garantia, titular formal e credores econômicos com uma âncora cada, classificação de prazo quando a fonte a dá, âncora do saldo e uma âncora por termo
- gross_debt (decimal_string, required): soma de todas as linhas, inclusive as que só a visão contratual carrega
- gross_debt_reported (decimal_string, required): soma das linhas que as demonstrações reportam como dívida (visão do release e linhas contra); é o que concilia com o balanço
- gross_debt_prior (decimal_string, optional): total na data anterior; ausente quando alguma linha não tem saldo anterior
- gross_debt_before_contra (decimal_string, required): total antes das linhas contra, denominador das participações
- contractual_only_inclusions (array, required): linhas que só a definição contratual inclui (arrendamento por cláusula), com a âncora da inclusão
- reconciliation (object, required): total contra o balanço e, quando possível, circulante e não circulante separadamente, com tolerância (valor, chave e versão da política) e âncora do balanço
- schedule (object, required): cronograma por período com a soma conferida contra o total da nota e o primeiro período conferido contra o circulante do balanço
- net_debt_views (object, required): visão do release e visão contratual, cada uma calculada só quando a definição literal e a sua fonte estão na base, com fórmula, operandos, âncora por componente e linhas incluídas; valor reportado pelo release à parte com a diferença
- by_indexer (array, required): saldo e participação por indexador, com dois denominadores nomeados: a dívida bruta antes dos custos de transação e a dívida bruta reportada da nota (linhas da visão do release e linhas contra; as inclusões só contratuais ficam fora dela; é a que dá os 13,1% de IPCA e 19,4% em moeda estrangeira do gabarito)
- by_currency (array, required): saldo e participação por moeda
- uncovered_terms (array, required): por linha e campo, estado `insufficient_evidence` e o motivo
- trace (object, required): cálculos executados (id, fórmula, operandos, resultado, unidade) e fingerprints de entrada e saída
- state (enum, required): complete só com conciliação, cronograma conferido e as duas visões; incomplete quando falta saída obrigatória, com o motivo; blocked em diferença de conciliação (total, por prazo ou do primeiro período), definição que contradiz a fórmula, release sem nota, silêncio documental ou contradição; empty só com evidência de ausência de dívida | values: complete, blocked, empty, incomplete

# Exemplos
## Bom
- Camil 31/05/2026: 5.670.186 de dívida bruta (4.988.383 em 28/02/2026) conciliados com o balanço da página 12, primeiro período do cronograma (1.229.828) igual ao circulante; 4.228.477 de dívida líquida contratual pela definição da nota 15 (p. 40), com derivativos ancorados na nota 25 (p. 51) e aplicações no balanço (p. 11), residual `outra dívida onerosa` assumido zero de forma declarada; 4.214.377 pela definição do release contra 4.214,4 milhões reportados (release, p. 12); seis séries IPCA somando 743.955; remuneração tipada (CDI + 0,65%, 104% do DI, prefixada 14,15%); Eco Securitizadora como titular formal das 13ª, 14ª e 15ª (preâmbulo das escrituras) com os titulares dos CRA como credores econômicos (termo de securitização da 292ª, cláusula 17.8.8; escrituras da 14ª e da 15ª, cláusula 7.26.5), páginas de série 2 a 5 nos relatórios fiduciários, vencimento da 11ª na página 1 e remuneração na 2; empréstimos em moeda estrangeira com a garantia da controladora (ITR p. 40, nota 15) e o empréstimo em reais sem fonte de garantia; definição contratual literal da escritura da 13ª (p. 7); os quatro empréstimos com remuneração, vencimento, garantia e titular `insufficient_evidence`, porque o ITR prova a moeda e não os termos.
## Ruim
- Usar 4.214,4 do release para o covenant; somar arrendamento à dívida bruta sem dizer; alocar operações aprovadas em ata no cronograma sem prova de desembolso.

# Testes
## Unit
- soma do cronograma igual ao total da nota e primeiro período igual ao circulante; visões contratual e do release recalculadas reproduzem os valores do gabarito do caso 01; participações por indexador e por moeda somam um sobre a dívida bruta antes dos custos; trace com os operandos de cada linha no total, de cada grupo e da diferença para o release
## Gold
- gc01-analista-ib-camil: ledger reproduz a seção 1, o cronograma da seção 3 e as visões de dívida líquida da seção 5 do gabarito, com âncora de saldo e de termos por linha; headroom e covenant ficam com reconcile-covenant-definitions
## Adversarial
- escala trocada (milhares por milhões) é detectada pela conciliação com o balanço, que tem âncora própria na página do balanço e não na nota; troca compensatória entre circulante e não circulante bloqueia quando as linhas trazem a classificação; erro compensatório entre o primeiro período e um posterior bloqueia pela conferência com o circulante; definição cujo texto contradiz a fórmula bloqueia a visão; release sem nota bloqueia sem linhas; silêncio documental bloqueia; evidência de ausência de dívida ao lado de linhas bloqueia; ledger vazio só existe com evidência (em teste, sintética e rotulada), contradita pelo balanço quando ele não é zero; termo sem âncora, fato de credor sem âncora, obrigação em linha contra, linha não desembolsada, arrendamento na visão contratual sem âncora de inclusão, string vazia, linha contra positiva, id duplicado, tolerância negativa e tolerância sem política são recusados; moeda de empréstimo não vira indexador
## Aceitação
- resultado reproduzível sob permutação de linhas e períodos, com fingerprints de entrada e saída iguais e ordenação por código de caractere; toda linha com âncora por termo; lacunas nomeadas campo a campo em vez de zeros; trace com fórmula e operandos de cada cálculo

# Evidência
## Hierarquia
- Escritura, contrato ou relatório de agente fiduciário para termos por série
- Demonstração auditada ou revisada e suas notas para saldos e cronograma
- Release e apresentação só para a visão do release, nomeada como tal
## Regras
- Conflito entre fontes não é média: registrar as duas com a diferença.
- Ausência não é zero: vira `insufficient_evidence` com o motivo.
