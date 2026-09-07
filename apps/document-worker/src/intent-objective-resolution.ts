import {createHash} from "node:crypto";

import type {IntentEnvelope, PrimaryWork} from "@offroad/agent-contracts";
import {z} from "zod";

import {
  compileObjectiveToPlan,
  workspaceObjectiveKindSchema,
  type ObjectiveToPlanInput,
  type WorkspaceObjectiveKind,
} from "@offroad/work-plan";

export const intentObjectiveResolutionSchema = z.object({
  schemaVersion: z.literal("intent-objective-resolution.v1"),
  status: z.enum(["resolved", "needs_context", "coverage_gap"]),
  objectiveKind: workspaceObjectiveKindSchema,
  confidence: z.number().min(0).max(1),
  reasonCode: z.string().min(3).max(100),
  composition: z.string().max(60).nullable(),
  supportingPrimaryWorks: z.array(z.string()).max(3),
  requiredContext: z.array(z.string()).max(8),
  resolutionFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type IntentObjectiveResolution = z.infer<typeof intentObjectiveResolutionSchema>;

export const objectiveRoutingObservationSchema = z.object({
  schemaVersion: z.literal("objective-routing-observation.v1"),
  semantic: intentObjectiveResolutionSchema,
  compatibility: z.object({
    objectiveKind: workspaceObjectiveKindSchema,
    structuralIdentity: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  objectiveKindAgreement: z.boolean().nullable(),
  governsExecution: z.literal(false),
});
export type ObjectiveRoutingObservation = z.infer<typeof objectiveRoutingObservationSchema>;

type ResolutionDraft = Omit<IntentObjectiveResolution, "schemaVersion" | "resolutionFingerprint">;

const compositionObjective: Readonly<Record<string, WorkspaceObjectiveKind>> = {
  answer_a_question: "factual_question",
  read_contract_covenant_waterfall: "risk_matrix",
  prepare_meeting: "meeting_preparation",
  prepare_material: "material_preparation",
  prepare_decision: "board_decision",
  evaluate_received_opportunity: "operation_review",
  identify_capital: "capital_matching",
  introduce: "capital_matching",
  understand_company_sector_asset: "company_analysis",
  analyze_performance_and_credit: "company_analysis",
  diagnose_capital_structure: "capital_strategy",
  develop_alternatives: "capital_strategy",
  design_indicative_structure: "capital_strategy",
  build_or_review_model: "company_analysis",
  extract_and_reconcile_data: "documents_to_case",
  review_work: "operation_review",
};

const unsupportedCompositionReason: Readonly<Record<string, string>> = {
  find_and_organize_information: "information_organization_objective_not_implemented",
  map_market_and_precedents: "market_mapping_objective_not_implemented",
  monitor: "monitoring_objective_not_implemented",
  manage_work: "workspace_management_objective_not_implemented",
};

const hasObject = (envelope: IntentEnvelope, kind: IntentEnvelope["routingCore"]["object"]["value"][number]["kind"]) =>
  envelope.routingCore.object.value.some((object) => object.kind === kind);

const audienceText = (envelope: IntentEnvelope) => envelope.routingCore.audience.value.join(" ").toLocaleLowerCase("pt-BR");

function primaryWorkFallback(envelope: IntentEnvelope): ResolutionDraft {
  const works = envelope.primaryWorks.map(({work}) => work);
  const first = works[0];
  const confidence = Math.min(...envelope.primaryWorks.map(({confidence: value}) => value));
  const documentsAvailable = envelope.executionContext.availableDocumentIds.value.length > 0;

  if (first === "capital_match") return resolved("capital_matching", confidence, "primary_work_capital_match", envelope, works);
  if (first === "read_documents") {
    return documentsAvailable
      ? resolved("operation_review", confidence, "document_review_with_evidence", envelope, works)
      : needsContext("effective_document_set", "document_review_evidence_required", envelope, works, confidence);
  }
  if (first === "extract_and_reconcile") {
    if (envelope.routingCore.depth.value === "point") return resolved("factual_question", confidence, "point_reconciliation_question", envelope, works);
    return documentsAvailable
      ? resolved("documents_to_case", confidence, "document_reconciliation_with_evidence", envelope, works)
      : needsContext("provided_documents", "document_reconciliation_evidence_required", envelope, works, confidence);
  }
  if (first === "capital_strategy") {
    const audience = audienceText(envelope);
    if (hasObject(envelope, "decision") || /conselho|board|comit[eê]|committee/.test(audience)) {
      return resolved("board_decision", confidence, "decision_audience", envelope, works);
    }
    if (/cfo|tesouraria|cliente|companhia|counterparty|management/.test(audience)) {
      return resolved("meeting_preparation", confidence, "counterparty_audience", envelope, works);
    }
    return resolved("capital_strategy", confidence, "primary_work_capital_strategy", envelope, works);
  }
  if (first === "model" || first === "analyze") {
    return resolved("company_analysis", confidence, `primary_work_${first}`, envelope, works);
  }
  if (first === "understand" && hasObject(envelope, "company")) {
    return resolved("company_analysis", confidence, "understand_company_object", envelope, works);
  }
  if (first === "market") return coverageGap("market_mapping_objective_not_implemented", envelope, works, confidence);
  if (first === "find_and_organize") return coverageGap("information_organization_objective_not_implemented", envelope, works, confidence);
  return needsContext("desired_outcome", "semantic_objective_not_materially_resolved", envelope, works, confidence);
}

function resolved(
  objectiveKind: WorkspaceObjectiveKind,
  confidence: number,
  reasonCode: string,
  envelope: IntentEnvelope,
  works: PrimaryWork[],
): ResolutionDraft {
  return {
    status: "resolved",
    objectiveKind,
    confidence,
    reasonCode,
    composition: envelope.composition,
    supportingPrimaryWorks: works,
    requiredContext: [],
  };
}

function needsContext(
  requirement: string,
  reasonCode: string,
  envelope: IntentEnvelope,
  works: PrimaryWork[],
  confidence: number,
): ResolutionDraft {
  return {
    status: "needs_context",
    objectiveKind: "ambiguous",
    confidence,
    reasonCode,
    composition: envelope.composition,
    supportingPrimaryWorks: works,
    requiredContext: [requirement],
  };
}

function coverageGap(
  reasonCode: string,
  envelope: IntentEnvelope,
  works: PrimaryWork[],
  confidence: number,
): ResolutionDraft {
  return {
    status: "coverage_gap",
    objectiveKind: "ambiguous",
    confidence,
    reasonCode,
    composition: envelope.composition,
    supportingPrimaryWorks: works,
    requiredContext: [],
  };
}

/**
 * Converts the model-classified envelope into the small objective catalogue accepted by the
 * deterministic graph compiler. This function grants no authority and executes no task. Unknown
 * compositions fail closed as named coverage gaps instead of being squeezed into a generic plan.
 */
export function resolveIntentObjective(
  envelope: IntentEnvelope,
  classifier: {abstain?: boolean; abstainReason?: string | null} = {},
): IntentObjectiveResolution {
  const works = envelope.primaryWorks.map(({work}) => work);
  const confidence = Math.min(...envelope.primaryWorks.map(({confidence: value}) => value));
  let draft: ResolutionDraft;
  if (classifier.abstain === true) {
    draft = needsContext(
      "desired_outcome",
      classifier.abstainReason ? "classifier_abstained_with_reason" : "classifier_abstained",
      envelope,
      works,
      confidence,
    );
  } else if (envelope.composition && unsupportedCompositionReason[envelope.composition]) {
    draft = coverageGap(unsupportedCompositionReason[envelope.composition]!, envelope, works, confidence);
  } else if (envelope.composition && compositionObjective[envelope.composition]) {
    draft = resolved(compositionObjective[envelope.composition]!, confidence, "named_composition", envelope, works);
  } else if (envelope.composition) {
    draft = coverageGap("unknown_named_composition", envelope, works, confidence);
  } else {
    draft = primaryWorkFallback(envelope);
  }
  const payload = {schemaVersion: "intent-objective-resolution.v1" as const, ...draft};
  return intentObjectiveResolutionSchema.parse({
    ...payload,
    resolutionFingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  });
}

/** Builds a shadow comparison only. The compatibility plan remains the executed route. */
export function observeIntentObjectiveRoute(
  envelope: IntentEnvelope,
  compatibilityInput: ObjectiveToPlanInput,
  classifier: {abstain?: boolean; abstainReason?: string | null} = {},
): ObjectiveRoutingObservation {
  const semantic = resolveIntentObjective(envelope, classifier);
  const compatibility = compileObjectiveToPlan(compatibilityInput);
  return objectiveRoutingObservationSchema.parse({
    schemaVersion: "objective-routing-observation.v1",
    semantic,
    compatibility: {
      objectiveKind: compatibility.objectiveKind,
      structuralIdentity: compatibility.structuralIdentity,
    },
    objectiveKindAgreement: semantic.status === "resolved"
      ? semantic.objectiveKind === compatibility.objectiveKind
      : null,
    governsExecution: false,
  });
}
