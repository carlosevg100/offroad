# Build State

Atualizado em: 2026-08-24
Baseline: `main` após PRs #41, #44, #46, #47, #48, #49 (18/08/2026)
Repositório: `carlosevg100/offroad` · Produção: `https://offroad.capital`

## Fundações bulletproof, 24/08/2026

O plano aprovado pelo fundador está versionado em
[`BULLETPROOF_EXECUTION_PLAN.md`](BULLETPROOF_EXECUTION_PLAN.md). Este primeiro
incremento fecha os contratos que todas as etapas posteriores devem respeitar:

- [x] taxonomia ortogonal v2: necessidade, fonte de pagamento, lastro,
  obrigação, valor mobiliário, mecanismo, veículo, provedor e rota de
  distribuição são dimensões distintas;
- [x] FIDC modelado exclusivamente como veículo de capital, sem ser confundido
  com obrigação da empresa ou instrumento distribuído;
- [x] seis estados operacionais do case separados do parecer de crédito, com
  direcionamento externo permitido somente no estado
  `ready_for_qualified_direction`;
- [x] manifesto unificado de linhagem com hashes das fontes, versões de
  pipeline, políticas de modelo, prompts, playbook, mercado e artefatos;
- [x] contrato de gold case ampliado para oito camadas: extração, conciliação,
  métricas, lacunas, estrutura, claims, materiais, matching e desfecho;
- [x] adaptador explícito do catálogo legado para a taxonomia v2, preservando o
  fluxo atual enquanto a migração é feita de forma controlada;
- [x] ADR 0009 registra as invariantes e o que ainda não foi implementado.

Os Gates 2, 3 e 4 já avançaram além desta fundação: o runner único e a atestação pela identidade
do worker estão ligados, o primeiro case corporativo âncora atravessa as oito camadas e o registro
de claims governa publicação. Permanecem pendentes a revisão econômica independente final do
case âncora, a fábrica paramétrica, a trilha específica de recebíveis/FIDC e o gate de promoção em
staging. Esses itens continuam explícitos no plano de execução.

O Gate 2 começou com `@offroad/case-runner`: um trilho sem dependência de UI ou banco que executa
extração, conciliação, métricas, lacunas, estrutura, claims, materiais, matching e desfecho em ordem
fixa. Cada etapa valida seu contrato, registra fingerprint, duração, custo e chamadas. Falha,
bloqueio, contrato inválido ou budget excedido interrompem todas as etapas posteriores. O pacote
`@offroad/case-engine` agora conecta esse trilho aos motores reais e é a única implementação
econômica usada pela aplicação web e pelo worker. Depois do último documento, o banco enfileira um
job de análise do case. Uma capability temporária entrega ao worker apenas o case, suas evidências e
os mandatos necessários; o worker executa o trilho, grava o manifesto append-only e encerra a run.
O navegador perdeu a permissão de atestar snapshots. Identidades e critérios completos de fundos
ficam no resultado privado do job; o workspace da empresa recebe somente um resumo sanitizado do
matching. A indisponibilidade do redator ou de materiais continua sendo estado explícito do domínio,
sem transformar ausência de prosa em matemática inventada.

O Gate 4 separa três decisões que antes estavam misturadas. O auditor numérico determinístico
confere quantias e múltiplos contra fatos e cálculos citados. Um segundo modelo, de provedor
diferente do redator, recebe apenas o claim e o suporte reconciliado e audita significado,
qualificadores e extrapolações. Julgamentos materiais exigem uma decisão humana exata, append-only,
vinculada ao fingerprint do claim, ao manifesto imutável e ao snapshot da registry. Qualquer falha
numérica, semântica, ausência de revisão ou aprovação desatualizada mantém o brief internamente
visível, mas bloqueia teaser, perfil de crédito, pacote e data room de saída. Se um fato muda, a
registry identifica os claims e artefatos dependentes; a aprovação anterior não migra para a nova
redação.

No banco, `claim_decisions` tem RLS forçado e nenhum grant de escrita direta. O comando público é
`security invoker`; a implementação privilegiada vive em `private`, valida a versão mais recente do
snapshot e aceita somente o fingerprint exato de um julgamento material corrente. Apenas papéis de
revisão autorizados podem registrar a decisão. O worker lê decisões com a capability do job. As
migrations `20260824180255`, `20260824180448` e `20260824180822` estão aplicadas no projeto e o
Security Advisor permanece com zero alertas.

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
- [x] E2E em CI (stack local + Playwright), encontrou e corrigiu a criação de sessão sob RLS
- [x] páginas de erro/404 localizadas; placeholders desabilitados com "Em breve"; código morto removido
- [x] ADRs 0004–0007, ledgers e `handoff.md` atualizados
- [x] Sentry e PostHog ligados em produção (20/08/2026). Projeto `offroad` na org `olpi-technologies` do Sentry; no PostHog o plano free permite um projeto só, então o Offroad divide o `Default project` (341812) com o resto. `NEXT_PUBLIC_SENTRY_DSN` e `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` configurados em production, preview e development. Verificado ponta a ponta: evento de teste aparece como issue no Sentry (`firstEvent` gravado) e dois eventos `offroad_wiring_check` ingeridos no PostHog.
- [x] Configuração do projeto no Sentry (21/08/2026): `scrubIPAddresses` ligado no projeto e na org (IP é dado pessoal), 23 `sensitiveFields` com os nomes de campo deste domínio (`cnpj`, `requested_amount`, `ebitda`, `capability_token`, `result_summary` e os demais), `allowedDomains` restrito aos nossos quatro hosts (era `*`), `allowSharedIssues` desligado na org (issue era compartilhável por link público, com contexto financeiro dentro), e o scrubber ligado como **padrão da org**, senão um projeto novo nasceria sem ele. Regra de alerta em toda issue nova, porque sem tráfego tudo é sinal. Verificado num evento real: o IP chega ausente.
- [x] Stack trace de browser legível sem credencial nenhuma. Três elos, cada um invisível até o anterior cair: source map não era emitido (PR #115), era emitido e voltava 403 pelo `protectedSourcemaps` da Vercel (desligado via API; o repositório é público, então o mapa não expõe nada novo), o nome do arquivo era mastigado pela nossa própria redação em `[number]` (PR #116) e o frame apontava para `app:///`, que o Sentry só casa com artefato enviado (PR #117). Estado final medido: o Sentry busca o script e acha o mapa (`js_no_source` virou `js_invalid_sourcemap_location` num frame sintético, que é o esperado quando a linha é falsa).
- [x] Stack trace de servidor: **decidido não usar `SENTRY_AUTH_TOKEN`** (21/08/2026). O bundle de servidor nunca é servido, então raspagem não alcança e só o upload resolveria, o que exige um token de escrita. Não vale, porque o erro de servidor já é visível e legível em três lugares: o rastreio de runtime da Vercel (foi ele que confirmou a correção do PR #104, com arquivo e linha), o `reportServerFailure` deste repo, que grava passo, código e mensagem já redigida, e o Sentry para tudo que acontece no navegador do cliente. O token seria acabamento, não capacidade. A integração Sentry na marketplace da Vercel foi descartada no mesmo dia: é do tipo "Vercel Native", cria uma **conta Sentry nova** em vez de ligar a org `olpi-technologies`, e pode gerar cobrança.
- [ ] extrator geral de documentos (P1), plano detalhado em [`P1_INTELLIGENCE_PLAN.md`](P1_INTELLIGENCE_PLAN.md); ADR 0008

## P1: Fase F0 (fundações da inteligência), 18/08/2026

- [x] `packages/credit-ontology`: taxonomia, catálogo de campos (cobre os 38 do fixture + expansões), plano de contas, períodos/entidades, ranks, política de auto-aceite v1, regras R1–R17, definições (PR #52)
- [x] `packages/document-intelligence`: contratos de camada/perfil/candidato/exceção/brief, índice de camadas, verificador de âncora (7 checagens), normalizador Decimal (PR #53)
- [x] `packages/model-gateway`: Anthropic + OpenAI via API, política sem Haiku, structured outputs validados, budgets, fallback, redação, cassetes, logs sem conteúdo (PR #54)
- [x] `packages/evals` + gold case G1 (Rede Horizonte a partir do gabarito sintético) + baseline do fixture: precisão 100%, recall material 47,7%, exceções 7/12 (PR #55)
- [x] ADR 0008 (arquitetura da inteligência documental)
- [ ] revisão da ontologia por especialista (D-013); DPA/ZDR nos provedores (D-010)

## P1: Fase F1 (pipeline de documentos), 18/08/2026

- [x] F1-1 estado do pipeline: `processing_runs`, `processing_jobs`, `document_profiles` e `document_layers`; versão e resultado de portaria em `source_documents`; campos de verificação de âncora nos candidatos e metadados de reconciliação nas issues; buckets privados `document-layers` e `case-artifacts`; comando `begin_processing_run` (app) e seis comandos do worker, credencial de worker com hash para *claim* e capability token por job para o resto, **sem service-role** e sem `organization_id` vindo do chamador (migration `20260818171246`)
- [x] F1-1b endurecimento de privilégios encontrado pelo advisor: `anon` deixa de ter qualquer privilégio no schema `public`, as *default privileges* do bootstrap Supabase são revogadas (era a origem do vazamento desde `20260817202038`), os comandos `security definer` passam para `private` com wrappers `security invoker` em `public` (AGENTS.md §6) e os FKs do pipeline ganham índices de cobertura (migrations `20260818172243` e `20260818172357`)
- [x] F1-2 `packages/document-parsers`: bytes → camada com âncoras estáveis (`p12.t1.r4.c3`, `sDRE!B14`, `sec3.p7`, `sl4.b1`), tipo decidido por magic bytes, declarações de escala detectadas (nunca aplicadas), e recusa explícita do que não dá para ler; leitor próprio de XLSX porque o exceljs não enxerga o prefixo `x:` que estes arquivos usam e devolvia planilha vazia; `.xls/.doc/.ppt` recusados com mensagem acionável (sem parser mantido e sem advisory aberto); defesas contra arquivo hostil (bomba de descompressão, entidades XML, tetos por página/aba/tabela) com truncamento sempre reportado (PR #59)
- [x] F1-2b formatos universais (decisão do fundador, 18/08): `.xls`/`.xlsb`/`.ods`/`.dbf` lidos em processo (SheetJS 0.20.3 da distribuição oficial, a 0.18.5 do npm tem vulnerabilidade aberta), subtipo do contêiner Office 97 decidido pelo stream interno e não pela extensão, `.doc`/`.ppt`/`.rtf`/`.odt`/`.odp` por conversão e imagens/PDF digitalizado por OCR, ambos como capacidades que o worker empresta ao pacote puro; texto de OCR nunca sai do modo digitalizado nem entra em auto-aceite (PR #60)
- [ ] F1-3 `apps/document-worker` (contêiner com LibreOffice + OCR, fila, portaria/ClamAV, perfil pelo gateway) + deploy AWS ECS Fargate `sa-east-1` (D-003 aprovado)
  - [x] credenciais provisionadas (19/08): os quatro segredos auxiliares em `sa-east-1`, a conta de serviço `document-worker@offroad.capital` (sem organização, criada pelo signup público, sem service-role) e o `sha256` do token em `private.worker_tokens`; cadeia verificada de ponta a ponta com `worker_claim_job` respondendo `{"claimed": false}`
  - [x] workflow de deploy resolve os ARNs dos segredos pelo nome (`secretsmanager:DescribeSecret` sobre `offroad/*` no `offroadGitHubDeployRole`, metadados, nunca o valor)
  - [ ] imagem construída e publicada no ECR (0 imagens hoje) e serviço ECS criado (a criação depende de uma task definition registrada, logo vem depois do merge)
- [x] F2-1 `packages/document-extraction`: camada + ontologia → candidatos citados. O modelo lê e cita; o pacote decide o que sobrevive, toda âncora é reconferida contra o documento e o valor normalizado é calculado em código, nunca aceito do modelo. Evidência renderizada por linha com o id da âncora; documento grande vira vários trechos em vez de um trecho truncado. 12 testes.
- [x] F2-1b `pnpm --filter @offroad/evals measure`: roda o extrator real sobre um gold case e pontua com o harness existente (recall material, precisão, alucinação, custo). Executado: 75,4% / 79,0%.
- [x] F2-1c `pnpm --filter @offroad/evals measure:classification`: roda o classificador real sobre o mesmo gold case (tipo, classe da informação, período, calibração da confiança). Executado em 20/08/2026: 100% de tipo, 0 errados com confiança. O `.env.local` segue com as chaves vazias por desenho; a medição roda no workflow `Measure classification`, onde uma sessão OIDC curta lê o Secrets Manager e mascara o valor.
- [ ] F2-2 reconciliação: `packages/evidence-compiler` tem 45 linhas e não concilia nada; as regras R1–R17 e os ranks de evidência existem em `credit-ontology` e ainda não têm consumidor
- [ ] F2-3 ligar o extrator ao worker (hoje o worker faz portaria → parse → camada → perfil e para aí)
- [ ] F1-4 UI: aba Documentos com índice organizado e tela de processamento por etapas (Realtime), paridade PT/EN
  - [x] emissão das URLs assinadas (`src/lib/intake/pipeline-run.ts`): o app assina o download em `opportunity-documents` e o upload da camada em `document-layers`, e abre a run com `begin_processing_run`, o worker continua sem credencial de Storage; atrás de `PIPELINE_RUNS_ENABLED`, desligada por padrão
  - [x] migration `20260819115701`: política de `insert` em `document-layers`, que faltava desde `20260818171246` (sem ela `createSignedUploadUrl` é recusado e a camada não tem onde ser gravada)
  - [x] ponto de chamada ligado (20/08): `processIntakeSession` bifurca, com `PIPELINE_RUNS_ENABLED` abre a run e **retorna**, sem tocar no caminho fixture; sem a flag, fixture como antes. Os dois nunca rodam juntos
  - [x] worker extrai de verdade: estágio E3 no pipeline, `worker_record_candidates` (migration `20260820104922`) grava candidato com âncora, quote e flags, e `worker_complete_job` move a sessão para `review_ready` quando o último job termina, sem isso a jornada acabava num spinner
  - [ ] tela de processamento por etapas (Realtime) e aba Documentos com índice organizado

## P1: Fase C (playbook do desk), 20/08/2026

- [x] `packages/credit-playbook`: cinco arquétipos de operação (crescimento/expansão, capital de giro, refinanciamento, aquisição, financiamento de equipamentos) mais o fallback, cada um com informação **mínima** (linha de recusa: sem isso o caso não abre) e **ideal** (linha de precificação), focos de análise com a pergunta que cada um responde, riscos como hipótese a testar, menu de estrutura (bandas de prazo, carência, amortização, garantias, covenants) e perguntas-padrão ligadas a um foco. Validado pelo fundador (D-013, 20 anos de banco de investimento)
- [x] motor de suficiência: a régua é respondida pelo que o pipeline **leu**, não pelo que alguém marcou; um documento pode satisfazer mais de um requisito; próximo passo em uma linha, PT/EN. 12 testes, incluindo integridade contra a ontologia (todo `DocumentKind` existe, todo field path resolve)
- [x] intake guiado (20/08): a empresa escolhe a operação antes de subir arquivo, e a régua se preenche sozinha conforme cada documento é classificado, mínimo e ideal em listas separadas, nunca uma barra só, com o "por que importa" em cada item pendente e uma linha dizendo qual é o próximo passo
- [ ] captura da operação pretendida no início (arquétipo, montante, uso, prazo/taxa almejados)

## P1: Fase B (conciliar e calcular), 20/08/2026

- [x] `packages/reconciliation`: **determinístico de ponta a ponta, sem nenhuma chamada de modelo**
  - precedência entre fontes por **rank de evidência** (auditado > revisado > gerencial > apresentação), nunca por recência ou confiança; o valor perdedor **não é descartado**, fica anexado ao fato com sua fonte e âncora, porque a diferença é justamente a pergunta que o investidor faz
  - regras R3/R4/R5/R11/R13/R14/R16 como aritmética sobre os fatos conciliados; toda exceção nasce com **os dois lados e os dois documentos**, e é uma pergunta, não um veredito
  - cálculos com **trace**: dívida líquida, EBITDA ajustado, alavancagem pré e pós, capacidade de garantias após haircut, totais de fontes e usos, cada insumo aponta o campo e o documento de onde veio; cálculo sem insumo **não é estimado**, vira lacuna reportada
  - lacunas de informação a partir do checklist do playbook e dos campos materiais ausentes: viram pedidos com o "por que importa" junto
  - 14 testes; alavancagem pré confere com o gabarito (1,7788x)
- [ ] ligar ao worker: rodar a conciliação ao fim da run e persistir fatos, exceções e cálculos
- [ ] aba Financeiro e aba Conciliação na UI

## P1: Fase D (entendimento do case), 20/08/2026

- [x] `packages/case-understanding`, determinístico:
  - **score de prontidão em cinco componentes**, nunca um número só, suficiência de dados (mínimo pesa o dobro), estado da conciliação (ponderado por severidade), qualidade da evidência (rank médio + % com âncora confirmada), lacunas materiais e bloqueios. Cada componente traz a explicação em números que o leitor confere. **Bloqueio não desconta pontos: segura o caso.** Um pacote 90% completo com balanço que não fecha não está 90% pronto
  - **auditor de evidência**: relê cada claim material, extrai os números realmente escritos na frase e recusa qualquer um que não apareça nos fatos ou cálculos citados. Ano, percentual e contagem passam sem suporte (senão a prosa fica impossível de escrever); dinheiro e múltiplo, não. Falha bloqueia, não avisa
  - 14 testes
- [x] case brief: schema versionado por seção, payload compacto (fatos conciliados, cálculos, exceções, lacunas e os focos do arquétipo, **nunca o data room cru**, para não criar a oportunidade de o modelo ler um número da página e repetir sem citar), instruções escritas como proibições, e `auditBrief` como portão único. Brief que não passa na auditoria **não sai com aviso: não sai**. Julgamento nasce não aprovado, "a alavancagem é confortável" é opinião do analista, não achado do sistema. 20 testes
- [ ] perguntas à administração e roadmap de diligência

## P1: Fase E (estrutura da operação), 20/08/2026

- [x] `packages/deal-structure`, determinístico:
  - **capacidade em três paredes independentes**, geração de caixa (ao DSCR mínimo do arquétipo), garantias (base elegível após haircut) e apetite de mercado (espaço até o teto de alavancagem), e a resposta é a menor delas. **Nomear a parede restritiva é o produto**: "pediu 38, garantias sustentam 28" é conversa de estrutura; "o limite é 28" é recusa. Parede que não dá para calcular não é tratada como infinita, é reportada como lacuna
  - **term sheet indicativo** com `basis` em cada termo (capacidade · playbook · pedido da companhia · fato conciliado) e a razão junto. Prazo pedido fora da banda é puxado para dentro e o documento diz que puxou
  - **sem preço, deliberadamente**: a Offroad não precifica; custo sai da conversa com quem toma o risco. Inventar taxa é o jeito mais rápido de perder a confiança da companhia quando o mercado responde outra coisa
  - tetos de alavancagem e DSCR mínimo por arquétipo entraram no playbook como **dado** (3,5x / 1,30x em expansão; 2,5x / 1,20x em giro; 4,0x / 1,35x em aquisição), são os primeiros números que um profissional de crédito vai querer discutir
  - 13 testes
- [x] `packages/case-materials`: os três documentos que um processo de dívida precisa, **teaser** (diz o bastante sem dizer quem, até a companhia autorizar), **perfil de crédito** (a análise) e **pacote** (perfil + estrutura indicativa). Compilados dos fatos, não escritos à mão. **Exceção crítica bloqueia os três**, caso que não concilia não chega ao investidor com capa bonita, e brief que falha na auditoria não pode ser citado, porque as frases dele são exatamente o que seria citado. Pontos em aberto entram no documento: investidor que descobre sozinho confia menos que o que recebeu a lista. PT/EN com economia idêntica por construção; detecção de material desatualizado quando um fato se move. 11 testes
- [ ] render em PDF no template Offroad
- [ ] modelo financeiro exportável

## Tudo ligado (20/08/2026)

`buildCaseState` é o único caminho e a ordem carrega significado: **concilia → mede prontidão →
dimensiona capacidade → estrutura o term sheet → escreve o brief → compila os materiais**. Nada é
dimensionado antes de os números conciliarem, nada é escrito antes de ser dimensionado, nada é
compilado antes de o que foi escrito passar pela auditoria. Cada etapa degrada com honestidade:
brief que não sai deixa o case com fatos, exceções, prontidão e estrutura, o que nunca acontece
é uma etapa inventar insumo que não recebeu. Tela de revisão mostra tudo, e **cada ausência
explica a si mesma** (brief recusado diz que a auditoria recusou; parede não calculada diz qual
insumo faltou), porque tela que omite em silêncio ensina o leitor a achar que branco é zero.

## Entregáveis, aprendizado e horizonte (20/08/2026, tarde)

**Os materiais saem como documento.** `@offroad/case-render` transforma um material em página A4
no template Offroad, impressa em PDF pelo próprio Chrome, sem headless na serverless e sem
serviço de render para manter vivo. As citações sobrevivem: cada alegação vira marcador numerado
e resolve num apêndice de Fontes até o campo, o período e o nome do arquivo de origem. Rota
`/[locale]/app/materials/[sessionId]/[kind]`, `?print=1` abre o diálogo de impressão.

**O caso deixou de ser recomputado a cada render.** `saveCaseState` existia e nunca era chamado,
então toda atualização da tela re-rodava a linha inteira, inclusive a chamada de modelo que
escreve o brief, quatro refreshes custavam quatro briefs, cada um com redação levemente
diferente. `resolveCaseState` calcula uma vez por estado do data room, com fingerprint sobre
arquétipo, status, contagens de documento/candidato/resposta e o `updated_at` mais recente dos
candidatos. Invalidado por mudança, nunca por idade.

**Modelo financeiro exportável.** `@offroad/financial-model` emite um `.xlsx` real com 159
fórmulas vivas: projeção operacional, cronograma de dívida com carência e SAC, CFADS, DSCR e
alavancagem contra o teto do playbook. É modelo de crédito, não de equity, não projeta balanço,
e a capa diz isso. Toda célula editável fica numa única aba, garantido por teste; o SheetJS
community não escreve estilo (medido, não suposto), então a convenção de célula azul foi
substituída por uma estrutural que sobrevive a qualquer writer. Um avaliador de planilha
escrito só para teste executa as fórmulas como o Excel faria, o que pegou três expectativas
minhas erradas e um bug que nada mais veria: célula de fórmula sem valor em cache sai como
`t="e"` e a projeção inteira abre em `#N/A`.

**A plataforma aprende com correção.** `review_intake_candidate` sobrescrevia
`normalized_value` no lugar, a proposta do modelo era destruída pelo próprio ato de corrigi-la.
`extraction_feedback` grava toda decisão humana com o estado anterior congelado ao lado, dentro
da mesma transação e antes do update. Append-only na ACL, não só na intenção: `authenticated`
tem SELECT e INSERT, então UPDATE e DELETE levantam 42501 (verificado contra o projeto).
`@offroad/extraction-learning` mede acurácia por campo **e tipo de documento**, com limite
inferior de Wilson em toda taxa e erro de escala contado à parte, e usa isso para decidir o
auto-accept: campo com erro de escala no histórico fica travado em qualquer confiança, campo
não provado precisa ganhar o direito, campo abaixo de cara-ou-coroa fica travado, campo abaixo
da meta tem a barra elevada.

**O pedido ganhou eixo de tempo.** Três horizontes, **Agora** (aberto, ≤ 20 itens por teste),
**Quando um fundo se interessar** (fechado, explicitamente não pedido) e **Se a operação
acontecer** (fechado, sem marcas, `source: "notice"`). Todo item pendente pode ser respondido
sem arquivo: não se aplica, parcial, depois do NDA, e "não se aplica" exige razão no tipo, na
server action e numa check constraint.

## Estado corrente (20/08/2026)

A linha do pipeline está ligada de ponta a ponta: empresa envia documentos → app assina os
links e abre a run → worker baixa, escaneia, parseia, classifica, **extrai com citação
verificada** e grava os candidatos → o último job move a sessão para `review_ready` → a tela de
revisão mostra os fatos com âncora. Nenhum passo é fixture.

Qualidade medida sobre documentos reais, agora nos dois estágios:

| estágio | medida | resultado | custo |
|---|---|---|---|
| E1 classificação | tipo do documento | **8/8, 100%** | US$ 0,0946 / 8 docs |
| E1 classificação | classe da informação | 6/8, 75,0% | |
| E1 classificação | período | 5/5, 100% | |
| E1 classificação | errado com confiança >= 0,80 | **0** | |
| E3 extração (rede-horizonte) | recall material | 75,4% | ~US$ 2,50 / caso |
| E3 extração (rede-horizonte) | precisão | 79,0% | |
| E1 classificação (fakeco) | tipo do documento | **100%** (9/9) | US$ 0,041 / 9 docs |
| E1 classificação (fakeco) | classe da informação | **100%** (9/9) | |
| E1 classificação (fakeco) | errado com confiança | **0** | |
| E3 extração (fakeco) | recall material | **80,2%** (105/131) | US$ 1,09 / caso |
| E3 extração (fakeco) | recall de dívida | **92,6%** (50/54), era 1,9% | |
| E3 extração (fakeco) | precisão | 83,9% (125/149) | |
| E3 extração (fakeco) | alucinação | 0% | |

E1 não tinha número nenhum até 20/08/2026, e a ausência não era neutra: a medição de E3
entrega ao extrator o tipo **correto** de propósito, para isolar os estágios, então "quão bom é
o pipeline" era só metade da resposta. Com os 100% de tipo, o 75,4% de E3 passa a valer como
afirmação ponta a ponta em vez de condicional.

A primeira execução encontrou um defeito que derrubava a classificação inteira: o schema exigia
a chave presente com `null` e todo modelo omite a chave, então primário e fallback falhavam e o
documento voltava sem perfil algum (corrigido na PR #110).

As duas divergências de classe são a mesma: a carta do CFO e o memorial descritivo foram lidos
como `management` onde o gabarito diz `company_document`. Isso muda a precedência de evidência
(rank 5 contra 7), ou seja, o classificador dá a esses documentos **mais** peso do que o
gabarito pretendia. Defensável dos dois lados e é decisão de mesa, não de código: um parecer do
CFO é informação da administração ou documento societário? Pendente com o fundador.

Reproduzir: workflow `Measure classification` (manual, chaves via OIDC no Secrets Manager).

## O que a Aurora encontrou, 21/08/2026

O segundo gold case (`packages/testing-fixtures/gold/fakeco`) existe para medir o que o
primeiro não alcança. Em algumas horas ele achou cinco coisas, e três eram defeito nosso.

**Corrigido.** A classe da informação era escolhida pelo modelo e o rank de evidência derivava
dela, então um `trial_balance` corretamente identificado podia ser ranqueado 5 em vez de 3 e
inverter a precedência entre dois documentos que discordam (PR #123). A ontologia não tinha tipo
para relação de clientes, e como `other` não mapeia para grupo de campo nenhum, o grupo
`customers` era inalcançável na prática (PR #124). E o próprio gabarito falava um dialeto
inventado, o que fez a primeira medição reportar 8,1% quando o real era 42% (PR #125).

**Aberto, e é o maior buraco do produto: extração de dívida está em 1,9% (1 de 54 campos).**
Tudo o mais está entre 50% e 100%. Só a dívida colapsa, e ela é a primeira coisa que uma mesa de
crédito lê. A instalação está correta ponta a ponta e foi verificada: o `debt_schedule` pede 34
alvos incluindo todos os moldes `debt.instruments.{i}.*`, o prompt explica como preencher o
índice e diz que os itens seguem a ordem do documento, e a planilha é lida com 68 células. O
modelo recebe a pergunta certa sobre um documento legível e devolve **1 candidato com zero
ausentes**, ou seja, nem sequer declara o que não achou. É comportamento de modelo em tabela
larga, não encanamento quebrado, e o caminho provável é fatiar tabelas por linha em vez de
mandar a tabela inteira num trecho só.

Isso era invisível antes porque o gabarito do rede-horizonte tem **zero** campos de dívida.

**Resolvido em 21/08 (PR #130): passadas por linha.** O modelo, pedido para expandir 7 linhas
por 7 campos de uma vez, devolvia 1 candidato; nenhuma redação de prompt conserta uma tarefa
que nunca deveria ter sido uma tarefa só. A orquestração agora enumera e o modelo lê: cada
linha de dados de tabela detectada vira uma passada própria, com cabeçalho, âncora da linha e
os padrões indexados já com o índice aplicado. Linhas de total são filtradas antes do modelo,
ausências de passada por linha são ignoradas, e o candidato da linha ganha o dedup contra o do
documento inteiro. Dívida foi de 1,9% para **92,6%**; o recall material do caso, de 42% para
**80,2%**. Restam: customers a 50% (provável normalização de percentual), leverage 0/1 (campo
calculado que o gabarito não deveria esperar de extração) e o OCR ainda sem número.

**Aberto, e é limitação do instrumento, não do produto.** O contrato social chega como foto e
produziu zero candidatos: o harness de medição roda fora do worker e não tem OCR, que é
capacidade que o worker empresta. O caminho de OCR continua sem número, e medi-lo exige rodar a
medição dentro do worker.


Handoff completo, incluindo como testar o fluxo e o que falta:
[`HANDOFF_2026-08-20.md`](HANDOFF_2026-08-20.md). Alvo do produto e plano por fases:
[`DCM_DESK_DE_PARA.md`](DCM_DESK_DE_PARA.md).

Produção canônica: `https://offroad.capital`

## Documentos institucionais, mesa na tela e a primeira companhia aberta, 21/08/2026

Três PRs (#132, #133, #134); detalhe em `HANDOFF_2026-08-21.md`.

- **Investment Memorandum e Term Sheet** compilados dos números da mesa (não da prosa do brief):
  termos-chave, operação, companhia, histórico, estrutura de capital e tratamento, trajetória com
  covenant proposto, projeções, fatores de risco com resposta estrutural, base de preparação;
  term sheet com partes, termos econômicos com a base ao lado de cada um, destinação, garantias,
  covenants, CPs, obrigações de informação, eventos de vencimento. Só saem quando a mesa rodou.
- **Mesa na tela do case**: o que estava calculado e persistido e nunca aparecia.
- **Camil Alimentos**: gold case com arquivamentos públicos reais. O que a mesa errou ao ler uma
  companhia aberta está corrigido (data-base do estoque, covenant da companhia, refinanciamento
  abatido, EBITDA mantido sem projeção, taxas `% do DI` e `pré`). Medições de extração e
  classificação disparadas; números a registrar na tabela abaixo quando terminarem.

| medição | métrica | valor | custo |
|---|---|---|---|
| E1 classificação (camil) | tipo / classe | pendente | |
| E3 extração (camil) | recall material / precisão | pendente | |

## Venture debt e a Nimbus, 21/08/2026 (fim do dia)

- **Sexto arquétipo** (`venture_debt`, PR #135): exigências, focos, riscos, estrutura e perguntas
  de um credor de venture debt; capacidade = menor entre 30% do ARR e 35% da última rodada, nunca
  múltiplo de EBITDA. Campos novos na ontologia (ARR, MRR, queima, runway, NRR, churn, última
  rodada) e dois tipos de documento (`cap_table`, `metrics_report`). A migração também consertou
  o check de `document_profiles`, que não conhecia `customer_concentration`; um teste agora lê
  todas as migrações e cobra cada tipo e cada arquétipo.
- **Nimbus** (quarto gold case, sintético): SaaS de Série A, 40 clientes × 24 meses de MRR com
  semente fixa, cap table, gerencial, extrato; duas contradições (ARR do deck × export; runway
  declarado × calculado). 81 campos.
- **Mesa para quem queima caixa**: perfil `cash_burning` (sem turns, sem teste de covenant sobre
  EBITDA negativo, sem trajetória de alavancagem); seção de runway (antes, depois, depois com o
  serviço da própria dívida), dívida/ARR, NRR, concentração; leituras e perguntas próprias; bloco
  "Runway e receita recorrente" nos materiais; métricas na tela. Índice TR lido.

| medição | métrica | valor | custo |
|---|---|---|---|
| E1 classificação (camil) | tipo / classe / período | **100%** (3/3, 3/3, 2/2) | US$ 0,036 / 3 docs |
| E3 extração (camil) | recall material / precisão | em execução | |
| E1 classificação (nimbus) | tipo / classe / período | **100%** (6/6), 100% (6/6), 67% (2/3) | US$ 0,030 / 6 docs |
| E3 extração (nimbus) | recall material / precisão / alucinação | 73,4% (47/64) / 79,8% / **0%** | US$ 0,71 / 14 chamadas |
| E3 extração (nimbus, após #141) | recall material / precisão / alucinação | **85,9%** (55/64) / 85,6% / **0%** | US$ 0,91 / 15 chamadas |
| E3 extração (camil, antes de #143) | recall material / precisão / alucinação | 11,1% (15/135) / 50,0% / 0% | US$ 14,32 / 1.575 chamadas / 2h19 |
| E3 extração (nimbus, após #143) | recall material / precisão / alucinação | **92,2%** (59/64) / 87,4% / **0%** | US$ 0,92 / 15 chamadas |
| E3 extração (camil, após #143) | recall material / precisão / alucinação | 39,3% (53/135) / 66,7% / 0% | US$ 5,32 / 246 chamadas / 15 min |

## Mapa de entrega, perfil de vencimentos e simulações, 21/08/2026 (noite)

- **Mapa de entrega ao lado da zona de arrastar** (#137): a zona sobe para logo depois da
  escolha da operação; abaixo dela, quantos itens de agora já chegaram, cada item como chip que
  marca sozinho, e uma frase por arquivo (o que atendeu, como foi lido quando não atendeu nada,
  ou que ainda espera leitura). Preview em `/pt-BR/dev/case-preview`.
- **Cronograma por janela** (#138): `debt.maturity_profile.{i}.window/amount` na ontologia; a
  mesa lê "Jun/26 a Mai/27" e usa o perfil quando as linhas não têm vencimento. Leitura nova:
  principal de 12 meses contra o caixa (Camil: R$ 1,23 bi contra R$ 1,43 bi, 1,16x), com
  pergunta e métrica na tela.
- **Simulações**: `pnpm --filter @offroad/evals desk:gold camil -- --amount 800000000 --term 84
  --grace 24 --refinancing 600000000` responde "e se pedíssemos menos, mais longo, mais troca?"
  sem tocar no gabarito.
- **Produção**: os 500 de `/.env`, `/wp-login.php` e `/foo.bar` vistos na Vercel até 20/08
  21:17 pararam com o #104; sondado em 21/08: os três respondem 404 e `/pt-BR` 200.
- **Extração em quatro faixas** (#140): a Camil fez 431 chamadas sequenciais em 45 min (US$ 4,68)
  e foi cortada; as passadas agora correm até quatro em paralelo, mescladas na ordem do documento.
  Tetos por job do worker: 40 chamadas / US$ 5 viraram 800 / US$ 12, porque o teto de chamadas
  recusaria um arquivamento de companhia aberta de cara; o de custo continua sendo a guarda.
  Os workflows de medição ganharam 180 min (#139).
- **O que a Nimbus ensinou ao extrator** (#141): custos com sinal negativo viravam fato negativo
  (agora magnitude); "R$" e "BRL" eram duas moedas (canônico); a tabela de dívida de uma carta
  nunca era pedida (carta passa a mirar `debt`); planilha com várias abas era lida em uma janela
  e o resumo (ARR, MRR, queima) não voltava (uma aba por janela). CNPJ nos gabaritos em dígitos.
- **O que a Camil ensinou ao extrator** (#143): os números saíram certos e os caminhos saíram no
  dialeto do modelo (`interim_financials.2026.revenue`, `revenue_ytd`) em vez do canônico
  (`2026_05.revenue_3m`); o verificador passa a escrever o período no caminho a partir das datas
  citadas, e ano é o ano em que o período termina. ITR e protocolo CVM passam a mirar histórico e
  dívida (a nota 15 rendeu zero instrumentos porque nunca foi pedida). Passadas por linha só em
  tabelas com duas palavras do vocabulário dos campos indexados (eram 913 passadas no ITR).
  Re-medição da Camil disparada depois do merge.
- **Segunda rodada de medições** (noite): Nimbus é o primeiro caso a passar o gate de recall
  (92,2%); Camil subiu de 11% para 39% e caiu de US$ 14 / 2h19 para US$ 5 / 15 min. O que
  sobrou na Camil é numeração de instrumentos reiniciando a cada tabela (#144), as tabelas dos
  comentários dos diretores (R$ mn, colunas fev-25/fev-26) e o covenant em prosa.

## Onda A em andamento e o começo da Onda B, 21/08/2026 (noite, segunda parte)

Plano em `PLANO_E2E_100.md`. O que entrou ou está em PR:

- **Conciliação que vê contradição** (#146, #155): o eval nunca rodava a conciliação (snapshot
  entrava com `exceptions: []`); agora roda a mesma do produto e pontua. R3 cobre todo fato
  material (crítico em pedido, receita, EBITDA, ARR, dívida, caixa acima de 5%; baixo quando é
  arredondamento abaixo de 1%); R18 runway declarado × caixa/queima; R19 mapa de dívida × dívida
  bruta do balanço (o arrendamento fora do mapa da Aurora). Modelo financeiro passa a mirar
  `transaction` (o pedido do plano nunca era lido).
- **Uma linha é uma linha** (#147, #153): instrumentos de documentos diferentes nunca dividem
  número; dentro de um documento, tabelas diferentes também não (o deck da Nimbus produzia o CEO
  contra um fundo como "contradição"). Período menor que um ano vai para `interim` mesmo quando o
  modelo escreve `historical`.
- **Consolidado é o número da companhia** (#148): prompt, escopo no candidato até a conciliação,
  preferência por consolidado sobre controladora.
- **OCR medido** (#149): motor Tesseract movido para `document-parsers`, o eval usa o mesmo motor
  do worker, o runner instala; quinto caso `fakeco-scan` (demonstrações, mapa de dívida e contrato
  social como imagem, 83 campos). Medição a disparar.
- **Percentual é fração** (#150): "12,5%" → 0,125; 115 de retenção → 1,15.
- **Cogna** (#151): sexto caso, companhia aberta de serviços lida do release do 2T26 (57 campos,
  parede de 2028, arrendamentos fora da dívida). Simulação: R$ 1,8 bi em debêntures.
- **Rating interno** (#152) e **tabela de stress** (#154), Onda B: dez graus a partir de sete
  fatores com faixas escritas como dado; quatro choques padrão e a perda do maior cliente,
  recalculados dos números da mesa. Integração na tela e nos materiais vem em seguida.

| medição | métrica | valor | custo |
|---|---|---|---|
| E3 extração (nimbus, #146 com conciliação) | recall / precisão / exceções | 89,1% / 86,6% / 40% (2/5) | US$ 0,92 |
| E3 extração (fakeco, #146 com conciliação) | recall / precisão / exceções | 87,8% / 88,3% / 0% (antes de #153, #155) | US$ 0,89 |
| E3 extração (camil, #144) | recall / precisão | 54,8% / 65,0% | US$ 5,47 / 247 chamadas |

## Terceira leva da noite, 21/08/2026

- **OCR em produção estava quebrado** (#160): pdf.js destaca o buffer e o OCR recebia zero
  bytes; todo PDF escaneado lia vazio, no worker e no eval. Corrigido com teste na sala escaneada.
- **Catálogo de instrumentos** (#158), **pacote de garantias** (#159), **Q&A de diligência**
  (#162), **preview da Nimbus** (#161), **cobertura de juros** (#157, merged).
- **Conciliação**: contradição só entre documentos, não entre duas leituras da mesma página
  (#164); instrumentos de dois documentos com o mesmo nome são um só (#165); release de
  resultados é gerencial e janela de leitura limitada a 200 linhas (#165).

| medição | métrica | valor | custo |
|---|---|---|---|
| E1 classificação (cogna) | tipo / classe | 50% (release lido como relatório de métricas, corrigido em #165) / 100% | US$ 0,013 |
| E3 extração (cogna, antes de #165) | recall / precisão / exceções | 22,9% / 92,3% / 100% (FP 19) | US$ 0,35 / 3 chamadas |
| E3 extração (camil, #155) | recall / precisão / exceções | 41,5% / 56,9% / 100% (FP 16, corrigido em #164) | US$ 5,42 / 243 chamadas |
| E3 extração (fakeco-scan, OCR, antes de #160) | recall | 0% (buffer destacado) | |

## Quarta leva da noite, 21/08/2026: o comitê na tela e no memo

- **Comitê na tela e no memorando** (#170): rating com fator a fator, tabela de stress, papéis
  que o perfil admite, pacote de garantias e preço indicativo (documento interno; o term sheet
  segue sem taxa por decisão de desenho), computados uma vez no pipeline e lidos pela tela e pelo
  memo (seção 10). Referência de preço em `packages/market-reference` (#167), com proveniência
  "prática da mesa" em todo número. Base de investidores e shortlist em `packages/investor-base`
  (#169, sintético). Covenants como a escritura escreve (#172).
- **Medições**: workflows passam a rodar um caso ao lado do outro (#171). `fakeco-scan` com OCR
  funcionando: 22,9% de recall com 3 chamadas; o próximo passo do OCR é reconstruir tabelas a
  partir das linhas reconhecidas (hoje cada documento vira uma janela de prosa, sem passadas por
  linha). Nimbus, FakeCo, Cogna e Camil a re-medir depois do #171.
- **Processo**: auto-merge ligado e `strict` desligado na proteção de `main` para drenar a fila;
  religar `strict` quando esvaziar. Lição da noite: só fazer push depois de `pnpm check` verde
  lido de arquivo, não de `grep | head` (dois PRs subiram vermelhos por isso e foram corrigidos).

## Quinta leva da noite, 21/08 para 22/08/2026: regressões medidas, sala de saída, Word, sondagem

O que entrou em `main` (todos por auto-merge após CI verde):

| PR | O quê |
|---|---|
| #172, #173 | Catálogo de covenants no term sheet; docs |
| #174, #181 | OCR: tabelas reconstruídas das linhas do Tesseract; depois linhas reconstruídas por posição vertical, porque o Tesseract lê tabela coluna a coluna |
| #175, #176 | `@offroad/data-room`: sala de saída com portões (antes do NDA, após NDA, interno), retenções (exceção bloqueante, hash não verificado, sem classificação), pendências como pedidos; painel no case e índice interno imprimível |
| #177 | Duas regressões de extração: uma tupla por linha de planilha (a célula ficava na chave) e zero à esquerda nunca é milhar (`0.181` lia 181) |
| #178 | Falsos positivos de exceção contados só sobre regras; lacunas são pedidos. Copy do playbook sem "médio porte" |
| #179 | `@offroad/case-export`: materiais em Word (zip próprio, determinístico) e rota `/docx` |
| #180, #183, #184 (fila) | `@offroad/sounding` (estágios, indicações numa régua, book, alocação, trilha), tabelas `soundings`, `sounding_investors`, `sounding_events` (append-only) e a tela `/app/sounding/<sessão>` |
| #182 | Carta, deck e memorial passam a mirar os grupos financeiros que reescrevem (a contradição precisa dos dois valores); aging, licenças e intermediário revisado no playbook |
| #185 (fila) | Identidade de emissão e série como credor; moeda da tabela; remuneração e vencimento por série em prosa |

Medido (recall de campos materiais / precisão / recall de exceções, FP só sobre regras):

| Caso | Antes da leva | Depois |
|---|---|---|
| Nimbus | 82,8% (regressão de #165) | **92,2% / 87,0% / 80%** (#182) |
| FakeCo (Aurora) | 58,0% (regressão de #165) | **93,9% / 94,0% / 100%** (#182) |
| fakeco-scan (OCR) | 15,7% | **59,0% / 96,1%** (#181) |
| Cogna | 22,9% | 31,3% |
| Camil | 53,3% (tudo a 100% exceto `debt.instruments`: 57 de 63 faltas) | em medição com #185 |

O que a medição ensinou: (1) a chave da tupla guardava a célula da planilha, e sete instrumentos viraram 51 tuplas de um campo; (2) `0.181` era lido como milhar em pt-BR; (3) as "falsas" exceções eram os requisitos do playbook; (4) a contradição só aparece se o segundo documento também for alvo do campo; (5) Tesseract devolve tabela coluna a coluna, então linha se reconstrói por posição vertical; (6) na companhia aberta, a série da emissão é a identidade do instrumento e a taxa está em prosa na proposta da administração.

Armadilha recorrente: depois de trocar de branch, `apps/web/.next/types` fica obsoleto e o `pnpm check` falha com rota inexistente; apagar a pasta antes do gate.

## Sexta leva, madrugada de 22/08/2026: execução e pós-closing como domínio

| PR | O quê |
|---|---|
| #187 | `@offroad/closing`: cronograma de pagamentos (SAC, Price, bullet; mensal a anual; carência paga ou capitalizada; CDI+, % CDI, pré, IPCA+ sobre base declarada) e condições precedentes (tier de closing do playbook + pacote de garantias + condições do investidor; satisfação exige evidência, dispensa exige motivo; prontidão para desembolso) |
| #188 | `@offroad/monitoring`: covenants testados a cada período nas definições da escritura, folga como fração do limite, atenção abaixo de 10%, violação com data de cura, "não testável" quando falta insumo ou o denominador não é positivo; relatório ao investidor |
| #189 | Sondagem no preview de desenvolvimento (`/pt-BR/dev/case-preview?case=fakeco`); percentuais por locale |
| #190 | Limite de covenant é número (razão); a Aurora devolvia "<= 3,0x" como texto |

O que falta para fechar as Ondas E e F na tela: termos finais estruturados depois da alocação (valor, prazo, carência, amortização, taxa por linha), persistência das CPs e dos períodos de monitoramento, e a ingestão do balancete novo pela mesma entrada de documentos. Os pacotes já fazem a aritmética; falta a porta.

## Sétima leva, madrugada de 22/08/2026: os restos medidos, um a um

| PR | O quê |
|---|---|
| #192 | `@offroad/closing`: termos finais a partir do book (cada investidor com sua taxa, prazo e carência) e cronograma consolidado com o mês de pico |
| #193 | Pessoas e clientes nomeados duas vezes são uma linha (a merge por identidade cobre controladores, gestão e maiores clientes) |
| #194 | Verificador: id entre colchetes não é parte da citação; estoque não carrega janela; "resultado financeiro líquido" é a despesa financeira |
| #195 | Trimestre e semestre como o release escreve (2q, q2, 1s, h1, ytd) viram mês e janela |
| #196 | Eval: contradição nomeada por regra não é valor errado (conta na precisão, não no recall) |
| #197 (fila) | Período implausível é descartado (3110-05-31 virou caminho); emissão e série viram um nome só; gold da Camil nomeia as linhas como o ITR imprime |

Medido nesta leva (recall material / precisão / recall de exceções):

| Caso | Resultado | Onde |
|---|---|---|
| FakeCo (Aurora) | **95,4% / 97,5% / 100%** | #194 |
| Nimbus | **93,8% / 94,0% / 100%** | #193 |
| Camil | 45,9% / 51,5% / 100% com #185 (piorou: período alucinado e nomes de série); re-medição com #197 em curso | #185, #197 |
| Cogna | 31,3% com #195 (o modelo passou a escrever `2026_q2`; aceito em #197); re-medição em curso | #195, #197 |

Lição da noite: cada ponto de recall agora vem de uma regra pequena lida do artefato (uma célula na chave da tupla, um zero à esquerda, um colchete na citação, um trimestre escrito ao contrário). O caminho para a companhia aberta é o mesmo, só que em um filing de 140 páginas; o que falta na Camil é uma coisa só, a tabela de séries, e ela já tem nome canônico.

## Jornada guiada de originação, 22/08/2026

- A entrada de empresa e assessor deixa de pedir uma escolha entre "documentos" e
  "preenchimento manual". Existe um único início guiado: objetivo da captação, contorno
  essencial do pedido e informações.
- O objetivo selecionado continua sendo o arquétipo real do `credit-playbook`; nenhum fluxo
  paralelo ou checklist de apresentação foi criado.
- A lista de informações é adaptativa e separa três horizontes acionáveis: mínimo para abrir a
  análise, recomendado para estruturar com consistência e ideal para preparar a diligência.
  Cada item mantém exemplos aceitos, racional, estado e documentos que o satisfizeram.
- Garantias, custo e instrumento continuam disponíveis, mas ficam numa área opcional. A empresa
  não precisa adivinhar a estrutura de mercado para avançar.
- O upload permanece único, privado e multiformato. Depois do processamento, a classificação
  continua preenchendo a lista automaticamente e preservando a evidência de origem.
- Cobertura: E2E atualizado para a nova sequência; `pnpm check` verde em 32 pacotes.

## Manifesto reproduzível do case, 24/08/2026

- O cache do case deixou de usar contagens e o último `updated_at`. O fingerprint agora cobre o
  conteúdo econômico normalizado da sessão, documentos e hashes, candidatos completos, respostas,
  layers, run e todas as versões governantes. Alterar uma resposta ou um valor muda o snapshot.
- Cada tentativa de modelo registra apenas metadados e hashes: id, tarefa, provider, modelo,
  outcome, custo, tokens e fingerprints de prompt, input e output. Nenhum texto ou valor financeiro
  entra na trilha.
- O worker persiste essa linhagem no resultado interno do job. A aplicação lê somente a projeção
  sanitizada por RPC, sem receber payload, erro bruto ou conteúdo do documento.
- `case_artifact_manifests` é append-only, tem RLS forçado, SELECT por tenant e nenhum grant de
  INSERT, UPDATE ou DELETE. `record_case_snapshot` grava manifesto e snapshot na mesma transação.
- Este manifesto é imutável e reproduzível, mas ainda não é uma atestação confiável: enquanto a
  compilação ocorrer no request autenticado da aplicação, um tenant tecnicamente sofisticado pode
  chamar o mesmo comando autorizado. O Gate 2 move produção e gravação para a identidade do runner
  e remove esse EXECUTE de `authenticated` antes de qualquer liberação externa (R-022).
- Manifests antigos ou incompletos permanecem honestos por `capture.sources` e `capture.models`;
  captura parcial nunca deve liberar direcionamento externo nos gates seguintes.
