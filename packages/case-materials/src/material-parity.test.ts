import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {syntheticMaterials, type SyntheticMaterialsVariant} from "./synthetic-materials.test-support";

/**
 * Byte-identity of the published materials across the move of their arithmetic into
 * `@offroad/financial-core` (stage 19, increment 6). The fingerprints were captured from
 * `case-materials` 2026.09.09-v4 before the kernels existed, over the synthetic Aurora case in its
 * three debt-schedule variants (balance above the schedule, within the 2% tolerance, schedule above
 * the balance), and the refactored compilers must reproduce them exactly. The case reaches every
 * number the package computes: sources and uses, the top-five concentration and the largest
 * customer, the schedule tie-out in its three outcomes, the alternative in millions, the price range
 * in percent, the ratios the statements round and the chart points. A pin moves only with a
 * deliberate `caseMaterialsVersion` change.
 */
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value, null, 1)).digest("hex");

const pins: Record<string, string> = {
  "balanceAboveSchedule:credit_memo": "91952cd2865abdc989cf591e267f6620e0803547aacff2d1a24ad3513035af6d",
  "balanceAboveSchedule:term_sheet": "b71bf49acf273e3add5cdcf777823c096abd29868f3533eb561c5b9716de8d36",
  "balanceAboveSchedule:diligence_qa": "a3a83e9589a9a5484540c73db231bef5f8a0d7c2481f1acb09822145afbe5c11",
  "balanceAboveSchedule:teaser": "f5eb91ed81c9e181246dee67eb3e07a16a736f3a758c2180f63056328efff7ac",
  "balanceAboveSchedule:credit_profile": "06acb12e458ae31b67732e139b2dc049b1bf5a644399e0a691fd949ffa12487a",
  "balanceAboveSchedule:package": "379b598c6475c4def46b3d7cb10d7b9b494c4c5e575057d7aadadb2657856519",
  "withinTolerance:credit_memo": "c9a5fd742209ce4039c166005900f7d93a6ab55937332a45926687ea006152e9",
  "withinTolerance:term_sheet": "5fbfb3405cbf7f589664a53f51d5ed396b2871e6dae270a811fd3a89a425d38b",
  "withinTolerance:diligence_qa": "1d65d42e5b9361b9d15e6bb63400ecca3df3a54cf6a0a19afa4d6976cf60c09c",
  "withinTolerance:teaser": "ca757397222786cd5760ab8967f851e283b5efa6500ea84d43cb7317704b355b",
  "withinTolerance:credit_profile": "dcf50ecd7e04bac407bcdba5e85e2c24c91f9c20ca497aaf42b55d45d03d75ce",
  "withinTolerance:package": "8b4725521e2ebbc1758eb259ee46bb9666cf65f6a98512a22d1cdfb8491c6812",
  "scheduleAboveBalance:credit_memo": "d6396b499098ba5b4eb07a2b6d3117d82d7936684ec5a7a0c0237ce690d8692f",
  "scheduleAboveBalance:term_sheet": "b71bf49acf273e3add5cdcf777823c096abd29868f3533eb561c5b9716de8d36",
  "scheduleAboveBalance:diligence_qa": "9df3538b0e37a93aabbe73788cb3fd5ca07008f1a7e9911b5c985b6613cd3901",
  "scheduleAboveBalance:teaser": "f5eb91ed81c9e181246dee67eb3e07a16a736f3a758c2180f63056328efff7ac",
  "scheduleAboveBalance:credit_profile": "3d1b75bc338866ec3862c62ff1f2199e6aefe786b65384a6c03746b0a6121107",
  "scheduleAboveBalance:package": "c21736f3553d138272a702ca0c42af6e7b8830f5c619b37fcc7b196a9723f101",
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
