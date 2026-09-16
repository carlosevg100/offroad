# Etapa 4: eventos duráveis e auditoria transacional

**Estado: banco e alarmes instalados; etapa ainda não concluída.** Conciliação aplicada em staging `20260916102218` e produção `20260916102242`. Os três contratos SQL passaram no schema instalado, os dois advisors de segurança não apontaram lints e os catálogos foram conferidos. CI, merge e consumidor implantado permanecem gates para o completion.

O worker existente consome referências da outbox em um laço independente e limitado, no mesmo processo e com a mesma credencial, sem criar intake artificial. Jobs documentais longos não atrasam a propagação. Não há Temporal nem novo orquestrador. A confirmação e o efeito interno ocorrem na mesma transação SQL; o worker não executa efeitos financeiros ou externos a partir do envelope.

## Contratos

`private.domain_events` guarda versão sequencial por agregado, ator, motivo, efeito, correlação e snapshot protegido de campos permitidos. A transação registra uma linha em `public.audit_events` e uma referência em `private.event_outbox`. IDs de `private.human_intervention_ledger` e `private.retrieval_audit_events` podem ser referenciados com chave composta de organização; nenhuma linha histórica foi convertida em evento novo. Eventos e decisões são imutáveis. Clientes não têm DML nem leitura direta nessas três novas tabelas, todas com RLS forçada.

As primeiras fontes são memberships, grants de recursos, habilitações explícitas e vínculo de conta comercial. O trigger usa lista explícita de campos, sem copiar futuros dados financeiros adicionados às tabelas. A gravação da trilha falhando faz a alteração original falhar também.

`append_domain_event_v1` é privado e indisponível para usuários e worker. Repetir o ID exige o mesmo fingerprint; sequência do agregado é serializada. `claim_event_outbox_v1` exige conta autenticada ativa e credencial de worker vigente; vincula o lease à conta e à credencial. `complete_event_outbox_v1` valida a capability, não aceita lease vencido ou substituído e reconhece confirmação já concluída sem repetir o efeito. Cinco leases expirados tornam o item bloqueado e visível na saúde operacional. Após corrigir o consumidor, `private.retry_blocked_event_outbox_v1` permite ao operador de banco recolocar apenas esse item na fila, com auditoria e retirada da capability antiga; usuários e worker não podem chamar esse comando. O lote máximo por confirmação é de 100 jobs; trabalho restante volta à fila.

O primeiro efeito revalida a autoridade atual dos jobs e cancela trabalho pendente ou alugado que perdeu essa autoridade. A negativa fica em `private.access_decision_events`; execução sem trabalho ativo é encerrada como cancelada. Uma falha dessa trilha impede cancelamento parcial e confirmação. Leitura e publicação continuam sujeitas aos controles síncronos existentes. Os comandos `authorize_pack_distribution` e `authorize_qualified_introduction_plan` exigem propagação concluída antes de persistir a autorização externa.

## Verificação realizada e restante

A primeira versão do candidato passou nos 60 contratos SQL existentes em staging com rollback. A versão com barreira nos comandos externos e vínculo aos ledgers passou novamente em `domain_event_outbox.sql`, `domain_event_outbox_revocation.sql` e `rls_non_interference.sql`. Os cenários incluem recuperação de lease, repetição, isolamento de conta, token revogado, rollback, erro de auditoria, cancelamento efetivo e publicação negada enquanto a propagação está pendente. Essas evidências não substituem a CI nem a aplicação definitiva.

O envelope TypeScript recusa campos sensíveis e efeitos desconhecidos. O consumidor limita retries, repete a mesma capability após resposta ambígua e registra apenas códigos, IDs e contagens. Os novos testes de pacote e worker incluem os casos negativos. A verificação completa local e os gates remotos são registrados no recibo de entrega quando terminarem.

## Operação e alarmes

A configuração revisável está em `apps/document-worker/monitoring/event-outbox-alarms.json`: heartbeat ausente por três minutos, backlog acima de cinco minutos por dois períodos, itens bloqueados e erros de consumo. O instalador em `scripts/ci/configure-event-outbox-alarms.py` usa uma sessão AWS já autorizada, testa os filtros com amostras em memória e compara a configuração instalada. Não altera IAM nem cria eventos sintéticos no produto. Referência: [sintaxe oficial de filtros CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntaxForMetricFilters.html).

Os quatro alarmes e filtros foram instalados e conferidos pela CLI autenticada temporariamente com a sessão AWS existente. Nenhuma política IAM foi alterada. A identidade OIDC do workflow continua sem `DescribeAlarms`; a conferência operacional desta entrega usa a sessão autorizada. O heartbeat deve sair do estado de ausência após implantar o consumidor.

A primeira aplicação funcionou em staging, mas a tentativa em produção foi revertida porque `authorize_pack_distribution` é uma superfície exclusiva de staging já inventariada. O SQL aplicado ficou preservado em `docs/build/schema-history/staging-only-outbox/20260916101915_domain_event_audit_outbox.sql`. A nova migração de conciliação é idempotente, preserva os registros existentes e não promove essa superfície; o comando de introdução existente continua obrigatoriamente protegido. Nenhum carimbo anterior foi alterado.

A etapa 22 continua responsável por retenção e revogação de ponta a ponta em todos os destinos. Esta etapa registra as mudanças atuais de autoridade e seu primeiro consumidor; não declara auditoria universal de todas as leituras, nem limpeza já implementada de busca e cache.
