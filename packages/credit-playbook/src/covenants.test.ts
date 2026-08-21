import {describe, expect, it} from "vitest";

import {covenantCatalogue, covenantsFor} from "./covenants";

describe("the covenant catalogue", () => {
  it("writes every covenant with a definition, a test, a breach clause and who uses it", () => {
    expect(covenantCatalogue).toHaveLength(10);
    for (const covenant of covenantCatalogue) {
      expect(covenant.definition.pt.length).toBeGreaterThan(60);
      expect(covenant.test.pt.length).toBeGreaterThan(5);
      expect(covenant.breach.pt.length).toBeGreaterThan(20);
      expect(covenant.usual.length).toBeGreaterThan(0);
    }
  });

  it("gives a startup minimum cash and minimum ARR instead of leverage and DSCR", () => {
    const ids = covenantsFor("venture_debt").map((covenant) => covenant.id);
    expect(ids).toEqual(expect.arrayContaining(["minimum_cash", "minimum_arr", "additional_debt", "change_of_control"]));
    expect(ids).not.toContain("net_leverage");
    expect(ids).not.toContain("dscr");
  });

  it("gives an expansion the leverage, coverage and DSCR tests", () => {
    const ids = covenantsFor("growth_expansion").map((covenant) => covenant.id);
    expect(ids).toEqual(expect.arrayContaining(["net_leverage", "interest_coverage", "dscr"]));
  });
});
