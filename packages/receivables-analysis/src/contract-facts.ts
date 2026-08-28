import type {AssertionProvenance} from "@offroad/financial-core";

import type {ReceivablesEligibilityFact} from "./phase-two";

export const receivablesContractFactResolutionVersion = "2026.08.28-v1";

export type ReceivablesFactScope = {
  kind: "portfolio" | "title" | "obligor" | "contract" | "company" | "operational_process";
  id?: string;
};

export type ReceivablesFactCoverage = {
  status: "complete" | "partial";
  coveredCount?: number;
  totalCount?: number;
};

export type ReceivablesFactObservation = {
  id: string;
  factId: string;
  state: "true" | "false";
  scope: ReceivablesFactScope;
  coverage: ReceivablesFactCoverage;
  observedAt: string;
  validUntil?: string;
  sourceId: string;
  sourceLabel: string;
  sourceOwner: string;
  explanation: string;
  provenance: AssertionProvenance;
};

export type ReceivablesFactResolutionDefinitionInput = {
  id: string;
  safeState: "true" | "false";
  safeCoverage: "complete";
  adverseHandling: "complete_only" | "any_confirmed_observation";
  unresolvedRequest: string;
};

export type ReceivablesFactObservationDisposition = {
  observationId: string;
  factId: string;
  decisionUseAllowed: boolean;
  reason: "accepted" | "estimated" | "stale" | "partial_safe_evidence" | "partial_adverse_evidence";
};

export type ReceivablesFactConflict = {
  factId: string;
  observationIds: readonly string[];
  reason: "current_material_evidence_disagrees";
};

export type ReceivablesFactResolutionReport = {
  version: typeof receivablesContractFactResolutionVersion;
  asOf: string;
  facts: readonly ReceivablesEligibilityFact[];
  dispositions: readonly ReceivablesFactObservationDisposition[];
  conflicts: readonly ReceivablesFactConflict[];
  unresolvedRequirements: readonly {factId: string; request: string}[];
  quality: {
    status: "complete_for_route_facts" | "incomplete";
    blockers: readonly string[];
  };
};

function dateTime(value: string, endOfDay = false): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError(`invalid fact observation date: ${value}`);
  const parsed = Date.parse(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new RangeError(`invalid fact observation date: ${value}`);
  }
  return parsed;
}

function assertNonEmpty(value: string, label: string, observationId: string): void {
  if (value.trim().length === 0) throw new RangeError(`${label} is required for fact observation: ${observationId}`);
}

function assertCoverage(observation: ReceivablesFactObservation): void {
  const {coveredCount, totalCount, status} = observation.coverage;
  if ((coveredCount === undefined) !== (totalCount === undefined)) {
    throw new RangeError(`fact observation coverage counts must be supplied together: ${observation.id}`);
  }
  if (coveredCount === undefined || totalCount === undefined) return;
  if (!Number.isInteger(coveredCount) || !Number.isInteger(totalCount) || coveredCount < 0 || totalCount <= 0 || coveredCount > totalCount) {
    throw new RangeError(`invalid fact observation coverage: ${observation.id}`);
  }
  if (status === "complete" && coveredCount !== totalCount) {
    throw new RangeError(`complete fact observation must cover the full universe: ${observation.id}`);
  }
  if (status === "partial" && coveredCount >= totalCount) {
    throw new RangeError(`partial fact observation cannot cover the full universe: ${observation.id}`);
  }
}

function newest(observations: readonly ReceivablesFactObservation[]): ReceivablesFactObservation | undefined {
  return [...observations].sort((left, right) =>
    dateTime(right.observedAt) - dateTime(left.observedAt) || left.id.localeCompare(right.id))[0];
}

/**
 * Resolves evidence observations into the coarse facts consumed by route eligibility.
 * No missing observation and no favourable sample can become a route-level assertion.
 */
export function resolveReceivablesContractFacts(input: {
  asOf: string;
  definitions: readonly ReceivablesFactResolutionDefinitionInput[];
  observations: readonly ReceivablesFactObservation[];
}): ReceivablesFactResolutionReport {
  const asOfTime = dateTime(input.asOf);
  const definitions = new Map<string, ReceivablesFactResolutionDefinitionInput>();
  for (const definition of input.definitions) {
    if (definitions.has(definition.id)) throw new RangeError(`duplicate receivables fact definition: ${definition.id}`);
    assertNonEmpty(definition.id, "fact definition id", definition.id);
    assertNonEmpty(definition.unresolvedRequest, "unresolved request", definition.id);
    definitions.set(definition.id, definition);
  }

  const observationIds = new Set<string>();
  for (const observation of input.observations) {
    assertNonEmpty(observation.id, "observation id", observation.id);
    if (observationIds.has(observation.id)) throw new RangeError(`duplicate receivables fact observation: ${observation.id}`);
    observationIds.add(observation.id);
    if (!definitions.has(observation.factId)) throw new RangeError(`unknown receivables fact observation: ${observation.factId}`);
    assertNonEmpty(observation.sourceId, "source id", observation.id);
    assertNonEmpty(observation.sourceLabel, "source label", observation.id);
    assertNonEmpty(observation.sourceOwner, "source owner", observation.id);
    assertNonEmpty(observation.explanation, "explanation", observation.id);
    if (observation.scope.kind !== "portfolio" && !observation.scope.id?.trim()) {
      throw new RangeError(`scoped fact observation requires a scope id: ${observation.id}`);
    }
    assertCoverage(observation);
    const observedAt = dateTime(observation.observedAt);
    if (observedAt > asOfTime) throw new RangeError(`future fact observation: ${observation.id}`);
    if (observation.validUntil && dateTime(observation.validUntil, true) < observedAt) {
      throw new RangeError(`fact observation expires before it is observed: ${observation.id}`);
    }
  }

  const dispositions: ReceivablesFactObservationDisposition[] = [];
  const conflicts: ReceivablesFactConflict[] = [];
  const facts: ReceivablesEligibilityFact[] = [];
  const unresolvedRequirements: {factId: string; request: string}[] = [];

  for (const definition of [...definitions.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    const candidates = input.observations.filter((observation) => observation.factId === definition.id);
    const decisive: ReceivablesFactObservation[] = [];
    for (const observation of candidates) {
      const stale = observation.validUntil !== undefined && dateTime(observation.validUntil, true) < asOfTime;
      const adverse = observation.state !== definition.safeState;
      let reason: ReceivablesFactObservationDisposition["reason"] = "accepted";
      if (observation.provenance.kind === "estimated") reason = "estimated";
      else if (stale) reason = "stale";
      else if (observation.coverage.status === "partial" && !adverse) reason = "partial_safe_evidence";
      else if (observation.coverage.status === "partial" && definition.adverseHandling === "complete_only") reason = "partial_adverse_evidence";
      if (reason === "accepted") decisive.push(observation);
      dispositions.push({observationId: observation.id, factId: definition.id, decisionUseAllowed: reason === "accepted", reason});
    }

    const safe = decisive.filter((observation) => observation.state === definition.safeState);
    const adverse = decisive.filter((observation) => observation.state !== definition.safeState);
    if (safe.length > 0 && adverse.length > 0) {
      const ids = [...safe, ...adverse].map((observation) => observation.id).sort();
      conflicts.push({factId: definition.id, observationIds: ids, reason: "current_material_evidence_disagrees"});
      facts.push({id: definition.id, state: "unknown", explanation: "Evidências materiais vigentes divergem e precisam ser reconciliadas."});
      unresolvedRequirements.push({factId: definition.id, request: definition.unresolvedRequest});
      continue;
    }

    const accepted = newest(safe.length > 0 ? safe : adverse);
    if (!accepted) {
      facts.push({id: definition.id, state: "unknown", explanation: "O fato ainda não foi comprovado para o universo relevante."});
      unresolvedRequirements.push({factId: definition.id, request: definition.unresolvedRequest});
      continue;
    }
    facts.push({id: definition.id, state: accepted.state, explanation: accepted.explanation, provenance: accepted.provenance});
  }

  const blockers = [
    ...conflicts.map((conflict) => `fact:${conflict.factId}:conflicting_evidence`),
    ...unresolvedRequirements.map((requirement) => `fact:${requirement.factId}:not_evaluated`),
  ].sort();
  return {
    version: receivablesContractFactResolutionVersion,
    asOf: input.asOf,
    facts,
    dispositions: dispositions.sort((left, right) => left.observationId.localeCompare(right.observationId)),
    conflicts,
    unresolvedRequirements,
    quality: {status: blockers.length === 0 ? "complete_for_route_facts" : "incomplete", blockers},
  };
}
