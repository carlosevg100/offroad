import {describe, expect, it} from "vitest";

import type {ReceivablesPhaseOneInput} from "./phase-one";
import {assembleReceivablesPoolMethodInput, receivablesPoolInputSupplementVersion} from "./method-assembly";
import {assessReceivablesPoolMethodReadiness} from "./method-readiness";
import type {ReceivablesRawDetectionReport} from "./raw-detection";

const fileHash = "a".repeat(64);
const datasetHash = "b".repeat(64);
const phaseOne: ReceivablesPhaseOneInput = {
  datasetHash,
  universe: {
    id: "aurora-pool", currency: "BRL",
    dates: {reportingDate: "2026-08-31", latestOriginationDate: "2026-08-01", dataStartDate: "2026-01-01", dataEndDate: "2026-08-31"},
    receivables: [{id: "nf:1", currency: "BRL", faceValue: "1000.00", openValue: "800.00", issueDate: "2026-08-01", originalDueDate: "2026-09-15", currentDueDate: "2026-09-15", obligorId: "sacado-1", economicGroupId: "grupo-1", status: "open", source: {kind: "file", fileId: "tape-1", fileHash, sheet: "CARTEIRA", row: 2}}],
    settlements: [{id: "settlement-1", receivableId: "nf:1", date: "2026-08-20", amount: "200.00", source: {kind: "file", fileId: "settlement-1", fileHash, sheet: "BAIXAS", row: 2}}],
    dilutions: [], extensions: [], repurchases: [], assignmentsAndLiens: [],
    obligors: [{id: "sacado-1", legalName: "Sacado Um S.A.", economicGroupId: "grupo-1", relatedParty: false, source: {kind: "file", fileId: "tape-1", fileHash, sheet: "CARTEIRA", row: 2}}],
    economicGroups: [{id: "grupo-1", name: "Grupo Um", obligorIds: ["sacado-1"], source: {kind: "file", fileId: "tape-1", fileHash, sheet: "CARTEIRA", row: 2}}],
    eventCoverage: {
      settlements: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "baixas", limitations: []},
      dilutions: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "diluições", limitations: []},
      extensions: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "prorrogações", limitations: []},
      repurchases: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "recompras", limitations: []},
      assignmentsAndLiens: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "registro", limitations: []},
    },
  },
};

const policy = {
  maxDaysPastDue: 30, maxRemainingTermDays: 180, minSeasoningDays: 0,
  requireAssignable: true, requireEvidenceVerified: true, registrationRule: "required" as const,
  excludeDisputed: true, excludeRelatedParties: true, excludeEncumbered: true, allowedDebtorSectors: [],
  maxSingleDebtorShare: "1", maxDebtorGroupShare: "1", minimumEligibleShare: "0.5", minimumEvidenceCoverage: "1",
  minimumRegistrationCoverage: "1", maximumDelinquency30Share: "0.1", maximumDilutionShare: "0.1",
  maximumRepurchaseShare: "0.1", minimumRecoveryRate: "0.2", maximumAccountingMismatchShare: "0.01",
  maximumCashMismatchShare: "0.01", minimumMappedCashShare: "0.95", minimumLinkedAccountCashShare: "0.95",
};
const evidence = Object.fromEntries([
  "cedentAndServicing", "titleLegalControls", "performanceHistory", "cashReconciliation",
  "accountingReconciliation", "eligibilityPolicy", "facilityAndWaterfall",
].map((section) => [section, [{sourceClass: section === "eligibilityPolicy" ? "house_method" : "provided_document", sourceId: `${section}-source`, anchor: `${section}:1`}]]));
const supplement = {
  schemaVersion: receivablesPoolInputSupplementVersion,
  sourceDatasetHash: datasetHash,
  cedent: {id: "aurora", legalName: "Aurora S.A.", servicingRole: "cedent" as const},
  titles: [{sourceReceivableId: "nf:1", debtorSector: "varejo", collectedInPeriod: "200.00", defaultedBalance: "0", recoveredInPeriod: "0", dilutionInPeriod: "0", repurchasedInPeriod: "0", substitutedInPeriod: "0", assignable: true, evidenceVerified: true, registration: "registered" as const, encumbrance: "free" as const, disputed: false, relatedParty: false}],
  cashReceipts: [{id: "cash-1", receivedAt: "2026-08-20", amount: "200.00", sourceReceivableId: "nf:1", debtorId: "sacado-1", linkedAccount: true, duplicateOf: null, sourceDocumentId: "bank-1", sourceAnchor: "EXTRATO!2", anchorVerified: true}],
  accounting: {grossReceivablesBalance: "800.00", allowanceBalance: "0", reportedCollectionsInPeriod: "200.00"},
  policy,
  structure: {requestedFacility: "500.00", advanceRate: "0.5", requiredOvercollateralization: "1.2", requiredSubordinationRate: "0.1", actualSeniorAmount: "500.00", actualMezzanineAmount: "0", actualSubordinatedAmount: "300.00", reserveRate: "0.02", waterfall: {availableCash: "200.00", servicingFeeDue: "5.00", seniorInterestDue: "10.00", seniorPrincipalDue: "100.00", reserveOpening: "10.00", mezzanineDue: "0"}},
  evidence,
  findingResolutions: [],
};
const detection: ReceivablesRawDetectionReport = {version: "2026.08.28-v1", defects: [], questions: [], routeFacts: [], evidenceCoverage: {deliveredEvidenceIds: ["tape-1"], searchedEvidenceIds: ["tape-1"], complete: true, warnings: []}};

describe("receivables method input compiler", () => {
  it("maps production source locators to valid stable method IDs without truncating provenance", () => {
    const sourceIds = [
      "10000000-0000-4000-8000-000000000001:pool:20000000-0000-4000-8000-000000000001:CARTEIRA:1",
      `10000000-0000-4000-8000-000000000001:pool:20000000-0000-4000-8000-000000000001:${encodeURIComponent("Carteira São João ".repeat(20))}:1`,
      "same:pool/a", "same:pool?a",
    ];
    const outputs = sourceIds.map((id) => assembleReceivablesPoolMethodInput({phaseOne: {...phaseOne, universe: {...phaseOne.universe, id}}, supplement}));
    expect(new Set(outputs.map((assembly) => assembly.input.case.id)).size).toBe(sourceIds.length);
    for (const [index, assembly] of outputs.entries()) {
      expect(assembly.input.case.id).toMatch(/^r01-[a-f0-9]{64}$/);
      expect(assembly.source.universeId).toBe(sourceIds[index]);
      expect(assembleReceivablesPoolMethodInput({phaseOne: {...phaseOne, universe: {...phaseOne.universe, id: sourceIds[index]!}}, supplement})).toEqual(assembly);
    }
    expect(assembleReceivablesPoolMethodInput({phaseOne, supplement}).input.case.id).toBe("aurora-pool");
  });

  it("preserves source economics and compiles only explicitly supplied judgements", () => {
    const assembly = assembleReceivablesPoolMethodInput({phaseOne, supplement});
    const title = assembly.input.case.portfolio[0]!;
    expect(title).toMatchObject({originalAmount: "1000.00", outstandingBalance: "800.00", paidAmount: "200.00", debtorId: "sacado-1", registration: "registered"});
    expect(title.id).toMatch(/^r-[a-f0-9]{24}$/);
    expect(title.sourceDocumentId).toBe("tape-1");
    expect(title.sourceAnchor).toBe("sheet:CARTEIRA;row:2");
    expect(assembly.source.titleMapping).toEqual([{sourceReceivableId: "nf:1", methodReceivableId: title.id}]);
    expect(assessReceivablesPoolMethodReadiness({phaseOne, detection, assembly})).toMatchObject({state: "ready", methodExecutionAllowed: true});
  });

  it("rejects a supplement from another immutable dataset", () => {
    expect(() => assembleReceivablesPoolMethodInput({phaseOne, supplement: {...supplement, sourceDatasetHash: "c".repeat(64)}})).toThrow("receivables_supplement_dataset_mismatch");
  });

  it("rejects missing or extra title judgements instead of defaulting them", () => {
    expect(() => assembleReceivablesPoolMethodInput({phaseOne, supplement: {...supplement, titles: []}})).toThrow();
    expect(() => assembleReceivablesPoolMethodInput({phaseOne, supplement: {...supplement, titles: [...supplement.titles, {...supplement.titles[0]!, sourceReceivableId: "unknown"}]}})).toThrow("receivables_supplement_title_partition_invalid");
  });

  it("rejects cash linked to a title outside the source universe", () => {
    const changed = structuredClone(supplement);
    changed.cashReceipts[0]!.sourceReceivableId = "unknown";
    expect(() => assembleReceivablesPoolMethodInput({phaseOne, supplement: changed})).toThrow("receivables_cash_link_not_in_source");
  });
});
