# M2 parte 2: agendador com delegação (ADR 0023)

Escopo: decisão 9 do `M2-PLANO.md`. O banco decide o que adquirir e quando; o worker chama a entrada de
disparo num laço próprio e processa os jobs pelo caminho existente (claim com alocação, lease, confirmação).
Nada abre nesta parte: sem agenda registrada, sem delegação ou com o transporte fechado, o disparo não cria
nada. Registro das agendas, delegações, aquisição inicial dos comunicados de âncora e abertura: parte 4.

Mudanças da v2 (revisão 1 do desenho): janela dentro do contrato e âncora documental como pré-condição;
lista e detalhes separados; protocolo de travas igual ao do monitor; enfileiramento interno por agenda;
identidade das ocorrências; data-base da seleção; estados terminais com orçamento; matriz de testes.
Mudanças da v3 (revisão 2): recuperação da série por tipo de achado da qualidade; bootstrap com prova da
janela inicial; descoberta sustentada por listas legíveis; lote de detalhes só com elegíveis; elegibilidade
temporal explícita; prazo de espera desde a porta; verificações do enfileirador existente.
Mudanças da v4 (revisão 3): decisão única sobre o conjunto de achados da qualidade, com precedência; evidência
nova relevante por período pendente; indisponibilidade de comunicado interno sem nova aquisição; conferências
no enfileirador comum (disparo e manual); conflito entre listas serializado por reunião.
Mudanças da v5 (revisão 4): evidência nova medida contra o conjunto de evidências da versão, não pelo instante
de aquisição; comprovante indisponível conferido antes de qualquer recuperação da série; a confirmação do
detalhe também confronta as listas legíveis.

## 1. Agenda

`private.market_acquisition_schedules(id, kind, source_id, contracts, params, local_time, business_days_only,
reason, granted_by, command_id, fingerprint, granted_at, revoked_at, revoked_by, revoke_command_id,
revoke_reason)`, com `kind` em `series_432` ou `copom_communiques`.

- `series_432`: `contracts = ['bcb-sgs-432-endpoint']`, `params = {"coverageStart": "AAAA-MM-DD"}`, não anterior
  ao recorte homologado.
- `copom_communiques`: `contracts = ['bcb-copom-comunicados-lista', 'bcb-copom-comunicados-detalhe']`
  (o detalhe é autorizado expressamente pela concessão), `params = {"size": n}` com n entre 10 e 100.

Todos os contratos de uma agenda são da mesma fonte (`source_id`), conferido no registro contra
`market_endpoint_contracts`. Índice único parcial: uma agenda ativa por `kind`. Concessão e revogação por
comando de fundador ou operador com recibo (`grant_market_acquisition_schedule_v1`,
`revoke_market_acquisition_schedule_v1`), replay pelo comando e recusa de reuso com conteúdo diferente; a
agenda é imutável exceto pelo preenchimento único da revogação (guarda por gatilho). O concedente precisa
continuar principal de plataforma vigente: se deixar de ser, o disparo responde `blocked: grantor_inactive`
e a agenda precisa ser concedida de novo.

## 2. Ocorrências

`private.market_schedule_occurrences(id, schedule_id, occurrence_key, contract_id, request, request_sha256,
job_id, worker_token_id, account_user_id, created_at)`:

- `unique(schedule_id, occurrence_key)`; `job_id` único e obrigatório; `request_sha256` calculado pelo banco
  sobre o texto canônico do pedido; `contract_id` pertence a `contracts` da agenda (gatilho).
- Chaves: `series:<AAAA-MM-DD>` (uma por dia), `list:<AAAA-MM-DD>` (uma por dia), `detail:<reunião>:<tentativa>`
  (tentativa 1, 2, 3) e `manual:<comando>` (nova coleta explícita por comando de operador, para qualquer
  contrato da agenda, com pedido validado contra a agenda).
- O comando do job é UUID v5 de `market-schedule:<agenda>:<chave>` no namespace fixo
  `6f0d1c7a-2b4e-5d3f-8a91-4c2e7b5d9e10`; o replay do disparo encontra a ocorrência pela chave e devolve o
  job dela sem recalcular o pedido.
- Imutáveis.

## 3. Enfileiramento por agenda

`private.enqueue_market_schedule_job_v1(schedule, key, contract, request, worker, account)`, interna (sem grant
a nenhum papel), chamada só pelo disparo e pela ocorrência manual. Sob a trava exclusiva da fonte
(`market-source:<fonte>`), antes de gravar qualquer coisa, confere: agenda ativa, contrato na agenda, fonte do
contrato igual à da agenda, pedido do tipo do contrato, revisão vigente da fonte adquirível hoje, transporte
aberto, host autorizado pela revisão (`market_url_allowed_v1`) e evidências do contrato citadas pela revisão
(`market_source_cites_contract_v1`). Qualquer falha recusa sem ocorrência e sem job. Deriva a URL pelo contrato (`market_contract_url_v1`) e grava ocorrência e job na mesma
transação, com `requested_by` = concedente, motivo `agenda <id>, <chave>`, token e conta do worker na
ocorrência. A alocação continua no claim. O enfileirador manual existente não muda.

## 4. Disparo e travas

`worker_fire_market_schedules_v1(token)`: porta compartilhada (primeira instrução), identidade do worker
(token ativo e conta vinculada), `lock_timeout` local de 5 s para toda espera. Para cada agenda ativa, em
ordem de `kind`:

1. Trava da agenda `market-schedule:<kind>` por tentativa; ocupada, `busy`.
2. Elegibilidade temporal (seção 4a); fora dela, `not_due`.
3. Concedente vigente, delegação de aquisição do token para a fonte, transporte aberto, fonte adquirível
   hoje, e para cada contrato da agenda a revisão vigente da fonte autoriza o host
   (`market_url_allowed_v1`) e cita as evidências do contrato (`market_source_cites_contract_v1`), as mesmas
   conferências do enfileirador existente; faltando algo, `blocked` com o motivo, sem ocorrência e sem
   consumir tentativa.
4. Trava da fonte `market-source:<fonte>` exclusiva por tentativa (é a que o enfileiramento toma); ocupada,
   `busy`. Ordem igual à da publicação (fonte antes das âncoras de leitura). As conferências do item 3 são
   refeitas sob essa trava antes de gravar.
5. Decisão (seções 5 e 6) e enfileiramento.

Nunca promove trava compartilhada para exclusiva. `lock_timeout = 5s` é atributo da função (`set` na
definição), portanto vale desde a porta, que continua a primeira instrução; nenhuma espera isolada passa de
5 s. A duração total da chamada é limitada pelo `statement_timeout` do papel `authenticated` no PostgREST e
pelo tempo de transporte do worker; o disparo processa no máximo uma ocorrência de série, uma de lista e dez de
detalhe por chamada. O worker trata `lock_timeout` e tempo esgotado como `busy` e tenta no próximo ciclo.

### 4a. Elegibilidade temporal

K = `clock_timestamp()` no início do disparo; data e hora de São Paulo derivadas de K. Uma agenda está no
período de disparo quando a hora local é igual ou posterior a `local_time` e, com `business_days_only`, a data
é dia útil pelo calendário de feriados nacionais da normalização (`market_next_business_day_v1`). Série, lista
e reconciliação de detalhes só criam ocorrência dentro do período. Dia perdido (worker parado o dia todo) não
é recuperado como ocorrência própria: a cobertura e a descoberta do dia seguinte o absorvem.

## 5. Série 432

Descoberta e travas como no monitor: candidatos de `market_selic_candidates_v1(hoje, K)` com K = instante do
disparo; âncoras de leitura e estados de versão pela ajuda de leitura; cobertura numa instrução sobre
`market_selic_selection_v1(hoje, K)` restrita a períodos até ontem; se a cobertura depender de versão ou
aquisição fora do conjunto travado, `retry` sem gravar.

- Cobertura contígua: maior prefixo de dias corridos desde `coverageStart` com observação na seleção. A
  primeira lacuna é `g`. Sem lacuna até ontem: `covered`.
- Janela: início `max(homologated_from, g)`, fim `min(ontem, início + 10 anos - 1 dia)` (o limite exclusivo do
  contrato). Histórico maior que dez anos avança um bloco por dia.
- Âncora documental: precisa existir comunicado de referência legível com `series_change_date <= início`;
  sem ele, `blocked: anchor_missing(<início>)`, sem job.
- Comprovante indisponível, antes de qualquer criação de job de série (primeira vez ou recuperação): se algum
  comunicado de referência que a janela usaria (a âncora, `series_change_date <= início`, a mais recente, e
  cada reunião com `series_change_date` dentro da janela) tem a aquisição de referência ilegível, a nova
  aquisição reutilizaria esse comprovante, cuja substituição está fora do M2:
  `blocked: communique_unavailable(<reunião>)`, sem job, em qualquer ramo abaixo.
- Recuperação por início de janela. Se já existe ocorrência `series:*` com o mesmo início, a nova depende do
  desfecho da última:
  - job vivo: `in_flight`;
  - job falho ou cancelado: falha recuperável conta tentativa; cancelamento é decisão de operador,
    `blocked: series_cancelled(<início>)`;
  - versão em quarentena: uma decisão única sobre o conjunto completo de achados da avaliação de qualidade
    dessa versão, nesta precedência:
    1. algum achado fora da lista conhecida, ou quarentena sem avaliação: `blocked: series_quality_unclassified`;
    2. alguma divergência (`communique_value_mismatch`, `communique_direction_mismatch`, `anchor_value_mismatch`,
       `value_out_of_range`, `before_homologation`): operador, `blocked: series_disagreement(<início>, <períodos>)`;
    3. alguma lacuna documental (`start_without_anchor`, `change_without_communique`): os períodos pendentes são o
       início da janela (âncora) e cada período de mudança sem comunicado. A janela de comparação é a da
       ocorrência que gerou a versão. Nova aquisição só nasce quando, para algum período pendente, passou a
       existir comunicado de referência legível que o resolve (para a âncora, `series_change_date <= início`;
       para uma mudança, `series_change_date` igual ao período) que não está no conjunto de evidências usado
       por aquela versão (`market_version_evidence`). Não importa quando os bytes do comunicado foram coletados,
       só que a referência legível exista agora e falte à versão. Chegada de comunicado fora dos períodos
       pendentes, mudança de horizonte ou perda de legibilidade de outra referência não liberam tentativa;
       senão `blocked: missing_communiques(<início>, <períodos>)`;
    4. só lacunas de calendário (`calendar_gap`, `no_observation`, resposta incompleta da fonte): recuperável por
       nova aquisição, conta tentativa;
  - versão aprovada que deixou de ser legível: pelo fecho de dependências da versão. Se alguma aquisição de
    comunicado do fecho está ilegível, a substituição do comprovante está fora do M2,
    `blocked: communique_unavailable(<reunião>)` sem job; se só a aquisição ou a versão da série foi revogada,
    recuperável, conta tentativa;
  - versão aprovada e legível e a lacuna continua no mesmo início: `blocked: no_progress(<início>)`.
  Orçamento: três ocorrências automáticas por início; depois `blocked: series_budget(<início>)`, retomada só por
  ocorrência manual. Uma ocorrência de série por dia.
- Lacuna interna (quarentena ou revogação no meio) é recuperada pela mesma regra.

**Bootstrap.** A abertura (parte 4) exige, antes de ligar a agenda, a janela inicial aprovada: âncora e todos os
comunicados das mudanças do recorte inicial adquiridos por ocorrência manual de detalhe (com o número da
reunião), e uma aquisição da série aprovada pela qualidade. Histórico fora do alcance da lista não é
descoberto automaticamente: o disparo devolve `missing_communiques` com os períodos, e o operador adquire os
detalhes por ocorrência manual.

## 6. Comunicados

**Lista.** Uma ocorrência `list:<hoje>` por dia, com `{"size": n}`.

**Descoberta.** A confirmação da lista passa a gravar, na mesma transação da aquisição e do recibo, um vínculo
por reunião listada: `private.market_copom_listings(list_acquisition_id, meeting, reference_date)`, chave
(aquisição, reunião), a partir de `market_parse_copom_list_meetings_v1(bytes, size)` (o parser estrito, agora
devolvendo as linhas validadas; `market_parse_copom_list_v1` passa a contar sobre ele). Antes de conferir
conflitos, a confirmação toma a trava exclusiva por reunião `market-copom-meeting:<n>` de cada reunião listada, em
ordem crescente de número (a mesma trava que a confirmação do detalhe toma para a sua reunião), e só então
lê: uma reunião listada com data de referência diferente da registrada em outra lista legível, ou da data do
comunicado de referência já gravado, recusa a confirmação (`market_copom_list_conflict`, falha definitiva). A
confirmação do detalhe, sob a mesma trava da sua reunião, passa a confrontar também a data de referência com
todas as listas legíveis que contêm a reunião, com o mesmo erro. Assim a ordem não importa: lista antes do
detalhe, detalhe antes da lista ou as duas ao mesmo tempo, só a primeira confirma quando as datas divergem. O
worker trata o código como falha definitiva (`verification_failed`). Replay da confirmação não regrava. Uma reunião é descoberta
enquanto ao menos uma lista que a contém for legível (`market_acquisition_readable_v1`), conferido sob as
âncoras de leitura das listas candidatas, tomadas pelo protocolo do monitor antes da reconciliação; sem lista
legível, `blocked: listing_unavailable(<reunião>)`.

**Reconciliação dos detalhes** (em todo disparo da agenda dentro do período, independente da ocorrência da
lista): cada reunião descoberta sem comunicado de referência recebe um estado; os bloqueios e `in_flight` são
devolvidos (no máximo 50 no relatório) e não ocupam o lote; o lote de criação é de até 10 reuniões elegíveis
por disparo, por ordem de número:

- job de detalhe vivo (`queued`, `leased`) para a reunião: `in_flight`;
- job falho com `meeting_disagreement`: `blocked: meeting_disputed(<reunião>)` (decisão de operador);
- job cancelado: `blocked: detail_cancelled(<reunião>)` (decisão de operador);
- três ocorrências `detail:<reunião>:*` falhas: `blocked: detail_failures(<reunião>)`;
- senão cria `detail:<reunião>:<próxima tentativa>`.

Comunicado de referência revogado ou ilegível não é substituído: `blocked: communique_unavailable(<reunião>)`,
como na parte 6.

## 7. Worker

Laço próprio a cada minuto, como o do monitor; erros de rede, `lock_timeout` e `retry` voltam no próximo
ciclo. Capacidade `market-acquisition-scheduler.v1` anunciada pelo banco e exigida pela imagem.

## 8. Superfície e segurança

Tabelas privadas com RLS forçada, negação explícita, sem grants a papéis da API e guarda de truncate; comandos
de fundador ou operador `security invoker` com porta como primeira instrução; enfileiramento por agenda
interno; a única entrada pública é o wrapper `worker_fire_market_schedules_v1`, para `authenticated`. Os
comandos novos entram no teste da porta; decisão no `framework-consumer-surface.json`; catálogo da etapa 0 e
auditoria de privilégios de todas as funções novas. Nada chega a tenant.

## 9. Testes (gate da parte 2)

- SQL: concessão, replay, reuso, parâmetros e contratos inválidos, fonte divergente, uma agenda ativa por
  tipo; disparo antes da hora, em feriado, sem delegação, token ou conta errados, concedente inativo,
  transporte fechado (nenhuma ocorrência, job ou alocação), fonte não adquirível, isolamento diferente de
  READ COMMITTED; janela no início homologado, lacuna nos primeiros dias, fronteira exata de dez anos com ano
  bissexto, cobertura completa adquirida hoje (`covered`), lacuna interna, âncora ausente, orçamento de
  falhas, quarentena com e sem evidência nova, `no_progress`; lista que grava descoberta, conflito de data,
  replay sem duplicar; reconciliação em transações separadas (disparar lista, confirmar, disparar de novo
  no mesmo dia e obter só os detalhes faltantes), disputa, cancelamento, três falhas, comunicado revogado;
  manual cria outra ocorrência e recusa contrato, fonte ou reunião fora da agenda; negativos de tenant e de
  papéis da API; superfícies fechadas.
- Também: decisão sobre conjuntos de achados (lacuna com divergência, lacuna com falta documental,
  `anchor_value_mismatch`, achado desconhecido); falta documental liberada só pelo comunicado do período pendente
  (negativos: comunicado de outro período, mudança de horizonte, remoção de outra referência); revogação de um
  comunicado interno de janela aprovada com âncora legível (`communique_unavailable`, sem job); quarentena por
  calendário seguida de revogação de comunicado interno com âncora legível (`communique_unavailable`, sem job);
  comunicado coletado antes e confirmado depois da formação da versão em quarentena documental (libera a
  recuperação); negativos de
  host e de evidências também pela ocorrência manual, sem ocorrência nem job.
- Também: histórico desde 2021 com lista de tamanho 10 (`missing_communiques` com os períodos); resposta
  incompleta da fonte recuperada por nova aquisição até o orçamento; lacuna documental que só volta depois de
  comunicado novo relevante; divergência que exige operador; série cancelada; versão aprovada revogada; lista
  revogada antes do disparo (`listing_unavailable`) e redescoberta em lista válida; dez reuniões bloqueadas
  seguidas de uma elegível (criada); disparo antes da hora e em feriado sem nenhuma ocorrência, inclusive de
  detalhe; revisão da fonte válida para a série mas sem evidências dos comunicados, e sem o host (bloqueio sem
  tentativa).
- Corridas em duas sessões: duas confirmações de listas com datas divergentes para a mesma reunião (só uma
  confirma); lista e detalhe com datas divergentes nas duas ordens e ao mesmo tempo (só a primeira confirma); dois disparos da mesma agenda (um job); porta exclusiva ocupada e conta ou token
  bloqueados (o disparo desiste em até 5 s por espera); revogação da agenda, da fonte, da
  aquisição, da delegação, do token e bloqueio da conta contra o disparo, nas duas ordens; confirmação,
  quarentena e revogação de versão concorrentes à decisão de cobertura (`retry` ou decisão estável); disparo
  contra publicação e monitor sem deadlock; falha entre ocorrência e job (nada fica).
- Worker: laço inerte sem agenda, cliente simulado, erros tratados.
