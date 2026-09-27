import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {indicativePrice, type PricedInstrument} from "@offroad/market-reference";
import {syntheticCreditMaterialsCase as aurora} from "@offroad/testing-fixtures/credit-materials-case";
import {describe, expect, it} from "vitest";

import {analyzeCreditPosition} from "./analyze";
import {buildDeskInputs, type DeskInputs, type Fact} from "./from-facts";
import {rateCredit} from "./rating";
import {projectLeverageTrajectory} from "./trajectory";
import {judgeOperation, type Operation, type OperationVerdict, type StructurePrice} from "./verdict";

/**
 * Byte-identity of the operation verdict across the move of its basis-point conversions into
 * `@offroad/financial-core` (stage 19, increment 6B). The fingerprints were captured from the
 * floating-point `verdict.ts` before the kernels were used, over the fixtures that reach the verdict:
 *
 * - the gold answer keys the desk can read (Camil, Fakeco, Nimbus, Rede Horizonte), unpriced as the
 *   case engine calls the verdict, and priced as `pnpm --filter @offroad/evals desk:gold` prices them
 *   (the market reference for a CRA at the internal rating, the alternatives re-run through the
 *   trajectory), plus the CCB price of Fakeco, whose bigger ticket prices wider, and the simulated
 *   ask the script documents for Camil;
 * - the synthetic Aurora case of the materials, unpriced as the materials publish it and priced by
 *   the fixture's own reference.
 *
 * Together they print the spread band of the requested structure, the same spread for the bigger
 * ticket, a wider low end for it and the saving of the shorter road. A pin moves only with a
 * deliberate change of the verdict.
 */
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value, null, 1)).digest("hex");

const here = dirname(fileURLToPath(import.meta.url));
const goldFacts = (caseId: string): Fact[] =>
  (JSON.parse(readFileSync(resolve(here, "../../testing-fixtures/gold", caseId, "expected/fields.json"), "utf8")) as Array<{fieldPath: string; value: string}>)
    .map((field) => ({fieldPath: field.fieldPath, value: field.value}));

type Priced = (structure: {amount: string; termMonths: number; leveragePost: string}) => StructurePrice | null;

function verdictOf(inputs: DeskInputs, operation: Operation, price: ((band: ReturnType<typeof rateCredit>["band"]) => Priced) | null, evidenceRank: string): OperationVerdict {
  if (!inputs.desk) throw new Error(`the desk cannot read this fixture: ${inputs.missing.join(", ")}`);
  const desk = analyzeCreditPosition(inputs.desk);
  const trajectory = inputs.trajectory ? projectLeverageTrajectory(inputs.trajectory) : null;
  if (!price) return judgeOperation({desk, trajectory, operation});
  const rating = rateCredit({desk, trajectory, evidenceRank});
  return judgeOperation({
    desk,
    trajectory,
    operation,
    priceFor: price(rating.band),
    simulate: ({amount, termMonths, graceMonths, refinancing}) =>
      inputs.trajectory ? projectLeverageTrajectory({...inputs.trajectory, newDebt: {amount, termMonths, graceMonths, refinancing}}) : null,
  });
}

/** The market reference as the desk script reads it: CDI at 10.5%, the band of the internal rating. */
const marketFor = (instrument: PricedInstrument) => (band: ReturnType<typeof rateCredit>["band"]): Priced => ({amount, termMonths, leveragePost}) => {
  const priced = indicativePrice({instrument, rating: band, cdi: "0.105", tenorMonths: termMonths, amount, leveragePost});
  return priced ? {bps: priced.bps, allIn: {min: priced.allIn.min, max: priced.allIn.max}} : null;
};

/** A gold answer key through the desk, with an optional simulated ask, as the desk script builds it. */
function goldVerdict(caseId: string, price: ((band: ReturnType<typeof rateCredit>["band"]) => Priced) | null, ask: Record<string, string> = {}): OperationVerdict {
  const facts = [...goldFacts(caseId).filter((fact) => !(fact.fieldPath in ask)), ...Object.entries(ask).map(([fieldPath, value]) => ({fieldPath, value}))];
  const value = (path: string) => facts.find((fact) => fact.fieldPath === path)?.value;
  const inputs = buildDeskInputs(facts, {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105", tlp: "0.079", ipca: "0.045", tr: "0.002"}});
  return verdictOf(inputs, {
    amount: value("transaction.requested_amount") ?? "0",
    termMonths: Number(value("transaction.desired_term_months") ?? 60),
    graceMonths: Number(value("transaction.desired_grace_months") ?? 12),
    instrument: value("transaction.preferred_structure") ?? "dívida privada",
    ...(value("transaction.refinancing") ? {refinancing: value("transaction.refinancing")!} : {}),
    ...(value("transaction.purpose") ? {purpose: value("transaction.purpose")!} : {}),
  }, price, "2.0");
}

/**
 * The Aurora case as the materials compile it. Its three debt-schedule variants give the same
 * verdict byte for byte (measured when the pins were taken), so the default one is pinned.
 */
function auroraVerdict(priced: boolean): OperationVerdict {
  const facts: Fact[] = aurora.facts.map((fact) => ({fieldPath: fact.fieldPath, value: fact.value}));
  const inputs = buildDeskInputs(facts, {referenceDate: aurora.referenceDate, indexLevels: aurora.indexLevels, statedRequest: aurora.statedRequest});
  // The fixture's own reference: a CCB at the stated band and collateral, priced per structure.
  const reference = (): Priced => ({amount, termMonths, leveragePost}) => {
    const band = indicativePrice({...aurora.price, amount, tenorMonths: termMonths, leveragePost});
    return band ? {bps: band.bps, allIn: {min: band.allIn.min, max: band.allIn.max}} : null;
  };
  return verdictOf(inputs, aurora.operation, priced ? reference : null, aurora.rating.evidenceRank);
}

const pins: Record<string, string> = {
  "gold:camil:unpriced": "afa84f7861e729f73b1e7146203eb0b2e4aee6f5ca7d13b1a046899b3f92de10",
  "gold:camil:cra": "ae93df73fd2106b24bf663cf951d89d5e30b6e710ff9e5d6242b9295199fd150",
  "gold:fakeco:unpriced": "7b919b2cadef281d6df8ab4ef6d16ef40b84b60b41be160cbb1af15f43095790",
  "gold:fakeco:cra": "9e8797dddb62329da8a33158c124e3d30af03e2b3390b097d483662d16abee3a",
  "gold:nimbus:unpriced": "9fbbaf737955d6a7c2104ded65c04bd9b4b8c109e6e6815fdfbcce843faf31d3",
  "gold:nimbus:cra": "c2031f8a7e194bf3440ed73e06436d44b91bb391c154de2d7a248d3146e8681b",
  "gold:rede-horizonte:unpriced": "6b1b24c96b348ba78e0d66551e398b0a354ab65825977e2702e0dab8bc49af7d",
  "gold:rede-horizonte:cra": "b6b00d39cb4cb280d4687e5b152d230b991014f62d1e4821ad47204006344164",
  "gold:fakeco:ccb": "059af1b53708c822f9245204fdacb330c88de6383937dbf46eba2205d322379c",
  "gold:camil:cra:ask-800": "594ce0a01a60f742c347e31d095911af243a90bc80e18189e3d5e798fbd49578",
  "aurora:unpriced": "bc6f6e63458493ce02c3173021fd9953c32112763cabf877b0ec64665dcd50cd",
  "aurora:ccb": "078a4ab33542661aeb8fe1b9ccade889ea696ed59c282c092807fd152a411590",
};

describe("the operation verdict across the move to financial-core", () => {
  const verdicts: Record<string, OperationVerdict> = {};
  for (const caseId of ["camil", "fakeco", "nimbus", "rede-horizonte"]) {
    verdicts[`gold:${caseId}:unpriced`] = goldVerdict(caseId, null);
    verdicts[`gold:${caseId}:cra`] = goldVerdict(caseId, marketFor("cra"));
  }
  verdicts["gold:fakeco:ccb"] = goldVerdict("fakeco", marketFor("ccb"));
  verdicts["gold:camil:cra:ask-800"] = goldVerdict("camil", marketFor("cra"), {
    "transaction.requested_amount": "800000000", "transaction.desired_term_months": "84", "transaction.desired_grace_months": "24", "transaction.refinancing": "600000000",
  });
  verdicts["aurora:unpriced"] = auroraVerdict(false);
  verdicts["aurora:ccb"] = auroraVerdict(true);

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
