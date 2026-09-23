# Etapa 17 / 4B: lote residual de pedidos de informação

Incremento 4 do contrato de execução da etapa 17 (`etapa-17-execucao.md`, item 4): substituir conjuntamente prompt, schema, assessment, fila, RPC e projeção que cortavam pedidos residuais, e provar sete ou mais pedidos com motivos e base insuficiente sem comparação forçada. O princípio de produto é um só: o sistema pergunta à companhia apenas o resíduo, em um lote, cada pedido com o motivo e a decisão que altera; não existe teto artificial; quando a base não sustenta o trabalho, o sistema diz isso em vez de forçar uma comparação de alternativas.

Antes deste incremento o mesmo pedido era cortado em seis lugares distintos e por números diferentes: o prompt pedia "um a cinco", o schema aceitava no máximo cinco, o assessment ordenava e cortava em três, a fila recusava contagem acima de três, o RPC recusava payload com mais de três e a tela lia só três. Um lote de sete pedidos legítimos chegava à companhia como três, sem aviso. O adaptador legado que fixava esses números está congelado em `knowledge/legacy/capital-planning-compatibility-2026-09-20.md` e não é editado.

## O que muda

**Prompt.** Novo adaptador `packages/credit-playbook/knowledge/adapters/capital-planning-residual-2026-09-24.md`, versão `2026.09.24-v2`, mesmo `schemaVersion`, mesmo escopo e mesmas onze famílias. As regras novas: pedir só o resíduo, em um lote, cada pedido com por que importa e qual decisão muda, sem teto numérico, sem preencher nem cortar o lote; quando a base não sustenta comparação, declarar `evidenceCoverage.status = insufficient`, `alternatives = []`, `comparison = []` e `directionalRecommendation.status = not_ready`. `capitalPlanningPolicyPath` aponta para o adaptador novo; a política gerada e o `policyHash` fixado no teste foram regenerados. O adaptador continua sem ativar o procedimento profissional aprovado em 21/09/2026.

**Schema.** `capitalPlanningMapSchema` e `companyDebtDiagnosticSchema` (`packages/domain-contracts`): `informationRequests` sem mínimo e com teto técnico de 24; `alternatives` sem mínimo; `comparison` sem mínimo, com pelo menos uma observação por dimensão. A regra de suficiência entrou no refinamento: base que não é `insufficient` compara pelo menos duas alternativas e traz pelo menos uma dimensão; base `insufficient` exige `not_ready`, zero alternativas, zero comparação e pelo menos um pedido. O `schemaVersion` dos artefatos não muda. `dcm-agent-assessment.v1` (`packages/agent-contracts`) aceita até 60 pedidos, teto técnico do payload.

**Assessment.** `rankInformationRequests` ordena todo pedido aberto que não seja `later` pelo mesmo score de antes e não corta mais. `buildPrivateCaseAssessment`, `buildPublicWorkAssessment` e `buildPreliminaryAssessment` passam o conjunto único completo.

**Fila.** Os parsers de `request_count` e `open_count` em `queue.ts` aceitam qualquer inteiro não negativo. `EXECUTOR_VERSION` do planejamento de capital passa a `2026.09.24-v2`; as tarefas M04, S02, S05 e S10 gravam `{status: "insufficient_base", reason, informationRequestCount}` quando não há alternativas, em vez de listas vazias que pareceriam um universo pesquisado.

**RPC.** Migração `20260923224304_residual_information_request_batch.sql` restabelece por completo `private.worker_record_agent_assessment_v1` e `private.worker_sync_project_information_requests_v1`, mesmas assinaturas, mesmos grants, sem nome `_v2`. O corpo base é o texto liberado mais os remendos aplicados depois no lugar (reuso de decisão sem recomendação em `20260910164327`, guarda de namespace e preflight de conflito em `20260910171808`, kind `case_analysis` em `20260907044252`). Um bloco `do` no topo confere no `pg_get_functiondef` os marcadores desses remendos e recusa rodar sobre outra base. Dentro dos corpos: o corte em três vira teto técnico de 60; todo pedido precisa de `whyItMatters` e `decisionImpact` não vazios, senão `agent_information_request_reason_required` (`22023`); o evento `question_created` fala de um lote, não de "a pergunta".

**Projeção.** O trilho de pedidos abertos da página do projeto deixa de limitar em três; mantém ordem por ganho de informação e a exclusão de `later`. A tela do mapa de planejamento ganha estado vazio para zero alternativas e zero comparação, com texto em pt-BR e en-US; o texto do bloco de pedidos deixa de prometer "uma fila curta".

**Texto do playbook.** `growth-capex.ts` e `dcm-blueprint.ts` deixam de dizer "no máximo cinco itens" e passam a dizer "lote residual completo, cada item com motivo". O limite de "no máximo três alternativas" em `growth-capex.ts` é uma fronteira de estruturação, não um corte de pedidos, e não muda.

## Pontos de corte

| Camada | Arquivo | Antes | Depois |
|---|---|---|---|
| Prompt | `knowledge/legacy/capital-planning-compatibility-2026-09-20.md` (congelado) | "one to five requests" | adaptador novo em `knowledge/adapters/capital-planning-residual-2026-09-24.md`: só o resíduo, sem teto |
| Prompt | `apps/document-worker/src/company-debt-view.ts` | "one to five requests" | só o resíduo, em um lote, sem teto |
| Prompt | `apps/document-worker/src/case-analysis.ts` | "six open points" | todo ponto aberto que mude o próximo pedido |
| Schema | `packages/domain-contracts/src/index.ts` | `informationRequests.min(1).max(5)`, `alternatives.min(2)`, `comparison.min(3)`, observações `min(2)` | `max(24)` sem mínimo; alternativas e comparação decididas pela regra de suficiência; observações `min(1)` |
| Schema | `packages/agent-contracts/src/work-system.ts` | `requests.max(3)` | `max(60)` técnico |
| Schema | `apps/document-worker/src/case-analysis.ts` | `openPoints.max(6)`, `slice(0, 12)` | `max(24)`, `slice(0, 24)` |
| Assessment | `packages/agent-contracts/src/work-system.ts` | `rankInformationRequests(..., limit = 3)` com `slice` | sem limite, mesma ordem |
| Assessment | `apps/document-worker/src/agent-assessment.ts` | `rankInformationRequests(uniqueRequests, 3)` | conjunto completo |
| Gate | `apps/document-worker/src/company-debt-view.ts` | `next_batch` exige 1 a 5 | 0 a 24, "residual batch complete" |
| Fila | `apps/document-worker/src/queue.ts` | `request_count`/`open_count` `.max(3)` | `.nonnegative()` |
| RPC | `worker_record_agent_assessment_v1` | `requests > 3` recusado | `> 60` recusado; motivo obrigatório |
| RPC | `worker_sync_project_information_requests_v1` | `requests > 3` recusado | `> 60` recusado; motivo obrigatório |
| Projeção | `apps/web/.../projects/[projectId]/page.tsx` | `.limit(3)` | sem limite |
| Projeção | `apps/web/.../capital-planning-project.tsx` | grade vazia com zero alternativas | estado vazio explícito |

## Provas

SQL (`supabase/tests/agentic_dcm_work_system.sql`): sete pedidos distintos por `worker_record_agent_assessment_v1` com `request_count = 7`, sete linhas abertas com `why_it_matters` e `decision_impact` preenchidos, evento `question_created` com `request_count = 7`, e a consulta com a mesma forma da página (aberta, não `later`, `information_gain desc, created_at`) devolvendo as sete; sete por `worker_sync_project_information_requests_v1` com `open_count = 7` sem tocar a pergunta do outro produtor; recusa de `whyItMatters` em branco e de `decisionImpact` ausente com `agent_information_request_reason_required`; recusa de 61 pedidos nos dois comandos. As fixtures novas rolam para trás dentro do próprio bloco e a prova de resposta seguinte continua vendo uma única pergunta aberta.

Sem Docker nesta máquina, a migração foi provada em um Postgres 18 local descartável com tabelas mínimas: os corpos efetivos foram reproduzidos rodando as migrações originais e os remendos reais (`pg_get_functiondef` + `replace` + `execute`) e ficaram byte a byte iguais à reconstrução usada na migração; a migração aplicou, o `do` de guarda passou, a segunda execução foi idempotente, uma base com o marcador de conflito alterado foi recusada com `residual_request_batch_base_drift`, e os blocos novos do teste rodaram literalmente sobre as funções restabelecidas com os dois caminhos passando. A execução do arquivo inteiro contra o esquema completo fica para a CI (`database`) e para o executor em staging.

Código: `packages/agent-contracts` (ordena sete sem cortar; assessment com sete pedidos aceito, requisito duplicado recusado), `packages/domain-contracts` (sete pedidos passam; mapa `insufficient` com zero alternativas passa; `public_only` com uma alternativa ou sem comparação falha; lote vazio permitido em base sustentada), `apps/document-worker` (sete pontos abertos viram sete pedidos com motivo e decisão; caso privado pede exatamente o que falta; fixture `insufficient` do planejamento de capital: `recordAgentAssessment` recebe sete pedidos, decisão `open` com `confidence = insufficient` e `alternatives = []`, M04/S02/S05/S10 com `insufficient_base` e `informationRequestCount = 7`; `request_count = 7` e `open_count = 7` parseados), `packages/credit-playbook` (política regenerada e hash fixado), `apps/web` (paridade de mensagens, sem travessão). Contagens exatas no completion da PR.

## Proveniência do método capital v4

O fecho de compilação registrado para `prepare-capital-structure-decision-2026.09.21-v4` em `method-runtime-manifest.generated.ts` inclui `packages/domain-contracts/src/index.ts`, `build-capital-planning-policy.ts`, `dcm-blueprint.ts` e `growth-capex.ts`. Este incremento é o primeiro a tocar esse fecho depois da publicação, então a proveniência da árvore atual para o método capital passa a ter outro `manifestHash` no manifesto gerado. O que foi publicado não muda: o lock de release, o snapshot `2e2bc2e6...`, o recibo de publicação, o pin `2c023cf7...` na função de proveniência (`20260922194250`) e a identidade que o worker reivindica em `released-methods.generated.ts` continuam iguais, porque o executor liberado é reconstruído só a partir do grafo preservado. Uma futura republicação do método capital carregará o fecho novo; nada aqui republica.

## Publicação

Estampas: staging `20260923213852`, produção `20260923224304`, aplicadas pelo executor via MCP antes do merge; o guarda de deriva aceitou a base real nos dois projetos. O worker e a web sobem juntos depois do merge (worker novo contra RPC antigo falha fechado com `agent_assessment_invalid`; RPC novo contra worker antigo aceita o lote menor).

Catálogo de produção recapturado em 2026-09-23T22:59:15Z, depois da estampa: 2215 objetos, nenhum novo e nenhum alterado, porque a migração só restabelece duas funções e o catálogo registra identidade, segurança e grants, que não mudaram. Journals de produção e de staging carregam a linha do 4B. O catálogo de staging fica para a PR do 4A, que revisa os objetos que staging já carrega. Branch rebaseado sobre main depois de #742, #745 e #743; gate de inventário limpo em modo produção. As duas funções restabelecidas estão no registro M6 de corpos efetivos (`docs/build/schema-history/effective-function-bodies`): os corpos foram recapturados de produção depois da estampa (19557 e 9838 bytes) e o verificador em modo offline confere as 72 funções.

## Pendências fora deste incremento

- R01: `packages/receivables-analysis` (`receivables-information-requests.ts`, `slice(0, 3)`), o RPC de bindings em `20260907051254` (`> 3`) e `bound_count` em `queue.ts` mantêm o corte de três; o método publicado não é reescrito nesta etapa.
- Checklist de intake legado: `client-requests.ts` e `intake-state.ts` mantêm o teto de cinco itens.
- `integration-preview.ts`: `slice(0, 3)` na prévia de integração.
- Sinais de pesquisa: teto de cinco em `case-analysis.ts`, que não é pedido à companhia.
