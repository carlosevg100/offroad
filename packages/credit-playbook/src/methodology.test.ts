import {describe, expect, it} from "vitest";

import {houseMethodology, methodologyChecks, organizationMethodologySchema, resolveMethodology} from "./methodology";

const person = "11111111-1111-4111-8111-111111111111";

describe("organization methodology", () => {
  it("ships house defaults that impose no lending threshold and require the institutional scenarios", () => {
    expect(houseMethodology.thresholds).toEqual([]);
    expect(houseMethodology.minimumScenarios.filter((scenario) => scenario.required).map((scenario) => scenario.id)).toEqual(["base", "downside"]);
    expect(houseMethodology.mandatoryMetrics).toContain("dscr");
  });

  it("only adopts definitions that exist in the ontology, with parameters and never a new formula", () => {
    expect(() => organizationMethodologySchema.parse({...houseMethodology, definitions: [{id: "house_ebitda", parameters: {}}]})).toThrow(/credit-ontology/);
    expect(() => organizationMethodologySchema.parse({...houseMethodology, mandatoryMetrics: ["magic_ratio"]})).toThrow(/credit-ontology/);
  });

  it("lets an institution tighten the house without losing it", () => {
    const resolved = resolveMethodology({
      ebitdaAdjustments: [{id: "non_recurring_items", allowed: true, capPercentOfEbitda: 5, requiresEvidence: true}],
      thresholds: [{metric: "leverage", comparator: "<=", value: "3.5", scope: "screening"}],
      minimumScenarios: [{id: "stress", required: true, shocks: [{driver: "ebitda", change: "-40%"}]}],
      mandatoryMetrics: ["collateral_coverage"],
    });
    expect(resolved.ebitdaAdjustments.find((policy) => policy.id === "non_recurring_items")?.capPercentOfEbitda).toBe(5);
    expect(resolved.ebitdaAdjustments.find((policy) => policy.id === "ifrs16_leases")?.allowed).toBe(true);
    expect(resolved.thresholds).toHaveLength(1);
    expect(resolved.minimumScenarios.find((scenario) => scenario.id === "stress")?.required).toBe(true);
    expect(resolved.mandatoryMetrics).toEqual(expect.arrayContaining(["leverage", "dscr", "interest_coverage", "collateral_coverage"]));
    expect(resolved.presentation).toEqual(houseMethodology.presentation);
  });

  it("keeps capabilities out: they live in the institution profile", () => {
    expect(houseMethodology.capabilitiesReference).toBe("institution_capability_profiles");
    expect(() => organizationMethodologySchema.parse({...houseMethodology, capabilitiesReference: "here"})).toThrow();
  });

  it("turns thresholds, required scenarios and mandatory metrics into checks a verifier can run", () => {
    const checks = methodologyChecks(resolveMethodology({thresholds: [{metric: "dscr", comparator: ">=", value: "1.2", scope: "approval"}]}));
    expect(checks.map((check) => check.id)).toEqual(expect.arrayContaining(["threshold:approval:dscr", "scenario:base", "scenario:downside", "metric:leverage"]));
  });

  it("records prior decisions and corrections with a person behind them", () => {
    const resolved = resolveMethodology({corrections: [{reference: "claim:ebitda:2025", summary: "Ajuste não recorrente rejeitado pelo comitê.", recordedAt: "2026-09-04T21:00:00.000Z", recordedBy: person}]});
    expect(resolved.corrections).toHaveLength(1);
    expect(() => resolveMethodology({corrections: [{reference: "x", summary: "y", recordedAt: "2026-09-04T21:00:00.000Z", recordedBy: "nobody"}]})).toThrow();
  });
});
