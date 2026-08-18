# Acceptance Evidence

Evidências são adicionadas somente depois de execução real. Nenhum item pendente implica funcionamento.

## Slice vertical inicial

| Evidência | Comando/artefato | Resultado | Data |
|---|---|---|---|
| Remote oficial | `git remote -v` | `origin` aponta para `carlosevg100/offroad` | 2026-08-14 |
| Branch isolada | `git status --branch` | `codex/b0-foundation`, sem commit/push | 2026-08-14 |
| Testes locais | `pnpm test` | 7 arquivos, 13 testes web + domain/financial/evidence/matching aprovados | 2026-08-14 |
| Lint | `pnpm lint` | aprovado | 2026-08-14 |
| Typecheck | `pnpm typecheck` | aprovado | 2026-08-14 |
| Production build | `pnpm build` com Node 24.19.0 | aprovado; rotas localizadas, metadata, robots e sitemap gerados | 2026-08-14 |
| Desktop visual QA | browser em 1440 x 1000 | hero, jornadas, públicos e trust architecture sem defeitos críticos | 2026-08-14 |
| Mobile visual QA | browser em 390 x 844 | PT-BR e EN-US sem overflow; controles principais com 44 px | 2026-08-14 |
| Semântica smoke | inspeção do DOM | um `h1`, hierarquia de headings, `lang` localizado, skip link e links nomeados | 2026-08-14 |
| Teclado/axe automatizado | suite dedicada | pendente; não contabilizado como aceite | - |
| Blueprint integrity | SHA-256 do PDF versionado | `6d6bc61aeaa1dc6bd42dd45b7289238925ed4087edaa5d115016871134d876de`, idêntico à fonte | 2026-08-14 |
| Preview Vercel | projeto `offroad` | landing, demo e login validados sem erro de console; preview permanece `noindex` | 2026-08-14 |
| Produção Vercel | deployment `Dk7Qh4QQxfAXxFEpJxSsFVzCp9Qo` / `https://offroad-iota.vercel.app` | build remoto aprovado; landing smoke sem erros de console | 2026-08-14 |
| Custom domains | Vercel project settings | `offroad.capital` e `www.offroad.capital` anexados; DNS GoDaddy ainda aponta para parking | 2026-08-14 |
| DNS target | Vercel DNS configuration | exige `A @ → 216.150.1.1` e `CNAME www → a9d1687f64e3d454.vercel-dns-016.com` | 2026-08-14 |
| DNS propagado | consulta DNS pública | `offroad.capital` resolve para `216.150.1.1`; `www` resolve pelo CNAME Vercel configurado | 2026-08-15 |
| HTTPS canônico | `curl -I` em apex e `www` | ambos respondem via Vercel com TLS e HSTS; redirect canônico de `www` para apex incluído no release | 2026-08-15 |
| Logo oficial | `apps/web/public/brand/offroad-capital-logo.png` | asset fornecido pelo fundador integrado como assinatura de navegação e símbolo nas superfícies escuras | 2026-08-15 |
| Product film | landing localizada | quatro cenas interativas originais — intake, evidências, estrutura e matching — com autoplay controlável e fallback para reduced motion | 2026-08-15 |
| Visual QA do redesign | browser em 1280 px e 390 x 844 | landing, product film, demo e login sem overflow horizontal ou erros de console; conteúdo PT-BR validado | 2026-08-15 |
| Quality gate do redesign | `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter web build` | lint e tipagem aprovados; 13 testes aprovados; build Next.js com 19 páginas/rotas concluído | 2026-08-15 |
| Reset visual premium | browser em 1280 px e 390 x 844 | hero preto/grafite com copy aprovada, dashboard de readiness em cinzas, product film institucional e login/demo coerentes; PT-BR/EN-US sem overflow ou erros de console | 2026-08-15 |
| Quality gate do reset | `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter web build` | lint e tipagem aprovados; 13 testes aprovados; build Next.js com 19 páginas/rotas concluído | 2026-08-15 |
| Revisão de mensagem institucional | catálogos `pt-BR`/`en-US` + QA visual | acesso, onboarding, demo e área autenticada revisados para empresas, CFOs, assessores, fundos e gestores; jargão SaaS removido das mensagens públicas | 2026-08-15 |
| Reposicionamento multilateral da landing | browser em 1280 px + catálogos `pt-BR`/`en-US` | hero reduzido e reescrito para empresas, originadores e gestores; paleta grafite-azulada sem verde de interface; mapa animado com função explicativa; gráficos circulares removidos; benefícios por público e demonstração localizada | 2026-08-15 |
| Quality gate do reposicionamento | `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter web build` | lint e tipagem aprovados; 13 testes aprovados; build Next.js com 19 páginas/rotas concluído | 2026-08-15 |
| Supabase project | `offroad-development` / `ifnogpksgdadruooqydi` | projeto healthy em `sa-east-1`, Postgres 17.6 | 2026-08-14 |
| Database foundation | 4 migrations remotas | 28 tabelas públicas, RLS + FORCE RLS, 57 policies, RPCs atômicos e grants mínimos | 2026-08-14 |
| Tenant non-interference | `supabase/tests/rls_non_interference.sql` | tenant A, tenant B e anon isolados; transação revertida ao final | 2026-08-14 |
| Supabase advisors | Security/Performance Advisor | zero security lints; apenas infos de índices ainda não usados em banco novo | 2026-08-14 |
| Storage | bucket `opportunity-documents` | privado, limite 50 MB, MIME allowlist e policies por tenant | 2026-08-14 |
| Auth redirects | Supabase Auth URL Configuration | canônico, previews Vercel e localhost allowlisted | 2026-08-14 |
| Observabilidade negativa | `privacy.test.ts` | propriedades fora da taxonomy rejeitadas; email, UUID, valores e authorization redigidos | 2026-08-14 |
| Freshness adicional de dependências | versões exatas e revisão de publicação | PostHog fixado em versão com mais de 24 h; lockfile reproduzível | 2026-08-14 |
| Cadastro institucional por perfil | `/pt-BR/signup` e `/en-US/signup` | escolha de empresa, assessor/originador ou investidor antes da identidade; somente e-mail e senha, sem provedores sociais | 2026-08-16 |
| Verificação e recuperação | Supabase Auth + rotas `signup/verify` e `forgot-password/*` | OTP de 6 dígitos, validade de 10 minutos, confirmação obrigatória, recovery por código e templates bilíngues | 2026-08-16 |
| Onboarding profissional | rotas e server actions de onboarding | fluxos persistentes para empresa, originador e capital provider; CNPJ não persistido em claro; documentos em bucket privado | 2026-08-16 |
| Separação por função | `supabase/tests/rls_non_interference.sql` executado no projeto remoto | tenant A/B/provider/anon isolados; empresa não cria fundo e provider não cria empresa; transação revertida | 2026-08-16 |
| Supabase Security Advisor | projeto `ifnogpksgdadruooqydi` após migration profissional | zero security lints; avisos de performance apenas para índices ainda não usados | 2026-08-16 |
| QA do cadastro | browser local e screenshots em 1265, 1024 e 500 px | hierarquia, seleção de perfil, formulário e recovery sem defeitos críticos; responsividade compactada no mobile | 2026-08-16 |
| Quality gate do cadastro | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` | todos aprovados; web com 11 testes e monorepo com 18 testes; 28 páginas/rotas geradas | 2026-08-16 |
| Domínio transacional | Resend + DNS GoDaddy | `offroad.capital` verificado em `sa-east-1`; DKIM, SPF e MX publicados e aprovados | 2026-08-16 |
| SMTP de autenticação | Supabase Auth SMTP Settings | `auth@offroad.capital` via `smtp.resend.com:465`, TLS e credencial armazenada pelo provider | 2026-08-16 |
| Entrega transacional | Resend API / endereço controlado de teste | mensagem enviada por `auth@offroad.capital` com evento final `delivered` | 2026-08-16 |
| Quality gate final do cadastro | `pnpm check` | lint, tipagem, 18 testes e build de 28 rotas aprovados novamente antes da promoção | 2026-08-16 |
| Intake documents-first (PR #38–#40) | `pnpm check`; fixture por hash | 27 testes; sessões, candidatos, issues, revisão e criação do case; hashes dos 8 arquivos fixados em `packages/testing-fixtures` | 2026-08-17 |
| Histórico de migrations alinhado | `git mv` + `list_migrations` | 10 arquivos renomeados para as versões registradas no projeto; sem escrita no banco | 2026-08-18 |
| CI de banco | job `database` no PR #41 | stack local, 10 migrations do zero, teste RLS, `db lint` — verde na primeira execução | 2026-08-18 |
| Hardening (PR #44) | migration `20260817232443` + `pg_class`/`pg_policies` | 32/32 tabelas com RLS forçado; policies de organizations com guard de tipo; teste RLS executado remotamente (`rls_non_interference_passed`, rollback confirmado); advisors 0 | 2026-08-18 |
| Login | `curl https://offroad.capital/pt-BR/login` | input de senha sem `minLength` em produção (antes: 10 vs 8 no cadastro) | 2026-08-18 |
| Unificação do intake (PR #46) | `pnpm check`; `next start` local | 28 testes web; rotas respondem; chaves do namespace `Intake` verificadas contra os componentes | 2026-08-18 |
| Comandos atômicos (PR #47) | migration `20260818033220`; teste RLS remoto | begin/complete/review/confirm como tenant A; idempotência; título ≤ 180; tenant B recusado; types regenerados idênticos aos escritos à mão | 2026-08-18 |
| Documentos (PR #48) | migration `20260818034457`; teste remoto | delete permitido só em sessão aberta; recusado após confirmação e para outro tenant; hash recalculado no servidor durante o processamento | 2026-08-18 |
| E2E (PR #49) | job `e2e` em CI (Playwright, stack local) | cadastro → código → onboarding documents-first → 8 uploads → processamento → 38 campos/8 issues → aceite (37) → confirmação → envio → pipeline → sala de crédito (8 docs, 37 fatos) → conjunto desconhecido (remover/re-enviar/estado vazio) → sign-out/login — verde; encontrou e corrigiu criação de sessão sob RLS (`20260818043539`) | 2026-08-18 |
| Quality gate final | `pnpm check` (Node 24.19 via fnm) | lint, tipagem, 45 testes, build; jobs `check`, `database`, `e2e` obrigatórios em `main` | 2026-08-18 |

## Regras

- Guardar screenshots de review em artefatos/CI, não inflar o repositório sem necessidade.
- Registrar comando, resultado, versão e data.
- Falha nunca é reclassificada como aceite parcial silencioso.

## P1 — Fase F0 (18/08/2026)

| Evidência | Comando/artefato | Resultado | Data |
|---|---|---|---|
| Ontologia cobre o fixture | `pnpm --filter @offroad/credit-ontology test` | 17 testes; todos os 38 field paths do fixture resolvem no catálogo; plano de contas sem ciclos | 2026-08-18 |
| Verificador de âncora | `pnpm --filter @offroad/document-intelligence test` | 18 testes: trecho inventado, dígitos alterados, âncora ausente, página escaneada (modo degradado), armadilhas de escala, percentuais, dedupe | 2026-08-18 |
| Gateway sem Haiku | `pnpm --filter @offroad/model-gateway test` | 14 testes: denylist/allowlist, fallback por recusa/erro/saída inválida, budgets, redação, cassetes; adapters tipados contra os SDKs reais (`@anthropic-ai/sdk` 0.117.1, `openai` 7.5.0), sem rede | 2026-08-18 |
| Harness de evals + G1 | `pnpm --filter @offroad/evals test` e `pnpm --filter @offroad/evals baseline` | 7 testes; baseline do fixture: precisão 100% (38/38), recall material 47,7% (31/65), exceções 7/12, alucinação 0, sem classificação/cálculos; snapshot perfeito = 100% e passa nos limiares | 2026-08-18 |
| Quality gate | `pnpm check` (Node 24) | verde nos PRs #52–#55; CI `check`/`database`/`e2e` verdes | 2026-08-18 |

