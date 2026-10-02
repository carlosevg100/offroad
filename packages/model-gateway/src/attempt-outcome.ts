import {z} from "zod";
import {ordinalGatewayFingerprint} from "./input-serialization";
import {defaultTaskPolicies} from "./policy";
import type {TaskKind} from "./types";

export const attemptOutcomeFingerprintVersion = "gateway-attempt-outcome-fingerprint.v1" as const;
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const uuid = z.uuid().refine(value => value === value.toLowerCase());
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const token = z.string().min(1).max(160).regex(/^[A-Za-z0-9_.:-]+$/);
export const gatewayAttemptOutcomeSchema = z.strictObject({
  schemaVersion: z.literal("gateway-attempt-outcome.v1"), fingerprintVersion: z.literal(attemptOutcomeFingerprintVersion), outcomeFingerprint: hash,
  invocationId: uuid, task: z.enum(Object.keys(defaultTaskPolicies) as [TaskKind, ...TaskKind[]]), provider: z.enum(["anthropic", "openai"]), configuredModel: token, schemaName: token,
  adapterInputVersion: z.literal("gateway-adapter-input.v1"), requestFingerprint: hash, inputFingerprint: hash, promptFingerprint: hash,
  previousInvocationId: uuid.nullable(), retryOrdinal: integer, isSameModelRepair: z.boolean(), usedProviderFallback: z.boolean(),
  processingDecisionId: uuid.nullable(), inputAttestationReceiptId: uuid.nullable(), fromCassette: z.boolean(),
  outcome: z.enum(["accepted", "invalid_output", "provider_error", "timeout", "refusal"]),
  failureCode: z.enum(["schema_invalid", "deterministic_invalid", "output_truncated", "provider_failure", "provider_timeout", "provider_refusal"]).nullable(),
  outputFingerprintVersion: z.literal("gateway-parsed-output.v1").nullable(), outputFingerprint: hash.nullable(), reportedModel: token.nullable(),
  validationIssueCodeFingerprint: hash.nullable(), reservationMicroUsd: integer, costMicroUsd: integer.nullable(), exposureMicroUsd: integer,
  costStatus: z.enum(["measured", "unknown", "cassette"]), inputTokens: integer.nullable(), outputTokens: integer.nullable(), cachedInputTokens: integer.nullable(), latencyMillis: integer,
}).superRefine((value, context) => {
  const fail = () => context.addIssue({code: "custom", message: "gateway_attempt_outcome_invalid"});
  const expected = {accepted: [null], invalid_output: ["schema_invalid", "deterministic_invalid", "output_truncated"], provider_error: ["provider_failure"], timeout: ["provider_timeout"], refusal: ["provider_refusal"]};
  if (!(expected[value.outcome] as Array<string | null>).includes(value.failureCode)) fail();
  if (value.outcome === "accepted" ? value.outputFingerprintVersion === null || value.outputFingerprint === null || value.reportedModel === null : value.outputFingerprintVersion !== null || value.outputFingerprint !== null || value.reportedModel !== null) fail();
  if (value.outcome !== "invalid_output" && value.validationIssueCodeFingerprint !== null) fail();
  if (value.costStatus === "unknown") {
    if (value.costMicroUsd !== null || value.inputTokens !== null || value.outputTokens !== null || value.cachedInputTokens !== null || value.exposureMicroUsd !== value.reservationMicroUsd) fail();
  } else if (value.costMicroUsd === null || value.inputTokens === null || value.outputTokens === null || value.cachedInputTokens === null) fail();
  else if (value.costStatus === "cassette" ? !value.fromCassette || value.costMicroUsd !== 0 || value.exposureMicroUsd !== 0 : value.fromCassette || value.exposureMicroUsd !== Math.max(value.reservationMicroUsd, value.costMicroUsd)) fail();
  if ((value.outcome === "timeout" || value.outcome === "provider_error") && value.costStatus !== "unknown") fail();
});
export type GatewayAttemptOutcome = Readonly<z.infer<typeof gatewayAttemptOutcomeSchema>>;
export const gatewayAttemptOutcomeReceiptSchema = z.strictObject({schemaVersion: z.literal("gateway-attempt-outcome-receipt.v1"), receiptId: uuid,
  invocationId: uuid, requestFingerprint: hash, fingerprintVersion: z.literal(attemptOutcomeFingerprintVersion), outcomeFingerprint: hash,
  outcome: z.enum(["accepted", "invalid_output", "provider_error", "timeout", "refusal"]), failureCode: gatewayAttemptOutcomeSchema.shape.failureCode});
export type GatewayAttemptOutcomeReceipt = Readonly<z.infer<typeof gatewayAttemptOutcomeReceiptSchema>>;

/** Ceil of the canonical decimal JSON number, never binary floating-point multiplication. */
export function conservativeMicroUsd(value: number): number {
  if (!Number.isFinite(value) || value < 0 || Object.is(value, -0)) throw new Error("gateway_attempt_outcome_invalid");
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(JSON.stringify(value));
  if (!match) throw new Error("gateway_attempt_outcome_invalid");
  const coefficient = BigInt(match[1]! + (match[2] ?? ""));
  const scale = 6 + Number(match[3] ?? 0) - (match[2]?.length ?? 0);
  const units = scale >= 0 ? coefficient * 10n ** BigInt(scale) : (coefficient + 10n ** BigInt(-scale) - 1n) / 10n ** BigInt(-scale);
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("gateway_attempt_outcome_invalid");
  return Number(units);
}
export function attemptOutcomeTuple(value: Omit<GatewayAttemptOutcome, "outcomeFingerprint" | "schemaVersion">): readonly unknown[] {
  return [value.fingerprintVersion,value.invocationId,value.task,value.provider,value.configuredModel,value.schemaName,value.adapterInputVersion,
    value.requestFingerprint,value.inputFingerprint,value.promptFingerprint,value.previousInvocationId,value.retryOrdinal,value.isSameModelRepair,value.usedProviderFallback,
    value.processingDecisionId,value.inputAttestationReceiptId,value.fromCassette,value.outcome,value.failureCode,value.outputFingerprintVersion,value.outputFingerprint,
    value.reportedModel,value.validationIssueCodeFingerprint,value.reservationMicroUsd,value.costMicroUsd,value.exposureMicroUsd,value.costStatus,value.inputTokens,value.outputTokens,value.cachedInputTokens,value.latencyMillis];
}
export function prepareAttemptOutcome(value: Omit<GatewayAttemptOutcome, "outcomeFingerprint" | "schemaVersion" | "fingerprintVersion">): GatewayAttemptOutcome {
  try {
    const candidate = {schemaVersion: "gateway-attempt-outcome.v1" as const, fingerprintVersion: attemptOutcomeFingerprintVersion, ...value, outcomeFingerprint: "0".repeat(64)};
    const validated = gatewayAttemptOutcomeSchema.parse(candidate);
    return Object.freeze({...validated, outcomeFingerprint: ordinalGatewayFingerprint(attemptOutcomeTuple(validated))});
  } catch {throw new Error("gateway_attempt_outcome_invalid");}
}
export function verifyAttemptOutcomeReceipt(outcome: GatewayAttemptOutcome, receipt: unknown): GatewayAttemptOutcomeReceipt {
  try {
    const parsed = gatewayAttemptOutcomeReceiptSchema.parse(receipt);
    if (parsed.invocationId !== outcome.invocationId || parsed.requestFingerprint !== outcome.requestFingerprint || parsed.outcomeFingerprint !== outcome.outcomeFingerprint || parsed.outcome !== outcome.outcome || parsed.failureCode !== outcome.failureCode) throw new Error();
    return Object.freeze(parsed);
  } catch {throw new Error("gateway_attempt_outcome_invalid");}
}
