# Etapa 17 / 3O: identidade do operador e do fundador

Correção dos achados de auditoria de 23/09/2026 sobre autoridade humana: a linha que liga um método publicado à fila de execução era auto-atestada, sem trilha e inserida por SQL solto; pausa e publicação gravavam "aprovado por" como texto, sem vínculo a usuário; o pedido de execução com sujeito explícito não tinha registro de chamadores.

## O que muda

`private.platform_principals` registra fundador e operadores por `auth.users`; só a revogação altera uma linha e nada é apagado. O fundador entra na migração onde a conta existe (produção) e os bancos descartáveis semeiam o próprio. `require_platform_principal_v1` exige o papel de operador do banco mais um principal ativo, e a conta viva.

Perfis de método: `execution_profile_registrations` é um ledger imutável preenchido por gatilho em toda inserção, com hash da evidência de revisão, ator, comando, razão, `recorded_by`, `session_user` e `application_name`. `register_execution_method_profile_v1` é o caminho governado: exige principal, evidência de revisão fixada em `knowledge/reviews`, é idempotente por comando e recusa reaproveitar o comando para outro perfil. Inserções diretas do operador continuam possíveis, ficam ledgeradas sem identidade e são o que o completion de produção deve mostrar como zero.

Pausas de release: `granted_by_user_id` na concessão, `receivables_release_pause_events` ledgerando toda escrita (inclusive edição direta) e `pause_receivables_release_v1` como comando idempotente que vincula o principal. A serialização de 3K permanece.

Aprovação de conteúdo: `platform_method_attestations.actor_user_id`, `attest_platform_method_candidate_v2` exigindo principal (fundador para `content_approval`) e `publish_platform_method_v1` recusando publicar sem a identidade do fundador quando há fundador registrado; o release grava `approvedByUserId`. Bancos sem fundador registrado (CI do zero) conservam o fluxo v1.

Pedido de execução com sujeito explícito: sem grant e com um único chamador conhecido, o wrapper humano; a prova varre o catálogo.

## Provas

`supabase/tests/platform_operator_identity.sql`: imutabilidade e revogação final de principais; inserção direta ledgerada sem identidade; comando de perfil por identidade desconhecida ou revisão sem caminho fixado recusado; registro, replay e reuso de comando; perfil e ledger imutáveis; pausa por comando com principal, replay, edição direta ledgerada; aprovação por operador ou identidade desconhecida recusada; aprovação por rótulo não publica com fundador registrado; aprovação v2 do fundador publica com `approvedByUserId`; atestação imutável; comandos negados ao tenant e sem grant de API; registro de chamadores. Executada em staging com rollback. Nada aqui concede execução, amplia grant de API ou toca o produtor. TRUST-APP-01, TRUST-SDLC-01.
