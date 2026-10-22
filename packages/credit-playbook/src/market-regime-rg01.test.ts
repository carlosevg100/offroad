import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {canonicalPolicy, evaluateRg01, freshnessDeadline, MarketPolicyCanonicalError, projectionText, rg01Projection, type Rg01Snapshot} from "./market-regime-rg01";
import {pricingMarketProposals} from "./reference-data-proposals/pricing-market";

const vectors = JSON.parse(readFileSync(new URL("../vectors/market-rg01.json", import.meta.url), "utf8")) as {
  policyCanonical: {name: string; value: unknown; text: string; sha256: string}[];
  policyRefusals: {name: string; value: unknown}[];
  deadlines: {endDate: string; deadline: string}[];
  evaluations: {name: string; snapshot: Rg01Snapshot; expected: unknown}[];
};

/** The declaration pinned in supabase/migrations (market_m2_rg01_monitor): its text must be the canonical
 * projection of the policy in this package, so a change to the policy needs a new migration. */
export const PINNED_RG01_PROJECTION_SHA256 = "31656412a93a1c2d52a651308bbcc307266ba211b9d4089801203c982a3ce0d7";

describe("market-policy.v1", () => {
  it.each(vectors.policyCanonical)("writes $name byte for byte like the independent generator", ({value, text, sha256}) => {
    expect(`${canonicalPolicy(value)}\n`).toBe(text);
    expect(createHash("sha256").update(text, "utf8").digest("hex")).toBe(sha256);
  });
  it.each(vectors.policyRefusals)("refuses a fraction ($name)", ({value}) => {
    expect(() => canonicalPolicy(value)).toThrow(MarketPolicyCanonicalError);
  });
  it("refuses the whole regime value, which carries fractions, and accepts its RG-01 projection", () => {
    const entry = pricingMarketProposals["policy.pricing.regime"]!;
    expect(() => canonicalPolicy(entry.value)).toThrow(MarketPolicyCanonicalError);
    const text = projectionText(rg01Projection("policy.pricing.regime", entry.version, entry.value as Parameters<typeof rg01Projection>[2]));
    expect(text).toContain("\"RG-01\"");
    expect(text.endsWith("}\n")).toBe(true);
  });
  it("matches the declaration pinned in the migration", () => {
    const entry = pricingMarketProposals["policy.pricing.regime"]!;
    const text = projectionText(rg01Projection("policy.pricing.regime", entry.version, entry.value as Parameters<typeof rg01Projection>[2]));
    expect(createHash("sha256").update(text, "utf8").digest("hex")).toBe(PINNED_RG01_PROJECTION_SHA256);
  });
});

describe("freshness deadline (decision 5)", () => {
  it.each(vectors.deadlines)("a meeting ending $endDate is due on $deadline", ({endDate, deadline}) => {
    expect(freshnessDeadline(endDate)).toBe(deadline);
  });
});

describe("RG-01 evaluator", () => {
  it.each(vectors.evaluations)("$name", ({snapshot, expected}) => {
    expect(evaluateRg01(snapshot)).toEqual(expected);
  });
});
