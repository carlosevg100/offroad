import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

import {compiledSpecializationProfileSchema, type CompiledSpecializationProfile} from "./specializations";

export const dcmSpecialistSchema = z.enum([
  "deal_captain",
  "context_intelligence",
  "document_intelligence",
  "company_and_sector",
  "financial_analysis",
  "debt_and_capital_structure",
  "transaction_structuring",
  "market_intelligence",
  "materials",
  "independent_verifier",
]);
export type DcmSpecialist = z.infer<typeof dcmSpecialistSchema>;

export const dcmWorkStatusSchema = z.enum([
  "pending",
  "ready",
  "running",
  "waiting_user",
  "blocked",
  "review",
  "succeeded",
  "failed",
  "superseded",
]);
export type DcmWorkStatus = z.infer<typeof dcmWorkStatusSchema>;

export const dcmWorkEffectSchema = z.enum(["none", "propose_state", "commit", "external"]);
export type DcmWorkEffect = z.infer<typeof dcmWorkEffectSchema>;

export const dcmEvidenceRefSchema = z.object({
  type: z.enum([
    "user_message",
    "private_document_anchor",
    "public_source",
    "canonical_fact",
    "deterministic_calculation",
    "market_observation",
    "prior_project_memory",
    "procedure",
  ]),
  id: z.string().trim().min(1).max(300),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  asOf: z.iso.datetime().optional(),
  accessBasis: z.enum(["public", "authorized_private", "derived"]).optional(),
});
export type DcmEvidenceRef = z.infer<typeof dcmEvidenceRefSchema>;

export const dcmRequirementStatusSchema = z.enum([
  "missing",
  "candidate",
  "partial",
  "verified",
  "conflicting",
  "unavailable",
  "not_applicable",
]);
export type DcmRequirementStatus = z.infer<typeof dcmRequirementStatusSchema>;

export const dcmRequirementCoverageSchema = z.object({
  schemaVersion: z.literal("dcm-requirement-coverage.v1"),
  id: z.uuid(),
  projectId: z.uuid(),
  requirementKey: z.string().regex(/^[a-z0-9_.-]{3,120}$/),
  label: z.string().trim().min(3).max(240),
  status: dcmRequirementStatusSchema,
  materiality: z.enum(["blocking", "high", "medium", "low"]),
  decisionIds: z.array(z.uuid()).max(30).default([]),
  evidence: z.array(dcmEvidenceRefSchema).max(100).default([]),
  missingReason: z.string().trim().min(3).max(1_000).nullable().default(null),
  assessedAt: z.iso.datetime(),
  assessedBy: dcmSpecialistSchema,
}).superRefine((coverage, context) => {
  if (coverage.status === "verified" && coverage.evidence.length === 0) {
    context.addIssue({code: "custom", path: ["evidence"], message: "verified coverage requires evidence"});
  }
  if (coverage.status === "missing" && !coverage.missingReason) {
    context.addIssue({code: "custom", path: ["missingReason"], message: "missing coverage requires a reason"});
  }
});
export type DcmRequirementCoverage = z.infer<typeof dcmRequirementCoverageSchema>;

export const dcmInformationRequestSchema = z.object({
  schemaVersion: z.literal("dcm-information-request.v1"),
  id: z.uuid(),
  projectId: z.uuid(),
  requirementKey: z.string().regex(/^[a-z0-9_.-]{3,120}$/),
  question: z.string().trim().min(5).max(1_000),
  whyItMatters: z.string().trim().min(5).max(1_000),
  decisionImpact: z.string().trim().min(5).max(1_000),
  acceptableEvidence: z.array(z.string().trim().min(1).max(200)).min(1).max(12),
  answerKind: z.enum(["text", "number", "date", "choice", "document", "confirmation"]),
  choices: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
  priority: z.enum(["blocking", "high_value", "later"]),
  informationGain: z.number().min(0).max(1),
  materiality: z.number().min(0).max(1),
  answerability: z.number().min(0).max(1),
  redundancyPenalty: z.number().min(0).max(1).default(0),
  status: z.enum(["open", "answered", "waived", "superseded"]),
  createdAt: z.iso.datetime(),
});
export type DcmInformationRequest = z.infer<typeof dcmInformationRequestSchema>;

export const dcmDecisionStatusSchema = z.enum([
  "open",
  "directional",
  "confirmed",
  "rejected",
  "superseded",
]);

export const dcmDecisionRecordSchema = z.object({
  schemaVersion: z.literal("dcm-decision.v1"),
  id: z.uuid(),
  projectId: z.uuid(),
  decisionKey: z.string().regex(/^[a-z0-9_.-]{3,120}$/),
  question: z.string().trim().min(5).max(1_000),
  status: dcmDecisionStatusSchema,
  recommendation: z.string().trim().min(3).max(4_000).nullable(),
  alternatives: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_.-]{2,120}$/),
    label: z.string().trim().min(2).max(240),
    disposition: z.enum(["candidate", "preferred", "rejected", "deferred"]),
    rationale: z.string().trim().min(3).max(2_000),
  })).max(20).default([]),
  rationaleSummary: z.string().trim().min(3).max(4_000),
  evidence: z.array(dcmEvidenceRefSchema).max(200),
  assumptions: z.array(z.string().trim().min(3).max(500)).max(40).default([]),
  unresolved: z.array(z.string().trim().min(3).max(500)).max(40).default([]),
  confidence: z.enum(["insufficient", "low", "medium", "high"]),
  proposedBy: dcmSpecialistSchema,
  reviewedBy: z.enum(["user", "offroad_operator", "independent_verifier"]).nullable(),
  createdAt: z.iso.datetime(),
  supersedesDecisionId: z.uuid().nullable().default(null),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((decision, context) => {
  if (decision.status === "confirmed" && decision.reviewedBy === null) {
    context.addIssue({code: "custom", path: ["reviewedBy"], message: "confirmed decisions require a reviewer"});
  }
  if (decision.confidence === "high" && decision.evidence.length === 0) {
    context.addIssue({code: "custom", path: ["evidence"], message: "high confidence requires evidence"});
  }
  if (decision.status !== "open" && decision.recommendation === null) {
    context.addIssue({code: "custom", path: ["recommendation"], message: "resolved decisions require a recommendation"});
  }
});
export type DcmDecisionRecord = z.infer<typeof dcmDecisionRecordSchema>;

export const dcmAgentAssessmentSchema = z.object({
  schemaVersion: z.literal("dcm-agent-assessment.v1"),
  projectId: z.uuid(),
  assessmentRef: z.string().trim().min(1).max(300),
  coverage: z.array(dcmRequirementCoverageSchema).max(200),
  requests: z.array(dcmInformationRequestSchema).max(3),
  decisions: z.array(dcmDecisionRecordSchema).max(30),
}).superRefine((assessment, context) => {
  const scoped = [...assessment.coverage, ...assessment.requests, ...assessment.decisions]
    .every((item) => item.projectId === assessment.projectId);
  if (!scoped) {
    context.addIssue({code: "custom", path: ["projectId"], message: "assessment items must belong to the same project"});
  }
  const requestKeys = assessment.requests.map((request) => request.requirementKey);
  if (new Set(requestKeys).size !== requestKeys.length) {
    context.addIssue({code: "custom", path: ["requests"], message: "only one active request is allowed per requirement"});
  }
});
export type DcmAgentAssessment = z.infer<typeof dcmAgentAssessmentSchema>;

export const dcmWorkItemSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  planRevision: z.number().int().positive(),
  taskSpecId: z.string().regex(/^[A-Z][0-9]{2}$/).nullable(),
  title: z.string().trim().min(3).max(240),
  specialist: dcmSpecialistSchema,
  status: dcmWorkStatusSchema,
  effect: dcmWorkEffectSchema,
  dependencies: z.array(z.uuid()).max(80).default([]),
  requirementKeys: z.array(z.string().regex(/^[a-z0-9_.-]{3,120}$/)).max(80).default([]),
  decisionKeys: z.array(z.string().regex(/^[a-z0-9_.-]{3,120}$/)).max(80).default([]),
  inputEvidence: z.array(dcmEvidenceRefSchema).max(200).default([]),
  outputRefs: z.array(dcmEvidenceRefSchema).max(200).default([]),
  approvalRequired: z.boolean(),
  budget: z.object({
    modelCalls: z.number().int().min(0).max(100),
    searchQueries: z.number().int().min(0).max(100),
    costUsd: z.number().min(0).max(10_000),
  }),
}).superRefine((work, context) => {
  if (work.effect === "external" && !work.approvalRequired) {
    context.addIssue({code: "custom", path: ["approvalRequired"], message: "external work requires approval"});
  }
  if (work.status === "succeeded" && work.outputRefs.length === 0) {
    context.addIssue({code: "custom", path: ["outputRefs"], message: "succeeded work requires an output reference"});
  }
});
export type DcmWorkItem = z.infer<typeof dcmWorkItemSchema>;

export const dcmPlanRevisionSchema = z.object({
  schemaVersion: z.literal("dcm-agent-plan.v1"),
  id: z.uuid(),
  projectId: z.uuid(),
  revision: z.number().int().positive(),
  goal: z.string().trim().min(5).max(2_000),
  trigger: z.enum([
    "project_created",
    "user_message",
    "document_ingested",
    "research_completed",
    "information_received",
    "decision_revised",
    "quality_gate_failed",
  ]),
  triggerRef: z.string().trim().min(1).max(300),
  status: z.enum(["active", "completed", "superseded", "invalidated"]),
  workItems: z.array(dcmWorkItemSchema).min(1).max(120),
  createdAt: z.iso.datetime(),
  createdBy: z.enum(["deal_captain", "offroad_operator"]),
  specializationProfile: compiledSpecializationProfileSchema.optional(),
  supersedesPlanId: z.uuid().nullable().default(null),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((plan, context) => {
  const itemIds = new Set(plan.workItems.map((item) => item.id));
  if (itemIds.size !== plan.workItems.length) {
    context.addIssue({code: "custom", path: ["workItems"], message: "work item ids must be unique"});
    return;
  }
  const byId = new Map(plan.workItems.map((item) => [item.id, item]));
  for (const [index, item] of plan.workItems.entries()) {
    if (item.projectId !== plan.projectId || item.planRevision !== plan.revision) {
      context.addIssue({code: "custom", path: ["workItems", index], message: "work item scope does not match plan"});
    }
    for (const dependency of item.dependencies) {
      if (!byId.has(dependency)) {
        context.addIssue({code: "custom", path: ["workItems", index, "dependencies"], message: "unknown dependency"});
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependencies ?? []) {
      if (!visit(dependency)) return false;
    }
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  if ([...itemIds].some((id) => !visit(id))) {
    context.addIssue({code: "custom", path: ["workItems"], message: "work item dependency cycle"});
  }
});
export type DcmPlanRevision = z.infer<typeof dcmPlanRevisionSchema>;

export function createDcmDecisionRecord(
  input: Omit<DcmDecisionRecord, "schemaVersion" | "fingerprint">,
): DcmDecisionRecord {
  const payload = {...input, schemaVersion: "dcm-decision.v1" as const};
  return dcmDecisionRecordSchema.parse({...payload, fingerprint: fingerprintJson(payload)});
}

export function createDcmPlanRevision(
  input: Omit<DcmPlanRevision, "schemaVersion" | "fingerprint">,
): DcmPlanRevision {
  const payload = {...input, schemaVersion: "dcm-agent-plan.v1" as const};
  return dcmPlanRevisionSchema.parse({...payload, fingerprint: fingerprintJson(payload)});
}

export function rankInformationRequests(
  requests: readonly DcmInformationRequest[],
  limit = 3,
): DcmInformationRequest[] {
  return requests
    .filter((request) => request.status === "open" && request.priority !== "later")
    .map((request) => ({
      request,
      score: (request.informationGain * 0.45)
        + (request.materiality * 0.4)
        + (request.answerability * 0.15)
        - request.redundancyPenalty,
    }))
    .sort((left, right) => right.score - left.score || left.request.createdAt.localeCompare(right.request.createdAt))
    .slice(0, Math.max(0, Math.min(limit, 3)))
    .map(({request}) => request);
}

export function selectRunnableWork(input: {
  plan: DcmPlanRevision;
  coveredRequirements: ReadonlySet<string>;
  approvedWorkItemIds?: ReadonlySet<string>;
}): DcmWorkItem[] {
  const succeeded = new Set(input.plan.workItems.filter((item) => item.status === "succeeded").map((item) => item.id));
  const approved = input.approvedWorkItemIds ?? new Set<string>();
  return input.plan.workItems.filter((item) =>
    (item.status === "pending" || item.status === "ready")
    && item.dependencies.every((dependency) => succeeded.has(dependency))
    && item.requirementKeys.every((requirement) => input.coveredRequirements.has(requirement))
    && (!item.approvalRequired || approved.has(item.id))
  );
}

export function specialistForTaskSpec(taskSpecId: string): DcmSpecialist {
  if (taskSpecId === "M01") return "context_intelligence";
  if (taskSpecId.startsWith("M")) return "deal_captain";
  if (taskSpecId.startsWith("D")) return "document_intelligence";
  if (["C01", "C02", "C09"].includes(taskSpecId)) return "company_and_sector";
  if (["C03", "C04", "C06", "C07", "C08", "C10"].includes(taskSpecId)) return "financial_analysis";
  if (["C05", "C11"].includes(taskSpecId)) return "debt_and_capital_structure";
  if (taskSpecId.startsWith("S")) return "transaction_structuring";
  if (taskSpecId.startsWith("K") || taskSpecId.startsWith("X")) return "market_intelligence";
  if (taskSpecId.startsWith("A")) return "materials";
  if (taskSpecId.startsWith("L")) return "independent_verifier";
  return "deal_captain";
}

type CompiledTaskInput = {
  id: string;
  label: string;
  dependencies: readonly string[];
  effect: DcmWorkEffect;
  executionClass: "deterministic" | "extraction" | "research" | "judgment" | "compilation" | "action";
};

/**
 * Projects the immutable TaskSpec boundary into the first dynamic plan. It does not invent a new
 * capability: every work item points back to the compiled task that authorized it. Later planner
 * revisions may reorder, pause or repeat these items, but cannot add an unknown TaskSpec.
 */
export function createInitialDcmPlan(input: {
  id: string;
  projectId: string;
  goal: string;
  triggerRef: string;
  createdAt: string;
  taskSpecs: readonly CompiledTaskInput[];
  specializationProfile?: CompiledSpecializationProfile;
  requirementKeysByTask?: Readonly<Record<string, readonly string[]>>;
  decisionKeysByTask?: Readonly<Record<string, readonly string[]>>;
  idForTask: (taskSpecId: string) => string;
}): DcmPlanRevision {
  const workIdByTask = new Map(input.taskSpecs.map((task) => [task.id, input.idForTask(task.id)]));
  return createDcmPlanRevision({
    id: input.id,
    projectId: input.projectId,
    revision: 1,
    goal: input.goal,
    trigger: "project_created",
    triggerRef: input.triggerRef,
    status: "active",
    createdAt: input.createdAt,
    createdBy: "deal_captain",
    ...(input.specializationProfile ? {specializationProfile: input.specializationProfile} : {}),
    supersedesPlanId: null,
    workItems: input.taskSpecs.map((task) => ({
      id: workIdByTask.get(task.id)!,
      projectId: input.projectId,
      planRevision: 1,
      taskSpecId: task.id,
      title: task.label,
      specialist: specialistForTaskSpec(task.id),
      status: task.dependencies.length === 0 ? "ready" : "pending",
      effect: task.effect,
      dependencies: task.dependencies.map((dependency) => {
        const workId = workIdByTask.get(dependency);
        if (!workId) throw new Error(`${task.id} depends on a TaskSpec outside the compiled plan: ${dependency}`);
        return workId;
      }),
      requirementKeys: [...(input.requirementKeysByTask?.[task.id] ?? [])],
      decisionKeys: [...(input.decisionKeysByTask?.[task.id] ?? [])],
      inputEvidence: [],
      outputRefs: [],
      approvalRequired: task.effect === "external",
      budget: budgetForExecutionClass(task.executionClass),
    })),
  });
}

function budgetForExecutionClass(executionClass: CompiledTaskInput["executionClass"]): DcmWorkItem["budget"] {
  if (executionClass === "research") return {modelCalls: 3, searchQueries: 12, costUsd: 15};
  if (executionClass === "judgment") return {modelCalls: 3, searchQueries: 0, costUsd: 12};
  if (executionClass === "extraction") return {modelCalls: 2, searchQueries: 0, costUsd: 8};
  if (executionClass === "compilation") return {modelCalls: 2, searchQueries: 0, costUsd: 8};
  return {modelCalls: 0, searchQueries: 0, costUsd: 0};
}
