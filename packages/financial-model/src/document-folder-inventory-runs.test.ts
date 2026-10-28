import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildDocumentFolderInventoryRuns, documentFolderInventoryRunIds} from "./document-folder-inventory-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded document folder inventory evaluations", () => {
  it("reexecutes every gold, adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of buildDocumentFolderInventoryRuns()) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass"); expect(record.modelCalls).toBe(0); expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 900_000);
  it("covers the answer key, the decision findings, both turns, the four variations and every immediate failure of the ficha", () => {
    expect(records.get(documentFolderInventoryRunIds.gold)!.cases.map((c) => c.id)).toEqual([
      "inventory-item-by-item-matches-the-answer-key", "counts-30-1-2-3-2-21", "copy-found-by-hash", "versions-resolved-none-deleted", "amendment-is-the-text-in-force",
      "seven-decision-findings-in-order-with-source", "debt-is-130-not-140", "unreadable-page-and-photo-not-invented", "gaps-by-purpose-in-the-key-order",
      "one-question-only-the-user-knows", "no-numeric-analysis-nothing-validated", "renaming-every-file-changes-nothing", "misleading-names-do-not-move-the-version",
      "later-draft-does-not-beat-the-audited", "turn-2-updates-only-the-affected-rows", "turn-2-page-7-read-and-semester-closes-month-by-month",
      "turn-2-informed-fact-with-author-and-date", "variation-organize-only", "variation-for-the-debt-discussion", "variation-empty-vault-no-decisions",
      "variation-several-companies", "unresolved-month-blocks-the-semester-sum", "draft-amendment-changes-no-term",
      "replaced-notice-is-history-not-a-deadline", "same-hash-read-two-ways-is-declared", "approved-amendment-is-not-in-force", "tied-amendments-have-no-winner",
      "later-cut-is-the-covenant-in-force", "substitutes-of-one-hash-read-two-ways-are-suspended", "text-only-tie-is-a-conflict",
      "conflict-resolved-later-is-history", "competing-originals-without-winner", "position-tie-broken-by-version", "covenant-without-its-limit-text-has-no-effect",
      "two-covenants-in-one-amendment-are-a-conflict", "recovered-covenant-joins-the-text-in-force",
      "recovered-notice-does-not-revive-a-replaced-deadline", "unread-predecessor-is-not-absent", "future-amendment-is-not-current", "unread-substitutive-clause-keeps-no-limit-in-force", "page-copies-differing-in-the-debt-table-leave-the-page-unread",
      "amendment-without-a-read-original-has-no-deadline", "future-board-minutes-have-no-effect", "concurrent-values-of-one-metric-are-a-conflict", "side-by-side-is-for-budgets-only", "future-position-blocks-the-debt-check", "unreadable-original-blocks-the-text-in-force",
      "update-after-the-reading-date-is-future", "copy-with-its-own-conflict-does-not-complete-the-page", "comparison-without-both-operands-is-withheld", "update-not-read-shows-the-prior-as-history",
      "partial-period-is-not-summed", "draft-copy-does-not-fill-the-page", "future-parent-statements-of-another-period-block-the-perimeter",
      "recovered-page-read-against-another-page-leaves-the-row-partial",
      "recovered-table-and-note-join-the-document", "new-version-in-the-update-supersedes-the-prior-winner",
      "equivalent-copies-in-another-order-agree", "new-debt-position-passes-the-old-total-to-history", "same-local-id-on-document-and-copy-keeps-both",
      "local-ids-alone-are-not-a-reading-conflict", "duplicate-of-the-ccb-reads-the-recovered-page", "reading-date-makes-the-amendment-current",
      "eliminated-amendment-does-not-split-identical-later-ones", "small-exception-and-close-totals-are-shown-exactly",
      "same-reference-of-another-entity-is-another-instrument", "clause-amount-on-its-declared-scale",
      "competing-originals-with-different-readings-have-no-winner", "policy-compared-only-within-its-entity", "registry-dated-after-the-reading-does-not-close-the-gap",
      "subsidiary-forecast-does-not-resolve-the-company-gap", "unused-limit-explains-only-part-of-the-difference",
      "individual-audited-does-not-supersede-consolidated-draft", "individual-forecast-does-not-close-consolidated-liquidity", "individual-month-blocks-the-consolidated-semester",
      "registry-name-never-enters-the-method-voice", "revenue-not-confronted-across-perimeters", "revenue-not-confronted-across-perimeters-reverse", "revenue-confronted-within-the-perimeter",
      "double-counted-month-never-sums", "double-counted-month-never-agrees", "outdated-registry-does-not-resolve-the-gap", "current-registry-resolves-the-gap", "budget-revision-after-the-reading-is-not-compared",
      "budget-comparison-nominal", "budget-comparison-future", "budget-comparison-page-not-read", "budget-comparison-conflicting-figures", "budget-comparison-source-outside-the-registry", "notice-deadline-followed-never-scheduled"]);
    expect(records.get(documentFolderInventoryRunIds.adversarial)!.cases).toHaveLength(45);
    expect(records.get(documentFolderInventoryRunIds.consistency)!.cases).toHaveLength(6);
  });
});
