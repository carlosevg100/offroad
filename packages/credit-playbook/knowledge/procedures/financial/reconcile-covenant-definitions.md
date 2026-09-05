---
id: reconcile-covenant-definitions
version: 2026.09.05-v10
maturity: implemented
title_pt: Reconciliar as definições de covenant com as escrituras
title_en: Reconcile covenant definitions against the indentures
role: financial_analysis
blueprint_stage: 5
owner_role: Head de DCM
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/executors/reconcile-covenant-definitions
implementation_export: reconcileCovenantDefinitions
result_contract: method.reconcile-covenant-definitions.v10
connected_states: [understanding_in_progress]
persistence_mode: derived_on_demand
persistence_target: method_results
unit_test_files: [packages/credit-playbook/src/executors/reconcile-covenant-definitions.test.ts]
gold_case_ids: [gc01-analista-ib-camil]
adversarial_case_ids: [adversarial:gc01:different-net-debt-definition-not-comparable, adversarial:gc01:leases-in-other-onerous-debt-changes-net-debt, adversarial:gc01:ebitda-flag-is-not-an-opening, adversarial:gc01:opening-must-reproduce-reported-index, adversarial:gc01:numerator-obligation-never-folded-into-ebitda]
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
1. [deterministic] Extrair a cláusula :: Localizar na escritura a cláusula de índices financeiros e copiar definição de dívida líquida, definição de EBITDA, periodicidade, base de apuração, limites e condições de cada degrau ; Registrar cláusula numerada e página da definição de dívida líquida, da definição de EBITDA (páginas distintas) e, separadamente, de cada degrau (4.22.3(j); 7.24.3(VIII); 7.26.3(VIII)); um rótulo sem número não é âncora ; Tipar cada ajuste de EBITDA pelo lado do índice que toca (adição ao denominador, como o EBITDA de adquirida; obrigação no numerador, como o sellers finance), nunca fundidos numa lista única; uma obrigação do numerador entra na dívida líquida com valor datado e âncora quando a base o dá, fica registrada como desconhecida (nunca zero) quando a base não o dá, e vira condição jurídica em qualquer caso | evidence: escrituras
2. [deterministic] Resolver o degrau aplicável :: Verificar a condição de cada degrau (vencimento ou quitação de instrumento de referência, exercício encerrado, evento) contra fatos datados; uma quitação (ordinária ou acelerada) sem data é fato desconhecido; o vencimento é fato datado e encerra o degrau `until` no primeiro vencimento ou quitação ordinária datada entre as referências (o que ocorrer primeiro), mesmo sem prova de quitação, enquanto o degrau `after` só se aplica com todas quitadas; uma quitação datada depois da data-base ainda não é fato ; Marcar como `insufficient_evidence` a condição que a base não prova e deixar uma condição escrita para cada degrau não provado, inclusive um degrau `until` isolado ; Derivar a próxima medição da periodicidade declarada (anual, semestral ou trimestral) a partir do fim do exercício | evidence: escrituras, comunicados, relatórios fiduciários
3. [deterministic] Comparar definições :: Recalcular a dívida líquida de cada instrumento a partir da lista de componentes da sua própria definição, sobre linhas datadas na data-base, do mesmo perímetro da escritura e com âncora própria por operando (uma linha agregada declara o que cobre e entra no trace com o nome de tudo o que cobre, nunca como um só componente); o texto literal da definição tem de nomear cada componente estruturado; uma definição que acrescenta arrendamento ou retira derivativos muda o número ou recusa a comparação ; Tratar `qualquer outra dívida onerosa` como residual: sem linha na base, assumir zero de forma declarada e condicionar; arrendamento presente na base sem estar na definição vira condição jurídica, não dívida ; Quando a companhia abre o EBITDA de covenant com valor, unidade, perímetro, período de doze meses e data, calcular o índice pelo `financial-core` (`aggregateDebtViews`, `calculateLeverage`); uma adição ao denominador que o EBITDA aberto não declara incorporar condiciona a comparação; uma obrigação do numerador nunca é incorporada por declaração; um ajuste sem lado econômico tipado condiciona sempre ; Uma linha agregada da base só cobre componentes do mesmo lado (dívida ou dedução); misturar os dois é recusado até a base decompor ; Uma abertura de EBITDA junto do índice reportado precisa reproduzir esse índice (tolerância de 0,005x) e estar datada na data-base; senão a comparação é `not_comparable` ; Toda condição jurídica que toque o numerador (arrendamento na base fora da definição, sellers finance) limita a comparação a `conditional` e impede headroom ; Senão, usar o índice reportado só se datado na data-base, com os componentes que a base de fato enumera e com o EBITDA aberto em valor (um sinalizador não é abertura); derivar o EBITDA implícito pelo `financial-core` (`calculateImpliedEbitda`) sobre a dívida líquida antes das obrigações do numerador que o índice reportado não declara, e marcá-lo como derivado ; Decidir a comparabilidade confrontando componentes e perímetro (consolidado ou controladora), instrumento a instrumento, nunca por declaração de quem chama; sem dívida líquida computável pela definição, com residual sem linha na base, ou com abertura de EBITDA nula ou negativa, nunca há comparação plena nem headroom ; Só medir headroom, pelo financial-core, quando o limite está resolvido e a comparação é plena; comparação condicionada registra o índice e o limite lado a lado sem headroom | tools: financial.debt_views, financial.net_leverage, structure.covenant_headroom | evidence: ledger de dívida, ITR ou DFP
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
- schema_version (string, required): identificador do contrato de resultado, `method.reconcile-covenant-definitions.v10`
- as_of_date (date, required): data-base da comparação
- unit (string, required): unidade declarada pelo chamador para toda a base (linhas, EBITDA e aberturas têm de coincidir), presente mesmo no resultado bloqueado; entra no fingerprint, para que uma troca uniforme de escala mude o resultado
- block_reasons (array, required): motivos estruturados de bloqueio, vazio quando não há
- covenants (array, required): por instrumento, fonte (escritura ou relatório fiduciário), definições literais com componentes e âncora própria, ajustes de EBITDA tipados com âncora, degraus com condição, estado e âncora própria, periodicidade, base, fim do exercício, próxima medição derivada da periodicidade, limite aplicável com estado, apuração reportada pelo agente quando a fonte é relatório fiduciário, dívida líquida pela própria definição (fórmula, operandos, âncora por operando, residual assumido zero ou não), índice comparado (calculado ou reportado; EBITDA aberto, implícito pelo `financial-core`, ou nulo quando nenhum existe, nunca preenchido), notas explicativas da resolução do degrau, comparabilidade com motivos, headroom só quando comparável, status nunca igual a rompido
- unproven_conditions (array, required): condições de degrau ou quitações não provadas pela base, uma por degrau não provado; referência sem fato deixa o degrau não provado mesmo quando outra referência foi liquidada por aceleração; uma liquidação acelerada com data provada e sem referência em aberto é nota do covenant e deixa o degrau seguinte como n/a, estado determinístico sem condição
- uncovered_terms (array, required): linhas candidatas da base (contas a pagar por aquisição, contraprestação contingente) e obrigações do numerador sem valor classificado, como insufficient_evidence com o motivo; nunca somadas e nunca chamadas de ausentes
- legal_conditions (array, required): qualificações que exigem revisão jurídica (arrendamento como outra dívida onerosa, sellers finance no numerador), por instrumento no covenant e consolidadas no resultado; enquanto existirem, nenhum headroom
- state (enum, required): resolved, conditioned ou blocked | values: resolved, conditioned, blocked
- trace (object, required): cálculos executados (id, fórmula, operandos, resultado, unidade: a monetária da base para dívida e EBITDA, `x` para índices e headroom) e fingerprints de entrada e saída

# Exemplos
## Bom
- Camil: mesma definição-base de dívida líquida e de EBITDA nas escrituras da 11ª, 13ª, 14ª e 15ª (só a 11ª acrescenta o pro forma de aquisições); 3,50x enquanto viviam os CRA de referência da Eco Securitizadora, 4,00x no exercício encerrado após a quitação ordinária; com a quitação não provada, o limite fica `insufficient_evidence` e o pro forma de 4,72x é registrado ao lado de 4,00x sem headroom; a comparabilidade fica condicionada enquanto a companhia não abre o EBITDA.
## Ruim
- Comparar 4,72x a 3,50x por causa do relatório fiduciário de 2025; escrever "covenant rompido" para a medição de fevereiro de 2027.

# Testes
## Unit
- degrau aplicável resolvido a partir de vencimento ou liquidação ordinária datada, o que ocorrer primeiro; liquidação por vencimento antecipado mantém o degrau inferior; próxima medição derivada do fim do exercício e da periodicidade (anual, semestral, trimestral); direção mínimo e máximo; dívida líquida por definição com um operando e uma âncora por componente
## Gold
- gc01-analista-ib-camil: quatro escrituras (11ª, 13ª, 14ª e 15ª) com âncora da definição de dívida líquida (p. 7 nas 13ª, 14ª e 15ª; p. 35 na 11ª), da definição de EBITDA (p. 8 nas 13ª, 14ª e 15ª; p. 35 na 11ª) e de cada degrau (13ª p. 54 e 55; 14ª p. 54; 15ª p. 56; 11ª p. 34); passivo de arrendamento de 276.768 presente na base e fora das definições, condição jurídica em cada escritura; sellers finance da 11ª como obrigação do numerador sem valor na base; dívida líquida 4.228.477 recalculada pela definição de cada escritura a partir de cinco linhas datadas do ITR (nota 15 cobrindo empréstimos, financiamentos e debêntures; nota 25 para derivativos; nota 3 para caixa; balanço para aplicações), residual `outra dívida onerosa` assumido zero de forma declarada; EBITDA implícito 895.863,77 marcado como derivado; os degraus de 3,50x terminaram no vencimento dos CRA de referência (fato datado) e os de 4,00x ficam `insufficient_evidence` com uma condição escrita cada (quatro ao todo) enquanto a quitação ordinária não está provada; comparação condicionada (residual não enumerado, EBITDA não aberto, ajustes tipados da 11ª); nenhum headroom emitido
## Adversarial
- relatório fiduciário sem escritura não produz headroom e carrega a apuração reportada; definição reportada com componentes diferentes é `not_comparable` por instrumento; definição que acrescenta arrendamento muda a dívida líquida daquele instrumento e gera condição jurídica nos demais; definição que retira derivativos muda o número no outro sentido; EBITDA não aberto deixa a comparação condicionada sem headroom; na via calculada, a 11ª fica condicionada até o EBITDA aberto declarar os ajustes que incorpora; índice reportado datado antes da data-base é `not_comparable`; linha de componente datada fora da data-base, quitação ordinária sem data, fatos de quitação duplicados, instrumentos e ajustes duplicados e índice reportado posterior à data-base são recusados; periodicidade trimestral muda a próxima medição; degrau `until` isolado sem fatos deixa condição escrita; base vazia bloqueia com motivo estruturado
## Aceitação
- toda afirmação de limite com cláusula e página do próprio degrau; condições não provadas nomeadas, uma por degrau; trace com fórmula e operandos de cada cálculo executado pelo `financial-core`, e nada nomeado sem executar; o fingerprint de saída inclui os cálculos e o fingerprint de entrada (o trace não recursivo inteiro); fingerprints iguais sob vinte permutações de instrumentos, fatos, linhas de componente, ajustes, referências e componentes reportados; unidade única por base e EBITDA de doze meses, senão recusa

# Evidência
## Hierarquia
- Escritura, contrato e aditamentos
- Relatório do agente fiduciário
- Demonstração financeira e pro forma divulgado
## Regras
- Limite sem cláusula não é limite.
- Comparação entre índice e limite exige a mesma definição, perímetro e data.
