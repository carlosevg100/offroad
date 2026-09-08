import {createFormatter} from "next-intl";

type Locale = "pt-BR" | "en-US";
const formatters = {"pt-BR": createFormatter({locale: "pt-BR"}), "en-US": createFormatter({locale: "en-US"})};

/** Presentation only: preserve every decimal digit without converting financial strings to floats.
 * Group the integer through next-intl; preserve fractional scale and identifiers with leading zeros.
 * No percentage, currency or multiple is inferred from an unknown output field.
 */
export function formatPreviewNumber(value: string | number, locale: Locale): string {
  const source = typeof value === "number" && Object.is(value, -0) ? "-0" : String(value);
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/.exec(source);
  if (!match) return source;
  const [, sign, integer, fraction] = match;
  const formatter = formatters[locale];
  const grouped = formatter.number(BigInt(`${sign}${integer}`), {maximumFractionDigits: 0});
  const signed = sign && BigInt(integer) === 0n ? formatter.number(-0) : grouped;
  const separator = formatter.number(1.1).replace(/\d/g, "");
  return fraction === undefined ? signed : `${signed}${separator}${fraction}`;
}

/** Explicit decimal-rate unit only: shift the decimal point exactly, never through Number. */
export function formatPreviewAnnualPercentage(value: string | number, locale: Locale): string | null {
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/.exec(String(value));
  if (!match) return null;
  const [, sign, integer, fraction = ""] = match;
  const digits = `${integer}${fraction.padEnd(2, "0")}`;
  const split = integer!.length + 2;
  const whole = BigInt(digits.slice(0, split)).toString();
  const remainder = digits.slice(split).replace(/0+$/, "");
  return `${formatPreviewNumber(`${sign}${whole}${remainder ? `.${remainder}` : ""}`, locale)}% a.a.`;
}
