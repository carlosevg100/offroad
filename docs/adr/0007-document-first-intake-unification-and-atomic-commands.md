# ADR 0007: Intake documents-first: um módulo, comandos atômicos, hash verificado

Status: accepted
Data: 2026-08-18

## Contexto

O fluxo documents-first existia duas vezes (onboarding e workspace) com
comportamentos divergentes; a confirmação fazia de seis a oito gravações
sequenciais sem transação; o texto do fixture Rede Horizonte estava fixo no
código; o hash SHA-256 era afirmado pelo navegador; não havia remoção de
documento; nenhuma automação cobria a jornada autenticada.

## Decisão

- **Um módulo**: `apps/web/src/lib/intake/*` (operações, builders puros,
  parsing numérico por locale) e `apps/web/src/components/intake/*`; as rotas
  são wrappers finos. Toda a copy vive no namespace `Intake` dos catálogos.
- **Comandos atômicos em Postgres** (`security invoker`, `search_path = ''`,
  verificação de tenant/tipo na entrada, lock na sessão):
  `begin_intake_processing`, `complete_intake_processing`,
  `review_intake_candidate`, `confirm_document_intake` (idempotente por sessão;
  duplicatas geram `duplicate_opportunity`). Falhas marcam a sessão `failed`.
- **Nenhum texto de fixture em produção**: título, finalidade e valores derivam
  de candidatos confirmados ou ficam nulos.
- **Hash verificado no servidor**: no processamento o servidor baixa cada
  objeto, recalcula o SHA-256, grava `sha256_verified_at` e abre uma issue de
  integridade quando o valor do navegador diverge. O extrator usa o hash
  verificado.
- **Remoção** de documento apenas com sessão aberta (policy de DELETE); após a
  confirmação o documento é evidência e não é apagável pela Data API.
- **E2E** (`apps/web/e2e`) roda a jornada completa em CI contra um stack local.

## Consequências

Uma única fonte de comportamento para o intake e uma base estável para o
extrator geral (P1), que só precisa produzir o mesmo payload de candidatos e
issues. O primeiro E2E encontrou e corrigiu um defeito real (criação de sessão
falhando sob RLS por `insert … returning` com função STABLE), o que confirma o
valor de manter o job obrigatório.
