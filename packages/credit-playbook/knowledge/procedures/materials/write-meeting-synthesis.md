---
id: write-meeting-synthesis
version: 2026.09.05-v1
maturity: implemented
title_pt: Escrever a síntese e o material da reunião
title_en: Write the meeting synthesis and material
role: institutional_materials
blueprint_stage: 8
owner_role: Head de DCM
effective_date: 2026-09-05
implementation_module: @offroad/credit-playbook/preview/synthesis
implementation_export: synthesisSkeleton
result_contract: method.write-meeting-synthesis.v1
connected_states: [understanding_in_progress]
persistence_mode: derived_on_demand
persistence_target: method_results
unit_test_files: [packages/credit-playbook/src/preview/synthesis.test.ts]
gold_case_ids: [gc01-analista-ib-camil]
adversarial_case_ids: [adversarial:gc01:sentence-with-unsupported-number-removed]
e2e_scenario_ids: [pending:live-intelligence-preview]
cost_eval_ids: [live:one-call-per-run]
house_procedure_ids: [MA-01, MA-02, LC-01]
authorities: [CASA]
task_specs: [A02]
calculation_ids: []
gold_cases: [gc01-analista-ib-camil]
max_model_calls: 1
model_purpose: [redigir a prosa de cada seção a partir dos objetos assinados e do plano da devolutiva]
dependencies: [build-debt-ledger, reconcile-financial-statements, reconcile-covenant-definitions, diagnose-maturity-wall, build-interest-and-indexation-schedule, estimate-exit-cost-by-series, declare-scenarios, compare-refinancing-before-after, plan-meeting-brief]
---

# Objetivo
Escrever, a partir dos objetos assinados e do plano da devolutiva, a síntese que a pessoa lê antes
da reunião, com cada número sustentado por um objeto e cada lacuna dita como lacuna, e emitir o
material como arquivo real (Word e planilha) gerado deterministicamente dessa síntese.

# Produto
Seções fixas (situação atual da dívida; covenants e condições; vencimentos, juros e custo de
saída; cenários e alternativas; pontos a alinhar e próximos passos), cada parágrafo com as
referências aos objetos que o sustentam; sem modelo, um esqueleto com as manchetes dos próprios
objetos; com modelo, prosa verificada número a número; nota do que mudou desde a versão anterior.

# Quando ativar
- O plano da devolutiva existe e os objetos da análise estão assinados.

# Quando não ativar
- Não há objeto assinado; nada há para sintetizar.

# Inputs mínimos e substitutos
- Objetos assinados dos oito métodos da cadeia e o plano da devolutiva.
- Sem modelo disponível, o esqueleto substitui a prosa e diz que é esqueleto.

# Sequência operacional
1. [deterministic] Montar o esqueleto :: Para cada seção, listar as manchetes que o plano da devolutiva assinou para os objetos da seção ; Objeto sem manchete entra pelo estado declarado | evidence: objetos assinados
2. [model_assisted] Redigir a prosa :: Uma chamada, limitada, escreve de dois a quatro parágrafos por seção só com o que os objetos afirmam ; Estados degradados são ditos como tal, com o motivo do objeto
3. [deterministic] Verificar os números :: Toda frase com número que os objetos não sustentam é removida e listada ; O vocabulário numérico vem dos próprios objetos, nas formas em que a prosa os escreve
4. [deterministic] Nomear o que mudou :: Comparar os fingerprints dos objetos lidos com os da síntese anterior ; Objeto alterado, novo ou ausente entra na nota de mudança
5. [deterministic] Emitir o arquivo :: Word e planilha gerados da síntese e das tabelas dos objetos, com versão e fingerprint do artefato no cabeçalho

# Cálculos determinísticos
- Nenhum cálculo próprio; todo número vem dos objetos por referência e é verificado contra eles.

# Regras de montagem
- A prosa nunca introduz número que não esteja nos objetos, na mesma unidade.
- Seções e ordem são fixas; parágrafos curtos, sem cabeçalhos internos, sem marcadores.
- A fonte (esqueleto ou modelo), o modelo, o custo, os números verificados e as frases removidas ficam na saída.

# Julgamentos permitidos
- Escolher que manchetes dos objetos merecem a abertura de cada seção.

# Perguntas que mudam o trabalho
- Nenhuma: a síntese lê o que a devolutiva já perguntou e o que a pessoa já respondeu.

# Red flags
- Frase com número não sustentado: removida antes da emissão, nunca corrigida à mão.
- Recomendação à companhia, oferta a investidor ou opinião jurídica no texto: proibidas.

# Stop conditions
- Toda frase da prosa removida por número não sustentado: a saída volta ao esqueleto e diz por quê.
- Modelo indisponível ou orçamento esgotado: esqueleto, com o motivo.

# Outputs
- schema_version (string, required): preview-synthesis.v1
- state (enum, required): skeleton ou drafted
- sections (array, required): seções com id, título e parágrafos, cada parágrafo com texto e referências aos objetos
- numbers (object, required): números verificados e frases removidas (seção, frase, números não sustentados)
- objects_read (object, required): fingerprint de cada objeto lido, por TaskSpec
- change_note (array, required): o que mudou desde a síntese anterior, por objeto
- source (object, required): kind (skeleton ou model), model, costUsd, latencyMs, reason
- trace (object, required): fingerprint canônico da saída

# Exemplos
## Bom
- Caso 01: seção de covenants diz que a alavancagem de 4,72x pela escritura está condicionada à prova de liquidação ordinária, com referência ao objeto de covenants; seção de alternativas diz que o status-quo lidera só sobre o que foi precificado.
## Ruim
- Prosa que afirma crescimento de EBITDA de 12,3% sem objeto que o sustente; recomendação de refinanciar; arquivo emitido com número corrigido à mão.

# Testes
## Unit
- vocabulário numérico cobre as formas escritas dos números dos objetos; frase com número não sustentado é removida e listada; esqueleto usa as manchetes dos objetos; nota de mudança por fingerprint
## Gold
- gc01-analista-ib-camil: esqueleto determinístico da corrida de prévia; prosa do modelo no gate vivo
## Adversarial
- prosa inteira com números inventados volta ao esqueleto
## Aceitação
- arquivo Word e planilha gerados da síntese, com versão e fingerprint; nova versão após alteração de premissa

# Evidência
## Hierarquia
- Objetos assinados da análise
- Plano da devolutiva
## Regras
- Nenhum número sem objeto de origem; nenhum objeto lido sem fingerprint registrado.
- Todo material sai com a marca de validação interna e sem liberação.
