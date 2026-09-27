import {instruments} from "@offroad/credit-playbook";
import {termBasisLabels, type TermBasis} from "@offroad/deal-structure";
import {priceAdjustmentLabels, spreadBands} from "@offroad/market-reference";
import {bilingualItems} from "@offroad/testing-fixtures/bilingual-figures";
import {describe, expect, it} from "vitest";

import type {Material} from "./compile";
import {syntheticMaterials, type SyntheticMaterialsVariant} from "./synthetic-materials.test-support";

/**
 * The visible text of every material shows no internal identifier and no dash (stage 19,
 * post-closure polish): every item of every material, in both languages, on the synthetic Aurora
 * case in the three variants of the parity pins. A value of an internal type reaches a document only
 * through its label: where a term came from, what a price adjustment is, which instrument and which
 * band a price is based on.
 */
const variants: readonly SyntheticMaterialsVariant[] = ["balanceAboveSchedule", "withinTolerance", "scheduleAboveBalance"];
const identifier = /\b[a-z0-9]+_[a-z0-9_]+\b|\{ano\}|\b[a-z_]+\.[a-z_]+\.[a-z0-9_{}]+/;
const dash = /[‒–—―]/;
// A legal form by its key (stage 19, second polish: the English reason of a closed debenture read "Requires sa; the company is ltda.").
const legalFormKey = /(?<![\p{L}\p{N}_])(?:sa|ltda)(?![\p{L}\p{N}_])/u;

const offending = (material: Material) => bilingualItems(material).flatMap((item) => [item.pt, item.en].flatMap((text) => [
  ...(dash.test(text) ? [`dash at ${item.path}: ${text}`] : []),
  ...(identifier.test(text) ? [`identifier ${text.match(identifier)![0]} at ${item.path}`] : []),
  ...(legalFormKey.test(text) ? [`legal form key at ${item.path}: ${text}`] : []),
]));

describe("no material shows an internal identifier or a dash", () => {
  for (const variant of variants) {
    const {materials, workbookEntry, statements} = syntheticMaterials(variant);
    for (const material of [...materials, workbookEntry, statements.bilingual, statements.pt, statements.en]) {
      it(`${variant}: ${material.kind}${material.artifactFingerprint ? ` (${material.title.en})` : ""}`, () => {
        expect(offending(material)).toEqual([]);
      });
    }
  }

  it("names every value of the internal types a material prints, in both languages", () => {
    for (const labels of [...Object.values(termBasisLabels), ...Object.values(priceAdjustmentLabels)]) {
      for (const text of [labels.pt, labels.en]) {
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toMatch(identifier);
      }
    }
    // Every instrument the price grid quotes has a name in the playbook catalog.
    for (const band of spreadBands) expect(instruments.some((entry) => entry.id === band.instrument), band.instrument).toBe(true);
  });

  it("prints the basis of the price, its adjustments and the basis of every term in words", () => {
    const {materials} = syntheticMaterials();
    const memo = materials.find((material) => material.kind === "credit_memo")!;
    const price = memo.blocks.find((block) => block.type === "kv" && block.rows.some((row) => row.label.pt === "Faixa"));
    if (price?.type !== "kv") throw new Error("the memo has no price reference");
    expect(price.rows[0]!.note).toEqual({
      pt: "Base: Cédula de Crédito Bancário (CCB); perfil analítico: atenção; faixa de 400 a 550 bps.",
      en: "Base: Bank credit note (CCB); analytical profile: watch; range of 400 to 550 bps.",
    });
    expect(price.rows[1]!.label).toEqual({pt: "Ajuste pelas garantias", en: "Security adjustment"});

    const pack = materials.find((material) => material.kind === "package")!;
    const terms = pack.blocks.find((block) => block.type === "table" && block.caption.pt === "Termos indicativos");
    if (terms?.type !== "table") throw new Error("the package has no terms table");
    const labels = new Set(Object.values(termBasisLabels).map((label) => JSON.stringify(label)));
    for (const row of terms.rows) expect(labels.has(JSON.stringify(row[2])), JSON.stringify(row[2])).toBe(true);
    expect(terms.rows.map((row) => row[2])).toContainEqual(termBasisLabels["company_request" satisfies TermBasis]);
  });
});
