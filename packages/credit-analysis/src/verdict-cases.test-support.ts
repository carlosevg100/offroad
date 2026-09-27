import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {indicativePrice, type PricedInstrument} from "@offroad/market-reference";
import {syntheticCreditMaterialsCase as aurora} from "@offroad/testing-fixtures/credit-materials-case";

import {analyzeCreditPosition, type DeskAnalysis} from "./analyze";
import {buildDeskInputs, type DeskInputs, type Fact} from "./from-facts";
import {rateCredit} from "./rating";
import {projectLeverageTrajectory, type Trajectory, type TrajectoryInput} from "./trajectory";
import {judgeOperation, type Operation, type OperationVerdict, type StructurePrice} from "./verdict";

/**
 * The fixtures that reach the operation verdict, run through the desk as the product runs them.
 * Test support for the verdict pins and the bilingual identity of the desk's sentences:
 *
 * - the gold answer keys the desk can read (Camil, Fakeco, Nimbus, Rede Horizonte), unpriced as the
 *   case engine calls the verdict, and priced as `pnpm --filter @offroad/evals desk:gold` prices them
 *   (the market reference for a CRA at the internal rating, the alternatives re-run through the
 *   trajectory), plus the CCB price of Fakeco, whose bigger ticket prices wider, and the simulated
 *   ask the script documents for Camil;
 * - the synthetic Aurora case of the materials, unpriced as the materials publish it and priced by
 *   the fixture's own reference. Its three debt-schedule variants give the same verdict byte for
 *   byte (measured when the pins were taken), so the default one runs.
 */

export type DeskRun = {
  desk: DeskAnalysis;
  trajectory: Trajectory | null;
  verdict: OperationVerdict;
  /** What the desk was fed, and the trajectories the verdict re-ran for a structure the company did not ask for. */
  inputs: DeskInputs;
  simulations: TrajectoryInput[];
};

const here = dirname(fileURLToPath(import.meta.url));
const goldFacts = (caseId: string): Fact[] =>
  (JSON.parse(readFileSync(resolve(here, "../../testing-fixtures/gold", caseId, "expected/fields.json"), "utf8")) as Array<{fieldPath: string; value: string}>)
    .map((field) => ({fieldPath: field.fieldPath, value: field.value}));

type Priced = (structure: {amount: string; termMonths: number; leveragePost: string}) => StructurePrice | null;

function run(inputs: DeskInputs, operation: Operation, price: ((band: ReturnType<typeof rateCredit>["band"]) => Priced) | null, evidenceRank: string): DeskRun {
  if (!inputs.desk) throw new Error(`the desk cannot read this fixture: ${inputs.missing.join(", ")}`);
  const desk = analyzeCreditPosition(inputs.desk);
  const trajectory = inputs.trajectory ? projectLeverageTrajectory(inputs.trajectory) : null;
  const simulations: TrajectoryInput[] = [];
  if (!price) return {desk, trajectory, verdict: judgeOperation({desk, trajectory, operation}), inputs, simulations};
  const rating = rateCredit({desk, trajectory, evidenceRank});
  return {desk, trajectory, inputs, simulations, verdict: judgeOperation({
    desk,
    trajectory,
    operation,
    priceFor: price(rating.band),
    simulate: ({amount, termMonths, graceMonths, refinancing}) => {
      if (!inputs.trajectory) return null;
      const simulated: TrajectoryInput = {...inputs.trajectory, newDebt: {amount, termMonths, graceMonths, refinancing}};
      simulations.push(simulated);
      return projectLeverageTrajectory(simulated);
    },
  })};
}

/** The market reference as the desk script reads it: CDI at 10.5%, the band of the internal rating. */
const marketFor = (instrument: PricedInstrument) => (band: ReturnType<typeof rateCredit>["band"]): Priced => ({amount, termMonths, leveragePost}) => {
  const priced = indicativePrice({instrument, rating: band, cdi: "0.105", tenorMonths: termMonths, amount, leveragePost});
  return priced ? {bps: priced.bps, allIn: {min: priced.allIn.min, max: priced.allIn.max}} : null;
};

/** A gold answer key through the desk, with an optional simulated ask, as the desk script builds it. */
function gold(caseId: string, price: ((band: ReturnType<typeof rateCredit>["band"]) => Priced) | null, ask: Record<string, string> = {}): DeskRun {
  const facts = [...goldFacts(caseId).filter((fact) => !(fact.fieldPath in ask)), ...Object.entries(ask).map(([fieldPath, value]) => ({fieldPath, value}))];
  const value = (path: string) => facts.find((fact) => fact.fieldPath === path)?.value;
  const inputs = buildDeskInputs(facts, {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105", tlp: "0.079", ipca: "0.045", tr: "0.002"}});
  return run(inputs, {
    amount: value("transaction.requested_amount") ?? "0",
    termMonths: Number(value("transaction.desired_term_months") ?? 60),
    graceMonths: Number(value("transaction.desired_grace_months") ?? 12),
    instrument: value("transaction.preferred_structure") ?? "dívida privada",
    ...(value("transaction.refinancing") ? {refinancing: value("transaction.refinancing")!} : {}),
    ...(value("transaction.purpose") ? {purpose: value("transaction.purpose")!} : {}),
  }, price, "2.0");
}

/** The Aurora case as the materials compile it. */
function auroraRun(priced: boolean): DeskRun {
  const facts: Fact[] = aurora.facts.map((fact) => ({fieldPath: fact.fieldPath, value: fact.value}));
  const inputs = buildDeskInputs(facts, {referenceDate: aurora.referenceDate, indexLevels: aurora.indexLevels, statedRequest: aurora.statedRequest});
  // The fixture's own reference: a CCB at the stated band and collateral, priced per structure.
  const reference = (): Priced => ({amount, termMonths, leveragePost}) => {
    const band = indicativePrice({...aurora.price, amount, tenorMonths: termMonths, leveragePost});
    return band ? {bps: band.bps, allIn: {min: band.allIn.min, max: band.allIn.max}} : null;
  };
  return run(inputs, aurora.operation, priced ? reference : null, aurora.rating.evidenceRank);
}

/** The twelve runs, by the key their pin carries. */
export function deskRuns(): Record<string, DeskRun> {
  const runs: Record<string, DeskRun> = {};
  for (const caseId of ["camil", "fakeco", "nimbus", "rede-horizonte"]) {
    runs[`gold:${caseId}:unpriced`] = gold(caseId, null);
    runs[`gold:${caseId}:cra`] = gold(caseId, marketFor("cra"));
  }
  runs["gold:fakeco:ccb"] = gold("fakeco", marketFor("ccb"));
  runs["gold:camil:cra:ask-800"] = gold("camil", marketFor("cra"), {
    "transaction.requested_amount": "800000000", "transaction.desired_term_months": "84", "transaction.desired_grace_months": "24", "transaction.refinancing": "600000000",
  });
  runs["aurora:unpriced"] = auroraRun(false);
  runs["aurora:ccb"] = auroraRun(true);
  return runs;
}
