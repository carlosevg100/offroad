# Etapa 18, incremento 6A: saúde da recomputação e seus alarmes como configuração revisada

Migração `supabase/migrations/20260926180000_dependency_recompute_health.sql` (carimbo provisório; o lead renomeia o arquivo para o carimbo registrado na aplicação). Testes: `supabase/tests/dependency_recompute_health.sql`, a extensão de `supabase/tests/rls_non_interference.sql`, `apps/document-worker/src/dependency-recompute-health.test.ts`, `apps/document-worker/src/runtime-schema.test.ts`, `scripts/ci/test-event-outbox-alarms.py` e o passo de CI `Dependency recompute through the worker loop, once, against the local stack`, que agora também exige uma linha `recompute.health`.

## Por que

Uma candidata de recomputação pode ficar em `scheduled` sem nenhuma linha de erro: o loop do robô para de reivindicar, um lease vence repetidas vezes porque o robô morre no meio, a execução que a candidata produziu nunca liquida, ou o job de uma recomputação institucional nunca termina. A linha 13 do registro de riscos anotava que esse caso não tinha alarme e o atribuía à etapa 18/6. Em 25/09/2026 existiam cinco alarmes em produção, todos `OK` e com ações no tópico SNS `offroad-outbox-alerts`; o quinto, `offroad-recompute-errors`, tinha sido criado no console e não estava em nenhum arquivo revisado.

## Objetos e escritores

- `private.dependency_recompute_health_v1()`: o leitor. `security definer`, `search_path` vazio, fechado a todos os papéis de API. Lê `public.work_recompute_candidates`, `public.institutional_recompute_candidates` e `private.work_recompute_leases` e devolve quatro inteiros não negativos, somados sobre todas as organizações; nenhum identificador e nenhum valor de tenant saem do banco.
- `private.worker_dependency_recompute_health_v1(text)`: o núcleo do robô. `security definer`, exige o robô de recomputação exatamente como a reivindicação do 3B, por `private.require_recompute_worker_v1` (conta viva e token ativo ligado à conta que entrou), e chama o leitor. Executável só por `authenticated`.
- `public.worker_dependency_recompute_health_v1(text)`: a entrada do robô, `security invoker` sobre o núcleo, executável só por `authenticated`.
- A capacidade `dependency-recompute-health.v1` em `public.worker_runtime_schema_contract_v1()`, por patch de texto com agulha única (`"dependency-recompute.v1"]'::jsonb`) e exceção nomeada `dependency_recompute_health_capability_contract_changed`, como o 3B fez para `dependency-recompute.v1`. O corpo efetivo foi atualizado em `docs/build/schema-history/effective-function-bodies/`.
- Nenhuma tabela, nenhum índice e nenhum escritor novo. As três funções são voláteis de propósito: a ligação do robô atualiza o último uso do token e trava a linha da conta, e uma transação só de leitura recusaria isso.

## Os quatro números

| Número | O que conta |
| --- | --- |
| `scheduledCount` | candidatas de execução (3B) e institucionais (5A) em `scheduled` |
| `oldestScheduledSeconds` | agora menos o menor `updated_at` entre elas, em segundos inteiros; 0 sem nenhuma |
| `expiredLeaseCount` | candidatas de execução em `scheduled` sem a sua execução cujo lease venceu depois de pelo menos uma tentativa |
| `awaitingAuthorizationCount` | candidatas de execução esperando uma pessoa (incremento 4); só informação |

## A idade de uma candidata agendada

A idade é medida a partir de `updated_at`. As duas máquinas de estado só andam para a frente, toda escrita incrementa a revisão e passa pelo gatilho `set_updated_at`, e uma candidata agendada só é gravada quando entra em `scheduled` (inserida com orçamento zero pelo planejador do 3B ou do 5A, ou autorizada a partir de `awaiting_authorization` pelo incremento 4) e mais uma vez quando o que ela produziu é anexado (3B: a execução, pela submissão do robô; 5A: o resultado enfileirado, na mesma transação que a insere, então ali `updated_at` é igual a `created_at`). Os escritores de ambas as tabelas foram conferidos nas migrações do 3B, do 4 e do 5A; nenhum grava uma candidata agendada sem transição ou anexo. Assim `updated_at` é o momento em que a candidata entrou na espera em que está agora: a reivindicação e produção pelo loop do robô, ou a liquidação da execução ou do job que ela produziu.

`created_at` contaria também o tempo em que uma candidata do 3B esperou uma pessoa em `awaiting_authorization`, que não é atraso da recomputação, e dispararia o alarme de atraso no instante em que alguém autorizasse uma candidata antiga. O lease mora em tabela própria e nunca toca a candidata, então um lease que vence de novo não zera a idade. O teste SQL prova as duas coisas: autorizar uma candidata que esperou dez dias acrescenta uma agendada sem idade de dez dias, e um segundo lease vencido mantém a idade de uma hora. Uma variante do leitor com `created_at` falha no teste.

## Plano de consulta

Medido numa réplica local descartável (Postgres 18, todas as migrações), com 500 000 candidatas de execução em 2 000 organizações (20 agendadas, 5 delas com execução, 10 esperando pessoa, leases em todas as de orçamento zero) e 100 000 institucionais (5 agendadas), depois de `analyze` (plano resumido):

```
Result (actual time=3.233..3.240 rows=1.00 loops=1)
  Buffers: shared hit=2560
  CTE scheduled
    ->  Parallel Append
          ->  Index Scan using work_recompute_candidates_work_idx on work_recompute_candidates c (rows=20.00)
                Index Cond: (state = 'scheduled'::text)          Buffers: shared hit=1093
          ->  Index Scan using institutional_recompute_candidates_work_idx on institutional_recompute_candidates c_1 (rows=5.00)
                Index Cond: (state = 'scheduled'::text)          Buffers: shared hit=308
  InitPlan 4 (leases vencidos)
    ->  Nested Loop (rows=15.00)
          ->  Index Scan using work_recompute_candidates_schedulable_idx on work_recompute_candidates c_2   Buffers: shared hit=16
          ->  Index Scan using work_recompute_leases_pkey on work_recompute_leases l (loops=15)          Buffers: shared hit=60
  InitPlan 5 (esperando pessoa)
    ->  Index Only Scan using work_recompute_candidates_work_idx on work_recompute_candidates c_3 (rows=10.00)   Buffers: shared hit=1083
Execution Time: 3.260 ms
```

Sem paralelismo, a chamada da função leva 6,6 ms (3 693 buffers em cache). Os índices existentes `(organization_id, work_id, state)` atendem a condição só em `state` percorrendo o índice inteiro (8,6 MB para a tabela de 217 MB); a varredura sequencial forçada leva 36,5 ms. Os leases vencidos usam o índice parcial da reivindicação e a chave primária do lease. Uma leitura a cada 30 segundos nesse tamanho não pede índice novo, e nenhum foi criado. Quando a tabela passar de alguns milhões de linhas, um índice parcial `where state in ('scheduled','awaiting_authorization')` deixaria a leitura proporcional ao que está ativo. O plano de produção (Postgres 17) deve ser conferido com `explain` depois da aplicação.

## Robô

- O loop de recomputação roda uma volta a cada 5 segundos, com até 10 candidatas (`runDependencyRecomputePass` em `apps/document-worker/src/dependency-recompute.ts`). Antes de cada reivindicação, ele lê a saúde se já passaram 30 segundos desde a última tentativa; a primeira leitura acontece no boot, e uma leitura que falha também conta, para que uma entrada quebrada seja tentada a cada 30 segundos e não a cada volta.
- Cada leitura registra `recompute.health` com os quatro números. Quando `oldestScheduledSeconds` passa de 1800 ou `expiredLeaseCount` passa de zero, registra também `recompute.backlog.failed` com os mesmos números.
- Erro de RPC, falha de transporte ou resposta fora do contrato estrito (chave a mais, número faltando, negativo, fracionário ou em texto) registram `recompute.poll.failed` com `reason: "health_failed"`, sem detalhe; a volta continua e reivindica.
- O robô declara `dependency-recompute-health.v1` entre as capacidades exigidas: uma imagem que lê a saúde nunca sobe contra um banco sem ela.
- As linhas carregam só números. `recompute.health` é nível `info`: com `LOG_LEVEL` acima disso, as linhas somem e o alarme de heartbeat dispara, o que é o desejado.

## Alarmes como configuração revisada

`apps/document-worker/monitoring/dependency-recompute-alarms.json` tem o formato do arquivo do outbox, mais uma amostra sintética por filtro e uma descrição por arquivo. Todos no grupo `/ecs/offroad-document-worker`, namespace `Offroad/DocumentWorker`, período de 60 segundos.

| Filtro | Padrão | Métrica | Valor |
| --- | --- | --- | --- |
| `offroad-recompute-heartbeat` | `{ $.event = "recompute.health" }` | `RecomputeHeartbeat` | 1 |
| `offroad-recompute-oldest-scheduled` | `{ $.event = "recompute.health" }` | `RecomputeOldestScheduledSeconds` | `$.oldestScheduledSeconds` |
| `offroad-recompute-expired-leases` | `{ $.event = "recompute.health" }` | `RecomputeExpiredLeaseCount` | `$.expiredLeaseCount` |
| `offroad-recompute-errors` | `{ $.event = "recompute.poll.failed" }` | `RecomputeErrors` | 1 |

| Alarme | Regra | Dados ausentes | O que cobre |
| --- | --- | --- | --- |
| `offroad-recompute-heartbeat-missing` | soma menor que 1, 3 de 3 | `breaching` | nenhuma linha de saúde por três minutos: robô parado, loop preso numa volta longa, leitura sempre falhando, `LOG_LEVEL` acima de `info` |
| `offroad-recompute-backlog` | máximo maior que 1800, 2 de 2 | `missing` | candidata de execução ou institucional em `scheduled` há mais de 30 minutos na espera em que está: loop que lê mas não reivindica, lease que vence sem esgotar as tentativas, execução produzida que não liquida, job institucional que não termina |
| `offroad-recompute-expired-leases` | máximo maior que 0, 1 de 1 | `missing` | lease de candidata sem execução vencido depois de uma tentativa e ainda não retomado: robô que morreu ou perdeu a resposta no meio |
| `offroad-recompute-errors` | soma maior que 0, 1 de 1 | `notBreaching` | falhas de transporte do loop e da leitura de saúde; igual ao medido em produção |

O que nenhum cobre:

- Candidata que termina `failed` ou `declined`, inclusive `recompute_attempts_exhausted` depois de cinco leases vencidos: o fim fica registrado no banco e o pedido anda, sem alarme. Um robô que morre sempre na mesma candidata esgota as tentativas em cerca de dez minutos (cinco leases de 120 segundos); ele só aparece no alarme de leases vencidos se uma leitura cair entre o vencimento e a nova reivindicação (até cerca de 5 segundos num robô que roda), ou no heartbeat se o robô ficar parado três minutos. A leitura antes de cada reivindicação é a posição que mais vê esses vencimentos, mas a contagem é amostral.
- Espera por pessoa: `awaitingAuthorizationCount` é só informação, e bloqueios (`private.dependency_recompute_holds`, `private.institutional_recompute_holds`) não são candidatas e não têm prazo.
- Qual organização: os números são globais por desenho; a investigação continua no banco.
- Entrega: o script nunca cria ações. Os três alarmes novos nascem sem ações até o lead ligar o tópico `offroad-outbox-alerts`; `offroad-recompute-errors` mantém as que tem.

## Script de configuração

`scripts/ci/configure-event-outbox-alarms.py` recebe o arquivo como argumento (padrão: o arquivo do outbox, então o uso existente não muda), testa cada filtro contra a amostra que o próprio arquivo declara, usa a descrição do arquivo e deriva dele o prefixo dos nomes. Antes de qualquer chamada à AWS, recusa arquivo inconsistente (filtro sem amostra, amostra sem o evento ou sem o valor, alarme de métrica que nenhum filtro produz, nome fora do prefixo). Os limites continuam: não cria credenciais, não mexe em IAM, não envia notificação e preserva as ações de um alarme existente. O arquivo do outbox ganhou as amostras que o script tinha fixas e a descrição que ele já gravava, então reaplicá-lo não muda nada instalado. O workflow `Event outbox monitoring` passou a oferecer a escolha do arquivo, com o do outbox como padrão.

## Tipos gerados

`apps/web/src/types/database.ts` ganha `worker_dependency_recompute_health_v1` (argumento `p_worker_token`, retorno `Json`), porque a entrada é pública e o gerador a incluiria; as funções privadas não entram nos tipos.

## Aplicação

1. Migração primeiro, em staging e depois em produção: a capacidade precisa existir antes do robô. Se o corpo de `worker_runtime_schema_contract_v1` divergir, ela para com `dependency_recompute_health_capability_contract_changed`. Depois: renomear o arquivo para o carimbo registrado, recapturar de staging e de produção o corpo efetivo de `worker_runtime_schema_contract_v1` (o snapshot veio da réplica local), conciliar inventário e catálogos da etapa 0 e os journals, rodar os advisors e conferir o plano da leitura.
2. Robô depois: a imagem nova exige `dependency-recompute-health.v1` e não sobe contra banco sem ela. Conferir no grupo de logs uma linha `recompute.health` por volta de 30 segundos.
3. Alarmes por último, só com `recompute.health` já chegando (o heartbeat trata ausência como violação): com sessão AWS autorizada, `python3 scripts/ci/configure-event-outbox-alarms.py apps/document-worker/monitoring/dependency-recompute-alarms.json --apply`, que instala e verifica; ligar ações de alarme e de retorno ao normal no tópico `offroad-outbox-alerts` nos três alarmes novos; verificar de novo sem `--apply`; registrar estados e ações no registro de riscos.

Reversão: reimplantar a imagem anterior do robô (ela ignora a capacidade a mais); só depois disso, se preciso, remover as três funções e devolver o corpo anterior do contrato; apagar os três filtros e os três alarmes novos. `offroad-recompute-errors` fica como estava, com a descrição do arquivo.
