# Etapa 17 / 3N: resultado liquidado recuperável

Correção do achado de auditoria de 23/09/2026 (cálculo liquidado sem recuperação). Antes, o settle persistia só o hash e os bytes entravam apenas no commit. Se o commit falhasse depois do settle (transporte com timeout fixo de 5 s, inclusive para 8 MiB), a tentativa seguinte recebia a reserva replicada como `settled`, sem bytes, e fechava a execução como `partial/operation_uncertain`, descartando um resultado válido.

## O que muda

`execution_operation_receipts.canonical_result` guarda os bytes exatos do resultado liquidado, com CHECK de hash e teto de 8 MiB, só em recibos `settled`. `settle_execution_operation_v2` liquida com bytes: o hash é derivado deles, bytes que não são projeção JSON são recusados antes de qualquer gravação, bytes diferentes conflitam, e um recibo v1 liquidado só por hash completa seus bytes uma única vez com bytes idênticos. `execution_settled_result_v1` devolve os bytes liquidados à conta que detém a lease atual, e a nada mais. `commit_work_execution_result_v1` publica sucesso quando o recibo liquidado é desta lease ou de uma lease anterior da mesma execução com bytes conservados; nunca por hash de outra lease e nunca com bytes diferentes. O recibo de resultado registra `settlement_lease_id` além da lease de publicação. Os wrappers `worker_settle_execution_v2` e `worker_settled_execution_result_v1` têm os mesmos grants estreitos dos v1. O v1 permanece para o worker em execução até o deploy e é revogado no fechamento da etapa.

## Segunda parte: o desfecho viaja com os bytes

A revisão independente da primeira parte encontrou uma inversão possível: o worker liquidava também o marcador de resultado parcial (`{"status":"partial","reason":"calculation_failed"}`) e, na lease seguinte, qualquer byte liquidado disponível virava `succeeded`. Agora o recibo liquidado registra `settled_outcome` e `settled_reason`; o settle v2 recebe os dois, recusa combinações incoerentes (sucesso com motivo de falha) e valida os bytes só depois da autorização da lease; a leitura devolve o desfecho; o worker republica com o desfecho liquidado; e o commit só aceita `succeeded` de um recibo liquidado como sucesso, filtrado pela operação do kernel. O CHECK da coluna exige desfecho, motivo, tamanho, projeção JSON e hash. A migração `execution_settled_outcome` substitui a assinatura do v2 antes de qualquer worker usá-la.

## Worker

O transporte dimensiona o timeout pelo tamanho do payload: 5 s mais 2 s por MiB, teto de 30 s. Reserva replicada como `settled` busca os bytes liquidados, confere forma canônica e hash, e publica sem recomputar; sem bytes disponíveis, continua `operation_uncertain`. O settle envia os bytes exatos.

A prova de comandos (`execution_commands.sql`) passa a reservar e liquidar a operação com id de operação igual ao id da execução, que é a convenção do worker para o único kernel fixado; um sucesso terminal só é aceito com o recibo liquidado dessa operação.

## Provas

`supabase/tests/execution_settled_bytes.sql`: sucesso com motivo de falha recusado, bytes não JSON recusados, replay idêntico, conflito de bytes e de desfecho, hash e desfecho armazenados, perda de lease e nova claim, lease antiga não liquida nem lê, bytes estranhos recusados no commit, publicação sob a lease nova com as duas leases registradas; marcador parcial liquidado continua parcial e nunca vira sucesso; liquidação v1 só por hash de outra lease não publica sucesso e fecha como incerta; grants estreitos. Worker: `process-pinned-execution.test.ts` (publica bytes liquidados por lease anterior sem recomputar; recusa hash ou forma canônica divergente) e `execution-queue.test.ts` (settle v2 com bytes, leitura dos bytes, escala do timeout). Nada aqui concede execução, amplia grant ou toca o produtor. TRUST-APP-01 e TRUST-SDLC-01 sem ampliação de dados ou provedor.
