import {describe, expect, it} from "vitest";

import {canonicalPeriodPath} from "./verifier";

describe("the period spelled the way the ontology spells it", () => {
  const quarter = {start: "2026-03-01", end: "2026-05-31"};
  it("turns the model's three spellings of one quarter into the canonical one", () => {
    expect(canonicalPeriodPath("interim_financials.2026.revenue", quarter)).toBe("interim_financials.2026_05.revenue_3m");
    expect(canonicalPeriodPath("interim_financials.2026_05.revenue", quarter)).toBe("interim_financials.2026_05.revenue_3m");
    expect(canonicalPeriodPath("interim_financials.2026.revenue_ytd", quarter)).toBe("interim_financials.2026_05.revenue_3m");
  });
  it("gives a balance-sheet line no window", () => {
    expect(canonicalPeriodPath("interim_financials.2026.cash", quarter)).toBe("interim_financials.2026_05.cash");
    expect(canonicalPeriodPath("interim_financials.2026.gross_debt_ytd", quarter)).toBe("interim_financials.2026_05.gross_debt");
  });
  it("keys a fiscal year by the year it ends in", () => {
    expect(canonicalPeriodPath("historical_financials.2025.ebitda", {start: "2025-03-01", end: "2026-02-28"})).toBe("historical_financials.2026.ebitda");
    expect(canonicalPeriodPath("projections.2027.ebitda", {start: "2027-01-01", end: "2027-12-31"})).toBe("projections.2027.ebitda");
  });
  it("leaves a path alone without dates or outside the periodised groups", () => {
    expect(canonicalPeriodPath("interim_financials.2026.revenue", undefined)).toBe("interim_financials.2026.revenue");
    expect(canonicalPeriodPath("debt.instruments.1.balance", quarter)).toBe("debt.instruments.1.balance");
  });
});

describe("a year the model spelled with a month", () => {
  it("is keyed by the year alone", async () => {
    const {canonicalPeriodPath: canonical} = await import("./verifier");
    expect(canonical("historical_financials.2026_02.total_assets", {start: "2025-03-01", end: "2026-02-28"})).toBe("historical_financials.2026.total_assets");
  });
});

describe("a covenant threshold written as a multiple", () => {
  it("parses '4,0x' as four", async () => {
    const {parseNumber} = await import("./text");
    expect(parseNumber("4,0x")?.value.toFixed()).toBe("4");
    expect(parseNumber("3.25 x", "en-US")?.value.toFixed()).toBe("3.25");
    expect(parseNumber("12,5%")?.value.toFixed()).toBe("12.5");
  });
});
