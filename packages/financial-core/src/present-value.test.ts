import {describe, expect, it} from "vitest";

import {macaulayDurationBusinessDays, presentValueByBusinessDays} from "./index";

describe("presentValueByBusinessDays", () => {
  it("discounts each flow over its business days of a 252-day year and sums", () => {
    const result = presentValueByBusinessDays([{id: "a", amount: "100", businessDays: 252}, {id: "b", amount: "100", businessDays: 504}], "0.10");
    // 100/1.1 + 100/1.21 = 90.90909091 + 82.64462810
    expect(result.value).toBe("173.55371901");
    expect(result.discounted[0]?.factor).toBe("1.1");
    expect(result.trace.id).toBe("financial.present_value_by_business_days");
  });

  it("returns the nominal at a zero rate and refuses negative rates or fractional days", () => {
    expect(presentValueByBusinessDays([{id: "a", amount: "50", businessDays: 10}], "0").value).toBe("50");
    expect(() => presentValueByBusinessDays([{id: "a", amount: "50", businessDays: 10}], "-0.1")).toThrow();
    expect(() => presentValueByBusinessDays([{id: "a", amount: "50", businessDays: 1.5}], "0.1")).toThrow();
  });
});

describe("macaulayDurationBusinessDays", () => {
  it("weights business days by present value", () => {
    const result = macaulayDurationBusinessDays([{id: "a", amount: "100", businessDays: 252}, {id: "b", amount: "100", businessDays: 504}], "0.10");
    // (252*90.90909091 + 504*82.6446281) / 173.55371901 = 372
    expect(result.value).toBe("372");
  });
});
