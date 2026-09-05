import {describe, expect, it} from "vitest";

import {assertTaskPromotable, offroadTaskRegistry, type MethodMaturityLookup, type OffroadTaskSpec} from "./task-registry";

const c05 = offroadTaskRegistry.find((task) => task.id === "C05")!;
const bound: OffroadTaskSpec = {...c05, procedure: {id: "build-debt-ledger", version: "2026.09.05-v1"}};

describe("task promotion needs a production method", () => {
  it("lets any task move below production without a method", () => {
    expect(() => assertTaskPromotable(c05, "implemented", () => null)).not.toThrow();
    expect(() => assertTaskPromotable(c05, "tested", () => null)).not.toThrow();
  });

  it("refuses production without a binding, with an unknown method, or with a candidate method", () => {
    expect(() => assertTaskPromotable(c05, "production", () => null)).toThrow(/without a bound method/);
    expect(() => assertTaskPromotable(bound, "production", () => null)).toThrow(/does not hold/);
    const candidate: MethodMaturityLookup = () => ({maturity: "candidate", hasImplementation: false});
    expect(() => assertTaskPromotable(bound, "production", candidate)).toThrow(/candidate, no implementation evidence/);
    const unproven: MethodMaturityLookup = () => ({maturity: "production", hasImplementation: false});
    expect(() => assertTaskPromotable(bound, "production", unproven)).toThrow(/no implementation evidence/);
  });

  it("promotes only on a production method with implementation evidence", () => {
    const production: MethodMaturityLookup = () => ({maturity: "production", hasImplementation: true});
    expect(() => assertTaskPromotable(bound, "production", production)).not.toThrow();
  });

  it("keeps the registry honest: nothing is bound yet, nothing is above specified", () => {
    expect(offroadTaskRegistry.filter((task) => task.procedure).length).toBe(0);
    expect(new Set(offroadTaskRegistry.map((task) => task.maturity))).toEqual(new Set(["specified"]));
  });
});
