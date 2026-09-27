import Decimal from "decimal.js";

import type {CalculationTrace} from "./credit-math";
import {finiteFigure as finite, fullFigure as full} from "./figure-input";

/**
 * The arithmetic of the deal structure (stage 19, third polish, part 2B).
 *
 * `@offroad/deal-structure` sizes an operation against the walls a desk sizes it against, designs the
 * security package from the inventory, states the indicative term sheet and compiles the operation,
 * the structure and its alternatives. The figures of that work are computed here, in Decimal at 40
 * significant digits with half-up rounding, with a trace naming the formula and the operands; the
 * package keeps the policy it applies as data (the shares of the venture wall, the haircuts and ranks
 * of each class of collateral), the calendar, the gates and the sentences.
 *
 * Figures are full-precision decimal strings unless the kernel states the precision the structure
 * publishes. A value received that is not a finite decimal number is refused, never read as zero.
 */
export const dealArithmeticVersion = "2026.09.27-v1";

// The same arithmetic contract the package root declares, so a kernel imported on its own computes
// exactly what it computes inside the structure.
Decimal.set({precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 30});

const ZERO = new Decimal(0);
/** An amount at cents, half-up, as the structure publishes it. */
const cents = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

// Capacity ----------------------------------------------------------------------------------------

/**
 * The venture-debt wall: the lower of a share of the annual recurring revenue and a share of the last
 * equity round, each counted only when it is positive, half-up to cents; null when neither is. On a
 * tie the recurring revenue binds, as it is stated first.
 */
export function calculateVentureDebtCapacity(input: {arr: Decimal.Value | null; lastEquityRound: Decimal.Value | null; arrShare: Decimal.Value; roundShare: Decimal.Value}): {
  readonly value: string | null;
  readonly binding: "arr" | "last_equity_round" | null;
  readonly trace: CalculationTrace;
} {
  const arrShare = finite("share of ARR", input.arrShare);
  const roundShare = finite("share of the last round", input.roundShare);
  const candidates: Array<{binding: "arr" | "last_equity_round"; value: Decimal}> = [];
  const arr = input.arr === null ? null : finite("ARR", input.arr);
  const round = input.lastEquityRound === null ? null : finite("last equity round", input.lastEquityRound);
  if (arr && arr.gt(0)) candidates.push({binding: "arr", value: arr.times(arrShare)});
  if (round && round.gt(0)) candidates.push({binding: "last_equity_round", value: round.times(roundShare)});
  const lowest = candidates.reduce<(typeof candidates)[number] | null>((min, entry) => (min === null || entry.value.lt(min.value) ? entry : min), null);
  const value = lowest ? full(cents(lowest.value)) : null;
  return {
    value,
    binding: lowest?.binding ?? null,
    trace: {
      id: "deal.venture_capacity",
      formula: "min(ARR x share of ARR, last round x share of the round), each only when positive, half-up to cents; ARR binds on a tie",
      operands: {arr: arr ? full(arr) : "none", arrShare: full(arrShare), lastEquityRound: round ? full(round) : "none", roundShare: full(roundShare)},
      result: value === null ? "not computed (no positive ARR or round)" : `${value} (${lowest!.binding})`,
    },
  };
}

/**
 * The room under the leverage ceiling: EBITDA times the ceiling, less the net debt already
 * outstanding, never below zero (a company already above the ceiling has no incremental room, not
 * negative room), half-up to cents. Not computed (null) when EBITDA is not positive.
 */
export function calculateLeverageCeilingRoom(input: {adjustedEbitda: Decimal.Value; leverageCeiling: Decimal.Value; existingNetDebt: Decimal.Value}): {
  readonly value: string | null;
  /** EBITDA at cents, as the capacity's trace states it. */
  readonly ebitda: string;
  readonly trace: CalculationTrace;
} {
  const ebitda = finite("adjusted EBITDA", input.adjustedEbitda);
  const ceiling = finite("leverage ceiling", input.leverageCeiling);
  const netDebt = finite("existing net debt", input.existingNetDebt);
  const room = ebitda.gt(0) ? cents(Decimal.max(ebitda.times(ceiling).minus(netDebt), ZERO)) : null;
  return {
    value: room ? full(room) : null,
    ebitda: full(cents(ebitda)),
    trace: {
      id: "deal.leverage_ceiling_room",
      formula: "room = max(EBITDA x leverage ceiling - existing net debt, 0), half-up to cents; not computed when EBITDA is not positive",
      operands: {adjustedEbitda: full(ebitda), leverageCeiling: full(ceiling), existingNetDebt: full(netDebt)},
      result: room ? full(room) : "not computed (EBITDA not positive)",
    },
  };
}

/** The lowest of the figures, compared exactly, and its position: the first on a tie; null when there is none. */
export function selectLowestFigure(input: {values: readonly Decimal.Value[]}): {readonly value: string | null; readonly index: number | null; readonly trace: CalculationTrace} {
  const figures = input.values.map((value, index) => finite(`figure ${index + 1}`, value));
  let index: number | null = null;
  figures.forEach((figure, position) => {
    if (index === null || figure.lt(figures[index]!)) index = position;
  });
  const value = index === null ? null : full(figures[index]!);
  return {
    value,
    index,
    trace: {
      id: "deal.lowest_figure",
      formula: "the lowest figure, compared exactly; the first on a tie",
      operands: Object.fromEntries(figures.map((figure, position) => [`figure${position + 1}`, full(figure)])),
      result: value ?? "none",
    },
  };
}

// Collateral --------------------------------------------------------------------------------------

export type CollateralAssetFigures = {
  value: Decimal.Value;
  encumbered: Decimal.Value;
  /** The haircut applied, as a fraction: the room's, or the policy's for the class. */
  haircut: Decimal.Value;
  /** The quality rank of the class a lender reads it in: 1 first. */
  rank: number;
};

/**
 * The coverage a security package reaches. Each asset's free value is its value less what is already
 * pledged, never below zero, and its eligible value the free value after the haircut, half-up to
 * cents. The assets are ordered by rank, then by eligible value, largest first (ties keep the order
 * given), and taken in that order, skipping those with no eligible value, until the eligible value
 * taken reaches the amount times the coverage required. The coverage reached is the eligible value
 * taken over the amount.
 */
export function designCollateralCoverage(input: {assets: readonly CollateralAssetFigures[]; amount: Decimal.Value; coverage: Decimal.Value}): {
  readonly required: string;
  /** Per asset, in the order given: the haircut at four decimals and the eligible value at cents. */
  readonly lines: ReadonlyArray<{readonly haircut: string; readonly eligible: string}>;
  /** The positions of the assets in the order they are taken. */
  readonly order: readonly number[];
  /** The positions of the assets taken into the package. */
  readonly selected: readonly number[];
  readonly eligibleSelected: string;
  /** The eligible value taken over the amount; null when the amount is zero. */
  readonly coverageReached: string | null;
  readonly sufficient: boolean;
  /** What the package lacks to reach the coverage required; null when it reaches it. */
  readonly shortfall: string | null;
  readonly trace: CalculationTrace;
} {
  const amount = finite("amount", input.amount);
  const coverage = finite("coverage required", input.coverage);
  const required = amount.times(coverage);
  const lines = input.assets.map((asset, index) => {
    const haircut = finite(`haircut of asset ${index + 1}`, asset.haircut);
    const free = Decimal.max(finite(`value of asset ${index + 1}`, asset.value).minus(finite(`encumbrance of asset ${index + 1}`, asset.encumbered)), 0);
    return {rank: asset.rank, haircut, free, eligible: cents(free.times(new Decimal(1).minus(haircut)))};
  });
  const order = lines.map((_, index) => index).sort((a, b) => lines[a]!.rank - lines[b]!.rank || lines[b]!.eligible.comparedTo(lines[a]!.eligible));
  const selected: number[] = [];
  let running = new Decimal(0);
  for (const index of order) {
    if (running.gte(required)) break;
    const eligible = lines[index]!.eligible;
    if (eligible.lte(0)) continue;
    selected.push(index);
    running = running.plus(eligible);
  }
  const sufficient = running.gte(required);
  const reached = amount.isZero() ? null : running.div(amount);
  const shortfall = sufficient ? null : required.minus(running);
  return {
    required: full(required),
    lines: lines.map((line) => ({haircut: line.haircut.toFixed(4, Decimal.ROUND_HALF_UP), eligible: line.eligible.toFixed(2)})),
    order,
    selected,
    eligibleSelected: full(running),
    coverageReached: reached ? full(reached) : null,
    sufficient,
    shortfall: shortfall ? full(shortfall) : null,
    trace: {
      id: "deal.collateral_coverage",
      formula: "free = max(value - encumbered, 0); eligible = free x (1 - haircut), half-up to cents; taken by rank, then largest eligible, until the eligible taken reaches amount x coverage; coverage reached = eligible taken / amount",
      operands: {amount: full(amount), coverage: full(coverage), assets: String(lines.length)},
      result: `required=${full(required)}; taken=${full(running)}; ${sufficient ? "sufficient" : `short by ${full(shortfall!)}`}`,
    },
  };
}

// Amounts of the operation, the structure and its alternatives -------------------------------------

/** Amounts summed exactly, in the order given. */
export function sumAmounts(input: {amounts: readonly Decimal.Value[]}): {readonly value: string; readonly trace: CalculationTrace} {
  const amounts = input.amounts.map((amount, index) => finite(`amount ${index + 1}`, amount));
  const sum = amounts.reduce((total, amount) => total.plus(amount), new Decimal(0));
  return {
    value: full(sum),
    trace: {id: "deal.amount_sum", formula: "sum of the amounts, in the order given", operands: Object.fromEntries(amounts.map((amount, index) => [`amount${index + 1}`, full(amount)])), result: full(sum)},
  };
}

/** How far one amount sits from another: the signed difference and its magnitude. */
export function calculateAmountDifference(input: {amount: Decimal.Value; reference: Decimal.Value}): {readonly value: string; readonly magnitude: string; readonly trace: CalculationTrace} {
  const amount = finite("amount", input.amount);
  const reference = finite("reference amount", input.reference);
  const difference = amount.minus(reference);
  return {
    value: full(difference),
    magnitude: full(difference.abs()),
    trace: {id: "deal.amount_difference", formula: "difference = amount - reference; magnitude = |difference|", operands: {amount: full(amount), reference: full(reference)}, result: full(difference)},
  };
}

/**
 * Whether two amounts tie within a tolerance: the magnitude of their difference against the magnitude
 * of the tolerance (a tolerance written as negative reads as its magnitude). A gap exactly at the
 * tolerance ties.
 */
export function testWithinTolerance(input: {difference: Decimal.Value; tolerance: Decimal.Value}): {readonly within: boolean; readonly trace: CalculationTrace} {
  const magnitude = finite("difference", input.difference).abs();
  const tolerance = finite("tolerance", input.tolerance).abs();
  const within = magnitude.lte(tolerance);
  return {
    within,
    trace: {id: "deal.within_tolerance", formula: "ties when |difference| <= |tolerance|", operands: {difference: full(finite("difference", input.difference)), tolerance: full(tolerance)}, result: within ? "within" : "outside"},
  };
}

/** What the capacity envelope leaves out of the request: the request less the envelope, never below zero. */
export function calculateSizingGap(input: {requested: Decimal.Value; envelope: Decimal.Value}): {readonly value: string; readonly trace: CalculationTrace} {
  const requested = finite("requested amount", input.requested);
  const envelope = finite("capacity envelope", input.envelope);
  const gap = Decimal.max(requested.minus(envelope), 0);
  return {
    value: full(gap),
    trace: {id: "deal.sizing_gap", formula: "gap = max(requested - envelope, 0)", operands: {requested: full(requested), envelope: full(envelope)}, result: full(gap)},
  };
}

/** Amounts summed by key (a year of maturities, a period), keys in the order first seen. */
export function sumAmountsByKey(input: {entries: ReadonlyArray<{key: string; amount: Decimal.Value}>}): {readonly totals: Readonly<Record<string, string>>; readonly trace: CalculationTrace} {
  const totals = new Map<string, Decimal>();
  input.entries.forEach((entry, index) => {
    totals.set(entry.key, (totals.get(entry.key) ?? new Decimal(0)).plus(finite(`amount ${index + 1}`, entry.amount)));
  });
  const result = Object.fromEntries([...totals.entries()].map(([key, total]) => [key, full(total)]));
  return {
    totals: result,
    trace: {id: "deal.amounts_by_key", formula: "amounts summed by key, keys in the order first seen", operands: {entries: String(input.entries.length)}, result: Object.entries(result).map(([key, total]) => `${key}=${total}`).join("; ")},
  };
}
