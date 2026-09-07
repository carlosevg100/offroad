import {fingerprintJson} from "@offroad/case-understanding";
import {
  evidenceAcceptanceManifestSchema,
  evidenceIngestReceiptSchema,
  evidenceTrustRootSchema,
  type EvidenceAcceptanceManifest,
  type EvidenceIngestReceipt,
  type EvidenceRegistryDecision,
  type EvidenceTrustRoot,
} from "./evidence-registry-contract.ts";

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

export type EvidencePromotionCasRequest = Readonly<{
  promotionId: string;
  decisionFingerprint: string;
  receipts: ReadonlyArray<Readonly<{
    receiptId: string;
    evidenceId: string;
    expectedCasRevision: number;
    nonce: string;
  }>>;
}>;

/** The durable control plane must implement this as one atomic compare-and-swap transaction. */
export type EvidencePromotionCasStore = Readonly<{
  consumeAvailableReceiptsAtomically: (request: EvidencePromotionCasRequest) => Promise<boolean>;
}>;

export type EvidencePromotionAuthorization = Readonly<{
  authorized: boolean;
  code: "authorized" | "decision_not_eligible" | "receipt_cas_rejected";
  decisionFingerprint: string;
}>;

/**
 * Control-plane-only promotion boundary. Evaluation is not promotion: every receipt must be
 * consumed in one atomic CAS before the caller may transition a capability or release.
 */
export async function consumeEvidenceDecisionForPromotion(
  decision: EvidenceRegistryDecision,
  promotionId: string,
  store: EvidencePromotionCasStore,
): Promise<EvidencePromotionAuthorization> {
  const {decisionFingerprint, ...decisionPayload} = decision;
  const eligible = decisionFingerprint === fingerprintJson(decisionPayload)
    && decision.registryValid
    && decision.allClaimsSupported
    && decision.verifiedEvidenceIds.length > 0
    && decision.promotionPreconditions.length === decision.verifiedEvidenceIds.length
    && decision.promotionPreconditions.every((entry) => decision.verifiedEvidenceIds.includes(entry.evidenceId));
  if (!eligible) {
    return {authorized: false, code: "decision_not_eligible", decisionFingerprint};
  }
  const consumed = await store.consumeAvailableReceiptsAtomically({
    promotionId,
    decisionFingerprint,
    receipts: decision.promotionPreconditions,
  });
  return {
    authorized: consumed,
    code: consumed ? "authorized" : "receipt_cas_rejected",
    decisionFingerprint,
  };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
