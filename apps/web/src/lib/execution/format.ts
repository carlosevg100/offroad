/** A decimal string from the engine, grouped and punctuated for the locale without passing through
 * a floating-point number, so every digit the packet carries is the digit the reader sees. */
export function formatDecimal(value: string, locale: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const [, sign, integer, fraction] = match;
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5);
  const group = parts.find(part => part.type === "group")?.value ?? ",";
  const decimal = parts.find(part => part.type === "decimal")?.value ?? ".";
  return `${sign}${integer!.replace(/\B(?=(\d{3})+(?!\d))/g, group)}${fraction ? `${decimal}${fraction}` : ""}`;
}

/** Rounds a decimal string half away from zero to `places` digits by string arithmetic only, then
 * formats it for the locale; display rounding never changes the value the packet carries. */
export function formatRounded(value: string, places: number, locale: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const [, sign, integer, fraction = ""] = match;
  const digits = (integer! + fraction.padEnd(places + 1, "0").slice(0, places + 1)).replace(/^0+(?=\d)/, "");
  const up = Number(digits.slice(-1)) >= 5;
  let kept = digits.slice(0, -1) || "0";
  if (up) kept = (BigInt(kept) + 1n).toString();
  kept = kept.padStart(places + 1, "0");
  const whole = places ? `${kept.slice(0, -places)}.${kept.slice(-places)}` : kept;
  const negative = sign === "-" && /[1-9]/.test(kept);
  return formatDecimal(`${negative ? "-" : ""}${whole}`, locale);
}

/** A decimal string scaled by a power of ten (millions: -6, percent: 2) by moving the point. */
export function shiftDecimal(value: string, exponent: number): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const [, sign, integer, fraction = ""] = match;
  const point = integer!.length + exponent, digits = integer! + fraction;
  const padded = point <= 0 ? "0".repeat(1 - point) + digits : point > digits.length ? digits.padEnd(point, "0") : digits;
  const at = Math.max(point, 1);
  const whole = padded.slice(0, at).replace(/^0+(?=\d)/, ""), rest = padded.slice(at).replace(/0+$/, "");
  return `${sign}${whole}${rest ? `.${rest}` : ""}`;
}
