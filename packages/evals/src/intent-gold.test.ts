import {namedCompositionKeys, namedCompositions, primaryWorkSchema} from "@offroad/agent-contracts";
import {describe, expect, it} from "vitest";

import {intentGoldCoverage, intentGoldTurns, stabilityIntentTurnIds} from "./intent-gold";

describe("intent gold turns", () => {
  it("covers every primary work, so a constant classifier cannot pass", () => {
    const coverage = intentGoldCoverage();
    for (const work of primaryWorkSchema.options) expect(coverage.works, work).toContain(work);
  });

  it("covers every responsibility encoded by the canonical composition policy", () => {
    const coverage = intentGoldCoverage();
    const policyResponsibilities = [...new Set(Object.values(namedCompositions).flatMap((policy) => policy.workResponsibilities))];
    for (const responsibility of policyResponsibilities) {
      expect(coverage.responsibilities, responsibility).toContain(responsibility);
    }
  });

  it("names only compositions the catalogue knows", () => {
    for (const entry of intentGoldTurns) {
      if (entry.expected.composition) expect(Object.keys(namedCompositions), entry.id).toContain(entry.expected.composition);
    }
  });

  it("includes the situations the router must handle beyond the happy path", () => {
    expect(intentGoldTurns.some((entry) => entry.expected.abstain)).toBe(true);
    expect(intentGoldTurns.some((entry) => entry.expected.depth === "point")).toBe(true);
    expect(intentGoldTurns.some((entry) => entry.expected.continuity === "refresh")).toBe(true);
    expect(intentGoldTurns.some((entry) => entry.expected.primaryWorks.length > 1)).toBe(true);
    expect(intentGoldTurns.some((entry) => entry.priorTurns.length > 0 && entry.expected.continuity === "new")).toBe(true);
  });

  it("has exactly forty unique base turns across the four required suites", () => {
    const ids = intentGoldTurns.map((entry) => entry.id);
    expect(intentGoldTurns).toHaveLength(40);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.fromEntries(["journey", "horizontal", "confusion", "adversarial"].map((suite) => [suite, intentGoldTurns.filter((turn) => turn.suite === suite).length]))).toEqual({
      journey: 17,
      horizontal: 8,
      confusion: 7,
      adversarial: 8,
    });
  });

  it("covers all twenty compositions and has an explicit semantic answer key per turn", () => {
    expect(new Set(intentGoldCoverage().compositions)).toEqual(new Set(namedCompositionKeys));
    for (const turn of intentGoldTurns) {
      expect(turn.expected.semantic.canonicalAction).toBeTruthy();
      expect(turn.expected.semantic.objectKinds.length).toBeGreaterThan(0);
      for (const materialReference of turn.expected.semantic.materialReferences) {
        expect(turn.expected.semantic.objectKinds, `${turn.id}:${materialReference.reference}`).toContain(materialReference.kind);
      }
      for (const materialSlot of turn.expected.semantic.materialSlots) {
        expect(turn.expected.semantic.objectKinds, `${turn.id}:${materialSlot.slot}`).toContain(materialSlot.kind);
      }
      expect(turn.expected.semantic.desiredOutcomeSignals.length).toBeGreaterThan(0);
      expect(turn.expected.semantic.decision.category).toBeTruthy();
      expect(turn.expected.semantic.audienceCategory).toBeTruthy();
    }
  });

  it("binds material facts to objects and preserves decision-driving numbers and entities", () => {
    expect(intentGoldTurns.find(({id}) => id === "gc01-t03")!.expected.semantic.materialReferences)
      .toContainEqual({kind: "claim", reference: "4,7x"});
    expect(intentGoldTurns.find(({id}) => id === "gc03-t01")!.expected.semantic.materialReferences)
      .toEqual(expect.arrayContaining([{kind: "company", reference: "Aurora"}, {kind: "operation", reference: "recebíveis"}]));
    expect(intentGoldTurns.find(({id}) => id === "gc03-t01")!.expected.semantic.materialSlots)
      .toEqual(expect.arrayContaining([{kind: "operation", slot: "amount", value: "50000000"}, {kind: "operation", slot: "currency", value: "BRL"}]));
    expect(intentGoldTurns.find(({id}) => id === "gc05-t03")!.expected.semantic.materialSlots)
      .toEqual(expect.arrayContaining([{kind: "scenario", slot: "indexer", value: "CDI"}, {kind: "scenario", slot: "percentage", value: "12"}, {kind: "scenario", slot: "tenor_months", value: "84"}]));
  });

  it("keeps an independent acceptance plan for document-backed structuring", () => {
    const turn = intentGoldTurns.find(({id}) => id === "gc03-t01")!;
    expect(turn.documentCount).toBe(2);
    expect(turn.expected.primaryWorks).toEqual(["extract_and_reconcile", "capital_strategy", "analyze"]);
  });

  it("defines exactly six stability triplets with three distinct authored messages", () => {
    expect(stabilityIntentTurnIds).toHaveLength(6);
    for (const id of stabilityIntentTurnIds) {
      const turn = intentGoldTurns.find((candidate) => candidate.id === id)!;
      expect(new Set([turn.message, ...turn.stabilityParaphrases!]).size).toBe(3);
    }
  });
});
