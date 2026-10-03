# Etapa 20 / 3T : revisão humana do pacote material

Aprovar o pacote registra `approve_material_package` com efeito `none`; a projeção solicita um novo brief, e autorizar execução continua sendo outro ato humano 3U.

O corte depende do produtor 3S completo. `material_package_native_review.sql` entra depois dos seis drafts 3S e do brief 3U; não há conversão de aprovação histórica. Os dois consumidores humanos (projeto e oportunidade) devem usar o mesmo comando atômico, substituindo a sequência antiga de `record_deal_state_object` e `enqueue_deal_state_analysis`.

## Portas concretas

- `read_material_package_review_basis_v1(p_work_id,p_revision_id)` entrega `capital-material-package-review-basis.v1`, com IDs exatos, fingerprint do manifesto/pacote, preparador real, audiência interna e revisão/política correntes. O produto continua no leitor físico `material_result`.
- `decide_material_package_v1(p_work_id,p_revision_id,p_manifest_fingerprint,p_act,p_note,p_self_approval_declared,p_command_id,p_basis_review_id)` admite `approve` ou `revoke_approval`; a revogação exige o ID real da aprovação.
- Recibo `capital-material-package-review.v1`: `workId`, `revisionId`, `reviewId`, `decisionId`, `act`, `effect` (`none` ou `request_followup_brief`), `jobId`, `runId`, `replayed`. O efeito não significa execução autorizada.
- Port isolado: `apps/web/src/lib/artifacts/material-package-review.ts`. A UI de projeto/oportunidade fica com o integrador. Não deve dizer que enviou ou começou execução.

## Autoridade e atomicidade

A revisão comum permanece responsável por cargo atribuído, política, separação entre preparador e aprovador, declaração de autoaprovação, nota e replay exato. O preparador é o sujeito humano fixado na receita, como nos demais produtores nativos; a conta técnica não elimina a exigência de declaração de autoaprovação. A extensão de substância reconhece somente o binding 3S comprovado, mantendo manifesto e projeções sem corpo; não cria claims, blocos ou fontes artificiais.

O trigger da revisão grava na mesma transação a decisão nativa, a projeção `package_review` interna, o job `awaiting_approval` e a proposta de brief. Um intento privado consumido na própria projeção fecha a porta antiga de enqueue, inclusive depois da aprovação na mesma transação. A falha de qualquer efeito reverte revisão, decisão e projeção.

Revogação da última aprovação ativa cancela o trabalho de continuação e seu proposal, elimina a capability e projeta `package_review` pendente; história não é sobrescrita. Nova aprovação humana depois de revogação cria outra continuação pendente, sem ressuscitar o job cancelado. Se a aprovação continua válida, revisões/replay adicionais não duplicam o trabalho.

`job_authority_is_current_v1` herda a verificação anterior e acrescenta revisão ativa e fechamento físico/de direitos para os dois jobs derivados da projeção 3T. Perda de qualquer corpo necessário fecha o follow-up e seu brief; existência de aprovação não conserva acesso depois da expiração/purga.

A ancestralidade material permanece `internal` ou `blocked` em release, mesmo aprovada. A confirmação deste pacote não cria `release_authorization`, introdução nem elegibilidade de inferência. Um futuro protocolo de saída externa deverá provar seu próprio ato e controles externos; este corte não os concede.

## Eval local e limites da prova

`test-material-package-native-review.py` monta a fixture histórica de estrutura/fatos e produz plano, autorização, claim, captura e pacote pelos comandos reais 3S; metadata de Storage é sintética e transacional, não prova HTTP. O SQL é executado em `offroad_material_eval` local, UTF8, dentro de `BEGIN/ROLLBACK`.

Provas: falha de enqueue reverte todos os efeitos; leitura/ato/replay exatos; decisão `none` e próxima execução sem approval/capability; nenhuma elegibilidade/introduction adicional; perda de corpo bloqueia autoridade dos dois jobs; revogação cancela continuação e aprovação corrente; reaprovação não revive cancelado; membership revogada nega leitura/ato; duas tabelas com FORCE RLS e quatro políticas explícitas. Seis testes do port web e typecheck passaram.

HTTP é tarefa do integrador no ambiente Supabase da CI: após o commit físico SDK 3S e antes da revogação de membership, ler a base, aprovar e repetir o mesmo comando, conferir job pendente/decisão `none`, revogar e negar continuação; nenhum modelo ou transporte externo participa do ato. SQL local não comprova migração remota, deploy nem HTTP. O draft não está aplicado ou pronto em produção.

Concorrência real local: `test-material-package-review-race.py` em clone exclusivo prova duas sessões com o mesmo command retornando um único review/decision/follow-up; duas aprovações distintas mantêm seus atos, com um único follow-up. Cada cenário contém hold real de transação, sem simular locks.

A lista `activeApprovalReviewIds` e a autoridade de continuação usam `material_package_approval_is_current_v1`: história ativa, acesso/fechamento físicos atuais, política corrente, atribuição de aprovador quando exigida e declaração de autoaprovação do preparador humano. O histórico comum de reviews permanece imutável. Os dois negativos adicionais provam política de autoaprovação retirada e atribuição real concedida/retirada; ambos deixam a história ativa, esvaziam a lista corrente e negam o follow-up. Eval local final: 11 verificações 3T SQL e duas corridas com sessões reais passaram (rollback para lifecycle, clone exclusivo para corrida).
