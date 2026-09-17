import {describe, expect, it} from "vitest";

import {anchorText, decimalSeparatorFor, displayCandidateValue, editableCandidateValue, parseList, parseLocalizedDecimal, parseLocalizedNumber} from "./format";

describe("parseLocalizedNumber", () => {
  it("reads Brazilian notation", () => {
    expect(parseLocalizedNumber("1,78", "pt-BR")).toBe(1.78);
    expect(parseLocalizedNumber("54.000.000", "pt-BR")).toBe(54_000_000);
    expect(parseLocalizedNumber("54.000.000,00", "pt-BR")).toBe(54_000_000);
    expect(parseLocalizedNumber("R$ 53,76 milhões", "pt-BR")).toBe(53.76);
    expect(parseLocalizedNumber("2,8735x", "pt-BR")).toBe(2.8735);
    expect(parseLocalizedNumber("1,234", "pt-BR")).toBe(1.234);
    expect(parseLocalizedNumber("1.234", "pt-BR")).toBe(1234);
  });

  it("reads English notation", () => {
    expect(parseLocalizedNumber("1.78", "en-US")).toBe(1.78);
    expect(parseLocalizedNumber("54,000,000", "en-US")).toBe(54_000_000);
    expect(parseLocalizedNumber("54,000,000.00", "en-US")).toBe(54_000_000);
    expect(parseLocalizedNumber("1,234", "en-US")).toBe(1234);
    expect(parseLocalizedNumber("1.234", "en-US")).toBe(1.234);
    expect(parseLocalizedNumber("-2.5", "en-US")).toBe(-2.5);
  });

  it("accepts plain integers and rejects ambiguous or malformed input", () => {
    expect(parseLocalizedNumber("54000000", "pt-BR")).toBe(54_000_000);
    expect(parseLocalizedNumber("", "pt-BR")).toBeNull();
    expect(parseLocalizedNumber("abc", "pt-BR")).toBeNull();
    expect(parseLocalizedNumber("1.23.4", "pt-BR")).toBeNull();
    expect(parseLocalizedNumber("1,2,3", "en-US")).toBeNull();
    expect(parseLocalizedNumber("--5", "en-US")).toBeNull();
    expect(parseLocalizedNumber("1..2", "en-US")).toBeNull();
  });

  it("knows the decimal separator of each locale", () => {
    expect(decimalSeparatorFor("pt-BR")).toBe(",");
    expect(decimalSeparatorFor("en-US")).toBe(".");
  });
});

describe("candidate rendering", () => {
  const labels = {yes: "Sim", no: "Não"};

  it("formats currency, multiples and plain numbers per locale without changing the value", () => {
    expect(displayCandidateValue({normalized_value: 54_000_000, currency: "BRL", unit: "currency"}, "pt-BR", labels)).toMatch(/54\.000\.000/);
    expect(displayCandidateValue({normalized_value: 54_000_000, currency: "BRL", unit: "currency"}, "en-US", labels)).toMatch(/54,000,000/);
    expect(displayCandidateValue({normalized_value: 1.7787878788, currency: null, unit: "x"}, "en-US", labels)).toBe("1.78x");
    expect(displayCandidateValue({normalized_value: true, currency: null, unit: null}, "pt-BR", labels)).toBe("Sim");
    expect(displayCandidateValue({normalized_value: ["a", "b"], currency: null, unit: null}, "pt-BR", labels)).toBe("a, b");
  });

  it("emits editable values in a locale-neutral form", () => {
    expect(editableCandidateValue({normalized_value: 1.452})).toBe("1.452");
    expect(editableCandidateValue({normalized_value: ["x", "y"]})).toBe("x, y");
    expect(editableCandidateValue({normalized_value: {nested: 1}})).toBe("{\"nested\":1}");
  });

  it("builds compact anchors", () => {
    const anchorLabels = {page: "página", sheet: "aba", cell: "célula"};
    expect(anchorText({source_anchor: {page: 3, section: "Demonstração do resultado"}}, anchorLabels)).toBe("página 3 · Demonstração do resultado");
    expect(anchorText({source_anchor: {sheet: "GARANTIAS", cell: "E17"}}, anchorLabels)).toBe("aba GARANTIAS · célula E17");
    expect(anchorText({source_anchor: null}, anchorLabels)).toBe("");
  });

  it("parses comma-separated lists", () => {
    expect(parseList(" a, b ,, c ")).toEqual(["a", "b", "c"]);
    expect(parseList("x".repeat(3), 1)).toEqual(["xxx"]);
  });
});

it("preserves an edited decimal beyond JavaScript precision", () => {
  expect(parseLocalizedDecimal("9.007.199.254.740.993,123456789", "pt-BR")).toBe("9007199254740993.123456789");
  expect(parseLocalizedDecimal("-9,007,199,254,740,993.123456789", "en-US")).toBe("-9007199254740993.123456789");
  expect(parseLocalizedDecimal("R$ 1.234,50", "pt-BR")).toBe("1234.50");
});

it("rejects exponents and textual scales instead of changing a persistent quantity", () => {
  for (const value of ["1e3", "1e-3", "R$ 53,76 milhões", "2x", "10%", "abc123", "(123)", "12.34,56", "1,23,4.00", "1,"]) {
    expect(parseLocalizedDecimal(value, "pt-BR")).toBeNull();
  }
});
