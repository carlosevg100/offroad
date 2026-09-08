import {describe, expect, it} from "vitest";
import {sectorContextCatalog} from "./sector-context-catalog";
import {normalizeSectorContextValue, sectorContextDimensionLabels, sectorContextEvidenceLabels, sectorContextValueLabels} from "./sector-context-labels";

describe("sector context labels and exact aliases", () => {
  it("covers every required evidence and activation value in both languages", () => {
    for (const module of sectorContextCatalog) {
      for (const requirement of module.requirements) for (const id of requirement.evidenceNeeded) {
        expect(sectorContextEvidenceLabels[id]?.pt, id).toBeTruthy();
        expect(sectorContextEvidenceLabels[id]?.en, id).toBeTruthy();
      }
      for (const predicate of module.applicability) {
        expect(sectorContextDimensionLabels).toHaveProperty(predicate.dimension);
        expect(sectorContextValueLabels[predicate.value]?.pt).toBeTruthy();
        expect(normalizeSectorContextValue(predicate.dimension, predicate.value)).toBe(predicate.value);
      }
    }
  });
  it.each([
    ["sector", " ENERGIA ", "energy"], ["sector", "Varejo", "retail"],
    ["subsector", "Energia solar", "solar"], ["lifecycle", "CONSTRUÇÃO", "construction"],
    ["business_model", "Carteira de recebíveis", "receivables_pool"], ["jurisdiction", "BRASIL", "BR"],
    ["revenue_model", "exposição ao mercado", "merchant"], ["recourse", "Recurso limitado", "limited_recourse"],
  ])("maps exact %s alias %s", (dimension, raw, expected) => expect(normalizeSectorContextValue(dimension, raw)).toBe(expected));
  it("does not infer across dimensions or erase unknown user context", () => {
    expect(normalizeSectorContextValue("sector", "energia solar")).toBeNull();
    expect(normalizeSectorContextValue("business_model", "energia")).toBeNull();
    expect(normalizeSectorContextValue("revenue_model", "contracted and merchant")).toBeNull();
    expect(normalizeSectorContextValue("sector", "varejo e indústria")).toBeNull();
    expect(normalizeSectorContextValue("__proto__", "energy")).toBeNull();
  });
});
