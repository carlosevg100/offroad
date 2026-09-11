import {calculateMargin, checkIdentity} from "@offroad/financial-core";

import {buildInstitutionalFinancialModel, type InstitutionalModelInput, type InstitutionalModelPeriod} from "./institutional-model";
import {reviewInstitutionalFinancialModel} from "./review";
import {parseVerifiedInstitutionalWorkbookArtifact, type InstitutionalWorkbookArtifact} from "./institutional-workbook";
import {createHash} from "node:crypto";

/**
 * What changed between two approved revisions, and by how much.
 *
 * A revision history that only lists dates is a filing cabinet. The question a desk asks when a
 * result is replaced is narrower and harder: which assumption moved, in which year, and what did
 * that do to the numbers a lender reads. This module answers exactly that, and it does it without
 * a second opinion about the economics: both sides are rebuilt with the same deterministic model
 * the approved snapshot was built with, their output fingerprints are re-verified, and every
 * subtraction goes through `checkIdentity` in `@offroad/financial-core`.
 *
 * Three refusals are deliberate. A currency change is not a difference, it is two different
 * measurements, so the outputs are not compared. A period that exists on only one side is not
 * interpolated. A value the model could not compute stays null rather than becoming a zero that
 * looks like a real movement.
 */

export const revisionDifferenceMetrics = [
  "revenue", "ebitda", "cfads", "debtService", "closingGrossDebt", "unrestrictedCash",
  "dscr", "netDebtToEbitda", "liquidityHeadroom",
] as const;
export type RevisionDifferenceMetric = typeof revisionDifferenceMetrics[number];

/** Why a part of the comparison is not available. Never a silent omission. */
export type RevisionComparisonLimit =
  | "currency_changed"
  | "periods_changed"
  | "scenario_changed"
  | "value_not_computable";

export type RevisionValueChange = {
  period: string;
  previous: string | null;
  current: string | null;
  /** current minus previous, exact, or null when either side is not computable. */
  difference: string | null;
  /** difference over the previous value, or null when the previous value is zero or missing. */
  relativeChange: string | null;
};

export type RevisionAssumptionChange = RevisionValueChange & {
  assumptionId: string;
  label: {pt: string; en: string};
  unit: string;
};

export type RevisionOutputChange = RevisionValueChange & {metric: RevisionDifferenceMetric};

export type InstitutionalRevisionDifference = {
  previousResultId: string;
  currentResultId: string;
  scenarioName: {previous: string; current: string};
  currency: {previous: string; current: string};
  comparedPeriods: string[];
  assumptions: RevisionAssumptionChange[];
  outputs: RevisionOutputChange[];
  limits: RevisionComparisonLimit[];
};

type VerifiedScenario = InstitutionalWorkbookArtifact["institutional"]["scenarios"][number];

const outputHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** The approved snapshot replayed, or null when it does not reproduce its recorded fingerprint. */
function replay(scenario: VerifiedScenario): {input: InstitutionalModelInput; periods: InstitutionalModelPeriod[]} | null {
  try {
    const input = scenario.input as InstitutionalModelInput;
    const model = buildInstitutionalFinancialModel(input);
    if (outputHash(model) !== scenario.outputFingerprint) return null;
    if (reviewInstitutionalFinancialModel(input, model).status === "blocked") return null;
    return {input, periods: model.periods};
  } catch { return null; }
}

function activeScenario(artifact: InstitutionalWorkbookArtifact): VerifiedScenario | null {
  return artifact.institutional.scenarios.find(scenario => scenario.configurationId === artifact.institutional.activeScenarioId) ?? null;
}

function change(period: string, previous: string | null, current: string | null): RevisionValueChange {
  if (previous === null || current === null) return {period, previous, current, difference: null, relativeChange: null};
  const difference = checkIdentity({id: `revision.${period}`, left: current, right: previous}).difference;
  let relativeChange: string | null = null;
  try { relativeChange = calculateMargin(difference, previous); } catch { relativeChange = null; }
  return {period, previous, current, difference, relativeChange};
}

/** Both sides absent is not a movement, and neither is an exactly equal pair. */
const unchanged = (value: RevisionValueChange) =>
  (value.previous === null && value.current === null) || value.difference === "0";

/**
 * The difference between the approved revision that produced `previous` and the one that produced
 * `current`. Returns null when either artifact fails verification: a difference against a snapshot
 * we cannot reproduce would be a claim, not a measurement.
 */
export function institutionalRevisionDifference(
  previous: {id: string; artifact: unknown},
  current: {id: string; artifact: unknown},
): InstitutionalRevisionDifference | null {
  const previousArtifact = parseVerifiedInstitutionalWorkbookArtifact(previous.artifact);
  const currentArtifact = parseVerifiedInstitutionalWorkbookArtifact(current.artifact);
  if (!previousArtifact || !currentArtifact) return null;
  const previousScenario = activeScenario(previousArtifact);
  const currentScenario = activeScenario(currentArtifact);
  if (!previousScenario || !currentScenario) return null;
  const previousModel = replay(previousScenario);
  const currentModel = replay(currentScenario);
  if (!previousModel || !currentModel) return null;

  const limits: RevisionComparisonLimit[] = [];
  const sameCurrency = previousModel.input.currency === currentModel.input.currency;
  if (!sameCurrency) limits.push("currency_changed");
  if (previousScenario.configurationId !== currentScenario.configurationId) limits.push("scenario_changed");

  const previousPeriods = previousModel.periods.map(period => period.period);
  const currentPeriods = currentModel.periods.map(period => period.period);
  const comparedPeriods = currentPeriods.filter(period => previousPeriods.includes(period));
  if (comparedPeriods.length !== previousPeriods.length || comparedPeriods.length !== currentPeriods.length) limits.push("periods_changed");

  const previousAssumptions = new Map(previousModel.input.assumptionBook.assumptions.map(a => [a.id, a]));
  const currentAssumptions = new Map(currentModel.input.assumptionBook.assumptions.map(a => [a.id, a]));
  const assumptions: RevisionAssumptionChange[] = [];
  for (const id of new Set([...previousAssumptions.keys(), ...currentAssumptions.keys()])) {
    const before = previousAssumptions.get(id);
    const after = currentAssumptions.get(id);
    const descriptor = after ?? before;
    if (!descriptor) continue;
    for (const period of new Set([...Object.keys(before?.values ?? {}), ...Object.keys(after?.values ?? {})])) {
      const entry = change(period, before?.values[period] ?? null, after?.values[period] ?? null);
      if (unchanged(entry)) continue;
      assumptions.push({...entry, assumptionId: id, label: descriptor.label, unit: descriptor.unit});
    }
  }
  assumptions.sort((a, b) => a.assumptionId.localeCompare(b.assumptionId) || a.period.localeCompare(b.period));

  const outputs: RevisionOutputChange[] = [];
  if (sameCurrency) {
    const previousByPeriod = new Map(previousModel.periods.map(period => [period.period, period]));
    const currentByPeriod = new Map(currentModel.periods.map(period => [period.period, period]));
    for (const metric of revisionDifferenceMetrics) {
      for (const period of comparedPeriods) {
        const before = previousByPeriod.get(period)?.[metric] ?? null;
        const after = currentByPeriod.get(period)?.[metric] ?? null;
        const entry = change(period, before, after);
        if (unchanged(entry)) continue;
        if (entry.difference === null && !limits.includes("value_not_computable")) limits.push("value_not_computable");
        outputs.push({...entry, metric});
      }
    }
  }

  return {
    previousResultId: previous.id,
    currentResultId: current.id,
    scenarioName: {previous: previousModel.input.assumptionBook.scenarioName, current: currentModel.input.assumptionBook.scenarioName},
    currency: {previous: previousModel.input.currency, current: currentModel.input.currency},
    comparedPeriods,
    assumptions,
    outputs,
    limits,
  };
}
