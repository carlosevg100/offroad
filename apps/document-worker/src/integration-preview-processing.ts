/** Closed preview paid boundaries. A01/A02 refer to actual published plan tasks,
 * not invented TaskRuns. SQL fixes the physical input, shared job budget and
 * current source closure before this factory accepts a ready boundary. */
import {createHash} from "node:crypto";
import {z} from "zod";

import {assertGatewaySchemaUnchanged, createModelGateway, defaultTaskPolicies, resolveModel, listPrices,
  conservativeMicroUsd, conservativeTextReservationUsd, ordinalGatewayFingerprint, legacyGatewayFingerprint,
  gatewayAttemptOutcomeSchema, gatewayAttemptOutcomeReceiptSchema, verifyAttemptOutcomeReceipt, attemptOutcomeTuple,
  ModelGatewayError,retentionMatrixVersion, type GatewayAttempt, type GatewayAttemptOutcome, type GatewayAcceptedInvocation, type ModelGatewayConfig, type GatewayCallLog,type PreparedGatewayInput} from "@offroad/model-gateway";
import {preparePreviewNativeModelRecipe,type PreviewModelRecipeInput} from "./integration-preview-model-recipe";

import {providerConnectionsSchema, providerEndpoints, type ProviderConnections} from "./provider-processing";

import type {CapitalBodyRetentionReceipt} from "./capital-body-retention";
const uuid = z.uuid(), hash = z.string().regex(/^[a-f0-9]{64}$/), micros = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const executionFailureReasonSchema=z.enum(["model_attempts_exhausted","processing_denied","budget_denied","accepted_body_unavailable"]);
export const capitalPreviewBoundaryReceiptSchema=z.strictObject({schemaVersion:z.literal("capital-preview-boundary-receipt.v1"),state:z.literal("ready"),
 recipeId:uuid,boundaryId:uuid,boundary:z.enum(["questions","synthesis"]),jobId:uuid,organizationId:uuid,workId:uuid,planId:uuid,planTaskId:uuid,
 rendererVersion:z.enum(["capital-preview-renderer.questions.v1","capital-preview-renderer.synthesis.v1"]),
 reconstructionFingerprint:hash,promptFingerprint:hash,primaryRequestFingerprint:hash,fallbackRequestFingerprint:hash,
 inputRetainedPayloadId:uuid,consumedBasisFingerprint:hash,
 operationalBudget:z.strictObject({maxExposureMicroUsd:z.number().int().positive().max(600000),maxDispatches:z.number().int().min(1).max(2)}),expiresAt:z.iso.datetime({offset:true})});
export type CapitalPreviewBoundaryReceipt=z.infer<typeof capitalPreviewBoundaryReceiptSchema>;
const executionFailureReceiptSchema=z.strictObject({schemaVersion:z.literal("capital-preview-boundary-failure.v1"),recipeId:uuid,boundaryId:uuid,reason:executionFailureReasonSchema,replayed:z.boolean()});
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
const bindingSchema = z.strictObject({recipeId: uuid,boundaryId:uuid, invocationId: uuid, inputReceiptId: uuid, outputFingerprint: hash});
export interface CapitalPreviewRetainedOutput {
  binding: z.infer<typeof bindingSchema>;
  scope: CapitalBodyRetentionReceipt;
}
export interface CapitalPreviewProcessingPorts {
  loadRecipe(boundary:PreviewModelRecipeInput["boundary"]):Promise<{receipt:unknown;preparation:PreviewModelRecipeInput}>;
  revalidateRecipe(receipt: CapitalPreviewBoundaryReceipt): Promise<unknown>;
  recoverAccepted(receipt: CapitalPreviewBoundaryReceipt): Promise<CapitalPreviewRetainedOutput | null>;
  authorize(input: {boundaryId: string; attempt: GatewayAttempt; route: Record<string, string>; resources: string[]; purpose: "case_analysis"}): Promise<unknown>;
  dispatch(attemptReceiptId: string): Promise<unknown>;
  outcome(attemptReceiptId: string, outcome: GatewayAttemptOutcome): Promise<unknown>;
  retainAccepted(input: {recipe: CapitalPreviewBoundaryReceipt; accepted: GatewayAcceptedInvocation; output: unknown}): Promise<CapitalPreviewRetainedOutput>;
  recordExecutionFailure(input:{recipeId:string;boundaryId:string;reason:z.infer<typeof executionFailureReasonSchema>}):Promise<unknown>;
  readAccepted(output: CapitalPreviewRetainedOutput): Promise<{bytes: Uint8Array; scope: CapitalBodyRetentionReceipt}>;
}
function deny(): never {throw new Error("capital_preview_processing_denied");}
function owned<T>(value: T): T {if (value && typeof value === "object") {for (const child of Object.values(value)) owned(child); Object.freeze(value);} return value;}
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const same = (left: unknown, right: unknown) => legacyGatewayFingerprint(left) === legacyGatewayFingerprint(right);
export function createCapitalPreviewProcessing(config: {jobId: string; ports: CapitalPreviewProcessingPorts; connections: ProviderConnections; adapters: ModelGatewayConfig["adapters"]; budget?: {maxCostUsd:number;maxCalls:number}; onCall?:(call:GatewayCallLog)=>void; now?: () => number}) {
  const jobId = uuid.parse(config.jobId), connections = owned(providerConnectionsSchema.parse(structuredClone(config.connections)));
  if (!connections.anthropic || !connections.openai || config.adapters.anthropic?.provider !== "anthropic" || config.adapters.openai?.provider !== "openai") deny();
  const adapters = Object.freeze({anthropic:Object.freeze({provider:"anthropic" as const,complete:config.adapters.anthropic.complete.bind(config.adapters.anthropic)}),openai:Object.freeze({provider:"openai" as const,complete:config.adapters.openai.complete.bind(config.adapters.openai)})});
  const methods = ["loadRecipe", "revalidateRecipe", "recoverAccepted", "authorize", "dispatch", "outcome", "retainAccepted", "readAccepted", "recordExecutionFailure"] as const;
  const ports = Object.fromEntries(methods.map(key => {const fn = config.ports[key]; if (typeof fn !== "function") deny(); return [key, fn.bind(config.ports)];})) as unknown as CapitalPreviewProcessingPorts;
  for (const method of ["loadRecipe", "revalidateRecipe", "recoverAccepted", "authorize", "dispatch", "outcome", "retainAccepted", "readAccepted", "recordExecutionFailure"] as const) if (typeof ports[method] !== "function") deny();
  const maxCostUsd=Math.min(.6, config.budget?.maxCostUsd ?? .6), maxCalls=Math.min(2, config.budget?.maxCalls ?? 2);
  if(!Number.isFinite(maxCostUsd)||maxCostUsd<=0||!Number.isInteger(maxCalls)||maxCalls<=0)deny();
  const now = config.now ?? Date.now, policies = owned(structuredClone(defaultTaskPolicies)), prices = owned(structuredClone(listPrices));
  let started = false;
  let failureRecipe:CapitalPreviewBoundaryReceipt|undefined,denied=false,nonaccepted=false,candidateAccepted=false,serverBudgetDenied=false;
  return Object.freeze({run: async (boundary:PreviewModelRecipeInput["boundary"]) => {
    try {
      if (started) deny(); started = true;
      const loaded = await ports.loadRecipe(boundary), receipt = owned(capitalPreviewBoundaryReceiptSchema.parse(structuredClone(loaded.receipt)));
      failureRecipe=receipt;
      const reconstruction=preparePreviewNativeModelRecipe(loaded.preparation);
      const {validateOutput,...actualRequest}=reconstruction.prepared.request;
      if(validateOutput!==undefined)deny(); // Neither current preview constructor has an output validator.
      const prepared:PreparedGatewayInput<z.ZodType>={...reconstruction.prepared,request:actualRequest};
      const request=prepared.request;
      const resolved=resolveModel(reconstruction.task,policies,{}),routes=[resolved.primary,resolved.fallback!];
      if(receipt.jobId!==jobId||receipt.boundary!==boundary||loaded.preparation.boundary!==boundary||receipt.rendererVersion!==reconstruction.rendererVersion
       ||receipt.reconstructionFingerprint!==prepared.inputFingerprint||receipt.promptFingerprint!==reconstruction.promptFingerprint
       ||receipt.primaryRequestFingerprint!==reconstruction.pins[0]!.requestFingerprint||receipt.fallbackRequestFingerprint!==reconstruction.pins[1]!.requestFingerprint
       ||Date.parse(receipt.expiresAt)<=now()||(boundary==="synthesis"&&receipt.operationalBudget.maxDispatches!==1))deny();
      if(prepared.input.reduce((size,part)=>size+(part.type==="text"?Buffer.byteLength(part.text):100001),0)>100000)deny();
      const effective=routes.map(route=>reconstruction.reconstruct(route)),policyPins=reconstruction.pins.map(pin=>pin.policyFingerprint);
      const revalidate = async () => {
        assertGatewaySchemaUnchanged(prepared);
        const current = capitalPreviewBoundaryReceiptSchema.parse(await ports.revalidateRecipe(receipt));
        if (!same(current, receipt) || Date.parse(current.expiresAt) <= now()) deny();
      };
      const read = async (retained: CapitalPreviewRetainedOutput) => {
        const binding = bindingSchema.parse(retained.binding), scope = owned(scopeSchema.parse(structuredClone(retained.scope)));
        if (scope.path!==`${receipt.organizationId}/${scope.allocationId}/payload.json` || binding.recipeId !== receipt.recipeId || binding.boundaryId!==receipt.boundaryId || scope.retentionState !== "retained" || !scope.retainedPayloadId || !scope.storageObjectId || !scope.storageVersion
          || Date.parse(scope.retainedAt) >= Date.parse(scope.purgeAt) || Date.parse(scope.purgeAt) >= Date.parse(scope.expiresAt)
          || Date.parse(scope.purgeAt) <= now() || Date.parse(scope.expiresAt) > Date.parse(receipt.expiresAt)) deny();
        await revalidate(); const body = await ports.readAccepted(retained);
        const currentScope = scopeSchema.parse(body.scope);
        const {replayed: _priorReplay, ...priorIdentity} = scope, {replayed: _currentReplay, ...currentIdentity} = currentScope;
        if (!same(currentIdentity, priorIdentity) || body.bytes.length !== scope.byteLength || sha(body.bytes) !== scope.payloadFingerprint) deny();
        const raw: unknown = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(body.bytes)), output = prepared.request.schema.parse(raw);
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
          if (records.size !== index || records.has(pinned.invocationId) || provider !== route.provider || model !== route.model || pinned.task !== reconstruction.task
            || pinned.schemaName !== prepared.request.schemaName || pinned.adapterInputVersion !== "gateway-adapter-input.v1" || pinned.retryOrdinal !== 0 || pinned.isSameModelRepair
            || pinned.requestFingerprint !== built.requestFingerprintV1 || pinned.inputFingerprint !== built.inputFingerprint || pinned.promptFingerprint !== built.promptFingerprint
            || resources.length !== 3 || new Set(resources).size !== 3 || !["inference", "prompt_cache", "schema_cache"].every(resource => resources.includes(resource as typeof resources[number]))
            || context?.purpose !== "case_analysis" || context?.classification !== "restricted" || context?.requiredPolicyVersion !== retentionMatrixVersion
            || conservativeMicroUsd(pinned.reservationUsd) !== conservativeMicroUsd(conservativeTextReservationUsd(route.provider, built.adapterRequest, prices))
            || (index === 0 ? pinned.previousInvocationId !== undefined : !previous || pinned.previousInvocationId !== previous.attempt.invocationId
              || (previous.decision.allowed && (!previous.input || !previous.outcome || previous.outcome.outcome === "accepted")))) deny();
          await revalidate();
          const decision = owned(decisionSchema.parse(await ports.authorize({boundaryId: receipt.boundaryId, attempt: pinned,
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
            || actual.promptFingerprint !== record.attempt.promptFingerprint || actual.schemaVersion !== "gateway-adapter-input.v1" || actual.task !== reconstruction.task
            || actual.previousInvocationId !== record.attempt.previousInvocationId || actual.usedProviderFallback !== record.attempt.usedProviderFallback || actual.model !== routes[index]!.model || actual.provider !== routes[index]!.provider || actual.retryOrdinal !== 0 || actual.isSameModelRepair) deny();
          await revalidate(); let rawInput:unknown;
          try {rawInput=await ports.dispatch(record.decision.attemptReceiptId);} catch(error) {if(error instanceof Error&&error.message==="capital_preview_budget_denied")serverBudgetDenied=true;throw error;}
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
      const result = await gateway.complete<z.ZodType>(request), accepted = result.acceptedInvocation;
      const record = accepted ? records.get(accepted.invocationId) : undefined;
      if (!accepted || !record?.input || record.outcome?.outcome !== "accepted" || !result.attemptOutcomeReceipt || accepted.fromCassette || accepted.isSameModelRepair || accepted.retryOrdinal !== 0
        || accepted.inputAttestationReceiptId !== record.input.receiptId || accepted.adapterRequestFingerprint !== record.attempt.requestFingerprint || accepted.outputFingerprint !== record.outcome.outputFingerprint
        || accepted.provider !== record.outcome.provider || accepted.schemaName !== prepared.request.schemaName || accepted.adapterInputVersion !== "gateway-adapter-input.v1"
        || accepted.outputFingerprintVersion !== "gateway-parsed-output.v1" || accepted.inputFingerprint !== record.attempt.inputFingerprint || accepted.promptFingerprint !== record.attempt.promptFingerprint
        || accepted.usedProviderFallback !== record.attempt.usedProviderFallback || accepted.configuredModel !== record.outcome.configuredModel || accepted.reportedModel !== record.outcome.reportedModel) deny();
      verifyAttemptOutcomeReceipt(record.outcome, result.attemptOutcomeReceipt);
      const output = prepared.request.schema.parse(result.output);
      if (!same(result.output, output) || legacyGatewayFingerprint(output) !== accepted.outputFingerprint) deny();
      await revalidate();candidateAccepted=true; const retained = await ports.retainAccepted({recipe: receipt, accepted: owned(structuredClone(accepted)), output: owned(output)});
      if (retained.binding.boundaryId!==receipt.boundaryId || retained.binding.invocationId !== accepted.invocationId || retained.binding.inputReceiptId !== record.input.receiptId || retained.binding.outputFingerprint !== accepted.outputFingerprint) deny();
      return {...await read(retained), recovered: false as const, acceptedInvocation:owned(structuredClone(accepted)),usage:result.usage,spend:gateway.spent()};
    } catch(error) {
      let terminalReason:z.infer<typeof executionFailureReasonSchema>|undefined;
      if(failureRecipe&&(candidateAccepted||serverBudgetDenied||nonaccepted||denied||(error instanceof ModelGatewayError&&error.code==="budget_exceeded"))){const reason=candidateAccepted?"accepted_body_unavailable":serverBudgetDenied||(error instanceof ModelGatewayError&&error.code==="budget_exceeded")?"budget_denied":nonaccepted?"model_attempts_exhausted":"processing_denied";
        // SQL derives actual outcomes and independently proves the selected reason.
        // Lost authority never turns a failed audit write into a fresh permission.
        try{const terminal=executionFailureReceiptSchema.parse(await ports.recordExecutionFailure({recipeId:failureRecipe.recipeId,boundaryId:failureRecipe.boundaryId,reason}));if(terminal.recipeId!==failureRecipe.recipeId||terminal.boundaryId!==failureRecipe.boundaryId||terminal.reason!==reason)deny();terminalReason=reason;}catch{}
      }
      if(terminalReason)throw new Error(`capital_preview_terminal:${terminalReason}`);
      return deny();
    }
  }});
}

