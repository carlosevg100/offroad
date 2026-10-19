import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {debtCapacityPacketOutputSchema, prepareDebtCapacityPacket} from "./debt-capacity-packet";
import {c04DisconnectedPacketInput, c04PacketInput} from "./debt-capacity.test-support";

// Expectations come from the independent oracle modelo_c04.py (resultados.json), R$ million.
const D = Decimal.clone({precision: 60});
const r = (v: string, p = 1) => new D(v).toDecimalPlaces(p).toNumber();

describe("C04 packet: how much debt fits and with what profile", {timeout: 300000}, () => {
  const packet = prepareDebtCapacityPacket(c04PacketInput().seal());
  const at = (id: string) => packet.cases.find((c) => c.caseId === id)!;
  it("finds the capacity by limit and the one that binds, for each schedule", () => {
    expect(at("informed").limits.map((l) => [l.id, r(l.capacity!)])).toEqual([["covenant", 54.8], ["market", 76.8], ["interest", 72]]);
    expect(at("phased").limits.map((l) => [l.id, r(l.capacity!)])).toEqual([["covenant", 79.5], ["market", 108.6], ["interest", 107.6]]);
    expect([at("informed").bindingLimitId, r(at("informed").capacity!), at("phased").bindingLimitId, r(at("phased").capacity!)]).toEqual(["covenant", 54.8, "covenant", 79.5]);
    // Where the covenant binds: December 2028 in the adverse case for the informed schedule.
    expect([at("informed").binding!.date, at("informed").binding!.scenarioId === packet.cases[0]!.review!.scenarios[1]!.scenarioId]).toEqual(["2028-12-31", true]);
  });
  it("reviews the R$ 60 mi project on peak leverage, minimum cash and coverage in both scenarios", () => {
    const view = (id: string) => at(id).review!.scenarios.map((s) => [r(s.peakLeverage.value, 2), s.peakLeverage.date.slice(0, 4), r(s.minimumCash.value), r(s.minimumInterestCoverage!.value, 2)]);
    expect(view("informed")).toEqual([[2.42, "2028", 13.8, 2.65], [3.12, "2028", -22.3, 2.26]]);
    expect(view("phased")).toEqual([[1.88, "2029", 13.5, 3.17], [2.58, "2029", -21.4, 2.7]]);
    expect([at("informed").review!.fits, at("informed").review!.failingLimitIds]).toEqual([false, ["covenant"]]);
    expect(packet.comparison).toMatchObject({requestedFitsIn: ["phased"], largestCapacityCaseId: "phased"});
  });
  it("checks the plan as it stands: scheduled principal against cash after interest", () => {
    const y2029 = at("informed").plan!.find((p) => p.date === "2029-12-31")!;
    expect([r(y2029.scheduledExistingPrincipal, 2), r(y2029.cashAfterInterest, 2), y2029.paysWithoutRefinancing]).toEqual([22.67, 23.56, true]);
    expect(at("informed").calibrationOnly).toBe(true);
  });
  it("never takes the smallest per-limit maximum as the joint capacity (independent review counterexample)", () => {
    const p = prepareDebtCapacityPacket(c04DisconnectedPacketInput()), c = p.cases[0]!;
    expect(c.limits.map((l) => [l.id, l.capacity === null ? null : r(l.capacity, 0)])).toEqual([["cash", 200], ["interest", 20]]);
    expect([c.capacity, c.capacityStatus, c.bindingLimitId]).toEqual([null, "no_feasible_amount", null]);
  });
  it("grants nothing", () => {expect(() => debtCapacityPacketOutputSchema.parse({...packet, grantsExecution: true})).toThrow();});
});
