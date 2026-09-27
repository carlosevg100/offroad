import {bilingualDivergences} from "@offroad/testing-fixtures/bilingual-figures";
import {describe, expect, it} from "vitest";

import type {Material} from "./compile";
import {syntheticMaterials, type SyntheticMaterialsOverrides} from "./synthetic-materials.test-support";

/**
 * The materials over absent ratios (stage 19, second polish). A ratio of the desk or of the
 * trajectory over a zero denominator is published as absent, and every material that would print it
 * names the gap in words instead. Before, the desk published the division as it printed it
 * ("Infinity", "NaN") and every material that printed one refused it, so the case compiled no
 * material at all; each test below fails on that code. No pinned case has a zero denominator, and
 * the 22 material pins hold.
 */

/** Every text a material prints, in both languages. */
const texts = (materials: readonly Material[]): string[] => {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === "string") out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") Object.values(node).forEach(walk);
  };
  walk(materials);
  return out;
};

const variants: Record<string, SyntheticMaterialsOverrides> = {
  // A zero cost of goods sold and a year of zero projected EBITDA: the cycle and a year's uncut leverage are absent.
  "zero cost of goods sold and a zero projected year": {facts: {"historical_financials.2025.cogs": "0", "projections.2027.ebitda": "0"}},
  // A zero EBITDA: leverage today, the leverage after the swap, the peak and a covenant step are absent.
  "zero EBITDA": {
    facts: {"historical_financials.2025.ebitda": "0"},
    trajectory: (base) => ({...base, auditedEbitda: "0", projectedEbitda: base.projectedEbitda.map((year) => (year.year === 2027 ? {...year, ebitda: "0"} : year))}),
  },
};

describe("every material over absent ratios", () => {
  for (const [name, overrides] of Object.entries(variants)) {
    it(`${name}: compiles, names every gap and prints no division, the same figures in both languages`, () => {
      const {materials, quotes, desk, trajectory} = syntheticMaterials("balanceAboveSchedule", overrides);
      expect([...desk.absentRatios ?? [], ...trajectory.absentRatios ?? []].length).toBeGreaterThan(0);
      const printed = texts(materials);
      expect(printed.filter((text) => /\b(?:Infinity|NaN|null|undefined)\b/.test(text))).toEqual([]);
      for (const material of materials) expect(bilingualDivergences(material, quotes), material.kind).toEqual([]);
    });
  }

  it("names the gap of a zero cost of goods sold and of a zero projected year where the figures would be", () => {
    const {materials} = syntheticMaterials("balanceAboveSchedule", variants["zero cost of goods sold and a zero projected year"]);
    const printed = texts(materials);
    const qa = texts(materials.filter((material) => material.kind === "diligence_qa"));
    expect(qa).toContain("DSO 90,3 dias. DIO, DPO e o ciclo de caixa não são calculáveis, porque o custo das mercadorias vendidas do último exercício é zero.");
    expect(qa).toContain("DSO 90.3 days. DIO, DPO and the cash cycle are not computable, because cost of goods sold for the latest financial year is zero.");
    expect(qa).toContain("Não calculável, porque o custo das mercadorias vendidas do último exercício é zero e, sem ele, não há ciclo de caixa.");
    // The trajectory table of the memorandum states the gap in the 2027 row.
    expect(printed).toContain("não calculável (EBITDA projetado do ano igual a zero)");
    expect(printed).toContain("not computable (the year's projected EBITDA is zero)");
  });

  it("names the gap of a zero EBITDA in the key terms, the capital structure, the covenant schedule and the answers", () => {
    const {materials} = syntheticMaterials("balanceAboveSchedule", variants["zero EBITDA"]);
    const printed = texts(materials);
    expect(printed).toContain("não calculável / não calculável (EBITDA do último exercício igual a zero)");
    expect(printed).toContain("not computable / not computable (EBITDA for the latest financial year is zero)");
    // Pre-transaction leverage over a zero EBITDA is not "not applicable (negative EBITDA)": the EBITDA is zero.
    expect(printed).toContain("não calculável (EBITDA do último exercício igual a zero)");
    expect(printed).not.toContain("não se aplica (EBITDA negativo)");
    expect(printed).toContain("não calculável (EBITDA do ano no cenário cortado igual a zero)");
    expect(printed.some((text) => text.includes("2027: não calculável (EBITDA do ano no cenário cortado igual a zero); 2028: ≤ 2,50x"))).toBe(true);
    expect(printed).toContain("O mais apertado: 3,00x de dívida líquida/EBITDA (Banco Itaú); alavancagem atual não calculável (EBITDA do último exercício igual a zero).");
    expect(printed).toContain("A alavancagem antes e depois do pedido não é calculável, porque o EBITDA do último exercício é zero. O pico da trajetória não pode ser afirmado, porque o EBITDA de um ano no cenário cortado é zero.");
  });
});
