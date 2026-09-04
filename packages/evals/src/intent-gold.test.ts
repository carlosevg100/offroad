import {namedCompositions, primaryWorkSchema} from "@offroad/agent-contracts";
import {describe, expect, it} from "vitest";

import {intentGoldCoverage, intentGoldTurns} from "./intent-gold";

describe("intent gold turns", () => {
  it("covers every primary work, so a constant classifier cannot pass", () => {
    const coverage = intentGoldCoverage();
    for (const work of primaryWorkSchema.options) expect(coverage.works, work).toContain(work);
  });

  it("covers the responsibilities that change the presentation", () => {
    const coverage = intentGoldCoverage();
    for (const responsibility of ["producer", "coordinator", "reviewer", "decision_maker", "sponsor"]) {
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

  it("keeps ids unique and tied to the five cases", () => {
    const ids = intentGoldTurns.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(intentGoldTurns.map((entry) => entry.caseId)).size).toBe(5);
  });
});
