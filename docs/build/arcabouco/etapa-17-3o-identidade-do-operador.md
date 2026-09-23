# Etapa 17 / 3O: identidade do operador e do fundador

Correção dos achados de auditoria de 23/09/2026 sobre autoridade humana: a linha que liga um método publicado à fila de execução era auto-atestada, sem trilha e inserida por SQL solto; pausa e publicação gravavam "aprovado por" como texto, sem vínculo a usuário; o pedido de execução com sujeito explícito não tinha registro de chamadores.

## O que muda

`private.platform_principals` registra fundador e operadores por `auth.users`; só a revogação altera uma linha e nada é apagado. O fundador entra na migração onde a conta existe (produção) e os bancos descartáveis semeiam o próprio. `require_platform_principal_v1` exige o papel de operador do banco mais um principal ativo, e a conta viva.

Perfis de método: `execution_profile_registrations` é um ledger imutável preenchido por gatilho em toda inserção, com hash da evidência de revisão, ator, comando, razão, `recorded_by`, `session_user` e `application_name`. `register_execution_method_profile_v1` é o caminho governado: exige principal, evidência de revisão fixada em `knowledge/reviews`, é idempotente por comando e recusa reaproveitar o comando para outro perfil. Inserções diretas do operador continuam possíveis, ficam ledgeradas sem identidade e são o que o completion de produção deve mostrar como zero.

Pausas de release: `granted_by_user_id` na concessão, `receivables_release_pause_events` ledgerando toda escrita (inclusive edição direta) e `pause_receivables_release_v1` como comando idempotente que vincula o principal. A serialização de 3K permanece.

Aprovação de conteúdo: `platform_method_attestations.actor_user_id`, `attest_platform_method_candidate_v2` exigindo principal (fundador para `content_approval`) e `publish_platform_method_v1` recusando publicar sem a identidade do fundador quando há fundador registrado; o release guarda a identidade do fundador na coluna privada `approved_by_user_id`, fora do JSON de aprovação que o tenant lista. Bancos sem fundador registrado (CI do zero) conservam o fluxo v1.

Pedido de execução com sujeito explícito: sem grant e com um único chamador conhecido, o wrapper humano; a prova varre o catálogo.

## Segunda parte, após a revisão independente

A revisão da primeira migração apontou quatro brechas e uma decisão pendente. A migração `platform_operator_identity_hardening` fecha as brechas:

- Identidade declarada é verificada: `platform_actor_identity_v1` só aceita `offroad.actor_user_id` que nomeie um principal ativo com conta viva; qualquer outro valor levanta `platform_principal_required`. O gatilho de atestação exige que o rótulo gravado seja o rótulo do principal.
- Escrita direta não herda identidade: o ledger de pausa grava `granted_by_user_id` só a partir do comando validado, nunca da linha tocada; uma edição direta fica ledgerada com identidade nula.
- Revogação carrega quem e por quê: `revoked_by` e `revoked_reason` são obrigatórios juntos; revogar sem razão é recusado e nada volta atrás depois.
- Nada é truncado: gatilhos `before truncate` em principais e nos dois ledgers.
- Comandos serializam por id de comando (advisory lock transacional) e o replay compara todos os efeitos, inclusive a nota da pausa e a razão do registro.

Decisão sobre a identidade do fundador nos releases (item 3 da revisão): a identidade vai para a coluna privada `approved_by_user_id`, preenchida só por publicações feitas pelo comando com identidade. Os dois releases anteriores ao registro de principais (`r01-2026.09.06-v1` e `prepare-capital-structure-decision-2026.09.21-v4`) ficam com a coluna nula: a aprovação de conteúdo da v4 foi registrada por rótulo, antes de existir principal, e o sistema não vincula uma identidade que não verificou na hora. O recibo de publicação da v4 e a instrução do fundador de 23/09/2026 são o registro humano dessa aprovação. As linhas de release são imutáveis e a migração não faz backfill.

O id de usuário do fundador aparece na migração que o registra como principal. É um identificador, não um segredo: nenhuma autorização depende de ele ser desconhecido.

Estampas: staging `20260923202101`, produção `20260923203112`. Oito funções, três gatilhos e três colunas com definição idêntica nos dois projetos; advisors de segurança zero. Em staging a migração rodou com um backfill condicionado a um principal fundador que lá não existe; o texto final, sem o backfill, tem efeito idêntico.

## Terceira parte, após a segunda revisão independente

A revisão do endurecimento aprovou com duas condições e quatro pontos menores. A migração `platform_operator_identity_ledger_guard` fecha todos:

- O ledger de perfis verifica a identidade declarada com `platform_actor_identity_v1`, como o ledger de pausas; um valor que não é uuid é recusado como principal ausente, e não como erro de formato.
- A revogação grava `session_user`, quem de fato entrou na sessão, e não o dono da função.
- Uma atestação com identidade explícita também exige conta viva, não só principal ativo; o rótulo do principal é guardado sem espaços nas pontas.
- Atestações, eventos de publicação, releases e perfis também recusam truncamento.

Estampas: staging `20260923205449`, produção `PROD_STAMP_TBD`. Prova executada em staging com rollback, com as asserções novas: identidade forjada e identidade malformada não entram no ledger de perfis; `revoked_by` é o usuário da sessão; rótulo com espaços recusado; atestação direta por conta banida recusada; truncamento recusado em cascata nas duas tabelas referenciadas por chave estrangeira.

## Provas

`supabase/tests/platform_operator_identity.sql`: imutabilidade e revogação final de principais; inserção direta ledgerada sem identidade; comando de perfil por identidade desconhecida ou revisão sem caminho fixado recusado; registro, replay e reuso de comando; perfil e ledger imutáveis; pausa por comando com principal, replay, edição direta ledgerada; aprovação por operador ou identidade desconhecida recusada; aprovação por rótulo não publica com fundador registrado; aprovação v2 do fundador publica com a identidade na coluna privada; atestação imutável; comandos negados ao tenant e sem grant de API; registro de chamadores. Segunda parte: revogação exige razão e grava quem revogou; principal banido não age; edição direta do ledger de pausa fica com identidade nula; replay de pausa com outra nota recusado; truncamento recusado nos três ledgers; atestação v2 sobre atestação v1 recusada como reuso de comando; identidade forjada por GUC recusada; release com a coluna privada e sem `approvedByUserId` no JSON; grants negados também para `platform_actor_identity_v1` e `guard_platform_ledger_truncate_v1`. Executada em staging com rollback nas duas partes. Nada aqui concede execução, amplia grant de API ou toca o produtor. TRUST-APP-01, TRUST-SDLC-01.
