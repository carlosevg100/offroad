# M2, parte 6: monitor do RG-01 com resolvedor interno (desenho, v5, aprovado)

Estado em 22/10/2026. Base: `M2-PLANO.md` (primeiro consumidor, decisões 4, 5, 6 e 8), ADR 0023 e o que as
partes 1 e 3 deixaram em produção (`20261021225124` a `20261022013753`). Reescrito depois de quatro rodadas
de revisão independente, com escopo reduzido de propósito ao que a parte 6 consegue provar. O transporte
continua fechado, nenhum consumidor é registrado e nenhum tenant recebe número: o monitor fica desligado
até a abertura (parte 4). Toda função nova roda em `READ COMMITTED` e entra na porta de autoridade de
mercado como primeira instrução, em modo compartilhado (nunca exclusivo).

## 0. Princípios e escopo

- **A avaliação é do banco, numa transação, sobre um retrato tirado numa única instrução.** O retrato é
  uma função `stable` em SQL; por isso tudo o que ela lê (seleção, reuniões, calendário, declaração)
  vem do mesmo snapshot da instrução. O avaliador em TypeScript é gêmeo para testes diferenciais com
  vetores comuns, não comparação em produção.
- **Eventos pedem, a reconciliação avalia.** A linha da outbox do monitor só registra um pedido de
  reavaliação e é concluída na hora (recibo, sem trava de regime, sem esperar avaliação). A avaliação roda
  fora do lease, pela reconciliação, que também cobre o que não passa pela outbox (comunicado tardio,
  calendário, declaração nova, prazo vencido, worker parado).
- **Verdade do gatilho separada da completude.** Uma alta comprovada dispara mesmo com outro trecho
  incompleto; conclusão negativa exige todas as reuniões decorridas comprovadas.
- **Fora do M2, registrado:** substituição do comprovante de uma reunião (comprovante revogado vira
  lacuna nomeada; recuperação governada no M3) e correção oficial da economia de uma reunião (a
  confirmação já recusa a divergência; o monitor a mostra como lacuna; resolução governada no M3).

## 1. Calendário do Copom

`private.market_copom_calendar_revisions(year, revision, meetings, evidence_url, evidence_sha256,
evidence_object_path, recorded_by, command_id, recorded_at)`: reuniões ordinárias do ano (ordinal, primeiro
e segundo dia), por comando de operador com recibo
(`record_market_copom_calendar_v1(command, year, meetings, evidence_url, evidence_bytes, reason, actor)`).
A página capturada vai para o bucket privado `market-reference` (`evidence/copom-calendar/<ano>/<revisão>.html`,
até 1 MiB) com o hash no registro. Vale a revisão mais alta do ano. O monitor exige calendário para todo
ano do início do ciclo declarado até D; ano sem calendário é lacuna `calendar_missing(ano)`. O calendário de
2026 é registrado na parte 4.

## 2. Reuniões

A economia da reunião (data, decisão, meta) continua imutável, fixada pela primeira aquisição do
comunicado (parte 1). Para o monitor, cada reunião R tem exatamente um estado, decidido nesta ordem (a
primeira condição verdadeira vence):

1. `disputed`: existe job de aquisição do comunicado de R terminado em falha com o código novo
   `meeting_disagreement`. Hoje o worker reduz `market_copom_meeting_disagreement` a `verification_failed`;
   a parte 6 acrescenta o código próprio à lista de falhas aceitas pelo banco e ao mapeamento do worker. O
   job guarda o contrato e o pedido (`{"meeting": R}`), e nada é apagado. A disputa prevalece sobre
   evidência antiga que concorde.
2. `unavailable`: comunicado de referência revogado ou ilegível (`market_acquisition_readable_v1`).
3. `missing`: reunião do calendário (ou extraordinária conhecida) sem comunicado adquirido.
4. `series_disagreement`: o dia anterior à mudança e o dia de mudança estão cobertos pela seleção e a série
   não confirma a decisão (direção ou meta diferentes). Cobre, por exemplo, uma versão em quarentena
   aprovada por exceção manual.
5. `corroborated`: o dia anterior e o dia de mudança estão cobertos e a série confirma a decisão.
6. `awaiting_series`: comunicado legível e algum dos dois dias ainda não coberto.

## 3. Seleção e retrato

`private.market_selic_selection_v1(D, K)` (`stable`): a seleção por período da 432 extraída da publicação,
que passa a usá-la. `private.market_rg01_snapshot_v1(D, K)` (`stable`, SQL, uma instrução) devolve o retrato
tipado: entradas da seleção (período, valor em decimal canônico, versão, aquisição), `lastCoveredPeriod`,
`manifestSha256` (`market-manifest.v1`, gêmeo SQL de `manifestSha256`, vetores comuns); reuniões relevantes
com estado (seção 2), decisão, meta, término, dia de mudança, prazo de frescor e os valores da série no dia
anterior e no dia de mudança; as reuniões da linha de base (as decisões declaradas) com o mesmo
tratamento; os pedidos pendentes do regime e gatilho visíveis na instrução (chaves); revisões de calendário usadas; declaração ativa (id, hash, regra); versão do
calendário de feriados e da regra de frescor. K é o instante fixado pelo executor e filtra tudo
(`recorded_at`, `acquired_at`, `reference_acquired_at` até K). Toda função lida abaixo do retrato é
`stable` e não toma trava; as travas são tomadas pelo executor antes da instrução do retrato.

## 4. Frescor (decisão 5, exata)

Reuniões relevantes: as ordinárias do calendário e as extraordinárias conhecidas por comunicado, com
término T ≤ D, a partir da primeira reunião depois da última decisão declarada. `prazo(R)` = o segundo dia
útil depois do primeiro dia útil estritamente posterior a T (feriados nacionais da normalização,
`market-freshness.v1`); o prazo vence à meia-noite de São Paulo que encerra `prazo(R)`. Frescor do
monitoramento em D: `stale` se alguma R com `prazo(R) < D` não está `corroborated`; `absent` sem nenhuma
observação; senão `current`. Não há regra diária adicional: entre reuniões a meta não muda, e o que importa
ao gatilho é cada reunião decorrida.

## 5. Avaliador (`market-rg01.v1`)

1. **Linha de base**: as decisões declaradas são conferidas com as reuniões da linha de base no retrato
   (cada uma `cut` em `corroborated`, na quantidade, no passo, da meta inicial à final e com a variação
   acumulada declaradas). Divergência vira `baseline_contradicted`,
   só informativa; não muda a declaração nem a promove.
2. **Alta comprovada**: o conjunto de testemunhas é toda R relevante com decisão `raise` e estado
   `corroborated`; se não é vazio, o resultado é `fired`, e a testemunha principal é a primeira em ordem.
   Sem testemunha e com alguma `raise` em `awaiting_series`, o resultado é `pending_confirmation`. A alta não precisa do
   passo declarado nem desfazer os cortes.
3. **Negativo**: `not_fired` só quando há calendário para todo ano do início do ciclo até D, toda R
   relevante, inclusive a de término em D, está `corroborated` e nenhuma é `raise` (sem nenhuma reunião
   relevante decorrida e com calendário completo, o resultado é `not_fired`; sem calendário, `incomplete`). Senão `incomplete` com as lacunas nomeadas (`calendar_missing(ano)`,
   `communique_missing(R)`, `series_pending(R)`, `series_disagreement(R)`, `communique_unavailable(R)`,
   `meeting_disputed(R)`).
4. Manutenção não dispara nem reinicia; corte depois de alta não apaga a alta.

## 6. Incidente

Identidade estável: `private.market_regime_incidents(regime_id, trigger_id, opened_at, opened_by_evaluation,
review_due_on, review_state)`, único por (regime, gatilho), aberto na primeira avaliação `fired`, com
`review_due_on` = quinto dia útil depois da abertura em São Paulo (`reviewDeadlineBusinessDays`). Testemunhas:
`private.market_regime_witnesses(regime_id, trigger_id, meeting, first_seen_evaluation)`; suporte por
testemunha em `private.market_regime_witness_support(regime_id, trigger_id, meeting, revision, evaluation_id,
support)`, só acrescentando, com `support` em `supported` (a reunião está `corroborated` e é `raise`) ou
`unavailable` (deixou de estar `corroborated`). Toda avaliação registra as testemunhas novas do conjunto e
atualiza o suporte de todas as testemunhas já registradas (inclusive as que saíram do conjunto, que passam a
`unavailable`). O suporte do incidente é `supported` se alguma testemunha está `supported`; senão
`unavailable`. Uma lacuna em outro trecho não muda nenhum suporte.

Estado de revisão e transições (comando de operador ou fundador com recibo,
`dispose_market_regime_incident_v1(command, regime, trigger, expected_revision, disposition, reason, actor)`).
O incidente tem `review_revision`, incrementada por toda disposição e por toda reabertura automática; o
comando só se aplica se `expected_revision` for a corrente, conferida sob a trava de regime (a mesma da
avaliação); o replay de um comando já aplicado devolve o recibo sem nova transição:
`open` → `review_opened` → `review_concluded`; `open` ou `review_opened` → `dismissed`. Uma testemunha nova
(outra reunião, registrada pela primeira vez como `supported`) depois de `dismissed` reabre para `open` com
novo prazo, inclusive quando a testemunha principal anterior continua `supported`, registrado
como transição automática com a avaliação que a causou. O responsável é o ator de cada disposição; a
política nomeia quem decide ("Head de Mercado e Distribuição") e a leitura mostra isso.

## 7. Execução

**Pedidos.** `private.market_rg01_requests(regime_id, trigger_id, key, requested_at, satisfied_by)`, com
unicidade em (regime, gatilho, chave): `event:<consumidor>:<sequência>` (linha da outbox), `hour:<AAAA-MM-DDTHH>` (São Paulo),
`deadline:<reunião>` (no primeiro instante depois do prazo de frescor de cada reunião relevante) e
`declaration:<id>` (ativação).

- `worker_run_rg01_event_v1(consumer, sequence, capability, lease)`: exige que o consumidor seja o do
  monitor (`handler = 'rg01'` sob a cerca do consumidor), mantém todas as cercas do lease (conta, token,
  delegação, capacidade e expiração depois da última escrita), grava o pedido e o recibo. Não avalia.
- A conclusão genérica `worker_complete_market_event_v1` recusa consumidor com tratador
  (`market_event_handler_required`); o tratador é atribuído no registro, por comando de fundador, e não
  muda depois.
- `worker_schedule_rg01_v1(token)`: insere, de forma idempotente, o pedido da hora corrente e os de prazos
  vencidos; exige delegação do token ao consumidor do monitor.
- `worker_evaluate_rg01_v1(token)`: exige a mesma delegação; tenta a trava exclusiva
  `market-regime:<regime>:<gatilho>` sem esperar (`pg_try_advisory_xact_lock`); ocupada, responde
  `busy` sem gravar. Com a trava: fixa K = `clock_timestamp()` e D (data de São Paulo de K), descobre as
  versões e aquisições candidatas e toma as âncoras de leitura e os estados de versão delas, lê o retrato
  numa instrução e confere que toda versão e aquisição usada pelo retrato está no conjunto travado; se
  alguma não está (confirmada entre a descoberta e o retrato), responde `retry` sem gravar nada e sem dar
  baixa em pedido, e o worker chama de novo; avalia, grava `private.market_regime_evaluations` (D, K, retrato completo,
  `auditSha256` do retrato, `stateSha256` do resultado semântico: declaração, resultado, testemunha,
  estados das reuniões, lacunas, frescor e entradas da seleção sem K) só quando `stateSha256` difere do
  último, atualiza testemunhas, suporte e incidente, e marca como satisfeitos exatamente os pedidos
  capturados no retrato, na mesma transação; um pedido confirmado depois da instrução do retrato continua
  pendente. Cada execução concluída grava um recibo de reconciliação
  (`private.market_rg01_runs`: instante, avaliação gravada ou reaproveitada pela deduplicação, chaves
  baixadas). Sem pedido pendente, não avalia.

Ordem de travas da avaliação: porta compartilhada, trava de regime (tentativa), âncoras de leitura e
estados de versão pela ajuda de leitura. A publicação e a religação não tomam a trava de regime; a
revogação toma a porta exclusiva antes de tudo e nunca a de regime. O worker roda agendamento e avaliação
num laço próprio, independente do laço de documentos e de aquisição.

## 8. Declaração do regime

`private.market_regime_declarations(id, policy_id, policy_version, regime_id, trigger_id, rule, projection_text,
projection_sha256, active, superseded_by)`. A projeção é só o que o RG-01 usa, extraída do valor da política:
`{policyId, policyVersion, regime, validFrom, easingCycle: {startedOn, fromPct, cuts, stepBps,
copomDecisions, effectiveNextDay, cumulativeBps}, selicTargetPct, trigger: {id, condition, action, scope},
reviewDeadlineBusinessDays, decidedBy}`, em texto canônico `market-policy.v1`: o `market-odbl.v1` com inteiros JSON permitidos (texto
decimal, sinal só negativo, sem zeros à esquerda); qualquer fração JSON é recusada, e a projeção não tem
nenhuma (`fromPct` é texto). Um teste do pacote recalcula a projeção e o hash do valor real da política e
falha se divergirem da migração; a migração também confere que meta inicial, passo, quantidade de cortes,
variação acumulada e meta final declaradas são coerentes entre si. Uma ativa por (regime, gatilho); a regra da declaração precisa ser
`market-rg01.v1` ou a avaliação recusa. Política nova entra por migração que, sob a trava de regime,
grava a nova declaração, supera a anterior e gera o pedido `declaration:<id>`. O status no registro de referência continua `draft`.

## 9. Leitura do operador

`market_regime_incident_v1(regime, trigger, actor)` (operador ou fundador): declaração (id, versão, hash,
`draft`, quem decide), incidente (estado de revisão, abertura, prazo, disposições com ator), testemunhas
com suporte corrente, reunião, datas, decisão, meta, comprovante (aquisição e hash) e valores da série
antes e depois, última avaliação (D, K, resultado, lacunas, frescor, `auditSha256`), pedidos pendentes,
linhas bloqueadas da outbox do monitor, última avaliação concluída e próximo prazo.

## 10. Testes

- Vetores comuns SQL e TypeScript: manifesto, `market-policy.v1` sobre a projeção real, frescor (prazo com
  feriado, reunião em véspera de feriado, extraordinária) e avaliador (manutenção, primeira alta, alta sem
  o passo, corte depois de alta, alta aguardando a série, comunicado ausente antes e depois do prazo,
  comunicado indisponível, reunião disputada, calendário ausente, linha de base contraditória).
- SQL: comunicado tardio sem evento (o pedido da hora reavalia), alta comprovada com outro trecho
  incompleto, testemunha que fica indisponível e outra que reafirma, segunda alta com a primeira ainda
  sustentada (registrada e reabrindo depois de dispensa), reunião no próprio dia D sem comunicado (sem
  negativo), divergência da série coberta, pedido confirmado durante a avaliação (continua pendente),
  disposição com revisão esperada antiga (recusada depois de dispensa e reabertura),
  deduplicação por `stateSha256`, recusa da conclusão genérica e da execução com consumidor sem o
  tratador, replay da linha, superfícies fechadas.
- Corridas: duas avaliações simultâneas (a segunda responde `busy`); confirmação de versão entre a
  descoberta das travas e o retrato, seguida de mudança de qualidade (a avaliação responde `retry`); versão confirmada durante a avaliação
  (fica para a próxima); revogação durante a avaliação; agendamento concorrente da mesma hora.
- Worker: laço sem consumidor, pedido e avaliação com cliente simulado.

## 11. Fora desta parte

Registro do consumidor e do tratador, delegação, calendário de 2026 e abertura: parte 4. Substituição de
comprovante, correção oficial de reunião, ação de revisão do regime e qualquer saída a tenant: M3.
