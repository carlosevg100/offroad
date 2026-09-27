import {bilingualDivergences, bilingualItems, readFigures} from "@offroad/testing-fixtures/bilingual-figures";
import {describe, expect, it} from "vitest";

import type {Material} from "./compile";
import {syntheticMaterials, type SyntheticMaterialsVariant} from "./synthetic-materials.test-support";

/**
 * Invariant 9, bilingual economic identity, as a test of every published material (stage 19,
 * increment 6C). For every material kind the package compiles and every item it prints, the
 * figures read from the Portuguese text (amounts, percentages, multiples, spreads, dates, fractions
 * and counts) equal the figures read from the English text, each parsed with the separators of its
 * own language, on the synthetic Aurora case in the three debt-schedule variants the parity pins
 * use. A table cell with one string is printed in both documents and is read in both languages. A
 * text quoted as written from the case (a claim of the brief, the text of a fact) is Portuguese in
 * both documents and is read as Portuguese on both sides.
 */
const variants: readonly SyntheticMaterialsVariant[] = ["balanceAboveSchedule", "withinTolerance", "scheduleAboveBalance"];

describe("the two languages of every material state the same figures", () => {
  for (const variant of variants) {
    const {materials, workbookEntry, statements, quotes} = syntheticMaterials(variant);
    for (const material of [...materials, workbookEntry, statements.bilingual]) {
      it(`${variant}: ${material.kind}${material.artifactFingerprint ? ` (${material.title.en})` : ""}`, () => {
        expect(bilingualItems(material).length).toBeGreaterThan(1);
        expect(bilingualDivergences(material, quotes)).toEqual([]);
      });
    }
  }

  it("covers every material kind the package compiles", () => {
    const {materials, workbookEntry} = syntheticMaterials();
    expect([...new Set([...materials, workbookEntry].map((material) => material.kind))].sort())
      .toEqual(["credit_memo", "credit_profile", "diligence_qa", "financial_model", "package", "teaser", "term_sheet"]);
  });

  it("the approved statements in Portuguese and in English state the same figures, item by item", () => {
    const {statements} = syntheticMaterials();
    const pt = bilingualItems(statements.pt);
    const en = bilingualItems(statements.en);
    expect(pt.map((item) => item.path)).toEqual(en.map((item) => item.path));
    pt.forEach((item, index) => {
      const portuguese = readFigures(item.pt, "pt-BR");
      const english = readFigures(en[index]!.en, "en-US");
      expect({path: item.path, figures: english.figures, foreign: [...portuguese.foreign, ...english.foreign]}).toEqual({path: item.path, figures: portuguese.figures, foreign: []});
    });
  });

  it("finds a divergence the moment one is introduced, so the identity is not vacuous", () => {
    const {materials, quotes} = syntheticMaterials();
    const qa = materials.find((material) => material.kind === "diligence_qa")!;
    const question20 = "A taxa pedida é compatível com o estoque e com o risco?";
    // The English of question 20 as case-materials 2026.09.26-v5 published it: no 2,19x, Portuguese decimals.
    const published: Material = {...qa, blocks: qa.blocks.map((block) => block.type === "kv"
      ? {...block, rows: block.rows.map((row) => row.label.pt === question20
        ? {...row, value: {...row.value, en: "The company asks 14,9% a.a. (CDI at 10,5% a.a.) for new money that takes leverage to 4,70x, while the current stack, written at lower leverage, already averages 15,0% a.a.."}}
        : row)}
      : block)};
    const divergences = bilingualDivergences(published, quotes);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]!.ptFigures).toContain("multiple:2.19");
    expect(divergences[0]!.foreign).toEqual(["en:14,9", "en:10,5", "en:4,70", "en:15,0"]);
    // A table cell in Portuguese separators alone is foreign to the English document.
    const memo = materials.find((material) => material.kind === "credit_memo")!;
    const untranslated: Material = {...memo, blocks: memo.blocks.map((block) => block.type === "table" && block.caption.pt === "Fontes e usos"
      ? {...block, rows: block.rows.map((row) => row.map((cell) => (typeof cell === "string" ? cell : cell.pt)))}
      : block)};
    expect(bilingualDivergences(untranslated, quotes).map((divergence) => divergence.foreign)).toEqual([["en:42.300.000"], ["en:17.340.000"], ["en:24.960.000"]]);
  });

  it("never prints an amount that is not zero as zero, in any language", () => {
    for (const variant of variants) {
      const {materials, workbookEntry, statements} = syntheticMaterials(variant);
      for (const material of [...materials, workbookEntry, statements.bilingual, statements.pt, statements.en]) {
        const zeros = bilingualItems(material).flatMap((item) => [...`${item.pt}\n${item.en}`.matchAll(/R\$ -?0(?:[.,]0+)?(?:M| mil| thousand)\b/g)].map((match) => `${item.path}: ${match[0]}`));
        expect(zeros, `${variant} ${material.kind}`).toEqual([]);
      }
    }
  });
});
