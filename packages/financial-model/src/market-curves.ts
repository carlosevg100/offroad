import Decimal from "decimal.js";

export type CurveKind = "IPCA" | "CDI" | "PRE" | "SELIC" | "SOFR" | "UST" | "FX" | "other";

export type CurveNode = {date: string; value: string};

export type GovernedMarketCurve = {
  id: string;
  kind: CurveKind;
  jurisdiction: "BR" | "US" | "cross_border";
  currency: string;
  asOfDate: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl?: string;
  nodes: readonly CurveNode[];
  interpolation: "linear" | "step";
  extrapolation: "flat" | "forbidden";
};

export type ContractualRatePeriod = {
  period: string;
  observationDate: string;
  curveRate: string;
  spreadRate: string;
  allInRate: string;
  curveId: string;
  curveAsOfDate: string;
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(10).toFixed();

function isoDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError(`invalid ISO date: ${date}`);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) throw new RangeError(`invalid ISO date: ${date}`);
  return parsed;
}

function monthsBefore(date: string, months: number): string {
  if (!Number.isInteger(months) || months < 0) throw new RangeError("observation lag must be a non-negative integer");
  const parsed = isoDate(date);
  const targetMonthIndex = parsed.getUTCFullYear() * 12 + parsed.getUTCMonth() - months;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(parsed.getUTCDate(), lastDay);
  return new Date(Date.UTC(targetYear, targetMonth, targetDay)).toISOString().slice(0, 10);
}

export function validateMarketCurve(curve: GovernedMarketCurve): string[] {
  const errors: string[] = [];
  if (!curve.id.trim() || !curve.sourceId.trim() || !curve.sourceTitle.trim()) errors.push("curve id and source metadata are required");
  try {
    isoDate(curve.asOfDate);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "invalid curve as-of date");
  }
  if (curve.nodes.length === 0) errors.push("curve requires at least one node");
  let prior = Number.NEGATIVE_INFINITY;
  for (const node of curve.nodes) {
    try {
      const date = isoDate(node.date).valueOf();
      if (date <= prior) errors.push("curve nodes must be strictly increasing and unique");
      prior = date;
      if (!d(node.value).isFinite()) errors.push(`curve node is not finite: ${node.date}`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `invalid curve node: ${node.date}`);
    }
  }
  return errors;
}

export function interpolateMarketCurve(curve: GovernedMarketCurve, targetDate: string): string {
  const errors = validateMarketCurve(curve);
  if (errors.length > 0) throw new RangeError(errors.join("; "));
  const target = isoDate(targetDate).valueOf();
  const nodes = curve.nodes.map((node) => ({date: isoDate(node.date).valueOf(), value: d(node.value)}));
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (!first || !last) throw new RangeError("curve requires nodes");
  if (target <= first.date) {
    if (target < first.date && curve.extrapolation === "forbidden") throw new RangeError("target precedes the governed curve");
    return out(first.value);
  }
  if (target >= last.date) {
    if (target > last.date && curve.extrapolation === "forbidden") throw new RangeError("target exceeds the governed curve");
    return out(last.value);
  }
  const rightIndex = nodes.findIndex((node) => node.date >= target);
  const right = nodes[rightIndex];
  const left = nodes[rightIndex - 1];
  if (!left || !right) throw new RangeError("curve interpolation interval was not found");
  if (target === right.date || curve.interpolation === "step") return out(target === right.date ? right.value : left.value);
  const fraction = d(target - left.date).div(right.date - left.date);
  return out(left.value.plus(right.value.minus(left.value).mul(fraction)));
}

/**
 * Resolves the rate actually observed under a contract. The observation lag is explicit because
 * an IPCA-linked instrument may use a lagged index while a forecast model holds a different
 * current inflation assumption. Cash settlement versus principal capitalization remains a
 * separate legal treatment in the instrument schedule.
 */
export function resolveContractualRatePeriods(input: {
  curve: GovernedMarketCurve;
  periods: readonly {period: string; accrualEndDate: string; spreadRate: string}[];
  observationLagMonths: number;
  floorRate?: string;
  capRate?: string;
}): ContractualRatePeriod[] {
  return input.periods.map((period) => {
    const observationDate = monthsBefore(period.accrualEndDate, input.observationLagMonths);
    let curveRate = d(interpolateMarketCurve(input.curve, observationDate));
    if (input.floorRate !== undefined) curveRate = Decimal.max(curveRate, d(input.floorRate));
    if (input.capRate !== undefined) curveRate = Decimal.min(curveRate, d(input.capRate));
    const spread = d(period.spreadRate);
    return {
      period: period.period,
      observationDate,
      curveRate: out(curveRate),
      spreadRate: out(spread),
      allInRate: out(curveRate.plus(spread)),
      curveId: input.curve.id,
      curveAsOfDate: input.curve.asOfDate,
    };
  });
}
