import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {evaluateDefinedRatio, type DefinedRatioInput} from "./index";
const input = (): DefinedRatioInput => ({numerator: "300", denominator: "100", limit: "3", comparator: "lte", convention: "positive_denominator_unrounded_comparison"});
describe("defined ratio boundary", () => {
  it("distinguishes strict and inclusive boundaries at equality", () => {
    for (const comparator of ["lt", "lte", "gt", "gte"] as const) {
      const r = evaluateDefinedRatio({...input(), comparator});
      expect(r.ratio).toBe("3"); expect(r.margin).toBe("0");
      expect(r.satisfiesDefinedBoundary).toBe(comparator === "lte" || comparator === "gte");
      expect(r.certifiesContractualCompliance).toBe(false);
    }
  });
  it("does not let displayed rounding change the exact comparison", () => {
    const r = evaluateDefinedRatio({...input(), numerator: "100000000000000000000001", denominator: "100000000000000000000000", limit: "1"});
    expect(r.ratio).toBe("1"); expect(r.satisfiesDefinedBoundary).toBe(false);
    expect(r.crossProducts!.marginNumerator).toBe("-1");
  });
  it("computes upper and lower margins with their respective direction", () => {
    expect(evaluateDefinedRatio({...input(), numerator: "250"})).toMatchObject({ratio: "2.5", margin: "0.5", satisfiesDefinedBoundary: true});
    expect(evaluateDefinedRatio({...input(), numerator: "250", comparator: "gte"})).toMatchObject({ratio: "2.5", margin: "-0.5", satisfiesDefinedBoundary: false});
  });
  it("refuses economic interpretation with zero or negative denominator", () => {
    for (const denominator of ["0", "-100"]) expect(evaluateDefinedRatio({...input(), denominator})).toMatchObject({status: "nonpositive_denominator", ratio: null, satisfiesDefinedBoundary: null});
  });
  it("preserves missing operands rather than assuming a zero or a policy limit", () => {
    for (const field of ["numerator", "denominator", "limit"] as const) expect(evaluateDefinedRatio({...input(), [field]: null})).toMatchObject({status: "missing_inputs", missing: [field], satisfiesDefinedBoundary: null});
  });
  it("supports explicitly defined signed numerators without clamping net cash to zero", () => {
    expect(evaluateDefinedRatio({...input(), numerator: "-50"})).toMatchObject({ratio: "-0.5", margin: "3.5", satisfiesDefinedBoundary: true});
  });
  it("rejects omitted conventions malformed values and unbounded precision", () => {
    for (const numerator of [undefined, 300, "NaN", "1e3", "1.0000000000001", "1".repeat(25)]) expect(() => evaluateDefinedRatio({...input(), numerator} as DefinedRatioInput)).toThrow();
    expect(() => evaluateDefinedRatio({...input(), comparator: "maximum"} as unknown as DefinedRatioInput)).toThrow();
    expect(() => evaluateDefinedRatio({...input(), convention: undefined} as unknown as DefinedRatioInput)).toThrow();
  });
  it("reproduces independently of global decimal precision and detaches the operands", () => {
    const i = {...input(), numerator: "1", denominator: "3", limit: "0.333333333333"}; const before = evaluateDefinedRatio(i);
    const precision = Decimal.precision; const rounding = Decimal.rounding;
    try {Decimal.set({precision: 3, rounding: Decimal.ROUND_DOWN}); expect(evaluateDefinedRatio(i)).toEqual(before);}
    finally {Decimal.set({precision, rounding});}
    expect(before.ratio).toBe("0.333333333333333333"); expect(before.satisfiesDefinedBoundary).toBe(false);
    i.numerator = "999"; expect(before.operands.numerator).toBe("1");
  });
});
