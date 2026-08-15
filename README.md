# Offroad Capital

Monorepo oficial da Offroad Capital, uma plataforma AI-native de originação e acesso ao mercado de private credit.

## Estado atual

O primeiro slice vertical está funcional: website bilíngue, demo pública sintética,
autenticação/onboarding, shell autenticado, criação de oportunidade, sala de
oportunidade, fundações de cálculo/matching/evidência e backend Supabase com RLS.

- Produção Vercel: <https://offroad-iota.vercel.app>
- Domínio final: `offroad.capital` anexado ao projeto; ativação aguarda a troca de DNS no GoDaddy
- Backend development: projeto Supabase `offroad-development` em São Paulo

## Produto e fontes de verdade

- Blueprint vigente: `docs/product/Offroad_Capital_Product_Blueprint_v3.0_pt-BR.pdf`
- Plano de execução: `docs/build/MASTER_PLAN.md`
- Estado verificável: `docs/build/BUILD_STATE.md`
- Decisões arquiteturais: `docs/adr/`

## Desenvolvimento local

Requisitos: Node.js 24 e pnpm 10.32.1.

```bash
pnpm install
pnpm dev
```

Quality gate completo:

```bash
pnpm check
```

Nenhum segredo pertence ao repositório. Use `.env.example` apenas como catálogo de variáveis e configure valores reais nos secret stores de cada ambiente.

## Arquitetura operacional

- Frontend e rotas server-side: Next.js 16 na Vercel
- Auth, Postgres e Storage privado: Supabase
- Observabilidade: adapters privacy-first para Sentry e PostHog; projetos externos ainda não ativados
- Worker assíncrono: Railway reservado para o gate em que existir workload próprio; não é dependência do slice atual
