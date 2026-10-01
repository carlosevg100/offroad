# Etapa 20 / 3Q: builder compartilhado do input efetivo

## Contrato

`packages/model-gateway/src/effective-input.ts` reúne a preparação síncrona e a construção pura do pedido ao adapter. A preparação copia input, metadata e classificação antes de qualquer await, aplica a redação uma vez e fixa a representação JSON do schema. Congela somente dados próprios; o Zod compartilhado continua sendo o validador. A tentativa usa rota, defaults fixados e orientação de reparo explícitos. O mesmo builder permite reconstruir o pedido a partir de componentes recuperados e versões autorizadas, sem aceitar um hash como substituto dos bytes.

O gateway usa este builder no dispatch atual. Reparo recebe a orientação anexada ao sistema; fallback volta ao sistema base. Limites, reserva, elegibilidade e atestação continuam nas fronteiras existentes. `assertGatewaySchemaUnchanged` verifica novamente a representação JSON antes de enviar. Refinements e closures não representáveis em JSON Schema não são comprovados por esta comparação.

`input-serialization.ts` preserva exatamente `gateway-adapter-input.v1`, inclusive ordenação histórica por localeCompare. `gateway-adapter-input.v2` usa comparação ordinal UTF-16, arrays na ordem original e JSON finito, sem normalização Unicode. A API retorna a versão junto dos fingerprints v2; dados não JSON são recusados. Dispatch, logs, recibos e cassettes existentes permanecem v1. Não rebatizar nem rehashar recibos históricos.

## Escopo e continuidade

Este incremento remove a montagem duplicada do pedido do gateway e a torna compartilhada com a futura reconstrução. Não acrescenta tabelas, RPCs, grants, políticas, rotas ou flags. Não ativa produtores nem armazena prompt, schema, snippet ou resposta em telemetria. O hash representa o pedido ao adapter; os SDKs ainda fazem suas transformações de transporte.

A receita persistente continua exigindo componentes privados com origem legítima, referências retidas, versões de transformação, autorização atual e recuperação física verificável. Resultado compartilhado exige retenção própria com restrições herdadas. O rascunho SQL externo não será publicado como núcleo pronto enquanto negar toda admissão e não conseguir resolver esses componentes. Hash sozinho não autoriza, retém nem reconstrói conteúdo.

## Eval e riscos

Testes do builder e da serialização rodam no Quality/check com os demais testes do gateway: equivalência v1 ao algoritmo histórico, unicode/ordenação independente de locale, redação, cópia e congelamento, settings, schema, repair/fallback e igualdade entre reconstrução e dispatch. Os testes existentes de deadline, negação de atestação e contabilidade permanecem obrigatórios. Revisão independente verifica as fronteiras de mutação e ausência de conteúdo nos recibos/logs.

Controles: APP-11, AI-03/05/07 e SEC-010/011/015. Rollback por reversão do commit e redeploy, sem migração ou backfill. Os próximos contratos precisam persistir a versão realmente usada e revalidar direitos; não usar defaults atuais para reconstruir uma tentativa antiga. A orientação efetiva é fixada antes de `onCall`; o consumidor de receita ainda precisa possuir e fixar os diagnósticos que persistirá, pois o callback atual recebe diagnósticos mutáveis. O builder calcula v1 para compatibilidade mesmo quando o caller solicita v2; o hash v2 não depende da ordenação usada em v1. O 3Q e a etapa 20 permanecem abertos; etapas 21 a 24 aguardam OK de onda.
