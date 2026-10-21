# M2, parte 3: outbox, retenção e página ODbL (desenho, v4)

Estado em 21/10/2026. Base: `M2-PLANO.md` (decisões 5 a 8), ADR 0023 e o que a parte 1 deixou em
produção. Reescrito depois de duas rodadas de revisão independente. O transporte
continua fechado e nada aqui o abre. Nenhuma saída pública acontece em produção nesta parte: página e
arquivo respondem 404 até um fundador publicar a primeira edição, ato da parte 4. O caminho com edição é
provado na CI, numa pilha local com dados sintéticos, e em staging na prova integrada da parte 4, com os
bytes reais (staging não recebe edição sintética, porque edições são imutáveis e ficariam no banco). Isso é
uma emenda explícita à sequência do `M2-PLANO.md`, registrada na PR desta parte: a prova HTTP da página e
do arquivo com edição publicada passa a integrar a prova integrada em staging da parte 4, que já é
condição para abrir a chave; na parte 3 ela é feita na pilha local da CI.

Toda função nova roda em `READ COMMITTED` (todas as chamadas da camada já rodam assim); uma transação
`REPEATABLE READ` ou `SERIALIZABLE` que chegue a elas é recusada logo na entrada
(`market_isolation_unsupported`), em vez de depender de snapshot antigo.

## 0. O que existe e o que falta

- `private.market_events` registra os fatos da camada; a sequência é atribuída na inserção e o commit pode
  vir depois, então nenhum consumidor lê por cursor global. Eventos de versão já têm `version_ordinal` sob
  âncora atualizada (`market_reference_event_order`), que é preservada.
- A outbox de domínio é de tenant (organização obrigatória, varredura de autoridade ao concluir). O padrão
  de lease, capacidade, recibo, replay e bloqueio é reaproveitado em tabelas próprias.
- Nenhuma função lê `storeDays` ou `retainAdoptedValues`; a religação não confere direito nem retenção.
- Não há leitor de versões; `anon` não alcança nada; o teste de não interferência também proíbe `security
  definer` em `public`.

## 1. Outbox de mercado (decisão 8)

**Consumidores.** `private.market_event_consumers(id, events, subject_kinds, state, registered_by,
registered_at)`, com `state` em `enabled`/`disabled`. Registro, mudança de filtro e desligamento são
comandos de fundador com recibo por comando, e tomam a trava exclusiva `market-event-consumers`. O gatilho
de fan-out toma a mesma trava em modo compartilhado antes de ler os consumidores e a mantém até o commit:
um registro espera as transações de evento em andamento e todo evento que comita depois do registro o vê.
O ponto de linearização é o commit do registro; não se usa sequência global. Desligar marca as linhas
pendentes e arrendadas do consumidor como `cancelled` (auditado), e nenhum recibo posterior é aceito.

**Sujeito e ordem.** O sujeito de ordem é o agregado que o consumidor de fato mantém: para eventos de
versão, o objeto lógico (`logical_id`, a série), não a versão; para aquisição e fonte, o próprio
identificador. `subject_ordinal` vem de um contador transacional
`private.market_event_subject_counters(consumer_id, subject_key, last_ordinal)` atualizado com `insert ... on
conflict do update ... returning`: a trava de linha do contador fica até o commit, então dentro de um
sujeito a ordem de atribuição é a ordem de commit. Ordem de travas no gatilho: consumidores (compartilhada),
depois contadores por `(consumer_id, subject_key)` em ordem crescente.

**Linha.** `private.market_event_outbox(consumer_id, event_sequence, subject_key, subject_ordinal, status,
attempts, available_at, lease_id, leased_by, leased_account_user_id, lease_expires_at, capability_sha256,
effect_key, effect jsonb, completed_at)`, chave `(consumer_id, event_sequence)` e único `(consumer_id,
subject_key, subject_ordinal)`. Estados `pending`, `leased`, `completed`, `blocked`, `cancelled`, com check
de coerência por estado (lease só em `leased`, efeito só em `completed`). Imutável fora das transições.

**Claim.** `worker_claim_market_event_v1(token, consumer)` toma a linha mais antiga por `available_at` que
esteja `pending` ou `leased` com lease vencido, e cujo sujeito não tenha, no mesmo consumidor, linha de
ordinal menor fora de `completed`/`cancelled` (`for update skip locked`). Cada claim conta tentativa; a
quinta tentativa vencida sem conclusão vai a `blocked` e para o sujeito. Lease de 60 s, capacidade nova a
cada claim, conta e token gravados na linha, como na alocação de aquisição.

**Efeito e conclusão na mesma transação.** Um consumidor de mercado não produz efeito fora do banco no M2.
O efeito é gravado por `worker_complete_market_event_v1(consumer, event_sequence, capability, lease,
effect jsonb)`, que recheca conta, token ativo, delegação do consumidor, lease, capacidade e prazo sob lock
(o prazo é relido depois da última escrita), grava o efeito e conclui a linha numa única transação. Na mesma
transação nasce o recibo imutável `private.market_event_receipts(consumer_id, event_sequence, lease_id,
worker_token_id, account_user_id, capability_sha256, effect_sha256, completed_at)`. O replay de uma conclusão
é validado contra esse recibo (mesma conta, token ainda ativo, mesma capacidade e mesmo efeito), não contra o
lease vivo, que já foi limpo; efeito diferente é recusado. Sem conclusão não há efeito.
`worker_fail_market_event_v1` agenda nova tentativa com espera crescente. A quinta tentativa sem conclusão
bloqueia a linha, termine ela por lease vencido ou por falha declarada; nenhum dos dois caminhos permite um
sexto claim. Só `retry_blocked_market_event_v1` (operador, com motivo, auditado) volta a linha a `pending`
com o orçamento zerado.

**Delegação.** `private.market_event_consumer_delegations(worker_token_id, consumer_id, ...)`, concedida e
revogada por fundador ou operador, rechecada sob `for share` em claim, renovação e conclusão, como as
delegações de fonte.

**Capacidade e saúde.** `market-event-outbox.v1` no contrato de runtime; o worker só passa a exigi-la com o
consumidor da parte 6. `market_event_outbox_health_v1()` para operador: pendentes, bloqueadas e idade da mais
antiga por consumidor.

## 2. Retenção e direito em todos os caminhos (decisões 5 e 7)

**Predicado de licença.** `private.market_license_retains_v1(license)`: verdadeiro só para licença aberta,
`storeDays` nulo ou ausente e `retainAdoptedValues` verdadeiro. Licença contratada é falsa no M2 inteiro.

**Aquisição.** `market_source_acquirable_v1` passa a exigir o predicado na revisão vigente; enfileiramento,
claim, renovação, upload (política do Storage) e confirmação já passam por ele sob a trava compartilhada da
fonte. Teste por caminho.

**Leitura: fecho de dependências.** `private.market_version_readable_v1(version, mode)` é o contrato único
de leitura, com dois modos (qualquer outro valor é recusado). `consume` (resolvedor da parte 6 e publicação ODbL) exige tudo abaixo e a
avaliação vigente `approved`: versão em quarentena nunca é consumida. `reprocess` (só a religação) exige
tudo abaixo menos a aprovação, porque religar é justamente o caminho para reparar a evidência de uma
versão em quarentena; o resultado é uma versão nova, selada e avaliada, que só é consumida se aprovada.

O fecho é recursivo: a versão, as versões de que depende por `market_version_inputs.dependency_version_id`
(em qualquer profundidade), a aquisição de cada uma e cada aquisição de comunicado ligada por
`market_version_evidence`. Para cada elemento: versão selada e com conteúdo; nenhum evento `revoked` ou
`purged` para a versão, para a aquisição ou para a fonte (revogação de fonte é evento próprio, distinto de
`enabled = false`); a licença da revisão em que a aquisição foi feita e a revisão vigente da fonte
satisfazem o predicado. O direito vale pela revisão vigente na leitura (decisão 5); desabilitar a coleta não
retira a leitura. A consulta de revogação usa índice `(subject_kind, subject_id, event)`.

**Religação.** `relink_market_version_v1` passa a exigir, sob a trava compartilhada de cada fonte
envolvida e das âncoras de autoridade (abaixo), que a versão de origem e cada evidência nova sejam legíveis
no modo `reprocess`. O replay de um
comando já concluído continua devolvendo o recibo, sem nova verificação, porque não faz trabalho novo.

**Revisão que exigiria prazo.** Sob a trava exclusiva da fonte, `record_market_source_revision_v1` recusa
(`market_retention_requires_purge`) a revisão cuja licença não satisfaz o predicado enquanto existir, da
fonte: aquisição confirmada, job `queued` ou `leased`, alocação com objeto no Storage ainda não removido.
Antes da revisão restritiva é preciso cancelar os jobs e varrer os objetos. Como claim, upload e
confirmação tomam a trava compartilhada e releem a revisão depois de obtê-la, nenhum deles atravessa a
mudança.

## 3. Edição ODbL (decisão 6)

**Conteúdo.** Para a série 432, a leitura fixada no instante da publicação: data-base D (data de São Paulo),
instante de conhecimento K, janela desde o início homologado até D, e o manifesto por período (regra da
parte 1 aplicada às versões legíveis no modo `consume`). Cada observação traz período, valor, versão e
aquisição; cada mudança traz o vínculo à reunião do Copom (número, data, decisão, taxa, digest do registro
do comunicado). Acompanham: o contrato da série e a política de qualidade como dados (o texto canônico e o
digest de cada um); o parser e as regras por link imutável ao código e aos vetores no repositório público,
fixado pelo commit da implantação; e as alterações em relação à edição anterior (edição e digest anteriores,
períodos acrescentados, retirados, com valor corrigido, e mudança de versão, vínculo, contrato ou regra
mesmo com valor igual). Licença: "Open Database License (ODbL) v1.0",
`https://opendatacommons.org/licenses/odbl/1-0/`, aplicada à base derivada; identificação da base de
origem ("Banco Central do Brasil, Sistema Gerenciador de Séries Temporais, série 432, e comunicados do
Copom"), com os avisos da origem preservados conforme a evidência de licença registrada; atribuição
exigida em qualquer uso. Nada de tenant, de fonte contratada, de quarentena ou de versão não legível.

**Bytes canônicos.** `market-odbl.v1`: JSON em UTF-8 com chaves de objeto ordenadas por ponto de código,
sem espaço, arrays na ordem definida pelo contrato (períodos crescentes, reuniões crescentes), todo número
como string decimal canônica (a de `market_trim_decimal_v1`), datas `YYYY-MM-DD`, instantes RFC 3339 com
seis casas e `Z`, escape mínimo (aspas, barra invertida e controles como `\u00xx` minúsculo) e quebra de linha
final. O texto canônico é gravado e servido byte a byte; o digest SHA-256 fica fora do corpo (cabeçalho e
página). Vetores SQL e TypeScript.

**Âncoras de autoridade.** Toda revogação ou expurgo de aquisição ou de fonte (evento `revoked`/`purged`
com sujeito aquisição ou fonte) toma, no gatilho do evento, a trava exclusiva
`market-authority:<tipo>:<id>`, como os eventos de versão já fazem com sua âncora. Quem lê para produzir
algo durável (religação e publicação) toma essas travas em modo compartilhado para cada elemento do fecho,
em ordem crescente de chave, e só então confere a legibilidade.

**Publicação.** `publish_market_odbl_release_v1(command, actor)`, fundador, recibo por comando com
fingerprint (replay devolve a edição original). Sob a trava exclusiva `market-odbl-publication`, travas
compartilhadas das fontes, das âncoras de autoridade de todo o fecho e o estado de cada versão incluída
travado (`lock_market_version_state_v1`), confere de novo a legibilidade depois de obter as travas e grava
`private.market_odbl_releases(id, release_number unique, command_id unique, previous_release_id unique,
data_base, knowledge_at, payload_text, payload_sha256, byte_size ≤ 2 MiB, published_by, published_at)` e as
dependências em `private.market_odbl_release_dependencies(release_id, version_id, acquisition_id)`.

**Retirada.** Uma edição deixa de ser servida pela Offroad se for retirada por comando
(`withdraw_market_odbl_release_v1`, fundador, motivo `quality` ou `rights`, ledger imutável) ou se qualquer
dependência deixar de ser legível no modo `consume`, verificado a cada leitura. A retirada não afeta direitos
que destinatários já receberam pela ODbL; só encerra a distribuição pela Offroad.

**Leitura pública.** `private.market_odbl_release_read_v1(p_release integer)`, `security definer`,
`search_path` vazio, objetos qualificados, sem SQL dinâmico, devolve só
`release_number`, `published_at`, `payload_text`, `payload_sha256` e o estado; busca por igualdade indexada
em número positivo ou pela mais recente pelo índice; número ausente ou retirado devolve vazio sem varrer
nada. A verificação de dependências de cada leitura usa os índices de `market_odbl_release_dependencies` e
de revogação e tem custo limitado pelo tamanho da edição. `public.market_odbl_release_v1(p_release integer
default null)` é `security invoker`, com `set statement_timeout = '2s'` na própria função exposta (o
PostgREST eleva os ajustes da função chamada), e chama a privada; `execute` revogado de `public` e
concedido só a `anon` na pública e a `anon` na privada. O corpo da função pública é SQL padrão ligado na
criação (`begin atomic`), não texto interpretado em tempo de execução: `anon` não tem `usage` no esquema
`private` e não ganha, e a chamada anônima é testada exatamente nessa condição. Exceções exatas por (papel, assinatura): no
invariante de alcance de `anon` de `rls_non_interference.sql` e no de execução de funções privadas `market_*`
de `market_reference_foundation.sql`. O invariante que proíbe `security definer` em `public` fica intacto,
sem exceção. O tempo limite é testado pela RPC HTTP anônima na CI.

**Web.** O leitor público usa cliente Supabase sem sessão (chave publicável, sem cookies), portanto como
`anon`. Página `/{locale}/dados/meta-selic` renderizada dinamicamente, sem parâmetro estático nem cache
persistente de 404; arquivo `/dados/meta-selic.json` (fora do middleware de idioma) com o texto canônico
exato, `content-type: application/json; charset=utf-8`, `x-content-type-options: nosniff`,
`cache-control: no-store`, `content-security-policy: default-src 'none'; frame-ancestors 'none'`,
cabeçalho `x-offroad-sha256` e nenhum `set-cookie`. O sitemap passa a ser dinâmico (sem cache do handler) e inclui
a página só quando existe edição servida; o teste cobre ausência, inclusão depois da publicação e saída
depois da retirada, sem novo deploy. Sem edição, as duas rotas respondem 404 de fato (status conferido no teste). Consumidores no
`framework-consumer-surface.json`.

## 4. Emendas

ADR 0023, emendas datadas: decisões 8 e 10 (outbox própria e exceção de retenção e direito como
implementadas, contrato único de leitura) e decisão de publicação (edição ODbL como única projeção
pública). `handoff.md`, `BUILD_STATE.md` e `ACCEPTANCE_EVIDENCE.md` na mesma PR; inventário do estágio zero.

## 5. Testes

SQL: fan-out na mesma transação (rollback não deixa linha); registro concorrente com evento em andamento
(nenhum evento perdido depois do commit do registro); desligamento cancela pendentes; ordem por série com
duas transações de commit invertido; claim concorrente; lease vencido retomado e quinta tentativa
bloqueada; quinta falha declarada bloqueada; conclusão com efeito igual e diferente; replay da conclusão
depois do lease limpo validado pelo recibo; delegação revogada antes da conclusão (nenhum efeito);
isolamento não suportado recusado. Retenção: cada caminho (enfileirar, claim, renovar, upload, confirmar,
religar, ler) recusa fonte que não retém; revisão restritiva recusada com aquisição, job vivo ou objeto
alocado, e aceita depois de cancelar e varrer. Leitura: revogação de comunicado, de dependência e de fonte tira a versão do fecho; quarentena fora do
modo `consume` e dentro do `reprocess`; revogação concorrente com publicação e com religação (as duas
ordens).
ODbL: vetores do texto canônico; edição só com versões legíveis; replay do comando; duas publicações
concorrentes; retirada por comando e por perda de legibilidade (também para número de edição explícito);
`anon` alcança só a função publicada. Corridas em duas sessões para registro com fan-out, ordem por série,
claim e publicação concorrente. Web (pilha local da CI, dados sintéticos): 404 real sem edição, transição
para conteúdo sem novo deploy, bytes e digest idênticos, cabeçalhos, sem cookie, paridade de mensagens.

## Ordem de implantação

Migração em staging, testes, revisão; produção com o transporte fechado e sem consumidor nem edição; deploy
da web com as rotas em 404. A primeira edição pública é ato da parte 4, depois da prova integrada.
