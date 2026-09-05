import {describe, expect, it} from "vitest";

import {assertTaskPromotable, offroadTaskRegistry, type MethodMaturityLookup, type OffroadTaskSpec} from "./task-registry";

const c05 = offroadTaskRegistry.find((task) => task.id === "C05")!;
const bound: OffroadTaskSpec = {...c05, procedure: {id: "build-debt-ledger", version: "2026.09.05-v1"}};

describe("task promotion needs a production method", () => {
  it("keeps specified reachable without a method, and nothing else", () => {
    expect(() => assertTaskPromotable(c05, "specified", () => null)).not.toThrow();
    expect(() => assertTaskPromotable(c05, "implemented", () => null)).toThrow(/without a bound method/);
    expect(() => assertTaskPromotable(bound, "implemented", () => null)).toThrow(/does not hold/);
  });

  it("never lets a task climb above its method, and never without implementation evidence", () => {
    const candidate: MethodMaturityLookup = () => ({maturity: "candidate", hasImplementation: false});
    expect(() => assertTaskPromotable(bound, "implemented", candidate)).toThrow(/no implementation evidence/);
    const implemented: MethodMaturityLookup = () => ({maturity: "implemented", hasImplementation: true});
    expect(() => assertTaskPromotable(bound, "implemented", implemented)).not.toThrow();
    expect(() => assertTaskPromotable(bound, "ai_reviewed", implemented)).toThrow(/never climbs above its method/);
    const tested: MethodMaturityLookup = () => ({maturity: "tested", hasImplementation: true});
    expect(() => assertTaskPromotable(bound, "tested", tested)).not.toThrow();
    expect(() => assertTaskPromotable(bound, "production", tested)).toThrow(/never climbs above its method/);
    const production: MethodMaturityLookup = () => ({maturity: "production", hasImplementation: true});
    expect(() => assertTaskPromotable(bound, "production", production)).not.toThrow();
  });

  it("keeps the registry honest: nothing is bound yet, nothing is above specified", () => {
    expect(offroadTaskRegistry.filter((task) => task.procedure).length).toBe(0);
    expect(new Set(offroadTaskRegistry.map((task) => task.maturity))).toEqual(new Set(["specified"]));
  });
});
