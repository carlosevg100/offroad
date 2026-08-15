# ADR 0002 - Public site design and launch safety

Status: accepted for preview
Date: 2026-08-15

## Context

O website precisa aproveitar a clareza editorial da Forward e o contraste técnico da Tier 1 sem copiar identidade, layout ou texto. O nome ainda depende de clearance.

## Decision

- partir da paleta do logo oficial: canvas quente, papel, navy profundo, branco e verde-lima como sinal pontual;
- usar Newsreader para narrativa e Inter para interface/números;
- posicionar o logo oficial em escala editorial no hero, sem alterar o arquivo-fonte;
- apresentar o produto com um film interativo original de quatro cenas — intake, evidências, estrutura e matching — sem reutilizar texto, mídia ou componentes da Forward;
- estender a mesma linguagem clara, espaçosa e funcional à autenticação, onboarding e workspace;
- usar uma ação principal por seção, navegação mínima e disclosures claros;
- manter marca/domínio/e-mail em `src/config/brand.ts`;
- publicar `pt-BR` e `en-US` desde o primeiro incremento;
- manter metadata/robots em `noindex` até clearance explícito.

## Consequences

O preview pode ser revisado sem aparentar lançamento público ou promessa de capital. A referência à Forward permanece no nível de princípios de composição, ritmo e interação; toda a identidade, copy e demonstração são próprias da Offroad. A remoção de `noindex` será uma mudança deliberada, revisável e dependente de decisão.
