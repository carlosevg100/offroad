import type {AuditReport} from "./audit";
import type {CaseBrief} from "./brief";
import {fingerprintJson} from "./manifest";
import type {NormalizedSemanticAudit} from "./semantic-audit";

export type ClaimDecision = {
  claimId: string;
  decision: "approved" | "rejected";
  claimFingerprint: string;
  decidedBy: string;
  decidedAt: string;
  reason?: string;
};

export type ClaimRecord = {
  id: string;
  sectionId: string;
  text: string;
  kind: "fact" | "calculation" | "judgment" | "public_source";
  material: boolean;
  supportIds: string[];
  fingerprint: string;
  numericStatus: "pass" | "blocked";
  semanticStatus: "pass" | "blocked" | "not_required";
  humanStatus: "not_required" | "pending" | "approved" | "rejected" | "stale";
  status: "verified" | "blocked" | "pending_approval" | "stale";
  blockedBy: string[];
};

export type ArtifactDependency = {
  artifactId: string;
  claimIds: string[];
  supportIds: string[];
  status: "current" | "blocked";
  blockedBy: string[];
};

export type ClaimRegistry = {
  version: "2026.08.24-v1";
  claims: ClaimRecord[];
  artifacts: ArtifactDependency[];
  decisions: ClaimDecision[];
  publication: {allowed: boolean; blockers: string[]};
  fingerprint: string;
};

export type RegistryArtifactInput = {
  artifactId: string;
  claimIds: readonly string[];
  supportIds: readonly string[];
};

export function claimFingerprint(claim: {id: string; text: string; kind: string; material: boolean; supportIds: readonly string[]}): string {
  return fingerprintJson({id: claim.id, text: claim.text, kind: claim.kind, material: claim.material, supportIds: [...claim.supportIds].sort()});
}

export function buildClaimRegistry(input: {
  brief: CaseBrief;
  numericAudit: AuditReport;
  semanticAudit: NormalizedSemanticAudit;
  decisions?: readonly ClaimDecision[];
  artifacts?: readonly RegistryArtifactInput[];
}): ClaimRegistry {
  const decisions = [...(input.decisions ?? [])].sort((a, b) => a.decidedAt.localeCompare(b.decidedAt));
  const numericBlocked = new Map<string, string[]>();
  for (const finding of input.numericAudit.findings) {
    numericBlocked.set(finding.claimId, [...(numericBlocked.get(finding.claimId) ?? []), finding.reason]);
  }
  const semanticBlocked = new Map<string, string[]>();
  for (const finding of input.semanticAudit.findings) {
    semanticBlocked.set(finding.claimId, [...(semanticBlocked.get(finding.claimId) ?? []), finding.reason]);
  }

  const claims: ClaimRecord[] = input.brief.sections.flatMap((section) => section.claims.map((claim) => {
    const fingerprint = claimFingerprint(claim);
    const numericReasons = numericBlocked.get(claim.id) ?? [];
    const semanticReasons = claim.material ? semanticBlocked.get(claim.id) ?? [] : [];
    const decision = [...decisions].reverse().find((candidate) => candidate.claimId === claim.id);
    const humanStatus: ClaimRecord["humanStatus"] = claim.kind !== "judgment" || !claim.material
      ? "not_required"
      : !decision
        ? "pending"
        : decision.claimFingerprint !== fingerprint
          ? "stale"
          : decision.decision === "approved"
            ? "approved"
            : "rejected";
    const blockedBy = [
      ...numericReasons.map((reason) => `numeric:${reason}`),
      ...semanticReasons.map((reason) => `semantic:${reason}`),
      ...(humanStatus === "pending" ? ["human:approval_pending"] : []),
      ...(humanStatus === "rejected" ? ["human:rejected"] : []),
      ...(humanStatus === "stale" ? ["human:decision_stale"] : []),
    ];
    const status: ClaimRecord["status"] = humanStatus === "stale"
      ? "stale"
      : blockedBy.some((reason) => !reason.endsWith("approval_pending"))
        ? "blocked"
        : humanStatus === "pending"
          ? "pending_approval"
          : "verified";
    return {
      id: claim.id,
      sectionId: section.id,
      text: claim.text,
      kind: claim.kind,
      material: claim.material,
      supportIds: [...claim.supportIds],
      fingerprint,
      numericStatus: numericReasons.length === 0 ? "pass" : "blocked",
      semanticStatus: claim.material ? semanticReasons.length === 0 ? "pass" : "blocked" : "not_required",
      humanStatus,
      status,
      blockedBy,
    };
  }));

  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const artifacts: ArtifactDependency[] = (input.artifacts ?? []).map((artifact) => {
    const claimIds = [...new Set(artifact.claimIds)].sort();
    const supportIds = [...new Set([
      ...artifact.supportIds,
      ...claimIds.flatMap((claimId) => claimsById.get(claimId)?.supportIds ?? []),
    ])].sort();
    const blockedBy = claimIds
      .filter((claimId) => claimsById.get(claimId)?.status !== "verified")
      .map((claimId) => `claim:${claimId}`);
    return {artifactId: artifact.artifactId, claimIds, supportIds, status: blockedBy.length === 0 ? "current" : "blocked", blockedBy};
  });

  const blockers = [
    ...claims.filter((claim) => claim.material && claim.status !== "verified").map((claim) => `claim:${claim.id}`),
    ...artifacts.filter((artifact) => artifact.status === "blocked").map((artifact) => `artifact:${artifact.artifactId}`),
  ].sort();
  const payload = {version: "2026.08.24-v1" as const, claims, artifacts, decisions, publication: {allowed: blockers.length === 0, blockers}};
  return {...payload, fingerprint: fingerprintJson(payload)};
}

/** Returns every claim and artifact that must be re-reviewed after an accepted fact changes. */
export function affectedBySupportChanges(registry: ClaimRegistry, changedSupportIds: readonly string[]): {
  claimIds: string[];
  artifactIds: string[];
} {
  const changed = new Set(changedSupportIds);
  const claimIds = registry.claims.filter((claim) => claim.supportIds.some((id) => changed.has(id))).map((claim) => claim.id).sort();
  const impactedClaims = new Set(claimIds);
  const artifactIds = registry.artifacts
    .filter((artifact) => artifact.supportIds.some((id) => changed.has(id)) || artifact.claimIds.some((id) => impactedClaims.has(id)))
    .map((artifact) => artifact.artifactId)
    .sort();
  return {claimIds, artifactIds};
}
