import {createHash} from "node:crypto";
import {readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

import {loadReviewRecords} from "./procedure-markdown";
import {adapterReviewSchema} from "./review-record";

const reviewsRoot = join(import.meta.dirname, "..", "knowledge", "reviews");
const adapterReviewFile = "execution-profile-prepare-capital-structure-decision-2026-09-21-v4-adapter-review.json";

describe("adapter review records", () => {
  it("keeps the v4 adapter review at the path and bytes the production registration points to", () => {
    const bytes = readFileSync(join(reviewsRoot, adapterReviewFile));
    // review_evidence.sourceHash of profile 7391658b-e9b6-5c5d-9fa0-587bd4a3772f, registered on 2026-09-23.
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("39746391b8065ceb133b5712065c3420de628bd37d6f91ee8e9212b62ab38d38");
    const record = adapterReviewSchema.parse(JSON.parse(bytes.toString("utf8")));
    expect(record.result).toBe("approved");
    expect(record.subject.platformReleaseId).toBe("prepare-capital-structure-decision-2026.09.21-v4");
    expect(record.subjectCommit).toBe("65c4e441b419aedcd7a9285c405aebe53daba998");
  });

  it("validates every adapter review and keeps it out of the method review index", () => {
    const records = loadReviewRecords(reviewsRoot);
    const adapterReviews = readdirSync(reviewsRoot)
      .filter((name) => name.endsWith(".json"))
      .filter((name) => (JSON.parse(readFileSync(join(reviewsRoot, name), "utf8")) as {schemaVersion?: string}).schemaVersion === "adapter-review.v1");
    expect(adapterReviews).toContain(adapterReviewFile);
    for (const record of records.values()) expect(record.schemaVersion).toBe("ai-independent-review.v1");
    expect(records.size).toBeGreaterThan(0);
  });

  it("refuses an adapter review with a foreign result or a missing finding line", () => {
    const base = JSON.parse(readFileSync(join(reviewsRoot, adapterReviewFile), "utf8")) as Record<string, unknown>;
    expect(() => adapterReviewSchema.parse({...base, result: "pass"})).toThrow();
    const findings = base.findings as Array<Record<string, unknown>>;
    expect(() => adapterReviewSchema.parse({...base, findings: [{...findings[0], line: undefined}]})).toThrow();
  });
});
