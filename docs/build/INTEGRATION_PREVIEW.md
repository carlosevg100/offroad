# Modo `integration_preview`: o endgame do Caso 01 rodando no produto

Decisão do fundador em 5 de setembro de 2026: a revisão isolada de números e executores vira
trilha paralela, com orçamento e checkpoints; a prioridade é o fluxo completo do Caso 01 rodando
no produto, de ponta a ponta, antes de homologar cada componente em profundidade.

O modo `integration_preview` é o que permite isso sem quebrar a escada de maturidade: métodos em
estágio `implemented` executam dentro do produto para validação interna, sem subir a `tested` e sem
chegar a clientes. A maturidade continua impedindo liberação externa; ela não impede desenvolvimento
nem teste interno.

## 1. O que o modo é

- **Uma concessão por organização**, escrita pelo operador em `private.integration_preview_grants`
  (migration ou conexão de gestão), nunca pela Data API. O tenant só consegue perguntar se a sua
  própria organização está no modo (`get_integration_preview_status_v1`); nada sobre outras.
- **A concessão viaja no claim** (`worker_claim_job` devolve `integration_preview`), ao lado do
  vínculo de source pack. O worker nunca decide sozinho que está em prévia.
- **Ativação própria**: um turno da conversa pode ativar uma corrida de prévia
  (`worker_activate_integration_preview_run_v1`, via o despachante
  `worker_record_agent_response_and_activate_v3`). A ativação grava um plano de prévia (as TaskSpecs
  do workflow compilado, cada uma ligada a um método `implemented`), um brief de prévia versionado
  por turno e um job `capital_project_analysis` com `analysis_scope = integration_preview`. Sem a
  concessão, a ativação é recusada e nada é gravado.
- **Conclusão própria**: `worker_complete_integration_preview_run_v1` publica a devolutiva na mesma
  conversa com `metadata.mode = integration_preview` e encerra o job na mesma transação.
- **Marcas em toda parte**: banner âmbar em todas as telas do workspace da organização concedida;
  mensagens de conclusão com a marca de prévia; artefatos com `content.preview` (modo, maturidade do
  método, versão); eventos de log do worker com prefixo `integration_preview.`.
- **Restrições**: nenhuma ação externa; nenhum material aprovável para distribuição; nenhuma
  promoção de método; a corrida roda sem chamadas de modelo por padrão (executores determinísticos e
  prosa compilada a partir dos objetos), e as chamadas que existirem ficam presas ao orçamento do job.

## 2. O que o modo não é

Não é um ambiente. Roda no mesmo banco, no mesmo worker e na mesma tela, atrás de uma concessão. Não
é liberação: `implemented` continua abaixo de `ai_reviewed`, `tested`, `ready_for_founder` e
`production`. Não é um roteador novo em produção: o roteador de produção segue igual para quem não
tem a concessão.

## 3. Sequência (os dez passos do fundador)

| # | Passo | Onde entra |
| --- | --- | --- |
| 1 | Intent Router novo em modo preview | worker, turno da conversa: roteamento determinístico da composição (preparar reunião, preparar material, alterar premissa, aprofundar, responder pergunta), envelope em sombra gravado como hoje |
| 2 | O envelope compila o workflow real | `compileIntegrationPreviewWorkflow(composition)`: TaskSpecs em lotes de dependência, cada uma com `procedure` e executor |
| 3 | TaskSpecs ligadas aos nove métodos e executores | binding explícito TaskSpec → método → executor → entradas (evidência congelada do Caso 01) |
| 4 | Máquina de estados conversacional | derivada do banco: alinhando, pesquisando, analisando, alternativas prontas, plano do material, material pronto, atualizando |
| 5 | Plano e progresso reais na interface | plano de prévia em `capital_project_plan_tasks`, corridas em `capital_project_task_runs`, eventos em `capital_project_agent_events` |
| 6 | Primeira devolutiva com artifacts, fontes, lacunas e alternativas | artefatos por método, com âncoras, `uncovered_terms` e ranking do antes/depois |
| 7 | Transição "vamos preparar o material" | composição `prepare_material`: `plan-meeting-brief` sobre os objetos assinados |
| 8 | Outputs reais usando o snapshot anterior | o plano das páginas cita fingerprints dos artefatos; nada é copiado à mão |
| 9 | Alteração de premissas e atualização incremental | composição `change_premise`: a premissa entra no brief, só os nós cujo fingerprint de entrada mudou recomputam; o resto é replay |
| 10 | Caso 01 completo no produto | jornada E2E gravada (Playwright, vídeo) no stack local com worker |

## 4. Fatias de entrega

1. **Fundação** (este documento, migration `integration_preview_mode`, teste SQL, contrato do worker,
   banner): nada ativa a prévia ainda; um job de prévia que chegasse ao worker falha fechado.
2. **Evidência e workflow**: entradas congeladas do Caso 01 extraídas dos testes para
   `packages/credit-playbook/src/cases/gc01/`; compilador do workflow; roteador determinístico de
   prévia; binding TaskSpec → método.
3. **Runtime**: `processIntegrationPreviewRun` no worker; máquina de estados; devolutiva compilada
   dos objetos; alteração de premissa com replay por fingerprint.
4. **Interface**: plano e progresso, artefatos dos nove métodos com fontes e lacunas, alternativas,
   transição de material.
5. **Gravação**: jornada E2E com worker no stack local, vídeo e transcrição como artefato da CI.

## 4.1 Estado em 5 de setembro de 2026 (PR #443)

As cinco fatias estão no mesmo PR, na ordem em que foram provadas:

1. Fundação: migration `integration_preview_mode` (concessão, leitura de status, flag no claim,
   ativação, despachante v3, conclusão, carregador de contexto v6, `brief_kind` alargado), teste SQL
   `supabase/tests/integration_preview_mode.sql`, contrato do worker, banner. Provada no staging
   (`plpgsql_check` limpo, teste passou) e reconstruída do zero pela CI.
2. Evidência e workflow: `packages/credit-playbook/src/cases/gc01/` (entradas congeladas, antes
   dentro dos testes) e `src/preview/workflow.ts` (nove TaskSpecs ligadas aos nove métodos:
   C05 ledger, D07 demonstrações, C09 covenants, C10 muralha, C07 juros, S07 saída, C08 cenários,
   S10 antes/depois, A01 devolutiva).
3. Runtime: `apps/document-worker/src/integration-preview.ts` (roteador determinístico do turno,
   corrida das nove etapas com replay por fingerprint, devolutiva compilada dos objetos) e
   migration `integration_preview_runtime` (eventos com resumo próprio, leitura dos objetos por um
   turno). Zero chamadas de modelo; o gateway continua com dois provedores para o que ainda usar
   modelo fora da prévia.
4. Interface: painel `integration-preview-work.tsx` com os nove objetos (estado, números, tabelas,
   lacunas, evidência); plano e progresso vêm das tabelas de plano e corridas já existentes.
5. Gravação: `apps/web/e2e/integration-preview-case01.spec.ts` roda a jornada inteira no stack local
   da CI com o worker (vídeo e transcrição em `test-results/integration-preview-case01/`), e o
   log do worker fica como artefato `local-worker-log`.

Estado honesto que a prévia mostra hoje para o Caso 01: ledger, demonstrações e muralha
`incomplete`; covenants `conditioned`; juros e saída `partial`; cenários `blocked` (manifesto do
corpus); antes/depois `compared`; devolutiva `planned` com alternativas e pontos a favor preenchidos
e o resto declarado como lacuna. É isso que o produto deve mostrar enquanto a evidência não fecha.

**Um plano por turno, replay entre planos (5 de setembro, tarde).** O primeiro E2E com worker
mostrou que a ativação reaproveitava um plano com o mesmo fingerprint (a composição
`change_premise` compila as mesmas nove tarefas de `prepare_meeting`); um plano que já tinha task
runs era reativado, o início da tarefa replicava um run concluído e o registro do artefato exigia
um run em execução (`capital_task_run_not_available` na primeira etapa). Agora o snapshot do
plano carrega o turno (`turn.messageId`), cada ativação compila o seu plano, e o loader v6 lê os
artefatos anteriores em qualquer plano de prévia do projeto (mesmo compilador), para o worker
replicar por fingerprint de entrada o que não mudou. Uma etapa replicada também registra um
run no plano do turno (a trava de dependências do `worker_start_capital_project_task` lê os
runs do próprio plano, e a tela mostra a etapa concluída), com a saída apontando para o
artefato replicado, sem gravar artefato novo (o job de prévia carrega
`capital_artifact_required = false`; as etapas calculadas continuam gravando o seu artefato, e o
gatilho do run só cobra artefato quando o job exige). O loader de objetos das perguntas
(`worker_load_integration_preview_artifacts_v1`) também lê entre planos. Migrations
`integration_preview_prior_artifacts_across_plans` e `integration_preview_artifacts_across_plans`;
o teste SQL cobre a segunda ativação e a pergunta seguinte. O mesmo
log revelou um P1 fora da prévia: desde o PR #329 o worker recusava na claim todo `case_analysis`
enfileirado sem `analysis_scope` (confirmação de intake, replay, análise incremental); o escopo
agora assume `full_case` pelo tipo do job.

### Como ligar para uma organização (operador, conexão de gestão)

```sql
insert into private.integration_preview_grants (organization_id, note, granted_by)
values ('<organization_id>', 'Caso 01 em validação interna', '<quem concedeu>')
on conflict (organization_id) do update set enabled = true, note = excluded.note, updated_at = now();
```

Desligar: `update private.integration_preview_grants set enabled = false where organization_id = '<id>'`.
O banner some e as ativações passam a ser recusadas no mesmo instante; o que já foi gravado fica
marcado como prévia.

### Ordem de rollout em produção

As migrations entram antes do código: o worker novo chama `worker_record_agent_response_and_activate_v3`
em todo turno, com ou sem concessão. Aplicar `integration_preview_mode` e `integration_preview_runtime`
no projeto de produção, alinhar os nomes dos arquivos ao carimbo gravado, e só então mesclar.

## 5. Qualidade em paralelo

- Testes determinísticos a cada commit (CI completa).
- Fallback de provedor: a corrida de prévia não depende de modelo; onde um modelo entrar, o gateway
  já tem dois provedores e política de dados.
- Revisão independente consolidada por checkpoint, não por commit; só achados P0 corrigem na hora;
  P1 e P2 entram em rodada posterior. A revisão independente está bloqueada pelos créditos da OpenAI
  em 5 de setembro (ver `HANDOFF_2026-09-05.md`).
