# Build State

Atualizado em: 2026-08-16
Branch local: `agent/professional-account-onboarding`
Repositório: `carlosevg100/offroad`

| Gate | Estado | Evidência atual | Próxima condição |
|---|---|---|---|
| B0 Fundação | accepted | monorepo, docs, CI, templates e Blueprint versionado; PR #1 incorporado em `main` | manutenção contínua |
| B1 Website | in_review | experiência bilíngue premium em grafite/azul institucional, proposta de valor explícita para empresas, originadores e gestores, mapa animado do mercado, product film localizado, logo oficial, metadata e QA responsivo | automação de acessibilidade e aprovação editorial/legal |
| B2 Auth | in_review | cadastro password-first por empresa, originador ou investidor; confirmação e recovery com OTP de 6 dígitos; templates bilíngues, SMTP Resend autenticado e onboarding persistente | executar a primeira jornada autenticada com usuário real |
| B3 Domínio/RLS | accepted | RLS + FORCE RLS, policies por organização e função, teste remoto tenant A/B/provider/anon e Security Advisor sem alertas | revisão externa do threat model por gate |
| B4 Documentos | in_review | bucket privado `opportunity-documents`, upload autenticado no onboarding, allowlist de MIME/tamanho e policies por tenant | QA de upload com usuário real e decisão final de retenção/residência production |
| B5 Financial core | in_review | pacote decimal exato e golden tests determinísticos | modelos avançados, versionamento e validação independente |
| B6 Crédito/estrutura | in_progress | contratos de domínio e intake atômico implementados | scorecards, structuring workbench e aprovação de metodologia |
| B7 Agent Kernel | not_started | - | B3-B6 |
| B8 Outputs | in_progress | evidence compiler e sala de oportunidade sintética | geração versionada com provenance completo |
| B9 Matching | in_review | matching core determinístico com explicações e testes | persistência, feedback loop e avaliação offline |
| B10 Market activation | not_started | - | B8-B9 + policy regulatória |
| B11 Admin | in_progress | ambiente autenticado por perfil: pipeline para empresas/originadores e fundos, mandatos e contatos para investidores | papéis operacionais Offroad, edição pós-onboarding e console admin |
| B12 Observabilidade | in_review | adapters Sentry/PostHog privacy-first, taxonomy allowlisted e testes de redação de PII | criar projetos externos e configurar DSN/token por ambiente |
| B13 Hardening | in_progress | grants mínimos, RLS não-interferência e Security Advisor sem alertas | CI de segurança, rate limits, restore drill e pentest |
| B14 Deployment | in_review | produção Vercel, GitHub conectado, Supabase ativo e `offroad.capital`/`www` com DNS e TLS válidos | projetos externos de observabilidade e política de promotion |
| B15 E2E | in_progress | smoke visual desktop/tablet/mobile do cadastro e recovery; lint, typecheck, 18 testes, build, teste RLS remoto e entrega transacional Resend aprovados | jornada autenticada completa, acessibilidade automatizada e testes cross-browser |

## Incremento ativo

Objetivo: concluir o primeiro fluxo institucional real, da escolha do perfil à
criação do ambiente e ao onboarding específico de cada participante.

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
- [x] implementar cadastro e recovery por e-mail, senha e código de seis dígitos
- [x] implementar onboarding distinto para empresa, assessor/originador e investidor
- [x] aplicar e validar policies de não interferência entre originadores e provedores de capital
- [x] conectar SMTP Resend, verificar domínio e validar entrega transacional
- [ ] criar projetos Sentry/PostHog e configurar secrets por ambiente

Produção canônica: `https://offroad.capital`
