# Ledger de tentativa e input governado

Dependência publicada: transporte PR861/main25b07ca9. Implementação da etapa20/3Q, sem ativação de M07 ou outra etapa. Ledger e componentes privados não guardam prompt, corpo, URL, credencial ou capability. A decisão de retenção é calculada no SQL a partir do job e das origens reais; nenhum deadline/classificação/allowed fornecido pelo cliente concede direito.

O consumidor é a factory fechada capital-body-processing.ts: recebe revisão de contribuição e request de retenção, usa retainContribution/readOriginal reais e reconstrói por rota o pedido com prepareGatewayInput/buildEffectiveAdapterRequest. Não recebe GatewayRequest, prompt, schema ou lista livre de componentes. Os três recursos inference/prompt_cache/schema_cache são obrigatórios, sem omissões ou duplicatas. Cada dimensão de retenção satisfaz o menor prazo do job, política e toda ancestralidade; cada ancestral precisa também estar dentro do prazo operacional de purge.

worker_authorize_capital_body_processing_v1 persiste uma decisão real e uma tentativa atomicamente. worker_record_capital_body_input_v2 aceita somente a identidade da tentativa autorizada e deriva o recibo dos seus dados; revalida direitos/matriz/clock antes de dispatch, inclusive replay. Mesmo invocation com dados divergentes conflita; política alterada termina a operação. Contenção conhecida repete somente a mesma RPC, de modo limitado. v1 não pode escrever input para invocation registrada no ledger; a ordem inversa também é recusada. Nenhum input fictício é criado para uma tentativa negada.

O SDK prova contribuição → bytes governados → reconstrução → primária negada sem send → fallback permitido com input próprio → um send sintético controlado → accepted/retention/read/replay/purge reais. Assurances sintéticas possuem identidades isoladas, são criadas por comando legítimo apenas local/staging e revogadas no cleanup; nunca representam termos comerciais de produção. As chamadas não usam credencial de provedor nem egress pago. CI executa SQL, SDK/HTTP reais e duas sessões contra revogação, purge e corrida v1/v2. Gate escrito não substitui resultado executado.

Antes da ativação dos produtores: outcomes de repair/fallback após envio, regime estrito por job, receita persistente que enumere todo input M07, contextos privados prospectivos, TaskRun/dependências exatos, materialização/replay e reader histórico. O ledger deste recorte não prova sozinho essas condições. Cópias históricas têm dono na etapa22; novas cópias permanentes não serão introduzidas.

Rollout: staging primeiro, negativos e concorrência reais, produção com journal/carimbo/catálogo conciliados, CI de PR/main e web/worker no merge exato. Sem alteração de controles globais de produção para obter teste verde. Rollback fecha admissão do novo produtor, conserva recibos/ledger e purge e usa migração forward-only; não retorna invocation capturada ao caminho legado. Etapa20 só termina com a sequência restante comprovada, não com este contrato.

## Evidência intermediária de staging em 2 outubro 2026

Ledger aplicado sob carimbo `20261002010601`. O ensaio real identificou um ciclo entre o drain de retenção e o gate de saúde; a migração forward separada `capital_body_attempt_retention_drain` preserva os gates de consumo e separa a prova interna usada pelo purger. A aplicada não foi editada. O SQL `capital_body_attempt_ledger` passou em staging após a forward e o processamento canônico dos wakes de fixture. O bloco canônico RLS das nove tabelas passou; security advisor retornou zero lints.

Qualidade local Node24: lint, typecheck, testes e build PASS, worker1100/web1209/evals272. A primeira execução confinada falhou em sete testes por IPC `tsx` EPERM; a execução autorizada com IPC local passou. SDK/Storage e concorrência CI ainda pendentes. Nenhum resultado desse ensaio autoriza afirmar produção ou etapa20 concluídas.

## Publicação do schema e integração comprovada

Produção recebeu `20261002014202_capital_body_attempt_ledger`, `20261002014214_capital_body_attempt_retention_drain` e `20261002014224_capital_body_attempt_fk_index`. Staging usa respectivamente `20261002010601`, `20261002011300` e seu carimbo de índice conferido no journal. As46 funções desta fronteira são iguais nos dois catálogos; security advisors0, índice válido, produção com zero attempts, zero objetos físicos e zero purge pendente. Nenhuma fixture em produção.

SDK original em staging:17 checks PASS, primary0/fallback1, source/request/parsed output vinculados, replay sem nova chamada, Storage direto/info negados e POST reavaliado por escopo. Quatro corpos de fixture foram apagados por DELETE/INFO404/ACK com catálogo0. Jobs, token e login da fixture encerrados; controls globais não foram modificados. Provedor controlado sintético, sem afirmar egress comercial.

Run candidato Quality36950623145: SQLsuite, HTTP/SDK reais, todas as corridas ledger/inputv2, snapshots efetivos e E2E passaram. Gate de inventário recusou corretamente as versões antes do refresh productionjournal. O gate web detectou um travessão acrescentado na documentação depois da execução local; correção focal5/5 PASS. Nova execução completa no commit final e rollout web/worker permanecem obrigatórios.
