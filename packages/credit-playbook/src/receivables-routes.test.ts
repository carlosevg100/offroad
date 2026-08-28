import {describe, expect, it} from "vitest";

import {
  receivablesEligibilityFactIds,
  receivablesEligibilitySources,
  receivablesFactResolutionDefinitions,
  receivablesRouteDefinitions,
} from "./receivables-routes";

describe("canonical receivables route catalogue", () => {
  it("separates routes, capital providers and service providers", () => {
    expect(receivablesRouteDefinitions).toHaveLength(9);
    expect(new Set(receivablesRouteDefinitions.map((route) => route.id)).size).toBe(receivablesRouteDefinitions.length);
    const factoring = receivablesRouteDefinitions.find((route) => route.id === "factoring_purchase")!;
    expect(factoring.capitalProviderTypes).toEqual(["factoring_company"]);
    expect(factoring.serviceProviderTypes).not.toContain("fidc_or_receivables_fund");
    const securitisation = receivablesRouteDefinitions.find((route) => route.id === "receivables_certificate_securitisation")!;
    expect(securitisation.serviceProviderTypes).toContain("securitisation_company");
    expect(securitisation.capitalProviderTypes).not.toContain("securitisation_company");
  });

  it("provides cited primary or official support for every criterion", () => {
    for (const route of receivablesRouteDefinitions) {
      expect(new Set(route.criteria.map((criterion) => criterion.id)).size, route.id).toBe(route.criteria.length);
      for (const criterion of route.criteria) {
        expect(criterion.sourceIds.length, criterion.id).toBeGreaterThan(0);
        for (const sourceId of criterion.sourceIds) {
          const source = receivablesEligibilitySources[sourceId];
          expect(source.provenanceClass, criterion.id).toBe("cited");
          expect(["primary", "official"], criterion.id).toContain(source.sourceStatus);
          expect(source.url, criterion.id).toMatch(/^https:\/\//);
        }
      }
    }
  });

  it("never uses desk estimates as a hard decision", () => {
    for (const route of receivablesRouteDefinitions) {
      expect(route.deskCharacteristics.provenanceClass).toBe("estimated");
      expect(route.criteria.some((criterion) => criterion.sourceIds.length === 0)).toBe(false);
    }
  });

  it("defines exactly one evidence-resolution contract for every route fact", () => {
    expect(receivablesFactResolutionDefinitions).toHaveLength(receivablesEligibilityFactIds.length);
    expect(new Set(receivablesFactResolutionDefinitions.map((definition) => definition.id)).size)
      .toBe(receivablesFactResolutionDefinitions.length);
    expect(receivablesFactResolutionDefinitions.map((definition) => definition.id).sort())
      .toEqual([...receivablesEligibilityFactIds].sort());
  });
});
