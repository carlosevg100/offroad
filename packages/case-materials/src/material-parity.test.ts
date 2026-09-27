import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {syntheticMaterials, type SyntheticMaterialsVariant} from "./synthetic-materials.test-support";

/**
 * Byte-identity of the published materials across the move of their arithmetic into
 * `@offroad/financial-core` (stage 19, increment 6). The fingerprints were captured from
 * `case-materials` 2026.09.09-v4 before the kernels existed, over the synthetic Aurora case in its
 * three debt-schedule variants (balance above the schedule, within the 2% tolerance, schedule above
 * the balance), and the refactored compilers must reproduce them exactly. The case reaches every
 * number the package computes or converts: the headline metrics in money and in multiples, the
 * history table, sources and uses, the top-five concentration and the largest customer, the schedule
 * tie-out in its three outcomes, the alternative in millions, the price range in percent, the ratios
 * the statements round and the chart points. A pin moves only with a deliberate
 * `caseMaterialsVersion` change.
 *
 * `case-materials` 2026.09.26-v5 (increment 6B) moved exactly the three Q&A pins: question 10 now
 * answers from the adjusted and the reported EBITDA of the same year, so the Q&A gains that answer
 * with its two supports, one more answered question in its opening count and the adjusted EBITDA
 * among its dependencies. The other nineteen pins keep their 2026.09.09-v4 values.
 *
 * `case-materials` 2026.09.26-v6 (increment 6C) moved sixteen pins: the credit memo, the term sheet,
 * the Q&A, the credit profile and the package in the three variants, and the bilingual approved
 * statements. The English text of every item now states the figures of the Portuguese one in en-US
 * separators, table cells with figures carry both languages, and every amount follows the one rule
 * of the materials (thousands below a million, so no amount that is not zero prints as zero). The
 * teasers, the workbook entry and the two single-language statements keep their values.
 */
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value, null, 1)).digest("hex");

const pins: Record<string, string> = {
  "balanceAboveSchedule:credit_memo": "77f5e966cb2b4dbb8ad34af6ccfd891d9fe4604496ee9b3f24f9e2bcd43585fe",
  "balanceAboveSchedule:term_sheet": "d0f39f7aedeeddb71a9f5e17894e8a4e3749c07221a4b932eee005cf070229b3",
  "balanceAboveSchedule:diligence_qa": "66ade8c4893d4ca7c3d35d087fd8b65f70336319bdb3622d6819eebfe5ba5a6c",
  "balanceAboveSchedule:teaser": "49a4e0b28e7664640e0db86c495f51a956d9a35f752268cf2d6353b0789740fb",
  "balanceAboveSchedule:credit_profile": "69b126773e523eb5d4243872fa768e15e694f8d8411273f6aa9d8b807f9f61f4",
  "balanceAboveSchedule:package": "b432781b83f846f90da683a691b4de3dbc07a4d76700655edc15f366668aff23",
  "withinTolerance:credit_memo": "91f418310e11f60a4e249efc6b046f8166ea9686420fc159128584c1632d74ed",
  "withinTolerance:term_sheet": "8548e8d1f543cf312a4df85a9c9fd4b4700b81d349fc1bd8d6040f5eb6e00dd4",
  "withinTolerance:diligence_qa": "9737e3226c36577a41887c09fdf84c32265b0b5afd955a0ba3e22441449a515a",
  "withinTolerance:teaser": "1c0a2e04da63748e7544c9406382153381b8bc110c8f63d248c520a4b1847f89",
  "withinTolerance:credit_profile": "b82c1618b2c19e14e0cc5296464098ba633cdc056c87dd8f390c68e42901a587",
  "withinTolerance:package": "d99d90a6a7ef7c04a68dc2b3827349b4e75f330eae26be973c7b814608982adf",
  "scheduleAboveBalance:credit_memo": "4c57f776ee506f922f472f574ae8ec11b41acc01d936cee4b250cd5aa4a6203a",
  "scheduleAboveBalance:term_sheet": "d0f39f7aedeeddb71a9f5e17894e8a4e3749c07221a4b932eee005cf070229b3",
  "scheduleAboveBalance:diligence_qa": "404695cecf738006a4ce3fe118056a2abedce37d3734e6ecf508a87d0216cffe",
  "scheduleAboveBalance:teaser": "49a4e0b28e7664640e0db86c495f51a956d9a35f752268cf2d6353b0789740fb",
  "scheduleAboveBalance:credit_profile": "75190b87d8c91f6876b61294b783ad6e5b6289ad814f1ffb7c09c9dc5441d2a2",
  "scheduleAboveBalance:package": "430f03844a66ec0138ec19bf1f79c0ca98d80855d7ab79bd1d03fee0f4f6f26b",
  "financial_model:workbook_entry": "ffecd15a3eef1dbe2b535229884c20ddaf18b32f5daa503035216ebcbd6fb736",
  "financial_model:statements": "7a9bbd4f9431f5abfff8f7c24bafe0d33cc8d1b501b41c26f08a2ef6df652769",
  "financial_model:statements:pt": "70eb018adc16a5d14469cb6f3db2076e80ae6ffc376b7650c68b2d0f56abc735",
  "financial_model:statements:en": "ae706191f9f52720f5b9867fbb896eb1701700ddbe50d2bae050dc94ec58cf35",
};

const variants: readonly SyntheticMaterialsVariant[] = ["balanceAboveSchedule", "withinTolerance", "scheduleAboveBalance"];

describe("published materials across the move to financial-core", () => {
  it("reproduce every pinned material byte for byte", () => {
    const actual: Record<string, string> = {};
    for (const variant of variants) {
      for (const material of syntheticMaterials(variant).materials) actual[`${variant}:${material.kind}`] = sha256(material);
    }
    const {workbookEntry, statements} = syntheticMaterials();
    actual["financial_model:workbook_entry"] = sha256(workbookEntry);
    actual["financial_model:statements"] = sha256(statements.bilingual);
    actual["financial_model:statements:pt"] = sha256(statements.pt);
    actual["financial_model:statements:en"] = sha256(statements.en);
    expect(actual).toEqual(pins);
  });
});
