import {describe, expect, it} from "vitest";

import {indicativePrice, spreadBands} from "./index";

describe("the desk's price reference", () => {
  it("has a band for every instrument at the adequate rating, and says it is practice, not observation", () => {
    const instruments = [...new Set(spreadBands.map((band) => band.instrument))];
    expect(instruments).toHaveLength(10);
    for (const instrument of instruments) expect(spreadBands.some((band) => band.instrument === instrument && band.rating === "adequate")).toBe(true);
    const price = indicativePrice({instrument: "ccb", rating: "adequate", cdi: "0.105"})!;
    expect(price.sentence.pt).toContain("prática da mesa");
    expect(price.sentence.pt).not.toContain("observada");
  });

  it("prices Aurora's CCB: adequate, 48 months, 1,3x of collateral, R$ 42M", () => {
    const price = indicativePrice({instrument: "ccb", rating: "adequate", cdi: "0.105", tenorMonths: 48, collateralCoverage: "1.3", amount: "42300000"})!;
    expect(price.bps).toEqual({min: 250, max: 370});
    expect(price.allIn.min).toBe("0.1300");
    expect(price.adjustments.map((a) => a.id)).toEqual(["security"]);
    expect(price.sentence.pt).toContain("CDI + 2,5%");
  });

  it("closes the door where no lender would look", () => {
    expect(indicativePrice({instrument: "debenture_160", rating: "distressed", cdi: "0.105"})).toBeNull();
  });

  it("charges for duration, for no security and for a small ticket", () => {
    const price = indicativePrice({instrument: "debenture_476", rating: "watch", cdi: "0.105", tenorMonths: 84, amount: "8000000"})!;
    expect(price.adjustments.map((a) => a.id).sort()).toEqual(["security", "size", "tenor"]);
    expect(price.bps.min).toBe(280 + 40 + 40 + 50);
  });
});
