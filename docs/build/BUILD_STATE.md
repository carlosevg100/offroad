# Build State

Atualizado em: 2026-08-15
Branch local: `codex/premium-design-reset`
Repositório: `carlosevg100/offroad`

| Gate | Estado | Evidência atual | Próxima condição |
|---|---|---|---|
| B0 Fundação | accepted | monorepo, docs, CI, templates e Blueprint versionado; PR #1 incorporado em `main` | manutenção contínua |
| B1 Website | in_review | experiência bilíngue premium em preto/cinza, mensagem institucional por público, readiness dashboard, product film original, logo oficial, metadata e QA responsivo | automação de acessibilidade e aprovação editorial/legal |
| B2 Auth | in_review | Supabase SSR, login/cadastro, PKCE/OTP confirm, onboarding e proteção de rotas | QA com usuários reais e políticas de ciclo de conta |
| B3 Domínio/RLS | in_review | 28 tabelas públicas, RLS + FORCE RLS em todas, 57 policies e teste tenant A/B/anon aprovado | revisão externa do threat model e novos casos negativos por feature |
| B4 Documentos | in_review | bucket privado `opportunity-documents`, allowlist de MIME/tamanho e policies por tenant | upload/download na UI e decisão final de retenção/residência production |
| B5 Financial core | in_review | pacote decimal exato e golden tests determinísticos | modelos avançados, versionamento e validação independente |
| B6 Crédito/estrutura | in_progress | contratos de domínio e intake atômico implementados | scorecards, structuring workbench e aprovação de metodologia |
| B7 Agent Kernel | not_started | - | B3-B6 |
| B8 Outputs | in_progress | evidence compiler e sala de oportunidade sintética | geração versionada com provenance completo |
| B9 Matching | in_review | matching core determinístico com explicações e testes | persistência, feedback loop e avaliação offline |
| B10 Market activation | not_started | - | B8-B9 + policy regulatória |
| B11 Admin | in_progress | shell autenticado e visão inicial de oportunidades | papéis operacionais, auditoria e console admin |
| B12 Observabilidade | in_review | adapters Sentry/PostHog privacy-first, taxonomy allowlisted e testes de redação de PII | criar projetos externos e configurar DSN/token por ambiente |
| B13 Hardening | in_progress | grants mínimos, RLS não-interferência e Security Advisor sem alertas | CI de segurança, rate limits, restore drill e pentest |
| B14 Deployment | in_review | produção Vercel, GitHub conectado, Supabase ativo e `offroad.capital`/`www` com DNS e TLS válidos | projetos externos de observabilidade e política de promotion |
| B15 E2E | in_progress | smoke visual desktop/mobile da landing, product film, demo e login; testes de unidade/integridade e build aprovados | jornada autenticada real, acessibilidade automatizada e testes cross-browser |

## Incremento ativo

Objetivo: concluir o bootstrap operacional do primeiro slice vertical e tornar
`offroad.capital` o endpoint canônico sem expor dados reais.

Critérios em aberto:

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] render desktop e mobile sem overflow ou defeitos críticos
- [x] inspeção básica de headings, links nomeados e contraste visual
- [x] copiar e hashear o Blueprint em `docs/product/`
- [x] CI inicial e templates GitHub
- [x] registrar evidências em `ACCEPTANCE_EVIDENCE.md`
- [x] criar Supabase development e aplicar migrations de schema/RLS/Storage/RPC
- [x] publicar produção Vercel e anexar `offroad.capital`
- [x] instrumentação Sentry/PostHog desativada por padrão e com PII redigida
- [x] bootstrap/push do GitHub e vínculo Vercel ↔ GitHub
- [x] trocar DNS GoDaddy e validar TLS do domínio canônico
- [ ] criar projetos Sentry/PostHog e configurar secrets por ambiente

Produção canônica: `https://offroad.capital`
