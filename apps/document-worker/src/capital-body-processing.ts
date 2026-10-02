/** Closed contribution renderer and live attempt authority. Not a native M07 producer. */
import {createHash} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {originationSeniorReadoutSchema} from "@offroad/domain-contracts";
import {assertGatewaySchemaUnchanged, buildEffectiveAdapterRequest, createModelGateway, defaultTaskPolicies,
  legacyGatewayFingerprint, prepareGatewayInput, resolveModel, retentionMatrixVersion,
  conservativeMicroUsd, conservativeTextReservationUsd, listPrices, verifyAttemptOutcomeReceipt, gatewayAttemptOutcomeReceiptSchema,
  buildAnthropicParams, toOpenAIStrictSchema, ordinalGatewayFingerprint, gatewayAttemptOutcomeSchema, attemptOutcomeTuple,
  type GatewayCallLog, type ModelGatewayConfig, type GatewayInputAttestation, type GatewayAttempt, type GatewayAttemptOutcome} from "@offroad/model-gateway";
import type {createCapitalBodyRetention, CapitalBodyJobAuthority, CapitalBodyRetentionReceipt} from "./capital-body-retention";
import {providerConnectionsSchema, providerEndpoints, type ProviderConnections} from "./provider-processing";

export const capitalBodyProcessingRendererVersion = "capital-body-contribution-renderer.v1";
const resources = Object.freeze(["inference", "prompt_cache", "schema_cache"] as const);
const system = "Summarize the authorized contribution according to the supplied schema. Use only the supplied contribution; do not invent facts.";
const hash = z.string().regex(/^[a-f0-9]{64}$/), uuid = z.uuid();
const decisionSchema = z.strictObject({schemaVersion: z.literal("capital-body-processing-decision.v2"), allowed: z.boolean(),
  policyVersion: z.literal(retentionMatrixVersion), assuranceId: uuid.nullable(), assuranceIds: z.array(uuid).max(3), decisionId: uuid,
  classification: z.literal("restricted"), reasons: z.array(z.string().regex(/^[a-z_:]+$/)).max(100), attemptReceiptId: uuid,
  invocationId: uuid, requestFingerprint: hash, eligibilityFingerprint: hash, replayed: z.boolean(), operationId: uuid, rootAttemptReceiptId: uuid});
const inputReceiptSchema = z.strictObject({schemaVersion: z.literal("capital-body-input-dispatch.v3"), receiptId: uuid, invocationId: uuid, requestFingerprint: hash,
  operationId: uuid, attemptReceiptId: uuid, rootAttemptReceiptId: uuid, dispatchClaimId: uuid, rendererPolicyFingerprint: hash, reservationMicroUsd: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), serverReservationMicroUsd: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), dispatchAllowed: z.boolean(), replayed: z.boolean()});
const outcomeReceiptSchema = gatewayAttemptOutcomeReceiptSchema.omit({schemaVersion: true}).extend({schemaVersion: z.literal("capital-body-attempt-outcome-receipt.v1"),
  operationId: uuid, attemptReceiptId: uuid, inputReceiptId: uuid, rootAttemptReceiptId: uuid, replayed: z.boolean()}).strict();
type Decision = z.infer<typeof decisionSchema>;
type BodyService = Pick<ReturnType<typeof createCapitalBodyRetention>, "retainContribution" | "readOriginal">;
export interface CapitalBodyProcessingConfig {
  supabase: SupabaseClient;
  body: BodyService;
  authority: CapitalBodyJobAuthority;
  connections: ProviderConnections;
  adapters: ModelGatewayConfig["adapters"];
  onCall?: (call: GatewayCallLog) => void;
}
function denied(): never {throw new Error("capital_body_processing_denied");}
function freeze<T>(value: T): T {if (value && typeof value === "object") {for (const child of Object.values(value)) freeze(child); Object.freeze(value);} return value;}
const physicalHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function dispatchPolicyFingerprint(provider: "anthropic" | "openai", built: ReturnType<typeof buildEffectiveAdapterRequest>, prices: typeof listPrices) {
  const request = built.adapterRequest, price = prices[request.model];
  if (!price || price.cachedInput !== 0.2 || request.maxOutputTokens !== 1000 || request.outputMode !== "structured") denied();
  const format = provider === "anthropic" ? buildAnthropicParams(request).output_config?.format : toOpenAIStrictSchema(z.toJSONSchema(request.schema) as Parameters<typeof toOpenAIStrictSchema>[0]);
  if (!format) denied();
  const schemaBytes = Buffer.from(JSON.stringify(format)), systemBytes = Buffer.from(request.system);
  const long = price.longContext;
  const fraction = (n: number) => n === 1 ? [1,1] : n === 2 ? [2,1] : n === 1.5 ? [3,2] : denied();
  return ordinalGatewayFingerprint(["capital-body-dispatch-policy.v1", capitalBodyProcessingRendererVersion, provider, request.model,
    physicalHash(systemBytes), systemBytes.byteLength, physicalHash(schemaBytes), schemaBytes.byteLength, 1024, 100000, 1000,
    conservativeMicroUsd(price.input), conservativeMicroUsd(price.cacheWrite), conservativeMicroUsd(price.output), 11, 10,
    long?.aboveInputTokens ?? 0, ...fraction(long?.inputMultiplier ?? 1), ...fraction(long?.outputMultiplier ?? 1)]);
}
function identity(scope: CapitalBodyRetentionReceipt) {const {replayed: _marker, ...rest} = scope; return legacyGatewayFingerprint(rest);}

/** Callbacks stay private: callers cannot attach this authority to an arbitrary request. */
export function createCapitalBodyProcessingAuthority(config: CapitalBodyProcessingConfig) {
  const owned = (() => {
    try {
      const authority = freeze(z.strictObject({jobId: uuid, capabilityToken: z.string().min(1).max(4096)}).parse(config.authority));
      const connections = freeze(providerConnectionsSchema.parse(structuredClone(config.connections)));
      const policies = freeze(structuredClone(defaultTaskPolicies));
      const prices = freeze(structuredClone(listPrices));
      const route = resolveModel("preliminary_understanding", policies, {});
      if (!route.fallback || !connections[route.primary.provider] || !connections[route.fallback.provider]) denied();
      const refs = [freeze({...route.primary}), freeze({...route.fallback})];
      const adapters = Object.fromEntries(refs.map(ref => {
        const adapter = config.adapters[ref.provider];
        if (!adapter || adapter.provider !== ref.provider) denied();
        return [ref.provider, Object.freeze({provider: adapter.provider, complete: adapter.complete.bind(adapter)})];
      })) as ModelGatewayConfig["adapters"];
      return {authority, connections, policies, prices, refs, defaults: freeze({maxOutputTokens: route.policy.maxOutputTokens, timeoutMs: route.policy.timeoutMs}), adapters,
        schemaFingerprint: legacyGatewayFingerprint(z.toJSONSchema(originationSeniorReadoutSchema)),
        rpc: config.supabase.rpc.bind(config.supabase), retain: config.body.retainContribution.bind(config.body),
        read: config.body.readOriginal.bind(config.body), onCall: config.onCall};
    } catch {return denied();}
  })();
  async function rpc(name: string, args: Record<string, unknown>) {
    const pinned = freeze(structuredClone({p_job_id: owned.authority.jobId, p_capability_token: owned.authority.capabilityToken, ...args}));
    for (let index = 0; index < 3; index++) {
      const response = await owned.rpc(name, structuredClone(pinned));
      if (!response.error) return response.data;
      // A changed policy is terminal. Never regenerate invocation or dispatch on retry.
      if (response.error.code !== "40001" || !["capital_capture_retry", "capital_body_retention_pending", "capital_body_processing_retry"].includes(response.error.message) || index === 2) denied();
      await new Promise<void>(resolve => setTimeout(resolve, 20 * (index + 1)));
    }
    return denied();
  }
  let started = false;
  return Object.freeze({run: async (command: {contributionRevisionId: string; retentionRequestId: string}) => {
    try {
      if (started) denied(); started = true;
      const ids = freeze(z.strictObject({contributionRevisionId: uuid, retentionRequestId: uuid}).parse(command));
      const contribution = await owned.retain(ids.contributionRevisionId, ids.retentionRequestId);
      const receipt = freeze(structuredClone(contribution.retention));
      if (!receipt.retainedPayloadId || receipt.retentionState !== "retained") denied();
      const snapshot = await owned.read(receipt.retainedPayloadId, receipt);
      const bytes = Uint8Array.from(snapshot.bytes);
      if (bytes.byteLength > 100000 || identity(snapshot.scope) !== identity(receipt) || bytes.byteLength !== receipt.byteLength || physicalHash(bytes) !== receipt.payloadFingerprint) denied();
      const text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
      z.strictObject({schemaVersion: z.literal("capital-body.contribution.v1"), content: z.string().min(1).max(16000)}).parse(JSON.parse(text));
      if (legacyGatewayFingerprint(z.toJSONSchema(originationSeniorReadoutSchema)) !== owned.schemaFingerprint) denied();
      const request = {task: "preliminary_understanding" as const, requireInputAttestation: true, system,
        input: [{type: "text" as const, text}], schema: originationSeniorReadoutSchema, schemaName: "origination_senior_readout_v2",
        maxOutputTokens: 1000, outputMode: "structured" as const, allowFallback: true,
        dataHandling: {classification: "restricted" as const, purpose: "case_analysis" as const, requiredPolicyVersion: retentionMatrixVersion}};
      const redaction = freeze({});
      const prepared = prepareGatewayInput(request, redaction);
      const expected = owned.refs.map(ref => buildEffectiveAdapterRequest(prepared, ref, owned.defaults));
      const policyFingerprints = owned.refs.map((ref, index) => dispatchPolicyFingerprint(ref.provider, expected[index]!, owned.prices));
      const components = freeze([{kind: "retained_payload", id: receipt.retainedPayloadId}]);
      const records = new Map<string, {attempt: GatewayAttempt; decision: Decision; attested: boolean; inputReceipt?: z.infer<typeof inputReceiptSchema>; outcome?: GatewayAttemptOutcome}>();
      const revalidate = async () => {
        const current = await owned.read(receipt.retainedPayloadId!, receipt);
        if (identity(current.scope) !== identity(receipt) || current.bytes.byteLength !== bytes.byteLength || physicalHash(current.bytes) !== receipt.payloadFingerprint) denied();
        assertGatewaySchemaUnchanged(prepared);
      };
      const gateway = createModelGateway({adapters: owned.adapters, policies: owned.policies, prices: owned.prices, redaction,
        budget: {maxCalls: 2, maxCostUsd: 1}, ...(owned.onCall ? {onCall: owned.onCall} : {}),
        processingEligibility: async ({provider, model, resources: actualResources, context, attempt}) => {
          const attemptCopy = freeze(structuredClone(attempt));
          const index = attemptCopy.usedProviderFallback ? 1 : 0, ref = owned.refs[index]!, built = expected[index]!;
          uuid.parse(attemptCopy.invocationId);
          if (!z.strictObject({purpose: z.literal("case_analysis"), classification: z.literal("restricted"), requiredPolicyVersion: z.literal(retentionMatrixVersion)}).safeParse(context).success
            || records.has(attemptCopy.invocationId) || records.size !== index || provider !== ref.provider || model !== ref.model
            || actualResources.length !== resources.length || new Set(actualResources).size !== resources.length || !resources.every(resource => actualResources.includes(resource))
            || attemptCopy.adapterInputVersion !== "gateway-adapter-input.v1" || attemptCopy.task !== request.task || attemptCopy.schemaName !== request.schemaName
            || attemptCopy.requestFingerprint !== built.requestFingerprintV1 || attemptCopy.inputFingerprint !== built.inputFingerprint || attemptCopy.promptFingerprint !== built.promptFingerprint
            || attemptCopy.retryOrdinal !== 0 || attemptCopy.isSameModelRepair || !Number.isFinite(attemptCopy.reservationUsd) || attemptCopy.reservationUsd < 0
            || conservativeMicroUsd(attemptCopy.reservationUsd) !== conservativeMicroUsd(conservativeTextReservationUsd(ref.provider, built.adapterRequest, owned.prices))) denied();
          const prior = [...records.values()][0];
          if (index === 0 ? attemptCopy.previousInvocationId !== undefined : !prior || (prior.decision.allowed ? !prior.attested || !prior.outcome || prior.outcome.outcome === "accepted" : prior.attested) || attemptCopy.previousInvocationId !== prior.attempt.invocationId) denied();
          await revalidate();
          const connection = owned.connections[provider]!;
          const decision = freeze(decisionSchema.parse(await rpc("worker_authorize_capital_body_processing_v2", {p_attempt: attemptCopy,
            p_route: {...connection, provider, model, endpoint: providerEndpoints[provider]}, p_resources: [...resources], p_purpose: "case_analysis", p_components: components})));
          if (decision.invocationId !== attemptCopy.invocationId || decision.requestFingerprint !== built.requestFingerprintV1
            || (decision.allowed ? decision.reasons.length !== 0 || decision.assuranceIds.length !== 3 || decision.assuranceId !== null : decision.reasons.length === 0)
            || new Set(decision.assuranceIds).size !== decision.assuranceIds.length
            || (decision.assuranceId !== null && !decision.assuranceIds.includes(decision.assuranceId))
            || [...records.values()].some(record => record.decision.decisionId === decision.decisionId || record.decision.attemptReceiptId === decision.attemptReceiptId)
            || (prior && (decision.operationId !== prior.decision.operationId || decision.rootAttemptReceiptId !== prior.decision.rootAttemptReceiptId))) denied();
          records.set(attemptCopy.invocationId, {attempt: attemptCopy, decision, attested: false});
          return {allowed: decision.allowed, policyVersion: decision.policyVersion, assuranceId: decision.assuranceId, reasons: [...decision.reasons], decisionId: decision.decisionId};
        },
        attestInput: async (actual: GatewayInputAttestation) => {
          const attestation = freeze(structuredClone(actual));
          const record = records.get(attestation.invocationId);
          if (!record || !record.decision.allowed || record.attested) denied();
          const ref = owned.refs[record.attempt.usedProviderFallback ? 1 : 0]!;
          if (attestation.schemaVersion !== record.attempt.adapterInputVersion || attestation.task !== record.attempt.task
            || attestation.provider !== ref.provider || attestation.model !== ref.model || attestation.requestFingerprint !== record.attempt.requestFingerprint
            || attestation.inputFingerprint !== record.attempt.inputFingerprint || attestation.promptFingerprint !== record.attempt.promptFingerprint
            || attestation.retryOrdinal !== record.attempt.retryOrdinal || attestation.isSameModelRepair !== record.attempt.isSameModelRepair
            || attestation.usedProviderFallback !== record.attempt.usedProviderFallback || attestation.previousInvocationId !== record.attempt.previousInvocationId) denied();
          await revalidate();
          const result = inputReceiptSchema.parse(await rpc("worker_record_capital_body_input_v3", {p_attempt_receipt_id: record.decision.attemptReceiptId}));
          if (result.invocationId !== attestation.invocationId || result.requestFingerprint !== attestation.requestFingerprint
            || result.operationId !== record.decision.operationId || result.attemptReceiptId !== record.decision.attemptReceiptId || result.rootAttemptReceiptId !== record.decision.rootAttemptReceiptId
            || result.rendererPolicyFingerprint !== policyFingerprints[record.attempt.usedProviderFallback ? 1 : 0]
            || result.reservationMicroUsd !== conservativeMicroUsd(record.attempt.reservationUsd) || result.serverReservationMicroUsd < result.reservationMicroUsd || !result.dispatchAllowed || result.replayed) denied();
          record.attested = true;
          record.inputReceipt = freeze(result);
          return {receiptId: result.receiptId, invocationId: result.invocationId, requestFingerprint: result.requestFingerprint};
        },
        recordAttemptOutcome: async (actual) => {
          const outcome = freeze(gatewayAttemptOutcomeSchema.parse(structuredClone(actual)));
          if (outcome.outcomeFingerprint !== ordinalGatewayFingerprint(attemptOutcomeTuple(outcome))) denied();
          const record = records.get(outcome.invocationId);
          if (!record || !record.attested || !record.inputReceipt || record.outcome || outcome.fromCassette || outcome.costStatus === "cassette"
            || outcome.processingDecisionId !== record.decision.decisionId || outcome.inputAttestationReceiptId !== record.inputReceipt.receiptId
            || outcome.requestFingerprint !== record.attempt.requestFingerprint || outcome.inputFingerprint !== record.attempt.inputFingerprint || outcome.promptFingerprint !== record.attempt.promptFingerprint
            || outcome.task !== record.attempt.task || outcome.schemaName !== record.attempt.schemaName || outcome.retryOrdinal !== record.attempt.retryOrdinal
            || outcome.isSameModelRepair !== record.attempt.isSameModelRepair || outcome.usedProviderFallback !== record.attempt.usedProviderFallback
            || outcome.previousInvocationId !== (record.attempt.previousInvocationId ?? null) || outcome.reservationMicroUsd !== record.inputReceipt.reservationMicroUsd) denied();
          const ref = owned.refs[record.attempt.usedProviderFallback ? 1 : 0]!;
          if (outcome.provider !== ref.provider || outcome.configuredModel !== ref.model || (outcome.outcome === "accepted" && outcome.reportedModel !== ref.model)) denied();
          await revalidate();
          const result = outcomeReceiptSchema.parse(await rpc("worker_record_capital_body_attempt_outcome_v1", {p_attempt_receipt_id: record.decision.attemptReceiptId, p_outcome: outcome}));
          if (result.operationId !== record.decision.operationId || result.attemptReceiptId !== record.decision.attemptReceiptId || result.inputReceiptId !== record.inputReceipt.receiptId || result.rootAttemptReceiptId !== record.decision.rootAttemptReceiptId) denied();
          const {operationId: _operation, attemptReceiptId: _attempt, inputReceiptId: _input, rootAttemptReceiptId: _root, replayed: _replayed, schemaVersion: _version, ...fields} = result;
          const coreReceipt = verifyAttemptOutcomeReceipt(outcome, {...fields, schemaVersion: "gateway-attempt-outcome-receipt.v1"});
          record.outcome = outcome;
          return coreReceipt;
        },
      });
      const result = await gateway.complete(request);
      return {result, contribution};
    } catch {return denied();}
  }});
}
