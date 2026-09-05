---
id: build-debt-ledger
version: 2026.09.05-v1
maturity: candidate
title_pt: Construir o ledger de dívida
title_en: Build the debt ledger
role: financial_analysis
blueprint_stage: 4
owner_role: Head de Análise Financeira
effective_date: 2026-09-05
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
4. [deterministic] Completar termos por série :: Preencher indexador, spread, vencimento, garantia e regras de saída a partir de escrituras e relatórios fiduciários ; Deixar `insufficient_evidence` o que nenhuma fonte do pack sustenta | evidence: escrituras, relatórios de agente fiduciário
5. [deterministic] Fechar as visões de dívida líquida :: Calcular a visão reportada do release e a visão contratual do covenant com as definições literais ; Nomear cada visão pela fonte da definição e nunca misturá-las | tools: financial.debt_views | evidence: escritura, release, nota de dívida
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
- ledger_rows (array, required): linhas por instrumento e série com saldo, moeda, indexador, spread, vencimento, garantia, credor e âncora
- schedule (object, required): cronograma por período com a soma conferida contra o total da nota
- net_debt_views (object, required): visões reportada e contratual com as definições literais e as âncoras
- uncovered_terms (array, required): colunas e instrumentos que a base não sustenta, com o motivo

# Exemplos
## Bom
- Camil 31/05/2026: 5.670.186 de dívida bruta conciliados com o balanço; 4.228.477 de dívida líquida contratual pela definição da escritura; 4.214,4 do release nomeada como visão do release; seis séries IPCA somando 743.955.
## Ruim
- Usar 4.214,4 do release para o covenant; somar arrendamento à dívida bruta sem dizer; alocar operações aprovadas em ata no cronograma sem prova de desembolso.

# Testes
## Unit
- soma do cronograma igual ao total da nota; visões reportada e contratual reproduzem os valores do gabarito do caso 01
## Gold
- gc01-analista-ib-camil: ledger reproduz as seções 1, 3 e 5 do gabarito com âncora por linha
## Adversarial
- escala trocada (milhares por milhões) é detectada pela conciliação com o balanço; release sem nota não gera linhas
## Aceitação
- resultado reproduzível; toda linha com âncora; lacunas nomeadas em vez de zeros

# Evidência
## Hierarquia
- Escritura, contrato ou relatório de agente fiduciário para termos por série
- Demonstração auditada ou revisada e suas notas para saldos e cronograma
- Release e apresentação só para a visão do release, nomeada como tal
## Regras
- Conflito entre fontes não é média: registrar as duas com a diferença.
- Ausência não é zero: vira `insufficient_evidence` com o motivo.
