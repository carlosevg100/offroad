import {fingerprintJson} from "@offroad/case-understanding";
import {
  evidenceTrustRootSchema,
  type EvidenceTrustRoot,
} from "./evidence-registry-contract.ts";

export type EvidenceControlPlaneSnapshot = Readonly<{
  registryVersion: string;
  registryFingerprint: string;
  roots: readonly EvidenceTrustRoot[];
  nowMs: number;
}>;

const trustRegistryBody = {
  registryVersion: "acceptance-evidence-trust-roots.v1",
  // Intentionally empty. A real collector or assessor key requires a reviewed control-plane change.
  roots: [] as EvidenceTrustRoot[],
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
    nowMs: Date.now(),
  });
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
