import {describe, expect, it} from "vitest";

import {
  resolveReceivablesProviderMandate,
  type ReceivablesMandateObservation,
  type ReceivablesProviderMandate,
} from "./receivables-provider";

const observation = <T>(
  value: T,
  sourceKind: ReceivablesMandateObservation<T>["sourceKind"] = "direct_declaration",
  observedAt = "2026-08-01",
  validUntil = "2026-09-30",
): ReceivablesMandateObservation<T> => ({
  value,
  sourceKind,
  sourceId: `${sourceKind}-${JSON.stringify(value)}`,
  sourceLabel: "Confirmação registrada para teste",
  observedAt,
  validUntil,
});

const mandate = (overrides: Partial<ReceivablesProviderMandate> = {}): ReceivablesProviderMandate => ({
  mandateId: "mandate-1",
  providerId: "provider-1",
  providerLegalName: "Financeira Um S.A.",
  programId: "program-1",
  programName: "Desconto mercantil",
  providerKind: "credit_finance_company",
  version: 1,
  effectiveFrom: "2026-08-01",
  eligibleRoutes: [observation(["financial_institution_receivables_discount"])],
  currencies: [observation(["BRL"])],
  ticket: [observation({mode: "threshold", value: {min: "1000000", max: "30000000"}})],
  weightedAverageTermDays: [observation({mode: "threshold", value: {min: "15", max: "180"}})],
  minimumHistoryMonths: [observation({mode: "threshold", value: 12})],
  maximumPastDueOver30Ratio: [observation({mode: "threshold", value: "0.05"})],
  maximumPastDueOver90Ratio: [observation({mode: "threshold", value: "0.02"})],
  maximumDilutionRatio: [observation({mode: "threshold", value: "0.04"})],
  maximumAdjustedLossRatio: [observation({mode: "threshold", value: "0.03"})],
  maximumSingleObligorRatio: [observation({mode: "threshold", value: "0.20"})],
  maximumTopTenObligorRatio: [observation({mode: "threshold", value: "0.70"})],
  minimumEligiblePortfolioAmount: [observation({mode: "threshold", value: "2000000"})],
  liveAppetite: [observation(true, "relationship_confirmation")],
  availableCapacity: [observation("15000000", "relationship_confirmation")],
  ...overrides,
});

describe("receivables provider mandate", () => {
  it("resolves a current mandate for a finance company rather than assuming a FIDC", () => {
    const resolved = resolveReceivablesProviderMandate(mandate(), "2026-08-27");
    expect(resolved.providerKind).toBe("credit_finance_company");
    expect(resolved.eligibleRoutes?.value).toEqual(["financial_institution_receivables_discount"]);
    expect(resolved.staleCriteria).toEqual([]);
    expect(resolved.unconfirmedCriteria).toEqual([]);
  });

  it("does not treat observed deals as confirmed live capacity", () => {
    const resolved = resolveReceivablesProviderMandate(mandate({
      availableCapacity: [observation("15000000", "observed_transaction")],
    }), "2026-08-27");
    expect(resolved.availableCapacity?.decisionUseAllowed).toBe(true);
    expect(resolved.availableCapacity?.confirmed).toBe(false);
    expect(resolved.unconfirmedCriteria).toContain("available_capacity");
  });

  it("uses a current observation instead of letting a stale higher-priority source block it", () => {
    const resolved = resolveReceivablesProviderMandate(mandate({
      liveAppetite: [
        observation(true, "direct_declaration", "2026-07-01", "2026-07-31"),
        observation(false, "observed_transaction", "2026-08-20", "2026-09-30"),
      ],
    }), "2026-08-27");
    expect(resolved.liveAppetite?.current).toBe(true);
    expect(resolved.liveAppetite?.value).toBe(false);
    expect(resolved.liveAppetite?.divergent).toBe(false);
    expect(resolved.staleCriteria).not.toContain("live_appetite");
    expect(resolved.unconfirmedCriteria).toContain("live_appetite");
  });

  it("exposes disagreement between two current sources instead of silently choosing one", () => {
    const resolved = resolveReceivablesProviderMandate(mandate({
      liveAppetite: [
        observation(true, "direct_declaration"),
        observation(false, "relationship_confirmation"),
      ],
    }), "2026-08-27");
    expect(resolved.liveAppetite?.value).toBe(true);
    expect(resolved.liveAppetite?.divergent).toBe(true);
    expect(resolved.divergentCriteria).toContain("live_appetite");
  });

  it("rejects observations dated after the analysis date", () => {
    expect(() => resolveReceivablesProviderMandate(mandate({
      liveAppetite: [observation(true, "direct_declaration", "2026-09-01", "2026-09-30")],
    }), "2026-08-27")).toThrow("future mandate observation");
  });
});
