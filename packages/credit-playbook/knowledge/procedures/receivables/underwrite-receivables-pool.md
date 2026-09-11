---
id: underwrite-receivables-pool
version: 2026.09.06-v1
maturity: production
title_pt: Conciliar e testar a capacidade de uma carteira de recebíveis
title_en: Reconcile and test the capacity of a receivables pool
role: financial_analysis
blueprint_stage: 4
owner_role: Head de Análise de Crédito Estruturado
approved_by: Carlos Eduardo Galves
approved_at: 2026-09-10
approval_source: instrução do fundador na sessão de coordenação de 10/09/2026
effective_date: 2026-09-06
implementation_module: @offroad/receivables-analysis
implementation_export: underwriteReceivablesPool
result_contract: method.underwrite-receivables-pool.v1
connected_states: [understanding_in_progress]
persistence_mode: derived_on_demand
persistence_target: method_results
unit_test_files: [packages/receivables-analysis/src/underwrite.test.ts]
gold_case_ids: [gc03-assessor-recebiveis]
adversarial_case_ids: [r02-accounting-mismatch, r11-single-debtor-concentration, r15-encumbered-base, r19-no-eligible-base, r20-duplicate-cash]
e2e_scenario_ids: [pending:g3-receivables-live-work]
cost_eval_ids: [deterministic:no-model-calls]
house_procedure_ids: [Q-06, Q-14, D-07, ES-11, ES-12, OP-01]
authorities: [DEF, CASA]
reference_data_keys: [policy.receivables.aging, policy.concentration.materiality, policy.structure.collateral_haircuts, policy.structure.collateral-coverage]
task_specs: [R01]
required_depth_pack_ids: [analysis.receivables-underwriting]
binding_priority: 100
capability_availability: live
capability_exposure: universal
capability_allowed_uses: [internal_validation, customer_work]
capability_allowed_evidence_regimes: [project_private, mixed_governed]
capability_allowed_data_classes: [project_confidential]
capability_allowed_source_classes: [project_context, provided_documents, house_method]
capability_allowed_provider_ids: []
capability_allowed_tool_ids: []
capability_provider_required: false
capability_maximum_effect: none
gold_cases: [gc03-assessor-recebiveis]
review_ids: [underwrite-receivables-pool-2026-09-10-independent-review]
gold_run_ids: [underwrite-receivables-pool-2026-09-10-gold]
adversarial_run_ids: [underwrite-receivables-pool-2026-09-10-adversarial]
consistency_run_ids: [underwrite-receivables-pool-2026-09-10-consistency]
---

# Objetivo
Transformar um loan tape, seu controle contábil, os recebimentos e uma política explicitamente
declarada em uma visão reproduzível da qualidade da carteira e da capacidade indicativa que ela
suporta, sem presumir que recebíveis implicam FIDC, ABL ou qualquer instrumento específico.

# Produto
Resultado assinado com conciliações, elegibilidade título a título, aging, concentração, performance,
cobertura de evidências, borrowing base, waterfall, gatilhos, lacunas e limites de uso. Cada política,
linha de origem e cálculo determinante permanece no trace.

# Quando ativar
- O caso contém ou pretende usar recebíveis como fonte de pagamento, colateral ou ativo cedido.
- Existem loan tape, aging ou controles de recebíveis suficientes para testar ao menos a identidade da carteira.
- O usuário quer verificar capacidade, qualidade ou aderência econômica antes de discutir um instrumento.

# Quando não ativar
- Não existe carteira título a título nem substituto capaz de sustentar a análise; nesse estado, produzir apenas o pedido de informação.
- O pedido é somente jurídico, regulatório ou de validade da cessão; encaminhar a dependência e não emitir opinião legal.
- O objetivo é escolher financiador ou confirmar apetite; esta análise termina antes do matching e não cria direção externa.

# Inputs mínimos e substitutos
- Data-base e moeda explicitamente declaradas.
- Loan tape com identidade do título, sacado e grupo econômico, origem, vencimento, saldo, pagamentos, situação, titularidade, ônus e âncora de origem.
- Saldo contábil de contas a receber e cobrança contabilizada no mesmo período; sem ambos, a conciliação correspondente fica aberta.
- Extrato ou ledger de recebimentos ligado aos títulos e à conta de cobrança; sem ele, controles de caixa não ficam cobertos.
- Política versionada de elegibilidade, concentração, aging, evidência, registro, avanço, sobrecolateralização, subordinação e reservas; uma política de exemplo nunca vira política institucional em silêncio.
- Estrutura a testar com montante, taxa de avanço, reforços de crédito, capital stack e waterfall; sem proposta, não concluir capacidade para uma operação.

# Sequência operacional
1. [deterministic] Validar o universo :: Recusar identidade duplicada, âncora repetida, grupo econômico inconsistente, data impossível, saldo negativo e moeda não declarada; Preservar o arquivo e a linha de cada título e recebimento | evidence: loan tape, aging, extrato de cobrança
2. [deterministic] Conciliar a carteira :: Somar saldos título a título e confrontar com o controle contábil na mesma data e unidade; Somar cobranças do tape, contabilidade e caixa, excluindo duplicidades nomeadas; Manter qualquer diferença acima da tolerância como bloqueio | evidence: loan tape, balancete, extrato de cobrança
3. [deterministic] Testar elegibilidade :: Aplicar prazo, seasoning, cessibilidade, lastro, registro, ônus, disputa, partes relacionadas, setor e atraso a cada título; Registrar todos os motivos de exclusão sem compensação manual | evidence: loan tape, contratos, registro ou custódia
4. [deterministic] Medir qualidade e concentração :: Calcular aging, inadimplência, perda, recuperação, diluição, recompra, substituição, prazo médio e concentração por sacado e grupo; Marcar métricas sem histórico como não cobertas, nunca como zero econômico | evidence: históricos de carteira e eventos, mapa de sacados
5. [deterministic] Calcular borrowing base :: Aplicar limites de concentração à base preliminar; Comparar máximo por taxa de avanço e por sobrecolateralização; Tomar o menor limite e confrontar com o pedido | evidence: política declarada, estrutura a testar
6. [deterministic] Testar reforços e waterfall :: Calcular subordinação efetiva, reserva e alocação de caixa pela prioridade declarada; Expor todo shortfall de juros ou principal sênior | evidence: estrutura a testar, regras da waterfall
7. [deterministic] Compilar decisão delimitada :: Classificar como pronta para aprofundar, requer remediação ou não viável; Separar bloqueios de dados, violações remediáveis e recusa econômica; Manter direção externa, recomendação de financiador e aprovação de crédito desabilitadas

# Cálculos determinísticos
- Saldo total: soma do saldo aberto de cada título válido na data-base.
- Base elegível preliminar: soma dos saldos cujos testes título a título não produziram motivo de exclusão.
- Base elegível ajustada: aplicação separada dos tetos por sacado e grupo econômico à base preliminar.
- Facilidade suportada: mínimo entre base ajustada vezes taxa de avanço e base ajustada dividida pela sobrecolateralização mínima.
- Conciliações: diferenças absolutas e relativas entre tape, contabilidade, cobrança reportada e caixa mapeado.
- Reforços: subordinação efetiva sobre o capital stack, reserva-alvo e waterfall sequencial sem caixa negativo.

# Julgamentos permitidos
- Escolher uma política ou tolerância só é permitido quando a autoridade, versão e aplicabilidade ao caso estão registradas; na ausência, perguntar ou simular alternativas claramente rotuladas.
- Uma lacuna pode ser tratada como remediável apenas quando o título poderia se tornar elegível com evidência, registro ou seasoning; impedimento econômico ou jurídico conhecido não é “dado faltante”.
- O resultado indica capacidade sob os parâmetros testados, não oferta, aprovação de crédito nem recomendação final de instrumento.

# Perguntas que mudam o trabalho
- Qual é a política aplicável e quem tem autoridade para defini-la neste caso?
- O montante representa a necessidade total, apenas uma tranche ou um limite pretendido?
- Quais recebíveis já estão cedidos, empenhados ou sujeitos a trava, recompra, coobrigação ou compensação?
- O histórico entregue cobre cobranças, baixas, renegociações, diluição, recompra, substituição, perda e recuperação pelo mesmo identificador do título?
- Qual waterfall e quais reforços de crédito devem ser testados, se algum?

# Red flags
- Tape não fecha com o balancete ou cobranças não fecham com caixa.
- Sacado ou grupo econômico fragmentado para aparentar menor concentração.
- Título cedido ou onerado marcado como livre.
- Histórico de diluição, recompra, extensão ou perda ausente e tratado como zero.
- Facilidade pedida acima da base suportada ou subordinação abaixo da política.
- Recebimento duplicado, sem âncora ou ligado a título ou sacado divergente.

# Stop conditions
- Nenhum recebível economicamente elegível.
- Conflito material de registro, titularidade ou ônus sem resolução.
- Diferença material entre loan tape e contabilidade ou entre cobrança e caixa.
- Política aplicável ou estrutura a testar ausente quando o pedido exige sizing.
- Evidência crítica abaixo do piso declarado.

# Outputs
- schema_version (string, required): contrato `method.underwrite-receivables-pool.v1`
- state (enum, required): estado econômico delimitado | values: ready_for_structuring, needs_remediation, not_viable
- case_id (string, required): identidade estável do caso
- reference_date (date, required): data-base comum da carteira
- currency (enum, required): moeda explicitamente declarada | values: BRL, USD
- portfolio_summary (object, required): contagem, saldos, base elegível, prazo e concentração
- eligibility (array, required): decisão e motivos por título, sacado e grupo
- aging (object, required): saldos por faixa de atraso
- performance (object, required): inadimplência, perda, recuperação, diluição, recompra e substituição
- evidence_coverage (object, required): cobertura de lastro, âncoras, registro, cessibilidade e ônus
- reconciliation (object, required): tape contra contabilidade, cobranças contra contabilidade e caixa, com diferenças e estado
- borrowing_base (object, required): pedido e limites por avanço, sobrecolateralização, subordinação e reserva
- waterfall (array, required): prioridade, devido, pago e shortfall por nível
- triggers (array, required): limite, realizado, comparação e consequência de cada teste
- gaps (array, required): lacunas e violações separadas por severidade, escopo e evidência
- decision_boundary (object, required): bloqueios, remediações, recusas e proibição de direção externa
- trace (object, required): versões, política integral, fingerprints e linhas de origem de títulos e caixa

# Exemplos
## Bom
- Aurora em 31/07/2026: carteira 51.940.000 concilia com o balancete, mas apenas 26.217.914 ficam elegíveis e a facilidade suportada de 19.663.436 não cobre a tranche pedida de 25.000.000; o resultado exige remediação e mostra os gatilhos, não “aprova” a estrutura.
## Ruim
- Dizer que “os recebíveis cobrem a operação” usando o saldo bruto, sem retirar títulos onerados, sem concentração, sem conciliar caixa e sem política declarada.

# Testes
## Unit
- carteira diversificada fecha tape, contabilidade, cobrança e caixa; calcula 4.800.000 de facilidade suportada e a waterfall na prioridade exata
## Gold
- gc03-assessor-recebiveis reproduz saldos, concentração, aging, base elegível, facilidade suportada, gatilhos e lacunas do gabarito Aurora
## Adversarial
- diferença contábil, concentração por sacado, ônus, base elegível zero, recebimento duplicado, mapping divergente e moeda inválida permanecem visíveis ou são recusados na fronteira
## Aceitação
- nenhum cálculo feito por modelo; mesmos fatos e política produzem o mesmo resultado sob permutação das linhas; toda política e linha de origem está no trace; nenhuma saída autoriza recomendação externa ou aprovação de crédito

# Evidência
## Hierarquia
- Loan tape, aging e ledger de caixa preservados linha a linha
- Balancete e razão ou controle contábil na mesma data-base
- Contratos, registro, custódia e mapa de ônus aplicáveis
- Política versionada fornecida pela instituição ou explicitamente aprovada para o cenário
## Regras
- Saldo bruto, base elegível e base ajustada são objetos diferentes e nunca intercambiáveis.
- Concentração por sacado e por grupo econômico é calculada separadamente.
- Ausência de histórico não equivale a zero de diluição, perda, recompra ou extensão.
- Um título pode ter múltiplos motivos de exclusão e todos permanecem no resultado.
- O menor limite entre avanço e sobrecolateralização governa a facilidade suportada.
- O método é economicamente neutro a instrumento e jurisdição; FIDC, desconto, securitização ou ABL exigem packs adicionais explícitos.
