import {describe, expect, it} from "vitest";
import {
  diversifiedReceivablesCase,
  receivablesPoolInputAssemblyVersion,
  type ReceivablesPhaseOneInput,
  type ReceivablesRawDetectionReport,
} from "@offroad/receivables-analysis";

import {executeReceivablesSpecialistShadow, specialistCandidateExecutorRuntimeManifest} from "./specialist-method-runtime";

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
