import {createHash} from "node:crypto";
import {adoptedCapitalPeriodFixture} from "./adopted-capital-period-cash";

/** Synthetic alternatives with one historical opening and distinct projected assumptions. */
export function capitalDecisionCompositionFixture() {
  const base = adoptedCapitalPeriodFixture(); const snapshot = base.snapshot;
  function variant(scenario: string, counter: number) {
    const replacements = new Map<string, string>();
    const clones = base.snapshot.entries.filter(e => e.dimensions.scenario === "house").map((e, n) => {
      const id = `c1550000-0000-4000-9000-${String(counter + n).padStart(12, "0")}`; replacements.set(e.decisionId, id);
      const clone = structuredClone(e); clone.decisionId = id; clone.dimensions.scenario = scenario;
      clone.slotKey = createHash("sha256").update(e.slotKey + scenario).digest("hex");
      return clone;
    });
    snapshot.entries.push(...clones);
    function replace(value: unknown): unknown {
      if (typeof value === "string") return replacements.get(value) ?? value;
      if (Array.isArray(value)) return value.map(replace);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)]));
      return value;
    }
    const projection = replace(base.input) as typeof base.input;
    projection.operating.scenario = scenario; projection.funding.input.scenario = scenario;
    return {projection, clones};
  }
  const lowerCost = variant("lower-cost", 30000);
  lowerCost.clones.find(e => e.fieldPath.endsWith(".couponRates"))!.value.value = ["0.05", "0.05"];
  const stress = variant("revenue-stress", 40000);
  stress.clones.find(e => e.fieldPath === "operating_projection.revenue.quantities")!.value.value = ["9", "9"];
  const canonical = JSON.stringify(snapshot); const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
  for (const p of [base.input, lowerCost.projection, stress.projection]) {p.operating.envelope = envelope; p.funding.input.envelope = envelope;}
  const input = {workId: snapshot.workId, purpose: snapshot.purpose, question: "Synthetic capital structure decision", objectives: ["Protect cash while evaluating funding costs"],
    alternatives: [
      {id: "maintain", label: "Synthetic current terms", kind: "maintain" as const, projection: base.input, rationale: "Keep the declared funding terms", conditions: ["Synthetic terms are not a market quote"], disconfirmers: ["Terms change or capacity is unavailable"]},
      {id: "change", label: "Synthetic lower-cost hypothesis", kind: "change" as const, projection: lowerCost.projection, rationale: "Evaluate an explicitly adopted lower rate", conditions: ["Requires commercial confirmation"], disconfirmers: ["A lender does not offer the adopted rate"]},
    ], maintenanceExclusion: null,
    sensitivities: [{id: "revenue-stress", baseAlternativeId: "maintain", label: "Synthetic volume downside", rationale: "Adopt nine units instead of ten in each period", projection: stress.projection}],
    recommendation: null};
  return {synthetic: true as const, snapshot, input};
}
