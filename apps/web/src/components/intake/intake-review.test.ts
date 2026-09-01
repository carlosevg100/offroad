import {describe, expect, it} from "vitest";

import {isReviewAttentionItem} from "./intake-review";

describe("review attention routing", () => {
  it("routes rule-derived missing requirements to the checklist instead of duplicating them as red flags", () => {
    expect(isReviewAttentionItem({status: "open", rule_id: "requirement.financials", exception_type: "missing"})).toBe(false);
  });

  it("keeps pipeline-authored evidence issues and routes reconciliation exceptions to the case analysis", () => {
    expect(isReviewAttentionItem({status: "open", rule_id: null, exception_type: "missing"})).toBe(true);
    expect(isReviewAttentionItem({status: "open", rule_id: "reconcile.debt", exception_type: "source_conflict"})).toBe(false);
  });

  it("never renders resolved items as open attention points", () => {
    expect(isReviewAttentionItem({status: "resolved", rule_id: null, exception_type: "validation"})).toBe(false);
  });
});
