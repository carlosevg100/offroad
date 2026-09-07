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
      expect(turn.expected.semantic.objects.length).toBeGreaterThan(0);
      expect(turn.expected.semantic.objects.map(({ordinal}) => ordinal)).toEqual(turn.expected.semantic.objects.map((_, index) => index + 1));
      expect(new Set(turn.expected.semantic.objects.map(({id}) => id)).size).toBe(turn.expected.semantic.objects.length);
      for (const object of turn.expected.semantic.objects) {
        expect(object.id).toBe(`object-${object.ordinal}`);
        expect(object.allowAdditional).toBe(false);
        expect(new Set(object.slots.map(({key}) => key)).size).toBe(object.slots.length);
      }
      expect(turn.expected.semantic.decision.category).toBeTruthy();
      expect(turn.expected.semantic.audienceCategory).toBeTruthy();
    }
  });

  it("binds material facts to objects and preserves decision-driving numbers and entities", () => {
    const claim = intentGoldTurns.find(({id}) => id === "gc01-t03")!.expected.semantic.objects.find(({kind}) => kind === "claim")!;
    expect(claim.slots).toContainEqual({key: "subject", allowedValues: ["4,7x"], cardinality: 1});
    const structure = intentGoldTurns.find(({id}) => id === "gc03-t01")!.expected.semantic.objects;
    expect(structure.find(({kind}) => kind === "company")!.slots).toContainEqual({key: "entity", allowedValues: ["Aurora"], cardinality: 1});
    expect(structure.find(({kind}) => kind === "operation")!.slots).toEqual(expect.arrayContaining([
      {key: "subject", allowedValues: ["recebíveis"], cardinality: 1},
      {key: "amount", allowedValues: ["50000000"], cardinality: 1},
      {key: "currency", allowedValues: ["BRL"], cardinality: 1},
    ]));
    expect(intentGoldTurns.find(({id}) => id === "gc05-t03")!.expected.semantic.objects.find(({kind}) => kind === "scenario")!.slots)
      .toEqual(expect.arrayContaining([{key: "indexer", allowedValues: ["CDI"], cardinality: 1}, {key: "percentage", allowedValues: ["12"], cardinality: 1}, {key: "tenor_months", allowedValues: ["84"], cardinality: 1}]));
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
