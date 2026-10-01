# Etapa 20 / 3Q: identidade da resposta aceita

## Contrato

`packages/model-gateway/src/types.ts` define `GatewayAcceptedInvocation`; `gateway.ts` devolve esse descritor somente depois da validação do schema e da validação semântica. A identidade é a invocação local que efetivamente passou, inclusive em reparo ou fallback. Não é o request-id externo, a última linha de telemetria nem a primeira tentativa. O descritor imutável contém apenas metadados e fingerprints, sem prompt, snippet ou resposta.

`gateway-adapter-input.v1` continua identificando o pedido ao adapter. `gateway-parsed-output.v1` identifica o resultado do parse aceito que o consumidor recebe, usando a serialização histórica; não identifica o texto bruto nem os bytes de transporte do SDK. Defaults e transformações do schema pertencem ao parse; não repetir a transformação para validar uma cópia. O descritor fixa provedor, modelos configurado/reportado, schema, ordinal, reparo/fallback, origem cassette e recibo de input quando existe. Replay de cassette cria uma invocação local nova, sem provar envio externo.

A resposta do adapter e da cassette passa a ser uma cópia própria antes do processamento. A gravação da cassette recebe outra cópia. O output aceito também é próprio: o validador semântico recebe uma cópia congelada, e uma tentativa de alterá-la segue a recusa determinística existente. O callback de telemetria recebe usage independente. Assim esses callbacks não podem alterar o conteúdo usado para o fingerprint ou a contabilidade do retorno. O consumidor continua responsável por preservar a resposta que recebe antes de qualquer mutação sua.

## Continuidade e escopo

`acceptedInvocation` é opcional no tipo de retorno para manter compatibilidade com implementações históricas e mocks; a implementação concreta do gateway sempre o devolve em sucesso. O futuro consumidor de captura nativa deve recusar sua ausência e exigir recibo resolvido sob autoridade atual. Presença do DTO ou hash não concede direito de uso, não retém bytes e não promove captura, artefato ou release. A v2 ordinal do builder continua opt-in.

Este corte não cria tabela, migração, RPC, grant, política, rota ou flag. Substitui o compartilhamento mutável nas fronteiras do gateway e expõe a identidade necessária à retenção da resposta. O serviço operacional de corpos e a integração M07 seguem em cortes dependentes, com writers, readers e eliminação avaliados em conjunto. Não publicar um serviço que apenas registre `unresolved` como solução de captura. Conteúdo histórico sem prova não recebe licença retroativa. Etapa 20/3Q permanece aberta; etapas 21 a 24 aguardam OK de onda.

## Eval e riscos

`accepted-invocation.test.ts` cobre tentativa inicial, reparo, fallback, recusa por política/recibo, cassette e ataques de mutação nas fronteiras do resultado. Roda no Quality/check com a suíte completa do gateway. Testes existentes de deadline, orçamento, elegibilidade e semantic validation continuam obrigatórios. Revisão independente verifica o vínculo entre output e fingerprint e a ausência de conteúdo no descritor.

Controles: APP-11, AI-03/05/07 e SEC-010/011/015. Reversão por revert e redeploy, sem DDL ou backfill. O descritor não é assinatura nem autorização SQL: o serviço de corpos deverá resolver o recibo, escopo, direitos, ancestrais, prazo e hash físico separadamente. A resposta parsed e o material derivado precisam de retenções próprias; o prazo do derivado não renova o ancestral. Closures arbitrárias e efeitos externos de callbacks não são comprovados pelo fingerprint.
