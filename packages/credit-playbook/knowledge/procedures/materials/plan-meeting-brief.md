---
id: plan-meeting-brief
version: 2026.09.05-v6
maturity: implemented
title_pt: Planejar a devolutiva e o material de reunião
title_en: Plan the first deliverable and the meeting material
role: institutional_materials
blueprint_stage: 8
owner_role: Head de DCM
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/executors/plan-meeting-brief
implementation_export: planMeetingBrief
result_contract: method.plan-meeting-brief.v6
connected_states: [understanding_in_progress]
persistence_mode: derived_on_demand
persistence_target: method_results
unit_test_files: [packages/credit-playbook/src/executors/plan-meeting-brief.test.ts]
gold_case_ids: [gc01-analista-ib-camil]
adversarial_case_ids: [adversarial:gc01:question-answered-by-documents-refused]
e2e_scenario_ids: [pending:case01-frozen-run]
cost_eval_ids: [deterministic:assembly-only]
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
4. [model_assisted] Redigir as páginas :: Etapa posterior ao plano confirmado, fora deste executor: prosa gerada dos objetos, cada número com referência ; Mudança de premissa entre versões vira nota de mudança

# Cálculos determinísticos
- Nenhum cálculo próprio; todo número vem dos objetos aprovados por referência.

# Regras de montagem
- Só objetos em estado utilizável (complete, resolved, closes, declared, compared, diagnosed) preenchem blocos; condicionado, parcial, incompleto ou com divergências abertas vira lacuna nomeada com o objeto pendente; bloqueado é excluído.
- Cada fato citado carrega o fingerprint do objeto; fato ligado a outro fingerprint é recusado; fato com valor em milhares carrega a unidade.
- Um bloco só é preenchido com fatos; objeto utilizável sem fatos vira lacuna nomeada.
- Sem audiência ou forma, a devolutiva sai e o plano de páginas espera.
- Pontos a favor e contra a tese vêm da posição que qualquer objeto utilizável declarou em cada fato, nunca do tipo do objeto.
- Uma pergunta só é feita depois de uma busca declarada na base (documentos consultados) que não achou resposta; fato com unidade que contradiz as próprias palavras ou a unidade do objeto é recusado; todo fato cita o campo do objeto que reproduz; fato que afirma rompimento ou inadimplemento é recusado (nenhum objeto afirma evento jurídico).
- Quando o conteúdo do objeto é dado, o fingerprint é recalculado desse conteúdo e o caminho de cada fato tem de resolver dentro dele; a unidade declarada tem de bater com a do conteúdo. Fato que afirma rompimento, violação ou vencimento antecipado declarado é recusado.
- Mais páginas do que blocos volta como pergunta de alinhamento emitida dentro do limite de três (a de menor prioridade cede), não só anunciada; a produção só é permitida com plano confirmado, e lacunas (insufficient_evidence) não a impedem: elas ficam nomeadas no material.
- O plano honra o número de páginas pedido (funde o final quando são menos, divide a página mais cheia quando são mais); mais páginas do que blocos é unsupported e volta como pergunta.
- Pergunta que a base já responde é recusada com a âncora da resposta, seja qual for a prioridade; pergunta cujo motivo é "nenhuma" não é feita.
- Versão anterior informada gera nota de mudança; nunca reescrita silenciosa.

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
- schema_version (string, required): method.plan-meeting-brief.v6
- case_id (string, required): caso a que a devolutiva pertence
- turn (number, required): turno do pedido
- state (enum, required): planned, ou awaiting_confirmation enquanto um plano proposto espera a confirmação da pessoa
- deliverable (object, required): blocos da devolutiva (cada um preenchido só por objetos em estado utilizável, com cada fato ligado ao fingerprint do objeto que cita, ou lacuna nomeada com os objetos pendentes), objetos usados (só os citados por um bloco preenchido), objetos utilizáveis sem citação, objetos pendentes (condicionados, parciais, incompletos, com divergências abertas) e objetos excluídos (bloqueados)
- page_plan (object, required): estado (not_requested, awaiting_audience_and_form, proposed, confirmed, unsupported), id, forma, audiência (principal e demais), páginas ajustadas ao número pedido, discriminador da audiência principal, permissão de produção e motivo
- alignment_questions (array, required): no máximo três, cada uma com o motivo de mudar o material
- refused_questions (array, required): perguntas recusadas com o motivo: a base já responde (com a âncora da resposta), nenhuma busca da base foi declarada, a resposta não muda o trabalho, ou além das três que mais mudam
- not_produced_here (array, required): o que este executor não produz: a prosa das páginas é etapa assistida por modelo depois do plano confirmado
- ambiguity_named (string, optional): o que a instrução do patrocinador deixou indefinido, declarado pelo chamador e nomeado na devolutiva
- change_note (object, optional): null na primeira versão (sem versão anterior); contra a versão anterior: blocos que mudaram de estado ou de objetos e objetos cujo fingerprint mudou, entraram ou saíram
- uncovered_terms (array, required): todos os blocos em lacuna (perguntas pendentes incluídas) e objetos pendentes (condicionados, parciais, com divergências), como insufficient_evidence, cada um com o motivo e os achados carregados como condição
- trace (object, required): fingerprint canônico da entrada e da saída

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
