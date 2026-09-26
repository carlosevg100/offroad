# Etapa 18, incremento 5B: o estado da web pelos fatos gravados e a retirada dos caminhos substituídos

Incremento só de web, sem migração: nenhuma tabela, função, política ou concessão muda. As superfícies de trabalho e de execução passam a mostrar atividade apenas a partir de fatos gravados, e a página deixa de se atualizar quando nenhum fato diz que algo está em andamento. Um resultado ausente sem nada em andamento aparece como lacuna com o próximo passo, nunca como processamento.

## O ponto de partida medido

Sobre main `0b63e7b0` (incremento 4 completo, #787 e #789, e 5A, #792 e #788):

- `DealStateRefresh` chama `router.refresh()` a cada 2,5 s enquanto `active` for verdadeiro. Havia seis usos e três laços próprios de intake (5 s, 5 s e 2 s).
- A conversa do trabalho (`AdvisorProject`) decidia `active` por `advisorIsActive` (sessão em `processing`, tarefa em `running` ou mensagem em `queued` ou `processing`) e atualizava também enquanto uma ação da própria tela estava pendente (`interactionPending`) ou enquanto o plano era preparado (`planPreparationStatus`, lido de uma consulta à parte). Uma mensagem que ficasse em `queued` depois do fim do job mantinha a conversa ocupada e a página em atualização para sempre.
- A página de oportunidade mostrava processamento quando `workbench.isProcessing` ou quando faltava um resultado depois de uma confirmação (`understanding confirmed && !structure`, `changes_requested && !revisedOptionReady`): atividade inferida pela ausência.
- A mesma inferência aparecia em mais quatro lugares: os materiais do caso privado (plano aprovado sem pacote mostrado como "sendo compilados"), as telas especializadas de companhia e de planejamento de capital (`!artifact && session.status !== "failed"`), a tela dedicada de tese de originação (mesma regra) e o texto da conversa vazia, que dizia que o plano estava sendo preparado sem conferir se algum job preparava o plano.
- A visão do resultado institucional atualizava enquanto o resultado estava `queued`. Um resultado só sai de `queued` pelo escritor do resultado: se o job falha ou é cancelado, o resultado fica `queued` e a tela ficava em "Calculando" com atualização para sempre. O banco já define o resultado vivo como `queued` com job vivo (`private.institutional_result_is_live_v1`).
- As páginas de execução não se atualizavam sozinhas; o detalhe tinha só o botão de recarregar.

## O leitor de atividade

`apps/web/src/lib/advisor/work-activity-reader.ts` (`loadWorkActivity`, só no servidor) lê, sob a autoridade de leitura do trabalho, quatro fatos e nada mais:

| Fato | Onde | Classe |
|---|---|---|
| job vivo em `queued` ou `leased` | `public.processing_jobs` do trabalho (`work_id`) ou da sessão de intake dele | máquina |
| job em `awaiting_approval` | idem | pessoa |
| espera aberta: marco `awaiting_human` sem `human_resolved` que o resolva e sem espera mais nova que o substitua; a espera de uma candidata de recálculo só está aberta enquanto a candidata estiver `awaiting_authorization` (a regra que a leitura das atualizações usa) | `public.work_milestones`, `public.work_recompute_candidates` | pessoa |
| pedido de atualização `scheduled` | `public.work_continuation_requests` | máquina |
| candidata `scheduled` ainda sem a sua execução (ou, no resultado institucional, sem o seu resultado) | `public.work_recompute_candidates`, `public.institutional_recompute_candidates` | máquina |

Depois que a candidata ganha a execução ou o resultado, o fato passa a ser o job deles. Todas as tabelas são legíveis por quem lê o trabalho; o leitor valida os ids antes de montar o filtro e, se qualquer leitura falhar, lança erro em vez de supor atividade. `apps/web/src/lib/advisor/work-activity.ts` classifica as linhas e dá as decisões, todas funções puras:

- `workShouldRefresh`: a decisão de atualizar. Verdadeira só enquanto há fato de máquina. Espera por pessoa não é consultada a cada 2,5 s: a ação da própria pessoa atualiza a tela, como já acontecia com o plano que aguarda aprovação.
- `conversationIsWorking`: a conversa fica ocupada (indicador "Trabalhando agora" e bloqueio do compositor) só pelos jobs que ela espera: leitura de documentos, análise pedida e resposta a um turno (`document_pipeline`, `preliminary_analysis`, `capital_project_analysis`, `work_conversation` e `agent_operation_brief` que não seja recálculo institucional). Preparação de plano, execução fixada, análise do caso e recálculos de dependência correm em segundo plano: a página atualiza, a conversa continua aberta. É a mesma separação que `advisorIsActive` fazia, agora medida pelos jobs.
- `workIsWaitingForPerson`: há job retido para aprovação ou espera aberta.
- `institutionalCalculation`, `executionIsRunning`, `executionsAreRunning` e `jobKindRunning`: o que cada superfície precisa saber sobre o seu próprio resultado.

Cada superfície lê a atividade antes dos resultados que ela produziria. Se um job termina entre as duas leituras, a página faz uma atualização a mais; na ordem inversa, poderia mostrar resultado ausente sem atualização nenhuma.

## Superfícies

| Superfície | Antes | Depois |
|---|---|---|
| Conversa do trabalho, com e sem intake (`AdvisorProject`, `page.tsx`, `standalone-work.tsx`) | atualizava por sessão, tarefa ou mensagem, por ação pendente e pela consulta do plano | atualiza por `workShouldRefresh`; ocupada por `conversationIsWorking`; cabeçalho "Aguardando decisão de uma pessoa" quando há espera e nada roda |
| Resultado institucional | laço próprio enquanto `queued` | sem laço próprio (a página atualiza pelo leitor); "Calculando" só com o job do resultado vivo; job retido diz que aguarda aprovação; sem job, lacuna com o próximo passo (revisar dados e premissas) |
| Página de oportunidade | processamento por job ou pela ausência de estrutura ou de revisão | processamento só com análise do caso em andamento; ausência vira lacuna com "Retomar a análise" |
| Caso privado no projeto (estrutura e materiais) | plano aprovado sem pacote mostrado como processamento | lacuna com "Retomar a análise" nas quatro ausências (estrutura, nova versão da estrutura, plano de preparação, materiais) |
| Telas especializadas de companhia e de planejamento de capital | "trabalhando" sempre que faltava o artefato e a sessão não tinha falhado | "trabalhando" só com a análise em andamento; falha como antes; senão lacuna com o caminho de volta à conversa |
| Lista de execuções | sem atualização | atualiza enquanto uma execução do trabalho roda ou uma candidata espera o worker |
| Detalhe da execução | sem atualização (botão manual mantido) | atualiza enquanto o job desta execução estiver `queued` ou `leased` |
| Conversa vazia | "o plano deste trabalho é preparado" sem conferir | só com o job do plano em andamento; senão "Acrescente contexto ou documentos para orientar o trabalho" |

A página de oportunidade continua alcançável: o trilho do workspace e os recentes da página inicial levam a ela uma sessão confirmada sem projeto (`app/layout.tsx`, `app/page.tsx`), `/app/new` redireciona para ela quando a sessão está confirmada, e a confirmação do intake (`app/new/actions.ts`) termina nela. Por isso recebeu o mesmo tratamento.

## A lacuna e o próximo passo

`apps/web/src/lib/deal-state/analysis-gap.ts` decide, dos objetos do caso, qual decisão ficou sem o resultado que a análise produz, da etapa mais avançada para a mais antiga: plano aprovado sem materiais, direção confirmada sem plano de preparação, ajustes pedidos sem nova versão das alternativas, entendimento confirmado sem alternativas. Decisão que ainda espera a pessoa não é lacuna. A página mostra a lacuna só quando nenhuma análise do caso roda.

O próximo passo é retomar a análise daquela decisão. `resumeDealStateAnalysis` (servidor) decide a lacuna pelas linhas gravadas, nunca pelo formulário, e chama `enqueue_deal_state_analysis` com o gatilho da decisão. O comando já existia e é seguro de repetir: confere de novo que a decisão é a atual, nunca duplica trabalho em fila, em execução ou concluído para a mesma decisão e só repete um job que falhou. As duas entradas novas, `resumeAnalysis` na oportunidade e `resumePrivateProjectAnalysis` no projeto, validam a entrada com Zod e tomam o escopo de `requireWorkspace`. Se a análise daquela decisão já terminou sem gerar o resultado, a tela diz isso e não presume resultado.

Nas telas especializadas, a análise é pedida na conversa, e a lacuna leva de volta a ela. No resultado institucional, o próximo passo é revisar os dados e as premissas, o link que a visão já tinha.

## Retirada

- A tela dedicada de tese de originação em `projects/[projectId]/page.tsx`: inalcançável desde a #364 (02/09/2026), que manda toda tese de originação para a conversa antes de chegar a ela. Levava a inferência pela ausência do brief e um `DealStateRefresh` sem fato. Saem com ela o `SourceLinks` e o namespace `App.origination` dos dois catálogos, sem outro leitor no código.
- `advisorIsActive` e `advisorShouldRefresh` (`advisor-project-state.ts`), a propriedade `planPreparationStatus` e a consulta `pendingPlanJobs`: substituídos pelo leitor.
- A atualização enquanto uma ação da tela está pendente: toda ação da conversa termina com `router.refresh()` (`onSettled` de `runCommand` e o fim do envio de documentos), então nenhum fato a sustentava.
- O laço próprio da visão do resultado institucional.
- A consulta de jobs dentro de `loadDealStateWorkbench`: `isProcessing` vem do leitor.
- Os ramos de inferência listados no ponto de partida.

Caminhos de atualização por mensagem: o único que o incremento 4 substituiu na web, `appendAdvisorMessage` mandando todo texto com cara de revisão para `submit_advisor_artifact_revision_turn_v1` (o artefato pendente mais novo), já saiu na #789. Hoje a única chamada a esse comando é a de `advisorMessageRoute` com `tryDraft`, isto é, quando o texto nomeia o rascunho, mantida de propósito pelo incremento 4; `submit_advisor_turn_v1`, `propagate_project_canonical_revision_v1` e o tipo `institutional_model_refresh` não têm chamador na web, e o recálculo por mensagem do lado do banco foi tratado pelo 5A. Nada mais a retirar nesse eixo.

## Testes

- `work-activity.test.ts`: cada fato ligado e desligado, a ausência de fato não é processamento nem espera nem atualização, espera resolvida e substituída, espera de candidata só enquanto ela aguarda autorização, pedido e candidatas em cada estado, os jobs que ocupam a conversa, o cálculo institucional, as execuções, e o leitor com cliente falso (escopo do trabalho e da sessão, só a sessão, falha de leitura, escopo ausente ou malformado).
- `analysis-gap.test.ts`: cada lacuna, o gatilho de cada uma, nenhuma lacuna com análise em andamento e a retomada (gatilho decidido pelas linhas, nada a retomar, análise já terminada, análise em andamento, recusa e resposta inesperada).
- `institutional-model-result-activity.test.tsx`: "Calculando" só com o job vivo, espera por aprovação e lacuna sem job.
- `private-analysis-gap.test.tsx`: plano aprovado sem materiais e sem análise em andamento aparece como lacuna com "Retomar a análise", nunca como materiais sendo compilados; o painel de compilação só com a análise em andamento; alternativas ausentes como lacuna.
- `advisor-project-state.test.ts`: os casos de `advisorIsActive` e `advisorShouldRefresh` reescritos sobre o leitor.
- Playwright `work-activity.spec.ts`: um trabalho cujo job está vivo (fora do alcance do worker local) mostra "Trabalhando agora" e atualiza; o job termina com a resposta gravada, uma atualização traz os dois e nenhuma outra acontece em nove segundos. Uma espera aberta aparece como "Aguardando decisão de uma pessoa", sem indicador de trabalho, com o compositor aberto e sem atualização; a resolução a fecha.

## Limites e riscos

- A página atualiza enquanto o fato existir. Uma candidata agendada que o worker não consegue tomar mantém a atualização enquanto a página estiver aberta; o 3B já registrou a falta de alarme para candidata agendada sem execução.
- Uma espera não é consultada: se outra pessoa resolve a espera em outra tela, esta só mostra ao recarregar ou na próxima ação.
- Um job retido para aprovação que não pertença ao plano exibido aparece no cabeçalho como espera de uma pessoa, sem botão próprio; antes a tela dizia "Pronto para continuar".
- As telas de intake e de onboarding (`intake-processing-status.tsx`, `intake-execution-approval.tsx`, `agent-panel.tsx`) não são superfícies de trabalho e mantêm os seus laços; o de `agent-panel.tsx` ainda decide pela situação da mensagem.
- Achados fora do escopo, sem mudança aqui: pelas migrações versionadas, `enqueue_deal_state_analysis` não aceita o gatilho `material_package_approved` que as duas ações de aprovação do pacote enviam, então a triagem de mercado não é enfileirada por esse caminho (não conferido em produção); e o aviso de `integration_preview` com escopo de projetos só existia na tela de tese de originação, que era inalcançável.

## Aplicação

Merge e implantação da web. Não há migração nem mudança de worker; a ordem em relação ao 5C é livre.
