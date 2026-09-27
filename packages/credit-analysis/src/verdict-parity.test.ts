import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {deskRuns} from "./verdict-cases.test-support";

/**
 * Byte-identity of the operation verdict across the move of its arithmetic into
 * `@offroad/financial-core` (stage 19, increments 6B and 6C). The fingerprints were captured from
 * the floating-point `verdict.ts` before the kernels were used, over the twelve fixture runs that
 * reach the verdict (`verdict-cases.test-support.ts`: the gold answer keys unpriced and priced, the
 * CCB of Fakeco, the simulated ask of Camil and the synthetic Aurora case unpriced and priced).
 * Together they print the spread band of the requested structure, the same spread for the bigger
 * ticket, a wider low end for it and the saving of the shorter road. A pin moves only with a
 * deliberate change of the verdict.
 *
 * Increment 6C moved its remaining arithmetic into financial-core with every pin unchanged, then
 * moved all twelve pins deliberately, for two reasons only. The English notes now print every
 * figure in en-US separators and carry the figures the Portuguese states (12 months, 60 months and
 * 12 of grace, the price gaps of the two alternatives), because invariant 9 forbids a different
 * economic payload. And every amount follows the one rule of the materials, so an amount of zero
 * prints "R$ 0" instead of "R$ 0,0M"; that is the only change of the Portuguese notes on these
 * fixtures. Every field other than the texts is unchanged.
 */
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value, null, 1)).digest("hex");

const pins: Record<string, string> = {
  "gold:camil:unpriced": "05f5174966637501e81dbee1e652b9b37f10c4fcca856ef546b2c11e02d34d1b",
  "gold:camil:cra": "66e6c5e2af2319c7191ee1ca29a3af920bb7c06ad8e0cfabdb53b9921fa04922",
  "gold:fakeco:unpriced": "8ea841f4baaf1ae2cd8b74c651c88f49d56dd9166a83c952e710496b1d84046c",
  "gold:fakeco:cra": "9c73c05662bd17cf6ec68a923b950ab4c67bda6df0720b212fc4046159c2f07e",
  "gold:nimbus:unpriced": "07586af1800d2ba67da1743cea3a515c64cae15766d72e9c629bb67a4790da60",
  "gold:nimbus:cra": "51d34c7ecacd4df38285e22ab2ec41a098ddfc3dec8ffb3fa3811150d273886d",
  "gold:rede-horizonte:unpriced": "c73f271608389ee472ea4eba88944be8b9dbe2ef3a659afd184ae156a4729c24",
  "gold:rede-horizonte:cra": "ad7ee44faed8cd477c856a0f3d496d54293f84e4ccdc1d22d2299d3026715bf2",
  "gold:fakeco:ccb": "fadad7e8353b76fc2d1ee62cdd88b16092d2b207f426e9ebd2ddff17125afa99",
  "gold:camil:cra:ask-800": "7310bbe8736fcbb050d4e919c0dbe5c7f404f9ef7a7d2cc2af4c3a3e90996715",
  "aurora:unpriced": "2a2c788043bac9faec04edd69a6ad98e42470c088447e5712a73650aba5b96a8",
  "aurora:ccb": "030c7ea378883835a8a60c11917fa451246a36b3f85f450b48fddd105793ab05",
};

describe("the operation verdict across the move to financial-core", () => {
  const verdicts = Object.fromEntries(Object.entries(deskRuns()).map(([key, run]) => [key, run.verdict]));

  it("reaches every sentence that prints basis points", () => {
    const notes = Object.values(verdicts).flatMap((verdict) => [...verdict.solves, ...verdict.alternatives.map((alternative) => alternative.tradeoff)]).map((note) => note.pt);
    expect(notes.filter((note) => note.startsWith("No mercado de hoje esta estrutura sai a CDI + ")).length).toBeGreaterThan(0);
    expect(notes.filter((note) => note.includes(", o mesmo spread, porque")).length).toBeGreaterThan(0);
    expect(notes.filter((note) => note.includes("ponto percentual na ponta baixa")).length).toBeGreaterThan(0);
    expect(notes.filter((note) => note.includes("ponto percentual economizado ao encurtar")).length).toBeGreaterThan(0);
  });

  it("reproduces every pinned verdict byte for byte", () => {
    const actual = Object.fromEntries(Object.entries(verdicts).map(([key, verdict]) => [key, sha256(verdict)]));
    expect(actual).toEqual(pins);
  });
});
