import {createHash} from "node:crypto";
import {describe, expect, it} from "vitest";
import {publicCapitalCatalog, publicCapitalCatalogReference, publicCapitalCatalogSourceSnapshot} from "./capital-catalog";
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
describe("versioned public catalog", () => {
  it("matches the immutable fingerprint pinned before approval", () => {
    expect(createHash("sha256").update(canonical(publicCapitalCatalogSourceSnapshot)).digest("hex")).toBe(publicCapitalCatalogReference.sourceFingerprint);
    expect(publicCapitalCatalog.institutions).toHaveLength(28);
    expect(publicCapitalCatalogReference.asOf).toBe(publicCapitalCatalog.asOf);
    expect(publicCapitalCatalog.institutions.every(row => !row.eligibleForVerifiedMandateMatching)).toBe(true);
  });
});
