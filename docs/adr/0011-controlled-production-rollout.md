# ADR 0011: Produção controlada por execução imutável

Status: accepted

Data: 2026-08-24

Plano de referência: `docs/build/BULLETPROOF_EXECUTION_PLAN.md`

## Contexto

CI verde, um modelo melhor ou uma tela funcional não provam que uma nova versão preserva a
qualidade de um case real. Sem congelar a entrada, uma reexecução pode ler documentos, fatos,
mandatos ou playbook diferentes e produzir uma comparação falsa. Sem separar a execução candidata
da execução visível, um shadow pode alterar o case do usuário. Sem um ledger de promoção, dez
fixtures sintéticos poderiam ser apresentados como evidência de produção.

## Decisão

1. Toda análise recebe um registro em `controlled_case_executions` com modo `primary`, `shadow` ou
   `replay`, versões, status e fingerprints sem conteúdo.
2. A primeira leitura do worker congela o input completo em `private.case_execution_inputs`. Retry
   devolve os mesmos bytes. Shadow e replay copiam somente o input congelado do baseline; não leem
   novamente as tabelas mutáveis do intake.
3. Shadow e replay usam outro `processing_run`. Eles nunca substituem o snapshot público, mudam o
   `current_run_id` ou atrasam a conclusão da execução principal.
4. O worker grava o relatório e manifesto completos em `private.case_execution_results`. A tabela
   pública recebe somente fingerprints, contagens e diferenças tipadas.
5. Comparação é fail-closed. Troca de input, regressão de status, falha de contrato ou etapa que
   passa a bloquear são críticos. Drift de texto do shadow permanece visível como warning. Replay
   com a mesma versão pode operar em modo estrito e tratar diferença de output como não
   determinismo.
6. Rollout é por organização e tem estados `off`, `shadow`, `canary`, `active` e `paused`. O tenant
   pode ler seu estado, mas não pode alterá-lo. Pausa é sempre permitida; saltar estados é recusado.
7. `canary` exige o primeiro lote de dez cases reais distintos, completos e sem regressão crítica.
   `active` exige outro lote de dez cases reais, sem sobreposição, mais aprovação explícita.
8. Synthetic fixtures, evals e gold cases continuam essenciais para CI, mas não contam como cases
   reais. A atestação e os dois cohorts vivem no schema `private`.
9. Liberação externa é uma decisão separada da execução técnica. Toda organização migra com
   `external_release_enabled = false` e nenhuma rotina deste Gate envia material a um investidor.
10. Inputs, relatórios, cohorts e decisões não têm grants para `authenticated`. Escrita do worker
    exige a capability temporária do job; funções de promoção permanecem internas à operação.

## Consequências

- Uma reexecução passa a responder exatamente qual input, baseline, versão e política foram usados.
- Um shadow pode falhar sem afetar a experiência ou o estado público do cliente.
- Produção pode continuar em canary por organização enquanto a evidência real é acumulada.
- Os vinte cases reais são uma condição operacional futura. A infraestrutura está pronta, mas eles
  não serão declarados concluídos antes de existirem e serem acompanhados.
- O staging Supabase é isolado e sem dados de produção. Aplicação e worker de staging devem usar
  credenciais próprias antes do primeiro case acompanhado.
