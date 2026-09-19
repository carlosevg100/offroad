# Etapa 14: ingresso de novos métodos-base da Offroad

O fechamento anterior cobria composições da casa e a importação histórica do R01. Não
cobria o ingresso de um novo método-base. A abertura da etapa 15 reproduziu a ausência
em staging (`method_base_unavailable`) e confirmou que produção e staging tinham apenas
R01. O fundador autorizou corrigir a dependência antes de retomar a etapa 15.

## Autoridade e publicação

A operação existente da plataforma, usando o papel de banco `postgres`, registra o corpus
pela família de comandos privados `submit_platform_method_candidate_v1`,
`attest_platform_method_candidate_v1`, `publish_platform_method_v1` e
`retire_platform_method_v1`. São SECURITY INVOKER e não concedem acesso a anon,
authenticated ou service_role. O worker e o administrador do cliente não publicam corpus
global. Não há novo papel de usuário, credencial, tela administrativa ou delegação implícita.

O operador registra atos comprovados por artefatos de revisão. O nome do autor/revisor
é proveniência, nunca autorização de acesso. Um administrador do banco continua sendo
uma autoridade de infraestrutura confiada: a base não autentica a pessoa a partir de uma
string, nem converte revisão por IA em aprovação humana. O operador verifica a aprovação
original e seus bytes em main antes de registrar o ato. A aprovação de uma onda não
substitui a aprovação do conteúdo. O runbook abaixo explicita essa fronteira.

Três tabelas privadas, imutáveis e com RLS forçada, conservam candidata, atestações e
atos de publicação: `platform_method_candidates`, `platform_method_attestations` e
`platform_method_publication_events`. A candidata fixa manifesto, componentes, provas,
commit de origem e autor. Revisão técnica exige revisor distinto do autor; aprovação de
conteúdo é ato humano separado e vinculado ao mesmo manifesto. Repetição idêntica é
idempotente; reutilizar identificador com outro conteúdo é negado. A publicação concorrente
serializa pela candidata. Retirar conserva histórico e impede republicar a mesma candidata.

A publicação insere o corpus e sua capacidade em uma transação, mantendo `released=false`
e exposição `internal`. O método pode ser composto e revisado no catálogo; o worker
continua recusando sua execução. A ativação pertence aos gates de execução posteriores.
A retirada bloqueia nova composição e publicação da casa e pausa a capacidade. R01 conserva
seu manifesto, aprovação e caminho de pausa anteriores.

## Preparação e operação

1. Completar o conteúdo e compilar o manifesto tipado como pronto para revisão, com provas
   executadas. O estágio mínimo é `tested`; candidato editorial incompleto é recusado.
2. Guardar as revisões em `packages/credit-playbook/knowledge/reviews/`, vinculadas ao
   `manifestHash`. Cada registro contém `kind` (`technical_review` ou `content_approval`),
   `actor`, `result=approved`, `humanApproval`, `occurredAt`, `manifestHash` e `rationale`.
   A aprovação humana deve corresponder ao ato real do fundador, com seu registro original
   referenciado no racional. Não produzir esse registro antes do ato. Revisão por IA deve
   declarar `humanApproval=false` e identificar o revisor como tal.
3. Integrar os arquivos revisados em main e atualizar `origin/main`. Executar
   `node packages/credit-playbook/scripts/prepare-platform-method.mjs COMMIT MANIFEST_PATH TECHNICAL_REVIEW_PATH CONTENT_APPROVAL_PATH AUTHOR OUTPUT`.
   A ferramenta só aceita commit pertencente à main do repositório autorizado e arquivos
   regulares daquele commit. Confere todos os hashes de fonte, compilador, executor,
   provas e aprovações. Cria um payload novo sem conexão com banco e sem habilitar execução.
4. Conferir o payload e a aprovação original. Pelo canal administrativo existente, enviar
   `bundle`, `releaseId`, `author` e UUID novo a `private.submit_platform_method_candidate_v1`.
   Conservar o fingerprint retornado. Registrar cada uma das duas revisões com UUID próprio
   em `private.attest_platform_method_candidate_v1`, usando exatamente as evidências do payload.
5. Publicar por `private.publish_platform_method_v1`, vinculando UUID do comando, candidata,
   fingerprint e motivo. Conferir a linha no corpus, o evento e `released=false`. Reproduzir
   o procedimento primeiro em staging; não copiar dados de cliente. Para conteúdo real aprovado,
   usar os mesmos bytes em produção; não usar fixtures. Não inserir diretamente no corpus.
6. Para retirada, chamar `private.retire_platform_method_v1` com o fingerprint original e
   motivo. A operação não apaga o ato humano nem o método histórico. Uma revisão de conteúdo
   exige nova versão. Ativar um executor não faz parte deste runbook.

A ferramenta não busca aprovação no texto de uma fonte e não faz download de conteúdo por
URL. Sua saída não é uma concessão de acesso. As tabelas novas contêm corpus da própria
Offroad, referências e atos, sem dados de trabalho de clientes ou conteúdo financeiro privado.

## Verificação

`platform-method-publication.test.ts` verifica bytes alterados, manifesto incompleto,
aprovação de outra versão, autor fazendo a própria revisão, aprovação futura, arquivo
faltante, path traversal e tentativa de usar ato de onda/IA como aprovação de conteúdo.
`platform_method_publication.sql` exercita comando real, falta de revisão/aprovação,
provas divergentes, negação a cliente/worker, imutabilidade, repetição, retirada e catálogo
sem ativação. `test-platform-method-concurrency.py` usa duas sessões reais no banco local
da CI e prova um único evento, sem mistura ou ativação. Fixtures nunca vão à produção.

Regressões de composição, direitos, execução fixada, legado e isolamento continuam gates.
O inventário e os journals serão conciliados com o carimbo efetivamente aplicado. O
completion externo registra CI, merge, migrações e implantação exata após a verificação.

## Limites e riscos atribuídos

Este incremento não aprova o procedimento de capital, não cria um executor universal e não
ativa capacidades novas. Conteúdo profissional fica na 15, retenção na 16, execução e
continuidade em 17/18, alarmes com destino na 18 e auditoria integral na 22. A autoria e
aprovação dos métodos são preservadas, sem alçada global para tenants. Controle de acesso
à conta administrativa permanece dentro das lacunas operacionais existentes; a correção
não declara nova verificação de IAM ou MFA. Contenção: retirada do método e pausa da
capacidade; conservar histórico e corrigir para frente.

## Recibos de banco, 19/09/2026

| Migração | Produção | Staging |
| --- | --- | --- |
| platform_method_publication_commands | 20260919175916 | 20260919171641 |
| platform_method_attestation_replay | 20260919175924 | 20260919172752 |
| preserve_published_platform_method_identity | 20260919175930 | 20260919173017 |

Textos idênticos entre arquivo e ambos os journals. Os 357 arquivos têm versão no journal
de produção. Quinze superfícies adicionais conciliadas; oito definições de função idênticas.
Tipos públicos regenerados sem mudança. Advisors de segurança: zero nos dois ambientes.
As três tabelas novas permanecem vazias em produção; R01 conserva manifesto e aprovação.
Os 96 contratos SQL passaram em staging, com rollback; os oito testes novos de preparação
e o check local completo passaram. Concorrência de duas sessões e replay integral são gates
da CI, cujos resultados efetivos são registrados no completion após a publicação.
