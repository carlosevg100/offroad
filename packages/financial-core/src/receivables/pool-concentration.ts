import Decimal from "decimal.js";

import {decimal, full, receivablesPoolKernelsVersion, requireNonNegative, requireUnitInterval, sum, ZERO, type ReceivablesPoolKernelTrace} from "./pool-shared";

export type ReceivablesPoolConcentrationItem = {
  debtorId: string;
  /** Economic group of the debtor; a debtor outside any group is its own group. */
  debtorGroupId: string;
  balance: string;
};

export type ReceivablesPoolConcentrationCap = {
  version: typeof receivablesPoolKernelsVersion;
  /** The caps are shares of the preliminary eligible balance, never of the final adjusted base. */
  denominator: "preliminary_eligible_balance";
  order: readonly ["debtor", "economic_group"];
  preliminaryEligibleBalance: string;
  debtorCap: string;
  groupCap: string;
  adjustedEligibleBalance: string;
  excessRemoved: string;
  groups: Array<{
    groupId: string;
    balance: string;
    afterDebtorCaps: string;
    afterGroupCap: string;
    debtors: Array<{debtorId: string; balance: string; retained: string}>;
  }>;
  trace: ReceivablesPoolKernelTrace;
};

/**
 * Applies the declared single-debtor and economic-group caps to the preliminary eligible balance.
 * Both caps are shares of that preliminary balance (the denominator convention the result must
 * state). Each debtor is capped first, then each group's capped sum is capped again; an excess
 * removed at the debtor level is never removed a second time at the group level. This is not an
 * iterative solver for limits defined over the final base after exclusions.
 */
export function capReceivablesPoolConcentration(input: {
  items: readonly ReceivablesPoolConcentrationItem[];
  maxSingleDebtorShare: string;
  maxDebtorGroupShare: string;
}): ReceivablesPoolConcentrationCap {
  const maxDebtorShare = requireUnitInterval("maxSingleDebtorShare", input.maxSingleDebtorShare);
  const maxGroupShare = requireUnitInterval("maxDebtorGroupShare", input.maxDebtorGroupShare);
  const groupOfDebtor = new Map<string, string>();
  for (const item of input.items) {
    requireNonNegative(`balance of ${item.debtorId}`, item.balance);
    const known = groupOfDebtor.get(item.debtorId);
    if (known !== undefined && known !== item.debtorGroupId) throw new RangeError(`debtor ${item.debtorId} cannot belong to two economic groups`);
    groupOfDebtor.set(item.debtorId, item.debtorGroupId);
  }
  const preliminary = sum(input.items.map((item) => item.balance));
  const debtorCap = preliminary.times(maxDebtorShare);
  const groupCap = preliminary.times(maxGroupShare);
  const groups = new Map<string, Map<string, Decimal>>();
  for (const item of input.items) {
    const debtors = groups.get(item.debtorGroupId) ?? new Map<string, Decimal>();
    debtors.set(item.debtorId, (debtors.get(item.debtorId) ?? ZERO).plus(item.balance));
    groups.set(item.debtorGroupId, debtors);
  }
  let adjusted = ZERO;
  const groupResults: ReceivablesPoolConcentrationCap["groups"] = [];
  for (const [groupId, debtors] of groups) {
    let afterDebtorCaps = ZERO;
    const debtorResults: ReceivablesPoolConcentrationCap["groups"][number]["debtors"] = [];
    for (const [debtorId, balance] of debtors) {
      const retained = Decimal.min(balance, debtorCap);
      afterDebtorCaps = afterDebtorCaps.plus(retained);
      debtorResults.push({debtorId, balance: full(balance), retained: full(retained)});
    }
    const afterGroupCap = Decimal.min(afterDebtorCaps, groupCap);
    adjusted = adjusted.plus(afterGroupCap);
    groupResults.push({
      groupId,
      balance: full(sum(debtors.values())),
      afterDebtorCaps: full(afterDebtorCaps),
      afterGroupCap: full(afterGroupCap),
      debtors: debtorResults,
    });
  }
  return {
    version: receivablesPoolKernelsVersion,
    denominator: "preliminary_eligible_balance",
    order: ["debtor", "economic_group"],
    preliminaryEligibleBalance: full(preliminary),
    debtorCap: full(debtorCap),
    groupCap: full(groupCap),
    adjustedEligibleBalance: full(adjusted),
    excessRemoved: full(preliminary.minus(adjusted)),
    groups: groupResults,
    trace: {
      id: "receivables.pool_concentration_cap",
      formula: "debtorCap = preliminary * maxSingleDebtorShare; groupCap = preliminary * maxDebtorGroupShare; adjusted = sum over groups of min(sum over debtors of min(debtorBalance, debtorCap), groupCap)",
      operands: {
        preliminaryEligibleBalance: full(preliminary),
        maxSingleDebtorShare: full(decimal(maxDebtorShare)),
        maxDebtorGroupShare: full(decimal(maxGroupShare)),
        debtorCap: full(debtorCap),
        groupCap: full(groupCap),
        groups: String(groups.size),
      },
      result: full(adjusted),
    },
  };
}
