import Decimal from "decimal.js";

Decimal.set({precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 30});

/**
 * Canonical text normalization used by every containment check:
 * NFKC → lower-case → strip diacritics → unify spaces/dashes → collapse whitespace.
 * Numbers keep their separators so "185.400" ≠ "185400" (exactness is checked
 * separately through digit sequences).
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}/gu, "")
    .replace(/[   ]/g, " ")
    .replace(/[‐-―−]/g, "-")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Digits only (used to check that a number was not altered by re-formatting). */
export function digitSequence(value: string): string {
  return value.replace(/\D+/g, "");
}

export function containsNormalized(haystack: string, needle: string): boolean {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (n.length === 0) return false;
  return h.includes(n);
}

const wordScales: Array<[RegExp, number]> = [
  [/\b(bilh(ao|oes)|bilhao|bilhoes|bi|billion|billions|bn)\b/i, 1_000_000_000],
  [/\b(milh(ao|oes)|milhao|milhoes|mi|mm|million|millions|mn)\b/i, 1_000_000],
  [/\b(mil|thousand|thousands|k)\b/i, 1_000],
];

export type ParsedNumber = {
  value: Decimal;
  negative: boolean;
  /** Multiplier implied by a word in the raw text ("54 milhões" → 1e6), null when absent. */
  detectedScale: number | null;
  isPercent: boolean;
};

/**
 * Parses numbers as they appear in Brazilian and international financial
 * documents: `185.400`, `185.400,50`, `1,234.5`, `(1.234)`, `-1.234`,
 * `R$ 54 milhões`, `12,5%`, `3,2x`. Returns null when no number is present.
 * `localeHint` only breaks the ambiguous single-separator case (`1.234`).
 */
export function parseNumber(raw: string, localeHint: "pt-BR" | "en-US" = "pt-BR"): ParsedNumber | null {
  const cleaned = raw.normalize("NFKC").replace(/[   ]/g, " ").trim();
  if (!/\d/.test(cleaned)) return null;

  const isPercent = /%/.test(cleaned);
  let detectedScale: number | null = null;
  for (const [pattern, scale] of wordScales) {
    if (pattern.test(stripDiacritics(cleaned))) {
      detectedScale = scale;
      break;
    }
  }

  const parenthesized = /^\s*\(.*\)\s*$/.test(cleaned) || /\(\s*[\d.,]+\s*\)/.test(cleaned);
  // A multiplier suffix ("4,0x", "3.0 x") is a unit, the way "%" is; the digits are the value.
  const match = /[-−–]?\s?\d[\d.,]*/.exec(cleaned.replace(/\(([^)]*)\)/g, "$1").replace(/(\d)\s?x\b/i, "$1"));
  if (!match) return null;
  let token = match[0].replace(/\s+/g, "").replace(/[.,]+$/, "");
  let negative = parenthesized || /^[-−–]/.test(token) || /^\s*[-−–]/.test(cleaned);
  token = token.replace(/^[-−–]/, "");
  // A trailing minus ("1.234-") is used by some ERPs.
  if (/[-−–]\s*$/.test(cleaned) && !/[a-zA-Z%]/.test(cleaned)) negative = true;

  const dots = (token.match(/\./g) ?? []).length;
  const commas = (token.match(/,/g) ?? []).length;
  let integerPart = token;
  let fractionPart = "";

  if (dots > 0 && commas > 0) {
    const lastDot = token.lastIndexOf(".");
    const lastComma = token.lastIndexOf(",");
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const [i, f = ""] = splitLast(token, decimalSeparator);
    integerPart = i.replace(/[.,]/g, "");
    fractionPart = f;
  } else if (dots > 0 || commas > 0) {
    const separator = dots > 0 ? "." : ",";
    const count = dots > 0 ? dots : commas;
    const [i, f = ""] = splitLast(token, separator);
    // "0.181" is never zero thousand one hundred and eighty-one: a leading lone zero makes the
    // separator decimal in any locale. Aurora's customer sheet measured the alternative: every
    // share came back a hundred times too large.
    const leadingZero = /^0$/.test(i);
    const looksLikeThousands = !leadingZero && (count > 1 || (f.length === 3 && (separator === "." ? localeHint === "pt-BR" : localeHint === "en-US")));
    if (looksLikeThousands) {
      integerPart = token.replace(/[.,]/g, "");
      fractionPart = "";
    } else {
      integerPart = i.replace(/[.,]/g, "");
      fractionPart = f;
    }
  }

  if (!/^\d+$/.test(integerPart) || (fractionPart && !/^\d+$/.test(fractionPart))) return null;
  const magnitude = new Decimal(fractionPart ? `${integerPart}.${fractionPart}` : integerPart);
  return {value: negative ? magnitude.negated() : magnitude, negative, detectedScale, isPercent};
}

function splitLast(token: string, separator: string): [string, string] {
  const index = token.lastIndexOf(separator);
  return [token.slice(0, index), token.slice(index + 1)];
}

function stripDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "");
}

const monthTokens: Record<string, number> = {
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12,
};

/**
 * Parses dates in the shapes seen in documents: `2025-12-31`, `31/12/2025`,
 * `31.12.2025`, `dez/25`, `dezembro de 2025` (→ last day of month), `07/2026`
 * (→ last day of month). Returns an ISO date or null.
 */
export function parseDate(raw: string): string | null {
  const value = normalizeText(raw);
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return isoIfValid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (m) return isoIfValid(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})[/.-](\d{4})$/.exec(value);
  if (m) return endOfMonth(Number(m[2]), Number(m[1]));
  m = /^([a-z]{3})[a-z]*[ /.-]*(?:de )?(\d{2}|\d{4})$/.exec(value);
  if (m) {
    const month = monthTokens[m[1] as keyof typeof monthTokens];
    if (!month) return null;
    const year = m[2]!.length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    return endOfMonth(year, month);
  }
  m = /^(\d{1,2}) de ([a-z]+) de (\d{4})$/.exec(value);
  if (m) {
    const month = monthTokens[m[2]!.slice(0, 3) as keyof typeof monthTokens];
    if (!month) return null;
    return isoIfValid(Number(m[3]), month, Number(m[1]));
  }
  return null;
}

function endOfMonth(year: number, month: number): string | null {
  if (month < 1 || month > 12) return null;
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return isoIfValid(year, month, day);
}

function isoIfValid(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > last) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseBoolean(raw: string): boolean | null {
  const value = normalizeText(raw);
  if (["sim", "yes", "true", "verdadeiro", "s", "y", "x", "conciliado", "reconciled"].includes(value)) return true;
  if (["nao", "no", "false", "falso", "n", "nao conciliado", "not reconciled"].includes(value)) return false;
  return null;
}

export function parseList(raw: string): string[] {
  const parts = raw
    .split(/[;\n]|,(?=\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  // Portuguese closes an enumeration with "e", not a comma: "Franca, Araraquara e São Carlos"
  // is three items. Only the final part of an already-plural list is split, so a lone name
  // that happens to contain "e" ("Compra e Venda Ltda") is never torn apart.
  if (parts.length >= 2) {
    const last = parts[parts.length - 1] ?? "";
    const closing = /^(.+?)\s+e\s+(.+)$/.exec(last);
    if (closing) parts.splice(parts.length - 1, 1, closing[1]!.trim(), closing[2]!.trim());
  }
  return parts;
}
