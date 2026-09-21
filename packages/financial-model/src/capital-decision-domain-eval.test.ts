import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {describe, expect, it} from "vitest";
import {capitalDecisionReviewFixture} from "@offroad/testing-fixtures/capital-structure-decision";
import {prepareCapitalDecisionDelivery} from "./capital-decision-delivery";

const fixture = () => capitalDecisionReviewFixture();
const deliver = (f: ReturnType<typeof fixture>) => prepareCapitalDecisionDelivery({review: f.input,
  material: {requested: true, audience: "authorized_work_participants"}});
function rebind(f: ReturnType<typeof fixture>) {
  const canonical = JSON.stringify(f.snapshot);
  const envelope = {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")};
  for (const a of [...f.input.composition.alternatives, ...f.input.composition.sensitivities]) {
    a.projection.operating.envelope = envelope; a.projection.funding.input.envelope = envelope;
  }
}
/** Independent integer-cent oracle for this synthetic two-period case, without importing
 * the calculation engine or Decimal. This is a numerical oracle, not an independent reviewer.
 * Receivables/inventory/payables move working capital from40 to55 and back to40.
 * The signed +5 non-cash EBITDA adjustment adds back a non-cash expense.
 * Interest is capitalized; both periods are repaid at the second period end. */
function oracle(units: bigint, couponPercent: bigint) {
  const operatingBeforeWorkingCapital = units * 2000n - 9000n - 4000n + 500n - 800n - 1200n - 2000n;
  const firstOperating = operatingBeforeWorkingCapital - 1500n;
  const secondOperating = operatingBeforeWorkingCapital + 1500n;
  const firstDebt = 20000n * (100n + couponPercent) / 100n;
  const redemption = firstDebt * (100n + couponPercent) / 100n;
  const firstCash = 13000n + firstOperating + 10000n - 500n + 8000n;
  return {firstCash, finalCash: firstCash + secondOperating - redemption - 1000n,
    firstDebt, finalDebt: 0n, cost: redemption - 20000n + 500n};
}
const cents = (raw: string) => {const [whole, fraction = ""] = raw.split(".");
  if (fraction.length > 2) throw new Error("Oracle expects exact cents in this fixture");
  return BigInt(whole!) * 100n + (raw.startsWith("-") ? -1n : 1n) * BigInt(fraction.padEnd(2, "0"));};

describe("capital decision integrated domain evaluation", () => {
  it("checks all alternatives and adverse sensitivity with an independent integer cash oracle", () => {
    const r = deliver(fixture()); const projections = [...r.alternatives, ...r.sensitivities].map(a => a.projection);
    const expected = [oracle(10n, 10n), oracle(10n, 5n), oracle(9n, 10n)];
    projections.forEach((p, i) => {
      const e = expected[i]!;
      expect(cents(p.rows![0]!.closingAvailable)).toBe(e.firstCash);
      expect(cents(p.rows![0]!.closingDebt)).toBe(e.firstDebt);
      expect(cents(p.summary!.closingAvailable)).toBe(e.finalCash);
      expect(cents(p.summary!.closingDebt)).toBe(e.finalDebt);
      expect(cents(p.summary!.nominalFinancingCostInHorizon)).toBe(e.cost);
      expect(p.rows!.map(row => row.closingRestricted)).toEqual(["500", "500"]);
    });
  });
  it("retains a negative available cash outcome without using restricted cash to cover it", () => {
    const f = fixture(); f.snapshot.entries.find(e => e.fieldPath === "operating_projection.revenue.quantities" && e.dimensions.scenario === "house")!.value.value = ["1", "1"];
    rebind(f); const p = deliver(f).alternatives[0]!.projection;
    expect(cents(p.summary!.closingAvailable)).toBe(oracle(1n, 10n).finalCash);
    expect(cents(p.summary!.closingAvailable)).toBeLessThan(0n);
    expect(p.summary!.closingRestricted).toBe("500");
    expect(cents(p.summary!.maximumAvailableShortfallAtMeasuredDates)).toBe(-oracle(1n, 10n).finalCash);
  });
  it("refuses tampered envelope bytes and cross-perimeter financial comparisons", () => {
    const tampered = fixture(); tampered.input.composition.alternatives[0]!.projection.operating.envelope.canonical += " ";
    expect(() => deliver(tampered)).toThrow();
    const perimeter = fixture(); perimeter.input.composition.alternatives[1]!.projection.operating.perimeter = "consolidated";
    expect(() => deliver(perimeter)).toThrow();
  });
  it("keeps absent projections and absent adopted sources explicit in the full packet", () => {
    const framed = fixture(); framed.input.composition.alternatives = []; framed.input.composition.sensitivities = []; framed.input.alternativeConditions = [];
    const r = deliver(framed); expect(r.status).toBe("framed"); expect(r.alternatives).toEqual([]);
    const missing = fixture(); const selection = missing.input.composition.alternatives[0]!.projection.operating.revenue.quantities;
    selection.decisionId = null; selection.missingReason = "Synthetic source absent";
    const packet = deliver(missing); expect(packet.alternatives[0]!.projection.summary).toBeNull();
    expect(packet.informationGaps.some(g => g.reason.endsWith(": Synthetic source absent"))).toBe(true);
  });
  it("reproduces the complete packet across runs without changing adopted inputs", () => {
    const f = fixture(); const original = JSON.stringify(f); const first = deliver(f);
    for (let i = 0; i < 3; i++) expect(deliver(f)).toEqual(first);
    expect(JSON.stringify(f)).toBe(original); expect(first.humanDecision).toBeNull();
    expect(first.grantsPublication).toBe(false);
  });
  it("records domain time to a useful packet separately from user-visible response latency", () => {
    const f = fixture(); const start = performance.now(); const packet = deliver(f); const elapsedMs = performance.now() - start;
    expect(packet.alternatives[0]!.projection.rows).not.toBeNull();
    expect(Number.isFinite(elapsedMs) && elapsedMs >= 0).toBe(true);
    // Synthetic benchmark only: excludes queue, provider, persistence and browser delivery.
    // Stage17 must measure request-to-visible delivery; this is not a user SLO.
    process.stdout.write(JSON.stringify({event: "capital.domain_useful_packet", schemaVersion: 1,
      synthetic: true, elapsedMs, boundary: "domain_call_to_validated_packet",
      includesQueue: false, includesPersistence: false, includesBrowserDelivery: false,
      providerCalls: 0, result: "prepared"}) + "\n");
  });
});
