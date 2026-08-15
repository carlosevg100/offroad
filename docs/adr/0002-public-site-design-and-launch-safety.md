# ADR 0002 - Public site design and launch safety

Status: accepted for preview
Date: 2026-08-14

## Context

O website precisa aproveitar a clareza editorial da Forward e o contraste técnico da Tier 1 sem copiar identidade, layout ou texto. O nome ainda depende de clearance.

## Decision

- usar os tokens do Blueprint: canvas quente, papel, ink, verde financeiro, signal violeta e estados semânticos;
- usar Newsreader para narrativa e Inter para interface/números;
- fazer o hero product-first, com uma ilustração original de oportunidade, evidência e cálculos;
- usar uma ação principal por seção, navegação mínima e disclosures claros;
- manter marca/domínio/e-mail em `src/config/brand.ts`;
- publicar `pt-BR` e `en-US` desde o primeiro incremento;
- manter metadata/robots em `noindex` até clearance explícito.

## Consequences

O preview pode ser revisado sem aparentar lançamento público ou promessa de capital. A remoção de `noindex` será uma mudança deliberada, revisável e dependente de decisão.
