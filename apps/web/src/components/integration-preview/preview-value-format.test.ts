import {describe, expect, it} from "vitest";
import {formatPreviewNumber} from "./preview-value-format";

describe("exact preview number presentation", () => {
  it.each([
    ["0.21689377", "0,21689377", "0.21689377"],
    ["1234567.89000100", "1.234.567,89000100", "1,234,567.89000100"],
    ["9007199254740993.12345678901234567890", "9.007.199.254.740.993,12345678901234567890", "9,007,199,254,740,993.12345678901234567890"],
    ["-0.00000001", "-0,00000001", "-0.00000001"],
    ["0", "0", "0"],
    ["-1200.00", "-1.200,00", "-1,200.00"],
    ["00123", "00123", "00123"],
    ["2026-09-07", "2026-09-07", "2026-09-07"],
    ["1e-8", "1e-8", "1e-8"],
    ["NaN", "NaN", "NaN"],
  ])("preserves %s without float conversion", (input, pt, en) => {
    expect(formatPreviewNumber(input, "pt-BR")).toBe(pt);
    expect(formatPreviewNumber(input, "en-US")).toBe(en);
  });
  it("treats actual numbers consistently and preserves negative zero", () => {
    expect(formatPreviewNumber(0.21689377, "pt-BR")).toBe("0,21689377");
    expect(formatPreviewNumber(-0, "en-US")).toBe("-0");
  });
});
