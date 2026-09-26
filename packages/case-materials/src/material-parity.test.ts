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
 */
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value, null, 1)).digest("hex");

const pins: Record<string, string> = {
  "balanceAboveSchedule:credit_memo": "b8556ff78617dbf0bedd030138cef9d458095f304ce3cfbeb785e5ef24ea879d",
  "balanceAboveSchedule:term_sheet": "a60a43c83381a3e0fce09c9ef7eafc3fa459af0003e2b5c45197318cae6230e6",
  "balanceAboveSchedule:diligence_qa": "a3a83e9589a9a5484540c73db231bef5f8a0d7c2481f1acb09822145afbe5c11",
  "balanceAboveSchedule:teaser": "49a4e0b28e7664640e0db86c495f51a956d9a35f752268cf2d6353b0789740fb",
  "balanceAboveSchedule:credit_profile": "ad78d19b52e4cf4f65346f4b3b67a2b36dd5f70f8f201045c62b7b9c6c7352d5",
  "balanceAboveSchedule:package": "96ab35d093953de7a9f65906005c696f458d84948b15bcf40ce8f5e6b362d283",
  "withinTolerance:credit_memo": "49ca8180b531d8dc15db9633edd959f7d32d75ab4c395bffb6e0749a2837bb61",
  "withinTolerance:term_sheet": "2723564a383279e2811baff31b056e3e664bf981d34892ba218155412dbb1cb1",
  "withinTolerance:diligence_qa": "1d65d42e5b9361b9d15e6bb63400ecca3df3a54cf6a0a19afa4d6976cf60c09c",
  "withinTolerance:teaser": "1c0a2e04da63748e7544c9406382153381b8bc110c8f63d248c520a4b1847f89",
  "withinTolerance:credit_profile": "56009e488a1f6f581c7f011f696c3b2a27d1ed991a49e7f5d07f8ae8d4145430",
  "withinTolerance:package": "03bd27678e1ddc0e944921c1da9dff7cd4fb8bb3fbb5f6493f04c7f55d448c0d",
  "scheduleAboveBalance:credit_memo": "8e6a6d74e2703f79e2e99841337dd0bd21f3cc1194ffb4bc9718f7403926d82a",
  "scheduleAboveBalance:term_sheet": "a60a43c83381a3e0fce09c9ef7eafc3fa459af0003e2b5c45197318cae6230e6",
  "scheduleAboveBalance:diligence_qa": "9df3538b0e37a93aabbe73788cb3fd5ca07008f1a7e9911b5c985b6613cd3901",
  "scheduleAboveBalance:teaser": "49a4e0b28e7664640e0db86c495f51a956d9a35f752268cf2d6353b0789740fb",
  "scheduleAboveBalance:credit_profile": "cf3013423733694f614e3c852a781c81aa6f8f1dcdf0ef1f2ba6e045def53856",
  "scheduleAboveBalance:package": "3365fa4eec65af4ba5683e77184f38e3b5f7f444c83a3566f8f76921f3d5b9a4",
  "financial_model:workbook_entry": "ffecd15a3eef1dbe2b535229884c20ddaf18b32f5daa503035216ebcbd6fb736",
  "financial_model:statements": "1e6ad41ab87022bbc0e517336d15e3cc07375ba5dba304c569a577b579c41dc4",
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
