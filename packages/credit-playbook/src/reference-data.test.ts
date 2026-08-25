import {describe, expect, it} from "vitest";

import {referenceDataKeys, referenceDataRegistry, referenceDataRegistryHash, referenceDataEntrySchema, unresolvedReferenceData} from "./reference-data";

describe("versioned reference-data registry", () => {
  it("tracks every required value with owner and source state", () => {
    expect(referenceDataRegistry.length).toBeGreaterThanOrEqual(15);
    expect(new Set(referenceDataKeys).size).toBe(referenceDataRegistry.length);
    expect(referenceDataRegistryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(referenceDataRegistry.every((entry) => entry.owner && entry.houseProcedureIds.length > 0)).toBe(true);
  });

  it("does not allow an approved market value without source and validity", () => {
    const entry = referenceDataRegistry[0]!;
    expect(() => referenceDataEntrySchema.parse({...entry, status: "approved", value: 5})).toThrow(/source|as-of|expiry/i);
  });

  it("reports missing data instead of inventing a parameter", () => {
    expect(unresolvedReferenceData(["scenario.interest_rate.parallel_shock"]).map((entry) => entry.key))
      .toEqual(["scenario.interest_rate.parallel_shock"]);
  });
});
