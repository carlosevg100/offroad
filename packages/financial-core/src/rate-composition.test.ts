import {describe, expect, it} from "vitest";

import {annualRateForPercentOfDi, composeIndexAndSpread, spreadOverIndex} from "./rate-composition";

// Expected values were computed independently with Python's decimal module at 50 digits.
describe("indexed rate composition (B3 convention, 252 business days)", () => {
  it("composes DI and spread multiplicatively: DI 13,65% plus 3% is 17,0595%, 40,95 bps above the linear sum", () => {
    const composed = composeIndexAndSpread({index: "DI", annualIndex: "0.1365", annualSpread: "0.03"});
    expect(composed.value).toBe("0.170595");
    expect(composed.linearSum).toBe("0.1665");
    expect(composed.compositionEffectBps).toBe("40.95");
    expect(composed.trace).toContainEqual({label: "formula", value: "(1 + index) * (1 + spread) - 1"});
  });

  it("gives 13,65 bps of composition effect at a 1% spread", () => {
    expect(composeIndexAndSpread({index: "DI", annualIndex: "0.1365", annualSpread: "0.01"})).toMatchObject({value: "0.147865", compositionEffectBps: "13.65"});
  });

  it("composes IPCA and the real coupon the same way", () => {
    const composed = composeIndexAndSpread({index: "IPCA", annualIndex: "0.0422", annualSpread: "0.075108"});
    expect(composed.value).toBe("0.1204775576");
    expect(composed.linearSum).toBe("0.117308");
    expect(composed.compositionEffectBps).toBe("31.695576");
  });

  it("turns a prefixed 15% into 99,34 bps over the DI x pré rate of the same duration, not 113,12", () => {
    const spread = spreadOverIndex({annualRate: "0.15", annualIndex: "0.138688"});
    expect(spread.value).toBe("0.009934240108");
    expect(spread.linearSum).toBe("0.011312");
    expect(spread.compositionEffectBps).toBe("-13.777599");
  });

  it("round-trips: the spread over the index recomposes to the original rate", () => {
    const spread = spreadOverIndex({annualRate: "0.170595", annualIndex: "0.1365"});
    expect(spread.value).toBe("0.03");
    expect(composeIndexAndSpread({index: "DI", annualIndex: "0.1365", annualSpread: spread.value}).value).toBe("0.170595");
  });

  it("annualizes a percentage of the DI through the daily rate: 110% of 13,65% is 15,1131%, not 15,015%", () => {
    const composed = annualRateForPercentOfDi({annualDi: "0.1365", percentOfDi: "1.10"});
    expect(composed.value).toBe("0.151131219706");
    expect(composed.linearSum).toBe("0.15015");
    expect(composed.compositionEffectBps).toBe("9.812197");
  });

  it("keeps 100% of the DI equal to the DI", () => {
    expect(annualRateForPercentOfDi({annualDi: "0.1365", percentOfDi: "1"}).value).toBe("0.1365");
  });

  it("refuses rates at or below -100% and negative percentages instead of returning a number", () => {
    expect(() => composeIndexAndSpread({index: "DI", annualIndex: "-1", annualSpread: "0.03"})).toThrow("above -100%");
    expect(() => annualRateForPercentOfDi({annualDi: "0.1365", percentOfDi: "-0.1"})).toThrow("non-negative");
    expect(() => spreadOverIndex({annualRate: "0.15", annualIndex: "-1.2"})).toThrow("above -100%");
  });
});
