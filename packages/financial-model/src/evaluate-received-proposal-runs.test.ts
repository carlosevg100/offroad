import {resolve} from "node:path";
import {loadDeterministicMethodRuns, runCountsForPromotion} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";
import {buildReceivedProposalRuns, receivedProposalRunIds} from "./evaluate-received-proposal-runs.test-support";

const records = loadDeterministicMethodRuns(resolve(import.meta.dirname, "../../credit-playbook/knowledge/reviews/runs"));
describe("recorded received proposal evaluations", () => {
  it("reexecutes every gold, adversarial and consistency case and reproduces its recorded fingerprint", () => {
    for (const evidence of buildReceivedProposalRuns()) {
      const record = records.get(evidence.runId)!;
      expect(record).toBeDefined();
      expect(record.cases).toEqual(evidence.cases);
      expect(record.evidenceFingerprint).toBe(evidence.evidenceFingerprint);
      expect(record.result).toBe("pass"); expect(record.modelCalls).toBe(0); expect(record.humanApproval).toBe(false);
      expect(runCountsForPromotion(record)).toBe(true);
    }
  }, 1_800_000);
  it("covers firmness, the calendar, the fit, the covenant, the collateral, the price, the asks and the voice", () => {
    expect(records.get(receivedProposalRunIds.gold)!.cases.map((c) => c.id)).toEqual(["indicative-proposal-is-a-starting-point", "lender-has-not-seen-the-indenture", "2027-service-against-available-cash", "peak-pressure-in-the-third-quarter-of-2027", "december-solved-cash-below-minimum-from-third-quarter-2027", "two-thirds-seasonal-on-a-three-year-amortizing-loan", "covenant-on-the-indenture-definition", "bank-case-and-board-policy", "semiannual-test-doubles-the-dates", "collateral-against-the-assignable-portfolio", "retailer-a-is-not-assignable", "aggregate-basket-occupied-by-bradesco", "per-operation-reading-changes-only-the-basket", "consent-window-against-the-draw", "nominal-spread-against-the-market-range", "cost-over-the-life-apart-from-the-nominal-spread", "bridge-to-the-bradesco-operation", "longer-tenor-lightens-the-upfront-costs", "asks-and-what-each-buys", "company-alternatives-on-the-same-basis", "facts-readings-recommendations-apart-without-verdict", "questions-for-the-lender-and-the-company", "market-below-threshold-is-a-gap-not-a-reading", "missing-covenant-test-is-a-gap-not-compliance", "every-required-test-through-2028-is-present", "net-cost-under-full-deduction-convention", "net-cost-withheld-without-taxable-profit", "limits-with-no-test-are-gaps", "lender-date-before-the-draw-is-contrast-only", "lender-frequency-and-first-date-from-effective-dates", "test-date-order-changes-nothing", "life-past-the-fiscal-calendar-needs-an-adopted-hypothesis", "period-after-payoff-never-counts", "unconfirmed-indexer-is-asked", "absent-basket-usage-is-a-gap-not-zero"]);
    expect(records.get(receivedProposalRunIds.adversarial)!.cases).toHaveLength(26);
    expect(records.get(receivedProposalRunIds.consistency)!.cases).toHaveLength(6);
  });
});
