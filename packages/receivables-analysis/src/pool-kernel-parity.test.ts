import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {analyzeReceivables} from "./analyze";
import {diversifiedReceivablesCase, receivablesParametricScenarios} from "./scenarios";
import {underwriteReceivablesPool} from "./underwrite";

/**
 * Byte-identity of the published R01 result across the migration of its mathematics into
 * `@offroad/financial-core`. The fingerprints were captured from the orchestration prototype
 * before the kernels existed (engine 2026.08.24-v1, method 2026.09.06-v1, projection
 * receivables-underwriting-coverage.v1) and the refactored analyzer must reproduce them exactly.
 * A pin moves only with a deliberate engine, method or projection version change.
 */
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const analysisFingerprint = (input: Parameters<typeof analyzeReceivables>[0]) => sha256(JSON.stringify(analyzeReceivables(input), null, 1));

const pins: Record<string, {output: string; input: string; analysis: string}> = {
  "receivables-clean-diversified": {output: "6b1a9d34071f9e82ca01aa652d8eae6038a155f416c16df42248ee89f3543d48", input: "c7fb4f5a74a9d1210ff3e8c3c86aa13d65a7bf4193ffaec0ba08eba6a506df77", analysis: "5ddc501210d7b1b433d62c6773bad0a0363cab6e3d6f0d14e49942cfc6c0c93c"},
  "r01-clean-diversified": {output: "8144315fc93cc3e8e668f11112df3f60aa83fd5e64f9f13c358c1b8c4c02fd7b", input: "25a27317319ccc995bd25bb8bfff3dc0878be7c1e9661fb77f517f20dc6b683e", analysis: "a1750874a984fc6e3236c286937ab36ea9b19d86c2f8ead42d56090cd618f500"},
  "r02-accounting-mismatch": {output: "e2865d6caf803ef52a8e883458506ed639d1c4e6dbde7d4b1039d295fc5102bc", input: "4c64a5a883f0550bfcbc8eec500c55b49960bd58b53c60cc7f4574e25da1ca59", analysis: "0c74544a423e3e437820bd234f7f2478a78a67e0da2584138e1aa4a795196ab1"},
  "r03-cash-mismatch": {output: "a96c06e6449b91d87de4a523a48e245dcd45916c256ae54e608493c7696b4a1e", input: "8ff11879d52341c19b550cb740ef46d25f2d00d03d94f14891b2857630bbbd77", analysis: "cf543640f19a9cf13a726e632ee1dc013b5be65d04b5198c6188075fd3707291"},
  "r04-evidence-gap": {output: "5735cef03ba3eb24892e8ca13f6eb3036de0f7cf39a56a03a6a66bf0a4c5a909", input: "48a156002d92544f8181969cac51c9b6e0ded57e9c45ab31dda6c0ce183c4d10", analysis: "17690d855aa7467591d6ad65d95fde7c020ea0e8e1bb7df14fee6b4e02e9f25c"},
  "r05-registration-gap": {output: "5c159e71f02fd7faedf56a7b37e8922e005d4208f8171082bd2b1c91d7516e60", input: "26ad1191f0e17eb9f3c8d46d62ccb398c2066e6bc28ee0813cb89d35511b6622", analysis: "b8d1db7c38839a624aea78c8393c5f4930d1fe13a2e0a6e34fddf01a2ac222f0"},
  "r06-registration-conflict": {output: "94512c7c7a1cb427b9e63f96e92a5f544b15820e882200d1a7bce04092f4fbdc", input: "b5330a663a84275669e256c2fcf8778623064a4641ee8508c90efc67062550a4", analysis: "8e9eecc95f757d67f32f98b19de73fca89321f76d756ea3ec372b82c6b515ac0"},
  "r07-high-delinquency": {output: "6e0e9ab057458f41d805b445afed6c590ab8f0a878bf45c8f1eca1d95df56d53", input: "cc90b1251bd2f6e43cf251322ea6e96585a7ceaf9261c43c0a687d973df7ff42", analysis: "8f16c94b4fb9de1feca96b44ba2bcb48d292831acbf66ed6b157e0d339b51ae8"},
  "r08-high-dilution": {output: "ff1913a3b3f4258c1ac05f65bae8c277be0647bd9fbee79347eedfcaa56732ec", input: "cb3a09b4b0fa90f5704de30ff9a822fdf346bced5fa7f50023f5d01c3cdf5e75", analysis: "d07c3c8d12520cbf4972f658f20b47dc86763c98f30a74954dcfb600bb78a9c6"},
  "r09-high-repurchase": {output: "540c99e1aa31c73462b581c3869ea5491266a8c39c1e48929fb5222efc19e8b3", input: "8f3bc93b1a3cde5c8a9aeb852237764c938a1bfadb2ec4ac6dd0645dfb24ea2e", analysis: "24ec7450891acad8645e0ecca9549d376f9c6868ff1d9a85431adcfb15ef9a8f"},
  "r10-low-recovery": {output: "39fd9ca3f3b3863bed5b2ff37dcd50d18cacfa1a4e4098f61850735b0df239dd", input: "02da9de0235229ff1ec16db245b833a2d008eb90b2ffe8fbb013340edf2a01bb", analysis: "b41eb30f4a413420792bb043d1330ccf8d537da1380aeddde1c3472e219ca27e"},
  "r11-single-debtor-concentration": {output: "549ae834a4a25ccd5a16c982dde81ae97ae8ff5b4b247dd1e3670f4d3c132e3b", input: "e2979a32837d0dd12e78175e928d237b4fe883ffdefe9088305b76c493da26b8", analysis: "de9fa937e5b90f9d0387a8d77174b601b55f310d1f4b31ea778b34d775c02ddc"},
  "r12-group-concentration": {output: "d1c0a3a66335c95682fa5b7703053b7bc281f0a8bc9df40bd42851c40d4a133b", input: "25d8d3e0f04cd933a63bf72bd6a065bfdc79ed419711840204397ca62786b6e8", analysis: "ae787088849e85b4dcd4cfbb39d65e0cf3feecde14c2a8e6bb466d3308b04816"},
  "r13-disputed-exclusions": {output: "64dc57a7c94880a07fc1736330e8ce500b3364755ad42288935746a43cc20c40", input: "46f24dfef0a7face51362da68b8bca3358785f69668c8d26b54f8aab9d16eb0e", analysis: "a71b501eac52150c27d82dbe93e76e309bb1014f642b76eb082eded99d04cf69"},
  "r14-related-party-exclusions": {output: "891eed921dfe058adadafec8e7ddfeffdfe3a7e78bc51a2f0836c7194c7b0351", input: "18ae2594472118b727e11c30db77dd869b8265f09bf26142a7223a7005e0d184", analysis: "d6392389e6a67a381fe2d765f46c5c5dc2cce27c3f9fff8730631985aab65463"},
  "r15-encumbered-base": {output: "a014bba6c90bd8d04fe7015fbf36082d83409062bfe78020f4d87cb90c5f2b79", input: "590c4315c4513b10793ad7cdb1566ebaabce684da47e79cc8636dce7554dcdad", analysis: "b29439a4d2e03182fe63bb2c342a0ff9c8a5887726eb0fd681fcaf5fba3a8b44"},
  "r16-nonassignable-base": {output: "a7a545d19602e6d201fbd9020ed714412bccbb2a58818cf0f7fa21c21bcaea28", input: "38c5afba7297390467fd5fd86c2cd13c50aee91394963749dd1f280d5acd4f9e", analysis: "133f9f8055c3d154f4d0ad86b190e722aa99f6cbedb70f4d71521d8ed9822f10"},
  "r17-long-tenor-base": {output: "25b286664742cd32cef8f1e710deed37aba46e5fc64324b1502b57b10696c144", input: "3c52c1563d10f706443d966e10c0b312b85f3f2f9bd6f8e84a0a0cda67fb2104", analysis: "bd9d37ddad56d626aa4d62ffe276d0dac6c4943defa171ba78acae5348d82c5f"},
  "r18-unseasoned-base": {output: "22774b28a6255f40d82bb39af3c334d2a92816846c3697ea36df4a8f5b26f3ac", input: "2ce9e4b89db87bc583694e6b5b1b6d547b24b1e83f1155b496ce57bc41fdcd78", analysis: "e6b20efd7cc1bf86abacad1d243e1420adc148f0504fe90266072bf6ae58e516"},
  "r19-no-eligible-base": {output: "12d1af7796050e276401895b12a466416f2bcdcaca14c7d9b839bbcde9cf1d9e", input: "236958eafd944e3b3df838e384b890b8e9a5618e593086e7426c172b3ce017ca", analysis: "2e4eceb6103d9633be2981b298c7403ca605912fc14fa11632350384b2cfd5fc"},
  "r20-duplicate-cash": {output: "29ba9a8cafd433935e05f9107a4ab5cc6cd7dda5ea1964e5b838aad1c0dde60b", input: "3749a21fde8f374fc65cb3a223f979c7fb59775e03dc351de73b402a31f29129", analysis: "b3eac086e413bf6b99e9e2403c3781da5da1f3214ff45187db04221a3fb814c5"},
  "r21-unmapped-cash": {output: "b649041d8bdbf49ebe7c65836a9d530876813c3685a5354e7c857b463c036a31", input: "f95fcbf0117b5ca534d15c9c5a2d6d9e9783d221e775133ecd62f7206368de7d", analysis: "a1407b6ce928e8133e994b26527af2f9aa2cff6139c9e4008f25eb5fccc0b6a7"},
  "r22-unlinked-cash": {output: "a7f94c6b7d3870db6622182b87d04e60493e2d73cacd040d9d17aef407e4d456", input: "280d201911b226b3ff645a6c8aeefdb05fe1ea7b0fa14616b1264d3fa3b76dcb", analysis: "533c8c15b0bc00371e384f38d0ac5565772b4b84188a52974107c4e244d82e8d"},
  "r23-subordination-shortfall": {output: "c27607e5852a2d2bfc4d8b30850df70871cbdc47ac5393a5c2d7225b0aa65a4d", input: "477be6773054e056fc9f7fc21425afb22a03b2f3f1d76f35a2d737ed9fa680a5", analysis: "427d23d464a2be122ae517de58c92f9f85194780e2616ccd83a6459f9de17b4e"},
  "r24-waterfall-shortfall": {output: "c26f1da14a252ff43e6e022d934db7a63903075dfe1805ce2ca259960cf92c4b", input: "a242a57f48c34963f403e5227c5f2e8f1836c9187ee3256d62d11cfe4969931b", analysis: "4bafcd2188e5648fea69f228f966dbc68d061d1f96e6cfd3cb3a869f35183823"},
  "r25-sector-exclusion": {output: "1a5253021e033336c14cfcdc70dc936a52142a0dfe2149e172c52ee7d79866a9", input: "78698f469f5b99607651c110df884ae9c3d4c164e328fa8ca9a44bf02647a641", analysis: "4a6ff75b83c76a74ce560d4d0c0671d6d1e7d641a678543909f8f41cef4bd761"},
  "r26-facility-above-base": {output: "17bf9211a7b5e1fd6daa436a069190bd413f7ac690929ccc743a95cd70464be2", input: "4e7e4b7e667c4c4ce84d5390823578bba8719fc17416362d41b447cc9cf3748c", analysis: "b6d70112727dff32fd65a4f7e267a3c6a7c8386def0b83e926ebdd24e1050eb6"},
  "r27-unknown-cash-mapping": {output: "9367ff5260b2b8b7e4a2e564c1fb7543765274ba9ffab8af3fe56113140b0c9e", input: "49bd9d86d8a5fe2b76b34c9e4d09d3a81155f0f3a5ba4867c2d76eda6233c88e", analysis: "0fc71cea73ba8737ca17b76dffc771e3053d57010f07bcd751aee3749bcfc315"},
  "r28-unanchored-cash": {output: "41eb996dcd11b05b7aa77920c446d07e5a1cc86f2fde4d207efc373f1695aed5", input: "ef2e1299e8e7d4b988577af7f85d509c9c24f1fad3cb110ba9e59469d82bff5e", analysis: "08a0caeb5517f062fa602cc0448932569e2fb729560ac912ec2f4535e66237f3"},
};

function overlappingConcentrationCase() {
  const input = diversifiedReceivablesCase();
  input.portfolio.forEach((row, index) => {
    const debtor = index < 20 ? "a1" : index < 30 ? "a2" : index < 40 ? "b" : index < 50 ? "c" : "d";
    row.debtorId = debtor;
    row.debtorGroupId = debtor.startsWith("a") ? "a" : debtor;
  });
  input.cashReceipts.forEach((receipt) => { receipt.debtorId = "a1"; });
  return input;
}

describe("financial-core kernel parity of the R01 result", () => {
  it("reproduces the clean diversified pool exactly", () => {
    const input = diversifiedReceivablesCase();
    const result = underwriteReceivablesPool({currency: "BRL", case: input});
    expect(result.trace.output_fingerprint).toBe(pins["receivables-clean-diversified"]!.output);
    expect(result.trace.input_fingerprint).toBe(pins["receivables-clean-diversified"]!.input);
    expect(analysisFingerprint(input)).toBe(pins["receivables-clean-diversified"]!.analysis);
    expect(result.trace.engine_version).toBe("2026.08.24-v1");
  });

  it.each(receivablesParametricScenarios.map((scenario) => [scenario.id, scenario.input] as const))("reproduces %s exactly", (id, input) => {
    const pin = pins[id];
    expect(pin, `missing pin for ${id}`).toBeDefined();
    const result = underwriteReceivablesPool({currency: "BRL", case: input});
    expect(result.trace.output_fingerprint).toBe(pin!.output);
    expect(result.trace.input_fingerprint).toBe(pin!.input);
    expect(analysisFingerprint(input)).toBe(pin!.analysis);
  });

  it("reproduces the overlapping-concentration gold and stays byte-stable under row reordering", () => {
    const overlapping = underwriteReceivablesPool({currency: "BRL", case: overlappingConcentrationCase()});
    expect(overlapping.trace.output_fingerprint).toBe("97640ec61e40d1d1114d593ee0457d1361236c15cc65a147016e531cbeec92a1");
    expect(overlapping.portfolio_summary.concentrationAdjustedEligibleBalance).toBe("4500000.00");
    expect(overlapping.borrowing_base.supportedFacility).toBe("3600000.00");
    const reversed = structuredClone(diversifiedReceivablesCase());
    reversed.portfolio.reverse();
    reversed.cashReceipts.reverse();
    expect(underwriteReceivablesPool({currency: "BRL", case: reversed}).trace.output_fingerprint).toBe(pins["receivables-clean-diversified"]!.output);
    expect(analysisFingerprint(reversed)).toBe("9e455c6d7ae9373006e39e50f55eb000ccb034707a74b55e45edd9033c028f51");
  });

  it("pins every parametric scenario, so a new scenario needs a deliberate new pin", () => {
    expect(Object.keys(pins).filter((id) => id !== "receivables-clean-diversified").sort()).toEqual(receivablesParametricScenarios.map((scenario) => scenario.id).sort());
  });
});
