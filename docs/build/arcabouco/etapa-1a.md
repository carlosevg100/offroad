# Etapa 1A: autoridade ativa e revogável

Status: candidata; aplicada somente em staging como `20260915120825_active_organization_authority` e `20260915121913_organization_profile_authority`. Produção permanece inalterada até a verificação dos contratos SQL e da concorrência na CI. O gate de paridade de produção permanece obrigatório e bloqueia o merge enquanto o journal e o inventário não estiverem conciliados.

## Contrato

`created_by` registra proveniência. Somente membership ativa owner/admin satisfaz `private.can_manage_organization`. Inserção, atualização e exclusão de memberships não permitem autopromoção nem mutação de identidade. Owner administra papéis não-owner; admin administra papéis abaixo de admin. A transferência entre pessoas ativas ocorre exclusivamente pelo RPC, serializada pela organização, com revalidação de autoridade após a espera pelo lock.

`public.create_organization_with_owner_v1` cria uma organização nova e a membership inicial na mesma transação. Não aceita organização existente nem identidade de owner fornecida pelo cliente. Os comandos existentes `initialize_professional_onboarding` e `complete_onboarding` delegam a esse comando: a aplicação publicada continua compatível durante o corte dos INSERTs antigos. O cadastro recebe um teste de contrato para nunca reintroduzir fallback de bootstrap direto.

A transferência promove o destinatário e rebaixa o owner anterior para admin na mesma transação. Isso preserva administração legítima; a revogação posterior da membership retira a autoridade, inclusive do criador histórico. Memberships e transferências geram auditoria. Nenhuma membership de produção é promovida, reativada ou preenchida por backfill.

## Reprodução e verificação

A revisão dos escritores privilegiados encontrou dois atalhos adicionais. `save_guided_company_profile` exige gestão ativa da organização; `save_project_company_profile` exige essa autoridade quando o projeto altera a identidade de um workspace de companhia. Projetos de clientes em workspace de assessor preservam o contrato existente. Ambos os atalhos foram reproduzidos com um criador rebaixado para member e negados pela segunda migração; o admin ativo continua autorizado. `organization_profile_authority.sql` registra essa regressão.

O probe `creator-authority-before-after.sql` usa somente fixtures sintéticas e rollback. Antes da correção, o criador suspenso podia administrar a organização, convidar e reativar a si próprio; removido, podia inserir novamente uma membership owner. O UPDATE de outra membership já era invisível ao suspenso, por SELECT RLS, e não foi contado como exploração reproduzida. Depois: todos os seis resultados são falsos.

`supabase/tests/creator_authority_revocation.sql` passou em staging: suspensão, revogação, rebaixamento, remoção, negativa de reinserção/autopromoção, administração legítima, transferência auditada, bloqueio de segunda transferência pelo antigo owner, cadastro atômico/idempotente e bloqueio de bootstrap anônimo/direto. `rls_non_interference.sql` também recebe regressão de revogação com JWT inalterado.

O conector de staging serializou a tentativa de concorrência: uma transferência passou e a seguinte foi negada, sem provar espera por lock. A prova concorrente é feita na CI por `scripts/ci/test-owner-transfer-concurrency.py`, com duas conexões, barreira explícita e observação de `pg_stat_activity.wait_event_type='Lock'`. Ela só aceita um vencedor e um owner ativo. O runner recusa banco remoto.

Fixtures do teste concorrente foram removidas de staging; zero usuários e organizações reservados permaneceram. A limpeza usa uma sessão de teste com triggers suspensos para IDs reservados porque o trigger histórico de DELETE da organização tenta auditar uma organização já removida. Isso não altera o schema, RLS ou execução da aplicação; não é usado em produção.

## Controles, implantação e retorno

Controles: IAM-05, IAM-07, DATA-03, APP-01, APP-09, OPS-01 e SDLC-08. Dados: identidade, memberships e metadados de auditoria; nenhum novo provedor, envio externo, conteúdo financeiro ou política de retenção.

A inspeção somente de contagens confirmou duas organizações de produção e zero sem owner ativo. Se uma organização sem owner surgir, permanece protegida para recuperação administrativa auditada; o criador não é reativado automaticamente.

A publicação exige CI, journal/catálogo conciliados, tipos gerados, advisors, web e worker no commit entregue. O rollback de aplicação mantém os comandos compatíveis e a fronteira nova. Nunca restaurar o ramo de autoridade por criador ou o INSERT de bootstrap antigo para corrigir falha operacional.

O completion externo da onda registra commits, runs, carimbos e resultados efetivos. Este documento não declara uma publicação ainda pendente.
