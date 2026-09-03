import {describe, expect, it} from "vitest";

import {ambiguousDebtAmount} from "./debt-amount-units";

describe("debt amount scale", () => {
  it.each(["R$ 650", "R$ 1,25", "USD 300", "não divulgado"])("rejects ambiguous amount %s", (amount) => {
    expect(ambiguousDebtAmount(amount)).toBe(true);
  });

  it.each(["R$ 650 milhões", "R$ 1,25 bilhão", "R$ 500.000.000,00", "USD 250 million", "BRL 125000000"])("accepts an explicit source scale in %s", (amount) => {
    expect(ambiguousDebtAmount(amount)).toBe(false);
  });

  it("allows null when the source does not disclose the amount", () => {
    expect(ambiguousDebtAmount(null)).toBe(false);
  });
});
