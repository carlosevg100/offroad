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

/** The two accepted modes. Anything else is a policy change, not a flag. */
export type SpecialistMethodMode = "internal_shadow" | "analytical_release";

export type ReceivablesSpecialistEvidenceRef = {
  section: string;
  sourceClass: string;
  sourceId: string;
  anchor: string;
};

/**
 * The release state the database resolved for this organization, carried explicitly. Under the
 * `universal` exposure the method carries since the founder's approval of 10 September 2026 there
 * is no per-organization concession to hold: the reading is open for every organization until an
 * operator pauses the platform release record or this organization. A paused release is not a
 * degraded release: it is the internal shadow mode, exactly as before.
 */
export type ReceivablesAnalyticalRelease = {
  open: boolean;
  organizationId: string;
  confirmedScope: {id: string; fingerprint: string};
  sourceDatasetHash: string;
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
    evidenceRefs: readonly ReceivablesSpecialistEvidenceRef[];
  };
  qualityResults: readonly SpecialistShadowQualityResult[];
  externalEffectAllowed: false;
};

/**
 * The same calculation, released to the organization that owns the session. It carries the method
 * rung, the confirmed scope it was computed from and the dataset hash, so a result can never be
 * shown as current for a portfolio selection the organization did not confirm.
 */
export type ReceivablesSpecialistReleaseResult = {
  mode: "analytical_release";
  taskId: "R01";
  executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool";
  executorVersion: string;
  release: {
    organizationId: string;
    procedure: {id: string; version: string; maturity: string};
    methodMaturity: string;
    allowedUses: readonly string[];
    maximumEffect: "none";
    confirmedScope: {id: string; fingerprint: string};
    sourceDatasetHash: string;
  };
  artifact: {
    artifactType: "receivables_pool_underwriting";
    schemaVersion: "method.underwrite-receivables-pool.v1";
    status: "released";
    inputFingerprint: string;
    outputFingerprint: string;
    content: ReceivablesPoolUnderwriting;
    evidenceRefs: readonly ReceivablesSpecialistEvidenceRef[];
  };
  qualityResults: readonly SpecialistShadowQualityResult[];
  externalEffectAllowed: false;
};

const taskId = "R01" as const;
const executorKey = "@offroad/receivables-analysis#underwriteReceivablesPool" as const;
/** A released analytical result needs the recorded review and runs behind it, not a flag. */
const releasedMaturities = ["tested", "ready_for_founder", "production"] as const;
/** A method may execute here while still shadow, and it may execute once promoted to live. */
const executableAvailabilities = ["shadow", "live"] as const;
/** Who may see the released reading: one allowlisted organization, or every organization. */
const releasedExposures = ["allowlisted", "universal"] as const;
const sha256 = /^[a-f0-9]{64}$/;

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

type MethodPolicy = {
  executor: {module: string; exportName: string};
  procedure: {id: string; version: string; maturity: string};
};
type CapabilityPolicy = {
  executorKey: string;
  executorVersion: string;
  procedure: {id: string; version: string};
  availability: string;
  exposure: string;
  allowedUses: readonly string[];
  maximumEffect: string;
};

/**
 * The only place a mode is admitted. Both modes require an effect-free, non-external policy; the
 * released mode additionally requires a customer-work exposure that is allowlisted or universal
 * and a method that carries its recorded independent review and its gold, adversarial and
 * consistency runs. Changing a flag without changing the recorded evidence therefore cannot open
 * the released path, and no availability or exposure ever buys an external effect.
 */
export function evaluateReceivablesSpecialistPolicy(
  mode: SpecialistMethodMode,
  method: MethodPolicy,
  capability: CapabilityPolicy,
): string | null {
  if (
    method.executor.module !== "@offroad/receivables-analysis"
    || method.executor.exportName !== "underwriteReceivablesPool"
    || capability.executorKey !== executorKey
    || capability.executorVersion !== method.procedure.version
    || capability.procedure.id !== method.procedure.id
    || capability.procedure.version !== method.procedure.version
  ) return "receivables_specialist_runtime_manifest_mismatch";
  // Common to both modes: the method never proposes state, commits or acts outside the product.
  if (
    !executableAvailabilities.includes(capability.availability as (typeof executableAvailabilities)[number])
    || capability.exposure === "none"
    || !capability.allowedUses.includes("internal_validation")
    || capability.allowedUses.some((use) => use === "external_material" || use === "external_action")
    || capability.maximumEffect !== "none"
  ) return "receivables_specialist_shadow_policy_mismatch";
  if (mode === "analytical_release" && (
    !releasedExposures.includes(capability.exposure as (typeof releasedExposures)[number])
    || !capability.allowedUses.includes("customer_work")
    || !releasedMaturities.includes(method.procedure.maturity as (typeof releasedMaturities)[number])
  )) return "receivables_specialist_release_policy_mismatch";
  return null;
}

function methodRuntime(mode: SpecialistMethodMode) {
  const method = specialistMethodRuntimeManifest.find((entry) => entry.taskIds.includes(taskId));
  const capability = specialistTaskCapabilityRuntimeManifest.find((entry) => entry.taskId === taskId);
  if (!method || !capability) throw new Error("receivables_specialist_runtime_not_registered");
  const failure = evaluateReceivablesSpecialistPolicy(mode, method, capability);
  if (failure) throw new Error(failure);
  return {method, capability};
}

function qualityResults(result: ReceivablesPoolUnderwriting): SpecialistShadowQualityResult[] {
  const checks = [
    {
      id: "trace_output_fingerprint_present",
      passed: sha256.test(result.trace.output_fingerprint),
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

type SpecialistExecutionInput = {
  taskId: string;
  executorKey: string;
  executorVersion: string;
  phaseOne: ReceivablesPhaseOneInput;
  detection: ReceivablesRawDetectionReport;
  assembly: unknown;
};

function execute(mode: SpecialistMethodMode, input: SpecialistExecutionInput) {
  const runtime = methodRuntime(mode);
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
  return {runtime, assembly, result, checks, evidenceRefs};
}

/**
 * Executes the first specialist method only as an internal shadow calculation. This is not the
 * live dispatcher: it accepts no provider, tool, tenant allowlist or external effect and returns
 * a draft artifact for evaluation. Releasing the same calculation to the organization that owns
 * the session is the separate mode below, and it requires the release to be open.
 */
export function executeReceivablesSpecialistShadow(input: SpecialistExecutionInput): ReceivablesSpecialistShadowResult {
  const {runtime, result, checks, evidenceRefs} = execute("internal_shadow", input);
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

/**
 * Releases the same deterministic result to the organization that owns the session. It runs only
 * when the manifest policy allows a customer-work exposure with no effect, the method carries its
 * recorded review and runs, and the database did not report the release paused. Under the universal
 * exposure no per-organization concession is consulted: every organization reads its own result.
 * The confirmed scope and the dataset hash travel with the result: a portfolio selection the
 * organization did not confirm can never enter a released analysis.
 */
export function releaseReceivablesSpecialistAnalysis(
  input: SpecialistExecutionInput & {organizationId: string; release: ReceivablesAnalyticalRelease},
): ReceivablesSpecialistReleaseResult {
  const {release} = input;
  if (!release.open) throw new Error("receivables_analytical_release_paused");
  if (!input.organizationId || release.organizationId !== input.organizationId) {
    throw new Error("receivables_analytical_release_tenant_mismatch");
  }
  if (!release.confirmedScope.id) throw new Error("receivables_analytical_release_scope_required");
  if (!sha256.test(release.confirmedScope.fingerprint) || !sha256.test(release.sourceDatasetHash)) {
    throw new Error("receivables_analytical_release_scope_required");
  }
  const {runtime, assembly, result, checks, evidenceRefs} = execute("analytical_release", input);
  if (assembly.source.datasetHash !== release.sourceDatasetHash) {
    throw new Error("receivables_analytical_release_dataset_mismatch");
  }
  return {
    mode: "analytical_release",
    taskId,
    executorKey,
    executorVersion: runtime.method.procedure.version,
    release: {
      organizationId: release.organizationId,
      procedure: {
        id: runtime.method.procedure.id,
        version: runtime.method.procedure.version,
        maturity: runtime.method.procedure.maturity,
      },
      methodMaturity: runtime.method.procedure.maturity,
      allowedUses: [...runtime.capability.allowedUses],
      maximumEffect: "none",
      confirmedScope: {id: release.confirmedScope.id, fingerprint: release.confirmedScope.fingerprint},
      sourceDatasetHash: release.sourceDatasetHash,
    },
    artifact: {
      artifactType: "receivables_pool_underwriting",
      schemaVersion: "method.underwrite-receivables-pool.v1",
      status: "released",
      inputFingerprint: result.trace.input_fingerprint,
      outputFingerprint: result.trace.output_fingerprint,
      content: result,
      evidenceRefs,
    },
    qualityResults: checks,
    externalEffectAllowed: false,
  };
}
