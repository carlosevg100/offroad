---
id: reconcile-covenant-definitions
version: 2026.09.05-v1
maturity: implemented
title_pt: Reconciliar as definições de covenant com as escrituras
title_en: Reconcile covenant definitions against the indentures
role: financial_analysis
blueprint_stage: 5
owner_role: Head de DCM
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/executors/reconcile-covenant-definitions
implementation_export: reconcileCovenantDefinitions
result_contract: method.reconcile-covenant-definitions.v2
connected_states: [understanding_in_progress]
persistence_mode: derived_on_demand
persistence_target: method_results
unit_test_files: [packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts]
gold_case_ids: [gc01-analista-ib-camil]
adversarial_case_ids: [adversarial:gc01:different-net-debt-definition-not-comparable]
e2e_scenario_ids: [pending:case01-frozen-run]
cost_eval_ids: [deterministic:no-model-calls]
house_procedure_ids: [D-24, D-26, ES-40]
authorities: [LEI, DEF]
legal_review_required: true
reference_data_keys: [policy.structure.covenant_headroom]
task_specs: [C05, S08]
calculation_ids: [financial.net_leverage, financial.debt_views]
gold_cases: [gc01-analista-ib-camil]
dependencies: [build-debt-ledger]
---

# Objetivo
Ler cada covenant financeiro na sua escritura, extrair definição, perímetro, ajustes, periodicidade
e data de medição, limites e degraus condicionais, e só então comparar o índice reportado ou
pro forma ao limite que de fato se aplica na data que importa.

# Produto
Registro por instrumento com a definição literal, os degraus e suas condições, a data da próxima
medição, o limite aplicável e o índice comparável, mais a lista do que continua sem prova.

# Quando ativar
- Existe ao menos uma escritura, contrato ou relatório fiduciário com índice financeiro no pack.
- O trabalho vai afirmar headroom, risco de quebra ou capacidade de nova dívida.

# Quando não ativar
- Só existem relatórios fiduciários sem a escritura: o produto registra o limite informado como "reportado pelo agente", sem afirmar headroom.

# Inputs mínimos e substitutos
- Escritura ou contrato de cada instrumento com covenant; substituto parcial: relatório anual do agente fiduciário, que dá o limite e a apuração mas não a definição completa.
- Ledger de dívida com a visão contratual.
- Demonstração da data de medição e, para leituras interinas, o pro forma divulgado com a sua definição.

# Sequência operacional
1. [deterministic] Extrair a cláusula :: Localizar na escritura a cláusula de índices financeiros e copiar definição de dívida líquida, definição de EBITDA, periodicidade, base de apuração, limites e condições de cada degrau ; Registrar cláusula e página | evidence: escrituras
2. [deterministic] Resolver o degrau aplicável :: Verificar a condição de cada degrau (vencimento ou quitação de instrumento de referência, exercício encerrado, evento) contra fatos datados ; Marcar como `insufficient_evidence` a condição que a base não prova | evidence: escrituras, comunicados, relatórios fiduciários
3. [deterministic] Comparar definições :: Recalcular a dívida líquida contratual a partir dos componentes do ledger e, quando a companhia abre o EBITDA de covenant, o índice; senão, derivar o EBITDA implícito do índice reportado e marcá-lo como derivado ; Decidir a comparabilidade confrontando os componentes da definição contratual com os da definição reportada, instrumento a instrumento, nunca por declaração de quem chama ; Só medir headroom quando a comparação for plena; comparação condicionada registra o índice e o limite lado a lado sem headroom | tools: financial.debt_views, financial.net_leverage, structure.covenant_headroom | evidence: ledger de dívida, ITR ou DFP
4. [model_assisted] Redigir a leitura :: Dizer qual limite se aplica em qual data, o que o pro forma significa e o que falta provar ; Nunca escrever "rompido" para uma medição que ainda não ocorreu

# Cálculos determinísticos
- financial.net_leverage: índice pela definição literal, com os componentes anotados.
- financial.debt_views: visão contratual reproduzida a partir do ledger.

# Julgamentos permitidos
- Decidir se um pro forma divulgado pela companhia usa a mesma definição da escritura exige comparar componentes, não aceitar o nome.

# Perguntas que mudam o trabalho
- O instrumento de referência de um degrau condicional foi quitado de forma ordinária? A resposta muda o limite aplicável.
- A companhia abre o EBITDA de covenant com ajustes? Sem isso, o valor apurado fica como derivação.

# Red flags
- Limites diferentes para o mesmo nome de índice em instrumentos da mesma companhia.
- Relatório fiduciário com limite de um exercício aplicado a outro.
- Pro forma interino acima do limite anual com medição a poucos meses.

# Stop conditions
- Nenhuma escritura no pack e o trabalho exige afirmar headroom.

# Outputs
- covenants (array, required): por instrumento, fonte (escritura ou relatório fiduciário), definições literais e componentes, ajustes de EBITDA, degraus com condição e estado, periodicidade, base, fim do exercício, próxima medição derivada, limite aplicável com estado, comparabilidade com motivos, headroom só quando comparável, status nunca igual a rompido, âncora com cláusula e página
- comparable_index (object, required): índice comparado, com base (calculado dos componentes ou reportado), definição, dívida líquida com fórmula, operandos e âncoras, EBITDA aberto ou implícito e âncora
- unproven_conditions (array, required): condições de degrau ou quitações não provadas pela base, uma por instrumento
- state (enum, required): resolved, conditioned ou blocked | values: resolved, conditioned, blocked

# Exemplos
## Bom
- Camil: mesma definição-base de dívida líquida e de EBITDA nas escrituras da 11ª, 13ª, 14ª e 15ª (só a 11ª acrescenta o pro forma de aquisições); 3,50x enquanto viviam os CRA de referência da Eco Securitizadora, 4,00x no exercício encerrado após a quitação ordinária; com a quitação não provada, o limite fica `insufficient_evidence` e o pro forma de 4,72x é registrado ao lado de 4,00x sem headroom; a comparabilidade fica condicionada enquanto a companhia não abre o EBITDA.
## Ruim
- Comparar 4,72x a 3,50x por causa do relatório fiduciário de 2025; escrever "covenant rompido" para a medição de fevereiro de 2027.

# Testes
## Unit
- degrau aplicável resolvido a partir de vencimento ou liquidação ordinária, o que ocorrer primeiro; liquidação por vencimento antecipado mantém o degrau inferior; próxima medição derivada do fim do exercício; direção mínimo e máximo
## Gold
- gc01-analista-ib-camil: quatro escrituras (11ª, 13ª, 14ª e 15ª); dívida líquida contratual 4.228.477 recalculada dos componentes; EBITDA implícito 895.863,77 marcado como derivado; 4,00x fica `insufficient_evidence` enquanto a quitação dos CRA de referência não está provada; nenhum headroom emitido
## Adversarial
- relatório fiduciário sem escritura não produz headroom; definição reportada com componentes diferentes é `not_comparable` por instrumento; EBITDA não aberto deixa a comparação condicionada sem headroom; base vazia bloqueia com motivo estruturado; fatos de quitação duplicados são recusados; índice reportado datado depois da data-base é recusado
## Aceitação
- toda afirmação de limite com cláusula e página; condições não provadas nomeadas; trace com fórmula e operandos de cada cálculo; fingerprints iguais sob permutação de instrumentos e fatos

# Evidência
## Hierarquia
- Escritura, contrato e aditamentos
- Relatório do agente fiduciário
- Demonstração financeira e pro forma divulgado
## Regras
- Limite sem cláusula não é limite.
- Comparação entre índice e limite exige a mesma definição, perímetro e data.
