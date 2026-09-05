---
id: plan-meeting-brief
version: 2026.09.05-v1
maturity: candidate
title_pt: Planejar a devolutiva e o material de reunião
title_en: Plan the first deliverable and the meeting material
role: institutional_materials
blueprint_stage: 8
owner_role: Head de DCM
effective_date: 2026-09-05
house_procedure_ids: [MA-01, MA-02, LC-01]
authorities: [CASA]
task_specs: [M05, M07]
calculation_ids: []
gold_cases: [gc01-analista-ib-camil, gc05-banker-expansao-camil]
max_model_calls: 2
model_purpose: [propor o plano de páginas a partir dos objetos aprovados, redigir a prosa de cada página a partir dos objetos aprovados]
dependencies: [build-debt-ledger, diagnose-maturity-wall, reconcile-covenant-definitions, compare-refinancing-before-after]
---

# Objetivo
Transformar a análise em uma devolutiva e depois em material, com plano de páginas confirmado
antes de produzir, preservando números e premissas por referência aos objetos aprovados, com a
audiência e a forma que a pessoa pediu, e sem perguntar o que já está nos documentos.

# Produto
Primeira devolutiva (visão da companhia, desempenho, dívida por instrumento, cronograma, liquidez
e cobertura, premissas, pontos a favor e contra a tese, alternativas iniciais, perguntas pendentes,
exhibits) e, em seguida, o plano e o material no formato pedido, cada página citando os objetos.

# Quando ativar
- Existe um pedido de material ou reunião com audiência identificada.

# Quando não ativar
- O pedido é uma pergunta pontual; a resposta não é um material.

# Inputs mínimos e substitutos
- Objetos aprovados: ledger, parede, covenants, alternativas, cenários.
- Audiência e forma; sem eles, a devolutiva sai e o plano de material espera a confirmação.

# Sequência operacional
1. [deterministic] Montar a devolutiva :: Preencher cada bloco só com objetos aprovados, citando ids ; Bloco sem objeto vira lacuna nomeada | evidence: objetos aprovados
2. [model_assisted] Propor o plano de páginas :: A partir do pedido (audiência, forma, número de páginas), propor o plano e as três perguntas de alinhamento que mudam o material ; Não perguntar o que está nos documentos
3. [human_judgment] Confirmar o plano :: A pessoa confirma ou corrige o plano antes de qualquer produção
4. [model_assisted] Redigir as páginas :: Prosa gerada dos objetos, cada número com referência ; Mudança de premissa entre versões vira nota de mudança

# Cálculos determinísticos
- Nenhum cálculo próprio; todo número vem dos objetos aprovados por referência.

# Julgamentos permitidos
- Escolher o que entra em três páginas exige o discriminador da audiência, escrito no plano.

# Perguntas que mudam o trabalho
- Leitura de refinanciamento ou alternativas mais amplas?
- Reunião exploratória ou produto a testar?
- Briefing interno, páginas de pitch ou análise com cenários?

# Red flags
- Número no material sem objeto de origem.
- Pergunta ao usuário cuja resposta está no ITR.

# Stop conditions
- Plano de páginas não confirmado e o pedido é produção de arquivo.

# Outputs
- deliverable (object, required): blocos da devolutiva com referências aos objetos
- page_plan (object, required): páginas, conteúdo e discriminador da audiência, com estado de confirmação
- alignment_questions (array, required): no máximo três, cada uma com o motivo de mudar o material

# Exemplos
## Bom
- Caso 01, turno 1: devolutiva com dívida por instrumento, dois picos, covenant a 4,00x em fevereiro de 2027, três perguntas ao VP (ângulo, tipo de reunião, formato); turno 2: plano das três páginas proposto e confirmado antes do arquivo.
## Ruim
- Dez perguntas; perguntar a data do ITR; produzir o arquivo antes de confirmar o plano.

# Testes
## Unit
- devolutiva só com objetos aprovados; perguntas limitadas a três com motivo
## Gold
- gc01-analista-ib-camil: comportamento esperado dos turnos 1 e 2 do caso
## Adversarial
- pergunta cuja resposta está nos documentos é recusada; número sem referência é recusado
## Aceitação
- plano confirmado antes da produção; mudanças entre versões explicadas

# Evidência
## Hierarquia
- Objetos aprovados da análise
- Pedido da pessoa (audiência, forma)
## Regras
- Nenhum número sem objeto de origem.
- Nada é produzido antes da confirmação do plano.
