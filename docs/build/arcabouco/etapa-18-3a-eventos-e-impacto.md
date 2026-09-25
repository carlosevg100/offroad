# Etapa 18, incremento 3A: eventos de dependência, fatos de invalidação e pedidos de atualização

Migração B de `work_dependencies_and_continuity`, arquivo `supabase/migrations/20260925180000_work_dependency_events.sql` (o carimbo definitivo é o que o executor registrar ao aplicar em staging e produção; ele precisa ficar depois de `20260925155334`). Testes `supabase/tests/work_continuity_dependencies.sql`, extensão de `supabase/tests/rls_non_interference.sql`, `scripts/ci/test-dependency-update-concurrency.py` (duas sessões reais, no job de banco) e os testes de unidade do contrato de evento e do vetor de paridade com `continuation.ts`. Nada é recomputado neste incremento: o agendamento das execuções candidatas é o incremento 3B. Nenhum resultado e nenhuma decisão são reescritos.

## Eventos

**Contrato.** `private.domain_events` ganha dois tipos de agregado, `source_version` e `method_release`, e um segundo efeito, `propagate_dependencies`, ao lado de `revalidate_authority`. Todo evento continua revalidando autoridade; `propagate_dependencies` diz ao consumidor que, depois da varredura, ele também aplica o efeito de dependência. O efeito segue o tipo, por constraint: os dois tipos novos sempre propagam; `adoption_decision` e `assumption_version` propagam a partir desta migração (os eventos já gravados continuam com `revalidate_authority`, e os dois valores seguem válidos para eles); os tipos de autoridade e de evidência nunca propagam. `append_domain_event_v1` passa a gravar o efeito do tipo, por patch de texto com erro nomeado (`domain_event_effect_contract_changed`). O espelho em TypeScript é `packages/domain-contracts/src/domain-event.ts`, com a mesma regra.

**Produtores**, todos na transação da mudança e por `append_domain_event_v1`:

- nova versão de uma fonte lógica que já tinha versão (gatilho em `public.source_versions`). Agregado: a fonte lógica (`source_id`); versão do agregado: `version_no`, para que as versões de uma fonte fiquem ordenadas. Como o contador por agregado de `append_domain_event_v1` não conhece versões anteriores sem evento, o mesmo patch faz o tipo `source_version` usar o número da versão e recusa número menor que o próximo (`domain_event_version_regression`). A primeira versão de uma fonte não emite evento: nenhuma execução pode depender de uma fonte antes dela existir;
- release de plataforma publicada (gatilho em `private.platform_method_releases`, onde a publicação grava a release). A release é compartilhada, então cada organização com execução do procedimento recebe o seu evento. Agregado: o procedimento, como uuid estável (`private.method_procedure_aggregate_v1`, md5 do `method_id`); versão pelo contador, o que ordena as releases de um procedimento por organização;
- release da casa publicada (gatilho na passagem de `candidate` para `published` em `public.method_releases`), com o mesmo agregado do procedimento na organização dona;
- `assumption_version` e `adoption_decision`, que já existiam, sem mudança de produtor.

Retirada de release, da plataforma ou da casa, não emite evento aqui: é assunto de revogação (etapa 17), não de versão mais nova.

**Consumidor.** `complete_event_outbox_v1` mantém a varredura de autoridade exatamente como estava e só depois dela chama o efeito de dependência, na mesma completude e dentro de uma subtransação (`private.apply_outbox_dependency_effect_v1`). Falha no efeito desfaz só o efeito: a varredura fica aplicada, inclusive quando o tempo limite da instrução interrompe o efeito no meio, porque esse cancelamento também é capturado na subtransação. Se a varredura terminou, o evento não é reconhecido (a linha continua `leased`, a completude devolve `completed: false`); o lease vence, a outbox entrega de novo e, depois de cinco tentativas, a linha fica `blocked` e o alarme existente dispara. Se a varredura ainda tem trabalho, a linha volta a `pending` como antes. O formato de retorno da completude não muda, e o worker não executa nada do evento em memória.

## Cabeças

A cabeça de cada chave lógica é lida no momento do processamento:

- fonte: a versão mais nova da fonte lógica (`private.source_head_v1`), verificada ou não;
- slot de premissa: a revisão mais nova do conjunto e a decisão do slot nela, nula quando essa revisão não tem mais o slot (`private.assumption_slot_head_v1`). Slot retirado é mudança de dado, não grafo incompleto;
- procedimento (`private.method_release_head_v1`): sem release da casa fixada, a release de plataforma publicada mais nova (por `created_at`, depois `id`, das mais novas); publicada quer dizer que o último evento de publicação da candidata é `published`, e uma release importada sem candidata conta como publicada. Com release da casa fixada, a release da casa publicada mais nova da organização para o mesmo procedimento (por `published_at`, depois `id`), junto com a release de plataforma sobre a qual ela é composta; sem nenhuma publicada, a cabeça é desconhecida. O perfil da cabeça é o que o pedido de execução escolheria hoje para aquela release (adaptador determinístico compilado, capacidade liberada e universal, referência disponível); havendo mais de um, vale o registro mais recente em `private.execution_profile_registrations` e depois o `id`. O perfil fica disponível para o incremento 3B (orçamento) e não entra nos fatos.

## Impacto e fatos de invalidação

Cada evento julga só as chaves lógicas que toca: a fonte do evento, com as versões derivadas que descendem das versões dela pelo fechamento de `private.resource_dependencies`; os slots do conjunto da revisão nova (ou o slot da decisão); o procedimento da release. Para cada execução que depende dessas chaves, a regra é a de `computeDependencyImpact`: vale a versão mais nova da chave em que a execução se apoiou, direta ou por derivação; a execução é afetada quando a cabeça é mais nova; no slot, quando a decisão mudou; no procedimento, quando a release da plataforma ou da casa mudou (`method_update`). Chave sem cabeça ou com cabeça atrás do que foi fixado é `graph_incomplete`, com a lacuna registrada, e conta como afetada. Execução sem nenhuma aresta registrada é `graph_incomplete` para toda mudança.

Antes de julgar, se algum insumo fixado da organização não tem sua linha de projeção, o grafo é reconstruído com `private.backfill_execution_dependencies_v1()`. Execuções que terminaram sem resultado (job `failed`, `poison` ou `cancelled` e nenhum recibo de resultado) não têm saída a atualizar e ficam de fora; as demais entram, com resultado confirmado ou ainda em andamento.

**`private.execution_invalidations`** guarda um fato imutável por organização, execução, chave lógica e evento: espécie, chave, classe do motivo (`data_change`, `method_update`, `graph_incomplete` com a lacuna), a versão fixada e a cabeça atual no formato dos motivos de `continuation.ts`, e, para fonte cujo ancestral mudou, as versões derivadas fixadas que o carregam. Com esse campo o 3B não agenda recomputação enquanto a fonte derivada não tiver versão nova: a rederivação gera o próprio evento. Contrato igual ao de `execution_dependencies`: RLS habilitada e forçada, política restritiva `execution_invalidations_deny_clients`, `revoke all` inclusive de `service_role`, guarda contra update, delete e truncate. Único escritor: o efeito de dependência do consumidor.

## Pedidos de atualização

**`public.work_continuation_requests`** guarda os pedidos de continuação de um trabalho. Espécies `dependency_update` (escrito aqui) e `user_followup` (escrito pelo incremento 4). Estados `open`, `awaiting_authorization`, `scheduled`, `ready`, `adopted`, `declined` e `superseded`, só para a frente: um estado terminal não muda, adoção só a partir de `ready`, e `superseded` aponta para o pedido que o substitui. Toda escrita incrementa `revision`, a versão esperada dos comandos do 3B e do 4. Identidade imutável; o conteúdo muda só por fusão enquanto o pedido está aberto; nada é apagado.

Há no máximo um pedido de atualização aberto por trabalho (índice único parcial). O consumidor abre ou funde nele, como `mergeDependencyUpdate` define: eventos deduplicados por id, união das execuções afetadas, eventos em ordem canônica e a versão mais nova vista por agregado. O conteúdo é o corpo `dependency-update-request.v1` de `continuation.ts` com o mesmo fingerprint, garantido por check e por um vetor comum aos dois lados (`packages/work-plan/src/continuation-sql-parity.test.ts` e a seção 9 do teste SQL). Por execução afetada o pedido guarda também a execução raiz (a própria execução, até o 3B registrar linhagem) e o marco `execution_result` a que se refere, nulo enquanto não há resultado confirmado.

Ao abrir, o consumidor grava uma vez o marco `continuation_proposed` do pedido em `public.work_milestones` (sujeito o pedido, rótulo `dependency_update`, sem autor humano). Marcos `execution_result` e `decision` não são tocados: o pedido os referencia.

**Leitura.** `work_continuation_requests_select_authorized` com a mesma autoridade de `public.work_milestones` (`private.can_access_capital_project`), negação explícita de insert, update e delete, grant só de select para authenticated, gatilhos de `updated_at` e auditoria.

## Idempotência, ordem e concorrência

O mesmo evento aplicado de novo não escreve fato (chave única por evento) e não muda o pedido (evento já contido). Evento mais antigo que chega depois de um mais novo não regride: o impacto é sempre lido da cabeça atual, e a versão por agregado no pedido só sobe. Duas mudanças no mesmo trabalho se serializam por uma trava de transação por trabalho e terminam em um único pedido aberto com as duas; o teste de duas sessões observa a espera na trava.

## Respostas do incremento 1 aplicadas

1. Chave do procedimento e cabeças: como descrito em Cabeças. O perfil foi resolvido pela regra do pedido de execução; o critério de desempate é o registro mais recente, depois o id.
2. Linhagem: o pedido guarda a raiz de cada execução afetada, hoje a própria execução.
3. Eventos: um agregado por fonte lógica com versão igual a `version_no`; os eventos `assumption_version` continuam por versão.
4. Ordem dos marcos: nenhuma coluna nova.
5. Esperas substituídas: fora deste incremento.
6. Ancestral movido sem rederivação: fato registrado com as versões derivadas que o carregam; o agendamento espera a versão nova da fonte derivada (3B).
7. Slot retirado: cabeça com decisão nula, tratada como mudança de dado e testada.

## Limites e riscos

- O worker valida cada evento reivindicado pelo contrato de `@offroad/domain-contracts`. O worker precisa estar implantado com o contrato novo antes da aplicação da migração em produção; caso contrário, eventos com os tipos novos ou com `propagate_dependencies` não são reconhecidos e acabam bloqueados sob o alarme.
- Execução que já estava desatualizada antes da migração só recebe fato quando a próxima mudança tocar a mesma chave; não há varredura inicial.
- Os caminhos de release da casa (cabeça da casa, cabeça desconhecida) e `no_recorded_edges` não são alcançáveis hoje: perfis de execução recusam release da casa, e toda execução tem manifesto. Estão no mesmo comando SQL dos caminhos testados.
- Como qualquer evento pendente, os eventos novos seguram por alguns segundos a barreira `require_domain_event_propagation_v1` dos comandos de efeito externo da organização; um evento bloqueado segura até o reparo, como já acontece.
- O julgamento lê as execuções da organização a cada evento; o volume de produção é pequeno.

## Aplicação

1. Implantar o worker com o contrato de evento novo.
2. Aplicar a migração em staging, depois em produção, de uma vez. Os patches dependem dos corpos de `append_domain_event_v1` e `complete_event_outbox_v1` publicados em `20260916102242_reconcile_domain_event_audit_outbox.sql`; se o ambiente divergir, a migração para com `domain_event_version_contract_changed`, `domain_event_effect_contract_changed` ou `event_outbox_dependency_contract_changed`.
3. Renomear o arquivo para o carimbo registrado; recapturar de staging os corpos efetivos de `append_domain_event_v1` e `complete_event_outbox_v1` (o snapshot foi derivado de uma réplica de todas as migrações); regenerar `apps/web/src/types/database.ts` (tabela pública nova); conciliar inventário e catálogos da etapa 0 (17 funções, 2 tabelas, 5 políticas e 10 gatilhos novos) e os journals; rodar os advisors.
