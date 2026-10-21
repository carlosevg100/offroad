/** Availability of market data for a data-base (ADR 0023, M2 part 0). In M2 every observation is
 * available when the Offroad acquired it: the sources give no official instant of publication. A
 * reading with data-base D sees only what was acquired before the exclusive limit of D, the first
 * instant whose civil date in America/Sao_Paulo is D+1. Instants are compared, never dates. */
export const marketAvailabilityVersion = "2026.10.21-v1";
export const marketAvailabilityTimeZone = "America/Sao_Paulo";
export const marketAvailabilityBasis = "observed_at_acquisition";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const civilDate = new Intl.DateTimeFormat("en-CA", {timeZone: marketAvailabilityTimeZone, year: "numeric", month: "2-digit", day: "2-digit"});

export function nextCivilDate(date: string): string {
  if (!isoDate.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("market_date_invalid");
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The civil date in São Paulo of an instant (milliseconds since the epoch). */
export function saoPauloDate(ms: number): string {
  return civilDate.format(new Date(ms));
}

/** The exclusive limit of data-base D: the first millisecond whose São Paulo date is D+1. A day that
 * begins in a daylight-saving gap or repeats an hour still has exactly one such instant. */
export function dataBaseLimit(dataBase: string): string {
  const target = nextCivilDate(dataBase);
  if (target < "1990-01-01") throw new Error("market_date_out_of_range");
  const midnight = Date.parse(`${target}T00:00:00Z`);
  let lo = midnight, hi = midnight + 6 * 3_600_000;
  if (saoPauloDate(lo) >= target || saoPauloDate(hi) < target) throw new Error("market_time_zone_unexpected");
  while (hi - lo > 1) {const mid = Math.floor((lo + hi) / 2); if (saoPauloDate(mid) >= target) hi = mid; else lo = mid;}
  return new Date(hi).toISOString();
}

const instantGrammar = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;

/** An instant in microseconds since the epoch, the precision of Postgres `timestamptz`. The grammar
 * is closed (RFC 3339 with at most six fractional digits); seven digits are refused, never rounded. */
export function instantMicros(value: string): bigint {
  const m = instantGrammar.exec(value);
  if (!m) throw new Error("market_instant_invalid");
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) throw new Error("market_instant_invalid");
  const offsetMinutes = m[8] === "Z" ? 0 : (m[9] === "-" ? -1 : 1) * (Number(m[10]) * 60 + Number(m[11]));
  if (m[8] !== "Z" && (Number(m[10]) > 23 || Number(m[11]) > 59)) throw new Error("market_instant_invalid");
  return (BigInt(ms) - BigInt(offsetMinutes) * 60_000n) * 1000n + BigInt((m[7] ?? "").padEnd(6, "0"));
}

/** The canonical UTC text of an instant: six fractional digits and `Z`. */
export function canonicalInstant(value: string): string {
  const micros = instantMicros(value);
  const ms = micros / 1000n, rest = micros % 1000n;
  const floorMs = rest < 0n ? ms - 1n : ms, sub = rest < 0n ? rest + 1000n : rest;
  const iso = new Date(Number(floorMs)).toISOString();
  return `${iso.slice(0, 23)}${sub.toString().padStart(3, "0")}Z`;
}

/** Whether something acquired (and made available) at these instants may be read with data-base D:
 * both strictly before the limit. Equal to the limit is already the next day. */
export function availableForDataBase(item: {acquiredAt: string; availableAt: string}, dataBase: string): boolean {
  const limit = instantMicros(dataBaseLimit(dataBase));
  return instantMicros(item.acquiredAt) < limit && instantMicros(item.availableAt) < limit;
}
