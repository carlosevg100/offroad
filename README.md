# Offroad Capital

Monorepo oficial da Offroad Capital, originação de crédito privado e acesso ao mercado,
impulsionada por IA. Este repositório contém o site institucional bilíngue, a aplicação
autenticada (empresas, advisors/originadores e provedores de capital) e os núcleos
determinísticos de domínio.

## Estado atual

- Produção: <https://offroad.capital> (Vercel, deploy a partir de `main`; `www` redireciona para o apex; site permanece `noindex` até a liberação de marca).
- Backend: projeto Supabase `offroad-development` (São Paulo, `sa-east-1`), Auth (código de 6 dígitos por e-mail via Resend), Postgres 17 com RLS em todas as tabelas, Storage privado. É o único projeto: **não há staging separado**.
- Operacional hoje: site bilíngue, cadastro/verificação/recuperação, onboarding por perfil, workspace autenticado, novo case (documentos primeiro ou manual), upload privado com SHA-256 e revisão de evidências, pacote de aceitação Rede Horizonte verificado por hash, núcleos `financial-core`/`matching-core`/`evidence-compiler`/`domain-contracts` iniciais.
- Ainda não operacional: extração geral de documentos (OCR/parsers/LLM), sala de crédito completa, matching persistido e discovery de provedores, outputs gerados, agentes, admin interno, Sentry/PostHog externos, MFA.

A orientação completa (produto, arquitetura, rotas, dados, segurança, dívidas e próximos passos) está em [`handoff.md`](handoff.md). As regras de trabalho para agentes e humanos estão em [`AGENTS.md`](AGENTS.md).

## Produto e fontes de verdade

- Blueprint vigente: `docs/product/Offroad_Capital_Product_Blueprint_v3.0_pt-BR.pdf` (especificação; ADRs, decisões explícitas e o código governam a implementação)
- Plano por gates: `docs/build/MASTER_PLAN.md`
- Estado e evidências: `docs/build/BUILD_STATE.md`, `docs/build/ACCEPTANCE_EVIDENCE.md`
- Decisões arquiteturais: `docs/adr/`

## Desenvolvimento local

Requisitos: Node.js 24 (`.nvmrc`; use `fnm`/`nvm`) e pnpm 10.32.1.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

A aplicação sobe em `http://localhost:3000`. Sem `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as páginas públicas funcionam e as rotas
autenticadas informam que a identidade não está configurada. Copie apenas valores públicos
aprovados para um `.env.local` ignorado pelo Git (ou use `vercel env pull`).

Quality gate completo (obrigatório antes de abrir PR; é o mesmo que roda no CI):

```bash
pnpm check
```

Nenhum segredo pertence ao repositório. `.env.example` é apenas o catálogo de variáveis;
valores reais vivem nos secret stores de cada ambiente.

## Banco de dados e migrations

O schema muda somente por migrations em `supabase/migrations/`. O fluxo (aplicar via
Supabase MCP ou `supabase db push`, alinhar o nome do arquivo à versão registrada,
regenerar `apps/web/src/types/database.ts`, rodar advisors e o teste de RLS) está em
`AGENTS.md` §6. O CI sobe um stack Supabase local, aplica todas as migrations do zero e
executa `supabase/tests/rls_non_interference.sql` a cada PR.

## Arquitetura operacional

- Frontend e rotas server-side: Next.js 16 (App Router, Server Actions) na Vercel
- Auth, Postgres (RLS como fronteira de autorização) e Storage privado: Supabase
- Observabilidade: adapters privacy-first para Sentry e PostHog (no-op até os projetos externos serem criados)
- Workers assíncronos: não há hoje; serão introduzidos com o pipeline de extração de documentos, com job, modelo de ameaça e gate explícitos
