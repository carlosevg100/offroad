import {claimSchema, type Claim} from "@offroad/domain-contracts";

export type EvidenceCompilation = {
  status: "pass" | "blocked";
  coverage: number;
  acceptedClaimIds: string[];
  blocked: Array<{claimId: string; reason: string}>;
};

export function compileClaims(input: unknown[]): EvidenceCompilation {
  const claims = input.map((item) => claimSchema.parse(item));
  const blocked: EvidenceCompilation["blocked"] = [];
  const acceptedClaimIds: string[] = [];

  for (const claim of claims) {
    const reason = validateClaim(claim);
    if (reason) blocked.push({claimId: claim.id, reason});
    else acceptedClaimIds.push(claim.id);
  }

  const material = claims.filter((claim) => claim.material);
  const acceptedMaterial = material.filter((claim) => acceptedClaimIds.includes(claim.id));
  const coverage = material.length === 0 ? 1 : acceptedMaterial.length / material.length;

  return {
    status: blocked.length === 0 ? "pass" : "blocked",
    coverage: Number(coverage.toFixed(4)),
    acceptedClaimIds,
    blocked,
  };
}

function validateClaim(claim: Claim): string | null {
  if (claim.material && claim.supportIds.length === 0) return "material_claim_without_support";
  if (claim.kind === "judgment" && claim.material && !claim.approved) return "material_judgment_without_approval";
  return null;
}

export function assertEconomicIdentity(left: Record<string, string>, right: Record<string, string>): void {
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));
  if (JSON.stringify(leftEntries) !== JSON.stringify(rightEntries)) {
    throw new Error("localized outputs are not economically identical");
  }
}
