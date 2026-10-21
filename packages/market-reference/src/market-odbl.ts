import {createHash} from "node:crypto";

/** market-odbl.v1, the canonical bytes of an ODbL edition (docs/build/market-reference/M2-PARTE-3.md): UTF-8
 * JSON with object keys ordered by code point, no whitespace, arrays in their given order, every number
 * carried as a decimal string (a number is refused), minimal escaping (quote, backslash and controls below
 * U+0020 as a lowercase six-character escape) and a final newline. The database writes the same bytes; the
 * digest travels outside the body. */
export const marketOdblFormat = "offroad.market-odbl.v1";

export type OdblValue = string | boolean | null | OdblValue[] | {[key: string]: OdblValue};

export class MarketOdblError extends Error {
  constructor(readonly code: "market_odbl_number_not_allowed" | "market_odbl_value_invalid") {super(code);}
}

const escapeString = (value: string): string => {
  let out = "\"";
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (ch === "\"") out += "\\\"";
    else if (ch === "\\") out += "\\\\";
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  return out + "\"";
};

/** Code-point order; JavaScript's default comparison is by UTF-16 code unit and differs above U+FFFF. */
const byCodePoint = (a: string, b: string): number => {
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
};

export function canonicalOdbl(value: unknown): string {
  if (value === null) return "null";
  if (value === true || value === false) return String(value);
  if (typeof value === "string") return escapeString(value);
  if (typeof value === "number" || typeof value === "bigint") throw new MarketOdblError("market_odbl_number_not_allowed");
  if (Array.isArray(value)) return `[${value.map(canonicalOdbl).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.keys(value as object).sort(byCodePoint);
    return `{${entries.map((k) => `${escapeString(k)}:${canonicalOdbl((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  throw new MarketOdblError("market_odbl_value_invalid");
}

/** The served file: the canonical text with its final newline, and the SHA-256 of those bytes. */
export function odblFile(value: unknown): {text: string; sha256: string} {
  const text = `${canonicalOdbl(value)}\n`;
  return {text, sha256: createHash("sha256").update(text, "utf8").digest("hex")};
}
