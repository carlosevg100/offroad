# Corpos efetivos das funções reescritas por texto

## Por que esta pasta existe

Dezenas de migrações em `supabase/migrations/` não recriam uma função com `create or replace function`. Elas leem a definição atual com `pg_get_functiondef('<schema>.<nome>(<args>)'::regprocedure)`, trocam trechos com `replace()` e executam o resultado. O corpo que roda de verdade só existe no catálogo do banco; ler as migrações em sequência não mostra a função final. Esta pasta guarda, para cada função alvo, o texto exato que `pg_get_functiondef` devolve, um arquivo por função, para que o corpo efetivo seja legível e auditável no repositório e para que nenhuma mudança nele passe sem aparecer em um diff.

## O que há aqui

- `<schema>.<nome>(<args>).sql`: a saída de `pg_get_functiondef`, byte a byte, sem edição. O nome do arquivo usa a assinatura canônica sem espaços; `timestamp with time zone` aparece como `timestamptz`.
- `MANIFEST.json`: quando e de onde o snapshot foi capturado, a lista de funções com o SHA-256 de cada arquivo e a lista de assinaturas que aparecem nas migrações mas não existem mais no catálogo.

A lista de funções alvo é derivada das próprias migrações: toda assinatura literal dentro de `pg_get_functiondef('...'::regprocedure)`, em uma linha ou em várias. Uma migração nova que use esse padrão entra no alvo sem nenhuma lista manual.

## Como a CI usa

O job `database` de `.github/workflows/quality.yml` sobe um stack local do zero com todas as migrações e roda `python3 scripts/ci/verify-effective-function-bodies.py`. O script busca `pg_get_functiondef` de cada função alvo nesse banco e compara byte a byte com o arquivo correspondente. Qualquer diferença, função ausente, função nova nas migrações sem arquivo aqui ou arquivo sem função alvo faz o job falhar com a lista das divergências. O script só lê o banco.

## Como atualizar depois de uma migração legítima

1. Aplique a migração no banco de referência: o stack local do supabase (`supabase start`, URL em `supabase status -o env`) ou staging.
2. Rode `DATABASE_URL=<url> python3 scripts/ci/verify-effective-function-bodies.py --write --source "<descrição do banco>"`. O script regenera os arquivos e o `MANIFEST.json` a partir do banco e apaga arquivos de funções que deixaram de ser alvo.
3. Revise o diff: ele mostra exatamente o que a migração mudou no corpo efetivo.
4. Faça o commit na mesma PR da migração.

Sem `--write`, o script apenas compara. `--offline` confere a integridade do manifesto, os hashes dos arquivos e a cobertura das migrações sem precisar de banco.

## O que este snapshot não é

Não é fonte de verdade do schema. A fonte de verdade continua sendo `supabase/migrations/`, aplicada em ordem. Estes arquivos são a leitura legível do resultado e o guarda de deriva; editá-los à mão não muda o banco e faz a CI falhar.

A captura inicial, de 23/09/2026, veio do projeto de staging `gjkkjtbfnssdsbmlhmwk`, com o SHA-256 de cada corpo conferido contra o valor calculado pelo próprio banco. Staging pode estar à frente de `main` (migrações de PRs ainda abertas) ou carregar efeitos de migrações que só existem lá. Quando isso acontece, a CI, que constrói o banco do zero a partir dos arquivos, aponta a função. Essa diferença é real e se resolve com `--write` contra o banco correto depois que a migração pertinente chega em `main`.

## Limites conhecidos

Migrações que reescrevem funções por formas dinâmicas não entram no alvo automático: loops sobre arrays de assinaturas, `to_regprocedure` com concatenação, `format()` com o nome da função ou seleção por conteúdo de `pg_proc`. Em 23/09/2026 isso ocorre em 16 migrações, entre elas `20260908035026_explicit_execution_brief_approval.sql`, `20260910153117_confirmed_receivables_support_sheets_v2.sql`, `20260915204116_explicit_legacy_resource_access.sql`, `20260916163753_resource_policy_and_barriers.sql` e `20260922153436_execution_authority_commands.sql`. Parte das funções que elas tocam já está aqui porque também aparece na forma literal; o restante fica para um incremento que estenda a regra de alvo.
