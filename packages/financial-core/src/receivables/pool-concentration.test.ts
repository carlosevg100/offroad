import {describe, expect, it} from "vitest";

import {capReceivablesPoolConcentration, type ReceivablesPoolConcentrationItem} from "./pool-concentration";

/** Independent review gold: 6m preliminary base, debtor cap 20% and group cap 25%, group A overlapping both caps. */
const overlapping: ReceivablesPoolConcentrationItem[] = [
  ...Array.from({length: 20}, () => ({debtorId: "a1", debtorGroupId: "a", balance: "100000.00"})),
  ...Array.from({length: 10}, () => ({debtorId: "a2", debtorGroupId: "a", balance: "100000.00"})),
  ...Array.from({length: 10}, () => ({debtorId: "b", debtorGroupId: "b", balance: "100000.00"})),
  ...Array.from({length: 10}, () => ({debtorId: "c", debtorGroupId: "c", balance: "100000.00"})),
  ...Array.from({length: 10}, () => ({debtorId: "d", debtorGroupId: "d", balance: "100000.00"})),
];

describe("receivables pool concentration cap kernel", () => {
  it("caps each debtor, then each group, on the preliminary base without subtracting an excess twice", () => {
    const result = capReceivablesPoolConcentration({items: overlapping, maxSingleDebtorShare: "0.20", maxDebtorGroupShare: "0.25"});
    expect(result).toMatchObject({
      denominator: "preliminary_eligible_balance",
      order: ["debtor", "economic_group"],
      preliminaryEligibleBalance: "6000000",
      debtorCap: "1200000",
      groupCap: "1500000",
      adjustedEligibleBalance: "4500000",
      excessRemoved: "1500000",
    });
    const groupA = result.groups.find((group) => group.groupId === "a")!;
    expect(groupA).toMatchObject({balance: "3000000", afterDebtorCaps: "2200000", afterGroupCap: "1500000"});
    expect(groupA.debtors).toEqual([
      {debtorId: "a1", balance: "2000000", retained: "1200000"},
      {debtorId: "a2", balance: "1000000", retained: "1000000"},
    ]);
    for (const groupId of ["b", "c", "d"]) {
      expect(result.groups.find((group) => group.groupId === groupId)).toMatchObject({balance: "1000000", afterDebtorCaps: "1000000", afterGroupCap: "1000000"});
    }
    expect(result.trace).toMatchObject({id: "receivables.pool_concentration_cap", result: "4500000", operands: {debtorCap: "1200000", groupCap: "1500000", groups: "4"}});
  });

  it("uses the preliminary balance as denominator even when the adjusted base is much smaller", () => {
    const result = capReceivablesPoolConcentration({
      items: [{debtorId: "x", debtorGroupId: "x", balance: "900"}, {debtorId: "y", debtorGroupId: "y", balance: "100"}],
      maxSingleDebtorShare: "0.10", maxDebtorGroupShare: "0.50",
    });
    // 10% of 1,000 (the preliminary base), not 10% of the base after x's excess is removed.
    expect(result).toMatchObject({debtorCap: "100", groupCap: "500", adjustedEligibleBalance: "200", excessRemoved: "800"});
  });

  it("is independent of item order and merges a debtor split across rows", () => {
    const shuffled = [...overlapping].reverse();
    const left = capReceivablesPoolConcentration({items: overlapping, maxSingleDebtorShare: "0.20", maxDebtorGroupShare: "0.25"});
    const right = capReceivablesPoolConcentration({items: shuffled, maxSingleDebtorShare: "0.20", maxDebtorGroupShare: "0.25"});
    expect(right.adjustedEligibleBalance).toBe(left.adjustedEligibleBalance);
    expect(right.groups.find((group) => group.groupId === "a")?.debtors.find((debtor) => debtor.debtorId === "a1")?.balance).toBe("2000000");
  });

  it("returns zeros for an empty base and leaves a diversified base untouched", () => {
    expect(capReceivablesPoolConcentration({items: [], maxSingleDebtorShare: "0.20", maxDebtorGroupShare: "0.25"})).toMatchObject({
      preliminaryEligibleBalance: "0", debtorCap: "0", groupCap: "0", adjustedEligibleBalance: "0", excessRemoved: "0", groups: [],
    });
    const diversified = Array.from({length: 10}, (_, index) => ({debtorId: `d${index}`, debtorGroupId: `g${index}`, balance: "100"}));
    expect(capReceivablesPoolConcentration({items: diversified, maxSingleDebtorShare: "0.10", maxDebtorGroupShare: "0.10"}).adjustedEligibleBalance).toBe("1000");
  });

  it("refuses a debtor in two groups, negative balances and shares outside the unit interval", () => {
    expect(() => capReceivablesPoolConcentration({
      items: [{debtorId: "a", debtorGroupId: "g1", balance: "1"}, {debtorId: "a", debtorGroupId: "g2", balance: "1"}],
      maxSingleDebtorShare: "0.2", maxDebtorGroupShare: "0.2",
    })).toThrow(RangeError);
    expect(() => capReceivablesPoolConcentration({items: [{debtorId: "a", debtorGroupId: "a", balance: "-1"}], maxSingleDebtorShare: "0.2", maxDebtorGroupShare: "0.2"})).toThrow(RangeError);
    expect(() => capReceivablesPoolConcentration({items: [], maxSingleDebtorShare: "1.5", maxDebtorGroupShare: "0.2"})).toThrow(RangeError);
  });
});
