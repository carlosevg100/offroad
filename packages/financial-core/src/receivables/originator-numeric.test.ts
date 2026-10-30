import {describe, expect, it} from "vitest";
import {normalizeOriginatorNumber, type OriginatorNumericInput} from "./originator-numeric";
const currency = (literal: string): OriginatorNumericInput => ({literal, notation: "brazilian_document", unit: "currency", currency: "BRL", declaredScale: "1", representation: "reported_in_declared_scale", ratioConvention: null});
const ratio = (literal: string): OriginatorNumericInput => ({literal, notation: "brazilian_document", unit: "ratio", currency: null, declaredScale: null, representation: null, ratioConvention: null});
describe("originator literal and unit normalization", () => {
  it("distinguishes grouped source text from the same decimal-notation text", () => {
    expect(normalizeOriginatorNumber(currency("1.234")).value).toBe("1234");
    expect(normalizeOriginatorNumber({...currency("1.234"), notation: "decimal_notation"}).value).toBe("1.234");
  });
  it("applies a declared thousands scale exactly once", () => {
    expect(normalizeOriginatorNumber({...currency("9.400"), declaredScale: "1000"}).value).toBe("9400000");
    expect(normalizeOriginatorNumber({...currency("9.400.000"), declaredScale: "1000", representation: "already_in_currency_units"}).value).toBe("9400000");
  });
  it("refuses a missing scale or representation", () => {
    expect(() => normalizeOriginatorNumber({...currency("9,4"), declaredScale: null})).toThrow("originator_numeric_scale_unconfirmed");
    expect(() => normalizeOriginatorNumber({...currency("9,4"), representation: null})).toThrow("originator_numeric_scale_unconfirmed");
  });
  it("reads printed percentages without asking the model to divide", () => {
    expect(normalizeOriginatorNumber(ratio("15%" )).value).toBe("0.15");
    expect(normalizeOriginatorNumber({...ratio("0,15"), ratioConvention: "fraction"}).value).toBe("0.15");
  });
  it("refuses an unqualified ratio and a conflicting percent convention", () => {
    expect(() => normalizeOriginatorNumber(ratio("15"))).toThrow("originator_numeric_ratio_convention_missing");
    expect(() => normalizeOriginatorNumber({...ratio("15%"), ratioConvention: "fraction"})).toThrow("originator_numeric_ratio_conflict");
  });
  it("preserves a multiple instead of dividing it by one hundred", () => {
    expect(normalizeOriginatorNumber({...ratio("2,25x"), unit: "multiple"}).value).toBe("2.25");
  });
  it("supports explicit negative accounting figures", () => {
    expect(normalizeOriginatorNumber(currency("(1.234,50)")).value).toBe("-1234.5");
    expect(normalizeOriginatorNumber(currency("-1.234,50")).value).toBe("-1234.5");
  });
  it("checks a printed currency against the declared one", () => {
    expect(normalizeOriginatorNumber(currency("R$ 1.400.000")).value).toBe("1400000");
    expect(() => normalizeOriginatorNumber(currency("US$ 1.400.000"))).toThrow("originator_numeric_currency_conflict");
  });
  it("refuses nonfinite, malformed and fractional counts", () => {
    for (const literal of ["NaN", "Infinity", "1,2,3", "--1", "(-1)"]) expect(() => normalizeOriginatorNumber(currency(literal))).toThrow();
    expect(() => normalizeOriginatorNumber({...ratio("1,5"), unit: "count"})).toThrow("originator_numeric_count_invalid");
  });
});
