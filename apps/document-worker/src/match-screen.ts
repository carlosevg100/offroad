import type {CaseEngineState} from "@offroad/case-engine";
import {fingerprintJson} from "@offroad/case-understanding";
import {
  capitalProviderKindSchema,
  matchScreenSchema,
  type MatchScreen,
} from "@offroad/domain-contracts";

type Input = {
  matching: CaseEngineState["matching"];
  packageReviewFingerprint: string;
  materialArtifactFingerprint: string;
  materialTruthFingerprint: string;
  providerContext?: Readonly<Record<string, {
    providerKind: string;
    providerSource: "directory" | "registered";
    fundDirectoryId: string | null;
    providerOrganizationId: string | null;
    providerFundId: string | null;
  }>>;
};

export function buildGovernedMatchScreen(input: Input): MatchScreen {
  const shortlist = new Map(
    input.matching.marketTruth.shortlist.map((entry) => [entry.fundId, entry]),
  );
  const candidates = input.matching.fits.map((fit, index) => {
    const governed = shortlist.get(fit.fundId);
    if (!governed) throw new Error(`mandate fit ${fit.fundId} is absent from market truth`);
    const provider = input.providerContext?.[fit.fundId];
    if (!provider) throw new Error(`provider context ${fit.fundId} is absent from governed input`);
    const providerKind = capitalProviderKindSchema.catch("unknown").parse(provider.providerKind);
    return {
      providerId: fit.fundId,
      providerName: fit.fundName,
      providerKind,
      providerSource: provider.providerSource,
      fundDirectoryId: provider.fundDirectoryId,
      providerOrganizationId: provider.providerOrganizationId,
      providerFundId: provider.providerFundId,
      verdict: fit.verdict,
      eligibleForShortlist: governed.eligibleForShortlist,
      mandateFingerprint: governed.mandateFingerprint,
      sourceClasses: governed.sourceClasses,
      rationale: governed.rationale,
      criteria: fit.criteria.map((criterion) => ({
        id: criterion.id,
        label: criterion.labels,
        outcome: criterion.outcome,
        hard: criterion.hard,
        mandate: criterion.mandate ?? null,
        transaction: criterion.request ?? null,
        explanation: criterion.explanation,
        resolvedBy: criterion.resolvedBy ?? null,
        divergent: criterion.divergent,
      })),
      confirmations: governed.confirmations,
      governanceBlockers: governed.blockers,
      staleMonths: fit.staleMonths,
      divergences: fit.divergences,
      order: index + 1,
    };
  });
  const eligible = candidates.filter((candidate) => candidate.eligibleForShortlist).length;
  const blockedByGovernance = candidates.filter((candidate) => (
    candidate.verdict !== "excluded" && candidate.governanceBlockers.length > 0
  )).length;
  const status: MatchScreen["status"] = candidates.length === 0
    ? "not_screened"
    : eligible > 0 ? "ready_for_review"
      : blockedByGovernance > 0 ? "needs_mandate_refresh" : "no_eligible_mandates";

  return matchScreenSchema.parse({
    schemaVersion: "2026.08.29-v3",
    status,
    packageReviewFingerprint: input.packageReviewFingerprint,
    materialArtifactFingerprint: input.materialArtifactFingerprint,
    materialTruthFingerprint: input.materialTruthFingerprint,
    matchingFingerprint: fingerprintJson(input.matching),
    candidates,
    summary: {
      screened: candidates.length,
      eligible,
      possible: candidates.filter((candidate) => candidate.verdict === "possible").length,
      excluded: candidates.filter((candidate) => candidate.verdict === "excluded").length,
      blockedByGovernance,
    },
    structuralExclusions: input.matching.structuralExclusions,
    noContactAuthorized: true,
  });
}
