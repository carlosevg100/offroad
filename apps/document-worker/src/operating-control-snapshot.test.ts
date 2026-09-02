import type {CaseEngineState} from "@offroad/case-engine";
import {describe, expect, it} from "vitest";

import {buildCaseOperatingControlSnapshot} from "./operating-control-snapshot";

function provenState(): CaseEngineState {
  return {
    claimRegistry: {
      claims: [{material: true, supportIds: ["financials.revenue"], status: "verified"}],
    },
    reconciliation: {
      facts: [{disputed: false, key: {fieldPath: "financials.revenue"}}],
      calculations: [{id: "net_debt", inputs: ["financials.revenue"]}],
      exceptions: [],
      gaps: [],
    },
    readiness: {components: [{id: "data_sufficiency"}], blockers: []},
    structureAlternatives: {
      alternatives: [
        {assumptions: ["subject to lender diligence"], missingInputs: []},
        {assumptions: ["subject to final documentation"], missingInputs: []},
      ],
    },
    structureDecision: {status: "confirmed"},
    stress: [{scenario: "downside"}],
    materialTruth: {
      artifacts: [{
        templateCurrent: true,
        templateSectionsComplete: true,
        conductStatus: "pass",
        unsupportedMaterialClaims: [],
        bilingualComplete: true,
      }],
      releaseDecision: "ready_for_authorization",
    },
    matching: {screened: false, marketTruth: {status: "partial", shortlist: []}},
  } as unknown as CaseEngineState;
}

describe("case operating-control snapshot", () => {
  it("compiles proof-bearing internal controls without treating external authority as implicit", () => {
    const snapshot = buildCaseOperatingControlSnapshot({
      state: provenState(),
      session: {capital_objective: "Refinance", company_profile: {name: "Example"}},
      snapshotAt: "2026-09-01T15:00:00.000Z",
      costUsd: 0.2,
      maxCostUsd: 0.5,
      security: {providerPolicyEnforced: true, externalToolsAllowlisted: true},
    });

    expect(snapshot.mandate.status).toBe("satisfied");
    expect(snapshot.sources).toMatchObject({status: "satisfied", materialClaims: 1, staleMaterialClaims: 0});
    expect(snapshot.calculations.status).toBe("satisfied");
    expect(snapshot.judgment).toMatchObject({status: "satisfied", maturity: "internal_decision_valid"});
    expect(snapshot.security.status).toBe("satisfied");
    expect(snapshot.authority).toMatchObject({status: "not_applicable", externalActionRequested: false});
  });

  it("fails closed when provider policy, budget evidence or reconciled math is absent", () => {
    const state = provenState();
    state.reconciliation.facts[0]!.disputed = true;
    const snapshot = buildCaseOperatingControlSnapshot({
      state,
      session: {},
      snapshotAt: "2026-09-01T15:00:00.000Z",
      costUsd: 0.2,
      maxCostUsd: null,
      security: {providerPolicyEnforced: false, externalToolsAllowlisted: true},
    });

    expect(snapshot.mandate.status).toBe("failed");
    expect(snapshot.calculations).toMatchObject({status: "failed", reconciledCalculations: 0});
    expect(snapshot.security.status).toBe("failed");
    expect(snapshot.economics).toMatchObject({status: "failed", costWithinBudget: false});
  });
});
