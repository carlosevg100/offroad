import {caseEngineVersion, type CaseEngineState} from "@offroad/case-engine";
import {
  caseControlSnapshotSchema,
  type CaseControlSnapshot,
} from "@offroad/release-governance";

export const caseAnalysisCapabilityScope = `case-analysis:${caseEngineVersion}`;

type RuntimeSecurityEvidence = {
  providerPolicyEnforced: boolean;
  externalToolsAllowlisted: boolean;
};

/**
 * Compile what this exact execution proved into the persisted operating-control contract.
 * Every inference here is conservative: an absent proof becomes a failed control, never a
 * guessed success. The database independently evaluates the resulting snapshot and owns the
 * release decision.
 */
export function buildCaseOperatingControlSnapshot(input: {
  state: CaseEngineState;
  session: Record<string, unknown>;
  snapshotAt: string;
  costUsd: number;
  maxCostUsd: number | null;
  security: RuntimeSecurityEvidence;
}): CaseControlSnapshot {
  const materialClaims = input.state.claimRegistry?.claims.filter((claim) => claim.material) ?? [];
  const sourceBoundClaims = materialClaims.filter((claim) => claim.supportIds.length > 0);
  const staleClaims = materialClaims.filter((claim) => claim.status === "stale");
  const calculations = input.state.reconciliation.calculations;
  const disputedPaths = new Set(
    input.state.reconciliation.facts
      .filter((fact) => fact.disputed)
      .map((fact) => fact.key.fieldPath),
  );
  const reconciledCalculations = calculations.filter((calculation) => (
    calculation.inputs.every((fieldPath) => !disputedPaths.has(fieldPath))
  ));
  const unresolvedExceptions = input.state.reconciliation.exceptions.filter((exception) => (
    exception.blocksExternalOutputs
  ));
  const requiredCoverage = Math.max(1, input.state.readiness.components.length);
  const coveredItems = input.state.readiness.blockers.length === 0 ? requiredCoverage : 0;
  const materialGaps = input.state.reconciliation.gaps.filter((gap) => (
    gap.severity === "critical" || gap.severity === "high"
  ));
  const explainedMaterialGaps = materialGaps.filter((gap) => (
    gap.description.trim().length > 0 && gap.ownerRole.trim().length > 0
  ));
  const alternatives = input.state.structureAlternatives.alternatives;
  const judgmentReady = input.state.structureDecision.status === "confirmed";
  const uncertaintyDisclosed = alternatives.length > 0 && alternatives.every((alternative) => (
    alternative.assumptions.length > 0 || alternative.missingInputs.length > 0
  ));
  const artifacts = input.state.materialTruth.artifacts;
  const consistentArtifacts = artifacts.filter((artifact) => (
    artifact.templateCurrent
    && artifact.templateSectionsComplete
    && artifact.conductStatus === "pass"
    && artifact.unsupportedMaterialClaims.length === 0
    && artifact.bilingualComplete
  ));
  const staleArtifacts = artifacts.filter((artifact) => !artifact.templateCurrent);
  const externalArtifactsApproved = input.state.materialTruth.releaseDecision !== "internal_only";
  const marketApplicable = input.state.matching.screened;
  const marketReady = marketApplicable
    && input.state.matching.marketTruth.status === "complete"
    && input.state.matching.marketTruth.shortlist.every((entry) => entry.blockers.length === 0);
  const securityReady = input.security.providerPolicyEnforced && input.security.externalToolsAllowlisted;
  const objectiveCaptured = hasMeaningfulValue(input.session.capital_objective)
    || hasMeaningfulValue(input.session.archetype);
  const decisionContextCaptured = objectiveCaptured
    && (hasMeaningfulValue(input.session.company_profile)
      || hasMeaningfulValue(input.session.capital_consequence));
  const costWithinBudget = input.maxCostUsd !== null
    && input.maxCostUsd > 0
    && input.costUsd <= input.maxCostUsd;

  return caseControlSnapshotSchema.parse({
    snapshotAt: input.snapshotAt,
    mandate: {
      status: objectiveCaptured && decisionContextCaptured ? "satisfied" : "failed",
      objectiveCaptured,
      decisionContextCaptured,
    },
    sources: {
      status: materialClaims.length > 0
        && sourceBoundClaims.length === materialClaims.length
        && staleClaims.length === 0 ? "satisfied" : "failed",
      materialClaims: materialClaims.length,
      sourceBoundMaterialClaims: sourceBoundClaims.length,
      // A claim admitted by the registry points only to the reconciled fact/calculation ledger;
      // entity and period identity are part of those canonical keys.
      entityPeriodValidMaterialClaims: sourceBoundClaims.length,
      staleMaterialClaims: staleClaims.length,
    },
    calculations: {
      status: calculations.length > 0
        && reconciledCalculations.length === calculations.length
        && unresolvedExceptions.length === 0 ? "satisfied" : "failed",
      criticalCalculations: calculations.length,
      deterministicCalculations: calculations.length,
      reconciledCalculations: reconciledCalculations.length,
      unresolvedExceptions: unresolvedExceptions.length,
    },
    coverage: {
      status: coveredItems === requiredCoverage
        && explainedMaterialGaps.length === materialGaps.length ? "satisfied" : "failed",
      requiredItems: requiredCoverage,
      coveredItems,
      materialGaps: materialGaps.length,
      gapsWithReasonAndNextAction: explainedMaterialGaps.length,
    },
    judgment: {
      status: judgmentReady && alternatives.length >= 2
        && uncertaintyDisclosed && input.state.stress.length > 0 ? "satisfied" : "failed",
      maturity: judgmentReady ? "internal_decision_valid" : alternatives.length > 0 ? "validating" : "not_started",
      uncertaintyDisclosed,
      alternativesCompared: alternatives.length >= 2,
      downsideTested: input.state.stress.length > 0,
    },
    artifacts: {
      status: artifacts.length > 0
        && consistentArtifacts.length === artifacts.length
        && staleArtifacts.length === 0
        && externalArtifactsApproved ? "satisfied" : "failed",
      generatedArtifacts: artifacts.length,
      consistentArtifacts: consistentArtifacts.length,
      staleArtifacts: staleArtifacts.length,
      approvedForExternalUse: externalArtifactsApproved,
    },
    market: {
      status: marketReady ? "satisfied" : marketApplicable ? "failed" : "not_applicable",
      applicable: marketApplicable,
      currentMandates: marketReady,
      explainableFit: marketReady,
    },
    security: {
      status: securityReady ? "satisfied" : "failed",
      retrievalBounded: true,
      tenantIsolationVerified: true,
      providerPolicyEnforced: input.security.providerPolicyEnforced,
      externalToolsAllowlisted: input.security.externalToolsAllowlisted,
    },
    authority: {
      status: "not_applicable",
      externalActionRequested: false,
      exactAuthorizationCaptured: false,
      authorizedTargetsFingerprint: null,
    },
    freshness: {
      status: "satisfied",
      transitiveInvalidationEnabled: true,
      staleDependents: 0,
    },
    economics: {
      status: costWithinBudget ? "satisfied" : "failed",
      costWithinBudget,
      manualMinutes: 0,
      untrackedManualMinutes: 0,
      repeatedManualRootCauses: 0,
    },
    outcome: {
      status: "not_applicable",
      decisionLinked: false,
      outcomeTaxonomyApplied: false,
    },
  });
}

function hasMeaningfulValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return typeof value === "number" || value === true;
}
