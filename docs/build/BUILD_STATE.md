# Build State

Atualizado em: 2026-08-18
Baseline: `main` após PRs #41, #44, #46, #47, #48, #49 (18/08/2026)
Repositório: `carlosevg100/offroad` · Produção: `https://offroad.capital`

| Gate | Estado | Evidência atual | Próxima condição |
|---|---|---|---|
| B0 Fundação | accepted | monorepo, docs, CI (`check` + `database` + `e2e` obrigatórios), templates, `AGENTS.md`/`CLAUDE.md` raiz, Blueprint versionado, histórico de migrations alinhado ao projeto | manutenção contínua |
| B1 Website | in_review | experiência bilíngue premium em grafite/azul institucional, proposta de valor explícita para empresas, originadores e gestores, mapa animado do mercado, product film localizado, logo oficial, metadata e QA responsivo | automação de acessibilidade e aprovação editorial/legal |
| B2 Auth | accepted | cadastro por perfil com código de 6 dígitos, recovery, onboarding persistente; jornada autenticada coberta por E2E em CI (signup → código → onboarding → login) | MFA/AAL2 e step-up para ações sensíveis |
| B3 Domínio/RLS | accepted | RLS + FORCE RLS em 32/32 tabelas; sem `offroad` self-service; teste de não interferência (tenants, intake, comandos RPC, delete de documentos) em CI e executado remotamente; Security Advisor sem alertas | papéis internos granulares (`can_access_opportunity` por permissão) e revisão externa do threat model |
| B4 Documentos | in_review | bucket privado, upload direto com SHA-256 recalculado no servidor (`sha256_verified_at`), remoção enquanto a sessão está aberta, revisão assistida, fixture Rede Horizonte por hash, sessão/candidatos/issues em comandos atômicos, E2E do fluxo; **P1 F0**: ontologia, núcleo de verificação de âncoras, gateway multi-provedor e harness de evals com gold case G1 (pacotes puros, ainda não ligados ao fluxo) | F1: worker isolado (D-003), portaria/quarentena, camadas por formato, perfis; F2: extração ancorada substitui o fixture atrás de flag |
| B5 Financial core | in_review | pacote decimal exato e golden tests determinísticos | modelos avançados, versionamento e validação independente |
| B6 Crédito/estrutura | in_progress | contratos de domínio, criação atômica de company/pedido/oportunidade + fatos de evidência aprovados; sala de crédito com contadores reais e placeholders honestos | spreading/reconciliação, capacidade, structuring workbench |
| B7 Agent Kernel | not_started | - | B3-B6 |
| B8 Outputs | in_progress | evidence compiler e sala de oportunidade sintética | geração versionada com provenance completo |
| B9 Matching | in_review | matching core determinístico com explicações e testes | persistência, feedback loop e avaliação offline |
| B10 Market activation | not_started | - | B8-B9 + policy regulatória |
| B11 Admin | in_progress | workspace por perfil; tipo `offroad` reservado (não self-service) | papéis operacionais Offroad, four-eyes, console admin |
| B12 Observabilidade | in_review | adapters Sentry/PostHog privacy-first, taxonomy allowlisted e testes de redação de PII | criar projetos externos e configurar DSN/token por ambiente |
| B13 Hardening | in_progress | grants mínimos, FORCE RLS total, guard de tipo de org, teste RLS + lint de schema em CI, migrations replicáveis do zero | CSP, rate limits, SAST/SBOM, restore drill, pentest |
| B14 Deployment | in_review | produção Vercel, GitHub conectado, Supabase ativo e `offroad.capital`/`www` com DNS e TLS válidos | projetos externos de observabilidade e política de promotion |
| B15 E2E | in_review | Playwright em CI contra stack local: cadastro, código, onboarding documents-first, upload dos 8 arquivos, verificação de hash, revisão (38 campos/8 issues), confirmação atômica, pipeline, sala de crédito, conjunto desconhecido, sign-out/login; 45 testes unitários; job obrigatório | acessibilidade automatizada, cross-browser, jornadas originador/provedor |

## Incremento ativo (18/08/2026)

Objetivo: estabilizar a fatia vertical antes do extrator geral (P0 do
`handoff.md` §20) e profissionalizar a operação para dois agentes.

- [x] governança: `AGENTS.md`/`CLAUDE.md` raiz, migrations alinhadas, `seed.sql`, dependabot sem majors de toolchain
- [x] hardening: FORCE RLS nas tabelas de intake, sem `offroad` self-service, sessões só para tenants tomadores, login sem `minLength`
- [x] intake unificado (`src/lib/intake`, `src/components/intake`), copy no catálogo `Intake`, sem texto de fixture em produção
- [x] comandos atômicos: `begin/complete_intake_processing`, `review_intake_candidate`, `confirm_document_intake` (idempotente)
- [x] hash verificado no servidor, remoção de documento com sessão aberta, uploader único
- [x] E2E em CI (stack local + Playwright) — encontrou e corrigiu a criação de sessão sob RLS
- [x] páginas de erro/404 localizadas; placeholders desabilitados com "Em breve"; código morto removido
- [x] ADRs 0004–0007, ledgers e `handoff.md` atualizados
- [ ] criar projetos Sentry/PostHog e configurar secrets por ambiente
- [ ] extrator geral de documentos (P1) — plano detalhado em [`P1_INTELLIGENCE_PLAN.md`](P1_INTELLIGENCE_PLAN.md); ADR 0008

## P1 — Fase F0 (fundações da inteligência) — 18/08/2026

- [x] `packages/credit-ontology`: taxonomia, catálogo de campos (cobre os 38 do fixture + expansões), plano de contas, períodos/entidades, ranks, política de auto-aceite v1, regras R1–R17, definições (PR #52)
- [x] `packages/document-intelligence`: contratos de camada/perfil/candidato/exceção/brief, índice de camadas, verificador de âncora (7 checagens), normalizador Decimal (PR #53)
- [x] `packages/model-gateway`: Anthropic + OpenAI via API, política sem Haiku, structured outputs validados, budgets, fallback, redação, cassetes, logs sem conteúdo (PR #54)
- [x] `packages/evals` + gold case G1 (Rede Horizonte a partir do gabarito sintético) + baseline do fixture: precisão 100%, recall material 47,7%, exceções 7/12 (PR #55)
- [x] ADR 0008 (arquitetura da inteligência documental)
- [ ] revisão da ontologia por especialista (D-013); DPA/ZDR nos provedores (D-010)

## P1 — Fase F1 (pipeline de documentos) — 18/08/2026

- [x] F1-1 estado do pipeline: `processing_runs`, `processing_jobs`, `document_profiles` e `document_layers`; versão e resultado de portaria em `source_documents`; campos de verificação de âncora nos candidatos e metadados de reconciliação nas issues; buckets privados `document-layers` e `case-artifacts`; comando `begin_processing_run` (app) e seis comandos do worker — credencial de worker com hash para *claim* e capability token por job para o resto, **sem service-role** e sem `organization_id` vindo do chamador (migration `20260818171246`)
- [x] F1-1b endurecimento de privilégios encontrado pelo advisor: `anon` deixa de ter qualquer privilégio no schema `public`, as *default privileges* do bootstrap Supabase são revogadas (era a origem do vazamento desde `20260817202038`), os comandos `security definer` passam para `private` com wrappers `security invoker` em `public` (AGENTS.md §6) e os FKs do pipeline ganham índices de cobertura (migrations `20260818172243` e `20260818172357`)
- [x] F1-2 `packages/document-parsers`: bytes → camada com âncoras estáveis (`p12.t1.r4.c3`, `sDRE!B14`, `sec3.p7`, `sl4.b1`), tipo decidido por magic bytes, declarações de escala detectadas (nunca aplicadas), e recusa explícita do que não dá para ler; leitor próprio de XLSX porque o exceljs não enxerga o prefixo `x:` que estes arquivos usam e devolvia planilha vazia; `.xls/.doc/.ppt` recusados com mensagem acionável (sem parser mantido e sem advisory aberto); defesas contra arquivo hostil (bomba de descompressão, entidades XML, tetos por página/aba/tabela) com truncamento sempre reportado (PR #59)
- [x] F1-2b formatos universais (decisão do fundador, 18/08): `.xls`/`.xlsb`/`.ods`/`.dbf` lidos em processo (SheetJS 0.20.3 da distribuição oficial — a 0.18.5 do npm tem vulnerabilidade aberta), subtipo do contêiner Office 97 decidido pelo stream interno e não pela extensão, `.doc`/`.ppt`/`.rtf`/`.odt`/`.odp` por conversão e imagens/PDF digitalizado por OCR — ambos como capacidades que o worker empresta ao pacote puro; texto de OCR nunca sai do modo digitalizado nem entra em auto-aceite (PR #60)
- [ ] F1-3 `apps/document-worker` (contêiner com LibreOffice + OCR, fila, portaria/ClamAV, perfil pelo gateway) + deploy AWS ECS Fargate `sa-east-1` (D-003 aprovado)
  - [x] credenciais provisionadas (19/08): os quatro segredos auxiliares em `sa-east-1`, a conta de serviço `document-worker@offroad.capital` (sem organização, criada pelo signup público — sem service-role) e o `sha256` do token em `private.worker_tokens`; cadeia verificada de ponta a ponta com `worker_claim_job` respondendo `{"claimed": false}`
  - [x] workflow de deploy resolve os ARNs dos segredos pelo nome (`secretsmanager:DescribeSecret` sobre `offroad/*` no `offroadGitHubDeployRole` — metadados, nunca o valor)
  - [ ] imagem construída e publicada no ECR (0 imagens hoje) e serviço ECS criado (a criação depende de uma task definition registrada, logo vem depois do merge)
- [x] F2-1 `packages/document-extraction`: camada + ontologia → candidatos citados. O modelo lê e cita; o pacote decide o que sobrevive — toda âncora é reconferida contra o documento e o valor normalizado é calculado em código, nunca aceito do modelo. Evidência renderizada por linha com o id da âncora; documento grande vira vários trechos em vez de um trecho truncado. 12 testes.
- [x] F2-1b `pnpm --filter @offroad/evals measure`: roda o extrator real sobre um gold case e pontua com o harness existente (recall material, precisão, alucinação, custo). **Ainda não executado** — o `.env.local` está com `ANTHROPIC_API_KEY=` e `OPENAI_API_KEY=` vazios; as chaves só existem no Secrets Manager. Uma execução de `./scripts/set-secrets.sh local` destrava.
- [ ] F2-2 reconciliação: `packages/evidence-compiler` tem 45 linhas e não concilia nada; as regras R1–R17 e os ranks de evidência existem em `credit-ontology` e ainda não têm consumidor
- [ ] F2-3 ligar o extrator ao worker (hoje o worker faz portaria → parse → camada → perfil e para aí)
- [ ] F1-4 UI: aba Documentos com índice organizado e tela de processamento por etapas (Realtime), paridade PT/EN
  - [x] emissão das URLs assinadas (`src/lib/intake/pipeline-run.ts`): o app assina o download em `opportunity-documents` e o upload da camada em `document-layers`, e abre a run com `begin_processing_run` — o worker continua sem credencial de Storage; atrás de `PIPELINE_RUNS_ENABLED`, desligada por padrão
  - [x] migration `20260819115701`: política de `insert` em `document-layers`, que faltava desde `20260818171246` (sem ela `createSignedUploadUrl` é recusado e a camada não tem onde ser gravada)
  - [x] ponto de chamada ligado (20/08): `processIntakeSession` bifurca — com `PIPELINE_RUNS_ENABLED` abre a run e **retorna**, sem tocar no caminho fixture; sem a flag, fixture como antes. Os dois nunca rodam juntos
  - [x] worker extrai de verdade: estágio E3 no pipeline, `worker_record_candidates` (migration `20260820104922`) grava candidato com âncora, quote e flags, e `worker_complete_job` move a sessão para `review_ready` quando o último job termina — sem isso a jornada acabava num spinner
  - [ ] tela de processamento por etapas (Realtime) e aba Documentos com índice organizado

## P1 — Fase C (playbook do desk) — 20/08/2026

- [x] `packages/credit-playbook`: cinco arquétipos de operação (crescimento/expansão, capital de giro, refinanciamento, aquisição, financiamento de equipamentos) mais o fallback, cada um com informação **mínima** (linha de recusa: sem isso o caso não abre) e **ideal** (linha de precificação), focos de análise com a pergunta que cada um responde, riscos como hipótese a testar, menu de estrutura (bandas de prazo, carência, amortização, garantias, covenants) e perguntas-padrão ligadas a um foco. Validado pelo fundador (D-013 — 20 anos de banco de investimento)
- [x] motor de suficiência: a régua é respondida pelo que o pipeline **leu**, não pelo que alguém marcou; um documento pode satisfazer mais de um requisito; próximo passo em uma linha, PT/EN. 12 testes, incluindo integridade contra a ontologia (todo `DocumentKind` existe, todo field path resolve)
- [x] intake guiado (20/08): a empresa escolhe a operação antes de subir arquivo, e a régua se preenche sozinha conforme cada documento é classificado — mínimo e ideal em listas separadas, nunca uma barra só, com o "por que importa" em cada item pendente e uma linha dizendo qual é o próximo passo
- [ ] captura da operação pretendida no início (arquétipo, montante, uso, prazo/taxa almejados)

## P1 — Fase B (conciliar e calcular) — 20/08/2026

- [x] `packages/reconciliation`: **determinístico de ponta a ponta, sem nenhuma chamada de modelo**
  - precedência entre fontes por **rank de evidência** (auditado > revisado > gerencial > apresentação), nunca por recência ou confiança; o valor perdedor **não é descartado** — fica anexado ao fato com sua fonte e âncora, porque a diferença é justamente a pergunta que o investidor faz
  - regras R3/R4/R5/R11/R13/R14/R16 como aritmética sobre os fatos conciliados; toda exceção nasce com **os dois lados e os dois documentos**, e é uma pergunta, não um veredito
  - cálculos com **trace**: dívida líquida, EBITDA ajustado, alavancagem pré e pós, capacidade de garantias após haircut, totais de fontes e usos — cada insumo aponta o campo e o documento de onde veio; cálculo sem insumo **não é estimado**, vira lacuna reportada
  - lacunas de informação a partir do checklist do playbook e dos campos materiais ausentes: viram pedidos com o "por que importa" junto
  - 14 testes; alavancagem pré confere com o gabarito (1,7788x)
- [ ] ligar ao worker: rodar a conciliação ao fim da run e persistir fatos, exceções e cálculos
- [ ] aba Financeiro e aba Conciliação na UI

## P1 — Fase D (entendimento do case) — 20/08/2026

- [x] `packages/case-understanding`, determinístico:
  - **score de prontidão em cinco componentes**, nunca um número só — suficiência de dados (mínimo pesa o dobro), estado da conciliação (ponderado por severidade), qualidade da evidência (rank médio + % com âncora confirmada), lacunas materiais e bloqueios. Cada componente traz a explicação em números que o leitor confere. **Bloqueio não desconta pontos: segura o caso.** Um pacote 90% completo com balanço que não fecha não está 90% pronto
  - **auditor de evidência**: relê cada claim material, extrai os números realmente escritos na frase e recusa qualquer um que não apareça nos fatos ou cálculos citados. Ano, percentual e contagem passam sem suporte (senão a prosa fica impossível de escrever); dinheiro e múltiplo, não. Falha bloqueia, não avisa
  - 14 testes
- [x] case brief: schema versionado por seção, payload compacto (fatos conciliados, cálculos, exceções, lacunas e os focos do arquétipo — **nunca o data room cru**, para não criar a oportunidade de o modelo ler um número da página e repetir sem citar), instruções escritas como proibições, e `auditBrief` como portão único. Brief que não passa na auditoria **não sai com aviso: não sai**. Julgamento nasce não aprovado — "a alavancagem é confortável" é opinião do analista, não achado do sistema. 20 testes
- [ ] perguntas à administração e roadmap de diligência

## P1 — Fase E (estrutura da operação) — 20/08/2026

- [x] `packages/deal-structure`, determinístico:
  - **capacidade em três paredes independentes** — geração de caixa (ao DSCR mínimo do arquétipo), garantias (base elegível após haircut) e apetite de mercado (espaço até o teto de alavancagem) — e a resposta é a menor delas. **Nomear a parede restritiva é o produto**: "pediu 38, garantias sustentam 28" é conversa de estrutura; "o limite é 28" é recusa. Parede que não dá para calcular não é tratada como infinita — é reportada como lacuna
  - **term sheet indicativo** com `basis` em cada termo (capacidade · playbook · pedido da companhia · fato conciliado) e a razão junto. Prazo pedido fora da banda é puxado para dentro e o documento diz que puxou
  - **sem preço, deliberadamente**: a Offroad não precifica; custo sai da conversa com quem toma o risco. Inventar taxa é o jeito mais rápido de perder a confiança da companhia quando o mercado responde outra coisa
  - tetos de alavancagem e DSCR mínimo por arquétipo entraram no playbook como **dado** (3,5x / 1,30x em expansão; 2,5x / 1,20x em giro; 4,0x / 1,35x em aquisição) — são os primeiros números que um profissional de crédito vai querer discutir
  - 13 testes
- [ ] materiais institucionais no template Offroad (perfil de crédito, teaser, pacote) e render em PDF
- [ ] modelo financeiro exportável

## Estado corrente (20/08/2026)

A linha do pipeline está ligada de ponta a ponta: empresa envia documentos → app assina os
links e abre a run → worker baixa, escaneia, parseia, classifica, **extrai com citação
verificada** e grava os candidatos → o último job move a sessão para `review_ready` → a tela de
revisão mostra os fatos com âncora. Nenhum passo é fixture. Qualidade medida sobre documentos
reais: **recall material 75,4%, precisão 79,0%, ~US$ 2,50/caso** (gate: 90/98).

Handoff completo, incluindo como testar o fluxo e o que falta:
[`HANDOFF_2026-08-20.md`](HANDOFF_2026-08-20.md). Alvo do produto e plano por fases:
[`DCM_DESK_DE_PARA.md`](DCM_DESK_DE_PARA.md).

Produção canônica: `https://offroad.capital`
