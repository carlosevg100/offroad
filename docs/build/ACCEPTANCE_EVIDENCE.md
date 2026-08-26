# Acceptance Evidence

## Workspace do Agente Offroad e pesquisa pública, 26/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Progresso real | `@offroad/case-runner`, worker e `@offroad/work-plan` | 11 estágios internos emitem eventos seguros; 14 tarefas públicas são projetadas sobre eventos persistidos e múltiplos documentos |
| Percentual não fabricado | onboarding PT-BR e EN-US | piso fixo de 12% removido; antes da execução o progresso é o cadastro real, depois passa a ser o plano processado |
| Pesquisa pública governada | `@offroad/public-research` | 5 temas, queries públicas limitadas, bloqueio de identificadores e valores privados, fallback entre provedores, deduplicação e lineage por fonte |
| Separação de evidência | worker, ADR 0014 e migration | pesquisa persiste como `external_context` e entra no snapshot apenas como status e contagens; não altera fato, cálculo ou matching |
| Alterações conversacionais | `@offroad/agent-contracts` | proposta tipada, ligada ao manifesto, com preview, evidência, impacto, recomputação, expiração e regra que impede número apoiado apenas por fonte pública |
| Persistência e isolamento | migration e `rls_non_interference.sql` | RLS forçado, nenhuma escrita direta do tenant, pesquisa escrita por capability, proposta decidida por comando e tenant cruzado bloqueado |
| Quality gate local | `pnpm check` | lint, typecheck, testes e build de produção verdes nos 41 pacotes; web gerou 28 rotas |
| CI obrigatório | GitHub Quality run `33008949043` | database, RLS, schema lint, E2E, lint, typecheck, testes e build verdes; Vercel preview verde |
| Staging antes de produção | Supabase branch `staging` | migrations rebaseadas sobre produção; fundação e hardening aplicados; Security Advisor com zero findings e nenhuma foreign key nova sem índice |
| Schema de produção | Supabase `ifnogpksgdadruooqydi` | remote migrations `20260826200143` e `20260826200443`; RLS forçado; sem grant anônimo; somente leitura autenticada; wrappers públicos invoker e implementações privadas definer |
| Estado inicial dos ledgers | SQL de verificação em produção | zero pesquisas, zero fontes e zero propostas imediatamente após a promoção |
| Worker de produção | GitHub deploy run `33007845496` | imagem `bb62b995dade`; task definition `offroad-document-worker:105`; ECS service stable |
| Tipos do banco | `apps/web/src/types/database.ts` | regenerados diretamente do schema de produção após a promoção |

Aceitação de código, banco, isolamento e worker está verde em produção. A superfície conversacional
continua fora do produto por decisão arquitetural: ela só entra quando aceitar uma proposta puder
acionar um comando de domínio real, idempotente, auditável e com recomputação explícita.

## House Playbook M8, 26/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Dezoito procedimentos executáveis de mercado | `@offroad/credit-playbook` | MK-01 a MK-18 candidates com métodos e verificações específicos; MK-19 a MK-28 são referência pós-introdução e permanecem `not_applicable` |
| Screening governado | `@offroad/fund-mandate` | filtros duros binários, proveniência, validade, divergência, shortlist qualitativa e ausência de percentual fictício cobertos por testes |
| Gate M7 para M8 | `@offroad/case-materials` e `@offroad/case-engine` | pacote recebe fingerprint único; validação cruzada, claim audit, revisão técnica e autorização da companhia precisam apontar para a mesma versão e destinatários nomeados |
| Persistência e isolamento | migration M8 e `rls_non_interference.sql` | política, plano, destinatários e introdução append-only; RLS forçado, sem DML direto, tenant cruzado bloqueado e comandos separados de revisão e autorização |
| Fronteira pública | `publicCaseState`, worker e web | identidades, contatos, ordem da onda, observações e resultados privados não são expostos; somente contagens e status chegam ao workspace |
| Superfície legada | rota `/app/sounding/<sessão>` | redirect seguro para o case; actions, servidor e componente de book e alocação removidos da aplicação ativa |

M8 está implementado no branch como candidate. A aceitação final exige reconstrução integral do
banco pelo CI, aplicação da migration em produção, advisors, tipos regenerados, deploy do worker e
verificação da rota e do estado público em `offroad.capital`.

## House Playbook M7, 26/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Trinta e dois procedimentos de materiais | `@offroad/credit-playbook` | MA-01 a MA-32 compilam como candidates determinísticos, derivados da fonte canônica, cada um com método e verificação próprios, sem handoff entre agentes e sem chamada de modelo |
| Material Truth Set | `@offroad/case-materials` | emite 32 estados, fingerprints, template e seções, suporte, disclaimer, identidade bilíngue, consistência, higiene da sala e decisão de circulação |
| Gate de circulação | testes de `materialTruth` | ausência de autorização mantém `internal_only`; somente quatro carimbos do mesmo fingerprint e destinatários nomeados concluem MA-32; claim órfão bloqueia a liberação |
| Trânsito e persistência | `@offroad/case-engine`, `@offroad/evals` e worker | o truth set atravessa a esteira, integra o manifesto e persiste no snapshot; resultados privados dos procedimentos são removidos na fronteira pública |
| Superfície web | workspace PT-BR e EN-US | estado, procedimentos concluídos, consistência e condição de circulação ficam visíveis antes dos links dos artefatos |
| Quality gate dirigido | playbook, materials, engine, evals, worker e web | 149 testes do playbook, 37 de materiais, 4 do engine, 32 evals, 46 do worker e typecheck web verdes antes do gate completo |

M7 está implementado no trilho real como candidate. A geração no workspace é interna e não equivale
a distribuição. A persistência da autorização por versão, escopo e destinatário está conectada ao
fluxo de introdução qualificada pelo M8; sem o gate completo, nenhuma execução declara circulação externa.

## House Playbook M6, 25/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Treze procedimentos de pricing | `@offroad/credit-playbook` | PR-01 a PR-13 compilam como candidates com referência canônica, schemas, dados requeridos, testes, runtime determinístico, zero handoff entre agentes e zero chamada de modelo |
| Motor governado | `@offroad/market-reference` | 11 testes cobrem faixa observada, custo all-in, amostra insuficiente, fonte não independente, comp vencido, garantia incompatível, falsa precisão, choque de regime, normalização de warrant ou fee que não fecha e abstenção para indexador sem curva validada |
| Trânsito pela esteira | `@offroad/case-engine`, `@offroad/evals` e worker | toda run emite exatamente 13 estados PR; sem contexto de mercado a decisão é abstenção, não fallback para a grade estática |
| Registro privado | migrations `20260826013647_m6_pricing_registry.sql` e `20260826013815_m6_pricing_registry_advisor_hardening.sql` | aplicadas em produção; política e observações têm RLS forçado, negação explícita para tenants, grants revogados, índice da aprovação e leitura pelo worker condicionada à capability do job |
| Fronteira pública | teste de `publicCaseState` | source IDs, owners, observações elegíveis e rejeitadas e resultados privados dos procedimentos não atravessam para o workspace; somente agregados e conclusão permanecem |
| Superfície web | `IntakeCase` PT-BR e EN-US | card M6 comunica faixa, amostra, fontes, recência, custos e política ou exibe abstenção institucional sem número aproximado |
| Quality gate local | `pnpm check` com Node 24.19 | 38 pacotes com lint, tipagem, testes e build de produção verdes; web com 127 testes, worker com 46, evals com 32 e playbook com 146 |

M6 está implementado e promovido ao trilho real de produção como candidate. O PR #260 passou pela
reconstrução do banco, RLS, E2E remoto e gate completo. Nenhum número de mercado foi semeado. A
primeira faixa de produção só poderá existir após política ativa aprovada e observações autorizadas,
atuais e comparáveis. Security Advisor e Performance Advisor foram verificados depois da promoção,
sem findings de segurança ou foreign keys sem índice no perímetro de pricing.

## House Playbook M5, 25/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Matemática de estrutura determinística | `@offroad/financial-core` | 19 testes no pacote; SAC, Price, bullet, balloon, carência, capitalização, cobertura, headroom e concentração calculados com Decimal |
| Verdade de estrutura M5 | `@offroad/deal-structure` | 36 testes no pacote; 45 procedimentos sempre emitidos, proposta limitada pelo menor envelope e casos adversariais bloqueados sem valor inventado |
| Skills e referências governadas | `@offroad/credit-playbook` | ES-01 a ES-45 candidates, lineage canônico, famílias de referência com fonte, data, validade e dono, zero peer handoff e zero chamadas de modelo; 145 testes |
| Ontologia de estrutura | `@offroad/credit-ontology` | 22 testes; cenários de CFADS, políticas, garantias, covenants, definições, subordinação, intercreditor, compatibilidade, instrumento, comprador e all-in reconhecidos |
| Trânsito, matching e persistência | `@offroad/case-engine`, `@offroad/evals`, `@offroad/document-worker` | matching usa o montante suportado; 32 evals e 46 testes do worker preservam os 45 estados ES no snapshot sanitizado |
| Superfície web | componente privado PT-BR e EN-US | montante, restrição, prazo, amortização, downside DSCR, cobertura, compatibilidade e lacunas possuem rótulos institucionais; validação autenticada fica para o preview Vercel |
| Quality gate completo | `pnpm check` com Node 24.19.0 | 38 pacotes com lint, typecheck, todos os testes e build de produção verdes; web com 127 testes e 28 páginas geradas |

M5 está implementado no trilho real como candidate. O resultado é uma proposta indicativa de
estrutura, não um compromisso de capital nem uma aprovação de crédito. A promoção institucional
permanece bloqueada até dados de casa vigentes, gold e adversarial cases, revisão econômica
independente, revisão legal aplicável e aceite do fingerprint exato.

## House Playbook M4, 25/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Matemática operacional determinística | `@offroad/financial-core` | 14 testes no pacote; necessidade, fontes e usos, pró-forma, NCG incremental, carry e cronograma usam Decimal e preservam trace |
| Verdade operacional M4 | `@offroad/deal-structure` | 33 testes no pacote; caso limpo fecha pedido, necessidade e identidade; mismatch, período descoberto e bridge sem take-out bloqueiam sem estimativa silenciosa |
| Skills compiladas | `@offroad/credit-playbook` | OP-01 a OP-14 candidates, lineage canônico, runtime determinístico, zero peer handoff, zero chamadas de modelo; 142 testes do pacote |
| Ontologia operacional | `@offroad/credit-ontology` | fontes e usos por entidade, moeda, data e tranche; NCG, custos, buffer, tranches, CPs, bridge, cronograma, espera, usos mistos e versão material reconhecidos |
| Trânsito e persistência | `@offroad/case-engine`, `@offroad/evals`, `@offroad/document-worker` | toda run emite 14 estados OP; 32 evals e 46 testes do worker preservam o truth set no snapshot público sanitizado |
| Superfície web | preview local descartável, desktop 1440 px e mobile 390 px | pedido, necessidade, fontes, usos, diferença, pró-forma e cobertura legíveis; `body.scrollWidth` igual ao viewport nos dois breakpoints |
| Quality gate completo | `pnpm check` com Node 24.19.0 | 38 pacotes com lint, typecheck, todos os testes e build de produção verdes; 28 páginas geradas |

M4 está implementado no trilho real e pronto para teste funcional como candidate. A promoção
institucional permanece bloqueada até aprovação dos dados de referência, revisão independente e
aceite do fingerprint exato.

## House Playbook M2 e M3, 25/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Matemática financeira determinística | `@offroad/financial-core` | 8 testes cobrindo CFADS, conversão, capital de giro, identidades, dívida, vida média, ponte de saldo, ponte de juros, liquidez, choque de taxa, cross-default, concentração, sazonalidade e moeda |
| Verdade financeira M2 | `@offroad/reconciliation` | 18 procedimentos Q emitidos em toda run, demonstrativos e pontes rastreáveis, conflito auditado versus ERP preservado, manutenção não inferida de depreciação e identidade quebrada bloqueando apenas o output afetado |
| Verdade da dívida M3 | `@offroad/reconciliation` | 31 procedimentos D emitidos em toda run, instrumentos separados por contrato, múltiplas visões, obrigações fora de balanço, vencimentos, vida média, bridges, covenants, stress e cross-default cobertos em 34 testes do pacote |
| Skills compiladas da fonte canônica | `@offroad/credit-playbook` | 49 candidates individuais, Q-01 a Q-18 e D-01 a D-31, com lineage exato, runtime determinístico, zero peer handoff e zero chamadas de modelo; suíte do pacote com 141 testes |
| Trânsito pelo Case Engine | `@offroad/evals` | 32 testes; casos clean, sala suja e recebíveis atravessam as nove etapas e preservam as listas completas de 18 e 31 procedimentos no estado final |
| Persistência pelo worker | `@offroad/document-worker` | 46 testes; snapshot sanitizado persiste M2 e M3 completos, manifesto e relatório, sem expor identidade ou conteúdo privado de mandatos |
| Superfície web e responsividade | preview `?case=truth` + build web | cards M2 e M3 renderizados em PT-BR, desktop e 390 px, sem overflow; status, métricas, instrumentos e lacunas legíveis |
| Quality gate completo | `pnpm check` com Node 24.19 | 38 pacotes: lint, tipagem, testes e builds verdes antes da promoção pelo CI |

O motor está pronto para teste funcional E2E com um novo case. As skills permanecem candidates e
só recebem promoção institucional individual depois de gold, adversarial, referência vigente e
revisão independente do fingerprint exato.

## House Playbook M10, 25/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Treze procedimentos de conduta | `procedure-contract.test.ts` | `LC-01` a `LC-13` compilam como candidates individualmente promovíveis, em pipeline determinístico, sem peer handoff e com zero chamadas de modelo |
| Motor determinístico de conduta | `conduct-policy.test.ts` | claim sem suporte, promessa de funding, julgamento sem aprovação exata, drift PT/EN, cross-case, destinatário, conflito, disclaimer, compromisso sem registro, data relativa, surpresa sem causa e travessão possuem reason codes estáveis |
| Shadow nos materiais | `case-materials/src/conduct.test.ts` e `institutional.test.ts` | cada artefato recebe versão, fingerprint e findings; promessa explícita é detectada sem reescrita silenciosa; enforcement permanece shadow até acreditação individual |
| Dívida medida e corrigida no contrato coberto | `institutional.test.ts`, `diligence.test.ts` e `deal-structure/index.test.ts` | fixture growth-capex fecha os seis materiais com audit `pass`; cada termo declara suporte governado; perguntas abertas são não materiais; fração escrita em PT e EN mantém identidade econômica; source accreditation e células tabulares continuam fora desta promoção |

## Retrieval governado, 24/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Contratos por fonte | `@offroad/governed-retrieval` | case, playbook, nota de mandato e precedente têm schemas separados; payload extra e vetor em evidência do case são recusados |
| Escopo e abstention | 21 testes do pacote | organização, sessão, oportunidade, versão aprovada, fundos permitidos, hash do conteúdo e propósito do precedente são gates exatos; ausência de suporte resulta em abstention |
| Chunks ancorados | teste integrado do document worker | camada determinística produz chunks com documento, página ou seção, hash e versão; o worker persiste antes da extração econômica |
| Playbook antes da redação | teste integrado do case worker | a run falha fechada sem playbook aprovado; linhas governantes entram como orientação e não como evidência do case |
| Mandatos depois do filtro duro | teste integrado do case worker | somente fundos com veredito estruturado `fits` liberam notas; identidades e passagens não entram no estado público |
| Banco e isolamento | migrations `20260824232722` e `20260824232920` + `rls_non_interference.sql` | job `database` do PR #240 verde: RLS forçado, capabilities, tenant próprio, tenant cruzado, escrita direta, capability forjada e allowlist de fundos cobertos |
| Quality gate local | `pnpm check` com Node 24.19 | 37 pacotes: lint, tipagem, testes e builds verdes; retrieval com 21 testes, worker com 40, evals com 26 e web com 117 |
| Promoção controlada | Supabase `ifnogpksgdadruooqydi` | migrations aplicadas somente após o CI verde; tipos gerados novamente do schema remoto; Security Advisor sem alertas e Performance Advisor sem FKs sem índice |
| Regressão ponta a ponta | jobs `database`, `code` e `e2e` do PR #240 | migrations reconstruídas do zero, suíte de não interferência, lint do schema, aplicação e navegação aprovados |

A evidência funcional, de aplicação e de banco está verde. O banco foi promovido somente depois de
o CI reconstruir toda a stack e aprovar RLS, não interferência e lint. A ativação do comportamento
no worker depende do deploy de `main` e não é inferida apenas pela presença do schema.

## Registro de claims e portão de publicação, 24/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Registry individual | `@offroad/case-understanding` | cada claim tem fingerprint, suporte, decisões numérica, semântica e humana e dependências de artefato; alteração de fato retorna o conjunto afetado |
| Auditor numérico | testes de `auditBrief` | dinheiro e múltiplos sem suporte citado bloqueiam o claim; a verificação é determinística e independente da aprovação humana |
| Auditor semântico independente | teste integrado de `@offroad/case-engine` e worker | o redator e o verificador usam provedores diferentes; o verificador recebe somente claims e suporte reconciliado, falha fechado e bloqueia extrapolação |
| Aprovação humana exata | migrations `20260824180255`, `20260824180448`, `20260824180822` | decisão append-only vinculada ao fingerprint do claim, manifesto e registry; decisão antiga não aprova texto ou suporte alterado |
| Publicação fail-closed | teste integrado de `@offroad/case-engine` | claim material pendente ou reprovado mantém o brief para revisão, mas produz zero materiais publicáveis, data room não liberável e blockers explícitos |
| Isolamento e privilégios | teste RLS + catálogo remoto | escrita direta recusada; tenant B não vê nem aprova; wrapper público é `security invoker`; implementação privilegiada está em `private`; worker lê apenas com capability ativa |
| Advisors após DDL | Supabase Security/Performance Advisor | zero security lints; nenhum FK novo de `claim_decisions` sem índice; apenas infos preexistentes e índices ainda não exercitados em banco novo |
| Quality gate completo | `pnpm check` com Node 24.19 | 34 pacotes: lint, tipagem, testes e builds verdes; web com 117 testes, registry com 37 e worker com 40 |

O registro persistente já é consumido pelo worker. A experiência visual de revisão e promoção do
snapshot exato será construída como uma superfície separada, sem regenerar prosa e sem enfraquecer
o fingerprint que torna a aprovação válida.

## Worker do case e fronteira de mandatos, 24/08/2026

| Evidência | Verificação | Resultado |
|---|---|---|
| Trilho econômico fora do navegador | `@offroad/document-worker` + `@offroad/case-engine` | o último job documental enfileira `case_analysis`; o worker executa as nove etapas e grava snapshot e manifesto com capability temporária |
| Mandatos confidenciais | teste do worker e teste RLS | detalhes e identidade dos fundos permanecem no job privado; o estado do tomador contém somente resumo sanitizado |
| Snapshot atestado | migration `20260824170329_worker_case_analysis.sql` | `authenticated` perde o antigo comando de escrita; somente o job de case leased e dentro do escopo grava o snapshot |
| Regressão de aplicação | `pnpm check` | 34 pacotes: lint, tipagem, testes e build de produção verdes |
| Banco e isolamento | job obrigatório `database` | migrations do zero, não interferência RLS e lint do schema devem passar antes do merge |

## Fundações bulletproof, 24/08/2026

| Evidência | Comando/artefato | Resultado | Data |
|---|---|---|---|
| Taxonomia de originação v2 | `pnpm --filter @offroad/credit-ontology test` | 22 testes; dimensões ortogonais validadas e FIDC presente apenas como veículo de capital | 2026-08-24 |
| Estados operacionais e manifesto | `pnpm --filter @offroad/case-understanding test` | 31 testes; seis estados, portão de direcionamento externo, manifesto estável, ids de linhagem únicos e invalidação por versão | 2026-08-24 |
| Gold case de oito camadas | `pnpm --filter @offroad/evals test` | 16 testes; estruturas, claims, materiais, matching e desfecho integram o contrato sem quebrar casos legados | 2026-08-24 |
| Compatibilidade do playbook | `pnpm --filter @offroad/credit-playbook test` | 75 testes; dez rotas legadas convertidas para a taxonomia v2, incluindo a separação correta de FIDC | 2026-08-24 |
| Contratos e decisão arquitetural | ADR 0009 e `BULLETPROOF_EXECUTION_PLAN.md` | limites, invariantes, gates e itens explicitamente pendentes versionados no repositório | 2026-08-24 |

| Quality gate completo | `pnpm check` com Node 24.19 | lint, typecheck, testes e build verdes nos 32 pacotes; 113 testes do app web aprovados | 2026-08-24 |

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
| Product film | landing localizada | quatro cenas interativas originais, intake, evidências, estrutura e matching, com autoplay controlável e fallback para reduced motion | 2026-08-15 |
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
| CI de banco | job `database` no PR #41 | stack local, 10 migrations do zero, teste RLS, `db lint`, verde na primeira execução | 2026-08-18 |
| Hardening (PR #44) | migration `20260817232443` + `pg_class`/`pg_policies` | 32/32 tabelas com RLS forçado; policies de organizations com guard de tipo; teste RLS executado remotamente (`rls_non_interference_passed`, rollback confirmado); advisors 0 | 2026-08-18 |
| Login | `curl https://offroad.capital/pt-BR/login` | input de senha sem `minLength` em produção (antes: 10 vs 8 no cadastro) | 2026-08-18 |
| Unificação do intake (PR #46) | `pnpm check`; `next start` local | 28 testes web; rotas respondem; chaves do namespace `Intake` verificadas contra os componentes | 2026-08-18 |
| Comandos atômicos (PR #47) | migration `20260818033220`; teste RLS remoto | begin/complete/review/confirm como tenant A; idempotência; título ≤ 180; tenant B recusado; types regenerados idênticos aos escritos à mão | 2026-08-18 |
| Documentos (PR #48) | migration `20260818034457`; teste remoto | delete permitido só em sessão aberta; recusado após confirmação e para outro tenant; hash recalculado no servidor durante o processamento | 2026-08-18 |
| E2E (PR #49) | job `e2e` em CI (Playwright, stack local) | cadastro → código → onboarding documents-first → 8 uploads → processamento → 38 campos/8 issues → aceite (37) → confirmação → envio → pipeline → sala de crédito (8 docs, 37 fatos) → conjunto desconhecido (remover/re-enviar/estado vazio) → sign-out/login, verde; encontrou e corrigiu criação de sessão sob RLS (`20260818043539`) | 2026-08-18 |
| Quality gate final | `pnpm check` (Node 24.19 via fnm) | lint, tipagem, 45 testes, build; jobs `check`, `database`, `e2e` obrigatórios em `main` | 2026-08-18 |
| Jornada guiada de originação | componentes `IntakeStartChoice`, `IntakeCollect`, `IntakeChecklist` e E2E do intake | entrada única; objetivo antes do pedido; lista contextual em mínimo, recomendado e ideal; upload e evidência existentes preservados; fallback manual somente após falha | 2026-08-22 |
| Quality gate da jornada guiada | `pnpm check` com Node 24 | lint, typecheck, testes e build verdes nos 32 pacotes; 111 testes do app web aprovados | 2026-08-22 |
| Fonte única de conhecimento | `procedure-contract.test.ts` | draft nasce com contrato mínimo; candidate exige método ampliado; source hash muda com conhecimento; dependência, template desconhecido e ciclo são recusados | 2026-08-25 |
| Execução sem sociedade de agentes | registry da vertical + testes | 19 skills compiladas aceitam somente `deterministic_pipeline`, recusam peer handoff e limitam chamadas de modelo a propósito estreito | 2026-08-25 |
| Templates dentro da vertical | registry + `case-materials` | teaser, memo, term sheet e data room têm seções, regras de evidência e consistência; artefatos carregam id, versão e SHA-256 do registry | 2026-08-25 |
| Cobertura do blueprint | `procedure-contract.test.ts` | a vertical expansão/capex cobre todas as etapas 1 a 12 e mantém maturidade candidate até aprovação e evals | 2026-08-25 |
| Growth capex adversarial | `parametric-factory.test.ts` | dívida contraditória preservada, prompt injection não vira fato e garantia sem âncora bloqueia claim material | 2026-08-25 |
| Elegibilidade negativa | `parametric-factory.test.ts` | a limitada mantém o arquétipo de expansão; CCB permanece elegível e debênture é fechada com razão explícita | 2026-08-25 |
| Quality gate da arquitetura executável | `pnpm check` com Node 24 | lint, typecheck, testes e build de produção aprovados nos 38 pacotes; vertical, templates, manifests, worker e aplicação compilam em conjunto | 2026-08-25 |
| House Playbook v2.1 governado | `source.test.ts` + SHA-256 da fonte | 11 módulos e 270 entradas preservados; 270 autoridades explícitas; zero IDs duplicados, referências internas quebradas, etapas legadas `E##`, dependências do runtime atual sobre procedimentos pós-introdução ou promoção automática; hash `fa985fe9c8ffc5e3d0853a112dde34904d86b0daad0c8fd540705f17c69f9fb6` | 2026-08-25 |
| Dados de referência fail-closed | `reference-data.test.ts` | parâmetros de mercado, políticas, cenários, elegibilidade e metodologias exigem valor, fonte, data, validade e dono; ausência mantém a unidade bloqueada e nunca é preenchida por estimativa do modelo | 2026-08-25 |
| Quality gate do House Playbook v2.1 | `pnpm check` com Node 24.19.0 | lint, typecheck, todos os testes e build aprovados nos 38 pacotes; playbook com 107 testes, evals com 32, worker com 40 e web com 117; 30 páginas geradas no build | 2026-08-25 |
| Contrato adaptativo M0 | `intake-state.test.ts` + `pnpm check` com Node 24.19.0 | replay e fingerprint estáveis; política do lote validada e limitada a cinco; escada IN-13 obrigatória; pacote classificado elimina quatro solicitações futuras; ausência não é repetida; evidência derivada não vira declaração; assessor, grupo e liquidez disfarçada preservados no domínio; 124 testes do playbook, 117 da web, 40 do worker e 32 evals aprovados; build de 30 páginas concluído | 2026-08-25 |
| Fronteira transacional do M0 em staging | migration `20260825171945`, `replay.test.ts` e `rls_non_interference.sql` remoto | necessidade e rota gravadas juntas; recebimento, classificação e remoção documental atômicos; retry idempotente; escrita direta recusada; sessão terminal imutável; tenant B lê zero eventos do tenant A; replay web falha fechado em payload ou sequência inválidos; Security Advisor com zero findings | 2026-08-25 |
| Perímetro, autorização e triagem M0 em staging | migration `20260825185143`, transação remota revertida e `intake-state.test.ts` | empresa membro vira tomadora somente no journey company; assessor e cliente ficam segregados; autorização nasce `declared`, sem evidência e limitada a `prepare_case`; comando legado sem perímetro recusado; falta ou revogação de autorização e rota recusada bloqueiam solicitações; `review_required` não se passa por recusa; Security Advisor com zero findings | 2026-08-25 |
| Fingerprint econômico completo | `case-manifest.test.ts` | ordem de linhas não altera o hash; mudança de resposta, fato ou parser altera o hash | 2026-08-24 |
| Linhagem de modelos sem conteúdo | testes de `model-gateway` e `document-worker` | tentativas bem-sucedidas, fallback e erro carregam hashes, custo e usage; mensagem privada do erro não entra no log; linhagem viaja no sucesso e na falha | 2026-08-24 |
| Manifesto atômico e append-only | migration `20260824170318` + bloco de `rls_non_interference.sql` | gravação idempotente do manifesto e snapshot em uma transação; escrita direta recusada; tenant B e anon isolados; validação final no job `database` do PR | 2026-08-24 |
| Runner governado | `@offroad/case-runner` | nove etapas ordenadas, schema por saída, fingerprints, falhas tipadas, bloqueio downstream e hard gates de custo/chamadas; 5 testes unitários | 2026-08-24 |
| Motores reais no runner | `@offroad/case-engine` + `case-pipeline.ts` | nove etapas executam os pacotes reais; schemas por camada, fingerprints e orçamento; 2 testes integrados; a aplicação web deixou de manter uma segunda cópia da lógica econômica | 2026-08-24 |
| Gate local do incremento | testes e typecheck dos pacotes alterados + web lint | model gateway 17, case understanding 31, worker 39 e web 116 testes aprovados; tipagem e lint verdes | 2026-08-24 |
| Fábrica paramétrica determinística | `@offroad/case-factory` | schema único gera documentos, candidatos, loan tape, mandatos e gold; reexecução byte-idêntica; gold permanece completo diante de omissão e conflito | 2026-08-24 |
| Loan tape fecha economicamente | `case-factory/src/index.test.ts` | 250 títulos fecham exatamente em R$ 48.000.000, 7% de saldo vencido e 12% no maior sacado | 2026-08-24 |
| Casos gerados no trilho governado | `evals/src/parametric-factory.test.ts` | expansão limpa, sala suja e recebíveis atravessam as 9 etapas; cálculos e matching batem com o gold; PT e EN mantêm identidade econômica | 2026-08-24 |
| Evidência sem âncora falha fechada | `case-understanding/src/index.test.ts` + eval de sala suja | candidato permanece para revisão, mas claim material e cálculo dependente são bloqueados com `support_anchor_unverified` | 2026-08-24 |
| Quality gate do Gate 5 | `pnpm check` | lint, typecheck, todos os testes e build verdes nos 35 pacotes | 2026-08-24 |
| Vertical econômica de recebíveis | `@offroad/receivables-analysis` | 35 testes; elegibilidade, concentração, aging, performance, evidência, reconciliação, reforços, gatilhos e waterfall determinísticos | 2026-08-24 |
| Biblioteca paramétrica de recebíveis | `receivables-fidc.test.ts` | 28 cenários independentes cobrem pronto, remediação e recusa; recusa sem base elegível identifica o motivo correto | 2026-08-24 |
| Recebíveis no motor governado | `@offroad/case-engine` e `parametric-factory.test.ts` | a análise viaja pelas nove etapas, afeta blockers e capacidade suportada e preserva `externalDirectionAllowed: false` | 2026-08-24 |
| Recebíveis no worker | `case-analysis.test.ts` | snapshot estruturado validado chega ao motor, é persistido no estado sanitizado e não autoriza direcionamento externo | 2026-08-24 |
| Anchors artesanais de recebíveis | `receivables-analysis/src/anchors.ts` | dois candidatos preparados e explicitamente marcados `pending`; revisão independente ainda não contabilizada | 2026-08-24 |
| Quality gate do Gate 6 | `pnpm check` | lint, typecheck, testes e build verdes nos 36 pacotes; 35 testes da vertical, 26 evals, 40 testes do worker e 117 testes web aprovados | 2026-08-24 |
| Contrato de produção controlada | `@offroad/release-governance` | 6 testes: replay estável, drift estrito, shadow warning, input divergente, dois cohorts distintos e aprovação antes de `active` | 2026-08-24 |
| Staging isolado | Supabase branch `staging` | branch saudável; 56 migrations após o Gate 8; zero organizações, sessões ou documentos copiados da produção | 2026-08-24 |
| Schema do Gate 8 em staging | migrations `20260824235937`, `20260825000110`, `20260825000811`, `20260825001020` e `20260825001758` | 3 tabelas públicas com RLS forçado, 5 tabelas privadas sem grants, tenant sem escrita nos ledgers, comandos de release privados e inputs e resultados imutáveis presentes | 2026-08-24 |
| Advisors do Gate 8 em staging | Supabase Security + Performance Advisors | segurança: 0 lints; performance: 0 foreign keys sem índice | 2026-08-24 |
| Não interferência do Gate 8 em staging | `supabase/tests/rls_non_interference.sql` | suíte integral aprovada: leitura própria, isolamento entre tenants, rollout sem escrita pelo tenant, capability forjada recusada, retry idempotente e resultado divergente rejeitado | 2026-08-24 |
| Quality gate local do Gate 8 | lint, typecheck, testes e build | 38 pacotes aprovados; 6 testes do release governance, 40 do worker e 117 da web; build de produção verde | 2026-08-24 |
| Promoção do schema do Gate 8 | Supabase production `ifnogpksgdadruooqydi` | cinco migrations aplicadas em ordem; Security Advisor com 0 lints; Performance Advisor com 0 foreign keys sem índice; zero políticas, execuções, comparações, inputs, resultados, cohorts ou decisões após a promoção | 2026-08-25 |
| Deploy controlado do Gate 8 | commit `ff7db5b`, Vercel e ECS | Quality em `main` verde; Vercel production concluída; `offroad-document-worker:83` estável; PT, EN, login e favicon com HTTP 200; banco permaneceu sem liberação externa ou ledgers inesperados | 2026-08-25 |
| Cases reais do Gate 8 | cohorts `wave_1` e `wave_2` | **pendente**; nenhum fixture foi contabilizado como case real | 2026-08-24 |

| Agente Offroad, primeira vertical | contratos + worker + UI + migrations `20260826203944`, `20260826204254`, `20260826204338` e `20260826205046` | mensagem vira job capability-bound; resposta pode perguntar ou propor; nenhuma mutação acontece antes da confirmação; proposta stale falha fechada; falha auxiliar não falha o intake | 2026-08-26 |
| Não interferência do Agente em staging | `supabase/tests/rls_non_interference.sql` remoto | idempotência, isolamento entre tenants, preview, aceite e aplicação transacionais e separação do processamento documental aprovados; Security Advisor com 0 findings | 2026-08-26 |
| Voltar e recomeçar onboarding | `document-first-intake.spec.ts`, `restart_onboarding_intake` e `rls_non_interference.sql` | navegação Objetivo → Pedido → Objetivo; encerramento confirmado preserva conta, organização e auditoria; sessão vira `cancelled`; onboarding volta ao `Bem-vindo`; replay é idempotente; sessão confirmada e outro tenant são recusados; Security Advisor de staging com 0 findings | 2026-08-26 |

## Regras

- Guardar screenshots de review em artefatos/CI, não inflar o repositório sem necessidade.
- Registrar comando, resultado, versão e data.
- Falha nunca é reclassificada como aceite parcial silencioso.

## P1: Fase F0 (18/08/2026)

| Evidência | Comando/artefato | Resultado | Data |
|---|---|---|---|
| Ontologia cobre o fixture | `pnpm --filter @offroad/credit-ontology test` | 17 testes; todos os 38 field paths do fixture resolvem no catálogo; plano de contas sem ciclos | 2026-08-18 |
| Verificador de âncora | `pnpm --filter @offroad/document-intelligence test` | 18 testes: trecho inventado, dígitos alterados, âncora ausente, página escaneada (modo degradado), armadilhas de escala, percentuais, dedupe | 2026-08-18 |
| Gateway sem Haiku | `pnpm --filter @offroad/model-gateway test` | 14 testes: denylist/allowlist, fallback por recusa/erro/saída inválida, budgets, redação, cassetes; adapters tipados contra os SDKs reais (`@anthropic-ai/sdk` 0.117.1, `openai` 7.5.0), sem rede | 2026-08-18 |
| Harness de evals + G1 | `pnpm --filter @offroad/evals test` e `pnpm --filter @offroad/evals baseline` | 7 testes; baseline do fixture: precisão 100% (38/38), recall material 47,7% (31/65), exceções 7/12, alucinação 0, sem classificação/cálculos; snapshot perfeito = 100% e passa nos limiares | 2026-08-18 |
| Quality gate | `pnpm check` (Node 24) | verde nos PRs #52–#55; CI `check`/`database`/`e2e` verdes | 2026-08-18 |

## P1: Fase F1 (18/08/2026)

| Evidência | Comando/artefato | Resultado | Data |
|---|---|---|---|
| Estado do pipeline aplica do zero | job `database` (stack local efêmera) no PR #58 | migrations do zero + `rls_non_interference.sql` + `supabase db lint` verdes; o job pegou `begin_processing_run` como `security invoker` (tenant não tem INSERT em runs/jobs) antes de qualquer coisa ir ao projeto | 2026-08-18 |
| Modelo de autorização do worker | `supabase/tests/rls_non_interference.sql` (bloco F1) | conta de serviço sem vínculo com organização; credencial desconhecida e capability errado recusados (`42501`); capability morre com o job; tenant vê progresso mas não o `payload`; documento de outro escopo não entra na fila (`P0002`); tenant B não vê nada; reprocesso não sobrescreve perfil aceito | 2026-08-18 |
| Advisor de segurança | MCP `get_advisors` (security) após aplicar `20260818171246` | **14 avisos**, 7 funções `security definer` em `public` executáveis por `anon` e por `authenticated`; investigação mostrou que `anon` executava **as 15** funções de `public` e tinha `arwdDxtm` em 7 tabelas (default privileges do bootstrap, nunca revogadas) | 2026-08-18 |
| Correção verificada no projeto | `execute_sql` (mesmas asserções do teste) | `anon` sem nenhum privilégio em `public`; nenhum `security definer` em `public`; `has_column_privilege(authenticated, processing_jobs.payload, select) = false` e `status = true`; `insert` em `processing_runs` negado; 0 tabelas sem FORCE RLS; advisor de segurança: **0 lints** | 2026-08-18 |
| Índices de FK do pipeline | MCP `get_advisors` (performance) + `20260818172357` | 10 FKs sem índice de cobertura fechadas; restam apenas INFO de `unused_index` (banco ainda sem tráfego) e a estratégia de conexões do Auth | 2026-08-18 |
| Quality gate | `pnpm check` (Node 24) | lint, tipagem, testes e build verdes com os tipos regenerados (`database.ts` +475 linhas) | 2026-08-18 |
| CI: passo do Playwright travando | log do job `e2e` (PR #58) | o passo travava no `apt-get` do `--with-deps`, sempre após `Get:1 file:/etc/apt/apt-mirrors.txt Mirrorlist` (≈30 min no #57, 2× ≈15 min no #58); o mesmo log mostra as libs do Chromium já instaladas na imagem. Sem `--with-deps` + cache de `~/.cache/ms-playwright` + timeout: job completo em ~5 min | 2026-08-18 |
| Parsers contra o data room (PR #59) | `pnpm --filter @offroad/document-parsers test` | 27 testes; os 8 arquivos (3 PDF, 3 XLSX, 2 DOCX) viram camada e passam por `indexLayer` (que lança em id duplicado); texto de toda âncora é substring do texto do documento; reparse byte-idêntico; `DRE_MENSAL_LONG` > 1.000 células, `CONTRATOS_DIVIDA` com vencimentos em faixa plausível, escala 1e6 declarada no `LEIA-ME` e na página da DRE | 2026-08-18 |
| exceljs devolvia planilha vazia | leitura do XML do pacote | os workbooks declaram SpreadsheetML com prefixo `x:` (`<x:worksheet>`), válido e lido pelo Excel; o matcher do exceljs só casa tags sem prefixo → `parseWorkbook` undefined e **todo o export do ERP parseava para nada**. Leitor próprio (jszip + fast-xml-parser) casando local names: 6 abas, 3.976 células na DRE mensal | 2026-08-18 |
| Formatos universais (PR #60) | `pnpm --filter @offroad/document-parsers test` | 36 testes; `.xls` real (BIFF escrito no próprio teste) lido com valores, abas e aba oculta, âncoras idênticas às de um `.xlsx`; subtipo do contêiner Office 97 detectado pelo stream (`Workbook`/`WordDocument`/`PowerPoint Document`), com planilha renomeada para `.doc` ainda lida como planilha; conversão registra o salto extra (`conversion` + aviso); OCR preenche a página mas mantém `scanned: true` e descarta blocos abaixo do piso de confiança | 2026-08-18 |
| Defesas contra arquivo hostil | testes do pacote | `.docx` válido com 40 MB de zeros recusado como bomba de descompressão; entidades XML desligadas; `.xls/.doc/.ppt` recusados com mensagem acionável; arquivo vazio recusado; tipo decidido por magic bytes (planilha renomeada para `.pdf` não chega ao parser de PDF) | 2026-08-18 |
| Cadeia de credenciais do worker | CloudShell (`sa-east-1`) + `execute_sql` | `sha256` do segredo `offroad/worker-token` bate com `private.worker_tokens` (`HASH=MATCH`); a conta de serviço `document-worker@offroad.capital` autentica (`HTTP 200`) sem service-role e sem vínculo em `organization_memberships`; `worker_claim_job` com o token real responde `{"claimed": false}` (`HTTP 200`), credencial aceita, fila vazia | 2026-08-19 |
| Segredos do worker no cofre | `aws secretsmanager describe-secret` nos seis nomes | os seis existem em `sa-east-1`; senha e token gerados por `openssl` dentro do CloudShell e gravados direto no cofre, nenhum valor passou por arquivo, log, commit ou chat; a task definition referencia por **nome** e o workflow resolve o ARN no registro (o sufixo do ARN muda quando um segredo é recriado) | 2026-08-19 |
| Política de insert em `document-layers` | `execute_sql` no projeto (transação revertida) | tenant A grava sob o próprio `<org>/<sessão>/…`; recusa (`insufficient_privilege`) ao gravar no prefixo do tenant B e ao gravar fora da convenção de caminho; tenant B não lê nada de A nem grava no prefixo de A; `rollback` verificado sem resíduo (0 usuários, 0 orgs, 0 objetos) | 2026-08-19 |
| Emissão das URLs assinadas | `pnpm --filter web test` | 37 testes (6 novos): caminho da camada mantém organização e escopo como pastas 1 e 2 (é o que as políticas leem), cada tentativa ganha objeto próprio (bucket segue só com insert), download assinado em `opportunity-documents` e upload em `document-layers` com TTL de 1 h, e a run inteira é recusada se um único link falhar | 2026-08-19 |
| Extração real medida sobre o data room | workflow `Measure extraction`, 6 execuções | recall material 44,6% → **75,4%**, precisão 52,3% → **79,0%**, ~US$ 2,50/caso; cada correção derivada do dump de flags do run anterior (runs 32306812508 · 32308765792 · 32315077187 · 32320129899 · 32322051560 · 32324397398) | 2026-08-20 |
| Worker estável no código com extração | `private.worker_tokens.last_used_at` amostrado em 11:32:14 e 11:34:45 UTC | idade de poll de 5,0 s e 0,26 s, poll contínuo a cada 5 s; um worker em crash-loop só faz poll em rajadas curtas após o boot | 2026-08-20 |
| Flag do pipeline não é gravável pelo tenant | `has_column_privilege` no projeto | `pipeline_enabled` update = **false**, select = true; `name` update = true (demais colunas intactas); `anon` sem select na tabela | 2026-08-20 |
| Comando de candidatos exige capability token | `execute_sql` no projeto (transação revertida) | token desconhecido recusado (`42501`); `anon` não alcança a função (`insufficient_privilege`); asserção adicionada ao teste de RLS | 2026-08-20 |

| Materiais imprimíveis com citação | `pnpm --filter @offroad/case-render test` | 8 testes: `<script>` e `&` vindos do modelo escapam; marcador de citação reaproveita o número já emitido (`2,1`) e resolve no apêndice até o arquivo de origem; id sem fonte conhecida **imprime mesmo assim** (marcador órfão é defeito visível, esconder é pior); cabeçalho de tabela repete entre páginas; diálogo de impressão só abre com `?print=1` | 2026-08-20 |
| Caso computado uma vez por estado do data room | leitura de `case-pipeline.ts` + `pnpm check` | `saveCaseState` estava escrito e **nunca chamado**: cada render da tela re-rodava reconciliação, dimensionamento, term sheet e a chamada de modelo do brief. `resolveCaseState` fingerprinta arquétipo, status, contagens de documento/candidato/resposta e o `updated_at` mais recente dos candidatos | 2026-08-20 |
| Modelo financeiro calcula o que um desk confere | `pnpm --filter @offroad/financial-model test` | 19 testes com avaliador de planilha próprio executando as fórmulas como o Excel: sem amortização na carência e SAC depois (45 M / 4 anos = 11,25 M/ano, saldo zerado no ano 5), principal nunca acima do saldo, serviço da dívida negativo em toda aba que o cita, DSCR = CFADS / saída, IR só sobre lucro **por ano** (nos anos finais a dívida amortiza, juros caem e volta a haver imposto), alavancagem caindo com a amortização. Três expectativas minhas estavam erradas e o avaliador pegou as três | 2026-08-20 |
| Célula de fórmula sem cache abre como `#N/A` | leitura do XML do `.xlsx` + teste de ida e volta | `{t:"n", f}` sem `v` sai como `t="e"` (tipo **erro**), invisível no objeto do workbook, visível só no arquivo. Corrigido com `v` placeholder; sem `calcChain.xml`, o Excel recalcula e descarta os zeros. Guard verificado falhando contra a codificação quebrada antes de ser mantido. Medido também: SheetJS community **não** escreve fonte, preenchimento nem painel congelado; larguras de coluna e formatos numéricos sobrevivem | 2026-08-20 |
| Correção deixou de ser destruída | `supabase/tests/rls_non_interference.sql` (bloco de revisão) | `review_intake_candidate` sobrescrevia `normalized_value` no lugar. Agora as 4 decisões do bloco geram 4 linhas em `extraction_feedback`; `proposed_value` da edição é o valor **anterior** e não a correção; nenhuma decisão que não seja `edit` carrega `corrected_value`; UPDATE e DELETE recusados | 2026-08-20 |
| Ledger append-only na ACL, não só na política | `execute_sql` como `role authenticated` | UPDATE = `42501`, DELETE = `42501`. Ausência de policy sozinha faria o UPDATE afetar **zero linhas em silêncio**; o que recusa é a falta do grant. `authenticated` com apenas `INSERT,SELECT`; RLS e FORCE ligados; exatamente duas policies (`a`, `r`) | 2026-08-20 |
| Política de auto-accept aprende com o histórico | `pnpm --filter @offroad/extraction-learning test` | 27 testes: Wilson(2,2) < Wilson(47,50); erro de escala (71.000 ↔ 71.000.000, 0,14 ↔ 14) separado de arredondamento e de troca de sinal; campo com erro de escala travado a 0,999 de confiança; campo com limite inferior abaixo de 0,5 travado, **encontrado por teste que falhou**, porque com o teto da barra em 0,99 um campo medido em 10% ainda passava enquanto a política parecia rígida; campo sem histórico **não** é travado | 2026-08-20 |
| Pedido inicial não vira data room | `pnpm --filter @offroad/credit-playbook test` | O dia zero já pedia 10–11 itens por operação (6 documentos + 5 perguntas), dentro dos 15–20 que o guia de IRL recomenda, o problema era moldura, não volume. Teste agora **impede** que `now` passe de 20 itens (e exige ao menos 6); toda operação precisa carregar tier de diligência e de fechamento; item de fechamento nunca entra em `missing` nem nas contagens | 2026-08-20 |
| "Não se aplica" exige razão em três camadas | `pnpm check` + migration `20260820145017` | Tipo (`resolvedBy` só resolve com nota), server action (recusa `validation`) e check constraint no banco. Linha sem resposta e sem nota é recusada pela constraint `intake_information_answers_carries_something`; resposta contra um `notice` é recusada pela action | 2026-08-20 |
| Job `database` falha por colisão de porta, não por código | log do run 32383127190 (PR #93) | as 27 migrations aplicaram; a falha foi `failed to bind host port 0.0.0.0:54324 ... address already in use` no `supabase_inbucket`. Re-execução do job passou. Flake de runner registrado para correção separada | 2026-08-20 |
