import {describe, expect, it} from "vitest";
import {formatRounded, shiftDecimal} from "./format";

describe("display rounding of engine decimals", () => {
  it("moves the point without floating point", () => {
    expect(shiftDecimal("727845.123", -6)).toBe("0.727845123");
    expect(shiftDecimal("-6350000", -6)).toBe("-6.35");
    expect(shiftDecimal("0.158", 2)).toBe("15.8");
    expect(shiftDecimal("5", -3)).toBe("0.005");
    expect(shiftDecimal("0.15", 2)).toBe("15");
  });
  it("rounds half away from zero and keeps the locale's separators", () => {
    expect(formatRounded("-6.35", 1, "pt-BR")).toBe("-6,4");
    expect(formatRounded("0.7278", 1, "en-US")).toBe("0.7");
    expect(formatRounded("1234.95", 1, "pt-BR")).toBe("1.235,0");
    expect(formatRounded("-0.04", 1, "pt-BR")).toBe("0,0");
    expect(formatRounded("9.96", 1, "pt-BR")).toBe("10,0");
    expect(formatRounded("5.8125", 1, "pt-BR")).toBe("5,8");
  });
});
