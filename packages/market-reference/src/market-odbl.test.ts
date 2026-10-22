import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {canonicalOdbl, odblFile} from "./market-odbl";

const vectors = JSON.parse(readFileSync(new URL("../vectors/market-odbl-canonical.json", import.meta.url), "utf8")) as {
  cases: {name: string; input: unknown; canonical: string; sha256: string}[]; refusals: {name: string; input: unknown}[]};

describe("market-odbl.v1 canonical bytes (shared vectors)", () => {
  it.each(vectors.cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    expect(canonicalOdbl(c.input)).toBe(c.canonical);
    expect(odblFile(c.input).sha256).toBe(c.sha256);
  });
  it.each(vectors.refusals.map((c) => [c.name, c] as const))("refuses %s", (_, c) => {
    expect(() => canonicalOdbl(c.input)).toThrow("market_odbl_number_not_allowed");
  });
  it("orders keys by code point, not by UTF-16 code unit", () => {
    expect(canonicalOdbl({"ﬀ": "a", "\u{1F600}": "b"})).toBe(`{"ﬀ":"a","\u{1F600}":"b"}`);
  });
  it("refuses values that are not JSON data", () => {
    expect(() => canonicalOdbl({a: undefined})).toThrow("market_odbl_value_invalid");
    expect(() => canonicalOdbl(new Date(0))).toThrow("market_odbl_value_invalid");
  });
});
