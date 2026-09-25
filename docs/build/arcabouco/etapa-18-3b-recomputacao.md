# Etapa 18, incremento 3B: recomputação delimitada das execuções afetadas

Migração `supabase/migrations/20260926100000_work_dependency_recompute.sql` (o carimbo definitivo é o que o executor registrar ao aplicar; ele fica depois do carimbo de produção do 3A, `20260925180927`). Testes: seções 13 a 30 de `supabase/tests/work_continuity_dependencies.sql`, a extensão de `supabase/tests/rls_non_interference.sql`, o teste de duas sessões `scripts/ci/test-dependency-recompute-concurrency.py` (dois workers disputando uma candidata, no job de banco), o ajuste de `supabase/tests/platform_operator_identity.sql` (novo chamador do núcleo com sujeito explícito) e, em `packages/work-plan`, o vetor de paridade da chave de recomputação e os testes do plano por linhagem. A composição compartilhada entre web e worker e o módulo `apps/document-worker/src/dependency-recompute.ts` vêm numa segunda PR, sobre esta; até o worker novo ser implantado, nada chama as RPCs novas e as candidatas de custo zero ficam agendadas sem execução.

Uma candidata recomputada é só candidata: nenhum resultado, decisão ou marco de resultado é reescrito aqui, e a adoção é o incremento 4.

## Objetos e escritores

- `public.work_recompute_candidates`: uma candidata por organização, trabalho e `dependencyRecomputeKey`, com a execução raiz, a identidade das cabeças (`head_inputs`, no formato `continuation-input-identity.v1`) e seu fingerprint, a ação, o orçamento, as execuções cobertas, o pedido que atende e, quando produzida, a execução. Estados `awaiting_authorization`, `scheduled`, `settled`, `declined` e `failed`, só para a frente; identidade imutável; nada é apagado. Leitura com a mesma autoridade de `public.work_milestones`; sem escrita de cliente. Escritores: o planejador do efeito de dependência, as RPCs fechadas do worker e os gatilhos de liquidação.
- `private.execution_lineage`: uma linha por execução recomputada, com a raiz e a candidata, gravada na transação que cria a execução. A raiz nunca é uma recomputação. Imutável e fechada a todos os papéis de API. Escritor: a submissão do worker.
- `private.dependency_recompute_holds`: os bloqueios de execuções afetadas de um pedido aberto, com o sinal que os libera; liberados uma vez. Fechada. Escritor: o planejador.
- `private.work_recompute_leases`: o lease do worker sobre uma candidata agendada (id, hash da capability, token, conta, validade, tentativas). Fechada. Escritores: as RPCs do worker.
- Marco `awaiting_human` em `public.work_milestones` (sujeito `work_recompute_candidate`, rótulo `dependency_recompute_authorization`, sem autor humano) para cada candidata com orçamento positivo.

## Planejamento

O efeito de dependência do 3A (`private.apply_dependency_event_v1`) passa a planejar, depois das fusões, cada trabalho da organização com pedido aberto; um sinal de liberação planeja os trabalhos que ele destrava. O plano segue `planDependencyRecompute`, linhagem por linhagem:

- Uma linhagem é a execução raiz e as recomputações que a nomeiam. A execução viva mais nova da linhagem (a de maior sequência de linhagem, a raiz por último) a representa. Se ela já usa as cabeças atuais, toda a linhagem é reaproveitada pelo hash; se o grafo dela está incompleto, a linhagem fica bloqueada até a reconstrução; se está afetada, a identidade atual dela define a chave da única candidata da linhagem, que cobre as execuções afetadas da linhagem no pedido. Assim uma linhagem nunca é recomputada duas vezes para as mesmas cabeças, mesmo quando a raiz e a recomputação fixaram conjuntos diferentes de insumos (um slot que a base ganhou, uma fonte que ela deixou de citar). `continuation.ts` recebeu o mesmo critério (`lineageOrder` opcional na execução e `executionId` opcional no registro da candidata), com testes.
- A identidade das cabeças e a chave são calculadas em SQL (`private.continuation_logical_key_v1`, `private.continuation_input_identity_v1`, `private.dependency_recompute_key_v1`, sobre o fingerprint canônico do 3A) com um vetor comum aos dois lados (`continuation-sql-parity.test.ts` e a seção 14 do teste SQL).
- Uma chave registrada em qualquer estado, de qualquer pedido, nunca é agendada nem posta a uma pessoa de novo.
- Orçamento zero: candidata `scheduled`, para o worker. Orçamento positivo: candidata `awaiting_authorization` com o marco `awaiting_human`, sem job e sem lease. O orçamento é o teto do perfil da representante, ou o maior entre ele e o do perfil da cabeça quando o método mudou.
- Candidatas abertas cujas chaves as cabeças atuais não produzem mais são substituídas (`declined` com motivo `superseded`), exceto a que já produziu a representante atualizada da linhagem. A espera nova de uma linhagem aponta `supersedes_milestone_id` para a espera da candidata substituída, como decidido no 3A.

## Bloqueios e sinais

Nenhuma candidata é produzida enquanto:

| Bloqueio | Condição | Sinal que libera |
|---|---|---|
| `derived_source_not_rederived` | a execução usou uma fonte só através de uma versão derivada, a fonte mudou e a cabeça da fonte derivada ainda não descende da versão nova | evento `source_version` da fonte derivada (produtor do 3A) |
| `basis_behind_source` | a fonte chegou à execução pela base de trabalho (observação ou definição adotada) e a revisão mais nova da base ainda não cita a versão nova | evento `assumption_version` do conjunto (produtor existente) |
| `source_not_bindable` | a versão nova de uma fonte fixada não tem bytes verificados ou direito vigente | verificação dos bytes ou direito registrado para a versão (gatilhos novos, na mesma transação) |
| `method_not_executable` | a release cabeça do procedimento não tem perfil executável | evento `method_release` do procedimento (publicação, pelo 3A; capacidade liberada e universal e perfil registrado, produtores novos) |
| `graph_incomplete` | o grafo da representante continua incompleto depois da reconstrução | o evento da chave em falta |

O bloqueio `basis_behind_source` não estava na lista do pedido: sem ele, todo balancete novo de um trabalho de capital viraria candidata antes da adoção das observações dele, e a recomputação fixaria de novo a versão antiga, com um resultado igual ao anterior apresentado como atualização. O sinal de fonte verificada toma o lock de bloqueios da organização de forma exclusiva e o planejamento o toma compartilhado, antes de qualquer lock de trabalho: um bloqueio gravado em paralelo é visto pelo sinal, ou a verificação é vista pelo planejamento. Uma falha do planejamento dentro do sinal nunca derruba a verificação nem o direito; o bloqueio fica, e o próximo evento de dependência da organização planeja de novo.

## Produção pelo worker

O banco não compõe contrato. Quatro RPCs fechadas, cada uma exige a conta do worker vinculada a um token ativo (`execution_account_user_id`):

- `worker_claim_dependency_recompute_v1`: toma o lock do trabalho, depois a candidata `scheduled` sem execução e seu lease; confere que as cabeças ainda produzem a chave; registra o lease (capability só devolvida a quem reivindicou) e devolve a candidata e o que a raiz pediu (pergunta, objetivos e data de referência do snapshot, situações do recibo de gates). Esgotadas as tentativas, a candidata falha com `recompute_attempts_exhausted`.
- `worker_dependency_recompute_basis_v1`: monta, para o solicitante original, a base de execução na revisão mais nova da base de trabalho que a chave cita, sob o procedimento da chave. Sem autoridade vigente, a candidata é recusada (`declined`, motivo `requester_not_authorized:<erro>`).
- `worker_submit_dependency_recompute_v1`: confere de novo a chave contra as cabeças; exige que o id do pedido seja a própria candidata, de modo que uma repetição nunca cria segunda execução; pede a execução para o solicitante original pelo caminho v2 completo (gates, registro da companhia, concessão do produtor, perfil único liberado e o núcleo `request_work_execution_as_subject_v1`, que reavalia a autoridade atual); exige que a execução nova fixe as cabeças da chave; grava linhagem e a execução da candidata na mesma transação. Solicitante sem autoridade: `declined` com o motivo. Recusa de gate ou de pino: `failed` com o código. Contrato velho ou janela de orçamento vencida sobem como erro, para o worker compor de novo.
- `worker_fail_dependency_recompute_v1`: registra uma recusa que o worker encontrou antes de submeter, só com códigos nomeados (os de gate e os de composição).

O caminho humano não muda. As funções `execution_contract_basis_v1`, `request_work_execution_producer_v1` e `request_work_execution_producer_v2` são lidas por texto e copiadas em variantes `_as_subject_` com o sujeito explícito e verificado como conta viva, no padrão da etapa 17. A única verificação que a base humana fazia pela sessão, a leitura da base de trabalho (`can_read_assumption_version_v1`), vira na variante a verificação que o próprio núcleo aplica a uma base fixada para um sujeito explícito: o trabalho legível para análise e cada decisão vigente (`execution_basis_current_v1`). Nenhum caminho automático chama modelo.

## Liquidação, falha e substituição do pedido

A execução de uma candidata que grava resultado liquida a candidata (gatilho no recibo de resultado). Job da execução em `failed`, `poison` ou `cancelled` sem resultado falha a candidata com `execution_<estado>` (gatilho na mudança de estado do job, inclusive quando a varredura de autoridade cancela). Os dois tomam o lock do trabalho antes da candidata.

Estados do pedido, dentro da máquina do 3A:

| De | Para | Quando |
|---|---|---|
| `open` | `awaiting_authorization` | sem bloqueio, alguma candidata própria espera autorização |
| `open` | `scheduled` | sem bloqueio, nenhuma espera, alguma candidata própria agendada |
| `open`, `scheduled` | `ready` | todas as candidatas próprias terminadas e ao menos uma liquidada; nenhuma decisão é escrita |
| `awaiting_authorization` | `scheduled`, depois `ready` | a espera some (autorização do incremento 4 ou substituição) e o resto terminou |
| `open`, `awaiting_authorization`, `scheduled` | `declined` | todas terminadas e nenhuma liquidada: recusadas por falta de autoridade do solicitante, falhas, ou uma mistura delas com substituídas que não seja só de substituídas |
| `awaiting_authorization`, `scheduled` | `superseded` | todas as candidatas próprias substituídas, apontando para o pedido aberto que as substituiu |
| `open` | `superseded` | o pedido não planejou nada próprio nem bloqueia nada: só repete mudanças que um pedido anterior já cobre; aponta para esse pedido |

Pedido aberto com bloqueio continua aberto e recebe as mudanças seguintes. Uma mudança nova com o pedido anterior fora de `open` abre pedido novo (um aberto por trabalho). O último caso da tabela evita pedidos abertos sem conteúdo: publicar uma release com perfil e capacidade são três eventos de uma mudança só. Nesse caso o pedido substituído aponta para o pedido anterior que já cobre a mudança, e não para um pedido mais novo, porque é nele que está o trabalho a fazer; a direção foi aceita na revisão de 25/09/2026.

Um pedido só fica `ready` quando alguma candidata foi liquidada, isto é, quando existe resultado novo para adotar. Sem nenhuma liquidada ele termina `declined`, e o motivo de cada candidata continua gravado nela.

## Evento de resultado de execução

Hoje nenhum resultado alimenta outra execução. O pedido de execução aceita só versões de fonte com bytes verificados, decisões de uma versão de premissas e a release do método; o único escritor de derivação de fonte (`add_source_dependency_v1`) liga versão de fonte a versão de fonte, por ato de uma pessoa; e nada grava fonte, observação ou decisão a partir de um recibo de resultado. Um resultado só chega a outra execução se uma pessoa adotar algo, e essa adoção já emite `adoption_decision` e `assumption_version`, que propagam. Por isso não há evento `execution_result` neste incremento; ele passa a ser necessário quando existir aresta de execução para execução.

## Perfil de capital

Todo perfil de execução armazenado tem teto zero de custo e de chamadas, por verificação de armazenamento (`validate_execution_profile_storage_v1`), e o contrato de execução exige orçamento zero. O perfil de capital liberado é compilado e determinístico. Toda candidata de hoje é de custo zero e roda sozinha; o caminho de orçamento positivo é provado com um perfil sintético gravado com a verificação desligada só no teste.

## Limites e riscos

- A composição de capital no worker exige que a raiz tenha sido pedida pelo caminho v2 (snapshot de capital e recibo de gates) e fixe uma única base de trabalho; execuções sem isso falham com código nomeado quando reivindicadas (`origin_unavailable`, ou `basis_unavailable` para a base não fixada). Essas linhagens não são recomputadas: só voltam a ter execução nas cabeças atuais quando uma pessoa pede a execução de novo.
- Candidatas de uma linhagem cujo grafo segue incompleto ficam bloqueadas sem prazo; os casos são os mesmos que o 3A registrou como inalcançáveis hoje.
- Um pedido cujas execuções afetadas deixaram de ser vivas sem candidata própria continua aberto até a próxima mudança.
- Com o solicitante suspenso, as candidatas do pedido são recusadas e o pedido termina `declined`, sem nada a adotar; o motivo fica em cada candidata para o incremento 4 mostrar.
- O sinal de fonte verificada serializa, por organização, a verificação de bytes e o registro de direitos de fontes usadas por execuções com o planejamento da organização.
- Não há justiça entre organizações na produção: a reivindicação toma a candidata agendada mais antiga de qualquer organização. Uma tarefa do worker da segunda PR produz cerca de uma candidata por segundo (na prova de CI dessa PR, meio segundo da reivindicação à submissão, com 63 hipóteses fixadas, e o loop faz até dez por volta com pausa de cinco segundos). Uma rajada de N candidatas de uma organização atrasa as das outras em cerca de N segundos por tarefa do worker; isso passa a importar a partir de algumas centenas de candidatas numa rajada, por exemplo uma release de procedimento que afete todas as linhagens de uma organização grande, o que deixa as outras esperando minutos. O volume de produção de hoje fica muito abaixo disso. A reivindicação examina as 16 candidatas mais antigas sem lease: se todas tiverem cabeças que já mudaram e ainda não foram substituídas (o evento da mudança ainda não foi aplicado, por exemplo com a linha da outbox bloqueada), as mais novas esperam o próximo planejamento.

## Aplicação

1. Aplicar depois da migração do 3A, em staging e depois em produção. A migração cria tabelas e funções, lê por texto três funções do produtor sem alterá-las e altera por texto `apply_dependency_event_v1`, `merge_dependency_update_request_v1` (ambas do 3A) e `worker_runtime_schema_contract_v1`; se um corpo divergir, ela para com `execution_basis_subject_contract_changed`, `execution_producer_subject_contract_changed`, `dependency_recompute_effect_contract_changed`, `dependency_update_lineage_contract_changed` ou `dependency_recompute_capability_contract_changed`.
2. Renomear o arquivo para o carimbo registrado; recapturar do banco aplicado os seis corpos efetivos novos ou alterados (o snapshot foi gerado de uma réplica local de todas as migrações); regenerar `apps/web/src/types/database.ts` (tabela pública nova e quatro RPCs públicas); conciliar inventário e catálogos da etapa 0 e os journals; rodar os advisors.
3. A segunda PR (composição compartilhada e worker) só é implantada depois: o worker novo exige a capacidade `dependency-recompute.v1`, que esta migração registra.
