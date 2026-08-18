import type {Json} from "@/types/database";

import type {IntakeCandidate} from "./types";

/** Field groups in the order the review UI presents them (mirrors the DB check constraint). */
export const intakeGroups = [
  "company",
  "transaction",
  "historical_financials",
  "interim_financials",
  "project",
  "projections",
  "leverage",
  "collateral",
] as const;

export type IntakeGroup = (typeof intakeGroups)[number];

export type ValueLabels = {yes: string; no: string};
export type AnchorLabels = {page: string; sheet: string; cell: string};

/** Human-readable rendering of a normalized value, locale-aware, without changing the value itself. */
export function displayCandidateValue(candidate: Pick<IntakeCandidate, "normalized_value" | "currency" | "unit">, locale: string, labels: ValueLabels) {
  const value = candidate.normalized_value;
  if (typeof value === "number") {
    if (candidate.currency) return new Intl.NumberFormat(locale, {style: "currency", currency: candidate.currency, maximumFractionDigits: 0}).format(value);
    if (candidate.unit === "x") return `${new Intl.NumberFormat(locale, {maximumFractionDigits: 2}).format(value)}x`;
    return new Intl.NumberFormat(locale, {maximumFractionDigits: 4}).format(value);
  }
  if (typeof value === "boolean") return value ? labels.yes : labels.no;
  if (Array.isArray(value)) return value.join(", ");
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Value placed in the edit input. Numbers are emitted in a locale-neutral form (`.` decimal separator). */
export function editableCandidateValue(candidate: Pick<IntakeCandidate, "normalized_value">) {
  const value = candidate.normalized_value;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Compact evidence pointer such as "page 3 · Demonstração do resultado" or "sheet GARANTIAS · cell E17". */
export function anchorText(candidate: Pick<IntakeCandidate, "source_anchor">, labels: AnchorLabels) {
  const anchor = candidate.source_anchor && typeof candidate.source_anchor === "object" && !Array.isArray(candidate.source_anchor) ? candidate.source_anchor as Record<string, Json | undefined> : {};
  return [
    anchor.page ? `${labels.page} ${anchor.page}` : "",
    anchor.sheet ? `${labels.sheet} ${anchor.sheet}` : "",
    anchor.cell ? `${labels.cell} ${anchor.cell}` : "",
    anchor.section ? String(anchor.section) : "",
  ].filter(Boolean).join(" · ");
}

/** Decimal separator used by `locale` ("," for pt-BR, "." for en-US). */
export function decimalSeparatorFor(locale: string) {
  try {
    return new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  } catch {
    return ".";
  }
}

/**
 * Parses a user-typed number in Brazilian or English notation without guessing.
 *
 * Accepts "1,78", "1.78", "54000000", "54.000.000", "54,000,000", "54.000.000,00",
 * "54,000,000.00", "R$ 54.000.000,00", "1,45x", "-2.5". Rules:
 * - both separators present → the last one is the decimal separator;
 * - the same separator repeated → grouping (each group after the first must have 3 digits);
 * - a single separator with exactly three trailing digits ("1,234" / "1.234") is ambiguous →
 *   the locale's decimal separator wins ("1,234" is 1.234 in pt-BR and 1234 in en-US);
 * - a single separator with any other number of trailing digits is a decimal separator.
 * Returns `null` for anything that is not an unambiguous number.
 */
export function parseLocalizedNumber(raw: string, locale: string): number | null {
  let text = raw.trim();
  if (!text) return null;
  // Strip currency symbols, unit suffixes and spaces; keep digits, sign and separators.
  text = text.replace(/[^\d,.\-+]/g, "");
  if (!text) return null;

  const sign = text.startsWith("-") ? -1 : 1;
  text = text.replace(/^[+-]/, "");
  if (!/^\d[\d.,]*$/.test(text)) return null;

  const commas = (text.match(/,/g) ?? []).length;
  const dots = (text.match(/\./g) ?? []).length;
  let integerPart = text;
  let fractionPart = "";

  if (commas && dots) {
    const decimalSeparator = text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
    const index = text.lastIndexOf(decimalSeparator);
    integerPart = text.slice(0, index).replace(/[.,]/g, "");
    fractionPart = text.slice(index + 1);
  } else if (commas || dots) {
    const separator = commas ? "," : ".";
    const parts = text.split(separator);
    const tail = parts[parts.length - 1] ?? "";
    if (parts.length > 2) {
      if (!parts.slice(1).every((part) => part.length === 3)) return null;
      integerPart = parts.join("");
    } else if (tail.length === 3 && separator !== decimalSeparatorFor(locale)) {
      integerPart = parts.join("");
    } else {
      integerPart = parts[0] ?? "";
      fractionPart = tail;
    }
  }

  if (!/^\d+$/.test(integerPart) || !/^\d*$/.test(fractionPart)) return null;
  const parsed = Number(`${integerPart}${fractionPart ? `.${fractionPart}` : ""}`);
  return Number.isFinite(parsed) ? sign * parsed : null;
}

/** Splits a comma-separated list, trims, drops blanks and caps the size. */
export function parseList(raw: string, limit = 50) {
  return raw.split(",").map((item) => item.trim()).filter(Boolean).slice(0, limit);
}
