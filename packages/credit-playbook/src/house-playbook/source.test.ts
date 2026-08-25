import {readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

import {houseModuleDefinitions, housePlaybookSourceHash, parseHousePlaybook} from "./source";

const markdown = readFileSync(
  new URL("../../knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md", import.meta.url),
  "utf8",
);
const catalogue = parseHousePlaybook(markdown);

describe("House Playbook source catalogue", () => {
  it("preserves the complete ordered 11-module, 270-entry source", () => {
    expect(catalogue.procedures).toHaveLength(270);
    expect(catalogue.modules).toHaveLength(11);
    expect(catalogue.modules.map(({id, expectedProcedures, actualProcedures}) => ({id, expectedProcedures, actualProcedures})))
      .toEqual(houseModuleDefinitions.map(({id, expectedProcedures}) => ({id, expectedProcedures, actualProcedures: expectedProcedures})));
    expect(catalogue.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(catalogue.sourceHash).toBe(housePlaybookSourceHash);
  });

  it("keeps source entries outside the executable registry until they are expanded", () => {
    expect(catalogue.procedures.every((procedure) => procedure.readyToCompile === false)).toBe(true);
  });

  it("promotes the v2 editorial source without overstating runtime readiness", () => {
    expect(catalogue.version).toBe("2026.08.25-v2");
    expect(markdown).toContain("Este arquivo não é\n> executado diretamente");
    expect(markdown).toContain("não promove automaticamente nenhuma entrada para `production`");
    expect(catalogue.procedures.every((procedure) => procedure.authorities.length > 0)).toBe(true);
  });

  it("uses named blueprint stages and removes rejected technical shortcuts", () => {
    expect(markdown).not.toMatch(/\bE\d{2}\b/u);
    expect(markdown).not.toContain("ltda fecha debênture");
    expect(markdown).not.toContain("FIDC pulverizado");
    expect(markdown).not.toContain("o mercado soma de volta");
    expect(markdown).not.toContain("saúde pública");
    expect(markdown).not.toContain("+300 bps");
    expect(markdown).toContain("FIDC é o veículo");
    expect(markdown).toContain("Ledger reconciliado e visões de obrigações");
  });

  it("separates current product scope from post-introduction advisory references", () => {
    const postIntroduction = catalogue.procedures
      .filter((procedure) => procedure.scope === "post_introduction_reference")
      .map((procedure) => procedure.id);
    expect(postIntroduction).toEqual([
      "MK-19", "MK-20", "MK-21", "MK-22", "MK-23",
      "MK-24", "MK-25", "MK-26", "MK-27", "MK-28",
    ]);
    expect(catalogue.procedures.filter((procedure) => procedure.scope === "qualified_introduction_boundary").map((procedure) => procedure.id))
      .toEqual(["MK-15", "MK-16", "MK-17", "MK-18"]);
    const postIntroductionIds = new Set(postIntroduction);
    expect(catalogue.procedures
      .filter((procedure) => procedure.scope !== "post_introduction_reference")
      .flatMap((procedure) => procedure.references.filter((reference) => postIntroductionIds.has(reference))))
      .toEqual([]);
  });

  it("identifies legal review and versioned reference-data obligations", () => {
    expect(catalogue.procedures.find((procedure) => procedure.id === "ES-13")?.legalReviewRequired).toBe(true);
    expect(catalogue.procedures.find((procedure) => procedure.id === "D-27")?.marketReferenceDataRequired).toBe(true);
    expect(catalogue.procedures.find((procedure) => procedure.id === "PR-07")?.marketReferenceDataRequired).toBe(true);
  });

  it("preserves every internal cross-reference without dangling ids", () => {
    const ids = new Set(catalogue.procedures.map((procedure) => procedure.id));
    expect(catalogue.procedures.flatMap((procedure) => procedure.references).every((reference) => ids.has(reference))).toBe(true);
  });
});
