import {describe, expect, it} from "vitest";
import {
  diversifiedReceivablesCase,
  receivablesPoolInputAssemblyVersion,
  type ReceivablesPhaseOneInput,
  type ReceivablesRawDetectionReport,
} from "@offroad/receivables-analysis";

import {
  evaluateReceivablesSpecialistPolicy,
  executeReceivablesSpecialistShadow,
  releaseReceivablesSpecialistAnalysis,
  specialistCandidateExecutorRuntimeManifest,
} from "./specialist-method-runtime";

const datasetHash = "c".repeat(64);
const sourceFileHash = "d".repeat(64);
const caseInput = diversifiedReceivablesCase("shadow-pool");
const iso = (value: string) => value as `${number}-${number}-${number}`;

const phaseOne: ReceivablesPhaseOneInput = {
  datasetHash,
  universe: {
    id: "shadow-source-pool",
    dates: {
      reportingDate: iso(caseInput.referenceDate),
      latestOriginationDate: iso(caseInput.portfolio.map((item) => item.originDate).sort().at(-1)!),
      dataStartDate: iso(caseInput.portfolio.map((item) => item.originDate).sort()[0]!),
      dataEndDate: iso(caseInput.referenceDate),
    },
    currency: "BRL",
    receivables: caseInput.portfolio.map((item) => ({
      id: `source:${item.id}`,
      currency: "BRL",
      faceValue: item.originalAmount,
      openValue: item.outstandingBalance,
      issueDate: iso(item.originDate),
      originalDueDate: iso(item.dueDate),
      currentDueDate: iso(item.dueDate),
      obligorId: item.debtorId,
      ...(item.debtorGroupId ? {economicGroupId: item.debtorGroupId} : {}),
      status: "open" as const,
      source: {kind: "file" as const, fileId: item.sourceDocumentId, fileHash: sourceFileHash},
    })),
    settlements: [], dilutions: [], extensions: [], repurchases: [], assignmentsAndLiens: [],
    obligors: [...new Map(caseInput.portfolio.map((item) => [item.debtorId, {
      id: item.debtorId, legalName: item.debtorId,
      ...(item.debtorGroupId ? {economicGroupId: item.debtorGroupId} : {}),
      relatedParty: item.relatedParty,
      source: {kind: "file" as const, fileId: item.sourceDocumentId, fileHash: sourceFileHash},
    }])).values()],
    economicGroups: [],
    eventCoverage: {
      settlements: {status: "complete", startDate: iso(caseInput.referenceDate), endDate: iso(caseInput.referenceDate), basis: "settlements fixture", limitations: []},
      dilutions: {status: "complete", startDate: iso(caseInput.referenceDate), endDate: iso(caseInput.referenceDate), basis: "dilutions fixture", limitations: []},
      extensions: {status: "complete", startDate: iso(caseInput.referenceDate), endDate: iso(caseInput.referenceDate), basis: "extensions fixture", limitations: []},
      repurchases: {status: "complete", startDate: iso(caseInput.referenceDate), endDate: iso(caseInput.referenceDate), basis: "repurchases fixture", limitations: []},
      assignmentsAndLiens: {status: "complete", startDate: iso(caseInput.referenceDate), endDate: iso(caseInput.referenceDate), basis: "assignments fixture", limitations: []},
    },
  },
};

const detection: ReceivablesRawDetectionReport = {
  version: "2026.08.28-v1", defects: [], questions: [], routeFacts: [],
  evidenceCoverage: {deliveredEvidenceIds: ["tape"], searchedEvidenceIds: ["tape"], complete: true, warnings: []},
};

const evidence = Object.fromEntries([
  "cedentAndServicing", "titleLegalControls", "performanceHistory", "cashReconciliation",
  "accountingReconciliation", "eligibilityPolicy", "facilityAndWaterfall",
].map((section) => [section, [{sourceClass: section === "eligibilityPolicy" ? "house_method" : "provided_document", sourceId: `${section}-source`, anchor: `${section}:1`}]]));

const assembly = {
  schemaVersion: receivablesPoolInputAssemblyVersion,
  source: {
    universeId: phaseOne.universe.id,
    datasetHash,
    titleMapping: caseInput.portfolio.map((item) => ({sourceReceivableId: `source:${item.id}`, methodReceivableId: item.id})),
  },
  evidence,
  findingResolutions: [],
  input: {currency: "BRL", case: caseInput},
};

describe("specialist method shadow runtime", () => {
  it("publishes the exact bundled export identity to the candidate dispatcher", () => {
    expect(specialistCandidateExecutorRuntimeManifest).toEqual([{
      taskId: "R01",
      executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool",
      executorVersion: "2026.09.06-v1",
      procedure: {id: "underwrite-receivables-pool", version: "2026.09.06-v1"},
      resultContract: "method.underwrite-receivables-pool.v1",
    }]);
  });

  it("executes the exact bound method and returns a traced draft with passing quality checks", () => {
    const result = executeReceivablesSpecialistShadow({
      taskId: "R01",
      executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool",
      executorVersion: "2026.09.06-v1",
      phaseOne,
      detection,
      assembly,
    });
    expect(result).toMatchObject({
      mode: "internal_shadow",
      taskId: "R01",
      externalEffectAllowed: false,
      artifact: {artifactType: "receivables_pool_underwriting", status: "draft"},
    });
    expect(result.qualityResults.every((check) => check.status === "passed")).toBe(true);
    expect(result.artifact.outputFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.artifact.evidenceRefs).toHaveLength(7);
    // Evidence references alone do not establish measured longitudinal performance.
    expect(result.artifact.content.history_coverage).toMatchObject({
      aggregatePerformanceBasis: "reported_title_aggregates",
      families: expect.arrayContaining([
        expect.objectContaining({id: "roll_rates", status: "not_evaluable"}),
        expect.objectContaining({id: "vintages", status: "not_evaluable"}),
      ]),
    });
    expect(result.artifact.content.economic_conventions?.concentrationDenominator).toBe("preliminary_eligible_balance");
  });

  it("refuses an executor that differs from the governed method binding", () => {
    expect(() => executeReceivablesSpecialistShadow({
      taskId: "R01", executorKey: "other#method", executorVersion: "2026.09.06-v1",
      phaseOne, detection, assembly,
    })).toThrow("specialist_executor_binding_mismatch");
  });

  it("refuses execution when one source title no longer reconciles", () => {
    const changed = structuredClone(assembly);
    changed.input.case.portfolio[0]!.outstandingBalance = "1.00";
    expect(() => executeReceivablesSpecialistShadow({
      taskId: "R01", executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool", executorVersion: "2026.09.06-v1",
      phaseOne, detection, assembly: changed,
    })).toThrow("specialist_method_input_not_ready:conflicting:mapped_title_economics_mismatch");
  });

  it("does not support a catalogue task without a registered runtime", () => {
    expect(() => executeReceivablesSpecialistShadow({
      taskId: "D06", executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool", executorVersion: "2026.09.06-v1",
      phaseOne, detection, assembly,
    })).toThrow("specialist_task_not_supported");
  });
});

const organizationId = "11111111-1111-4111-8111-111111111111";
const confirmedScope = {id: "22222222-2222-4222-8222-222222222222", fingerprint: "e".repeat(64)};
const release = {open: true, organizationId, confirmedScope, sourceDatasetHash: datasetHash};
const releaseInput = {
  taskId: "R01",
  executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool",
  executorVersion: "2026.09.06-v1",
  phaseOne, detection, assembly, organizationId, release,
};
/** The bundled production policy after the founder's approval of 10 September 2026. */
const bundledMethod = {
  executor: {module: "@offroad/receivables-analysis", exportName: "underwriteReceivablesPool"},
  procedure: {id: "underwrite-receivables-pool", version: "2026.09.06-v1", maturity: "production"},
};
const bundledCapability = {
  executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool",
  executorVersion: "2026.09.06-v1",
  procedure: {id: "underwrite-receivables-pool", version: "2026.09.06-v1"},
  availability: "live", exposure: "universal",
  allowedUses: ["internal_validation", "customer_work"], maximumEffect: "none",
};
/** The allowlisted shadow policy the method carried before the promotion; still admitted. */
const previousCapability = {...bundledCapability, availability: "shadow", exposure: "allowlisted"};
const previousMethod = {...bundledMethod, procedure: {...bundledMethod.procedure, maturity: "tested"}};

describe("released analytical result for every organization", () => {
  it("releases the same deterministic calculation, bound to the confirmed scope and its dataset", () => {
    const shadow = executeReceivablesSpecialistShadow({
      taskId: "R01", executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool",
      executorVersion: "2026.09.06-v1", phaseOne, detection, assembly,
    });
    const released = releaseReceivablesSpecialistAnalysis(releaseInput);
    expect(released).toMatchObject({
      mode: "analytical_release",
      taskId: "R01",
      externalEffectAllowed: false,
      release: {
        organizationId,
        methodMaturity: "production",
        maximumEffect: "none",
        confirmedScope,
        sourceDatasetHash: datasetHash,
      },
      artifact: {artifactType: "receivables_pool_underwriting", status: "released"},
    });
    // A released result is the internally validated one, never a second calculation.
    expect(released.artifact.outputFingerprint).toBe(shadow.artifact.outputFingerprint);
    expect(released.artifact.inputFingerprint).toBe(shadow.artifact.inputFingerprint);
    expect(released.release.allowedUses).not.toContain("external_material");
    expect(released.release.allowedUses).not.toContain("external_action");
    expect(released.artifact.content.history_coverage?.aggregatePerformanceBasis).toBe("reported_title_aggregates");
  });

  it("releases for an organization that holds no concession of its own", () => {
    // Universal exposure: no allowlist, no per-organization row, no operator step in between.
    const released = releaseReceivablesSpecialistAnalysis({
      ...releaseInput,
      organizationId: "44444444-4444-4444-8444-444444444444",
      release: {...release, organizationId: "44444444-4444-4444-8444-444444444444"},
    });
    expect(released.release.organizationId).toBe("44444444-4444-4444-8444-444444444444");
    expect(released.release.methodMaturity).toBe("production");
    expect(released.externalEffectAllowed).toBe(false);
  });

  it("refuses to release while an operator has the release paused", () => {
    expect(() => releaseReceivablesSpecialistAnalysis({...releaseInput, release: {...release, open: false}}))
      .toThrow("receivables_analytical_release_paused");
  });

  it("refuses a release resolved for another organization", () => {
    expect(() => releaseReceivablesSpecialistAnalysis({...releaseInput, release: {...release, organizationId: "33333333-3333-4333-8333-333333333333"}}))
      .toThrow("receivables_analytical_release_tenant_mismatch");
    expect(() => releaseReceivablesSpecialistAnalysis({...releaseInput, organizationId: ""}))
      .toThrow("receivables_analytical_release_tenant_mismatch");
  });

  it("refuses a portfolio selection the organization did not confirm", () => {
    // A different sheet or document selection produces a different dataset hash; the confirmed
    // scope travels with the grant, so the unconfirmed dataset can never be released.
    expect(() => releaseReceivablesSpecialistAnalysis({...releaseInput, release: {...release, sourceDatasetHash: "f".repeat(64)}}))
      .toThrow("receivables_analytical_release_dataset_mismatch");
    expect(() => releaseReceivablesSpecialistAnalysis({...releaseInput, release: {...release, confirmedScope: {id: "", fingerprint: confirmedScope.fingerprint}}}))
      .toThrow("receivables_analytical_release_scope_required");
    expect(() => releaseReceivablesSpecialistAnalysis({...releaseInput, release: {...release, confirmedScope: {id: confirmedScope.id, fingerprint: "not-a-fingerprint"}}}))
      .toThrow("receivables_analytical_release_scope_required");
  });

  it("admits the bundled policy and refuses every policy that is not the released one", () => {
    expect(evaluateReceivablesSpecialistPolicy("internal_shadow", bundledMethod, bundledCapability)).toBeNull();
    expect(evaluateReceivablesSpecialistPolicy("analytical_release", bundledMethod, bundledCapability)).toBeNull();
    // The allowlisted shadow policy the method carried before the promotion is still admitted.
    expect(evaluateReceivablesSpecialistPolicy("internal_shadow", previousMethod, previousCapability)).toBeNull();
    expect(evaluateReceivablesSpecialistPolicy("analytical_release", previousMethod, previousCapability)).toBeNull();
    expect(evaluateReceivablesSpecialistPolicy("analytical_release", bundledMethod, {...bundledCapability, exposure: "internal"}))
      .toBe("receivables_specialist_release_policy_mismatch");
    expect(evaluateReceivablesSpecialistPolicy("analytical_release", bundledMethod, {...bundledCapability, allowedUses: ["internal_validation"]}))
      .toBe("receivables_specialist_release_policy_mismatch");
    expect(evaluateReceivablesSpecialistPolicy("analytical_release", {...bundledMethod, procedure: {...bundledMethod.procedure, maturity: "implemented"}}, bundledCapability))
      .toBe("receivables_specialist_release_policy_mismatch");
    // Universal exposure buys reach, never an effect: every external door stays shut.
    expect(evaluateReceivablesSpecialistPolicy("analytical_release", bundledMethod, {...bundledCapability, maximumEffect: "propose_state"}))
      .toBe("receivables_specialist_shadow_policy_mismatch");
    expect(evaluateReceivablesSpecialistPolicy("analytical_release", bundledMethod, {...bundledCapability, maximumEffect: "external"}))
      .toBe("receivables_specialist_shadow_policy_mismatch");
    expect(evaluateReceivablesSpecialistPolicy("analytical_release", bundledMethod, {...bundledCapability, allowedUses: ["internal_validation", "customer_work", "external_action"]}))
      .toBe("receivables_specialist_shadow_policy_mismatch");
    expect(evaluateReceivablesSpecialistPolicy("analytical_release", bundledMethod, {...bundledCapability, allowedUses: ["internal_validation", "customer_work", "external_material"]}))
      .toBe("receivables_specialist_shadow_policy_mismatch");
    expect(evaluateReceivablesSpecialistPolicy("analytical_release", bundledMethod, {...bundledCapability, exposure: "none"}))
      .toBe("receivables_specialist_shadow_policy_mismatch");
    expect(evaluateReceivablesSpecialistPolicy("analytical_release", bundledMethod, {...bundledCapability, availability: "mocked"}))
      .toBe("receivables_specialist_shadow_policy_mismatch");
    expect(evaluateReceivablesSpecialistPolicy("analytical_release", bundledMethod, {...bundledCapability, availability: "specified"}))
      .toBe("receivables_specialist_shadow_policy_mismatch");
  });
});
