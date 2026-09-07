import {
  applyReceivablesSupplementPatch,
  newReceivablesSupplementDraft,
  receivablesSupplementPatchVersion,
  type ReceivablesPhaseOneInput,
} from "@offroad/receivables-analysis";
import {describe, expect, it} from "vitest";

import {resolveReceivablesMethodInput} from "./receivables-method-input-resolution";

const datasetHash = "b".repeat(64);
const fileHash = "a".repeat(64);
const source = (id: string) => ({sourceClass: "provided_document" as const, sourceId: id, anchor: "row:1"});
const phaseOne: ReceivablesPhaseOneInput = {
  datasetHash,
  universe: {
    id: "pool-1", currency: "BRL",
    dates: {reportingDate: "2026-08-31", latestOriginationDate: "2026-08-01", dataStartDate: "2026-01-01", dataEndDate: "2026-08-31"},
    receivables: [{id: "title-1", currency: "BRL", faceValue: "1000", openValue: "800", issueDate: "2026-08-01", originalDueDate: "2026-09-30", currentDueDate: "2026-09-30", obligorId: "debtor-1", status: "open", source: {kind: "file", fileId: "tape-1", fileHash, sheet: "CARTEIRA", row: 2}}],
    settlements: [{id: "settlement-1", receivableId: "title-1", date: "2026-08-20", amount: "200", source: {kind: "file", fileId: "cash-1", fileHash, sheet: "BAIXAS", row: 2}}],
    dilutions: [], extensions: [], repurchases: [], assignmentsAndLiens: [],
    obligors: [{id: "debtor-1", legalName: "Debtor One", relatedParty: false, source: {kind: "file", fileId: "tape-1", fileHash, sheet: "CARTEIRA", row: 2}}],
    economicGroups: [],
    eventCoverage: {
      settlements: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "settlements", limitations: []},
      dilutions: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "dilutions", limitations: []},
      extensions: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "extensions", limitations: []},
      repurchases: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "repurchases", limitations: []},
      assignmentsAndLiens: {status: "complete", startDate: "2026-01-01", endDate: "2026-08-31", basis: "assignmentsAndLiens", limitations: []},
    },
  },
};
const evidence = {
  cedentAndServicing: [source("cedent")], titleLegalControls: [source("title")],
  performanceHistory: [source("performance")], cashReconciliation: [source("cash")],
  accountingReconciliation: [source("accounting")],
  eligibilityPolicy: [{sourceClass: "house_method" as const, sourceId: "R01", anchor: "policy:1"}],
  facilityAndWaterfall: [{sourceClass: "user_confirmation" as const, sourceId: "answer-1", anchor: "message:1"}],
};

function completeDraft() {
  return applyReceivablesSupplementPatch({
    draft: newReceivablesSupplementDraft(datasetHash),
    patch: {
      schemaVersion: receivablesSupplementPatchVersion, patchId: "patch-1", sourceDatasetHash: datasetHash,
      suppliedBy: {actorType: "document_worker", actorId: "worker-1", suppliedAt: "2026-09-07T00:00:00.000Z", evidence: [source("patch-1")]},
      sections: {
        cedent: {value: {id: "cedent-1", legalName: "Cedent One", servicingRole: "cedent"}},
        titles: {value: [{sourceReceivableId: "title-1", debtorSector: "retail", collectedInPeriod: "200", defaultedBalance: "0", recoveredInPeriod: "0", dilutionInPeriod: "0", repurchasedInPeriod: "0", substitutedInPeriod: "0", assignable: true, evidenceVerified: true, registration: "registered", encumbrance: "free", disputed: false, relatedParty: false}]},
        cashReceipts: {value: [{id: "cash-1", receivedAt: "2026-08-20", amount: "200", sourceReceivableId: "title-1", debtorId: "debtor-1", linkedAccount: true, duplicateOf: null, sourceDocumentId: "cash-1", sourceAnchor: "row:2", anchorVerified: true}]},
        accounting: {value: {grossReceivablesBalance: "800", allowanceBalance: "0", reportedCollectionsInPeriod: "200"}},
        policy: {value: {maxDaysPastDue: 30, maxRemainingTermDays: 180, minSeasoningDays: 0, requireAssignable: true, requireEvidenceVerified: true, registrationRule: "required", excludeDisputed: true, excludeRelatedParties: true, excludeEncumbered: true, allowedDebtorSectors: [], maxSingleDebtorShare: "1", maxDebtorGroupShare: "1", minimumEligibleShare: "0.5", minimumEvidenceCoverage: "1", minimumRegistrationCoverage: "1", maximumDelinquency30Share: "0.1", maximumDilutionShare: "0.1", maximumRepurchaseShare: "0.1", minimumRecoveryRate: "0.2", maximumAccountingMismatchShare: "0.01", maximumCashMismatchShare: "0.01", minimumMappedCashShare: "0.95", minimumLinkedAccountCashShare: "0.95"}},
        structure: {value: {requestedFacility: "500", advanceRate: "0.5", requiredOvercollateralization: "1.2", requiredSubordinationRate: "0.1", actualSeniorAmount: "500", actualMezzanineAmount: "0", actualSubordinatedAmount: "300", reserveRate: "0.02", waterfall: {availableCash: "200", servicingFeeDue: "5", seniorInterestDue: "10", seniorPrincipalDue: "100", reserveOpening: "10", mezzanineDue: "0"}}},
      },
      evidence,
    },
  });
}

describe("receivables specialist input resolution", () => {
  it("compiles a complete governed draft without changing source economics", () => {
    const result = resolveReceivablesMethodInput({phaseOne, supplementDraft: completeDraft()});
    expect(result).toMatchObject({origin: "compiled_draft", draftState: "complete"});
    expect(result.assembly?.input.case.portfolio[0]).toMatchObject({originalAmount: "1000", outstandingBalance: "800", paidAmount: "200.00"});
  });

  it("does not execute an incomplete or stale draft", () => {
    expect(resolveReceivablesMethodInput({phaseOne, supplementDraft: newReceivablesSupplementDraft(datasetHash)})).toMatchObject({assembly: null, draftState: "incomplete"});
    expect(resolveReceivablesMethodInput({phaseOne, supplementDraft: newReceivablesSupplementDraft("c".repeat(64))})).toMatchObject({assembly: null, draftState: "stale"});
  });
});
