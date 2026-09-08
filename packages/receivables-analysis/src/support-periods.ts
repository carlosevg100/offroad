import type {SourceAnchor} from "@offroad/financial-core";

export type ReceivablesSupportPeriodEntry = {
  id: string;
  detectorId: string;
  sourceId: string;
  sourceLabel: string;
  sourceHash: string;
  anchor: SourceAnchor;
  dateKind: "stock_as_of" | "flow_interval" | "event_timestamp" | "event_date";
  requiresSourceReview?: true | undefined;
  scopeAmbiguous?: true | undefined;
  amountStatus?: "provided" | "missing" | "invalid" | undefined;
  rawDate: string | null;
  startDate: string | null;
  endDate: string | null;
  qualification: "included" | "subsequent" | "missing" | "invalid" | "overlaps_cutoff";
};

export type ReceivablesSupportPeriodAssessment = {
  schemaVersion: "receivables-support-periods.v1";
  reportingDate: string;
  dateComparisonPolicy: "source_local_calendar_date";
  entries: readonly ReceivablesSupportPeriodEntry[];
};

export function supportCalendarDate(raw: string): string | null {
  const value = /^\d{2}\/\d{2}\/\d{4}$/.test(raw)
    ? `${raw.slice(6)}-${raw.slice(3, 5)}-${raw.slice(0, 2)}` : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value ? value : null;
}

/** Dates are source dates, never upload dates. Timestamps retain their explicit local offset date. */
export function qualifySupportPeriod(
  raw: string | null | undefined,
  kind: ReceivablesSupportPeriodEntry["dateKind"],
  cutoff: string,
): Pick<ReceivablesSupportPeriodEntry, "rawDate" | "startDate" | "endDate" | "qualification"> {
  if (!supportCalendarDate(cutoff) || cutoff.includes("/")) throw new RangeError("support reporting cutoff must be a real ISO calendar date");
  const rawDate = raw?.trim() || null;
  if (!rawDate) return {rawDate, startDate: null, endDate: null, qualification: "missing"};
  let startDate: string | null = null;
  let endDate: string | null = null;
  if (kind === "flow_interval" && /^\d{2}\/\d{4}$/.test(rawDate)) {
    startDate = supportCalendarDate(`${rawDate.slice(3)}-${rawDate.slice(0, 2)}-01`);
    if (startDate) {
      const date = new Date(`${startDate}T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + 1, 0);
      endDate = date.toISOString().slice(0, 10);
    }
  } else if (kind === "event_timestamp") {
    if (/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/.test(rawDate)) {
      startDate = supportCalendarDate(rawDate.slice(0, 10));
      endDate = startDate;
    }
  } else if (kind !== "flow_interval") {
    startDate = supportCalendarDate(rawDate);
    endDate = startDate;
  }
  const qualification = !startDate || !endDate ? "invalid"
    : startDate > cutoff ? "subsequent"
      : endDate > cutoff ? "overlaps_cutoff" : "included";
  return {rawDate, startDate, endDate, qualification};
}

export function supportPeriodBlocks(entry: ReceivablesSupportPeriodEntry): boolean {
  return entry.requiresSourceReview === true || entry.scopeAmbiguous === true
    || (entry.qualification !== "subsequent" && (entry.amountStatus === "missing" || entry.amountStatus === "invalid"))
    || (entry.qualification !== "included" && entry.qualification !== "subsequent");
}
