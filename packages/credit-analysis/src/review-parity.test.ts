import {createHash} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import Decimal from "decimal.js";
import {syntheticCreditMaterialsCase as aurora} from "@offroad/testing-fixtures/credit-materials-case";
import {describe, expect, it} from "vitest";

import {analyzeCreditPosition, type DeskAnalysis} from "./analyze";
import {deskCases} from "./desk-cases.test-support";
import {buildDeskInputs, type DeskInputsOptions, type Fact} from "./from-facts";
import {effectiveAnnualCost, parseCovenant, parseRate, parseReceivablesCoverage} from "./parse";
import {rateCredit, type RatingInput} from "./rating";
import {stressTable, type StressInput} from "./stress";
import {projectLeverageTrajectory, type Trajectory} from "./trajectory";

/**
 * Byte-identity of the internal rating, the stress table, the desk inputs built from facts and the
 * reading of rates, covenants and receivables coverage, across the move of their arithmetic into
 * `@offroad/financial-core` (stage 19, third polish). The fingerprints were captured from `rating.ts`,
 * `stress.ts`, `from-facts.ts` and `parse.ts` as the second polish left them, before any kernel was
 * used:
 *
 * - the rating of every desk of `desk-cases.test-support.ts`, with and without its trajectory, under
 *   eight sets of optional inputs that reach every band of coverage, trend, concentration and
 *   evidence at its exact edge, plus desks varied to reach every band of leverage, liquidity and
 *   runway, and the rating the materials compile for the synthetic Aurora case;
 * - the stress table of every desk under the stated amount, revenue and customer inputs, plus desks
 *   varied to reach no covenant, no cost, an EBITDA of zero and below, and a cycle absent;
 * - the desk inputs of every case, of every gold answer key and of the Aurora case of the materials,
 *   with a stated request above, below and equal to the documents and month counts written apart;
 * - the reading of every rate, covenant and coverage text the fixtures carry and of the forms the
 *   grammar admits, at two sets of index levels.
 *
 * A pin moves only with a deliberate change.
 */
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value, null, 1)).digest("hex");

const here = dirname(fileURLToPath(import.meta.url));
const goldFacts = (caseId: string): Fact[] | null => {
  const path = resolve(here, "../../testing-fixtures/gold", caseId, "expected/fields.json");
  if (!existsSync(path)) return null;
  return (JSON.parse(readFileSync(path, "utf8")) as Array<{fieldPath: string; value: string}>).map((field) => ({fieldPath: field.fieldPath, value: field.value}));
};

type Analysed = {desk: DeskAnalysis; trajectory: Trajectory | null; revenue: string};

/** Every desk of the desk cases, analysed, with its trajectory and the revenue it was built on. */
function analysedDesks(): Record<string, Analysed> {
  const desks: Record<string, Analysed> = {};
  for (const [key, entry] of Object.entries(deskCases())) {
    if (!entry.desk) continue;
    desks[key] = {
      desk: analyzeCreditPosition(entry.desk),
      trajectory: entry.trajectory ? projectLeverageTrajectory(entry.trajectory) : null,
      revenue: entry.desk.audited.revenue,
    };
  }
  return desks;
}

type RatingOptions = Omit<RatingInput, "desk" | "trajectory">;

/** Eight sets of optional inputs: every band of coverage, trend, concentration and evidence, at its exact edge. */
function ratingProfiles(ebitda: string): Array<[string, RatingOptions]> {
  const e = new Decimal(ebitda);
  const over = (divisor: string) => e.div(divisor).toFixed();
  const times = (factor: string) => e.times(factor).toFixed();
  return [
    ["none", {}],
    ["strong", {financialExpenses: over("8"), priorEbitda: times("0.8"), topCustomerShare: "0.05", evidenceRank: "1"}],
    ["edges-high", {financialExpenses: over("4"), priorEbitda: ebitda, topCustomerShare: "0.1", evidenceRank: "1.5"}],
    ["edges-mid", {financialExpenses: over("2.5"), priorEbitda: times("1.25"), topCustomerShare: "0.2", evidenceRank: "3"}],
    ["edges-low", {financialExpenses: e.div("1.5").neg().toFixed(), priorEbitda: "0", topCustomerShare: "0.3", evidenceRank: "4.5"}],
    ["moderate", {financialExpenses: over("3"), priorEbitda: times("0.9"), topCustomerShare: "0.15", evidenceRank: "2"}],
    ["weak", {financialExpenses: over("1.25"), priorEbitda: e.neg().toFixed(), topCustomerShare: "0.5", evidenceRank: "6"}],
    ["critical", {financialExpenses: "0", priorEbitda: times("2"), topCustomerShare: "0.51", evidenceRank: "7"}],
  ];
}

/** Desks varied to reach every band of leverage, liquidity and runway. */
function variedDesks(desks: Record<string, Analysed>): Record<string, Analysed> {
  const base = desks["unit:aurora"]!;
  const burning = desks["unit:nimbus"]!;
  const varied: Record<string, Analysed> = {};
  for (const preTurns of ["1.4999", "1.5", "2.5", "3.5", "4.5", "4.5001", null, "Infinity"]) {
    varied[`leverage:${preTurns}`] = {...base, trajectory: null, desk: {...base.desk, leverage: {...base.desk.leverage, scenarios: [], preTurns}}};
  }
  for (const coverage of ["0.4999", "0.5", "1", "1.5", "2.5", null]) {
    varied[`liquidity:${coverage}`] = {...base, desk: {...base.desk, stack: {...base.desk.stack, liquidityCoverage12: coverage, maturingWithin12Months: "5000000.00"}}};
  }
  varied["liquidity:nothing-due"] = {...base, desk: {...base.desk, stack: {...base.desk.stack, liquidityCoverage12: null, maturingWithin12Months: "0.00"}}};
  for (const months of ["5.9", "6", "12", "18", "24", null, "Infinity"]) {
    varied[`runway:${months}`] = {...burning, desk: {...burning.desk, runway: {...burning.desk.runway!, monthsPostAfterService: months}}};
  }
  varied["runway:none"] = {...burning, desk: {...burning.desk, runway: null}};
  return varied;
}

function ratings(): Record<string, string> {
  const desks = analysedDesks();
  const pins: Record<string, string> = {};
  for (const [key, entry] of Object.entries({...desks, ...variedDesks(desks)})) {
    const outputs = ratingProfiles(entry.desk.leverage.ebitda).flatMap(([profile, options]) => [
      {profile, trajectory: false, rating: rateCredit({desk: entry.desk, trajectory: null, ...options})},
      ...(entry.trajectory ? [{profile, trajectory: true, rating: rateCredit({desk: entry.desk, trajectory: entry.trajectory, ...options})}] : []),
    ]);
    pins[key] = sha256(outputs);
  }
  // The rating the materials compile for the synthetic Aurora case.
  const materials = buildDeskInputs(aurora.facts.map((fact) => ({fieldPath: fact.fieldPath, value: fact.value})), {referenceDate: aurora.referenceDate, indexLevels: aurora.indexLevels, statedRequest: aurora.statedRequest});
  const desk = analyzeCreditPosition(materials.desk!);
  const trajectory = materials.trajectory ? projectLeverageTrajectory(materials.trajectory) : null;
  pins["materials:aurora"] = sha256({rating: rateCredit({desk, trajectory, ...aurora.rating}), stress: stressTable({desk, ...aurora.stress})});
  return pins;
}

function stressDesks(desks: Record<string, Analysed>): Record<string, Analysed> {
  const base = desks["unit:aurora"]!;
  return {
    "stress:no-covenant": {...base, desk: {...base.desk, leverage: {...base.desk.leverage, tightestCovenant: null}}},
    "stress:no-cost": {...base, desk: {...base.desk, stack: {...base.desk.stack, weightedCost: null}}},
    "stress:zero-ebitda": {...base, desk: {...base.desk, leverage: {...base.desk.leverage, ebitda: "0.00"}}},
    "stress:negative-ebitda": {...base, desk: {...base.desk, leverage: {...base.desk.leverage, ebitda: "-1000000.00"}}},
    "stress:cycle-absent": {...base, desk: {...base.desk, workingCapital: {...base.desk.workingCapital, cycleDays: null}, absentRatios: [{field: "workingCapital.cycleDays", gap: "cost_of_goods_sold"}]}},
    "stress:cycle-stored-as-division": {...base, desk: {...base.desk, workingCapital: {...base.desk.workingCapital, cycleDays: "Infinity"}}},
    "stress:cycle-not-computed": {...base, desk: {...base.desk, workingCapital: {...base.desk.workingCapital, cycleDays: null}}},
    "stress:cdi-13.65": {...base, desk: {...base.desk, assumptions: {...base.desk.assumptions, cdi: "0.136500"}}},
    "stress:no-scenarios": {...base, desk: {...base.desk, leverage: {...base.desk.leverage, scenarios: []}}},
  };
}

function stresses(): Record<string, string> {
  const desks = analysedDesks();
  const pins: Record<string, string> = {};
  for (const [key, entry] of Object.entries({...desks, ...stressDesks(desks)})) {
    const variants: Array<[string, Omit<StressInput, "desk">]> = [
      ["none", {}],
      ["amount", {amount: "10000000"}],
      ["zero-amount", {amount: "0"}],
      ["revenue", {revenue: entry.revenue}],
      ["customer", {revenue: entry.revenue, topCustomerShare: "0.181"}],
      ["customer-margin", {revenue: entry.revenue, topCustomerShare: "0.25", lostCustomerMargin: "0.5"}],
      ["customer-without-revenue", {topCustomerShare: "0.25"}],
    ];
    pins[key] = sha256(variants.map(([variant, options]) => ({variant, table: stressTable({desk: entry.desk, ...options})})));
  }
  return pins;
}

const goldOptions: DeskInputsOptions = {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105", tlp: "0.079", ipca: "0.045", tr: "0.002"}};

function deskInputs(): Record<string, string> {
  const pins: Record<string, string> = {};
  for (const [key, entry] of Object.entries(deskCases())) pins[`case:${key}`] = sha256(entry);
  for (const caseId of ["camil", "cogna", "fakeco", "fakeco-scan", "nimbus", "rede-horizonte"]) {
    const facts = goldFacts(caseId);
    if (!facts) continue;
    const amount = facts.find((fact) => fact.fieldPath === "transaction.requested_amount")?.value;
    const larger = amount ? new Decimal(amount).times(2).toFixed() : "1000000";
    const smaller = amount ? new Decimal(amount).div(2).toFixed() : "1000";
    const variants: Array<[string, DeskInputsOptions]> = [
      ["as-read", goldOptions],
      ["stated-larger", {...goldOptions, statedRequest: {amount: larger, termMonths: 60, graceMonths: 18, expectedRate: "CDI + 2,50% a.a."}}],
      ["stated-smaller", {...goldOptions, statedRequest: {amount: smaller}}],
      ["stated-equal", {...goldOptions, statedRequest: {amount: amount ?? "1000"}}],
      ["stated-equal-written-apart", {...goldOptions, statedRequest: {amount: amount ? `${amount}.00` : "1000.00"}}],
    ];
    pins[`gold:${caseId}`] = sha256(variants.map(([variant, options]) => ({variant, inputs: buildDeskInputs(facts, options)})));
  }
  const materialsFacts: Fact[] = aurora.facts.map((fact) => ({fieldPath: fact.fieldPath, value: fact.value}));
  const materialsOptions: DeskInputsOptions = {referenceDate: aurora.referenceDate, indexLevels: aurora.indexLevels, statedRequest: aurora.statedRequest};
  const replace = (path: string, value: string) => [...materialsFacts.filter((fact) => fact.fieldPath !== path), {fieldPath: path, value}];
  const monthVariants = ["48", "48.0", "4.8e1", " 48 "].map((text) => ({
    text,
    inputs: buildDeskInputs(replace("transaction.desired_term_months", text), {...materialsOptions, statedRequest: {amount: "40000000"}}),
  }));
  const withoutStatedTerm = materialsFacts.filter((fact) => fact.fieldPath !== "transaction.desired_term_months");
  pins["materials:aurora"] = sha256({
    asRead: buildDeskInputs(materialsFacts, materialsOptions),
    months: monthVariants,
    noTerm: buildDeskInputs(withoutStatedTerm, materialsOptions),
    zeroEbitda: buildDeskInputs(materialsFacts.map((fact) => (/^historical_financials\.\d{4}\.ebitda$/.test(fact.fieldPath) ? {...fact, value: "0"} : fact)), materialsOptions),
    negativeEbitda: buildDeskInputs(materialsFacts.map((fact) => (/^historical_financials\.\d{4}\.ebitda$/.test(fact.fieldPath) ? {...fact, value: "-500000"} : fact)), materialsOptions),
  });
  return pins;
}

const rateTexts = [
  "CDI + 4,10% a.a.", "CDI + 3,85% a.a.", "CDI + 4,45% a.a.", "CDI + 5,20% a.a.", "CDI + 1,55% a.a.", "CDI + 0,65% a.a.", "CDI + 5,00%", "cdi+4,1%",
  "CDI + 1.234,5% a.a.", "CDI + 0% a.a.", "TLP + 2,90% a.a.", "IPCA + 6,3416% a.a.", "IPCA + 8,7% a.a.", "SELIC + 1,25% a.a.", "TR + 5,00% a.a.",
  "112% do CDI", "104% do DI", "105% da taxa DI", "100% CDI", "98,5% do CDI", "1,42% a.m.", "1,18% a.m.", "pré 1,18% a.m.", "0,99% am", "2% a.m.",
  "16,5% a.a.", "pré 16,5% a.a.", "14,15% a.a. pré", "14,15% a.a. pré-fixada", "15,0% a.a. prefixado", "12% aa", "1.000,25% a.a.",
  "taxa combinada com o gerente", "CDI + 4,10% a.m.", "", null,
];
const covenantTexts = [
  "Dívida líquida/EBITDA <= 3,0x", "Dívida líquida/EBITDA <= 3,25x", "divida liquida / ebitda ≤ 2,5x", "Dívida Líquida/EBITDA menor ou igual a 4",
  "Dívida líquida/EBITDA <= 1.250,5x", "Dívida líquida / EBITDA <= 3,0x", "EBITDA/Juros >= 2x", "Dívida líquida/EBITDA <= 3,0x e EBITDA/juros >= 1,5x", "", null,
];
const coverageTexts = ["Duplicatas 130%", "Duplicatas 125%", "Recebíveis 1.000,5%", "recebiveis 110,25%", "Recebíveis cedidos", "Aval dos sócios", "", null];
const indexLevelSets = [
  {cdi: "0.105", tlp: "0.079", ipca: "0.045", tr: "0.002", selic: "0.1075"},
  {cdi: "0.1365"},
];

function readings() {
  return {
    rates: rateTexts.map((text) => {
      const parsed = parseRate(text);
      return {text, parsed, effective: parsed ? indexLevelSets.map((levels) => effectiveAnnualCost(parsed, levels)) : null};
    }),
    covenants: covenantTexts.map((text) => ({text, parsed: parseCovenant(text)})),
    coverage: coverageTexts.map((text) => ({text, parsed: parseReceivablesCoverage(text)})),
  };
}

const pins = {
  rating: {
    "aurora": "789e84b623ef1ac52c92ab60716ac4daee8a3d1670d5398dccb01cc3931fa586",
    "gold:camil": "75d0fbf32362828da14ec756da0d7c45ab4a628343acc6ac2006120b0536e5b0",
    "gold:camil:ask-800": "a946c86672c63bc413727923aef5f90fdede4705c04d4f15bc1c992390a29f32",
    "gold:fakeco": "4ce61fe4c4075ebcc0114f1447b3e1abe4873501b5a5a7be201aeb617ec15a3b",
    "gold:nimbus": "f176154bc9edb9a6c2eff5f779513d631e4cfe30ed26ba372b70f8eb4514f8e5",
    "gold:rede-horizonte": "ca04fd716e6e277b1d1c8572247b0d9eb3ddbfaadb8bdc9cf273175c26ebbead",
    "leverage:1.4999": "c7ebdee297253fcdc227181ba5bc790f2c65d421bbfbc45ead3e448b1d3650f5",
    "leverage:1.5": "97989f326b6e3ac65dee9271286cfcd3ffd95fbb1f9bfd6186ca505635fe1a4a",
    "leverage:2.5": "8b943cde05f9289e331536b4dc17c505e3121fb13b64eb7c59b8f401a3637c6a",
    "leverage:3.5": "f0c5c73354ea19b60f2618ee4900f92ad194652858187fff8bbc8e3a09b04c79",
    "leverage:4.5": "44117c495f06f0cce8876047be5a6af99efdc317dfba2a7a99358fe0b4da0424",
    "leverage:4.5001": "f387ca36fab9ea9bcdf3c722014d593a996755b37ee48c9a16a3d5b92bfb314c",
    "leverage:Infinity": "ed913a485fb589cb26ecd887f4c70bdef61f77dd1f04296a75c238da696b80d3",
    "leverage:null": "ed913a485fb589cb26ecd887f4c70bdef61f77dd1f04296a75c238da696b80d3",
    "liquidity:0.4999": "8dfbe4d0cae9e5cb9bf561b2a0e5c709b39741b984cdf1c1b00f390417e99679",
    "liquidity:0.5": "80204aceaa2f9a10447449392bbe4a8edd73e95e9c3464016e44a43aa3a7ea75",
    "liquidity:1": "9764c0ad3cce47f024e04149d34b4ccee22402000d2f95446b6a89838482829e",
    "liquidity:1.5": "c2b6ad36e0a17321a08701d99d8135c8498954ac28277c655a875ca0d872ea08",
    "liquidity:2.5": "575f7cd78cb5f09937d2b97e98473ec4ff1f7e997b0d4b08780470c0de7845a4",
    "liquidity:nothing-due": "b4bf726b735739e9be78bb465177a5f15ae4021061749a32e11d250373f62ce0",
    "liquidity:null": "00fb47fcf922611aca0cc61021205f17fa841eda43eeeedb4ccc99c0a3ee6f8f",
    "materials:aurora": "9a2c53fbf4e38a4b69d6897d364d9a7392dd138bf613a43eb765b74b831faef6",
    "runway:12": "0fb797c71f60f573fc05605dec2fa91798fd3ab1e279282b2520ea40389c3b51",
    "runway:18": "d17be90bc9ab59a8047bdf8d914e314b449400e9f5180e001565edecf600e522",
    "runway:24": "ef7b2f27984543e58f1ea360b1e5a242f4b1b06a4ce706d01df6a0d043ae6514",
    "runway:5.9": "7002f9a1cfab5154e38edbae1b0864fb0d8d481112867abfcddc86905be60abb",
    "runway:6": "0397b7d138c24ad2a9f7b5ecb6c74d36a253036ead08a43b05978cfa8eee6869",
    "runway:Infinity": "c15bb26e05334d0b4a9f2c61684222a6cbaa82f09fe71e401f126bb52845a19d",
    "runway:none": "c2bd23e8400d84863b5127810d596e163315b5dcfad8db9b73166cfa97ff51c1",
    "runway:null": "c15bb26e05334d0b4a9f2c61684222a6cbaa82f09fe71e401f126bb52845a19d",
    "unit:aurora": "7de2d207a6f3c3efc1f5395bf70bb8f5bcf098fbbed47ac3dcfe0288ac0d6e6e",
    "unit:aurora-questions": "77af88ae4cd33d1cc6f3ebac50b13f212182921e3cab4269b1b2eeb64693d0ad",
    "unit:aurora-schedule-above-balance": "d39cf45cc5a12eec65cea84b261d4e6382dbc711c1b655ba5071fadff388c6de",
    "unit:aurora-thin-coverage-ask": "03b4bf1d2d2c262bbd3d667bf759f0e9ea05cfb6a4692c5f0fc6c4770956e667",
    "unit:aurora-thin-coverage-stack": "0f16aa7d51b4af9f2d5758597f1b3a564b6e80d1f36d305c4cd4f1f5bdbabda2",
    "unit:aurora-unpriced-lines": "03b4bf1d2d2c262bbd3d667bf759f0e9ea05cfb6a4692c5f0fc6c4770956e667",
    "unit:camil-listed": "2af9258624f75c14470073d71dcb424a64eb5657f47b374312c32ffa3042cd37",
    "unit:maturity-profile": "046576927297b1590b01322fbcc00e0f45033b35679e7e7869e08febc3daed7f",
    "unit:nimbus": "7f13bfecf84a208225ab09198da90b077a1bd7d6f29a3ca481edd0ffbf7ca4e0",
    "unit:nimbus-rate-asked": "7f13bfecf84a208225ab09198da90b077a1bd7d6f29a3ca481edd0ffbf7ca4e0",
    "unit:nimbus-runway-under-twelve": "acf5967f9658d45d63a3239c7be0564bd72e3670e9e0eac025d6ea163adc2658",
    "unit:nimbus-short-runway": "fccc6eac97dfc6535241c0079a80948460cb558ddd4bcfb9950d75e3dabbc7d5",
  } as Record<string, string>,
  stress: {
    "aurora": "eea8fb3784bd6b4348504d7effa157c899cfc1f465d5e571e2fb8459990557b3",
    "gold:camil": "0a4ff1b957bec6986495bf4305f4d5c3ac78a1600a7b737e12c90848885e8ae0",
    "gold:camil:ask-800": "aea11a40015287eb5a6134fe1a92f4a902efccf619d896ae8f43a2960cd5fde0",
    "gold:fakeco": "214d6d14973ade658d42f93a87d5a5e6fb1ed513c8f6e3cffdc72709fb0a67e8",
    "gold:nimbus": "b8024b3564d579d177c1b1867cf11d05a27141cefee11de612b72893c6000a8c",
    "gold:rede-horizonte": "37daabf1f591803143941652d77d153dbb9b58ddde647c4b8c65ebd056085f07",
    "stress:cdi-13.65": "dddccb622990c7dc9be8385314558e18383aca73b86288ddea088725fb76b0b3",
    "stress:cycle-absent": "0bcec9cd3f1a92f2e649a04f172ecf5599e94ef0719f0fcd8dd84a20934d2251",
    "stress:cycle-not-computed": "214d6d14973ade658d42f93a87d5a5e6fb1ed513c8f6e3cffdc72709fb0a67e8",
    "stress:cycle-stored-as-division": "0bcec9cd3f1a92f2e649a04f172ecf5599e94ef0719f0fcd8dd84a20934d2251",
    "stress:negative-ebitda": "4cf5a548294c13fe4d305da2b3379ba591fb69ce6d46d2e246045ca72a6c2d8e",
    "stress:no-cost": "0a5ca6dcfe21e9d43489b25125a51f6fd0da1571854a6e73367a400082089a8e",
    "stress:no-covenant": "3e510102ec9a98498c10114d200827159bc7621097551d5bf317fbe13b37779d",
    "stress:no-scenarios": "91de6a11ac487c7639170eb7a1be2745457c1d4b66466dea6d098607832d1e18",
    "stress:zero-ebitda": "4cf5a548294c13fe4d305da2b3379ba591fb69ce6d46d2e246045ca72a6c2d8e",
    "unit:aurora": "eea8fb3784bd6b4348504d7effa157c899cfc1f465d5e571e2fb8459990557b3",
    "unit:aurora-questions": "0a5ca6dcfe21e9d43489b25125a51f6fd0da1571854a6e73367a400082089a8e",
    "unit:aurora-schedule-above-balance": "09651bf55f92fa0735eb554f83f3243c3935ca06019132b6589318039ff9857f",
    "unit:aurora-thin-coverage-ask": "eea8fb3784bd6b4348504d7effa157c899cfc1f465d5e571e2fb8459990557b3",
    "unit:aurora-thin-coverage-stack": "baabfe0561fab4e46fe13f0071cd1c1057d46034c11b25e2948857cad7c1c90e",
    "unit:aurora-unpriced-lines": "ebc6a8388fb50d4d04d38279958d7e187f41edd1dd541c301a5b2c0c93a88541",
    "unit:camil-listed": "20c0485a2b895249b5829945d4ad0193fce357fbf0103255b8676a5b05be1cd8",
    "unit:maturity-profile": "17e9715f63b5788dbd1bfc4a568925096ef1a15859aadc4dd959ecac3c53f3f6",
    "unit:nimbus": "b8024b3564d579d177c1b1867cf11d05a27141cefee11de612b72893c6000a8c",
    "unit:nimbus-rate-asked": "b8024b3564d579d177c1b1867cf11d05a27141cefee11de612b72893c6000a8c",
    "unit:nimbus-runway-under-twelve": "b8024b3564d579d177c1b1867cf11d05a27141cefee11de612b72893c6000a8c",
    "unit:nimbus-short-runway": "b8024b3564d579d177c1b1867cf11d05a27141cefee11de612b72893c6000a8c",
  } as Record<string, string>,
  deskInputs: {
    "case:aurora": "f7f0088471ed55c6d28be9c38920994e34c03b500344fe561599e890e3797096",
    "case:aurora:ccb:simulation-1": "f30a2d9db917fed1fc60bb4eb456784b8da2dd4770c805521769c0fa7492494a",
    "case:gold:camil": "c31dccc2a67212e44a9930beb87a8e938acae93f24057d6bdf3601fb1bb23484",
    "case:gold:camil:ask-800": "018344a5cbe00cbec98fcb12d6cccb98c369e155ab480bde48088a1ac1b3c5f7",
    "case:gold:camil:cra:ask-800:simulation-1": "670ad4e0f2bc3394fae694f380d19760e93d5a9ecb8f1150e42f96502c539b65",
    "case:gold:camil:cra:simulation-1": "4244b650f46dcc732661b800f0ff3d28a9b843325c162206f465c99f000adafe",
    "case:gold:fakeco": "e87e21ab6362f5fd89032482261bc3a5241f85bd4ff6dfea814368d114fdafdf",
    "case:gold:fakeco:ccb:simulation-1": "dc44aafcfeab68d798c6497cc0ab6ab9c8d3e538f3d36ea30bdca5eb65ecb902",
    "case:gold:fakeco:cra:simulation-1": "dc44aafcfeab68d798c6497cc0ab6ab9c8d3e538f3d36ea30bdca5eb65ecb902",
    "case:gold:nimbus": "4b8cea36e418b6996c8f92680185d2d0710468675b314b0450788e457b521aa5",
    "case:gold:rede-horizonte": "65a1b8d430decad1183a1298b5505a5d524745188705bbdbe32fad2433ad92c6",
    "case:unit:aurora": "cf6bdb9fdaba418694c08ca06cba1514111d7e5dce6e1ebb48c9b332c88f39f6",
    "case:unit:aurora-questions": "3217cf635418b3d8cc0cb655c02a732091e48696a5f121284ac03e2f6ccddd50",
    "case:unit:aurora-schedule-above-balance": "5ea49fa0df4afcb9db46f2eaaca413e5ceeabc6045581cad4b9a8aac72ea10e5",
    "case:unit:aurora-thin-coverage-ask": "fa19f8f29c6d83199aef72ebba106ab0ea05f3287772be2df31df9746da85256",
    "case:unit:aurora-thin-coverage-stack": "2b8af0193536fff710baf3be72310d4060dada15f0c8e988a0ea614f685748b3",
    "case:unit:aurora-unpriced-lines": "8bb0918214ba2bf6622b487732ca8980c1edd8e2126c563d6f680793ca6ce836",
    "case:unit:camil-listed": "24c1cb84b2757080117a7e685e1b9987903c34691b0ed953947bb05c63cee21b",
    "case:unit:maturity-profile": "9cb8287083333356ec8cb34bc5c4cb126005d26e29f216e72c9f2e0a0c419370",
    "case:unit:nimbus": "a3a1d0921f7a0d4a354ab8086fa0ce0b194a828c5a7003166bea5f3e3292b66f",
    "case:unit:nimbus-rate-asked": "6682beb04fa54e49daf954e0785842506efdf536f0f36736a08c073e21f93ff2",
    "case:unit:nimbus-runway-under-twelve": "6021cb6db5630d83a3f369dec12e9d70498dfafeff26eeb71db7acb8156915c8",
    "case:unit:nimbus-short-runway": "2b71cb0fbdd96f0bd9540b193a39ea610ecfd5a78334a38ba05413e0efc731b2",
    "case:unit:no-desk": "0728a978fb2e9473d9319d4fd1caa7fe82ae2ce6155a12e6314a698585e3e67f",
    "case:unit:trajectory-below-base": "ce86e4c6be641ff34883d426eef379a67609aea8963ff2b733232e3ec35ff1d4",
    "case:unit:trajectory-flat-line": "fd4635e3103f53bf4dabb55ca0390894de8c32a10dc155c32404b16ac0c6e956",
    "case:unit:trajectory-held-flat": "0eab9093458ed7516eb291af1dc5225828967859ab952539fdb5680f35d17664",
    "case:unit:trajectory-nearest-first": "c795937ce7e04babe4d63a0dddd2f326aac614f4bf9f9e24230dcce8e4b5c3ad",
    "case:unit:trajectory-pure-swap": "da8556f3cbc89bc150907dd9cabf1c9625ff4f821a068130e0ee7324e7a253b8",
    "gold:camil": "36d4571f1333099bcd2ed4f2a8180b3cc38cfb56b935f84d6d9366fae9d7acc4",
    "gold:cogna": "5be1cfdab46f67d8e7ca1aa7f1c1932a9b1753b7c09446c99975347cecf7165d",
    "gold:fakeco": "7883e672b4ae63f9e244c57dd7c839848a5e13f4aa9eb64be3ed4b27928a5df9",
    "gold:fakeco-scan": "0e76f9d0fa068d639fd2d4ad2acb1bc4f8a4ff20c51195dc27b2900f6b4b7a6c",
    "gold:nimbus": "190541c938242ea8a96dfa538a8c7ca1aad256ac0701c057dd0356b1ad5d76a6",
    "gold:rede-horizonte": "b10b8827f29f509e2c733e788a58955dd045cd9c3d48516ff90b5f2eaef1e0e2",
    "materials:aurora": "b920bad71b7f5e7d4b537adea0c489ab421588ca3a435195d616a05b8f316645",
  } as Record<string, string>,
  reading: "be724c65afb629265775dae7710ea927e169534b34118115a8143aa6108a6b2c",
};

describe("the rating, the stress table, the desk inputs and the reading of rates across the move to financial-core", () => {
  it("reaches every band of every factor, every shock and every kind of rate", () => {
    const desks = analysedDesks();
    const all = Object.values({...desks, ...variedDesks(desks)}).flatMap((entry) => ratingProfiles(entry.desk.leverage.ebitda).map(([, options]) => rateCredit({desk: entry.desk, trajectory: entry.trajectory, ...options})));
    for (const id of ["leverage", "coverage", "liquidity", "trend", "concentration", "evidence", "runway"]) {
      const points = new Set(all.flatMap((rating) => rating.factors.filter((factor) => factor.id === id).map((factor) => factor.points)));
      expect([...points].sort(), id).toEqual([0, 1, 2, 3, 4, null].sort());
    }
    expect(new Set(all.map((rating) => rating.band))).toEqual(new Set(["strong", "adequate", "watch", "weak", "distressed"]));
    const tables = Object.values({...desks, ...stressDesks(desks)}).map((entry) => stressTable({desk: entry.desk, revenue: entry.revenue, topCustomerShare: "0.25"}));
    const rows = tables.flat();
    expect(new Set(rows.map((row) => row.breachesCovenant))).toEqual(new Set([true, false, null]));
    expect(rows.some((row) => row.leverage === null) && rows.some((row) => row.annualInterest === null)).toBe(true);
    expect(rows.some((row) => row.assumptions.pt.includes("não calculável"))).toBe(true);
    const kinds = new Set(readings().rates.map((entry) => entry.parsed?.kind ?? null));
    expect(kinds).toEqual(new Set(["index_plus_spread", "percent_of_index", "fixed_annual", "fixed_monthly", null]));
  });

  it("reproduces every pinned output byte for byte", () => {
    const actual = {rating: ratings(), stress: stresses(), deskInputs: deskInputs(), reading: sha256(readings())};
    expect(actual).toEqual(pins);
  });
});
