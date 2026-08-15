# ADR 0003 — Observabilidade privacy-first

Status: accepted
Data: 2026-08-14

## Contexto

A plataforma pode processar informações empresariais e financeiras sensíveis.
Telemetria de produto e erros não pode se transformar em uma cópia lateral desse
conteúdo.

## Decisão

- PostHog inicia opt-out, sem autocapture, session replay, pageview automático,
  cookies persistentes ou person profiles.
- Somente eventos e propriedades definidos pela taxonomy Zod podem sair do app.
- Sentry inicia sem PII, logs, variáveis locais, request body, cookies, headers,
  user context ou replay; URLs e mensagens passam por redação adicional.
- Tokens, DSNs e auth tokens vivem exclusivamente nos secret stores do provider.
- Ausência de configuração externa mantém ambos os adapters em no-op seguro.

## Consequências

O produto perde parte da conveniência da instrumentação automática, mas reduz a
superfície de vazamento e torna a coleta verificável por testes negativos. Novos
eventos exigem mudança explícita da taxonomy e revisão de privacidade.
