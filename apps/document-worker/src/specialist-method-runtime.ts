import {
  specialistMethodRuntimeManifest,
  specialistTaskCapabilityRuntimeManifest,
} from "@offroad/credit-playbook";
import {
  assessReceivablesPoolMethodReadiness,
  receivablesPoolInputAssemblySchema,
  underwriteReceivablesPool,
  type ReceivablesPhaseOneInput,
  type ReceivablesPoolUnderwriting,
  type ReceivablesRawDetectionReport,
} from "@offroad/receivables-analysis";

export type SpecialistShadowQualityResult = {
  id: string;
  status: "passed" | "failed";
  detail: string;
};

export type ReceivablesSpecialistShadowResult = {
  mode: "internal_shadow";
  taskId: "R01";
  executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool";
  executorVersion: string;
  artifact: {
    artifactType: "receivables_pool_underwriting";
    schemaVersion: "method.underwrite-receivables-pool.v1";
    status: "draft";
    inputFingerprint: string;
    outputFingerprint: string;
    content: ReceivablesPoolUnderwriting;
    evidenceRefs: readonly {
      section: string;
      sourceClass: string;
      sourceId: string;
      anchor: string;
    }[];
  };
  qualityResults: readonly SpecialistShadowQualityResult[];
  externalEffectAllowed: false;
};

const taskId = "R01" as const;
const executorKey = "@offroad/receivables-analysis#underwriteReceivablesPool" as const;

/**
 * Bundled executor identities available to the universal dispatcher candidate compiler. Presence
 * here proves only that the worker binary holds the exact export; execution still requires the
 * independent capability, method, preflight and recipe gates.
 */
export const specialistCandidateExecutorRuntimeManifest = [{
  taskId,
  executorKey,
  executorVersion: "2026.09.06-v1",
  procedure: {id: "underwrite-receivables-pool", version: "2026.09.06-v1"},
  resultContract: "method.underwrite-receivables-pool.v1",
}] as const;

function methodRuntime() {
  const method = specialistMethodRuntimeManifest.find((entry) => entry.taskIds.includes(taskId));
  const capability = specialistTaskCapabilityRuntimeManifest.find((entry) => entry.taskId === taskId);
  if (!method || !capability) throw new Error("receivables_specialist_runtime_not_registered");
  if (
    method.executor.module !== "@offroad/receivables-analysis"
    || method.executor.exportName !== "underwriteReceivablesPool"
    || capability.executorKey !== executorKey
    || capability.executorVersion !== method.procedure.version
    || capability.procedure.id !== method.procedure.id
    || capability.procedure.version !== method.procedure.version
  ) throw new Error("receivables_specialist_runtime_manifest_mismatch");
  if (
    capability.availability !== "shadow"
    || capability.exposure !== "internal"
    || !capability.allowedUses.includes("internal_validation")
    || capability.maximumEffect !== "none"
  ) throw new Error("receivables_specialist_shadow_policy_mismatch");
  return {method, capability};
}

function qualityResults(result: ReceivablesPoolUnderwriting): SpecialistShadowQualityResult[] {
  const checks = [
    {
      id: "trace_output_fingerprint_present",
      passed: /^[a-f0-9]{64}$/.test(result.trace.output_fingerprint),
      detail: "The deterministic result carries a SHA-256 output fingerprint.",
    },
    {
      id: "source_row_coverage",
      passed: result.trace.source_rows.length === result.eligibility.length,
      detail: "Every analyzed receivable has a source-row trace.",
    },
    {
      id: "source_row_uniqueness",
      passed: new Set(result.trace.source_rows.map((entry) => entry.receivable_id)).size === result.trace.source_rows.length,
      detail: "No receivable source trace is duplicated.",
    },
    {
      id: "decision_boundary_preserved",
      passed: result.decision_boundary.externalDirectionAllowed === false,
      detail: "The method does not authorize external direction, approval or capital action.",
    },
    {
      id: "method_and_engine_versioned",
      passed: Boolean(result.trace.method_version && result.trace.engine_version),
      detail: "The method and deterministic engine versions are explicit.",
    },
  ];
  return checks.map((check) => ({id: check.id, status: check.passed ? "passed" : "failed", detail: check.detail}));
}

/**
 * Executes the first specialist method only as an internal shadow calculation. This is not the
 * live dispatcher: it accepts no provider, tool, tenant allowlist or external effect and returns
 * a draft artifact for evaluation. Promotion requires a separate capability change and E2E gate.
 */
export function executeReceivablesSpecialistShadow(input: {
  taskId: string;
  executorKey: string;
  executorVersion: string;
  phaseOne: ReceivablesPhaseOneInput;
  detection: ReceivablesRawDetectionReport;
  assembly: unknown;
}): ReceivablesSpecialistShadowResult {
  const runtime = methodRuntime();
  if (input.taskId !== taskId) throw new Error("specialist_task_not_supported");
  if (input.executorKey !== executorKey || input.executorVersion !== runtime.method.procedure.version) {
    throw new Error("specialist_executor_binding_mismatch");
  }
  const readiness = assessReceivablesPoolMethodReadiness({
    phaseOne: input.phaseOne,
    detection: input.detection,
    assembly: input.assembly,
  });
  if (!readiness.methodExecutionAllowed || readiness.validatedInput === null) {
    const codes = readiness.gaps.map((entry) => entry.code).join(",");
    throw new Error(`specialist_method_input_not_ready:${readiness.primaryReason}:${codes}`);
  }
  const assembly = receivablesPoolInputAssemblySchema.parse(input.assembly);
  const result = underwriteReceivablesPool(readiness.validatedInput);
  const checks = qualityResults(result);
  if (checks.some((check) => check.status === "failed")) {
    throw new Error(`specialist_method_quality_gate_failed:${checks.filter((check) => check.status === "failed").map((check) => check.id).join(",")}`);
  }
  const evidenceRefs = Object.entries(assembly.evidence).flatMap(([section, references]) => (
    references.map((reference) => ({section, ...reference}))
  )).sort((left, right) => `${left.section}:${left.sourceId}:${left.anchor}`.localeCompare(`${right.section}:${right.sourceId}:${right.anchor}`));
  return {
    mode: "internal_shadow",
    taskId,
    executorKey,
    executorVersion: runtime.method.procedure.version,
    artifact: {
      artifactType: "receivables_pool_underwriting",
      schemaVersion: "method.underwrite-receivables-pool.v1",
      status: "draft",
      inputFingerprint: result.trace.input_fingerprint,
      outputFingerprint: result.trace.output_fingerprint,
      content: result,
      evidenceRefs,
    },
    qualityResults: checks,
    externalEffectAllowed: false,
  };
}
