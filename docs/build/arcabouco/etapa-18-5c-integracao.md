# Etapa 18, incremento 5C: as costuras entre 3B, 4 e 5A

Migração `supabase/migrations/20260926051417_work_update_integration.sql`, aplicada em staging (`20260926051108`) e em produção (`20260926051417`) em 26/09/2026, com o texto gravado igual ao arquivo nos dois bancos. Testes: `supabase/tests/work_update_integration.sql` (novo), a extensão de `supabase/tests/rls_non_interference.sql`, os ajustes de `institutional_result_dependencies.sql` (seções 4 e 5: o resultado recalculado passa a valer na adoção) e de `work_continuation_commands.sql` (uma candidata agendada passa a poder ser recusada sozinha), o teste de duas sessões `scripts/ci/test-work-update-integration-concurrency.py` (no job de banco), os testes unitários do modelo e do componente da seção Atualizações, a jornada nova `apps/web/e2e/work-update-integration.spec.ts` e o ajuste da jornada `institutional-setup.spec.ts`. Nenhuma tabela, coluna ou RPC pública nova; `apps/web/src/types/database.ts` não muda.

## O que estava aberto, medido em `main`

1. `adopt_work_update_v1` só adotava candidatas de execução: uma atualização só com resultados institucionais falhava com `work_update_result_missing` e ficava `ready` para sempre; uma mista adotava só as execuções.
2. Recusar uma atualização ou uma candidata não parava o que o worker já tinha na fila: a execução de uma candidata agendada ainda gravava resultado, e o recálculo institucional agendado ainda rodava e substituía o resultado anterior.
3. O pedido `user_followup` ficava `open` para sempre.
4. Uma mudança que chega em vários eventos deixava atualizações incorporadas soltas em Anteriores.
5. O aprovar e calcular travava a linha do projeto `for update` e, no passo do grafo, a trava da obra; o planejador e a liquidação seguram a trava da obra e depois pedem a linha do projeto `for key share` nas checagens de chave estrangeira. Medido com duas sessões numa réplica de `main`: com o planejador primeiro, o passo do grafo morre em impasse (40P01), é contido e a aprovação cai no cálculo por mensagem. A trava `for update` não vinha só do comando: as duas funções de revisão que ele chama na mesma transação (`review_institutional_configuration_v1` e `review_institutional_configuration_before_sources_v1`) travavam a mesma linha `for update` de novo.

## 1. A adoção cobre todo dependente

**O resultado institucional ganha marco de resultado.** A visão única de mapeamento do incremento 2 (`private.work_milestone_sources_v1`) ganha um ramo: todo resultado institucional concluído tem o seu marco `execution_result` de sujeito `institutional_model_result`, gravado na transação que o conclui (gatilho `institutional_results_milestone`, por `write_work_milestone_v1`), com autor quem pediu o cálculo, momento o da produção e impressão digital a do artefato. O preenchimento do incremento 2 (`backfill_work_milestones_v1`, idempotente) roda no fim da migração e escreve o marco de cada resultado concluído que já existe. Assim `update_adopted` referencia resultados das duas espécies pelo mesmo mecanismo, e o registro de marcos que a conversa lê continua com o mesmo contrato (um resultado não referencia nada).

**Adotar é o único ato que torna atual um resultado recalculado.** O gatilho de supersessão das revisões canônicas (`institutional_result_supersedes`) passa a valer só para o resultado que uma pessoa pediu: um resultado de candidata conclui sem substituir nada. `adopt_work_update_v1` (redefinida, presa ao md5 do corpo anterior) adota numa só decisão as candidatas liquidadas de execução e as institucionais: `update_adopted` referencia os resultados novos (execuções, depois o modelo, na ordem das candidatas) e depois os que eles substituem (os resultados das execuções cobertas e os resultados institucionais que cada candidata cobre). Na mesma transação, cada resultado institucional adotado marca como anterior (`superseded_by`) os resultados que a candidata cobre e todo resultado concluído mais antigo de outra revisão canônica, o mesmo invariante que a conclusão aplicava. Uma atualização só com dependentes institucionais é adotada normalmente.

**O que a visão institucional mostra como atual.** Um resultado é estabelecido quando uma pessoa o pediu (pela mensagem do cálculo) ou quando é o recálculo de uma candidata liquidada cuja atualização foi adotada (`private.institutional_result_established_v1`). A leitura de resultados (`read_institutional_model_results_v1`, o portão de download) toma como atual o resultado estabelecido mais novo, e as comparações só entre estabelecidos; o histórico de revisões (`read_project_revision_history_v1`) marca como atual só um estabelecido. Antes da adoção, o resultado anterior continua o atual: se a aprovação moveu a configuração, ele aparece como desatualizado e sem download; o recálculo fica gravado com o seu marco, visível na seção Atualizações como pronto para adoção, e nunca é atual. Depois da adoção, o recálculo é o atual e o anterior fica guardado, legível, apontando para ele em `superseded_by` e referenciado pelo marco de adoção. Um recálculo recusado ou substituído nunca passa a atual.

Consequência no produto: o aprovar e calcular de uma obra que já tem resultado passa pelo grafo (5A) e, desde este incremento, o cálculo novo passa a valer quando a pessoa adota a atualização. A jornada `institutional-setup.spec.ts` adota antes de conferir o segundo resultado. O controle de frescor do caso (5A) conta o resultado anterior como desatualizado até a adoção, não mais até a conclusão do recálculo.

## 2. Recusar interrompe o que recusa

`decline_work_update_v1` (redefinida, presa ao md5) recusa uma atualização `open`, `awaiting_authorization`, `scheduled` ou `ready`, ou uma candidata sozinha: esperando autorização (execução) ou agendada (execução ou institucional; o id de candidata é procurado nas duas tabelas). O que ela recusa termina `declined` com o motivo da pessoa e uma `decision` rejeitada; a de uma candidata agendada não referencia nada (a candidata fica fora do registro) e tem sujeito `work_recompute_candidate` ou `institutional_recompute_candidate`. A recusa de uma atualização libera também os bloqueios institucionais.

Os jobs vivos (`queued`, `leased`, `awaiting_approval`) do que ela recusa são cancelados pelo caminho da varredura de autoridade: status `cancelled`, capability, lease e `leased_by` limpos, `last_error` `{"reason":"person_declined"}`, e o run `cancelled` com o mesmo motivo quando não sobra job vivo nele. Os jobs são os da execução que uma candidata agendada de execução produziu e o job `agent_operation_brief` da candidata institucional. A candidata é recusada antes de o job ser cancelado, então os gatilhos de liquidação do 3B e do 5A a encontram fechada e não fazem nada.

**A corrida com o worker.** Todo caminho do worker que grava um resultado ou encerra um job segura a linha do job antes de pedir a linha do projeto ou a trava da obra (o commit da execução, a gravação e a conclusão do resultado institucional, a falha de um job). A recusa segue a mesma ordem: sem trava nenhuma, confere a autoridade; trava as linhas dos jobs que vai parar; só então a linha do projeto e a trava da obra; e, já com a trava da obra, trava sem esperar (`nowait`) um job que tenha aparecido no meio (uma execução que o worker submeteu), recusando com `work_update_job_busy` se ele estiver ocupado, para a pessoa repetir. Assim os dois lados nunca formam ciclo e um deles vence:

- worker primeiro: o resultado gravado antes da recusa fica gravado, com o seu marco, e nunca é adotado nem atual; a candidata de execução já liquidada não é recusada sozinha (`work_update_candidate_not_waiting`), a atualização pode ser recusada inteira; a candidata institucional ainda agendada é recusada e o job, cancelado antes da conclusão;
- recusa primeiro: o job está cancelado quando o worker chega; a gravação e a conclusão do resultado institucional recusam com `job_capability_invalid` e o commit da execução com `execution_lease_denied`, e nada é gravado depois da recusa.

## 3. Uma continuação termina

`private.work_followup_executions` (nova, privada, imutável, fechada a todos os papéis de API) guarda a execução a que a continuação levou e a base de que ela parte (marco, decisão e revisão, copiados do pedido). O escritor é um gatilho na gravação do snapshot de entrada de uma execução, na transação do pedido da execução: quando quem pede é a pessoa da própria sessão (uma recomputação que o worker submete em nome de alguém nunca cumpre uma continuação) e um dos objetivos do pedido cita o texto de uma continuação da mesma obra, sem diferença de espaços ou maiúsculas.

Estados:

| De | Para | Quando |
|---|---|---|
| `open` | `scheduled` | a próxima execução pedida por uma pessoa na mesma obra cita a continuação; a ligação guarda a base |
| `scheduled` | `scheduled` | a execução ligada terminou sem resultado e uma execução nova cita a continuação: a ligação nova passa a valer |
| `scheduled` | `ready` | a execução ligada grava o seu resultado (gatilho no recibo de resultado, sob a trava da obra) |
| `ready` | `adopted` | uma pessoa adota o resultado como base (`adopt_work_update_v1` com o id da continuação): `update_adopted` referencia o marco do resultado e a base de que a continuação partiu, que ele substitui; o rótulo é o texto da continuação. Recusado com `work_continuation_base_superseded` se outra decisão já substituiu essa base |
| `open`, `scheduled`, `ready` | `declined` | uma pessoa recusa com motivo (`decline_work_update_v1`), com `decision` rejeitada que referencia a proposta; a execução pedida pela pessoa não é cancelada, é um pedido dela |

Na seção Atualizações, as continuações aparecem com o texto, a base, a execução e as ações de adotar como base e recusar.

## 4. Atualizações incorporadas

O modelo da seção (`workUpdatesModel`) mostra dentro da atualização que a cobre uma atualização substituída porque uma atualização mais antiga já cobre a sua mudança (o planejador do 3B a aponta para essa mais antiga): as mudanças dela entram em O que mudou da que cobre, que diz quantas foram incorporadas, e ela não aparece em Anteriores. Uma atualização substituída por uma mais nova continua em Anteriores. A leitura do banco ganhou, só em chaves novas, os dependentes institucionais (espécie, candidata, fatos e bloqueios de cada resultado), as candidatas institucionais e o detalhe das continuações; um leitor da forma anterior lê igual.

## 5. Uma ordem de travas para a aprovação

O comando de aprovar e calcular e as duas funções de revisão que ele chama travam a linha do projeto `for no key update`, como os comandos do incremento 4 (três patches de texto, cada um com agulha única e exceção nomeada: `institutional_calculation_lock_contract_changed` e `institutional_review_lock_contract_changed`). A trava ainda conflita com o `for update` dos turnos e do pedido de execução e deixa passar as checagens `for key share` do planejador e da liquidação. O passo do grafo (`institutional_approval_through_graph_v1`, redefinido e preso ao md5) passa a não deixar rastro quando não enfileira o resultado da própria aprovação: o efeito e toda trava que ele tomou voltam com a subtransação, e a fila de eventos aplica o evento depois, como quando o passo falha. O cálculo por mensagem que vem em seguida trava a linha do projeto `for update` pelo turno que posta; sem trava de obra segura nesse ponto, essa troca de modo não fecha ciclo com um planejador que espera a trava da obra.

Prova com duas sessões reais (`test-work-update-integration-concurrency.py`): aprovação e planejador na mesma obra, nas duas ordens, terminam sem 40P01 e a aprovação enfileira o recálculo pelo grafo. Rodado numa réplica de `main` sem esta migração, o mesmo teste falha na primeira ordem: o passo do grafo morre em 40P01 e a aprovação cai no cálculo por mensagem. O mesmo teste prova a recusa e o worker nas duas ordens, com o job disputado.

## Objetos e escritores

- `private.work_followup_executions`: gatilho `execution_input_snapshots_work_followup`.
- `public.work_milestones`: marco `execution_result` de `institutional_model_result` (gatilho `institutional_results_milestone` e preenchimento); `update_adopted` de continuação e `decision` de recusa de candidata agendada e de continuação (comandos do incremento 4, redefinidos).
- `public.work_continuation_requests`: `user_followup` passa a `scheduled` e `ready` pelos dois gatilhos novos e a `adopted` e `declined` pelos comandos.
- `private.institutional_model_results.superseded_by`: a adoção, para os recálculos; a conclusão, para os resultados pedidos por pessoa.
- `public.processing_jobs` e `public.processing_runs`: a recusa cancela, com `person_declined`.
- Funções novas, fechadas a todos os papéis de API: `project_institutional_result_milestone_v1`, `institutional_result_established_v1`, `work_followup_citation_v1`, `fulfil_work_followups_v1`, `advance_work_followups_v1`, `work_update_declinable_jobs_v1`, `lock_new_declinable_jobs_v1`, `cancel_declined_jobs_v1`.
- Redefinições presas ao md5 de `prosrc` (conferido no início da migração): `adopt_work_update_v1`, `decline_work_update_v1`, `work_update_view_v1` e `institutional_approval_through_graph_v1`. Patches de texto com agulha única: `review_institutional_configuration_and_calculate_v1`, `review_institutional_configuration_v1`, `review_institutional_configuration_before_sources_v1`, `read_institutional_model_results_v1` e `read_project_revision_history_v1`. Visão substituída com a definição anterior conferida pelo conteúdo: `work_milestone_sources_v1`. Gatilho recriado depois de conferido: `institutional_result_supersedes`.
- Identificadores: os marcos dos comandos seguem `work_command_milestone_id_v1` (UUID versão 5); as linhas novas usam `gen_random_uuid`. Nenhum id derivado por md5.

## Limites e riscos

- A tela de resultados do modelo não diz que um recálculo espera adoção: mostra o resultado anterior como desatualizado e manda revisar e calcular de novo, enquanto a seção Atualizações mostra a atualização pronta. O ajuste do texto é da superfície do 5B.
- A continuação é cumprida por citação textual: a pessoa precisa repetir o texto como objetivo do pedido de execução. A tela de execuções ainda não oferece o pedido a partir da continuação.
- Uma recusa pode ser recusada com `work_update_job_busy` se o worker estiver com um job novo naquele instante; a pessoa repete.
- Um recálculo recusado que já tinha gravado o resultado continua vivo para o planejamento (é o mais novo da linhagem), como uma execução recalculada e recusada no 3B: uma mudança seguinte o recalcula a partir dele e a adoção seguinte o marca como anterior.
- O passo do grafo de uma aprovação ainda pode esperar a trava de outra obra que a fila de eventos esteja planejando; esse impasse, entre obras diferentes, fica contido na subtransação do passo, como o 5A registrou.
- `supabase db lint` depende do plpgsql_check da pilha local, que não roda sem Docker nesta máquina; o passo roda no job de banco da CI.

## Aplicação

1. Aplicar a migração em staging e depois em produção. Ela para com erro nomeado se um corpo divergir: os pinos de md5 (`work_update_adoption_contract_changed`, `work_update_decline_contract_changed`, `work_update_view_contract_changed`, `institutional_approval_graph_contract_changed`), as conferências de visão e gatilho (`work_milestone_sources_contract_changed`, `institutional_result_supersession_contract_changed`) e os patches de texto (`institutional_result_reader_contract_changed`, `institutional_revision_history_contract_changed`, `institutional_calculation_lock_contract_changed`, `institutional_review_lock_contract_changed`). Define `lock_timeout` de 5 segundos. O preenchimento imprime quantos marcos gravou (um por resultado institucional concluído).
2. Renomear o arquivo para o carimbo registrado; recapturar dos bancos aplicados os cinco corpos efetivos tocados por texto (o snapshot desta PR veio de uma réplica local descartável de todas as migrações, Postgres 18, cujos 86 corpos anteriores são iguais ao snapshot): `review_institutional_configuration_and_calculate_v1`, `review_institutional_configuration_v1`, `review_institutional_configuration_before_sources_v1`, `read_institutional_model_results_v1` e `read_project_revision_history_v1`; conciliar inventário e catálogos da etapa 0 (uma tabela privada, oito funções e seis gatilhos novos, três deles na tabela nova, o gatilho recriado, a visão substituída e as redefinições) e os journals; rodar os advisors. Os tipos da web não mudam.
3. Merge desta PR depois da aplicação: a web nova lê as chaves novas da leitura das atualizações (com valores padrão, então também lê a forma anterior) e a jornada do modelo institucional adota o recálculo. O robô não muda.
