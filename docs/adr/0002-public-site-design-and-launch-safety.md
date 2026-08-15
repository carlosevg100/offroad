# ADR 0002 - Public site design and launch safety

Status: accepted for preview
Date: 2026-08-15

## Context

O website precisa aproveitar a clareza editorial da Forward e o contraste técnico da Tier 1 sem copiar identidade, layout ou texto. O nome ainda depende de clearance.

## Decision

- adotar preto, grafite, branco e cinzas frios como base; reservar o verde-lima do logo para estados e destaques pontuais;
- usar Inter para títulos, narrativa, interface e números; evitar contraste tipográfico ornamental em superfícies institucionais;
- tratar o logo oficial como assinatura de navegação, não como conteúdo do hero;
- abrir o hero com a proposta de valor completa — `Get structured. Get visible. Get matched. Get funded.` — e a descrição institucional aprovada;
- usar painéis de readiness, evidência, capacidade e matching como linguagem visual, com gráficos em escala de cinza e hierarquia de dados;
- apresentar o produto com um film interativo original de quatro cenas — intake, evidências, estrutura e matching — sem reutilizar texto, mídia ou componentes da Forward;
- estender a mesma linguagem clara, espaçosa e funcional à autenticação, onboarding e workspace;
- usar uma ação principal por seção, navegação mínima e disclosures claros;
- manter marca/domínio/e-mail em `src/config/brand.ts`;
- publicar `pt-BR` e `en-US` desde o primeiro incremento;
- manter metadata/robots em `noindex` até clearance explícito.

## Consequences

O preview pode ser revisado sem aparentar lançamento público ou promessa de capital. A referência à Forward permanece apenas no nível de clareza, ritmo e demonstração de produto; composição, identidade, copy e interfaces são próprias da Offroad. A remoção de `noindex` será uma mudança deliberada, revisável e dependente de decisão.
