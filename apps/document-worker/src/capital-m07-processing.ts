/** Closed prospective M07 consumer. Ports must perform server authority checks;
 * this module never promotes the pure recipe's unresolved DTO into permission. */
import {createHash} from "node:crypto";
import {z} from "zod";
import {originationSeniorReadoutSchema, originationSeniorReadoutArtifactSchema} from "@offroad/domain-contracts";
import {assertGatewaySchemaUnchanged, prepareGatewayInput, createModelGateway, defaultTaskPolicies, resolveModel, listPrices,
  conservativeMicroUsd, conservativeTextReservationUsd, ordinalGatewayFingerprint, legacyGatewayFingerprint,
  gatewayAttemptOutcomeSchema, gatewayAttemptOutcomeReceiptSchema, verifyAttemptOutcomeReceipt, attemptOutcomeTuple, toOpenAIStrictSchema,
  ModelGatewayError,retentionMatrixVersion, type GatewayAttempt, type GatewayAttemptOutcome, type GatewayAcceptedInvocation, type ModelGatewayConfig, type GatewayCallLog} from "@offroad/model-gateway";
import {prepareCapitalPublicTaskRecipe, reconstructCapitalPublicTaskRequest, capitalPublicTaskRecipeSchema} from "./capital-public-task-recipe";
import {providerConnectionsSchema, providerEndpoints, type ProviderConnections} from "./provider-processing";
import {capitalM07ExecutionFailureReasonSchema, CapitalM07ExecutionFailure,capitalM07ExecutionFailureReceiptSchema} from "./capital-m07-protocol";
import type {CapitalBodyRetentionReceipt} from "./capital-body-retention";
const uuid = z.uuid(), hash = z.string().regex(/^[a-f0-9]{64}$/), micros = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const capitalM07RendererVersion = "capital-public-task-renderer.m07.v1";
export const capitalM07RecipeReceiptSchema = z.strictObject({schemaVersion: z.literal("capital-m07-recipe-receipt.v1"), state: z.literal("ready"),
  recipeId: uuid, taskRunId: uuid, jobId: uuid, organizationId: uuid, workId: uuid, planId: uuid, planFingerprint: hash,
  locale: z.enum(["pt-BR", "en-US"]), asOfDate: z.iso.date(), rendererVersion: z.literal(capitalM07RendererVersion), recipeFingerprint: hash,
  reconstructionFingerprint: hash, contextRetainedPayloadId: uuid, operationalBudget:z.strictObject({schemaVersion:z.literal("capital-m07-operational-budget.v1"),researchReservationVersion:z.literal("public-research-reservation.m07.v1"),researchReservationMicroUsd:z.number().int().min(0).max(300000),maxExposureMicroUsd:z.number().int().positive().max(3000000),maxDispatches:z.number().int().min(1).max(2)}), components: capitalPublicTaskRecipeSchema.shape.components, expiresAt: z.iso.datetime({offset: true})});
export type CapitalM07RecipeReceipt = z.infer<typeof capitalM07RecipeReceiptSchema>;
const decisionSchema = z.strictObject({schemaVersion: z.literal("capital-body-processing-decision.v2"), allowed: z.boolean(), policyVersion: z.literal(retentionMatrixVersion),
  assuranceId: uuid.nullable(), assuranceIds: z.array(uuid).max(3), decisionId: uuid, classification: z.enum(["confidential", "restricted"]), reasons: z.array(z.string().regex(/^[a-z_:]+$/)),
  attemptReceiptId: uuid, invocationId: uuid, requestFingerprint: hash, eligibilityFingerprint: hash, replayed: z.boolean(), operationId: uuid, rootAttemptReceiptId: uuid});
const dispatchSchema = z.strictObject({schemaVersion: z.literal("capital-body-input-dispatch.v3"), receiptId: uuid, invocationId: uuid, requestFingerprint: hash, operationId: uuid,
  attemptReceiptId: uuid, rootAttemptReceiptId: uuid, dispatchClaimId: uuid, rendererPolicyFingerprint: hash, reservationMicroUsd: micros, serverReservationMicroUsd: micros,
  dispatchAllowed: z.boolean(), replayed: z.boolean()});
const outcomeReceiptSchema = gatewayAttemptOutcomeReceiptSchema.omit({schemaVersion: true}).extend({schemaVersion: z.literal("capital-body-attempt-outcome-receipt.v1"),
  operationId: uuid, attemptReceiptId: uuid, inputReceiptId: uuid, rootAttemptReceiptId: uuid, replayed: z.boolean()}).strict();
const time = z.iso.datetime({offset: true});
const scopeSchema = z.strictObject({schemaVersion: z.literal("capital-retained-body.v1"), retentionState: z.enum(["allocated", "retained"]),
  allocationId: uuid, retainedPayloadId: uuid.nullable(), bodyBasisId: uuid, bucket: z.literal("capital-input-capture"),
  path: z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/payload\.json$/), payloadFingerprint: hash,
  byteLength: z.number().int().positive().max(1048576), storageObjectId: uuid.nullable(), storageVersion: z.string().min(1).nullable(),
  retainedAt: time, uploadExpiresAt: time, expiresAt: time, purgeAt: time, replayed: z.boolean()});
const bindingSchema = z.strictObject({recipeId: uuid, invocationId: uuid, inputReceiptId: uuid, outputFingerprint: hash});
export interface CapitalM07RetainedOutput {
  binding: z.infer<typeof bindingSchema>;
  scope: CapitalBodyRetentionReceipt;
}
export interface CapitalM07ProcessingPorts {
  loadRecipe(taskRunId: string): Promise<{receipt: unknown; preparation: Parameters<typeof prepareCapitalPublicTaskRecipe>[0]}>;
  revalidateRecipe(receipt: CapitalM07RecipeReceipt): Promise<unknown>;
  recoverAccepted(receipt: CapitalM07RecipeReceipt): Promise<CapitalM07RetainedOutput | null>;
  authorize(input: {recipeId: string; attempt: GatewayAttempt; route: Record<string, string>; resources: string[]; purpose: "case_analysis"}): Promise<unknown>;
  dispatch(attemptReceiptId: string): Promise<unknown>;
  outcome(attemptReceiptId: string, outcome: GatewayAttemptOutcome): Promise<unknown>;
  retainAccepted(input: {recipe: CapitalM07RecipeReceipt; accepted: GatewayAcceptedInvocation; output: z.infer<typeof originationSeniorReadoutSchema>}): Promise<CapitalM07RetainedOutput>;
  recordExecutionFailure(input:{recipeId:string;reason:z.infer<typeof capitalM07ExecutionFailureReasonSchema>}):Promise<unknown>;
  readAccepted(output: CapitalM07RetainedOutput): Promise<{bytes: Uint8Array; scope: CapitalBodyRetentionReceipt}>;
}
function deny(): never {throw new Error("capital_m07_processing_denied");}
function owned<T>(value: T): T {if (value && typeof value === "object") {for (const child of Object.values(value)) owned(child); Object.freeze(value);} return value;}
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const same = (left: unknown, right: unknown) => legacyGatewayFingerprint(left) === legacyGatewayFingerprint(right);
/** Policy hash includes actual schema/system bytes, registry rates and long tariffs. */
export function capitalM07DispatchPolicyFingerprint(request: ReturnType<typeof reconstructCapitalPublicTaskRequest>["adapterRequest"]) {
  const price = listPrices[request.model], sol = request.model === "gpt-5.6-sol";
  if (!price || !["gpt-5.6-sol", "gpt-5.6-terra"].includes(request.model) || request.effort !== "high" || request.maxOutputTokens !== 24000
    || request.timeoutMs !== 360000 || request.cacheKey !== "origination-senior-readout-v6" || request.outputMode !== "structured"
    || price.input !== (sol ? 4 : 2) || price.output !== (sol ? 20 : 12) || price.cacheWrite !== (sol ? 5 : 2.5) || price.cachedInput !== (sol ? 0.4 : 0.2)
    || !same(price.longContext, {aboveInputTokens: 272000, inputMultiplier: 2, outputMultiplier: 1.5})) deny();
  const bytes = Buffer.from(JSON.stringify(toOpenAIStrictSchema(z.toJSONSchema(request.schema) as Parameters<typeof toOpenAIStrictSchema>[0])));
  if (Buffer.byteLength(request.system) !== 6496 || sha(request.system) !== "9cb22a6f263d825c293daf948e348a5956a794e876cb78bb64ed8c00488af30d"
    || bytes.length !== 5630 || sha(bytes) !== "2e71ff14ecbc6727c8cd56fbd96009850d368bfddf8e36472d9b67eb2785d29d") deny();
  return ordinalGatewayFingerprint(["capital-m07-dispatch-policy.v1", capitalM07RendererVersion, "openai", request.model, "high", sha(request.system), 6496,
    sha(bytes), bytes.length, 1024, 100000, 24000, conservativeMicroUsd(price.input), conservativeMicroUsd(price.cacheWrite), conservativeMicroUsd(price.output),
    11, 10, 272000, 2, 1, 3, 2, "origination-senior-readout-v6"]);
}
export function createCapitalM07Processing(config: {jobId: string; ports: CapitalM07ProcessingPorts; connections: ProviderConnections; adapters: ModelGatewayConfig["adapters"]; budget?: {maxCostUsd:number;maxCalls:number}; onCall?:(call:GatewayCallLog)=>void; now?: () => number}) {
  const jobId = uuid.parse(config.jobId), connection = owned(providerConnectionsSchema.parse(structuredClone(config.connections))).openai;
  if (!connection || config.adapters.openai?.provider !== "openai") deny();
  const adapter = Object.freeze({provider: "openai" as const, complete: config.adapters.openai.complete.bind(config.adapters.openai)});
  const methods = ["loadRecipe", "revalidateRecipe", "recoverAccepted", "authorize", "dispatch", "outcome", "retainAccepted", "readAccepted", "recordExecutionFailure"] as const;
  const ports = Object.fromEntries(methods.map(key => {const fn = config.ports[key]; if (typeof fn !== "function") deny(); return [key, fn.bind(config.ports)];})) as unknown as CapitalM07ProcessingPorts;
  for (const method of ["loadRecipe", "revalidateRecipe", "recoverAccepted", "authorize", "dispatch", "outcome", "retainAccepted", "readAccepted", "recordExecutionFailure"] as const) if (typeof ports[method] !== "function") deny();
  const maxCostUsd=Math.min(3, config.budget?.maxCostUsd ?? 3), maxCalls=Math.min(2, config.budget?.maxCalls ?? 2);
  if(!Number.isFinite(maxCostUsd)||maxCostUsd<=0||!Number.isInteger(maxCalls)||maxCalls<=0)deny();
  const now = config.now ?? Date.now, policies = owned(structuredClone(defaultTaskPolicies)), prices = owned(structuredClone(listPrices));
  const resolved = resolveModel("origination_thesis", policies, {});
  if (!same(resolved.primary, {provider: "openai", model: "gpt-5.6-sol", effort: "high"}) || !same(resolved.fallback, {provider: "openai", model: "gpt-5.6-terra", effort: "high"})) deny();
  const routes = [resolved.primary, resolved.fallback!], defaults = {maxOutputTokens: 24000, timeoutMs: 360000};
  let started = false;
  let failureRecipe:CapitalM07RecipeReceipt|undefined,denied=false,nonaccepted=false,candidateAccepted=false,serverBudgetDenied=false;
  return Object.freeze({run: async (taskRunId: string) => {
    try {
      if (started) deny(); started = true; uuid.parse(taskRunId);
      const loaded = await ports.loadRecipe(taskRunId), receipt = owned(capitalM07RecipeReceiptSchema.parse(structuredClone(loaded.receipt)));
      failureRecipe=receipt;
      const reconstruction = prepareCapitalPublicTaskRecipe(loaded.preparation), pure = reconstruction.recipe;
      if (receipt.jobId !== jobId || receipt.taskRunId !== taskRunId || Date.parse(receipt.expiresAt) <= now()
        || !["organizationId", "workId", "planId", "planFingerprint", "locale", "asOfDate", "reconstructionFingerprint", "components"].every(key => same(receipt[key as keyof typeof receipt], pure[key as keyof typeof pure]))) deny();
      const request = {...reconstruction.prepared.request, requireInputAttestation: true, outputMode: "structured" as const, timeoutMs: 360000, dataHandling: {classification: "confidential" as const, purpose: "case_analysis" as const, requiredPolicyVersion: retentionMatrixVersion}};
      // Re-prepare using the common builder to include the explicitly fixed execution mode.
      const prepared = prepareGatewayInput(request);
      if (prepared.input.reduce((size, part) => size + (part.type === "text" ? Buffer.byteLength(part.text) : 100001), 0) > 100000) deny();
      const effective = routes.map(route => reconstructCapitalPublicTaskRequest({...reconstruction, prepared}, route, defaults));
      const policyPins = effective.map(built => capitalM07DispatchPolicyFingerprint(built.adapterRequest));
      const revalidate = async () => {
        assertGatewaySchemaUnchanged(prepared);
        const current = capitalM07RecipeReceiptSchema.parse(await ports.revalidateRecipe(receipt));
        if (!same(current, receipt) || Date.parse(current.expiresAt) <= now()) deny();
      };
      const read = async (retained: CapitalM07RetainedOutput) => {
        const binding = bindingSchema.parse(retained.binding), scope = owned(scopeSchema.parse(structuredClone(retained.scope)));
        if (scope.path!==`${receipt.organizationId}/${scope.allocationId}/payload.json` || binding.recipeId !== receipt.recipeId || scope.retentionState !== "retained" || !scope.retainedPayloadId || !scope.storageObjectId || !scope.storageVersion
          || Date.parse(scope.retainedAt) >= Date.parse(scope.purgeAt) || Date.parse(scope.purgeAt) >= Date.parse(scope.expiresAt)
          || Date.parse(scope.purgeAt) <= now() || Date.parse(scope.expiresAt) > Date.parse(receipt.expiresAt)) deny();
        await revalidate(); const body = await ports.readAccepted(retained);
        const currentScope = scopeSchema.parse(body.scope);
        const {replayed: _priorReplay, ...priorIdentity} = scope, {replayed: _currentReplay, ...currentIdentity} = currentScope;
        if (!same(currentIdentity, priorIdentity) || body.bytes.length !== scope.byteLength || sha(body.bytes) !== scope.payloadFingerprint) deny();
        const raw: unknown = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(body.bytes)), output = originationSeniorReadoutSchema.parse(raw);
        if (!same(raw, output) || legacyGatewayFingerprint(output) !== binding.outputFingerprint) deny();
        await revalidate(); return {output: owned(output), retained: owned({...retained, binding, scope})};
      };
      await revalidate(); const recovered = await ports.recoverAccepted(receipt);
      if (recovered) return {...await read(recovered), recovered: true as const};
      // SQL retains max(server reservation, observed cost). At the initial 1.25 USD
      // model ceiling, Terra fits only if Sol was denied before dispatch. Neither
      // cheap invalid output nor an unknown timeout releases the Sol reservation.
      type Record = {attempt: GatewayAttempt; decision: z.infer<typeof decisionSchema>; input?: z.infer<typeof dispatchSchema>; outcome?: GatewayAttemptOutcome};
      const records = new Map<string, Record>();
      const gateway = createModelGateway({...(config.onCall?{onCall:config.onCall}:{}),adapters: {openai: adapter}, policies, prices, budget: {maxCalls:Math.min(maxCalls,receipt.operationalBudget.maxDispatches), maxCostUsd:Math.min(maxCostUsd,receipt.operationalBudget.maxExposureMicroUsd/1000000)},
        processingEligibility: async ({provider, model, resources, context, attempt}) => {
          const pinned = owned(structuredClone(attempt)), index = pinned.usedProviderFallback ? 1 : 0, built = effective[index]!, route = routes[index]!;
          const previous = [...records.values()][0];
          if (records.size !== index || records.has(pinned.invocationId) || provider !== "openai" || model !== route.model || pinned.task !== "origination_thesis"
            || pinned.schemaName !== "origination_senior_readout_v2" || pinned.adapterInputVersion !== "gateway-adapter-input.v1" || pinned.retryOrdinal !== 0 || pinned.isSameModelRepair
            || pinned.requestFingerprint !== built.requestFingerprintV1 || pinned.inputFingerprint !== built.inputFingerprint || pinned.promptFingerprint !== built.promptFingerprint
            || resources.length !== 3 || new Set(resources).size !== 3 || !["inference", "prompt_cache", "schema_cache"].every(resource => resources.includes(resource as typeof resources[number]))
            || context?.purpose !== "case_analysis" || context?.classification !== "confidential" || context?.requiredPolicyVersion !== retentionMatrixVersion
            || conservativeMicroUsd(pinned.reservationUsd) !== conservativeMicroUsd(conservativeTextReservationUsd("openai", built.adapterRequest, prices))
            || (index === 0 ? pinned.previousInvocationId !== undefined : !previous || pinned.previousInvocationId !== previous.attempt.invocationId
              || (previous.decision.allowed && (!previous.input || !previous.outcome || previous.outcome.outcome === "accepted")))) deny();
          await revalidate();
          const decision = owned(decisionSchema.parse(await ports.authorize({recipeId: receipt.recipeId, attempt: pinned,
            route: {...connection, provider: "openai", model: route.model, endpoint: providerEndpoints.openai}, resources: [...resources], purpose: "case_analysis"})));
          if (decision.invocationId !== pinned.invocationId || decision.requestFingerprint !== pinned.requestFingerprint || (decision.allowed ? decision.reasons.length !== 0 || decision.assuranceIds.length !== 3 : !decision.reasons.length)
            || (decision.allowed && decision.assuranceId !== null) || new Set(decision.assuranceIds).size !== decision.assuranceIds.length || (previous && (decision.operationId !== previous.decision.operationId || decision.rootAttemptReceiptId !== previous.decision.rootAttemptReceiptId))) deny();
          if(!decision.allowed)denied=true;
          records.set(pinned.invocationId, {attempt: pinned, decision});
          return {allowed: decision.allowed, policyVersion: decision.policyVersion, assuranceId: decision.assuranceId, reasons: decision.reasons, decisionId: decision.decisionId};
        },
        attestInput: async actual => {
          const record = records.get(actual.invocationId), index = record?.attempt.usedProviderFallback ? 1 : 0;
          if (!record || !record.decision.allowed || record.input || actual.requestFingerprint !== record.attempt.requestFingerprint || actual.inputFingerprint !== record.attempt.inputFingerprint
            || actual.promptFingerprint !== record.attempt.promptFingerprint || actual.schemaVersion !== "gateway-adapter-input.v1" || actual.task !== "origination_thesis"
            || actual.previousInvocationId !== record.attempt.previousInvocationId || actual.usedProviderFallback !== record.attempt.usedProviderFallback || actual.model !== routes[index]!.model || actual.provider !== "openai" || actual.retryOrdinal !== 0 || actual.isSameModelRepair) deny();
          await revalidate(); let rawInput:unknown;
          try {rawInput=await ports.dispatch(record.decision.attemptReceiptId);} catch(error) {if(error instanceof Error&&error.message==="capital_m07_budget_denied")serverBudgetDenied=true;throw error;}
          const input = owned(dispatchSchema.parse(rawInput));
          if (input.invocationId !== actual.invocationId || input.requestFingerprint !== actual.requestFingerprint || input.operationId !== record.decision.operationId || input.attemptReceiptId !== record.decision.attemptReceiptId
            || input.rootAttemptReceiptId !== record.decision.rootAttemptReceiptId || input.rendererPolicyFingerprint !== policyPins[index] || input.reservationMicroUsd !== conservativeMicroUsd(record.attempt.reservationUsd)
            || input.serverReservationMicroUsd < input.reservationMicroUsd || !input.dispatchAllowed || input.replayed) deny();
          record.input = input; return {receiptId: input.receiptId, invocationId: input.invocationId, requestFingerprint: input.requestFingerprint};
        },
        recordAttemptOutcome: async actual => {
          const outcome = owned(gatewayAttemptOutcomeSchema.parse(structuredClone(actual))), record = records.get(outcome.invocationId);
          if (outcome.outcomeFingerprint !== ordinalGatewayFingerprint(attemptOutcomeTuple(outcome)) || !record?.input || record.outcome || outcome.fromCassette || outcome.costStatus === "cassette"
            || outcome.processingDecisionId !== record.decision.decisionId || outcome.inputAttestationReceiptId !== record.input.receiptId || outcome.provider !== "openai"
            || outcome.configuredModel !== routes[record.attempt.usedProviderFallback ? 1 : 0]!.model || (outcome.outcome === "accepted" && outcome.reportedModel !== outcome.configuredModel)
            || outcome.requestFingerprint !== record.attempt.requestFingerprint || outcome.inputFingerprint !== record.attempt.inputFingerprint || outcome.promptFingerprint !== record.attempt.promptFingerprint
            || outcome.task !== record.attempt.task || outcome.schemaName !== record.attempt.schemaName || outcome.retryOrdinal !== 0 || outcome.isSameModelRepair
            || outcome.previousInvocationId !== (record.attempt.previousInvocationId ?? null) || outcome.usedProviderFallback !== record.attempt.usedProviderFallback || outcome.reservationMicroUsd !== record.input.reservationMicroUsd) deny();
          await revalidate(); const persisted = outcomeReceiptSchema.parse(await ports.outcome(record.decision.attemptReceiptId, outcome));
          if (persisted.operationId !== record.decision.operationId || persisted.attemptReceiptId !== record.decision.attemptReceiptId || persisted.inputReceiptId !== record.input.receiptId || persisted.rootAttemptReceiptId !== record.decision.rootAttemptReceiptId) deny();
          const {schemaVersion: _version, operationId: _op, attemptReceiptId: _attempt, inputReceiptId: _input, rootAttemptReceiptId: _root, replayed: _replay, ...fields} = persisted;
          const verified = verifyAttemptOutcomeReceipt(outcome, {...fields, schemaVersion: "gateway-attempt-outcome-receipt.v1"}); record.outcome = outcome;if(outcome.outcome!=="accepted")nonaccepted=true; return verified;
        }});
      const result = await gateway.complete(request), accepted = result.acceptedInvocation;
      const record = accepted ? records.get(accepted.invocationId) : undefined;
      if (!accepted || !record?.input || record.outcome?.outcome !== "accepted" || !result.attemptOutcomeReceipt || accepted.fromCassette || accepted.isSameModelRepair || accepted.retryOrdinal !== 0
        || accepted.inputAttestationReceiptId !== record.input.receiptId || accepted.adapterRequestFingerprint !== record.attempt.requestFingerprint || accepted.outputFingerprint !== record.outcome.outputFingerprint
        || accepted.provider !== "openai" || accepted.schemaName !== "origination_senior_readout_v2" || accepted.adapterInputVersion !== "gateway-adapter-input.v1"
        || accepted.outputFingerprintVersion !== "gateway-parsed-output.v1" || accepted.inputFingerprint !== record.attempt.inputFingerprint || accepted.promptFingerprint !== record.attempt.promptFingerprint
        || accepted.usedProviderFallback !== record.attempt.usedProviderFallback || accepted.configuredModel !== record.outcome.configuredModel || accepted.reportedModel !== record.outcome.reportedModel) deny();
      verifyAttemptOutcomeReceipt(record.outcome, result.attemptOutcomeReceipt);
      const output = originationSeniorReadoutSchema.parse(result.output);
      if (!same(result.output, output) || legacyGatewayFingerprint(output) !== accepted.outputFingerprint) deny();
      await revalidate();candidateAccepted=true; const retained = await ports.retainAccepted({recipe: receipt, accepted: owned(structuredClone(accepted)), output: owned(output)});
      if (retained.binding.invocationId !== accepted.invocationId || retained.binding.inputReceiptId !== record.input.receiptId || retained.binding.outputFingerprint !== accepted.outputFingerprint) deny();
      return {...await read(retained), recovered: false as const, acceptedInvocation:owned(structuredClone(accepted)),usage:result.usage,spend:gateway.spent()};
    } catch(error) {
      let terminalReason:z.infer<typeof capitalM07ExecutionFailureReasonSchema>|undefined;
      if(failureRecipe&&(candidateAccepted||serverBudgetDenied||nonaccepted||denied||(error instanceof ModelGatewayError&&error.code==="budget_exceeded"))){const reason=candidateAccepted?"accepted_body_unavailable":serverBudgetDenied||(error instanceof ModelGatewayError&&error.code==="budget_exceeded")?"budget_denied":nonaccepted?"model_attempts_exhausted":"processing_denied";
        // SQL derives actual outcomes and independently proves the selected reason.
        // Lost authority never turns a failed audit write into a fresh permission.
        try{const terminal=capitalM07ExecutionFailureReceiptSchema.parse(await ports.recordExecutionFailure({recipeId:failureRecipe.recipeId,reason}));if(terminal.recipeId!==failureRecipe.recipeId||terminal.taskRunId!==failureRecipe.taskRunId||terminal.reason!==reason)deny();terminalReason=reason;}catch{}
      }
      if(terminalReason)throw new CapitalM07ExecutionFailure(terminalReason);
      return deny();
    }
  }});
}

/** Renderer identity, distinct from the gateway parsed-output hash and physical SHA.
 * The fixed scalar tuple is the agreed final-output namespace, not an alternative
 * gateway request serializer. Does not prove server receipt or source authority. */
export function capitalM07FinalOutputFingerprint(parsedFingerprint: string, recipeFingerprint: string, finalProduct: unknown): string {
  try {
    hash.parse(parsedFingerprint); hash.parse(recipeFingerprint);
    const final = originationSeniorReadoutArtifactSchema.strict().parse(finalProduct);
    if (!same(finalProduct, final)) deny();
    return sha(JSON.stringify(["capital-m07-final-output.v1", parsedFingerprint, recipeFingerprint, legacyGatewayFingerprint(final)]));
  } catch {return deny();}
}
