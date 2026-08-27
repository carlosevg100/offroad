import Decimal from "decimal.js";

import {
  agingBucketForDaysPastDue,
  receivablesAgingBuckets,
  type IsoDate,
  type MeasuredProvenance,
  type ReceivablesAgingBucket,
  type ReceivablesUniverse,
  type SourceAnchor,
} from "./contracts";

const ZERO = new Decimal(0);
const DAY_MS = 86_400_000;
const FORMULA_VERSION = "2026.08.27-v1";

export type MetricPeriod = {
  reportingDate: IsoDate;
  startDate: IsoDate;
  endDate: IsoDate;
};

export type MeasuredMetric = {
  id: string;
  value: string | null;
  status: "measured" | "not_evaluable";
  unit: "BRL" | "count" | "days" | "ratio";
  period: MetricPeriod;
  provenance: MeasuredProvenance;
  warnings: readonly string[];
};

export type ConcentrationCut = "top_1" | "top_5" | "top_10" | "top_50";
export type ConcentrationMetrics = Record<ConcentrationCut, MeasuredMetric> & {herfindahl: MeasuredMetric};

export type StaticReceivablesMetrics = {
  version: typeof FORMULA_VERSION;
  universeId: string;
  portfolio: {
    titleCount: MeasuredMetric;
    totalFaceValue: MeasuredMetric;
    trailing365Origination: MeasuredMetric;
    averageTicket: MeasuredMetric;
    totalOpenValue: MeasuredMetric;
    weightedOriginalTermDays: MeasuredMetric;
    weightedCurrentTermDays: MeasuredMetric;
    weightedRemainingTermDays: MeasuredMetric;
    simpleDsoDays: MeasuredMetric;
    countbackDsoDays: MeasuredMetric;
  };
  aging: Record<ReceivablesAgingBucket, MeasuredMetric>;
  concentration: {
    trailing365ByObligor: ConcentrationMetrics;
    trailing365ByEconomicGroup: ConcentrationMetrics;
    openByObligor: ConcentrationMetrics;
    openByEconomicGroup: ConcentrationMetrics;
  };
  quality: {
    warnings: readonly string[];
  };
};

const decimal = (value: Decimal.Value) => new Decimal(value);
const canonical = (value: Decimal) => value.toDecimalPlaces(8).toFixed();

function utcDate(value: IsoDate): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError(`invalid ISO date: ${value}`);
  }
  return date;
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.floor((utcDate(to).valueOf() - utcDate(from).valueOf()) / DAY_MS);
}

function shiftDays(value: IsoDate, days: number): IsoDate {
  const date = utcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10) as IsoDate;
}

function sum(values: Iterable<Decimal.Value>): Decimal {
  let total = ZERO;
  for (const value of values) total = total.plus(value);
  return total;
}

function safeRatio(numerator: Decimal, denominator: Decimal, label: string): Decimal {
  if (denominator.lte(0)) throw new RangeError(`${label} denominator must be positive`);
  return numerator.div(denominator);
}

function sourceAnchors(universe: ReceivablesUniverse): SourceAnchor[] {
  const unique = new Map<string, SourceAnchor>();
  const add = (anchor: SourceAnchor) => {
    if (anchor.kind === "file") {
      const key = `file:${anchor.fileId}:${anchor.fileHash}`;
      unique.set(key, {kind: "file", fileId: anchor.fileId, fileHash: anchor.fileHash});
    } else if (anchor.kind === "document") {
      const key = `document:${anchor.documentId}:${anchor.documentHash ?? ""}`;
      unique.set(key, anchor);
    } else {
      const key = `event:${anchor.sourceSystem}:${anchor.eventId}`;
      unique.set(key, anchor);
    }
  };
  universe.receivables.forEach((item) => add(item.source));
  universe.settlements.forEach((item) => add(item.source));
  universe.dilutions.forEach((item) => add(item.source));
  universe.extensions.forEach((item) => add(item.source));
  universe.repurchases.forEach((item) => add(item.source));
  const sortKey = (anchor: SourceAnchor) => {
    if (anchor.kind === "file") return `file:${anchor.fileId}:${anchor.fileHash}`;
    if (anchor.kind === "document") return `document:${anchor.documentId}:${anchor.documentHash ?? ""}`;
    return `event:${anchor.sourceSystem}:${anchor.eventId}`;
  };
  return [...unique.values()].sort((left, right) => sortKey(left).localeCompare(sortKey(right)));
}

function measuredMetric(input: {
  id: string;
  value: Decimal;
  unit: MeasuredMetric["unit"];
  period: MetricPeriod;
  datasetHash: string;
  anchors: readonly SourceAnchor[];
  universe: string;
  formulaId: string;
  numerator?: string;
  denominator?: string;
  inclusions?: readonly string[];
  exclusions?: readonly string[];
  warnings?: readonly string[];
}): MeasuredMetric {
  return {
    id: input.id,
    value: canonical(input.value),
    status: "measured",
    unit: input.unit,
    period: input.period,
    provenance: {
      kind: "measured",
      datasetHash: input.datasetHash,
      anchors: input.anchors,
      universe: input.universe,
      reportingDate: input.period.reportingDate,
      inclusions: input.inclusions ?? [],
      exclusions: input.exclusions ?? [],
      formula: {id: input.formulaId, version: FORMULA_VERSION},
      ...(input.numerator === undefined ? {} : {numerator: input.numerator}),
      ...(input.denominator === undefined ? {} : {denominator: input.denominator}),
      unit: input.unit,
      rounding: "Decimal ROUND_HALF_UP, maximum 8 decimal places; presentation rounding is separate",
    },
    warnings: input.warnings ?? [],
  };
}

function notEvaluableMetric(input: {
  id: string;
  unit: MeasuredMetric["unit"];
  period: MetricPeriod;
  datasetHash: string;
  anchors: readonly SourceAnchor[];
  universe: string;
  formulaId: string;
  warning: string;
}): MeasuredMetric {
  const measured = measuredMetric({...input, value: ZERO, warnings: [input.warning]});
  return {...measured, value: null, status: "not_evaluable"};
}

export function validateReceivablesUniverse(universe: ReceivablesUniverse): readonly string[] {
  const warnings: string[] = [];
  const ids = new Set<string>();
  const obligorIds = new Set(universe.obligors.map((item) => item.id));
  const groupIds = new Set(universe.economicGroups.map((item) => item.id));
  const currencies = new Set<string>();
  let earliestIssue: IsoDate | undefined;
  let latestIssue: IsoDate | undefined;

  if (universe.receivables.length === 0) throw new RangeError("receivables universe cannot be empty");
  utcDate(universe.dates.reportingDate);
  utcDate(universe.dates.latestOriginationDate);
  utcDate(universe.dates.dataStartDate);
  utcDate(universe.dates.dataEndDate);
  if (universe.dates.dataStartDate > universe.dates.dataEndDate) throw new RangeError("data start date cannot follow data end date");

  for (const item of universe.receivables) {
    if (ids.has(item.id)) throw new RangeError(`duplicate receivable id: ${item.id}`);
    ids.add(item.id);
    currencies.add(item.currency);
    if (!obligorIds.has(item.obligorId)) throw new RangeError(`unknown obligor ${item.obligorId} on receivable ${item.id}`);
    if (item.economicGroupId !== undefined && !groupIds.has(item.economicGroupId)) {
      throw new RangeError(`unknown economic group ${item.economicGroupId} on receivable ${item.id}`);
    }
    if (item.issueDate > item.originalDueDate) throw new RangeError(`original due date precedes issue date on receivable ${item.id}`);
    if (item.issueDate > item.currentDueDate) throw new RangeError(`current due date precedes issue date on receivable ${item.id}`);
    const face = decimal(item.faceValue);
    const open = decimal(item.openValue);
    if (face.lte(0)) throw new RangeError(`face value must be positive on receivable ${item.id}`);
    if (open.lt(0) || open.gt(face)) throw new RangeError(`open value must be between zero and face value on receivable ${item.id}`);
    if (item.status !== "open" && !open.isZero()) throw new RangeError(`non-open receivable ${item.id} cannot retain open value`);
    if (item.issueDate < universe.dates.dataStartDate || item.issueDate > universe.dates.dataEndDate) {
      throw new RangeError(`receivable ${item.id} falls outside the declared data interval`);
    }
    earliestIssue = earliestIssue === undefined || item.issueDate < earliestIssue ? item.issueDate : earliestIssue;
    latestIssue = latestIssue === undefined || item.issueDate > latestIssue ? item.issueDate : latestIssue;
  }

  if (currencies.size !== 1 || !currencies.has(universe.currency)) throw new RangeError("all receivables must use the universe currency");
  if (earliestIssue !== universe.dates.dataStartDate) throw new RangeError("declared data start date does not match the earliest origination");
  if (latestIssue !== universe.dates.latestOriginationDate) throw new RangeError("declared latest origination date does not match the portfolio");
  if (universe.dates.dataEndDate !== universe.dates.latestOriginationDate) {
    warnings.push("data_end_date_differs_from_latest_origination_date");
  }
  if (universe.dates.reportingDate < universe.dates.latestOriginationDate) {
    throw new RangeError("reporting date cannot precede the latest origination date");
  }
  return warnings;
}

function concentrationMetrics(input: {
  idPrefix: string;
  values: Map<string, Decimal>;
  denominator: Decimal;
  period: MetricPeriod;
  datasetHash: string;
  anchors: readonly SourceAnchor[];
  universe: string;
}): ConcentrationMetrics {
  const sorted = [...input.values.values()].sort((left, right) => right.comparedTo(left));
  const cuts: Array<[ConcentrationCut, number]> = [["top_1", 1], ["top_5", 5], ["top_10", 10], ["top_50", 50]];
  if (input.denominator.lte(0)) {
    const unavailable = (suffix: string) => notEvaluableMetric({
      id: `${input.idPrefix}.${suffix}`,
      unit: "ratio",
      period: input.period,
      datasetHash: input.datasetHash,
      anchors: input.anchors,
      universe: input.universe,
      formulaId: suffix === "herfindahl" ? "receivables.concentration.herfindahl" : "receivables.concentration.share",
      warning: "concentration_denominator_unavailable",
    });
    return {
      top_1: unavailable("top_1"),
      top_5: unavailable("top_5"),
      top_10: unavailable("top_10"),
      top_50: unavailable("top_50"),
      herfindahl: unavailable("herfindahl"),
    };
  }
  const cutMetrics = Object.fromEntries(cuts.map(([cut, count]) => {
    const numerator = sum(sorted.slice(0, count));
    return [cut, measuredMetric({
      id: `${input.idPrefix}.${cut}`,
      value: safeRatio(numerator, input.denominator, `${input.idPrefix}.${cut}`),
      unit: "ratio",
      period: input.period,
      datasetHash: input.datasetHash,
      anchors: input.anchors,
      universe: input.universe,
      formulaId: "receivables.concentration.share",
      numerator: canonical(numerator),
      denominator: canonical(input.denominator),
      inclusions: [`largest ${count} ${input.idPrefix.includes("group") ? "economic groups" : "obligors"}`],
    })];
  })) as Record<ConcentrationCut, MeasuredMetric>;
  const herfindahl = sum([...input.values.values()].map((value) => safeRatio(value, input.denominator, `${input.idPrefix}.herfindahl`).pow(2)));
  return {
    ...cutMetrics,
    herfindahl: measuredMetric({
      id: `${input.idPrefix}.herfindahl`,
      value: herfindahl,
      unit: "ratio",
      period: input.period,
      datasetHash: input.datasetHash,
      anchors: input.anchors,
      universe: input.universe,
      formulaId: "receivables.concentration.herfindahl",
      denominator: canonical(input.denominator),
    }),
  };
}

function countbackDso(universe: ReceivablesUniverse, openBalance: Decimal): Decimal {
  if (openBalance.isZero()) return ZERO;
  const byDate = new Map<IsoDate, Decimal>();
  for (const item of universe.receivables) {
    byDate.set(item.issueDate, (byDate.get(item.issueDate) ?? ZERO).plus(item.faceValue));
  }
  let remaining = openBalance;
  let days = ZERO;
  let cursor = universe.dates.reportingDate;
  while (remaining.gt(0)) {
    if (cursor < universe.dates.dataStartDate) throw new RangeError("insufficient origination history for countback DSO");
    const originated = byDate.get(cursor) ?? ZERO;
    if (originated.gt(0) && remaining.lt(originated)) {
      days = days.plus(remaining.div(originated));
      remaining = ZERO;
      break;
    }
    remaining = Decimal.max(remaining.minus(originated), ZERO);
    days = days.plus(1);
    cursor = shiftDays(cursor, -1);
  }
  return days;
}

export function calculateStaticReceivablesMetrics(
  universe: ReceivablesUniverse,
  options: {datasetHash: string},
): StaticReceivablesMetrics {
  if (!/^[a-f0-9]{64}$/i.test(options.datasetHash)) throw new RangeError("dataset hash must be a SHA-256 hex digest");
  const qualityWarnings = validateReceivablesUniverse(universe);
  const anchors = sourceAnchors(universe);
  if (anchors.length === 0) throw new RangeError("at least one source anchor is required");

  const allPeriod: MetricPeriod = {
    reportingDate: universe.dates.reportingDate,
    startDate: universe.dates.dataStartDate,
    endDate: universe.dates.dataEndDate,
  };
  const trailingStart = shiftDays(universe.dates.reportingDate, -364);
  const trailingPeriod: MetricPeriod = {
    reportingDate: universe.dates.reportingDate,
    startDate: trailingStart,
    endDate: universe.dates.reportingDate,
  };
  const snapshotPeriod: MetricPeriod = {
    reportingDate: universe.dates.reportingDate,
    startDate: universe.dates.reportingDate,
    endDate: universe.dates.reportingDate,
  };

  const totalFace = sum(universe.receivables.map((item) => item.faceValue));
  const totalOpen = sum(universe.receivables.map((item) => item.openValue));
  const trailing = universe.receivables.filter((item) => item.issueDate >= trailingStart && item.issueDate <= universe.dates.reportingDate);
  const trailingFace = sum(trailing.map((item) => item.faceValue));
  const originalTermNumerator = sum(universe.receivables.map((item) => decimal(item.faceValue).mul(daysBetween(item.issueDate, item.originalDueDate))));
  const currentTermNumerator = sum(universe.receivables.map((item) => decimal(item.faceValue).mul(daysBetween(item.issueDate, item.currentDueDate))));
  const remainingTermNumerator = sum(universe.receivables.map((item) => decimal(item.openValue).mul(Math.max(0, daysBetween(universe.dates.reportingDate, item.currentDueDate)))));
  const titleCount = decimal(universe.receivables.length);

  const metric = (input: Omit<Parameters<typeof measuredMetric>[0], "datasetHash" | "anchors">) => measuredMetric({
    ...input,
    datasetHash: options.datasetHash,
    anchors,
  });

  const agingValues = Object.fromEntries(receivablesAgingBuckets.map((bucket) => [bucket, ZERO])) as Record<ReceivablesAgingBucket, Decimal>;
  const openByObligor = new Map<string, Decimal>();
  const openByGroup = new Map<string, Decimal>();
  for (const item of universe.receivables) {
    const open = decimal(item.openValue);
    if (open.isZero()) continue;
    const daysPastDue = daysBetween(item.currentDueDate, universe.dates.reportingDate);
    const bucket = agingBucketForDaysPastDue(daysPastDue);
    agingValues[bucket] = agingValues[bucket].plus(open);
    openByObligor.set(item.obligorId, (openByObligor.get(item.obligorId) ?? ZERO).plus(open));
    const groupId = item.economicGroupId ?? item.obligorId;
    openByGroup.set(groupId, (openByGroup.get(groupId) ?? ZERO).plus(open));
  }

  const trailingByObligor = new Map<string, Decimal>();
  const trailingByGroup = new Map<string, Decimal>();
  for (const item of trailing) {
    trailingByObligor.set(item.obligorId, (trailingByObligor.get(item.obligorId) ?? ZERO).plus(item.faceValue));
    const groupId = item.economicGroupId ?? item.obligorId;
    trailingByGroup.set(groupId, (trailingByGroup.get(groupId) ?? ZERO).plus(item.faceValue));
  }

  return {
    version: FORMULA_VERSION,
    universeId: universe.id,
    portfolio: {
      titleCount: metric({id: "portfolio.title_count", value: titleCount, unit: "count", period: allPeriod, universe: "all receivables originated in the declared interval", formulaId: "receivables.count"}),
      totalFaceValue: metric({id: "portfolio.total_face_value", value: totalFace, unit: "BRL", period: allPeriod, universe: "all receivables originated in the declared interval", formulaId: "receivables.sum_face_value"}),
      trailing365Origination: metric({id: "portfolio.trailing_365_origination", value: trailingFace, unit: "BRL", period: trailingPeriod, universe: "receivables originated during the inclusive trailing 365-day interval", formulaId: "receivables.trailing_365_origination"}),
      averageTicket: metric({id: "portfolio.average_ticket", value: safeRatio(totalFace, titleCount, "average ticket"), unit: "BRL", period: allPeriod, universe: "all receivables originated in the declared interval", formulaId: "receivables.average_ticket", numerator: canonical(totalFace), denominator: canonical(titleCount)}),
      totalOpenValue: metric({id: "portfolio.total_open_value", value: totalOpen, unit: "BRL", period: snapshotPeriod, universe: "open receivable balance at the reporting date", formulaId: "receivables.sum_open_value"}),
      weightedOriginalTermDays: metric({id: "portfolio.weighted_original_term_days", value: safeRatio(originalTermNumerator, totalFace, "weighted original term"), unit: "days", period: allPeriod, universe: "all receivables originated in the declared interval", formulaId: "receivables.weighted_original_term", numerator: canonical(originalTermNumerator), denominator: canonical(totalFace)}),
      weightedCurrentTermDays: metric({id: "portfolio.weighted_current_term_days", value: safeRatio(currentTermNumerator, totalFace, "weighted current term"), unit: "days", period: allPeriod, universe: "all receivables originated in the declared interval", formulaId: "receivables.weighted_current_term", numerator: canonical(currentTermNumerator), denominator: canonical(totalFace)}),
      weightedRemainingTermDays: metric({id: "portfolio.weighted_remaining_term_days", value: totalOpen.isZero() ? ZERO : remainingTermNumerator.div(totalOpen), unit: "days", period: snapshotPeriod, universe: "open receivable balance at the reporting date", formulaId: "receivables.weighted_remaining_term", numerator: canonical(remainingTermNumerator), denominator: canonical(totalOpen)}),
      simpleDsoDays: trailingFace.lte(0)
        ? notEvaluableMetric({id: "portfolio.simple_dso_days", unit: "days", period: trailingPeriod, datasetHash: options.datasetHash, anchors, universe: "open balance divided by trailing 365-day origination", formulaId: "receivables.simple_dso", warning: "trailing_365_origination_unavailable"})
        : metric({id: "portfolio.simple_dso_days", value: totalOpen.mul(365).div(trailingFace), unit: "days", period: trailingPeriod, universe: "open balance divided by trailing 365-day origination", formulaId: "receivables.simple_dso", numerator: canonical(totalOpen.mul(365)), denominator: canonical(trailingFace)}),
      countbackDsoDays: metric({id: "portfolio.countback_dso_days", value: countbackDso(universe, totalOpen), unit: "days", period: allPeriod, universe: "daily origination consumed backwards from the reporting date until the open balance is covered", formulaId: "receivables.daily_countback_dso", numerator: canonical(totalOpen), denominator: "daily origination series"}),
    },
    aging: Object.fromEntries(receivablesAgingBuckets.map((bucket) => [bucket, metric({
      id: `aging.${bucket}`,
      value: agingValues[bucket],
      unit: "BRL",
      period: snapshotPeriod,
      universe: "open receivable balance at the reporting date",
      formulaId: "receivables.aging.seven_bucket",
      inclusions: [bucket],
    })])) as Record<ReceivablesAgingBucket, MeasuredMetric>,
    concentration: {
      trailing365ByObligor: concentrationMetrics({idPrefix: "concentration.trailing_365.obligor", values: trailingByObligor, denominator: trailingFace, period: trailingPeriod, datasetHash: options.datasetHash, anchors, universe: "receivables originated during the inclusive trailing 365-day interval"}),
      trailing365ByEconomicGroup: concentrationMetrics({idPrefix: "concentration.trailing_365.economic_group", values: trailingByGroup, denominator: trailingFace, period: trailingPeriod, datasetHash: options.datasetHash, anchors, universe: "receivables originated during the inclusive trailing 365-day interval, consolidated by economic group"}),
      openByObligor: concentrationMetrics({idPrefix: "concentration.open.obligor", values: openByObligor, denominator: totalOpen, period: snapshotPeriod, datasetHash: options.datasetHash, anchors, universe: "open receivable balance at the reporting date"}),
      openByEconomicGroup: concentrationMetrics({idPrefix: "concentration.open.economic_group", values: openByGroup, denominator: totalOpen, period: snapshotPeriod, datasetHash: options.datasetHash, anchors, universe: "open receivable balance at the reporting date, consolidated by economic group"}),
    },
    quality: {warnings: qualityWarnings},
  };
}
