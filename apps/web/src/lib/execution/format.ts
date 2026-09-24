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
