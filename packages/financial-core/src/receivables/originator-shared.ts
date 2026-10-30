/** Whole UTC calendar days; impossible calendar dates are refused. */
export function originatorDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("originator_invalid_date");
  const timestamp = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw new RangeError("originator_invalid_date");
  return timestamp / 86400000;
}
