import Decimal from "decimal.js";

import {decimal, full, receivablesPoolKernelsVersion, requireNonNegative, requireUnitInterval, safeRatio, ZERO, type ReceivablesPoolKernelTrace} from "./pool-shared";

export type ReceivablesPoolBorrowingBase = {
  version: typeof receivablesPoolKernelsVersion;
  adjustedEligibleBalance: string;
  totalOutstanding: string;
  /** Adjusted eligible balance over the total outstanding; zero when the portfolio is empty. */
  eligibleShare: string;
  requestedFacility: string;
  maximumByAdvanceRate: string;
  maximumByOvercollateralization: string;
  supportedFacility: string;
  bindingConstraint: "advance_rate" | "overcollateralization" | "both";
  requestCoveredBySupportedFacility: boolean;
  /** Adjusted eligible balance over the requested facility; zero when nothing is requested. */
  overcollateralizationAtRequest: string;
  requiredOvercollateralization: string;
  totalCapital: string;
  subordinateCapital: string;
  actualSubordinationRate: string;
  requiredSubordinationRate: string;
  reserveTarget: string;
  trace: ReceivablesPoolKernelTrace;
};

/**
 * Sizes the facility a concentration-adjusted eligible base supports: the lesser of the base times
 * the advance rate and the base divided by the minimum overcollateralization, compared with the
 * request (which never inflates the base). Actual subordination is mezzanine plus subordinated
 * capital over the whole capital stack; the reserve target is the senior amount times the reserve rate.
 */
export function calculateReceivablesPoolBorrowingBase(input: {
  adjustedEligibleBalance: string;
  totalOutstanding: string;
  requestedFacility: string;
  advanceRate: string;
  requiredOvercollateralization: string;
  requiredSubordinationRate: string;
  actualSeniorAmount: string;
  actualMezzanineAmount: string;
  actualSubordinatedAmount: string;
  reserveRate: string;
}): ReceivablesPoolBorrowingBase {
  const adjusted = requireNonNegative("adjustedEligibleBalance", input.adjustedEligibleBalance);
  const total = requireNonNegative("totalOutstanding", input.totalOutstanding);
  const requested = requireNonNegative("requestedFacility", input.requestedFacility);
  const advanceRate = requireUnitInterval("advanceRate", input.advanceRate);
  const requiredOc = decimal(input.requiredOvercollateralization);
  if (!requiredOc.isFinite() || requiredOc.lt(1)) throw new RangeError("requiredOvercollateralization must be at least one");
  const requiredSubordination = requireUnitInterval("requiredSubordinationRate", input.requiredSubordinationRate);
  const senior = requireNonNegative("actualSeniorAmount", input.actualSeniorAmount);
  const mezzanine = requireNonNegative("actualMezzanineAmount", input.actualMezzanineAmount);
  const subordinated = requireNonNegative("actualSubordinatedAmount", input.actualSubordinatedAmount);
  const reserveRate = requireUnitInterval("reserveRate", input.reserveRate);

  const maximumByAdvance = adjusted.times(advanceRate);
  const maximumByOc = adjusted.div(requiredOc);
  const supported = Decimal.min(maximumByAdvance, maximumByOc);
  const totalCapital = senior.plus(mezzanine).plus(subordinated);
  const subordinateCapital = mezzanine.plus(subordinated);
  const actualSubordination = safeRatio(subordinateCapital, totalCapital);
  const overcollateralization = requested.isZero() ? ZERO : adjusted.div(requested);
  const reserveTarget = senior.times(reserveRate);
  const eligibleShare = safeRatio(adjusted, total);
  const bindingConstraint = maximumByAdvance.eq(maximumByOc) ? "both" : maximumByAdvance.lt(maximumByOc) ? "advance_rate" : "overcollateralization";
  return {
    version: receivablesPoolKernelsVersion,
    adjustedEligibleBalance: full(adjusted),
    totalOutstanding: full(total),
    eligibleShare: full(eligibleShare),
    requestedFacility: full(requested),
    maximumByAdvanceRate: full(maximumByAdvance),
    maximumByOvercollateralization: full(maximumByOc),
    supportedFacility: full(supported),
    bindingConstraint,
    requestCoveredBySupportedFacility: supported.gte(requested),
    overcollateralizationAtRequest: full(overcollateralization),
    requiredOvercollateralization: full(requiredOc),
    totalCapital: full(totalCapital),
    subordinateCapital: full(subordinateCapital),
    actualSubordinationRate: full(actualSubordination),
    requiredSubordinationRate: full(requiredSubordination),
    reserveTarget: full(reserveTarget),
    trace: {
      id: "receivables.pool_borrowing_base",
      formula: "supported = min(adjusted * advanceRate, adjusted / requiredOvercollateralization); ocAtRequest = adjusted / requested; subordination = (mezzanine + subordinated) / (senior + mezzanine + subordinated); reserveTarget = senior * reserveRate",
      operands: {
        adjustedEligibleBalance: full(adjusted),
        advanceRate: full(advanceRate),
        requiredOvercollateralization: full(requiredOc),
        requestedFacility: full(requested),
        actualSeniorAmount: full(senior),
        actualMezzanineAmount: full(mezzanine),
        actualSubordinatedAmount: full(subordinated),
        reserveRate: full(reserveRate),
      },
      result: full(supported),
    },
  };
}
