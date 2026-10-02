/** Closed contribution renderer and live attempt authority. Not a native M07 producer. */
import {createHash} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {originationSeniorReadoutSchema} from "@offroad/domain-contracts";
import {assertGatewaySchemaUnchanged, buildEffectiveAdapterRequest, createModelGateway, defaultTaskPolicies,
  legacyGatewayFingerprint, prepareGatewayInput, resolveModel, retentionMatrixVersion,
  type GatewayCallLog, type ModelGatewayConfig, type GatewayInputAttestation, type GatewayAttempt} from "@offroad/model-gateway";
import type {createCapitalBodyRetention, CapitalBodyJobAuthority, CapitalBodyRetentionReceipt} from "./capital-body-retention";
import {providerConnectionsSchema, providerEndpoints, type ProviderConnections} from "./provider-processing";

export const capitalBodyProcessingRendererVersion = "capital-body-contribution-renderer.v1";
const resources = Object.freeze(["inference", "prompt_cache", "schema_cache"] as const);
const system = "Summarize the authorized contribution according to the supplied schema. Use only the supplied contribution; do not invent facts.";
const hash = z.string().regex(/^[a-f0-9]{64}$/), uuid = z.uuid();
const decisionSchema = z.strictObject({schemaVersion: z.literal("capital-body-processing-decision.v1"), allowed: z.boolean(),
  policyVersion: z.literal(retentionMatrixVersion), assuranceId: uuid.nullable(), assuranceIds: z.array(uuid).max(3), decisionId: uuid,
  classification: z.literal("restricted"), reasons: z.array(z.string().regex(/^[a-z_:]+$/)).max(100), attemptReceiptId: uuid,
  invocationId: uuid, requestFingerprint: hash, eligibilityFingerprint: hash, replayed: z.boolean()});
const inputReceiptSchema = z.strictObject({receiptId: uuid, invocationId: uuid, requestFingerprint: hash});
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
function identity(scope: CapitalBodyRetentionReceipt) {const {replayed: _marker, ...rest} = scope; return legacyGatewayFingerprint(rest);}

/** Callbacks stay private: callers cannot attach this authority to an arbitrary request. */
export function createCapitalBodyProcessingAuthority(config: CapitalBodyProcessingConfig) {
  const owned = (() => {
    try {
      const authority = freeze(z.strictObject({jobId: uuid, capabilityToken: z.string().min(1).max(4096)}).parse(config.authority));
      const connections = freeze(providerConnectionsSchema.parse(structuredClone(config.connections)));
      const policies = freeze(structuredClone(defaultTaskPolicies));
      const route = resolveModel("preliminary_understanding", policies, {});
      if (!route.fallback || !connections[route.primary.provider] || !connections[route.fallback.provider]) denied();
      const refs = [freeze({...route.primary}), freeze({...route.fallback})];
      const adapters = Object.fromEntries(refs.map(ref => {
        const adapter = config.adapters[ref.provider];
        if (!adapter || adapter.provider !== ref.provider) denied();
        return [ref.provider, Object.freeze({provider: adapter.provider, complete: adapter.complete.bind(adapter)})];
      })) as ModelGatewayConfig["adapters"];
      return {authority, connections, policies, refs, defaults: freeze({maxOutputTokens: route.policy.maxOutputTokens, timeoutMs: route.policy.timeoutMs}), adapters,
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
      if (identity(snapshot.scope) !== identity(receipt) || bytes.byteLength !== receipt.byteLength || physicalHash(bytes) !== receipt.payloadFingerprint) denied();
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
      const components = freeze([{kind: "retained_payload", id: receipt.retainedPayloadId}]);
      const records = new Map<string, {attempt: GatewayAttempt; decision: Decision; attested: boolean}>();
      const revalidate = async () => {
        const current = await owned.read(receipt.retainedPayloadId!, receipt);
        if (identity(current.scope) !== identity(receipt) || current.bytes.byteLength !== bytes.byteLength || physicalHash(current.bytes) !== receipt.payloadFingerprint) denied();
        assertGatewaySchemaUnchanged(prepared);
      };
      const gateway = createModelGateway({adapters: owned.adapters, policies: owned.policies, redaction,
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
            || attemptCopy.retryOrdinal !== 0 || attemptCopy.isSameModelRepair || !Number.isFinite(attemptCopy.reservationUsd) || attemptCopy.reservationUsd < 0) denied();
          const prior = [...records.values()][0];
          if (index === 0 ? attemptCopy.previousInvocationId !== undefined : !prior || prior.decision.allowed || prior.attested || attemptCopy.previousInvocationId !== prior.attempt.invocationId) denied();
          await revalidate();
          const connection = owned.connections[provider]!;
          const decision = freeze(decisionSchema.parse(await rpc("worker_authorize_capital_body_processing_v1", {p_attempt: attemptCopy,
            p_route: {...connection, provider, model, endpoint: providerEndpoints[provider]}, p_resources: [...resources], p_purpose: "case_analysis", p_components: components})));
          if (decision.invocationId !== attemptCopy.invocationId || decision.requestFingerprint !== built.requestFingerprintV1
            || (decision.allowed ? decision.reasons.length !== 0 || decision.assuranceIds.length !== 3 || decision.assuranceId !== null : decision.reasons.length === 0)
            || new Set(decision.assuranceIds).size !== decision.assuranceIds.length
            || (decision.assuranceId !== null && !decision.assuranceIds.includes(decision.assuranceId))
            || [...records.values()].some(record => record.decision.decisionId === decision.decisionId || record.decision.attemptReceiptId === decision.attemptReceiptId)) denied();
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
          const result = inputReceiptSchema.parse(await rpc("worker_record_capital_body_input_v2", {p_attempt_receipt_id: record.decision.attemptReceiptId}));
          if (result.invocationId !== attestation.invocationId || result.requestFingerprint !== attestation.requestFingerprint) denied();
          record.attested = true;
          return result;
        },
      });
      const result = await gateway.complete(request);
      return {result, contribution};
    } catch {return denied();}
  }});
}
