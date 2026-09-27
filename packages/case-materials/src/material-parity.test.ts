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
 *
 * `case-materials` 2026.09.27-v7 (post-closure polish of stage 19) moved nine pins: the credit memo,
 * the term sheet and the package in the three variants, because visible text no longer shows an
 * internal identifier or a dash. The memo names the basis of the price (the instrument by its
 * catalog name, the analytical profile by its band) and each price adjustment in words ("Ajuste
 * pelas garantias", not "Ajuste: security"); the term sheet states the tenor and grace bands in
 * words ("entre 48 e 84 meses", not "48–84 meses"); the package prints where each term came from in
 * words ("Pedido da companhia", not "company_request"). Compared item by item, nothing else changed
 * but the fingerprint of the shadow conduct audit of the memo and the term sheet, whose findings are
 * the same. The move of the desk, trajectory and price arithmetic into financial-core kept every pin.
 *
 * `case-materials` 2026.09.27-v8 (stage 19, second polish) moved three pins: the credit memo in the
 * three variants, because the English reason of the two closed debentures named the legal form by its
 * key ("Requires sa; the company is ltda.") and now names it in words ("Requires a sociedade anônima;
 * the company is a limitada."). Compared item by item, nothing else changed but the fingerprint of
 * the shadow conduct audit of the memo, whose findings are the same. A ratio of the desk or of the
 * trajectory over a zero denominator is now absent, and every material names its gap in words where
 * it printed the ratio (`absent-ratios.test.ts`); before, such a case compiled no material, and no
 * pinned case has one. The memorandum names the price basis through the labels the price reference
 * now exports, with the same bytes.
 */
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value, null, 1)).digest("hex");

const pins: Record<string, string> = {
  "balanceAboveSchedule:credit_memo": "dba130cdcd96170662964332de61e22daccc36e87fd43c0802378da0804e15cd",
  "balanceAboveSchedule:term_sheet": "c3b2780e210ed54b1cb30bae673afe5c76ba27011d39729315d70113db3add6a",
  "balanceAboveSchedule:diligence_qa": "66ade8c4893d4ca7c3d35d087fd8b65f70336319bdb3622d6819eebfe5ba5a6c",
  "balanceAboveSchedule:teaser": "49a4e0b28e7664640e0db86c495f51a956d9a35f752268cf2d6353b0789740fb",
  "balanceAboveSchedule:credit_profile": "69b126773e523eb5d4243872fa768e15e694f8d8411273f6aa9d8b807f9f61f4",
  "balanceAboveSchedule:package": "780e3110a7c3e969a75b7c5e6b655e31830900aacd002f218b5a163a2e3698d0",
  "withinTolerance:credit_memo": "55af0bd73a1a39ed9505942425eb76402f72d5a0bce90144237e71d0aeaab66d",
  "withinTolerance:term_sheet": "8e91a5f967f906f14953d95ea94817ffb043a28ea9739a1df9b96849b64d152b",
  "withinTolerance:diligence_qa": "9737e3226c36577a41887c09fdf84c32265b0b5afd955a0ba3e22441449a515a",
  "withinTolerance:teaser": "1c0a2e04da63748e7544c9406382153381b8bc110c8f63d248c520a4b1847f89",
  "withinTolerance:credit_profile": "b82c1618b2c19e14e0cc5296464098ba633cdc056c87dd8f390c68e42901a587",
  "withinTolerance:package": "688d34760bac8bf095bcad9c1ae44ddc9f8269205be410488ae5a1ed312a6992",
  "scheduleAboveBalance:credit_memo": "76940fef947ca7670fe1119e197a2e503d3b7a85078728fca39cbccd3ad89ca1",
  "scheduleAboveBalance:term_sheet": "c3b2780e210ed54b1cb30bae673afe5c76ba27011d39729315d70113db3add6a",
  "scheduleAboveBalance:diligence_qa": "404695cecf738006a4ce3fe118056a2abedce37d3734e6ecf508a87d0216cffe",
  "scheduleAboveBalance:teaser": "49a4e0b28e7664640e0db86c495f51a956d9a35f752268cf2d6353b0789740fb",
  "scheduleAboveBalance:credit_profile": "75190b87d8c91f6876b61294b783ad6e5b6289ad814f1ffb7c09c9dc5441d2a2",
  "scheduleAboveBalance:package": "bb1527855f4794546b12e6be1a7beb7e568e9c2a78ddbaf6db2cd5e18d0ca134",
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
