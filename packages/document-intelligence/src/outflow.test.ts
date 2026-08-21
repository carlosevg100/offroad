import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {resolveFieldPath} from "@offroad/credit-ontology";

import {canonicalizeText, outflowMagnitude} from "./verifier";

describe("what Nimbus taught the normaliser", () => {
  it("stores costs, capex, taxes, depreciation and burn as magnitudes, and leaves results signed", () => {
    expect(outflowMagnitude("historical_financials.{period}.cogs", new Decimal(-4_830_000)).toFixed()).toBe("4830000");
    expect(outflowMagnitude("interim_financials.{period}.monthly_burn{ytd}", new Decimal(-1_850_000)).toFixed()).toBe("1850000");
    expect(outflowMagnitude("historical_financials.{period}.ebitda", new Decimal(-19_400_000)).toFixed()).toBe("-19400000");
    expect(outflowMagnitude("historical_financials.{period}.net_income", new Decimal(-21_000_000)).toFixed()).toBe("-21000000");
  });

  it("spells a currency one way", () => {
    const canonical = resolveFieldPath("transaction.currency")!.definition.canonical;
    expect(canonicalizeText("R$", canonical)).toBe("BRL");
    expect(canonicalizeText("Reais", canonical)).toBe("BRL");
    expect(canonicalizeText("US$", canonical)).toBe("USD");
    expect(canonicalizeText("pesos chilenos", canonical)).toBe("CLP");
  });
});
