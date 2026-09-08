import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";
import {capabilityMaturitySchema} from "./operating-controls";
import type {CapabilityLedger} from "./capability-ledger";
import type {TrustControlCatalogue} from "./control-register";

export const programTaskStateSchema = z.enum([
  "backlog",
  "ready",
  "in_progress",
  "blocked",
  "code_complete",
  "evidence_complete",
  "gate_passed",
  "promoted",
]);
export type ProgramTaskState = z.infer<typeof programTaskStateSchema>;

export const programReleaseIdSchema = z.enum(["R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
export type ProgramReleaseId = z.infer<typeof programReleaseIdSchema>;

const evidenceRefSchema = z.string().regex(/^EV-[A-Z0-9-]+$/);
const taskIdSchema = z.string().regex(/^[A-Z]{2,4}-\d{2}$/);
const dateTimeSchema = z.string().datetime({offset: true});

export const programEvidenceSchema = z.object({
  evidenceId: evidenceRefSchema,
  kind: z.enum(["repository", "pull_request", "ci_run", "test", "runtime", "document", "external_assessment"]),
  ref: z.string().min(1),
  environment: z.enum(["repository", "ci", "staging", "production", "external"]),
  capturedAt: dateTimeSchema,
  validThrough: dateTimeSchema.nullable().optional(),
  description: z.string().min(1),
  immutableFingerprint: z.string().regex(/^[a-f0-9]{7,64}$/).nullable(),
});
export type ProgramEvidence = z.infer<typeof programEvidenceSchema>;

export const programSubtaskSchema = z.object({
  subtaskId: z.string().regex(/^[A-Z]{2,4}-\d{2}\.\d{2}$/),
  title: z.string().min(1),
  state: z.enum(["pending", "in_progress", "blocked", "done", "not_applicable"]),
});
export type ProgramSubtask = z.infer<typeof programSubtaskSchema>;

export const programAcceptanceSchema = z.object({
  criterionId: z.string().regex(/^[A-Z]{2,4}-\d{2}\.AC\d{2}$/),
  description: z.string().min(1),
  status: z.enum(["pending", "passed", "failed", "not_applicable"]),
  evidenceRefs: z.array(evidenceRefSchema),
});
export type ProgramAcceptance = z.infer<typeof programAcceptanceSchema>;

export const programBlockerSchema = z.object({
  blockerId: z.string().regex(/^BL-[A-Z0-9-]+$/),
  severity: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["open", "resolved"]),
  description: z.string().min(1),
  evidenceRefs: z.array(evidenceRefSchema),
});
export type ProgramBlocker = z.infer<typeof programBlockerSchema>;

export const capabilityTransitionSchema = z.object({
  capabilityId: z.string().regex(/^[a-z][a-z0-9.-]+$/),
  from: capabilityMaturitySchema,
  to: capabilityMaturitySchema,
  status: z.enum(["planned", "recorded"]),
  evidenceRefs: z.array(evidenceRefSchema),
});
export type CapabilityTransition = z.infer<typeof capabilityTransitionSchema>;

export const programTaskSchema = z.object({
  taskId: taskIdSchema,
  releaseId: programReleaseIdSchema,
  title: z.string().min(1),
  outcome: z.string().min(1),
  state: programTaskStateSchema,
  ownerRole: z.string().min(1),
  dependsOn: z.array(taskIdSchema),
  subtasks: z.array(programSubtaskSchema).min(1),
  acceptance: z.array(programAcceptanceSchema).min(1),
  evidenceRefs: z.array(evidenceRefSchema),
  capabilityRefs: z.array(z.string().regex(/^[a-z][a-z0-9.-]+$/)),
  blockers: z.array(programBlockerSchema),
  securityControlIds: z.array(z.string().regex(/^TRUST-[A-Z0-9-]+$/)),
  blueprintRefs: z.array(z.string().min(1)).min(1),
  capabilityTransition: capabilityTransitionSchema.nullable(),
});
export type ProgramTask = z.infer<typeof programTaskSchema>;

export const programFindingSchema = z.object({
  findingId: z.string().regex(/^PF-[A-Z0-9-]+$/),
  severity: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["open", "resolved"]),
  description: z.string().min(1),
  evidenceRefs: z.array(evidenceRefSchema).min(1),
  ownerRole: z.string().min(1),
});
export type ProgramFinding = z.infer<typeof programFindingSchema>;

export const endgameProgramBoardSchema = z.object({
  boardVersion: z.string().min(1),
  generatedAt: dateTimeSchema,
  baseline: z.object({
    repository: z.string().min(1),
    branch: z.literal("main"),
    commit: z.string().regex(/^[a-f0-9]{7,40}$/),
    capabilityLedgerVersion: z.string().min(1),
    capabilityLedgerBaselineCommit: z.string().regex(/^[a-f0-9]{7,40}$/),
  }),
  releaseSequence: z.array(programReleaseIdSchema).length(8),
  evidenceIndex: z.array(programEvidenceSchema).min(1),
  reconciliationFindings: z.array(programFindingSchema),
  tasks: z.array(programTaskSchema).min(1),
});
export type EndgameProgramBoard = z.infer<typeof endgameProgramBoardSchema>;

export type ProgramBoardIssue = {code: string; taskId: string | null};
export type ProgramBoardDecision = {
  valid: boolean;
  readyForNextPromotion: boolean;
  taskCounts: Record<ProgramTaskState, number>;
  blockers: ProgramBoardIssue[];
  warnings: ProgramBoardIssue[];
  boardFingerprint: string;
};

const maturityRank = Object.fromEntries(capabilityMaturitySchema.options.map((value, index) => [value, index])) as Record<z.infer<typeof capabilityMaturitySchema>, number>;
const terminalStates = new Set<ProgramTaskState>(["gate_passed", "promoted"]);
const exclusiveCapabilityTransitionOwners = new Map<string, string>([
  ["artifacts.governed-office-foundation", "MAT-01"],
  ["artifacts.template-faithful-suite", "MAT-05"],
  ["execution.general-specialist-runtime", "WFI-14"],
  ["gold.g2-g8-reference-journeys", "JNY-09"],
]);

/**
 * Evaluates program truth, not delivery optimism. A board may be valid while work remains blocked;
 * it cannot call a task gate-passed or promoted without closed dependencies, acceptance evidence
 * and a transition already recorded in the capability ledger.
 */
export function evaluateEndgameProgramBoard(
  board: EndgameProgramBoard,
  capabilityLedger: CapabilityLedger,
  trustControlCatalogue: TrustControlCatalogue,
  now = new Date(),
): ProgramBoardDecision {
  const parsed = endgameProgramBoardSchema.parse(board);
  const blockers: ProgramBoardIssue[] = [];
  const warnings: ProgramBoardIssue[] = [];
  const evidenceById = new Map<string, ProgramEvidence>();
  const taskById = new Map<string, ProgramTask>();
  const capabilityById = new Map(capabilityLedger.entries.map((entry) => [entry.capabilityId, entry]));
  const trustControlIds = new Set(trustControlCatalogue.controls.map((control) => control.controlId));
  const taskCounts = Object.fromEntries(programTaskStateSchema.options.map((state) => [state, 0])) as Record<ProgramTaskState, number>;

  if (parsed.baseline.capabilityLedgerVersion !== capabilityLedger.ledgerVersion) {
    blockers.push({code: "capability_ledger_version_mismatch", taskId: null});
  }

  if (parsed.baseline.capabilityLedgerBaselineCommit !== capabilityLedger.baselineCommit) {
    blockers.push({code: "capability_ledger_baseline_mismatch", taskId: null});
  }

  if (new Set(parsed.releaseSequence).size !== programReleaseIdSchema.options.length
    || parsed.releaseSequence.some((release, index) => release !== programReleaseIdSchema.options[index])) {
    blockers.push({code: "release_sequence_must_be_complete_and_ordered", taskId: null});
  }

  for (const evidence of parsed.evidenceIndex) {
    if (evidenceById.has(evidence.evidenceId)) blockers.push({code: "duplicate_evidence_id", taskId: null});
    evidenceById.set(evidence.evidenceId, evidence);
    if (evidence.kind === "external_assessment" && (!evidence.immutableFingerprint || !evidence.validThrough)) {
      blockers.push({code: "external_assessment_requires_fingerprint_and_validity", taskId: null});
    }
  }
  for (const task of parsed.tasks) {
    taskCounts[task.state] += 1;
    if (taskById.has(task.taskId)) blockers.push({code: "duplicate_task_id", taskId: task.taskId});
    taskById.set(task.taskId, task);
  }
  const transitionClaims = new Map<string, string[]>();
  for (const task of parsed.tasks) {
    if (!task.capabilityTransition) continue;
    const claims = transitionClaims.get(task.capabilityTransition.capabilityId) ?? [];
    claims.push(task.taskId);
    transitionClaims.set(task.capabilityTransition.capabilityId, claims);
  }
  for (const [capabilityId, taskIds] of transitionClaims) {
    if (taskIds.length <= 1) continue;
    for (const taskId of taskIds) blockers.push({code: `duplicate_capability_transition:${capabilityId}`, taskId});
  }

  for (const finding of parsed.reconciliationFindings) {
    validateEvidenceRefs(finding.evidenceRefs, evidenceById, now, blockers, null, "finding_evidence_missing");
  }

  for (const task of parsed.tasks) {
    validateEvidenceRefs(task.evidenceRefs, evidenceById, now, blockers, task.taskId, "task_evidence_missing");
    if (new Set(task.capabilityRefs).size !== task.capabilityRefs.length) blockers.push({code: "duplicate_capability_ref", taskId: task.taskId});
    for (const capabilityId of task.capabilityRefs) {
      if (!capabilityById.has(capabilityId)) blockers.push({code: `unknown_capability_ref:${capabilityId}`, taskId: task.taskId});
    }
    for (const controlId of task.securityControlIds) {
      if (!trustControlIds.has(controlId)) blockers.push({code: `unknown_security_control:${controlId}`, taskId: task.taskId});
    }
    if (new Set(task.dependsOn).size !== task.dependsOn.length) blockers.push({code: "duplicate_dependency", taskId: task.taskId});
    for (const dependency of task.dependsOn) {
      if (dependency === task.taskId) blockers.push({code: "self_dependency", taskId: task.taskId});
      if (!taskById.has(dependency)) blockers.push({code: `unknown_dependency:${dependency}`, taskId: task.taskId});
    }
    const expectedSubtaskPrefix = `${task.taskId}.`;
    if (task.subtasks.some((subtask) => !subtask.subtaskId.startsWith(expectedSubtaskPrefix))) blockers.push({code: "subtask_identity_mismatch", taskId: task.taskId});
    if (new Set(task.subtasks.map((subtask) => subtask.subtaskId)).size !== task.subtasks.length) blockers.push({code: "duplicate_subtask", taskId: task.taskId});
    if (task.acceptance.some((criterion) => !criterion.criterionId.startsWith(`${task.taskId}.AC`))) blockers.push({code: "acceptance_identity_mismatch", taskId: task.taskId});
    if (new Set(task.acceptance.map((criterion) => criterion.criterionId)).size !== task.acceptance.length) blockers.push({code: "duplicate_acceptance_criterion", taskId: task.taskId});
    for (const criterion of task.acceptance) {
      validateEvidenceRefs(criterion.evidenceRefs, evidenceById, now, blockers, task.taskId, "acceptance_evidence_missing");
      if (criterion.status === "passed" && criterion.evidenceRefs.length === 0) blockers.push({code: "passed_acceptance_requires_evidence", taskId: task.taskId});
      if (criterion.status === "pending" && criterion.evidenceRefs.length > 0) warnings.push({code: "pending_acceptance_has_unclaimed_evidence", taskId: task.taskId});
    }
    for (const blocker of task.blockers) {
      validateEvidenceRefs(blocker.evidenceRefs, evidenceById, now, blockers, task.taskId, "blocker_evidence_missing");
      if (blocker.status === "resolved" && blocker.evidenceRefs.length === 0) blockers.push({code: "resolved_blocker_requires_evidence", taskId: task.taskId});
    }

    if (task.capabilityTransition) {
      const transition = task.capabilityTransition;
      const exclusiveOwner = exclusiveCapabilityTransitionOwners.get(transition.capabilityId);
      if (exclusiveOwner && exclusiveOwner !== task.taskId) {
        blockers.push({code: `capability_transition_owned_by:${exclusiveOwner}`, taskId: task.taskId});
      }
      validateEvidenceRefs(transition.evidenceRefs, evidenceById, now, blockers, task.taskId, "transition_evidence_missing");
      if (maturityRank[transition.to] <= maturityRank[transition.from]) blockers.push({code: "capability_transition_must_advance", taskId: task.taskId});
      const capability = capabilityById.get(transition.capabilityId);
      if (!capability) {
        if (transition.status === "recorded") blockers.push({code: "recorded_transition_capability_missing", taskId: task.taskId});
        else warnings.push({code: "planned_transition_capability_not_yet_registered", taskId: task.taskId});
      } else if (transition.status === "planned" && capability.qualityMaturity !== transition.from) {
        blockers.push({code: "planned_transition_from_maturity_mismatch", taskId: task.taskId});
      } else if (transition.status === "recorded" && capability.qualityMaturity !== transition.to) {
        blockers.push({code: "recorded_transition_not_reflected_in_ledger", taskId: task.taskId});
      }
      if (transition.status === "recorded" && transition.evidenceRefs.length === 0) blockers.push({code: "recorded_transition_requires_evidence", taskId: task.taskId});
    }

    if (terminalStates.has(task.state)) {
      if (task.subtasks.some((subtask) => subtask.state !== "done" && subtask.state !== "not_applicable")) blockers.push({code: "terminal_task_has_open_subtasks", taskId: task.taskId});
      if (task.acceptance.some((criterion) => criterion.status !== "passed" && criterion.status !== "not_applicable")) blockers.push({code: "terminal_task_acceptance_incomplete", taskId: task.taskId});
      if (task.evidenceRefs.length === 0) blockers.push({code: "terminal_task_requires_evidence", taskId: task.taskId});
      if (task.blockers.some((blocker) => blocker.status === "open")) blockers.push({code: "terminal_task_has_open_blocker", taskId: task.taskId});
      for (const dependency of task.dependsOn) {
        const dependencyTask = taskById.get(dependency);
        if (dependencyTask && !terminalStates.has(dependencyTask.state)) blockers.push({code: `terminal_dependency_not_passed:${dependency}`, taskId: task.taskId});
      }
      if (task.state === "promoted") {
        if (!task.capabilityTransition || task.capabilityTransition.status !== "recorded") {
          blockers.push({code: "promoted_task_requires_recorded_capability_transition", taskId: task.taskId});
          continue;
        }
        const capability = capabilityById.get(task.capabilityTransition.capabilityId);
        if (!capability || capability.availability !== "live" || capability.exposure === "none") blockers.push({code: "promoted_task_requires_live_exposed_capability", taskId: task.taskId});
      }
    }
    if (task.state === "evidence_complete" && task.acceptance.some((criterion) => criterion.status === "pending" || criterion.status === "failed")) blockers.push({code: "evidence_complete_has_unresolved_acceptance", taskId: task.taskId});
    if (task.state === "blocked" && !task.blockers.some((blocker) => blocker.status === "open")) blockers.push({code: "blocked_task_requires_open_blocker", taskId: task.taskId});
  }

  detectTaskCycles(parsed.tasks, blockers);
  const openMaterialFindings = parsed.reconciliationFindings.some((finding) => finding.status === "open" && (finding.severity === "critical" || finding.severity === "high"));
  return {
    valid: blockers.length === 0,
    readyForNextPromotion: blockers.length === 0 && !openMaterialFindings,
    taskCounts,
    blockers: stableIssues(blockers),
    warnings: stableIssues(warnings),
    boardFingerprint: fingerprintJson(parsed),
  };
}

function validateEvidenceRefs(refs: string[], evidenceById: Map<string, ProgramEvidence>, now: Date, issues: ProgramBoardIssue[], taskId: string | null, code: string) {
  for (const ref of refs) {
    const evidence = evidenceById.get(ref);
    if (!evidence) issues.push({code: `${code}:${ref}`, taskId});
    else if (evidence.validThrough && new Date(evidence.validThrough).getTime() < now.getTime()) issues.push({code: `${code.replace("_missing", "_expired")}:${ref}`, taskId});
  }
}

function detectTaskCycles(tasks: ProgramTask[], issues: ProgramBoardIssue[]) {
  const taskById = new Map(tasks.map((task) => [task.taskId, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string) => {
    if (visiting.has(taskId)) {
      issues.push({code: "dependency_cycle", taskId});
      return;
    }
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependency of taskById.get(taskId)?.dependsOn ?? []) if (taskById.has(dependency)) visit(dependency);
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const task of tasks) visit(task.taskId);
}

function stableIssues(issues: ProgramBoardIssue[]) {
  return [...new Map(issues
    .sort((left, right) => `${left.taskId ?? ""}:${left.code}`.localeCompare(`${right.taskId ?? ""}:${right.code}`))
    .map((issue) => [`${issue.taskId ?? ""}:${issue.code}`, issue])).values()];
}
