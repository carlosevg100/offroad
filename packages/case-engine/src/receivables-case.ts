import type {AssertionProvenance} from "@offroad/financial-core";
import {resolveReceivablesProviderMandate, type ReceivablesProviderMandate} from "@offroad/fund-mandate";
import {receivablesEvidenceCollectionDefinitions} from "@offroad/credit-playbook";
import {
  analyzeReceivablesPhaseOne,
  type ReceivablesEligibilityFact,
  type ReceivablesFactObservation,
  type ReceivablesFactResolutionReport,
  type ReceivablesPhaseOneInput,
  type ReceivablesPhaseOneReport,
  type ReceivablesPhaseTwoBReport,
  type ReceivablesPhaseTwoReport,
  type ReceivablesProviderMetricSet,
} from "@offroad/receivables-analysis";

import {
  analyzeCanonicalReceivablesPhaseTwo,
  analyzeCanonicalReceivablesProviderFit,
  canonicalReceivablesFactResolutionCatalogue,
  resolveCanonicalReceivablesContractFacts,
} from "./receivables";
import {
  buildReceivablesMandateCollectionPlan,
  buildReceivablesOperationCollectionPlan,
  type ReceivablesMandateCollectionPlan,
  type ReceivablesOperationCollectionPlan,
} from "./receivables-evidence-collection";

export const receivablesCasePipelineVersion = "2026.08.28-v2";

export type ReceivablesCaseClassification = {
  categoryIds: readonly string[];
  cellIds: readonly string[];
  evidence: readonly AssertionProvenance[];
};

export type ReceivablesDetectedDefect = {
  id: string;
  description: string;
  evidence: readonly AssertionProvenance[];
  measured?: {
    value: string;
    unit: "BRL" | "count" | "ratio" | "period";
    provenance: AssertionProvenance;
  };
};

export type ReceivablesQuestionEvidenceSearch = {
  /** Evidence available to the case before the question was drafted. */
  deliveredEvidenceIds: readonly string[];
  /** Every delivered item actually searched for the answer. */
  searchedEvidenceIds: readonly string[];
  status: "answer_found" | "exhausted_without_answer";
};

export type ReceivablesClientQuestion = {
  id: string;
  text: string;
  triggerId: string;
  trigger: AssertionProvenance;
  evidenceSearch: ReceivablesQuestionEvidenceSearch;
};

export type ReceivablesCasePipelineInput = {
  caseId: string;
  classification: ReceivablesCaseClassification;
  phaseOne: ReceivablesPhaseOneInput;
  /** Legacy/pre-resolved adapter boundary. Prefer routeFactResolution for production inputs. */
  routeFacts?: readonly ReceivablesEligibilityFact[];
  routeFactResolution?: {
    asOf: string;
    observations: readonly ReceivablesFactObservation[];
  };
  titleClassificationsByRoute?: Parameters<typeof analyzeCanonicalReceivablesPhaseTwo>[0]["titleClassificationsByRoute"];
  providerFit: {
    asOf: string;
    metrics: ReceivablesProviderMetricSet;
    mandates: readonly ReceivablesProviderMandate[];
    titleClassificationsByProgram?: Parameters<typeof analyzeCanonicalReceivablesProviderFit>[0]["titleClassificationsByProgram"];
  };
  defects: readonly ReceivablesDetectedDefect[];
  questions: readonly ReceivablesClientQuestion[];
};

export type ReceivablesCasePipelineReport = {
  version: typeof receivablesCasePipelineVersion;
  caseId: string;
  classification: ReceivablesCaseClassification;
  phaseOne: ReceivablesPhaseOneReport;
  factResolution: ReceivablesFactResolutionReport | null;
  phaseTwoA: ReceivablesPhaseTwoReport;
  phaseTwoB: ReceivablesPhaseTwoBReport;
  evidenceCollection: {
    operation: ReceivablesOperationCollectionPlan;
    mandates: ReceivablesMandateCollectionPlan;
  };
  defects: readonly ReceivablesDetectedDefect[];
  questions: readonly ReceivablesClientQuestion[];
  internalShortlistProgramIds: readonly string[];
  quality: {
    status: "complete_for_phase_three_evaluation" | "incomplete";
    blockers: readonly string[];
    warnings: readonly string[];
  };
  boundaries: {
    companyFacingRecommendationAllowed: false;
    externalDirectionAllowed: false;
    qualifiedIntroductionAllowed: false;
    creditApprovalExpressed: false;
  };
};

export type ReceivablesCaseMeasure = {
  id: string;
  value: string;
  provenance: readonly AssertionProvenance[];
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function assertUniqueIds(values: readonly {id: string}[], label: string): void {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) throw new RangeError(`duplicate ${label} id: ${value.id}`);
    ids.add(value.id);
  }
}

function evidenceSearchComplete(search: ReceivablesQuestionEvidenceSearch): boolean {
  const delivered = new Set(search.deliveredEvidenceIds);
  return search.status === "exhausted_without_answer"
    && delivered.size > 0
    && delivered.size === new Set(search.searchedEvidenceIds).size
    && search.searchedEvidenceIds.every((id) => delivered.has(id));
}

/**
 * Runs the receivables vertical in one governed sequence.
 *
 * Classification, defect detection and question drafting remain narrow model or parser outputs.
 * The runner validates their evidence contracts and executes every financial and eligibility
 * decision deterministically. It never turns the internal shortlist into company-facing direction.
 */
export function runReceivablesCasePipeline(input: ReceivablesCasePipelineInput): ReceivablesCasePipelineReport {
  if (input.caseId.trim().length === 0) throw new RangeError("receivables case id is required");
  assertUniqueIds(input.defects, "defect");
  assertUniqueIds(input.questions, "question");

  const suppliedFacts = input.routeFacts !== undefined;
  const suppliedObservations = input.routeFactResolution !== undefined;
  if (suppliedFacts === suppliedObservations) {
    throw new RangeError("provide exactly one of routeFacts or routeFactResolution");
  }

  const phaseOne = analyzeReceivablesPhaseOne(input.phaseOne);
  const factResolution = input.routeFactResolution
    ? resolveCanonicalReceivablesContractFacts(input.routeFactResolution)
    : null;
  const phaseTwoA = analyzeCanonicalReceivablesPhaseTwo({
    phaseOne,
    universe: input.phaseOne.universe,
    facts: factResolution?.facts ?? input.routeFacts ?? [],
    ...(input.titleClassificationsByRoute === undefined
      ? {}
      : {titleClassificationsByRoute: input.titleClassificationsByRoute}),
  });
  const phaseTwoB = analyzeCanonicalReceivablesProviderFit({
    phaseTwoA,
    universe: input.phaseOne.universe,
    asOf: input.providerFit.asOf,
    metrics: input.providerFit.metrics,
    mandates: input.providerFit.mandates,
    ...(input.providerFit.titleClassificationsByProgram === undefined
      ? {}
      : {titleClassificationsByProgram: input.providerFit.titleClassificationsByProgram}),
  });
  const routeFacts = factResolution?.facts ?? input.routeFacts ?? [];
  const evidenceCollection = {
    operation: buildReceivablesOperationCollectionPlan({
      asOf: input.routeFactResolution?.asOf ?? input.providerFit.asOf,
      definitions: receivablesEvidenceCollectionDefinitions,
      resolutionDefinitions: canonicalReceivablesFactResolutionCatalogue,
      facts: routeFacts,
      ...(input.routeFactResolution ? {observations: input.routeFactResolution.observations} : {}),
      factResolution,
      phaseTwoA,
    }),
    mandates: buildReceivablesMandateCollectionPlan({
      asOf: input.providerFit.asOf,
      mandates: input.providerFit.mandates.map((mandate) => resolveReceivablesProviderMandate(mandate, input.providerFit.asOf)),
    }),
  };

  const blockers: string[] = [];
  if (input.classification.categoryIds.length === 0) blockers.push("classification_category_missing");
  if (input.classification.cellIds.length === 0) blockers.push("classification_cell_missing");
  if (input.classification.evidence.length === 0) blockers.push("classification_evidence_missing");
  if (phaseOne.quality.status === "incomplete") blockers.push("phase_one_incomplete");
  if (factResolution?.quality.status === "incomplete") blockers.push("contract_fact_resolution_incomplete");
  if (phaseTwoA.quality.status === "incomplete") blockers.push("phase_two_a_incomplete");
  if (phaseTwoB.quality.status === "incomplete") blockers.push("phase_two_b_incomplete");

  for (const defect of input.defects) {
    if (defect.evidence.length === 0) blockers.push(`defect:${defect.id}:evidence_missing`);
    if (defect.measured?.provenance.kind === "estimated") {
      blockers.push(`defect:${defect.id}:measured_value_is_estimated`);
    }
  }
  for (const question of input.questions) {
    if (question.text.trim().length === 0) blockers.push(`question:${question.id}:text_missing`);
    if (question.trigger.kind === "estimated") blockers.push(`question:${question.id}:trigger_is_estimated`);
    if (!evidenceSearchComplete(question.evidenceSearch)) {
      blockers.push(`question:${question.id}:delivered_evidence_not_exhausted`);
    }
  }

  const internalShortlistProgramIds = phaseTwoB.providers
    .filter((provider) => provider.status === "live_appetite_confirmed")
    .map((provider) => provider.programId)
    .sort();

  return {
    version: receivablesCasePipelineVersion,
    caseId: input.caseId,
    classification: input.classification,
    phaseOne,
    factResolution,
    phaseTwoA,
    phaseTwoB,
    evidenceCollection,
    defects: input.defects,
    questions: input.questions,
    internalShortlistProgramIds,
    quality: {
      status: blockers.length === 0 ? "complete_for_phase_three_evaluation" : "incomplete",
      blockers: unique(blockers),
      warnings: unique([
        ...phaseOne.quality.warnings,
        ...phaseTwoA.quality.warnings,
        ...phaseTwoB.quality.warnings,
      ]),
    },
    boundaries: {
      companyFacingRecommendationAllowed: false,
      externalDirectionAllowed: false,
      qualifiedIntroductionAllowed: false,
      creditApprovalExpressed: false,
    },
  };
}

/** Collects every scalar carrying an explicit provenance contract for exact gold comparison. */
export function collectReceivablesCaseMeasures(report: ReceivablesCasePipelineReport): ReceivablesCaseMeasure[] {
  const measures = new Map<string, ReceivablesCaseMeasure>();
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const provenance = record.provenance;
    const governedInputs = Array.isArray(record.inputs)
      ? record.inputs.flatMap((input) => {
        if (!input || typeof input !== "object") return [];
        const inputProvenance = (input as Record<string, unknown>).provenance;
        return inputProvenance && typeof inputProvenance === "object"
          ? [inputProvenance as AssertionProvenance]
          : [];
      })
      : [];
    const provenanceSet = provenance && typeof provenance === "object"
      ? [provenance as AssertionProvenance]
      : governedInputs;
    if (typeof record.value === "string" && provenanceSet.length > 0) {
      // A metric identifier can legitimately repeat in distinct time buckets (roll rates,
      // vintages and scenarios). The structural path is the only case-wide unique key.
      const id = path;
      if (measures.has(id)) throw new RangeError(`duplicate receivables measure id: ${id}`);
      measures.set(id, {id, value: record.value, provenance: provenanceSet});
    }
    for (const [key, child] of Object.entries(record)) {
      if (key === "provenance" || key === "inputs") continue;
      visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(report.phaseOne, "phaseOne");
  for (const defect of report.defects) {
    if (!defect.measured) continue;
    const id = `defect.${defect.id}`;
    if (measures.has(id)) throw new RangeError(`duplicate receivables measure id: ${id}`);
    measures.set(id, {id, value: defect.measured.value, provenance: [defect.measured.provenance]});
  }
  return [...measures.values()].sort((left, right) => left.id.localeCompare(right.id));
}
