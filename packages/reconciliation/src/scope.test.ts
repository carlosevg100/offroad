import {describe, expect, it} from "vitest";

import {reconcileFacts} from "./facts";

describe("a filing with parent-only and consolidated columns", () => {
  it("stands behind the consolidated number", () => {
    const base = {fieldPath: "interim_financials.2026_05.gross_debt", valueType: "number" as const, sourceDocument: "01_ITR.pdf", evidenceRank: 2, informationClass: "reviewed", confidence: 0.95, anchorVerified: true, periodEnd: "2026-05-31"};
    const [fact] = reconcileFacts([
      {...base, normalizedValue: "4567602000", entityScope: "standalone", confidence: 0.99},
      {...base, normalizedValue: "5670186000", entityScope: "consolidated"},
    ]);
    expect(fact?.value).toBe("5670186000");
    expect(fact?.accepted.entityScope).toBe("consolidated");
    expect(fact?.conflicts[0]?.candidate.entityScope).toBe("standalone");
  });
});
