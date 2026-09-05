---
id: reconcile-covenant-definitions
version: 2026.09.05-v1
maturity: candidate
title_pt: Reconciliar as definições de covenant com as escrituras
title_en: Reconcile covenant definitions against the indentures
role: financial_analysis
blueprint_stage: 5
owner_role: Head de DCM
effective_date: 2026-09-05
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
3. [deterministic] Comparar definições :: Confrontar a definição contratual com a definição do índice reportado ou pro forma ; Só comparar índice e limite quando perímetro, ajustes e data forem os mesmos, senão registrar a diferença | tools: financial.debt_views, financial.net_leverage | evidence: ledger de dívida, ITR ou DFP
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
- covenants (array, required): por instrumento, definição literal, degraus e condições, periodicidade, data da próxima medição, limite aplicável e âncora
- comparable_index (object, required): índice reportado ou pro forma com a definição e a conclusão sobre comparabilidade
- unproven_conditions (array, required): condições de degrau ou quitações não provadas pela base

# Exemplos
## Bom
- Camil: mesma definição nas escrituras da 11ª, 13ª, 14ª e 15ª; 3,50x enquanto viviam os CRA de referência da Eco Securitizadora, 4,00x no exercício encerrado após a quitação; limite de 4,00x para fevereiro de 2026 e 2027, condicionado à quitação ordinária; pro forma 4,72x comparável porque usa a definição contratual.
## Ruim
- Comparar 4,72x a 3,50x por causa do relatório fiduciário de 2025; escrever "covenant rompido" para a medição de fevereiro de 2027.

# Testes
## Unit
- degrau aplicável resolvido a partir de datas de vencimento dos instrumentos de referência
## Gold
- gc01-analista-ib-camil: seção 13 do gabarito reproduzida
## Adversarial
- relatório fiduciário sem escritura não produz afirmação de headroom; nome igual com definição diferente é detectado
## Aceitação
- toda afirmação de limite com cláusula e página; condições não provadas nomeadas

# Evidência
## Hierarquia
- Escritura, contrato e aditamentos
- Relatório do agente fiduciário
- Demonstração financeira e pro forma divulgado
## Regras
- Limite sem cláusula não é limite.
- Comparação entre índice e limite exige a mesma definição, perímetro e data.
