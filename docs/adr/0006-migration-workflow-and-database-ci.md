# ADR 0006: Workflow de migrations (MCP + arquivos alinhados) e CI de banco

Status: accepted
Data: 2026-08-18

## Contexto

As migrations foram aplicadas no projeto hospedado através da ferramenta MCP da
Supabase, que carimba a própria versão ao aplicar; os arquivos locais tinham
outros timestamps. Consequência: `supabase migration list`/`db push` divergiam
do histórico remoto, e nada em CI exercitava o banco (o teste de RLS só rodava à
mão). Os agentes que operam o repositório (Claude Code, Codex) usam o MCP e não
têm a CLI autenticada.

## Decisão

1. Os arquivos em `supabase/migrations/` usam **a versão registrada no projeto**
   (`supabase_migrations.schema_migrations`). Os dez arquivos originais foram
   renomeados em 18/08/2026; nenhuma escrita no banco foi necessária.
2. Fluxo para novas migrations (AGENTS.md §6): escrever o arquivo → aplicar via
   MCP `apply_migration` com o mesmo `name` (ou `supabase db push` quando a CLI
   estiver vinculada) → `list_migrations` → renomear o arquivo para a versão
   registrada → regenerar `apps/web/src/types/database.ts` → advisors → teste
   de RLS.
3. CI (`.github/workflows/quality.yml`): o job `database` sobe um stack Supabase
   local, aplica todas as migrations do zero, executa
   `supabase/tests/rls_non_interference.sql` e `supabase db lint`; o job `e2e`
   sobe o mesmo stack, constrói o app contra ele e roda a jornada Playwright.
   Ambos são checks obrigatórios em `main`, junto com `check` e Vercel.
4. Nunca editar migration aplicada; correções são novas migrations.

## Consequências

Histórico único e reprodutível; qualquer PR prova que a sequência de migrations
é replicável e que a isolação de tenants continua válida. Custo: ~2 min de CI
por job e a disciplina de renomear o arquivo após aplicar via MCP.
