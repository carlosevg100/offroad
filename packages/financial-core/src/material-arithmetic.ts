import Decimal from "decimal.js";

import type {CalculationTrace} from "./credit-math";

/**
 * The arithmetic of the governed credit materials (stage 19, increments 6, 6B and 6C).
 *
 * `@offroad/case-materials` assembles the documents a company takes to market; every number it
 * prints that is not a value it received (a sum, a difference, a share, a tolerance test, a unit or
 * precision conversion) is computed here, in Decimal, with a trace naming the formula and the
 * operands. The operation verdict of `@offroad/credit-analysis`, which the credit memo carries,
 * computes and prints through the same kernels, and so do the price sentences of
 * `@offroad/market-reference`. Two kinds of kernel live in this file:
 *
 * - computations, which create a financial figure (the new instrument's amount, the concentration
 *   of the leading customers, the EBITDA adjustments, the tie-out of the debt schedule, the
 *   difference between two spreads, and for the verdict the net new money, the enlarged ticket,
 *   the leverage after a structure, the covenant ceiling test and the heaviest schedule year); and
 * - presentation conversions, which print a figure in another unit or at a stated precision
 *   (percent, millions, basis points as percent, a signed spread, half-up rounding) and, at the
 *   very edge, hand an exact decimal to the binary number that `Intl.NumberFormat` and a chart
 *   point require.
 *
 * Figures are full-precision decimal strings (`Decimal#toFixed()` without rounding) unless the
 * kernel is a rounding one. A value that is not a finite decimal number is refused, never read as
 * zero.
 */
export const materialArithmeticVersion = "2026.09.26-v3";

// The same arithmetic contract the package root declares, so a kernel imported on its own computes
// exactly what it computes inside a published material.
Decimal.set({precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 30});

export type MaterialFigure = {readonly value: string; readonly trace: CalculationTrace};

const decimalText = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function parse(value: Decimal.Value): Decimal | null {
  if (typeof value === "string" && !decimalText.test(value)) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const parsed = new Decimal(value);
  return parsed.isFinite() ? parsed : null;
}

function finite(label: string, value: Decimal.Value): Decimal {
  const parsed = parse(value);
  if (!parsed) throw new RangeError(`${label} must be a finite decimal number`);
  return parsed;
}

const full = (value: Decimal) => value.toFixed();

// Computations ---------------------------------------------------------------------------------

/**
 * The amount of the new instrument in a liability-management structure: the balance of the
 * covenanted lines it takes out plus the net new money for the company's plan. Sources equal uses by
 * construction, which is why the sources-and-uses table states it once.
 */
export function calculateNewInstrumentAmount(input: {covenantedBalance: Decimal.Value; netNewMoney: Decimal.Value}): MaterialFigure {
  const takeout = finite("covenanted balance", input.covenantedBalance);
  const newMoney = finite("net new money", input.netNewMoney);
  const amount = takeout.plus(newMoney);
  return {
    value: full(amount),
    trace: {
      id: "material.new_instrument_amount",
      formula: "new instrument = covenanted balance taken out + net new money",
      operands: {covenantedBalance: full(takeout), netNewMoney: full(newMoney)},
      result: full(amount),
    },
  };
}

export type CustomerConcentration = {
  /** Sum of the first `leading` shares in the order the source ranks them. */
  readonly leadingTotal: string;
  /** The largest share; among equal shares, the first one listed. Null for an empty list. */
  readonly largest: {readonly id: string; readonly share: string} | null;
  /** Every id, largest share first; equal shares keep the order the source lists them in. */
  readonly ranking: readonly string[];
  readonly trace: CalculationTrace;
};

/**
 * Customer concentration as a diligence answer states it: the share of the leading customers,
 * summed in the ranking the source declares (customer 1 is the source's largest), and the largest
 * single share, compared exactly. The ranking by share is stable, so a tie never reorders the
 * customers the source listed first.
 */
export function calculateCustomerConcentration(input: {shares: ReadonlyArray<{id: string; share: Decimal.Value}>; leading: number}): CustomerConcentration {
  if (!Number.isInteger(input.leading) || input.leading < 1) throw new RangeError("leading count must be a positive integer");
  const shares = input.shares.map((entry) => ({id: entry.id, share: finite(`share of ${entry.id}`, entry.share)}));
  const leadingTotal = shares.slice(0, input.leading).reduce((sum, entry) => sum.plus(entry.share), new Decimal(0));
  const ranked = shares.map((entry, index) => ({...entry, index}))
    .sort((a, b) => b.share.comparedTo(a.share) || a.index - b.index);
  const largest = ranked[0] ? {id: ranked[0].id, share: full(ranked[0].share)} : null;
  return {
    leadingTotal: full(leadingTotal),
    largest,
    ranking: ranked.map((entry) => entry.id),
    trace: {
      id: "material.customer_concentration",
      formula: "leading total = sum of the first N shares in the declared ranking; largest = maximum share, the first listed among equals",
      operands: {leading: String(input.leading), ...Object.fromEntries(shares.map((entry) => [entry.id, full(entry.share)]))},
      result: `leadingTotal=${full(leadingTotal)}; largest=${largest ? `${largest.id}:${largest.share}` : "none"}`,
    },
  };
}

/** Adjustments between reported and adjusted EBITDA: the signed difference and its magnitude. */
export function calculateEbitdaAdjustments(input: {adjustedEbitda: Decimal.Value; reportedEbitda: Decimal.Value}): MaterialFigure & {readonly magnitude: string} {
  const adjusted = finite("adjusted EBITDA", input.adjustedEbitda);
  const reported = finite("reported EBITDA", input.reportedEbitda);
  const difference = adjusted.minus(reported);
  return {
    value: full(difference),
    magnitude: full(difference.abs()),
    trace: {
      id: "material.ebitda_adjustments",
      formula: "adjustments = adjusted EBITDA - reported EBITDA; magnitude = |adjustments|",
      operands: {adjustedEbitda: full(adjusted), reportedEbitda: full(reported)},
      result: full(difference),
    },
  };
}

export type ScheduleTieOut = {
  readonly outcome: "within_tolerance" | "outside_tolerance";
  /** |balance - schedule|. */
  readonly magnitude: string;
  /** tolerance x total debt on the balance sheet. */
  readonly limit: string;
  /** Which side carries the difference: debt on the balance sheet that the schedule misses, or the reverse. */
  readonly side: "balance_above_schedule" | "schedule_above_balance";
  readonly trace: CalculationTrace;
};

/**
 * Whether the debt schedule ties to the balance sheet: the gap (balance minus schedule) is within
 * the tolerance when its magnitude does not exceed the tolerance times the debt on the balance
 * sheet. A gap exactly at the limit is within it.
 */
export function testScheduleTieOut(input: {scheduleGap: Decimal.Value; totalOnBalance: Decimal.Value; tolerance: Decimal.Value}): ScheduleTieOut {
  const gap = finite("schedule gap", input.scheduleGap);
  const balance = finite("debt on the balance sheet", input.totalOnBalance);
  const tolerance = finite("tolerance", input.tolerance);
  if (tolerance.isNegative()) throw new RangeError("tolerance must not be negative");
  const limit = balance.times(tolerance);
  const within = gap.abs().lte(limit);
  return {
    outcome: within ? "within_tolerance" : "outside_tolerance",
    magnitude: full(gap.abs()),
    limit: full(limit),
    side: gap.gt(0) ? "balance_above_schedule" : "schedule_above_balance",
    trace: {
      id: "material.schedule_tie_out",
      formula: "within when |balance - schedule| <= tolerance x debt on the balance sheet",
      operands: {scheduleGap: full(gap), totalOnBalance: full(balance), tolerance: full(tolerance)},
      result: within ? "within_tolerance" : "outside_tolerance",
    },
  };
}

/**
 * The part of a ticket that is new money: the ticket less the existing debt it redeems at
 * disbursement. Negative when the refinancing stated exceeds the ticket, so the verdict can see it.
 */
export function calculateNetNewMoney(input: {ticket: Decimal.Value; refinancing: Decimal.Value}): MaterialFigure {
  const ticket = finite("ticket", input.ticket);
  const refinancing = finite("refinancing", input.refinancing);
  const netNewMoney = ticket.minus(refinancing);
  return {
    value: full(netNewMoney),
    trace: {
      id: "material.net_new_money",
      formula: "net new money = ticket - existing debt redeemed at disbursement",
      operands: {ticket: full(ticket), refinancing: full(refinancing)},
      result: full(netNewMoney),
    },
  };
}

/**
 * The ticket the verdict offers as the second road: large enough to clear one more year of the
 * schedule, so the ticket and the debt it redeems both grow by that year's principal.
 */
export function calculateEnlargedTicket(input: {ticket: Decimal.Value; refinancing: Decimal.Value; principalDue: Decimal.Value}): {
  readonly ticket: string;
  readonly refinancing: string;
  readonly trace: CalculationTrace;
} {
  const ticket = finite("ticket", input.ticket);
  const refinancing = finite("refinancing", input.refinancing);
  const principalDue = finite("principal due", input.principalDue);
  const enlarged = ticket.plus(principalDue);
  const redeemed = refinancing.plus(principalDue);
  return {
    ticket: full(enlarged),
    refinancing: full(redeemed),
    trace: {
      id: "material.enlarged_ticket",
      formula: "enlarged ticket = ticket + principal due; enlarged refinancing = refinancing + principal due",
      operands: {ticket: full(ticket), refinancing: full(refinancing), principalDue: full(principalDue)},
      result: `ticket=${full(enlarged)}; refinancing=${full(redeemed)}`,
    },
  };
}

/**
 * Net leverage once a structure lands: the net debt today plus the part of the ticket that does not
 * redeem existing debt, over EBITDA, rounded half-up to `decimals` places when a precision is stated.
 * Over a zero EBITDA the ratio is not a number and the value is null: never an infinite leverage
 * handed on as if it were one.
 */
export function calculateLeverageAfterStructure(input: {netDebt: Decimal.Value; ticket: Decimal.Value; redeemed: Decimal.Value; ebitda: Decimal.Value; decimals?: number}): {
  readonly value: string | null;
  readonly trace: CalculationTrace;
} {
  if (input.decimals !== undefined && (!Number.isInteger(input.decimals) || input.decimals < 0 || input.decimals > 20)) {
    throw new RangeError("decimals must be an integer between 0 and 20");
  }
  const netDebt = finite("net debt", input.netDebt);
  const ticket = finite("ticket", input.ticket);
  const redeemed = finite("redeemed debt", input.redeemed);
  const ebitda = finite("EBITDA", input.ebitda);
  const operands = {netDebt: full(netDebt), ticket: full(ticket), redeemed: full(redeemed), ebitda: full(ebitda)};
  const formula = `leverage = (net debt + ticket - redeemed) / EBITDA${input.decimals === undefined ? "" : `, half-up to ${input.decimals} decimals`}`;
  if (ebitda.isZero()) return {value: null, trace: {id: "material.leverage_after_structure", formula, operands, result: "not computable: zero EBITDA"}};
  const leverage = netDebt.plus(ticket.minus(redeemed)).div(ebitda);
  const value = input.decimals === undefined ? full(leverage) : leverage.toFixed(input.decimals, Decimal.ROUND_HALF_UP);
  return {value, trace: {id: "material.leverage_after_structure", formula, operands, result: value}};
}

/**
 * The first test of the verdict: whether leverage today sits above the tightest covenant's ceiling,
 * and by how much. A leverage that is not a finite number (the ratio over a zero EBITDA) is not
 * computable and is never compared with a ceiling.
 */
export function testCovenantCeiling(input: {leverage: Decimal.Value; ceiling: Decimal.Value}): {
  readonly outcome: "above_ceiling" | "within_ceiling" | "not_computable";
  /** Leverage minus the ceiling, when above it. */
  readonly excess: string | null;
  readonly trace: CalculationTrace;
} {
  const ceiling = finite("covenant ceiling", input.ceiling);
  const leverage = parse(input.leverage);
  const trace = (result: string) => ({
    id: "material.covenant_ceiling",
    formula: "above when leverage > ceiling; excess = leverage - ceiling",
    operands: {leverage: leverage ? full(leverage) : String(input.leverage), ceiling: full(ceiling)},
    result,
  });
  if (!leverage) return {outcome: "not_computable", excess: null, trace: trace("not computable: leverage is not a finite number")};
  if (!leverage.gt(ceiling)) return {outcome: "within_ceiling", excess: null, trace: trace("within_ceiling")};
  const excess = full(leverage.minus(ceiling));
  return {outcome: "above_ceiling", excess, trace: trace(`above_ceiling; excess=${excess}`)};
}

/**
 * The heaviest year of an amortisation schedule: the largest strain (principal due over the year's
 * EBITDA) above the threshold, the first listed among equals. Strains compare exactly, never as
 * binary numbers. A strain that is not a finite number (the principal over a zero projected EBITDA)
 * cannot be ranked and is left out, named in the trace.
 */
export function selectHeaviestScheduleYear(input: {years: ReadonlyArray<{id: string; strain: Decimal.Value}>; threshold: Decimal.Value}): {
  readonly id: string | null;
  readonly strain: string | null;
  readonly trace: CalculationTrace;
} {
  const threshold = finite("strain threshold", input.threshold);
  const unranked = input.years.filter((year) => !parse(year.strain)).map((year) => year.id);
  let heaviest: {id: string; strain: Decimal} | null = null;
  for (const year of input.years) {
    const strain = parse(year.strain);
    if (!strain || !strain.gt(threshold)) continue;
    if (!heaviest || strain.gt(heaviest.strain)) heaviest = {id: year.id, strain};
  }
  return {
    id: heaviest?.id ?? null,
    strain: heaviest ? full(heaviest.strain) : null,
    trace: {
      id: "material.heaviest_schedule_year",
      formula: "heaviest = largest strain above the threshold, the first listed among equals; a strain that is not a finite number is not ranked",
      operands: {threshold: full(threshold), ...Object.fromEntries(input.years.map((year) => [year.id, parse(year.strain) ? full(parse(year.strain)!) : String(year.strain)]))},
      result: `${heaviest ? `${heaviest.id}:${full(heaviest.strain)}` : "none"}${unranked.length ? `; not ranked: ${unranked.join(", ")}` : ""}`,
    },
  };
}

/**
 * Compares two figures exactly, for the thresholds a document's decisions test (a coverage under
 * 1.3x, a refinancing below the wall). A comparison creates no figure, so it carries no trace; it
 * exists so that a decision never compares binary numbers. Refuses a value that is not a finite
 * decimal number.
 */
export function compareFigures(left: Decimal.Value, right: Decimal.Value): -1 | 0 | 1 {
  return finite("left figure", left).comparedTo(finite("right figure", right)) as -1 | 0 | 1;
}

/**
 * How far one spread sits from another, both in basis points, as the verdict compares an
 * alternative's price with the requested structure's: the signed difference, in basis points.
 * Fractional basis points subtract exactly (372.3 - 370.1 is 2.2).
 */
export function calculateSpreadDifference(input: {spreadBps: Decimal.Value; referenceBps: Decimal.Value}): MaterialFigure {
  const spread = finite("spread in basis points", input.spreadBps);
  const reference = finite("reference spread in basis points", input.referenceBps);
  const difference = spread.minus(reference);
  return {
    value: full(difference),
    trace: {
      id: "material.spread_difference",
      formula: "difference = spread - reference spread, in basis points",
      operands: {spreadBps: full(spread), referenceBps: full(reference)},
      result: full(difference),
    },
  };
}

// Presentation conversions ---------------------------------------------------------------------

export type PresentationScale = "unit" | "percent" | "millions" | "basis_points_as_percent";

const scales: Record<PresentationScale, {apply: (value: Decimal) => Decimal; formula: string}> = {
  unit: {apply: (value) => value, formula: "value"},
  percent: {apply: (value) => value.times(100), formula: "value x 100"},
  millions: {apply: (value) => value.div(1_000_000), formula: "value / 1,000,000"},
  basis_points_as_percent: {apply: (value) => value.div(100), formula: "basis points / 100"},
};

/**
 * A figure in the unit and at the precision a document prints it: scaled exactly, then rounded half
 * away from zero to `decimals` places when a precision is stated. Rounding is on the decimal value,
 * so a figure that sits exactly on a tie (1.005 to two places) rounds up, as the reader expects.
 */
export function presentationFigure(input: {value: Decimal.Value; scale?: PresentationScale; decimals?: number}): MaterialFigure {
  const scale = input.scale ?? "unit";
  if (input.decimals !== undefined && (!Number.isInteger(input.decimals) || input.decimals < 0 || input.decimals > 20)) {
    throw new RangeError("decimals must be an integer between 0 and 20");
  }
  const value = finite("presentation value", input.value);
  const scaled = scales[scale].apply(value);
  const printed = input.decimals === undefined ? full(scaled) : scaled.toFixed(input.decimals, Decimal.ROUND_HALF_UP);
  return {
    value: printed,
    trace: {
      id: "material.presentation_figure",
      formula: input.decimals === undefined ? scales[scale].formula : `${scales[scale].formula}, half-up to ${input.decimals} decimals`,
      operands: {value: full(value), scale},
      result: printed,
    },
  };
}

/**
 * A spread in basis points as the signed percentage a price sentence states ("CDI + 2.5%",
 * "CDI - 1%"): the sign apart from the magnitude, which is exact, or rounded half-up to `decimals`
 * places when a precision is stated. Zero carries the plus sign, as a sentence writes "CDI + 0%".
 */
export function presentationSpread(input: {bps: Decimal.Value; decimals?: number}): {readonly sign: "+" | "-"; readonly magnitude: string; readonly trace: CalculationTrace} {
  const bps = finite("spread in basis points", input.bps);
  const magnitude = presentationFigure({value: bps.abs(), scale: "basis_points_as_percent", ...(input.decimals === undefined ? {} : {decimals: input.decimals})}).value;
  const sign = bps.isNegative() && !bps.isZero() ? "-" : "+";
  return {
    sign,
    magnitude,
    trace: {
      id: "material.presentation_spread",
      formula: `sign of the spread; |basis points| / 100${input.decimals === undefined ? "" : `, half-up to ${input.decimals} decimals`}`,
      operands: {bps: full(bps)},
      result: `${sign}${magnitude}`,
    },
  };
}

/**
 * The exact decimal handed to the binary number `Intl.NumberFormat` prints and a native chart point
 * stores. This is the only floating-point step of a material, at the display boundary, and it reads
 * the decimal exactly as `Number` reads decimal text.
 */
export function presentationNumber(value: Decimal.Value): {readonly value: number; readonly trace: CalculationTrace} {
  const parsed = finite("presentation number", value);
  const number = parsed.toNumber();
  return {value: number, trace: {id: "material.presentation_number", formula: "nearest binary64 number to the decimal", operands: {value: full(parsed)}, result: String(number)}};
}

/** The same conversion for a value that may be text: null when it is not a finite decimal number, so the caller prints it as written. */
export function tryPresentationNumber(value: Decimal.Value): {readonly value: number; readonly trace: CalculationTrace} | null {
  return parse(value) ? presentationNumber(value) : null;
}
