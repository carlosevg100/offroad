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

## 5. Qualidade em paralelo

- Testes determinísticos a cada commit (CI completa).
- Fallback de provedor: a corrida de prévia não depende de modelo; onde um modelo entrar, o gateway
  já tem dois provedores e política de dados.
- Revisão independente consolidada por checkpoint, não por commit; só achados P0 corrigem na hora;
  P1 e P2 entram em rodada posterior. A revisão independente está bloqueada pelos créditos da OpenAI
  em 5 de setembro (ver `HANDOFF_2026-09-05.md`).
