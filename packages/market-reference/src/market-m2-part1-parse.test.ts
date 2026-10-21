import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {parseCommuniqueDetail, parseSelicTarget} from "./selic-target-contract";

/** The parse vectors of part 1, read by this test and by supabase/tests/market_version_commit.sql: the
 * worker and the database refuse and accept the same bytes with the same codes. */
type ParseCase = {name: string; kind: "sgs" | "detail"; content: string; contentBase64: boolean; window?: {start: string; end: string}; dataBase?: string; meeting?: number;
  expect: {error: string} | {observations: {period: string; value: string}[]} | {referenceDate: string; decision: string; targetPct: string; seriesChangeDate: string; regulatoryEffectiveFrom: string}};
const vectors = JSON.parse(readFileSync(new URL("../vectors/market-m2-part1-parse.json", import.meta.url), "utf8")) as {cases: ParseCase[]};
const bytes = (c: ParseCase) => c.contentBase64 ? new Uint8Array(Buffer.from(c.content, "base64")) : new TextEncoder().encode(c.content);

describe("shared parse vectors (TypeScript side)", () => {
  it.each(vectors.cases)("$name", (c) => {
    const run = () => c.kind === "sgs" ? {observations: parseSelicTarget(bytes(c), c.window!, c.dataBase)} : (({meeting: _m, recordSha256: _r, ...rest}) => rest)(parseCommuniqueDetail(bytes(c), c.meeting!));
    if ("error" in c.expect) expect(run).toThrow(c.expect.error);
    else expect(run()).toEqual(c.expect);
  });
});
