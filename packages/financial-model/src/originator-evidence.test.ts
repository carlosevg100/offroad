import {describe, expect, it} from "vitest";
import {originatorLiteralInQuote} from "./originator-evidence";
describe("originator quoted numeric tokens", () => {
  it("keeps neighbouring table values separate", () => {
    expect(originatorLiteralInQuote("9400000", "Debt 9400000 0 1800000")).toBe(true);
    expect(originatorLiteralInQuote("940000001800000", "Debt 9400000 0 1800000")).toBe(false);
    expect(originatorLiteralInQuote("10", "1\t0")).toBe(false);
  });
  it("does not accept part of a larger amount or fraction", () => {
    expect(originatorLiteralInQuote("1", "1.000,00")).toBe(false);
    expect(originatorLiteralInQuote("0.1", "0.15")).toBe(false);
    expect(originatorLiteralInQuote("60%", "160%")).toBe(false);
  });
  it("allows printed spaces by units and currency", () => {
    expect(originatorLiteralInQuote("60%", "Holding 60 %.")).toBe(true);
    expect(originatorLiteralInQuote("R$1.000,00", "R$ 1.000,00")).toBe(true);
  });
  it("does not concatenate a row number with the next table value", () => {
    expect(originatorLiteralInQuote("1.234", "1. 234")).toBe(false);
  });
});
