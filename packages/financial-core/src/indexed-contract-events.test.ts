import {describe, expect, it} from "vitest";
import {buildIndexedContractEvents as run, type IndexedContractEventsInput} from "./indexed-contract-events";

const anchor = {sourceVersionId: "00000000-0000-4000-8000-000000000001", locator: "Synthetic rational oracle"};
const day1 = "2026-01-02", day2 = "2026-01-03";
function fixture(): IndexedContractEventsInput {
  return {schemaVersion: "indexed-contract-events-input.v1", currency: "BRL",
    opening: {date: "2026-01-01", moment: "after_events", principal: "100", accruedInterest: "0", accruedIndexation: "0",
      appliedIndexLevel: "1", point: {cycleId: "cycle", elapsedUnits: 0}, anchor},
    indexCycles: [{id: "cycle", start: "2026-01-01", end: day2, totalUnits: 2,
      variation: {kind: "monthly_rate", value: "0.21"}, floor: "none", anchor}],
    accruals: [day1, day2].map((date, i) => ({date, point: {cycleId: "cycle", elapsedUnits: i+1},
      interest: {kind: "effective_interval", value: "0.1", anchor}, anchor})),
    conventions: {accrualBoundaryConvention: "explicit_contractual_grid", indexation: "capitalized_principal", interestPrincipal: "at_interest_accrual", indexationPrincipal: "at_indexation",
      unpaidIndexationAccrual: "compound_with_index", indexationOrder: 0, interestOrder: 1, cashResidual: "carry",
      indexAccruedInterest: true, compoundAccruedInterest: true, amortizationInterest: "retain",
      amortizationIndexation: "settle_proportionally", factorRounding: {decimals: 16, mode: "half_up"},
      cashRounding: {decimals: 16, mode: "half_up"}, anchor}, events: [], reportDates: [day2]};
}
const coupon = (date: string, order = 2) => ({id: `coupon-${date}`, date, order, kind: "coupon" as const, anchor});
const settle = (date: string, order = 3) => ({id: `index-${date}`, date, order, kind: "index_settlement" as const, anchor});
const amortize = (basis: "indexed_principal" | "nominal_principal", amount = "44") =>
  ({id: "amortization", date: day1, order: 2, kind: "amortization" as const, amount, basis, anchor});
function cashFixture() {
  const input = fixture(); input.conventions.indexation = "cash_paid"; input.conventions.indexAccruedInterest = false;
  return input;
}

describe("indexed contract economic events independent of reporting cuts", () => {
  it("G1 accrues cumulative index once regardless of reports", () => {
    const input = fixture(); input.accruals.forEach(a => a.interest.value = "0");
    expect(run(input).finalState.principal).toBe("121");
    const withCut = run({...input, reportDates: [day1, day2]});
    expect(withCut.reports.map(r => r.principal)).toEqual(["110", "121"]);
    expect(withCut.finalState).toEqual(run(input).finalState);
    expect(withCut.payments).toEqual([]);
    expect(withCut.contractFingerprint).toBe(run(input).contractFingerprint);
  });
  it.each([[false, false, "23.1"], [false, true, "24.2"], [true, true, "25.41"]] as const)(
    "G2 resolves index-on-interest=%s and compounding=%s explicitly", (index, compound, expected) => {
      const input = fixture(); input.conventions.indexAccruedInterest = index; input.conventions.compoundAccruedInterest = compound;
      expect(run(input).finalState).toMatchObject({principal: "121", accruedInterest: expected});
    });
  it("G3 a real coupon changes cash and future accrual while a report cannot", () => {
    const input = fixture(); input.events = [coupon(day1), coupon(day2)];
    expect(run(input).payments.map(p => p.interest)).toEqual(["11", "12.1"]);
    expect(run(input).finalState.accruedInterest).toBe("0");
    input.events = []; input.reportDates = [day1, day2];
    expect(run(input).finalState.accruedInterest).toBe("25.41");
  });
  it.each([["retain", "0", "20.57"], ["settle_proportionally", "4.4", "15.246"]] as const)(
    "G4/G5 amortization uses its explicit accrued-interest allocation %s", (allocation, paid, interest) => {
      const input = fixture(); input.events = [amortize("indexed_principal")]; input.conventions.amortizationInterest = allocation;
      const result = run(input);
      expect(result.payments[0]).toMatchObject({principal: "44", interest: paid});
      expect(result.finalState).toMatchObject({principal: "72.6", accruedInterest: interest});
    });
  it("G6 unpaid index is separate from principal and cash until its settlement", () => {
    const input = cashFixture(); input.reportDates = [day1, day2]; input.events = [coupon(day2), settle(day2)];
    const result = run(input);
    expect(result.reports[0]).toMatchObject({principal: "100", accruedIndexation: "10", accruedInterest: "10"});
    expect(result.payments.map(p => [p.date, p.interest, p.indexation])).toEqual([[day2, "21", "0"], [day2, "0", "21"]]);
    expect(result.finalState).toMatchObject({principal: "100", accruedIndexation: "0", accruedInterest: "0"});
  });
  it("G7 only actual index settlements reset the unpaid claim", () => {
    const input = cashFixture(); input.events = [settle(day1), coupon(day2), settle(day2)];
    expect(run(input).payments.map(p => p.indexation)).toEqual(["10", "0", "10"]);
    expect(run(input).payments[1]!.interest).toBe("21");
  });
  it("G8 nominal amortization settles its proportional index without erasing accrued interest", () => {
    const input = cashFixture(); input.events = [amortize("nominal_principal", "40"), coupon(day2), settle(day2)];
    const result = run(input);
    expect(result.payments[0]).toMatchObject({principal: "40", indexation: "4", interest: "0"});
    expect(result.payments[1]!.interest).toBe("17"); expect(result.payments[2]!.indexation).toBe("12.6");
    expect(result.finalState.principal).toBe("60");
  });
  it("G9 deflation follows the declared floor instead of silently becoming zero", () => {
    const input = fixture(); input.indexCycles[0]!.variation = {kind: "monthly_rate", value: "-0.19"};
    expect(run(input).finalState).toMatchObject({principal: "81", accruedInterest: "17.01"});
    input.indexCycles[0]!.floor = "zero_variation";
    expect(run(input).finalState).toMatchObject({principal: "100", accruedInterest: "21"});
  });
  it("G10 resumes an opening outside the anniversary without reapplying the accumulated factor", () => {
    const input = fixture(); const complete = run(input);
    input.opening = {...input.opening, date: day1, principal: "110", accruedInterest: "11",
      appliedIndexLevel: "1.1", point: {cycleId: "cycle", elapsedUnits: 1}};
    input.accruals = [input.accruals[1]!];
    expect(run(input).finalState).toEqual(complete.finalState);
  });
  it("keeps contract state payments and trace invariant under every subset of report cuts", () => {
    for (const input of [fixture(), cashFixture()]) {
      input.events = [coupon(day2)]; const original = JSON.stringify(input); const baseline = run(input);
      for (const reportDates of [[], [day1], [day2], [day1,day2], [input.opening.date,day1,day2]]) {
        const result = run({...input, reportDates});
        expect(result.finalState).toEqual(baseline.finalState); expect(result.payments).toEqual(baseline.payments);
        expect(result.trace).toEqual(baseline.trace); expect(result.contractFingerprint).toBe(baseline.contractFingerprint);
      }
      expect(JSON.stringify(input)).toBe(original);
    }
  });
  it("matches NI and rate curves and computes an explicit annual effective interval", () => {
    const input = fixture(); const baseline = run(input);
    input.indexCycles[0]!.variation = {kind: "index_numbers", previous: "100", current: "121"};
    input.accruals.forEach(a => a.interest = {kind: "annual_effective", value: "0.21", elapsedUnits: 126, yearUnits: 252, anchor});
    expect(run(input).finalState).toEqual(baseline.finalState);
  });
  it("does not round or pay twice when observing a nonterminating fractional index", () => {
    const input = fixture(); input.indexCycles[0]!.variation = {kind: "monthly_rate", value: "0.01"};
    input.accruals.forEach(a => a.interest.value = "0");
    const baseline = run(input); const withCut = run({...input, reportDates: [day1,day2]});
    expect(withCut.finalState).toEqual(baseline.finalState);
    expect(withCut.finalState.principal).toBe("101");
  });
  it("rejects impossible amortization and wrong nominal/indexed payment basis", () => {
    const input = fixture(); input.events = [amortize("indexed_principal", "111")];
    expect(() => run(input)).toThrow("indexed_amortization_exceeds_principal");
    input.events = [amortize("nominal_principal")]; expect(() => run(input)).toThrow("indexed_amortization_basis_mismatch");
  });
  it("refuses incomplete calendar curve opening and event information", () => {
    const input = fixture();
    expect(() => run({...input, conventions: undefined})).toThrow();
    expect(() => run({...input, opening: {...input.opening, appliedIndexLevel: "1.1"}})).toThrow("indexed_opening_factor_mismatch");
    expect(() => run({...input, indexCycles: []})).toThrow();
    expect(() => run({...input, reportDates: ["2026-01-04"]})).toThrow("indexed_report_point_missing");
    expect(() => run({...input, events: [coupon("2026-01-04")]})).toThrow("indexed_event_invalid");
    expect(() => run({...input, events: [coupon(day1), {...coupon(day1), id: "different"}]})).toThrow("indexed_event_invalid");
  });
  it("honors declared order while physical event ordering is irrelevant", () => {
    const input = fixture(); input.events = [coupon(day1,3), amortize("indexed_principal")];
    const result = run(input); input.events.reverse(); expect(run(input)).toEqual(result);
    input.conventions.amortizationInterest = "settle_proportionally";
    expect(run(input).payments[0]!.interest).toBe("4.4");
  });

  it("does not infer reinvestment of an unpaid index claim from cash-paid treatment", () => {
    const input = cashFixture(); input.conventions.unpaidIndexationAccrual = "principal_only";
    expect(run(input).finalState.accruedIndexation).toBe("20");
    input.conventions.unpaidIndexationAccrual = "compound_with_index";
    expect(run(input).finalState.accruedIndexation).toBe("21");
  });
  it.each(["carry", "write_off"] as const)("records cash rounding differences under explicit %s policy", policy => {
    const input = fixture(); input.opening.principal = "1";
    input.indexCycles[0]!.variation = {kind: "monthly_rate", value: "0"};
    input.accruals.forEach(a => a.interest.value = "0.005");
    input.conventions.cashRounding.decimals = 2; input.conventions.cashResidual = policy;
    input.events = [coupon(day1)]; const result = run(input);
    expect(result.payments[0]!.interest).toBe("0.01");
    expect(result.payments[0]!.interestRoundingAdjustment).toBe(policy === "carry" ? "0" : "-0.005");
    expect(result.finalState.accruedInterest).toBe(policy === "carry" ? "-0.000025" : "0.005");
  });
  it("uses interval exposure when explicitly declared despite payment before accrual posting", () => {
    const input = fixture(); input.events = [{...amortize("indexed_principal", "20"), order: 0}];
    Object.assign(input.conventions, {indexationOrder: 1, interestOrder: 2, indexationPrincipal: "interval_opening",
      interestPrincipal: "interval_opening", indexAccruedInterest: false, compoundAccruedInterest: false});
    const opening = run(input);
    expect(opening.finalState).toMatchObject({principal: "99", accruedInterest: "19"});
    expect(opening.trace.find(t=>t.kind === "index_accrual")!.operands.indexPrincipal).toBe("100");
    input.conventions.indexationPrincipal = "at_indexation";
    expect(run(input).finalState.principal).toBe("96.8");
  });
  it("resumes the exact state after amortization and proportional settlement", () => {
    const input = cashFixture(); input.events = [amortize("nominal_principal", "40"), coupon(day2), settle(day2)];
    input.reportDates = [day1, day2]; const all = run(input), mid = all.reports[0]!;
    input.opening = {...input.opening, ...mid, point: {cycleId: "cycle", elapsedUnits: 1}};
    input.accruals = [input.accruals[1]!]; input.events = input.events.filter(e=>e.date === day2); input.reportDates = [day2];
    const resumed = run(input);
    expect(resumed.finalState).toEqual(all.finalState);
    expect(resumed.payments).toEqual(all.payments.filter(p=>p.date === day2));
  });
  it("a future rate cannot retroactively change a settled coupon", () => {
    const input = fixture(); input.events = [coupon(day1), coupon(day2)]; const before = run(input);
    input.accruals[1]!.interest.value = "0.5";
    const after = run(input); expect(after.payments[0]).toEqual(before.payments[0]);
    expect(after.payments[1]!.interest).not.toBe(before.payments[1]!.interest);
  });
  it("restarts the exact returned state even below eighty fractional decimal places", () => {
    const input = fixture(); input.opening.principal = "1e-80";
    input.indexCycles[0]!.variation = {kind: "monthly_rate", value: "0"};
    input.conventions.factorRounding.decimals = 24;
    input.accruals.forEach(a=>a.interest.value = "0.000000000000000000000001");
    input.reportDates = [day1,day2]; const complete = run(input), mid = complete.reports[0]!;
    expect(mid.accruedInterest).toBe("1e-104");
    input.opening = {...input.opening, ...mid, point: {cycleId: "cycle", elapsedUnits: 1}};
    input.accruals = [input.accruals[1]!]; input.reportDates = [day2];
    expect(run(input).finalState).toEqual(complete.finalState);
  });
  it("rejects a positive interest factor that becomes zero at the declared precision", () => {
    const input = fixture(); input.conventions.factorRounding.decimals = 2;
    input.accruals[0]!.interest.value = "-0.999";
    expect(() => run(input)).toThrow("indexed_interest_factor_nonpositive");
  });
});
