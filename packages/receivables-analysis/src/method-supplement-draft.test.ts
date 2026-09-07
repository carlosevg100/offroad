import {describe, expect, it} from "vitest";

import {
  applyReceivablesSupplementPatch,
  compileReceivablesSupplementDraft,
  newReceivablesSupplementDraft,
  receivablesSupplementPatchVersion,
} from "./method-supplement-draft";

const datasetHash = "a".repeat(64);
const source = (id: string) => ({sourceClass: "provided_document" as const, sourceId: id, anchor: "page:1"});
const evidence = {
  cedentAndServicing: [source("cedent")],
  titleLegalControls: [source("title")],
  performanceHistory: [source("performance")],
  cashReconciliation: [source("cash")],
  accountingReconciliation: [source("accounting")],
  eligibilityPolicy: [{sourceClass: "house_method" as const, sourceId: "policy", anchor: "method:R01"}],
  facilityAndWaterfall: [{sourceClass: "user_confirmation" as const, sourceId: "answer-1", anchor: "message:1"}],
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
const sections = {
  cedent: {value: {id: "cedent-1", legalName: "Cedente S.A.", servicingRole: "cedent" as const}},
  titles: {value: [{
    sourceReceivableId: "title-1", debtorSector: "varejo", collectedInPeriod: "100", defaultedBalance: "0",
    recoveredInPeriod: "0", dilutionInPeriod: "0", repurchasedInPeriod: "0", substitutedInPeriod: "0",
    assignable: true, evidenceVerified: true, registration: "registered" as const, encumbrance: "free" as const,
    disputed: false, relatedParty: false,
  }]},
  cashReceipts: {value: [{
    id: "cash-1", receivedAt: "2026-08-31", amount: "100", sourceReceivableId: "title-1",
    debtorId: "debtor-1", linkedAccount: true, duplicateOf: null, sourceDocumentId: "bank-1",
    sourceAnchor: "row:2", anchorVerified: true,
  }]},
  accounting: {value: {grossReceivablesBalance: "900", allowanceBalance: "0", reportedCollectionsInPeriod: "100"}},
  policy: {value: policy},
  structure: {value: {
    requestedFacility: "500", advanceRate: "0.5", requiredOvercollateralization: "1.2",
    requiredSubordinationRate: "0.1", actualSeniorAmount: "500", actualMezzanineAmount: "0",
    actualSubordinatedAmount: "400", reserveRate: "0.02",
    waterfall: {availableCash: "100", servicingFeeDue: "5", seniorInterestDue: "10", seniorPrincipalDue: "50", reserveOpening: "10", mezzanineDue: "0"},
  }},
};

function patch(id: string, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: receivablesSupplementPatchVersion,
    patchId: id,
    sourceDatasetHash: datasetHash,
    suppliedBy: {actorType: "document_worker" as const, actorId: "worker-1", suppliedAt: "2026-09-07T00:00:00.000Z", evidence: [source(id)]},
    sections,
    evidence,
    ...overrides,
  };
}

describe("governed receivables supplement draft", () => {
  it("accumulates a complete, evidenced supplement without inventing absent sections", () => {
    const draft = applyReceivablesSupplementPatch({draft: newReceivablesSupplementDraft(datasetHash), patch: patch("p1")});
    const compiled = compileReceivablesSupplementDraft(draft);
    expect(compiled).toMatchObject({state: "complete", missingSections: [], openConflictIds: []});
    expect(compiled.supplement).toMatchObject({sourceDatasetHash: datasetHash, cedent: {legalName: "Cedente S.A."}});
  });

  it("is idempotent for a replayed patch", () => {
    const first = applyReceivablesSupplementPatch({draft: newReceivablesSupplementDraft(datasetHash), patch: patch("p1")});
    const replay = applyReceivablesSupplementPatch({draft: first, patch: patch("p1")});
    expect(replay).toEqual(first);
  });

  it("opens a conflict instead of silently replacing a changed premise", () => {
    const first = applyReceivablesSupplementPatch({draft: newReceivablesSupplementDraft(datasetHash), patch: patch("p1")});
    const changed = patch("p2", {
      sections: {structure: {value: {...sections.structure.value, requestedFacility: "700"}}},
      evidence: {facilityAndWaterfall: evidence.facilityAndWaterfall},
    });
    const conflicted = applyReceivablesSupplementPatch({draft: first, patch: changed});
    expect(compileReceivablesSupplementDraft(conflicted).state).toBe("conflicted");
    expect(conflicted.sections.structure?.value).toEqual(sections.structure.value);
    expect(conflicted.conflicts).toHaveLength(1);
  });

  it("requires an exact superseded fingerprint to resolve and replace a premise", () => {
    const first = applyReceivablesSupplementPatch({draft: newReceivablesSupplementDraft(datasetHash), patch: patch("p1")});
    const existingFingerprint = first.sections.structure!.fingerprint;
    const conflicted = applyReceivablesSupplementPatch({
      draft: first,
      patch: patch("p2", {
        sections: {structure: {value: {...sections.structure.value, requestedFacility: "700"}}},
        evidence: {facilityAndWaterfall: evidence.facilityAndWaterfall},
      }),
    });
    const resolved = applyReceivablesSupplementPatch({
      draft: conflicted,
      patch: patch("p3", {
        sections: {structure: {value: {...sections.structure.value, requestedFacility: "700"}, supersedesFingerprint: existingFingerprint}},
        evidence: {facilityAndWaterfall: evidence.facilityAndWaterfall},
      }),
    });
    expect(compileReceivablesSupplementDraft(resolved).state).toBe("complete");
    expect((resolved.sections.structure!.value as {requestedFacility: string}).requestedFacility).toBe("700");
    expect(resolved.conflicts[0]).toMatchObject({status: "resolved", resolvedByPatchId: "p3"});
  });

  it("rejects evidence-free and cross-dataset patches", () => {
    expect(() => applyReceivablesSupplementPatch({
      draft: newReceivablesSupplementDraft(datasetHash),
      patch: patch("p1", {evidence: {}}),
    })).toThrow();
    expect(() => applyReceivablesSupplementPatch({
      draft: newReceivablesSupplementDraft(datasetHash),
      patch: patch("p1", {sourceDatasetHash: "b".repeat(64)}),
    })).toThrow("receivables_supplement_patch_dataset_mismatch");
  });
});
