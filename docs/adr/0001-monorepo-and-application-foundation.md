# ADR 0001 - Monorepo and application foundation

Status: accepted for foundation
Date: 2026-08-14

## Context

O repositório oficial estava vazio. O Blueprint exige TypeScript, modular monolith, pnpm workspaces, Next.js App Router, Supabase e fronteiras explícitas para financial core, policies, evidence e agentes.

## Decision

- usar Node.js 24, pnpm 10 e Turborepo;
- iniciar com `apps/web` em Next.js 16/React 19;
- manter `packages/*` disponível para contratos e cores determinísticos quando o domínio começar;
- usar TypeScript strict e quality gate `lint -> typecheck -> test -> build`;
- manter frontend deployável na Vercel e sistema de registro futuro no Supabase;
- não introduzir microservices, event bus ou agentes antes de um job e um gate concreto.

## Consequences

O primeiro slice é simples de executar e já respeita as fronteiras futuras. Extração de pacotes será motivada por dependência real, não por simetria antecipada.

## Rollback

Antes de dados/migrations, a decisão é reversível por remoção do workspace. Depois de contratos compartilhados, qualquer mudança exige ADR de migração e compatibilidade.
