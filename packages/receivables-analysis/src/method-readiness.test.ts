import {describe, expect, it} from "vitest";

import type {ReceivablesPhaseOneInput} from "./phase-one";
import type {ReceivablesRawDetectionReport} from "./raw-detection";
import {
  assessReceivablesPoolMethodReadiness,
  receivablesPoolInputAssemblyVersion,
} from "./method-readiness";

const fileHash = "a".repeat(64);
const datasetHash = "b".repeat(64);

const phaseOne: ReceivablesPhaseOneInput = {
  datasetHash,
  universe: {
    id: "pool-2026-08",
    dates: {reportingDate: "2026-08-31", latestOriginationDate: "2026-08-01", dataStartDate: "2026-01-01", dataEndDate: "2026-08-31"},
    currency: "BRL",
    receivables: [{
      id: "source-title-1", externalId: "NF-1", currency: "BRL", faceValue: "1000.00", openValue: "800.00",
      issueDate: "2026-08-01", originalDueDate: "2026-09-01", currentDueDate: "2026-09-01",
      obligorId: "debtor-1", economicGroupId: "group-1", status: "open",
      source: {kind: "file", fileId: "tape-1", fileHash, sheet: "CARTEIRA", row: 2},
    }],
    settlements: [], dilutions: [], extensions: [], repurchases: [], assignmentsAndLiens: [],
    obligors: [{id: "debtor-1", legalName: "Sacado Um S.A.", economicGroupId: "group-1", relatedParty: false, source: {kind: "file", fileId: "tape-1", fileHash, sheet: "CARTEIRA", row: 2}}],
    economicGroups: [{id: "group-1", name: "Grupo Um", obligorIds: ["debtor-1"], source: {kind: "file", fileId: "tape-1", fileHash, sheet: "CARTEIRA", row: 2}}],
    eventCoverage: {
      settlements: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "settlement file", limitations: []},
      dilutions: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "dilution file", limitations: []},
      extensions: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "extension file", limitations: []},
      repurchases: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "repurchase file", limitations: []},
      assignmentsAndLiens: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "registry file", limitations: []},
    },
  },
};

const detection: ReceivablesRawDetectionReport = {
  version: "2026.08.28-v1",
  defects: [], questions: [], routeFacts: [],
  evidenceCoverage: {deliveredEvidenceIds: ["tape-1"], searchedEvidenceIds: ["tape-1"], complete: true, warnings: []},
};

const policy = {
  maxDaysPastDue: 30, maxRemainingTermDays: 180, minSeasoningDays: 0,
  requireAssignable: true, requireEvidenceVerified: true, registrationRule: "required" as const,
  excludeDisputed: true, excludeRelatedParties: true, excludeEncumbered: true, allowedDebtorSectors: [],
  maxSingleDebtorShare: "1", maxDebtorGroupShare: "1", minimumEligibleShare: "0.5",
  minimumEvidenceCoverage: "1", minimumRegistrationCoverage: "1", maximumDelinquency30Share: "0.1",
  maximumDilutionShare: "0.1", maximumRepurchaseShare: "0.1", minimumRecoveryRate: "0.2",
  maximumAccountingMismatchShare: "0.01", maximumCashMismatchShare: "0.01",
  minimumMappedCashShare: "0.95", minimumLinkedAccountCashShare: "0.95",
};

const methodInput = {
  currency: "BRL" as const,
  case: {
    schemaVersion: "2026.08.24-v1" as const,
    id: "pool-2026-08", referenceDate: "2026-08-31",
    cedent: {id: "cedent-1", legalName: "Cedente Um S.A.", servicingRole: "cedent" as const},
    portfolio: [{
      id: "method-title-1", debtorId: "debtor-1", debtorGroupId: "group-1", debtorSector: "varejo",
      originDate: "2026-08-01", dueDate: "2026-09-01", originalAmount: "1000.00", outstandingBalance: "800.00",
      paidAmount: "200.00", collectedInPeriod: "200.00", defaultedBalance: "0", recoveredInPeriod: "0",
      dilutionInPeriod: "0", repurchasedInPeriod: "0", substitutedInPeriod: "0", assignable: true,
      evidenceVerified: true, registration: "registered" as const, encumbrance: "free" as const,
      disputed: false, relatedParty: false, sourceDocumentId: "tape-1", sourceAnchor: "CARTEIRA!2", anchorVerified: true,
    }],
    cashReceipts: [{id: "receipt-1", receivedAt: "2026-08-20", amount: "200.00", receivableId: "method-title-1", debtorId: "debtor-1", linkedAccount: true, duplicateOf: null, sourceDocumentId: "bank-1", sourceAnchor: "EXTRATO!2", anchorVerified: true}],
    accounting: {grossReceivablesBalance: "800.00", allowanceBalance: "0", reportedCollectionsInPeriod: "200.00"},
    policy,
    structure: {
      requestedFacility: "500.00", advanceRate: "0.5", requiredOvercollateralization: "1.2", requiredSubordinationRate: "0.1",
      actualSeniorAmount: "500.00", actualMezzanineAmount: "0", actualSubordinatedAmount: "300.00", reserveRate: "0.02",
      waterfall: {availableCash: "200.00", servicingFeeDue: "5.00", seniorInterestDue: "10.00", seniorPrincipalDue: "100.00", reserveOpening: "10.00", mezzanineDue: "0"},
    },
  },
};

const evidence = Object.fromEntries([
  "cedentAndServicing", "titleLegalControls", "performanceHistory", "cashReconciliation",
  "accountingReconciliation", "eligibilityPolicy", "facilityAndWaterfall",
].map((key) => [key, [{sourceClass: key === "eligibilityPolicy" ? "house_method" : "provided_document", sourceId: `${key}-source`, anchor: `${key}:1`}]]));

const assembly = {
  schemaVersion: receivablesPoolInputAssemblyVersion,
  source: {universeId: "pool-2026-08", datasetHash, titleMapping: [{sourceReceivableId: "source-title-1", methodReceivableId: "method-title-1"}]},
  evidence,
  findingResolutions: [],
  input: methodInput,
};

describe("receivables specialist method readiness", () => {
  it("turns a real title universe without an assembly into explicit, actionable blockers", () => {
    const result = assessReceivablesPoolMethodReadiness({phaseOne, detection});
    expect(result.state).toBe("blocked");
    expect(result.primaryReason).toBe("needs_evidence");
    expect(result.methodExecutionAllowed).toBe(false);
    expect(result.validatedInput).toBeNull();
    expect(result.gaps.map((item) => item.code)).toEqual(expect.arrayContaining([
      "portfolio_lineage_not_assembled", "title_legal_controls_not_evidenced", "cash_reconciliation_not_evidenced",
      "eligibility_policy_not_governed", "facility_and_waterfall_not_governed",
    ]));
    expect(result.nextQuestions.every((item) => item.text.pt.length > 20)).toBe(true);
  });

  it("does not treat absent event histories as zero", () => {
    const incomplete = structuredClone(phaseOne);
    incomplete.universe.eventCoverage.dilutions.status = "not_provided";
    const result = assessReceivablesPoolMethodReadiness({phaseOne: incomplete, detection});
    expect(result.gaps.find((item) => item.code === "performance_history_incomplete")?.message.pt).toContain("não será tratada como zero");
  });

  it("allows execution only after a fully evidenced, one-to-one assembly reconciles", () => {
    const result = assessReceivablesPoolMethodReadiness({phaseOne, detection, assembly});
    expect(result).toMatchObject({state: "ready", primaryReason: "ready", methodExecutionAllowed: true, gaps: []});
    expect(result.validatedInput).toEqual(methodInput);
    expect(result.dimensions.every((item) => item.state === "satisfied")).toBe(true);
  });

  it.each(["missing", "invalid", "overlaps_cutoff"] as const)("blocks a complete assembly with %s supporting periods", (qualification) => {
    const result = assessReceivablesPoolMethodReadiness({phaseOne, assembly, detection: {
      ...detection, supportPeriodAssessment: {
        schemaVersion: "receivables-support-periods.v1", dateComparisonPolicy: "source_local_calendar_date",
        reportingDate: "2026-08-31", entries: [{id: "ledger:2", detectorId: "accounting_reconciliation_difference",
          sourceId: "ledger", sourceLabel: "ledger.xlsx", sourceHash: fileHash,
          anchor: {kind: "file", fileId: "ledger", fileHash}, dateKind: "event_date",
          rawDate: null, startDate: null, endDate: null, qualification}],
      },
    }});
    expect(result.methodExecutionAllowed).toBe(false);
    expect(result.validatedInput).toBeNull();
    expect(result.gaps).toContainEqual(expect.objectContaining({code: "support_period:accounting_reconciliation_difference", blocking: true}));
  });

  it("fails closed when a mapped title changes economics", () => {
    const changed = structuredClone(assembly);
    changed.input.case.portfolio[0]!.outstandingBalance = "799.99";
    const result = assessReceivablesPoolMethodReadiness({phaseOne, detection, assembly: changed});
    expect(result).toMatchObject({state: "blocked", primaryReason: "conflicting", methodExecutionAllowed: false});
    expect(result.gaps.map((item) => item.code)).toContain("mapped_title_economics_mismatch");
  });

  it("does not execute while a detected finding lacks an evidenced disposition", () => {
    const detectedFinding = {
      id: "prior-lien",
      description: "Há indício de cessão anterior.",
      evidence: [{
        kind: "measured", datasetHash, anchors: [{kind: "file", fileId: "registry-1", fileHash}],
        universe: "pool-2026-08", reportingDate: "2026-08-31", inclusions: ["registry"], exclusions: [],
        formula: {id: "prior_lien", version: "1"},
      }],
    } satisfies ReceivablesRawDetectionReport["defects"][number];
    const withFinding: ReceivablesRawDetectionReport = {...detection, defects: [detectedFinding]};
    const result = assessReceivablesPoolMethodReadiness({phaseOne, detection: withFinding, assembly});
    expect(result).toMatchObject({state: "blocked", primaryReason: "conflicting", methodExecutionAllowed: false});
    expect(result.gaps).toEqual(expect.arrayContaining([expect.objectContaining({
      code: "finding_unresolved:prior-lien", evidenceIds: ["registry-1"],
    })]));
  });
});
