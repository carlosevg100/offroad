# Protocolo normativo único: outcomes e dispatch SDK

Decisão CTO consolidada em 02/10/2026. Especificação prospectiva externa: nenhum DTO/RPC novo abaixo é declarado instalado. PR862 concluída, main0886e45b; este incremento está em implementação e seus gates ainda precisam passar. Este arquivo é a única referência normativa de nomes, enums, tuple, fingerprint e receipts; CONTRATO-OUTCOMES.md e CONTRATO-OUTCOMES-BANCO.md remetem a ele e não definem outro protocolo.

## 1. Limite e identidade durável

Consumidor inicial: renderer SDK fechado structured sobre contribution_input realmente retido. Não ativa M07, repair nativo, historical reader ou novo grant de recovery. Outcome não contém corpo, raw output, exception, message, path/key privada, allowedValues, guidance, schema body, URL ou metadata livre.

Operação servidor UNIQUE `(organization_id,work_id,contribution_origin_id)`. Renderer/version, job e source/body/input/prompt pins são campos imutáveis, não dimensões que concedem orçamento novo. O servidor resolve contribution_origin_id pela retained body basis real, não retentionRequestId/UUID/hash arbitrário. Nova factory e novo renderer para a mesma origem não ganham outra raiz ou budget. Job sucessor nega até recovery grant legítimo futuro. Nova operação exige nova origem legítima pelo comando humano de contribuição; não novo request ID. Budget privado fixado no servidor: dois dispatch claims e um USD conservador; mesma operation/root entre processos.

Authorize v2 decide route/resources/rights/policy, sem reservar orçamento. Input v3 atomiza revalidação + reserva + one-time dispatch claim. Unknown conserva reserva; SQL não libera reserva nem por measured success. Exposição conservadora do outcome nativo é max(reservationMicroUsd,costMicroUsd conhecido). Gateway spent/cost/usage/exposure/logs históricos permanecem como hoje; normalização deste protocolo é nova e exclusiva do ledger/autoridade conservadora.

Precisão normativa de autoridade: reservationMicroUsd/exposureMicroUsd da tuple são observados pelo core, não limites servidor provados pelo próprio p_attempt. O servidor deriva bound distinto de body byteLength legítimo (cap100000), schema/system/framing versionados medidos, maxOutput1000 e preços das routes pinados. Claim serverReservationMicroUsd=MAX(serverBoundMicroUsd,reservationMicroUsd observado); exposure SQL=MAX(serverReservationMicroUsd,knownCostMicroUsd). Tuple core conserva observed MAX(observedReservation,knownCost); não fingir igualdade de server claim com reserva observada. Drift de schema/prices/renderer/bounds nega, e campo zero caller não reduz budget grant. SDK recompõe conservativeTextReservationUsd do pedido efetivo real para verificar observed e exige serverReservation>=observed. Gates SQL/JS dos bounds pinados e negativo low0 são obrigatórios; decisão allowed isolada não prova grant de custo.

## 2. DTO core estrito

`schemaVersion: 'gateway-attempt-outcome.v1'`; `fingerprintVersion: 'gateway-attempt-outcome-fingerprint.v1'`; `outcomeFingerprint: hex64` computado no core; demais campos são exatamente os slots 2–31 abaixo. Não aceitar keys adicionais ou undefined. Ausência obrigatória é null.

| Pos | Campo | Tipo / regra |
|---|---|---|
| 1 | fingerprintVersion | literal gateway-attempt-outcome-fingerprint.v1 |
| 2 | invocationId | UUID lowercase sintaticamente válido |
| 3 | task | TaskKind de registry pinado |
| 4 | provider | anthropic ou openai |
| 5 | configuredModel | modelo ASCII limitado; factory nativa fixa o modelo exato da tentativa |
| 6 | schemaName | schema registry pinado do renderer |
| 7 | adapterInputVersion | gateway-adapter-input.v1 neste corte |
| 8 | requestFingerprint | hex64 do pedido efetivo reconstruído |
| 9 | inputFingerprint | hex64 histórico gateway, não SHA Storage |
| 10 | promptFingerprint | hex64 histórico gateway |
| 11 | previousInvocationId | UUID ou null, imediato predecessor real |
| 12 | retryOrdinal | inteiro seguro não negativo; zero no native structured |
| 13 | isSameModelRepair | boolean; false no native structured |
| 14 | usedProviderFallback | boolean |
| 15 | processingDecisionId | UUID ou null genérico; UUID obrigatório native |
| 16 | inputAttestationReceiptId | UUID ou null genérico; UUID obrigatório native |
| 17 | fromCassette | boolean; native exige false |
| 18 | outcome | accepted, invalid_output, provider_error, timeout ou refusal |
| 19 | failureCode | enum compatível abaixo ou null |
| 20 | outputFingerprintVersion | gateway-parsed-output.v1 somente accepted; outros null |
| 21 | outputFingerprint | hex64 parsed.data pós schema/validator somente accepted; outros null |
| 22 | reportedModel | modelo ASCII limitado ligado ao accepted; factory nativa exige o modelo configurado exato; outros null |
| 23 | validationIssueCodeFingerprint | hex64 somente invalid_output ou null |
| 24 | reservationMicroUsd | inteiro seguro não negativo |
| 25 | costMicroUsd | inteiro seguro não negativo conhecido ou null unknown |
| 26 | exposureMicroUsd | inteiro seguro não negativo, regra conservadora abaixo |
| 27 | costStatus | measured, unknown ou cassette; native recusa cassette |
| 28 | inputTokens | inteiro seguro não negativo conhecido ou null |
| 29 | outputTokens | inteiro seguro não negativo conhecido ou null |
| 30 | cachedInputTokens | inteiro seguro não negativo conhecido ou null |
| 31 | latencyMillis | inteiro seguro não negativo, ceil dos milliseconds |

Enums failureCode: accepted→null; invalid_output→schema_invalid|deterministic_invalid|output_truncated; provider_error→provider_failure; timeout→provider_timeout; refusal→provider_refusal. Sem SDK diagnostic string. Unknown exige costMicroUsd/tokens todos null e exposureMicroUsd=reservationMicroUsd. Measured exige cost e três token inteiros conhecidos, exposure=max(reservation,cost). Timeout/provider_error unknown neste corte. Cassette genérico usa cost=0/exposure=0, preservando ausência de envio; native nunca o persiste. ReportedModel accepted resolve alias previamente registrado para provider/configuredModel/schema versão; SDK inicial exige reportedModel=configuredModel. Valor SDK arbitrário não é binding válido.

SchemaVersion/outcomeFingerprint não entram na tuple porque a versão de algoritmo é slot1 e o hash não inclui a si mesmo. Não acrescentar operationId/rootAttemptReceiptId/attemptReceiptId à tuple: core não conhece esses IDs. SQL deriva essas identidades e o SDK compara-as no receipt separado. Parsed output/raw invalid/physical body SHA têm namespaces separados; nenhum rehash de fingerprints históricos v1.

## 3. Canonicalização e micros

Reusar `ordinalGatewayStableText`/`ordinalGatewayFingerprint` existente: SHA256 de UTF8 da tuple fixedfields na ordem da tabela. Não localeCompare, objeto livre, JSON.stringify de request ou digest(jsonb::text) global. Strings admissíveis na tuple são ASCII de gramática limitada ou UUID/hex; a factory nativa restringe task, schema e modelo exatos, enquanto o módulo genérico não declara um registry de aliases; não CR/LF/quotes/backslash/chaves privadas. Boolean/null literais; integers base10 sem exponent. SQL reconstrói os 31 scalar slots validados e compacta em ordinal com vírgulas sem espaço e colchetes. `jsonb_array_elements ... WITH ORDINALITY`, ORDER BY ordinal e serialização dos scalar slots validados podem fornecer o texto; usar o array inteiro `::text` introduz espaços e é proibido como algoritmo comum. Digest SHA256 UTF8 deve coincidir byte a byte com Node ordinal serializer.

Monetário: aceitar Number finite não negativo e não -0. Normalizar a representação decimal canônica JSON do Number para coeficiente+escala e computar ceil(valor_decimal*1000000) por aritmética inteira/decimal exata. JS implementa coeficiente/escala com BigInt (incluindo exponent), SQL usa numeric sobre o mesmo decimal recebido. Não usar multiplicação float seguida de ceil como especificação: 0.0000001/1.000001 têm artefatos binários e podem divergir. O protocolo transporte entrega somente o inteiro normalizado seguro; SQL verifica reserva against attempt/reservation server pin normalizado pelo mesmo algoritmo. Não arredondar para baixo, não comparar hash de float livre. Valores cujo resultado >9007199254740991 negam.

Tokens devem ser inteiros seguros, não arredondar token fractional. Latência é finite não negativa, ceil(ms) e resultado inteiro seguro. Unknown não vira custo zero. SQL exige integer JSON scale zero e domínio seguro; 0.1 onde se espera micros inteiro nega.

Vetores compartilhados obrigatórios SQL/Node (esperados como strings inteiras em fixtures): USD0→0; 0.0000001→1; 0.000001→1; 0.0000010000001→2; 0.0000011→2; 0.1→100000; 1.000001→1000001; 1.000001000001→1000002; 1e-7→1; 1e-12→1; 1e3→1000000000. Negativos: NaN/Infinity/-Infinity/-0/-0.000001, resultado acima safeinteger, null known cost, token0.5 e latency negativo. Latency0→0/0.01→1/10.01→11. Exposure reserva100/custo50→100, reserva100/custo150→150, unknown(reserva100)→100 com cost=null. Nunca SQL exposure50 no primeiro caso. Cassettes só generic0. Vetores dos cinco outcomes com optional nulls devem produzir mesmo texto e SHA nos dois runtimes; arrays com 30/32 slots, enums desconhecidos e strings Unicode privadas negam antes de hash.

## 4. RPCs e receipts únicos

`worker_authorize_capital_body_processing_v2(p_job_id,p_capability_token,p_attempt,p_route,p_resources,p_purpose,p_components)` mantém parâmetros reais já conhecidos do v1, resolve operação servidor e regime novo. DTO processing-decision.v2 estende o contrato decision v1 com operationId/rootAttemptReceiptId. `terminal_outcome_required=true` é servidor; rows legítimas PR862 permanecem false sem backfill/update append-only. Regime novo nega novos v1 roots da mesma origem e v1 possible-send anterior impede abrir budget v2, em ambas as ordens; replay histórico legítimo conserva modo.

`worker_record_capital_body_input_v3(p_job_id,p_capability_token,p_attempt_receipt_id)` atomiza source/policy/deadline recheck, budget reservation e dispatch claim único. DTO estrito proposto `{schemaVersion:'capital-body-input-dispatch.v3',receiptId,invocationId,requestFingerprint,operationId,attemptReceiptId,rootAttemptReceiptId,dispatchClaimId,reservationMicroUsd,serverReservationMicroUsd,dispatchAllowed,replayed}`. IDs UUID/FPhex e ambas reservas inteiras seguras, serverReservation>=observed. Primeiro grant só dispatchAllowed=true/replayed=false. Replay confirmado não é novo envio: false/true, adapter termina/recovery. Receipt original/claim persistem; transporte ambíguo ou processo caído não ganha novo grant. Adapter converte para GatewayInputReceipt existente SOMENTE depois dessas verificações; core não recebe secret/path/serverbudget mutable.

`worker_record_capital_body_attempt_outcome_v1(p_job_id,p_capability_token,p_attempt_receipt_id,p_outcome)` recebe DTO core estrito inteiro, sem campos privados extras. SQL resolve operação/attempt/input/dispatch claim e compara todos os slots contra identity/route/hash pinados antes de recomputar common fingerprint. Tabela privada capital_body_attempt_outcomes append-only, conclusão única por attempt/input/invocation; accepted proíbe filho antes do posterior accepted_v1; failure impede accepted. Replay igual retorna receipt original sem data/prazo/exposure novo; divergence nega. Unique e locks comuns impedem fork/dupla conclusão, v1/v2/claim/outcome em duas sessões.

Receipt SQL strict: `{schemaVersion:'capital-body-attempt-outcome-receipt.v1',receiptId,operationId,attemptReceiptId,inputReceiptId,rootAttemptReceiptId,invocationId,requestFingerprint,fingerprintVersion,outcomeFingerprint,outcome,failureCode,replayed}`. UUIDs/hex/version/enum iguais ao DTO e à operation previamente fixada. SDK compara todas as identidades e transforma para receipt core strict `{schemaVersion:'gateway-attempt-outcome-receipt.v1',receiptId,invocationId,requestFingerprint,fingerprintVersion,outcomeFingerprint,outcome,failureCode}`. Nenhum SQL metadataFingerprint opaco integra esses receipts; se útil para internals, é outro campo/namespace explicitamente versionado, nunca equivalência JS.

## 5. Core e falhas

Hook aguardado `recordAttemptOutcome`, fixado antes do primeiro await. Callback fora do catch de provider, depois ownership/parsing/validator/custo e antes next eligibility/repair/fallback/accepted return. Receipt não bound, erro/timeout ou policy changed termina gateway, sem catch virar provider_error/fallback. Deadline bounded10s. Retry somente known-lock/pending40001 exato, mesma RPC/args/identity, até três; 42501/unknown40001/transporttimeout terminal. Nenhum model redispatch escondido.

No native structured, primary SQLdenied continua predecessor factual sem input/outcome sent; allowed predecessor precisa outcome terminal não accepted ligado ao input/claim reais. Core preserva histórico sem hook; consumidor native exige hook+v2/v3. Refusal é ramo explícito; timeout Promise.race não cancela SDK, mantém exposição unknown e late result não altera conclusão. Invalid_output não guarda rejected bytes. onCall permanece síncrono sem autoridade e não pode causar novo envio por erro/mutação.

Revogação pós envio: qualquer negação de auth/current rights/deadline no writer deixa unresolved terminal. Nenhum writer factual privilegiado novo. Não materializar body/seal nem dispatch filho; gateway conserva custo ocorrido. Pending purge/assurance revoked são reavaliados conforme helpers reais, sem renovar prazos. Accepted fingerprint sem body durável não prova recovery: antes de M07 o handoff parsed-output/retention precisa receipt real e leitor/recovery/purge; crash sem bytes nunca refaz modelo.

## 6. Gates antes de implementação/publicação

SQL/Node vetores shared+rounding+31slots; schema/key/privatecanary negatives; real source→rebuild→attempt/input_v3/outcome→accepted/body SDK; primarydenied0send/fallback1send e primaryfailure→persist→fallback; hook slow/fail/wrongreceipt zero próximo send; same origin em duas factories/jobs/renderer nenhum budget reset; input replay/response lost não redispatch; accepted-vs-failure/claim/rights/purge races ambas ordens; micros/exposure/budget unknown e measured; legado PR862 replay disponível e newv1root bypass negado. CI/fullgate/SDK/SQL/HTTP são provas distintas, nenhuma declarada PASS por esta especificação.

## 7. Policy fingerprint de dispatch: definição única

Input v3 acrescenta rendererPolicyFingerprint hex64 obrigatório. A tuple de policy é EXATAMENTE 21 slots: `["capital-body-dispatch-policy.v1","capital-body-contribution-renderer.v1",provider,configuredModel,systemSha256,systemBytes,schemaSha256,schemaBytes,1024,100000,1000,inputRateMicroUsdPerMillion,cacheWriteRateMicroUsdPerMillion,outputRateMicroUsdPerMillion,11,10,longThreshold,longInputMultiplierNumerator,longInputMultiplierDenominator,longOutputMultiplierNumerator,longOutputMultiplierDenominator]`. Hash SHA256 de texto ordinal existente, SQL compactscalar igual. Sem body/source path/schema value na tuple.

Worker mede bytes/hash atuais do system UTF8 e JSON.stringify do format realmente usado: buildAnthropicParams(adapterRequest).output_config.format ou toOpenAIStrictSchema(z.toJSONSchema(schema)) OpenAI. Os pins esperados medidos Node24: system128bytes SHA926c94492e1ff85de2b9b0be7803ce5ebb4e0ce358b908b5b665188434143a29; Sonnet format10656bytes SHA9ff59776a5ad01758912a6ec57f9468d3068b3e23604932761ddf548e2cb640b; Terra strictschema5630bytes SHA2e71ff14ecbc6727c8cd56fbd96009850d368bfddf8e36472d9b67eb2785d29d. Preços Sonnet: input2000000/cacheWrite2500000/output10000000; long0/1/1/1/1. Terra: input2000000/cacheWrite2500000/output12000000; long272000/2/1/3/2. Cached read esperado0.2 USD/M permanece menor que max(input,cacheWrite); drift desse pin também nega no worker. Preços são valores microUSD por um milhão de tokens; não USD por token.

Bound servidor tokens=bodyByteLength+schemaBytes+systemBytes+1024, todo byte como um token conservador; tokens body+framing <=100000+10656+128+1024, portanto threshold272000 não cruza neste corte. Numerador de microUSD = `(tokens*MAX(inputRateMicroUsdPerMillion,cacheWriteRateMicroUsdPerMillion)+1000*outputRateMicroUsdPerMillion)*11`; denominador10000000 (=10*1000000); bound=ceil da divisão inteira, com bigint seguro. Longtariff fica pinado e não é ignorado se futuro domínio permitir cruzar threshold. Claim=MAX(bound,observedReservation); SQLexposure=MAX(claim,knowncost) semrelease. Worker valida request1000output/structured + policyFP actual + observedconservativeTextReservationUsd real antes dispatch. Pins divergentes exigem novo desenho/publicação deliberada, não refazer hash caller para esconder drift.
