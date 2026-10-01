# Etapa 20 / 3Q / atestação do input efetivo no gateway

## Contrato deste incremento

Cada tentativa registra `adapterRequestFingerprint`: SHA-256 da representação estável versionada `gateway-adapter-input.v1`, com provedor, modelo, esforço, sistema efetivo, partes após redação, schema JSON, nome do schema, limite de saída, timeout, cache key, thinking, output mode e metadata. Reparos incluem a orientação efetivamente anexada ao sistema; fallback recebe novo hash por provedor/modelo. Não é um hash dos bytes HTTP do SDK nem um snapshot que permita reconstruir conteúdo apagado.

O gateway copia input, metadata e classificação antes da primeira espera; congela os dados próprios do pedido e verifica que o schema Zod continua idêntico antes do dispatch. Não congela internals de Zod. `attestInput` recebe somente identidade, hashes e linhagem, e confirma recibo UUID vinculado à invocation e ao fingerprint. `requireInputAttestation` sem callback nega antes do envio. O callback é fixado na entrada, tem deadline de no máximo dez segundos e é aguardado após reservar capacidade local. Falha, timeout ou recibo divergente libera a reserva local e encerra a chamada sem fallback; gera log `policy_rejected`/`not_called`, sem mensagem privada do callback. A integração do control plane deve liquidar eventual reserva remota não enviada.

O schema de linhagem conserva ambos os campos novos ao recuperar histórico. Chamadas legadas continuam funcionando, com fingerprint completo e sem alegar recibo de retenção. Cassette continua distinguida por `fromCassette`; um recibo não afirma que houve envio externo.

## Limite e dependências

Este corte entrega a fronteira efetiva de tentativa e o gancho de persistência; não liga ainda os seis produtores à captura nativa e não fecha 3Q. Nenhum prompt, schema body, snippet ou documento é copiado para telemetria. A próxima receita persistente precisa fixar componentes privados, referências retidas e versões de transformação; o writer nativo precisa validar fechamento e recibos, com replay da revisão exata. Hash sozinho não confere direito, retenção nem recuperação. Não há migração, novo grant, flag ou mudança de rota.

## Verificação e controles

Teste `input-attestation.test.ts`: autoridade ausente, recibos divergentes, deadline, falha sanitizada, input após redação, mutação assíncrona, schema alterado, callback mutável, orçamento concorrente, reparo/fallback e roundtrip de linhagem. Os testes rodam no job Quality/check. Revisão independente examina dispatch e contabilidade. Controles SEC-010/011/015: não egressar quando o contrato exigido falha, minimizar telemetria e impedir alteração entre prova e envio. Sem alegação de certificação ou fechamento de controle operacional.

Rollback: reverter o commit e redeployar web/worker; não há DDL ou dados persistidos novos. Enquanto não integrado, não promover captura metadata para input fechado ou artefato publicável. Etapas 21–24 aguardam OK de onda.
