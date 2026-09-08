import {describe, expect, it} from "vitest";
import {sectorContextCatalog} from "./sector-context-catalog";
import {dcmDepthPacks} from "./registry";

describe("specified object-scoped sector context catalog", () => {
  it("has distinct stable module and requirement identities without activating the registry", () => {
    expect(sectorContextCatalog).toHaveLength(9);
    const ids = sectorContextCatalog.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    const requirements = sectorContextCatalog.flatMap((item) => item.requirements.map((requirement) => requirement.id));
    expect(new Set(requirements).size).toBe(requirements.length);
    for (const item of sectorContextCatalog) {
      expect(item.status).toBe("specified");
      expect(item.version).toBeTruthy();
      expect(item.applicability.length).toBeGreaterThan(0);
      expect(item.applicability).toContainEqual(item.activationDiscriminator);
      expect(item.requirements.flatMap((requirement) => requirement.methods).every((method) => method.status === "specified")).toBe(true);
    }
    expect(JSON.stringify(dcmDepthPacks)).not.toContain('"sector.solar"');
  });
  it("factual answers request only fact scope and provenance, never full finance", () => {
    for (const module of sectorContextCatalog) {
      const factual = module.requirements.filter((item) => item.intents.includes("factual_answer"));
      expect(factual).toHaveLength(1);
      expect(factual[0]).toMatchObject({evidenceNeeded: ["requested_fact_and_object_scope", "source_version_and_locator"], methods: [], scenarioIds: [], marketCriteriaIds: [], outputSuggestions: ["sourced_factual_answer"]});
    }
  });
  it("keeps contracted and merchant additive while toll and availability retain distinct mechanisms", () => {
    const module = (id: string) => sectorContextCatalog.find((item) => item.id === id)!;
    expect(module("revenue.contracted").applicability).toEqual([{dimension: "revenue_model", value: "contracted"}]);
    expect(module("revenue.merchant").applicability).toEqual([{dimension: "revenue_model", value: "merchant"}]);
    expect(module("revenue.availability").requirements.flatMap((item) => item.scenarioIds)).not.toContain("toll.traffic_mix_downside");
    expect(module("revenue.toll").applicability).toContainEqual({dimension: "subsector", value: "road"});
  });
  it("retains pool-specific provenance and separate confirmed mandate requirements", () => {
    const pool = sectorContextCatalog.find((item) => item.id === "business.receivables")!;
    expect(pool.applicability).toEqual([{dimension: "business_model", value: "receivables_pool"}]);
    expect(pool.requirements.find((item) => item.intents.includes("financial_analysis"))!.evidenceNeeded).toContain("reporting_date_and_latest_origination_date");
    expect(pool.requirements.find((item) => item.intents.includes("market_matching"))!.marketCriteriaIds).toContain("mandate.confirmed_eligibility_policy");
    expect(pool.requirements.find((item) => item.intents.includes("financial_analysis"))!.marketCriteriaIds).toEqual([]);
  });
});
