import {describe, expect, it} from "vitest";
import {normalizeCurrencyRepresentation} from "./index";

describe("explicit currency representation", () => {
  it("converts reported amounts exactly and preserves negative and zero values", () => {
    const result = normalizeCurrencyRepresentation({values: ["1.25", "-2", "0"], declaredScale: "1000", representation: "reported_in_declared_scale"});
    expect(result.values).toEqual(["1250", "-2000", "0"]);
    expect(result.factor).toBe("1000"); expect(result.operands.values).toEqual(["1.25", "-2", "0"]);
  });
  it("does not multiply values already normalized by the source contract", () => {
    const result = normalizeCurrencyRepresentation({values: ["1250"], declaredScale: "1000", representation: "already_in_currency_units"});
    expect(result.values).toEqual(["1250"]); expect(result.factor).toBe("1"); expect(result.operands.declaredScale).toBe("1000");
  });
  it("uses explicit fractional scale without floating point or implicit rounding", () => {
    expect(normalizeCurrencyRepresentation({values: ["125"], declaredScale: "0.01", representation: "reported_in_declared_scale"}).values).toEqual(["1.25"]);
    expect(() => normalizeCurrencyRepresentation({values: ["0.00000001"], declaredScale: "0.1", representation: "reported_in_declared_scale"})).toThrow("numeric_representation_result_outside_domain");
  });
  it("rejects absent conventions, invalid scales and unsupported magnitudes", () => {
    for (const declaredScale of ["0", "-1", "1e3", "NaN"]) expect(() => normalizeCurrencyRepresentation({values: ["1"], declaredScale, representation: "reported_in_declared_scale"})).toThrow("numeric_representation_invalid_scale");
    expect(() => normalizeCurrencyRepresentation({values: ["999999999999999999999999"], declaredScale: "1000", representation: "reported_in_declared_scale"})).toThrow("numeric_representation_result_outside_domain");
    expect(() => normalizeCurrencyRepresentation({values: ["1"], declaredScale: "1", representation: "guess" as never})).toThrow("numeric_representation_required");
  });
  it("copies operand arrays and bounds series before arithmetic", () => {
    const values = ["1"]; const result = normalizeCurrencyRepresentation({values, declaredScale: "1.00", representation: "reported_in_declared_scale"}); values[0] = "2";
    expect(result.operands.values).toEqual(["1"]);
    for (const values of [[], Array(2001).fill("1")]) expect(() => normalizeCurrencyRepresentation({values, declaredScale: "1", representation: "already_in_currency_units"})).toThrow("numeric_representation_value_limit");
  });
});
