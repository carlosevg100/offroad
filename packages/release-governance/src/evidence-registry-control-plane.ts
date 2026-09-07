import {randomBytes} from "node:crypto";
import {fingerprintJson} from "@offroad/case-understanding";
import {
  evidenceAcceptanceManifestSchema,
  evidenceEvaluationRequestSchema,
  evidenceIngestReceiptSchema,
  evidencePromotionTargetSchema,
  evidenceTrustRootSchema,
  type EvidenceAcceptanceManifest,
  type EvidenceEvaluationRequest,
  type EvidenceIngestReceipt,
  type EvidencePromotionTarget,
  type EvidenceRegistryDecision,
  type EvidenceTrustRoot,
} from "./evidence-registry-contract.ts";
import {evaluateEvidenceRegistryAgainstControlPlane} from "./evidence-registry-evaluator.internal.ts";

export type EvidenceControlPlaneSnapshot = Readonly<{
  registryVersion: string;
  registryFingerprint: string;
  roots: readonly EvidenceTrustRoot[];
  manifests: readonly EvidenceAcceptanceManifest[];
  receipts: readonly EvidenceIngestReceipt[];
  nowMs: number;
}>;

const trustRegistryBody = {
  registryVersion: "acceptance-evidence-trust-roots.v1",
  // Intentionally empty. Real roots, manifests and receipts require reviewed control-plane writes.
  roots: [] as EvidenceTrustRoot[],
  manifests: [] as EvidenceAcceptanceManifest[],
  receipts: [] as EvidenceIngestReceipt[],
};

const trustRegistry = deepFreeze({
  ...trustRegistryBody,
  registryFingerprint: fingerprintJson(trustRegistryBody),
});

/**
 * This is the only production constructor for the evaluator's trust state. The public registry
 * request cannot provide roots, allowlists, an authority label or a clock.
 */
export function readEvidenceControlPlaneSnapshot(): EvidenceControlPlaneSnapshot {
  return deepFreeze({
    registryVersion: trustRegistry.registryVersion,
    registryFingerprint: trustRegistry.registryFingerprint,
    roots: trustRegistry.roots.map((root) => evidenceTrustRootSchema.parse(root)),
    manifests: trustRegistry.manifests.map((manifest) => evidenceAcceptanceManifestSchema.parse(manifest)),
    receipts: trustRegistry.receipts.map((receipt) => evidenceIngestReceiptSchema.parse(receipt)),
    nowMs: Date.now(),
  });
}

export type AuthoritativeEvidencePromotionDecision = Readonly<{
  decisionId: string;
  decisionFingerprint: string;
  registryFingerprint: string;
  controlPlaneFingerprint: string;
  target: EvidencePromotionTarget;
  persistedAt: string;
  receipts: ReadonlyArray<Readonly<{
    receiptId: string;
    evidenceId: string;
    expectedCasRevision: number;
    nonce: string;
  }>>;
}>;

/** Durable implementation must persist decisions and consume decision+receipts transactionally. */
export type EvidencePromotionAuthorityStore = Readonly<{
  persistAuthoritativeDecision: (decision: AuthoritativeEvidencePromotionDecision) => Promise<boolean>;
  consumeDecisionAndReceiptsAtomically: (request: Readonly<{
    decisionId: string;
    promotionId: string;
    expectedTarget: EvidencePromotionTarget;
  }>) => Promise<boolean>;
}>;

export type EvidencePromotionAuthorization = Readonly<{
  authorized: boolean;
  code: "authorized" | "decision_not_eligible" | "receipt_cas_rejected";
  decisionFingerprint: string;
}>;

/**
 * Evaluates and persists the authoritative decision without accepting a caller-authored decision
 * or target. The promotion target is derived from the canonical control-plane manifest.
 */
export async function persistEvidenceDecisionForPromotion(
  request: EvidenceEvaluationRequest,
  controlPlane: EvidenceControlPlaneSnapshot,
  store: EvidencePromotionAuthorityStore,
): Promise<Readonly<{decision: EvidenceRegistryDecision; decisionId: string | null; persisted: boolean}>> {
  const parsed = evidenceEvaluationRequestSchema.parse(request);
  const decision = evaluateEvidenceRegistryAgainstControlPlane(parsed, controlPlane);
  if (!eligibleForAuthoritativePersistence(decision)) {
    return {decision, decisionId: null, persisted: false};
  }
  const decisionId = `EPD-${randomBytes(24).toString("hex").toUpperCase()}`;
  const persisted = await store.persistAuthoritativeDecision({
    decisionId,
    decisionFingerprint: decision.decisionFingerprint,
    registryFingerprint: decision.registryFingerprint,
    controlPlaneFingerprint: decision.trustRegistryFingerprint,
    target: evidencePromotionTargetSchema.parse(decision.promotionTarget),
    persistedAt: decision.evaluatedAt,
    receipts: decision.promotionPreconditions,
  });
  return {decision, decisionId: persisted ? decisionId : null, persisted};
}

/**
 * The caller presents only an opaque decision id and intended target. The durable store must match
 * the persisted target and consume both decision and its exact receipt set in one CAS transaction.
 */
export async function consumePersistedEvidenceDecisionForPromotion(
  decisionId: string,
  promotionId: string,
  expectedTarget: EvidencePromotionTarget,
  store: EvidencePromotionAuthorityStore,
): Promise<EvidencePromotionAuthorization> {
  const target = evidencePromotionTargetSchema.safeParse(expectedTarget);
  if (!/^EPD-[A-F0-9]{48}$/.test(decisionId) || !target.success) {
    return {authorized: false, code: "decision_not_eligible", decisionFingerprint: "0".repeat(64)};
  }
  const consumed = await store.consumeDecisionAndReceiptsAtomically({
    decisionId,
    promotionId,
    expectedTarget: target.data,
  });
  return {
    authorized: consumed,
    code: consumed ? "authorized" : "receipt_cas_rejected",
    decisionFingerprint: fingerprintJson({decisionId, target: target.data}),
  };
}

function eligibleForAuthoritativePersistence(decision: EvidenceRegistryDecision): boolean {
  const {decisionFingerprint, ...payload} = decision;
  if (decisionFingerprint !== fingerprintJson(payload)
    || !decision.registryValid
    || !decision.allClaimsSupported
    || !decision.promotionTarget
    || decision.verifiedEvidenceIds.length === 0
    || decision.promotionPreconditions.length !== decision.verifiedEvidenceIds.length) return false;
  const evidenceIds = new Set(decision.verifiedEvidenceIds);
  const preconditionEvidenceIds = new Set(decision.promotionPreconditions.map((entry) => entry.evidenceId));
  const receiptIds = new Set(decision.promotionPreconditions.map((entry) => entry.receiptId));
  const nonces = new Set(decision.promotionPreconditions.map((entry) => entry.nonce));
  return evidenceIds.size === decision.verifiedEvidenceIds.length
    && preconditionEvidenceIds.size === decision.promotionPreconditions.length
    && receiptIds.size === decision.promotionPreconditions.length
    && nonces.size === decision.promotionPreconditions.length
    && [...evidenceIds].every((id) => preconditionEvidenceIds.has(id));
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
