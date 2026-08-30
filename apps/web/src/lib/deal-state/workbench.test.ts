import {describe, expect, it} from "vitest";

import type {DealStateRow} from "./workbench";
import {latestActiveDealState, parseCompiledStructure} from "./workbench";

const hex = "a".repeat(64);
const row = (objectType: string, objectVersion: number, status: string, payload: unknown = {}): DealStateRow => ({
  id: crypto.randomUUID(),
  organization_id: crypto.randomUUID(),
  intake_session_id: crypto.randomUUID(),
  object_type: objectType,
  object_version: objectVersion,
  status,
  input_fingerprint: hex,
  object_fingerprint: hex,
  payload: payload as DealStateRow["payload"],
  dependencies: [],
  created_by: null,
  created_by_kind: "worker",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  superseded_at: null,
});

describe("deal-state workbench", () => {
  it("never resurrects an older object after a terminal latest version", () => {
    const latest = latestActiveDealState([
      row("structure_option", 1, "pending_confirmation"),
      row("structure_option", 2, "stale"),
    ]);
    expect(latest.has("structure_option")).toBe(false);
  });

  it("parses the compiled structure shown to the company", () => {
    const parsed = parseCompiledStructure(row("structure_option", 1, "pending_confirmation", {
      compiled: {
        version: "2026.08.29-v2",
        status: "pending_confirmation",
        proposalFingerprint: hex,
        blockers: [],
        missingInputs: [],
        recommendation: {
          alternativeId: "senior",
          rationale: "Balances capacity and execution.",
          status: "ready_for_confirmation",
          blockers: [],
        },
        alternatives: [{
          id: "senior", label: "Senior secured", instrument: "ccb", route: "bilateral",
          amount: "50000000", currency: "BRL", termMonths: 48, graceMonths: 6,
          amortization: "sac", indexer: "CDI", targetBuyer: "private_credit_fund",
          rationale: "Fits the cash-flow envelope.", pros: ["Execution"], cons: ["Security"], assumptions: [],
          security: [{description: "Receivables", basisIds: ["fact-1"]}], covenants: [], conditionsPrecedent: [],
          implementationDays: null,
          sourcesAndUses: {totalSources: "50000000", totalUses: "50000000", difference: "0", status: "pass"},
          totalCost: {status: "pending_market_reference", totalRate: null},
          status: "comparable", confirmationEligible: true, blockers: [], missingInputs: [],
        }],
      },
    }));
    expect(parsed?.value.recommendation?.alternativeId).toBe("senior");
    expect(parsed?.value.alternatives[0]?.confirmationEligible).toBe(true);
  });
});
