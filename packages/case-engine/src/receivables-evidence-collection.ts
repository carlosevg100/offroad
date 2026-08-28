import type {
  ReceivablesEvidenceCollectionDefinition,
  ReceivablesFactResolutionDefinition,
} from "@offroad/credit-playbook";
import type {
  ReceivablesProviderCriterionId,
  ResolvedReceivablesProviderMandate,
} from "@offroad/fund-mandate";
import type {
  ReceivablesEligibilityFact,
  ReceivablesFactObservation,
  ReceivablesFactResolutionReport,
  ReceivablesPhaseTwoReport,
} from "@offroad/receivables-analysis";

export const receivablesEvidenceCollectionPlanVersion = "2026.08.28-v1";

export type ReceivablesOperationCollectionAction =
  | "provide_evidence"
  | "complete_remaining_coverage"
  | "replace_non_decision_evidence"
  | "refresh_expired_evidence"
  | "reconcile_conflicting_evidence"
  | "resolve_or_segregate_adverse_finding";

export type ReceivablesOperationCollectionTask = {
  id: string;
  batchId: string;
  action: ReceivablesOperationCollectionAction;
  priority: "critical" | "high" | "normal" | "later";
  stage: ReceivablesEvidenceCollectionDefinition["stage"];
  title: string;
  factIds: readonly string[];
  clientInstructions: readonly string[];
  whyItMatters: readonly string[];
  acceptedEvidence: readonly string[];
  decisionStandards: readonly string[];
  affectedRouteIds: readonly string[];
  hardRouteIds: readonly string[];
  evidenceAlreadySeen: readonly {
    observationId: string;
    decisionUseAllowed: boolean;
    reason: ReceivablesFactResolutionReport["dispositions"][number]["reason"];
    coverage?: ReceivablesFactObservation["coverage"];
  }[];
  attestationAloneCanComplete: false;
};

export type ReceivablesOperationCollectionPlan = {
  version: typeof receivablesEvidenceCollectionPlanVersion;
  asOf: string;
  currentBatch: readonly ReceivablesOperationCollectionTask[];
  backlog: readonly ReceivablesOperationCollectionTask[];
  completedFactIds: readonly string[];
  summary: {
    openTasks: number;
    currentTasks: number;
    factsCompleted: number;
    factsOpen: number;
  };
  boundaries: {
    maximumCurrentBatchSize: 5;
    manualAttestationDecidesRouteFacts: false;
    externalVerificationExecuted: false;
    companyFacingRecommendationAllowed: false;
    externalContactAllowed: false;
  };
};

export type ReceivablesMandateCollectionAction =
  | "complete_policy_record"
  | "refresh_policy_source"
  | "reconcile_policy_sources"
  | "confirm_live_appetite_and_capacity";

export type ReceivablesMandateCollectionTask = {
  id: string;
  action: ReceivablesMandateCollectionAction;
  priority: "critical" | "high" | "normal";
  providerId: string;
  programId: string;
  programName: string;
  providerKind: ResolvedReceivablesProviderMandate["providerKind"];
  criterionIds: readonly ReceivablesProviderCriterionId[];
  instruction: string;
  decisionStandard: string;
};

export type ReceivablesMandateCollectionPlan = {
  version: typeof receivablesEvidenceCollectionPlanVersion;
  asOf: string;
  currentBatch: readonly ReceivablesMandateCollectionTask[];
  backlog: readonly ReceivablesMandateCollectionTask[];
  summary: {programsReviewed: number; openTasks: number; currentTasks: number};
  boundaries: {
    researchObservationConfirmsLiveState: false;
    automatedProviderContactAllowed: false;
    externalContactExecuted: false;
    identityDisclosureAllowed: false;
    companyFacingRecommendationAllowed: false;
  };
};

const actionRank: Readonly<Record<ReceivablesOperationCollectionAction, number>> = {
  resolve_or_segregate_adverse_finding: 1,
  reconcile_conflicting_evidence: 2,
  replace_non_decision_evidence: 3,
  refresh_expired_evidence: 4,
  complete_remaining_coverage: 5,
  provide_evidence: 6,
};

const priorityLabel = (priority: number, action: ReceivablesOperationCollectionAction): ReceivablesOperationCollectionTask["priority"] => {
  if (action === "resolve_or_segregate_adverse_finding" || action === "reconcile_conflicting_evidence") return "critical";
  if (priority === 1) return "high";
  if (priority === 2) return "normal";
  return "later";
};

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

function operationAction(input: {
  factId: string;
  fact: ReceivablesEligibilityFact | undefined;
  safeState: "true" | "false";
  report: ReceivablesFactResolutionReport | null;
}): ReceivablesOperationCollectionAction | null {
  const {factId, fact, safeState, report} = input;
  if (fact?.state === safeState && fact.provenance && fact.provenance.kind !== "estimated") return null;
  if (report?.conflicts.some((conflict) => conflict.factId === factId)) return "reconcile_conflicting_evidence";
  if (fact && fact.state !== "unknown" && fact.state !== safeState) return "resolve_or_segregate_adverse_finding";
  const reasons = report?.dispositions.filter((item) => item.factId === factId).map((item) => item.reason) ?? [];
  if (reasons.includes("estimated")) return "replace_non_decision_evidence";
  if (reasons.includes("stale")) return "refresh_expired_evidence";
  if (reasons.includes("partial_safe_evidence") || reasons.includes("partial_adverse_evidence")) {
    return "complete_remaining_coverage";
  }
  return "provide_evidence";
}

/**
 * Converts route-fact gaps into a short, ordered evidence plan. It does not fetch a registry,
 * contact a provider or turn a declaration into proof. Those remain explicit execution steps.
 */
export function buildReceivablesOperationCollectionPlan(input: {
  asOf: string;
  definitions: readonly ReceivablesEvidenceCollectionDefinition[];
  resolutionDefinitions: readonly ReceivablesFactResolutionDefinition[];
  facts: readonly ReceivablesEligibilityFact[];
  observations?: readonly ReceivablesFactObservation[];
  factResolution: ReceivablesFactResolutionReport | null;
  phaseTwoA: ReceivablesPhaseTwoReport;
}): ReceivablesOperationCollectionPlan {
  const resolutionById = new Map(input.resolutionDefinitions.map((definition) => [definition.id, definition]));
  const factById = new Map(input.facts.map((fact) => [fact.id, fact]));
  const observationById = new Map((input.observations ?? []).map((observation) => [observation.id, observation]));
  const definitionIds = new Set<string>();
  for (const definition of input.definitions) {
    if (definitionIds.has(definition.factId)) throw new RangeError(`duplicate receivables evidence definition: ${definition.factId}`);
    definitionIds.add(definition.factId);
    if (!resolutionById.has(definition.factId)) throw new RangeError(`evidence definition has no fact resolution contract: ${definition.factId}`);
    if (definition.attestationAloneCanDecide !== false) throw new RangeError(`manual attestation cannot decide receivables fact: ${definition.factId}`);
  }

  const completedFactIds: string[] = [];
  const parts: {
    definition: ReceivablesEvidenceCollectionDefinition;
    action: ReceivablesOperationCollectionAction;
    affectedRouteIds: string[];
    hardRouteIds: string[];
  }[] = [];
  for (const definition of input.definitions) {
    const resolution = resolutionById.get(definition.factId)!;
    const action = operationAction({
      factId: definition.factId,
      fact: factById.get(definition.factId),
      safeState: resolution.safeState,
      report: input.factResolution,
    });
    if (!action) {
      completedFactIds.push(definition.factId);
      continue;
    }
    const affected = input.phaseTwoA.routes.filter((route) => route.criterionResults.some((criterion) => criterion.factId === definition.factId));
    parts.push({
      definition,
      action,
      affectedRouteIds: affected.map((route) => route.routeId),
      hardRouteIds: affected.filter((route) => route.criterionResults.some((criterion) => criterion.factId === definition.factId && criterion.severity === "hard")).map((route) => route.routeId),
    });
  }

  const groups = new Map<string, typeof parts>();
  for (const part of parts) {
    const isolated = part.action === "resolve_or_segregate_adverse_finding" || part.action === "reconcile_conflicting_evidence";
    const key = isolated ? `${part.definition.factId}:${part.action}` : `${part.definition.batchId}:${part.action}`;
    const group = groups.get(key) ?? [];
    group.push(part);
    groups.set(key, group);
  }

  const tasks = [...groups.entries()].map(([key, group]): ReceivablesOperationCollectionTask => {
    const ordered = [...group].sort((left, right) => left.definition.priority - right.definition.priority || left.definition.factId.localeCompare(right.definition.factId));
    const lead = ordered[0]!;
    const action = ordered.map((item) => item.action).sort((left, right) => actionRank[left] - actionRank[right])[0]!;
    const factIds = ordered.map((item) => item.definition.factId);
    const factIdSet = new Set<string>(factIds);
    const dispositions = input.factResolution?.dispositions.filter((item) => factIdSet.has(item.factId)) ?? [];
    return {
      id: `operation:${key}`,
      batchId: lead.definition.batchId,
      action,
      priority: priorityLabel(lead.definition.priority, action),
      stage: lead.definition.stage,
      title: lead.definition.title,
      factIds,
      clientInstructions: unique(ordered.map((item) => item.definition.clientInstruction)),
      whyItMatters: unique(ordered.map((item) => item.definition.whyItMatters)),
      acceptedEvidence: unique(ordered.flatMap((item) => item.definition.acceptedEvidence)),
      decisionStandards: unique(ordered.map((item) => item.definition.decisionStandard)),
      affectedRouteIds: unique(ordered.flatMap((item) => item.affectedRouteIds)).sort(),
      hardRouteIds: unique(ordered.flatMap((item) => item.hardRouteIds)).sort(),
      evidenceAlreadySeen: dispositions.map((disposition) => ({
        observationId: disposition.observationId,
        decisionUseAllowed: disposition.decisionUseAllowed,
        reason: disposition.reason,
        ...(observationById.get(disposition.observationId)?.coverage
          ? {coverage: observationById.get(disposition.observationId)!.coverage}
          : {}),
      })),
      attestationAloneCanComplete: false,
    };
  }).sort((left, right) => {
    const priorities = {critical: 1, high: 2, normal: 3, later: 4} as const;
    return priorities[left.priority] - priorities[right.priority]
      || right.hardRouteIds.length - left.hardRouteIds.length
      || right.affectedRouteIds.length - left.affectedRouteIds.length
      || left.id.localeCompare(right.id);
  });

  const currentBatch = tasks.slice(0, 5);
  const backlog = tasks.slice(5);
  return {
    version: receivablesEvidenceCollectionPlanVersion,
    asOf: input.asOf,
    currentBatch,
    backlog,
    completedFactIds: completedFactIds.sort(),
    summary: {
      openTasks: tasks.length,
      currentTasks: currentBatch.length,
      factsCompleted: completedFactIds.length,
      factsOpen: input.definitions.length - completedFactIds.length,
    },
    boundaries: {
      maximumCurrentBatchSize: 5,
      manualAttestationDecidesRouteFacts: false,
      externalVerificationExecuted: false,
      companyFacingRecommendationAllowed: false,
      externalContactAllowed: false,
    },
  };
}

const liveCriteria = new Set<ReceivablesProviderCriterionId>(["live_appetite", "available_capacity"]);

function marketTask(input: {
  mandate: ResolvedReceivablesProviderMandate;
  action: ReceivablesMandateCollectionAction;
  criterionIds: readonly ReceivablesProviderCriterionId[];
}): ReceivablesMandateCollectionTask {
  const {mandate, action, criterionIds} = input;
  const text: Record<ReceivablesMandateCollectionAction, {instruction: string; standard: string}> = {
    complete_policy_record: {
      instruction: "Completar os critérios faltantes com declaração direta, confirmação do relacionamento ou regra publicada vigente.",
      standard: "Cada critério possui fonte identificada, responsável, data de observação e validade.",
    },
    refresh_policy_source: {
      instruction: "Atualizar os critérios vencidos antes de usar o programa no direcionamento interno.",
      standard: "A fonte aceita permanece vigente na data da análise.",
    },
    reconcile_policy_sources: {
      instruction: "Reconciliar as fontes divergentes e registrar qual regra vigente deve prevalecer e por quê.",
      standard: "Não há divergência material entre fontes atuais com uso decisório.",
    },
    confirm_live_appetite_and_capacity: {
      instruction: "Confirmar diretamente com o programa, ou pelo relacionamento responsável, o apetite e a capacidade disponíveis agora.",
      standard: "Apetite e capacidade têm confirmação direta ou de relacionamento, fonte identificada e validade atual.",
    },
  };
  const copy = text[action];
  return {
    id: `mandate:${mandate.programId}:${action}`,
    action,
    priority: action === "reconcile_policy_sources" ? "critical" : action === "confirm_live_appetite_and_capacity" ? "high" : "normal",
    providerId: mandate.providerId,
    programId: mandate.programId,
    programName: mandate.programName,
    providerKind: mandate.providerKind,
    criterionIds: [...criterionIds].sort(),
    instruction: copy.instruction,
    decisionStandard: copy.standard,
  };
}

/** Produces internal data-stewardship work. It never contacts a provider or exposes its name. */
export function buildReceivablesMandateCollectionPlan(input: {
  asOf: string;
  mandates: readonly ResolvedReceivablesProviderMandate[];
}): ReceivablesMandateCollectionPlan {
  const tasks: ReceivablesMandateCollectionTask[] = [];
  for (const mandate of input.mandates) {
    const divergent = mandate.divergentCriteria;
    const live = unique([
      ...mandate.missingCriteria.filter((id) => liveCriteria.has(id)),
      ...mandate.staleCriteria.filter((id) => liveCriteria.has(id)),
      ...mandate.unconfirmedCriteria,
    ]);
    const stalePolicy = mandate.staleCriteria.filter((id) => !liveCriteria.has(id) && !divergent.includes(id));
    const missingPolicy = mandate.missingCriteria.filter((id) => !liveCriteria.has(id) && !divergent.includes(id));
    if (divergent.length > 0) tasks.push(marketTask({mandate, action: "reconcile_policy_sources", criterionIds: divergent}));
    if (live.length > 0) tasks.push(marketTask({mandate, action: "confirm_live_appetite_and_capacity", criterionIds: live}));
    if (stalePolicy.length > 0) tasks.push(marketTask({mandate, action: "refresh_policy_source", criterionIds: stalePolicy}));
    if (missingPolicy.length > 0) tasks.push(marketTask({mandate, action: "complete_policy_record", criterionIds: missingPolicy}));
  }
  const priorities = {critical: 1, high: 2, normal: 3} as const;
  tasks.sort((left, right) => priorities[left.priority] - priorities[right.priority] || left.id.localeCompare(right.id));
  const currentBatch = tasks.slice(0, 5);
  return {
    version: receivablesEvidenceCollectionPlanVersion,
    asOf: input.asOf,
    currentBatch,
    backlog: tasks.slice(5),
    summary: {programsReviewed: input.mandates.length, openTasks: tasks.length, currentTasks: currentBatch.length},
    boundaries: {
      researchObservationConfirmsLiveState: false,
      automatedProviderContactAllowed: false,
      externalContactExecuted: false,
      identityDisclosureAllowed: false,
      companyFacingRecommendationAllowed: false,
    },
  };
}
