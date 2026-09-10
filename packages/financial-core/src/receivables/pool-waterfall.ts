import Decimal from "decimal.js";

import {full, receivablesPoolKernelsVersion, requireNonNegative, ZERO, type ReceivablesPoolKernelTrace} from "./pool-shared";

/** The fixed priority order of the indicative waterfall. The input carries amounts, never a free list of priorities. */
export const receivablesPoolWaterfallOrder = [
  "servicing_fee", "senior_interest", "reserve_top_up", "senior_principal", "mezzanine", "subordinated_residual",
] as const;
export type ReceivablesPoolWaterfallItem = typeof receivablesPoolWaterfallOrder[number];

export type ReceivablesPoolWaterfallAllocation = {
  priority: number;
  item: ReceivablesPoolWaterfallItem;
  due: string;
  paid: string;
  shortfall: string;
};

export type ReceivablesPoolWaterfall = {
  version: typeof receivablesPoolKernelsVersion;
  order: typeof receivablesPoolWaterfallOrder;
  availableCash: string;
  reserveTarget: string;
  reserveTopUpDue: string;
  allocations: ReceivablesPoolWaterfallAllocation[];
  /** Cash left after the five obligations: it goes to the subordinated tranche as residual. */
  subordinatedResidual: string;
  /** Cash left after the residual is allocated: always zero, the waterfall never creates or strands cash. */
  unallocatedCash: string;
  totalPaid: string;
  seniorShortfall: string;
  trace: ReceivablesPoolKernelTrace;
};

/**
 * Allocates available cash in the fixed order servicing fee, senior interest, reserve top-up,
 * senior principal, mezzanine and subordinated residual. Every level receives the lesser of the
 * remaining cash and its obligation, so cash never goes negative and the paid amounts sum to the
 * cash available. The reserve top-up is the target less the opening balance, floored at zero.
 */
export function allocateReceivablesPoolWaterfall(input: {
  availableCash: string;
  servicingFeeDue: string;
  seniorInterestDue: string;
  seniorPrincipalDue: string;
  mezzanineDue: string;
  reserveOpening: string;
  reserveTarget: string;
}): ReceivablesPoolWaterfall {
  let cash = requireNonNegative("availableCash", input.availableCash);
  const availableCash = cash;
  const reserveTarget = requireNonNegative("reserveTarget", input.reserveTarget);
  const reserveOpening = requireNonNegative("reserveOpening", input.reserveOpening);
  const reserveTopUp = Decimal.max(reserveTarget.minus(reserveOpening), ZERO);
  const dueItems: Array<{item: ReceivablesPoolWaterfallItem; due: Decimal}> = [
    {item: "servicing_fee", due: requireNonNegative("servicingFeeDue", input.servicingFeeDue)},
    {item: "senior_interest", due: requireNonNegative("seniorInterestDue", input.seniorInterestDue)},
    {item: "reserve_top_up", due: reserveTopUp},
    {item: "senior_principal", due: requireNonNegative("seniorPrincipalDue", input.seniorPrincipalDue)},
    {item: "mezzanine", due: requireNonNegative("mezzanineDue", input.mezzanineDue)},
  ];
  let totalPaid = ZERO;
  let seniorShortfall = ZERO;
  const allocations: ReceivablesPoolWaterfallAllocation[] = dueItems.map(({item, due}, index) => {
    const paid = Decimal.min(cash, due);
    cash = cash.minus(paid);
    totalPaid = totalPaid.plus(paid);
    const shortfall = due.minus(paid);
    if (item === "senior_interest" || item === "senior_principal") seniorShortfall = seniorShortfall.plus(shortfall);
    return {priority: index + 1, item, due: full(due), paid: full(paid), shortfall: full(shortfall)};
  });
  const residual = cash;
  totalPaid = totalPaid.plus(residual);
  allocations.push({priority: 6, item: "subordinated_residual", due: full(residual), paid: full(residual), shortfall: full(ZERO)});
  return {
    version: receivablesPoolKernelsVersion,
    order: receivablesPoolWaterfallOrder,
    availableCash: full(availableCash),
    reserveTarget: full(reserveTarget),
    reserveTopUpDue: full(reserveTopUp),
    allocations,
    subordinatedResidual: full(residual),
    unallocatedCash: full(ZERO),
    totalPaid: full(totalPaid),
    seniorShortfall: full(seniorShortfall),
    trace: {
      id: "receivables.pool_waterfall",
      formula: "for each level in fixed order: paid = min(remainingCash, due); remainingCash -= paid; reserveTopUp = max(reserveTarget - reserveOpening, 0); residual = remainingCash after mezzanine",
      operands: {
        availableCash: full(availableCash),
        servicingFeeDue: allocations[0]!.due,
        seniorInterestDue: allocations[1]!.due,
        reserveTarget: full(reserveTarget),
        reserveOpening: full(reserveOpening),
        reserveTopUpDue: full(reserveTopUp),
        seniorPrincipalDue: allocations[3]!.due,
        mezzanineDue: allocations[4]!.due,
      },
      result: full(totalPaid),
    },
  };
}
