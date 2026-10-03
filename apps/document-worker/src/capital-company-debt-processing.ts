/** Closed prospective company-debt invocation consumer (M06 is already succeeded). Ports must perform server authority checks;
 * this module never promotes the pure recipe's unresolved DTO into permission. */
import {createHash} from "node:crypto";
import {z} from "zod";
import {companyDebtDiagnosticSchema} from "@offroad/domain-contracts";
import {assertGatewaySchemaUnchanged, prepareGatewayInput, createModelGateway, defaultTaskPolicies, resolveModel, listPrices,
  conservativeMicroUsd, conservativeTextReservationUsd, ordinalGatewayFingerprint, legacyGatewayFingerprint,
  gatewayAttemptOutcomeSchema, gatewayAttemptOutcomeReceiptSchema, verifyAttemptOutcomeReceipt, attemptOutcomeTuple, toOpenAIStrictSchema,
  ModelGatewayError,retentionMatrixVersion, type GatewayAttempt, type GatewayAttemptOutcome, type GatewayAcceptedInvocation, type ModelGatewayConfig, type GatewayCallLog} from "@offroad/model-gateway";
import {prepareCapitalCompanyDebtRecipe, reconstructCapitalCompanyDebtRequest,capitalCompanyDebtDispatchPins} from "./capital-company-debt-recipe";
import {capitalCompanyDebtArtifactSchema} from "./capital-company-debt-final";
import {providerConnectionsSchema, providerEndpoints, type ProviderConnections} from "./provider-processing";
import {capitalCompanyDebtExecutionFailureReasonSchema, CapitalCompanyDebtExecutionFailure,capitalCompanyDebtExecutionFailureReceiptSchema} from "./capital-company-debt-protocol";
import type {CapitalBodyRetentionReceipt} from "./capital-body-retention";
const uuid = z.uuid(), hash = z.string().regex(/^[a-f0-9]{64}$/), micros = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const capitalCompanyDebtRendererVersion = "capital-public-task-renderer.company-debt.v1";
export const capitalCompanyDebtRecipeReceiptSchema = z.strictObject({schemaVersion: z.literal("capital-debt-recipe-receipt.v1"), state: z.literal("ready"),
  recipeId: uuid, executionPlanTaskRunId:uuid,executionPlanTaskId:z.literal("M06"),finalTaskId:z.literal("C11"), jobId: uuid, organizationId: uuid, workId: uuid, planId: uuid, planFingerprint: hash,
  locale: z.enum(["pt-BR", "en-US"]), asOfDate: z.iso.date(), rendererVersion: z.literal(capitalCompanyDebtRendererVersion), recipeFingerprint: hash,
  reconstructionFingerprint: hash, contextRetainedPayloadId: uuid, operationalBudget:z.strictObject({schemaVersion:z.literal("capital-debt-operational-budget.v1"),researchReservationVersion:z.literal("public-research-reservation.company-debt.v1"),researchReservationMicroUsd:z.number().int().min(0).max(200000),maxExposureMicroUsd:z.number().int().positive().max(950000),maxDispatches:z.number().int().min(1).max(2)}), components: z.array(z.strictObject({slot:z.enum(["company","brief","institution","research","source","revision","execution_plan"]),id:uuid,version:z.number().int().positive(),bodyFingerprint:hash})), expiresAt: z.iso.datetime({offset: true})});
export type CapitalCompanyDebtRecipeReceipt = z.infer<typeof capitalCompanyDebtRecipeReceiptSchema>;
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
export interface CapitalCompanyDebtRetainedOutput {
  binding: z.infer<typeof bindingSchema>;
  scope: CapitalBodyRetentionReceipt;
}
export interface CapitalCompanyDebtProcessingPorts {
  loadRecipe(executionPlanTaskRunId: string): Promise<{receipt: unknown; preparation: Parameters<typeof prepareCapitalCompanyDebtRecipe>[0]}>;
  revalidateRecipe(receipt: CapitalCompanyDebtRecipeReceipt): Promise<unknown>;
  recoverAccepted(receipt: CapitalCompanyDebtRecipeReceipt): Promise<CapitalCompanyDebtRetainedOutput | null>;
  authorize(input: {recipeId: string; attempt: GatewayAttempt; route: Record<string, string>; resources: string[]; purpose: "case_analysis"}): Promise<unknown>;
  dispatch(attemptReceiptId: string): Promise<unknown>;
  outcome(attemptReceiptId: string, outcome: GatewayAttemptOutcome): Promise<unknown>;
  retainAccepted(input: {recipe: CapitalCompanyDebtRecipeReceipt; accepted: GatewayAcceptedInvocation; output: z.infer<typeof companyDebtDiagnosticSchema>}): Promise<CapitalCompanyDebtRetainedOutput>;
  recordExecutionFailure(input:{recipeId:string;reason:z.infer<typeof capitalCompanyDebtExecutionFailureReasonSchema>}):Promise<unknown>;
  readAccepted(output: CapitalCompanyDebtRetainedOutput): Promise<{bytes: Uint8Array; scope: CapitalBodyRetentionReceipt}>;
}
function deny(): never {throw new Error("capital_debt_processing_denied");}
function owned<T>(value: T): T {if (value && typeof value === "object") {for (const child of Object.values(value)) owned(child); Object.freeze(value);} return value;}
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const same = (left: unknown, right: unknown) => legacyGatewayFingerprint(left) === legacyGatewayFingerprint(right);
export function createCapitalCompanyDebtProcessing(config: {jobId: string; ports: CapitalCompanyDebtProcessingPorts; connections: ProviderConnections; adapters: ModelGatewayConfig["adapters"]; budget?: {maxCostUsd:number;maxCalls:number}; onCall?:(call:GatewayCallLog)=>void; now?: () => number}) {
  const jobId = uuid.parse(config.jobId), connections = owned(providerConnectionsSchema.parse(structuredClone(config.connections)));
  if (!connections.anthropic || !connections.openai || config.adapters.anthropic?.provider !== "anthropic" || config.adapters.openai?.provider !== "openai") deny();
  const adapters = Object.freeze({anthropic:Object.freeze({provider:"anthropic" as const,complete:config.adapters.anthropic.complete.bind(config.adapters.anthropic)}),openai:Object.freeze({provider:"openai" as const,complete:config.adapters.openai.complete.bind(config.adapters.openai)})});
  const methods = ["loadRecipe", "revalidateRecipe", "recoverAccepted", "authorize", "dispatch", "outcome", "retainAccepted", "readAccepted", "recordExecutionFailure"] as const;
  const ports = Object.fromEntries(methods.map(key => {const fn = config.ports[key]; if (typeof fn !== "function") deny(); return [key, fn.bind(config.ports)];})) as unknown as CapitalCompanyDebtProcessingPorts;
  for (const method of ["loadRecipe", "revalidateRecipe", "recoverAccepted", "authorize", "dispatch", "outcome", "retainAccepted", "readAccepted", "recordExecutionFailure"] as const) if (typeof ports[method] !== "function") deny();
  const maxCostUsd=Math.min(.95, config.budget?.maxCostUsd ?? .95), maxCalls=Math.min(2, config.budget?.maxCalls ?? 2);
  if(!Number.isFinite(maxCostUsd)||maxCostUsd<=0||!Number.isInteger(maxCalls)||maxCalls<=0)deny();
  const now = config.now ?? Date.now, policies = owned(structuredClone(defaultTaskPolicies)), prices = owned(structuredClone(listPrices));
  const resolved = resolveModel("company_debt_view", policies, {});
  if (!same(resolved.primary, {provider: "anthropic", model: "claude-sonnet-5", effort: "medium"}) || !same(resolved.fallback, {provider: "openai", model: "gpt-5.6-terra", effort: "medium"})) deny();
  const routes = [resolved.primary, resolved.fallback!], defaults = {maxOutputTokens: 8000, timeoutMs: 240000};
  let started = false;
  let failureRecipe:CapitalCompanyDebtRecipeReceipt|undefined,denied=false,nonaccepted=false,candidateAccepted=false,serverBudgetDenied=false;
  return Object.freeze({run: async (executionPlanTaskRunId: string) => {
    try {
      if (started) deny(); started = true; uuid.parse(executionPlanTaskRunId);
      const loaded = await ports.loadRecipe(executionPlanTaskRunId), receipt = owned(capitalCompanyDebtRecipeReceiptSchema.parse(structuredClone(loaded.receipt)));
      failureRecipe=receipt;
      const reconstruction = prepareCapitalCompanyDebtRecipe(loaded.preparation), pure = reconstruction.recipe;
      if (receipt.jobId !== jobId || receipt.executionPlanTaskRunId !== executionPlanTaskRunId || Date.parse(receipt.expiresAt) <= now()
        || !["organizationId", "workId", "planId", "planFingerprint", "locale", "asOfDate", "reconstructionFingerprint", "components"].every(key => same(receipt[key as keyof typeof receipt], pure[key as keyof typeof pure]))) deny();
      const request = {...reconstruction.prepared.request, requireInputAttestation: true, outputMode: "structured" as const, timeoutMs: 240000, dataHandling: {classification: "confidential" as const, purpose: "case_analysis" as const, requiredPolicyVersion: retentionMatrixVersion}};
      // Re-prepare using the common builder to include the explicitly fixed execution mode.
      const prepared = prepareGatewayInput(request);
      if (prepared.input.reduce((size, part) => size + (part.type === "text" ? Buffer.byteLength(part.text) : 100001), 0) > 100000) deny();
      const effective = routes.map(route => reconstructCapitalCompanyDebtRequest({...reconstruction, prepared}, route));
      const policyPins = routes.map(route => capitalCompanyDebtDispatchPins({...reconstruction,prepared},route).policyFingerprint);
      const revalidate = async () => {
        assertGatewaySchemaUnchanged(prepared);
        const current = capitalCompanyDebtRecipeReceiptSchema.parse(await ports.revalidateRecipe(receipt));
        if (!same(current, receipt) || Date.parse(current.expiresAt) <= now()) deny();
      };
      const read = async (retained: CapitalCompanyDebtRetainedOutput) => {
        const binding = bindingSchema.parse(retained.binding), scope = owned(scopeSchema.parse(structuredClone(retained.scope)));
        if (scope.path!==`${receipt.organizationId}/${scope.allocationId}/payload.json` || binding.recipeId !== receipt.recipeId || scope.retentionState !== "retained" || !scope.retainedPayloadId || !scope.storageObjectId || !scope.storageVersion
          || Date.parse(scope.retainedAt) >= Date.parse(scope.purgeAt) || Date.parse(scope.purgeAt) >= Date.parse(scope.expiresAt)
          || Date.parse(scope.purgeAt) <= now() || Date.parse(scope.expiresAt) > Date.parse(receipt.expiresAt)) deny();
        await revalidate(); const body = await ports.readAccepted(retained);
        const currentScope = scopeSchema.parse(body.scope);
        const {replayed: _priorReplay, ...priorIdentity} = scope, {replayed: _currentReplay, ...currentIdentity} = currentScope;
        if (!same(currentIdentity, priorIdentity) || body.bytes.length !== scope.byteLength || sha(body.bytes) !== scope.payloadFingerprint) deny();
        const raw: unknown = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(body.bytes)), output = companyDebtDiagnosticSchema.parse(raw);
        if (!same(raw, output) || legacyGatewayFingerprint(output) !== binding.outputFingerprint) deny();
        await revalidate(); return {output: owned(output), retained: owned({...retained, binding, scope})};
      };
      await revalidate(); const recovered = await ports.recoverAccepted(receipt);
      if (recovered) return {...await read(recovered), recovered: true as const};
      // SQL retains max(server reservation, observed cost) on both closed routes.
      // A terminal nonaccepted primary permits fallback only inside the same ceiling.
      type Record = {attempt: GatewayAttempt; decision: z.infer<typeof decisionSchema>; input?: z.infer<typeof dispatchSchema>; outcome?: GatewayAttemptOutcome};
      const records = new Map<string, Record>();
      const gateway = createModelGateway({...(config.onCall?{onCall:config.onCall}:{}),adapters, policies, prices, budget: {maxCalls:Math.min(maxCalls,receipt.operationalBudget.maxDispatches), maxCostUsd:Math.min(maxCostUsd,receipt.operationalBudget.maxExposureMicroUsd/1000000)},
        processingEligibility: async ({provider, model, resources, context, attempt}) => {
          const pinned = owned(structuredClone(attempt)), index = pinned.usedProviderFallback ? 1 : 0, built = effective[index]!, route = routes[index]!;
          const previous = [...records.values()][0];
          if (records.size !== index || records.has(pinned.invocationId) || provider !== route.provider || model !== route.model || pinned.task !== "company_debt_view"
            || pinned.schemaName !== "company_debt_diagnostic_v1" || pinned.adapterInputVersion !== "gateway-adapter-input.v1" || pinned.retryOrdinal !== 0 || pinned.isSameModelRepair
            || pinned.requestFingerprint !== built.requestFingerprintV1 || pinned.inputFingerprint !== built.inputFingerprint || pinned.promptFingerprint !== built.promptFingerprint
            || resources.length !== 3 || new Set(resources).size !== 3 || !["inference", "prompt_cache", "schema_cache"].every(resource => resources.includes(resource as typeof resources[number]))
            || context?.purpose !== "case_analysis" || context?.classification !== "confidential" || context?.requiredPolicyVersion !== retentionMatrixVersion
            || conservativeMicroUsd(pinned.reservationUsd) !== conservativeMicroUsd(conservativeTextReservationUsd(route.provider, built.adapterRequest, prices))
            || (index === 0 ? pinned.previousInvocationId !== undefined : !previous || pinned.previousInvocationId !== previous.attempt.invocationId
              || (previous.decision.allowed && (!previous.input || !previous.outcome || previous.outcome.outcome === "accepted")))) deny();
          await revalidate();
          const decision = owned(decisionSchema.parse(await ports.authorize({recipeId: receipt.recipeId, attempt: pinned,
            route: {...connections[route.provider]!, provider: route.provider, model: route.model, endpoint: providerEndpoints[route.provider]}, resources: [...resources], purpose: "case_analysis"})));
          if (decision.invocationId !== pinned.invocationId || decision.requestFingerprint !== pinned.requestFingerprint || (decision.allowed ? decision.reasons.length !== 0 || decision.assuranceIds.length !== 3 : !decision.reasons.length)
            || (decision.allowed && decision.assuranceId !== null) || new Set(decision.assuranceIds).size !== decision.assuranceIds.length || (previous && (decision.operationId !== previous.decision.operationId || decision.rootAttemptReceiptId !== previous.decision.rootAttemptReceiptId))) deny();
          if(!decision.allowed)denied=true;
          records.set(pinned.invocationId, {attempt: pinned, decision});
          return {allowed: decision.allowed, policyVersion: decision.policyVersion, assuranceId: decision.assuranceId, reasons: decision.reasons, decisionId: decision.decisionId};
        },
        attestInput: async actual => {
          const record = records.get(actual.invocationId), index = record?.attempt.usedProviderFallback ? 1 : 0;
          if (!record || !record.decision.allowed || record.input || actual.requestFingerprint !== record.attempt.requestFingerprint || actual.inputFingerprint !== record.attempt.inputFingerprint
            || actual.promptFingerprint !== record.attempt.promptFingerprint || actual.schemaVersion !== "gateway-adapter-input.v1" || actual.task !== "company_debt_view"
            || actual.previousInvocationId !== record.attempt.previousInvocationId || actual.usedProviderFallback !== record.attempt.usedProviderFallback || actual.model !== routes[index]!.model || actual.provider !== routes[index]!.provider || actual.retryOrdinal !== 0 || actual.isSameModelRepair) deny();
          await revalidate(); let rawInput:unknown;
          try {rawInput=await ports.dispatch(record.decision.attemptReceiptId);} catch(error) {if(error instanceof Error&&error.message==="capital_debt_budget_denied")serverBudgetDenied=true;throw error;}
          const input = owned(dispatchSchema.parse(rawInput));
          if (input.invocationId !== actual.invocationId || input.requestFingerprint !== actual.requestFingerprint || input.operationId !== record.decision.operationId || input.attemptReceiptId !== record.decision.attemptReceiptId
            || input.rootAttemptReceiptId !== record.decision.rootAttemptReceiptId || input.rendererPolicyFingerprint !== policyPins[index] || input.reservationMicroUsd !== conservativeMicroUsd(record.attempt.reservationUsd)
            || input.serverReservationMicroUsd < input.reservationMicroUsd || !input.dispatchAllowed || input.replayed) deny();
          record.input = input; return {receiptId: input.receiptId, invocationId: input.invocationId, requestFingerprint: input.requestFingerprint};
        },
        recordAttemptOutcome: async actual => {
          const outcome = owned(gatewayAttemptOutcomeSchema.parse(structuredClone(actual))), record = records.get(outcome.invocationId);
          if (outcome.outcomeFingerprint !== ordinalGatewayFingerprint(attemptOutcomeTuple(outcome)) || !record?.input || record.outcome || outcome.fromCassette || outcome.costStatus === "cassette"
            || outcome.processingDecisionId !== record.decision.decisionId || outcome.inputAttestationReceiptId !== record.input.receiptId || outcome.provider !== routes[record.attempt.usedProviderFallback ? 1 : 0]!.provider
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
        || accepted.provider !== record.outcome.provider || accepted.schemaName !== "company_debt_diagnostic_v1" || accepted.adapterInputVersion !== "gateway-adapter-input.v1"
        || accepted.outputFingerprintVersion !== "gateway-parsed-output.v1" || accepted.inputFingerprint !== record.attempt.inputFingerprint || accepted.promptFingerprint !== record.attempt.promptFingerprint
        || accepted.usedProviderFallback !== record.attempt.usedProviderFallback || accepted.configuredModel !== record.outcome.configuredModel || accepted.reportedModel !== record.outcome.reportedModel) deny();
      verifyAttemptOutcomeReceipt(record.outcome, result.attemptOutcomeReceipt);
      const output = companyDebtDiagnosticSchema.parse(result.output);
      if (!same(result.output, output) || legacyGatewayFingerprint(output) !== accepted.outputFingerprint) deny();
      await revalidate();candidateAccepted=true; const retained = await ports.retainAccepted({recipe: receipt, accepted: owned(structuredClone(accepted)), output: owned(output)});
      if (retained.binding.invocationId !== accepted.invocationId || retained.binding.inputReceiptId !== record.input.receiptId || retained.binding.outputFingerprint !== accepted.outputFingerprint) deny();
      return {...await read(retained), recovered: false as const, acceptedInvocation:owned(structuredClone(accepted)),usage:result.usage,spend:gateway.spent()};
    } catch(error) {
      let terminalReason:z.infer<typeof capitalCompanyDebtExecutionFailureReasonSchema>|undefined;
      if(failureRecipe&&(candidateAccepted||serverBudgetDenied||nonaccepted||denied||(error instanceof ModelGatewayError&&error.code==="budget_exceeded"))){const reason=candidateAccepted?"accepted_body_unavailable":serverBudgetDenied||(error instanceof ModelGatewayError&&error.code==="budget_exceeded")?"budget_denied":nonaccepted?"model_attempts_exhausted":"processing_denied";
        // SQL derives actual outcomes and independently proves the selected reason.
        // Lost authority never turns a failed audit write into a fresh permission.
        try{const terminal=capitalCompanyDebtExecutionFailureReceiptSchema.parse(await ports.recordExecutionFailure({recipeId:failureRecipe.recipeId,reason}));if(terminal.recipeId!==failureRecipe.recipeId||terminal.executionPlanTaskRunId!==failureRecipe.executionPlanTaskRunId||terminal.reason!==reason)deny();terminalReason=reason;}catch{}
      }
      if(terminalReason)throw new CapitalCompanyDebtExecutionFailure(terminalReason);
      return deny();
    }
  }});
}

/** Renderer identity, distinct from the gateway parsed-output hash and physical SHA.
 * The fixed scalar tuple is the agreed final-output namespace, not an alternative
 * gateway request serializer. Does not prove server receipt or source authority. */
export function capitalCompanyDebtFinalOutputFingerprint(parsedFingerprint: string, recipeFingerprint: string, finalProduct: unknown): string {
  try {
    hash.parse(parsedFingerprint); hash.parse(recipeFingerprint);
    const final = capitalCompanyDebtArtifactSchema.strict().parse(finalProduct);
    if (!same(finalProduct, final)) deny();
    return sha(JSON.stringify(["capital-debt-final-output.v1", parsedFingerprint, recipeFingerprint, legacyGatewayFingerprint(final)]));
  } catch {return deny();}
}
