import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {prepareRelativeDebtCostPacket, relativeDebtCostPacketOutputSchema} from "./relative-debt-cost-packet";
import {c03Id, c03PacketInput} from "./relative-debt-cost.test-support";

// Expectations come from the independent oracle modelo_c03.py (resultados.json).
const D = Decimal.clone({precision: 60});
const mi = (v: string | null, p = 3) => v === null ? null : new D(v).div(1000000).toDecimalPlaces(p).toNumber();

describe("C03 packet: why the company pays more than its peer", () => {
  const f = c03PacketInput(), packet = prepareRelativeDebtCostPacket(f.seal());
  it("decomposes 125 bps into 70 of date, structure and market and 55 of credit", () => {
    expect(packet.decomposition).toEqual({grossBps: "125", afterPricingDateBps: "65", structureAndMarketBps: "70", creditResidualBps: "55", shareNotAboutCompanyRisk: "0.56", residualReading: "under_adopted_adjustments"});
    expect(packet.status).toBe("prepared_for_human_review");
  });
  it("reads the committee lens: leverage is not a driver; scale, conversion and debt profile weigh against", () => {
    const by = (k: number) => packet.lens.rows.find((r) => r.id === c03Id(400 + k))!.classification;
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(by)).toEqual(["weighs_against", "weighs_against", "neutral", "weighs_little", "weighs_against", "weighs_against",
      "weighs_against", "weighs_against", "weighs_against", "neutral"]);
    expect(packet.lens.notDrivers).toContain(c03Id(402));
    expect(packet.lens.impliedNotches).toMatchObject({fewest: "1.83333333333333333333", most: "2.2", peerRating: "AA(bra)", readingOnly: true});
  });
  it("prices the levers: prepaying only for the rate does not pay; rating breaks even on spread", () => {
    const lever = (id: string) => packet.levers.find((l) => l.actionId === id)!;
    expect([mi(lever(f.ids.refinance190).savings, 2), mi(lever(f.ids.refinance190).knownCosts, 2), lever(f.ids.refinance190).paysForItself]).toEqual([0.3, 1.75, false]);
    expect([mi(lever(f.ids.refinance220).savings, 2), lever(f.ids.refinance220).paysForItself]).toEqual([0.17, false]);
    expect([mi(lever(f.ids.ratingLow).savings), mi(lever(f.ids.ratingLow).netOfKnownCosts)]).toEqual([0.135, -0.165]);
    expect([mi(lever(f.ids.ratingHigh).savings), mi(lever(f.ids.ratingHigh).netOfKnownCosts)]).toEqual([0.225, 0.025]);
  });
  it("assigns no rating and grants nothing", () => {
    expect(() => relativeDebtCostPacketOutputSchema.parse({...packet, grantsExecution: true})).toThrow();
    expect(packet.exclusions).toContain("official_rating");
  });
});
