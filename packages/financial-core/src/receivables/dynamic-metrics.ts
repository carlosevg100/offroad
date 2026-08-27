import Decimal from "decimal.js";

import {
  agingBucketForDaysPastDue,
  receivablesAgingBuckets,
  type DilutionEvent,
  type IsoDate,
  type ReceivableTitle,
  type ReceivablesAgingBucket,
  type ReceivablesUniverse,
  type RepurchaseEvent,
  type SettlementEvent,
} from "./contracts";
import {
  canonicalMetricValue,
  collectReceivablesSourceAnchors,
  measuredReceivablesMetric,
  notEvaluableReceivablesMetric,
  receivablesDaysBetween,
  receivablesMetricsFormulaVersion,
  receivablesUtcDate,
  shiftReceivablesDays,
  type MeasuredMetric,
  type MetricPeriod,
  validateReceivablesUniverse,
} from "./static-metrics";

const ZERO = new Decimal(0);
const DILUTION_REASONS: readonly DilutionEvent["reason"][] = ["return", "rebate", "discount", "credit_note", "glosa", "other"];

export const receivablesVintageHorizons = [30, 60, 90, 120, 180, 360] as const;
export type ReceivablesVintageHorizon = typeof receivablesVintageHorizons[number];
export const receivablesRollDestinations = [...receivablesAgingBuckets, "resolved"] as const;
export type ReceivablesRollDestination = typeof receivablesRollDestinations[number];

export type RollTransition = {
  amount: string;
  rate: MeasuredMetric;
};

export type RollRateRow = {
  sourceExposure: string;
  transitions: Record<ReceivablesRollDestination, RollTransition>;
};

export type MonthlyRollRate = {
  fromDate: IsoDate;
  toDate: IsoDate;
  rows: Record<ReceivablesAgingBucket, RollRateRow>;
};

export type VintageHorizonMetric = {
  unresolvedAmount: string | null;
  unresolvedShare: MeasuredMetric;
};

export type ReceivablesVintage = {
  cohortMonth: string;
  titleCount: number;
  faceValue: string;
  horizons: Record<ReceivablesVintageHorizon, VintageHorizonMetric>;
};

export type DynamicReceivablesMetrics = {
  version: typeof receivablesMetricsFormulaVersion;
  universeId: string;
  rollRates: {
    status: "measured" | "not_evaluable";
    basis: "original_due_date";
    periods: readonly MonthlyRollRate[];
    warnings: readonly string[];
  };
  vintages: {
    status: "measured" | "not_evaluable";
    basis: "origination_month_and_original_due_date";
    cohorts: readonly ReceivablesVintage[];
    warnings: readonly string[];
  };
  dilution: {
    totalAmount: MeasuredMetric;
    shareOfOrigination: MeasuredMetric;
    byReason: Record<DilutionEvent["reason"], {amount: MeasuredMetric; shareOfOrigination: MeasuredMetric}>;
  };
  repurchaseAndLoss: {
    repurchasedAmount: MeasuredMetric;
    repurchaseShareOfAssigned: MeasuredMetric;
    finalWrittenOffAmount: MeasuredMetric;
    finalWrittenOffShare: MeasuredMetric;
    adjustedLossAmount: MeasuredMetric;
    adjustedLossShare: MeasuredMetric;
  };
  punctualSettlement: {
    dueTitleCount: MeasuredMetric;
    dueFaceValue: MeasuredMetric;
    punctualByCount: MeasuredMetric;
    punctualByValue: MeasuredMetric;
  };
  extensions: {
    extendedTitleCount: MeasuredMetric;
    extendedTitleShare: MeasuredMetric;
    extendedFaceValue: MeasuredMetric;
    extendedFaceShare: MeasuredMetric;
    weightedExtensionDays: MeasuredMetric;
  };
  quality: {
    warnings: readonly string[];
  };
};

type ResolutionEvent = SettlementEvent | DilutionEvent | RepurchaseEvent;

const decimal = (value: Decimal.Value) => new Decimal(value);

function sum(values: Iterable<Decimal.Value>): Decimal {
  let total = ZERO;
  for (const value of values) total = total.plus(value);
  return total;
}

function monthStart(value: IsoDate): IsoDate {
  return `${value.slice(0, 7)}-01` as IsoDate;
}

function monthEnd(value: IsoDate): IsoDate {
  const date = receivablesUtcDate(monthStart(value));
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10) as IsoDate;
}

function nextMonthEnd(value: IsoDate): IsoDate {
  const date = receivablesUtcDate(monthStart(value));
  date.setUTCMonth(date.getUTCMonth() + 2);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10) as IsoDate;
}

function monthEndsBetween(startDate: IsoDate, reportingDate: IsoDate): IsoDate[] {
  const values: IsoDate[] = [];
  let cursor = monthEnd(startDate);
  while (cursor <= reportingDate) {
    values.push(cursor);
    cursor = nextMonthEnd(cursor);
  }
  return values;
}

function eventMap(universe: ReceivablesUniverse): Map<string, ResolutionEvent[]> {
  const byTitle = new Map<string, ResolutionEvent[]>();
  for (const event of [...universe.settlements, ...universe.dilutions, ...universe.repurchases]) {
    const events = byTitle.get(event.receivableId) ?? [];
    events.push(event);
    byTitle.set(event.receivableId, events);
  }
  for (const events of byTitle.values()) {
    events.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  }
  return byTitle;
}

function outstandingAt(title: ReceivableTitle, events: readonly ResolutionEvent[], date: IsoDate): Decimal {
  if (title.issueDate > date) return ZERO;
  const resolved = sum(events.filter((event) => event.date <= date).map((event) => event.amount));
  return Decimal.max(decimal(title.faceValue).minus(resolved), ZERO);
}

function bucketAt(title: ReceivableTitle, date: IsoDate): ReceivablesAgingBucket {
  return agingBucketForDaysPastDue(receivablesDaysBetween(title.originalDueDate, date));
}

function metricFactory(universe: ReceivablesUniverse, datasetHash: string) {
  const anchors = collectReceivablesSourceAnchors(universe);
  const measured = (input: Omit<Parameters<typeof measuredReceivablesMetric>[0], "datasetHash" | "anchors">) => measuredReceivablesMetric({
    ...input,
    datasetHash,
    anchors,
  });
  const unavailable = (input: Omit<Parameters<typeof notEvaluableReceivablesMetric>[0], "datasetHash" | "anchors">) => notEvaluableReceivablesMetric({
    ...input,
    datasetHash,
    anchors,
  });
  return {measured, unavailable};
}

function completeCoverage(universe: ReceivablesUniverse, keys: Array<keyof ReceivablesUniverse["eventCoverage"]>): boolean {
  return keys.every((key) => universe.eventCoverage[key].status === "complete");
}

function rollRates(
  universe: ReceivablesUniverse,
  events: Map<string, ResolutionEvent[]>,
  datasetHash: string,
): DynamicReceivablesMetrics["rollRates"] {
  const required = ["settlements", "dilutions", "repurchases"] as const;
  if (!completeCoverage(universe, [...required])) {
    return {
      status: "not_evaluable",
      basis: "original_due_date",
      periods: [],
      warnings: required.filter((key) => universe.eventCoverage[key].status !== "complete").map((key) => `${key}_coverage_incomplete`),
    };
  }
  const {measured, unavailable} = metricFactory(universe, datasetHash);
  const dates = monthEndsBetween(universe.dates.dataStartDate, universe.dates.reportingDate);
  const periods: MonthlyRollRate[] = [];
  for (let index = 0; index < dates.length - 1; index += 1) {
    const fromDate = dates[index]!;
    const toDate = dates[index + 1]!;
    const source = Object.fromEntries(receivablesAgingBuckets.map((bucket) => [bucket, ZERO])) as Record<ReceivablesAgingBucket, Decimal>;
    const transitions = Object.fromEntries(receivablesAgingBuckets.map((bucket) => [
      bucket,
      Object.fromEntries(receivablesRollDestinations.map((destination) => [destination, ZERO])) as Record<ReceivablesRollDestination, Decimal>,
    ])) as Record<ReceivablesAgingBucket, Record<ReceivablesRollDestination, Decimal>>;

    for (const title of universe.receivables) {
      const titleEvents = events.get(title.id) ?? [];
      const fromExposure = outstandingAt(title, titleEvents, fromDate);
      if (fromExposure.lte(0)) continue;
      const sourceBucket = bucketAt(title, fromDate);
      source[sourceBucket] = source[sourceBucket].plus(fromExposure);
      const toExposure = Decimal.min(outstandingAt(title, titleEvents, toDate), fromExposure);
      const resolved = fromExposure.minus(toExposure);
      if (resolved.gt(0)) transitions[sourceBucket].resolved = transitions[sourceBucket].resolved.plus(resolved);
      if (toExposure.gt(0)) {
        const destination = bucketAt(title, toDate);
        transitions[sourceBucket][destination] = transitions[sourceBucket][destination].plus(toExposure);
      }
    }

    const period: MetricPeriod = {reportingDate: universe.dates.reportingDate, startDate: fromDate, endDate: toDate};
    const rows = Object.fromEntries(receivablesAgingBuckets.map((bucket) => {
      const denominator = source[bucket];
      const cells = Object.fromEntries(receivablesRollDestinations.map((destination) => {
        const amount = transitions[bucket][destination];
        const id = `roll_rate.${fromDate}.${toDate}.${bucket}.${destination}`;
        const rate = denominator.gt(0)
          ? measured({
            id,
            value: amount.div(denominator),
            unit: "ratio",
            period,
            universe: `gross unresolved face exposure in ${bucket} at ${fromDate}`,
            formulaId: "receivables.monthly_roll_rate",
            numerator: canonicalMetricValue(amount),
            denominator: canonicalMetricValue(denominator),
            inclusions: ["original due date", "gross face exposure net of recorded resolution events"],
          })
          : unavailable({
            id,
            unit: "ratio",
            period,
            universe: `gross unresolved face exposure in ${bucket} at ${fromDate}`,
            formulaId: "receivables.monthly_roll_rate",
            warning: "source_bucket_has_zero_exposure",
          });
        return [destination, {amount: canonicalMetricValue(amount), rate}];
      })) as Record<ReceivablesRollDestination, RollTransition>;
      return [bucket, {sourceExposure: canonicalMetricValue(denominator), transitions: cells}];
    })) as Record<ReceivablesAgingBucket, RollRateRow>;
    periods.push({fromDate, toDate, rows});
  }
  return {status: "measured", basis: "original_due_date", periods, warnings: []};
}

function vintages(
  universe: ReceivablesUniverse,
  events: Map<string, ResolutionEvent[]>,
  datasetHash: string,
): DynamicReceivablesMetrics["vintages"] {
  const required = ["settlements", "dilutions", "repurchases"] as const;
  if (!completeCoverage(universe, [...required])) {
    return {
      status: "not_evaluable",
      basis: "origination_month_and_original_due_date",
      cohorts: [],
      warnings: required.filter((key) => universe.eventCoverage[key].status !== "complete").map((key) => `${key}_coverage_incomplete`),
    };
  }
  const {measured, unavailable} = metricFactory(universe, datasetHash);
  const byMonth = new Map<string, ReceivableTitle[]>();
  for (const title of universe.receivables) {
    const key = title.issueDate.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), title]);
  }
  const cohorts = [...byMonth.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([cohortMonth, titles]) => {
    const face = sum(titles.map((title) => title.faceValue));
    const cohortStart = `${cohortMonth}-01` as IsoDate;
    const cohortEnd = monthEnd(cohortStart);
    const period: MetricPeriod = {reportingDate: universe.dates.reportingDate, startDate: cohortStart, endDate: cohortEnd};
    const horizons = Object.fromEntries(receivablesVintageHorizons.map((horizon) => {
      const fullyObserved = titles.every((title) => shiftReceivablesDays(title.originalDueDate, horizon) <= universe.dates.reportingDate);
      const id = `vintage.${cohortMonth}.unresolved_at_${horizon}_days`;
      if (!fullyObserved) {
        return [horizon, {
          unresolvedAmount: null,
          unresolvedShare: unavailable({
            id,
            unit: "ratio",
            period,
            universe: `all receivables originated in ${cohortMonth}`,
            formulaId: "receivables.vintage_unresolved_share",
            warning: "cohort_not_fully_observed_at_horizon",
          }),
        }];
      }
      const unresolved = sum(titles.map((title) => outstandingAt(
        title,
        events.get(title.id) ?? [],
        shiftReceivablesDays(title.originalDueDate, horizon),
      )));
      return [horizon, {
        unresolvedAmount: canonicalMetricValue(unresolved),
        unresolvedShare: measured({
          id,
          value: unresolved.div(face),
          unit: "ratio",
          period,
          universe: `all receivables originated in ${cohortMonth} with a complete ${horizon}-day observation window`,
          formulaId: "receivables.vintage_unresolved_share",
          numerator: canonicalMetricValue(unresolved),
          denominator: canonicalMetricValue(face),
          inclusions: ["original due date", "gross face exposure net of recorded resolution events through each title-specific horizon"],
        }),
      }];
    })) as Record<ReceivablesVintageHorizon, VintageHorizonMetric>;
    return {cohortMonth, titleCount: titles.length, faceValue: canonicalMetricValue(face), horizons};
  });
  return {
    status: "measured",
    basis: "origination_month_and_original_due_date",
    cohorts,
    warnings: ["unresolved-at-horizon is a non-payment survival curve, not a write-off event series"],
  };
}

export function calculateDynamicReceivablesMetrics(
  universe: ReceivablesUniverse,
  options: {datasetHash: string},
): DynamicReceivablesMetrics {
  if (!/^[a-f0-9]{64}$/i.test(options.datasetHash)) throw new RangeError("dataset hash must be a SHA-256 hex digest");
  const qualityWarnings = validateReceivablesUniverse(universe);
  const {measured, unavailable} = metricFactory(universe, options.datasetHash);
  const events = eventMap(universe);
  const allPeriod: MetricPeriod = {
    reportingDate: universe.dates.reportingDate,
    startDate: universe.dates.dataStartDate,
    endDate: universe.dates.reportingDate,
  };
  const totalFace = sum(universe.receivables.map((title) => title.faceValue));
  const dilutionAmount = sum(universe.dilutions.map((event) => event.amount));
  const repurchasedAmount = sum(universe.repurchases.map((event) => event.amount));
  const writtenOffAmount = sum(universe.receivables
    .filter((title) => title.status === "written_off")
    .map((title) => outstandingAt(title, events.get(title.id) ?? [], universe.dates.reportingDate)));
  const adjustedLossAmount = writtenOffAmount.plus(repurchasedAmount);
  const dilutionMeasured = universe.eventCoverage.dilutions.status === "complete";
  const repurchasesMeasured = universe.eventCoverage.repurchases.status === "complete";
  const baseMetric = (id: string, value: Decimal, unit: MeasuredMetric["unit"], formulaId: string, universeLabel: string) => measured({
    id,
    value,
    unit,
    period: allPeriod,
    universe: universeLabel,
    formulaId,
  });
  const ratioMetric = (id: string, numerator: Decimal, denominator: Decimal, formulaId: string, universeLabel: string) => denominator.gt(0)
    ? measured({
      id,
      value: numerator.div(denominator),
      unit: "ratio",
      period: allPeriod,
      universe: universeLabel,
      formulaId,
      numerator: canonicalMetricValue(numerator),
      denominator: canonicalMetricValue(denominator),
    })
    : unavailable({id, unit: "ratio", period: allPeriod, universe: universeLabel, formulaId, warning: "denominator_unavailable"});

  const dilutionUnavailable = (id: string, unit: MeasuredMetric["unit"], formulaId: string) => unavailable({
    id,
    unit,
    period: allPeriod,
    universe: "dilution events over the declared data interval",
    formulaId,
    warning: "dilution_event_coverage_incomplete",
  });
  const byReason = Object.fromEntries(DILUTION_REASONS.map((reason) => {
    const amount = sum(universe.dilutions.filter((event) => event.reason === reason).map((event) => event.amount));
    return [reason, {
      amount: dilutionMeasured
        ? baseMetric(`dilution.${reason}.amount`, amount, "BRL", "receivables.dilution_by_reason", `dilution events classified as ${reason}`)
        : dilutionUnavailable(`dilution.${reason}.amount`, "BRL", "receivables.dilution_by_reason"),
      shareOfOrigination: dilutionMeasured
        ? ratioMetric(`dilution.${reason}.share_of_origination`, amount, totalFace, "receivables.dilution_share", `dilution events classified as ${reason} divided by gross origination`)
        : dilutionUnavailable(`dilution.${reason}.share_of_origination`, "ratio", "receivables.dilution_share"),
    }];
  })) as DynamicReceivablesMetrics["dilution"]["byReason"];

  const dueTitles = universe.receivables.filter((title) => title.originalDueDate <= universe.dates.reportingDate);
  const dueFace = sum(dueTitles.map((title) => title.faceValue));
  const punctualTitles = completeCoverage(universe, ["settlements", "dilutions", "repurchases"])
    ? dueTitles.filter((title) => outstandingAt(title, events.get(title.id) ?? [], title.originalDueDate).lte(0))
    : [];
  const punctualFace = sum(punctualTitles.map((title) => title.faceValue));
  const punctualMeasured = completeCoverage(universe, ["settlements", "dilutions", "repurchases"]);
  const punctualUnavailable = (id: string, unit: MeasuredMetric["unit"]) => unavailable({
    id,
    unit,
    period: allPeriod,
    universe: "receivables whose original due date falls on or before the reporting date",
    formulaId: "receivables.punctual_settlement",
    warning: "resolution_event_coverage_incomplete",
  });

  const extendedIds = new Set(universe.extensions.map((event) => event.receivableId));
  const extendedTitles = universe.receivables.filter((title) => extendedIds.has(title.id));
  const extendedFace = sum(extendedTitles.map((title) => title.faceValue));
  const extensionDaysNumerator = sum(universe.extensions.map((event) => {
    const title = universe.receivables.find((candidate) => candidate.id === event.receivableId);
    return title === undefined ? ZERO : decimal(title.faceValue).mul(receivablesDaysBetween(event.previousDueDate, event.newDueDate));
  }));
  const extensionObservable = universe.eventCoverage.extensions.status !== "not_provided";
  const extensionMetric = (id: string, value: Decimal, unit: MeasuredMetric["unit"], formulaId: string, numerator?: string, denominator?: string) => extensionObservable
    ? measured({
      id,
      value,
      unit,
      period: allPeriod,
      universe: "receivables with an identified change from original to current due date",
      formulaId,
      ...(numerator === undefined ? {} : {numerator}),
      ...(denominator === undefined ? {} : {denominator}),
      warnings: universe.eventCoverage.extensions.limitations,
    })
    : unavailable({id, unit, period: allPeriod, universe: "receivables with an identified change from original to current due date", formulaId, warning: "extension_event_coverage_unavailable"});

  const assignmentEvents = universe.assignmentsAndLiens
    .filter((item) => item.kind === "assignment" || item.kind === "fiduciary_assignment");
  const assignmentDenominatorMeasured = universe.eventCoverage.assignmentsAndLiens.status === "complete"
    && assignmentEvents.every((item) => item.amount !== null);
  const assignedAmount = sum(assignmentEvents.map((item) => item.amount ?? "0"));
  const repurchaseUnavailable = (id: string, unit: MeasuredMetric["unit"], warning: string) => unavailable({
    id,
    unit,
    period: allPeriod,
    universe: "repurchase events over the declared data interval",
    formulaId: "receivables.repurchase",
    warning,
  });

  return {
    version: receivablesMetricsFormulaVersion,
    universeId: universe.id,
    rollRates: rollRates(universe, events, options.datasetHash),
    vintages: vintages(universe, events, options.datasetHash),
    dilution: {
      totalAmount: dilutionMeasured ? baseMetric("dilution.total_amount", dilutionAmount, "BRL", "receivables.dilution_amount", "all recorded dilution events") : dilutionUnavailable("dilution.total_amount", "BRL", "receivables.dilution_amount"),
      shareOfOrigination: dilutionMeasured ? ratioMetric("dilution.share_of_origination", dilutionAmount, totalFace, "receivables.dilution_share", "all recorded dilution events divided by gross origination") : dilutionUnavailable("dilution.share_of_origination", "ratio", "receivables.dilution_share"),
      byReason,
    },
    repurchaseAndLoss: {
      repurchasedAmount: repurchasesMeasured ? baseMetric("repurchase.amount", repurchasedAmount, "BRL", "receivables.repurchase_amount", "all recorded repurchase events") : repurchaseUnavailable("repurchase.amount", "BRL", "repurchase_event_coverage_incomplete"),
      repurchaseShareOfAssigned: !repurchasesMeasured
        ? repurchaseUnavailable("repurchase.share_of_assigned", "ratio", "repurchase_event_coverage_incomplete")
        : !assignmentDenominatorMeasured || assignedAmount.lte(0)
          ? repurchaseUnavailable("repurchase.share_of_assigned", "ratio", "assigned_volume_denominator_unavailable_or_incomplete")
          : ratioMetric("repurchase.share_of_assigned", repurchasedAmount, assignedAmount, "receivables.repurchase_share", "repurchased amount divided by assigned volume"),
      finalWrittenOffAmount: baseMetric("loss.final_written_off_amount", writtenOffAmount, "BRL", "receivables.final_written_off_amount", "unresolved amount of receivables with final status written_off at the reporting date"),
      finalWrittenOffShare: ratioMetric("loss.final_written_off_share", writtenOffAmount, totalFace, "receivables.final_written_off_share", "unresolved written-off amount divided by gross origination"),
      adjustedLossAmount: repurchasesMeasured
        ? baseMetric("loss.adjusted_amount", adjustedLossAmount, "BRL", "receivables.adjusted_loss_amount", "unresolved written-off amount plus recorded repurchases")
        : repurchaseUnavailable("loss.adjusted_amount", "BRL", "repurchase_event_coverage_incomplete"),
      adjustedLossShare: repurchasesMeasured
        ? ratioMetric("loss.adjusted_share", adjustedLossAmount, totalFace, "receivables.adjusted_loss_share", "unresolved written-off amount plus recorded repurchases divided by gross origination")
        : repurchaseUnavailable("loss.adjusted_share", "ratio", "repurchase_event_coverage_incomplete"),
    },
    punctualSettlement: {
      dueTitleCount: baseMetric("punctual.due_title_count", decimal(dueTitles.length), "count", "receivables.due_title_count", "receivables whose original due date falls on or before the reporting date"),
      dueFaceValue: baseMetric("punctual.due_face_value", dueFace, "BRL", "receivables.due_face_value", "receivables whose original due date falls on or before the reporting date"),
      punctualByCount: punctualMeasured
        ? ratioMetric("punctual.by_count", decimal(punctualTitles.length), decimal(dueTitles.length), "receivables.punctual_settlement_count", "titles fully resolved by their original due date divided by titles due")
        : punctualUnavailable("punctual.by_count", "ratio"),
      punctualByValue: punctualMeasured
        ? ratioMetric("punctual.by_value", punctualFace, dueFace, "receivables.punctual_settlement_value", "face value fully resolved by original due date divided by due face value")
        : punctualUnavailable("punctual.by_value", "ratio"),
    },
    extensions: {
      extendedTitleCount: extensionMetric("extensions.title_count", decimal(extendedTitles.length), "count", "receivables.extension_count"),
      extendedTitleShare: extensionMetric("extensions.title_share", decimal(extendedTitles.length).div(universe.receivables.length), "ratio", "receivables.extension_title_share", String(extendedTitles.length), String(universe.receivables.length)),
      extendedFaceValue: extensionMetric("extensions.face_value", extendedFace, "BRL", "receivables.extension_face_value"),
      extendedFaceShare: extensionMetric("extensions.face_share", extendedFace.div(totalFace), "ratio", "receivables.extension_face_share", canonicalMetricValue(extendedFace), canonicalMetricValue(totalFace)),
      weightedExtensionDays: extensionMetric("extensions.weighted_days", extendedFace.gt(0) ? extensionDaysNumerator.div(extendedFace) : ZERO, "days", "receivables.weighted_extension_days", canonicalMetricValue(extensionDaysNumerator), canonicalMetricValue(extendedFace)),
    },
    quality: {
      warnings: [...new Set([
        ...qualityWarnings,
        ...(universe.eventCoverage.extensions.status === "partial" ? ["extension timing series cannot be calculated"] : []),
        ...(DILUTION_REASONS.filter((reason) => reason !== "other").every((reason) => universe.dilutions.every((event) => event.reason !== reason)) ? ["dilution causes are unclassified at title level"] : []),
      ])],
    },
  };
}
