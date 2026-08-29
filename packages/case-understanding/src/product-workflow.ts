import {z} from "zod";

import {fingerprintJson} from "./manifest";

export const productWorkflowStateSchema = z.enum([
  "private_workspace_ready",
  "guided_intake_in_progress",
  "initial_information_received",
  "understanding_in_progress",
  "clarification_required",
  "structuring_ready",
  "structuring_in_progress",
  "structure_confirmation_required",
  "material_inputs_required",
  "production_plan_ready",
  "materials_in_progress",
  "company_review_required",
  "package_approved",
  "matching_in_progress",
  "recipient_authorization_required",
  "ready_for_qualified_introduction",
  "introduced",
  "feedback_capture_in_progress",
]);
export type ProductWorkflowState = z.infer<typeof productWorkflowStateSchema>;

/**
 * The seven product phases are the stable, executive topology of Offroad. Detailed workflow
 * states may evolve inside a phase, but no interface or runtime may silently add underwriting,
 * lender diligence, negotiation, documentation, funding or closing as an Offroad phase.
 */
export const productPhaseSchema = z.enum([
  "understand",
  "diagnose",
  "structure",
  "prepare",
  "match",
  "introduce",
  "capture_feedback",
]);
export type ProductPhase = z.infer<typeof productPhaseSchema>;

export const productPhaseOrder = productPhaseSchema.options;

const phaseByState: Readonly<Record<ProductWorkflowState, ProductPhase>> = {
  private_workspace_ready: "understand",
  guided_intake_in_progress: "understand",
  initial_information_received: "understand",
  understanding_in_progress: "understand",
  clarification_required: "diagnose",
  structuring_ready: "diagnose",
  structuring_in_progress: "structure",
  structure_confirmation_required: "structure",
  material_inputs_required: "prepare",
  production_plan_ready: "prepare",
  materials_in_progress: "prepare",
  company_review_required: "prepare",
  package_approved: "prepare",
  matching_in_progress: "match",
  recipient_authorization_required: "match",
  ready_for_qualified_introduction: "introduce",
  introduced: "introduce",
  feedback_capture_in_progress: "capture_feedback",
};

export function productPhaseForState(state: ProductWorkflowState): ProductPhase {
  return phaseByState[state];
}

export const offroadProductBoundary = {
  version: "2026.08.29-v1",
  valueProposition: {
    pt: "Estruturação financeira e acesso qualificado ao mercado de crédito privado.",
    en: "Financial structuring and qualified access to the private credit market.",
  },
  deliverable: {
    pt: "Caso compreendido, estrutura recomendada, materiais preparados, mercado selecionado e introdução qualificada realizada.",
    en: "Case understood, recommended structure, materials prepared, market selected and qualified introduction completed.",
  },
  offroadPerforms: [
    "case_understanding",
    "diagnostic_credit_analysis",
    "indicative_structure_recommendation",
    "institutional_material_preparation",
    "explainable_lender_matching",
    "authorized_qualified_introduction",
    "market_feedback_capture",
  ],
  lenderPerforms: [
    "underwriting",
    "lender_diligence",
    "credit_approval",
    "final_proposal",
    "final_negotiation",
    "definitive_documentation",
    "funding",
    "monitoring",
  ],
} as const;

export const productGateSchema = z.enum([
  "enough_to_understand",
  "enough_to_structure",
  "enough_to_produce",
  "enough_to_access_market",
]);
export type ProductGate = z.infer<typeof productGateSchema>;

const transitions: Readonly<Record<ProductWorkflowState, readonly ProductWorkflowState[]>> = {
  private_workspace_ready: ["guided_intake_in_progress"],
  guided_intake_in_progress: ["initial_information_received"],
  initial_information_received: ["guided_intake_in_progress", "understanding_in_progress"],
  understanding_in_progress: ["initial_information_received", "clarification_required", "structuring_ready"],
  clarification_required: ["initial_information_received", "understanding_in_progress", "structuring_ready"],
  structuring_ready: ["clarification_required", "structuring_in_progress"],
  structuring_in_progress: ["clarification_required", "structure_confirmation_required"],
  structure_confirmation_required: ["clarification_required", "structuring_in_progress", "material_inputs_required", "production_plan_ready"],
  material_inputs_required: ["initial_information_received", "understanding_in_progress", "production_plan_ready"],
  production_plan_ready: ["material_inputs_required", "materials_in_progress"],
  materials_in_progress: ["material_inputs_required", "company_review_required"],
  company_review_required: ["materials_in_progress", "package_approved"],
  package_approved: ["company_review_required", "matching_in_progress"],
  matching_in_progress: ["structuring_ready", "recipient_authorization_required"],
  recipient_authorization_required: ["matching_in_progress", "ready_for_qualified_introduction"],
  ready_for_qualified_introduction: ["matching_in_progress", "introduced"],
  introduced: ["matching_in_progress", "feedback_capture_in_progress"],
  feedback_capture_in_progress: ["matching_in_progress"],
};

export function allowedProductTransitions(state: ProductWorkflowState): readonly ProductWorkflowState[] {
  return transitions[state];
}

export function canTransitionProductState(from: ProductWorkflowState, to: ProductWorkflowState): boolean {
  return transitions[from].includes(to);
}

export function assertProductStateTransition(from: ProductWorkflowState, to: ProductWorkflowState): void {
  if (!canTransitionProductState(from, to)) {
    throw new Error(`invalid product workflow transition: ${from} -> ${to}`);
  }
}

export const understandingDomainSchema = z.enum([
  "company",
  "sector",
  "operation",
  "financials",
  "debt",
  "project",
  "market_context",
]);
export type UnderstandingDomain = z.infer<typeof understandingDomainSchema>;

export const assertionClassificationSchema = z.enum([
  "confirmed",
  "declared",
  "calculated",
  "assumption",
  "divergent",
  "absent",
  "not_applicable",
]);
export type AssertionClassification = z.infer<typeof assertionClassificationSchema>;

export const decisionImpactSchema = z.enum([
  "none",
  "understanding",
  "transaction_blocker",
  "structure_or_sizing",
  "material_production",
  "market_access",
]);
export type DecisionImpact = z.infer<typeof decisionImpactSchema>;

const bilingualSchema = z.object({
  pt: z.string().trim().min(1),
  en: z.string().trim().min(1),
}).strict();

const claimSupportSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(["evidence", "calculation", "public_source", "user_declaration"]),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/).optional(),
}).strict();

export const understandingClaimSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  domain: understandingDomainSchema,
  label: bilingualSchema,
  statement: bilingualSchema,
  classification: assertionClassificationSchema,
  materiality: z.enum(["low", "medium", "high", "critical"]),
  decisionImpact: decisionImpactSchema,
  supports: z.array(claimSupportSchema).default([]),
  declaredBy: z.string().trim().min(1).optional(),
  calculationId: z.string().trim().min(1).optional(),
  rationale: bilingualSchema.optional(),
  discrepancyGroupId: z.string().trim().min(1).optional(),
  impact: bilingualSchema.optional(),
  nextAction: bilingualSchema.optional(),
  dependsOnClaimIds: z.array(z.string().regex(/^[a-z][a-z0-9_.-]*$/)).default([]),
}).strict().superRefine((claim, context) => {
  if (claim.classification === "confirmed" && claim.supports.length === 0) {
    context.addIssue({code: "custom", path: ["supports"], message: "confirmed assertions require support"});
  }
  if (claim.classification === "calculated") {
    if (!claim.calculationId) context.addIssue({code: "custom", path: ["calculationId"], message: "calculated assertions require a calculation id"});
    if (!claim.supports.some((support) => support.kind === "calculation")) {
      context.addIssue({code: "custom", path: ["supports"], message: "calculated assertions require calculation support"});
    }
  }
  if (claim.classification === "declared" && !claim.declaredBy) {
    context.addIssue({code: "custom", path: ["declaredBy"], message: "declared assertions require an identified declarant"});
  }
  if ((claim.classification === "assumption" || claim.classification === "not_applicable") && !claim.rationale) {
    context.addIssue({code: "custom", path: ["rationale"], message: `${claim.classification} assertions require a rationale`});
  }
  if (claim.classification === "divergent") {
    if (claim.supports.length < 2) context.addIssue({code: "custom", path: ["supports"], message: "divergent assertions require at least two sources"});
    if (!claim.discrepancyGroupId) context.addIssue({code: "custom", path: ["discrepancyGroupId"], message: "divergent assertions require a discrepancy group"});
  }
  if (["divergent", "absent"].includes(claim.classification)) {
    if (claim.decisionImpact === "none") context.addIssue({code: "custom", path: ["decisionImpact"], message: `${claim.classification} assertions require a decision impact`});
    if (!claim.impact) context.addIssue({code: "custom", path: ["impact"], message: `${claim.classification} assertions require an impact explanation`});
    if (!claim.nextAction) context.addIssue({code: "custom", path: ["nextAction"], message: `${claim.classification} assertions require a next action`});
  }
});
export type UnderstandingClaim = z.infer<typeof understandingClaimSchema>;

const snapshotPayloadSchema = z.object({
  version: z.literal("2026.08.29-v1"),
  caseFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  sequence: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  sourceFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  supersedesFingerprint: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  summary: bilingualSchema,
  claims: z.array(understandingClaimSchema).min(1),
}).strict().superRefine((snapshot, context) => {
  uniqueIssues(snapshot.claims.map((claim) => claim.id), ["claims"], context);
  const ids = new Set(snapshot.claims.map((claim) => claim.id));
  for (const [index, claim] of snapshot.claims.entries()) {
    for (const dependency of claim.dependsOnClaimIds) {
      if (!ids.has(dependency)) context.addIssue({code: "custom", path: ["claims", index, "dependsOnClaimIds"], message: `unknown claim dependency: ${dependency}`});
      if (dependency === claim.id) context.addIssue({code: "custom", path: ["claims", index, "dependsOnClaimIds"], message: "a claim cannot depend on itself"});
    }
  }
});

export const understandingSnapshotSchema = snapshotPayloadSchema.extend({
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type UnderstandingSnapshot = z.infer<typeof understandingSnapshotSchema>;
export type UnderstandingSnapshotInput = z.input<typeof snapshotPayloadSchema>;

export function buildUnderstandingSnapshot(raw: UnderstandingSnapshotInput): UnderstandingSnapshot {
  const parsed = snapshotPayloadSchema.parse(raw);
  const payload = {...parsed, claims: [...parsed.claims].sort((a, b) => a.id.localeCompare(b.id))};
  return understandingSnapshotSchema.parse({...payload, fingerprint: fingerprintJson(payload)});
}

export const understandingRequirementSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  claimId: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  description: bilingualSchema,
  acceptedClassifications: z.array(assertionClassificationSchema).min(1),
}).strict();
export type UnderstandingRequirement = z.infer<typeof understandingRequirementSchema>;

export type UnderstandingGateAssessment = {
  gate: "enough_to_understand";
  status: "passed" | "blocked";
  satisfiedRequirementIds: string[];
  blockerRequirementIds: string[];
  blockerClaimIds: string[];
  fingerprint: string;
};

export function assessUnderstandingGate(
  snapshot: UnderstandingSnapshot,
  requirements: readonly UnderstandingRequirement[],
): UnderstandingGateAssessment {
  const claims = new Map(snapshot.claims.map((claim) => [claim.id, claim]));
  const satisfiedRequirementIds: string[] = [];
  const blockerRequirementIds: string[] = [];
  const blockerClaimIds = new Set<string>();
  for (const requirement of requirements) {
    const claim = claims.get(requirement.claimId);
    if (claim && requirement.acceptedClassifications.includes(claim.classification)) {
      satisfiedRequirementIds.push(requirement.id);
    } else {
      blockerRequirementIds.push(requirement.id);
      blockerClaimIds.add(requirement.claimId);
    }
  }
  const payload = {
    gate: "enough_to_understand" as const,
    status: blockerRequirementIds.length === 0 ? "passed" as const : "blocked" as const,
    satisfiedRequirementIds: satisfiedRequirementIds.sort(),
    blockerRequirementIds: blockerRequirementIds.sort(),
    blockerClaimIds: [...blockerClaimIds].sort(),
  };
  return {...payload, fingerprint: fingerprintJson({snapshot: snapshot.fingerprint, requirements, result: payload})};
}

export const clarificationPrioritySchema = z.enum([
  "transaction_blocker",
  "structure_or_sizing",
  "material_production",
  "market_access",
  "understanding",
]);
export type ClarificationPriority = z.infer<typeof clarificationPrioritySchema>;

export type UnderstandingFinding = {
  id: string;
  claimId: string;
  domain: UnderstandingDomain;
  classification: Exclude<AssertionClassification, "not_applicable">;
  priority: ClarificationPriority;
  materiality: UnderstandingClaim["materiality"];
  statement: UnderstandingClaim["statement"];
  whyItMatters: UnderstandingClaim["impact"];
  requestedAction: UnderstandingClaim["nextAction"];
  supportIds: string[];
  fingerprint: string;
};

const unresolvedFindingClasses = new Set<AssertionClassification>(["declared", "assumption", "divergent", "absent"]);

export function findingsFromUnderstanding(snapshot: UnderstandingSnapshot): UnderstandingFinding[] {
  return snapshot.claims.flatMap((claim) => {
    const resolvedButMaterial = ["confirmed", "calculated"].includes(claim.classification)
      && claim.decisionImpact !== "none";
    if (!unresolvedFindingClasses.has(claim.classification) && !resolvedButMaterial) return [];
    const classification = claim.classification as UnderstandingFinding["classification"];
    const priority = priorityFor(claim.decisionImpact);
    const payload = {
      id: `finding.${claim.id}`,
      claimId: claim.id,
      domain: claim.domain,
      classification,
      priority,
      materiality: claim.materiality,
      statement: claim.statement,
      whyItMatters: claim.impact,
      requestedAction: claim.nextAction,
      supportIds: claim.supports.map((support) => support.id).sort(),
    };
    return [{...payload, fingerprint: fingerprintJson(payload)}];
  }).sort(compareFindings);
}

export type ClarificationBatch = {
  version: "2026.08.29-v1";
  snapshotFingerprint: string;
  items: UnderstandingFinding[];
  backlogFindingIds: string[];
  fingerprint: string;
};

export function buildClarificationBatch(snapshot: UnderstandingSnapshot, limit = 5): ClarificationBatch {
  if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw new Error("clarification batch limit must be between 1 and 5");
  const findings = findingsFromUnderstanding(snapshot);
  const payload = {
    version: "2026.08.29-v1" as const,
    snapshotFingerprint: snapshot.fingerprint,
    items: findings.slice(0, limit),
    backlogFindingIds: findings.slice(limit).map((finding) => finding.id),
  };
  return {...payload, fingerprint: fingerprintJson(payload)};
}

export type UnderstandingDelta = {
  changedClaimIds: string[];
  impactedClaimIds: string[];
  impactedDomains: UnderstandingDomain[];
};

export function diffUnderstandingSnapshots(previous: UnderstandingSnapshot, current: UnderstandingSnapshot): UnderstandingDelta {
  if (previous.caseFingerprint !== current.caseFingerprint) throw new Error("cannot diff snapshots from different cases");
  const prior = new Map(previous.claims.map((claim) => [claim.id, fingerprintJson(claim)]));
  const next = new Map(current.claims.map((claim) => [claim.id, fingerprintJson(claim)]));
  const changed = new Set([...new Set([...prior.keys(), ...next.keys()])].filter((id) => prior.get(id) !== next.get(id)));
  const impacted = new Set(changed);
  let found = true;
  while (found) {
    found = false;
    for (const claim of current.claims) {
      if (!impacted.has(claim.id) && claim.dependsOnClaimIds.some((dependency) => impacted.has(dependency))) {
        impacted.add(claim.id);
        found = true;
      }
    }
  }
  const domains = new Set(current.claims.filter((claim) => impacted.has(claim.id)).map((claim) => claim.domain));
  return {
    changedClaimIds: [...changed].sort(),
    impactedClaimIds: [...impacted].sort(),
    impactedDomains: [...domains].sort(),
  };
}

function priorityFor(impact: DecisionImpact): ClarificationPriority {
  if (impact === "transaction_blocker") return "transaction_blocker";
  if (impact === "structure_or_sizing") return "structure_or_sizing";
  if (impact === "material_production") return "material_production";
  if (impact === "market_access") return "market_access";
  return "understanding";
}

const priorityRank: Record<ClarificationPriority, number> = {
  transaction_blocker: 0,
  structure_or_sizing: 1,
  material_production: 2,
  market_access: 3,
  understanding: 4,
};

const materialityRank: Record<UnderstandingClaim["materiality"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function compareFindings(a: UnderstandingFinding, b: UnderstandingFinding): number {
  return priorityRank[a.priority] - priorityRank[b.priority]
    || materialityRank[a.materiality] - materialityRank[b.materiality]
    || a.id.localeCompare(b.id);
}

function uniqueIssues(values: readonly string[], path: PropertyKey[], context: z.core.$RefinementCtx): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) context.addIssue({code: "custom", path, message: `duplicate id: ${duplicate}`});
}
