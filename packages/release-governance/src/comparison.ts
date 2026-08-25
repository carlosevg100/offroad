import {caseRunReportSchema, caseStageIds, type CaseRunReport, type CaseStageId} from "@offroad/case-runner";
import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

export const executionModeSchema = z.enum(["primary", "shadow", "replay"]);
export type ExecutionMode = z.infer<typeof executionModeSchema>;

export const comparisonSeveritySchema = z.enum(["info", "warning", "critical"]);
export type ComparisonSeverity = z.infer<typeof comparisonSeveritySchema>;

export const comparisonKindSchema = z.enum([
  "input_mismatch",
  "case_status_changed",
  "stage_status_changed",
  "stage_failure_changed",
  "stage_output_changed",
  "usage_increased",
  "version_changed",
]);
export type ComparisonKind = z.infer<typeof comparisonKindSchema>;

export const executionDifferenceSchema = z.object({
  kind: comparisonKindSchema,
  severity: comparisonSeveritySchema,
  code: z.string().min(1).max(120),
  stage: z.enum(caseStageIds).nullable(),
  baselineFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  candidateFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});
export type ExecutionDifference = z.infer<typeof executionDifferenceSchema>;

export const executionComparisonSchema = z.object({
  schemaVersion: z.literal("2026.08.24-v1"),
  mode: executionModeSchema.exclude(["primary"]),
  comparable: z.boolean(),
  passed: z.boolean(),
  criticalCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  differences: z.array(executionDifferenceSchema),
  comparisonFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ExecutionComparison = z.infer<typeof executionComparisonSchema>;

/**
 * Compares public, content-free run reports. A replay is strict: identical frozen input and
 * versions must produce identical stage fingerprints. A shadow run may legitimately phrase an
 * output differently, so output drift is visible but only becomes a warning. Status regressions,
 * contract failures and changed inputs are critical in every mode.
 */
export function compareCaseExecutions(input: {
  mode: "shadow" | "replay";
  baseline: CaseRunReport;
  candidate: CaseRunReport;
}): ExecutionComparison {
  const baseline = caseRunReportSchema.parse(input.baseline);
  const candidate = caseRunReportSchema.parse(input.candidate);
  const differences: ExecutionDifference[] = [];

  if (baseline.inputFingerprint !== candidate.inputFingerprint) {
    differences.push(difference("input_mismatch", "critical", "frozen_input_changed", null,
      baseline.inputFingerprint, candidate.inputFingerprint));
  }

  if (baseline.status !== candidate.status) {
    differences.push(difference(
      "case_status_changed",
      statusRegressed(baseline.status, candidate.status) ? "critical" : "info",
      `case_status_${baseline.status}_to_${candidate.status}`,
      null,
      baseline.reportFingerprint,
      candidate.reportFingerprint,
    ));
  }

  for (const stage of caseStageIds) {
    const left = baseline.stages.find((entry) => entry.stage === stage)!;
    const right = candidate.stages.find((entry) => entry.stage === stage)!;
    if (left.status !== right.status) {
      differences.push(difference(
        "stage_status_changed",
        stageRegressed(left.status, right.status) ? "critical" : "info",
        `stage_status_${left.status}_to_${right.status}`,
        stage,
        left.outputFingerprint ?? null,
        right.outputFingerprint ?? null,
      ));
    }
    if (left.failureKind !== right.failureKind || left.code !== right.code) {
      const candidateFailed = right.status === "failed" || right.status === "blocked";
      differences.push(difference(
        "stage_failure_changed",
        candidateFailed ? "critical" : "info",
        "stage_failure_contract_changed",
        stage,
        nullableFingerprint(left.failureKind, left.code),
        nullableFingerprint(right.failureKind, right.code),
      ));
    }
    if (left.outputFingerprint !== right.outputFingerprint && left.status === "succeeded" && right.status === "succeeded") {
      differences.push(difference(
        "stage_output_changed",
        input.mode === "replay" ? "critical" : "warning",
        input.mode === "replay" ? "non_deterministic_replay" : "shadow_output_drift",
        stage,
        left.outputFingerprint ?? null,
        right.outputFingerprint ?? null,
      ));
    }
  }

  const versionsEqual = fingerprintJson(baseline.versions) === fingerprintJson(candidate.versions);
  if (!versionsEqual) {
    differences.push(difference(
      "version_changed",
      input.mode === "replay" ? "critical" : "info",
      input.mode === "replay" ? "replay_version_changed" : "shadow_version_changed",
      null,
      fingerprintJson(baseline.versions),
      fingerprintJson(candidate.versions),
    ));
  }

  if (candidate.usage.costUsd > baseline.usage.costUsd * 1.25 && candidate.usage.costUsd - baseline.usage.costUsd > 0.25) {
    differences.push(difference(
      "usage_increased",
      "warning",
      "cost_increased_over_25_percent",
      null,
      fingerprintJson(baseline.usage),
      fingerprintJson(candidate.usage),
    ));
  }

  const payload = {
    schemaVersion: "2026.08.24-v1" as const,
    mode: input.mode,
    comparable: baseline.inputFingerprint === candidate.inputFingerprint,
    criticalCount: differences.filter((entry) => entry.severity === "critical").length,
    warningCount: differences.filter((entry) => entry.severity === "warning").length,
    differences,
  };
  const passed = payload.comparable && payload.criticalCount === 0;
  return executionComparisonSchema.parse({...payload, passed, comparisonFingerprint: fingerprintJson({...payload, passed})});
}

function difference(
  kind: ComparisonKind,
  severity: ComparisonSeverity,
  code: string,
  stage: CaseStageId | null,
  baselineFingerprint: string | null,
  candidateFingerprint: string | null,
): ExecutionDifference {
  return {kind, severity, code, stage, baselineFingerprint, candidateFingerprint};
}

function nullableFingerprint(...parts: unknown[]): string | null {
  return parts.every((part) => part === undefined || part === null) ? null : fingerprintJson(parts);
}

const caseStatusRank = {succeeded: 2, blocked: 1, failed: 0} as const;
function statusRegressed(left: keyof typeof caseStatusRank, right: keyof typeof caseStatusRank): boolean {
  return caseStatusRank[right] < caseStatusRank[left];
}

const stageStatusRank = {succeeded: 3, skipped: 2, blocked: 1, failed: 0} as const;
function stageRegressed(left: keyof typeof stageStatusRank, right: keyof typeof stageStatusRank): boolean {
  return stageStatusRank[right] < stageStatusRank[left];
}
