import {describe, expect, it} from "vitest";

import {buildStructureDesignInput, STRUCTURE_DESIGN_SYSTEM} from "./structure-design";

describe("structure design prompt", () => {
  it("contains only governed compact case state and preserves the advisory boundary", () => {
    const text = buildStructureDesignInput({
      asOf: "2026-08-29",
      playbookLines: ["[ES-45] Close sources and uses."],
      requestedChanges: ["Comparar uma alternativa com prazo mais longo."],
      context: ({
        version: "2026.08.29-v1",
        caseFingerprint: "a".repeat(64),
        archetypeId: "growth_expansion",
        locale: "pt",
        request: {amount: "10000000", termMonths: 48, graceMonths: 6},
        calculatedNeed: {amount: "10000000", status: "available", basisIds: ["OP-02"]},
        sourcesAndUses: {status: "pass", totalSources: "10000000", totalUses: "10000000", difference: "0", lines: []},
        effects: {status: "not_computable", items: [], blockers: ["projections_missing"]},
        capacityEnvelope: {amount: "12000000", currency: "BRL", bindingConstraint: "cash_flow", basisIds: ["ES-01"]},
        baseStructure: {instrument: "ccb", amount: "10000000", termMonths: 48, graceMonths: 6, amortizationFormat: "sac", rationale: "Indicative only.", basisIds: ["ES-45"]},
        finalSizing: {status: "pass", requestedAmount: "10000000", recommendedAmount: "10000000", gap: "0", basisIds: ["ES-41"]},
        security: {status: "partial", package: [], blockers: ["collateral_detail_missing"]},
        dayOne: {passes: true, tests: [], blockers: []},
        eligibleInstruments: [{id: "ccb", route: "private_credit", minimumAmount: "2000000", tenorMonths: {min: 12, max: 72}, buyers: ["funds"], requirements: [{pt: "Capacidade", en: "Capacity"}]}],
        pricing: {decision: "abstain", policyVersion: "p1", indicativePrice: null, allIn: {components: [], annualizedCostBps: null, totalRate: null}, missingInputs: ["market_reference"]},
        blockers: [],
        missingInputs: ["collateral_detail"],
        allowedBasisIds: ["OP-02", "ES-01", "ES-41", "ES-45"],
        budget: {maxCostUsd: 0.75, maxModelCalls: 1},
      } as unknown as import("@offroad/case-engine").StructureDesignerContext),
    });

    expect(STRUCTURE_DESIGN_SYSTEM).toContain("do not underwrite");
    expect(text).toContain('"capacityEnvelope"');
    expect(text).toContain('"allowedBasisIds"');
    expect(text).toContain('"requestedChanges":["Comparar uma alternativa com prazo mais longo."]');
    expect(text).not.toContain("raw document");
  });
});
