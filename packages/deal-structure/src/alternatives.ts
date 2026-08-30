import {createHash} from "node:crypto";

import type {InstrumentVerdict} from "@offroad/credit-playbook";
import Decimal from "decimal.js";

import type {OperationTruthSet} from "./operation";
import type {StructureTruthSet} from "./structure";

export const structureAlternativesVersion = "2026.08.29-v2";

export type StructureBasisLine = {
  id: string;
  label: string;
  amount: string;
  origin: "reconciled_fact" | "calculation" | "company_input" | "proposal";
  basisIds: string[];
  condition: "available" | "conditional" | "proposed";
};

export type StructureAlternativeDraft = {
  id: string;
  label: string;
  instrument: string;
  route: string;
  amount: string;
  currency: string;
  termMonths: number;
  graceMonths: number;
  amortization: string;
  indexer: string;
  targetBuyer: string | null;
  rationale: string;
  pros: string[];
  cons: string[];
  assumptions: string[];
  sources: StructureBasisLine[];
  uses: StructureBasisLine[];
  security: Array<{description: string; basisIds: string[]}>;
  covenants: Array<{description: string; basisIds: string[]}>;
  conditionsPrecedent: Array<{description: string; owner: string | null; basisIds: string[]}>;
  implementationDays: {min: number; max: number; basisIds: string[]} | null;
  basisIds: string[];
};

export type StructureAlternativeVerification = {
  alternativeFingerprint: string;
  contextFingerprint: string;
  verifierVersion: string;
  verifiedAt: string;
  operationTruth: OperationTruthSet;
  structureTruth: StructureTruthSet;
};

export type AlternativePricingInput = {
  decision: "reference_available" | "abstain";
  policyVersion: string;
  spreadBps: {min: number; max: number} | null;
  totalRate: {min: string; max: string} | null;
  annualizedCostBps: number | null;
  componentIds: string[];
  missingInputs: string[];
};

export type StructureRecommendationInput = {
  alternativeId: string;
  rationale: string;
  basisIds: string[];
  proposedBy: string;
  proposedAt: string;
};

export type StructureAlternativesInput = {
  alternatives: StructureAlternativeDraft[];
  recommendation: StructureRecommendationInput | null;
};

export type CompiledStructureAlternative = StructureAlternativeDraft & {
  alternativeFingerprint: string;
  sourcesAndUses: {
    totalSources: string;
    totalUses: string;
    difference: string;
    status: "pass" | "fail";
  };
  totalCost: {
    status: "available" | "pending_market_reference";
    policyVersion: string | null;
    spreadBps: {min: number; max: number} | null;
    totalRate: {min: string; max: string} | null;
    annualizedCostBps: number | null;
    componentIds: string[];
  };
  gates: {
    routeEligible: boolean;
    deterministicVerification: boolean;
    verifiedTermsMatch: boolean | null;
    verifiedSourcesAndUsesMatch: boolean | null;
    sizingWithinEnvelope: boolean | null;
    sourcesAndUsesClosed: boolean;
    dayOneCompatible: boolean | null;
    termsValid: boolean;
    basisTraceable: boolean;
  };
  status: "comparable" | "incomplete" | "blocked";
  confirmationEligible: boolean;
  blockers: string[];
  missingInputs: string[];
  verification: {
    verifierVersion: string | null;
    verifiedAt: string | null;
    operationTruthVersion: string | null;
    structureTruthVersion: string | null;
  };
};

export type StructureAlternatives = {
  version: string;
  status: "pending_design" | "blocked" | "pending_confirmation";
  alternatives: CompiledStructureAlternative[];
  comparison: Array<{
    alternativeId: string;
    instrument: string;
    amount: string;
    termMonths: number;
    graceMonths: number;
    amortization: string;
    security: string[];
    totalRate: {min: string; max: string} | null;
    implementationDays: {min: number; max: number} | null;
    status: CompiledStructureAlternative["status"];
    blockers: string[];
    missingInputs: string[];
  }>;
  recommendation: (StructureRecommendationInput & {
    status: "ready_for_confirmation" | "invalid";
    blockers: string[];
  }) | null;
  proposalFingerprint: string | null;
  blockers: string[];
  missingInputs: string[];
  procedureCoverage: Array<{
    taskId: `S${string}`;
    procedureIds: string[];
    status: "completed" | "partial" | "blocked" | "not_computable";
    outputIds: string[];
    blockers: string[];
  }>;
};

export type StructureConfirmationInput = {
  decision: "confirm" | "request_changes" | "decline";
  selectedAlternativeId: string;
  proposalFingerprint: string;
  actorId: string;
  decidedAt: string;
  rationale?: string;
  requestedChanges?: string[];
};

export type StructureDecision = {
  version: string;
  status: "unavailable" | "pending_confirmation" | "confirmed" | "changes_requested" | "declined" | "stale" | "invalid";
  proposalFingerprint: string | null;
  selectedAlternativeId: string | null;
  actorId: string | null;
  decidedAt: string | null;
  rationale: string | null;
  requestedChanges: string[];
  materialsPreparationAllowed: boolean;
  externalContactAuthorized: false;
  qualifiedIntroductionAuthorized: false;
  blockers: string[];
};

const validAmount = (value: string) => {
  try { return new Decimal(value).gt(0); } catch { return false; }
};
const sum = (lines: readonly StructureBasisLine[]) => lines.reduce((total, line) => {
  try { return total.plus(line.amount); } catch { return total; }
}, new Decimal(0)).toFixed();
const unique = (values: readonly string[]) => [...new Set(values.filter(Boolean))].sort();
const isIsoDateTime = (value: string) => Number.isFinite(Date.parse(value)) && /T/.test(value);

export function compileStructureAlternatives(input: {
  proposal: StructureAlternativesInput | null;
  operationTruth: OperationTruthSet;
  structureTruth: StructureTruthSet;
  instruments: readonly InstrumentVerdict[];
  verificationByAlternative?: Readonly<Record<string, StructureAlternativeVerification>>;
  pricingByAlternative?: Readonly<Record<string, AlternativePricingInput>>;
  allowedBasisIds?: readonly string[];
  sourcesAndUsesTolerance?: string;
}): StructureAlternatives {
  if (!input.proposal) {
    return emptyAlternatives("structure_alternatives_not_proposed");
  }

  const proposal = input.proposal;
  const globalBlockers: string[] = [];
  if (proposal.alternatives.length === 0) globalBlockers.push("no_structure_alternatives");
  if (proposal.alternatives.length > 3) globalBlockers.push("too_many_structure_alternatives");
  const duplicateIds = proposal.alternatives
    .map((alternative) => alternative.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicateIds.length) globalBlockers.push("duplicate_structure_alternative_id");

  const tolerance = new Decimal(input.sourcesAndUsesTolerance ?? "0").abs();
  const allowedBasisIds = input.allowedBasisIds ? new Set(input.allowedBasisIds) : null;
  const envelope = input.structureTruth.capacityEnvelope.amount;
  const alternatives = proposal.alternatives.slice(0, 3).map((draft): CompiledStructureAlternative => {
    const blockers: string[] = [];
    const missingInputs: string[] = [];
    const alternativeFingerprint = fingerprintStructureAlternative(draft);
    const contextFingerprint = fingerprintStructureVerificationContext(input.operationTruth, input.structureTruth);
    const verification = input.verificationByAlternative?.[draft.id];
    const alternativeFingerprintMatches = verification?.alternativeFingerprint === alternativeFingerprint;
    const contextFingerprintMatches = verification?.contextFingerprint === contextFingerprint;
    const verificationMetadataValid = Boolean(verification?.verifierVersion.trim() && verification && isIsoDateTime(verification.verifiedAt));
    const deterministicVerification = Boolean(verification && alternativeFingerprintMatches && contextFingerprintMatches && verificationMetadataValid);
    if (verification && !alternativeFingerprintMatches) blockers.push("alternative_verification_fingerprint_mismatch");
    if (verification && !contextFingerprintMatches) blockers.push("alternative_verification_context_stale");
    if (verification && !verificationMetadataValid) blockers.push("alternative_verification_metadata_invalid");
    if (!verification) missingInputs.push("alternative.deterministic_verification");

    const routeEligible = input.instruments.some((verdict) => verdict.instrument.id === draft.instrument && verdict.eligible);
    if (!routeEligible) blockers.push("ineligible_financing_route");

    const totalSources = sum(draft.sources);
    const totalUses = sum(draft.uses);
    const difference = new Decimal(totalSources).minus(totalUses).toFixed();
    const sourcesAndUsesClosed = new Decimal(difference).abs().lte(tolerance) && draft.sources.length > 0 && draft.uses.length > 0;
    if (!draft.sources.length || !draft.uses.length) missingInputs.push("alternative.sources_and_uses");
    if (!sourcesAndUsesClosed) blockers.push("alternative_sources_and_uses_not_closed");

    const verifiedEnvelope = deterministicVerification ? verification!.structureTruth.capacityEnvelope.amount : envelope;
    const sizingWithinEnvelope = verifiedEnvelope === null || !validAmount(draft.amount)
      ? null
      : new Decimal(draft.amount).lte(verifiedEnvelope);
    if (!validAmount(draft.amount)) blockers.push("invalid_alternative_amount");
    if (sizingWithinEnvelope === false) blockers.push("alternative_exceeds_capacity_envelope");

    const verifiedTermsMatch = deterministicVerification
      ? verification!.structureTruth.proposal.instrument === draft.instrument
        && verification!.structureTruth.proposal.amount !== null
        && new Decimal(verification!.structureTruth.proposal.amount).eq(draft.amount)
        && verification!.structureTruth.proposal.termMonths === draft.termMonths
        && verification!.structureTruth.proposal.graceMonths === draft.graceMonths
        && verification!.structureTruth.proposal.amortizationFormat === draft.amortization
      : null;
    if (verifiedTermsMatch === false) blockers.push("alternative_terms_not_verified");

    const verifiedSourcesAndUsesMatch = deterministicVerification
      ? verification!.operationTruth.sourcesAndUses.status === "pass"
        && new Decimal(verification!.operationTruth.sourcesAndUses.totalSources).eq(totalSources)
        && new Decimal(verification!.operationTruth.sourcesAndUses.totalUses).eq(totalUses)
      : null;
    if (verifiedSourcesAndUsesMatch === false) blockers.push("alternative_sources_and_uses_not_verified");

    const dayOneCompatible = deterministicVerification ? verification!.structureTruth.dayOne.passes : null;
    if (dayOneCompatible === false) blockers.push("day_one_incompatible");
    if (dayOneCompatible === null) missingInputs.push("alternative.day_one_compatibility");
    if (deterministicVerification && verification!.structureTruth.status === "blocked") blockers.push("alternative_structure_truth_blocked");
    if (deterministicVerification && verification!.operationTruth.status === "blocked") blockers.push("alternative_operation_truth_blocked");

    const termsValid = draft.termMonths > 0 && draft.graceMonths >= 0 && draft.graceMonths < draft.termMonths
      && Boolean(draft.amortization.trim()) && Boolean(draft.indexer.trim());
    if (!termsValid) blockers.push("invalid_alternative_terms");
    const allBasisIds = [
      ...draft.basisIds,
      ...draft.sources.flatMap((line) => line.basisIds),
      ...draft.uses.flatMap((line) => line.basisIds),
      ...draft.security.flatMap((line) => line.basisIds),
      ...draft.covenants.flatMap((line) => line.basisIds),
      ...draft.conditionsPrecedent.flatMap((line) => line.basisIds),
      ...(draft.implementationDays?.basisIds ?? []),
    ];
    const basisTraceable = allBasisIds.length > 0
      && draft.uses.every((line) => line.basisIds.length > 0)
      && draft.security.every((line) => line.basisIds.length > 0)
      && draft.covenants.every((line) => line.basisIds.length > 0)
      && (!allowedBasisIds || allBasisIds.every((basisId) => allowedBasisIds.has(basisId)));
    if (!basisTraceable) missingInputs.push("alternative.traceable_bases");

    const pricing = input.pricingByAlternative?.[draft.id];
    const priceAvailable = pricing?.decision === "reference_available" && pricing.totalRate !== null;
    if (!priceAvailable) missingInputs.push(...(pricing?.missingInputs.length ? pricing.missingInputs : ["alternative.market_pricing"]));
    const totalCost = {
      status: priceAvailable ? "available" as const : "pending_market_reference" as const,
      policyVersion: pricing?.policyVersion ?? null,
      spreadBps: pricing?.spreadBps ?? null,
      totalRate: pricing?.totalRate ?? null,
      annualizedCostBps: pricing?.annualizedCostBps ?? null,
      componentIds: unique(pricing?.componentIds ?? []),
    };

    const criticalBlockers = unique(blockers);
    const incomplete = unique(missingInputs);
    const confirmationEligible = criticalBlockers.length === 0
      && deterministicVerification
      && verifiedTermsMatch === true
      && verifiedSourcesAndUsesMatch === true
      && sourcesAndUsesClosed
      && sizingWithinEnvelope !== false;
    return {
      ...draft,
      alternativeFingerprint,
      sourcesAndUses: {totalSources, totalUses, difference, status: sourcesAndUsesClosed ? "pass" : "fail"},
      totalCost,
      gates: {routeEligible, deterministicVerification, verifiedTermsMatch, verifiedSourcesAndUsesMatch, sizingWithinEnvelope, sourcesAndUsesClosed, dayOneCompatible, termsValid, basisTraceable},
      status: criticalBlockers.length ? "blocked" : incomplete.length ? "incomplete" : "comparable",
      confirmationEligible,
      blockers: criticalBlockers,
      missingInputs: incomplete,
      verification: {
        verifierVersion: deterministicVerification ? verification!.verifierVersion : null,
        verifiedAt: deterministicVerification ? verification!.verifiedAt : null,
        operationTruthVersion: deterministicVerification ? verification!.operationTruth.version : null,
        structureTruthVersion: deterministicVerification ? verification!.structureTruth.version : null,
      },
    };
  });

  const recommendationAlternative = proposal.recommendation
    ? alternatives.find((alternative) => alternative.id === proposal.recommendation!.alternativeId)
    : null;
  const recommendationBlockers = proposal.recommendation
    ? [
        ...(!recommendationAlternative ? ["recommended_alternative_not_found"] : []),
        ...(recommendationAlternative && !recommendationAlternative.confirmationEligible ? ["recommended_alternative_not_confirmation_eligible"] : []),
        ...(!proposal.recommendation.rationale.trim() ? ["recommendation_rationale_missing"] : []),
        ...(!proposal.recommendation.basisIds.length ? ["recommendation_basis_missing"] : []),
        ...(allowedBasisIds && proposal.recommendation.basisIds.some((basisId) => !allowedBasisIds.has(basisId)) ? ["recommendation_basis_unknown"] : []),
        ...(!isIsoDateTime(proposal.recommendation.proposedAt) ? ["recommendation_timestamp_invalid"] : []),
      ]
    : ["structure_recommendation_missing"];
  const recommendation = proposal.recommendation ? {
    ...proposal.recommendation,
    status: recommendationBlockers.length ? "invalid" as const : "ready_for_confirmation" as const,
    blockers: unique(recommendationBlockers),
  } : null;
  globalBlockers.push(...recommendationBlockers.filter((blocker) => blocker !== "structure_recommendation_missing"));

  const proposalFingerprint = alternatives.length && recommendation
    ? sha256({version: structureAlternativesVersion, alternatives, recommendation: {...recommendation, blockers: undefined, status: undefined}})
    : null;
  const allMissing = unique(alternatives.flatMap((alternative) => alternative.missingInputs));
  const blocked = globalBlockers.length > 0 || alternatives.every((alternative) => !alternative.confirmationEligible);

  return {
    version: structureAlternativesVersion,
    status: blocked ? "blocked" : "pending_confirmation",
    alternatives,
    comparison: alternatives.map((alternative) => ({
      alternativeId: alternative.id,
      instrument: alternative.instrument,
      amount: alternative.amount,
      termMonths: alternative.termMonths,
      graceMonths: alternative.graceMonths,
      amortization: alternative.amortization,
      security: alternative.security.map((item) => item.description),
      totalRate: alternative.totalCost.totalRate,
      implementationDays: alternative.implementationDays ? {min: alternative.implementationDays.min, max: alternative.implementationDays.max} : null,
      status: alternative.status,
      blockers: alternative.blockers,
      missingInputs: alternative.missingInputs,
    })),
    recommendation,
    proposalFingerprint,
    blockers: unique(globalBlockers),
    missingInputs: allMissing,
    procedureCoverage: procedureCoverage(alternatives, recommendation, globalBlockers),
  };
}

export function buildStructureDecision(
  alternatives: StructureAlternatives,
  decision: StructureConfirmationInput | null,
): StructureDecision {
  const base = {
    version: structureAlternativesVersion,
    proposalFingerprint: alternatives.proposalFingerprint,
    externalContactAuthorized: false as const,
    qualifiedIntroductionAuthorized: false as const,
  };
  if (!alternatives.proposalFingerprint || alternatives.status !== "pending_confirmation") {
    return {...base, status: "unavailable", selectedAlternativeId: null, actorId: null, decidedAt: null, rationale: null, requestedChanges: [], materialsPreparationAllowed: false, blockers: unique(["structure_proposal_not_confirmation_ready", ...alternatives.blockers])};
  }
  if (!decision) {
    return {...base, status: "pending_confirmation", selectedAlternativeId: null, actorId: null, decidedAt: null, rationale: null, requestedChanges: [], materialsPreparationAllowed: false, blockers: ["structure_confirmation_required"]};
  }
  if (decision.proposalFingerprint !== alternatives.proposalFingerprint) {
    return {...base, status: "stale", selectedAlternativeId: decision.selectedAlternativeId, actorId: decision.actorId, decidedAt: decision.decidedAt, rationale: decision.rationale ?? null, requestedChanges: unique(decision.requestedChanges ?? []), materialsPreparationAllowed: false, blockers: ["structure_confirmation_fingerprint_mismatch"]};
  }
  const selected = alternatives.alternatives.find((alternative) => alternative.id === decision.selectedAlternativeId);
  const invalid = !selected || !selected.confirmationEligible || !decision.actorId || !isIsoDateTime(decision.decidedAt);
  if (invalid) {
    return {...base, status: "invalid", selectedAlternativeId: decision.selectedAlternativeId, actorId: decision.actorId || null, decidedAt: decision.decidedAt || null, rationale: decision.rationale ?? null, requestedChanges: unique(decision.requestedChanges ?? []), materialsPreparationAllowed: false, blockers: unique([!selected ? "selected_alternative_not_found" : "", selected && !selected.confirmationEligible ? "selected_alternative_not_confirmation_eligible" : "", !decision.actorId ? "confirmation_actor_missing" : "", !isIsoDateTime(decision.decidedAt) ? "confirmation_timestamp_invalid" : ""])};
  }
  if (decision.decision === "request_changes") {
    const changes = unique(decision.requestedChanges ?? []);
    return {...base, status: "changes_requested", selectedAlternativeId: selected.id, actorId: decision.actorId, decidedAt: decision.decidedAt, rationale: decision.rationale ?? null, requestedChanges: changes, materialsPreparationAllowed: false, blockers: changes.length ? ["structure_revision_required"] : ["requested_changes_missing"]};
  }
  if (decision.decision === "decline") {
    return {...base, status: "declined", selectedAlternativeId: selected.id, actorId: decision.actorId, decidedAt: decision.decidedAt, rationale: decision.rationale ?? null, requestedChanges: [], materialsPreparationAllowed: false, blockers: ["structure_declined"]};
  }
  return {...base, status: "confirmed", selectedAlternativeId: selected.id, actorId: decision.actorId, decidedAt: decision.decidedAt, rationale: decision.rationale ?? null, requestedChanges: [], materialsPreparationAllowed: true, blockers: []};
}

function emptyAlternatives(blocker: string): StructureAlternatives {
  return {
    version: structureAlternativesVersion,
    status: "pending_design",
    alternatives: [],
    comparison: [],
    recommendation: null,
    proposalFingerprint: null,
    blockers: [blocker],
    missingInputs: ["structure.alternatives"],
    procedureCoverage: procedureCoverage([], null, [blocker]),
  };
}

function procedureCoverage(
  alternatives: readonly CompiledStructureAlternative[],
  recommendation: StructureAlternatives["recommendation"],
  globalBlockers: readonly string[],
): StructureAlternatives["procedureCoverage"] {
  const outputs = alternatives.map((alternative) => alternative.id);
  const all = (predicate: (alternative: CompiledStructureAlternative) => boolean) => alternatives.length > 0 && alternatives.every(predicate);
  const status = (done: boolean, blocked = false) => blocked ? "blocked" as const : done ? "completed" as const : alternatives.length ? "partial" as const : "not_computable" as const;
  return [
    {taskId: "S01", procedureIds: ["OP-01", "ES-45"], status: status(Boolean(alternatives.length)), outputIds: outputs, blockers: []},
    {taskId: "S02", procedureIds: ["ES-44"], status: status(Boolean(alternatives.length)), outputIds: outputs, blockers: []},
    {taskId: "S03", procedureIds: ["ES-41", "ES-44"], status: status(all((alternative) => alternative.gates.routeEligible), all((alternative) => !alternative.gates.routeEligible)), outputIds: outputs, blockers: alternatives.flatMap((alternative) => alternative.blockers.filter((item) => item === "ineligible_financing_route"))},
    {taskId: "S04", procedureIds: ["ES-11", "ES-20"], status: status(all((alternative) => alternative.security.every((item) => item.basisIds.length > 0))), outputIds: outputs, blockers: []},
    {taskId: "S05", procedureIds: ["ES-40", "ES-41", "ES-44"], status: status(alternatives.length >= 2), outputIds: outputs, blockers: []},
    {taskId: "S06", procedureIds: ["PR-01", "PR-02", "PR-07"], status: status(all((alternative) => alternative.totalCost.status === "available")), outputIds: outputs, blockers: []},
    {taskId: "S07", procedureIds: ["PR-10", "PR-11"], status: status(all((alternative) => alternative.totalCost.totalRate !== null)), outputIds: outputs, blockers: []},
    {taskId: "S08", procedureIds: ["ES-23", "ES-24", "ES-25", "ES-30"], status: status(all((alternative) => alternative.covenants.length > 0 && alternative.covenants.every((item) => item.basisIds.length > 0))), outputIds: outputs, blockers: []},
    {taskId: "S09", procedureIds: ["OP-02", "ES-45"], status: status(all((alternative) => alternative.sourcesAndUses.status === "pass"), alternatives.some((alternative) => alternative.sourcesAndUses.status === "fail")), outputIds: outputs, blockers: alternatives.flatMap((alternative) => alternative.blockers.filter((item) => item === "alternative_sources_and_uses_not_closed"))},
    {taskId: "S10", procedureIds: ["ES-40", "ES-41", "PR-10"], status: status(alternatives.length >= 2 && all((alternative) => alternative.status !== "blocked")), outputIds: outputs, blockers: []},
    {taskId: "S11", procedureIds: ["ES-41", "ES-45"], status: recommendation?.status === "ready_for_confirmation" ? "completed" : recommendation ? "blocked" : "not_computable", outputIds: recommendation ? [recommendation.alternativeId] : [], blockers: recommendation?.blockers ?? []},
    {taskId: "S12", procedureIds: ["ES-43", "MA-17", "MA-18"], status: recommendation?.status === "ready_for_confirmation" ? "partial" : "not_computable", outputIds: recommendation ? [recommendation.alternativeId] : [], blockers: unique(globalBlockers)},
  ];
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function fingerprintStructureAlternative(alternative: StructureAlternativeDraft): string {
  return sha256({version: structureAlternativesVersion, alternative});
}

export function fingerprintStructureVerificationContext(
  operationTruth: OperationTruthSet,
  structureTruth: StructureTruthSet,
): string {
  return sha256({operationTruth, structureTruth});
}
