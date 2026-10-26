import Decimal from "decimal.js";

export const projectionChallengeVersion = "2026.10.26-v1";
const Exact = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});

/** Drivers read per period (one value each year) and per case (one value for the horizon). */
export const projectionPeriodDrivers = ["quantity", "netUnitPrice", "variableUnitCost", "fixedCosts", "interestExpense"] as const;
export const projectionCaseDrivers = ["receivableDays", "inventoryDays", "payableDays", "maintenanceCapex", "leasePayments", "depreciation", "taxRate"] as const;
export type ProjectionPeriodDriver = typeof projectionPeriodDrivers[number];
export type ProjectionCaseDriver = typeof projectionCaseDrivers[number];
export type ProjectionDriver = ProjectionPeriodDriver | ProjectionCaseDriver;
/** Drivers that move EBITDA; each is challenged on its own, never grouped into a single cut. */
const incomeDrivers: readonly ProjectionDriver[] = ["quantity", "netUnitPrice", "variableUnitCost", "fixedCosts"];

export type ProjectionDriverPeriod = {id: string; quantity: string; netUnitPrice: string; variableUnitCost: string; fixedCosts: string;
  /** Interest expense of the period, used only in the tax base of the convention. */
  interestExpense: string};
/** One projection by drivers. Revenue is quantity times net unit price and must be in the unit of the
 * costs (the reader declares the unit convention). */
export type ProjectionDriverCase = {periods: readonly ProjectionDriverPeriod[];
  receivableDays: string; inventoryDays: string; payableDays: string;
  maintenanceCapex: string; leasePayments: string; depreciation: string; taxRate: string};
export type ProjectionChallengeInput = {
  currency: string;
  /** Days in the year for working capital by days (360 is the commercial convention). */
  dayBasis: "360" | "365";
  targetPeriodId: string;
  /** The reference built by drivers (history, inflation, capacity) and the company's plan, same periods in the same order. */
  reference: ProjectionDriverCase; plan: ProjectionDriverCase;
  /** Each assumption is a set of drivers the plan changes against the reference. Together they cover every difference. */
  assumptions: readonly {id: string; label: string; drivers: readonly ProjectionDriver[]}[];
  /** Installed capacity in the quantity unit, and whether the plan carries the investment that would lift it; null when not informed. */
  capacity: {maximumQuantity: string; investmentInPlan: boolean} | null;
  /** Receivable days a customer or market is asking for, read as the cash it would take at the plan's revenue. */
  requestedReceivableDays: string | null;
  /** Premium of a product line over the average price, when the plan's price is attributed to mix. */
  premiumOverAverage: string | null;
};

function amount(value: string, code = "projection_challenge_invalid_amount", signed = false) {
  if (typeof value !== "string" || !(signed ? /^-?\d{1,24}(?:\.\d{1,20})?$/ : /^\d{1,24}(?:\.\d{1,20})?$/).test(value)) throw new Error(code);
  return new Exact(value);
}
const identity = (value: string, code: string) => {if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,59}$/.test(value)) throw new Error(code); return value;};
const out = (v: Decimal) => v.toDecimalPlaces(20).toFixed();

type Row = {periodId: string; quantity: Decimal; netUnitPrice: Decimal; revenue: Decimal; variableCost: Decimal; fixedCosts: Decimal;
  ebitda: Decimal; margin: Decimal | null; unitMargin: Decimal; workingCapital: Decimal; workingCapitalChange: Decimal | null;
  tax: Decimal; cashAvailable: Decimal | null};

function validCase(c: ProjectionDriverCase) {
  if (!c || !Array.isArray(c.periods) || !c.periods.length || c.periods.length > 20) throw new Error("projection_challenge_period_count");
  for (const p of c.periods) {
    identity(p.id, "projection_challenge_period_identity");
    projectionPeriodDrivers.forEach(k => amount(p[k]));
  }
  projectionCaseDrivers.forEach(k => amount(c[k]));
  if (new Exact(c.taxRate).gt(1)) throw new Error("projection_challenge_tax_rate");
  if (new Set(c.periods.map(p => p.id)).size !== c.periods.length) throw new Error("projection_challenge_period_identity");
}

/** Annual projection by drivers. Revenue = quantity x net unit price; variable cost = quantity x
 * variable unit cost; EBITDA = revenue - variable cost - fixed costs. Working capital by days over the
 * day basis: receivables on revenue, inventory and payables on variable cost. Cash tax = rate x
 * (EBITDA - depreciation - lease payments - interest), never negative. Cash available = EBITDA - lease
 * payments - cash tax - change in working capital - maintenance capex. The first period has no prior
 * balance, so its change in working capital and its cash are not computed (null). */
export function projectByDrivers(c: ProjectionDriverCase, dayBasis: "360" | "365"): Row[] {
  validCase(c);
  if (dayBasis !== "360" && dayBasis !== "365") throw new Error("projection_challenge_day_basis");
  const basis = new Exact(dayBasis), rate = new Exact(c.taxRate);
  let prior: Decimal | null = null;
  return c.periods.map(p => {
    const quantity = new Exact(p.quantity), price = new Exact(p.netUnitPrice), unitCost = new Exact(p.variableUnitCost);
    const revenue = quantity.mul(price), variableCost = quantity.mul(unitCost), fixedCosts = new Exact(p.fixedCosts);
    const ebitda = revenue.minus(variableCost).minus(fixedCosts);
    const workingCapital = revenue.mul(c.receivableDays).div(basis).plus(variableCost.mul(c.inventoryDays).div(basis)).minus(variableCost.mul(c.payableDays).div(basis));
    const change = prior === null ? null : workingCapital.minus(prior); prior = workingCapital;
    const taxBase = ebitda.minus(c.depreciation).minus(c.leasePayments).minus(p.interestExpense);
    const tax = taxBase.gt(0) ? taxBase.mul(rate) : new Exact(0);
    const cashAvailable = change === null ? null : ebitda.minus(c.leasePayments).minus(tax).minus(change).minus(c.maintenanceCapex);
    return {periodId: p.id, quantity, netUnitPrice: price, revenue, variableCost, fixedCosts, ebitda,
      margin: revenue.gt(0) ? ebitda.div(revenue) : null, unitMargin: price.minus(unitCost), workingCapital, workingCapitalChange: change, tax, cashAvailable};
  });
}

/** The reference case with the given drivers taken from the plan (every period of a period driver). */
function swap(into: ProjectionDriverCase, from: ProjectionDriverCase, drivers: readonly ProjectionDriver[]): ProjectionDriverCase {
  const periodKeys = drivers.filter((d): d is ProjectionPeriodDriver => (projectionPeriodDrivers as readonly string[]).includes(d));
  const caseKeys = drivers.filter((d): d is ProjectionCaseDriver => (projectionCaseDrivers as readonly string[]).includes(d));
  return {...into, ...Object.fromEntries(caseKeys.map(k => [k, from[k]])),
    periods: into.periods.map((p, i) => ({...p, ...Object.fromEntries(periodKeys.map(k => [k, from.periods[i]![k]]))}))};
}
const differs = (a: ProjectionDriverCase, b: ProjectionDriverCase, d: ProjectionDriver) => (projectionPeriodDrivers as readonly string[]).includes(d)
  ? a.periods.some((p, i) => !new Exact(p[d as ProjectionPeriodDriver]).eq(b.periods[i]![d as ProjectionPeriodDriver]))
  : !new Exact(a[d as ProjectionCaseDriver]).eq(b[d as ProjectionCaseDriver]);
/** Compound growth per period from the first period to the target; null when the first value is not positive. */
function growth(first: Decimal, last: Decimal, steps: number) {
  if (!first.gt(0) || steps < 1 || last.lt(0)) return null;
  return last.div(first).pow(new Exact(1).div(steps)).minus(1);
}

/** Where a plan stands against a reference built by drivers, assumption by assumption, at one target
 * period. The gap is plan minus reference. Each assumption's isolated effect is measured two ways, both
 * independent of the order the assumptions are listed in: from the reference (the reference with only
 * that assumption taken from the plan, minus the reference) and from the plan (the plan minus the plan
 * with only that assumption returned to the reference). Effects do not add up to the gap; the difference
 * is the interaction between assumptions and is returned for each convention. Nothing is cut uniformly,
 * no scenario is run and the plan is not rebuilt: the two cases are read as given. */
export function challengeProjection(input: ProjectionChallengeInput) {
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("projection_challenge_invalid_currency");
  validCase(input.reference); validCase(input.plan);
  const ids = input.reference.periods.map(p => p.id);
  if (ids.join("|") !== input.plan.periods.map(p => p.id).join("|")) throw new Error("projection_challenge_period_mismatch");
  const target = ids.indexOf(input.targetPeriodId);
  // The target needs a prior period for its cash.
  if (target < 1) throw new Error("projection_challenge_target_period");
  if (!input.assumptions.length || input.assumptions.length > 12) throw new Error("projection_challenge_assumption_count");
  const all = [...projectionPeriodDrivers, ...projectionCaseDrivers] as readonly string[];
  const owner = new Map<ProjectionDriver, string>(), seen = new Set<string>();
  for (const a of input.assumptions) {
    identity(a.id, "projection_challenge_assumption_identity");
    if (seen.has(a.id)) throw new Error("projection_challenge_assumption_identity");
    seen.add(a.id);
    if (typeof a.label !== "string" || !a.label.trim() || a.label.length > 300) throw new Error("projection_challenge_label_required");
    if (!a.drivers.length || a.drivers.some(d => !all.includes(d))) throw new Error("projection_challenge_unknown_driver");
    for (const d of a.drivers) {if (owner.has(d)) throw new Error("projection_challenge_driver_in_two_assumptions"); owner.set(d, a.id);}
    if (a.drivers.length > 1 && a.drivers.some(d => incomeDrivers.includes(d))) throw new Error("projection_challenge_income_drivers_grouped");
    if (!a.drivers.some(d => differs(input.reference, input.plan, d))) throw new Error("projection_challenge_assumption_without_difference");
  }
  for (const d of all as readonly ProjectionDriver[]) if (differs(input.reference, input.plan, d) && !owner.has(d)) throw new Error("projection_challenge_unassigned_difference");
  const basis = new Exact(input.dayBasis);
  const reference = projectByDrivers(input.reference, input.dayBasis), plan = projectByDrivers(input.plan, input.dayBasis);
  const at = (rows: Row[]) => rows[target]!;
  const ebitdaGap = at(plan).ebitda.minus(at(reference).ebitda), cashGap = at(plan).cashAvailable!.minus(at(reference).cashAvailable!);
  const effects = input.assumptions.map(a => {
    const added = at(projectByDrivers(swap(input.reference, input.plan, a.drivers), input.dayBasis));
    const removed = at(projectByDrivers(swap(input.plan, input.reference, a.drivers), input.dayBasis));
    const fromReference = {ebitda: added.ebitda.minus(at(reference).ebitda), cash: added.cashAvailable!.minus(at(reference).cashAvailable!)};
    const fromPlan = {ebitda: at(plan).ebitda.minus(removed.ebitda), cash: at(plan).cashAvailable!.minus(removed.cashAvailable!)};
    const drivers = a.drivers.map(d => {
      const isPeriod = (projectionPeriodDrivers as readonly string[]).includes(d);
      const value = (c: ProjectionDriverCase, i: number) => new Exact(isPeriod ? c.periods[i]![d as ProjectionPeriodDriver] : c[d as ProjectionCaseDriver]);
      return {driver: d, plan: out(value(input.plan, target)), reference: out(value(input.reference, target)),
        planGrowth: isPeriod ? (g => g === null ? null : out(g))(growth(value(input.plan, 0), value(input.plan, target), target)) : null,
        referenceGrowth: isPeriod ? (g => g === null ? null : out(g))(growth(value(input.reference, 0), value(input.reference, target), target)) : null};
    });
    return {assumptionId: a.id, label: a.label, drivers, fromReference, fromPlan};
  });
  const magnitude = (e: typeof effects[number]) => [e.fromReference.ebitda.abs(), e.fromReference.cash.abs()] as const;
  const ranked = [...effects].sort((x, y) => {
    const [xe, xc] = magnitude(x), [ye, yc] = magnitude(y);
    return !xe.eq(ye) ? (ye.gt(xe) ? 1 : -1) : !xc.eq(yc) ? (yc.gt(xc) ? 1 : -1) : x.assumptionId < y.assumptionId ? -1 : 1;
  });
  const sum = (pick: (e: typeof effects[number]) => Decimal) => effects.reduce((s, e) => s.plus(pick(e)), new Exact(0));
  let cumulative = new Exact(0);
  const order = ranked.map(e => {
    cumulative = cumulative.plus(e.fromReference.ebitda);
    return {assumptionId: e.assumptionId, cumulativeShareOfEbitdaGap: ebitdaGap.isZero() ? null : out(cumulative.div(ebitdaGap))};
  });
  const capacity = input.capacity === null ? null : (() => {
    const max = amount(input.capacity.maximumQuantity);
    if (!max.gt(0) || typeof input.capacity.investmentInPlan !== "boolean") throw new Error("projection_challenge_capacity");
    const above = plan.filter(r => r.quantity.gt(max)).map(r => ({periodId: r.periodId, quantity: out(r.quantity), excess: out(r.quantity.minus(max))}));
    return {maximumQuantity: out(max), investmentInPlan: input.capacity.investmentInPlan, periodsAbove: above,
      firstPeriodAbove: above[0]?.periodId ?? null, aboveWithoutInvestment: above.length > 0 && !input.capacity.investmentInPlan};
  })();
  const perDay = (r: Row) => r.revenue.div(basis);
  const requested = input.requestedReceivableDays === null ? null : amount(input.requestedReceivableDays);
  // Mix reading: average price = regular x (1 + share x premium); from a zero starting share the share the
  // plan's price needs at the target is (plan price / reference price - 1) / premium. A current share s0 adds (ratio - 1) x s0.
  const premium = input.premiumOverAverage === null ? null : amount(input.premiumOverAverage);
  if (premium !== null && !premium.gt(0)) throw new Error("projection_challenge_premium_not_positive");
  const priceRatio = at(plan).netUnitPrice.div(at(reference).netUnitPrice);
  const row = (r: Row) => ({periodId: r.periodId, quantity: out(r.quantity), netUnitPrice: out(r.netUnitPrice), revenue: out(r.revenue), variableCost: out(r.variableCost),
    fixedCosts: out(r.fixedCosts), ebitda: out(r.ebitda), margin: r.margin === null ? null : out(r.margin), unitMargin: out(r.unitMargin),
    workingCapital: out(r.workingCapital), workingCapitalChange: r.workingCapitalChange === null ? null : out(r.workingCapitalChange), tax: out(r.tax),
    cashAvailable: r.cashAvailable === null ? null : out(r.cashAvailable)});
  const residual = (pick: "fromReference" | "fromPlan") => ({ebitda: out(ebitdaGap.minus(sum(e => e[pick].ebitda))), cash: out(cashGap.minus(sum(e => e[pick].cash)))});
  return {schemaVersion: "projection-challenge.v1" as const, version: projectionChallengeVersion, currency: input.currency, dayBasis: input.dayBasis,
    targetPeriodId: input.targetPeriodId,
    convention: "isolated effect from the reference (reference with only that assumption from the plan, minus the reference), and from the plan (plan minus the plan with only that assumption returned to the reference); both independent of order" as const,
    reference: reference.map(row), plan: plan.map(row),
    gap: {revenue: out(at(plan).revenue.minus(at(reference).revenue)), ebitda: out(ebitdaGap), cash: out(cashGap),
      margin: at(plan).margin === null || at(reference).margin === null ? null : out(at(plan).margin!.minus(at(reference).margin!))},
    effects: effects.map(e => ({assumptionId: e.assumptionId, label: e.label, drivers: e.drivers,
      fromReference: {ebitda: out(e.fromReference.ebitda), cash: out(e.fromReference.cash)}, fromPlan: {ebitda: out(e.fromPlan.ebitda), cash: out(e.fromPlan.cash)}})),
    order, interaction: {fromReference: residual("fromReference"), fromPlan: residual("fromPlan")},
    unitMargin: {planFirst: out(plan[0]!.unitMargin), planTarget: out(at(plan).unitMargin), referenceTarget: out(at(reference).unitMargin),
      planChange: plan[0]!.unitMargin.gt(0) ? out(at(plan).unitMargin.div(plan[0]!.unitMargin).minus(1)) : null},
    capacity,
    receivables: {cashPerDayAtPlanRevenue: out(perDay(at(plan))), cashPerDayAtReferenceRevenue: out(perDay(at(reference))),
      planDays: out(new Exact(input.plan.receivableDays)), requestedDays: requested === null ? null : out(requested),
      /** Cash the requested days would take against the plan's days, at the plan's revenue of the target period. */
      cashAtRequestedDays: requested === null ? null : out(requested.minus(input.plan.receivableDays).mul(perDay(at(plan))))},
    premiumMix: premium === null ? null : {premiumOverAverage: out(premium), priceRatio: out(priceRatio),
      shareNeededAtTarget: out(priceRatio.minus(1).div(premium)), sharePerPeriod: out(priceRatio.minus(1).div(premium).div(target))}};
}
export type ProjectionChallenge = ReturnType<typeof challengeProjection>;
