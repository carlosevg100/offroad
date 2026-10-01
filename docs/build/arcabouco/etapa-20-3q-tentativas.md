# Etapa 20 / 3Q: contexto imutável e decisão por tentativa

O autorizador recebe o fingerprint real do pedido efetivo ao adapter, input e prompt, task/schema, invocation e predecessor imediato. O DTO é frozen antes do await; não contém corpo, schema, credencial ou cache key. Fingerprints v1, cassette, validação, limite e reserva permanecem os vigentes.

Cada tentativa concreta, inclusive a negada sem envio, conserva invocationId nos diagnósticos. Fallback aponta o predecessor imediatamente anterior, inclusive uma negativa; somente repair leva guidance de reparo. A resposta aceita mantém seu contrato v1. O parser worker exige UUID decisionId retornado pela RPC real; negação local por conexão ausente não fabrica decisão. Logs, diagnósticos e schemas de gold preservam a identidade com projeção explícita e sanitização UUID. Identidade inválida falha antes de envio ou fallback.

Não há DDL. worker_authorize_provider_processing_v1 continua decidindo rota sob autoridade do job; não recebe fingerprint, recipe ou attempt. O DTO transportado não transforma a decisão existente em prova de binding. Não adicionar parâmetros desconhecidos nem procurar a última decisão do job. O próximo incremento criará ledger e input v2 com componentes/direitos/prazos derivados no SQL e consumidor no serviço de corpos, antes de ativar M07.

Gates: denied primary zero sends com fallback positivo e IDs próprios; fingerprints reais iguais aos de attestation/log; snapshot imutável; reparo com prompt distinto e predecessor correto; decisão inválida zero sends; parser SQL allow/deny e local deny sem ID; telemetria hostil não vaza texto; regressões de cassette, orçamento, resultado aceito e gold. Gate completo, CI, merge e web/worker no commit final são necessários ao completion. Sem mudança de comportamento de acesso ou dados em produção; rollback é redeploy do commit anterior.

Etapa20 continua aberta. Nenhum release, captura nativa, leitura histórica ou etapa21 foi ativado.

## Consumidor de evidência governada

A CI inicial detectou 38 unexpected_repair_lineage no ensaio governado com cassette: o avaliador tratava predecessor de fallback como se fosse guidance de reparo. verifyIntentRouterCallEvidence agora aceita a identidade somente no fallback e exige predecessor imediato, não exitoso, da mesma operação filtrada. Primary/preflight com predecessor, ID forjado/outra superfície, salto sobre repair e guidance fora de repair continuam negados. Logs históricos de fallback sem esse campo conservam a verificação existente de topologia/custo/input/prompt; nenhum gate pago é eliminado. Focais20 e typecheckeval PASS; o ensaio governado real precisa passar novamente na CI antes de merge.
