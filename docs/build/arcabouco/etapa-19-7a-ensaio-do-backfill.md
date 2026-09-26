# Etapa 19, incremento 7A: ensaio do backfill de artefatos em staging

O pronto da etapa pede a migração e o backfill aplicados nos dois ambientes, "com o backfill de produção conferido linha a linha contra as tabelas de origem (133 linhas na abertura) e o de staging ensaiado com fixture sintética". Produção foi conferida na aplicação da 2b (`etapa-19-2-protocolo-de-revisao.md`, 133 revisões `legacy`). Staging não tem linha nos quatro depósitos históricos e a migração A projetou zero lá, então o ensaio traz a própria fixture. Arquivos: `scripts/staging/artifact-backfill-rehearsal.sql` (o texto que o lead cola no console de staging) e `supabase/tests/artifact_backfill_rehearsal.sql` (a mesma prova no job `database` da CI, sobre a pilha local do Supabase).

## Como o lead roda

- Colar o arquivo inteiro no console SQL de staging, o que aceita um texto com vários comandos e devolve só a mensagem de erro ou o último resultado. O texto é um único comando `do`: não usa meta-comando do psql, não tem `begin`, `commit` nem `rollback` e não depende de como o console agrupa comandos.
- Resultado esperado: a mensagem de erro começa com `artifact_backfill_rehearsal_passed:` e traz as contagens das duas passagens, `first run {"dealStateMaterials": 1, "caseArtifactManifests": 1, "capitalProjectArtifacts": 3, "institutionalModelResults": 1}, second run {"dealStateMaterials": 0, "caseArtifactManifests": 0, "capitalProjectArtifacts": 0, "institutionalModelResults": 0}`. Qualquer outra mensagem é falha, com o nome da checagem que falhou.
- Nada fica: a exceção final desfaz o comando inteiro, a fixture, as revisões e a desativação dos gatilhos, que voltam habilitados com o rollback. Rodar de novo dá o mesmo resultado.
- Papel: o dono das quatro tabelas históricas (`alter table ... disable trigger`), com escrita em `auth.users` (um usuário sintético). `lock_timeout` de 5 segundos.

## A fixture

Inquilino sintético com uuids RFC 9562 fixos de prefixo `a4199000`, que nenhum teste usa (`a4197000` é dos scripts de recomputação da CI).

| Linhas | Por quê |
| --- | --- |
| usuário, organização, participação de dono, trabalho, sessão de intake | o inquilino e o trabalho das revisões |
| execução de processamento e job `agent_operation_brief` | `capital_project_artifacts.processing_job_id`; sem sessão autenticada, o vínculo de autoridade do job toma o criador da execução |
| plano com a tarefa `S11` e duas execuções de tarefa | `plan_id` e `task_run_id`; a restrição única por execução de tarefa e tipo pede uma execução por versão |
| configuração institucional e a mensagem que pediu o resultado | `configuration_id`; um resultado que não é recomputação tem `origin_message_id` gerado igual ao próprio id, com chave estrangeira para `agent_messages` |
| `capital_project_artifacts`: `meeting_brief` versões 1 (`superseded`) e 2 (`pending_confirmation`), `alternative_map` versão 1 | dois tipos, duas versões de um deles |
| `case_artifact_manifests`, `institutional_model_results` concluído com `artifact.fingerprint` hexadecimal, `deal_state_objects` `material_artifact` e `understanding_snapshot` | um de cada depósito e um objeto que o backfill não alcança |

As linhas históricas são gravadas com os quatro gatilhos `artifact_revision_projection` desabilitados, como linhas anteriores à migração A. Cada fingerprint é o sha256 do texto jsonb do próprio conteúdo.

## As checagens

| Checagem | Exceção quando falha |
| --- | --- |
| nenhuma revisão nem artefato do inquilino antes do backfill, prova de que os gatilhos estavam desligados | `artifact_backfill_rehearsal_projected_before_backfill` |
| os quatro gatilhos religados | `artifact_backfill_rehearsal_trigger_not_enabled` |
| contagens `{3,1,1,1}` e exatamente seis revisões novas no banco inteiro | `artifact_backfill_rehearsal_counts` |
| cada revisão projetada: o id v5 de `private.artifact_projection_revision_id_v1`, conferido também de forma independente por `uuid_generate_v5` com o nome `offroad:artifact-revision:<tabela>:<linha>` e versão 5; origem `legacy`; audiência `internal`; sem autor; o fingerprint da linha verbatim em `legacy_ref`, igual a `manifest.legacy`; sem bytes (`content_sha256`, `byte_length` e `manifest.bytes` nulos); sem bloco, método, execução, retrato de insumos ou fonte; `institutionalResult` só no resultado institucional, igual a `{id, configurationFingerprint}` da linha; o artefato com `kind`, `subject` e `legacy_origin` do depósito | `artifact_backfill_rehearsal_revision` |
| nenhum vínculo, salvo o do resultado institucional para ele mesmo | `artifact_backfill_rehearsal_links` |
| seis linhas conferidas | `artifact_backfill_rehearsal_rows` |
| o objeto que não é material fica sem revisão | `artifact_backfill_rehearsal_non_material_projected` |
| as versões 1 e 2 do mesmo tipo são as revisões 1 e 2 de um artefato, a cabeça na 2 e `previous_revision_id` da 2 apontando a 1 | `artifact_backfill_rehearsal_versions` |
| cinco artefatos, cada um com a cabeça na revisão mais alta | `artifact_backfill_rehearsal_heads` |
| a segunda passagem devolve zeros e não grava nada | `artifact_backfill_rehearsal_second_run` |
| `offroad.artifact_backfill` em `off` depois | `artifact_backfill_rehearsal_flag` |
| uma linha escrita depois do backfill é projetada pelo gatilho com a origem do escritor (`worker`), como revisão 2 do artefato de materiais, com a cabeça nela | `artifact_backfill_rehearsal_after_backfill` |

## Prova local

Réplica descartável, nunca um banco do projeto: Postgres 18.4 do Homebrew, sem Docker, com o bootstrap mínimo dos incrementos anteriores (papéis `anon`, `authenticated`, `service_role`, `authenticator`, `supabase_admin` e afins; esquemas `extensions`, `auth`, `storage` e `supabase_migrations`; `pgcrypto` e `uuid-ossp` em `extensions`; `auth.users` com `auth.uid()`, `auth.jwt()`, `auth.role()` e `auth.email()`; `storage.buckets`, `storage.objects` e as funções auxiliares; um substituto de pgvector só com o tipo e o método de acesso). Todas as migrações do zero, cada uma com `--single-transaction`, parando na primeira falha.

```sh
PGBIN=/opt/homebrew/opt/postgresql@18/bin
export PGHOST=127.0.0.1 PGPORT=54397 PGUSER=postgres PGDATABASE=postgres
"$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 --locale=en_US.UTF-8
# postgresql.conf: port 54397, listen_addresses 127.0.0.1, extension_control_path com o substituto
# de pgvector, max_locks_per_transaction 512, fsync off
"$PGBIN/pg_ctl" -D "$DATA" -l postgres.log -w start
"$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -f bootstrap.sql
for f in supabase/migrations/*.sql; do
  "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$f" || break
  # e a versão registrada em supabase_migrations.schema_migrations
done
# applied 401 migrations in 9s; a última, 20260926183957

# Cada rodada: a contagem exata de linhas de todas as tabelas de public, private, auth, storage,
# extensions e supabase_migrations antes e depois, e o arquivo inteiro enviado como um texto só,
# como o console faz.
"$PGBIN/psql" -X -A -t -q -f rowcounts.sql > before.txt
"$PGBIN/psql" -X -c "$(cat scripts/staging/artifact-backfill-rehearsal.sql)"
"$PGBIN/psql" -X -A -t -q -f rowcounts.sql > after.txt
diff before.txt after.txt
```

Saída das duas rodadas, na réplica recém-criada:

```text
=== run 1 ===
ERROR:  artifact_backfill_rehearsal_passed: first run {"dealStateMaterials": 1, "caseArtifactManifests": 1, "capitalProjectArtifacts": 3, "institutionalModelResults": 1}, second run {"dealStateMaterials": 0, "caseArtifactManifests": 0, "capitalProjectArtifacts": 0, "institutionalModelResults": 0}
CONTEXT:  PL/pgSQL function inline_code_block line 190 at RAISE
psql exit: 1
tables counted: 262, rows before: 426, rows after: 426
row counts: identical before and after
projection triggers enabled: 4
=== run 2 ===
ERROR:  artifact_backfill_rehearsal_passed: first run {"dealStateMaterials": 1, "caseArtifactManifests": 1, "capitalProjectArtifacts": 3, "institutionalModelResults": 1}, second run {"dealStateMaterials": 0, "caseArtifactManifests": 0, "capitalProjectArtifacts": 0, "institutionalModelResults": 0}
CONTEXT:  PL/pgSQL function inline_code_block line 190 at RAISE
psql exit: 1
tables counted: 262, rows before: 426, rows after: 426
row counts: identical before and after
projection triggers enabled: 4
```

A prova da CI na mesma réplica, da raiz do repositório como o job `database` roda (`psql -v ON_ERROR_STOP=1 -q -f supabase/tests/artifact_backfill_rehearsal.sql`), passou nas duas rodadas e com as 259 tabelas de `public`, `private` e `auth.users` intactas; com a contagem esperada alterada no arquivo, ela para com `staging rehearsal run 1 did not pass: artifact_backfill_rehearsal_counts: ...`.

As checagens não são vazias: nove mutantes do texto, cada um quebrando uma promessa, pararam na exceção da checagem correspondente e nunca em `passed`. Gatilho de `capital_project_artifacts` ou de `deal_state_objects` deixado ligado: `projected_before_backfill`. Contagem devolvida diferente: `counts`. Flag ligada depois: `flag`. Linha sem projeção gravada entre as passagens: `second_run`. Fingerprint esperado diferente do verbatim: `revision`. Vínculo esperado onde não há: `links`. Versões trocadas: `versions`. Nome v5 diferente do da migração: `revision`.

## Limites

- A réplica é Postgres 18 sem a pilha do Supabase; staging roda Postgres 17 com a pilha. Por isso a prova também está na CI (`supabase/tests/artifact_backfill_rehearsal.sql`), que lê o mesmo arquivo e o executa duas vezes na pilha local do Supabase.
- O ensaio prova o backfill sobre linhas sintéticas; os dados reais foram conferidos em produção na aplicação da 2b.
- A checagem de contagens exige que o backfill grave exatamente as seis revisões do inquilino sintético. Em staging não há linha histórica sem projeção: a migração A projetou zero e os gatilhos projetam cada linha nova. Se houver, a checagem falha e diz quantas revisões foram gravadas.
- O texto grava um usuário sintético em `auth.users` e desabilita gatilhos dentro da própria transação; o rollback desfaz os dois.

## O que o lead faz

1. Rodar o arquivo no console de staging e guardar a mensagem devolvida.
2. Anotar o resultado no fechamento da etapa (`etapa-19-7-fechamento.md`).

## Resultado em staging, 26/09/2026

O lead rodou o arquivo no console de staging, como um texto só, depois da aplicação das migrações A (`20260926183532`) e dos templates versionados (`20260926190646`). A mensagem devolvida foi a de aprovação, com as mesmas contagens da réplica local:

```
artifact_backfill_rehearsal_passed: first run {"dealStateMaterials": 1, "caseArtifactManifests": 1, "capitalProjectArtifacts": 3, "institutionalModelResults": 1}, second run {"dealStateMaterials": 0, "caseArtifactManifests": 0, "capitalProjectArtifacts": 0, "institutionalModelResults": 0}
```

Conferido logo depois: staging continua com zero revisões, zero artefatos, nenhuma linha do tenant sintético (nem a organização, nem o usuário) e os quatro gatilhos de projeção ligados.
