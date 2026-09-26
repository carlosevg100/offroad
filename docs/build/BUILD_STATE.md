## Etapa 18, incremento 5B (web): atividade pelos fatos gravados e retirada dos caminhos substituídos, 25/09/2026

As superfícies de trabalho e de execução passam a mostrar atividade só a partir de fatos gravados. Um leitor no servidor (`loadWorkActivity`, `apps/web/src/lib/advisor/work-activity-reader.ts`) lê, sob a autoridade de leitura do trabalho, os jobs vivos do trabalho e da sua sessão de intake (`queued` e `leased` são trabalho de máquina; `awaiting_approval` espera uma pessoa), as esperas abertas (`awaiting_human` sem `human_resolved` e sem espera mais nova; a de uma candidata de recálculo só enquanto ela aguarda autorização), os pedidos de atualização `scheduled` e as candidatas agendadas ainda sem execução ou resultado. A página só se atualiza enquanto há trabalho de máquina (`workShouldRefresh`) e para quando ele acaba; espera por pessoa aparece como "Aguardando decisão de uma pessoa" e não é consultada; a conversa fica ocupada só pelos jobs que ela espera (`conversationIsWorking`). Cada superfície lê a atividade antes dos resultados. Aplicado à conversa do trabalho com e sem intake, ao resultado institucional ("Calculando" só com o job do resultado vivo), às telas especializadas de companhia e de planejamento de capital, à lista e ao detalhe de execuções e à página de oportunidade, que continua alcançável pelo trilho, pelos recentes e pela confirmação do intake. Um resultado ausente sem nada em andamento vira lacuna com o próximo passo: no caso privado e na oportunidade, "Retomar a análise", que decide a decisão pelas linhas gravadas e chama `enqueue_deal_state_analysis` (seguro de repetir); nas telas especializadas, a volta à conversa; no resultado institucional, a revisão de dados e premissas. Retirados: a tela dedicada de tese de originação, inalcançável desde a #364, com a sua inferência, o seu laço e o namespace `App.origination`; `advisorIsActive`, `advisorShouldRefresh`, `planPreparationStatus` e a consulta do job do plano; a atualização durante ação pendente; o laço próprio do resultado institucional; a consulta de jobs de `loadDealStateWorkbench`; e as cinco inferências pela ausência (oportunidade, materiais do caso privado, telas especializadas, tese de originação, texto da conversa vazia). O caminho de atualização por última mensagem que o incremento 4 substituiu já saiu na #789; o rascunho nomeado continua de propósito. Sem migração e sem mudança de worker. Testes: `work-activity.test.ts`, `analysis-gap.test.ts`, `institutional-model-result-activity.test.tsx`, `advisor-project-state.test.ts` reescrito e a jornada Playwright `work-activity.spec.ts` (sem atualização depois do fim do job; espera mostrada como espera por pessoa). Nota: `docs/build/arcabouco/etapa-18-5b-estado-e-retirada.md`.

## Etapa 18, incremento 4 (web): continuação pela conversa e a seção Atualizações do trabalho, 25/09/2026

A conversa passa a reconhecer um pedido de continuação. `appendAdvisorMessage` decide a rota pelo texto (`advisorMessageRoute`): com verbo de continuação, lê o registro de marcos por `work_update_view_v1`, roda `resolveWorkContinuation` e, com uma base, grava por `request_work_continuation_v1` (o id da mensagem é o id do pedido) e responde com a base usada; com base ambígua ou ausente, devolve ao compositor a pergunta com as bases aprovadas, sem gravar nada, e a pessoa escolhe a base (`continueAdvisorWorkFromBase`), envia o texto como mensagem comum (`sendAdvisorMessageAsTurn`) ou volta ao texto. A revisão de um rascunho `pending_confirmation` só é tentada quando o texto nomeia o rascunho; sem rascunho pendente (P0002), a mensagem segue a sua rota. Tudo funciona em trabalho sem sessão de intake, e a mensagem da conversa mostra a base e a revisão da continuação. A tela do trabalho, com e sem intake, ganhou a seção Atualizações: o que mudou e por quê, o que foi refeito e a partir de qual execução original, o que continua válido e o que espera decisão (autorização com teto, bloqueio com o sinal), com adotar, autorizar e recusar atrás de uma segunda confirmação, por `adopt_work_update_v1`, `authorize_work_update_v1` e `decline_work_update_v1` na revisão que a pessoa viu. Cada execução aparece pelo título do método publicado e cada premissa pela métrica ou pela definição adotada, nomes resolvidos no servidor pelo catálogo de mensagens a partir do que a leitura do banco passou a trazer; nenhum id de método ou caminho de campo chega ao texto. A seção vem primeiro quando alguma atualização espera decisão, e uma atualização que o planejador do 3B incorporou a outra (uma mudança que chega em vários eventos) aparece em Anteriores como incorporada. Os textos estão em `pt-BR.json` e `en-US.json` com as mesmas chaves. `apps/web/src/types/database.ts` recebeu à mão só as cinco RPCs públicas novas, até a regeneração na aplicação. Testes unitários da rota, do modelo da tela e do componente, e a jornada `apps/web/e2e/work-continuation.spec.ts`: continuação com base explícita em trabalho sem intake e adoção de uma atualização pronta produzida por uma nova versão de fonte, com o worker local refazendo a execução. O deploy da web depende da migração do incremento 4 (banco) aplicada antes. Desenho, rotas e limites em `docs/build/arcabouco/etapa-18-4-continuidade-e-adocao.md`.

## Etapa 18, incremento 5A (banco): resultados do modelo institucional no grafo comum, 25/09/2026

Segunda parte do incremento 5A, depois da PR #792 (contrato e robô), mesclada e implantada no robô às 01:10:48 UTC de 26/09/2026, antes desta migração. A migração `20260926013425_institutional_result_dependencies.sql` leva ao grafo de dependências da etapa 18 os resultados do modelo institucional, que o job `agent_operation_brief` produz fora de `public.work_executions` e que dois comandos recalculavam por conta própria, postando mensagem sintética e refazendo o cálculo inteiro. Cada resultado registra, na transação que o cria, as arestas do que fixou em `private.institutional_result_dependencies` (projeção irmã de `execution_dependencies`, com o mesmo contrato e preenchimento dos resultados existentes): a revisão de configuração aprovada e as versões de fonte sobre as quais ela foi revisada. O escopo de recebíveis e o brief aceito não entram: o cálculo não os lê, e isso foi conferido no código. Uma configuração aprovada mais nova emite o tipo novo `institutional_configuration` com `propagate_dependencies`, e uma versão nova de documento já emitia `source_version`; o efeito de dependência grava fatos imutáveis em `private.institutional_result_invalidations` com as regras do 3A, só para os resultados vivos que dependem da chave, e funde execuções e resultados afetados num único pedido de atualização por obra. O planejador do 3B planeja as linhagens institucionais com as mesmas regras (representante mais novo, uma candidata por linhagem e cabeças em `public.institutional_recompute_candidates`, nunca duas vezes) e enfileira o mesmo job determinístico de orçamento zero, sem mensagem, em nome do solicitante da raiz, com autoridade ligada a ele e revalidada pela varredura; a conclusão substitui o resultado anterior pelo invariante existente, e o anterior fica guardado e legível. Documento novo sem configuração aprovada sobre ele fica bloqueado em `private.institutional_recompute_holds` até a aprovação. O aprovar e calcular grava o id do pedido como a autorização de quem aprovou, onde sempre gravou; quando o grafo pode recalcular um resultado vivo da obra, aplica o próprio evento na sua transação e o grafo enfileira a recomputação em nome de quem aprovou, com o id do pedido como id do resultado e sem mensagem; quando não pode, ou quando o passo do grafo falha, segue para o cálculo com mensagem que sempre postou, sob o mesmo id. Assim o mesmo pedido repete com `replayed: true` e o mesmo id para outra candidata é recusado. `propagate_project_canonical_revision_v1`, sem chamador, foi aposentada com recusa nomeada `project_revision_propagation_retired` e execução revogada. O instantâneo de controles operacionais da análise de caso passa a contar dependentes desatualizados pelos fatos e pelos pedidos não adotados nem recusados, lidos pela RPC fechada `worker_load_work_freshness_v1`, e falha fechado quando não consegue ler; esse leitor é o único trecho de robô desta PR e vai com ela, depois da aplicação. `public.dependency_invalidation_events` não muda. As três funções reescritas por inteiro são presas ao md5 de `prosrc` do corpo que substituem, a troca das restrições de `private.domain_events` é a última instrução, e nenhum id derivado por md5 chega a evento ou a consumidor `z.uuid()`. `institutional_result_dependencies.sql`, a extensão de `rls_non_interference.sql` e os ajustes de `project_canonical_revisions.sql` e `institutional_revision_proposals.sql` cobrem o incremento, inclusive a falha forçada do passo do grafo, a repetição e a recusa do id reusado; os seis corpos tocados, conferidos por SHA-256 do `pg_get_functiondef` nos dois bancos depois da aplicação, são iguais ao snapshot desta PR. Aplicada em staging (`20260926013009`) e em produção (`20260926013425`) em 26/09/2026 pelo executor via MCP, com o texto gravado igual ao arquivo nos dois bancos (md5 `8e57ad8a9c03209febd523c377128fa1`) e o advisor de segurança sem apontamentos; produção tinha zero resultados institucionais, então o preenchimento gravou zero arestas. A guarda da função aposentada aceita também o corpo de staging, igual ao de produção sem duas linhas de comentário, medido antes da aplicação. Inventário conciliado com 54 objetos novos (4 tabelas, 1 visão, 26 funções, 16 gatilhos, 7 políticas) e as duas funções de propagação atualizadas, com a revogação registrada; catálogos e journals atualizados; tipos públicos gerados de produção (só inserções: a tabela de candidatas e a RPC de atualidade). Adoção e recusa de pedidos com dependentes institucionais ficam para a etapa 18/5C. Mapa dos caminhos legados, desenho, limites e ordem de aplicação em `docs/build/arcabouco/etapa-18-5a-adaptadores-legados.md`.
## Etapa 18, incremento 4 (banco): continuidade com base explícita, adoção, autorização e recusa, 25/09/2026

A migração `20260926011438_work_continuation_commands.sql` acrescenta quatro comandos e uma leitura, cada um com núcleo `security definer` em `private` sob invólucro `security invoker` em `public`, idempotente por um id do chamador, conferindo a autoridade atual da pessoa sobre o trabalho com a regra do pedido de execução e gravando cada linha e cada marco do ato numa transação, sob a trava do trabalho que o planejador e o worker do 3B tomam. `request_work_continuation_v1` registra um pedido de continuação feito na conversa a partir de uma base explícita (marco, decisão e revisão): o banco confere que a base é decisão ou adoção aprovada do próprio trabalho que nada substituiu, pela regra de `approvedBases`, e grava o turno da pessoa na conversa que `append_work_turn_v1` usa (com ou sem sessão de intake), o pedido `user_followup` com payload e fingerprint e o marco `continuation_proposed` que referencia a base, sem enfileirar nada nem chamar modelo. `adopt_work_update_v1` adota uma atualização pronta na revisão esperada e grava `update_adopted` referenciando os resultados novos e os que eles substituem. `authorize_work_update_v1` agenda uma candidata com custo para o worker, com `human_resolved` da espera e `decision` aprovada, e o pedido segue pela função de estado do 3B. `decline_work_update_v1` recusa uma atualização aberta, em espera, agendada ou pronta, ou uma candidata em espera, com o código do motivo da pessoa e uma `decision` rejeitada, fechando as esperas. `work_update_view_v1` devolve, a quem lê o trabalho, o registro de marcos, as bases aprovadas e, por atualização, os fatos que invalidaram cada execução, a candidata, os bloqueios com o sinal, os resultados e o que ficou válido, lendo as tabelas privadas só sob essa autoridade. `public.work_milestones` ganhou referências explícitas validadas e o resultado das decisões, e `public.work_continuation_requests` ganhou o formato de `user_followup` e o motivo da recusa; nenhuma função existente foi alterada por texto. Os comandos travam a linha do projeto (`for no key update`), depois a trava do trabalho, depois a conversa, a ordem global dos escritores de um trabalho; `private.lock_recompute_lease_v1` do 3B foi redefinida na mesma ordem; os marcos dos comandos são UUID versão 5; a migração define `lock_timeout` de 5 segundos. O contrato de domínio aceita decisão e proposta sem referência quando o que tratam fica fora do registro, e exporta os verbos de continuação e a detecção de rascunho nomeado para a conversa. `work_continuation_commands.sql`, a extensão de `rls_non_interference.sql` e os testes de `packages/work-plan` (com o vetor de paridade das bases) passam numa réplica local de todas as migrações; o teste de projeção do incremento 2 passou a ler o `xmin` da linha na tabela. Aplicada em staging (`20260926011152`) e em produção (`20260926011438`) em 26/09/2026 pelo executor via MCP, com o texto gravado igual ao arquivo (md5 `2fad75e5f903f3e0771f4d59e16d15c0`) nos dois bancos, a guarda do corpo publicado pelo 3B conferida antes da redefinição (md5 do `prosrc` `a1548a46…` nos dois), 19 funções e 2 gatilhos novos, o vetor v5 igual ao do teste e o advisor de segurança sem apontamentos nos dois projetos; produção tinha zero marcos e zero pedidos. Inventário conciliado com 21 objetos novos e a segunda origem de `lock_recompute_lease_v1`, catálogos e journals atualizados, tipos públicos gerados de produção (só inserções: duas colunas e cinco RPCs). Antes da aplicação, o executor acrescentou a guarda md5 da redefinição e limpou três avisos do lint (variável sem uso, estado nunca lido, contagem de linhas em inteiro). A web (conversa, tela do trabalho e jornada Playwright) vem na PR seguinte. Desenho, regras e limites em `docs/build/arcabouco/etapa-18-4-continuidade-e-adocao.md`.
## Etapa 18, incremento 5A (contrato e robô): o robô aceita a configuração institucional antes do banco, 25/09/2026

Primeira parte do incremento 5A, separada da migração para que o robô esteja implantado antes de o banco emitir qualquer coisa nova. O contrato de evento (`packages/domain-contracts`) aceita o tipo de agregado `institutional_configuration` com o efeito `propagate_dependencies`, como `source_version` e `method_release`: sem isso, o primeiro evento desse tipo seria reivindicado, recusado como `invalid_contract` cinco vezes e bloqueado sob o alarme da fila da organização. O robô passa a tratar o job `agent_operation_brief` que traz `institutional_recompute_candidate_id` pelo ramo `processInstitutionalRecomputeJob`: roda o mesmo cálculo determinístico do pedido de uma pessoa para o resultado na fila que o job nomeia, pela capacidade do job, sem carregar a conversa, sem resposta do assistente, sem registro de falha do agente e sem chamada de modelo; um robô antigo trataria esse job como turno de conversa e falharia. Nada aqui muda o banco: nenhum evento desse tipo e nenhum job desse ramo existem até a migração do 5A (PR #788), que depende deste PR e só é aplicada depois que este robô estiver em produção. O manifesto de runtime dos métodos foi gerado de novo porque ele registra o hash de `domain-event.ts`. Testes: `domain-event.test.ts`, `event-outbox.test.ts` e dois casos novos em `institutional-model-runtime.test.ts` (recomputação sem mensagem e sem modelo; falha sem responder mensagem, e carga útil com candidata inválida recusada).
## Etapa 18 / 3A, correção: identificadores dos eventos de release de método, 25/09/2026

O 3A derivava dois identificadores de evento de um md5 convertido em uuid: o agregado do procedimento (`private.method_procedure_aggregate_v1`) e o id do evento de release de plataforma publicada (`private.capture_method_release_event_v1`). Um md5 não carrega a versão e a variante da RFC 9562, e o contrato de evento do worker (`packages/domain-contracts`, `z.uuid`) recusa esses identificadores: todo evento `method_release` seria reivindicado, recusado como `invalid_contract` cinco vezes e bloqueado sob o alarme da outbox. A jornada local de ponta a ponta mostrou isso (`outbox.poll.failed`, `invalid_contract`, uma linha bloqueada), inclusive em main. A migração `20260925232939_rfc_uuid_domain_event_identifiers.sql` troca os dois por UUID versão 5 (namespace URL), ainda determinísticos, com a nova `private.platform_method_release_event_id_v1`; nenhum evento `method_release` existia em staging ou produção, então nenhum agregado gravado mudou de identidade. Aplicada em staging (`20260925232902`) e em produção (`20260925232939`) com o texto idêntico ao arquivo (md5 `b6bc7bd13b10a491e6e2223dd5c339c5`), corpos iguais nos dois bancos, funções fechadas a todos os papéis de API e advisor de segurança em zero. Prova: `supabase/tests/domain_event_identifiers.sql` e `packages/domain-contracts/src/domain-event.test.ts` compartilham o vetor (agregado `8c12d8e2-daa1-5bc6-b9ab-fb695c749cab`, evento `ee927d77-2a6f-5d0f-a5d3-7d147f914061`), o contrato aceita os dois e recusa o md5 anterior; o teste do 3A passou a usar a função nova. No mesmo dia entrou o alarme `offroad-recompute-errors` do laço de recomputação, registrado em `docs/build/RISK_REGISTER.md`.

## Etapa 18, incremento 3B (worker): composição compartilhada e recomputação produzida pelo worker, 25/09/2026

A sequência que a ação web de pedido de execução de capital sempre seguiu sai de `apps/web/src/lib/execution` para o pacote novo `@offroad/execution-request`: `contract.ts` e `gates.ts` mudam de lugar sem mudar comportamento, e `composeCapitalExecutionRequest` compõe, a partir da base montada pelo servidor e do que foi pedido, os gates que não precisam do pacote, a recusa por fontes sem bytes verificados, o pacote vinculado, o contrato que fixa exatamente a versão da base e o recibo fechado de gates. A ação web passa a usar essa função e envia os mesmos bytes: o teste do pacote fixa os digests SHA-256 do contrato, do snapshot e dos gates que o caminho web produzia antes da mudança, e os testes da ação e da tela continuam iguais e passam. O worker ganha `dependency-recompute.ts` e um loop ao lado do loop de jobs, como o da outbox: reivindica uma candidata de custo zero com lease pelas RPCs fechadas do 3B, lê o que a execução raiz perguntou, pede a base do solicitante original na revisão mais nova, compõe com a mesma função, com o id do pedido igual ao da candidata, e submete; recusa encontrada antes da submissão é gravada pelo código, recusa gravada pelo banco é relatada como está, e falha de transporte deixa o lease expirar para outra tentativa. Nada nesse caminho chama modelo. A imagem exige a capacidade `dependency-recompute.v1` e para no boot contra um banco sem a migração do 3B, por isso só é implantada depois dela. A prova `scripts/ci/verify-dependency-recompute.mjs`, no job de banco, pede uma execução raiz de capital pelo caminho web, muda uma decisão numa revisão nova da base, deixa o efeito de dependência planejar a candidata e roda o loop do worker pela API local com uma conta de worker sintética: a candidata é produzida uma vez, para o solicitante original, fixando a revisão nova, com recibo de gates sem bloqueio, um job na fila, linhagem até a raiz e o pedido agendado. Os testes do pacote e do módulo do worker e o `pnpm check` passaram localmente, e a prova passou contra uma réplica local descartável de todas as migrações com um substituto local da API; a migração do 3B ainda não foi aplicada em staging nem em produção. Desenho e limites estão em `docs/build/arcabouco/etapa-18-3b-recomputacao.md`.

## Etapa 18, incremento 3B (banco): recomputação delimitada das execuções afetadas, 25/09/2026

A migração `20260925204502_work_dependency_recompute.sql` faz o efeito de dependência do 3A planejar, depois de cada fusão, as execuções afetadas de cada pedido aberto, e só elas, como `planDependencyRecompute` define: cada linhagem (a execução raiz e suas recomputações) é julgada pela execução viva mais nova; se ela já usa as cabeças atuais a linhagem inteira é reaproveitada pelo hash, e se está afetada ganha uma única candidata em `public.work_recompute_candidates`, chaveada por `dependencyRecomputeKey` com identidade e chave calculadas em SQL e vetor de paridade comum com `continuation.ts`. Uma chave registrada em qualquer estado nunca é agendada nem posta a uma pessoa de novo. Candidata de custo zero fica agendada para o worker; candidata de custo positivo espera uma pessoa com o marco `awaiting_human`, sem job e sem lease. Nenhuma candidata é produzida enquanto uma fonte derivada não for rederivada da versão nova, a base de trabalho não citar a versão nova de uma fonte que chegou por ela, a versão nova não tiver bytes verificados ou direito vigente ou a release cabeça não tiver perfil executável; cada bloqueio fica em `private.dependency_recompute_holds` com o sinal que o libera, e os sinais existem e são testados (evento de versão da fonte derivada, revisão da base, verificação ou direito registrados para a versão, e eventos `method_release` novos quando uma capacidade fica liberada e universal ou um perfil é registrado). Quatro RPCs fechadas do worker reivindicam com lease, montam a base para o solicitante original na revisão mais nova, submetem pelo caminho v2 completo por variantes com sujeito explícito das funções do produtor (o caminho humano não muda) e gravam a linhagem em `private.execution_lineage` na transação que cria a execução; solicitante sem autoridade recusa a candidata com o motivo, recusa de gate a faz falhar com o código. Resultado gravado liquida a candidata, job falho ou cancelado a faz falhar, pedido com alguma candidata liquidada fica `ready` sem escrever decisão, pedido que termina sem nenhuma liquidada fica `declined`, e candidatas de cabeças antigas são substituídas, com o pedido que só tinha substituídas apontando para o mais novo. Nenhum resultado alimenta outra execução hoje, e por isso não há evento `execution_result`. O perfil de capital liberado tem teto zero, como todo perfil armazenado. Nada chama as RPCs novas até o worker da segunda PR ser implantado. A migração foi aplicada em staging (`20260925204055`) e em produção (`20260925204502`) com o texto idêntico ao arquivo (md5 conferido antes da aplicação e no registro de migrações dos dois bancos); os seis corpos efetivos tocados ficaram iguais ao snapshot nos dois bancos, e o advisor de segurança ficou em zero nos dois. Os 71 objetos novos (40 funções, 20 gatilhos, 7 políticas e 4 tabelas, três funções criadas por DDL dinâmica) entraram no inventário da etapa 0 e nos dois catálogos, com journals e tipos atualizados. Produção não tem execução: nenhuma candidata nem bloqueio foi criado. `work_continuity_dependencies.sql` (seções 13 a 30), a extensão de `rls_non_interference.sql`, o teste de duas sessões `test-dependency-recompute-concurrency.py` e os testes de `packages/work-plan` rodam no job de banco e no job de teste da CI. Desenho, transições e limites estão em `docs/build/arcabouco/etapa-18-3b-recomputacao.md`.

## Etapa 18 / 3A, parte 2: eventos de dependência, fatos de invalidação e pedidos de atualização, 25/09/2026

A migração B de `work_dependencies_and_continuity` (`20260925180927_work_dependency_events.sql`) faz uma mudança de insumo virar fato registrado e pedido de atualização, sem recomputar nada e sem reescrever resultado ou decisão. Nova versão de uma fonte lógica que já tinha versão, release de plataforma publicada e release da casa publicada passam a emitir evento na transação da mudança, pela mesma `append_domain_event_v1`, ao lado dos eventos de adoção e de revisão de premissas que já existiam; esses quatro tipos levam o efeito `propagate_dependencies`, e os eventos de autoridade seguem só com `revalidate_authority`. O consumidor da outbox mantém a varredura de autoridade exatamente como estava e aplica o efeito de dependência depois dela, numa subtransação: falha no efeito não desfaz a varredura e não reconhece o evento, que volta pela outbox e, depois de cinco tentativas, fica bloqueado sob o alarme existente. O impacto é lido das cabeças atuais pela projeção do incremento 2 e pelo fechamento das derivações de fonte, com granularidade de slot, como `computeDependencyImpact` define, e a projeção incompleta é reconstruída antes do julgamento. Cada execução afetada ganha um fato imutável por chave e evento em `private.execution_invalidations`, fechada a todos os papéis de API, e o trabalho ganha no máximo um pedido aberto em `public.work_continuation_requests`, legível por quem lê o trabalho, no formato e com o fingerprint de `continuation.ts`, com o marco `continuation_proposed` gravado uma vez. O mesmo evento aplicado de novo não muda nada, evento antigo não regride e duas mudanças concorrentes no mesmo trabalho terminam num único pedido. O contrato de evento do worker (`packages/domain-contracts`), que aceita os tipos e o efeito novos, entrou antes pela PR #783, e o worker implantado com ele já consumia a outbox quando a migração chegou a produção. A migração foi aplicada em staging (`20260925174235`) e em produção (`20260925180927`) com o texto idêntico ao arquivo (md5 conferido antes e depois de cada aplicação); os corpos efetivos de `append_domain_event_v1` e `complete_event_outbox_v1` ficaram iguais ao snapshot nos dois bancos, e o advisor de segurança ficou em zero nos dois. Os 34 objetos novos (17 funções, 2 tabelas, 5 políticas e 10 gatilhos) entraram no inventário da etapa 0 e nos dois catálogos, com journals e tipos de `public.work_continuation_requests` atualizados. Produção não tem execução, então nenhum fato nem pedido foi gerado. `supabase/tests/work_continuity_dependencies.sql`, a extensão de `rls_non_interference.sql` e o teste de duas sessões `scripts/ci/test-dependency-update-concurrency.py` rodam no job de banco da CI. Desenho, respostas do incremento 1 e limites estão em `docs/build/arcabouco/etapa-18-3a-eventos-e-impacto.md`.

## Etapa 18 / 3A, parte 1: o robô aceita os eventos de dependência antes da migração, 25/09/2026

O contrato de evento de domínio passa a aceitar os tipos `source_version` e `method_release` e o efeito `propagate_dependencies`, que a migração B da etapa 18 vai começar a gravar; os eventos antigos continuam válidos como estão. Esta mudança entra e é implantada no robô antes da migração, para que nenhum evento novo encontre um consumidor que o recuse e fique travado na fila. O efeito continua aplicado pelo banco, na mesma conclusão do evento; o robô só valida o contrato e conclui.

## Etapa 18, incremento 2: projeção de dependências e marcos do trabalho, 25/09/2026

A migração A de `work_dependencies_and_continuity` cria `private.execution_dependencies`, a projeção tipada do que cada execução fixou: cada versão de fonte com a fonte lógica e o número da versão, cada slot de premissa com conjunto, versão, revisão, decisão e fingerprint, e a release de método com o procedimento a que pertence. A única escrita é feita por gatilhos na mesma transação do pedido de execução, a partir das linhas que o próprio pedido grava, e as execuções existentes recebem backfill das mesmas linhas; não há RPC, caminho de worker nem escrita de cliente, e `private.resource_dependencies` segue como registro canônico das arestas entre fontes. Há uma linha por insumo fixado, e não uma por chave lógica, porque uma execução pode legitimamente fixar duas versões da mesma fonte lógica quando slots diferentes foram adotados de versões diferentes. A migração cria também `public.work_milestones`, imutável e legível por quem lê o trabalho: o commit de execução grava o marco de resultado na mesma transação do recibo, sem segundo marco em commit repetido, e o aceite de um execution brief, a confirmação de um artefato e a aprovação de uma configuração institucional gravam o marco de decisão na transação da aprovação, com a aprovação da versão seguinte substituindo a anterior. As espécies de espera e de continuação ficam declaradas sem escritor até os incrementos 3 e 4; as decisões propostas por agentes, a revisão canônica, as propostas de revisão, o escopo de recebíveis e as adoções ficam fora, com o motivo registrado em `docs/build/arcabouco/etapa-18-2-projecao-e-marcos.md`. O teste `supabase/tests/work_dependencies_projection.sql` e a extensão de `rls_non_interference.sql` passaram numa réplica local descartável de todas as migrações; a migração ainda não foi aplicada em staging nem em produção, e a conciliação do inventário da etapa 0, o carimbo definitivo e os tipos públicos dependem dessa aplicação.

## Reserva de gasto de modelo em produção: limite superior calibrado e tetos por tipo de trabalho, 24/09/2026

Toda chamada de modelo em produção reserva agora, antes do envio, o limite superior calibrado do pedido inteiro: instrução de sistema com a orientação de JSON e de reparo, textos e esquema de saída, com dígitos e pontuação a um token por byte e o restante a 0,45 token por byte no Claude e 0,25 no GPT, nunca acima de um token por byte, mais a tarifa de escrita em cache, a saída máxima inteira, a tarifa de contexto longo do GPT-5.6 e 10% de margem. Modelo sem preço completo, PDF e imagem são recusados antes do envio. Até aqui a produção estimava quatro caracteres por token só nos textos, cerca de metade do que o Claude cobra em português, e um trabalho podia passar do próprio teto. Nas amostras de calibração a reserva fica acima de toda cobrança real.

Os tetos por tentativa foram recalculados pela pior tentativa legítima de cada tipo de trabalho, com o maior pedido que o próprio código monta, mais 10% e a reserva de pesquisa pública: documento US$ 1,60 (era 0,75; a classificação e sete janelas de extração no limite somam 1,42); análise do caso US$ 3,10 (era 1,00; no caso Camil a estrutura, o brief, a auditoria com revisão e uma nova auditoria somam 2,70, o motor do caso já limita a US$ 3,00 e a pesquisa leva 0,10); corrida de documentos US$ 16 (era 5), que cobre 3,10 mais oito documentos de 1,60; brief de operação do agente US$ 1,85 (era o padrão de 1,00 do ambiente; as duas chamadas que o antecedem e o brief reparado e respondido pelo fallback somam 1,68); tese de originação US$ 1,55 (o banco dava 1,50 e o worker parava no padrão de 1,00; a pior tentativa soma 1,18, mais doze pesquisas); prévia de integração US$ 0,60 (era 0,50; a síntese que falha e é respondida pelo fallback soma 0,52). Leitura preliminar (0,90), conversa de trabalho (0,25), visão da dívida da companhia (0,95, revisão 0,85) e planejamento de capital (0,95, revisão 0,80) já cobriam a pior tentativa e ficam como estão. O limite de US$ 1,00 por trabalho sai da definição da tarefa do worker e passa a ser um teto opcional que só pode baixar esses valores. O gasto típico não muda: a reserva só decide se a chamada cabe no teto, e a cobrança continua sendo o uso real; o teto mensal da organização continua o mesmo. O brief da análise do caso Camil já era recusado antes: a estimativa antiga reservava 0,98, acima dos 0,90 que o teto de 1,00 deixava ao modelo depois da pesquisa; com o teto novo ele cabe. A migração `production_budget_ceilings` leva ao banco os valores que ele guarda (gatilho da originação, prévia de integração, padrões da corrida, análise do caso, análise incremental e atualização do método de recebíveis) e vai junto com o código, aplicada em staging e produção antes do deploy. Os testes provam a reserva acima das cobranças reais, o maior pedido de cada tipo dentro do novo teto, a recusa antes do envio acima do teto e os números da migração iguais às constantes do código.
## Parâmetros de referência coerentes entre as seis famílias e guia de revisão do fundador, 25/09/2026

## Varredura do outbox preserva avaliações governadas com avaliador ativo, 24/09/2026

Ao concluir cada evento de domínio, o worker varre os jobs da organização do evento (`private.complete_event_outbox_v1`) e cancela como acesso revogado todo job na fila, com lease ou aguardando aprovação cuja autoridade não está vigente. O job de avaliação governada não se vincula a usuário nem a recurso do tenant, e `private.job_authority_is_current_v1` respondia falso para todo job desse tipo: qualquer evento de domínio numa organização registrada para avaliações, como a mudança de um membro, cancelaria todas as avaliações na fila ou em execução. Produção nunca teve job de avaliação nem linha aberta no outbox; o defeito nunca agiu. A migração `evaluation_job_authority_in_outbox_sweep` (carimbo provisório `20260924230000`) reescreve a função, presa por md5 à definição que substitui: o job de avaliação é vigente exatamente quando o gatilho de vínculo o aceitaria de novo (avaliação com a mesma organização, identificador e execução, organização registrada, execução `governed-evaluation-v1` criada pelo avaliador e avaliador ativo), e todo outro job mantém a expressão anterior, byte a byte. O comando legado de falha (`worker_fail_job`) só recusava o lease de uma avaliação porque essa autoridade dava sempre falso; `private.job_for_failure_capability`, também presa por md5, passa a recusar o tipo, como `job_for_capability` já fazia. Dono, permissões, modo de segurança e search_path não mudam. A revogação do avaliador não gera evento de domínio: a partir dela nenhum comando da avaliação prossegue, e o cancelamento vem no próximo evento da organização. O teste `supabase/tests/governed_evaluation_outbox_sweep.sql` prova, com dados sintéticos e rollback, pelo claim e complete do próprio worker: um evento na organização de avaliação conclui sem efeito, a avaliação na fila continua na fila e a avaliação com lease mantém o mesmo lease, sem decisão de acesso; o comando legado de falha recusa esse lease; revogado o avaliador, o evento seguinte cancela a avaliação com `authorization_revoked`, registra uma decisão de acesso e cancela a execução, enquanto a avaliação de outro avaliador ativo segue na fila; e um job de tenant em outra organização continua poupado enquanto vigente e é cancelado quando o dono é suspenso, como antes.

## Parâmetros de referência coerentes entre as seis famílias e guia de revisão do fundador, 25/09/2026

Os 75 parâmetros foram conferidos entre si. Cada número passa a viver numa chave só, e os demais cartões citam essa chave em vez de repetir o valor; testes novos verificam nas duas direções que toda chave e todo campo citados existem e que os limiares repetidos batem com a chave que os governa. As contradições encontradas foram resolvidas: vencimento antecipado e cura (mecânica de mercado como padrão, deliberação dos credores como alavanca para emissor com demanda comprovada), alerta de circularidade com venda financiada pela própria companhia, caixa mínimo, choques de câmbio, parede de vencimentos, prazos de rotas e o estado da correção de preço já em produção. O guia `REVISAO-DO-FUNDADOR.md` foi reescrito: dezessete decisões reversíveis, cada uma com proposta, motivo e o que muda se o fundador preferir o contrário, e uma decisão dele (comunicação ao COAF). A biblioteca de expertise foi corrigida no repositório privado (risco sacado no Ofício-Circular CVM/SNC/SEP 01/2021, item 8; teto do IOF-crédito de pessoa jurídica em 3,373%) e a trava pública foi atualizada para o novo commit. Todos os parâmetros continuam em rascunho até a aprovação do fundador.

## Etapa 18 / 1: contrato de domínio da continuidade, 24/09/2026

O primeiro incremento da etapa 18 cria `packages/work-plan/src/continuation.ts`, código puro e determinístico que os incrementos seguintes (SQL, worker e web) vão implementar. Uma execução depende de três tipos de insumo fixado: versão de fonte, cuja chave lógica é a fonte; slot de premissa, cuja chave é o conjunto mais o slot, com revisão, versão, decisão e fingerprint fixados; e release de método, cuja chave é o procedimento, com a release da plataforma e a da casa, quando houver. As arestas de derivação entre versões de fonte entram por fechamento transitivo. Comparando o que foi fixado com a versão mais nova de cada chave, o contrato diz quais execuções foram afetadas e por quê (tipo, chave, versão fixada e versão atual). A granularidade é o slot: execução que usou só slots inalterados de um conjunto revisado continua válida. Fonte derivada é afetada quando algum ancestral mudou, e troca de método tem motivo próprio, `method_update`. Execução sem arestas registradas, ou com chave sem versão atual conhecida, fica com grafo incompleto: a saída inteira conta como afetada e nada é reaproveitado antes de reconstruir as dependências.

O plano de recomputação refaz sozinho apenas o que tem orçamento zero, abre espera humana persistida, sem job nem lease, quando o perfil pode gastar, e reaproveita por hash o que não mudou. A chave de idempotência combina trabalho, execução base e novo fingerprint de entrada; chave já registrada, em qualquer estado, não é agendada de novo nem volta para autorização, o que cobre entrega duplicada e reinício do worker. Eventos são deduplicados por id, versão antiga que chega atrasada não regride o estado, e o pedido de atualização é único por trabalho, com a união das execuções afetadas e os eventos em ordem canônica, de modo que qualquer ordem de entrega produz o mesmo pedido. Decisões e aprovações que citam um resultado desatualizado voltam como imutáveis e nunca são marcadas para reescrita. Um pedido como "aprofundar o alongamento aprovado" resolve para um marco aprovado explícito, com decisão e revisão, sem diferença de maiúsculas e acentos, inclusive em trabalho sem sessão de intake; referência ambígua ou inexistente vira pergunta ao usuário, nunca escolha silenciosa, nunca a última mensagem nem o artefato mais novo.

`invalidateDependencyGraph`, de `packages/release-governance`, não foi reaproveitado: importá-lo criaria um ciclo entre pacotes, e seu modelo marca aprovações como invalidadas, o contrário da regra desta etapa. O contrato ainda não persiste nada, não lê banco, não está ligado à outbox nem ao worker e não aparece na web; isso vem nos incrementos 2 a 5. São 42 testes de domínio para os cenários do pronto e os casos de borda (grafo vazio, ciclo de derivação recusado com erro nomeado, versão atual igual à fixada). O manifesto de métodos foi regenerado porque o fechamento do procedimento de estrutura de capital inclui os arquivos do pacote.

## Alarmes da outbox com destino e entrega testada; abertura da etapa 18, 24/09/2026

Os quatro alarmes da outbox (`offroad-outbox-backlog`, `-blocked`, `-errors`, `-heartbeat-missing`) avisam o tópico SNS `offroad-outbox-alerts` em sa-east-1, no disparo e no retorno ao normal. A inscrição de e-mail do fundador foi confirmada em 24/09/2026 pela sessão dele, sem mudança de permissão de segurança, e o teste de entrega pôs `offroad-outbox-errors` em ALARM às 19:42:59 UTC: a AWS registrou a ação SNS executada, o e-mail chegou à caixa do fundador e o alarme voltou a OK na avaliação seguinte. Fica atendida a condição que o roteiro põe na etapa 18 antes de ativar continuidade. Com o OK expresso do fundador, a etapa 18 foi aberta: o plano de execução, com o ponto de partida medido, as decisões de desenho e os seis incrementos, está em `docs/build/arcabouco/etapa-18-execucao.md`.

## Preço: CDI e spread compostos, banda central, regime da CVM 160 e mandato mais recente, 24/09/2026

O motor de preço somava CDI e spread em vez de compô-los, como manda a convenção da B3 e da ANBIMA: com CDI de 13,65% e spread de 3%, a taxa saía 16,65% em vez de 17,0595%, cerca de 41 pontos-base abaixo. A composição agora vive numa função única do núcleo financeiro, com memória de cálculo, e vale em todo lugar que monta taxa total ou indicativa: verdade de preço, grade da mesa, leitura de taxa, venture debt, cronograma de fechamento, indicações de sondagem e períodos de taxa do modelo financeiro. CDI, Selic, IPCA e prefixado compõem; SOFR e Treasury continuam aditivos; câmbio é recusado. A banda de preço passa a ser o intervalo entre o primeiro e o terceiro quartis ponderados da amostra, e não mais do mínimo ao máximo; a comparabilidade usa janelas de prazo e pesos de setor e amortização em vez de exigir igualdade exata, com decaimento por idade da observação, e abaixo da amostra mínima o resultado se abstém com "sem base suficiente". O catálogo de instrumentos deixa os limites da ICVM 476, revogada em 2023, e segue a Resolução CVM 160: `debenture_476` passa a significar a debênture para investidor profissional e `debenture_160` a oferta a investidor qualificado ou ao público em geral; a nota comercial entra no catálogo; o IOF por instrumento segue o Decreto 6.306 na redação de 2025, com FINAME à alíquota zero. No mandato de fundo, declaração e conversa formam uma classe só e a afirmação mais recente prevalece, acima do comportamento observado, e instrumentos e geografias leem primeiro o regulamento publicado. O método publicado do caso 1 continua preso ao próprio snapshot e reproduz as execuções registradas; o manifesto do método foi regenerado para os arquivos alterados.

## Parâmetros de referência preparados para a revisão do fundador, 24/09/2026

Os 75 parâmetros de referência do cadastro, em seis famílias (capital e jurídico, análise financeira, dívida e cenários, estrutura, preço e mercado, pedido de informações, materiais e controle de qualidade), estão escritos com valor, regra de aplicação, fundamento, fontes oficiais consultadas em 24/09/2026 e uso no método, no padrão do caso 1. Entram como rascunho: o método continua tratando cada um como lacuna até a aprovação do fundador. Os valores dos rascunhos que as execuções gravadas do caso 1 usam (tolerância de conciliação, muro de vencimentos, folga de covenant, choque de juros padrão) não mudaram. O muro de vencimentos passa a apontar para as regras que o consomem (D-03, D-05, D-28). As escolhas explícitas para o fundador estão em `REVISAO-DO-FUNDADOR.md`. [Revisão](../../packages/credit-playbook/knowledge/reference-data/REVISAO-DO-FUNDADOR.md).

## Custo das chamadas de modelo: preços, limites e reserva calibrada, 24/09/2026

O teste de referência do baseline colava o data room inteiro da Camil em cada pergunta (5,09 milhões de caracteres, cerca de 2,2 milhões de tokens), acima do que qualquer modelo aceita numa chamada, e a reserva contava um token por byte: US$ 37,54 por chamada, cerca de US$ 60 com o fallback. Agora o gateway tem preços conferidos nas páginas oficiais em 24/09/2026 (Claude Sonnet 5 custa US$ 2 e 10 por milhão desde 10/08; os custos gravados em produção com o preço antigo estão 1,5 vez acima do real), tarifa de escrita em cache e de contexto longo do GPT-5.6, tabela de limites por modelo que recusa antes de enviar o pedido que nenhuma rota aceita, e uma reserva calibrada contra o uso real (margem de 1,25 vez sobre o caso mais denso medido). O baseline seleciona o que cabe por uma regra declarada e determinística, e uma rodada completa passa a custar cerca de US$ 8 a 9 a preço de tabela. Também corrigidos: o hash dos documentos do baseline, gravado vazio desde 04/09 porque era calculado depois de o parser consumir o arquivo, e o teto de saída da revisão de fontes documental, que cortava revisões em 4.000 tokens.

## Atestações de provedor sem vencimento por prazo, 24/09/2026

Por decisão do fundador de 24/09/2026, a conferência de provedor de 21/09/2026 deixou de vencer por prazo. A atestação passa a aceitar `validThrough` nulo, que vale até revogação ou substituição; uma data, quando existe, continua vencendo como antes, e conta, projeto, credencial, modelo, recurso, finalidade, classificação, direitos, uso para treino e retenção continuam conferidos. Migração staging `20260924111433`, produção `20260924111709`; o ato de 24/09/2026 revogou as oito atestações de 21/09/2026 e registrou oito identidades novas com o mesmo documento e a mesma evidência, sem data, primeiro em staging e depois em produção, com as pós-condições de elegibilidade conferidas em cada modelo, finalidade e classe. O corte de 21/10/2026, 00h UTC, que pararia todo envio de dados de clientes às IAs, deixou de existir. [Decisão](../security/provider-processing/2026-09-24/DECISION.md).

## Parâmetros de referência: estrutura para as propostas

Os parâmetros de referência passam a receber propostas por família (`src/reference-data-proposals/`), cada uma com cartão profissional em `knowledge/reference-data/`. Uma proposta transforma a entrada do cadastro em rascunho, com valor, fonte e data; o método continua tratando o parâmetro como lacuna até o fundador aprovar. Nesta PR as seis famílias estão vazias e o cadastro publicado não muda; as instruções do fundador de 24/09/2026 entram verbatim em `FOUNDER-ACTS.md`.

## Etapa 17 / 6: fechamento

A etapa 17 fecha no commit de código `32e8e321`: incrementos 4 e 5 completos, os nove scripts de avaliação só pelo transporte governado, o cadastro da companhia pela base da análise e a jornada que pede uma execução do v4 pela tela. Revogação, ferramentas não declaradas, orçamento esgotado, regressão do v4 e de R01 e reprodutibilidade estão provados na CI, com as lacunas nomeadas; a Quality rodou onze vezes no commit final, todas verdes na primeira tentativa e sem teste instável; journals e catálogos de produção e staging idênticos aos commitados; web e worker no commit final; produção sem fixtures. Ficam com o fundador: o marco 3, os destinatários dos alarmes e a leitura do CloudWatch, a conta do avaliador e o gasto das avaliações, as atestações antes de 21/10/2026 e os valores de convenção. Nada da etapa 18 foi iniciado. [Fechamento](arcabouco/etapa-17-6-fechamento.md).

## Etapa 17 / 5: document work product, advisor e síntese executiva pelo transporte governado

Os scripts do document work product (execução e continuação), do advisor e da síntese executiva pedem pelo transporte governado quatro famílias do worker, com rotas fixadas sem fallback e a partição de orçamento de cada script conferindo cada envio antes da reserva. A prova da CI roda os quatro scripts contra a pilha descartável com cassete e, com a garantia revogada, `partial/transport_denied` sem chamadas. A evidência sintética do run 34467680287 entrou como fixture para exercitar a continuação. Tetos padrão mantidos; a síntese executiva só termina se o gasto medido antes do segundo resumo ficar abaixo de cerca de US$ 1,85. [Detalhes](arcabouco/etapa-17-5-avaliacoes-governadas.md).

## Etapa 17 / 5: medições de extração e classificação e sonda pelo transporte governado

Os scripts de medição de extração, de classificação e a sonda de saída estruturada pedem pelo transporte governado três famílias do worker que publicam só a parte que depende do modelo; a pontuação contra o gabarito fica no script e o gabarito nunca entra no produto. A prova da CI roda os três scripts contra a pilha descartável com cassete e, com as garantias revogadas, `partial/transport_denied` sem chamadas. Os workflows exigem `max_cost` sem valor padrão, porque gasto é decisão do fundador; a extração do caso rede-horizonte chega a US$ 37,99 no pior caso. [Detalhes](arcabouco/etapa-17-5-avaliacoes-governadas.md).

## Etapa 17 / 5: roteador de intenção pelo transporte governado

O script do portão do roteador de intenção pede pelo transporte governado a família `intent_router_gold`: snapshot com as 52 observações byte a byte iguais às de antes e sem gabarito, pontuação fora do worker, linha de guarda e chaves removidas. A prova da CI roda o script contra a pilha descartável (184 tentativas reservadas e liquidadas, commit avaliado) e, com a garantia revogada, `partial/transport_denied` sem chamadas. Com o teto padrão de US$ 3, a execução só termina se o gasto medido ficar abaixo de cerca de US$ 2,80; gasto é decisão do fundador. [Detalhes](arcabouco/etapa-17-5-avaliacoes-governadas.md).

## Etapa 17 / 5: baseline pelo transporte governado

O script do baseline deixa de montar provedores e de ler chaves: no modo real pede a avaliação pela sessão do avaliador e grava só o que o worker registrou para o snapshot enviado. A barreira fixa por nome os oito scripts que ainda montam provedores e proíbe chave de provedor em qualquer outro. A prova da CI roda o próprio script contra a pilha descartável: sucesso com o `run.json` igual ao registro do worker e, com a garantia revogada, `partial/transport_denied` sem nenhuma chamada. O workflow lê a credencial do avaliador e falha fechado enquanto ela não existir. Cada turno do gc01 reserva cerca de US$ 37,54, acima do teto padrão de US$ 25; gasto é decisão do fundador. [Detalhes](arcabouco/etapa-17-5-avaliacoes-governadas.md).

## Etapa 17 / 4C: cadastro da companhia pela base da análise

O gate de cadastro da 4C (#755, #759) recusaria todo pedido real de execução: o produto não tinha caminho para tornar a entidade da base sujeito ativo de um dossiê do trabalho, nem para verificar a companhia legada, e em produção não havia nenhuma companhia verificada nem vínculo de entidade. A identificação de entidade na base da análise passa a registrar também o papel na análise (companhia analisada por padrão, controladora, controlada, garantidora ou ativo) e o perímetro contábil, por `link_dossier_entity_v1`, sem migração. Repetir o registro com o mesmo papel e perímetro não cria um segundo vínculo; com outro perímetro, o papel registrado é mantido e a tela diz isso. A tela mostra qual é a companhia analisada, e a recusa da execução diz onde cadastrar. Provas: seis testes da ação, a jornada E2E de adoção contextual confere na tela e no banco o vínculo `subject:consolidated`, 810 testes da web, typecheck e lint.

## Fontes proprietárias fora do repositório público, 23/09/2026

Os originais do fundador (demanda do CFO, contrato de experiência, posicionamento, pesquisa e protótipo) e a biblioteca de expertise saíram da árvore de trabalho do repositório público e passaram a viver no repositório privado `carlosevg100/offroad-expertise` (commit `910097c9`), com manifesto de hashes. O repositório público os referencia só por hash em `packages/credit-playbook/knowledge/sources/biblioteca-expertise.lock.json`, verificável com `python3 scripts/expertise-lock.py verify` a partir de um clone local. Os caminhos antigos entraram no `.gitignore` para impedir publicação acidental, e o gate local volta a passar sem arquivos soltos. Nenhum byte foi alterado: os hashes conferem com o registro `originals-final.json` da etapa 15.

## Etapa 17 / 5: consumidor de avaliações

Porta do avaliador por sessão, consumidor de avaliações no worker com uma reserva por tentativa e commit pelo motivo que o banco exige, família baseline compartilhada entre script e worker e prova ponta a ponta com cassete na CI. [Detalhes](arcabouco/etapa-17-5-avaliacoes-governadas.md).

5 consumidor: migração `governed_evaluation_session_access` em staging `20260924015406` e produção `20260924022447`; prova da sessão (26 verificações) em staging; worker 779 testes, agent-contracts 344, model-gateway 83; inventário com 4 funções; catálogo de produção 2323; tipos regenerados de produção. A chave de transporte segue fechada e não existe avaliador em produção.

## Etapa 17 / 4D: tempo até valor, sem conteúdo

Recibo imutável da leitura do resultado pelo leitor e visão de operador com os intervalos até a primeira resposta útil e até o resultado verificado, só com ids, carimbos, intervalos, booleanos e códigos. [Escopo, definições e provas](arcabouco/etapa-17-4d-telemetria.md).

4D telemetria: migração `execution_time_to_value` em staging `20260924011941` e produção `20260924013350`; guarda dos dois leitores conferida em produção antes da aplicação e instrução gravada idêntica ao arquivo depois; prova `execution_time_to_value.sql` em staging; advisors de segurança zero; inventário com os objetos novos; catálogos recapturados.

## Etapa 17 / 5: avaliações governadas

Transporte governado de avaliações no banco, instalado fechado: principal avaliador, organizações de avaliação, identidade imutável, orçamento, recibos por operação ligados à decisão de processamento, commit que reautoriza as rotas e chave de transporte fechada. [Escopo, compatibilidade, provas e o que falta](arcabouco/etapa-17-5-avaliacoes-governadas.md).

5 transporte: migração `governed_evaluation_transport` em staging `20260924005113` e produção `20260924011837`; CI da suíte inteira de banco rodada com a migração antes da aplicação; instrução gravada em produção idêntica ao arquivo; corpos reescritos idênticos aos de staging; advisors de segurança zero; inventário com 57 objetos; catálogo de produção 2314; tipos regenerados de produção. Dry-run do baseline corrigido em #746.

## Etapa 17 / 4C: gates profissionais da execução

Os gates de cadastro e pesquisa, seleção de método, convenções, voz, gráficos e teste do MD envolvem a execução na base do servidor, na ação da web e na leitura; nada entra no executor v4. [Escopo, decisões e provas](arcabouco/etapa-17-4c-gates.md).

4C-3 recibo: migração `execution_gate_receipts` em staging `20260924003703` e produção `20260924005237`, antes do merge; base v2 com o bloco da companhia calculado no servidor, produtor v2 que recusa gates bloqueados, com texto livre ou divergentes e grava o recibo imutável na mesma transação da execução, leitor v2 com o recibo; funções v1 inalteradas. Prova `execution_gates.sql` (39 verificações) em staging; contrato TypeScript dos gates. Advisors de segurança zero; inventário com 13 objetos; catálogo de produção 2257; tipos públicos regenerados de produção.

4C código (#756): filtro de voz, gate de convenções, seleção de método com as doze situações de R3, rubrica e avaliador determinístico do teste do MD e séries de gráfico sem campo de estilo; manifesto de runtime regenerado, lock publicado sem mudança.

4C-4 tela: pedido com situações e gates montados na ação (cadastro e pesquisa do servidor, seleção de método, convenções do procedimento v4, voz só sobre o texto do sistema) e enviados pelo produtor v2; detalhe com o recibo, as dez perguntas do teste do MD sem veredito e os números decisivos em texto. Web 804 testes; catálogos com a mesma estrutura nos dois idiomas; filtro de voz sem bloqueio.

## Etapa 17 / 6: fechamento

Retirada da liquidação só por hash: `worker_settle_execution_v1` (público e privado) e `settle_execution_operation_v1` saem do banco; o worker publicado só usa `worker_settle_execution_v2`, que grava os bytes. [Escopo, evidência e o que segue aberto](arcabouco/etapa-17-6-fechamento.md).

6 liquidação: migração `retire_hash_only_settlement` em staging `20260924001737` e produção `20260924002148`, antes do merge; produção sem execuções, sem recibos e sem chamada a comando de liquidação nas últimas 24 horas. Provas `execution_commands.sql`, `execution_consumer.sql`, `execution_lifecycle.sql` e `execution_settled_bytes.sql` convertidas e executadas em staging; o recibo antigo só com hash segue provado por escrita direta. Advisors de segurança zero; inventário com três objetos `apagar`; catálogos recapturados (produção 2244, staging 2305); tipos públicos regenerados de produção.

## Etapa 17 / 4A: produtor com autoridade, base montada no servidor e leitores

Grant de produtor por organização, escrito só por comando ligado a identidade e ledgerado; habilitar um cliente real (organização da qual o fundador não é membro) é ato do fundador; liberar a capability é ato de operador, contido pelos grants, com ledger de toda escrita em `platform_capability_releases`. A base do contrato é montada no servidor a partir de linhas persistidas (identidade, revisão de autoridade, política, único perfil liberado, envelope da base de trabalho, pins de decisão e de fonte verificada); o produtor público resolve o perfil no servidor e recusa método divergente; leitores devolvem identidade e estado, e os bytes do resultado só enquanto os insumos do leitor estiverem correntes. [Escopo e provas](arcabouco/etapa-17-4a-produtor.md).

4A banco (#749): `execution_producer_authority` em staging `20260923211108` e produção `20260923233258`; `execution_producer_commands` em staging `20260923212248` e produção `20260923233409`. Provas `execution_producer_authority.sql` e `execution_producer_request.sql` executadas em staging com rollback e no job de banco da CI. A CI pediu três ajustes: a prova de pedido concede o produtor com a identidade do fundador sintético, porque a organização da fixture não tem fundador membro e habilitá-la é o ato do fundador; o verificador de paridade de grants do RLS pareia cada wrapper público com a função privada que o corpo dele chama, e não só pelo nome; a biblioteca de métodos valida o registro de revisão do adaptador com esquema próprio e o deixa fora do índice de revisões de método. Revisão independente do adaptador de perfil aprovada; perfil v4 derivado com fingerprint igual ao lock. Tipos públicos regenerados de produção. Advisors de segurança zero; journals, inventário (32 objetos) e os dois catálogos conciliados. Os atos em produção e a tela estão nos parágrafos seguintes.

4A web: `composeBoundCapitalPacketV2` (financial-model), `apps/web/src/lib/execution/{contract,read,failure}.ts`, ação `requestCapitalExecution`, telas de lista, pedido e detalhe em `projects/[projectId]/executions`, catálogo `App.workExecutions` em pt-BR e en-US; revisão independente do incremento com as condições registradas no documento. Testes na árvore rebaseada sobre main: web 746 testes em 116 arquivos (typecheck e lint verdes), financial-model 364, document-worker 748, credit-playbook 428, agent-contracts 309; o manifesto de runtime foi regenerado porque o compositor entra no fecho de fontes do executor (o publicado e o lock não mudam). Marco 3 aguarda o fundador: registrar uma base de trabalho no espaço Cedro e pedir a execução na tela nova.

4A atos em produção (2026-09-23T23:37:04Z, executor Claude Fable 5.1 sob a instrução permanente do fundador de 23/09/2026, `application_name` `claude-fable-5.1 executor (etapa 17, 4A)`, identidade de autoridade `b60448ce…` do fundador): (1) perfil de execução v4 `7391658b…` registrado para a release `prepare-capital-structure-decision-2026.09.21-v4` com payload canônico de 1464 caracteres (sha256 `61989190…`, fingerprint do perfil `3a6d352b…` igual ao lock), commit do adaptador `65c4e441…` e evidência de revisão independente aprovada (`knowledge/reviews/execution-profile-prepare-capital-structure-decision-2026-09-21-v4-adapter-review.json`, sha256 `39746391…`); antes do ato, o payload foi validado a seco contra a release de produção (release, manifesto, orçamento, compilador e método iguais); (2) grant de produtor para a organização do fundador, Cedro (`65fa79a6…`), ato de operador porque o fundador é membro ativo; (3) capability `method.prepare-capital-structure-decision.2026.09.21-v4` liberada com exposição universal (antes: `released=false`, `exposure=internal`), ato de operador contido pelos grants; o comando conferiu que o último evento do candidato é publicação. Ledgers: `execution_profile_registrations` (comando `f105d02f…`), `execution_producer_grant_events` (comando `229bb7a8…`), `platform_capability_release_events` (comando `6d299917…`). Nenhum outro tenant tem grant; nenhuma execução foi pedida pelo executor: o primeiro pedido real é o marco 3, do fundador, pela tela nova.

## Etapa 17 / 4B: lote residual de pedidos de informação

Prompt, schema, assessment, fila, RPC e projeção deixam de cortar o pedido residual: a companhia recebe tudo o que falta em um lote, cada pedido com o motivo e a decisão que altera, sem teto artificial; base insuficiente declara `insufficient`, não força alternativas nem comparação e pede o resíduo. Adaptador novo `knowledge/adapters/capital-planning-residual-2026-09-24.md` (`2026.09.24-v2`), legado congelado intacto; `EXECUTOR_VERSION` do planejamento de capital `2026.09.24-v2`. [Escopo, pontos de corte e provas](arcabouco/etapa-17-4b-lote-residual.md).

4B: migração `20260923224304_residual_information_request_batch` restabelece os dois RPCs com guarda de deriva (base = texto liberado mais remendos de 10/09 e 07/09) aplicada pelo executor via MCP em staging `20260923213852` e em produção `20260923224304` antes do merge, com o guarda de deriva aceitando a base real nos dois projetos; worker e web sobem juntos depois do merge. Provas SQL: sete pedidos por comando, trilho da página com as sete, motivo em branco e 61 pedidos recusados; migração e blocos novos executados em Postgres 18 local descartável com tabelas mínimas (reconstrução byte a byte igual ao encadeamento real de remendos, guarda passando, recusando base alterada e idempotente). Testes: agent-contracts 309, domain-contracts 42, credit-playbook 425, worker 746, web 712 (paridade e sem travessão). Fora do incremento: cortes de R01, checklist de intake legado, prévia de integração e sinais de pesquisa. O fecho de compilação do método capital v4 muda na árvore atual; o publicado, o lock, o pin e a identidade do worker não mudam.

## Etapa 17 / 3O: identidade do operador e do fundador

Fundador e operadores viram principais ligados a `auth.users`; perfis de método, pausas de release e aprovações de conteúdo passam a ser registrados com o principal que agiu e ledgerados; publicação exige a identidade do fundador quando há fundador registrado; o pedido de execução com sujeito explícito tem registro de chamadores. [Escopo e provas](arcabouco/etapa-17-3o-identidade-do-operador.md).

3O: primeira migração em staging `20260923194444` e produção `20260923200029`; endurecimento após a revisão independente em staging `20260923202101` e produção `20260923203112`; terceira parte após a segunda revisão em staging `20260923205449` e produção `20260923223307`. Fundador registrado em produção; identidade declarada verificada contra principal ativo; ledgers sem herança de identidade e sem truncamento; releases anteriores ao registro ficam sem identidade vinculada, por decisão registrada no documento. Advisors de segurança zero nos dois ambientes; 27 objetos no inventário; journals conciliados; prova SQL executada em staging com rollback. 3M, 3N e 3O seguem para main em uma única PR porque o catálogo de evidência do inventário é um retrato único de cada projeto; CI final e deploy exato ficam registrados no completion.

## Etapa 17 / 3N: resultado liquidado recuperável

O settle passa a conservar os bytes exatos do resultado; uma lease posterior da mesma execução publica esses bytes sem recomputar, e o commit recusa hash de outra lease ou bytes diferentes. Recibo de resultado registra a lease da liquidação e a da publicação; transporte do worker com timeout proporcional ao payload. [Escopo e provas](arcabouco/etapa-17-3n-resultado-liquidado-recuperavel.md).

3N: migrações `execution_settled_result_bytes` (staging `20260923193010`, produção `20260923193243`) e `execution_settled_outcome` (staging `20260923195039`, produção `20260923195408`); advisors de segurança zero nos dois ambientes; tipos regenerados; journals de produção e staging conciliados; prova SQL executada em staging com rollback nas três trilhas (sucesso, marcador parcial, hash v1); 28 testes do worker PASS. A revisão independente da primeira parte reprovou por desfecho invertível e journal ausente; a segunda parte corrige os dois. CI final e deploy exato ficam registrados no completion.

## Etapa 17 / 3M: continuidade R01 por metadados

Projeção compacta `r01_preparation_metadata_v2` comum ao loader pesado e à conferência privada do recibo (`r01_preparation_receipt_current_v1`): pins completos de fonte, direitos atuais e fixados, fechamento de dependências, histórico integral e respostas revalidadas, sem ler blobs nessa fronteira. Loader, gravador de recibo e leitura de escopo atualizados para a mesma projeção. Desenho, revisão e testes vieram do rascunho anterior; a execução R01 continua recusada e nenhum grant muda. [Escopo e gates](arcabouco/etapa-17-3m-metadados-r01.md).

3M: staging `20260923200518`, produção `20260923200643`; cinco definições idênticas nos dois ambientes por md5; advisors de segurança zero; journals conciliados. As provas SQL desta fatia (`r01_preparation_metadata.sql`, `r01_preparation_metadata_responses.sql`, concorrência real em `test-r01-integrity-concurrency.py`) rodam na CI do zero; não foram executadas em staging pelo tamanho da fixture. Revisão independente, CI final e deploy exato ficam registrados no completion.

## Registro: corpos efetivos das funções reescritas por texto, 23/09/2026

Auditoria M6: dezenas de migrações reescrevem funções por `pg_get_functiondef` mais `replace()`, então o corpo que roda só existia no catálogo. `docs/build/schema-history/effective-function-bodies/` passa a guardar, byte a byte, a saída de `pg_get_functiondef` das 70 funções alvo (71 assinaturas literais nas migrações, 68 em uma linha e 3 só em forma multilinha, deduplicadas por função), capturadas de staging `gjkkjtbfnssdsbmlhmwk` em 23/09/2026 com o SHA-256 de cada corpo conferido contra o banco; nenhuma ausente. `scripts/ci/verify-effective-function-bodies.py` deriva o alvo das migrações, compara com o banco em `DATABASE_URL`, aceita `--offline` e regenera com `--write`; o job `database` da Quality passa a rodá-lo contra o banco construído do zero. Nenhuma migração, grant ou comportamento do banco mudou.

Limites e anomalias: formas dinâmicas de reescrita (loops sobre arrays, `to_regprocedure` com concatenação, seleção por conteúdo) em 16 migrações ficam fora do alvo automático, registradas no README da pasta. Staging está quatro migrações à frente de `main` (PRs 737, 739 e 740); `r01_preparation_authority_v1` já carrega a reescrita da PR 740, então a CI desta entrega aponta essa função até a 740 chegar em `main`. Migrações só de staging (`domain_event_audit_outbox`, `integration_preview_context_loader`, `fix_receivables_refresh_worker_authority_and_compatible_contract`) mencionam outras oito funções alvo; qualquer diferença real aparece na mesma CI.

## Registro: atos do fundador e recibo de publicação, 23/09/2026

Três "o fundador aprovou" da etapa 17 (autorização da 17, aplicação da 2B, antecipação da proveniência em 3B) foram reescritos como decisões do executor sob a autoridade permanente de 21/09/2026; a instrução do fundador de 23/09/2026 (concluir a 17 e preparar a 18) entrou verbatim em `FOUNDER-ACTS.md`. O recibo do comando auditado de publicação da v4 (candidata, duas atestações, evento de publicação, capability e release) foi lido do catálogo de produção e gravado em `knowledge/reviews/runs/capital-structure-decision-2026-09-21-v4-publication/publication-receipt.json`. As PRs 731 a 733 tiveram seus critérios conferidos e marcados com a nota de auditoria.

## Etapa 17 / 3L: integridade persistida R01

CHECKs de digest em fragmentos e histórico; identidade fixa, mutação com locks sem espera circular e exclusão preservando FKs. [Escopo e gates](arcabouco/etapa-17-3l-integridade-r01.md). 3K fechado em `5b47a510781741f07a4f0ce73687445f6a550768`: Quality `35891920175`, Security `35891920200`, worker `35891987100` PASS; worker437/Vercel6619574038 no mesmo commit. Completion externo `outputs/etapa-17-r01-pausa-2026-09-23/COMPLETION-ETAPA-17-3K.md`. Nenhum grant, consumidor ou ativação R01 novo.

3L: staging `20260923171506`, produção `20260923171852`; três CHECKs validados e duas definições idênticas. Catálogos 2175/2236 e journals 373/387 conciliados; 18 testes dos checkers PASS. Banco da CI inicial: 19 asserções SQL e 17 concorrentes PASS; cinco suítes de staging concluídas com rollback. Produção preserva 87 fragmentos, 12.545.665 bytes comprimidos e zero hashes inválidos. Segurança zero; tipos públicos idênticos. CI final, merge e implantação ainda precisam do completion deste incremento.

## Etapa 17 / 3K: pausa concorrente R01

Leitor e writer disputam o mesmo advisory transacional, com conflito explícito e retry integral; primeira pausa e mudanças da capability ficam cobertas. Demais capabilities preservam sua concorrência. [Escopo e gates](arcabouco/etapa-17-3k-pausa-r01.md). 3J fechado em `6ca2ed8d509653af54ad2f473d3dd3caa148ab04`: Quality `35886385928`, Security `35886385910` e worker `35887037856` PASS; worker436 e Vercel6618616136 no mesmo commit. Completion externo `outputs/etapa-17-execution-subject-2026-09-23/COMPLETION-ETAPA-17-3J.md`.

3K: staging `20260923162842`, produção `20260923163027`; quatro objetos novos e duas definições conferidos, checkers e 18 testes PASS, seis asserções SQL e concorrência em duas sessões PASS. Segurança zero e tipos públicos sem mudança. CI final, merge e implantação fechados no completion 3K acima.

## Etapa 17 / 3J: sujeito humano explícito

Request interno recebe sujeito explícito, wrapper humano mantém identidade da sessão e o job deriva o humano do manifesto/run persistidos. Nenhum grant, JWT reescrito ou ativação R01. [Escopo e gates](arcabouco/etapa-17-3j-sujeito-execucao.md). 3I fechado em `afd50cc3845cf17e53de25f0f9dae1457f9c3511`: Quality `35881387687`, Security `35881387738`, worker `35881387712` PASS, worker435 e Vercel6617742935 verificados. Completion externo `outputs/etapa-17-r01-recibo-2026-09-23/COMPLETION-ETAPA-17-3I.md`.

3J: staging `20260923153636`, produção `20260923154150`; definições idênticas, 15 asserções novas PASS, checkers e segurança aprovados. Revisão independente, CI final e deploy fechados; prova no completion 3J acima.

## Etapa 17 / 3I: recibo privado e preparo limitado

Preparo fixado e readiness publicado em thread terminável; recibo imutável deriva identidade do job e recarrega autoridade. Sem grant ou habilitação R01; ligação transacional permanece no incremento 3. [Escopo e gates](arcabouco/etapa-17-3i-r01-recibo.md). 3H fechado em main `1c24f5898ec15b67fc62bfaa1c5398a161364eeb`, CI e deploy verificados; completion externo `outputs/etapa-17-r01-loader-2026-09-23/COMPLETION-ETAPA-17-3H.md`.

3I: migração aplicada em produção `20260923145742` e staging `20260923145522`; dez objetos revisados, checkers de catálogo/journal e 18 testes passaram. SQL real com rollback e segurança sem alertas. Merge e deploy aguardam a CI final.

## Etapa 17 / 3H: loader privado de autoridade R01

Leitura vinculada ao sujeito do job, com autoridade do trabalho e da sessão, conjunto exato de fontes, hashes e histórico contínuo; respostas humanas cruzadas com pedidos e bindings; adoções conservam dimensões e versões. Sem grants nem autorização para executar. [Escopo e gates](arcabouco/etapa-17-3h-r01-loader.md). Migração, CI e implantação são confirmadas no completion externo; recibo e compatibilidade semântica continuam no incremento 3.

## Etapa 17 / 3G: preparador técnico fixado

Preparação R01 capturada de main, reconstruída offline e verificada por bytes no boot, separadamente do método financeiro. Registro append-only na CI, paridade sintética e ausência de fallback. [Escopo e gates](arcabouco/etapa-17-3g-r01-preparador-fixado.md). Sem DDL ou habilitação R01; recibo SQL continua no incremento 3. Check, CI e implantação pertencem ao completion externo.

## Etapa 17 / 3F: preparação R01 e precedência do rascunho

Rascunho atual prevalece sobre montagem histórica, inclusive para recusar conflito ou incompletude. Preparador reconstrói fragmentos, histórico e origens por valor; não concede autoridade SQL ou readiness. Sua captura imutável e o recibo persistido continuam no incremento 3. [Escopo e gates](arcabouco/etapa-17-3f-r01-preparo.md). Sem DDL; CI e implantação precisam do completion. A etapa 17 continua em execução.

## Etapa 17 / 3E: cálculo R01 único

Shadow e release passam a usar o mesmo resultado verificado, sem segundo cálculo. Recibo local não autoriza execução no banco; a ponte de proveniência continua necessária e fechada. [Escopo e gates](arcabouco/etapa-17-3e-r01-calculo-unico.md). Sem DDL ou mudança do método publicado; CI e deploy pertencem ao completion.

## Etapa 17 / 3D: perfil R01 e fronteira SQL

Perfil histórico reconhecido por igualdade integral; execução R01 recusada até a ponte autoritativa. Sem perfil operacional, concessão ou ativação. [Escopo e gates](arcabouco/etapa-17-3d-r01-perfil-sql.md). Provas de staging, produção e CI pertencem ao completion do incremento; etapa 17 continua em andamento.

## Etapa 17 / 3C: adaptador R01 instalado, fila ainda restrita a capital

R01 passa a ter perfil exato no contrato comum, descritores de schemas vinculados ao artefato publicado e política operacional explícita, separada do manifesto legado sem orçamento numérico. O runtime compartilhado executa capital e R01 em thread interrompível, confere metadados no boot e em cada uso e conserva todos os resultados históricos. Não há DDL, perfil operacional novo ou ativação. A fila segue aceitando somente capital até o próximo vínculo de proveniência, autoridade e contabilidade SQL de R01.

TRUST-APP-01/TRUST-AI-01/TRUST-SDLC-01. Testes, limites, transição e riscos em `docs/build/arcabouco/etapa-17-3c-r01-adaptador.md`. O incremento 3B anterior está fechado em produção no commit `0d1ef1f6`, PR 724, com CI e web/worker conferidos no completion externo. Este registro descreve a implementação de 3C; seu completion deve comprovar CI e implantação. A etapa 17 permanece aberta e a 18 não começou.

## Etapa 17 / 3B: consumidor e proveniência antes da publicação

A fila atual recebe consumidor de capital com conta operacional vinculada, reserva única, thread interrompível, heartbeat com autoridade corrente e settlement/commit dos mesmos bytes. Falhas da fila nova não paralisam o legado. A proveniência foi antecipada por aprovação do fundador: bases embutidas devem coincidir com versões persistidas, contexto e todos os pins; referências avulsas conservam os direitos fixados e atuais.

TRUST-APP-01/TRUST-AI-01/TRUST-SDLC-01/TRUST-OPS-03. Sem produtor público, perfil operacional de cliente, chamada de provedor ou alteração do motor aprovado. Origens de cálculo sem recibo autoritativo são negadas; sua publicação vinculada e a adaptação de R01 ao envelope comum continuam obrigatórias antes do fechamento da etapa 17. Detalhes, testes, riscos e reversão em `docs/build/arcabouco/etapa-17-3b-consumidor.md`. CI e produção somente podem ser afirmadas com os comprovantes do completion; etapa 18 não iniciada.

## Etapa 17 / 3A: executor de capital fixado na imagem

O procedimento capital v4 publicado passa a ter binário reproduzível a partir de seu commit de aprovação, com manifesto e perfil conferidos no loader. `compiled-executor-lock.json` preserva o formato de composição separado do registro histórico de R01; ambos usam o mesmo rebuild, registro de runtime e checker de imutabilidade. O worker verifica os dois artefatos antes de consultar a fila. Versão ausente ou bytes alterados impedem a inicialização, sem fallback para fontes atuais.

O eval do pacote cobre oito testes novos, incluindo os 26 casos registrados de capital v4, mais quatro regressões de R01; quatro testes novos do worker verificam identidade, schemas, perfil e disponibilidade. Revisão independente estática aprovada. CI, merge e deploy ainda precisam dos comprovantes no completion; este registro não antecipa produção. Detalhes e limites em `docs/build/arcabouco/etapa-17-3a-executor.md`.

TRUST-APP-01, TRUST-AI-01 e TRUST-SDLC-01: aditivo, sem migração, backfill, grants, dados de cliente ou chamada de provedor. Capital publicado permanece sem produtor/consumidor operacional. Engenharia de execução continua responsável no incremento 3 por lease/aborto, contabilidade, perfil operacional, proveniência dos inputs e adaptação de R01 ao envelope comum. Rollback retorna a imagem anterior; não há estado novo no banco. Etapa 17 permanece aberta e a 18 não começou.

## Etapa 17 / 2B: candidata do núcleo de execução fechado

Request, claim, reserve, settle e commit privados preservam identidade, manifesto, bytes, lease e resultado lógico único. Perfil registrado pelo operador não concede execução. A fila atual conserva o estado agendável; claims e capabilities antigos recusam o novo tipo. As tabelas de controle têm RLS forçada e nenhum grant a anon, authenticated ou service_role. O único adaptador atual é determinístico, com custo e chamadas zero: não existe autorização de egresso, pesquisa ou fallback neste núcleo.

Adoções fixam decisão, versão da base e fingerprint. Fontes fixam recibo de verificação dos bytes e direitos de uso, com revalidação das dependências no commit. Reserva interrompida fica incerta; retry não devolve saldo nem repete operação. Duração é acumulada entre leases e exaustão exige resultado parcial. TRUST-APP-01, TRUST-AI-01, TRUST-SDLC-01 e TRUST-OPS-03: testes negativos cobrem autoridade, repetição, fonte declarada sem verificação e revogação da fonte usada por uma adoção. O teste concorrente com dois workers está ligado ao job database.

Produção recebeu execution_authority_commands (20260922153436), execution_verified_source_pins (20260922153443), execution_policy_current_clock (20260922153452) e execution_current_read_rights (20260922153457). Staging conserva 20260922131651, 20260922132215, 20260922132931 e 20260922150256. SQL idêntico por SHA-256; 67 funções, 154 colunas e 129 restrições conferidas entre ambientes. Journal com 365 versões, catálogo de produção com 2139 objetos e staging com 2200, ambos sem erro no checker; 18 testes do checker PASS. Segurança sem lints; perfil, execução, job novo e resultado permanecem vazios nos dois ambientes, sem fixtures em produção.

Onze suítes SQL novas e três regressões passaram com rollback em staging. Antes/depois comprovados para hash declarado sem verificação, expiração dentro da transação e retirada isolada de read. A revisão independente encontrou e confirmou a correção deste último caso, inclusive bases e dependências transitivas. Quality 35745516663 passou replay, SQL, quatro cenários concorrentes, E2E e lint/tipos/testes/build; falhou somente no inventário/journal então pendente. Security 35745516529 passou os quatro jobs. O fundador autorizou explicitamente aplicar os arquivos antes de registrar os carimbos reais e exigir CI final verde antes do merge. Nenhum gate foi removido ou recibo inventado. Merge, CI final e web/worker no mesmo commit ainda precisam de comprovantes no completion. Não há produtor, ativação ou avanço para etapa 18.

A segunda CI (Quality 35748922759) passou inventário/journal e encontrou SQLSTATE 42702 no linter: a nova coluna execution_id colidia com uma variável local de enqueue_primary_case_analysis. A falha foi reproduzida em staging; execution_legacy_enqueue_identity renomeia somente a variável e conserva a chave JSON, assinatura e grants. Aplicada em produção 20260922155248 e staging 20260922154905, com SQL SHA-256 igual. O teste execution_legacy_enqueue passou após a correção e roda no loop SQL da CI; a revisão independente aprovou o ajuste. CI final continua obrigatória antes do merge.

Os cenários reais provaram claim e operação únicos, revogação antes do commit, commit antes da revogação sem replay posterior e retirada de release sob espera de lock. Engenharia de execução assume no incremento 3 a renovação/aborto de lease, a ligação do perfil operacional e a contabilidade do consumidor. Consumidor e grants mínimos ficam no incremento 3; proveniência do corpo completo e retenção antes de qualquer egresso continuam obrigatórias nele. A ordem global do legado não foi declarada corrigida por este núcleo. Rollback operacional mantém a superfície nova sem grants e sem registros, preservando os consumidores anteriores.

## Etapa 17, persistência 2A: identidade e bytes imutáveis

## Etapa 17, 2B: perfil derivado do manifesto antes dos comandos

O request precisa de limites verificáveis, e o manifesto publicado não tem o mesmo formato do contrato de execução. `execution-profile.ts` deriva identidade, executor, contratos e orçamento dos bytes fixados, recusando alterações de hash, executor ambíguo, formato desconhecido e ampliação de efeitos. O adaptador atual aceita a composição determinística com um executor: custo e chamadas zero, ferramentas vazias, efeito `none` como cálculo sem mutação de domínio. Não inventa câmbio nem uma lista de fórmulas ausente: registra cobertura pela closure do executor. R01 continua no motor histórico; esse adaptador não o substitui.

O contrato novo exige `maxDurationMs`; o orçamento compara duração acumulada sem reiniciar o limite por tentativa. `bindProfiledExecution` confere o perfil e exige separadamente o executor instalado. A derivação local não prova publicação ou permissão atual. As três tabelas novas foram conferidas vazias em staging e produção antes desta alteração aditiva; não existem consumidores do contrato novo. Manifestos publicados e fingerprints históricos permanecem intactos.

TRUST-APP-01/TRUST-AI-01/TRUST-SDLC-01: sem DDL, grants, transporte externo ou ativação. Testes incluem o manifesto capital v4 real e negações de executor, fórmula, compilador, custo, ferramentas, efeito e duração. CI e deploy são gates de fechamento deste incremento. A 2B continua aberta: request/claim/reserve/settle/commit, contabilidade durável, fontes/adoções, revogação e concorrência em SQL ainda são obrigatórios. Rollback mantém o núcleo fechado; nenhum perfil derivado libera clientes.


`public.work_executions`, `private.execution_input_snapshots` e `private.execution_manifests` formam um conjunto obrigatório na mesma transação. FKs compostas e validação de identidade impedem trocar organização, trabalho, principal, run, snapshot ou release. Tabelas imutáveis, RLS forçada, sem grants a cliente/worker/service_role. Auditoria mantém somente identificadores e operação. Não há produtor ou RPC novo.

O serializador da execução ganha versão própria com ordenação UTF-16 explícita, sem locale. Os bytes UTF-8 são preservados e seu SHA-256 conferido no banco; JSONB é projeção derivada. O loader recusa texto não canônico, hash/algoritmo incompatível e Unicode não preservável. `fingerprintJson` histórico e métodos publicados permanecem intactos; a versão anterior deste contrato ainda não possuía consumidor ou registros persistidos.

Migração 20260921230622 em produção e 20260921230303 em staging: SQL e catálogo idênticos, tabelas vazias, sem dados descartáveis em produção.

TRUST-APP-01/TRUST-AI-01/TRUST-SDLC-01: SQL negativo e round-trip real passam em staging com rollback; 12 testes novos de serialização passam. A prova SQL roda no job database e a prova TS/PostgreSQL no E2E da CI. Aplicação por ambiente, CI e deploy precisam de recibos antes do completion. Rollback conserva as tabelas vazias e fechadas; não desfaz histórico ou abre grants. Engenharia de execução assume 2B: comandos idempotentes, autoridade corrente, direitos fixados, lease e orçamento. `run_work_or_intake` deve ser ampliada explicitamente antes do novo request; não reutilizar o nome de conversa para execução substantiva. Etapa 17 segue aberta.

## Etapa 17, incremento 1: contrato fixado e validação no worker

Contrato aditivo em `packages/agent-contracts/src/execution-contract.ts` e binder em `apps/document-worker/src/pinned-execution.ts`. Identidade, audiência, método, insumos, ferramentas, efeitos, orçamento e tentativa são explícitos; snapshots são copiados/congelados, e dados não JSON ou com chave descartável pelo parser são recusados. Esgotamento é parcial e ferramentas/versões divergentes são negadas. Sem novo produtor, RPC, DDL ou ativação: a persistência e a revalidação SQL por tentativa são o incremento seguinte. A decomposição completa e os riscos estão em `docs/build/arcabouco/etapa-17-execucao.md`.

TRUST-APP-01/TRUST-AI-01/TRUST-SDLC-01: contrato não concede acesso e recibo local não substitui commit atômico. R01 e manifesto profissional v4 permanecem preservados. Revisão independente, CI e web/worker do incremento serão comprovados antes do completion; esta nota não os antecipa. Rollback preserva os consumidores atuais e a contenção dos nove scripts. Etapa 17 ainda não concluída, sem liberação para cliente real.

## Etapa 16: contenção dos avaliadores históricos

Os nove scripts manuais de avaliação que construíam adapters diretamente recebem uma barreira incondicional antes da construção real. Nenhuma chamada de provedor é necessária para a prova: regressões verificam o fluxo, aliases, ordem, condicional, captura do erro e construção direta. A religação com autoridade por tentativa é entrega explícita da etapa 17; suspensão não altera o método publicado nem libera execução para cliente. O ramo dry-run do baseline permanece antes da barreira, mas seu defeito preexistente de montagem da base fica registrado para correção na 17.

A autorização permanente do fundador está em `docs/build/arcabouco-stage0/FOUNDER-ACTS.md`: decisões técnicas dentro do roteiro cabem ao executor com revisão independente. TRUST-AI-01/TRUST-SDLC-01: contenção dos caminhos manuais sem autoridade de retenção; sem DDL, concessões, envio externo, gasto ou dados descartáveis. Rollback não pode reabrir os scripts diretos: manter a barreira ou substituir por transporte governado comprovado. CI, revisão e implantação deste incremento serão comprovadas no completion; esta nota não antecipa resultados.

## Etapa 16: autorização de processamento por conta, modelo e recurso

O gateway e a pesquisa pública consultam a autoridade do banco antes de cada tentativa, incluindo reparo e fallback. Atestados imutáveis identificam conta/projeto, versão de credencial, endpoint, região, modelos, recurso, finalidade, classe, direitos, treinamento e retenção por categoria. Desconhecido, revogado, vencido ou incompatível nega transmissão; cliente e worker não podem registrar atestados. A auditoria registra metadados de decisão, sem prompts, documentos ou segredos. Tabelas de eventos são append-only, com created_at e bloqueio de UPDATE/DELETE; não simulam atualização de fatos históricos.

As migrações 20260921155420 e 20260921155432 foram aplicadas em produção; staging registra 20260921152548 e 20260921154159, com SQL idêntico. Teste SQL transacional em staging passou, incluindo capability inválida, revogação de fonte e atestado, prazo de dependência e negativa de autoatestação. Catálogos conferidos: 2040 objetos em produção, 2101 em staging, sem divergência não conciliada. Security advisors: zero em ambos. Oito atestados operacionais reais foram instalados; condições e evidências estão em docs/security/provider-processing/2026-09-21. Sem dados descartáveis em produção.

O transporte fixa endpoint, rejeita redirecionamento e desativa retries internos dos SDKs. O deploy fixa versões de credenciais e falha se diferirem do vínculo revisado; o flag de planejamento preserva o overlay do repositório. A biblioteca de pesquisa publicada permanece byte a byte preservada e o manifesto v4 não muda. Testes do gateway, transporte e renderizador de deploy comprovam negativa sem envio. A compilação web passou após retirar o cache produzido na execução restrita. CI, merge e implantação do commit desta etapa ainda precisam de recibo no completion; esta nota não os antecipa.

TRUST-AI-01/TRUST-APP-01/TRUST-SDLC-01: classes e direitos derivam da autoridade do job, não de texto gerado. Risco e tratamento: Perplexity Search, Firecrawl Scrape e schema persistido OpenAI permanecem sem autorização demonstrada; pesquisa pública dispõe de OpenAI elegível e inferência estruturada dispõe de Anthropic elegível. Nenhum fallback herda condições do provedor anterior. Retenção zero segue como opção comercial futura. Revisar atestados na próxima onda ou mudança material, antes de 21/10/2026. Exceções legais e de segurança estão explícitas; retenção limitada não equivale a eliminação absoluta. Rollback operacional revoga atestados e mantém negação; não remove journal nem permite downgrade para imagem sem este controle. Execução v4 e requisitos profissionais da etapa 17 continuam desativados até seus próprios gates. Alarmes com destinatários permanecem na etapa 18.

## Etapa 15: autoria profissional aprovada e publicação governada

A versão 2026.09.21-v4 incorpora Narrativa, Template, Regra e Qualidade da biblioteca de expertise e as seis condições do fundador de 21/09/2026: nenhum vermelho; resíduo em lote com motivo; abertura calibrada da ficha 1 incorporada literalmente; sem base, enquadramento e resíduo em vez de critérios genéricos; cadastro e pesquisa antes do uso com exceção conceitual; parâmetros IOF, ANBIMA/B3 e tributação no registro versionado; nenhum travessão em texto entregue. Fórmulas, contratos financeiros, governança e permissões permanecem preservados. Os três parâmetros são required_missing, com fonte da exigência, data e responsável funcional: não são valores tributários aprovados. All-in permanece condicionado à revisão especializada e aos valores vigentes e aplicáveis.

O manifesto fixa a autoria compilada e as provas financeiras históricas. Revisão independente e ato humano específicos são evidências separadas; publicação usa os comandos operadores existentes, primeiro staging, depois produção. Esta nota descreve o escopo, não comprova o sucesso remoto: recibos de CI, implantação e publicação ficam no completion da etapa. Sem DDL ou dados descartáveis. TRUST-SDLC-01/TRUST-APP-01: o corpus não ativa execução nem atribui autoridade a texto. Rollback operacional retira a publicação por comando auditado; não reescreve versões.

Risco obrigatório da etapa 17, dono engenharia de execução: o adaptador anterior exige comparação mínima, limita o pedido a cinco no schema e a três no assessment/fila/RPC. Ele foi congelado, com versão e policyHash idênticos, em knowledge/legacy/capital-planning-compatibility-2026-09-20.md. Publicar a autoria nova não corrige nem certifica esse fluxo. A etapa 17 deve substituir o caminho inteiro e provar que sete ou mais pedidos residuais atravessam schema, assessment, fila, RPC e projeção sem perda, que base insuficiente não força alternativas, e que voz/cores/suficiência são gates reais. A tentativa parcial não foi publicada. Não ativar a versão v4 antes dessas provas. Seleção de métodos, memória/mercado, peças e teste do MD seguem como requisitos a implementar nos incrementos correspondentes, não resultados de testes já executados. Alarmes com destinatários pertencem à etapa 18.

## Etapa 15: candidata testada e revisão independente registrada

A revisão independente real e seus artefatos foram copiados literalmente para knowledge/reviews; o manifesto fixa o registro e a base de evidências. A candidata 2026.09.21-v3 passa a tested/ready_for_review, com26execuções atuais e21históricas preservadas. Isso permite avaliação técnica, sem task binding, capability ou aprovação do fundador. Autoria está preparada para a decisão profissional; aprovação humana e publicação auditada permanecem pendentes. TRUST-SDLC-01: hashes e negativas de promoção verificam que uma mudança de rótulo não substitui revisão, runs ou ato humano. Sem DDL, acesso, provedor ou execução nova. CI/produção e revalidação editorial final são gates; rollback conserva o método sem publicação. O check agregado dos recibos recebe30s para reexecutar21/26casos sob carga concorrente; não é SLA financeiro. O limite5s gerou timeout sem divergência de resultado. Asserções e recibos permanecem intactos; desempenho é medido separadamente.

## Etapa 15: integração contratual indexada v2

A candidata 2026.09.21-v3 usa prepareCapitalProcedurePacketV2. A preparação v2 recebe uma única descrição de contrato indexado, inventário por instrumento/série, termos completos ou lacunas nominadas, com anchors resolvidos por versão e localização. IPCA no slot legado é recusado sem conversão. O pacote mantém resultados separados e revisão pendente, exige contexto/horizonte e recusa duplicidade econômica entre envelopes da mesma alternativa. A reconciliação de covenants recompõe o fingerprint v2; recibos v1 não são aceitos como derivações v2. V1 e seus 21 registros históricos permanecem preservados; 26 novas execuções v2 foram registradas (9 gold,8 adversariais,9 consistência), sem modelos ou aprovação humana. TRUST-APP-01/TRUST-SDLC-01: fonte e interpretação não conferem autoridade; nenhuma alteração de RLS, DDL, retenção, provedor ou estado publicado. Revisão independente integrada, CI e produção ainda são gates pendentes; não declara F5 ou etapa 15 concluídos. Rollback retorna à candidata anterior ainda não publicada, preservando bloqueio de ativação.

## Etapa 15: núcleo de indexação com eventos e cortes separados

O achado F5 requer informação que o contrato anterior não carrega. O novo subpath indexed-contract-events implementa uma convenção explicitamente discreta: ciclos de índice e contagens ancorados, fator já incorporado na abertura, bases de juros e atualização, ordem de incidência e pagamentos, alocação na amortização e tratamento dos resíduos de arredondamento. Relatórios observam estados; não criam pagamentos nem alteram o estado econômico. Vinte e seis testes incluem dez gabaritos independentes, três convenções de juros, retomada, deflação, amortização, liquidação e invariância dos cortes. Nenhuma modalidade de mercado é presumida como padrão. O núcleo não substitui sozinho a integração antiga: F5 permanece aberto até o procedimento usar o novo contrato, identificar os termos ausentes e passar pela revalidação independente. Não há ativação, DDL, concessão ou chamada de modelo. TRUST-APP-01 e TRUST-SDLC-01: integridade financeira, versões, fontes e negação de termos incompletos. CI/produção serão registradas após gates reais. Versões históricas permanecem preservadas.

## Etapa 15: fixação das provas declaradas na composição

O achado F6 da revisão independente mostrou que a composição fixava harness e recibos, mas não os arquivos declarados em unit_test_files. O compilador v9 inclui os testes declarados na closure do executor correspondente e recusa caminhos fora do repositório. A candidata declara também as regressões de preparação, IPCA e precisão. Alterar um teste passa a alterar o hash do executor e do manifesto. Não modifica os snapshots publicados nem confere aprovação ao conteúdo. Sem DDL, direitos ou efeitos externos. TRUST-SDLC-01: prova e implementação ligadas aos mesmos bytes; validação e produção serão registradas após gates. F5 continua exigindo novo contrato de indexação antes da publicação.

## Etapa 15: correção de IPCA encontrada pela revisão independente

A revisão independente reproduziu duas falhas no executor contratual v8: pro rata positivo com números-índice acessava uma curva mensal ausente; antes do aniversário, cobertura/aplicação podiam usar mês diferente do trace. O caminho v8 passa a resolver a variação por uma única fonte e usar o mesmo mês na cobertura, trace e aplicação. O comportamento v7 permanece preservado; nenhuma convenção financeira nova é presumida. Dez regressões cobrem gabarito independente, capitalização/pagamento, equivalência NI/taxa mensal, datas antes/no/depois do aniversário e ausência do mês necessário, precisão de 16 casas e amortização acima do saldo. A saída v8 conserva a precisão das camadas contratuais e recusa amortização impossível; v7 mantém sua serialização e comportamento. O primeiro gabarito de pagamento do autor foi corrigido para respeitar o arredondamento declarado do fator antes do montante; os logs anteriores permanecem preservados. Sem DDL, concessões, chamadas de provedor ou dados descartáveis em produção. TRUST-APP-01 e TRUST-SDLC-01: integridade de cálculo, fonte rastreável e regressões. CI, implantação e revalidação independente serão registradas após os respectivos gates. A revisão também identificou dupla contagem entre cortes de relatório e falta de fixação dos testes declarados: são correções separadas ainda obrigatórias antes da publicação. A solução geral da indexação exige contrato explícito de base, acumulação e liquidação, sem presumir que corte de relatório seja evento contratual. O método continua candidato, sem aprovação humana ou ativação; rollback reverte este incremento e mantém o bloqueio de publicação.

## Etapa 15: recuperação de transação abortada de artefato em validação

O run 35559883152 bloqueou o pacote: a gravação do artefato sofreu deadlock e a jornada só passou no retry. O worker passa a repetir exclusivamente a RPC `worker_record_capital_project_artifact` quando PostgreSQL devolve `40P01`, que confirma aborto da transação. São no máximo três tentativas, com espera curta variável, os mesmos argumentos e nova verificação no banco de capability, lease, dependências e estado. Não repete tarefa, cálculo ou chamada de modelo; erros de acesso, conflito semântico `40001`, unicidade e rede incerta continuam fatais. Onze casos de regressão cobrem recuperação, limite e negativas. A prova de CI e produção ainda é requisito; isto não comprova eliminação do ciclo de locks. Sem DDL, nova permissão, alteração de retenção ou fixture em produção. TRUST-APP-01 e TRUST-OPS-03: autoridade permanece no banco; rollback reverte somente o tratamento de `40P01`. O gate continua recusando flaky.

## Etapa15: sincronização da prova E2E de adoção de método

O run35555393424 revelou uma corrida no teste: o status genérico de sucesso da publicação era lido antes do término da adoção, antecipando a consulta SQL. O teste agora exige a indicação específica do vínculo adotado, retornada pelo servidor, antes de conferir o banco. Mantém as asserções de autorização, histórico e persistência, sem sleeps ou relaxamento de gate. A verificação da correção na CI e produção permanece requisito de fechamento. A CI também reprova execuções flaky com failOnFlakyTests; o retry conserva diagnóstico, sem tornar o gate verde. Sem DDL ou alteração de produto.

## Etapa15: matemática contratual no núcleo financeiro em preparação

Juros/indexação e reconciliação de covenants passam a financial-core, com reexports legados. Fórmulas, schemas, traces e versões são preservados;21 casos registrados reproduzem os mesmos fingerprints. Dois testes novos proíbem cálculo duplicado no playbook e dependência reversa. CI e produção serão registradas após gates reais; nenhuma publicação ou ativação de método.

## Etapa15: avaliações determinísticas registradas em preparação

Sete casos gold, oito adversariais e seis de consistência executam o pacote integrado e guardam expectativas, observações e fingerprints reproduzidos pelos testes. Três testes novos verificam registros e recusa de adulteração. Candidata permanece sem revisão independente, aprovação de conteúdo ou publicação. CI e produção serão registradas no completion após gates reais;16 autorizada somente após fechamento15.

## Etapa15: composição profissional integrada em preparação

O documento canônico vincula o pacote contratual/de decisão e seis fontes verificáveis de testes/fixtures. Fontes não são runs ou aprovação. Três novos testes e seis regressões de autoria verificam identidade, evidências e ausência de promoção; gates finais serão registrados no completion após publicação. Sem DDL, sem ativação e R01 preservado. Runs finais, revisão independente real, aprovação profissional e publicação auditada continuam na15. A16 foi autorizada pelo fundador para depois do fechamento15. Detalhe: docs/build/arcabouco/etapa-15-composicao-profissional.md.

## Etapa15: pacote integrado do procedimento (2026-09-20)

A entrega recompõe a decisão e a preparação contratual sob o mesmo contexto. Liga índices
às contribuições adotadas com recibos explícitos e conserva divergência. Cronogramas de
juros não são confundidos com principal ou fluxo de caixa; revisão da ligação permanece
visível. Termos omitidos são recusados antes de qualquer default do schema. Onze casos
novos e14 regressões; contrato integral registrado, compilador v6. Sem DDL ou ativação.
Gates/produção no completion; autoria final, revisão independente e publicação seguem na15.

## Etapa15: vínculo entre contrato e adoção (2026-09-20)

O adaptador recompõe a preparação contratual e o índice adotado. Confere contexto, LTM,
definições versionadas, âncoras e recibos de derivação; igualdade numérica isolada não basta.
Divergência conserva os dois valores, hipótese conserva seu estado e dados conhecidos não
somem por outra lacuna. Quinze testes novos cobrem vínculos, precisão, datas e forja.
Sem DDL, leitura autorizada presumida ou adoção automática. Gates/produção no completion;
integração final, revisão independente e publicação continuam na15.

## Etapa15: registro e saída da preparação contratual (2026-09-20)

Toda a saída da preparação contratual é validada: fontes, convenções, cenários, cálculos
e lacunas. Contratos gerados e registro de engenharia fixam schemas reais e fontes
transitivas. Seis casos novos conferem bytes, execução e forja; quatorze casos de preparação
continuam. Compilador corrente v2026.09.20-v5; R01 preservado. Sem DDL, adoção, publicação
ou ativação. Gates/produção no completion; autoria integrada e revisão continuam na15.

## Etapa15: mapas tipados para curvas contratuais (2026-09-20)

Contratos representam valores por período/mês com tipo recursivo explícito; continuam
proibidos objetos opacos e chaves de protótipo. Seis testes novos conferem a projeção e
os limites: o schema integral valida formatos de chave, refinamentos e convenções.
Compilador corrente v2026.09.20-v4; R01 preservado. Sem DDL, acesso ou publicação.
Gates/produção exigem prova no completion. Integração final e revisão seguem na15.

## Etapa15: composição contratual e ordem dos eventos (2026-09-20)

Juros/indexação e covenants são compostos como contribuições candidatas com fontes e versões.
Nenhum default legado pode preencher silenciosamente um termo. Perímetro, moeda e data
são conferidos. Entrada v8 exige convenção de eventos simultâneos e suporta números índice
na indexação posicionada; v7 preservada. Quinze testes novos e onze casos legados cobrem
números e recusas. Sem DDL ou adoção automática. Revisão independente, adoção vinculada,
conteúdo final e publicação continuam na15. Gates/produção precisam de prova no completion.

## Etapa15: adaptador canônico e medição de artefato (2026-09-20)

A política do mapa direcional existente sai da string do worker e passa a um bloco compilado
do procedimento canônico. Famílias e regras preservadas; hash vinculado ao contexto, cache
e inputs. Nove testes novos verificam geração, autoridade, persistência e relógio; quatro
contrafactuais de perfil continuam. Duração começa no worker e termina no artefato persistido;
fila e navegador ficam explícitos fora da medida. Sem DDL, novo provedor ou ativação.
Gates e produção exigem prova no completion; revisão e publicação profissional seguem na15.

## Etapa15: candidata profissional e contrato de saída alinhados (2026-09-20)

A candidata2026.09.20-v1 incorpora critérios profissionais, fórmulas implementadas, casos
unitários reais e o componente de entrega registrado. Outputs corresponde aos nomes/tipos
do executor, incluindo null e nullable; seis testes novos verificam alinhamento e ausência
de aprovação/ativação. Compiladores correntes versionados; R01 preservado. Ainda incompleta:
contratos/cláusulas, avaliação integrada, revisão independente, adaptador medido e ato do
fundador. Nada disso é fabricado pelo texto. Sem DDL, task liberada ou provedor novo.
Check/CI/produção precisam de prova no completion. Continuidade da15, não próxima onda.

## Etapa15: contratos do executor derivados dos schemas reais (2026-09-20)

A geração usa os schemas efetivos de entrada e saída de prepareCapitalDecisionDelivery,
incluindo null/variantes/ausência. O registro é da engenharia, não autorreferência da autoria.
Compilador v2026.09.20-v2 fixa fechamento transitivo, contrato e gerador; mudança de contrato
ou export inventado é negada. Dez testes novos entre playbook e model; validação semântica
permanece no executor, com schema JSON integral fixado. Não publica ou ativa candidato.
Sem DDL/provedor/acesso. Gates e produção precisam de prova no completion; autoria na15.

## Etapa15: entrega estruturada da decisão (2026-09-20)

`prepareCapitalDecisionDelivery` recalcula a revisão e produz contrato tipado para a entrega:
alternativas, sensibilidades, caixa/dívida, condições, índices, referências, lacunas e proveniência.
Nove testes novos verificam ausência, números, condição, material solicitado, restrição,
covenant adverso e reprodução. Material não é publicado; recomendação não vira decisão.
Inputs e manifesto precisam ser conservados pelo executor17 para reprodução a partir dos
fingerprints. Sem DDL, nova rota ou provedor. Autoria/revisão profissional seguem na15.
Gates e implantação exata serão registrados no completion.

## Etapa15: leitura de evidências Git em lotes limitados (2026-09-20)

O limite de5s voltou a falhar no negativo capturedAt da CI da composição financeira. A PR
financeira ficou bloqueada. Leitura Git agora usa metadados e lotes de blobs com até20MiB de
conteúdo; hashes são conferidos por registro, sem cache de autoridade. Quatro testes novos
cobrem binário/vazio, tamanho/tipo/ausência, injeção e árvore de trabalho alterada. Os94 testes
do inventário permanecem;209governancePASS isolados em7,76s. Contrato em etapa-15-leitura-git-lotes.md.
Sem DDL, novos acessos ou relaxamento de gates. CI/produção ainda exigem prova no completion.

## Etapa15: valores nulos e variantes nos contratos (2026-09-20)

O vocabulário do compilador distingue campo ausente de valor nulo e permite alternativas
recursivamente tipadas, incluindo dados com campo `id`. Identidades dos componentes mantêm
as restrições anteriores. Nove testes novos cobrem formatos reais, duplicatas, campos inseguros
e compatibilidade; contratos legados mantêm seus hashes. Compilador corrente v2026.09.20-v1,
sem modificar fontes publicadas R01. Não publica nem autoriza execução. Gate completo, CI e
produção são registrados no completion. Vínculo dos executores reais segue na etapa15.

## Etapa15: composição da revisão da decisão (2026-09-20)

`prepareCapitalDecisionReview` recalcula comparação e índices definidos, associa condições
à base da alternativa e examina referências de mercado por data/contexto/origem. Integra
credit-analysis (suficiência), deal-structure (condições), instrument-catalogue (identidade)
e market-reference (metadados elegíveis), sem ranking/default financeiro legado. Quatorze
testes novos, model261PASS. Referência não prova oferta; revisão proposta não aprova método.
Contrato em etapa-15-revisao-decisao.md. Sem DDL ou acesso novo. Gate completo, CI e produção
precisam ser registrados no completion. Autoria e adaptador seguem na15; direitos vivos na17.

## Etapa15: índice definido ligado às adoções (2026-09-20)

`calculateAdoptedDefinedRatio` exige adoções de numerador, denominador, limite, comparador e
convenção. Preserva definições/períodos e rejeita dado gerencial reclassificado como contratual.
Moeda/escala são explícitas; referência ausente não vira limite padrão. Quinze casos novos,
model247PASS, mantêm hipótese/origem/dependências. Contrato em etapa-15-indice-adotado.md.
Sem DDL, execução ou declaração de compliance. Revisão de componentes e aplicabilidade segue
na15; autorização/revogação na17. Gate completo, CI e produção ainda exigem prova no completion.

## Etapa15: limite explícito para índice definido (2026-09-20)

`evaluateDefinedRatio`, núcleo v24, separa comparadores estritos/inclusivos e decide por
produtos cruzados sem arredondamento. Quociente/margem exibidos em18 casas não decidem a
fronteira. Denominador não positivo ou operando ausente impede conclusão. Oito testes,
core225PASS. Não certifica cumprimento contratual; adoção/definição e revisão pertencem à
composição15. R01 preservado. Contrato em etapa-15-limite-definido.md; sem DDL ou acesso novo.
CI, produção e gate completo ainda são necessários para fechar o incremento.

## Etapa15: comparação de alternativas calculadas (2026-09-20)

`composeCapitalStructureDecision` recalcula alternativas e sensibilidades sob a mesma base,
abertura histórica e períodos. Cenário sem mudança de operando vira lacuna; recomendação é
julgamento proposto com referências, condições e fatos que a mudariam. Sem ranking. Onze
testes novos, model232PASS; framing sem companhia, ausências, aberturas, escopo e reprodução.
Contrato em `docs/build/arcabouco/etapa-15-comparacao-calculada.md`. Sem DDL ou publicação.
Revisão contratual/mercado, autoria e integração continuam na15. CI e produção precisam ser
comprovadas no completion antes de encerrar o incremento.

## Etapa15: custos adotados na composição financeira em validação

## Etapa15: composição do caixa sob base única (2026-09-20)

`calculateAdoptedCapitalPeriodCash` une operação, dívida/encargos e movimentos de capital sob
um envelope imutável. Conta operacional, inventário de capital e eventual ausência de dívida
são adoções. Recusa bases/contextos divergentes, mistura de orçamento com caixa operacional
direto, reutilização de observação e override de resultado. Aportes não viram receita ou dívida.
Dezoito casos novos, model221PASS, conservam origem/hipótese/dependência por período. Sem DDL,
acesso novo ou publicação. Check completo/CI/produção aguardam integração do reparo do gate de
evidências; ainda não é incremento pronto. Contrato em etapa-15-caixa-adotado.md. Comparação
de alternativas, revisão e autoria continuam na15; revalidação do executor na17.

## Etapa15: caixa e dívida por períodos comparáveis (2026-09-20)

`buildCapitalPeriodCash` recompõe operação e financiamento a partir de operandos, mantendo
caixa disponível/restrito separados e dívida em cada fechamento. Datas/moeda/horizonte devem
coincidir; dívida sem saldo na data requerida é recusada, sem interpolação. Financiamento
inexistente exige declaração explícita; custos ou caixa inicial desconhecidos impedem saldo
conclusivo. Mínimos medidos na abertura/fechamentos não comprovam liquidez diária. Dívida
residual e custo nominal no horizonte ficam visíveis; nenhum resultado é rotulado custo de
vida inteira. Quinze casos novos,core217PASS; núcleo v23 e manifesto corrente, R01 preservado.
Sem DDL, acesso novo ou publicação profissional. Check/CI/produção comprovados no completion
externo; integração sob adoções, comparação e conteúdo completo seguem na15.

## Etapa15: projeção operacional sob adoções (2026-09-20)

`calculateAdoptedOperatingProjection` conecta o orçamento ao envelope de adoções, sem valores
livres. Convenções, abertura histórica, séries de giro/receita/despesas/tributos/capex e
interpretações mantêm definição, origem e cenário. Quantidade exige unidade explícita; valores
monetários usam a representação adotada. Receita por valor e por drivers são excludentes e
exigem convenção adotada correspondente. Ausência deixa lacuna e impede resultado, nunca
preenche zero. Dezenove casos novos; contrato em `etapa-15-projecao-adotada.md`. Sem DDL ou
autorização; dependências acompanham cada período. Check/CI/produção são gates reais, com
completion externo. Composição das alternativas segue na15; revalidação de direitos na17.

## Etapa15: projeção operacional por períodos (2026-09-20)

Motor `buildOperatingCashProjection` no financial-core v22, registro
`financial.operating_cash_projection`: receita por valor ou quantidade/preço líquido, despesas
variáveis/fixas, ponte explícita não monetária, estoques de giro, tributos pagos/restituídos e
capex manutenção/expansão. EBITDA não vira caixa sem a ponte; períodos contíguos, datas reais e
operandos completos obrigatórios. Conserva valores negativos, precisão exata e trace imutável.
Doze casos independentes: caixa20, liberação de giro, caixa negativo, restituição, ausência,
convenções/datas inválidas, ano bissexto, reprodução e isolamento Decimal. Core202 testes PASS.
Manifesto corrente regenerado; R01 preservado. Sem DDL, autorização, rota, dado sintético em
produção ou publicação profissional. Check/CI/implantação são gates do incremento; completion
externo registra o resultado real. Integração às adoções e alternativas segue na15. Não é
liquidez intraperíodo nem CFADS contratual; giro por dias exige hipótese adotada própria.

## Etapa15: resolução limitada de evidências do gate (2026-09-20)

Após recorrência de timeout local e três timeouts na CI da projeção operacional, o resolvedor
do inventário consulta até4 objetosGit por vez, deduplicando apenas a leitura do mesmo objeto
na mesma avaliação. Cada evidência conserva sua verificação de hash; erros seguem bloqueando.
Sem cache entre avaliações, sem aceitar dados fornecidos por chamador, sem ampliar timeout ou
remover teste. Retém somente resumo de bytes/hash, não todos os buffers. Teste novo verifica
dois registros com o mesmo objeto e hashes esperados distintos.
94casos do inventário PASS em24,43s, contra93em62,96s na execução isolada anterior; comparação
observada, não promessa de desempenho. Gate integral, CI e produção exigidos no completion.
Sem DDL, privilégios, nova confiança, telemetria ou alteração de métodos publicados.

Novo `calculateAdoptedFinancingLiquidity` liga inventário de custos, convenção de liberação e
séries tipadas às contribuições do trabalho. Recalcula com encargos retidos/pagos/capitalizados;
conserva originais, normalização, definições, contexto e dependências. Ausência de taxa, data,
custo ou representação impede composição; zero/não aplicável são declarações explícitas.
Resolução de operandos extraída para `adopted-debt-inputs.ts`, reutilizada sem duplicar a
matemática ou executar primeiro um cronograma que ignore encargos financiados.

20 casos novos na composição, incluindo integração de escala e amortização de custos financiados.
Gates efetivos serão registrados no completion externo. Sem DDL, nova rota, mudança de acesso ou
publicação profissional; R01 preservado. Detalhes em `docs/build/arcabouco/etapa-15-custos-adotados.md`.
Continuar na15 com projeções, comparação, conteúdo e primeira resposta útil; execução17,
operação18 e preservação19. Não parar a cada incremento nem presumir aprovação de conteúdo.

## Etapa15: representação numérica adotada em validação

Novo `normalizeCurrencyRepresentation` no financial-core e `resolveAdoptedCurrencyValues`
no financial-model. Uma interpretação adotada declara modo e membros exatos de um lote,
sem conversão manual número por número. Distingue valor reportado em escala declarada de valor
já em unidades. Mantém envelope original, contribuições e traces; sem prova da representação,
valor não unitário gera lacuna e impede resultado composto. `calculateAdoptedDebtLiquidity`
passa ao contrato v2 e inclui as dependências da interpretação. Outros adaptadores mantêm a
negação de escala não unitária até integração própria; não recebem conversão por suposição.

21 casos novos (5 núcleo,16 adoção) cobrem cálculo, lote, origem, contexto, séries e negação;
check integral PASS (44 tarefas), financial-core190 e financial-model164. CI e produção
serão comprovadas no completion externo. Sem DDL, nova rota ou publicação.
Motor corrente v21; R01 imutável. Detalhes em `docs/build/arcabouco/etapa-15-representacao-numerica.md`.
Custos, projeções/comparação, conteúdo e aprovação continuam na15; execução17, operação18,
preservação19. Pedido vigente autoriza seguir até concluir a15, sem parar a cada incremento.

## Etapa 15: custos de financiamento por data em validação

Novo motor `buildFinancingCashFlows` em `packages/financial-core/src/financing-costs.ts`,
registrado como `financial.financing_cash_flows`, motor corrente v20. Recalcula dívida com
encargos financiados e separa liberação bruta, retenção, pagamento em caixa e capitalização.
Exige avaliação explícita de originação, recorrência, tributo e outros para cada instrumento;
zero, não aplicável e desconhecido não se confundem. Custo desconhecido impede total composto.
Sem taxa fiscal presumida, anualização, nova rota, DDL ou publicação profissional. R01 intacto.

16 casos novos PASS (financial-core185). Check integral PASS (44 tarefas). CI, merge e produção serão registrados
no completion externo após execução efetiva. Contrato em
`docs/build/arcabouco/etapa-15-custos-financiamento.md`. Etapa15 inteira aberta: seguir os
incrementos autorizados até os gates técnicos e revisão profissional, sem parar em cada PR.
Aprovação do conteúdo é ato separado antes de publicar o procedimento completo.

O incremento anterior (PR681, main5196a585) foi concluído com Quality35521957830,
Security35521957788 e worker35521999066 PASS, Vercel6554855519 e ECS385 no mesmo commit.
36 jornadas aprovadas sem intermitência, nove originais locais preservados por hash.

## Etapa 15: composição de dívida e caixa sob parâmetros adotados

`calculateAdoptedDebtLiquidity` valida contexto/definições e recalcula os movimentos pelos motores
existentes. Séries tipadas conservam fontes e versões sem adoção por parcela; datas e convenções
são adotadas, não inferidas. Caixa direto exclui agregados de dívida e ajustes de giro duplicados.
Lacunas essenciais impedem resultado composto; custos de financiamento continuam explicitamente
fora. Sem DDL, nova rota, concessão de acesso ou publicação profissional; R01 preservado.

20 testes novos cobrem composição, origem, contexto, duplicação, ausência e reprodução. Três
regressões dos adaptadores anteriores agora recusam escala não unitária: o leitor não prova
normalização numérica, e não é seguro multiplicar ou ignorar escala por suposição. Check local
integral PASS (44 tarefas; financial-model148). Esta é a candidata; o completion externo reúne os gates reais, merge e comprovação de web/worker no mesmo
commit. A etapa 15 inteira permanece aberta. Contrato e riscos em
`docs/build/arcabouco/etapa-15-adocoes-divida.md`.

O incremento anterior de dívida datada foi concluído na PR 680, main `7a1b5ec22988`, com CI,
web e worker verificados. Não repetir. Blocos anteriores abaixo registram candidatas históricas.

## Etapa 15: projeção dos movimentos de dívida por data

Novo contrato aditivo `buildDatedDebtCashFlows` em `packages/financial-core/src/dated-debt.ts`:
recalcula a dívida a partir de operandos, fixa uma convenção temporal explícita e separa os
movimentos pagos da capitalização. Mantém sinal, conta, moeda, saldo residual, cópia dos
operandos e identidade de cada componente. Motor corrente `2026.09.20-v19`; R01 preservado.
Não é CET nem previsão completa. Sem DDL, rota, concessão de acesso ou publicação de método.

Check local integral aprovado: 44 tarefas, 15 testes novos (169 no motor). CI/merge/produção
serão comprovados no completion externo.
A etapa 15 permanece aberta. Próximos incrementos: adaptação às adoções autorizadas, composição
de projeções/custos e aprovação profissional. Detalhes, testes e riscos atribuídos em
`docs/build/arcabouco/etapa-15-divida-datada.md`.

A pré-condição de sincronização foi efetivamente concluída na PR 679, main `c037b6db965e`,
com CI e web/worker conferidos. Os blocos anteriores abaixo são registros históricos de candidatas.

## Etapa 15: sincronização da jornada de contribuições em validação

`apps/web/e2e/work-contributions.spec.ts` reproduz a leitura antecipada segurando a
requisição real de publicação antes do servidor: o leitor termina sua consulta e não há
revisão promovida no banco. Após liberar a requisição, exige publicação observável no
canal compartilhado do autor, nova consulta do leitor e exatamente uma revisão persistida.
A mesma espera protege a ordem do conflito (A publicado antes de B) e a consulta ao histórico.
Sem respostas simuladas, sleep, aumento de timeout ou retry neste teste.

Check local integral aprovado (44 tarefas); descoberta Playwright e tipagem aprovadas.
O risco identificado antes da integração da comparação na 15 será encerrado apenas após
esta reprodução e a jornada completa passarem na CI, com merge e produção verificados.
Sem alteração funcional, DDL, política, rota, método publicado ou concessão de acesso.
R01 permanece preservado; a etapa 15 e a composição financeira continuam abertas.
Detalhes: `docs/build/arcabouco/etapa-15-compartilhamento.md`.

## Etapa 15: liquidez por datas em validação

Motor aditivo `buildLiquidityCalendar`, registrado como `financial.dated_liquidity`, e
adaptador `calculateAdoptedLiquidityCalendar`: identidade de caixa por data efetiva, saldos
disponível/restrito separados, ausência propagada e contribuições rastreáveis. Convenção
explícita de saldo ao fim do dia; não prova liquidez intradiária nem ajusta dias úteis.
Motor corrente `2026.09.20-v18`; R01 publicado preservado.

23 testes novos e check integral (44 tarefas) aprovados; CI, merge e produção pendentes
nesta candidata. Sem DDL, nova rota ou publicação de procedimento. A etapa 15 continua aberta.
Detalhes e riscos: `docs/build/arcabouco/etapa-15-liquidez.md`; completion externo registra
os comprovantes finais. A intermitência de contribuição compartilhada permanece atribuída
à integração da etapa 15, antes de ligar a comparação ao trabalho persistente.

## Etapa 15: contrato da base de comparação em validação

Incremento aditivo `capital-structure-decision.ts`: organiza alternativas em uma base imutável,
com contexto, objetivos, horizonte, cenários, definições, hipóteses e lacunas. Recusa valores de
outro perímetro, período ou definição e não escolhe vencedor por ranking. Comparabilidade da
base não equivale a recomendação, projeção calculada ou covenant cumprido. Sem entidade ou
projeção ainda devolve enquadramento; ausência não vira zero.

Testes dirigidos do contrato aprovados (17 casos). Check integral aprovado (44 tarefas); CI, merge e produção
pendentes nesta candidata; evidência final no completion externo. Nenhum DDL, rota nova,
privilégio, chamada de modelo ou publicação de procedimento. R01 permanece fixado.
Detalhes: `docs/build/arcabouco/etapa-15-comparacao.md`. A etapa 15 inteira permanece aberta.

## Etapa 15: primeiro incremento financeiro em validação

Baseline `83c58704eae04b1a4b9d03501bf5b60d1a004942`; isolamento publicado já entregue.
A quitação integral do motor de dívida passa a incluir o cupom capitalizado do período,
sem deixar saldo residual nem cobrar duas vezes os juros anteriores. A convenção de saldo
médio continua baseada no principal amortizado antes da capitalização do cupom corrente;
não se apresenta como cálculo por datas. A planilha editável usa a mesma separação sem ciclo.
Valores não finitos de principal, captação e amortização são recusados. Motor corrente
versionado `2026.09.19-v17`; R01 permanece sob manifesto e artefato publicados imutáveis.

Sete regressões do motor falharam antes e passaram após a correção; planilhas cobrem as três
bases de cupom e os dois tratamentos. Check integral local aprovado (44 tarefas); CI e deploy pendentes nesta candidata.
Não há DDL, nova fonte de dados, chamada de modelo, aprovação de conteúdo ou publicação de
procedimento. O manifesto de autoria é regenerado; o registro e snapshot R01 não mudam.

Este incremento não conclui a etapa 15. Restam comparação de alternativas, fontes/adoções,
calendário de liquidez, sensibilidades, instrumento/preço governados, autoria completa,
tempo até primeira resposta útil e publicação técnica sob aprovação real do conteúdo.
Riscos: convenções financeiras explícitas e evidência na 15; retenção na 16; contrato de
execução na 17; operação/alarmes na 18; auditoria na 22. Sem antecipar Temporal ou ensaios.
A evidência final de CI, merge e produção será registrada no completion externo do incremento.

## Isolamento dos métodos publicados entregue

PR 669 integrada em `a876965d57204e88357fe379364efb0b0e04a21d`. Quality 35466622840,
Security 35466622837 e worker 35466622827 de main aprovados. Vercel Production 6545212971
e ECS 378 no commit exato, 1/1, 87 sinais recentes de polling saudável, sem bloqueios ou atraso.

O manifesto R01 permanece `17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090`.
O executor é reconstruído das fontes fixadas, incluindo schemas e dependências, e carregado
pelos dois consumidores do worker somente após verificação do artefato. Adição independente
no pacote de cálculos e mudança do compilador de autoria não reescrevem a versão publicada.
Quinze testes novos, recusa adicional de release substituído, 29 casos de referência exatos
e jornada R01 completa passaram. Staging passou pin, publicação e direitos com rollback.

Não há DDL nem migração; journals mantêm 357/371 versões. Manifesto, aprovação e liberação
R01 estão iguais nos ambientes. Nenhum dado descartável ou chamada a modelo em produção.
O inventário fixa 205 evidências e preserva as 18 lacunas gerais; a conciliação incorpora dez
provas novas. O completion externo registra também a implantação desta conciliação.

Correção prévia autorizada, complementando a 13 e antecipando somente o isolamento da 17.
Etapa 15 pode retomar sob o OK existente; conteúdo profissional ainda exige aprovação humana
específica. Dependências preservadas exigem versão nova para correção material. Execução na
17, operação e destinatários de alarmes na 18, retenção na 16 e auditoria na 22 permanecem
nos incrementos correspondentes. Temporal e contrato universal não foram antecipados.

## Etapa 14: correção do ingresso de métodos-base entregue

PR 667 entregue em `f89b224bbab1f7caf363bd968e500ee63073952b`; main Quality 35460897286, Security 35460897279 e worker 35460897290 aprovados. Web Vercel 6544182973 e ECS 376 no commit exato, 1/1 e polling saudável.

A abertura da 15 encontrou uma omissão do fechamento anterior: a 14 importava R01 e publicava
composições da casa, mas não registrava novos métodos-base. A correção autorizada entrega
candidata, revisão técnica, aprovação humana, publicação e retirada por comandos privados.
A ferramenta fixa bytes de main; cliente e worker não recebem autoridade global. Publicar
corpus não ativa execução. O operador confere o ato humano original; nome em payload não
autentica uma pessoa. R01 conserva manifesto e aprovação.

96 contratos SQL passaram em staging. Oito testes de preparação e o check integral passaram.
CI reconstruiu o banco, passou as jornadas e comprovou publicação concorrente em duas sessões.
Três migrações têm SQL idêntico nos journals; 357 arquivos têm carimbo em produção. Quinze
superfícies novas conciliadas, oito definições de função iguais, advisors de segurança zero.
Nenhuma candidata, atestação ou publicação foi inserida em produção. Nove arquivos do fundador
foram preservados fora desta mudança.

O inventário de fechamento exige 195 evidências, oito novas obrigatórias, mantendo as 18
lacunas gerais. O completion externo registra também a implantação desta conciliação.
A etapa 15 pode retomar sob o OK já dado; publicar conteúdo profissional continua exigindo
aprovação específica do fundador. Retenção na 16, execução/continuidade em 17/18, alarmes na
18 e auditoria integral na 22 continuam nos incrementos correspondentes. Etapas 16 em diante
não iniciadas. O roteiro e os atos do fundador não foram ampliados.

## Etapa 13: conciliação da entrega da onda 12

PR 661 entregue em `80ff92054531884d85096d0ee8debd5d867aed79`; main Quality 35441709470, Security 35441709492 e worker 35441709491 aprovados. Web Vercel 6540634817 e ECS 370 no commit exato, 1/1 e polling saudável.

Contratos de seis tipos de componente, compilador reproduzível e manifesto gerado foram
entregues. O worker valida a proveniência além dos gates de liberação anteriores. Os onze
procedimentos legados continuam legíveis; R01 mantém fonte, aprovação e resultado. Estrutura
de capital continua candidata incompleta, sem nova autorização de execução ou publicação.

O CodeQL identificou backtracking no parser inicial. A varredura linear e a regressão de
50 mil repetições corrigiram o achado; o check do commit corrigido não registrou alerta novo.
O check local integral e a CI da implementação passaram. Não há DDL, migração ou backfill;
350 arquivos têm carimbo no journal de produção, e staging conserva seus 364 registros.

O inventário de fechamento fixa 174 evidências, dez novas obrigatórias, e preserva as 18
lacunas gerais. O completion externo registra CI e deploy deste commit de conciliação.
Publicação/composição de método (14), autoria profissional (15), retenção (16), execução e
continuidade (17/18), notificações (18) e auditoria integral (22) permanecem nos incrementos
correspondentes. Corrigida a referência anterior que atribuía auditoria à 23: a 23 retira
caminhos legados, conforme o ROADMAP. Etapa 14 não iniciada, exige novo OK.

## Etapa 12: entrega e reconciliação da onda 11

PR 658 mesclada em `14c6e54b2d49b7af8f0da88ffa27591295a2f188`. Main Quality
35342395648, Security 35342395706 e worker 35342395711 passaram. Vercel Production
6523814267 e ECS 367 executam esse commit: 1/1 tarefa saudável, sem bloqueios ou atraso.
Cofre com revisão humana exata, versões, direitos herdados, retirada e designação no produto.
Cinco migrações conciliadas; 350 arquivos de main com carimbo em produção. 92 contratos SQL
em staging e jornada de duas pessoas na CI. Capturas desktop/mobile inspecionadas.

O inventário de fechamento reancora 164 evidências na entrega observada e preserva 18 lacunas.
Os callbacks de redação/estrutura negam contexto da casa sem publicação humana; cálculos
independentes são preservados. Riscos de execução/revogação permanecem nas etapas 17/18,
retenção na 16, destino de alarmes na 18 e auditoria integral na 23. Esta conciliação não
inicia a etapa 13; sua implantação final e completion ficam registrados no recibo da onda.

## Onda 11: etapa 12 autorizada

Cofre com publicação exclusivamente humana. Baseline `b5317a4d3760`; inventário de abertura
renovado em `docs/security/INVENTORY_WAVE_11_REVIEW.md`, com 150 evidências e 18 lacunas
preservadas. Implementação e gates da etapa 12 ainda pendentes. Marco visível de revisão e
publicação com escopo e finalidade fixados; etapa 13 não iniciada.

## Etapa 11: conciliação da entrega da onda 10

PR 655 entregue em `cad8990f3cd10958a05d28cb2c7fd54da9c182b2`; main Quality 35296301221, Security 35296301200 e worker 35296319659 passaram. Vercel Production 6515711334 e ECS 364 executam o commit exato.
Participação usa grants canônicos; canais pessoais, autoria explícita, revisões imutáveis e
compartilhamento humano preservam as restrições das fontes. Cinco migrações estão nos dois
ambientes, com SQL idêntico por nome e 16 funções conciliadas. 87 contratos SQL e o teste de
duas conexões concorrentes passaram. A jornada de duas pessoas verifica privacidade,
comparação de três versões, reapresentação com linhagem, histórico e revogação na interface.

150 evidências sustentam o inventário, incluindo nove novas com teste de omissão. As 18 lacunas
gerais conservam severidade e incremento responsável. Provas em `docs/build/arcabouco/etapa-11.md`
e `docs/security/history/wave-10-final-review.md`. O completion externo registra também CI e
implantação deste commit de conciliação. Nenhum dado descartável foi criado em produção.
A etapa 12 exige novo OK do fundador.

## Etapa 10: conciliação da entrega em 17/09/2026

PR 652 entregue em `4e6b84d9c4701df24b9fb2e9ea74264df121336b`; main Quality 35279877963, Security 35279878009 e worker 35279936974 passaram. Vercel Production 6513024337 e ECS 361 executam o commit exato.
As PRs 650 e 651 publicaram primeiro o consumidor e depois a entrada compatível. As cinco
migrações da etapa estão aplicadas em staging e produção, com SQL idêntico por nome e 52
definições de função iguais na reconferência ao vivo. Os 85
contratos SQL passaram no schema instalado e no replay da CI. A jornada E2E verifica contexto,
vínculo de dois dossiês, reabertura após login e novo processo, upload posterior e histórico
visível sob a mesma identidade, incluindo celular. Não houve fixtures em produção.

Conversa não exige companhia ou intake. As entradas antigas convergem para o mesmo trabalho;
os motores documentais históricos conservam seus gates. Não há promoção de qualidade financeira
por teste sintético de transporte. A conciliação exige 141 evidências e mantém 18 lacunas gerais
nos incrementos responsáveis. Provas e limites em `docs/build/arcabouco/etapa-10.md` e
`docs/security/history/wave-9-final-review.md`. O completion externo registra também CI e
implantação desta própria conciliação. Etapa 11 depende de novo OK do fundador.

## Incremento 10C: consolidação das entradas e contexto do trabalho

As entradas conversacionais antigas delegam a `start_work_v1`; append e submit usam o mesmo contrato de turno, com negação de replay de mensagem de outro trabalho. O caminho antigo de resposta pronta em `append_advisor_message_v1` é retirado. Pesquisa e case fit sem intake ficam em conversa, com critérios declarados preservados e sem fingir execução financeira. Os motores históricos continuam disponíveis sobre sessões documentais reais e sob os gates existentes.

Entradas documentais explícitas passam por trabalho e depois pelo comando de ingestão, conservando termos e declaração. Retomar onboarding exige capacidade de representação e autoridade atual; `started_by` não concede acesso residual. Entradas públicas estruturadas, sem consumidores web, passam a retornar UUID de trabalho; o assunto declarado fica no dossiê privado, sem criar companhia ou intake.

O contexto opcional permite objetivo, audiência, prazo e momento da decisão; atualização usa revisão esperada. Vários dossiês podem ser associados; vínculo nunca concede acesso nem entrega seu conteúdo ao modelo. A edição é localizada, responsiva e não pede cargo. Os contextos históricos são criados vazios, sem inventar finalidade.

Regressões dos motores legados constroem explicitamente a relação histórica com intake em fixtures transacionais. Não são prova de execução financeira sem documentos. Novos contratos cobrem cada entrada mantida, revogação do criador, replay entre trabalhos e retomada documental. O E2E acrescenta edição de contexto, dois dossiês pela interface e viewport móvel.

Verificação de banco concluída: staging `20260917203501`, `20260917204438`, `20260917204826`; produção `20260917204933`, `20260917204936`, `20260917204939`. SQL dos três carimbos idêntico; 30 definições de função iguais entre ambientes, 85 contratos SQL em staging com rollback, zero advisories de segurança e zero trabalhos antigos sem contexto. Produção negou chamadas não autenticadas sem criar dados descartáveis. Checkers conferem 341 versões de produção e os catálogos de 1.796/1.857 objetos. Tipos regenerados da produção.

Os links `new/company-debt` e `new/origination` redirecionam à conversa; os dois formulários e suas actions foram retirados. As duas RPCs especializadas também preservam brief e identidade, retornam conversa sem intake e mantêm somente os motores históricos sobre contexto documental real. Replay não reabre job e respeita a autoridade e a organização selecionada. Duas migrações adicionais conservam o SQL já aplicado; uma tentativa de sintaxe rejeitada em staging não criou carimbo.

10B publicado: PR 651, main `21a8e5bf0aee4de0343757ef092d1054c2084ca2`, Quality `35271461797`, Security `35271461902`, worker `35271461876`, Vercel `6511611901`, ECS `360`, health atual sem fila bloqueada. PR Quality `35269824006`: 33 E2Es passaram; 16 testes condicionais não executados, sem alegação de qualidade de modelo. Recibo externo `entry-delivery.json`.

Estado de 10C: banco aplicado, código em verificação para publicação; CI e implantação da interface ainda pendentes. Etapa 10 segue aberta, etapa 11 não iniciada.

## Etapa 10B: entrada de trabalho e continuidade documental

Fundação 10A publicada em `2c272c36e938ebfc652937eb76d115594ab392b6`: main Quality 35265839741, Security 35265839744, worker 35265839729, Vercel 6510664206 e ECS359 conferidos. Novos comandos instalados em staging `20260917194611` e produção `20260917195617`; 84 contratos SQL passaram em staging com rollback, incluindo contexto versionado, dois dossiês, revogação do criador e upload no mesmo trabalho. Sem fixtures de produção.

A entrada web cria trabalho e enfileira conversa atomicamente; pergunta sem anexos não compila plano nem abre intake/pasta. Upload posterior conserva conversa e identidade, cancela jobs que carregavam o contexto anterior e usa os gates documentais. Navegação, renomeação e arquivamento aceitam trabalho sem sessão. Tipos vieram da produção; 13 comandos privados/públicos inventariados, trigger e função de pasta automática retirados. Os checkers conferem 338 versões e os catálogos dos dois ambientes.

A publicação da web compatível precede a consolidação dos adaptadores antigos no incremento 10C. Os E2Es dos motores de pesquisa/preview passam a declarar explicitamente sua história legada com sessão, sem semear resultados ou aprovações; a nova entrada é coberta por `persistent-work.spec.ts`. CI e deploy deste incremento ainda são gates, não conclusão. Etapa 10 continua aberta; etapa 11 não iniciada.

## Onda 9 autorizada: trabalho persistente sem intake obrigatório

## Etapa 10A: fundação de trabalho sem intake, 17/09/2026

Migração em ambos os ambientes, 83 contratos SQL de staging e seis novos testes do worker. Nova conversa usa identidade direta, revogação e commit atômico; consumidor v3 não recebe o novo tipo. A entrada atual só muda no próximo incremento da mesma etapa. Estado e riscos em `docs/build/arcabouco/etapa-10.md`. Etapa 10 ainda não concluída; etapa 11 não autorizada.

Etapa 10 autorizada após completion da etapa 9. Baseline `5826a8cca31510914f04c7b332462b691fd49532`. Revisão de abertura
renova 126 evidências, mantém 18 lacunas e confere runtime e journals vivos.
Revisão: `docs/security/INVENTORY_WAVE_9_REVIEW.md`. Etapa 11 não iniciada.

## Etapa 9: conciliação da entrega em 17/09/2026

PR 647 entregue em `75f3dc70aa90b8ab33b9e9afb299fbf809db8761`; main Quality 35254486464, Security 35254486454 e worker 35254486802 passaram. Vercel Production 6508719804 e ECS 356 executam o commit exato.
Cinco migrações conferidas nos dois journals, SQL idêntico e 23 funções em paridade.
82 contratos SQL e concorrência real passaram na CI; 32 jornadas E2E passaram, incluindo
revisão, reabertura e cálculo da base anterior, desktop e celular. Produção foi verificada
sem fixtures. As 336 versões de arquivo constam do journal de produção e 56 superfícies
novas estão inventariadas. Advisors de segurança sem achados.

A conciliação também corrige a sobreposição móvel observada na inspeção da captura e
acrescenta uma asserção geométrica ao E2E; os gates e a nova captura são condição de merge.

Adoções e hipóteses são contribuições imutáveis por contexto, com revisão anterior explícita.
O cálculo fixa base, fingerprint e versão do motor; direitos atuais e fixados são revalidados.
A conciliação exige 126 evidências e mantém as 18 lacunas gerais nos incrementos responsáveis.
Provas e limites em `docs/build/arcabouco/etapa-09.md` e
`docs/security/history/wave-8-final-review.md`. O completion externo registra também CI e
implantação do commit desta conciliação. Etapa 10 depende de novo OK do fundador.

## Etapa 9: adoção instalada, interface em publicação

Cinco migrações de adoção contextual instaladas nos dois ambientes, carimbos de produção
`20260917160856`, `20260917160902`, `20260917160915`, `20260917160926`, `20260917161803`; 23 funções e SQL dos
journals em paridade. 82 contratos SQL passaram em staging; negativos sem fixtures passaram
em produção. Advisors sem achados; inventário cobre 56 superfícies novas e 336 migrações.
A ponte PR 646 já está em produção em `00506b78de8fea3545d37c23ef491a08c8ffb365`,
Quality 35241118779, ECS 355 e Vercel 6506374936. A interface contextual, a comparação e
os cálculos preservam versões e hipóteses; CI, merge e deploy deste incremento ainda são
obrigatórios. Escopo, testes e riscos em `docs/build/arcabouco/etapa-09.md`. Etapa 10 não iniciada.

## Etapa 9: contrato e compatibilidade antes dos produtores

O contrato tipado exige trabalho, finalidade, contexto, motivo e base anterior explícita.
Hipóteses preservam decimal exato e exigem interpretação completa; não podem se publicar.
O consumidor aceita referências sem conteúdo para `adoption_decision` e `assumption_version`
antes de o banco produzir esses eventos. Sem DDL, nova rota ou habilitação neste incremento.
41 testes de contratos e oito do consumidor passaram localmente; gate completo e entrega
constam do completion externo da onda 8. Persistência e seleção continuam em implementação.

## Onda 8 autorizada: adoção contextual e hipóteses

Etapa 9 autorizada após completion da etapa 8. Baseline `047fff553e43eaac41c2ef763268c25284887f87`. Revisão de abertura
renova 111 evidências, mantém 18 lacunas e confere runtime e journals vivos.
Revisão: `docs/security/INVENTORY_WAVE_8_REVIEW.md`. Etapa 10 não iniciada.

## Etapa 8: conciliação da entrega em 17/09/2026

PR 643 entregue em `88fa39a83c090040ba764185c61657cfd0a706c4`, main Quality 35231824387, Security e deploy verdes. Vercel Production 6504647630 e ECS 352 executam o commit exato. Seis migrações conferidas, 25 funções em paridade e 228 observações legadas com audit/outbox; os 228 eventos foram concluídos. 79 contratos SQL passaram em staging e CI. Negativos em produção sem dados descartáveis; advisors sem achados. 331 arquivos cobertos pelo journal, 44 superfícies novas inventariadas.

A conciliação exige 111 evidências e mantém 18 lacunas gerais nos incrementos responsáveis. O teste de governança recusa omitir qualquer uma das 14 novas evidências. Estado e limitações em `docs/security/history/wave-7-final-review.md`; o completion externo registra também CI e deploy do commit desta conciliação. Adoção contextual é etapa 9, ainda não iniciada.

## Etapa 8: observações instaladas, publicação do decimal pendente

A ponte PR 642 está em produção no commit `0e6ee7d34253744ede8cecd3a4912fa83917a3b4`, com Quality 35228218972, Security, Vercel e ECS 351 conferidos. Seis migrações foram aplicadas em produção, carimbos `20260917134924` a `20260917135001`, com SQL idêntico ao de staging e 25 funções em paridade. Os 228 candidatos existentes têm observação imutável e auditoria/outbox. Os 79 contratos passaram em staging; negativos sem fixtures passaram em produção. Catálogos e 331 versões de arquivos conferem; advisors de segurança sem achados.

Este incremento publica extração e edição com decimal exato, rejeita escala textual/expoente ambíguo e exige moeda explícita. Remove aceitação em lote no SQL; a ponte já a retirou da web. Novos registros não conferem adoção, primazia ou validação de âncora. Evidências em `docs/build/arcabouco/etapa-08-installation.json` e `etapa-08-installed-eval.json`. CI, merge e deploys do novo commit ainda são obrigatórios; etapa 8 não está concluída e etapa 9 não foi iniciada.

## Etapa 8: ponte de leitura (em execução, 17/09/2026)

Retirada da aceitação por confiança e preservação de dimensões nos consumidores. Revisão
individual funciona antes e depois da migração de observações. A base de cálculo recusa
ambiguidade e contexto incompleto, sem apagar as leituras originais. Banco novo somente em
staging; precisão decimal no armazenamento será ativada com o próximo incremento. Etapa 9
não iniciada. Contrato em `arcabouco/etapa-08.md`.

## Etapa 8: compatibilidade do consumidor antes da migração

O worker passa a reconhecer envelopes sem conteúdo dos agregados `observation` e
`metric_definition`, usando a mesma capacidade e confirmação transacional existentes.
Contratos validam valor decimal exato, dimensões desconhecidas explícitas, fonte/âncora
e definição contratual vinculada à versão do contrato. Não há produtor novo, tabela,
backfill, adoção ou publicação neste incremento. A migração só emitirá esses eventos
depois de este consumidor estar implantado. Etapa 8 em execução; etapa 9 não autorizada.
Testes negativos recusam efeitos novos, valores no envelope e auto-publicação.

## Onda 7 autorizada: observações e definições

Etapa 8 autorizada pelo fundador após a etapa 7. Baseline `a4ff8caaaa7c91d65cbfa8020a1a6e70044cf561`; revisão de abertura
renova 97 evidências, conserva 18 lacunas e registra runtime/journals vivos. Ranking não será
tratado como adoção; candidatos divergentes e dimensões incompletas conservam origem.
Etapa 9 não iniciada. Revisão: `docs/security/INVENTORY_WAVE_7_REVIEW.md`.

## Etapa 7: conciliação da entrega em 17/09/2026

PR 638 mesclada em `654c09c5c8f64424b68ef10bd986235a07ba7c02`; Quality da PR e de main,
Security, preview e deploy do worker passaram. 31 E2Es sem repetição, 76 contratos SQL
instalados, 32 funções em paridade e 325 migrações cobertas pelo journal. Staging
`20260917024611` / produção `20260917025326`, SQL idêntico. Vercel Production `6495004870`
e ECS revisão 347 executam o commit exato, com polling atual e quatro alarmes OK, ainda sem
notificação configurada. Direitos desconhecidos negam uso, derivados intersectam restrições,
revogação alcança busca/cache/job e a entrega revalida direitos. Inventário exige 97 evidências
e conserva 18 lacunas gerais nos incrementos responsáveis. Revisão em
`docs/security/history/wave-6-final-review.md`; o completion externo registra também CI e
deploy do commit desta conciliação. Nenhum dado descartável em produção. Etapa 8 não iniciada.

## Etapa 7: direitos instalados em 16/09/2026

Migração aplicada em staging `20260917024611` e produção `20260917025326`, com SQL idêntico (MD5 `26955f303ed38f67f5ed3708476b64e7`). Os 76 contratos SQL passaram no schema instalado, incluindo seis novos testes de direitos, prazo, desempenho, isolamento e revogação. 32 funções estão em paridade; advisors de segurança sem lints; 35 superfícies novas inventariadas e 325 arquivos cobertos pelo journal de produção. O backfill preserva 28 versões, com 28 aceites explícitos e 28 eventos/auditorias/outbox. Nenhuma licença pública foi presumida. Tipos vêm de produção. CI, merge e web/worker no commit final ainda são obrigatórios para fechar. Escopo, riscos e limites em `docs/build/arcabouco/etapa-07.md`. Etapa 8 não iniciada.

## Etapa 6: conciliação da entrega em 16/09/2026

PR 635 mesclada em `3ccc8bcd4c399f984cd399daadf063f1e54638d7`, com os três gates Quality, scans e preview aprovados. Duas migrações nos dois ambientes, 69 contratos SQL instalados, 27 funções em paridade; 28 versões e seus vínculos preservados. Web Production `6491529123` e worker ECS 344 executam esse commit, com polling atual e quatro alarmes OK (notificação ainda não configurada). O inventário final exige 84 evidências, encerra a confirmação indevida e conserva 18 lacunas gerais no incremento responsável. A conciliação acrescenta a migração de projeção allow (staging 20260916230213 / produção 20260916230240), preservando o tombstone deny fora da lista de concessões; revalida a página e aguarda a mutação no E2E antes de exigir 404. Revisão em `docs/security/history/wave-5-final-review.md`; o completion externo registra os gates e deploy do próprio commit final. Etapa 7 não iniciada.

## Etapa 6: fonte e versão instaladas em 16/09/2026

Duas migrações aplicadas e conferidas em staging (`20260916211117`, `20260916211402`) e produção (`20260916212202`, `20260916212209`), SQL idêntico. 28 documentos conciliados com fontes/versões/vínculos, hashes intactos e 17 carimbos antigos preservados como histórico não comprovado. A RPC vulnerável de confirmação está sem EXECUTE; prova exige recibo de worker delegado. 69 contratos SQL instalados passaram; 27 funções em paridade; advisors de segurança limpos. Tipos de produção, 41 superfícies novas e 323 migrações inventariadas. Detalhes e limites em `docs/build/arcabouco/etapa-06.md`. CI, merge e deploy exato ainda são obrigatórios para fechar. Riscos tratados no incremento responsável; etapa 7 não iniciada.

## Onda 5 autorizada: fonte e versão imutável

O fundador autorizou a etapa 6 e determinou tratar riscos no incremento correspondente. Baseline entregue `0abe864e7187e6435b0e464fe4ed07b2515a0402`; inventário renovado com 70 evidências, sem encerrar as 18 lacunas gerais. A inspeção de fonte reproduziu também `SG-SOURCE-VERIFICATION-AUTHORITY`: membro sem grant altera hash e confirmação por RPC; total de 19 lacunas, correção obrigatória na etapa 6 antes do backfill. ECS revisão 342, imagem exata, polling sem backlog e quatro alarmes OK conferidos por leitura em 16/09/2026; ações de notificação continuam ausentes. O registro `docs/build/arcabouco/RISCOS-POR-INCREMENTO.md` fixa tratamento e prova de fechamento por etapa. Fontes/versões ainda não implantadas; etapas 7 e seguintes não iniciadas.

## Etapa 5: conciliação da entrega em 16/09/2026

A PR 632 mesclou entidade/dossiê no baseline `aee07fc0`, com qualidade, banco, 31 E2Es, scans e preview aprovados. Schema nos dois ambientes, 68 contratos SQL instalados e 31 funções em paridade; produção preserva 50 recursos/dossiês sem inferência de entidades. Vercel Production `6488774421` e ECS revisão 341 executam esse commit; polling e alarmes conferidos por leitura, sem fixtures em produção. O inventário final vincula 70 evidências e conserva as 18 lacunas gerais. Revisão em `docs/security/history/wave-4-final-review.md`; o completion externo registra também os gates e runtime do commit desta conciliação. Memória privada entre dossiês permanece para 17/18; etapa 6 aguarda OK.

## Etapa 5: entidade e dossiê instalados em 16/09/2026

O recorte aprovado mantém memória privada entre dossiês desligada até o contrato explícito de 17/18. Entidades, identificadores revisados, dossiês privados e vínculos datados/perimetrais usam a política comum. Memória pública v2 exige identidade comprovada e delegação do job; v1 congelada. Migração staging `20260916190433` e produção `20260916190600`, mesmo SQL; 50/50 recursos projetados sem desvios, zero entidades inferidas, 31 funções em paridade, advisors de segurança limpos. 56 novas superfícies e 321 versões de produção inventariadas. Detalhes em `docs/build/arcabouco/etapa-05.md`. 68 testes SQL passaram no candidato e no schema instalado de staging; a etapa ainda exige CI, merge e implantação exata antes do completion. Nenhum trabalho de etapa 6 está autorizado.

## 16 September 2026: stage 3 resource policy and barriers

## Onda 4 autorizada: entidade e dossiê privado

O OK do fundador autoriza somente a etapa 5. A abertura fixa main `5d73624cad869d17ad56eff3d3cab800acd44f64`, preserva a revisão encerrada da onda 3 e renova as 63 evidências. Leitura ao vivo confirmou paridade das 11 funções de perfil, memória pública e contexto afetadas entre staging e produção; worker revisão 339 saudável, imagem exata e quatro alarmes OK. As 18 lacunas existentes permanecem. A implementação ainda não foi aplicada. Escopo e critérios em `docs/security/INVENTORY_WAVE_4_REVIEW.md`.

## Etapa 3: conciliação da entrega em 16/09/2026

Implementação mesclada pela PR 629 (`a8cddded`), com os três gates Quality, preview e scans aprovados. Três migrações aplicadas e conferidas nos dois journals; 67 contratos SQL instalados em staging, 31 E2Es na CI e 53 funções idênticas entre ambientes. O inventário final vincula a política comum, barreiras, delegação, exportação e os testes aos bytes desse baseline. Revisão e limites em `docs/security/history/wave-3-final-review.md`; evidência operacional em `docs/security/evidence/aws-worker-rollout-diagnostics-wave-3.json`. Sem telas administrativas e sem dados descartáveis em produção. A próxima onda depende do OK do fundador; etapa 5 não iniciada.


PostgreSQL now evaluates explicit human/group grants, deny precedence, flat groups, desk barriers, purpose restrictions and bounded worker principals. Administrative authority is separate from content access; web capabilities are emitted by the server. Existing download/Storage, job and publication paths consult the common policy. No administrative screens or next-wave work were added.

Three immutable migrations are installed in staging (20260916124024, 20260916124447, 20260916163357) and production (20260916163753, 20260916163756, 20260916163759), with matching SQL hashes. The follow-ups fix child grant scope, explicit-deny basis and duplicate purpose audit events. Staging passed all 67 rollback SQL contracts, including the preserved role-free context suite. All 53 inspected function definitions match across environments; security advisors report no lints. Generated types and object/journal inventories reflect production. Local pnpm check passed across 44 packages.

Evidence: docs/build/arcabouco/etapa-03.md, etapa-03-installed-eval.json and docs/security/INVENTORY_WAVE_3_POLICY_REVIEW.md. Final CI, merge and exact-commit web/worker proof remain required before completion. No production fixtures were created.

## Etapa 3: compatibilidade prévia do consumidor

Envelope passa a aceitar `access_policy` exclusivamente para o efeito existente `revalidate_authority`; nenhum payload protegido ou novo efeito é aceito. Publicar web/worker antes da migração `resource_policy_and_barriers`, evitando leases recusados por consumidor antigo. Sem DDL, concessão ou ativação de política nesta entrega. Teste negativo em `domain-event.test.ts`; etapa 3 permanece em execução.

## Onda 3 autorizada: 16/09/2026

Etapa 3 de política comum e barreiras autorizada após conclusão da onda 2. Governança renovada contra main `9b6ccf98`; escopo e evidências em `docs/security/INVENTORY_WAVE_3_REVIEW.md`. Telas administrativas adiadas. Implementação da etapa 3 ainda não publicada por esta revisão.

## Wave 2: delivery security reconciliation

The final technical review pins the delivered stage 2/4 baseline `b0d1e8db428ca3e93dc9b1638fdee9bb2fbfdc4b`. All 54 evidence hashes and the affected workspace/outbox relationships are reconciled; the 18 remaining gaps retain their scope and severity. The opening inventory and AWS observation are archived. Production worker revision 334 polls the outbox and all four alarms show OK; no IAM expansion or production fixture was used. See `docs/security/history/wave-2-final-review.md`. The active wave remains open solely for the current authorized delivery; no subsequent wave starts without the founder OK.

## Wave 2: stage 4 schema and alarms installed

Production `20260916102242` and staging `20260916102218` install the reconciled transactional event/outbox contract. The initial staging application `20260916101915` is archived unchanged; production rejected and rolled back that first candidate because pack distribution is a known staging-only surface. The successor retains that boundary. Three installed SQL contracts passed, security advisors report zero lints in both environments, and 1450/1511 catalogue objects are reconciled. Four CloudWatch alarms and filters are installed/read back through the existing authorized console session, with no IAM change. Final CI, main merge and real consumer deployment remain gates; see `docs/build/arcabouco/etapa-04-installation.json`.

## Wave 2: governed security inventory renewal

## Wave 2: stage 2 registration cutover installed

After PR 622's compatible web/worker deployment at `91edc0f152708f8fcd1fabbfff51f343a466eff9`, production `20260916041917` and staging `20260916041505` remove implicit commercial capabilities and the two label-based helpers. Existing grants and memberships remain unchanged. All 60 SQL contracts passed with the candidate in staging; the installed identity, cutover and creator regressions passed. Regenerated production types are byte-identical. Final CI, merge and deployment proof belongs to the stage completion receipt, not this pre-merge ledger entry. See `docs/build/arcabouco/etapa-02.md`.

## Wave 2: stage 2 additive identity rollout

Production contracts `20260916035105` and `20260916035119` match staging SQL. Explicit personal/institutional context and commercial-account isolation preserve existing memberships and resource grants. Two legacy request-replay metadata bypasses were reproduced and corrected. See `docs/build/arcabouco/etapa-02.md` and `docs/security/INVENTORY_WAVE_2_IDENTITY_REVIEW.md` for executed checks and the remaining deployment/cutover gates. This entry does not close stage 2 or authorize a dependent wave. Stage 4 is the other independent delivery in the current wave; administrative screens remain deferred.


The founder approved advancement after wave 1. The next dependency frontier covers stages 2 and 4; dependent stages require the next wave OK. The security snapshot and canonical evidence contracts now use merged baseline `9620406b8d3b9624a68bf611b40791e289f90a90`. Three remediated findings are replaced by required regression evidence; all other 18 gaps remain open. The final wave-one review and its initial immutable snapshot are archived, and fresh read-only production authority checks plus both security advisors passed. See `docs/security/INVENTORY_WAVE_2_REVIEW.md`. This prerequisite changes governance only; it adds no schema or product capability. Final publication receipts follow the actual CI and deployments.

## Stage 1C: role-free runtime, entry and database context

Application PR 619 merged as `db624e41866696d69ad40206077fa865fec562fd`, with Quality 35040740501 and Security 35040740490 green. Vercel deployment 6471418589 and worker deployment 35041538760 published that commit before the database change; ECS revision 328 was stable at the expected nonzero capacity. The runtime and entry flow no longer request or consume a professional profile. Objective, evidence and method determine rigor and scope; institution capabilities describe execution means only.

Migration `role_free_reasoning_context` is installed as `20260916005559` in staging and `20260916005712` in production. The three changed function bodies match across environments, no loader reads professional profiles, direct internal helpers remain denied, and the historical production profile digest is unchanged. All 313 migration files have production journal versions; the 1385 production and 1446 staging catalogue objects retain their access surface. Regenerated TypeScript types are unchanged. Security advisors report zero lints; pre-existing performance notices do not result from this body-only migration.

The new SQL contract compares 48 authenticated loader calls across four requester profiles, including no profile, and verifies helper denial and absence of legacy profile readers. It failed on the old schema for the expected profile leak and passed on the installed staging schema. Eight authorization, preview and administrative regression suites passed in staging. Worker counterfactual tests compare reasoning requests, budgets, output contracts, routing and plans; PT/EN and mobile entry plus the retired-route redirect passed in a browser without leaving fixtures. `docs/build/arcabouco/etapa-1c.md` records the contract. The wave completion receipt records this SQL release's final CI, merge and deployments. No later wave starts before the founder's OK.

## Stage 1B: completed in production

PR 618 merged at `dda8361c2c146e58c25640f2a9b1ca381ae20ed0`. PR Quality 35021975331 and Security 35021975315, main Quality 35023094038 and Security 35023094185 all passed. Production versions `20260915204111`, `20260915204116`, `20260915204120`, `20260915204124` match the exact journal SQL; 312 migration files and 1385 production catalogue objects were checked. Vercel deployment 6468383287 and worker deploy 35023094123 published this commit, ECS revision 327. All 111 Storage objects rotated with 107502041 bytes verified, zero old objects/references or integrity/audit gaps. Production read-only authorization passed; no production fixtures were used. Additional AWS boot-log reading remains unavailable under existing permissions. The separate historical block report is superseded by these verified results.

## Stage 1A: active organization authority

The creator-authority exploit and two privileged profile-write bypasses were reproduced and denied after correction in staging. Production migrations `20260915123202` and `20260915123205` are applied; fourteen function definitions match staging, security advisors have zero lints, and real memberships are unchanged. Atomic bootstrap preserves signup, and a two-connection CI test proved serialized ownership transfer with one winner. The 308 production file versions, reviewed object inventory and generated types are reconciled. See `docs/build/arcabouco/etapa-1a.md` and its production proof; the wave completion records final CI, merge and deployments. Rollback preserves the new authority boundary.

## Stage 0 production journal parity correction

The remaining fourteen file/version gaps are reconciled: eleven files now use the production stamps with unchanged SQL; three journal-only repairs record bodies already installed by the schema-gap consolidation. Both environments were repaired without replay, and before/after function, column and policy fingerprints are unchanged. See `docs/build/schema-history/JOURNAL-PARITY.md` for the evidence and CI contract. The stage-zero inventory checker now rejects every local migration version absent from the production journal receipt, including same SQL under a different stamp. Both checkers run in the Database CI job now. Merge, main CI and deployment results are recorded in the wave completion report; this source entry does not claim those pending results.

## 14 September 2026: wave 1 procedure authoring foundation

## Stage 0 replay bootstrap diagnosis, 14 September 2026

PR 614 is merged as `8ae3772c3b268f29c019b744f18fcfe3b575c06a`; its Quality, Security and preview gates passed. The recovery CI correctly rejected 355 grant differences between the local replay and hosted catalogue. All concern `service_role`; the pinned CLI changed default grants at bootstrap. `supabase/config.toml` now explicitly reproduces the hosted bootstrap before historical migrations. No comparison exception, post-replay grant patch or remote DDL was introduced. Full corrected CI remains required. Details and immutable CI source: `docs/build/arcabouco-stage0/README.md` and `REPLAY-BOOTSTRAP-DIAGNOSIS.json`.


The prerequisite correction and inventory renewal are published in main at `d88683df88829cc50fe92f3b7694477630308499` (PR612); the wave coordinator verified web and worker publication, including worker task revision 322. This checkpoint preserves that published baseline and delivers only authorship preparation. The historical prerequisite note below predates that publication.

Stage 0 now includes `packages/credit-playbook/knowledge/AUTHORING.md` and the editorial candidate `knowledge/procedures/capital/prepare-capital-structure-decision.md`. The first work is capital structure alternatives for a decision; proposal comparison follows later. The guide explains the current Markdown parser, separates professional specification from executable components, and records the scope approved for parallel authorship.

The candidate has no TaskSpec binding, executor, approval, capability or deployment release. `capital-structure-authoring.test.ts` checks compilation, staging exclusion, absence from runtime/approval manifests and rejection of maturity-only promotion. This source delivery does not implement Stage 13 or claim a published capital-structure procedure. The founder's remaining acts are approval of the first procedure content and approval of each wave; customer access administration belongs to the customer, and zero retention is a future commercial item.

Local verification on the published d88683df baseline, using Node 24.19.0 and pnpm 10.32.1 with a frozen lockfile: `pnpm check` passed lint, typecheck, tests and build, with 43 successful tasks in each phase. The test summaries report 3,287 passing tests; credit-playbook passed 42 files / 338 tests, including both authoring-boundary regressions, release-governance passed 188, web passed 679 and worker passed 559. The local run is recorded in `/tmp/offroad-wave1-authoring-check.log`. Final remote CI, merge and exact-commit web/worker deployment remain required and are not claimed for this authorship delivery. No schema or application runtime changes are included here; no migration or production data operation is needed for these files. Stage 0 completion remains dependent on the reconciled migration inventory and open-work dispositions owned by the wave coordinator.

## 14 September 2026: wave 1 security inventory renewal

## Wave 1 stage 0 integration, 14 September 2026

The governance and mandate reconciliation prerequisite is published in main at `d88683df`; its PR and main Quality/Security checks passed. Production web returned HTTP 200 and worker deployment verified task definition revision 322. The 20 previous PRs are closed; PR 613 is absorbed by 612. See `docs/build/arcabouco-stage0/PR-DISPOSITIONS.md` and its execution receipt.

This candidate restores seven already-applied production migrations and archives nine staging-only files outside replay. All sixteen hashes and live journal records passed the recovery verifier; 22 functions and four tables agree within the documented comparison. Both recovered SQL suites passed rollback-only staging execution, followed by zero reserved fixtures. The object checker passed for production (1,284 objects) and staging (1,345); fifteen Python regression tests passed. `ROADMAP.md` records the approved sequence and founder acts. CI replay, candidate merge and production deployment remain required before stage 0 completion. No historical migration is reapplied and no security stage is declared complete.


Founder authorization replaces the seven-day inventory review cadence with review at wave boundaries and whenever a material security change occurs. The reviewed scope is wave 1 (stages 0, 1A, 1B and 1C). Closed or mismatched waves and material changes awaiting review fail closed; time-bound contracts and attestations retain real expiry checks. Evidence is re-collected and repository sources re-examined against main, not renewed by changing a date. The fresh Codex read-only observation keeps effective IAM and unavailable worker boot diagnostics unverified. This review is not a security certification or remediation of the separately scheduled access defects.

This is the prerequisite delivery for the remaining stage 0 reconciliation. Claude exclusively owns the provider mandate correction in PR612 until merge; no file or DDL from that branch is part of this change. The three stage 1 corrections remain required before the wave can close. Validation, CI and exact-commit deployment receipts are recorded separately and must pass before completion.

Local verification on Node 24.19.0 and pnpm 10.32.1: `pnpm check` passed lint, types, all package tests and 43 build tasks. Release-governance passed 188 tests; web passed 679 and worker passed 559. Trusted inventory and program-board renderers passed with real clock and resolved bytes. Independent review found no new expiry, hash or authority bypass. Remote CI, merge and exact-commit web/worker deployment remain release gates.

## 14 September 2026: applied schema recovery candidate

Seven production-applied migrations are restored with their exact journal text and production
versions. Nine staging-only distribution migrations are preserved outside replay in
`docs/build/schema-history/`; no distribution surface or method publication is promoted.
The recovery manifest and checker validate sixteen file hashes, both environment journals,
22 installed functions (three comment-only differences), and four identical table/policy catalogs.
Read-only live catalog verification passed at 2026-09-14T21:44:14Z. Five checker regression tests
passed locally. Two recovered SQL suites are wired into the existing database CI loop; they
have not yet run in this candidate. The proposal test's row count now scopes its synthetic project.
No remote mutation, migration replay, merge, deploy, or stage completion is claimed. Required
remaining gates are recorded in `docs/build/schema-history/TEST-REVIEW.md`.

## 13 September 2026: cinematic website candidate

The founder approved browser QA and requested an OffDeal-inspired hero: glass navigation, white/champagne two-line heading, office/city motion, four benefits and an investor entry. The candidate starts from published 7c8d4f6 on feat/public-cinematic-hero. Agentic AI moves into a dark product section; board analysis is the initial example; repeated caveats are consolidated and security claims remain evidence-bound. Investor intake prepares an email, not a server-received registration. The chart title hydration defect was corrected without changing financial calculations.

Thirty-one focused tests, the full repository check (107 web files / 679 tests and 43 build tasks) and the 42-page/five-image/new-video HTTP probe passed. Authorized desktop/mobile browser QA covers the hero, playback, mobile menu, investor entry, method disclosure, advisor modal/scenarios and focus return; this supersedes the historical QA holds below. Physical iPhone/Safari was not tested. Exact-head remote gates, production proof and clean-main synchronization remain required before reporting publication. No private app, database, authorization, telemetry, provider or hosting configuration changes. Scope, claim boundaries and rollback: docs/build/PUBLIC_WEBSITE_CINEMATIC_HERO_2026_09_13.md.

## 12 September 2026: unified ACME financial case candidate

PR608 was held before publication after new founder corrections. The revised advisor and five-stage journey share ACME's historical basis and a reconciled cash model. Receivables use an existing-FIDC sale, not a company described as a multi-originator fund. A compact case label replaces repeated fictitious-data badges. Full analysis opens in a native modal; sources, cash bridges, alternatives and covenant sensitivity are explorable. Other offer improvements remain in scope.

The focused checks passed 27 tests; the complete web suite passed 107 files / 675 tests and the repository passed lint, typecheck and 43 build tasks. The HTTP probe passed 42 pages and five assets. Final exact-head remote gates and production verification remain required. Browser and actual-iPhone QA are still unapproved. See `docs/build/PUBLIC_WEBSITE_ACME_CASE_2026_09_12.md` for calculations, scope, claim boundaries and rollback. No private product or financial-engine implementation changed.

## 12 September 2026: offer work demonstrations candidate

Candidate `feat/offer-work-demonstrations` starts from published main 90ad9e (PR607). The professional-amplification bridge and offer now show desk-level advisor questions, a 14-document/four-delivery analyst sequence with human direction and review, and a fictional creditor profile with an explained 80/100 score and a concentration exception. Forward and OffDeal are design references, not evidence of an ML implementation. Both locales use native main titles, black/gray hierarchy and finite accessible motion.

Focused website tests: 22. Web suite: 106 files / 670 tests. Repository lint, typecheck, tests and 43 build tasks passed, along with 42-page HTTP/content verification and five assets. Exact-head remote gates and production verification remain required. Browser/actual-iPhone QA remains unapproved; no visual acceptance is claimed. Scope, synthetic-data boundaries and rollback are in `docs/build/PUBLIC_WEBSITE_OFFER_DEMOS_2026_09_12.md`.

## 12 September 2026: visual website cards candidate

Candidate `feat/visual-website-cards` starts from published main 8fc6ec (PR606). Professional empowerment now sits immediately after the hero with affirmative PT/EN copy. Offer examples, an audience switcher, expandable method tiles, market/trust cards and restrained progressive motion replace repeated document-like sections. The original hero photo regains its blue/amber color through CSS; no raster asset or private product flow changed.

Nineteen focused website tests and the 42-page HTTP/content probe passed. The web suite passed 106 files and 667 tests. Final repository lint/typecheck/tests/build passed with 43 build tasks; exact-head remote gates and production verification remain release requirements. Browser/actual-iPhone visual QA was requested and remains unapproved; HTTP and render tests do not establish visual acceptance. Scope, claim boundaries and rollback are recorded in `docs/build/PUBLIC_WEBSITE_VISUAL_CARDS_2026_09_12.md`.

## 12 September 2026: institutional website narrative candidate

The founder supplied new hero wording and a detailed public-site narrative. Candidate `feat/institutional-website-narrative` starts from published main 302fdcc. The home now presents the three-part offer, professional empowerment, three capital perspectives, finance-authored methods, market intelligence, five explorable work stages and institutional scope. Audience and solution pages provide progressive detail. Current implementation, future institutional capabilities and fictional examples are distinguished. App, authentication, database and hosting configuration are unchanged.

Local repository checks and the 42-page HTTP/content probe passed; web tests cover 106 files and 665 tests, including 17 website checks. Final candidate checks, exact-head CI and production verification remain separate release gates. Browser and actual-iPhone visual validation remain pending the unanswered QA authorization. See `docs/build/PUBLIC_WEBSITE_NARRATIVE_2026_09_12.md` for scope, claims, evidence and rollback.

## 12 September 2026: product-led website revision, publication authorized

The founder explicitly requested publication after the local preview handoff disclosed that browser and actual-iPhone validation were still pending. This supersedes the preview-only publication hold recorded below, not the visual-validation limitation. Repository-wide checks, exact-head CI and deployment verification are required before reporting publication complete.

The founder rejected the published mobile experience and generic copy. This revision starts from main 084de68 on isolated branch feat/studio-product-led-revision. The hero preserves the approved bilingual wording but uses compact mobile typography, a lighter photographic treatment and a finite entrance animation without the old pause/play control. Decorative Unicode arrows are removed from public actions. The home now centers on three selectable, fictional work examples: company capital planning, a banker client thesis and investor underwriting. Mobile has separate conversation/document views; desktop displays both. The generic rate-comparison widget and the rejected illustration caption are removed. Audience pages and three corresponding case pages share the tailored examples; public page headlines and introductions were rewritten in both locales.

The fictional financial baseline uses supermarketFixture from testing-fixtures and calculations from financial-core. No app, auth, database, production configuration or financial-engine implementation changed. No deployment or certification claim is made. SOC 2 remains a future objective. Demo contact still explicitly prepares an email rather than submitting a server-side request.

Validation at this checkpoint: web lint and typecheck passed; web tests passed 106 files and 660 tests, including 12 website tests. The production build is tracked in docs/build/PUBLIC_WEBSITE_REVISION_2026_09_12.md. Browser interaction, responsive screenshots and actual iPhone rendering have not been validated. Browser QA was requested from the founder and no reply has been received at this checkpoint. The revision must be reviewed before any further production publication. No commit, push, PR or deployment was performed for this revision.

## 11 September 2026: public Studio website implementation

Founder-authorized public-site replacement implemented on isolated branch feat/studio-public-website from main da3157b. The new site contains 42 localized public URLs, the exact approved hero, original Offroad logo assets, separate hero/product photography, audience and solution pages, six illustrative use cases, About, Security and explicit email-based demo contact. App/auth routes, financial workflows, authorization, database and deployment flags are unchanged. SOC 2 is a future objective, not a current report. No investor endorsement or customer outcome is implied.

Final local pnpm check passed lint, typecheck, tests and all 43 build tasks. The web suite passed 106 files and 655 tests, including seven focused website tests. Read-only HTTP verification passed all 42 localized pages, five assets, sitemap, robots and the unknown-route 404 boundary. Exact-head remote CI and production verification remain pending at this checkpoint; no production publication is claimed yet. See docs/build/PUBLIC_WEBSITE_RELEASE_2026_09_11.md for scope, claim boundaries, contact limitations, evidence and rollback.

## 10 September 2026: receivables history coverage correction (local candidate)

Published baseline is main `220a37f` (PR590); prior publication checkpoints below are historical. The targeted economic review passed 67 tests against identical published sources without paid model calls. It found no arithmetic discrepancy in inspected borrowing-base and waterfall fixtures, but the R01 wrapper dropped dynamic-history coverage while retaining reported aggregate performance.

This candidate preserves versioned history coverage and explicit concentration/waterfall conventions in new underwriting outputs and their fingerprints. Existing v1 results remain readable without inventing coverage when the added fields are absent. Regression evidence and the independent economic review are tracked in the workspace report `outputs/endgame-nine-2026-09-10/VALIDACAO-RECEBIVEIS.md` outside this repository. This is an internal-output correction, not a method promotion, production receipt or an external credit recommendation. No database migration or authorization change is included.

Local integrated validation completed after the coverage correction: `pnpm check` passed lint, typecheck, tests and all 43/43 build tasks. The receivables package passed 146 tests, including the short-history regression; the worker integration preserves unavailable-history states despite supplied evidence references. Independent review of the coverage defect is resolved. CI/browser promotion and deployment of this candidate are not claimed.

Release work remains: move prototype financial calculations into financial-core as required by AGENTS.md, complete independent method evidence, implement released analytical output and verify the current approved-revision browser journey. Provider analytical workspaces, broader standalone tasks, review responsibilities, corporate templates and verified mandates remain separate product gaps; see the workspace plan `outputs/endgame-nine-2026-09-10/LACUNAS-E-PLANO-IMEDIATO.md`.

## Publication correction: source locators in the R01 refresh

The authenticated journey reached the post-answer refresh and exposed a method-input mismatch: the worker's source identifier contains a case, document, sheet and row locator, while the method accepts a bounded slug. The compiler now preserves already-valid method IDs and maps other complete source identifiers to an `r01-` identifier with the full SHA-256. The original `source.universeId` remains exact for provenance and dataset checks. The method schema and its validation were not relaxed; no database migration was needed.

Five compiler tests passed, including long encoded Unicode sheet names, deterministic replay, distinct locators and legacy valid IDs. The direct worker materializer test passed from confirmed scope through the governed “50” answer to refreshed assembly and internal-only R01 output, with stable replay. An independent actual-XLSX probe also passed with the production locator format. The browser E2E now prints compact failure diagnostics immediately; its final CI outcome and deployment remain separate gates. No paid model call was introduced.

## Publication correction: revise questions when the source binding changes

The next authenticated R01 run exposed reuse of an advance-rate question whose immutable binding belonged to an earlier dataset. Migration `20260910174141_revise_receivables_request_bindings` creates a new question for a changed dataset or binding, preserves old answers and immutable bindings, supersedes only incompatible open questions, and retains same-binding replay behavior. Binding lookup uses the actual question identity or exact binding rather than timestamp ordering. Evidence question keys now include dataset and gap identity, so an answer concerning another pool cannot suppress new diligence; language and run changes retain the same key.

The dedicated persisted lifecycle SQL passed in staging: dataset revisions A→B→C→D, answered/waived replay, changed limits on the same dataset, immutable historical bindings, rejection of stale responses, preservation of other producers, and new evidence questions after a prior dataset's answer. Existing binding, adapter and supplement suites also passed. Twelve focused worker tests and worker typechecking passed; independent SQL review found no blocker. This is migration twelve in the publication batch. Production records version `20260910174141`; staging records `20260910173817`, with identical SQL SHA-256 `5701d9689faf6c128b52d2440748518b62ad560a53586a3feac60bb9d299a0ed`. The repository follows the production version; neither remote ledger was rewritten. Final browser CI and promotion remain separate gates; no paid model evaluation was run.

## Publication correction: preserve simultaneous specialist questions

The authenticated R01 journey reached a successful case run but exposed a producer-ownership defect: the generic case assessment superseded open questions created by specialist workflows. Migration `20260910171808_preserve_specialist_information_requests` limits generic assessment supersession and lookup to `agent_assessment`, and rejects collisions with another producer's requirement key before mutation. No CHECK, RLS policy, grant or index was relaxed.

The complete `agentic_dcm_work_system.sql` passed in staging with four independent producer namespaces preserved byte for byte, normal generic-question supersession intact, and cross-producer collisions rejected. Independent review found no blocker. This is the eleventh migration in the publication batch. The R01 browser journey still requires the next CI run to verify premise response and the final internal result; these SQL checks do not claim that journey has passed.

## Publication correction: unanswered decision continuity

The authenticated R01 E2E exposed `capital_project_decisions_check`: a repeated assessment tried to supersede an open decision with no recommendation. Migration `20260910164327_preserve_open_decision_history` reuses only an unreviewed open/null placeholder, retaining its identity and original attribution, recording its prior snapshot in the project event history, and preventing old assessment replays from overwriting the successor. Actual recommendations remain revisioned; human-confirmed/rejected decisions remain untouched. No CHECK, RLS policy or grant changed.

The complete `agentic_dcm_work_system.sql` passed against staging after application, including placeholder revisions, legitimate promotion, old replay, human-decision preservation and negative recommendation/reviewer constraints. Security advisors returned zero findings; the root local check passed 43/43 tasks. The batch now contains ten staging migrations. Final browser CI, production migration and deployment remain pending; this SQL receipt does not claim the R01 browser journey passed.

## Publication correction: documentary progress scope

PR590 fresh-database CI exposed a real stale-scope display defect after a legacy fixture was updated to a released documentary snapshot. Additive migration `20260910160700_documentary_progress_persisted_scope_guard` requires persisted target IDs and the Q01/Q02/Q03 task set to match the admitted documentary plan before displaying documentary stages. The complete execution-proposal revision SQL passed in staging, including changed targets and missing Q02; security advisors returned zero findings. The integrated publication batch now contains nine migrations. Production application, final CI and deployment remain pending at this checkpoint.

## 10 September 2026: new work requests, reviewed scenario comparisons and editable financial delivery: integration checkpoint

Final local integration check passed (lint, typecheck, all tests and 43/43 production build tasks). Financial-model94, case-materials59, case-export20 and authenticated four-format route12 checks passed. Native Calc compared672 outputs across six contractual variants and six edited workbooks, with zero differences above1e-6; six missing-input cases fail visibly. Visual QA inspected64 PT/EN slides/pages plus the Unicode PDF. The latest v2 SQL fixture passed the staging lifecycle again. Final staging security advisors returned zero lints. CI, production migration and deployment remain pending.

Implementation branch `feat/endgame-nine-closure` starts from verified main `576d0422fb65d3ad0bcabb8e82ad6343a109de0f` (PR589). Documentary planning is active on that production baseline; older entries below describing flags off are historical. This batch has not yet been promoted.

New explicit documentary requests preserve the project and ready documents, bind the command to the exact preceding brief, and require fresh approval. The released Q graph now accepts all six canonical entry contexts, while a separate admission guard preserves authorized-private access and leaves public provider research available. Progress and products bind to the current dispatch run rather than completed historical work; retry retains the original command binding after a lost response. No additional paid model evaluation has been run.

Financial results now support explicit comparison with compatible reviewed historical scenarios under the current source snapshot. The default workbook is `institutional-workbook-editable.v2`, with formulas for local assumption changes; persisted v1 files remain byte-compatible. Local edits do not update the project or other materials. Native PPT financial charts and bundled licensed PDF fonts improve export output. Font coverage is not universal; unsupported glyphs are rejected. This is not proof of institutional storytelling for every intent.

Economic-context planning now consumes all thirteen existing dimensions, including operating drivers, working capital, costs, asset model, capex and regulation. The six newly connected field paths preserve evidence and review semantics. This does not accredit an unimplemented specialist method or limit supported business descriptions to example sectors.

Applied only to staging `gjkkjtbfnssdsbmlhmwk`: `20260910134302_governed_business_dimensions`, `20260910134318_institutional_reviewed_result_comparison`, `20260910134705_institutional_editable_workbook_contract`, `20260910135224_explicit_documentary_work_revision`, and `20260910135636_documentary_revision_private_admission`. Rollback SQL passed for governed context, institutional lifecycle and explicit documentary revision, including twelve public-access rejection paths and preserved public provider research. Database types were regenerated from staging. Security advisors returned zero lints before the final private-admission guard; final advisors and CI remain release checks.

The founder confirmed no lender database exists. A production count returned zero registered funds, active mandates and registered-directory records. Public research is being assembled separately with source-linked institutions, vehicles, transaction observations and an official CVM/BCB census; registry existence is not a verified financing mandate. Matching data completion and integration remain open. Old receivables PRs are under selective reconciliation because blind merging would remove later protections.

Remaining acceptance: final combined checks, CI database/browser/security gates, exact production migration and deployment verification; provider-backed continuation E2E has been added but not run because the previous paid evaluation authorization was exhausted. Do not represent nine pending items as closed from this checkpoint.

## 10 September 2026: explicit supporting sheets in a combined workbook

The v2 receivables scope lets the user select non-tape supporting sheets inside the primary workbook. Discovery lists exact sheet names from decoded, source-bound evidence. Confirmation preserves source revisions and fingerprints the ordered selection; the worker revalidates it against fresh evidence and retains the exact original row slice of the selected primary table. Other tape-containing sheets, the primary sheet, nonexistent/ambiguous names and stale revisions are rejected. No other pool is included automatically.

V1 scope objects and confirmation history remain unchanged. New versioned web/worker readers expose v2; legacy readers retain their v1 shape and reject v2. The worker preflight requires the new database capability before claiming work. A changed selection creates a fresh processing run and requires approval whose scope fingerprint binds the full selection; the visible assumption shows supporting-sheet count/names without exceeding the governed brief length.

The local authenticated R01 fixture now uses one real parsed workbook with two pools and five supporting sheets. It selects only CARTEIRA and its support sheets, then follows the governed-premise/internal-validation journey. Browser execution is still pending local-stack/CI availability; no live-provider or customer-result claim follows from adding the test. Targeted domain, worker and web tests cover exact row preservation, exclusion of other pools, changed source revision, v1 compatibility, explicit UI selection and request routing. Full local `pnpm check` passed (lint, types, tests and 43/43 build tasks); 108 focused tests passed. The coordinator applied `20260910153117_confirmed_receivables_support_sheets_v2` and `20260910153338_support_sheet_runtime_invoker_contract` to staging; v1/v2 SQL suites passed, the support-sheet suite passed again after the correction, and security advisors reported zero lints. Generated database types were refreshed. The combined integration batch now has eight new staging migrations; this support-sheet extension accounts for two. No production migration or remote push is claimed.

## 10 September 2026: independent R01 questions and current-result visibility

The followup fixes a real interaction dead end: source-evidence questions no longer prevent independent governed-premise questions from being persisted. The advisor now lets the user select an outstanding question and binds the reply to that selected request and revision. Evidence readiness still controls specialist execution. Duplicate required spreadsheet headers fail closed, including when a second clean-looking table exists.

A new current-result card uses only the existing server-verified completed run, manifest and confirmed evidence scope. It shows pool count/balance and human-readable remaining work. Successful R01 calculation is explicitly described as internal technical validation; no private specialist conclusion is published or accreditation changed.

The new deterministic lifecycle uses the actual raw detector and governed answer parser: parsed source draft missing advance rate, simultaneous evidence/premise projections, bound 50% answer, exact compiled input and internal-only specialist calculation. The local authenticated Playwright case additionally covers scope confirmation, real worker approval, persisted draft, selected premise answer, successor run and persisted shadow fingerprints. Its synthetic XLSX is generated and parsed with the real parser; no financial result is seeded. This browser case has not been run in this checkout because no local Docker/Supabase stack is available; CI execution remains required. No paid model calls or production writes were made.

Validation at this checkpoint: 34 focused worker tests and 4 web/result-fixture tests passed; both application typechecks passed. Full `pnpm check` passed (lint, types, tests and 43/43 build tasks). The browser fixture deliberately uses separate tape and support workbooks: current scope retains only the selected primary sheet, so selecting supporting sheets inside that same workbook remains an explicit product limitation.

## 10 September 2026: selective R01 document supplement integration (isolated)

Recovered the missing deterministic spreadsheet-to-R01 draft adapter from the old receivables stack, applied selectively on main 576d042. Only documents admitted by the existing confirmed receivables evidence scope can enter it. The adapter populates source-linked cedent, title, cash, accounting and explicitly supplied policy/structure fields, then persists through the existing capability-bound supplement RPC. Current period checks, approval controls and specialist dispatch remain unchanged.

Corrections made during integration: the patch fingerprint includes governed fields and dataset identity; impossible calendar dates, ambiguous monetary separators and amounts requiring rounding are rejected; refreshing documents preserves later user-premise revisions instead of replaying an old patch against a successor draft. Question suppression is restricted to exact missing-assembly requirements already satisfied by the current draft. Temporal gaps, conflicts, unknown requirements and incomplete raw event history remain visible.

Validation: 34 focused worker tests passed across adapter parsing, method-input resolution, case analysis, evidence questions and deterministic in-memory R01 assembly. The lifecycle fixture is checked byte-structure-equivalent to actual adapter output. The expanded `supabase/tests/receivables_document_adapter_persistence.sql` passed in staging through the integration coordinator: exact document patch persistence/replay, capability-protected reload, later premise revision, completed-draft reload and tenant/revision rejection. No schema migration or paid model call was needed.

This is not evidence of a live authenticated document-upload → premise-answer → persisted specialist-artifact journey. The offline specialist assertion uses a synthetic detector report, and persistence is proved in a separate rollback transaction. Public UI progress/template recovery from the older PR stack is not included. No production deployment or activation is claimed. Full local `pnpm check` passed (lint, types, tests, 43/43 build tasks); see `HANDOFF_2026-09-10_RECEIVABLES_ADAPTER.md` for the scoped receipt.

## 10 September 2026: finish the second documentary evaluation within its existing limits

PR588 is published on main d3763a7 (web deployment6369897088, worker revision311); post-merge Quality and Security passed. The worker definition is false and stable; the optional boot-log read was unavailable. No claim of an observed boot event is made.

Run34467680287 passed six requests, three repeat comparisons and seven controls. It made25 known-cost calls totaling USD0.914770. The eighth control never reached a provider: an earlier control used fallback after invalid issue-code enums, exhausting the evaluator's eight-call control partition. This is incomplete coverage, not a semantic failure of the unexecuted control, and not acceptance. Both planning flags remain off.

The evaluator now gives controls only the unused calls from the existing26-call aggregate ceiling, keeping gold at most18/USD2.50 and controls at mostUSD0.50. Acceptance requires all eight distinct controls to have executed and passed; retries are counted. Diagnostics distinguish a control never called for budget reasons from a rejected response.

CI caught the existing evaluation-role consumer allowlist rejecting the new workflow. The boundary test now explicitly admits only this named continuation with its stricter first-attempt condition and actions-read permission; every other consumer retains the original permission/condition checks. Workflow and CI-script files are now global cache dependencies so local checks cannot reuse stale package test results after those root files change.

A dedicated, single-use continuation can complete only the previously uncalled control from that exact run. Its immutable parent receipt is pinned by SHA-256; current fixtures, reviewer, gateway, scorer and dependencies must match the evaluated version. It permits one HTTP call, no SDK retry, within the remainingUSD0.255978 control allocation. Any earlier continuation, rerun, incomplete run inventory or changed implementation fails closed before provider access. The original failed receipt remains unchanged; a linked receipt records the combined result and cumulative cost/count. This uses the last of the26 attempts already authorized, not a fresh evaluation round. No continuation has been dispatched at this checkpoint.

Local pnpm check passed after integration (43/43 build tasks). Allocation/diagnostic17 and receipt/workflow14 focused tests passed. Validation and activation remain separate: required CI must pass before dispatching the continuation once. Activate only if the combined eight-control acceptance is proved. A timeout consumes the last slot; no automatic retry or additional paid round is authorized. No customer fixtures, new database migration, IAM expansion or external contact is part of this correction.

## 10 September 2026: integrated financial delivery and provider case fit, pending promotion


The final budget review found and corrected hidden SDK retries, concurrent call-slot admission and missing usage being reported as zero. The documentary evaluator disables SDK retries per request; gateway attempts alone own the authorized count. In-flight attempts reserve a slot before awaiting the provider, and missing/invalid usage retains its cost reservation with unknown-cost telemetry. Anthropic cache-write usage is accounted separately at the current five-minute write tariff; conservative reservations cover that write premium. Rerunning the same GitHub evaluation is refused before provider access. A new workflow dispatch is still an operational authorization decision, not automatic idempotency. Final combined pnpm check passed after these fixes (lint, types, tests and 43/43 build tasks); focused gateway61 and environment12 tests passed. No second paid evaluation has been dispatched at this checkpoint.

Documentary production preparation after PR587: the founder explicitly authorized documentary_field_assessments_contract in production and one second synthetic live round capped at USD3/26 attempts. The migration is applied as 20260910100522; its SQL is unchanged. The v1/v14 documentary definitions match staging, provider plan callers and institutional functions are unchanged, and security advisors report zero lints. Both planning flags remain off. Full local pnpm check passed after integration (43/43 build tasks); focused gateway39 and rollout16 tests passed. Required CI and the authorized real evaluation remain pending.

The live evaluator now opts into conservative textual reservations based on the actual serialized provider payload, full system/schema/instructions, UTF-8 size, framing allowance and maximum output. Unknown prices and non-text inputs are refused before a call; retry/fallback share the existing18+8 attempt and USD2.50+0.50 partitions. This is conservative list-price exposure control, not a claim about an external provider invoice. Default production reservation and SDK retry policies are unchanged; corrected usage accounting and concurrent call admission apply to every gateway. The second paid round has not been dispatched.

The worker rollout reads a strictly validated repository variable with defaultfalse, preserving the versioned configuration. A read-only post-rollout diagnostic checks the exact running revision and a safe worker.boot boolean; missing AWS permission/evidence is explicitly unavailable, while a contradictory flag fails verification. No IAM privileges were added. Activate worker first and web only after live acceptance and verified rollout; existing approved jobs are not cancelled by closing new-plan admission.

Production database promotion completed after every check passed on b19f439. The eight migrations were applied to ifnogpksgdadruooqydi as 20260910072024, 072039, 072054, 072110, 072126, 072135, 072146 and 072157 (all 20260910). Filenames now match production history; all eight SQL SHA-256 hashes are unchanged. Fourteen essential function definitions and grants match staging, v17 is admitted without accreditation, result-table RLS/deny-all policies remain intact and anonymous RPC execution is denied. Security advisors returned zero lints; generated production TypeScript types are byte-identical to the checked-in types. No customer data or production fixtures were used. The documentary migration remains separate and unapplied. The code release still requires the final commit checks and successful web/worker deployments.

The pre-promotion E2E passed 27 tests, with 15 preexisting gated tests skipped. The institutional journey passed on its first attempt in 17.6 seconds, fetched XLSX/DOCX/PPTX/PDF successfully with verified binary signatures, and preserved the result identity on reload. Skipped documentary and live-preview cases do not count as acceptance.

CI head2ab175b passed database, quality and security. The financial browser journey completed setup, review and approval; both setup and calculation worker jobs succeeded with zero model calls. It then exposed a UI continuity defect: refresh restored the previous review hash and hid the selected result panel. The calculation receipt was available (result navigation remained present), but four-format downloads were not reached. Fix panel navigation through the framework-integrated History API; retain the complete E2E requirement. The navigation correction now uses the History API integrated by Next and preserves the selected panel when work-product props refresh. A Chrome proof exercised the actual hook and work surface: stale hash plus new props, queued-to-completed continuity, explicit hash navigation, back/forward and removal fallback passed without browser errors. The complete local pnpm check also passed. Full platform E2E remains required before promotion.

PR587 head172a210 reached the actual institutional setup worker in CI, which correctly rejected two unbound debt-rate sources. The guided form had accepted free-text source names where the adapter requires a reviewed document ID and its exact reviewed date. This is a product integration defect, not a missing navigation element; correction must preserve the source guard and include debt-only documents in metadata review. Provider E2E passed again. The same run hit a 5-second timeout in the unchanged Rede Horizonte anchor; its isolated rerun passed in 344ms, without changing limits. Neither result permits production promotion. The correction selects current documents by ID while displaying their names, includes documents used only for debt in explicit metadata review, and derives each rate date from the reviewed source date. Four compiler-to-adapter regressions cover valid separate debt sources and reject display names, missing reviews and mismatched dates. UI/reader/adapter focused tests passed; the complete local pnpm check passed after integration. The revised browser journey still requires a full CI pass; no source validator, timeout or approval gate was relaxed.

Working branch: `feat/endgame-model-market-materials`. The integrated financial/market work remains pending promotion. Separately, PR586 is merged on main (`a2f11fb`); the root verified Vercel production deployment 6365060156 as successful. The root also verified worker deployment 34440152370 as successful. The documentary production migration remains blocked pending explicit authorization. Do not infer integrated financial deployment from the separate documentary release.
Release ordering verification: production metadata was read without accessing customer documents or financial values. It showed no case-analysis accreditations, zero operating-control snapshots, v16 admitted and v17 not yet admitted. Apply and verify all eight additive migrations, including the v17 scope, before merging/deploying the financial worker. Without the scope migration, full-case control recording can fail. Admission does not confer accreditation; recommendation and external-release gates remain unchanged and are not claimed as completed.
Final affected-proof rerun: the staging institutional lifecycle passed again with the regenerated workbook receipt after localizing non-computable metrics in PT/EN. The rollback-only test required no migration; financial calculations and configuration were unchanged. The financial work is frozen for integrated release checks.

PR587 CodeQL reported two high alerts on the DOCX row-length stripping expression. The expression was removed and replaced by a single-pass numeric measurement of generated XML; user text continues to be escaped before XML construction. The adversarial regression with 50,000 opening angle brackets passed; case-export17 and four-format route12 tests passed, build43/43 passed, and both PT/EN DOCX outputs are byte-identical to the fully inspected QA artifacts. The new CodeQL result is still required before merge; no alert was dismissed or suppressed.

The first PR587 UI run exposed two integration failures: institutional navigation matched both a navigation link and a shortcut; the provider form rendered message keys because LocaleLayout omitted new client namespaces. The institutional test now selects the canonical navigation and waits for a completed result. LocaleLayout now uses a shared client-message projection, with regression checks against actual client components in both languages. No timeout, skip or operating gate was relaxed. The combined local pnpm check passed after these fixes; the next complete CI E2E and CodeQL run must pass before promotion.


Implemented in this branch: source-bound institutional setup; review and deterministic calculation with a persisted result receipt; authenticated project result downloads in XLSX, DOCX, PPTX and PDF; provider case-fit criteria and persisted mandate comparison; historical provider results distinct from the current result. The corrected documentary reviewer contract is isolated from this integrated work and was merged through PR586. This checkpoint is implementation evidence, not a production completion claim.

Validation to date: the final expanded `supabase/tests/institutional_setup_lifecycle.sql`, using the latest renderer receipt fixture, passed against staging `gjkkjtbfnssdsbmlhmwk`. It exercises 15 current anchored historical facts, explicit source reviews, setup/review/calculation dispatch, immutable result persistence, exact request replay, foreign-user denial, changed period and economic-value rejection, and withdrawal of stale artifacts. Failed, cancelled, poisoned and completed-without-output jobs return a terminal blocked view rather than polling forever. The SQL fixture adapts server timestamps to test persistence; unchanged binary replay is a separate renderer test, not a claimed SQL rendering check.

Case engine `2026.09.10-v17` now has its own admitted operating scope. Migration `20260910051011_case_engine_v17_institutional_scope.sql` is applied in staging; `operating_controls.sql` passed and proves v17 does not inherit prior accreditation. The corrected runtime variable binding and terminal-result reader are forward migrations, preserving applied history. Final security advisors returned zero lints. Performance advisors reported only INFO notices: 27 uncovered foreign keys (none on the new institutional tables), 232 unused indexes and one Auth connection allocation notice. No grants were added to expose private tables or the private hashing function. Current database types were regenerated from staging (+66 lines of new RPC declarations).

Final focused local checks: financial-model 89 tests and case-engine 36 tests passed after layout corrections; the workbook's four tests passed again after adding the synchronous schema-and-fingerprint validator, without changing workbook bytes. Worker setup/result adapter and actual advisor refresh routing: five tests passed, including zero gateway calls; existing case-analysis/setup regressions: 13 passed. Provider persistence lifecycle passed in staging. Independent visual QA inspected PT/EN documents, presentations, PDFs and workbook printouts; source metadata and review records are now included in all formats. The four-format result route passed 12 tests using the actual institutional artifact. Full integrated check and final promotion remain separate release gates.

Staging migration identities for this financial/market batch: provider fit `20260910042503` and alias fix `20260910042720`; institutional setup `20260910043242`, binding guards `20260910044923`, variable fix `20260910045029`, approved results `20260910050112`, engine scope `20260910051011`, terminal result status `20260910051519`. Local filenames were reconciled against staging migration history. The documentary migration already merged in PR586 was not renamed or applied to production by this task.

Limits: the institutional XLSX is an approved calculation snapshot, without local formula recalculation. Editing and explicit reapproval in the platform trigger a bounded deterministic recalculation; the default consumer uses the current approved revision only. The multi-scenario renderer does not imply that all historical revisions were requested as comparisons, and an explicit comparison-selection workflow is not yet delivered. Generic presentation rendering alone does not prove senior advisory storytelling for every use case. Sector-specific coverage is not inferred from the corporate aggregate setup. Mandate data must be authorized and current; directory identity does not establish financing appetite. No external contact is authorized by a match result.

Documentary activation remains off. The authorized first live run (34436558806) cost USD0.653986, passed 6/6 requests but only 7/8 controls. The new field-by-field reviewer contract has not yet passed a second live evaluation; a second paid round requires the pending explicit authorization. No paid retry or activation follows from this checkpoint.

## 10 September: documentary review assesses every authored field

Real-model run34436558806 on31407f6 passed6/6 documentary requests and7/8
negative controls, consuming USD0.653986 over24 attempts. The reviewer omitted
an unsupported English claim of covenant absence while reporting two Portuguese
issues in the same response. This is failed acceptance, not activation evidence.

Method v12 requires one source-bound verdict and exact excerpt per authored
field, with complete coverage and consistent issues for every unsupported verdict.
Registry v15 and a forward migration preserve exact approved v14 plans. The
independent provider-research graph remains pinned to v14.

Local executor488 tests, work-plan151 tests and eval133 tests passed. The new
migration applied to staging. A second real-model evaluation has been requested;
it has not been authorized or executed at this checkpoint. Production planning
remains disabled. This change does not claim semantic perfection from schema checks.

## 9 September: review v16 operating-control compatibility

PR584 Quality run34405085387 failed the approved receivables-scope journey with
`operating_control_capability_scope_invalid`, twice, with zero model calls in
the failing jobs. The v16 engine scope was rejected by the database v15-only
allowlist. The earlier summary-schema hypothesis was not the cause.

Migration20260910013934 adds the exact v16 scope and rejects null/unknown scopes.
It preserves capability, tenant, frozen-input, report, time and quality checks;
it neither grants privileges nor copies v15 accreditation to v16. SQL regression
coverage records v16 as blocked without accreditation and rejects forged tokens.
Staging migration applied; transaction-rolled-back operating-controls SQL passed,
security advisor returned zero lints and regenerated types are byte-equivalent.
Full local check passed from valid cache (43/43 packages per task).
Production migration applied after verifying the destination in deployed commit68119a8
and successful worker run34403037571. Production security advisor: zero lints;
v16 guard present and anonymous execution refused. Staging used timestamp20260910013207
for identical SQL. Exact-head CI remains pending before merge.
Controls APP-03/04/10/11: existing guards retained; no new disclosure or external action.
Rollback worker to v15 remains compatible with the additive scope migration.

## 9 September: connect institutional workbook compilation to download

The case engine generated governed/styled XLSX bytes while the authenticated download
route regenerated the plain legacy workbook. Even unchanged financial inputs therefore
failed the approved hash comparison. Engine-to-download PT/EN tests reproduce that mismatch.

New artifacts persist the exact renderer version and localized metadata in their existing
fingerprinted payload. The authorized material loader preserves/validates this contract.
Download invokes the same governed renderer and still requires both approved SHA256 and
byte length. Unknown renderer versions, altered metadata and changed economics are refused.
Historical plain workbooks retain exact-byte replay; old styled artifacts without metadata
require recompilation, never an invented rendering date or a replaced approval hash.
Case engine version v16 invalidates old execution caches. No DB migration or permission change.

Financial-model tests and33 engine tests passed, including compiler-to-download identity
in both languages and rejection of the original renderer. Loader tests preserve the full
contract and reject incomplete localization. Existing style/formulas are unchanged, so no
new layout acceptance is claimed. Root review; controls APP-03/04/10/11 unchanged. Existing
production-plan/tenant checks remain. Rollback code; legacy payloads remain readable.
Complete combined local lint, typecheck, tests and build passed43/43 packages each.
Financial-model38, engine33 and loader3 focused tests passed. This repairs XLSX delivery;
it does not connect the separate institutional financial calculation engine or finish endgame.

## 9 September: retain company and request context in executive summaries

Actual run34400372257 passed semantic/numeric review in Portuguese but its summary
omitted the company identity already present in the body. The gate correctly rejected
that omission. The canonical synthesis contract now identifies opening anchors, and the
compiler prepends only existing material factual claims from identity/request sections
when their support is absent from the selected summary. All body claims, numbers, sources
and selected conclusions remain unchanged. Missing facts are not generated; judgments and
non-material claims cannot be promoted into factual opening context. Text/id limits still
fail closed instead of silently dropping conclusions. The compiler adds context only when
the provider already authored that factual claim; it never rejects or invents a missing
opening. Understanding version v8.

Offline replay of both persisted synthetic outputs from34400372257 now passes the
existing summary coverage predicate: PT gains identity; EN stays unchanged. Both are
idempotent with byte-equivalent sections. Zero model calls; this is not new live acceptance.
117 understanding tests passed including missing/duplicated context, non-material and
judgment refusal, supplied evidence and overflow. Complete local lint, typecheck, tests and build passed43/43 packages each.
Worker464 tests include a material sourced brief and both independent review stages. Controls APP-03/10, AI-05/07/08 unchanged; no provider, budget, permissions,
database or disclosure changes. Numerical and independent semantic reviews still execute
on all material claims. Root review; rollback code/version. Documentary activation and
full endgame remain unaccepted.

## 9 September: route an initial public analytical draft into the released plan

A real public-company meeting request completed its advisor response but remained idle:
compile/proposal was rejected before the released analysis planner. The first public draft
now enters the existing planner for company debt, origination thesis or capital planning.
Private information, existing products, active work, missing context, simulation, approvals
and external circulation keep their existing boundaries. Plan consent remains required.
Routing uses zero model calls. No database, provider, budget or permission changes.

Validation: full local lint, typecheck, tests and build passed all43 packages; worker464
and router227 tests passed, including the reproduced request, PT/EN drafts and negative
authority/context cases. Root review performed. Production UI completion is not proven:
subsequent verification was blocked by the session usage limit. No new paid evaluation.
Rollback is a code revert. Controls APP-03/10 and AI-05/07/08 remain unchanged.

## 9 September: direct Word navigation to the original source table

Visual inspection of the actual PR578 documentary journey exposed two incompatible
numbering sequences: the source table kept passage numbers while Word reassigned them
by first observation. Its appended reference index then contained entries such as [1]3.

Documentary Word exports now bind each citation number to its exact existing source-table
row. The renderer validates unique identities/numbers/locations, existing table rows and
complete coverage of cited ids, then emits direct internal bookmarks. It omits the duplicate
appendix for this explicit mode. Other materials keep the existing general reference index.
All observations, quotes, hypotheses, gaps, document identities, versions and hashes stay
unchanged. No model call or new inference. case-export renderer version2026.09.09-v2.

Focused export9 and actual downloadable Word projection5 tests passed. Full local lint,
typecheck, tests and build passed43/43 packages in each stage. Three persisted synthetic
executor results were exported and rendered; all six pages were visually inspected, without
clipping, missing text, empty pages or reference remapping. These are distinct fixtures from
the Portuguese UI reproduction; no before/after page-count improvement is claimed. Repeated
observations and section-purpose mismatch remain editorial issues, not resolved by this fix.

APP-03/04/10/11: existing tenant authorization and private download route unchanged. The
references remain inside the same Word and create no external access. No data migration,
provider or changed financial values. Rollback restores the renderer/projection. Root review
performed; no independent agent available. This is navigation QA, not institutional-content
or endgame acceptance.

## 9 September: require complete claim coverage in the provider response

Actual synthesis run34396953333 accepted English but rejected Portuguese because the fresh
review omitted proj_gap_schedule. No numeric failure was reported in either language.
The run used six attempts/USD1.415086. Both drafts and review phases remain retained.

The provider response now requires a verdict under each material claim’s exact key.
A strict object rejects omitted or foreign identities before expansion to the unchanged
canonical audit array. Duplicate source claim ids fail before provider invocation. Both
critique/revision and fresh support-only review use this contract in the worker and live
evaluation. The model never supplies or changes the identity binding itself. Downstream
semantic rejection, numeric checks, independent provider, three-call claims budget, one
revision limit, judgment approval and disclosure boundaries are unchanged.

Understanding version v7 invalidates earlier cached results. No schema migration, grant,
new provider, production fixture or telemetry payload. Controls APP-03/10 and AI-05/07/08.
Rollback restores prior code; persisted audit/history shapes remain compatible. Focused
understanding tests111 passed, including exact provider-schema required keys, omission,
foreign keys and duplicate source identities. Full local lint, typecheck, tests and
build passed43/43 packages in each stage. Actual provider execution remains required. Root review performed; no independent agent available.
This is a correction of a reproduced execution failure, not full product acceptance.

## 9 September: restore ordinary advisor response execution

The founder's existing public-company meeting request was resumed through the production UI.
It failed again on09/09 at19:39UTC before delivering a response. The current persisted cause
was model_exhausted for agent_operation_brief, with five attempts, USD0.123075 measured and
USD0.2301974 exposure, including two unknown-cost calls. The earlier03/09 failure recorded
truncation and providerHTTP400. No production fixture or database repair was used.

The ordinary advisor response now uses the existing prompted-JSON transport for its nested
activation/patch schema, preserving full Zod refinements and all downstream authority checks.
Its output ceiling uses the existing6000-token task policy instead of overriding it to2000.
Job call and monetary ceilings stay unchanged; bounded gateway repairs consume them.
The exact request contract is shared with a protected synthetic provider probe. The probe
compares prior/current shapes on both providers within eight attempts/USD1, with no fallback
masking a failed provider. That proof and UI resumption remain pending after integration.

Ordinary advisor failures now retain the existing closed per-attempt diagnostic projection.
No prompt, response, schema payload or raw provider message enters it. Regression proves
HTTP status retained and hostile provider content omitted. Worker tests463 passed, including
ordinary scoped conversation and unchanged external-action boundaries. Full local checks
passed again on the combined change: lint, typecheck, tests and build each43/43 packages. No new runtime capability, secret, RLS policy, grant or production flag.

PR578 UI run34395494396 ended green only after a whole serial-suite retry: the first
meeting case failed source review. Final files exist for all three tasks, but this is flaky
acceptance, not a clean pass. It used41 model calls (40successful), USD1.8567 in job ledgers.
The protected documentary journey now disables Playwright retries; a failed execution must
remain a failed gate. No product retry or approval boundary is bypassed.

## 9 September: distinguish diligence questions from factual commitments

PR578 actual executor run34395491660 passed five of six requests and all seven source
controls, using USD0.525727 in twenty-two provider attempts. It remains failed. The last
review first rejected an unsupported inference about a missing covenant. Its replacement
corrected that inference; the fresh review then rejected two ordinary diligence questions
because it read document availability as a delivery promise and an open question about
other protections as proof those protections existed. The canonical method itself already
allowed that conditional question. All original/revised outputs and rejections are retained.

Method v10 clarifies that an ordinary request for missing information is not a factual
commitment or a claim that a particular protection exists. Named undocumented guarantees,
committed actions, financial relationships, entity attribution and unsupported consequences
remain rejectable. A new mixed positive/negative control preserves the two reproduced
questions and separately requires rejection of an invented management commitment and
parent guarantee. The previous seven controls and six gold requests are unchanged.
The control partition adds one call (eight total); gold remains eighteen calls/USD2.50,
controls USD0.50 and aggregate USD3. No production job budget changes.

Registry v13 pins method v10. Migration20260909194038 was applied only to data-less staging,
after health/lock checks. Exact v9-v13 persistence and foreign/mixed-contract rejection passed
with transaction rollback. Types regenerated byte-identical to PR578. Security advisor has
zero lints; performance retains27 unindexed foreign keys,227 unused indexes and Auth pool
strategy INFO. No production migration, activation, borrower-data rewrite or new grant.

Focused validation passed612 tests (work-plan144, worker462, eval6). Full local lint, typecheck, tests and build passed43/43 in all four stages.
Actual model/application execution remains required before promotion. Root review performed;
independent agent review is unavailable. Controls APP-03/04/10/11 and AI-05/07/08 retain
source identity, private storage, approval and disclosure boundaries. Rollback restores the
prior method while retaining exact previously approved plans. This is not endgame acceptance.

## 9 September: one verified revision before executive synthesis delivery

PR576 actual run 34392141566 removed the numeric/reference contract failures, but
rejected three Portuguese and thirteen English assertions in semantic review. Both
languages remained failed; four provider attempts cost USD0.820586. That evidence is
retained. Production Word readability is integrated separately in PR577.

The analysis now has one bounded critique/revision followed by a fresh support-only
review. The critique must review the original claims and may patch exactly the rejected
ids using the current evidence catalog. Code preserves supported claims, original ids,
materiality and summary selection; it recomposes the summary and reruns numeric checks.
A final review receives only each claim's own support and uses a different provider
from the author of the candidate text. Provider fallback is disabled for reviews so it
cannot return to that author. Even a clean critique requires that final review.
Missing/duplicate reviews, unsolicited patches, changed supported claims, invented
support/amounts and a second rejection cannot produce an accepted brief.

Both attempts are retained with their phase in private case state. Human judgment
approval and external circulation remain separate gates. The existing three-call claims
budget and aggregate case budget are unchanged; actual additional calls and costs are
counted. Understanding v6 invalidates caches; the database-pinned engine scope is unchanged.
The live synthesis evaluation uses this same control flow and additionally enforces the
per-case claims ceiling. No retries are added outside the bounded flow.

The prior base prompt incorrectly equated a gap with documentary absence; it now uses
the scoped requirement contract. Explicit small currency values (including values that
look like years) now enter numerical auditing instead of being discarded as ordinals.
This does not certify every percentage, rate, quantity or materiality classification.

Focused validation passed 604 tests (109 understanding, 33 engine, 462 worker), including
repair boundaries, fresh review, rejected-draft retention, invented numbers, currency
recognition and human approval. Full local check passed 43/43 in all four stages.
Actual model execution must still be accepted after integration; no release promotion
or complete product acceptance is claimed from these tests.

Controls APP-03/04/10/11 and AI-05/07/08: same private evidence and provider boundary,
no schema, RLS, grant, production flag, external action or telemetry change. Root review
performed; independent agent review is unavailable. Rollback restores the prior code;
no persisted source is rewritten. This change does not complete E2-E9 of the delivery plan.

## 9 September: ordinary documentary requests and issuer attribution

A person can request a comparison, meeting preparation or opportunity review in ordinary
language. The starting compiler proposes its own documentary scope instead of requiring
the person to type internal terms such as preliminary documentary reading. The original
request remains in the persisted brief and its limitations remain visible before approval.
Explicit calculations and negated requests continue on their prior route; no existing plan
is replaced. The provider-backed journey now uses ordinary requests and checks the visible
scope and original objective before approval.

Documentary method v9 distinguishes proposals/versions from their issuers and prohibits
invented counterparty intentions. The existing six executor requests and five mixed review
controls are retained. Two additional reviewer controls cover unsupported distinct-party
attribution and a documented common issuer. Gold remains 18 calls/USD2.50; reviewer controls
become seven calls within the existing USD0.50 partition. Aggregate dollars stay USD3.

Migration 20260909190702 was applied only to the data-less staging branch. Exact registry
v12/method v9 is added while v11/v10/v9 snapshots remain accepted. The persistence, replay,
compatibility and authorization SQL test passed with all writes rolled back. Security:
zero lints; performance advisories are INFO. Generated API types retain the same signatures
with only generator ordering changes. Focused validation passed 612 tests; full local check
passed all 43 packages in all four stages before incorporating the independent Word change.
The post-integration check is recorded with the PR evidence.

Controls APP-03/04/10/11 and AI-05/07/08 retain private access, approval binding and review
limits. No production migration or activation flag changed. Previous executor 34380089624
remains FAIL 5/6; do not promote on this code change alone. New actual executor and complete
interface journey evidence are required after integration. Rollback disables new documentary
planning and restores prior code; earlier approved snapshots remain valid. Root review was
performed; no independent agent review is claimed.

## 9 September: readable evidence references in Word materials

Word paragraphs and financial metrics now use short clickable reference markers.
Exact support ids appear once in a reference index at the end, preserving every
financial value and claim while removing long technical ids from the reading flow.
Key-value and callout blocks also retain their support metadata. The generated
archive uses internal bookmarks only; it adds no external URLs or network calls.
Proofing language follows Portuguese or English output; tables still repeat headers,
keep rows together and preserve existing pagination.

Seven focused export tests passed, including deduplication, XML escaping, bookmark
binding and value preservation. Full local check passed all 43 packages in lint,
typecheck, tests and production build after incorporating main fe86b35. Two synthetic
materials were rendered with the product exporter and both pages visually inspected.
The fixture prose remains synthetic and is not an approved institutional example.
This change is renderer readability, not certification of editorial quality, native
charts, company templates or the complete Office delivery journey.

Controls APP-04/10 and AI-07: no schema, permissions, private download authorization,
model policy, external effects, telemetry or retention changed. Existing download
routes consume this renderer. Root code review is not an independent agent review.
Rollback is the previous renderer; no persisted source or result is rewritten.
PR576 is integrated; its actual executive-synthesis evaluation is still in progress.
Documentary activation remains subject to its separate evidence and release controls.

## 9 September: one evidence contract from author to material

PR575 is integrated at a24deac. Live evaluation34388571845 failed both languages before
semantic review:20/17 unsupported material claims, seven missing calculation references
in each output, plus ambiguous repeated summary text in English. Two author calls cost
USD0.594637. This is retained failure evidence, not an accepted analytical capability.

The author now selects summary claim ids; deterministic code assembles the text. New
briefs retain these ids and legacy briefs keep exact-text binding. Authoring support ids
come from the same catalog as numerical and semantic review: facts, calculations, scoped
unsatisfied requirements and the current reconciliation review. Requirement evidence is
not evidence of universal documentary absence and cannot support financial magnitudes.
The semantic reviewer sees those scope restrictions. Unknown ids, repeated/unknown summary
selections, stale gap references, changed summary text and ambiguous period aliases fail.

Worker, engine verification and material compilation propagate the same current gap and
exception context. Module versions invalidate cached outputs without changing the SQL
capability scope. No schema/RLS/grant/production flag change or persisted brief rewrite.
Existing semantic review, judgment approval and external-release gates remain required.
This does not certify arbitrary documents, claim materiality classification, integrated
model production, institutional visual quality or the complete endgame.

Focused validation:651 tests across understanding, materials, engine and worker passed.
Full pnpm check passed43/43 in lint, typecheck, tests and build. Protected real-provider
evidence follows integration. New
negative tests cover citation identity, gap thresholds, stale requirements, period scope,
summary selection and material propagation. APP-03/04/10/11 and AI-05/07/08 retain the
same private source boundary and providers. No new telemetry or data retention. Rollback
is code deployment, with no data migration. Independent agent review remains unavailable
because the existing account allowance is exhausted; primary review is not independent.

## 9 September: bind executive synthesis to structured claims

Executive summaries previously travelled as independent text and were compiled as
non-material paragraphs. The brief auditor now requires an unambiguous sequence of
complete structured claims. Added prose, changed numbers, partial claims, duplicate
selection and ambiguous attribution block the brief. Whitespace differences do not
change the binding. The claim registry independently blocks an unbound summary.

The material compiler preserves summary claim ids, support ids, materiality and kind.
The case screen and Markdown export render bound claim paragraphs with their support;
legacy unbound summaries show the existing blocked message while retaining the sections.
Existing semantic review and human judgment approval remain separate and unchanged.
This closes the independent summary-text path, not every possible misclassification of
an original claim. It does not certify all analysis or promote documentary planning.

The authoring contract lives in canonical procedures/executive-synthesis.ts and is
projected into the existing brief prompt. Requested output locale is now explicit.
Synthetic factory, anchor and unit inputs select their actual structured claims instead
of unreviewed placeholder summaries. No source document or reference numeric value changed.

Full local check passed all43 packages in lint, typecheck, tests and production build.
Two synthetic Word files were generated through the existing compiler and renderer;
both pages were visually inspected for source preservation and clipping. This is
functional renderer evidence, not institutional editorial acceptance. Module versions
now participate in every engine cache key, so old summaries/materials cannot be reused
under the updated audit. The database-pinned capability scope remains unchanged.
Full validation also passed after that cache correction. A protected optional executive-synthesis suite reuses the existing
main-only workflow and credentials, with a separate fixed USD3/eight-attempt cap. It
requests Portuguese and English output, runs the existing writer policy and a different
reviewer provider, records every attempt and pending judgments, and does not approve
release. The default documentary suite and its budgets are unchanged. Live evidence
must be recorded after integration; no authenticated full-product journey is claimed.

Controls APP-03/04/10/11 and AI-05/07/08: same private source boundary, no schema, RLS,
grants or production feature flags changed. Reviewer evidence is synthetic only. Rollback
restores the previous code; no persisted data is rewritten. Old unbound summaries require
regeneration before display/export as synthesis. Independent agent review remains
unavailable due the previously exhausted allowance.

## 9 September: documentary Word readability

PR573 is integrated at main12b8be2. Actual journey34380092460 passed all four
checks without test retries and downloaded comparison, meeting and review Word files.
Separate executor34380089624 remains FAIL5/6 with controls5/5: an unsupported inference
that proposals represent distinct counterparties was blocked. The documentary flag
remains false and the new database contracts remain staging-only.

The Word projection now uses numbered passage references, groups sources by exact
document id, name, version and hash, and preserves every source passage in editable
tables. Hypotheses and missing information remain paired with their questions in
tables. Empty observation sections are omitted rather than printed as empty headings.
Word tables repeat their headers, keep ordinary rows together across page breaks,
and footers contain automatic current and total page fields.

No analysis text, economic value, source quote, permissions, schema, model, task
maturity or production feature flag changes. APP-03/04/10 and AI-05/07 boundaries remain
unchanged: export projects an already authorized persisted result. Numeric references
are passage identifiers, not evidence of separate counterparties. Rollback is the
previous renderer; retained work products require no migration.

Seven focused tests passed, including same-name document separation, full passage
preservation, deterministic output and Word pagination fields. Three accepted synthetic
executor outputs were rendered through the modified product exporter; all six English
pages were inspected. They were generated locally for renderer QA, not downloaded from
a new live journey. No clipping or broken rows observed. Full local check passed all
four stages (43/43 each); remote delivery remains pending. The initial sandbox build
could not start its child process; a clean authorized build passed. This is a readability improvement, not certification of
institutional analysis: repeated prose, stronger synthesis, task-specific comparison
matrices, financial exhibits and the outstanding semantic failure remain open.

## 9 September: one independently checked documentary revision

Real executor 34376495901 completed all 12 model calls without truncation or fallback,
but passed only four of six requests. Both meeting attempts failed semantic review;
all five authored review controls passed. Compact selections fixed the observed output
transport problem in this run, not semantic consistency or the complete user journey.

The critic may now propose one complete replacement when it reports issues against the
original fields. Code validates the replacement and a separate fresh review must be clean
before delivery. The critic cannot approve its own replacement. A deterministic correction
uses the same single revision allowance; malformed review, provider errors, invented sources,
unsolicited replacements and a second rejection fail closed. No fourth call is permitted.
The existing three-call per-request ceiling and gold/control aggregate budgets are unchanged.
Evidence accounting retains the first rejection and distinguishes revised from first-pass
success. No provider, production flag, task maturity or output format is promoted.

Spreadsheet evidence without parsed tables now preserves full rows, empty column positions
and source ranges. This retains short values such as a tenor together with their field
names; it does not calculate formulas or infer missing data. Duplicate cell references fail.

Method v8 / registry v11 are pinned by staging-only migration
`20260909163653_reviewed_documentary_plan_contract`. Exact v9 and v10 snapshots remain
admitted; mixed versions are rejected. SQL persistence and tenant regression passed with
rollback. Security advisors: zero lints; regenerated types unchanged; performance INFO.
Focused tests initially passed 73 cases. Full local `pnpm check` passed all four
stages (43/43 tasks each), including added adversarial replacement tests. Remote checks
and new live gates remain pending. Independent agent review remains unavailable due usage allowance exhaustion.

Journey 34376498910 displayed a completed result and retained it after reload on the
first attempt, but the test compared innerText with textContent, including collapsed
source details only on one side. The test now compares each representation with itself
and also checks the unchanged fingerprinted download URL. Comparison must visibly show
both documented tenors and guarantees, not merely a heading. The retry independently failed
semantic review. No Word was downloaded because the assertion stopped the first attempt.

Security controls: APP-03/04/10/11 and AI-05/07/08. Restricted sources stay in the existing
gateway; critic text is untrusted, source identity is reconstructed and no RLS/grant changes
are made. Rollback code and keep the documentary flag false; prior exact snapshots persist.

## 9 September: compact documentary evidence, validation in progress

The next correction addresses real journey 34372018947: the approved plan now executes,
but generation exhausted its output allowance and another attempt failed semantic review.
The model selects complete quotation IDs; code restores exact original text and citations.
Review receives full sources once and all authored fields with their related questions and
hypothesis bases. Semantic rejection, provider budgets, financial boundaries and persisted
product format remain unchanged. No maturity or production flag is promoted.

Method v7 / registry v10 use an exact new SQL contract while preserving exact prior v9
snapshots. Migration `20260909160815_compact_documentary_plan_contract` was applied only
to isolated staging. Initial SQL persistence/tenant regression passed; security advisors
reported zero lints, generated types were unchanged, performance findings remain INFO.
Focused worker/compiler tests: 65 passed. Full `pnpm check` passed all four stages
(43/43 tasks each). SQL also confirmed exact prior snapshots and rejected mixed versions.
CI, provider-backed executor and complete user journey remain pending.
No successful Word delivery is claimed.

Security impact: restricted document text still goes only to the approved model gateway;
request-local aliases are rebuilt from authorized input, never model-provided identities.
Unknown or repeated selections fail closed; more than 500 complete quote candidates fails
without silently omitting evidence. No grants, RLS, disclosure or execution authority changes.
Rollback: revert code and keep the documentary flag false; prior exact SQL snapshots remain
admitted. Independent agent review remains unavailable because its usage allowance was
exhausted; root inspection is not an independent review.

## Documentary persistence and interpretation correction, 9 September 2026

## 9 September: documentary request continuity correction

The proposal reader now returns the durable initial request (message ID and text) separately
from the confirmed economic objective. Existing documentary graphs use that request and reject
a missing or incompatible identity before recording; the new-plan flag does not reinterpret
an existing graph. Financial plans retain their economic objective. The existing SQL approval
fingerprint continues to bind request content, edits and economic context. No new authority,
provider, financial method or task maturity is introduced.

Staging migration `20260909153028_documentary_work_request_context` applied. The real SQL
proposal bridge passed request selection, separate economic context, invalid capability rejection,
held dispatch, approval and request fingerprint invalidation; all synthetic rows roll back.
Worker proposal tests: 21 passed. Full `pnpm check` passed (43/43 tasks at each stage).
Staging security advisors: zero lints; regenerated types unchanged from prior staging output.
The isolated live gate now exports bounded job failure causes, with a loopback database guard,
without payloads or capabilities. New provider-backed journey is pending.
This fixes the reproduced initial-confirmation loss; it does not claim arbitrary request revision
compilation or the full endgame. Documentary flag remains false; production migration pending.
Security: DATA-03, APP-02/03/11, AI-04/09, SDLC-08/09. Private request remains tenant/job scoped;
no request text is added to telemetry. Rollback: keep new planning disabled and revert the worker
change if necessary; additive reader field can remain. Existing explicit approval is preserved.


Baseline main `70cd83b` is deployed (Vercel6351986023, worker293). The real executor
`34363217306` failed: two of six products released, five reviewer controls passed. Independent
review found unsupported implications and false rejections of legitimate conditional questions.
The authenticated journey `34363220943` failed before upload: the initial documentary graph was
rejected by the legacy SQL task and target checks. No documentary result or Word was produced.
These failures remain preserved and are not acceptance evidence.

This candidate corrects both boundaries: strict documentary graph validation in user/worker plan
persistence, and an anchored source-review response that identifies the role, exact text and short
reason for each issue. The canonical procedure separates asserted facts, exploratory conditions
and implications; hypotheses are optional when evidence supports only a question. Method v6 and
registry v9 remain candidate/specified. No new financial methods or sector eligibility limits.

Validation is in progress. Database proof, full local/remote checks, new actual-executor runs,
authenticated journeys and Word inspection are required before activation. Planning remains false;
no maturity, capability, organization rollout or external-use permission is promoted.

Security scope: APP-02/03/04/09/11, DATA-03/13, AI-03/05/07/08/09, SDLC-07/08/10. Preserve tenant
membership, actor authorization, approval binding, exact source versions, private storage and
provider policy. SQL changes are a new migration, never edits to applied history. Staging validation
precedes production. Rollback disables web planning first and worker planning second; it does not
revoke accepted plans or delete stored results. Model budgets and failure-closed behavior remain.

Staging migration `20260909144427_strict_documentary_plan_persistence` applied successfully.
The transaction-scoped SQL regression passed: both entry jobs persist the compiler graph; replay
is idempotent; altered tasks, dependencies, effects, versions, targets and authority metadata are
rejected without partial projects; confidentiality, private access and actor/tenant boundaries remain.
Synthetic users rolled back (residual count zero). Security advisors returned zero lints; performance
advisors retain informational index/Auth configuration findings outside this function-only change.
Regenerated public TypeScript types have identical declaration blocks, differing only in order;
no public API shape changed. Compiler-to-SQL parity test passes. Production migration is pending.

Full Node24 `pnpm check` passed lint, typecheck, tests and build (43/43 tasks per stage).
Worker446, eval129, work-plan136 and web415 tests passed. Log:
`/private/tmp/offroad-documentary-plan-review-check.log`. Compiler/SQL parity and the staging
transaction test passed. Remote CI and fresh provider/journey evidence remain pending. The parallel
review agent hit the account usage limit before completing; integrator review is not represented
as independent approval. No production activation or endgame completion is claimed.

## Open business planning implementation candidate, 9 September 2026

Local candidate implements reviewed open business descriptions in the actual initial/revised
planning producer and separate named segment contexts. Contract extensions and additive compiler
characterization preserve evidence, periods and local applicability needs without new method
execution. Oversized views request explicit perimeter refinement, binding the full source packet.
See [implementation record](OPEN_BUSINESS_PLANNING_IMPLEMENTATION.md) for paths, validation and limits.
RT-04 and WFI-13 are in progress; no acceptance gate or capability is promoted. No migration,
permission change or production activation is included. Remote main was revalidated at `75ec631`.
Full Node 24 `pnpm check` PASS: 43/43 tasks in lint, typecheck, test and build; contracts 218,
specialization 59, worker 421, web 415 tests. Log: `/private/tmp/offroad-open-business-check-final.log`.
Independent review found no remaining blocker in this change.

## Open business coverage planning correction, 9 September 2026

The founder clarified that Offroad must address any business within its debt and finance mandate.
Constitution 5.2.1, Intent Atlas 6.2.1 and Execution Blueprint 8.3.1 / R5 now specify open economic
characterization, composable financial foundations, mechanisms and object-specific expertise.
Sector examples and evaluation samples are not company eligibility lists. Mixed activities retain
segments, entities and consolidation perimeters; depth depends on the request. Missing methods or
evidence block the affected task, conclusion and dependencies, while independent authorized work
may proceed. Material gaps still block dependent final deliverables; no method is authorized by analogy.

Program tasks RT-04, WFI-13 and WFI-14 reflect this architecture, including held-out businesses,
heterogeneous activities and multiple intentions. Task IDs, existing dependencies, maturity states,
capability transitions and historical evidence remain preserved; WFI-13 explicitly depends on RT-04.
This is a local planning correction, not implementation, runtime activation or production verification.
Local validation: release-governance typecheck and 178 tests passed; the four house-style tests passed.
The generated board preserves the recorded evidence baseline; its new timestamp records planning only.
Final combined Node24 local gate passed: lint, typecheck, tests and build,43/43 tasks per stage (`/private/tmp/offroad-documentary-source-review-check-final3.log`). Worker426,web413,eval126,work-plan135,document-extraction35 tests passed. Earlier local retries found only a test-fixture anchor-kind mismatch and an editorial em-dash violation; both corrected without changing runtime acceptance. Local generator smoke confirmed directory0700/file0600. Three new Auth E2E cases still require CI. No live acceptance or promotion is inferred.

## Security follow-through for the documentary release candidate

The source-review integration passed full Node 24 `pnpm check` (43/43 each stage; worker426, web413, eval126, work-plan135). Independent review found no concrete blocker. Subsequent live security inspection still found eight CodeQL high alerts open; this is not zero-high status. Alert15 was confirmed as a real quadratic-time anchor expression before verification and is now replaced with linear parsing, with valid suffix and long malformed-input regressions (22 focused tests passed). Alerts29/36 receive local-tool hardening: private randomized/exclusive temporary workbook output and cryptographic E2E run identifiers. No production credential generator changed.

Alerts24/23/28 were independently inspected as likely false positives in a fixed-prefix helper or assertions; they are not dismissed. Alerts26/27 select Auth verification operations and still require server success. Three real local-stack E2E checks now exercise invalid code/token/both and require error plus denial of workspace access; these checks await CI. No Auth implementation is changed. Detailed disposition is in `docs/security/CODEQL_TRIAGE_2026_09_09.md`. Full local gate is being rerun for the security delta before publication; scanner statuses require a fresh analysis and are not fabricated.

## Source fidelity and initial documentary planning, 9 September 2026

PR 567 is deployed as `75ec631`: web deployment `6341681265` succeeded at 03:09:47 UTC; worker `34305984891`, revision 291, reached stable PRIMARY with positive capacity at 03:15:18 UTC. Scanner smoke `34305292046` passed clean/EICAR controls. Planning remains false.

Executor `34306010822` passed its automatic checks in six first-pass responses (USD 0.14134), but independent semantic review found a P1: a hypothesis reversed Alpha quarterly versus Beta monthly reporting frequency. The automatic result is preserved and is not release acceptance. Journey `34306013004` failed before plan approval: expected three documentary workstreams, received four financial workstreams; no Word was generated. The advisor created the default financial graph before the worker, whose existing-plan guard correctly refused replacement.

Candidate v5 adds a separate stateless source-fidelity review after deterministic validation and before product construction/persistence. All authored fields require exact review coverage; missing fields, invented references, provider failure or any semantic issue fail closed. Reviewer judgment is probabilistic, not human certification. The existing provider policy, restricted-data purpose and job budget remain; at most two generation completions plus one review are allowed. Registry v8 binds the candidate method; tasks remain specified.

The advisor now selects the Q01–Q03 graph atomically with a new private project only for an explicitly preliminary documentary request with attachments and the server flag enabled. Selection and worker recognition share one pure classifier. The initial compatibility label routes all three documentary intents through private understanding/confirmation; explicit incompatible starters, ordinary financial requests and existing plans retain their current path. There is no database or consent bypass. Activation requires the same server-only flag in web and worker (worker first, web second); rollback disables web first and worker second. Neither flag is enabled by this change.

Protected evaluation v3 requires all six requests, three repeat comparisons and five authored reviewer controls (three unsupported, two legitimate). Evidence preserves every response/rejection and separates generation from review and provider retries. Budgets are fixed partitions: gold 18 attempts/USD 2.50 and controls 5 attempts/USD 0.50, aggregate USD 3. No selective retries or semantic repair loop. The authenticated workflow loads the existing masked OpenAI credential through protected OIDC for documentary runs so document classification uses its actual primary provider.

Security controls: AI-02/03/05/07/08/09/12. Same tenant-bound private sources and authorized providers; no raw production text in telemetry, new external effects, retention change, migrations or new permissions. Negative coverage includes inverted comparisons, unsupported premises, missing-information ambiguity, incomplete reviewer coverage and incompatible planning requests. Full local integration check and fresh protected evidence are pending for this candidate; previous failures remain failures.

## Reliability correction local gate passed

Full Node 24 `pnpm check` passed all four stages, 43/43 tasks per stage; worker 408, web 413 and eval 125 tests passed. Shell/Node syntax and diff checks passed. Independent review found no concrete blocker in the bounded correction or shared scanner setup. Linux scanner smoke and both protected live gates are still required; planning remains false.

## Bounded documentary correction and scanner compatibility, 9 September 2026

PR 566 published `72f4812`. New executor `34304668616` failed 5/6: one review hypothesis repeated a numeric term and the unchanged validator rejected it. Independent inspection found no categorical recurrence of unknown versus absent in these six narratives. This does not turn the failed gate into acceptance. Journey `34304670357` failed before any model call: official antivirus definitions updated successfully, but Ubuntu AppArmor disallows the custom configuration and PID paths used by the harness.

The next candidate uses the official package paths, `/etc/clamav/clamd.conf` and `/run/clamav/clamd.pid`, with AppArmor preserved. A separate read-only PR workflow proves the same scanner setup and clean/EICAR controls on Linux without model credentials or a database before merge.

Canonical method v4 permits at most one corrective regeneration after a known local output-validation rejection, using the same original sources, approved request, policy and gateway budget. A second rejection fails; provider, schema, authorization and budget failures are not retried by this layer. No rejected narrative is published or used as a source. Existing validation criteria are unchanged. Task registry v7 binds the updated method; maturity remains candidate/specified.

The live evaluation still requires all six requests and all three repeat comparisons. Its shared provider-attempt ceiling changes explicitly from six to twelve to measure the new bounded behavior; the USD 3 ceiling remains. Evidence v2 retains every structured synthetic response and rejection, reports first-pass success separately and accounts for all provider attempts. Production per-job budgets, rollout, database and planning flag are unchanged. New real evidence remains required.

## Local integration gate verified, 9 September 2026

Node 24 `pnpm check` passed lint, typecheck, tests and production build (43/43 tasks per stage) for the combined uncertainty correction, semantic reference regression, shared candidate method and real-scanner workflow setup. `git diff --check` passed. CI and both protected live gates remain required; production planning is still disabled.

## Documentary release evidence update, 9 September 2026

Authenticated journey `34302837186` finished FAIL: one signup test passed, the comparison test failed in both attempts, and two later tests did not run. The worker reported `scanner_disabled` / `scanner_unavailable` because the workflow disabled scanning; no model calls occurred and no Word result was produced. This is an environment setup failure before preliminary analysis, not evidence of a completed product journey.

The candidate protected workflow now provisions real Ubuntu ClamAV, requires a successful definition update, binds its daemon to loopback and checks PING/version plus clean and EICAR INSTREAM controls before starting the documentary worker. Syntax checks passed; actual Linux scanner readiness and the full journey still require the protected workflow. No runtime scanner guard was relaxed, and no receipt was seeded. Planning remains disabled in production.

PR 564 merged as `d1c4e281fbd8c9eec4bba8f30f6e93196703e0c1`. Web deployment `6341163404` and worker workflow `34302822687` succeeded; worker revision 289 was verified at 02:27:35 UTC. Documentary planning remains disabled.

Real executor run `34302835300` passed its original automated checks in 6/6 attempts at USD 0.170177. Independent semantic inspection found a P1: missing covenant or amortization information became assertions or presuppositions that those terms did not exist. The separate offline authored-reference review passed 4/6; it was not a new provider run. Automated success does not establish release acceptance. The original evidence is unchanged.

The candidate v3 prompt now distinguishes unknown/not supplied from absent and forbids questions that presuppose an unverified absence. It is no longer byte-identical to the deployed v2 prompt and requires new real executor and authenticated journey gates. Twenty-three authored regression checks support this bounded correction, not universal semantic verification. Canonical maturity, customer availability and founder technical-review fields remain unpromoted. The journey has now finished; the integrator will run the full local gate after batching its scanner setup correction.

## Scoped documentary release candidate, 9 September 2026

The three sequential Q tasks now bind to one canonical candidate method, `documentary-work-pipeline@2026.09.09-v3`. Task registry version is `2026.09.09-v6`; existing persisted plans remain immutable. SQL authorization checks the accepted marker, exact task IDs and target rather than registry version, procedure metadata or maturity, so this metadata change requires no migration and does not revoke existing plans. All tasks remain specified; the capability has no exposure or promoted use.

The initial metadata-only candidate preserved the v2 prompt, but the subsequent P1 semantic correction changes it; fresh live evidence is required. Focused tests passed: work-plan 123, release-governance 178, credit-playbook 331; all three typechecks passed. Full integration gate and real-provider release evidence remain pending. No feature flag, production configuration, or database changed. Founder authorization is not a human domain-review attestation. Promotion evidence and operational rollout remain the integrator's responsibility.

## Alinhamento das instruções documentais ao validador existente

Procedimento canônico atualizado para `2026.09.08-v2`: observações preservam o idioma original e igualam a citação; títulos, hipóteses, lacunas e perguntas usam o idioma solicitado e não contêm dígitos. Citações têm de 12 a 2000 caracteres e conservam a sentença completa com pontuação terminal reconhecida, linha/registro completo ou trecho integral; quando não couber, registrar a limitação. Nenhuma regra determinística foi afrouxada.

Esses desalinhamentos foram identificados por revisão estática. Eles **não diagnosticam** a rejeição original de review repeat 1 no gate `34297931569`: o código e a narrativa rejeitada não foram preservados naquela execução. O resultado original continua FAIL 5/6. Os novos diagnósticos registram somente código allowlisted e narrativa sintética rejeitada, distinta de produto, para uma futura rodada completa; não houve repetição seletiva nem nova evidência de provedor neste corte.

Segurança de dependências integrada ao ramo em `546f076`; procedimentos continuam candidate, tarefas Q01–Q03 specified e `DOCUMENTARY_WORK_PLANNING_ENABLED=false`. Sem promoção, alteração de orçamento, banco ou política de divulgação. Validação combinada final: `pnpm check` em Node 24 passou lint, typecheck, testes e build, com 43/43 tarefas em cada etapa, após a alteração canônica. CI e novas rodadas reais ainda pendentes.

## Validação real após publicação de PR560

A versão `4e61637` foi publicada com autorização explícita do fundador e planejamento documental desativado. Web Production 6340360894 e worker 34297910422 (revisão 287, PRIMARY estável e capacidade positiva) verificados.

O gate de executor 34297931569 registrou cinco sucessos em seis chamadas reais (US$ 0.126386); uma resposta de revisão foi rejeitada após o provedor responder com schema válido. Essa falha permanece registrada. O gate de jornada 34297937112 parou antes das análises porque a preparação esperava shadow, mas o bootstrap produz canary.

A correção seguinte se limita ao harness: registrar código allowlisted e narrativa sintética rejeitada separadamente de produto; preservar a política canary criada pelo bootstrap, com pipeline habilitado e saída externa desativada, sem promover políticas ou criar evidência de liberação. Regras do executor, seis repetições, orçamento e ativação de produção não mudam. Uma nova rodada real ainda é necessária.

## Dependency security patch, 9 September 2026

Five advisory fixes prepared in an isolated branch: Next 16.3.3, sharp 0.35.4, js-yaml 4.3.2, Vitest/mocker 4.1.11. Registry audit reports zero vulnerabilities; full Node 24 local gate passed (43/43 tasks in each stage). CI and publication pending. No feature flags or database changes. [Scope, evidence and rollback](../security/DEPENDENCY_PATCH_2026_09_09.md).

## Publicação autorizada: banco preparado, aplicação pendente

O fundador autorizou explicitamente as nove migrações em produção e a publicação com planejamento documental desativado. Migrações aplicadas em `ifnogpksgdadruooqydi` em 09/09/2026 UTC, versões de `20260909005407` a `20260909005540`; SQL idêntico ao validado em staging, arquivos alinhados ao registro de produção. Advisor de segurança: zero achados. Advisor de performance registra 27 chaves estrangeiras sem índice, 176 índices sem uso e configuração de conexões Auth; este corte não altera tabelas ou índices. Nenhuma fixture em produção.

Head anterior `2bac369` passou Quality34296075458/Security34296075518/Vercel: E2E22PASS,0falhas,0flaky,15provider-skips. A alteração seguinte apenas alinha nomes das migrações e registra a publicação. Aplicação/worker e modelo real ainda pendentes. `DOCUMENTARY_WORK_PLANNING_ENABLED` permanece false.

## Trabalhos documentais e área de resultados: implementação integrada, 08/09/2026

Branch `feat/advisor-work-products`, base `292d26b`. Executor comum para comparação qualitativa de propostas, briefing de reunião e revisão preliminar de oportunidade; objetivo vem do despacho aceito e é congelado com as fontes. Observações extrativas, hipóteses separadas e limites explícitos; sem novos cálculos ou decisão de crédito. Resultado integra snapshot e manifesto atuais e aparece em área de trabalho ao lado da conversa. Download Word da versão persistida usa autorização, fontes e execução atuais, preservando idioma original.

Gate local completo `pnpm check` aprovado (43/43 tarefas por etapa, Node 24). CI e publicação ainda pendentes. Testes do runner cobrem três pedidos e recusas por vínculo/fonte; reader e rota cobrem autorização, fontes, manifesto, corrida e export. Migrações aditivas e regressão SQL com rollback verificadas somente em staging. Sem publicação deste corte em produção. O E2E com modelo real ainda depende de worker autorizado; testes simulados não substituem essa evidência. Continuação implementa plano documental Q01/Q02/Q03 e execução sem motor financeiro para pedidos compatíveis em novos planos. Vínculo SQL exige tarefas e target exatos; planos financeiros existentes são preservados. A jornada com provedor real e o despacho universal seguem pendentes. O marco completo, materiais institucionais amplos, expertise setorial universal e endgame permanecem incompletos.

O planejamento documental nasce desativado por padrão (`DOCUMENTARY_WORK_PLANNING_ENABLED=false`). Progresso segue stages do job e tentativa atuais. A revisão de interrupções exige commit atômico de relatório, snapshot e conclusão; relatórios documentais anteriores não alimentam o cache financeiro. Gate protegido de executor real e jornada autenticada com três projetos estão preparados, mas ainda não executados. Integração de código não equivale à ativação ou homologação.

Escopo, aceite e rollout: [DOCUMENT_WORK_PRODUCTS_MILESTONE.md](DOCUMENT_WORK_PRODUCTS_MILESTONE.md). Controles: AI-05/AI-08, TRUST-APP-02, TRUST-DATA-02, TRUST-SDLC-01. Nenhuma nova divulgação a terceiros ou alteração de permissões de negócio.

# Build State

## Fontes de saldos: propostas ancoradas, 08/09/2026, em validação

Branch `feat/balance-source-binding`, base `168b956` (#558). Este corte entrega a primeira etapa do vínculo de saldos: o parser PDF `pdf-1.1.0` preserva a geometria de cada célula sem alterar agrupamento, IDs ou textos; campos opcionais mantêm compatibilidade com fragmentos antigos. `balance-source-proposals.v1` conserva cabeçalhos, declarações de período, emissão, entidade/perímetro/unidade e uma amostra de linhas com âncoras, versão e hash da fonte. Não escolhe a última coluna, não usa filename como contexto e não transforma emissão em data econômica.

Toda proposta é `reviewState=proposed`, `calculationUse=not_permitted`. Não existe valor normalizado, soma, autorização de revisão ou promoção de R01 neste contrato. Propostas são geradas apenas das fontes selecionadas no escopo confirmado; integram o fingerprint e a projeção persistida do worker. A mesma leitura autenticada do relatório temporal restringe a exibição à execução atual concluída e às fontes atuais. A interface PT/EN apresenta cabeçalhos e declarações literais com referências, sem valores de linhas nem ação de aprovação fictícia. Os saldos brutos continuam qualitativos e sujeitos aos bloqueios anteriores.

Limites explícitos: até 16 propostas, 32 declarações por proposta, 12 linhas e 16 células por linha; trechos até 512 caracteres e orçamento agregado de propostas de 250 KB. Toda omissão aparece como limitação. O scan de contexto também é limitado para impedir crescimento quadrático com cabeçalhos repetidos. Fonte sem versão/geometria e referências concorrentes continuam pendentes. O vínculo entre célula e cabeçalho ainda precisa de revisão governada; propostas não substituem esse ato.

Provas requeridas: PDF/XLSX originais do corpus Vertentes, geometria resolvível no layer, datas e colunas distintas, gabarito congelado intacto, fontes não selecionadas excluídas, revisão alterada invalidando relatório, reordenação e limites adversariais. E2E amplia o cenário sintético isolado com documento de saldos, processamento real, persistência `proposed/not_permitted` e exibição PT/EN desktop/mobile. Check local, CI, capturas e publicação serão registrados no PR e no relatório de entrega após conclusão; nenhum sucesso futuro é presumido.

Segurança: AI-05/AI-08; nenhuma nova permissão, tabela, migração, provedor, transmissão externa ou telemetria. Revisão independente apontou amplificação de payload e referências numéricas não seguras; limites e regressões foram adicionados. Rollout exige web compatível e worker PRIMARY exato com capacidade positiva estável. Nenhuma fixture em produção. Reverter a exibição preserva fontes, hashes e aprovações; não restaurar soma sem qualificação.

Próxima dependência material: FactKey/indexFacts/consumidores podem misturar escopos individual/consolidado/segmento e períodos. Não corrigir somente a chave: preservar dimensões e projetar seleção econômica explícita em TODOS os consumidores, incluindo adapters web/worker, antes de promover a reconciliação. Depois implementar revisão atômica de binding com fonte atual e invalidar dependências. A pergunta que expõe `historical_financials.{ano}.cash` também segue registrada e ainda não foi corrigida. Endgame e vertical completa não concluídos.

## Períodos dos apoios de recebíveis, 08/09/2026: implementação em validação

Branch `fix/receivables-support-periods`, sobre `14b0360` (#557). A análise agora distingue data-base da carteira, data do lançamento, intervalo mensal e instante fiscal. O resultado versionado `receivables-support-periods.v1` conserva fonte/hash/âncora, datas originais, qualificação e política explícita de comparação pelo dia local da fonte. Eventos posteriores ficam separados; mês que atravessa o corte não é rateado. Datas ausentes, inválidas e bases sobrepostas permanecem visíveis. Ausência de valor não vira zero; linhas TOTAL não entram novamente na soma. Novos fingerprints incorporam a versão e a avaliação temporal.

Lacunas relevantes bloqueiam o método dependente mesmo com montagem de inputs completa. Pedidos são agrupados por controle e priorizados, sem colisão por truncamento de IDs de linhas. A conferência de data/coluna ainda não executada nos balancetes é uma pendência interna: mantém o bloqueio, sem pedir ao usuário documentos já recebidos. Lançamentos e exposições identificados podem permanecer como observações qualitativas, sem valor não comprovado. O codec fiscal preserva `occurredAt`; fragmentos históricos sem esse campo continuam legíveis e não recebem data inventada. Sem migração, backfill ou reescrita de snapshots.

A interface PT/EN mostra data-base, datas da fonte, evento posterior, lacunas, ambiguidades, valor ausente/inválido e conferência pendente, com referências e detalhes de rastreabilidade. Paginação limita a montagem a 25 entradas por página, conserva acesso ao conjunto completo e informa o total; não implica redução do payload. Novos resultados carregam a avaliação; históricos sem ela mostram que o período não foi avaliado. Não há conclusão de ausência de defeitos derivada de uma lista vazia.

Prova de domínio: o replay bruto da Vertentes agora identifica 34 títulos abertos com cancelamento até 30/06 e sete eventos posteriores em julho. Conferência independente do CSV/XML encontrou datas 01, 02, 04, 05, 07, 09 e 16/07/2026. O gabarito congelado permanece intacto: oito observações são detectadas e seis métricas do universo normalizado continuam exatas. Isso não comprova extração integral. O ajuste bruto de 1,9 milhão antes calculado com contrapartida vazia e a soma de passivos de 9,76 milhões antes tomada da última coluna ficam sem valor confirmado até a qualificação dos campos/períodos. O teste distingue expressamente esses limites das métricas normalizadas. Replay de três testes aprovado em `/tmp/offroad-support-periods-vertentes.log`; 132 testes do pacote e 37 focados do worker aprovados antes dos ajustes finais.

E2E obrigatório ampliado: CSVs e XML sintéticos passam pelos parsers e codec reais, seleção de apoios, aprovação do plano e worker. Exige job `succeeded`, carteira escolhida de 1000, diluição de 100 sem o mês futuro de 900, cancelamento posterior separado, gap do razão, R01 bloqueado e navegação de páginas PT/EN em desktop/390px. Gate local final completo aprovado, 43/43 targets por etapa (`/tmp/offroad-support-periods-check-release.log`). O primeiro CI passou segurança, banco e check, mas revelou que a rota canônica do projeto não renderizava o novo painel: os asserts econômicos e o job terminal passaram, porém o painel não estava no produto de trabalho. A segunda rodada identificou que o entendimento amplo confirmado também não é a fonte certa para exibir uma análise pontual ou uma reanálise: esse objeto é imutável depois de aprovado. O painel passa a ler o resultado canônico mais recente da sessão, com vínculo explícito ao escopo confirmado, manifesto e execução concluída; os controles das etapas seguintes permanecem separados. O painel ocupa o bloco compartilhado junto à confirmação da carteira, fora do JSX condicionado ao fluxo privado/preliminar (outra dependência revelada pelo E2E). A aprovação depende de repetir o E2E completo, incluindo paginação e capturas, no novo head; publicação ainda pendente. QA isolada usa fontes alternativas explícitas e não comprova hidratação/paginação; a interação é exigida no E2E.

Segurança: AI-05/AI-08, origem e integridade das conclusões. Apenas dados já autorizados da organização/projeto; sem novo provedor, permissão, transmissão externa ou telemetria financeira. Revisão independente encontrou e acompanhou correções para valores ausentes, intervalos e IDs de pedidos. A publicação requer web compatível e worker na revisão exata estável; só então a nova garantia temporal estará ativa. Rollback operacional preserva fontes e aprovações, sem recriar retrospectivamente valores; R01 continua interno/shadow. Próxima etapa: binding explícito de entidade, coluna de saldo e período dos balancetes e posições bancárias, seguido da reconciliação. Este corte não homologa a vertical completa nem conclui o endgame.

## Carteira e data-base confirmadas: publicação verificada, 08/09/2026

PR #556 integrada em `4633ad777a40bc06457712743a10843a092c8d71`. O usuário confirma documento, aba, cabeçalho, apoios e data-base na conversa; a confirmação conserva revisões das fontes e produz um novo plano para aprovação. O cálculo usa somente a carteira selecionada e mantém referências verificáveis. Mudanças nas fontes invalidam a confirmação; a autorização antiga não é herdada.

Quality `34263010265` e Security `34263010056` passaram no head final `ebf4f65c5e4ede1ea765e9bb57ef26c119262abf`, incluindo banco, aplicação e E2E obrigatório (22 aprovados; 10 dependentes de provedores externos pulados). A prova exige job `succeeded`, data-base 31/08/2026, um título e saldo 1000, excluindo a carteira concorrente de 999999. O log confirma `case.done` do job `76199992-ccd1-498d-b0cc-3ffcf3959c9d`, às 18:31:45Z. A primeira execução revelou um falso positivo: o relatório era gravado antes de uma falha no vínculo do controle operacional. A correção usa o hash do input congelado exigido pelo banco e o teste verifica o término efetivo, sem afrouxar o controle. Evidência local: `/tmp/offroad-confirmed-scope-proof-ebf4f65/worker.log`. Gate local completo aprovado; capturas reais desktop/390px inspecionadas.

Produção web: deployment `6334502750`, Vercel `6kzkCjk5mub6WvTZaT2VnNBsevKH`, sucesso no SHA exato da integração. Página pública HTTP200 e leitura autenticada verificadas sem alterar dados. Após a web compatível, o marcador `20260908183823_worker_runtime_schema_contract` ativou a oitava capability; security advisors zero. Worker `34264036006` concluído com sucesso: PRIMARY exata `offroad-document-worker:284`, capacidade positiva e serviço estável, verificados às 18:42:32Z.

Este follow-up alinha somente o nome do marcador à versão efetivamente aplicada, mantendo o corpo SQL idêntico, e registra a publicação. As sete migrações aditivas anteriores já correspondem à produção. Gate local do follow-up: `/tmp/offroad-confirmed-scope-release-check.log`, 43/43 targets por etapa.

Próxima prioridade: qualificar o período econômico dos documentos complementares. Lançamentos contábeis posteriores à data-base, meses futuros de diluição e cancelamentos fiscais subsequentes precisam ser separados dos saldos históricos, com referência à linha, revisão da fonte, tipo de data e lacunas explícitas para datas ausentes/inválidas. Casos mínimos: base 31/08 com ajuste 01/09; diluição janeiro–agosto 100 e setembro 900; título aberto em 31/08 com cancelamento 02/09. Isso ainda não foi implementado neste corte.

Limites: uma carteira por análise, sem consolidação automática. Confirmar fontes não homologa os períodos de todos os apoios. R01 permanece interno/shadow; expertise universal, matching e entregáveis institucionais completos continuam pendentes. As entradas anteriores abaixo documentam estados históricos e não substituem esta publicação.

## Carteira e data-base confirmadas: implementação em validação, 08/09/2026

Branch `feat/confirmed-receivables-scope`, sobre `1ae521e` (#555). O próximo corte registra uma tabela principal (documento, aba e linha de cabeçalho), documentos de apoio escolhidos e data-base declarada. A confirmação guarda as revisões e os hashes das fontes, participa da identidade do plano e inicia uma nova proposta aguardando aprovação. A seleção é metadado de autorização e perímetro; não duplica fatos financeiros. Alterações de fontes tornam o escopo desatualizado. Outra carteira não pode ser disfarçada de documento complementar.

O worker recebe a confirmação antes de congelar o input, projeta apenas a tabela escolhida e conserva as referências originais das linhas. A ordem de chegada dos arquivos não altera a seleção. Uma tabela única também exige confirmação. Data-base e período observado permanecem separados; emissões ou pagamentos posteriores à data-base bloqueiam a reconstrução silenciosa de um saldo histórico. A presença de títulos pagos não comprova completude do histórico de liquidação.

Controles: isolamento por organização e projeto, funções com capability, replay por comando, snapshot imutável, invalidação da aprovação anterior, estado e orçamento do processamento canônico. Revisão independente identificou ordenação incorreta de confirmações concorrentes e compatibilidade insegura com leitores antigos; as correções são parte obrigatória deste corte. Sete migrações aditivas aplicadas em produção; a ativação do novo runtime permanece pendente. As oito migrações foram aplicadas em staging: master RLS e contrato SQL completo passaram, inclusive aprovação real e leitura pelo worker novo; leitores legados rejeitam escopos confirmados. Security advisors: zero; performance somente INFO. Prova local `/tmp/offroad-confirmed-scope-staging-proof.json`. Gate local completo final aprovado, 43/43 por etapa; worker 352 testes, receivables-analysis 108, evals 89. A repetição após os ajustes finais de interface também passou (`/tmp/offroad-confirmed-scope-check-release.log`). Revisão visual do componente real em 1440px/390px, PT/EN, estados pendente, confirmado e desatualizado concluída, com fontes alternativas explícitas Arial/Georgia no artefato isolado. Capturas `/tmp/offroad-confirmed-scope-{desktop,mobile,en-mobile,stale-mobile}.png`. E2E obrigatório implementado para seleção → plano do worker → aprovação → cálculo com exclusão da outra carteira; a repetição integrada com verificação do término do job e a publicação ainda dependem do CI. Não tratar esta entrada como evidência de release.

Limites: seleção de uma carteira por análise, sem consolidação automática de múltiplas carteiras. As fontes precisam estar processadas; casos confirmados não são reabertos implicitamente. R01 permanece interno/shadow e continua sujeito aos requisitos de dados e homologação. Este corte não conclui todas as verticais, entregáveis, matching ou o endgame.

A entrega anterior (#555) está publicada: squash `1ae521e66844c9c5794d1cc7707dec78617ed6ac`; Quality `34257050581`, Security `34257050578`, Vercel `6333434463` e worker `34258118534` aprovados. PRIMARY `offroad-document-worker:283` estável e capacidade positiva; página pública e leitura autenticada verificadas. Os registros abaixo são históricos.


A primeira prova CI (`3254d35`, Quality34261236053) aprovou 22 E2E, mas a inspeção dos logs encontrou uma lacuna no teste: o relatório era persistido antes de o job falhar no vínculo do controle operacional. A causa foi a passagem do hash econômico onde o banco exige o hash do input congelado. Correção mínima preserva ambos os contratos e passa a identidade congelada ao recorder; o E2E agora exige término `succeeded`, data-base exata, um título e saldo de R$ 1.000. Gate local da correção aprovado, 43/43 por etapa (`/tmp/offroad-confirmed-scope-check-binding.log`). Ativação permanece suspensa até a repetição integrada verde. As sete migrações aditivas já foram aplicadas em produção e os nomes foram alinhados; security advisors zero. O marcador continua ausente (sete capacidades antigas), sem ativar o novo processamento.

## Recebíveis: identidade das fontes e ambiguidade de carteiras, 08/09/2026, em validação

Corte `fix/receivables-evidence-scope`, a partir de `8b64e9e`. A análise detecta todas as tabelas de títulos antes de construir o universo. Mais de uma tabela (inclusive abas ou cabeçalhos distintos no mesmo arquivo) produz uma pendência explícita `needs_evidence_scope`, lista as fontes na interface PT/EN e não executa a análise de carteira, matching setorial ou R01. A pendência também alimenta o canal existente de requisitos de informação. O restante do diagnóstico do projeto mantém seu próprio escopo; não é uma suspensão global do caso.

Para uma tabela única, a identidade do universo inclui sessão, documento, aba e cabeçalho. O manifesto SHA-256 passa a incluir identidade, revisão, tipo e hashes das fontes; sua ordem de chegada não altera a identidade. Duplicações e conteúdo que não corresponda à fonte autorizada são rejeitados. Assemblies e suplementos associados ao hash antigo ficam desatualizados e precisam de nova validação. Não há migração ou backfill; nenhuma nova permissão, integração externa ou saída de dados.

Limites explícitos: este corte não oferece ainda seleção e confirmação persistida de uma carteira entre várias. A data-base ainda é inferida no caminho legado de tabela única; a confirmação de data-base e a vinculação dos documentos complementares a cada carteira são a próxima dependência. R01 continua interno/shadow. Não se homologa aqui expertise setorial universal ou a jornada completa de análise por objeto.

Segurança: controles AI-05/AI-08 (origem e integridade dos resultados). Fluxo restrito aos documentos já autorizados do projeto; nomes de arquivos aparecem somente no relatório privado existente. Sem novos dados em telemetria. Provas negativas cobrem troca de fonte, hash, revisão e duplicação; provas de domínio cobrem carteiras concorrentes e abas distintas. Gate local completo aprovado (43/43 targets de lint, tipos, testes e build; worker 340 testes, web 322, receivables-analysis 86). A compilação local usou o trust store TLS do sistema para acessar Google Fonts, sem desativar validação de certificados. Revisão visual do componente real com estado sintético e CSS existente em 1440px/390px, PT/EN, concluída; não é uma prova de seleção persistida nem uma sessão real de data room. Capturas locais: /tmp/offroad-receivables-scope-desktop.png, /tmp/offroad-receivables-scope-mobile.png e /tmp/offroad-receivables-scope-en-mobile.png. Revisão independente sem bloqueio alto novo. A primeira execução de CodeQL identificou backtracking potencial na leitura de referências de células; o parser foi limitado a referências completas de coluna/linha e inteiros seguros, com regressão para entradas malformadas longas. Revalidação local completa aprovada após a correção; nova checagem de segurança e CI precedem a publicação. Rollback: reverter o PR e publicar web/worker; relatórios históricos permanecem registrados, sem reatribuir sua origem.

## Contexto setorial revisado publicado, 08/09/2026

PR #553 integrada em `d30a9ebc374ba78048210818514b492023d59e30`. Contexto revisado da companhia, atribuição de fontes, requisitos e lacunas chegam ao plano apresentado para aprovação. Novas propostas preservam a cadeia de versões; aprovação antiga não é herdada. O escopo permanece `planning_only`: requisitos não examinados e métodos especificados, sem ativação automática de métodos financeiros por setor.

Quality `34248024449` e Security `34248024441` passaram no head final. São 21 E2E aprovados, incluindo a prova obrigatória com candidato editado pela UI, worker real e brief ligado ao novo alvo; 10 testes dependentes de provedores externos foram pulados. Capturas reais de desktop e 390px foram inspecionadas. Gate local completo passou, 43/43 targets por etapa; o teste de compatibilidade do runtime foi reexecutado diretamente após o alinhamento da migração (5/5).

Produção: Vercel `ChZ7scHjutpzQfCToVJDR6c33miN`, deployment `6331888960`, confirmou o SHA exato da integração. Páginas pública e autenticada foram conferidas sem modificar dados. Após a web compatível, a migração `20260908161137_worker_runtime_schema_contract` ativou a sétima capability; advisors de segurança permaneceram sem alertas. O workflow worker `34249298359` confirmou PRIMARY exata `offroad-document-worker:282`, capacidade positiva e serviço estável. As seis migrações desta entrega correspondem aos registros de produção; este follow-up apenas alinha o nome do marcador aplicado, sem mudar seu corpo.

Próximo avanço de domínio: vincular ativos, contratos e carteiras aos seus próprios dados e ligar requisitos a métodos executáveis, com casos de referência e revisão técnica. Esta publicação conecta o planejamento setorial ao fluxo real; não conclui o endgame nem homologa expertise universal, matching ou entregáveis institucionais completos. Os registros de validação abaixo são históricos.

## Contexto revisado conectado ao plano, 08/09/2026: em validação

A prova obrigatória da segunda proposta revelou uma falha real de versionamento (`execution_brief_parent_mismatch`): o recorder não informava o predecessor ao recalcular o plano. Reproduzida em staging com rollback e corrigida por migração forward, mantendo os locks e a validação canônica da cadeia de versões. A nova versão continua exigindo sua própria aprovação. Quality `34246963443` aprovou banco e E2E obrigatório: segunda proposta produzida pelo worker real, fingerprint ligado ao alvo e capturas desktop/390px. A inspeção confirmou o contexto e sua atribuição no novo plano. A revisão final removeu um padrão de remoção de HTML de um teste sinalizado pelo CodeQL, usando contagem literal do identificador; gate local completo aprovado novamente. CI da revisão final e publicação permanecem pendentes.

Branch `feat/governed-sector-planning`, sobre main `4c09c8f` (#552). O worker passa a consumir os campos setoriais revisados do intake autorizado e inclui contexto, fontes, requisitos e lacunas no mesmo brief apresentado para aprovação. Os leitores de capability continuam vinculados à organização e à sessão. Não há cadastro paralelo de fatos. Setor, subsetor, modelo de negócio/receita, estágio, recurso e jurisdição usam correspondências explícitas do catálogo canônico.

Uma classificação documental só é confirmada quando revisão primária, entidade, âncora e versão/hash originais da extração são compatíveis com a fonte atual pronta e limpa. Edições e entradas manuais são atribuídas à revisão do usuário. Informação sem suporte, entidade divergente e período incompleto/invertido não ativam contexto confirmado. Períodos e estados permanecem visíveis. O fingerprint econômico é independente do idioma; a aprovação incorpora as dependências relevantes, inclusive elegibilidade e linhagem da fonte. Ausência de candidatos preserva o hash legado.

Escopo operacional: companhia identificada na sessão, nos briefs padrão e propostas de execução. O preview público congelado mantém seu contrato próprio. Não infere SPVs, ativos, contratos ou carteiras a partir da classificação da companhia. Requisitos continuam `not_examined`, métodos `specified` e modo `planning_only`; tarefas, executores financeiros e poderes de divulgação não são ampliados. A interface diferencia o contexto dos trabalhos que serão executados.

Validação: testes do produtor, callers, contrato e card aprovados; suíte SQL de aprovação executada com rollback em staging isolado e security advisor sem alertas. Datas de conhecimento/revisão são estáveis entre retries e fusos. Gate local final `pnpm check` aprovado em Node 24.19.0, 43/43 targets em lint, typecheck, testes e build, incluindo a nova verificação de compatibilidade do runtime. Quality 34240603658 e Security 34240603775 passaram; a inspeção do relatório revelou que o caminho fixture pulava a prova opcional do contexto. O teste foi substituído por uma prova obrigatória com job sintético local, trigger e worker reais; aguarda novo CI e capturas. Cinco migrações aditivas já aplicadas em produção, advisor de segurança sem alertas; capability nova ainda ausente, portanto o novo produtor permanece não liberado. Publicação da web e ativação do worker pendentes. O próximo avanço de domínio exige binding por objeto econômico e métodos homologados com evidência e revisão técnica; este corte não libera expertise universal nem conclui o endgame.

## Contexto econômico e especialização setorial por objeto, 08/09/2026

Fundação de planejamento sobre main `ea6d233`: contrato `economic-context.v1` com objetos/alvos explícitos, evidência declarada, estados e períodos econômicos; catálogo canônico de nove módulos especificados; compositor determinístico integrado como entrada opcional de `compileObjectiveSpecialization`. O contexto produz requisitos, cenários propostos, critérios de mandato e lacunas por objeto/período. Não herda atributos ou caixa de holdings, não mistura períodos incompatíveis e não usa suporte explicitamente contestado em período sobreposto. A ausência do novo campo preserva o payload e o fingerprint anteriores.

Os módulos são solar, receita contratada, exposição de mercado, construção, operação, varejo, carteira de recebíveis, pedágio e disponibilidade. São especificações de investigação, não executores financeiros homologados. Pergunta factual não recebe métodos financeiros, cenários ou matching. Inferências, propostas e conflitos ficam como lacunas. Referências declaradas não são verificadas contra o data room por esta biblioteca e não satisfazem evidência.

Integração nesta fatia: consumidor de domínio e testes, opt-in, `planning_only`, sem chamada nova no worker, persistência ou interface. `selectedPackIds`, perfil de execução e cobertura de tarefas existentes permanecem iguais. Sem migração, mudança de grants, providers, telemetria ou cálculo financeiro. Limites agregados de contexto e limite de combinações evitam expansão silenciosa. Blueprint e Atlas incorporam a arquitetura e dez famílias planejadas, sem promoção no Program Board.

Pendente para uso real: binding autorizado de objetos/fontes e confirmação; projeção localizada no plano do usuário; ligação de cada requisito a método executável e evidência; casos de referência, revisão técnica nomeada e promoção específica por capacidade. Gate completo local e CI são registrados em Acceptance Evidence; esta fundação não conclui o endgame.

## Leitura executiva e conferência completa, 08/09/2026

Em implementação sobre main `900e9e37b9223fe08f483beaad9d32607509bf86` (PR #550). A projeção de decisão respeita os blocos ordenados do contrato e oferece navegação de cada achado às fontes, premissas e lacunas, com retorno ao achado. Séries usam os pontos do contrato em gráficos e tabelas completas; ausências não viram zero. O produtor inclui explicitamente a série de vencimentos na visão de conversa dos contratos novos, preservando valores e apresentação. Snapshots existentes não são reescritos. A publicação requer web e worker, sem migração. Valores exatos, identificadores, localização da fonte e fingerprints permanecem disponíveis. Estados de análise e de divulgação são distintos e vêm do contrato.

Taxas anuais aparecem em percentual por conversão decimal exata, com o valor original preservado. O registro de fontes é recolhível e abre antes da navegação ao destino, mantendo foco e retorno por teclado. O cabeçalho permite quebra em telas estreitas. O E2E verifica também limites geométricos do cabeçalho, overflow do body e largura real de 390px do PNG; o teste de edição de taxa permanece inalterado.

Os resultados completos dos métodos permanecem acessíveis junto da leitura executiva e são montados apenas enquanto a inspeção estiver aberta, preservando o controle nativo por teclado. Isso evita renderização oculta duplicada; não comprova redução do payload nem explica isoladamente o tempo total de processamento. Sem contrato válido ou sem visão de conversa, a interface informa a indisponibilidade da leitura e conserva os métodos existentes. Rótulos conhecidos são localizados em PT/EN; referências e campos desconhecidos permanecem literais. Nenhuma narrativa é inventada para preencher blocos sem corpo narrativo.

Escopo somente leitura do payload autorizado: sem migrações, providers novos, telemetria, mudanças de autorização, fórmulas financeiras ou autorização de divulgação. Os fingerprints demonstram consistência interna, não homologação econômica. Não promove capabilities, materiais institucionais completos, integração privada com worker, matching ou introduções. Gate local `pnpm check` aprovado em Node 24.19.0: lint, typecheck, testes (315 testes web) e build, 43/43 targets em cada etapa. E2E acrescenta navegação por teclado entre achado e fonte, acesso aos métodos e viewport de 390px com inspeção aberta. Quality 34220487935 aprovou a revisão c3e9b92 com 20 E2E e 10 dependentes de provedores pulados; Security passou. Capturas reais confirmaram 390px sem overflow e fontes recolhidas, com navegação por teclado testada. A montagem condicional dos métodos e a integração com main #550 passaram novo gate local completo, 43/43 por etapa; o E2E agora exige ausência do conteúdo dos métodos no DOM antes de abrir e após fechar. O head final ainda exige CI e publicação.

Baseline de publicação: PR #548 já publicou a precisão decimal da inspeção, a proteção de downloads por fingerprint válido, os rótulos de planos novos e os identificadores das onze migrações de produção. Quality `34185381699` aprovou 20 E2E, com 10 dependentes de provedores pulados; main Quality `34186017704`, Security `34186017689` e worker `34186017715` passaram. O worker verificou PRIMARY exata (task 278) com capacidade positiva; Vercel e navegação de produção foram conferidos. Registros anteriores de follow-up pendente são históricos e não representam o estado atual.

## Saldo de dívida e proveniência do caixa: correção em validação, 08/09/2026

Corrige duplicação de juros quando a companhia informa saldo devedor sem principal separado: saldo 100 e juros acumulados 10 permanecem saldo 100, com principal desconhecido, em vez de 110. Principal explícito 90 com juros 10 concilia com saldo 100. O saldo reportado continua utilizável no diagnóstico mesmo sem composição nominal; a lacuna de principal permanece explícita e impede o pró-forma, sem bloquear indiscriminadamente todo o brief. Divergência entre principal recomposto e saldo reportado gera exceção bloqueante. A falta de caixa fica registrada e impede dívida líquida apresentada e cálculo pró-forma; caixa explicitamente zero continua válido.

A capacidade por alavancagem também deixa de assumir dívida líquida zero quando esta não está disponível. Nos casos não venture, os limites individuais computáveis permanecem visíveis, mas a recomendação agregada e a restrição vinculante ficam indisponíveis até a informação necessária; a exceção venture, que usa ARR/rodada, é preservada.

Novos snapshots identificam a proveniência de principal, saldo agregado e caixa. Um ledger ausente ou com saldo desconhecido não comprova dívida zero: os consumidores retêm esses agregados, inclusive dívida líquida, como não informados. Um instrumento com zero explicitamente informado continua válido. Snapshots históricos permanecem legíveis, mas não recebem confirmação retroativa. Os campos numéricos legados permanecem compatíveis internamente e não autorizam apresentação de caixa ausente como saldo comprovado. A versão de reconciliação passa a 2026.09.08-v3 e a de operação a 2026.09.08-v2. Interface e diagnóstico exportado preservam os valores desconhecidos como não informados.

Revisão independente estática sem bloqueador material. Gate local completo aprovado em Node 24.19.0: lint, typecheck, testes e build, 43/43 targets por etapa. Inclui 290 testes web, 299 do worker, 33 do case engine e 89 de evals; o anchor Rede Horizonte passou sem mudança de corpus ou answer key. A lacuna de principal conhecido apenas por saldo permanece em missingInputs e no controle do método dependente, sem fabricar uma exceção de inconsistência no diagnóstico. PR #550 integrada em main 900e9e37b9223fe08f483beaad9d32607509bf86. Quality 34220074178 e Security 34220074160 passaram; E2E 20 aprovados e 10 dependentes de provedores pulados. Vercel de produção dpl_67ookEjQAX7Gotcq8ugX1TpXGFFZ READY e rotas pública/autenticada verificadas sem escrita; worker 34220959618 passou, PRIMARY task 279 exata e capacidade positiva verificadas pelo workflow. Sem migração de banco ou reescrita de snapshots históricos. Esta correção não homologa todo o motor financeiro nem implementa a comparação de refinanciamento para casos privados.

## Plano aprovado e inventário do Advisor: publicação operacional verificada, 08/09/2026

[PR #547](https://github.com/carlosevg100/offroad/pull/547) integrado em main `31e5a92830f50e21e2d17f4a93d3ed4d1403dd40`. Os checks obrigatórios e de segurança passaram. [Quality 34184277267](https://github.com/carlosevg100/offroad/actions/runs/34184277267) aprovou 20 testes E2E; 10 testes dependentes de provedores foram pulados, portanto não constituem evidência de integração com esses provedores.

A entrega inclui inventário documental e requisitos sem confundir processamento com verificação; aprovação da versão exata, ajuste e recuperação de comando; retenção da análise substantiva no banco; e ponte determinística para entradas antigas, inclusive casos sem plano ativo. Chat, atalhos públicos e intake privado compartilham o controle. A revisão privada exige execução aprovada e concluída para o contexto material atual quando existe histórico real de worker; uma conversa sem nova execução não libera reconciliação antecipada. O fallback privado histórico continua isolado e não comprova a jornada privada completa com worker no navegador.

Onze migrações foram aplicadas em produção, com o contrato de runtime por último. Os arquivos foram renomeados para os identificadores efetivamente publicados, de `20260908035022` a `20260908035058`, sem alteração dos corpos. A aplicação também reconciliou as omissões anteriores de métricas de intenção, storage governado e preservação de múltiplos artefatos. Probe de contratos com todos os resultados verdadeiros e nenhum job ativo no momento da verificação; advisor de segurança com zero achados e advisor de performance com 200 INFO, zero WARN e zero ERROR. Esses resultados comprovam este estado do banco, não segurança absoluta nem homologação financeira ampla.

Publicação operacional verificada: [worker 34184940826](https://github.com/carlosevg100/offroad/actions/runs/34184940826) concluído com sucesso, incluindo PRIMARY exata e capacidade desejada/em execução positiva. Vercel publicou main `31e5a92830f50e21e2d17f4a93d3ed4d1403dd40`; homepage e projeto autenticado existente foram conferidos no navegador, com inventário novo, histórico e nove artefatos anteriores preservados. Nenhuma execução ou fixture foi criada em produção para essa verificação.

Follow-up local ainda separado do merge #547: preservar decimais exatos na inspeção de evidências; só oferecer downloads quando houver fingerprint de artefato válido; localizar os rótulos do plano de preview apenas em snapshots novos, preservando os já persistidos; e exigir incremento numérico real de versão no E2E de ajuste. Não atribuir esses diffs ainda não publicados ao SHA de main acima.

Nenhuma promoção ampla de capability. Geração institucional de todos os formatos, Drive, matching e introduções mantêm seus gates próprios; os testes pulados e a prova privada completa com worker permanecem limites explícitos.

## Primeira onda do endgame: controle e experiência, 07/09/2026

Reconciliado o draft #536 com main b6da287. O board mantém o novo RT-01 como candidate, registra fundações delimitadas de segurança, quarentena e Office e acrescenta UX-01 a UX-05. Vínculos de capabilities são validados sem conceder customer work ou uso externo. O plano de execução está em `docs/build/ENDGAME_WAVE1_EXECUTION.md`; correções de interface e segurança são entregas separadas, ainda não comprovadas por este PR.

## Estado de execução: recuperação comprovada, 07/09/2026

Respostas a perguntas e decisões registradas deixam de ser consideradas prova de recuperação da execução. Somente work_completed posterior elimina a indicação de uma falha anterior; empate temporal conserva falha independentemente da ordem do array. A prioridade visual de trabalho ativo e o fallback de projetos sem trilha de eventos são preservados. Não muda schema, critérios econômicos nem autorização. Trata um defeito delimitado de UX-01; correlação completa de tarefas paralelas e prontidão por dimensão continuam fora desta fatia. Gate local `pnpm check` aprovado em Node 24.19.0; preview e produção não verificados nesta mudança.

## Triagem de segurança e precisão de covenant: 07/09/2026

Corrige normalização linear de listas/chunks, separadores literais de paths de evidência e formatação decimal de limites de covenant. Antes, um limite inteiro 10 podia renderizar 1x; a correção preserva magnitude e precisão. Sete instâncias CodeQL são tratadas nesta fatia; nove permanecem classificadas no relatório docs/security/CODEQL_TRIAGE_2026_09_07.md. Nenhum alerta foi descartado remotamente. A correção não altera auth, tenancy, banco ou grants.

## Revisão de resultados: precisão e acesso completo: 07/09/2026

Corrige apresentação de decimais sem conversão por ponto flutuante, preserva IDs e anchors e explicita a unidade declarada. Tabelas expõem todas as linhas, colunas e anchors; lacunas deixam de ser truncadas. Síntese e link Word existentes ficam acessíveis independentemente do brief. Nova namespace bilíngue incluída no provider. Escopo somente leitura do payload já autorizado; sem mudança de banco, provider, telemetria ou autorização de download. Não promove o Workbench premium.

## Comandos do advisor: recuperação sem perda do rascunho: 07/09/2026

Envio, edição de plano e resposta a pergunta compartilham proteção síncrona contra duplicação. Falha retornada ou exceção libera pending e conserva o conteúdo; retry idêntico reutiliza a identidade de comando já suportada pelo banco. O composer limpa somente o texto enviado após confirmação. Texto bilíngue informa aceitação incerta sem afirmar rejeição. Nenhuma alteração de schema ou regra de edição de versão obsoleta. Estado de retry e rascunho vive somente em memória do componente: reload/remount não tem recuperação durável.

## RT-01: contrato e gate canônico de intenção, candidate, 07/09/2026

- O gate v3 recompõe de forma independente a cadeia `raw classifier + raw extractor -> compiler ->
  aplicação -> canonicalizador`; input, compilation e output autodeclarados já não podem produzir
  verde. O manifesto e a integridade da execução são estados distintos e ambos bloqueiam promoção.
- Métricas raw, coverage do extrator e resultado final/policy são reportados separadamente.
  Abstenção não ganha crédito por coverage incompleto. `inferableContext` agora participa do
  fingerprint, inclusive jurisdição, data-base, moeda, restrições e inputs disponíveis.
- O ledger de chamadas é reconciliado por operação com task, schema, prompt, input, provider,
  model, tentativa, output, latência e custo; duplicata, órfã, cassette ou divergência reprova. O
  record é ligado ao SHA/run do GitHub e recebe fingerprint integral, sem alegar attestation externa.
- Execução paga foi limitada em código e workflow a `main` pós-merge no environment
  `intent-router-gold-main`. **Bloqueio externo:** branch policy do Environment e trust policy IAM
  ainda precisam ser verificadas/configuradas fora do repositório. Até lá, não há nova evidência
  válida nem promoção; a feature continua desativada.

- Uma única policy tipada governa as vinte composições e é consumida por schema, classificador,
  carimbo do runtime e fingerprint. O envelope rejeita divergência em works, profundidade,
  responsabilidades ou efeito. O prompt é renderizado dessa mesma policy. A condição
  `documents_present` é governada: estrutura com anexos começa por conciliação; sem anexos, a
  variante documental é recusada.
- Autoridade e regime de evidência continuam exclusivos do control plane. Ausência de access basis
  resulta em `unresolved`; cargo ou contexto profissional não concedem autoridade. Pedidos
  horizontais podem operar sobre documento, instrumento ou mercado sem companhia artificial.
- O corpus candidate agora possui 40 turnos, cobre as vinte composições em jornadas, horizontais,
  confusões e adversariais e declara assinatura semântica por turno. O manifesto exige 52
  observações: 40 bases e duas paráfrases autorais adicionais em seis IDs.
- O score exige, na resposta bruta anterior ao reparo canônico, significado correto para ação,
  objetos, referências ligadas ao objeto, decisão e audiência. Números e entidades materiais
  entram no gabarito e no fingerprint; `CDI` não equivale a `CDI + 15%`. Não há campos narrativos
  de outcome, decisão ou audiência nem rótulo `affirmed` no contrato do classificador: o gate
  compara enums, estados assertivos, confiança de inferências e o oracle explícito de cada turno.
  Negação e ambiguidade são testadas por casos delimitados e pela política fail-closed de efeitos
  externos; isso não equivale a uma prova geral de compreensão de toda prosa possível.
- O oracle gold é independente da policy de produção. Slots normalizados preservam montante,
  moeda, percentual, basis points, ratio, indexador, prazo, páginas, contagem e cadência, com
  cardinalidade singular por objeto; valores extras ou conflitantes reprovam. O Caso 03 exige BRL 50 milhões e começa pela conciliação
  dos dois anexos, enquanto reunião de financiamento começa por entendimento.
- Os 52 textos passam por um teste local raw-to-canonicalizer. O summary recompõe checks,
  fingerprint e manifesto, e rejeita resposta nula, erro de provedor, expected, checks ou hashes
  forjados. Missing, extra, duplicate, suíte errada e bytes repetidos também reprovam.
- A run `34096964058` deixa de ser evidência de promoção: 17 turnos, 29 observações, repetição dos
  mesmos bytes e score parcial. A integração determinística local está verde, mas o novo gate ainda
  não foi executado com modelo real e permanece
  `candidate`. Nenhuma capability foi promovida por esta mudança.

## Acceptance Evidence trust boundary, candidate, 07/09/2026

- O slice reconstruído de CTRL-03 remove roots, manifests, receipts, verifier labels e relógio do
  request público. O evaluator obtém um snapshot somente do control plane; o registro governado de
  roots está vazio, portanto nenhum claim positivo pode ser promovido hoje.
- A root single-purpose fixa scope, subject, claim, criterion, tipo, collector, gate, OIDC e
  freshness. Claim, criterion e limitations são definidos pelo control plane. Receipt imutável
  vincula registry, atestação, bytes, primeiro recebimento, run e nonce. O control plane persiste uma
  decisão por ID opaco, deriva subject/scope/gate/transição do manifest e exige CAS atômico sobre o
  conjunto exato de receipts; fingerprint público não autoriza promoção.
- A lista `verifiedEvidenceIds` inclui somente evidência que passou definição, escopo, root,
  assinatura, validade, receipt, gate e integridade dos bytes. Erro global zera IDs, precondições
  de promoção e suporte de claims.

Status: **candidate security boundary**. Ainda faltam root onboarding real, collector OIDC/KMS,
storage imutável, adapter CAS durável/transacional, current registry, renderer, integração com
Ledger/Board e continuous evidence. CTRL-03 não está concluído e nenhuma capability foi promovida.

## Endgame Program Board executável, candidate, 07/09/2026

- A evolução do blueprint passa a ter uma fonte canônica machine-readable em
  `@offroad/release-governance/current-endgame-program`, com 64 work packages distribuídos entre
  R0 e R7. Cada item declara resultado, owner role, dependências, subtarefas, critérios de aceite,
  evidências, bloqueadores, controles de segurança e transição de capability quando aplicável.
- O avaliador falha fechado para evidência ou dependência inexistente, ciclos, IDs duplicados,
  acceptance aprovada sem evidência, blocker resolvido sem evidência e control ID que não exista no
  Control Register. Um item não pode chegar a `gate_passed` sem encerrar subtarefas, critérios,
  dependências e bloqueadores. `promoted` exige também uma transição registrada no Capability Ledger
  para capability live e exposta; tarefas de suporte podem passar gate sem inventar uma capability.
- A vista humana `ENDGAME_PROGRAM_BOARD.md` é gerada da mesma fonte e possui teste de paridade byte
  a byte. Ela não é um segundo roadmap editável.
- O primeiro baseline foi fixado em `main@b760167`. A reconciliação registra quatro findings high:
  ledger ainda verificado contra `cb5f674`; PR 523 fora da main após falha de E2E; nenhuma capability
  autorizada para customer reliance; e blocos centrais do endgame ainda não promovidos.
- MAT-01 governa somente `artifacts.governed-office-foundation`. O evaluator reserva
  `artifacts.template-faithful-suite` a MAT-05, depois de XLSX/PPTX/DOCX, template fidelity e review;
  um material isolado não pode promover a suíte ampla.
- Os 13 packs não declaram individualmente o runtime geral: WFI-14 é o gate agregado e depende de
  WFI-01 a WFI-13. As oito jornadas também não promovem isoladamente G2-G8: JNY-09 depende de todas.
  O evaluator bloqueia tanto owner incorreto quanto transição duplicada para a mesma capability.
- Nenhuma capability foi promovida por esta entrega. O board permanece em candidate até a CI deste
  PR e a reconciliação seguinte serem registradas como evidência.

Status: **candidate program control**. O controle prova honestidade e sequência; não prova que os
workflows, modelos, materiais ou controles de segurança planejados já estejam implementados.

Atualizado em: 2026-09-06
Baseline: branch `docs/endgame-blueprint`; documentação sobre o estado atual de `main`
Repositório: `carlosevg100/offroad` · Produção: `https://offroad.capital`

## Dispatch do preview pelo slice compilado, candidate, 06/09/2026

- O executor de preview deixou de percorrer a cadeia completa de dez tarefas em todo turno. Ele
  resolve o outcome econômico da composição e consome somente o slice mínimo, fechado por
  dependências, compilado da receita canônica de refinance e liability management.
- `prepare_meeting`, `deepen` e `change_premise` terminam em `A01`, com nove tarefas e sem criar
  material. `prepare_material` e `prepare_decision` terminam em `A02`, com dez tarefas.
- A identidade persistida deixa de ser `case01.*`: passa a carregar receita, outcome, versão e
  fingerprint do slice, por exemplo `refinance-liability-management.meeting_plan`. O executor
  compara essa identidade e o conjunto exato de tarefas com o slice esperado antes de trabalhar.
- Uma mudança de premissa no plano de reunião recalcula alternativas e plano, replica sete de nove
  tarefas por fingerprint e não recria Word/Excel. O material anterior permanece versionado, mas
  não é apresentado como produto do novo plano.
- O nome Caso 01 saiu da devolutiva visível. Ele permanece somente como fixture e regressão interna;
  a evidência pública usada por esse preview ainda é congelada e específica da Camil.

Status: **candidate dispatch slice**. Testes e tipos locais estão verdes; banco, E2E e CI integral
ainda precisam rodar na cadeia do PR. Isso prova dispatch correto para dois outcomes de uma receita,
não roteamento universal, qualidade top-tier dos outputs ou exposure externa.

## Seleção de workflow persistida no preflight, candidate, 06/09/2026

- O preflight real agora compila a seleção de receita depois do plano, dos packs econômicos e do
  binding de métodos. A decisão selected ou blocked é registrada e logada; continua em shadow e
  não autoriza dispatch.
- A RPC v4 grava plano, readiness, especialização, binding e seleção pelo mesmo capability token.
  O registro é imutável, idempotente por fingerprint e ligado a organização, projeto, mensagem,
  job, preflight e especialização.
- A validação no banco exige paridade exata entre packs econômicos da especialização e da seleção,
  partição completa e sem duplicidade entre task IDs e batches, campos de receita apenas quando o
  estado é selected e bloqueio com grafo vazio.
- A tabela possui RLS forçada, leitura somente pelo membro com acesso ao projeto, nenhuma escrita
  direta pelo cliente e auditoria em cada insert. O teste SQL cobre replay, capability forjado,
  cross-tenant, privilégios e composições inconsistentes.

Status: **candidate persistence**. Worker e packages estão verdes; migration, RLS e SQL aguardam o
gate de banco da CI. Dispatch e enforcement live permanecem fora desta entrega.

## Seleção fail-closed da receita econômica, candidate, 06/09/2026

- A especialização do objetivo agora pode selecionar a receita de refinance e liability management
  sem usar cargo, senioridade ou persona como regra de execução.
- O resultado pedido contrai a receita para alternativas, plano de reunião ou material. Quatro
  paráfrases com CFO, VP, alongamento e repricing preservam a mesma identidade econômica.
- Necessidades sem receita implementada, combinações como refinance mais capex e outputs ainda não
  suportados retornam bloqueio nomeado com grafo vazio. Não há fallback para um DAG genérico.
- A seleção carrega fingerprints separados da receita, do slice compilado e da decisão de seleção,
  além dos packs econômicos que a justificam.

Status: **candidate selector**. A decisão ainda não é persistida nem autoriza execução live; o
próximo incremento a liga ao preflight shadow capability-bound antes de qualquer enforcement.

## Receita canônica de refinance e liability management, candidate, 06/09/2026

- Extraída a cadeia fixa de dez etapas do Caso 01 para uma receita reutilizável de refinance e
  liability management. O Caso 01 continua existindo como adaptador de compatibilidade e regressão,
  mas deixa de ser a fonte do grafo.
- A receita liga cada etapa a método e versão, executor, artefato, objetos requeridos, coverage keys,
  política de verificação, chaves de invalidação, dependências, classe de execução, efeito e orçamento.
- O compiler expande a partir do resultado pedido e contrai o grafo ao menor slice suficiente. A
  mesma receita produz grafos diferentes para diagnóstico, cenários, alternativas, plano de reunião
  e material, com batches paralelos derivados das dependências reais.
- O schema falha fechado para tarefas repetidas, dependências ou targets inexistentes, self-loop e
  ciclos. Fingerprints estáveis distinguem receita e slice compilado.
- Esta entrega generaliza a verdade do grafo, não a exposição do produto. O roteador live ainda não
  seleciona a receita e os executor keys continuam apontando para o trilho de integration preview.
  Nenhuma nova capacidade foi promovida a produção ou expert.

Status: **candidate reusable recipe**. O próximo gate é selecionar receita e resultado pelo envelope
de intenção atrás de flag, sem `case01.*`, e provar seis intenções estruturalmente diferentes.

## Blueprint executável do endgame, candidate, 06/09/2026

- Criado `docs/build/OFFROAD_ENDGAME_EXECUTION_BLUEPRINT.md` como fonte proposta de execução do
  programa, subordinada à Constituição e ao Atlas. O plano histórico linear permanece preservado,
  mas não governa o roadmap futuro.
- O documento separa explicitamente capacidade existente de destino: preview restrito ao Caso 01,
  procedures e packs ainda não homologados, leitura arbitrária e work products ainda abaixo do gate
  institucional, e matching/capital intelligence ainda inicial.
- A arquitetura-alvo tem Project Workspace, Intent & Work Control, Specialist Runtime, DCM
  Cognitive Harness, deterministic finance engines, Credit Object Graph, Work Products & Review e
  Capital Network, atravessados por um Trust Control Plane de tenancy, autorização, evidência,
  auditoria, privacidade, resiliência, custo e evals.
- O programa foi reorganizado em oito streams, oito releases com gates, 74 itens de backlog de
  fundação e oito jornadas gold longitudinais. Case 01 virou regressão, não centro do roadmap.
- O contrato de interação agora inclui um `ExecutionBrief` antes do trabalho substantivo: fontes e
  materiais planejados, frentes econômicas, análises/cálculos, dependências, checkpoints e entrega.
  Ele é derivado do grafo real, editável e não expõe raciocínio privado ou agentes internos.
- Criado o diagrama autocontido `docs/build/diagrams/offroad-endgame-architecture.html` usando os
  tokens atuais da marca e o símbolo circular como referência de identidade; nenhuma tela do
  produto foi alterada.
- Trust deixou de ser uma entrega tardia do Release 7. O Release 0 agora exige Control Register,
  inventários, threat model, baseline live, owners, evidências e bloqueio de critical/high; cada
  release possui controles específicos. O Release 7 consolida integração enterprise, pentest e
  avaliações externas sobre controles que já operam.
- `docs/security/ENTERPRISE_SECURITY_COMPLIANCE_READINESS_PLAN.md` passa a ser o programa canônico
  subordinado, com SOC 2, ISO/IEC 27001, privacidade, pentest, 11 domínios de controle e gates A-E.
- `@offroad/release-governance` ganhou um gate determinístico de trust: requisito ausente, owner
  ausente, evidência vencida, ambiente não comprovado ou finding critical/high bloqueiam o release.
  Um segundo gate impede alegação SOC 2/ISO sem atestação externa vigente para o escopo exato.
- O Control Register deixou de ser apenas uma lista no plano. Há 24 objetivos mestres `TRUST-*`,
  124 atividades vinculadas sem colisão de IDs, mappings provisórios para SOC 2, ISO/IEC 27001,
  NIST CSF 2.0 e LGPD, fontes normativas oficiais e validação determinística de completude. Estado
  operacional, owners nominais e população de evidências continuam pendentes e visíveis.
- O capability ledger v1 mede 26 capacidades sem usar um status único enganoso. Availability,
  exposure e quality maturity são independentes. Caso 01 aparece como `live/allowlisted/tested`;
  router universal, modelo integrado, Workbench e G2-G8 continuam `specified`; matching live e
  assurance externa aparecem `absent`. Nenhuma capacidade analítica está liberada para trabalho de
  cliente, material externo ou efeito externo.
- G1-G8 agora possuem contratos executáveis em `@offroad/evals`: 63 estágios no total, Execution
  Brief específico antes do trabalho substantivo, superfícies, objetos, outputs, evidência,
  perguntas, transições, variantes, adversariais e 14 gates por jornada. Todos permanecem
  `specified`; o contrato não substitui reference work product, binding, E2E ou benchmark.
- `@offroad/work-plan` ganhou o primeiro compiler universal de `ExecutionBrief`: toda tarefa do
  grafo precisa aparecer exatamente uma vez em três a sete frentes; tarefa inventada, escondida ou
  duplicada, fonte não autorizada, premissa sem base, copy genérica e efeito externo sem autoridade
  bloqueiam o plano. A projeção visível remove IDs e metadados internos.
- As seis famílias de entrada agora possuem receitas de brief distintas. O fluxo de reunião e
  originação foi ampliado de pesquisa preliminar até análise prospectiva e alternativa-alvo S11.
  O compiler está ligado à ativação real, persistido em versões imutáveis e renderizado no chat.
  Progresso por frente vem dos runs reais por RPC que não expõe IDs internos. Uma mudança de
  objetivo, entrega, premissa, fonte ou checkpoint gera um diff visível na versão seguinte.
- O template de PR e a Definition of Done agora exigem control IDs, data flow/classes,
  providers/tools, abuse cases, testes negativos, evidência, containment e rollback.

Status: **candidate architecture; Release 0 iniciado**. Nenhuma capacidade analítica foi promovida
por este trabalho. Capability ledger, Control Register, jornadas, Execution Brief persistido e
progresso seguro são executáveis; os próximos gates são a baseline SEC-001 a SEC-015, os work
products de referência, os eventos narrativos por frente e a edição governada do plano.

## Fundação de materiais institucionais governados, 07/09/2026

- O contrato universal de decisão passou a representar séries financeiras com linhagem por ponto,
  além de claims, fontes, premissas e lacunas. O mesmo vencimento contratual alimenta conversa,
  workbook e apresentação sem ser redigitado em cada superfície.
- O renderer de apresentações produz PPTX nativo 16:9 a partir do contrato, com gráfico real de
  vencimentos, paginação de blocos densos e os símbolos circulares atuais da marca. Nenhum número é
  criado pelo layout.
- No preview allowlisted, o worker renderiza o arquivo com LibreOffice, inspeciona PDF e páginas,
  armazena os bytes exatos por capability de uso único e vincula o SHA-256 à superfície de
  apresentação. A rota autenticada revalida tamanho e hash antes do download.
- O manifesto mantém o material como `internal_only` e não elegível para liberação enquanto a
  revisão visual estiver pendente. O código desta fundação está presente, mas sua transição no
  Program Board continua planejada e a qualidade permanece `unsupported` até existirem CI, merge e
  gate real. Não há aprovação de template de cliente nem promoção da suite completa de materiais.
- A próxima lacuna desta frente é ligar o modelo financeiro governado ao mesmo ciclo de armazenamento
  e revisão, depois incorporar DOCX nativo, ingestão de template e diff visual/versionado.

## Polimento da entrada e correção do menu, 04/09/2026

- Corrigido um defeito que eu mesmo introduzi: recolher o menu escondia o próprio botão de
  recolher, então não havia como expandir de volta. Agora o símbolo segura o lugar e o controle
  aparece por cima dele no hover ou no foco de teclado, de modo que recolher nunca remove o
  caminho de volta.
- O símbolo da entrada foi de 78 para 104 px e ganhou um fundo que respira e uma rotação de 120
  segundos. É lento o bastante para ler como vivo e não como animação, e ambos param por completo
  sob `prefers-reduced-motion`.
- Saíram a linha de privacidade sob o composer e as quatro sugestões em texto. Com as sugestões
  fora, a rota privada passa a ser escolhida anexando um documento, que é como o usuário a escolhe
  de fato; o E2E foi reescrito para exercitar esse caminho em vez do atalho removido.
- `Continuar` virou três cards planos, com hairline e sem sombra. Cada um mostra o tipo de trabalho
  em monoespaçada acima do nome, então a linha diz que tipo de trabalho é antes de dizer como se
  chama. O horário é carimbo absoluto: tempo relativo exige o instante atual, que a regra de pureza
  do React não deixa ler durante o render, e uma mesa lê carimbo mais rápido que intervalo.
- A tela de acesso perdeu a faixa de garantia e ganhou copy com intenção: o título fala do que o
  produto faz antes do term sheet, e o corpo diz o que existe dentro em vez de mandar entrar.
- Gate integral verde nos 43 alvos em Node 24. Verificado em servidor local, incluindo o ciclo
  completo de recolher e expandir.

## Nome curto e entrada de acesso reescrita, 04/09/2026

- A marca passa a ser **Offroad**, não Offroad Capital, acompanhando a logotipia nova. O domínio,
  o e-mail e a razão social não mudam; muda o nome exibido em metadados, manifest, título do
  navegador e toda a copy de produto.
- A tela de acesso perdeu o rótulo `Acesso institucional`, o título `Acesse a plataforma Offroad
  Capital` e as duas frases que descreviam controle de acesso em vocabulário interno. No lugar
  entrou a declaração de marca da própria casa, o motivo de entrar, e a promessa de privacidade
  dita como o usuário a entende.
- O título do painel de contexto voltou ao serif da marca. A camada premium o havia redefinido
  para o grotesco pesado, o que quebrava a frase em seis fragmentos empilhados.
- Corrigido um defeito que já existia em produção: o link de voltar é posicionado de forma
  absoluta no canto do painel, então um formulário alto o bastante para começar no topo, o de
  cadastro, renderizava o próprio título por baixo dele.
- Gate integral verde nos 43 alvos em Node 24. Login e cadastro verificados em servidor local.

## Casca e entrada do advisor refeitas, 04/09/2026

- A barra lateral virou um componente cliente único, recolhível para 58 px, com o estado em cookie
  para o servidor já renderizar na largura escolhida. `Novo chat` com `⌘J` é a ação primária e cria
  a conversa direto; a busca subiu para o topo com `⌘K` em vez de ficar enterrada na lista.
- `Recentes` é lista plana. Um gatilho do banco cria uma pasta por projeto, com o mesmo nome, e era
  isso que fazia a barra parecer uma coleção de pastas de uma conversa só. A distinção virou coluna,
  `workspace_project_groups.auto_created`, escrita pelo gatilho e limpa ao renomear, porque nomear
  uma pasta é o ato que a torna do usuário. Heurística por nome quebrava no primeiro rename, e por
  contagem esconderia uma pasta real com uma conversa só, que é exatamente o caso da pasta
  `Rede Horizonte` em produção. Pastas do usuário continuam visíveis e continuam podendo ser criadas.
- As duas migrations foram aplicadas em produção e verificadas: das quatro pastas ativas, só a
  gerada pelo gatilho foi marcada. O `staging` não pôde servir de ensaio porque está em
  `MIGRATIONS_FAILED` desde agosto e sequer possui a tabela; é o achado P2-07 da auditoria, ainda
  aberto. A prova limpa é o job de banco no CI, que reconstrói todas as migrations do zero.
- A entrada mostra o símbolo da marca, saudação por horário em preto e a pergunta em cinza. O
  placeholder digita e apaga sete pedidos reais, um por função profissional, e para assim que o
  campo recebe texto. Os cinco pills saíram; quatro sugestões em texto escrevem um pedido completo
  e preservam a dica de jornada. `Continuar` traz os três trabalhos recentes com estado em mono.
- Superfícies planas, hairline de 1 px, raio de 9 px, zero sombra, uma rampa de cinza só e a IBM
  Plex Mono reservada a metadado. Sessenta e seis regras de CSS morto removidas, cada uma provada
  morta por varredura das classes usadas no TSX.
- Verificado em servidor local por rota de preview temporária, criada e apagada no mesmo trabalho,
  em 1180 px expandido e recolhido. Gate integral verde nos 43 alvos em Node 24. O E2E foi
  atualizado para a estrutura nova. Produção ainda não recebeu esta fatia.

## Marca nova em site e plataforma, 04/09/2026

- O farol foi aposentado. A identidade passa a ser o anel de pincel com a logotipia Didone, nos
  dois arquivos de origem que o fundador aprovou. Ilustração representativa não sobrevive a
  tamanho de interface: em 24 px a torre, o facho e as rochas viravam um borrão, que era a causa
  real de a barra lateral e o favicon parecerem amadores.
- `scripts/generate_brand_assets.py` foi reescrito e produz tudo a partir de `docs/brand/`. As
  variantes claras trocam apenas o plano RGB e preservam o canal alfa original, então não existe
  redesenho, redesenho parcial nem reamostragem de proporção em lugar nenhum da cadeia.
- Os ícones quadrados levam o anel branco sobre o fundo `#0b0d0f` da própria plataforma, com um
  quinto da tela reservado de cada lado. Medido de 16 a 64 px: o contorno permanece aberto e a
  forma continua legível como um O em todos eles. O manifest passou de `#05192a` para `#0b0d0f`.
- `brand-mark` passou a dimensionar o ativo por altura em vez de largura, nas seis regras
  responsivas. A assinatura nova é 27% mais alta que a anterior na mesma largura, e com largura
  fixa ela estouraria os cabeçalhos. Por altura, mudança futura de proporção não quebra layout.
- Nove PNGs do farol foram removidos. Restam quatro ativos servidos, dois da assinatura e dois do
  símbolo, mais os ícones e a imagem social regenerados.
- Verificado no servidor local em 1440 px e em 375 px: cabeçalho público alinhado em ambos, sem
  transbordo. Gate integral verde. Produção ainda não recebeu esta fatia.

## Sistema de trabalho agêntico de DCM, schema em produção, 03/09/2026

- Todo trabalho analítico agora recebe um plano persistente do Deal Captain, limitado ao DAG
  compilado e aos efeitos previamente autorizados. Status reais do worker alimentam a timeline do
  chat; não há animação fictícia de atividade.
- Análises públicas, planejamento de capital e casos privados projetam seus resultados em três
  memórias operacionais do projeto: cobertura de evidências, decisões versionadas e no máximo três
  pedidos de informação de alto valor por rodada.
- Documentos classificados e respostas já existentes satisfazem requisitos automaticamente. O
  sistema não pergunta novamente o que já conseguiu ler; conflitos financeiros têm precedência
  sobre pedidos genéricos de documentação.
- A interface central mostra atividade e perguntas como conversa. O painel direito mostra o plano,
  documentos, cobertura, decisões e artefatos sem tirar o usuário do projeto.
- Produção recebeu oito migrations em ordem: work system, índices, eventos de runtime, projeção de
  assessment, autoria, duas correções fail-closed de resolução de variável e índices de ator dos
  grupos de projetos. O ledger remoto e o repositório possuem exatamente 164 versões, sem drift.
- O teste transacional real passou em staging e produção: persistência, replay, autoria, isolamento
  por capability e limite de três perguntas, sempre com rollback. O Security Advisor não possui
  achado acionável e o Performance Advisor não possui foreign key sem índice.
- O gate integral em Node 24 passou nos 42 pacotes. Web: 172 testes; worker: 113 testes; contratos:
  33 testes; build Next.js: 32 páginas. O PR #374 repetiu banco, E2E, build, CodeQL, dependency
  review, Trivy de repositório e imagem e SBOM com resultado verde.
- Estado: schema compatível já promovido e validado em produção; web e worker aguardam somente o
  merge coordenado do PR #374.

## Identidade canônica e decisão ANBIMA, candidate, 02/09/2026

- A Constituição, a nova ADR 0019, `AGENTS.md`, README, handoff, workflow, metadados, manifest,
  homepage PT-BR/EN-US e gerador de assets agora descrevem uma única Offroad: o advisor AI-native
  especialista em dívida que ajuda companhias e profissionais a pensar, investigar, analisar,
  decidir, estruturar e executar trabalhos relacionados a dívida.
- Originação, estruturação de operações, materiais, matching e introdução qualificada permanecem
  capacidades, não a identidade do produto. A ADR 0004 foi preservada como registro histórico e
  marcada como superada; handoffs arquivados receberam aviso explícito de snapshot histórico.
- Um teste de contrato impede que metadados, manifest e homepage retomem a categoria histórica.
- ANBIMA Data público foi separado do ANBIMA Feed: o primeiro permanece fonte oficial
  complementar e manual; o segundo continua desativado e contratado. A APP gratuita permite
  Sandbox fictício, não dados oficiais de produção. Nenhuma credencial foi armazenada ou usada.
- O Client Secret exibido em captura precisa ser rotacionado antes de qualquer uso futuro.
- O gate integral em Node 24 passou nos 42 pacotes; web tem 172 testes verdes e o build Next.js
  gerou 32 páginas. As homepages PT-BR e EN-US foram inspecionadas localmente sem overflow.
- Estado: candidate local; produção e provedores pagos não foram alterados.

## Entrada instantânea no projeto, candidate, 02/09/2026

- A criação do workspace continua sendo uma única transação, mas a fila idempotente do worker
  passa a ser agendada com `after()` somente depois da resposta ao navegador. Disponibilidade ou
  latência do worker deixa de bloquear a entrada no projeto.
- Títulos repetidos deixam de provocar uma primeira transação fracassada e um segundo RPC. O
  wrapper `security invoker` resolve a colisão no banco e chama o comando privado existente uma
  única vez; o sufixo curto aparece somente quando o título já está em uso.
- O teste adversarial cria dois projetos homônimos, confirma duas memórias distintas, preserva o
  replay por `request_id` e volta a verificar isolamento entre organizações.
- Staging recebeu `advisor_project_name_collision`; o teste SQL passou com rollback e o Security
  Advisor retornou zero findings. O gate Node 24 passou lint, typecheck, testes e build nos 42
  pacotes. Produção ainda não foi alterada por esta fatia.

## Fundação de inteligência de dívida BR/US, candidate, 01/09/2026

- O registro de fontes separa autoridade, descoberta e aquisição para Brasil e Estados Unidos.
  CVM, SEC, B3/ANBIMA públicas e RI vêm antes de buscadores; Perplexity e OpenAI Search descobrem
  URLs, e Firecrawl é somente fallback de aquisição. PitchBook, 9fin, Octus, Capital IQ, FactSet,
  LSEG, Economatica e feeds contratados permanecem desativados sem contrato e credencial explícita.
- Cada `company_debt_view`, `origination_thesis` e pesquisa pública do case compila uma estratégia
  versionada por jurisdição, capacidade, TTL, fontes disponíveis e regra de conclusão. Inferência
  de jurisdição por locale fica marcada para confirmação; geografia explícita ou domínio nacional
  tem precedência.
- Resolvedores oficiais para o cadastro da CVM e o índice de registrants da SEC preservam
  identificador oficial, candidatos e ambiguidade. Não selecionam silenciosamente homônimos e não
  retêm campos de contato do cadastro.
- Aquisição direta de URL pública exige HTTPS, valida DNS e redirecionamentos contra SSRF, limita
  tipo, tamanho, tempo e número de redirects e preserva hash e publisher. O adaptador Firecrawl v2
  pede zero retention e cache desligado; nenhuma chave o ativa por padrão.
- A cache global aceita exclusivamente material bruto de queries de projetos
  `public_information`. Ela não possui organização, usuário, projeto, conversa ou documento, não
  é exposta pela Data API e exige capability viva do worker. Casos privados continuam usando
  somente o ledger do próprio tenant.
- Métricas registram hits, chamadas por provider, writes e exposição máxima de custo. Cache hit
  reduz chamadas e custo estimado em vez de manter a reserva nominal original.
- Estado: candidate local. Nenhuma migration foi aplicada, nenhum conector pago foi ativado e
  nenhuma chamada paga foi feita. Os quatro jobs ainda sem executor continuam honestamente fora
  desta promoção.

## Persistência fail-closed do control plane, 01/09/2026

O candidato passa a persistir o que antes existia apenas como contrato puro. Um job de análise
grava, com sua capability temporária, o snapshot que aquela execução efetivamente provou. O
banco exige o input congelado e os fingerprints do relatório e manifesto persistidos, recalcula a
decisão, guarda blockers e warnings, e não aceita que o worker declare o próprio credenciamento.
A ausência de policy real do provider, orçamento, fonte, matemática conciliada ou decisão
confirmada continua visível e bloqueada.

O registry privado de capacidades é append-only e exige escopo e etapa estreitos. `production`
requer procedimento, owner, implementação, gold/adversarial, zero crítico e vinte IDs distintos
vindos do ledger de execuções controladas. Nenhum escopo foi artificialmente credenciado por esta
entrega.

Alterações em documento, input econômico, Deal State ou intervenção humana canônica geram um
evento de invalidação persistente. Aprovação de pacote externo e introdução qualificada exigem
snapshot atual, acreditação de produção e fingerprints exatos de caso, material, match, plano e
autorização; qualquer evento posterior fecha o gate.

Esta é uma mudança candidata. O [Quality run 33529805136](https://github.com/carlosevg100/offroad/actions/runs/33529805136)
reconstruiu o banco do zero e passou RLS, adversariais, verticais, DAG, lint, gate integral e E2E.
Não houve migration remota, deploy, ativação de provider ou chamada paga.

## Control plane do pre-mortem, 01/09/2026

O candidato transforma os principais modos de morte do produto em contratos fail-closed. A nova
camada não calcula um score: fonte insuficiente, cálculo crítico não determinístico, artefato stale,
boundary de segurança não verificada ou autoridade ausente continuam bloqueando mesmo se todo o
resto estiver verde.

`@offroad/release-governance` passa a acreditar capacidades por escopo e etapa (`Represent`,
`Analyze`, `Recommend`, `Structure`, `External release`) e a separar uso preliminar, decisão
interna, material externo e ação externa. Produção exige procedimento, implementação, owner,
gold/adversarial, zero crítico e vinte casos reais distintos. O rollout `active` mantém duas ondas
disjuntas de dez casos e agora também exige aceite do control plane.

O mesmo pacote ganhou invalidação transitiva de evidência até cálculos, claims, materiais,
aprovações e lender matching; e um ledger tipado de intervenção humana capaz de expor correção
manual recorrente e minutos não capturados. Os contratos puros agora possuem a implementação
persistente candidata descrita acima; ela ainda não está ativa em ambiente remoto.

`@offroad/model-gateway` agora recebe classe e finalidade em todas as chamadas reais de
classificação, extração, conversa, análise, estrutura, redação e auditoria. Existe policy
fail-closed por provider, inclusive fallback, exigindo assurance vigente, finalidade/classe
permitidas, treinamento proibido e `no_store` para dado não público. O worker aceita os registros
por ambiente, mas enforcement permanece desligado até DPA/ZDR/base legal reais serem cadastrados;
nenhuma promessa contratual de vendor foi inventada.

A matriz completa está em `docs/build/PRE_MORTEM_CONTROL_MATRIX.md`. Este slice não adiciona SSO,
SCIM, DLP, pentest, disaster recovery ou acreditação automática dos knowledge packs. Nenhuma API
paga foi chamada e produção não foi alterada. O gate integral `pnpm check` em Node 24 aprovou os
42 pacotes: web com 162 testes, worker com 85, model gateway com 22, release governance com 11 e
build Next.js com 32 páginas.

## Fundação Brasil–Estados Unidos e idioma contínuo, 01/09/2026

O candidato passa a separar idioma de trabalho, idioma das fontes e jurisdição econômica. O mesmo
projeto pode alternar PT-BR e EN-US pela navegação autenticada, preservando `projectId`, query e
histórico. A locale do turno atual governa a próxima resposta do worker. O painel traduz os 80
rótulos canônicos do plano sem duplicar IDs, TaskRuns ou o DAG congelado.

`@offroad/credit-ontology` ganhou contratos para perfil BR, US ou cross-border, moeda, framework
contábil, política de idioma, evidência original e tradução atribuída. A projeção de material em
outro idioma referencia o mesmo fingerprint de conteúdo e o mesmo fingerprint econômico. Uma
tradução nunca substitui a evidência nem dispara novamente análise, conciliação ou cálculo.

A arquitetura de knowledge agora exige núcleo universal, pack Brasil, pack Estados Unidos e ponte
BR–US, além dos packs setoriais, de instrumento e de mercado. Registros carregam fonte, publisher,
jurisdição, idioma, data de vigência/captura, `as_of_date`, versão, status, fingerprint,
confidencialidade, escopo de reutilização e classe de atualização. A ponte explicita equivalência
exata, funcional, parcial ou inexistente; CCB não pode ser traduzida silenciosamente como “note”.

As TaskSpecs continuam exatamente 80. M01 resolve jurisdição e regime de evidência; M05 define
idioma e audiência; C02 carrega conhecimento aplicável; S03 aplica filtros jurisdicionais; A09
gera variantes por audiência e idioma. O registry e o compilador subiram para `2026.09.01-v3`;
planos já congelados permanecem imutáveis.

Esta fatia implementa contrato, projeção de interface/conversa e guardrails. Ela não afirma que os
quatro knowledge packs estejam preenchidos ou acreditados, nem que todos os materiais finais já
possuam compilador bilíngue institucional. Popular, revisar, versionar e promover esse corpus e os
compiladores continua sendo um programa de conteúdo e evals próprio. `pnpm check` com Node 24
passou nos 42 pacotes; web tem 162 testes, worker 82, ontology e work-plan 29 cada, e o Next.js
compilou 32 páginas. Nenhuma API paga foi chamada.

## Missão universal de dívida, entrada inferida e memória anterior ao questionário, 01/09/2026

O candidato atual remove a ancoragem implícita num instrumento. A nova ontologia representa a
missão por necessidade de capital, fonte de pagamento, família de capital, alocação de risco e
executabilidade de mercado, sob evidência pública, privada autorizada ou híbrida. Recebíveis
passam a ser uma alternativa entre várias, não o produto-base. Usos mistos e tranches distintas
são válidos desde a fundação.

A home deixou de gravar `capital_planning` apenas porque nenhum atalho foi escolhido. Um roteador
determinístico infere o job do pedido e dos anexos; o atalho funciona somente como desempate. O
pedido “tenho uma reunião com a Camil e quero apresentar um pitch de alternativas de dívida” é
classificado como tese de originação, não como ordem de contato externo. Antes de ativar o DAG, o
contrato exige audiência, objetivo da reunião e relacionamento ou exposição atual, reunidos num
único pacote curto de contexto.

O worker recebe agora até oito projetos anteriores relevantes da mesma organização quando a
companhia citada coincide. Essa memória é capability-bound, exclui o projeto corrente e não
pesquisa outros tenants. O agente deve mencionar projeto, recência e work product anterior antes
de perguntar se o usuário deseja atualizar ou começar algo novo. O painel de trabalho exibe a
questão pendente e seu motivo enquanto aguarda a resposta.

Este slice ainda é candidato local. Ele não foi aplicado a staging ou produção e não executa uma
pesquisa pública em background enquanto faltam audiência e relacionamento; portanto a interface
é obrigada a dizer apenas o que está realmente em execução. Mudança de intenção que exija trocar
o plano congelado de um projeto já existente e os executores privados de análise, estrutura,
materiais e matching continuam sendo fatias separadas.

O gate integral local em Node 24 aprovou lint, typecheck, testes e build nos 42 pacotes; o Next.js
compilou 32 páginas e o worker foi empacotado. O Quality run `33518894896` repetiu esse gate em
runner limpo e também reconstruiu o Supabase do zero: migration, suíte integral de não
interferência, verticais públicas, ativação semântica, schema lint e E2E/Playwright passaram. O
preview Vercel foi publicado. Os testes focados cobrem o caso Camil, contexto em turnos
sucessivos, memória anterior à pergunta, regimes de evidência e usos mistos. Zero chamada de
modelo, busca ou API paga foi realizada.

## Roteamento semântico e ativação governada de DAG, 01/09/2026

O workspace passa a separar duas decisões. O roteador de pedido continua classificando intenção,
escopo e efeito; o novo roteador de execução decide, sem chamada de modelo, se o turno pode entrar
num executor já liberado, se falta um contexto obrigatório ou se deve permanecer apenas na
conversa. Produção de material, aprovação, simulação e ação externa nunca são reinterpretadas
como autorização para iniciar pesquisa. Projeto privado ou com documentos também não entra nos
executores públicos.

As primeiras ativações são `company_debt_view` e `origination_thesis`. Com identidade já presente
na memória do projeto, o roteamento e o handoff ao DAG usam zero chamadas de modelo. Quando o nome
aparece apenas na linguagem livre, a chamada conversacional já existente pode normalizar somente
o nome e o contexto declarados; ela não escolhe o executor. O worker exige suporte literal do nome
no histórico do usuário e recusa nomes genéricos. Website não apoiado é descartado.

A persistência é atômica por
`worker_record_agent_response_and_activate_v1`: mensagem, perfil da companhia, brief versionado,
run e job especializado são gravados juntos. A função valida capability, organização, projeto,
plano ativo, base pública, ausência de documentos, escopo exato e idempotência. Os tetos existentes
permanecem US$ 0,75/duas chamadas para originação e US$ 0,95/duas chamadas para company debt view.
Nenhum aceite de representação, aprovação de material ou autoridade de introdução é criado.

Esta capacidade está em produção por PR #341; PR #342 incorporou o teste SQL ao workflow de banco.
O PR gate `33506053970` e o gate com o teste obrigatório `33506895933` passaram reconstrução limpa,
RLS, E2E, lint, tipos, testes e build. O staging foi reconciliado com a vertical pública ausente e
recebeu as migrations remotas `20260901121555` e `20260901121603`; o teste transacional passou com
rollback. Produção recebeu `20260901122420`, passou o mesmo teste e mantém o wrapper apenas para
`authenticated`, com implementação privada fechada. Security Advisor retorna zero findings nos
dois ambientes. O worker `33506612853` estabilizou no ECS e o Vercel publicou produção. Zero API
paga foi chamada. Os demais jobs seguem `conversation_only` até que seus executores alcancem o
próprio gate.

## Workspace conversacional persistente, promoção controlada, 01/09/2026

A entrada autenticada foi redesenhada como um único workspace de projeto: histórico e projetos
na navegação lateral, conversa persistente no centro e plano, documentos e artefatos no painel de
trabalho. As cinco sugestões iniciais são atalhos de intenção dentro do mesmo composer; não criam
funis ou estados paralelos. Texto e arquivos podem iniciar o mesmo projeto, e o shell é criado
antes de qualquer chamada de modelo para que a navegação não espere análise paga.

O estado continua canônico: `capital_projects` é a raiz, `document_intake_sessions` delimita
documentos e evidências, `agent_conversations`/`agent_messages` preservam o histórico e
`capital_project_plans` congela o DAG aplicável. O comando transacional
`start_advisor_project_v1` cria esses quatro elementos de forma idempotente; o comando
`submit_advisor_turn_v1` persiste a mensagem e enfileira uma única resposta assíncrona, com teto
de uma chamada e US$ 0,25, sem autorizar mercado ou reescrever evidência. O worker recebe somente
o recorte do projeto: brief, perfil, inventário documental, estados do plano, artefatos e doze
mensagens recentes; nomes de arquivos não são tratados como prova. Projetos públicos podem receber documentos e passar a trabalho privado, mas essa
promoção mantém `representation_status = not_claimed`.

A fronteira legal foi corrigida no contrato: os termos de confidencialidade são aceitos uma vez
por organização e legitimam somente o trabalho privado. Representação não é presumida nem
registrada durante preparação. A autoridade para apresentar o caso continua sendo um gate
posterior de `Introduce`, vinculado ao projeto, à versão dos materiais, à política de identidade
e aos destinatários exatos.

As migrations canônicas `20260901112115_conversational_advisor_workspace.sql`,
`20260901112122_advisor_turn_queue.sql` e `20260901112129_advisor_initial_turn_identity.sql`
foram validadas primeiro no Supabase `staging` e, após os gates obrigatórios, promovidas ao banco
de produção. O teste SQL dedicado passou com rollback, incluindo
criação atômica, replay idempotente, fila do primeiro turno e isolamento entre tenants. O primeiro
replay detectou e corrigiu um empate de timestamps na identidade da mensagem inicial. Security
Advisor retornou zero findings em staging e produção; o Performance Advisor não introduziu aviso
da feature e mostra apenas informações históricas de índices ainda sem uso. O workflow Quality
`33501504771` aprovou banco, E2E e o gate integral dos 42 pacotes; no web, a suíte tem 160 testes,
no worker 74, e o build de produção compilou a nova superfície. O schema e a aplicação foram
promovidos por PR #339; o ajuste focado da suíte do worker entrou por PR #340. O run final
`33503989459`, o deploy do worker e o Vercel de produção passaram. Nenhuma API paga foi chamada.

Esta fatia entregou memória, superfície-base e turnos reais assíncronos. As duas verticais públicas
existentes reabrem primeiro no projeto conversacional e expõem o trabalho já executado a partir do
painel do mesmo projeto. A liberação acima conecta novos prompts a esses dois executores; a
atualização de plano, análise documental profunda, estruturação, materiais e matching continuam
sujeitos aos próprios gates antes de o workspace ser declarado completo.

## Workspace AI-native e primeira vertical pública de originação, 01/09/2026

A home autenticada passou a oferecer seis formas de começar sobre uma única memória de projeto.
A interface usa “Comece de onde você está” e “Como a Offroad pode ajudar agora?”, sem exigir que
o usuário formule tecnicamente um problema. As entradas são jobs com políticas de input, acesso,
primeiro work product e gate próprios; não são personas nem funis independentes.

A primeira vertical executável é `origination_thesis`. Ela cria projeto, brief e plano imutável;
abre o projeto imediatamente; executa nove TaskSpecs com dependências explícitas; realiza sete
buscas públicas limitadas; e usa uma única síntese estruturada para produzir um meeting brief com
sinais, hipóteses, condições, perguntas, desconhecidos e URLs verificadas. A navegação reabre o
projeto persistente, e o painel mostra TaskRuns reais em vez de progresso simulado.

O modelo recebe somente contexto público mínimo. O teto inicial é duas chamadas e US$ 0,75,
incluindo reserva máxima de US$ 0,035 para busca; a execução normal usa uma chamada de síntese. A
correção é incremental: registra a decisão sobre o fingerprint exato, invalida somente `M07`,
reaproveita `M06`, `C02` e `K04`, não repete pesquisa e permite apenas uma nova síntese com custo de
busca zero.

O schema foi promovido primeiro em `staging` e depois em produção pelas oito migrations canônicas
`20260901035241` a `20260901035319`. Tabelas, RPCs e `FORCE ROW LEVEL SECURITY` foram verificados
no projeto de produção. Os testes `origination_thesis_vertical.sql` e
`project_company_scope.sql` passaram com rollback, incluindo isolamento, capability incorreta,
ciclo completo dos nove artefatos, revisão M07-only e replay idempotente. A migration
`20260901035442_capital_project_fk_index_hardening.sql` eliminou os cinco foreign keys sem índice
introduzidos pelo runtime. Security Advisor e a categoria `unindexed_foreign_keys` do Performance
Advisor retornam zero findings tanto em staging quanto em produção. O ledger de briefs de
produção continua vazio; nenhuma execução de modelo foi disparada durante a promoção.

A PR #336 foi incorporada a `main`. O workflow Quality `33467602650` passou em banco, E2E e no
gate completo de lint, tipos, testes e build; o deploy do worker `33467602677` estabilizou no ECS;
e o Vercel publicou o deployment `5bBMwnK1VJe2NiwTKVc4YrinQ8NU`. Nenhuma API paga foi chamada
nessa validação. A primeira execução humana em produção permanece um teste explícito do produto,
com o orçamento limitado já descrito, e não uma etapa automática de deploy.

Esta entrega promove apenas a vertical pública de tese de originação. Ela está tecnicamente pronta
para o primeiro teste humano/gold case em produção, mas ainda não tem qualidade institucional
comprovada por esse teste. As outras cinco entradas continuam declaradas ou roteadas para
capacidades existentes e não devem ser apresentadas como completas até seus executores,
interfaces e gold cases passarem pelos próprios gates.

## Entendimento preliminar isolado e ordem canônica da entrada, 31/08/2026

A entrada foi corrigida para uma única sequência: companhia; operação e documentos preliminares;
pesquisa pública e entendimento preliminar; confirmação P0; solicitação sob medida; análise
profunda e esclarecimentos; case e sua confirmação; estrutura; plano de produção; materiais e
mercado. O antigo salto direto da
operação para uma tela genérica de informações deixou de ser a sequência válida no workspace.

Na etapa da operação, texto e documentos agora são portas equivalentes. Um usuário pode deixar
todos os campos manuais vazios quando já enviou material: o gate considera os arquivos, o worker
extrai objetivo, montante, moeda, prazo, setor e geografia quando houver evidência ancorada, e o
que continuar sem suporte aparece como ponto aberto para confirmação. Uma submissão sem texto e
sem documento permanece bloqueada para não gastar processamento analisando um caso vazio.

`preliminary_understandings` preserva versões, fingerprint do input, fingerprint do objeto,
decisão, correção, autor e horário. A leitura usa um job `preliminary_analysis` e uma capability
própria. Ela pode carregar somente declaração da companhia/operação, documentos preliminares e
extrações ancoradas. As RPCs de case completo exigem `case_analysis` e rejeitam essa capability,
impedindo acesso a pricing, lender graph, Deal State, estrutura, materiais ou distribuição. Cinco
pesquisas públicas independentes podem rodar em paralelo e são mantidas como contexto externo com
URL; uma única chamada estreita compila a leitura corrigível.

A confirmação P0 não confirma o case e não cria oportunidade. Ela apenas compila a lista
documental sob medida e devolve a sessão à coleta. Um run posterior, depois dos documentos
solicitados, pode abrir o DAG de análise completa. Alteração na companhia, objetivo ou documentos
preliminares antes da confirmação supersede a leitura antiga; uploads posteriores pertencem ao
loop de análise profunda e não reescrevem P0.

O case diagnóstico agora é compilado antes da estrutura e recebe um aceite próprio. Esse aceite
é uma countersignature do snapshot publicado pelo worker, no mesmo commit transacional que cria a
oportunidade; o tenant não pode inventar ou modificar o payload aprovado. Somente depois desse
gate o DAG de estruturação roda. A confirmação da estrutura ainda não produz artefatos: teaser,
modelo financeiro, term sheet e índice de data room exigem também um plano de produção aprovado.

Typechecks, lint e builds de web e worker passaram; as suítes completas desses dois pacotes
passaram com 155 testes web e 65 testes do worker, incluindo o caminho sem texto e com extração
documental de objetivo e montante. O gate integral sem cache aprovou 168/168 tarefas em 42
pacotes. Nenhuma API paga foi chamada.

A migration foi aplicada no branch Supabase de staging e o teste adversarial integral de RLS foi
aprovado. O advisor de segurança retornou zero alertas; os dois avisos de foreign key sem índice
foram corrigidos e revalidados. Produção não foi alterada. A entrega continua candidate até PR,
preview e smoke tests verdes.

## Match privado, destinatário exato e autorização específica, 29/08/2026

O matching aprovado passou a ser apenas uma shortlist privada. Ele não autoriza contato e não
vira distribuição por inferência. Cada nome selecionado produz um target persistido com identidade
de origem, fingerprint do mandato e racional. A preparação da introdução exige, separadamente,
contato nominal vigente, revalidação do mandato, lista exata de materiais e revisão técnica do
mesmo fingerprint que a companhia verá.

O cliente autoriza instituição por instituição, contato por contato e material por material. O
snapshot de autorização preserva esses elementos e a política de identidade do caso. Alteração no
material, mandato, contato ou match screen invalida a passagem. Resolução de contatos e atestado
técnico são funções privadas executáveis apenas pelo serviço; o cliente pode autorizar o plano
pronto, mas não fabricar contato ou autoatestar a revisão.

O registro final é deliberadamente passivo: `record_qualified_introduction_release` não envia
e-mail, não abre diligência e não conduz processo. Ele grava evidência append-only somente depois
que o pacote autorizado foi efetivamente entregue ao contato nomeado, com canal e referência
externa. A reexecução exata é idempotente e uma segunda referência para o mesmo destinatário falha
fechado.

As migrations `20260829223811`, `20260829224111`, `20260829225056` e `20260829225306` estão apenas
no Supabase staging. A inspeção confirmou que `authenticated` não resolve contatos, não atesta
revisão técnica e não registra release; o serviço pode executar as três funções. O Security Advisor
está com zero lints e os novos foreign keys têm índices de cobertura. O gate local passou nos 42
pacotes. Produção permanece inalterada.

A política institucional de distribuição ainda não foi ativada. Antes do teste integral, é preciso
aprovar prazo máximo de revalidação de mandato, limite da primeira onda, quantidade mínima de
âncoras e fonte metodológica. Até isso ocorrer, autorização e release falham fechados.

## Deal State persistente, gates executáveis e contenção de custo, 29/08/2026

O worker deixou de tratar análise, materiais, matching e introdução como uma única execução.
O estado canônico do caso agora é persistido em objetos versionados e fingerprintados:
entendimento, findings, esclarecimentos, decisão de estrutura, plano de produção, materiais,
revisão do pacote, tela de matching e autorização de saída. Cada objeto declara exatamente quais
versões anteriores consumiu. Alteração upstream invalida a progressão dependente, e repetição do
mesmo input é idempotente.

Os gates agora são executáveis. O modo diagnóstico organiza evidências, produz entendimento e
findings e para antes de qualquer material ou busca de mandato. Materiais exigem entendimento e
estrutura confirmados, além do plano de produção aprovado. Matching exige pacote aprovado.
Introdução exige autorização explícita de saída. O replay diagnóstico provou zero chamadas de
modelo e zero gasto; o fluxo integral autorizado continua coberto como regressão, mas não foi
executado contra APIs pagas nesta entrega.

As migrations passaram primeiro no branch `staging` do Supabase como `20260829151323`,
`20260829151523` e `20260829152233`. RLS e FORCE RLS estão ativos, escrita direta do tenant é
negada, dependências são validadas por fingerprint, retries exatos retornam o mesmo objeto e
isolamento entre organizações foi provado em transação. O PR #314 aprovou reconstrução integral do
banco, suíte completa de RLS, Playwright, lint, typecheck, testes, build e Vercel. O worker foi
promovido ao ECS e estabilizou.

Produção recebeu o mesmo schema como `20260829154103`, `20260829154114` e `20260829154126`.
A inspeção estrutural confirmou quatro políticas, RLS e FORCE RLS, ausência de acesso anônimo,
SELECT tenant-scoped e nenhuma escrita direta de `authenticated`. O Security Advisor reportou zero
lints. O ledger entrou vazio e nenhuma API paga foi executada. O primeiro teste produtivo deve
permanecer diagnóstico e parar para confirmação antes de liberar estrutura, materiais ou matching.

## Fronteira executiva e feedback pós-introdução, 29/08/2026

O fluxo canônico agora possui uma topologia executiva imutável de sete fases: `Understand`,
`Diagnose`, `Structure`, `Prepare`, `Match`, `Introduce` e `Capture Feedback`. Os estados
detalhados continuam preservados dentro dessas fases. Underwriting, diligência do financiador,
proposta final, negociação definitiva, documentação, desembolso e monitoramento permanecem fora
do trabalho executado pela Offroad.

`@offroad/case-understanding` contém o contrato tipado da fronteira, o mapeamento de cada estado
para uma das sete fases e a transição explícita para captura de feedback. O novo pacote
`@offroad/market-feedback` transforma sinais append-only em outcomes por introdução, projeções
comportamentais do lender graph e métricas com numeradores e denominadores explícitos. Marcos de
diagnóstico, estrutura e materiais são projetados do event log existente em
`processing_runs.stages`; nenhum segundo workflow foi criado para analytics.

A migration `qualified_introduction_feedback` adiciona um ledger tenant-scoped de sinais
pós-introdução, uma RPC estreita e uma projeção privada por financiador e fingerprint de mandato.
O ledger não altera mandatos declarados, exige motivo para recusa, contagem para solicitações
adicionais e supersessão explícita para correções. RLS, FORCE RLS, grants mínimos, auditoria e
testes de não interferência foram adicionados. As três migrations passaram no branch `staging` do
Supabase; o Security Advisor reportou zero lints e a FK de `recorded_by` foi coberta após o
Performance Advisor identificá-la. O smoke tenant-scoped em transação passou, inclusive a correção
de uma recusa com o mesmo timestamp: sem supersessão explícita o sinal positivo é bloqueado; com
supersessão, os dois eventos permanecem auditáveis. Restam somente avisos de índice ainda não usado,
esperados numa tabela nova e vazia. A capacidade permanece candidate por disciplina de rollout;
o banco reconstruído, o teste tenant completo e os demais gates obrigatórios foram aprovados no
PR #313 antes da promoção do schema.

O gate integral local passou em Node 24.19.0 nos 42 pacotes: lint, typecheck, todos os testes e
build. O pacote `market-feedback` fechou seis testes e `case-understanding`, 52.

Após os três gates do PR passarem, as migrations foram promovidas ao Supabase de produção como
`20260829141835`, `20260829141838` e `20260829141841`. Os tipos foram regenerados diretamente dessa
fonte. A verificação estrutural confirmou RLS e FORCE RLS, SELECT tenant-scoped, ausência de grants
diretos de INSERT, UPDATE e DELETE, RPC pública estreita e projeção privada. O ledger entrou vazio.
O Security Advisor de produção reportou zero lints; o Performance Advisor reportou apenas os três
índices novos ainda sem uso, comportamento esperado antes do primeiro feedback real.

## Fluxo canônico e início da construção profunda, 29/08/2026

A sequência integral do produto foi congelada em `docs/product/PRODUCT_WORKFLOW.md`. Intake,
entendimento, findings, esclarecimentos, estruturação, plano de produção, materiais, aprovação da
companhia, matching e introdução qualificada são estados distintos. Quatro gates explícitos
controlam a passagem: base suficiente para entender, estruturar, produzir e acessar o mercado.

A auditoria de profundidade mediu 270 entradas no House Playbook e 224 procedimentos compilados.
Todos os 224 permanecem `candidate`; nenhum atingiu `production`. Há kernels reais de ingestão,
conciliação, dívida, recebíveis, governança de claims e fronteiras de introdução, mas da leitura à
distribuição eles ainda não formam uma capacidade institucional conectada e comprovada. Contagem
de IDs, truth sets genéricos e testes de presença não podem mais ser tratados como prova de
execução. O diagnóstico e o plano vertical estão em
`docs/build/DEEP_BUILD_AUDIT_AND_PLAN_2026-08-29.md`.

O primeiro contrato executável das etapas 3 e 4 foi adicionado a `case-understanding`. Ele define
os estados e transições permitidos, sete classes de afirmação, snapshot versionado e
fingerprintado, findings priorizados, lote de no máximo cinco esclarecimentos, gates baseados em
requisitos explícitos e invalidação incremental de dependências. O contrato de promoção do
`credit-playbook` também passou a exigir executor, saída, persistência, estados do produto, testes,
gold cases, adversariais, E2E e avaliação de custo antes de aceitar maturidade `production`.

A vertical de recebíveis agora possui um adapter explícito para esse contrato. O relatório
governado é projetado em claims de classificação, dez métricas centrais da carteira, dezoito fatos
contratuais, defeitos medidos e perguntas não respondidas. Um gravame anterior comprovado continua
`confirmed`, mas aparece como finding crítico; conflito permanece `divergent`; ausência permanece
`absent`. O adapter não projeta shortlist, identidade de financiador, materiais ou recomendação de
estrutura e mantém essas ações bloqueadas.

Os testes focados fecharam com 51 testes em `case-understanding`, 30 em `case-engine` e 162 em
`credit-playbook`, além dos respectivos typechecks. Isso é a fundação da construção profunda, não
a conclusão das etapas 3 a 11. A próxima entrega é persistir esse estado do caso e expor findings
e esclarecimentos no produto sem executar materiais ou matching antes dos respectivos gates.
O `pnpm check` integral também passou em Node 24.19.0 nos 41 pacotes após a integração.

## Vertical de recebíveis, trilho real de produção da Fase 7, 28/08/2026

O worker deixou de depender de um objeto `receivables_case` montado manualmente. CSV, XLSX e
XLS entregues pela jornada real agora produzem fragmentos canônicos comprimidos, endereçados por
hash e persistidos exclusivamente no schema `private`. Arquivos ZIP aceitos são lidos como pacote
fiscal de NF-e; ZIP vazio ou genérico é recusado. Repetição byte-idêntica é idempotente e tentativa
de substituir a mesma versão por conteúdo diferente falha como violação de integridade.

O processamento do caso carrega somente as versões atuais dos documentos da própria sessão e
congela exatamente esses fragmentos no input da execução. A partir deles, o montador reconstrói a
carteira título a título, preserva séries de eventos ausentes como ausentes, executa os controles,
calcula as métricas da Fase 1, avalia as rotas da Fase 2A e cruza os programas governados da Fase
2B. Bancos, financeiras, SCDs, factorings, FIDCs, fundos privados, family offices, investidores
institucionais e programas patrocinados por sacados usam o mesmo contrato; FIDC não é default nem
pré-requisito.

O relatório completo, incluindo identidades e critérios de programas, permanece no resultado
privado do job. O snapshot público contém somente classificação, métricas, cobertura, achados,
condições, bloqueios e o próximo lote de evidências. Nenhum nome de financiador, shortlist,
observação interna ou contato é exposto à companhia. Ausência do valor pretendido produz
`needs_requested_amount`; ausência de uma série histórica não vira zero.

O gate local integral passou em Node 24.19.0 nos 41 pacotes: lint, typecheck, testes e build. O
worker fechou 51 testes; o web, 135; evals, 38; e o replay bruto processou 34.397 títulos. A
reconstrução local do banco não pôde ser executada nesta máquina porque não há Docker. Por isso a
Fase 7 continua candidate até o job obrigatório `Database (migrations, RLS, lint)` aplicar todo o
histórico do zero, executar `rls_non_interference.sql` e aprovar a migration em CI. Esse gate
passou no PR #300, run `33201518095`, junto com Playwright e o quality gate dos 41 pacotes.
Staging e um caso controlado em produção continuam obrigatórios antes da declaração de prontidão
oficial.

## Vertical de recebíveis, coleta governada de evidências da Fase 6, 28/08/2026

Os 18 fatos de elegibilidade agora possuem uma definição canônica de coleta no
`credit-playbook`: etapa, lote, prioridade, instrução, motivo, evidências aceitáveis e padrão de
conclusão. A lista não é duplicada no runner nem em prompt de agente.

O `case-engine` compila as lacunas reais em um lote atual de no máximo cinco tarefas e backlog
ordenado. Evidência completa e segura não volta a ser pedida. Amostra favorável pede a cobertura
remanescente; estimativa pede substituição; fonte vencida pede atualização; conflito pede
reconciliação; e cessão, trava ou gravame conhecido pede resolução, liberação ou segregação antes
da coleta genérica. Declaração isolada nunca completa um fato de rota.

Mandatos também produzem um plano interno de governança: política faltante, vencida ou divergente
fica separada da confirmação de apetite e capacidade atuais. Transação observada e inferência da
mesa continuam incapazes de confirmar o estado ao vivo. O plano não executa contato, consulta
externa, recomendação ou divulgação de identidade.

O replay bruto da Vertentes reconhece o que já foi comprovado nos arquivos e mantém titularidade,
gravames e controle de duplicidade como trabalho aberto. Contrato e golds:
`docs/knowledge/recebiveis/PHASE-6-EVIDENCE-COLLECTION.md`.

O gate integral passou em Node 24.19.0 nos 41 pacotes: lint, typecheck, testes e build. Os pacotes
alterados fecharam com 160 testes de `credit-playbook`, 29 de `case-engine` e 37 de `evals`.

## Vertical de recebíveis, fatos contratuais e verdade de mercado da Fase 5, 28/08/2026

O catálogo canônico agora define como resolver os 18 fatos usados pela
elegibilidade técnica. Cada observação traz escopo, cobertura, data, validade,
fonte, responsável e procedência. Ausência de ocorrência, amostra favorável,
estimativa e fonte vencida não comprovam um fato para a carteira. Evidência
material divergente permanece desconhecida; ônus anterior conhecido mantém as
rotas afetadas fechadas mesmo quando aparece em parte do universo.

O detector bruto da Vertentes deixou de concluir titularidade, inexistência de
ônus e controle de duplicidade a partir da tape ou da amostra fiscal. O runner do
caso recebe observações e resolve o contrato antes de executar a elegibilidade de
rotas; o caminho anterior com fatos pré-resolvidos existe somente como adapter de
regressão.

Observações de mandato agora identificam quem as registrou e separam política de
pesquisa de mercado. Transação observada e inferência de mesa ajudam a pesquisar,
mas não decidem política nem liberam shortlist. Regra publicada pode sustentar
política vigente; apetite e capacidade ao vivo continuam exigindo declaração
direta ou confirmação de relacionamento.

O gate integral local passou em Node 24.19.0 nos 41 pacotes: lint, typecheck,
testes e build. Entre os pacotes centrais, passaram 54 testes de
`receivables-analysis`, 38 de `fund-mandate`, 21 de `case-engine` e 37 de `evals`.
Recomendação, contato, distribuição, introdução qualificada e aprovação de crédito
continuam desabilitados. Contrato: `docs/knowledge/recebiveis/PHASE-5-CONTRACT-AND-MARKET-GATES.md`.

## Vertical de recebíveis, leitura bruta e detectores da Fase 4, 28/08/2026

A Vertentes deixou de usar o universo normalizado como substituto da leitura dos
documentos. O replay agora parte somente dos arquivos brutos autorizados pelo
manifesto, processa a carteira completa de 34.397 títulos e a amostra fiscal e
executa controles determinísticos com âncoras na fonte.

Os oito defeitos congelados foram reproduzidos com recall e precisão de 100%: grupo
econômico fragmentado, prazos acima da política, possível parte relacionada, dívida
e coobrigação omitidas, ajuste contábil, NF-e cancelada ainda aberta, diluição mal
classificada e pico mensal de originação. As quatro perguntas esperadas também são
geradas somente após busca exaustiva na sala entregue.

O parser deixou de truncar silenciosamente tapes institucionais e ganhou leitura
segura de ZIP fiscal. A amostra fiscal não é extrapolada: os 70 cancelamentos
entregues produzem 41 cruzamentos com títulos abertos, não um número estimado para a
carteira inteira. Chaves sintéticas fora do padrão de 44 dígitos permanecem
visíveis como alerta de qualidade.

O replay continua corretamente bloqueado em programas compatíveis e completude do
pipeline. Factoring, financeiras, bancos, SCDs e FIDCs estão no catálogo, mas
cessibilidade, entrega, ônus anteriores e mandatos live não podem ser inventados a
partir desta sala. Detalhes: `docs/knowledge/recebiveis/PHASE-4-RAW-DETECTION.md`.

A entrega foi promovida por meio do PR #296. O gate integral do `main`, o rollout do
worker de documentos e o deployment de produção da Vercel concluíram sem falhas;
`offroad.capital` respondeu HTTP 200 após a promoção.

## Vertical de recebíveis, harness E2E da Fase 3, 27/08/2026

O `@offroad/case-engine` ganhou um runner único para classificação, Fase 1, Fase 2A,
Fase 2B, defeitos e perguntas. O `@offroad/evals` aplica os gates congelados de
cálculo, classificação, defeitos, programas, perguntas e procedência. Apetite atual
e capacidade disponível agora preservam seus source IDs no resultado do matching.

Um gold replay compacto passa todos os gates. O baseline original da Vertentes
fechava exatamente seis cálculos a partir do universo canônico e falhava nos oito
detectores, nos dois programas sintéticos e nas quatro perguntas então ausentes.
Esse estado histórico foi superado pelos detectores da Fase 4 acima. Nenhuma
superfície de produto consome shortlist e nenhuma fronteira externa foi aberta.

Detalhes: `docs/knowledge/recebiveis/PHASE-3-HARNESS.md`.

## Vertical de recebíveis, programas e mandatos da Fase 2B, 27/08/2026

O matching deixou de partir de um cadastro genérico de fundos. O contrato canônico
agora separa instituição, entidade legal, programa ou veículo, rota, política,
apetite e capacidade. O universo inclui bancos, financeiras, SCDs, factorings,
FIDCs, fundos privados, family offices, investidores institucionais e programas de
sacados. FIDC não recebe prioridade nem é necessário para que uma alternativa seja
promovida.

`@offroad/fund-mandate` resolve observações versionadas com fonte, data e validade.
Capacidade e apetite ao vivo precisam de confirmação direta ou de relacionamento;
inferência e fonte expirada não liberam shortlist. `@offroad/receivables-analysis`
aplica os critérios ao caso da Fase 2A sem score opaco e conserva abstenção quando a
métrica é estimada ou o denominador está ausente.

`@offroad/financial-core` calcula o envelope de alocação com precisão decimal. Um
programa pode financiar parte de uma operação maior; o limite confirmado é o menor
entre pedido, tíquete máximo, capacidade confirmada e colateral elegível. A falta de
cobertura integral não elimina um cheque parcial que atende ao mínimo.

O banco ganhou `capital_provider_programs` e observações de mandato vinculadas ao
programa exato, append-only e protegidas por RLS. Staging passou no smoke test de
isolamento e o auditor de segurança retornou zero alertas. Seis casos sintéticos,
incluindo factoring e financeira sem qualquer FIDC compatível, capacidade inferida,
rota indisponível, métrica estimada e colateral insuficiente, são verificados por
oráculo Python independente. Recomendação à companhia, contato, distribuição,
introdução qualificada e aprovação de crédito continuam desabilitados.

## Vertical de recebíveis, elegibilidade técnica de rotas da Fase 2A, 27/08/2026

O catálogo canônico deixou de tratar FIDC como sinônimo de financiamento por
recebíveis. `@offroad/credit-playbook` agora separa mecanismo econômico, rota, fonte
de capital e prestador em nove rotas: factoring, desconto por banco ou financeira,
aquisição digital por SCD ou estrutura parceira, FIDC multicedente, programa do
sacado, linha rotativa garantida, CCB com cessão fiduciária, veículo dedicado e
securitização com Certificados de Recebíveis.

Cada critério possui referência primária do Planalto ou oficial de BCB e CVM. O
executor determinístico em `@offroad/receivables-analysis` retorna elegível,
condicional, não avaliado ou inelegível. Estimativas de velocidade e custo aparecem
somente como observação de mesa e não participam da decisão. Titularidade incerta não
é aceita; cessão ou gravame anterior não resolvido bloqueia; pendência documental ou
operacional remediável condiciona.

`@offroad/financial-core` ganhou o agregador título a título. Ele exige classificação
completa e exclusiva dos recebíveis abertos, reconcilia 100% do denominador e impede
exclusão rígida baseada em estimativa. A regra legal permanece fora do pacote
matemático. `@offroad/case-engine` compila a fonte do playbook no executor, evitando
catálogo duplicado.

Cinco casos sintéticos congelados, inclusive dupla cessão, comprovante de entrega
pendente, titularidade apenas estimada e rota rápida sem dados institucionais, são
validados por oráculo Python independente. O gate não faz matching de entidade,
recomendação, contato, introdução ou aprovação de crédito. Esses limites permanecem
falsos até a Fase 2B com mandatos governados e atuais.

## Vertical de recebíveis A1, gate matemático integral da Fase 1, 27/08/2026

O caso sintético Vertentes A1-03 passou a existir dentro de `@offroad/testing-fixtures` com os 21
arquivos de entrada, a verdade reservada do gerador, a representação canônica comprimida, hashes e
manifesto. As camadas são separadas: código que testa extração deve partir somente dos arquivos
`raw`; a verdade reservada não pode ser usada como atalho. O manifesto registra 34.397 títulos,
1.200 sacados, 1.199 grupos econômicos, 30.734 liquidações, 4.840 eventos de diluição e 340
prorrogações cuja data original do evento não está disponível no intake.

`@offroad/financial-core` agora calcula deterministicamente quantidade e volumes, tíquete médio,
prazos ponderados original, vigente e remanescente, DSO simples e countback diário, aging em sete
faixas e concentração Top 1, Top 5, Top 10, Top 50 e HHI por sacado e grupo econômico. Cada saída
declara universo, período, fórmula versionada, hash do dataset e âncoras de origem. Ausência de
denominador retorna `not_evaluable`; não vira zero. `@offroad/receivables-analysis` consome essa
fonte canônica e deixou de recalcular localmente as métricas migradas.

O universo canônico passou a declarar cobertura de liquidação, diluição, prorrogação, recompra e
cessão ou gravame.
Isso impede que evento não fornecido seja interpretado como zero. O cálculo dinâmico reconstrói 23
transições mensais usando o vencimento original, calcula 24 safras nos horizontes de 30, 60, 90,
120, 180 e 360 dias, diluição, write-off final, perda ajustada, liquidação pontual e prorrogação por
quantidade, valor e dias ponderados. Safras ainda imaturas retornam `not_evaluable`. Taxa de
recompra também retorna `not_evaluable` quando o volume cedido, seu denominador econômico, não
existe.

O gold dinâmico vem de um oráculo Python independente do motor TypeScript e compara cada célula da
matriz e de cada safra. A curva calculada é de não pagamento no horizonte e não é rotulada como
evento de write-off. A diluição total é 2,447267% da originação, mas o caso não identifica causa no
nível de título; a saída conserva `other` e emite a limitação em vez de inventar a abertura.

A auditoria encontrou um erro material no gabarito legado: exclusões calculadas de forma
independente contavam títulos sobrepostos mais de uma vez. A cascata exclusiva correta, sob a
política sintética estimada do caso, produz R$ 8.877.495,23 de carteira elegível e 74,619108%, não
R$ 8.618.471. Esse cenário continua rotulado como estimado e não representa critério confirmado de
comprador.

O bloco de estrutura e custo agora fecha a ponte da dívida, conversões de taxas por dentro e por
fora, CET por fluxos datados e advance rate implícito. Um segundo oráculo Python independente
confirma cada valor. A dívida ajustada é R$ 22,26 milhões, a dívida líquida é R$ 20,94 milhões e a
alavancagem é 5,453125x sobre EBITDA reportado de R$ 3,84 milhões. O gabarito legado usava um EBITDA
ajustado de R$ 4,16 milhões sem suporte documental e foi corrigido com rastreabilidade.

No exemplo Prime, desconto mensal por fora e tarifa ad valorem produzem R$ 94.570 de recursos
líquidos e CET de 62,448085% ao ano antes de tributos. Como o tratamento tributário não foi
fornecido, o resultado continua incompleto e nenhum IOF é imputado. O advance rate de 92,904117% é
um cenário estimado. A perda ajustada da carteira é identificada como proxy governada, não como
perda esperada de safra nem como política real de comprador.

`@offroad/receivables-analysis` ganhou uma orquestração canônica sem aritmética econômica duplicada.
O relatório diferencia gate matemático de completude do caso e mantém recomendação, buyer fit,
introdução e aprovação de crédito desabilitados. A Fase 1 aprova contratos, cálculos, replay e
procedência. Elegibilidade regulatória e contratual é o próximo gate.

Os testes focados cobrem hashes de entrada, verdade e expected outputs, replay independente da
ordem, datas economicamente distintas, fronteiras de aging, invariantes, procedência e igualdade
exata com o gold. O benchmark local em Node 24 registrou mediana de 318,65 ms para o cálculo
estático, 1.082,61 ms para o dinâmico e 1.414,71 ms para o relatório integral da Fase 1 sobre
34.397 títulos.

## Gate jurídico inicial v3, 27/08/2026

O primeiro aceite de empresas e assessores deixou de exibir um resumo duplicado como se fosse o
termo integral. A versão `2026-08-27-v3` contém o Termo de Confidencialidade e Autorização de
Trabalho Preliminar completo em português e inglês, com resumo operacional separado e duas
manifestações inequívocas: concordância com a versão integral e confirmação do direito de fornecer
as informações para análise privada.

O gate autoriza somente compreender a companhia, organizar e conciliar informações, analisar
alternativas e preparar materiais dentro do ambiente privado. Não prova representação da
companhia, não constitui mandato, exclusividade ou contratação comercial e não autoriza contato
com financiadores. Representação verificada e autorização de distribuição da versão exata dos
materiais continuam sendo gates posteriores e independentes.

A migration `20260827162103_legal_acceptance_v3.sql` está aplicada em staging e produção. O ledger
imutável preserva versão, hash, texto exato das duas declarações, usuário, organização, data,
método de aceite e, quando disponíveis no Data API, IP e user agent. O Security Advisor de staging
e produção retornou zero findings. Os aceites v1 e v2 existentes não foram reescritos nem
reinterpretados: a declaração histórica de autoridade permanece verdadeira em sua coluna original
e os novos campos permanecem nulos. O `pnpm check`, a reconstrução completa do banco, a suíte RLS e
o E2E autenticado passaram no CI do PR #281.

## Máquina de estados canônica do onboarding, 27/08/2026

Empresa e assessor agora têm uma única sequência executável: boas-vindas, confidencialidade,
identificação da captação e sete marcos guiados. `resolveBorrowerOnboardingView` concentra as
decisões de tela e não permite que parâmetros de URL ultrapassem pré-condições. Voltar e Editar são
operações de navegação, sem efeito no ciclo de vida da sessão.

Os arrays e regras dos formulários antigos deixaram de governar empresa e assessor. O mecanismo
legado restante é exclusivo do cadastro de financiadores. A rota de nova captação também passou a
exigir nome, política de identidade e declaração de representação antes de criar uma sessão, de
modo que primeira e próximas captações obedecem ao mesmo contrato.

A migration `20260827221500_configure_existing_onboarding_intake.sql` transforma o comando inicial
em create-or-configure. Editar o projeto preserva ID, documentos e status e não duplica a evidência
de declaração. A migration e o cenário transacional foram validados no Supabase staging; o
Security Advisor retornou zero findings. O relatório completo está em
`docs/build/ONBOARDING_STATE_MACHINE_REVIEW_2026-08-27.md`.

## Confidencialidade, identidade do projeto e gate de representação, 27/08/2026

O início do onboarding de empresas e assessores passou a ter uma etapa anterior à coleta. O usuário
aceita um compromisso versionado de confidencialidade e autorização de trabalho, escolhe um
codinome para o projeto e define se a futura abordagem será identificada e restrita ou começará por
um teaser blind. O aceite inicia somente a preparação privada. E-mail pessoal continua permitido e
nunca é tratado como prova de representação.

O banco preserva o texto exato aceito, hash, versão, usuário, organização e data em um ledger
imutável. A relação com a companhia nasce como declaração e evolui separadamente por evidências
adequadas ao caso, como função societária, registro corporativo, carta de contratação, mandato,
confirmação da companhia, procuração ou aprovação corporativa. A coleta e a análise podem avançar
enquanto essa confirmação é concluída, mas nenhuma distribuição pode ocorrer antes dela.

O gate de saída é aplicado no banco, não apenas na interface. Uma introdução qualificada exige, ao
mesmo tempo, representação verificada, fingerprint exato do material aprovado, política de
identidade idêntica à do projeto e destinatários individualmente autorizados. Revogar a autorização
devolve o projeto ao estado privado. A migration canônica é
`20260827005724_private_project_authorization_gate.sql`.

O schema foi aplicado em produção, os tipos TypeScript foram regenerados e a suíte RLS completa
passou dentro de uma transação revertida no banco real. O Security Advisor retornou zero findings;
os avisos de performance são índices sem uso em tabelas ainda vazias, não foreign keys sem índice
nem regressões desta entrega. O gate local completo passou nos 41 pacotes.

## Intake guiado em sete marcos, 26/08/2026

O onboarding de empresas e assessores deixou de renderizar o fluxo legado de três formulários.
A jornada visível agora segue os sete marcos definidos no ADR 0014: empresa, operação, informações,
entendimento, esclarecimentos, pacote institucional e investidores. Os três primeiros marcos são
ações do cliente; os quatro seguintes representam trabalho real e permanecem bloqueados até que o
estado persistido correspondente exista. O percentual parte de zero e é derivado do marco atual.

O primeiro marco combina identificação compacta, explicação livre da companhia e upload opcional
de material institucional. O usuário pode voltar aos marcos já iniciados ou cancelar somente a
tentativa corrente. O botão `Começar` apresenta estado pendente imediatamente e o início da jornada
passou de várias chamadas independentes para um único comando transacional no banco.

As migrations `20260826224711_start_onboarding_intake_atomic.sql` e
`20260826225428_guided_company_profile_collecting_status.sql` criam os comandos atômicos de início
e salvamento do primeiro marco. O teste dirigido no Supabase staging comprovou sessão
`collecting`, atualização do progresso, persistência da empresa e avanço para operação na mesma
transação. O Security Advisor de staging retornou zero findings. O gate local completo passou nos
41 pacotes; a aplicação web também passou 127 testes e build de produção com 28 rotas.

## Workspace do Agente Offroad e pesquisa pública governada, 26/08/2026

O pipeline real agora publica eventos seguros de início e término para cada estágio econômico. O
novo `@offroad/work-plan` transforma esses eventos em quatorze tarefas compreensíveis, agregando
todos os documentos e o case sem copiar inputs, outputs, erros privados ou identidades de fundos.
A interface de onboarding consome essa projeção: o percentual deixa de começar artificialmente em
12% e uma tarefa só é concluída depois que o trabalho correspondente foi persistido.

`@offroad/public-research` adiciona uma fronteira separada de contexto externo. Consultas aceitam
somente identidade pública, setor e geografia, bloqueiam e-mail, identificadores, valores e
métricas financeiras privadas, usam adaptadores Perplexity e OpenAI com fontes e orçamento
limitados e preservam URL, data, trecho, provedor e hash. Os achados são registrados como
`external_context`; não substituem documento, fato reconciliado, cálculo ou critério de mandato.

`@offroad/agent-contracts` define perguntas contextuais e propostas de mudança tipadas, ligadas ao
fingerprint exato do manifesto, com evidência, impacto, patches, etapas a recalcular e validade. A
migration `20260826190359_agent_workspace_foundation.sql` persiste pesquisa e propostas sob RLS
forçado. Aceitar uma proposta não aplica a alteração: cada mutação de domínio ainda dependerá de
seu comando idempotente e auditável. O ADR 0014 fixa essa arquitetura e proíbe implementar agentes
autônomos conversando entre si.

O gate local `pnpm check` passou nos 41 pacotes em 26/08/2026. Os testes dirigidos somam 4 de work
plan, 4 de pesquisa pública, 3 de contratos do agente, 6 do runner e 46 do worker. O CI obrigatório
reconstruiu todas as migrations, passou a suíte RLS, lint do schema, E2E, lint, typecheck, testes e
build. O advisor de staging encontrou cinco foreign keys novas sem índice; a migration
`20260826203000_agent_workspace_index_hardening.sql` corrigiu todas antes da promoção.

As duas migrations foram promovidas ao Supabase production como `20260826200143` e
`20260826200443`. As três tabelas têm RLS forçado, somente `SELECT` autenticado, nenhuma permissão
anônima, wrappers públicos invoker e implementações privadas definer. O Security Advisor retornou
zero findings e o Performance Advisor não aponta foreign key sem índice. Os ledgers nasceram com
zero registros. Os tipos TypeScript foram regenerados do schema de produção. O worker do commit
`bb62b99` está estável no ECS como `offroad-document-worker:105`.

A fundação está em produção. Ainda não existe chat cenográfico: a superfície conversacional só deve
ser aberta quando uma proposta aceita puder passar pelo comando idempotente real do domínio e
recalcular os estágios dependentes.

## M8, inteligência de mandato e introdução qualificada, 26/08/2026

MK-01 a MK-18 agora existem como candidates compilados da fonte canônica e alimentam um `Market
Truth Set` no Case Engine. O runtime resolve a proveniência e a validade dos critérios duros,
exclui incompatibilidades de forma binária, registra confirmações pendentes e monta uma shortlist
qualitativa sem percentual fictício. MK-19 a MK-28 permanecem `not_applicable`: NDA, diligence,
book, alocação, negociação, documentação, funding e closing estão fora da fronteira atual.

A migration `20260826040000_m8_qualified_introductions.sql` cria política versionada, plano,
destinatários nomeados e ledger append-only da introdução. Todas as tabelas de case têm RLS
forçado, leitura restrita ao tenant e nenhuma escrita direta pelo usuário. Revisão técnica e
autorização da companhia são comandos distintos. Ambas, o plano, o pacote e cada mandato precisam
apontar para os fingerprints exatos e atuais. O worker carrega esse contexto somente pela
capability curta do job.

O estado público mostra contagens agregadas e a fronteira operacional. Fundos, contatos,
observações de mandato, ordem da onda e resultados privados dos procedimentos não atravessam para
o workspace. A rota antiga de sounding redireciona ao case e seu código mutável foi removido da
aplicação ativa. A implementação permanece candidate até a migration, a suíte de não interferência,
o CI, o deploy e a verificação em produção concluírem.

## M7, materiais institucionais e sala governada, 26/08/2026

MA-01 a MA-32 agora existem como candidates compilados da fonte canônica, com método operacional e
verificação específicos para cada procedimento, e não como um checklist genérico. O Case Engine emite um
`Material Truth Set` depois da compilação de teaser, memorando de crédito, term sheet indicativo,
Q&A, modelo e sala. Cada artefato recebe fingerprint determinístico, referência exata do template,
estado do audit de conduta, cobertura de suporte, completude bilíngue, disclaimer e contrato de
seções. O runtime detecta claim material sem evidência, template vencido, seção obrigatória ausente
ou fora de ordem e divergência econômica entre artefatos que consomem a mesma base.

A liberação externa é fail-closed. Produzir um documento no workspace não autoriza sua circulação.
MA-32 só conclui quando validação cruzada, auditoria de claims, revisão técnica e autorização da
companhia apontam para o mesmo fingerprint e a autorização contém destinatários nomeados. A camada
persistente de revisão, autorização e introdução foi ligada pelo M8. Sem essas decisões exatas, o
estado correto do M7 continua `internal_only`. Esse gate confirma consistência e divulgação de uma versão; não
aprova crédito, não recomenda investimento e não compromete capital.

O estado público preserva apenas o resultado e as contagens necessárias ao workspace. Identidade
do revisor e lista de destinatários não atravessam a fronteira. Os resultados privados de cada
procedimento também são removidos. O manifesto econômico passou a incorporar o registry dos 32
procedimentos e a versão do compilador de materiais, invalidando corretamente qualquer artefato
gerado por conhecimento ou template anterior.

## M6, pricing governado e referência indicativa, 25/08/2026

PR-01 a PR-13 agora existem como candidates compilados da fonte canônica. O runtime produz uma
faixa apenas quando a amostra atinge política versionada de quantidade, fontes independentes,
qualidade, validade, comparabilidade e largura. Instrumento, rating, setor, garantia, amortização,
prazo, tíquete e regime são filtros explícitos. Fee, OID, warrant e hedge entram como componentes
da normalização e precisam fechar matematicamente. Choque de regime, observação vencida, fonte
repetida, restrição de confidencialidade ou falsa precisão produzem abstenção.

A migration `20260826013647_m6_pricing_registry.sql` cria a política e o registro proprietário de
observações. Os registros são ativos internos da Offroad, com RLS forçado e sem leitura para
`anon` ou `authenticated`. O worker carrega o contexto pela capability do job. O estado privado
preserva a linhagem; o estado público retém somente faixa, amostra agregada, recência, custos e
decisão. A interface mostra a referência suportada ou explica que ainda não há base confiável.

O gate local completo passou em Node 24.19 nos 38 pacotes e os jobs obrigatórios do PR #260,
incluindo reconstrução do banco, RLS e E2E remoto, ficaram verdes. As migrations
`20260826013647_m6_pricing_registry.sql` e
`20260826013815_m6_pricing_registry_advisor_hardening.sql` estão aplicadas em produção. O Security
Advisor não reporta findings do registro de pricing e o Performance Advisor não reporta foreign
keys sem índice nesse perímetro. Os avisos de índices ainda não utilizados são esperados enquanto
as tabelas permanecerem vazias. Nenhuma política ou observação de mercado foi inventada ou
semeada. Até a mesa aprovar política e dados atuais, o comportamento correto é abster-se.

## M2 e M3 no trilho governado, 25/08/2026

M2 e M3 agora fazem parte do `@offroad/case-engine` e do worker de produção como objetos
determinísticos do estado do case. `financialTruth` reconstrói demonstrações por período,
preserva reportado e ajustado, calcula capital de giro, CFADS, conversão de caixa, pontes,
identidades e análises de concentração, sazonalidade, moeda e aging. `debtTruth` mantém um ledger
contrato a contrato, múltiplas visões de obrigação, cronograma, serviço em 12 meses, vida média,
custo, garantias, covenants, ponte de saldo, ponte da despesa financeira, cobertura de liquidez,
cenários de taxa e propagação contratual de cross-default.

Os 18 procedimentos Q e os 31 procedimentos D existem como candidates individuais derivados do
House Playbook, com lineage, hash, schema, referências, owner, testes e runtime determinístico sem
handoff entre agentes nem chamada de modelo. Cada execução registra `completed`, `partial`,
`blocked`, `not_computable` ou `not_applicable`, além de outputs, evidências, inputs ausentes e
exceções. O registry combinado passou a compor o manifesto econômico, portanto uma alteração nesses
procedimentos invalida a linhagem downstream.

O worker persiste os dois objetos no snapshot atestado que a aplicação consome. A superfície do
case exibe o demonstrativo financeiro reconciliado, EBITDA ajustado, margem, CFADS, identidades,
visões de dívida, serviço de 12 meses, exposições fora de balanço, instrumentos, covenants e pontos
abertos. Desktop e mobile foram verificados no preview governado.

Este fechamento significa que o trilho técnico está pronto para o primeiro teste E2E do fundador.
Não significa promoção institucional em lote. Procedimentos permanecem `candidate`; referência de
mercado ausente ou expirada, documento material ausente, conflito e identidade quebrada continuam
falhando de forma localizada. Gold cases obrigatórios adicionais e revisão econômica independente
da versão exata continuam sendo o gate de promoção individual.

## M0 adaptativo, 25/08/2026

O contrato `@offroad/credit-playbook/intake-state` reconstrói o intake a partir de eventos e produz
frame da necessidade, cobertura de informação, roadmap, lote ativo e log de decisões. O lote tem
política datada, no máximo cinco itens e só pede ao cliente depois de procurar na sala classificada,
tentar derivação governada e consultar fonte pública permitida. Respostas parciais não contam como
completas; exclusão de documento e limpeza de resposta são novos eventos, não mutações retroativas.

As migrations `20260825160750_m0_intake_event_ledger.sql`,
`20260825160803_m0_intake_projection_terminal_guard.sql`,
`20260825171945_m0_capital_need_documents.sql`,
`20260825180214_m0_request_ladder_commands.sql` e
`20260825185143_m0_scope_authorization_triage.sql` introduzem o ledger append-only e comandos atômicos
para necessidade de capital, rota, respostas e recebimento, classificação e remoção de documentos.
Cada comando mantém a projeção atual e o evento na mesma transação, com lock de sequência, hash,
ator e idempotência. Tenants leem apenas o próprio histórico e não escrevem diretamente no ledger
ou nas projeções governadas. A classificação do worker segue a mesma ordem de locks da remoção.

`apps/web/src/lib/intake/replay.ts` valida a fronteira com Zod e reconstrói sessões novas com uma
política datada. Quando o stream contém a necessidade de capital, a checklist usa a rota, os
documentos classificados e a suficiência produzidos pelo replay; sessões antigas continuam
legíveis por fallback explícito, sem inventar eventos. A escada governada, o perímetro econômico,
a declaração de autorização do assessor e as triagens do dia zero já possuem eventos, projeções e
comandos transacionais. Telemetria de abandono, perímetro multi-entidade derivado dos documentos,
verificação da autorização e gold cases de M0 ainda estão pendentes. Nenhum procedimento de M0 foi
promovido para `production`.

O case de assessor agora separa a organização usuária da empresa economicamente analisada. A
declaração inicial permite apenas preparar o case; sondagem de mercado e introdução qualificada não
são inferidas e exigirão poderes próprios, evidência e gate posterior. Um case sem perímetro, sem
autorização vigente do assessor ou com rota recusada não produz lote de solicitações. Uma triagem
`review_required` permanece visível ao desk, mas não interrompe a coleta por si só.

O branch Supabase `staging` foi rebaseado sobre produção antes da validação, preservando a migration
anterior de respostas indisponíveis. Após os gates verdes, as duas migrations foram promovidas para
produção e seus timestamps registrados foram adotados como histórico canônico no repositório. O
staging vazio foi então recuado até a última migration comum e recebeu novamente o histórico
canônico, eliminando drift sem alterar produção. O schema medido mantém RLS habilitado e forçado no ledger,
somente `SELECT` para `authenticated`, nenhuma permissão para `anon` e nenhuma escrita direta nas
projeções agora governadas por comando. Os comandos têm `search_path` vazio, idempotência e escopo
de sessão validado. O Security Advisor do staging retornou zero findings. A suíte remota de não
interferência passou depois de um reset completo e cobre retry, conflito de idempotência, bloqueio
de escrita direta, isolamento entre tenants, sessão terminal, ciclo documental e cascade de
eliminação. O gate completo e a promoção para produção permanecem condicionados ao CI verde sobre
o histórico canônico.

## House Playbook M10 em shadow, 25/08/2026

As treze regras de linguagem e conduta, `LC-01` a `LC-13`, possuem agora procedimentos candidate
individuais, compilados pelo mesmo contrato governado da vertical growth-capex. Todos usam execução
determinística, zero chamadas de modelo e o controle `conduct_policy`. O motor verifica suporte de
claim, julgamento aprovado pelo fingerprint exato, qualificadores materiais, ordem dos riscos,
vocabulário, promessas de resultado, disclaimer, identidade econômica PT e EN, confidencialidade,
conflito, registro escrito, desconhecidos com data, surpresa de diligência e forma da casa.

`@offroad/case-materials` executa o controle sobre cada material compilado e anexa versão,
fingerprint e findings. A primeira medição revelou que o contrato de material não distinguia fato,
premissa e texto não material com precisão suficiente. A remediação M7 agora preserva essa taxonomia
em parágrafos, key-values e callouts; cada termo indicativo declara os inputs governados que o
produziram; perguntas de diligência em aberto não se passam por afirmações econômicas; e a fixture
growth-capex governada termina com audit `pass` em todos os seis materiais. A execução continua em
shadow. Esse `pass` mede o contrato atualmente coberto, não acredita a fonte nem encerra a cobertura
de células tabulares. Nenhuma regra LC será promovida para bloqueio de release antes de gold, adversarial, revisão
independente e, quando aplicável, revisão jurídica da versão exata.

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

Os Gates 2, 3, 4, 5 e a capacidade funcional do Gate 6 já avançaram além desta fundação: o runner único e a atestação pela identidade
do worker estão ligados, o primeiro case corporativo âncora atravessa as oito camadas e o registro
de claims governa publicação. A fábrica paramétrica agora deriva documentos, evidências, carteira,
mandatos e gabaritos de uma única verdade econômica e executa os cenários no trilho real. A vertical
de recebíveis avalia carteira, cedente, sacados, servicing e estrutura em 28 cenários e atravessa o
mesmo motor governado usado pelo worker.
Permanecem pendentes a revisão econômica independente final dos cases âncora e o gate de promoção
em staging. O retrieval governado passou pelo CI obrigatório, foi promovido ao banco de produção e
permanece condicionado ao rollout do worker a partir de `main`. Esses itens continuam explícitos
no plano de execução.

O Gate 7 adiciona `@offroad/governed-retrieval` e as migrations
`20260824232722_governed_retrieval.sql` e
`20260824232920_retrieval_foreign_key_indexes.sql`. Evidência do case, House Playbook, notas abertas de
mandatos e precedentes usam fontes e gates diferentes. Chunks do case mantêm âncora, hash, versão
do documento, organização, sessão, oportunidade e run, sem embedding. O playbook é imutável e
versionado. Notas abertas somente entram depois do filtro estruturado de mandato. Precedentes são
reavaliados contra consentimento, propósito, expiração, anonimização e governança em toda busca.

O worker indexa a camada determinística do parser e recupera o playbook antes da redação. Depois do
matching, somente fundos classificados como `fits` liberam suas notas. Conteúdo e identidades ficam
no job privado; o snapshot público recebe apenas lineage sem conteúdo. RLS forçado, capabilities e
teste de não interferência cobrem escrita, leitura e isolamento. O quality gate local passou nos 37
pacotes. O PR #240 reconstruiu as migrations do zero e aprovou banco, RLS, lint, código e E2E antes
da promoção. O projeto de produção recebeu as duas migrations; o Security Advisor permaneceu com
zero alertas e o Performance Advisor com zero chaves estrangeiras sem índice.

O Gate 8 introduz `@offroad/release-governance` e ADR 0011. A primeira leitura do worker congela o
input privado de cada case; retry, shadow e replay recebem o mesmo snapshot. A execução candidata
usa run própria e nunca substitui o case público. Comparações tipadas distinguem input divergente,
regressão de status, quebra de contrato, drift de output e aumento de custo. Rollout é um estado por
organização que o tenant pode ler e não pode escrever. `active` exige dois cohorts distintos de dez
cases reais e aprovação explícita; fixtures não contam.

O branch Supabase `staging` está saudável, com o mesmo histórico de migrations e nenhum dado de
produção. As migrations `20260824235937_controlled_production_rollout.sql`,
`20260825000110_controlled_production_foreign_key_indexes.sql`,
`20260825000811_controlled_release_commands.sql` e
`20260825001020_fix_controlled_case_input_variable.sql` e
`20260825001758_make_controlled_results_immutable.sql` foram provadas primeiro nesse ambiente. A
suíte integral de não interferência passou, o Security Advisor retornou zero findings e o
Performance Advisor, zero foreign keys sem índice. Lint, typecheck, todos os testes e o build estão
verdes nos 38 pacotes. As cinco migrations foram promovidas em ordem ao banco de produção em
25/08/2026. A verificação posterior encontrou zero alertas de segurança, zero foreign keys sem
índice e todos os ledgers do Gate 8 vazios, inclusive política de rollout e liberação externa. O
commit `ff7db5b` foi publicado na Vercel e no ECS em 25/08/2026. O worker está estável na task
definition `offroad-document-worker:83`, e os smoke tests públicos de PT, EN, login e favicon
retornaram HTTP 200. Os vinte cases reais continuam pendentes.

O Gate 6 adiciona `@offroad/receivables-analysis`. Ele separa FIDC, cessão de recebíveis e fonte de
pagamento; calcula elegibilidade título a título, concentração, aging, inadimplência, perda,
recuperação, diluição, recompra, substituição e prazo médio; concilia loan tape com contabilidade,
cobrança e caixa; e testa advance rate, sobrecolateralização, subordinação, reserva, gatilhos e
waterfall. A decisão tem três estados, mas sempre mantém `externalDirectionAllowed: false`. O
contrato estruturado entra em `@offroad/case-engine` e no worker com validação Zod. Dados livres ou
não verificados não são promovidos automaticamente para uma carteira válida. Os dois anchors
artesanais permanecem `pending` até revisão independente.

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

O Gate 5 introduz `@offroad/case-factory`. O schema declarativo descreve companhia, três ou mais
exercícios, dívida, pedido, garantias, carteira opcional, mandatos e perturbações. O gerador produz
documentos determinísticos, candidatos, loan tape, brief e gold derivados dos mesmos parâmetros.
O gold é capturado antes das perturbações, por isso uma omissão simulada mede recall em vez de apagar
a resposta certa. O matching esperado usa o mesmo contrato completo de critérios duros do motor.
Carteiras fecham exatamente em saldo total, saldo vencido e concentração do maior sacado.

Três cenários iniciais atravessam as nove etapas reais: expansão corporativa limpa, capital de giro
com sala suja e inputs hostis, e recebíveis com 250 títulos. A identidade econômica entre PT e EN é
testada. Um suporte sem âncora confirmada continua visível no case para revisão, mas o auditor agora
recusa qualquer claim material que dependa dele direta ou indiretamente. Anchors artesanais como
Rede Horizonte permanecem separados e continuam sendo a referência econômica revisada por pessoas.

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

## Constituição, procedimentos compilados e vertical capex, 25/08/2026

- O documento antes chamado House Playbook foi reclassificado como
  `OFFROAD_DCM_OPERATING_CONSTITUTION.md`: camada 0 de mandato, princípios, fronteiras, linguagem e
  gates. Ele agora proíbe expressamente sociedades de agentes autônomos e skills editadas como uma
  segunda fonte de conhecimento.
- `procedure-contract.ts` cria maturidade `draft`, `candidate` e `production`, o núcleo mínimo de
  seis componentes, o contrato ampliado para promoção e o compiler determinístico. Toda skill
  compilada carrega procedimento, versão, SHA-256 da fonte, versão do compiler, schema, templates,
  dependências, papel e etapa. Runtime só aceita pipeline determinístico, `peerHandoffs: false` e no
  máximo três chamadas estreitas de modelo.
- A primeira vertical, expansão/capex corporativo, possui 20 procedimentos `candidate` cobrindo as
  doze etapas: enquadramento, intake guiado, documentos, extração, spreading, ponte da dívida,
  lacunas, companhia/setor, desempenho, business plan/downside, capacidade, alternativas,
  estrutura, memo, teaser, term sheet, data room, matching, QC e introdução qualificada.
- Teaser, memorando, term sheet e índice da sala de dados são templates canônicos versionados. Os
  artefatos emitidos registram id, versão e hash do registry; templates permanecem `candidate` até
  aprovação de conteúdo e evals.
- O manifesto econômico passa a registrar também compiler, hash do registry de procedimentos e
  hash dos templates. Alteração de conhecimento muda a linhagem da run.
- A case factory ganhou duas variações de expansão: sala adversarial com dívida contraditória,
  garantia sem âncora e prompt injection; e negativa de elegibilidade, em que a limitada mantém a
  necessidade de expansão mas não pode seguir pela rota de debênture. Ambas atravessam o engine
  governado nos evals.
- Decisão registrada no ADR 0013. Nada desta entrega é chamado de produção institucional antes da
  promoção explícita de cada procedimento e template.

## House Playbook completo, catálogo modular e acreditação, 25/08/2026

- O v1 permanece como snapshot histórico. O `HOUSE-PLAYBOOK-COMPLETO-v2.md`, corrigido como
  v2.1 governado, é a fonte editorial canônica: 11 módulos, 270 IDs em sequência, zero
  duplicidade, zero referência interna quebrada, autoridade explícita em todas as entradas e zero
  referência legada `E##`. O SHA-256 esperado fica no código e mudança sem nova versão falha.
- As 270 entradas permanecem `readyToCompile: false`. O catálogo distingue workflow, cálculo,
  método analítico, regra de decisão, lente setorial, referência de mercado, template, mandato,
  distribuição, red flag e conduta. Um heading nunca vira chamada de modelo por conveniência.
- Os 20 procedimentos `candidate` de growth/capex agora carregam lineage explícito para as entradas
  do House Playbook, autoridades, dados versionados e necessidade de revisão jurídica.
- O compiler recusa template, dependência ou reference-data key desconhecido. O primeiro registry
  de dados sensíveis registra owner, fonte, data, validade e status. Parâmetros ainda sem fonte
  aprovada ficam `required_missing` e bloqueiam promoção em vez de receber um número inventado.
- O manifesto v4 registra hash e versão do House Playbook e do reference-data registry, além de
  compiler, procedure registry e templates.
- A carteira de acreditação explicita 14 casos entre `live`, `partial` e `planned`, inclusive sala
  suja, multi-entidade, operação economicamente não suportável, identidade PT/EN e recebíveis. O
  caso de recebíveis declara que FIDC é veículo possível, não sinônimo do ativo ou instrumento.
- O promotion gate é individual e exige versão exata, predecessors em produção, unit, integração,
  gold, adversarial, reference data vigente, QC de template, revisão jurídica quando aplicável e
  revisão independente. Nenhum novo procedimento foi promovido a `production`.
- Diagnóstico técnico, revisão do v2 e plano detalhado por módulo:
  `docs/build/HOUSE_PLAYBOOK_TECHNICAL_AUDIT_2026-08-25.md`,
  `docs/build/HOUSE_PLAYBOOK_V2_REVIEW_2026-08-25.md` e
  `docs/build/HOUSE_PLAYBOOK_MODULE_EXECUTION_PLAN_2026-08-25.md`.

## M0, contrato adaptativo do intake, 25/08/2026

- `packages/credit-playbook/src/intake-state.ts` introduz uma única projeção determinística para
  necessidade de capital, rota provisória, cobertura de informações, roadmap, lote ativo e log de
  decisões. O estado é reconstruído por replay de eventos validados e carrega fingerprint SHA-256.
- O sistema não pode emitir uma solicitação sem documentar os três primeiros degraus da escada
  IN-13: sala classificada, derivação declarada e fonte pública registrada. Evidência encontrada
  satisfaz o requisito sem se passar por resposta da companhia.
- A política do lote precisa carregar versão, fonte, vigência e limite entre um e cinco. Ausência
  declarada é preservada e retirada do lote vigente sem fechar silenciosamente a lacuna.
- Uploads e respostas recalculam cobertura e lote. O teste gold deste incremento prova que quatro
  solicitações ativas desaparecem quando o pacote correspondente é classificado.
- Autorização de assessor, perímetro multi-entidade, urgência, triagem e hipótese de liquidez
  disfarçada entram no mesmo histórico. A hipótese de liquidez exige revisão e não muda sozinha o
  arquétipo declarado.
- Persistência append-only e comandos atômicos já cobrem necessidade, rota, resposta, escada de
  busca, perímetro econômico, sugestão documental de entidade, decisão humana de escopo, ciclo de
  autorização, triagem e documentos. Sessões novas são lidas por replay na checklist; sessões
  legadas mantêm fallback explícito.
- O funil anônimo de M0 mede entrada, operação, pedido, documentos e revisão usando apenas enums e
  bandas de contagem. Autocapture, replay, page leave, persistência, perfil de pessoa e qualquer
  contexto de case permanecem desligados. Abandono é inferido por coorte entre etapas.
- Gold cases específicos de M0 cobrem sala desorganizada, empresa com um único documento, assessor
  com vários clientes isolados, hipótese de liquidez disfarçada, grupo multi-entidade e documento
  que elimina quatro solicitações futuras. A carteira de acreditação tem 18 cenários entre live,
  partial e planned.
- Escopo ainda aberto: piloto com uma empresa ou assessor real e revisão independente da versão
  exata. O módulo M0 e os procedimentos IN permanecem sem promoção institucional.

## M5, estrutura indicativa e compatibilidade, 25/08/2026

- `@offroad/financial-core` calcula cronogramas SAC, Price, bullet e balloon com carência paga ou
  capitalizada, taxa nominal ou efetiva, cobertura por período, folga de covenant e concentração
  de vencimentos usando Decimal.
- `@offroad/deal-structure` produz um `Structure Truth Set` com os 45 estados ES, envelope de
  capacidade, proposta indicativa, cronograma e cobertura, pacote e mecânica de garantias,
  covenants, cláusulas, subordinação, intercreditor, checagens do dia um, ajustes e exceções.
- O menor limite entre fluxo de caixa, garantia e mercado governa o sizing. Matching recebe esse
  montante suportado, não o pedido original quando ele excede o envelope. Fontes e usos abertos,
  downside insuficiente, maturity wall, bullet sem fonte de pagamento, garantia inadequada e
  incompatibilidade no dia um falham de forma explícita.
- ES-01 a ES-45 são candidates derivados da fonte canônica, com reference data versionada,
  execução determinística, zero peer handoff e zero chamada de modelo. Parâmetro ausente não vira
  hipótese silenciosa. O card privado exibe montante, restrição, prazo, amortização, DSCR,
  cobertura de garantias, compatibilidade e pontos abertos em PT-BR e EN-US.
- O output é de assessoria e estruturação indicativa. A Offroad não compromete capital, não emite
  aprovação de crédito e não substitui a diligência do financiador. Promoção institucional exige
  gold cases, adversariais, referências vigentes, revisão econômica independente e revisão legal
  nos procedimentos aplicáveis.

## M4, verdade operacional e fontes e usos, 25/08/2026

- `@offroad/financial-core` passou a calcular de forma determinística necessidade econômica,
  identidade de fontes e usos, posição pró-forma, capital de giro incremental por período, custo
  de excesso de funding e cobertura do cronograma de desembolso. Todas as contas usam Decimal.
- `@offroad/deal-structure` produz um `Operation Truth Set` único com pedido declarado,
  necessidade calculada, linhas por entidade, moeda, data e tranche, fontes condicionais,
  posição pró-forma, cenários, efeitos da operação, tranches, condições precedentes, ponte e
  take-out, cronograma, decisão de esperar, usos mistos e versão material confirmada.
- OP-01 a OP-14 foram compilados como candidates da fonte canônica. O runtime é pipeline
  determinístico, sem peer handoff e sem chamada de modelo. Referências de materialidade,
  buffer, custos, condições precedentes, lag de desembolso, uso geral e decisão de espera ficam
  explicitamente `required_missing` até receberem valor, fonte, data, validade e dono.
- A ontologia ganhou os campos necessários para extração operacional. O case engine inclui M4 na
  etapa de estruturação, o worker persiste os 14 estados e a interface apresenta pedido,
  necessidade, fontes, usos, diferença e dívida líquida pró-forma.
- Casos adversariais bloqueiam sources and uses desenquadrado, mês sem cobertura e ponte sem
  take-out ou plano alternativo. O módulo permanece candidate até reference data vigente,
  revisão independente e promoção do fingerprint exato.

## Agente Offroad, primeira vertical transacional, 26/08/2026

- O workspace passou a exibir uma conversa real e contextual depois da seleção do arquétipo da
  operação. Mensagens entram em fila, o estado de análise é real e a interface atualiza enquanto o
  worker processa, sem simular progresso.
- `@offroad/agent-contracts` limita a primeira vertical aos campos do brief da operação e aos
  respectivos tipos, enums e limites. O modelo pode fazer uma pergunta, responder sem alteração ou
  preparar uma proposta. Ele não grava o case.
- A fila ganhou `agent_operation_brief`. O worker carrega apenas o contexto autorizado, executa uma
  chamada estreita pelo model gateway e exige suporte numérico direto da última declaração. Uma
  declaração da empresa permanece `user_statement`, nunca evidência reconciliada.
- Conversas, mensagens e propostas são segregadas por organização, append-only para o tenant e
  escritas por comandos atômicos. A alteração só chega à projeção pelo comando canônico de M0
  depois de confirmação explícita e desde que fingerprint e `updated_at` continuem atuais.
- O teste remoto integral de RLS prova idempotência, isolamento, preview sem mutação, aplicação
  explícita e falha auxiliar sem contaminar uma sessão de documentos em processamento. O Security
  Advisor de staging permanece com zero findings.

## Navegação reversível e reinício do onboarding, 26/08/2026

- O intake guiado permite voltar de `Pedido` para `Objetivo` e de `Informações` para `Pedido` no
  topo da área de trabalho. Respostas já persistidas permanecem intactas ao navegar.
- A pessoa pode encerrar uma tentativa incompleta e voltar ao `Bem-vindo` por uma confirmação
  explícita. Conta e organização permanecem; a sessão antiga muda para `cancelled`, sem apagar
  documentos ou histórico silenciosamente.
- A função `restart_onboarding_intake` verifica autenticação, tipo e vínculo da organização,
  propriedade da sessão e estado. Sessões `confirmed` ou `processing` falham fechadas.
- O reset afeta apenas o onboarding do autor e preserva somente os dados de registro. A suíte RLS
  cobre idempotência, isolamento entre tenants e proteção de casos confirmados.
- O estado preso de `carlosevg@gmail.com` em produção foi corrigido operacionalmente da mesma
  forma: a tentativa vazia foi cancelada e o onboarding voltou ao início, sem excluir a conta ou a
  organização.

## Recebíveis, especificação canônica e gate da Fase 1, 27/08/2026

- A vertical foi congelada em 39 células sustentáveis, com oito células core e banco mínimo de
  282 casos. Os 20 casos A1 existentes são cobertura adicional.
- Datas de relatório, última originação e intervalo do histórico são conceitos distintos. O
  aging canônico possui sete faixas sem sobreposição e preserva vencimento original e vigente.
- Contratos econômicos, procedência e escopos de elegibilidade foram adicionados ao
  `financial-core`. Decisão rígida não aceita estimativa como evidência.
- `packages/receivables-analysis` foi auditado como protótipo de orquestração. Seus controles são
  aproveitáveis, mas os cálculos locais, cinco faixas de aging, policy defaults sem governança e
  ausência de procedência completa impedem promoção.
- O plano aprovado migra a matemática para `financial-core`, mantém a orquestração no pacote
  vertical e usa o caso Vertentes como gold completo. A vertical continua candidate até cumprir o
  gate documentado em `docs/knowledge/recebiveis/PHASE-1-PLAN.md`.

## Índice governado para tapes operacionais, 28/08/2026

- O quarto run controlado da Vertentes processou 16 de 17 documentos na primeira tentativa. A
  camada determinística do CSV de títulos possui 22,2 MB e aproximadamente 1,5 milhão de tokens;
  sua indexação expôs que o teste anterior com 1.200 conteúdos curtos não reproduzia o custo real
  de `tsvector`, GIN e auditoria.
- `buildCaseChunks` passa a usar o limite governado de 12.000 caracteres. O conteúdo e a âncora são
  preservados, mas tapes extensos exigem aproximadamente metade das linhas de índice.
- `case_retrieval_chunks` deixa de emitir um evento de auditoria por fragmento. Insert, update e
  delete são auditados por lote e documento, com quantidade, sessão, versão e run. A operação
  capability-bound continua atômica, valida hashes, recusa mais de 2.000 chunks e agora possui
  circuit breaker interno de 30 segundos.
- O teste de banco reproduz aproximadamente 5,7 milhões de caracteres com 520 conteúdos variados,
  verifica persistência integral, auditoria única por documento e orçamento de 25 segundos. A
  migration foi aplicada no branch `staging`; Security Advisor continua sem findings.
- O run controlado seguinte em produção é obrigatório antes de declarar a vertical pronta. A
  aprovação local de `pnpm check` e o schema de staging não substituem essa prova.

## Request Router, TaskSpec registry e Case Graph incremental, 29/08/2026

- `@offroad/agent-contracts` possui um Request Router determinístico que separa intenção, escopo
  `knowledge | case | market` e efeito `none | proposal | commit | external`. Pedidos hipotéticos
  não alteram estado; alterações viram proposta; aprovação continua exigindo comando governado;
  contato externo é recusado fora do Market Graph.
- `@offroad/work-plan` contém o registro canônico das 80 TaskSpecs da arquitetura-alvo. IDs,
  dependências, aciclicidade, classe de execução e fronteira de efeitos são validados em teste.
  Todos os nós permanecem `specified` por padrão. Presença no registry não significa executor,
  interface, E2E ou produção.
- `@offroad/case-runner` v4 deixou de ser um loop serial. Os 11 estágios atualmente consumidos em
  produção formam um DAG real, com descendentes bloqueados por dependência, ramificações
  determinísticas paralelas e no máximo uma tarefa com modelo por lote para proteger orçamento.
- Cada TaskRun registra TaskSpec, dependências e fingerprints, input, output, ferramentas
  permitidas e usadas, fontes, tentativas, término, duração, custo e cache hit. Ferramenta fora do
  contrato ou chamada de modelo numa tarefa determinística falha no schema.
- O cache incremental é isolado por caso e inclui versão da TaskSpec, case engine, pipeline,
  política de modelos e prompts. Mudança no pedido invalida somente a estrutura e seus
  descendentes no teste; extração e análise não afetadas são reutilizadas.
- O relatório anterior é carregado pelo worker somente depois do congelamento do input. A
  migration `20260829184738_task_dag_prior_report.sql` cria a leitura capability-bound do último
  run primário bem-sucedido sem expor o relatório ao navegador. Staging aceitou a migration;
  função privada, wrapper público, grants e índice foram verificados, `anon` não executa e o
  Security Advisor ficou com zero findings. A prova funcional integral ainda depende do job
  `database`; produção não foi alterada nesta mudança.
- `pnpm check` completo com Node 24.19.0 passou nos 42 pacotes. Nenhuma API paga foi chamada.

## Deal Structuring e Materials Preparation como sub-DAGs, 29/08/2026

- ADR 0016 fixa a fronteira: o DAG governa dependências, contratos, invalidação, custo e gates;
  inteligência de modelo pode existir somente dentro de tarefas estreitas. Matemática, filtros e
  consistency gates permanecem determinísticos.
- `@offroad/case-runner` v5 contém um executor de subgrafo acíclico. Ramos determinísticos prontos
  executam em paralelo e trabalho com modelo permanece serializado. Cada subtask registra versão,
  dependências e fingerprints, ferramentas, fontes, duração, custo, status e código de falha.
- O antigo monólito `structureCase` foi aberto em 11 tarefas reais: capacidade, perfil do emissor,
  cenários, screening de instrumentos, garantias, diagnóstico da operação, verdade operacional,
  termos indicativos, verdade estrutural, pricing e assemble.
- A preparação de materiais foi aberta em sete tarefas: inputs, compilação, organização da sala,
  claim registry, gate de publicação, verdade dos materiais e assemble.
- As 23 TaskSpecs alvo `S01-S12` e `A01-A11` continuam `specified`. O sub-DAG torna o trabalho
  atual auditável, mas não inventa alternativas comparáveis, modelo financeiro final, renderização
  ou inspeção visual que ainda não existem em padrão institucional.
- O refactor preserva os outputs econômicos e usa zero chamadas de modelo. `pnpm check` passou nos
  42 pacotes: lint, typecheck, todos os testes e build. `case-runner` ficou com 12 testes e
  `case-engine` com 30; nenhuma API paga foi chamada.

## Pesquisa oficial BR/US e planejamento de capital, candidate, 02/09/2026

- A pesquisa pública passou a começar por fonte primária oficial. No Brasil, o provider resolve a
  companhia na CVM e lê as últimas DFP/ITR consolidadas diretamente dos ZIPs regulatórios; nos EUA,
  resolve CIK e consulta submissions/companyfacts da SEC. Homônimo ou identidade ambígua encerra
  sem escolha silenciosa. Perplexity e OpenAI Search permanecem complementares e desativáveis.
- O cache global continua exclusivo para matéria-prima pública. Projeto privado nunca publica
  query, snippet ou resultado no cache compartilhado. Uma revisão reutiliza somente fontes e
  artefatos já governados no mesmo projeto; não repete pesquisa e reserva custo externo zero.
- `capital_planning` é o terceiro DAG público executável. O plano congelado contém 35 TaskSpecs
  `M01-S11`; 34 resultados intermediários explicitam método, evidência ou impossibilidade de
  cálculo e `S11` produz um `alternative_map` corrigível. Há uma única síntese de modelo.
- O mapa compara pelo menos duas famílias entre banco bilateral, club/sindicado, mercado de
  capitais, securitização, crédito privado, recebíveis, asset-backed, project/acquisition finance,
  comércio exterior/agro, capital flexível e situações especiais. Nenhuma família é forçada.
- Em base pública, volume, pricing, prazo, amortização, covenant, advance rate, garantia e
  capacidade permanecem ausentes por contrato. A saída contém vantagens, trade-offs,
  pré-requisitos, disconfirmers, comparação e no máximo cinco pedidos de informação com impacto.
- Chat, plano, execução, artefato e retorno ao projeto usam RPCs v2 capability-bound. A interface
  agora renderiza o mapa, fontes, progresso das 35 tarefas e decisão. Correção invalida somente
  `S11`, reaproveita `C11` e `S10` e não executa nova pesquisa.
- Testes locais do worker, contratos, gateway, pesquisa pública, lint e tipagem passaram sem API
  paga. A migration foi escrita, mas Docker não está disponível neste host; banco reconstruído,
  teste SQL integral, Security Advisor, gold case e inspeção visual ainda bloqueiam promoção.

## Advisor universal e fluxo privado, produção técnica, 02/09/2026

O estado `candidate` acima foi superado pela PR #346. A fundação universal e o fluxo privado
agora compartilham uma única memória de projeto, um runtime governado e a mesma sequência de
decisão: entendimento preliminar, confirmação, pedido de evidência, conciliação, diagnóstico,
alternativas indicativas, aprovação da estrutura, plano de produção, materiais, matching,
shortlist e autorização exata de introdução.

As seis migrations pendentes foram aplicadas no Supabase de produção depois de o CI reconstruir
todo o histórico e aprovar RLS, controles fail-closed e E2E. Vercel e o worker ECS concluíram o
rollout do commit `3725a542`. Os novos ledgers e o cache público estavam vazios após a promoção;
nenhum caso artificial nem chamada paga foi usado para fabricar evidência de prontidão.

O produto está tecnicamente disponível para teste humano controlado. Isso não equivale a padrão
institucional comprovado para cada output: qualidade financeira, editorial, matching real e custo
devem ser promovidos individualmente por gold case. Nenhuma introdução é automática e
underwriting, diligência, decisão de crédito e fechamento continuam fora da execução Offroad.

## Deal Captain limitado e remediação da auditoria, 02/09/2026

- A auditoria independente do commit `4251614` foi revalidada contra a árvore corrente e recebeu
  disposição item a item em `AUDIT_DISPOSITION_2026-09-02.md`.
- O gateway preserva `null` semântico obrigatório e remove apenas o `null` artificial de campo
  opcional exigido pelo strict schema da OpenAI. Os testes incluem abstenção e fallback.
- O roteamento privado não desliga mais o pipeline quando há documento. As seis entradas podem
  continuar para o Case Graph privado sem exigir redigitação do conteúdo anexado.
- O Deal Captain projeta o plano TaskSpec imutável para um plano de trabalho tipado com
  especialistas, dependências, orçamento, efeito, cobertura, perguntas e decisões. O banco rejeita
  tarefa inventada ou dependência fora do plano.
- O worker grava o plano com capability temporária antes dos DAGs públicos e das análises privadas
  preliminar e completa. A mesma projeção limitada do plano nasce mesmo quando a primeira resposta
  do usuário é uma pasta de documentos. As tabelas novas são tenant-scoped, RLS/FORCE e read-only
  para o browser; efeitos externos exigem aprovação.
- `Não aprovo` e `Não envie` são interceptados antes das regras de commit e ação externa.
- O CI executa todos os testes SQL automaticamente. Actions foram fixadas por SHA e um workflow de
  segurança adiciona CodeQL, dependency review, Trivy e SBOM.
- Testes locais: `@offroad/agent-contracts` 33/33; `@offroad/document-worker` 106/106. O gate
  integral forçado aprovou lint, typecheck, testes e build nos 42 pacotes com Node 24.19.0.
- Este estado intermediário foi superado em 03/09: o histórico canônico foi reconciliado, oito
  migrations foram aplicadas e testadas em produção e o ledger local passou a espelhar exatamente
  as 164 versões remotas.

## Motor de profundidade combinável, candidate, 03/09/2026

- As seis entradas foram reclassificadas como atalhos de intenção, não jornadas exaustivas. O
  runtime pode abrir jobs e branches adicionais dentro do mesmo projeto e da mesma Company Truth.
- A ontologia separa situação econômica, objetivo de capital, uso dos recursos, fonte de pagamento,
  família de capital e alocação de risco. Vencimentos, liquidez preventiva, liability management,
  alongamento, repricing, garantias, diversificação e substituição de dívida agora são estados e
  objetivos explícitos, não texto livre absorvido por um instrumento.
- Funções profissionais incluem analista de crédito, underwriting, risco, syndicate, structured e
  project finance, FP&A, controladoria, jurídico e comitê de investimento. O onboarding PT-BR/EN-US
  e a migration correspondente preservam essas funções sem reduzi-las a “analista”.
- `@offroad/agent-contracts` implementa manifestos e compilação de depth packs por núcleo, situação,
  objetivo, instrumento, setor, domínio de análise, função, jurisdição e execução. Dependência
  ausente, incompatibilidade ou definição conflitante falha fechado; sobreposição válida preserva
  linhagem e maior materialidade.
- O coverage map inicia toda dimensão esperada como `not_examined`, exige evidência para `covered`,
  preserva insuficiência, conflito, inaplicabilidade e adiamento, e bloqueia readiness quando uma
  dimensão bloqueadora permanece aberta.
- Promoção de pack exige gold cases, caso adversarial, benchmark contra o melhor modelo generalista
  e revisão especialista. O teste de sobrevivência também exige impacto decisório sustentado; texto
  bem escrito ou outcome estimado não bastam.
- Contratos e testes unitários passaram. O CI obrigatório do PR #378 reconstruiu o banco do zero,
  aplicou todas as migrations, executou a suíte de RLS, lint do schema e E2E sem falhas. A migration
  canônica `20260903182045_expand_professional_functions.sql` foi promovida ao único Supabase de
  produção após esses gates.
- Os advisors posteriores à promoção não atribuíram alerta novo à migration. Permanecem dois avisos
  informativos já conhecidos para tabelas estritamente `private`, sem políticas de acesso cliente,
  além de índices recentes ainda classificados como não utilizados. Nenhum deles justifica remover
  isolamento ou índices de integridade antes de haver janela representativa de uso.
- Os packs econômicos ainda não estão acreditados. A infraestrutura impede que esse estado seja
  chamado de profundidade de produção; implementação, benchmark e revisão dos packs Pareto seguem
  obrigatórios antes da promoção de cada escopo.

## Packs econômicos Pareto integrados ao Deal Captain, implemented, 03/09/2026

- O playbook contém 17 packs combináveis: núcleo; quatro objetivos econômicos; collateral,
  covenants e downside; Brasil e Estados Unidos; três famílias instrumentais Brasil e quatro
  famílias instrumentais Estados Unidos.
- Cada pack declara coverage esperado, evidência aceitável, materialidade, impacto decisório,
  procedimentos, cálculos determinísticos, termos, critérios de mercado, disconfirmers e gates.
- Um catálogo separado reconhece 33 necessidades econômicas. Situação sem pack retorna como gap
  conhecido, nunca como falsa completude.
- `financial-core` expõe 38 IDs estáveis de cálculo e o registry institucional expõe os IDs de
  procedimento da casa. O auditor de packs falha se qualquer referência ou dependência não existir.
- `@offroad/dcm-specialization` compõe os manifestos sem criar uma solução por combinação. Um case
  como refinance + Brasil + debênture + covenant + downside preserva linhagem de cada pack.
- O Deal Captain infere somente sinais explícitos em PT-BR/EN-US, incorpora o perfil compilado no
  snapshot imutável do plano e distribui requirements pelos TaskSpecs analíticos existentes. O
  snapshot e a coverage já usam a persistência capability-bound do projeto.
- O gate de promoção por pack exige testes unitários e de integração, dois gold cases, um caso
  adversarial, identidade econômica bilíngue, ganho material sobre generalista e revisão
  independente; packs jurídicos ainda exigem revisão legal. Todos permanecem `implemented` e não
  podem ser anunciados como expertise de produção.

## Motor financeiro institucional, implemented, 03/09/2026

- O novo engine integra DRE, balanço, fluxo de caixa, capital de giro, PP&E, imposto, dívida,
  liquidez, covenants e patrimônio período a período; balanço de abertura, ledger de dívida e cada
  período projetado precisam fechar.
- Receita aceita composição por segmento, volume, preço, mix, câmbio e efeito inorgânico. Custos,
  capital de giro, capex de manutenção e crescimento, depreciação por safra e imposto caixa usam
  drivers governados, não defaults escondidos.
- O livro de premissas registra fonte, data-base, localização, racional, metodologia, confiança,
  limites, editabilidade e impacto. Toda alteração cria um novo cenário imutável.
- Curvas de IPCA, CDI, prefixado, Selic, SOFR, Treasury e câmbio têm fonte, data-base, nós,
  interpolação, extrapolação, lag, piso e teto explícitos.
- Dívida IPCA+ separa correção paga em caixa de correção capitalizada no principal. Cupom pago e
  PIK também são independentes. Serviço da dívida, despesa financeira e saldo devedor não são
  inferidos de uma taxa agregada.
- O reviewer independente bloqueia falta de conciliação, premissa sem suporte, cenário misturado,
  indexação ambígua e dívida negativa; expõe caixa insuficiente, covenant breach e coverage gaps.
- O pack setorial inicial de alimentos e consumo essencial está `implemented`, não homologado. O
  engine não se autopromove a expert e ainda precisa passar por gold cases, adversarial cases,
  benchmark e revisão humana nominal.

## Entrada conversacional simplificada, candidate, 04/09/2026

- A entrada autenticada passou a priorizar uma única ação: descrever o trabalho ou anexar os
  documentos disponíveis. Os atalhos de intenção foram movidos para baixo do composer e continuam
  sendo sugestões opcionais, nunca etapas obrigatórias.
- A saudação usa somente o primeiro nome salvo no perfil do próprio usuário. Na ausência desse
  dado, a interface usa uma saudação neutra e não infere identidade.
- O farol da marca substitui o rótulo interno `OFFROAD ADVISOR`; título e hierarquia visual foram
  reduzidos para aproximar a entrada do workspace conversacional já definido na Constituição.
- Exemplos PT-BR/EN-US alternam no campo apenas enquanto ele está vazio, não há um atalho escolhido
  e o usuário não solicitou redução de movimento. Criação, upload, confidencialidade e vínculo ao
  projeto permanecem inalterados.

## Criação de conta sem lado de mercado, candidate, 04/09/2026

- A criação de conta deixou de perguntar de que lado do mercado a pessoa está. A separação entre
  "empresas e assessores" e "provedores de capital" pertencia a um produto anterior e não descreve
  como a plataforma é usada: quem analisa uma companhia, quem estrutura uma operação e quem avalia
  uma alternativa de crédito fazem o mesmo trabalho analítico. Todo workspace novo nasce do lado
  que pode começar a trabalhar; o workspace de provedor de capital continua acessível apenas para
  organizações que já o possuem.
- O campo de cargo saiu do formulário. Cargo isolado não influenciava nenhuma decisão do produto e
  competia com o contexto profissional, que é onde a função, a atuação e o objetivo são perguntados
  com consequência.
- A tela de verificação passou a nomear o endereço para onde o código foi enviado, lido de um
  cookie de sessão de cadastro. Não anuncia mais o formato do código no título, porque o próprio
  campo já o mostra.
- A declaração de que o usuário está autorizado a representar a organização indicada saiu do
  rodapé do cadastro. Representação é um gate próprio, verificado no momento da introdução, e
  afirmá-la na criação da conta dava a ela um peso que ela não tem.

## Onboarding profissional multivalorado, candidate, 04/09/2026

- O contexto profissional deixou de aceitar uma função e um vínculo. Uma pessoa pode ser banker
  e assessor, cobrir DCM e corporate banking, e usar a plataforma dentro de uma instituição e por
  conta própria ao mesmo tempo. O schema passou a guardar `use_forms`, `professional_roles` e
  `practice_areas` como arrays, e o vocabulário de objetivos foi de oito para treze opções.
- As colunas de capacidade saíram do perfil pessoal. O que uma pessoa diz sobre o próprio trabalho
  custa nada aceitar; o que uma instituição consegue fazer tem consequência em matching e no que o
  produto pode afirmar. Capacidade vive em `institution_capability_profiles`, que já carrega
  origem, responsável e data de confirmação, e o formulário de onboarding não pode escrevê-la.
- O nome da organização só é gravado para quem disse que trabalha em uma. A RPC anula o campo em
  qualquer outro caso, e o teste de regressão prova isso.
- A tela virou quatro perguntas numeradas com opções multisseleção, e a pergunta sobre onde a
  pessoa trabalha aparece como desdobramento da primeira, apenas quando faz sentido. Nada chega
  pré-marcado: a jornada de empresa não presume mais que a pessoa levanta capital.
- O contrato de consumo está escrito em `docs/product/PROFESSIONAL_CONTEXT_CONSUMPTION.md`. Ele
  define quem lê cada campo, o que pode influenciar e o que nunca pode. O consumo estruturado
  descrito ali ainda **não** está implementado: hoje o perfil chega aos modelos como bloco de
  contexto, e os testes por função que provariam mesma verdade com abordagem diferente são o
  próximo passo, não o estado atual.

## Atlas canônico intent-driven, specified, 04/09/2026

- O contrato funcional deixou de tratar persona ou uma das seis entradas como rota universal. O
  Atlas define 20 famílias combináveis de intenção, 18 objetos de trabalho e um `Intent Envelope`
  que inclui responsabilidade atual, sponsor, audiência, estágio, evidência, autoridade e output.
- A matriz de 14 funções profissionais serve para descobrir cobertura e padrões de revisão; não
  altera fatos nem limita o usuário ao trabalho típico de seu cargo.
- A rota company-led continua válida quando ativada. Trabalhos sobre contrato, modelo, waterfall,
  instrumento, mercado, mandato ou material podem existir sem companhia quando ela não é material.
- Vinte casos Pareto definem a próxima cobertura de homologação. O Atlas especifica schema de caso,
  coverage, gates, outputs, teste de sobrevivência e implicações para router, compiler e evals.
- Estado é `specified`: nenhum novo runtime, migration ou pack foi promovido por esta documentação.

## Fase 0, frente de especificação: cinco casos gold congelados, 04/09/2026

- `docs/product/gold-cases/` traz o contrato de congelamento (README) e os cinco casos com
  compromisso de implementação: analista de IB com instrução vaga do VP (Camil, público), CFO da
  Camil preparando o conselho (público mais gerencial autorizado), assessor com operação de
  recebíveis (Aurora, privado), analista de investimentos da Prisma avaliando operação recebida
  contra mandato (lado provedor), banker pensando na expansão da Camil com produção de material e
  mudança de premissa (três turnos).
- Cada caso congela inputs com hash, cobertura com materialidade, cálculos determinísticos,
  achados com âncora, outputs por turno, árvore conversacional com os ramos exercitados e os
  `deferred`, adversariais, protocolo de baseline, painel e rubrica. Maturidade: `specified`.
- Fixtures que ainda não existem e que os casos declaram como ramo `deferred` até serem criadas:
  dados gerenciais da Camil (orçamento, capex, caixa mínimo, cronograma contratual), tape e aging
  de recebíveis da Aurora, mandato sintético da Prisma no formato `Mandate`.
- Os casos 01, 02 e 05 usam a mesma base pública da Camil por desenho: a prova de identidade
  econômica é que os mesmos fatos saem com os mesmos valores, âncoras e traces nos três.

## Fase 0, frente de staging: causa raiz e recriação, 04/09/2026

- A branch `staging` nunca ficou utilizável porque a linha de `20260831092552
  project_scoped_company_profile` em `supabase_migrations.schema_migrations` de produção guardava,
  em vez do SQL, o texto "Canonical migration applied from repository commit f48f928". Toda
  criação ou reset de branch replica o histórico de produção e executava essa prosa como SQL
  (`syntax error at or near "Canonical"`), parando em 128 de 190 migrações. Era a única linha
  assim no histórico.
- A linha foi corrigida com o conteúdo verbatim do arquivo (9.215 bytes). Nenhuma DDL mudou; só o
  registro do que já tinha sido aplicado.
- A branch antiga (`lxmpsxwlpmfisbauakaz`, histórico divergente com série `_validation`) e a
  intermediária (`ylyldbudqrrzuhgjulmi`, criada antes da correção) foram apagadas. A branch
  vigente é `gjkkjtbfnssdsbmlhmwk`, criada às 20:29 UTC a partir do histórico corrigido, ao custo
  horário de US$ 0,01344. Paridade verificada às 20:31 UTC: 184 migrações aplicadas nos dois lados, última
  `20260904201650`, 114 tabelas e 7 views em `private` na branch e em produção.

## Fase 0, frente de confiabilidade: falha com causa, candidate, 04/09/2026

- Todo executor do worker passa a gravar, na linha do job, a causa da falha e não só a categoria:
  `last_error.cause` com classe (orçamento, modelo esgotado, saída inválida, política, gate de
  qualidade, input inválido, schema, constraint, timeout de banco, autorização, transitório, erro
  do worker), nome do erro e mensagem limitada e sem conteúdo (números com quatro ou mais dígitos,
  e-mails e valores monetários são substituídos antes de gravar).
- `private.job_failure_class` e `private.job_failure_has_cause` classificam também as linhas
  antigas pelo que elas carregam. Views operacionais em `private`, sem exposição ao Data API:
  `job_failure_causes`, `failures_without_cause`, `run_metrics_by_pipeline`, `run_metrics_by_day`,
  `run_metrics_by_cohort`, `project_time_to_value`.
- Linha de base medida ao aplicar: 36 jobs falhos, 12 sem causa (6 `agent_processing_failed`,
  os demais códigos de análise de caso e gate M07), todos anteriores à mudança. O gate da fase é
  `failures_without_cause` vazio para tudo criado a partir de 05/09/2026; as 12 linhas antigas
  ficam visíveis como dívida, não são maquiadas.
- A tela do projeto passa a listar o que ainda falta com o motivo e a materialidade de cada
  requisito, em vez de mostrar só a contagem.
- Correção da revisão de arquitetura: os 36 jobs falhos sempre tiveram `last_error`; o que faltava
  era a causa por trás da categoria, e a revisão dizia "sem motivo" por ter lido a coluna errada.
- Staging: a branch antiga (`lxmpsxwlpmfisbauakaz`) tinha histórico de migrações divergente do de
  produção (nomes e versões diferentes, série `_validation` inexistente em produção) e não era
  ressincronizável por rebase. Foi apagada e recriada a partir de produção em 04/09 às 20:09 UTC
  (`ylyldbudqrrzuhgjulmi`), ao mesmo custo horário da anterior (US$ 0,01344/h).

## Metodologia institucional como objeto, candidate, 04/09/2026

- `organization_methodologies`: uma versão ativa por organização, todas as anteriores preservadas
  como `superseded`; gravada só por quem administra a organização, através de
  `save_organization_methodology_v1`; o Data API não insere nem atualiza diretamente; membros
  leem; outro tenant não vê nada. `source_kind` distingue default da casa, autodeclarada e
  revisada, e a revisada registra quem confirmou.
- `packages/credit-playbook/src/methodology.ts`: schema do objeto (definições adotadas por id da
  ontologia com parâmetros, nunca fórmula nova; ajustes de EBITDA permitidos com teto e exigência
  de evidência; thresholds por escopo; elegibilidade; referências a mandato; padrão de
  apresentação; sequência de revisão; cenários mínimos; métricas obrigatórias; decisões e
  correções anteriores), defaults da casa que não impõem threshold de crédito, resolução do
  perfil da organização sobre a casa, e a derivação dos checks que um verificador roda.
- Capacidades continuam fora: o objeto só aponta para `institution_capability_profiles`, e a RPC
  recusa conteúdo que tente carregá-las.
- Os dois carregadores de contexto do agente entregam o bloco `organization_methodology` ao lado
  do perfil profissional e das capacidades; os executores o repassam ao modelo. O consumo
  estruturado (critérios, checks e apresentação modificados pela metodologia) é a fase 3.

## Contratos das três camadas do moat, candidate, 04/09/2026

- ADR 0022 registra a decisão: leitura comprovadamente completa, metodologia institucional e
  proatividade governada entram primeiro como contrato e só depois como comportamento. Nada em
  produção muda com este slice.
- Toda `TaskSpec` declara `readingStrategies` (`packages/work-plan`), com padrão por classe de
  execução e sobrescritas para extração, conciliação, garantias, covenants, comparáveis e
  monitoramento; 80 de 80 declaram, e o teste impede uma tarefa sem estratégia.
- `packages/agent-contracts` ganha o Intent Envelope v1 em duas camadas (núcleo de roteamento e
  contexto governado, com campos do sistema que o modelo nunca escreve e as vinte composições do
  Atlas derivadas dos nove trabalhos), o manifesto de leitura, a escada de autonomia de sete
  degraus, o ledger de achados com origem solicitada ou descoberta, a explicação de mudança
  entre execuções e o scorecard de benchmark com omissões materiais e falsos alertas.
- O Atlas recebe a §17.10 com as sete exigências de 4 de setembro e a escada de autonomia.

## Roteador por intenção em sombra, candidate, 04/09/2026

- Toda mensagem do advisor passa também por um classificador barato (`route_intent`, Sonnet 5
  em esforço baixo, sombra no GPT-5.6 Terra) que escreve um Intent Envelope v1 completo: núcleo de
  roteamento e campos inferíveis vindos do modelo; regime de evidência, autoridade, organização,
  projeto e documentos carimbados pelo sistema depois da resposta. O envelope vai para
  `intent_envelopes`, gravado só pelo worker via `worker_record_intent_envelope`, que recusa
  envelope cujos campos de sistema não estejam marcados como `system`.
- Nada lê essa tabela para decidir. O roteador de produção continua o mesmo; uma falha do
  classificador é registrada e o turno segue como antes. Os testes determinísticos do brief rodam
  com `shadowRouting: false` para continuar provando zero chamadas de modelo no caminho da resposta.
- `packages/evals/src/intent-gold.ts`: dezesseis turnos gold dos cinco casos, cobrindo os nove
  trabalhos primários, cinco responsabilidades, profundidade pontual, atualização, intenção
  composta, mudança de objetivo e abstenção. É o conjunto contra o qual o envelope será medido
  antes de rotear qualquer coisa.
- `docs/product/gold-cases/gc01-gabarito-rascunho.md`: primeira versão do gabarito econômico do
  caso 01, extraída por leitura direta do ITR de 31/05/2026 com âncora por página e nota, marcada
  como rascunho até a revisão do fundador. Inclui o achado de maior materialidade: alavancagem
  pro forma de 4,72x contra covenant de 4,0x, com medição anual em fevereiro de 2027.

## Source pack e pesquisa congelada, candidate, 04/09/2026

- `packages/public-research/src/source-pack.ts`: manifesto de fontes públicas de um caso (id,
  tópico, URL, data de aquisição, data-base, versão, SHA-256, tamanho, tipo, licença, caminho dos
  bytes). Entradas cuja licença não permite retenção entram como referência sem bytes, e a regra
  é verificada no schema. Um provedor de busca responde só do pack e um adquirente serve só os
  bytes do pack, recusando URL fora dele e detectando arquivo que divergiu do manifesto.
- Worker: `PUBLIC_RESEARCH_MODE=frozen` com `SOURCE_PACK_PATH` troca descoberta, fontes oficiais
  e aquisição de conteúdo pelo pack; nada chega à rede. Em modo `live` nada muda.
- `pnpm --filter @offroad/evals source-pack:build <manifesto> <pasta>` adquire cada item uma vez,
  grava hash e data, e escreve `source-pack.json`; itens `pending` são pulados com aviso até o
  link ser confirmado.
- Manifesto do caso 01 em `packages/testing-fixtures/assets/camil/source-pack.manifest.json`:
  cadastro, ITR e IPE da CVM (dados abertos, retidos), ANBIMA Data como referência manual, e três
  itens pendentes de confirmação de link ou de registro de fonte (release e apresentação 1T26 no
  RI, curvas de referência). O pack ainda não foi construído: essa é a próxima ação.

## Source pack público do Caso 01 fechado, candidate, 04/09/2026

- `packages/testing-fixtures/assets/camil/source-pack/`: vinte itens congelados com URL, data de
  aquisição, SHA-256, versão, data-base e licença (29 MB). Tudo veio de fontes públicas achadas pelo
  próprio agente: o índice IPE 2026 da CVM traz o link direto de cada documento no sistema ENET, e
  por ele foram congelados release e apresentação 1T26, DFP 2025, o pacote ENET do ITR (PDF e XML),
  os relatórios anuais do agente fiduciário das 11ª, 13ª, 14ª e 15ª emissões e da debênture verde,
  as atas do conselho de 27/05 e 14/07/2026 e o calendário de eventos. Curva ANBIMA de 04/09/2026 e
  séries CDI e Selic do Banco Central completam o mercado. ANBIMA Data continua manual, sem bytes.
- O adquirente público reconhece PDF, ZIP e JSON pela assinatura dos bytes quando o servidor os
  declara como html (o ENET da CVM e o SGS do Banco Central fazem isso); a lineage guarda o tipo
  real. O builder do pack espera até 180 s por item, aceita 30 MB e tenta quatro vezes: o servidor da
  CVM derruba conexões sob carga e um documento público não pode ficar fora do pack por isso.
- Gabarito do Caso 01 em v0.2: a seção 11 registra o que o pack acrescenta ao ITR. O achado que
  muda a leitura: a 13ª e a 14ª emissões (lastro de CRA) limitam dívida líquida sobre EBITDA a 3,5x,
  mais apertado que os 4,0x do ITR e da 11ª; com pro forma de 4,72x, são dois limites a tratar. As
  atas de maio nomeiam R$ 251 milhões em notas comerciais (Bank of China, 4 anos) e até R$ 535
  milhões em CPR (3 anos) dentro da captação de 2,05 bilhões do trimestre. Continua rascunho até a
  revisão linha a linha do fundador.

## Pesquisa congelada por projeto no worker de produção, candidate, 04/09/2026

- `private.gold_case_bindings` (migração `20260904231340`): um projeto pode ser vinculado a um source
  pack pelo operador (nunca pelo tenant; a tabela fica fora da Data API). `worker_claim_job` passa
  a devolver `source_pack_id` quando a sessão do job pertence a um projeto vinculado.
- Worker: `research-routing.ts` decide por job. Job vinculado lê o pack e nada mais (provedor,
  aquisição e fontes oficiais vêm do pack); job sem vínculo segue com a pesquisa viva. Pack ausente
  ou diretório não configurado falha o job com causa `source_pack_unavailable`, nunca cai para a
  internet. O mesmo worker de produção serve os dois modos, sem segundo serviço.
- Imagem: o pack do Caso 01 viaja em `/app/source-packs/gc01-analista-ib-camil`;
  `SOURCE_PACKS_DIR` na task definition; o deploy passa a observar
  `packages/testing-fixtures/assets/**`.
- Isso é o que faltava para o passo 5 do Caso 01: o fundador cria o projeto no produto, o operador
  vincula o projeto ao pack, e cada turno roda no produto real contra as fontes congeladas.

## Baseline justo dos casos gold, candidate, 04/09/2026

- `packages/evals/src/gold-baseline.ts` e `scripts/run-gold-baseline.ts`: montam a base de
  informação de um caso (turnos do gold, documentos da fixture, conteúdo do source pack, data-base,
  perfil profissional), renderizam de forma determinística com hash de cada entrada e enviam ao
  generalista mais forte (`baseline_generalist` no gateway: Opus 5, fallback GPT-5.6, 32 mil tokens
  de saída) turno a turno, com a resposta anterior no histórico. O sistema de instruções é o que um
  VP diria a qualquer analista e não menciona a rubrica; o teste garante isso.
- Os PDFs entram como o texto e as tabelas que o parser do produto produz. No ensaio, a primeira
  renderização só trazia os blocos de prosa e perdia todos os números das notas (dívida bruta,
  cronograma, contingências); as tabelas estavam na camada, em `page.tables`, e passaram a ser
  renderizadas. A base do Caso 01 mede 1,05 milhão de caracteres, cerca de 330 mil tokens.
- Workflow manual `Gold case baseline`: lê as chaves por OIDC (`offroadGitHubEvalsRole`, as
  mesmas duas secrets da medição de extração), roda o comando e publica a run como artefato.
  Nenhuma chave de modelo existe no laptop nem na Vercel, e isso é deliberado.

## Primeira execução do baseline do Caso 01, candidate, 04/09/2026

- Run 33928973469 do workflow `Gold case baseline`, na main, com as chaves lidas por OIDC. Opus 5
  em esforço alto recebeu a base congelada (1,05 milhão de caracteres; 509 mil e 515 mil tokens
  de entrada nos dois turnos, sem cache) e escreveu 10,5 mil e 14,6 mil tokens. Custo total
  US$ 5,75; 155 s e 198 s de latência. Saídas e `run.json` em
  `docs/product/gold-cases/runs/gc01/baseline/2026-09-04-23-18-46/`.
- Leitura rápida contra o gabarito v0.2, sem valer como revisão: o generalista acertou o núcleo
  (4,72x contra 4,0x com medição anual em fevereiro de 2027, definição contratual da dívida
  líquida, degrau de 2028/29, lastro em CRA, notas comerciais e CPR com a ressalva certa de que as
  atas não provam desembolso, valor justo abaixo do contábil, dividendos comprometidos) e deixou
  de fora três achados que o gabarito considera materiais: o limite de 3,5x da 13ª e da 14ª
  emissões, as contingências possíveis sem provisão e o lucro do trimestre sustentado por crédito
  fiscal. Também recusou projetar EBITDA sem guidance, o que é a postura esperada.
- O painel de revisão mede as duas execuções pela mesma rubrica; nada aqui substitui isso.

## Biblioteca de métodos em Markdown e gate de promoção, candidate, 05/09/2026

- `packages/credit-playbook/knowledge/procedures/`: um arquivo por método, frontmatter estruturado
  e seções fixas, compilado por `procedure-markdown.ts` para o contrato canônico. Três métodos do
  Caso 01 como `candidate`: construir o ledger de dívida (C05), diagnosticar a parede de
  vencimentos (C05, C08) e reconciliar as definições de covenant com as escrituras (C05, S08). O
  teste prova que cada referência a TaskSpec, procedimento da casa, chave de parâmetro e
  dependência existe, e que uma task não roda sobre método `candidate`.
- `packages/work-plan`: a TaskSpec aceita `procedure` (id e versão) e `assertTaskPromotable`
  recusa produção sem método em produção com evidência de implementação. Nenhuma task está
  vinculada ainda; o registro continua todo `specified`, e o teste diz isso em voz alta.
- `docs/build/WORKFLOW_SYSTEM_PLAN.md`: os nove passos do fundador com o inventário medido no
  código (224 procedimentos candidate, 80 TaskSpecs specified, 17 packs sem revisão, 71 parâmetros
  ausentes), os gates do teste real e a próxima onda.

## Escada de maturidade e revisão independente por IA, candidate, 05/09/2026

- Decisão do fundador: nesta fase o revisor independente é um modelo, não uma pessoa. A escada
  passa a ser `candidate → implemented → ai_reviewed → tested → ready_for_founder → production`,
  e cada degrau exige a sua evidência: implementação executável; revisão independente registrada
  que passou ou passou com condições; runs gold, adversariais e de consistência registradas;
  exemplos bons e ruins; aprovação do fundador só no último degrau. Métodos em `tested` ou acima
  podem rodar em staging.
- `review-record.ts`: contrato `ai-independent-review.v1` com revisor (provedor, modelo, esforço,
  ferramenta), sujeito (tipo, id, versão, fingerprint dos bytes revisados), run (id, datas, commit,
  custo), checagens (fontes revisitadas, números recalculados, definições, exceções, adversariais,
  consistência, vantagem sobre o baseline), evidências item a item, resultado, condições e
  `humanApproval: false` fixo no esquema. Um registro que não voltou às fontes ou não recalculou não
  conta para promoção.
- O compilador de métodos lê `review_ids` e ids de runs do frontmatter, exige o registro em
  `knowledge/reviews/<id>.json` e confere que ele é sobre aquele método. A TaskSpec nunca sobe
  acima do método vinculado, e nada sobe sem evidência de implementação.

## Métodos restantes do Caso 01 na biblioteca, candidate, 05/09/2026

- Seis métodos novos em `packages/credit-playbook/knowledge/procedures/`: conciliar demonstrações
  (D06, C03), cronograma de juros e IPCA capitalizado versus pago (C05, C07), cenários declarados
  (C07, C08), custo de saída por série (S07, S10), antes e depois de refinanciamento (S05, S10,
  S11) e plano de devolutiva e material (M05, M07). Com os três anteriores, nove métodos cobrem o
  Caso 01. Todos `candidate`, com exemplos bons e ruins vindos da auditoria e das escrituras.

## Executores determinísticos dos métodos do Caso 01, candidate, 05/09/2026

- `packages/credit-playbook/src/executors/`: quatro executores puros, um por método, com Decimal,
  âncora por componente e fingerprint de entrada e saída: ledger de dívida (v2, depois da revisão
  independente), reconciliação de covenant (degrau só resolvido com quitação provada; nunca escreve
  "rompido"), parede de vencimentos (cobertura com a definição de caixa declarada; aprovações de
  conselho não viram fonte) e custo de saída por série (janela, mecanismo, prêmio pro rata;
  make-whole sem cotação fica `insufficient_evidence`). Os testes reproduzem os números do gabarito
  do Caso 01, aplicam as mutações adversariais e provam consistência sob vinte permutações.
- O compilador de métodos lê a evidência de implementação do frontmatter (módulo, export,
  contrato de resultado, estados, persistência, ids de avaliação); `build-debt-ledger`,
  `reconcile-covenant-definitions`, `diagnose-maturity-wall` e `estimate-exit-cost-by-series`
  sobem a `implemented`.
- Revisões independentes por IA dos métodos ficam em `packages/credit-playbook/knowledge/reviews/`
  (registro completo em `runs/`), com o runner `review:codex --subject method --method <id>`. A
  primeira revisão do ledger deu `fail` com 17 correções, todas incorporadas na v2 do executor e
  no texto do método; a revisão é refeita antes de `ai_reviewed`.
- Gabarito 01 em v0.7: a segunda revisão independente por IA (`fail`, seis correções) foi
  incorporada; a revisão do método de covenant também deu `fail` com 17 correções, todas
  incorporadas na v2 do executor (comparabilidade por componentes, headroom só quando plena,
  liquidação antecipada ordinária ativa o degrau, vencimento antecipado mantém o degrau inferior,
  base vazia bloqueia com motivo, fatos duplicados recusados, trace com fórmula e operandos).

## Oito métodos do Caso 01 com executor, candidate, 05/09/2026

- Quatro executores novos sobre o `financial-core`: conciliação de demonstrações (`checkIdentity`
  e `buildDebtBalanceBridge`, com o mapeamento das linhas da nota às categorias do bridge gravado
  na saída; dividendos ficam divergência aberta em quatro valores; estoques explicados pelos
  adiantamentos com resíduo de 37), cronograma de juros e IPCA (`buildIndexedDebtSchedule`; seis
  séries IPCA abrem em 743.955; curva sem fonte não entra; tratamento desconhecido projeta as duas
  variantes), cenários declarados (`applyRateShock`, `calculateLiquidityCoverage`,
  `calculateProFormaPosition`; parâmetro sem origem não existe; conjunto mínimo base, adverso e sem
  rolagem; a frase de ressalva acompanha cada cenário) e antes e depois de refinanciamento
  (`calculateProFormaPosition`, `maturityConcentration`, `calculateCovenantHeadroom`,
  `buildDebtServiceSchedule`, `calculateAllInCost`; alternativa que retira série sem custo de saída
  é bloqueada; sem discriminador não há ranking; headroom só com covenant resolvido e comparável).
- Ledger de dívida em v3 depois da segunda revisão independente (`fail`, 21 correções):
  remuneração tipada, uma âncora por termo, definições calculadas só com fonte, saldos da data
  anterior, titular formal e credores econômicos distintos, silêncio bloqueia, `complete` só com
  todas as saídas, ids duplicados recusados. Oito dos nove métodos do Caso 01 em `implemented`;
  45 testes de executores.

## Seleção econômica governa a ativação do preview, candidate, 07/09/2026

- O turno em `integration_preview` persiste a receita e o outcome antes de gravar a resposta que
  ativa execução. O outcome é o produto de trabalho efetivo daquele turno: um pedido que menciona
  material, mas ainda está alinhando a reunião, seleciona `meeting_plan`; a preparação explícita do
  arquivo ou decisão de conselho seleciona `material`.
- `worker_record_agent_response_and_activate_v5` valida, dentro da mesma transação, organização,
  projeto, job, recipe id/version, slice fingerprint, outcome, conjunto exato de TaskSpecs e lotes.
  Ausência, ambiguidade ou divergência interrompem a ativação antes de enfileirar o executor.
- Continuidade deixou de depender das últimas mensagens visíveis. Quando um turno genuinamente
  subsequente não nomeia uma nova situação econômica, o worker pode carregar somente a seleção
  imutável mais recente do mesmo projeto, autorizada pelo capability do job atual, e recompila um
  novo slice. Uma situação econômica explicitamente declarada no turno sempre prevalece; a âncora
  não copia ativação anterior nem contorna a comparação exata da RPC v5.
- A mudança está em `candidate/internal`: staging e contratos SQL passaram; E2E e deploy de produção
  continuam gates obrigatórios antes de qualquer promoção de exposição ou maturidade.

### Reconciliação do rollout, 07/09/2026

- O merge da branch de staging respondeu sucesso sem aplicar sua fila de migrations na produção.
  A checagem explícita do catálogo e das RPCs detectou a divergência antes do rollout do worker, e
  o deploy automático foi cancelado.
- As 15 migrations já mescladas e homologadas foram aplicadas manualmente em ordem de dependência.
  Seus nomes no repositório agora usam os carimbos efetivos de produção `20260907044208` a
  `20260907044325`; o conteúdo SQL não mudou.
- O próximo deploy só pode prosseguir depois de catálogo remoto, grants, advisors e smoke de RPC
  confirmarem paridade. Sucesso do comando de merge, isoladamente, não é evidência de promoção.

## Resposta governada alimenta o método R01, candidate, 07/09/2026

- Cada pergunta material de recebíveis pode carregar um binding tipado para um campo do método
  R01, incluindo dataset de origem, tipo, unidade, faixa e opções permitidas. Texto livre sem esse
  binding continua sendo conversa e não altera input financeiro.
- Quando o usuário responde pelo controle governado, o worker interpreta e valida o valor sem
  chamada de modelo, grava um patch imutável e uma nova revisão do draft, e mantém a linhagem até
  pergunta, resposta, usuário e hash do dataset. Percentuais são normalizados para a escala interna.
- O próximo executor recebe a revisão acumulada em vez de reconstruir respostas da janela do chat.
  Resposta inválida, fora da faixa, ligada a outro projeto ou a outro dataset falha fechada.
- A capacidade permanece `candidate/internal`: testes unitários e staging cobrem o bridge; banco,
  CI integral, E2E e promoção ainda são gates obrigatórios.

## Contrato de schema no boot do worker, tested, 07/09/2026

- O deploy do worker deixa de pressupor que um merge nominal da branch promoveu o banco. Depois de
  autenticar, mas antes de construir a fila ou buscar qualquer job, cada nova task consulta
  `worker_runtime_schema_contract_v1` e exige a versão exata compilada na imagem.
- Endpoint ausente, versão antiga ou payload inválido encerra a task nova. O rollout do ECS não
  estabiliza e a task anterior permanece atendendo; nenhum job de cliente é reivindicado por uma
  imagem incompatível.
- A versão e as capacidades obrigatórias vivem em `runtime-schema.ts`. Um teste lê a migration mais
  recente do contrato e impede que código e SQL sejam alterados separadamente. Mudança incompatível
  exige nova versão; comando aditivo entra por nome de capacidade, preservando restart da imagem
  anterior durante o rollout. O endpoint aceita somente sessão `authenticated`, não expõe dados de
  tenant e retorna apenas versão e nomes de capacidades.
- A migration do bridge R01 foi reconciliada com o carimbo efetivo de produção
  `20260907051254`; o contrato de boot foi aplicado a staging e produção, com carimbo canônico de
  produção `20260907051611`. O PR #505 passou a CI e a imagem `cb5f674af932` estabilizou como
  `offroad-document-worker:244` no ECS no workflow `34087160541`; este é o primeiro rollout
  efetivamente protegido pelo gate.

## Refresh governado quando o input R01 fica completo, implemented, 07/09/2026

- Uma resposta tipada continua alterando apenas o campo ao qual a pergunta foi vinculada. Enquanto
  o draft estiver incompleto ou em conflito, nenhuma nova análise é iniciada e as próximas lacunas
  materiais permanecem visíveis.
- Quando a resposta fecha o último input obrigatório, o worker cria uma única reanálise limitada do
  caso, atribuída ao usuário que respondeu. A combinação projeto, sessão e fingerprint do draft
  torna retries idempotentes e impede cobrança ou execução duplicada.
- O run novo lê a revisão imutável acumulada pelo projeto; não tenta reconstruir premissas pela
  janela recente do chat. O R01 continua em sombra e não autoriza recomendação ou material externo.
- O teste de orquestração prova os dois ramos: input incompleto não enfileira; resposta que fecha
  exatamente `structure.advanceRate` compila o draft e inicia o refresh sem chamada de modelo.
- O primeiro teste remoto encontrou uma fronteira errada antes da produção: o comando interno
  chamava uma RPC de tenant e exigiria que a conta isolada do worker pertencesse à organização. O
  refresh agora nasce diretamente da capability do job leased, sem impersonar o usuário; autoria,
  orçamento e execução controlada continuam atribuídos à resposta de origem.
- A migration `20260907054112` e a capacidade aditiva `20260907054118` já estão em produção. A
  fatia ainda precisa concluir a CI integral e estabilizar a imagem nova no ECS antes de contar
  como live. O número de versão permanece compatível com a imagem anterior durante o rollout; a
  imagem nova exige nominalmente `receivables-complete-draft-refresh.v1` antes de tocar a fila.

## Verdade econômica do Caso 02 revisada, specified, 07/09/2026

- A primeira revisão independente do gabarito CFO/Camil recalculou a projeção e corrigiu sete
  defeitos conceituais: métricas de cobertura misturadas, diferença de 1 entre custo de transação
  do balanço e do cronograma, principal IPCA não liquidado no bullet, caixa não operacional
  incluído na liquidez, pré-pagamento a par presumido, alternativas ranqueadas sem custo de saída e
  rolagem que mantinha o principal sem cobrar juros futuros sobre a dívida refinanciada.
- O núcleo agora trata separadamente DSCR, cobertura de juros, cobertura de liquidez e usos de
  caixa. Principal corrigido por IPCA é pago integralmente no bullet; caixa e dívida caem juntos
  quando há amortização com caixa; dívida contábil e principal-base do cronograma têm bases
  nomeadas distintas.
- O gabarito não declara headroom de covenant sem definição contratual de EBITDA, caixa dedutível e
  degrau aplicável. As quatro alternativas que retiram dívida existente permanecem bloqueadas até
  principal nominal, juros acumulados, encargos e condições de pré-pagamento estarem resolvidos.
- Estado permanece `specified`: a referência econômica está corrigida e testada, mas o reference
  model, o board paper, o binding aos objetos governados e o E2E longitudinal G2 ainda não existem.
# Universal dispatcher candidate persistido, shadow, 07/09/2026

- O preflight objetivo-específico agora compila também um candidato universal all-or-nothing.
  Cada tarefa selecionada precisa coincidir simultaneamente com o grafo do objetivo, a decisão de
  prontidão recalculada sob o contexto de execução exato, o método/version, a capability, o executor
  realmente empacotado e o contrato de resultado. O candidato carrega hashes do manifesto de
  capabilities e do contexto; policy drift, duplicidade, ausência ou divergência esvazia todo o
  slice e deixa razões nomeadas.
- O candidato é persistido atomicamente com plano, especialização, method binding e seleção de
  receita pela RPC `worker_record_objective_plan_preflight_v5`. A tabela tem RLS forçada,
  imutabilidade, replay por fingerprint e vínculos ao tenant, projeto, mensagem e job.
- Esta entrega **não executa** o candidato: `mode=internal_shadow`, `willExecute=false` e
  `externalEffectAllowed=false` são invariantes no TypeScript e no banco. O rail fixo de produção
  não foi alterado. Com o inventário atual, os candidatos reais continuam bloqueados: só R01 possui
  executor geral empacotado e sua capability ainda é shadow.
- Vitest e typecheck focados estão verdes. O Docker local está indisponível; migration, RLS e SQL
  adversarial permanecem pendentes do gate Supabase da CI antes de qualquer promoção para tested.

## Materiais Office governados no Caso 01, candidate/internal, 07/09/2026

- A apresentação e o workbook de decisão partem do mesmo `Decision Artifact` governado por
  fingerprint. Os dois
  arquivos são gerados como Office nativo, passam pela suíte LibreOffice/pdfinfo/pdftoppm, são
  armazenados no bucket privado por capability de uso único e recebem manifesto com SHA-256,
  tenant, projeto, renderer, template, qualidade, lineage e estado de release.
- Os dois manifestos são vinculados em uma única reconstrução do contrato. Isso não é uma transação
  atômica com Storage: upload, registro do artifact e persistência do contrato são operações
  separadas. Uma falha posterior pode deixar um objeto privado imutável sem referência; ainda não
  existe um reconciliador ou coletor para esses objetos. O download autenticado
  falha fechado se faltar manifesto, se organização/projeto divergirem, se o contrato mais recente
  não contiver o binding exato ou se os bytes baixados tiverem sido alterados.
- A planilha ad hoc, antes reconstruída pela rota web a partir da síntese, foi removida. Sem a suíte
  de inspeção completa, o plano conversacional pode terminar, mas nenhum PPTX/XLSX é gravado,
  vinculado ou exposto. O run registra um status operacional `governed_material_pipeline_unavailable`
  separado das lacunas econômicas, marca a etapa de materiais como `skipped` e a conversa explica
  por que nenhum arquivo foi criado. O job geral conclui apenas para publicar essa explicação; nenhuma
  interface deve representar a etapa como material concluído. Esse ramo é separado do teste que prova
  geração, inspeção e storage reais.
- O bloqueio observado no E2E do PR #523 não era lentidão: o job falhou em 646 ms com
  `spawn soffice ENOENT`, mas a jornada aguardou por 180 segundos uma mensagem que nunca chegaria.
  O boot agora mede LibreOffice, pdfinfo e pdftoppm e só injeta a capacidade quando os três estão
  presentes; aumentar o timeout teria apenas escondido o diagnóstico.
- O XLSX entregue nesta fatia é um **workbook de decisão**: projeta claims, premissas editáveis,
  séries, fontes e lacunas já presentes no contrato e preserva seus identificadores. Não projeta
  dimensões ausentes e não deve ser chamado de modelo financeiro integrado. O modelo institucional
  integrado, templates de cliente, revisão visual aprovada e DOCX nativo continuam fora do escopo.

## 10 September: integrated delivery candidate, not yet released

Baseline production is PR584, main b0ba09573e0bb6295cabef47b627b89857f82a24.
The candidate branch connects approved material scope to the worker and case engine:
teaser-only work omits the financial workbook, and empty/invalid approved scope produces
no material. The selected scope participates in cache identity. The project displays only
planned outputs and rejects approval of an older material fingerprint. Word and print dates
come from the persisted artifact; route tests compare actual Word bytes across different days.

Documentary method v11 / registry v14 supplies paired questions and assertions to both
independent critics. Migration 20260910021710 preserves the exact historical plans and adds
the newly compiled snapshot. Applied only to dataless staging gjkkjtbfnssdsbmlhmwk after the
founder's explicit destination approval; persistence SQL passed in a rolled-back transaction.
Staging security advisor: zero lints. Documentary activation and production migration remain
unapproved by technical acceptance; no new paid model evaluation has been run.

Financial work adds source-bound institutional input preparation and guided missing-input
questions, and fixes depreciation beyond useful life / final half-year depreciation.
Focused financial-core tests: 90 passed; institutional/financial-model tests: 65 passed at
the first stable checkpoint. Configuration persistence and answer-to-model integration are
still being implemented, not claimed as delivered. Institutional input readiness does not
replace independent model validation or promote the indicative production model.

Provider research is being connected through a distinct authorized tenant reader and an
approved M01→K01→K02 plan. Internal cross-organization matching arrays are not a display
source. The research reader requires the current plan, valid content fingerprint and a
completed task; no fallback to obsolete results. This work does not authorize shortlist
selection, disclosure or introductions. First reader/UI tests: 8 passed; worker/queue/
completion tests: 32 passed. Activation, SQL and full integrated acceptance remain pending.

Staging integration proof (10 September, 03:02 UTC): provider bridge migration
20260910025417 and institutional revision store migration20260910025833 applied.
Their transactional SQL suites passed: actual approval/claim/task/artifact lifecycle,
tenant exclusion, frozen sources, resumed work, exact decimal/hash identity, answer
binding, immutable candidate review and stale/replay rejection. The provider test's
first ownership-transfer fixture violated the unique claim constraint; revocation now
uses a null claim and the complete test passes. The financial migration's first
attempt failed PL/pgSQL parsing; CASE expressions were parenthesized before the
successful apply. No applied migration was edited.

Migration20260910030116 makes the private tables' existing deny boundary explicit
and adds FK indexes. Policy regression passed. Final security advisor: zero lints.
Performance INFOs remain27 unindexed existing FKs,229 unused indexes and the existing
Auth connection-allocation notice; no institutional FK warning was introduced.
Database types regenerated; temporary RPC casts removed from the three web adapters.
Institutional setup reports configuration_needs_review when submitted answers still
lack a reviewed mapping. Source denomination/date/perimeter review and the initial
configuration producer remain missing; no institutional recalculation is claimed.
Provider results inventory only the authorized acervo, not deal-fit selection.
Local Playwright coverage now starts research through the real composer, requires
plan approval and checks persisted result/progress after reload, without paid providers.
This new journey still requires execution in CI before acceptance.

The final combined `pnpm check` passed lint, typecheck, tests and production build
(43 successful build tasks). A stale Turbopack cache containing a sandbox port failure
was moved aside before the successful clean build. No merge, production deployment,
complete endgame or institutional quality across all deliverables is claimed by this checkpoint. Existing approval, tenant, provider-budget and disclosure controls stay
in force. Rollback: code revert; the additive documentary migration preserves old plans.


PR #585, candidate `7a83327`: CI Quality 34432556696 passed the full quality and
database jobs; Security 34432556643 and Vercel preview passed. Browser acceptance
found one real integration defect: the provider plan finished with zero model calls,
but the initial project page did not refresh to display its approval card.
E2E: 25 passed, 15 skipped, 1 failed (both attempts). Publication remains held while
the page refresh is corrected and the complete journey is re-run.

The refresh correction reads pending plan jobs before the produced brief and
refreshes only queued/leased preparation; awaiting approval does not imply execution.
13 focused state tests and the combined local quality check pass after the fix.
The original E2E assertions remain unchanged; exact-head CI must confirm the correction.


Production database promotion, 10 September 2026: founder explicitly authorized all ten
migrations for `ifnogpksgdadruooqydi` after automatic review required destination-specific
approval. All ten applied successfully, in dependency order. Recorded production versions:

- `20260910033410_strict_documentary_plan_persistence`
- `20260910033425_documentary_work_request_context`
- `20260910033433_compact_documentary_plan_contract`
- `20260910033442_reviewed_documentary_plan_contract`
- `20260910033449_documentary_entity_plan_contract`
- `20260910033507_documentary_diligence_plan_contract`
- `20260910033516_documentary_comparison_review_contract`
- `20260910033526_provider_research_persisted_bridge`
- `20260910033542_institutional_model_assumption_answers`
- `20260910033550_institutional_private_explicit_rls`

Migration SQL is unchanged; filenames now match production history. Staging retains its
original recorded timestamps. Types regenerated from production have no API difference.
Security advisor returned zero lints. Both institutional tables have enabled and forced
RLS, four explicit deny policies each and no new direct tenant grants. No customer fixture,
backfill, plan approval, model call or documentary feature activation was performed.
Code publication remains gated on the final PR checks, Vercel and worker deployment.

Browser correction verified in Quality 34433729697, job 102734405573, candidate
`5175cc4`: 26 passed, 15 skipped, no failing or flaky tests. Provider research
completed its unmodified composer-to-approved-result-and-reload test in 10.6 seconds.
Production-history filename alignment changes no migration SQL or application behavior;
its final exact-head CI still precedes merge and deployment.

## Public capital research browser: 10 September 2026 (implementation, not production proof)

An authenticated `/[locale]/app/market` surface exposes the dated, source-linked public research sample of 28 institutions. Workspace navigation and the existing provider-research artifact link to it. Users can search institution/vehicle/strategy, filter roles and strategies, inspect evidence and named vehicles, and pre-screen the economic structure. Public strategy compatibility is explicitly separate from verified mandate eligibility, which remains false for every record. Arrangers, securitizers and fiduciary services are not represented as documented risk holders. Infrastructure membership alone does not establish project-finance activity: that requires an explicit source-linked claim annotation. Unknown strategy is unconfirmed, not a fabricated exclusion.

The versioned JSON retains source IDs, URLs and observation dates from `outputs/endgame-nine-2026-09-10/market-map/brazil-capital-map.json`; source summaries remain Portuguese in both locales and are labeled accordingly. No private data, organization identity, verified fund directory, provider artifact or approved shortlist is mutated. No outreach is enabled. Existing `requireWorkspace` authorization is preserved. This is a bounded public research sample, not the regulatory census or a claim of current appetite.

Validation: 23 focused tests passed (catalog, roles, structural negative cases, source integrity, rejected mandate promotion, route authorization, bilingual rendering and message parity); focused lint and web typecheck passed before the last source-annotation refinement, which is covered by the focused tests. Standalone rendering inspected at 1440px and 390px with no horizontal overflow. Screenshots: `outputs/endgame-nine-2026-09-10/market-map/product-qa/`. Integration full check, authenticated browser E2E, preview and production remain release gates. Security: no new database/grants/policies, no network writes or external effects; unsafe source URL schemes are rejected. Rollback: revert this additive route, navigation links, component and research asset.


### Expanded registry and historical evidence scope

The same surface now has separate profile, official-registry and historical-observation views. The compact registry projection includes 899 CVM managers with active broad-screen candidate funds and 1,742 BCB institution roots, searched by name/identity with 25 records per page. Fourteen-digit CNPJ and eight-digit BCB roots remain separate; counts are not summed as independent lenders. Consortium administrators retain registry-only status. Acquisition date is shown separately from the unknown publisher reference date. Source links, SHA-256 and ODbL attribution are retained. No raw fund/class census is bundled.

Historical evidence displays four Movida debenture observations (issuer table, final-terms reconciliation pending) and the Tecon/BNDES announced approval (disbursement not verified); investor identity and rates remain unknown where the source does not identify them. BTG's dated advertised working-capital product floor is shown only within its researched profile, with monthly units, no binding offer, unknown CET and explicit non-comparability to annual CDI spreads. These are historical/source observations, not current market quotes.


### Final local verification

Independent review matched all 899 CVM and 1,742 BCB projected identities to the acquisition assets, including names, identity types, source URL/date/SHA-256; transactions and pricing match the curated research artifact. Full `pnpm check` passed: 43/43 build tasks, including web 88 test files / 533 tests. Dependencies were installed offline into this worktree and workspace resolution was verified locally; no borrowed workspace source paths. The initial restricted build was interrupted after waiting at Next build, then the full check passed with the build permissions needed for public fonts.

The existing authenticated `provider-research.spec.ts` journey now tests rail navigation, profile search, structure selection, BCB identity search, historical sources and return to the preserved private project. It was not run here because no local Supabase/Docker E2E stack was available; CI execution remains required. Actual React component interactions (profile search, registry identity search, history tab) passed in an isolated local visual harness, with desktop and mobile captures and no horizontal overflow. That visual harness was removed and is not authentication or production proof. No deployment or outreach occurred.

## Approved public provider research bridge (10 September 2026)

The approved provider-research workflow now consumes the same versioned 28-profile catalog as the market browser through the client-safe `@offroad/public-research/capital-catalog` export. New plans use `2026.09.10-public-research-v2`, explicitly allow public research, show mixed public/private sources before approval, and bind the exact snapshot key/hash. Context `provider-research-context.v2`, executor `2026.09.10-v2` and artifact `provider-research.v2` carry the immutable catalog pin `br-capital-2026-09-10.v1` / SHA-256 `f158ac09fc2a44a77d608cc57a1fbb074f7de8b88d558ce9d29bff917429f235`. Unknown pins, changed hashes, or an as-of date preceding the catalog fail closed.

Private source ownership validation remains unchanged. Public profiles have their own `public_research` source class, no fabricated organization owner, and dated source URLs inside the persisted artifact and its actual project UI. Documented roles distinguish arrangers, managers and fiduciary services from risk holders. Up to 500 authorized private records and 28 public profiles are supported; the regulatory census is not represented as financing observations. Public strategies are not verified current mandates or case-fit approvals. There are zero model calls, no outreach, no fund-directory writes and no matching promotion.

V1 context, plan, executor, artifact and replay remain supported. An immutable synthetic golden artifact generated from the pre-bridge worker at `e8edf97` verifies exact v1 output/fingerprint preservation. V2 tests verify 28 sourced profiles with an empty private universe, all intermediate pins, replay without duplication, private ownership denial, unknown pin rejection and the 528-record boundary. The real authenticated Playwright provider-research journey now expects public evidence while the subsequent authorized-mandate matching universe remains empty.

Migration `20260910151957_provider_research_public_catalog_v2.sql` was applied to staging by the root agent; root reported both unchanged v1 persistence SQL and the new v2 suite passed, including mutation of the approved brief. The approved-input fingerprint now binds stored and computed research-brief content hashes; public catalog changes cannot silently bypass approval. This migration has not been applied to production by this task. Full local `pnpm check` passed (43/43 tasks); the final worker suite passed 12 tests including the max-record boundary. Authenticated E2E execution still requires the CI/local Supabase harness. Deployment and production verification remain release gates.

## refactor/receivables-math-to-financial-core (10 September 2026)

The financial mathematics that still lived in `packages/receivables-analysis/src/analyze.ts` now runs in `packages/financial-core/src/receivables/pool-*.ts` as eight deterministic, Decimal-based, traced kernels: title eligibility per declared policy, concentration caps (debtor cap then group cap, both shares of the preliminary eligible base, an excess never subtracted twice), borrowing base and structure (maximum by advance rate, maximum by overcollateralization, supported facility as the lesser, overcollateralization at request, actual subordination, reserve target, eligible share), the indicative waterfall in the fixed order servicing fee, senior interest, reserve top-up, senior principal, mezzanine and subordinated residual with cash never negative, ledger reconciliation (tape against accounting, tape collections against reported, reported against cash, mapped and linked-account shares, unknown-mapping and duplicate receipts), reported-aggregate performance with the aging fold, evidence coverage shares and trigger comparison. Every kernel returns full-precision strings and a trace with formula and operands; `analyze.ts` keeps only orchestration, presentation rounding, gap assembly and the bounded decision, and the unused `concentration` helper was deleted. `financialCoreVersion` moved to `2026.09.10-v16`; the analyzer keeps engine `2026.08.24-v1` because no number changed.

Byte-identity was proven before and after the refactor over 34 cases (the clean diversified pool, its reversed-row copy, the shadow pool, the 28 parametric scenarios, the gc03 Aurora pool, the case-factory pool and the overlapping-concentration gold): every `analyzeReceivables` JSON, every `underwriteReceivablesPool` JSON and every `input_fingerprint` and `output_fingerprint` matched exactly, including the `history_coverage` and `economic_conventions` projection of PR #591. The pins are committed: `packages/receivables-analysis/src/pool-kernel-parity.test.ts` pins the 29 in-package cases, the reversed-order copy and the overlapping gold; the gc03 fingerprints are pinned in `packages/testing-fixtures/src/fakeco/receivables-underwriting.test.ts` and the factory analysis hash in `packages/evals/src/receivables-fidc.test.ts`.

New kernel tests (36 in `packages/financial-core`) cover the review's gold numbers, boundary cases and traces: preliminary base 6,000,000 with debtor cap 1,200,000 and group cap 1,500,000, group A of 2,000,000 plus 1,000,000 capped to 1,500,000 beside three groups of 1,000,000, adjusted base 4,500,000 and capacity 3,600,000 at 80% advance; reserve target 90,000 with opening 30,000 and top-up 60,000, 400,000 of cash paying 10,000, 100,000, 60,000, 200,000, 0 and residual 30,000 with payments summing to 400,000; the 50,000 shortfall case; inclusive policy limits; zero denominators; impossible dates, negative amounts and shares outside the unit interval refused. `AGENTS.md` now records the migration as done and states that promotion still needs the method maturity evidence and the founder's approval; the `finance.deterministic-kernels` ledger entry lists the pool kernels and their convention limits without changing availability, exposure or maturity. No migration, no user-visible change, no external effect.

## feat/task-capability-registry-and-review-roles (10 September 2026)

Steps 1 and 2 of `outputs/endgame-nine-2026-09-10/PLANO-ENTREGAS-E-TAREFAS.md`, front C.

**Capability, permission and delivery contract.** `packages/work-plan/src/project-capability-registry.ts` declares the three standalone capabilities a project can execute today (documentary reading through `request_documentary_work_revision_v1`, financial result through the institutional model setup and review, provider research through the case-fit command), each with required inputs, approval gate, supported deliverable types, plan, expected result, limits and declared behavior for missing data or unsupported requests. The documentary guard against calculations is preserved; calculations are routed to the financial executor. A commercial profile is never authorization.

**Review roles.** Migration `20260910230211_project_review_roles.sql` (applied to the staging branch `gjkkjtbfnssdsbmlhmwk`, which recorded it as version `20260910193505`; the local file name is aligned to the production stamp at release, and the applied SQL is byte-identical to the file). Not in production adds organization and project self-approval policies, per-project preparer/reviewer/approver assignments, a work-request log and the persisted approval record (preparer, reviewer, decision, approved revision) on the execution brief dispatch. The role check runs inside the approve, plan edit, documentary revision, institutional setup, institutional review and provider case-fit commands; a project without assignments keeps the previous open behavior, documented in the migration comment and in `docs/product/PROJECT_REVIEW_ROLES.md`. `supabase/tests/project_review_roles.sql` covers the positive and negative cases; security advisor 0 lints; types regenerated from staging.

**Common entry.** The project composer offers "new work" with a free objective and explicit capability options. The preview shows plan, data used, expected result, limits and the approval gate before anything is sent; the server takes the same registry decision and calls `record_capital_project_work_request_v1`, which runs the documentary revision atomically or routes financial and provider work to their surfaces. Previous requests remain listed with a way back to the originating result. `ProjectReviewRoles` is a new work section for assignments and the self-approval setting. The documentary-only control was replaced.

Out of scope here: format policy per deliverable, client templates and visual QA (steps 3 and 4). The PR stays open for coordinated release because production must receive the migration first.

## feat/receivables-released-analysis (10 September 2026)

The R01 receivables method now has its maturity evidence on record and a bounded released reading. The independent economic review of 10 September is committed as `packages/credit-playbook/knowledge/reviews/underwrite-receivables-pool-2026-09-10-independent-review.json` (kind `ai_independent_review`, result conditional, human approval false), and the gold, adversarial and consistency runs are recorded executions rather than prose: the method declares zero model calls, so the honest evidence is the executor running over the frozen Case 03 gold `gc03-assessor-recebiveis`, the five declared adversarial scenarios (`r02-accounting-mismatch`, `r11-single-debtor-concentration`, `r15-encumbered-base`, `r19-no-eligible-base`, `r20-duplicate-cash`) and twenty row permutations. `packages/evals/scripts/build-receivables-method-runs.ts` rebuilds the three run records and `packages/evals/src/receivables-method-runs.test.ts` compares the committed records with a fresh execution, so a stale record fails instead of aging quietly. With the review and the three runs, `underwrite-receivables-pool` rises from `implemented` to `tested`, and only that far: `production` needs the founder's approval on record and nothing here invents it.

Exposure became `allowlisted` with `customer_work` next to `internal_validation` and maximum effect still `none`. The bundled allowlist stays empty on purpose: the organizations allowed to read the released result live in the database grant `private.receivables_analytical_release_grants`, written by an operator exactly like the `integration_preview` concession, so the universal dispatcher stays closed and the accreditation stays `shadow`. `apps/document-worker/src/specialist-method-runtime.ts` gained one second mode, `analytical_release`, admitted only when `evaluateReceivablesSpecialistPolicy` accepts both the manifest policy and the rung, and only when the grant carries this organization, the confirmed scope and the dataset hash of the exact input assembly. Without the grant the run is byte-for-byte the internal shadow it was before.

Migration `20260910230401_receivables_analytical_release.sql` is additive: the grant table and its `security definer` reader, the immutable `private.receivables_released_results` (RLS enabled and forced, restrictive deny-all, revoked from every Data API role) bound by composite foreign keys to the capital project, the intake session, the run, the job, the input assembly and the confirmed evidence scope, `public.worker_record_receivables_released_result_v1` which re-checks the contract, the grant, the tenant, the dataset hash and the confirmed scope before writing, `public.read_receivables_released_result_v1` which returns the caller organization's own current result or an explicit `not_granted`, `absent` or `superseded` state, and one patch that hands the worker its own grant with the rest of the case bundle. A result whose confirmed selection, sources or run changed is reported as `superseded` with its reason and never as current.

The project page now shows, for a granted organization, the portfolio and both eligible bases with the denominator convention stated, the supported facility against the requested amount with the maximum by advance rate and by overcollateralization, concentration against the declared caps, the indicative waterfall with its fixed order stated, triggers with status and consequence, gaps with severity and scope, historical coverage per family with its measured, partial or not-evaluable state, the unavailable metric ids and the engine warnings, the aggregate performance labelled as reported title aggregates, the evidence references by section, source and anchor, and a limitations block: the analysis holds under the declared assumptions, and it carries no external direction, no financier recommendation and no credit approval. Without the grant the page keeps exactly today's compact card. Strings live in both catalogs with identical keys.

Tests: `apps/document-worker/src/specialist-method-runtime.test.ts` (11, including policy mismatch, missing grant, other tenant, unconfirmed dataset and unconfirmed scope), `apps/document-worker/src/receivables-analytical-release.test.ts` (4 over the real R01 workbook: unchanged behaviour without the grant, the released result bound to the confirmed scope with the shadow's own fingerprints, a grant for another organization, and a selection that is not current), `apps/web/src/components/advisor/receivables-released-result.test.tsx` (5 over a real `underwriteReceivablesPool` result: both locales, an unmeasured coverage family shown as not evaluable and never as zero, the compact card without the grant, and the superseded state showing no numbers), `packages/credit-playbook` (334) and `packages/evals` (160) green. `supabase/tests/receivables_analytical_release.sql` covers the positive path, replay, the immutable conflict, an external effect, an external use, a rung below `tested`, a failed quality check, an unconfirmed dataset, an unconfirmed selection, another organization inside the payload, the cross-tenant read, the revoked member, the superseded state and the withdrawn grant; it ran clean against the staging branch inside `begin; ... rollback;`, leaving zero rows. The R01 Playwright journey now asserts the compact card before the grant, the released section with all nine blocks after it, the stored result bound to the confirmed scope fingerprint and to the assembly dataset hash, and the superseded card after a second confirmed selection.

Limits recorded on purpose: exposure is one per-organization concession and the method is not promoted; concentration caps are measured on the preliminary eligible base and are not a solver for caps defined over the balance after exclusions; the waterfall is indicative and follows one fixed order; aggregate performance is reported title aggregates and never a measured historical series; `production` maturity and customer reliance remain closed until the founder's approval is on record. The migration has not been applied to production.

## feat/financier-analytical-workspace: financier analytical workspace (10 September 2026)

An organization of type `capital_provider` can now run its own analysis. It creates projects and folders from the same conversation every other workspace uses, accepts the workspace terms with an information-usage declaration, registers and reads its own documents, answers gaps, renames and continues in the same project, and reaches funds and mandates on the new `/app/mandates` page. Analysing a company is not representing it: origination, representation and external disclosure stay closed and now refuse explicitly with `workspace_capability_denied` (SQLSTATE 42501) instead of by omission.

Contract: `docs/product/FINANCIER_ANALYTICAL_WORKSPACE.md` maps the four capabilities (own analysis, mandate management, origination/representation, external disclosure) to the exact RPCs, policies and guards, lists the allowed and denied operations per organization type, and states the single-tenant rule. `private.workspace_membership_v1()` is now the one resolver used by the bootstrap and by every workspace creator, so a user whose oldest membership is in a fund can no longer have a project created silently in a different company membership; the command refuses instead of falling back.

Migration `20260910232821_financier_analytical_workspace.sql` (additive; staging version `20260910194219`, name `financier_analytical_workspace`; not applied to production by this task). It extends the `journey` CHECK, the three `document_intake_sessions` policies and `private.intake_session_for_update` to `capital_provider`, adds `private.intake_session_for_origination` as the borrower-side guard for every command with an external effect (opportunity confirmation and attachment, capital need, operation context, qualified introduction), adds the capability functions, and records the financier acceptance with `authority_declared` null and the financier information-usage statement. No policy, check constraint or validation was removed; the analytical session keeps `representation_status = 'not_claimed'` and `representation_kind` null, including after `authorize_capital_project_private_work` promotes a public project to private. Rollback: revert the file and re-apply the previous definitions of the replaced functions, the three policies and the two-value `journey` CHECK; no table, column or row is created or dropped, so no data is lost by reverting.

Product surface: `/app` keeps the conversation for every workspace instead of replacing it with the funds panel; the rail follows the own-analysis capability rather than `canOriginate`; `/app/new` shows the analytical entry with what is available and what is not, and the company-debt and origination entries explain the boundary in place of a form the server would refuse. Financier onboarding starts on a choice between own analysis and registering funds and mandates, and own analysis completes onboarding in one transaction without a fund, a mandate, a contact or a representation declaration.

Evidence: `supabase/tests/financier_analytical_workspace.sql` ran complete against the staging branch inside `begin; ... rollback;` with every assertion passing: analytical entry and acceptance without representation, private project, folder, document registration and removal, answer, rename, own-state reads, public-to-private promotion without representation, plus negatives for a repeated entry, origination thesis, representation-declared project, public company entry, capital need, operation context, opportunity confirmation and attachment, qualified introduction, advisor authorization, a file bound to another tenant or another session, an organization switch inside the command, another tenant's ids, an analyst accepting terms outside onboarding, a revoked membership, an anonymous caller, and the company and advisor regressions. Supabase security advisors report 0 findings. `apps/web/src/types/database.ts` was regenerated from staging. Vitest: the whole web suite passes, 96 files and 577 tests, including the 22 focused ones for the capability helpers, the `/app/new` entry resolution, the onboarding router and message-catalogue parity; the production build passes 43 of 43 tasks. One environment note, not a code one: on a machine at load average 140 four heavy export and workbook test files unrelated to this change exceed the default five-second timeout and pass with headroom, and CI runs them with the default on a dedicated runner. `apps/web/e2e/financier-workspace.spec.ts` covers the browser journey and the same negatives through direct RPC calls; it is listed by Playwright and typechecks, and runs only in CI because this machine has no local Supabase stack.

Limits: no product path creates a `capital_provider` organization, so the E2E converts a synthetic workspace through `apps/web/e2e/support/financier-workspace-local.sql`; registering funds and mandates after an onboarding completed through own analysis remains work for the mandates front; a request that the classifier reads as meeting preparation still compiles to `origination_thesis` and is refused for a financier with the explanation in the composer.

## feat/deliverable-formats-and-client-templates: delivery formats, client visual identity and visual QA (11 September 2026)

One format policy per deliverable type, in `packages/case-export/src/deliverable-formats.ts`. It answers, for a deliverable type and the current state of the approved result, which files may be offered and under which condition: a documentary reading gives an editable Word and a final PDF; an approved financial result gives the workbook with formulas, the executive deck, the memo in Word and its PDF; research is read in the product and summarized in Word and PDF, with a spreadsheet only where a tabular contract exists; an executive presentation gives the deck and its PDF. Two rules are structural rather than cosmetic: a spreadsheet is never offered for text without a tabular contract, and a superseded result, an access that is no longer current or a reproduction that no longer replays the approved numbers blocks the export with a useful explanation instead of shipping a plausible file. The surfaces show exactly what the policy allows, with each format's condition and, for a format that is not offered, the reason. The download routes repeat the same decision, so a copied link cannot reach a format the surface never offered. The documentary work product route became one route per format; the existing Word URL is unchanged and the PDF is new.

Client visual identity. Migration `20260911011934_client_presentation_templates.sql` (additive; staging version `20260911003716`, name `client_presentation_templates`; not applied to production by this task) adds the private `brand-templates` bucket with four organization-scoped storage policies, the `public.presentation_templates` table with one record per organization and an optional record per project, and the two RPCs that write and read it. Only organization owners and administrators write; every member with project access reads. The record holds the palette, the typography, an optional logo as an object reference with its SHA-256 and byte length, and its own identity and version; the fingerprint is computed in the database from the canonical definition, so it cannot be supplied by the caller. Rollback: drop the two public functions, the two private functions, the table and the four storage policies, then delete the bucket row if it is empty; nothing existing is altered, so reverting loses only the recorded identities. The renderers now consume the template: Word and PowerPoint keep the client's real font name, the PDF embeds the family that was explicitly chosen for it, and the identity, version, origin, fingerprint, typography and logo state are written into the Word core properties, the PDF keywords and the deck custom properties. A logo is embedded only after its SHA-256 is recomputed from the stored object; a mismatch, a missing object or a revoked read drops the mark and keeps the rest of the identity. A font the PDF renderer cannot embed is refused in the database and in the action, never replaced silently. The Offroad template stays the default and one button returns to it. The project page gains a settings section with the identity in use, its origin and fingerprint, a live preview of palette and typography, and the form.

Visual QA and the defects it found. The short, long and wide-table cases plus the approved financial statements were rendered in pt-BR and en-US, under the Offroad identity and a client one, and inspected. Five defects were found and fixed. A statement with more than six columns was flattened into labeled records, one line per cell; tables now keep up to nine columns, share the width by what each column carries after reserving room for the widest indivisible word, and right-align figures, which took the approved statements from five pages to two and the wide case from seven to four with nothing lost. A section heading followed only by a table disappeared from the deck and is now the eyebrow of those slides. A heading or a caption could sit alone at the foot of a page with its table on the next one; a heading now reserves the caption, the header and the first row before it is drawn. A chart named its series after the unit, so the legend read "BRL" instead of the measure, and drew in Offroad green under a client identity; the series is now the measure with its unit, the legend is shown, the unit travels on the value axis and the palette comes from the template. Chart slides now state the period and the source, which they did not before.

Evidence: `supabase/tests/client_presentation_templates.sql` ran on the staging branch inside `begin; ... rollback;` with result `client_presentation_templates_passed`, covering the organization record and its idempotent replay, the project override winning over it, clearing back to the Offroad template, a member without administration denied, another tenant receiving "not found" and reading zero rows, and the refusals for an unembeddable PDF font, a colour that is not six hexadecimal digits and a logo outside the organization's own storage prefix; no synthetic row remained afterwards. Supabase security advisors report 0 findings. `apps/web/src/types/database.ts` was regenerated from staging and is a superset: it carries the new table and the two RPCs plus objects from the other fronts already applied there. Vitest: `packages/case-export` 59 tests in 7 files, including 18 rendering cases and the format policy; `packages/release-governance` 178 tests with the new ledger entry, count 43; the web suite covers the two download routes, the two surfaces, the template reader and catalogue parity. Rendered samples are under `outputs/endgame-nine-2026-09-10/materiais-qa/`, with the PDFs rasterized to PNG.

Limits: production has not received the migration, so the application code cannot be published before it. The market research deliverable is declared in the policy but has no Word or PDF synthesis renderer yet, so only the interactive reading is offered for it. The spreadsheet keeps its own governed layout and does not receive the client identity. Native PowerPoint, Word or master template files are not imported. LibreOffice is not installed on this machine, so Word and PowerPoint were inspected as package contents rather than as rendered pages, and formula recalculation was verified with the repository's own workbook audit and a formula inventory (328 formulas, 308 cross-sheet in the pt workbook) rather than with a spreadsheet application.

## feat/receivables-method-production: the receivables analysis in production, released to every organization (10 September 2026)

On 10 September 2026, in the coordination session, the founder Carlos Eduardo Galves approved taking `underwrite-receivables-pool` (task R01: eligibility, borrowing base, concentration caps, indicative waterfall, coverage) to production: "ok, bota isso em produção também. Não quero nada que deveria estar em produção fora." The approval is on record in the method frontmatter as `approved_by: Carlos Eduardo Galves`, `approved_at: 2026-09-10` and `approval_source: instrução do fundador na sessão de coordenação de 10/09/2026`, and it covers this method only. `packages/credit-playbook/src/procedure-contract.ts` now requires the three together: a production method whose approval is a name without a date and a source is refused by the contract, not by a reviewer's memory.

The method moved from `tested` to `production`, its availability from `shadow` to `live` and its exposure from `allowlisted` to `universal`, with `internal_validation` and `customer_work` as the allowed uses, maximum effect still `none` and both allowlists still empty. The runtime manifest is the regenerated projection of the Markdown, source hash `9f5cf24e6751c708a7ff9825afebdd1878e2e07fc652c295df7493cb8e246264`, and a second projection, `specialistMethodApprovalManifest`, carries the approval of every method that reached production so the product can state it without a second source of truth; it sits beside the routing manifest because the routing projection is parsed by strict runtime schemas and must carry only what routing needs. `apps/document-worker/src/specialist-method-runtime.ts` admits the production policy: `evaluateReceivablesSpecialistPolicy` accepts `live` alongside `shadow` and `universal` alongside `allowlisted` for the released mode, and it still refuses an unproven rung, an exposure of `none`, a maximum effect above `none` and any external use, in either mode. The release function stopped depending on a per-organization concession: it consults only whether the release is open, and a paused release raises `receivables_analytical_release_paused` and returns the run to the internal shadow.

Migration `20260911010715_receivables_universal_release.sql` (additive; staging version `20260911003644`, name `receivables_universal_release`; not applied to production by this task). It adds `private.platform_capability_releases`, a platform table with one row per released capability holding the method, its rung and the approval behind it, RLS enabled and forced with a restrictive deny-all policy and revoked from every Data API role, and seeds the row for `finance.receivables-released-analysis`. `private.receivables_analytical_release_enabled(organization_id)` now answers true for every organization while that record is released under `universal` exposure and the organization is not explicitly paused, and `private.worker_load_receivables_analytical_release_v1` answers from the same source under the stable wire name `granted`, so a worker built before this change reads it unchanged. `private.receivables_analytical_release_grants` survives as an explicit pause: only `enabled = false` matters now, and a historical row with `enabled = true` is a harmless no-op. Nothing else changed: the reader still returns `current`, `superseded`, `absent` and `not_granted` exactly as before, the released-result table, its composite foreign keys and the writer's contract checks are untouched, and no policy, grant or check constraint was relaxed. Rollback: revert the file, restore the previous definitions of the two functions and drop the platform table; no tenant row is created or destroyed, so reverting loses no data. Operating the pause needs no deploy: set `released = false` on the platform row to close the reading for everyone, or insert a row with `enabled = false` for one organization.

The project page gives way to the released reading for every organization that has a current result, and the limitations block now states the rung as a word in each language, the date of the founder approval, and what the reading still does not authorize: no external direction, no financier recommendation, no credit approval. The E2E no longer seeds a concession, and `apps/web/e2e/support/receivables-release-grant-local.sql` is gone: the journey asserts that no row exists in the grant table at any point, that the platform record carries `released`, `universal`, `production` and the approval, and that the released section arrives with the production rung and the approval date.

Evidence: `supabase/tests/receivables_analytical_release.sql` ran complete against the staging branch inside `begin; ... rollback;`, leaving zero rows, with every assertion passing: the result is recorded with no concession anywhere, replay is idempotent, a changed payload under the same input fingerprint is a conflict, and an external effect, an external use, a rung below `tested`, a failed quality check, an unconfirmed dataset, an unconfirmed portfolio selection and another organization inside the payload are all refused; the owner reads `current` at the production rung, another tenant and a revoked member read nothing, a second organization with no concession of its own reads the explicit `absent` state, pausing that one organization closes only its reading and lifting the pause restores it, a second confirmed selection is `superseded` with its reason, and pausing the platform record returns `not_granted` for every organization while no Data API role can read the platform table. Supabase security advisors report 0 findings. Vitest: `packages/credit-playbook` 336 in 41 files, `packages/evals` 160 in 23 files (the harness re-executes the recorded gold, adversarial and consistency runs, which stay valid), `packages/dcm-specialization` 59, `packages/release-governance` 178, `apps/document-worker` 559 in 59 files and `apps/web` 605 in 100 files.

Limits recorded on purpose: the approval promotes this method and nothing else, and the ledger keeps exactly one production entry and exactly one entry with `customer_work`; the reading is a calculation under declared assumptions, with no external direction, no financier recommendation and no credit approval, and the maximum effect stays `none`; extraction quality of arbitrary documents is unchanged, so the analysis is only as good as the confirmed portfolio selection and the sources behind it, and a missing input stays an open gap instead of a number; concentration caps are measured on the preliminary eligible base and the waterfall follows one fixed order; aggregate performance is reported title aggregates and never a measured historical series; the objective preflight still blocks R01 for the reasons that remain (evidence regime, data class and a task effect above the method's maximum effect), so the universal dispatcher is not opened by this promotion; and production has not received the migration.

## feat/verified-mandates-and-candidate-fit: verified current mandates and candidate fit (11 September 2026)

A financier's mandate now has a record of its own, and a candidate for a case now says what it rests on. Gap 8 of the nine-gap program asked for exactly two things that were missing: a way to capture and confirm what a financier wants today, separately from what it did in the past or filed in public, and a selection that tells a reader which of the two it is looking at. Both exist now, with an empty population and no contact made.

Contract. `public.provider_mandates` is a structured, versioned record for a `capital_provider` organization: instruments, ticket range and currency, sector, geography, credit profile (leverage ceiling and minimum DSCR), collateral and tenor restrictions, a validity window, a status in `draft`, `confirmed`, `expired` or `withdrawn`, and the sources it was built from. `public.provider_mandate_confirmations` is append-only and holds the events: who confirmed, when, and through which channel, where a channel is the organization declaring it in the product, an official document reference, or a contact Offroad recorded with its date and record id. A public filing and a past transaction are neither: they stay in `public.fund_directory` and `public.fund_mandate_observations` with their own provenance, and nothing writes from them into this record.

Two rules are the database's rather than the interface's. A record cannot be confirmed without an event: `status`, `confirmed_*` and `withdrawn_*` sit outside the tenant's column grant, the insert policy admits only `status = 'draft'`, and `private.guard_provider_mandate_confirmation_v1` refuses any confirmed row with no event for that version, whatever role writes it. And expiry is derived rather than scheduled: `private.provider_mandate_effective_status_v1` reads the validity window against the date the question is asked, so a mandate whose window closed is expired for matching that day with no cron and no background write. Renewal is a second confirmation event with a new window, never an edit of the first; the confirmation is keyed to `(organization_id, mandate_id, version_number)` by a composite foreign key, so the version it confirmed is provable.

Migration `20260911011830_verified_provider_mandates.sql` (additive; staging version `20260911003522`, name `verified_provider_mandates`; not applied to production by this task). It adds the two tables with RLS enabled and forced, explicit select, insert and update policies scoped by `private.is_org_type_member(organization_id, array['capital_provider','offroad'])`, minimal grants to `authenticated` with `delete` withheld from both tables and `status` withheld from the update grant, `updated_at` and audit triggers, the confirmation guard, the four commands (`register_provider_mandate_v1`, `confirm_provider_mandate_v1`, `withdraw_provider_mandate_v1`, `list_provider_mandates_v1`), and one replacement of `private.provider_case_fit_owned_sources_v1` that keeps its signature. Rollback is dropping the two tables, the four commands and the two helper functions, and restoring the previous body of the projection from `20260910072024_provider_case_fit_persisted_workflow.sql`; no existing table, column, policy, grant or check constraint is altered or removed, so nothing is lost by reverting.

Matching reads the verified record first. A fund holding a `provider_mandates` row is answered by that row and by nothing else: confirmed and inside its window it becomes `declared` observations dated at the confirmation and noted with the record id, the version and the channel; a draft, an expired window or a withdrawal produces no observation at all, so neither can match. The newest registered version answers even while it is a draft, because a fund that started describing new terms is not still offering the old ones. A fund with no such record keeps the legacy `mandate_versions` projection with its own provenance.

Classification. `packages/matching-core/src/candidate-fit.ts` is a pure, deterministic classifier. `eligible` means a confirmed mandate inside its window with no incompatibility and no hard criterion that cannot be read from that mandate. `hypothesis` means research: a public record, past activity, or a mandate still in draft, expired or withdrawn. `excluded` means a hard criterion the mandate rules out, so an incompatible instrument is never eligible whatever the rest of the box says, and a soft mismatch or an open company question never excludes. Every candidate carries the adherence rationale across the seven subjects a credit committee argues about (instrument, ticket, sector, geography, credit profile, tenor, collateral) with the origin and date of the observation that decided each one, the incompatibilities by name, and the mandate version, status and confirmation date it was read from. An unconfirmed declaration is deliberately labelled a record rather than confirmed interest; the exact provenance survives on every item. Leverage and DSCR answer as one credit profile because they are one question. The artifact keeps schema version `provider-case-fit.v1` and the new candidate fields are optional, so a result written before this contract still verifies against its own fingerprint.

Surfaces. `/app/mandates` became the place where a `capital_provider` organization registers a fund and a mandate in one call, confirms it, sets its validity, renews it and withdraws it. The panel counts mandates in force rather than rows saved, shows the date and channel of the last confirmation beside every fund, leads with the records somebody has to act on (expired, then closing soon, then never confirmed), and lists funds already in the registry that carry no structured mandate. The lender list in a project shows the classification, the evidence source, the mandate version and confirmation date, the incompatibilities by name and the adherence item by item, and asks for a renewal on a candidate whose window is closing or has closed. Nothing on either surface contacts anybody: a renewal is somebody in the organization deciding to confirm again. Copy lands in both catalogs with identical keys under the new `MandateRegistry` namespace and the extended `ProviderCaseFitWork` namespace.

Evidence. `supabase/tests/verified_provider_mandates.sql` ran complete against the staging branch inside `begin; ... rollback;` with every assertion passing: registration as a draft version 1, confirmation through an official document with its author and version on record, the confirmed record answering all ten criteria with `declared` evidence traceable to the record, a second draft version removing the fund from matching until it is confirmed in turn, expiry the day the window closes, a renewal adding a second event without rewriting the first, a withdrawal leaving matching in the same transaction, and negatives for a tenant writing `status` directly, a tenant inserting an already confirmed row, an official-document confirmation with no reference, a contact confirmation with no record and no date, a privileged role promoting a record with no event, a confirmation after withdrawal, another financier reading, editing, confirming or withdrawing this tenant's mandate, and a company organization registering one at all. Supabase security advisors report 0 findings. `apps/web/src/types/database.ts` was regenerated from staging; the diff is additive. Vitest: `packages/matching-core` 12 tests over the classifier (promotion, exclusion, expiry, withdrawal, credit-profile combination, order independence), `packages/fund-mandate` 57 including five new artifact tests and six on the record contract, `packages/release-governance` 179 with the ledger at 43 entries, and the whole web suite 101 files and 618 tests including nine on the registry and eight on the lender list. `pnpm check` is green end to end: 43 of 43 tasks across lint, typecheck, test and build. `apps/web/e2e/financier-workspace.spec.ts` now registers a fund through the product's own screens, proves the draft cannot be promoted by writing the status column over REST, confirms it with a document reference and checks that another tenant reads neither the mandate nor its confirmation; it typechecks and is listed by Playwright, and runs only in CI because this machine has no local Supabase stack.

Limits recorded on purpose. No real fund has registered or confirmed a mandate: the contract exists and the population is empty, so the `capital.live-mandate-network` entry stays `absent` and the new `capital.verified-mandate-record` entry is `live` at `internal` exposure with `internal_validation` as its only allowed use. A confirmed mandate is a statement by the organization, never an appetite, a capacity, an approval or a commitment to fund, and a classification authorizes no disclosure, no contact and no introduction. The recorded-contact channel is accepted by reference only; the product makes no contact and sends nothing outside. Expiry is derived per question and no notification or scheduled job exists. The migration has not been applied to production.

## Onda 2: preflight operacional da outbox

Workflow manual `event-outbox-monitoring.yml` usa a identidade OIDC de deploy existente, sem ampliar IAM. Testa filtros e confere quatro alarmes; instalação é modo explícito. A execução ao vivo ainda deve provar as permissões. Etapa 2 concluída em `d47658eb`; etapa 4 permanece aberta, sem migração permanente nesta PR. Revisão material: `docs/security/INVENTORY_WAVE_2_OUTBOX_MONITORING_REVIEW.md`.

## Onda 2: candidato da etapa 4

Contrato de eventos/outbox e consumidor limitado no worker atual, com trilha atômica e barreira para publicação externa. Candidato SQL validado em staging com rollback; nenhuma aplicação permanente nesta preparação. A etapa segue aberta até CI, journals, deploys e alarmes reais. Escopo e riscos em `docs/build/arcabouco/etapa-04.md`; revisão material em `docs/security/INVENTORY_WAVE_2_OUTBOX_REVIEW.md`. A etapa 2 está concluída em produção no commit `d47658eb`.

## Abertura da etapa 7 - onda 6

OK do fundador recebido. Inventário renovado sobre `f4a0a7b0759e8fc361b59fed16649a17fe5e7cad`, com journals vivos e worker exato; revisão em `docs/security/INVENTORY_WAVE_6_REVIEW.md`. Implementação e eval da etapa 7 ainda pendentes; nenhuma etapa posterior autorizada.

## Etapa15: avaliação integrada do pacote de decisão

Seis casos em `capital-decision-domain-eval.test.ts`: oráculo independente em centavos, caixa negativo, integridade/perímetro, lacunas, consistência e duração sintética do domínio. Não comprova latência de usuário nem revisão independente. Ver `docs/build/arcabouco/etapa-15-eval-integrado.md`. Etapa15 permanece aberta; completion exige CI e produção no commit.
