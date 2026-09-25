# Etapa 18, incremento 2: projeção de dependências e marcos do trabalho

Migração A de `work_dependencies_and_continuity`, arquivo `supabase/migrations/20260925010000_work_dependencies_and_continuity.sql` (o carimbo definitivo é o que o executor registrar ao aplicar em staging e produção). Teste `supabase/tests/work_dependencies_projection.sql` e extensão de `supabase/tests/rls_non_interference.sql`. Nada aqui abre escrita de cliente, caminho de worker, grant de API ou RPC nova.

## `private.execution_dependencies`

**O que guarda.** Uma linha por insumo que a execução fixou, tipada por espécie:

- `source_version`: versão de fonte, fonte lógica (`public.source_versions.source_id`), número da versão, versão do direito, recurso e hash do conteúdo. Chave lógica: a fonte lógica.
- `assumption_slot`: conjunto de premissas, versão, revisão, chave do slot, decisão de adoção e fingerprint da versão. Chave lógica: `conjunto:slot`.
- `method_release`: release da plataforma, release da casa quando existe, e o procedimento a que pertencem (`private.platform_method_releases.method_id`, o mesmo `method.methodId` do manifesto). Chave lógica: o procedimento.

Cada linha aponta, por chave estrangeira composta com `organization_id`, para a linha de origem (`execution_source_bindings`, `execution_basis_bindings` ou `execution_manifests`) e para as entidades que descreve. Um check por espécie garante que a linha traz exatamente as suas colunas e que a chave lógica deriva delas. Índices por chave lógica (consulta de impacto do incremento 3) e por execução.

**Unicidade.** Uma linha por insumo fixado, com a unicidade das próprias origens: por vínculo de fonte, por vínculo de premissa e por manifesto. Para premissas e método isso já significa uma linha por (organização, execução, espécie, chave lógica). Para fontes não: uma execução pode fixar duas versões da mesma fonte lógica quando dois slots adotados vieram de versões diferentes dela (o slot A adotado do balancete v1 e o slot B do v2, depois de um novo balancete). Exigir uma linha por chave lógica recusaria esse pedido no caminho do produto. A consulta de impacto lê todas as linhas da chave lógica. O teste cobre esse caso.

**Quem escreve.** Somente gatilhos AFTER INSERT nas três tabelas que o pedido de execução grava (`request_work_execution_as_subject_v1`), na mesma transação do pedido. Os gatilhos e o backfill leem uma única visão de mapeamento (`private.execution_dependency_sources_v1`), então escrita ao vivo e backfill não divergem. Se um insumo fixado não produzir exatamente uma linha, o pedido falha (`execution_dependency_projection_incomplete`): grafo incompleto nunca passa por completo. Não há RPC, caminho de worker nem escrita de cliente.

**Contrato.** RLS habilitada e forçada, política `execution_dependencies_deny_clients` restritiva para tudo, `revoke all` de public, anon, authenticated e service_role, guarda contra update, delete e truncate (`work_continuity_history_immutable`), `updated_at`. Sem gatilho de auditoria: é dado derivado, e as linhas de origem já são auditadas. `private.resource_dependencies` continua o registro canônico das arestas entre fontes; nenhuma aresta é copiada.

**Backfill.** `private.backfill_execution_dependencies_v1()` deriva todas as execuções existentes das mesmas linhas, é idempotente e pode reconstruir o grafo de uma execução quando o incremento 3 detectar grafo incompleto.

## `public.work_milestones`

**O que guarda.** Marcos imutáveis de um trabalho: espécie, sujeito (tipo e id), rótulo curto, revisão a que se refere quando existe, fingerprint da versão exata, resultado (`succeeded` ou `partial`, só para resultado de execução), marco que resolve ou substitui, autor, momento do ato (`occurred_at`) e momento da gravação (`created_at`). Espécies: `execution_result`, `decision`, `awaiting_human`, `human_resolved`, `continuation_proposed`, `update_adopted`. Um marco por (organização, espécie, tipo de sujeito, sujeito), o que torna toda escrita idempotente.

**Rótulo.** O texto do próprio registro quando existe (a finalidade da execução, o objetivo do plano aprovado); caso contrário, a chave estável do sujeito (por exemplo o tipo do artefato), que a interface traduz. O banco não escreve prosa própria.

**Leitura.** Política `work_milestones_select_authorized` com a mesma autoridade das demais tabelas do trabalho (`private.can_access_capital_project`, a de `work_contexts`, `work_dossiers` e das tabelas do projeto). Quem não lê o trabalho não vê o marco nem consegue sondar sua existência. Negação explícita de insert, update e delete, grant só de select para authenticated, gatilhos de `updated_at` e auditoria (`capture_identity_audit_v1`), guarda de imutabilidade e de truncate.

**Escritores deste incremento.**

1. `execution_result`: o commit de execução (`commit_work_execution_result_v1`) grava o marco na mesma transação do recibo de resultado, por patch de texto no estilo da casa, com erro `execution_result_milestone_contract_changed` se o trecho esperado não existir exatamente uma vez. O commit repetido retorna antes desse ponto e não grava segundo marco. Autor: a pessoa que pediu a execução.
2. `decision`: gatilho na transação da aprovação, para três registros que mapeiam limpo para o trabalho, são atos humanos sobre versão exata e não são reescritos depois:
   - aceite de despacho de execution brief (`capital_project_execution_brief_dispatches.accepted_at`): sujeito o brief, revisão a versão aprovada, rótulo o objetivo;
   - confirmação de artefato (`capital_project_artifact_decisions` com `confirm`): sujeito o artefato, revisão a versão do artefato; `request_changes` não é marco;
   - aprovação de configuração institucional (`private.institutional_model_configurations` de `review_required` para `approved`): sujeito a configuração, revisão a revisão aprovada; rejeição não é marco.

   A aprovação da versão seguinte da mesma série (mesmo trabalho e, no artefato, mesmo tipo) aponta em `supersedes_milestone_id` para a aprovação anterior, para que uma continuação resolva "o aprovado" sem ambiguidade entre versões.

**Backfill.** `private.backfill_work_milestones_v1()` grava os resultados já confirmados e as aprovações já dadas, na ordem das versões de cada série, e é idempotente.

## Candidatos a decisão que ficaram de fora

- `public.capital_project_decisions`: propostas de agentes; o worker as reescreve enquanto abertas e nenhum comando humano as confirma (`reviewed_by` nunca é gravado). Entram com `record_work_decision_v1` e `public.work_decisions` na etapa 20.
- `private.project_canonical_revisions`: estado derivado das aprovações, não um ato; copia o aprovador do componente e também é gravado pela propagação, que é preparo. Duplicaria os marcos acima. O incremento 5 liga os adaptadores de revisão canônica ao grafo comum.
- `private.institutional_revision_proposals`: aprovar a proposta só cria a candidata; o ato decisivo é a aprovação da configuração, já projetada.
- `private.receivables_evidence_scopes`: confirma a seleção de evidências de um método, é insumo e não aprovação de resultado; entra como dependência quando R01 passar pelo contrato comum.
- `public.adoption_decisions`: cada adoção é insumo, já rastreado como `assumption_slot`; além disso pode pertencer a oportunidade, que não é trabalho.
- `preliminary_understandings` e demais confirmações de intake: ligadas à sessão, que só às vezes aponta para um projeto; sem mapeamento limpo.

## Adiado e por quê

`awaiting_human`, `human_resolved`, `continuation_proposed` e `update_adopted` estão no check de espécie para que a tabela não mude depois, mas não têm escritor: chegam com seus comandos nos incrementos 3 (eventos, impacto, pedido de atualização) e 4 (`request_work_continuation_v1`, `adopt_work_update_v1`). Supersessão de resultado de execução fica para `update_adopted`. Nenhum evento de outbox é emitido aqui.

## Aplicação

Ordem: esta migração inteira, de uma vez; ela cria as tabelas, os gatilhos, aplica o patch do commit e roda os dois backfills. O patch depende do corpo de `commit_work_execution_result_v1` publicado em `20260923195408_execution_settled_outcome.sql` (linhas 99 e 100, o `insert` do recibo de resultado seguido do `values`); se produção divergir, a migração para com `execution_result_milestone_contract_changed`. O volume do backfill é o de execuções, resultados e aprovações existentes (poucas linhas em produção; a aplicação imprime as contagens). Depois da aplicação: renomear o arquivo para o carimbo registrado, recapturar de staging o corpo efetivo de `commit_work_execution_result_v1` (o snapshot foi derivado de uma réplica de todas as migrações), regenerar `apps/web/src/types/database.ts`, conciliar inventário e catálogos da etapa 0 e rodar os advisors.
