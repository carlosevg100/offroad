export const businessDayCalendarVersion = "2026.10.19-v1";

/** Gregorian Easter Sunday (anonymous Gregorian algorithm, Meeus/Jones/Butcher). */
export function gregorianEaster(year: number): string {
  if (!Number.isInteger(year) || year < 1583 || year > 4099) throw new Error("calendar_year_out_of_range");
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const shift = (iso: string, days: number) => {const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);};
const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];

/** Brazilian national banking holidays of a year: the fixed national dates (Consciência Negra
 * included from 2024), Carnival Monday and Tuesday, Good Friday and Corpus Christi. Local
 * holidays and extraordinary closures are not inferred; they need an adopted calendar. */
export function brazilianNationalHolidays(year: number): string[] {
  const easter = gregorianEaster(year);
  return [...fixed.filter((md) => md !== "11-20" || year >= 2024).map((md) => `${year}-${md}`),
    shift(easter, -48), shift(easter, -47), shift(easter, -2), shift(easter, 60)].sort();
}

/** Business days in (start, end]: weekdays that are not national banking holidays. This is the
 * count the CDI accrues over between two dates. */
export function brazilianBusinessDays(start: string, end: string): number {
  if (end < start) throw new Error("calendar_reversed_interval");
  const holidays = new Set<string>();
  for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) for (const h of brazilianNationalHolidays(y)) holidays.add(h);
  let n = 0;
  for (let d = shift(start, 1); d <= end; d = shift(d, 1)) {
    const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidays.has(d)) n++;
  }
  return n;
}
