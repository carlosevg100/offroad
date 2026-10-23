import type {ProposedHypothesis} from "@offroad/financial-model";

/** Loads a financial-model test fixture by path, outside this package's compiled sources. */
export async function financialModelFixture<T>(file: string): Promise<T> {
  return await import(new URL(`../../../packages/financial-model/src/${file}`, import.meta.url).href) as T;
}

/** The hypotheses as the adopted reader reads them (path, unit, scenario, value), with this worker's
 * item keys renamed to the fixture's, ordered by path. Reasons are left out: an origin the
 * extraction cannot state (house) changes only the reason. */
type Comparable = {fieldPath: string; dimensions: {unit: string; scenario: string; periodStart: string; periodEnd: string}; value: ProposedHypothesis["value"]};
export function comparableHypotheses(hypotheses: readonly Comparable[], rename: ReadonlyMap<string, string> = new Map()) {
  const r = (x: string) => rename.get(x) ?? x;
  const value = (v: ProposedHypothesis["value"]) => Array.isArray(v.value) ? {...v, value: v.value.map(r)} : v.type === "text" && typeof v.value === "string" ? {...v, value: r(v.value)} : v;
  return hypotheses.map((h) => ({fieldPath: h.fieldPath.split(".").map(r).join("."), unit: h.dimensions.unit, scenario: h.dimensions.scenario,
    periodStart: h.dimensions.periodStart, periodEnd: h.dimensions.periodEnd, value: value(h.value)}))
    .sort((a, b) => a.fieldPath.localeCompare(b.fieldPath) || a.scenario.localeCompare(b.scenario));
}

export const summaryGroups = ["instrument", "credit_line", "obligation", "view", "limit", "measurement", "stream", "action", "case", "premise"];
export const summaryOrigins = ["document", "informed", "house", "estimate"];
