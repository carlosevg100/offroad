import Decimal from "decimal.js";
import {z} from "zod";
import {buildCapitalPeriodCash} from "./capital-period-cash";
import type {DatedDebtInstrument} from "./dated-debt";
import {projectDebtCapacityAmount, type DebtCapacityInput} from "./debt-capacity";
import {solveEquivalentFinancingSpread} from "./equivalent-financing-cost";
import {buildFinancingCashFlows, financingCostCategories, type FinancingCharge, type FinancingCostAssessment} from "./financing-costs";
import {buildIndexedDebtSchedule, type IndexedDebtPeriodInput} from "./indexed-debt";
import type {OperatingWorkingCapital} from "./operating-cash-projection";
import {calculatePeriodFinancingTaxes} from "./period-financing-taxes";
import {projectLeverageCovenant} from "./projected-leverage-covenant";
import {composeIndexAndSpread} from "./rate-composition";

export const capitalStructurePathsVersion = "2026.10.27-v1";

const D = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const text = z.string().trim().min(1).max(2000);
const isoDate = z.iso.date();
/** Adopted money carries at most eight decimals, as the adopted numeric representation reads it. */
const money = z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/);
const signedMoney = z.string().regex(/^-?\d{1,24}(?:\.\d{1,8})?$/);
const rate = z.string().regex(/^-?\d{1,4}(?:\.\d{1,20})?$/);
const year = z.number().int().min(2000).max(2200);
const series = <T extends z.ZodType>(s: T) => z.array(s).min(1).max(40);
const shares = z.array(z.strictObject({year, share: rate})).min(1).max(15);

const instrumentSchema = z.strictObject({
  id: key, label: text,
  /** `amended` is an existing contract under new terms; it replaces the instrument it names. */
  role: z.enum(["existing", "amended", "new"]), replaces: key.nullable(),
  lenderKind: z.enum(["bank", "capital_markets", "development_bank"]),
  openingPrincipal: money,
  /** The contractual final payment date, when a document states it. */
  finalPaymentDate: isoDate.nullable(),
  rate: z.discriminatedUnion("kind", [
    z.strictObject({kind: z.literal("index_plus_spread"), spreads: series(rate)}),
    z.strictObject({kind: z.literal("fixed"), annualRates: series(rate)})]),
  /** Quarterly interest is paid when it accrues; semiannual interest (June and December) accrues until paid. */
  interestEvery: z.enum(["quarter", "semester"]),
  couponTreatment: z.enum(["cash_paid", "accrued_until_paid"]),
  couponBase: z.enum(["opening_principal", "average_principal"]),
  draws: series(money), principal: series(money),
  charges: z.array(z.strictObject({id: key, periodEnd: isoDate, category: z.enum(financingCostCategories), amount: money})).max(12),
  security: z.strictObject({kind: z.enum(["receivables", "financed_asset", "none"]), amount: money, countsAgainstBasket: z.boolean()}),
  prepayment: z.strictObject({basis: z.enum(["flat", "per_year_of_weighted_remaining_life"]), rate}).nullable(),
  /** What happens to the principal still outstanding at the horizon end. */
  afterHorizon: z.discriminatedUnion("kind", [
    z.strictObject({kind: z.literal("none")}),
    /** A seasonal line repaid after the horizon by the release of the working capital it financed: the
     * settlement date, the justification and the cash source are checked against the adopted base. */
    z.strictObject({kind: z.literal("seasonal_release"), settlementMonthsAfterDraw: z.number().int().min(1).max(12), justification: text}),
    z.strictObject({kind: z.literal("not_tested"), reason: text}),
    z.strictObject({kind: z.literal("scheduled"), shares, alternatives: z.array(z.strictObject({id: key, label: text, shares})).max(3)})]),
});
const pathSchema = z.strictObject({
  id: key, label: text, role: z.enum(["status_quo", "candidate", "companion"]), projectVariantId: key,
  instrumentIds: z.array(key).min(1).max(16),
  prepayments: z.array(z.strictObject({instrumentId: key, periodEnd: isoDate})).max(8),
  /** Charges this path causes on an instrument it carries (a consent fee to another lender's holders). */
  charges: z.array(z.strictObject({id: key, instrumentId: key, periodEnd: isoDate, category: z.enum(financingCostCategories), amount: money})).max(8),
});
const effectsSchema = z.strictObject({ebitda: series(signedMoney), depreciation: series(money), maintenanceCapex: series(money), growthCapex: series(money),
  startupWorkingCapitalCashFlow: series(signedMoney)});

/** Capital structure paths for one company over one adopted horizon: the company, its existing
 * debt, every instrument any path may carry, the paths, the limits, the post-horizon annual base
 * and the sensitivities. BRL (or the adopted currency) in the adopted unit; rates as fractions. */
export const capitalStructurePathsInputSchema = z.strictObject({
  currency: z.string().regex(/^[A-Z]{3}$/), openingDate: isoDate,
  /** Contiguous whole-month periods; each starts the day after the previous end. */
  periodEnds: z.array(isoDate).min(2).max(40),
  openingAvailable: signedMoney,
  /** Minimum available cash of policy, measured at every period end of the base case. */
  minimumCash: money,
  index: z.strictObject({name: z.literal("DI"), annualByPeriod: series(rate), afterHorizon: z.array(z.strictObject({year, annualRate: rate})).max(15)}),
  tax: z.strictObject({rate, lossTreatment: z.literal("no_cash_benefit")}),
  operating: z.strictObject({ebitda: series(signedMoney), depreciation: series(money), leasePayments: series(money),
    /** Signed working-capital cash flow (negative consumes cash), seasonal and structural. */
    workingCapitalCashFlow: series(signedMoney), maintenanceCapex: series(money)}),
  /** Cash available for debt service: operating cash after taxes, leases, working capital and maintenance
   * capex, before the project's capex and start-up working capital. The only classification accepted. */
  availableForService: z.literal("operating_cash_before_project_investment"),
  projectVariants: z.array(z.strictObject({id: key, label: text, effects: effectsSchema.nullable()})).min(1).max(6),
  stress: z.strictObject({id: key, label: text, ebitdaFactor: rate, fromPeriodEnd: isoDate}),
  covenant: z.strictObject({
    ebitdaExcludesLeases: z.boolean(),
    /** Periods before the horizon that complete the first twelve-month windows, oldest first. */
    history: z.array(z.strictObject({id: key, months: z.number().int().min(1).max(12), ebitda: signedMoney, leasePayments: money})).max(8),
    indenture: z.strictObject({limit: rate, comparator: z.enum(["lte", "lt"]), measurementPeriodEnds: z.array(isoDate).min(1).max(12), source: text}),
    /** A board policy measured on the indenture definition until the board writes its own. */
    policy: z.strictObject({limit: rate, comparator: z.enum(["lte", "lt"]), measurementPeriodEnds: z.array(isoDate).min(1).max(12),
      definition: z.literal("indenture_definition"), source: text}).nullable(),
  }),
  basket: z.strictObject({holderId: key, limit: money, basis: z.enum(["aggregate", "per_operation"]), occupied: money, source: text}).nullable(),
  instruments: z.array(instrumentSchema).min(1).max(24),
  paths: z.array(pathSchema).min(1).max(12),
  /** Annual base after the horizon for the amortization test (the company without the tested debt). */
  postHorizon: z.strictObject({years: z.array(year).min(1).max(15), ebitda: series(signedMoney), leasePayments: series(money), maintenanceCapex: series(money),
    workingCapitalInvestment: series(signedMoney), depreciation: series(money), otherInterest: series(money)}),
  plan: z.strictObject({
    /** A capital-markets issue goes ahead only if the sounding indicates at most this spread. */
    maximumSpread: rate, soundingBy: isoDate, routeDecisionBy: isoDate}),
  sensitivities: z.array(z.strictObject({id: key, label: text, ebitdaDelta: series(signedMoney), workingCapitalDelta: series(signedMoney), minimumCash: money.nullable()})).max(6),
  /** Resolution of the smallest issue amount that keeps the recommended path inside every gate. */
  demandQuantum: money,
});
export type CapitalStructurePathsInput = z.infer<typeof capitalStructurePathsInputSchema>;
type Instrument = CapitalStructurePathsInput["instruments"][number];
type Path = CapitalStructurePathsInput["paths"][number];

export const capitalPathGateIds = ["minimum_cash_base", "cash_nonnegative_stress", "indenture_base", "indenture_stress", "policy_base", "policy_stress",
  "basket_without_consent", "amortization_after_horizon"] as const;
export type CapitalPathGateId = (typeof capitalPathGateIds)[number];
type GateStatus = "pass" | "fail" | "not_tested";

const fmt = (v: Decimal) => v.toDecimalPlaces(20).toFixed();
const eight = (v: Decimal) => v.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed();
const dayAfter = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
const monthIndex = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
const isMonthEnd = (d: string) => dayAfter(d).slice(8, 10) === "01";
const zeroWc = (): OperatingWorkingCapital => ({receivables: "0", inventory: "0", otherOperatingAssets: "0", payables: "0", otherOperatingLiabilities: "0"});
const sum = (values: readonly Decimal.Value[]) => values.reduce<Decimal>((t, v) => t.plus(v), new D(0));

type Period = {id: string; startDate: string; endDate: string; months: number; yearFraction: Decimal};
type Context = {input: CapitalStructurePathsInput; periods: Period[]; instruments: Map<string, Instrument>};

function buildPeriods(input: CapitalStructurePathsInput): Period[] {
  let previous = input.openingDate;
  if (!isMonthEnd(previous)) throw new Error("capital_paths_whole_month_periods_required");
  return input.periodEnds.map((end) => {
    const start = dayAfter(previous);
    if (end <= previous || !isMonthEnd(end)) throw new Error("capital_paths_whole_month_periods_required");
    const months = monthIndex(end) - monthIndex(start) + 1;
    previous = end;
    return {id: end, startDate: start, endDate: end, months, yearFraction: new D(months).div(12)};
  });
}

/** Effective rate of one period from an annual rate: (1 + annual)^(months/12) - 1. */
const periodRate = (annual: Decimal.Value, yearFraction: Decimal) => new D(annual).plus(1).pow(yearFraction).minus(1);
/** Annual DI-plus-spread rate by the multiplicative composition of the published kernel. */
const composed = (index: string, spread: string) => new D(composeIndexAndSpread({index: "DI", annualIndex: index, annualSpread: spread}).value);
function annualRateAt(input: CapitalStructurePathsInput, i: Instrument, periodIndex: number) {
  return i.rate.kind === "fixed" ? new D(i.rate.annualRates[periodIndex]!) : composed(input.index.annualByPeriod[periodIndex]!, i.rate.spreads[periodIndex]!);
}
function afterHorizonIndex(input: CapitalStructurePathsInput, y: number) {
  const found = input.index.afterHorizon.find((x) => x.year === y);
  if (!found) throw new Error(`capital_paths_index_after_horizon_missing:${y}`);
  return found.annualRate;
}
function annualRateAfter(input: CapitalStructurePathsInput, i: Instrument, y: number) {
  return i.rate.kind === "fixed" ? new D(i.rate.annualRates.at(-1)!) : composed(afterHorizonIndex(input, y), i.rate.spreads.at(-1)!);
}
const sharesOf = (s: readonly {year: number; share: string}[]) => {
  const total = sum(s.map((x) => x.share));
  if (!total.minus(1).abs().lte("0.000000000001") || s.some((x) => new D(x.share).lt(0))) throw new Error("capital_paths_after_horizon_shares_must_sum_to_one");
  if (new Set(s.map((x) => x.year)).size !== s.length || s.some((x, n) => n > 0 && x.year <= s[n - 1]!.year)) throw new Error("capital_paths_after_horizon_years_in_order");
  if (!s.some((x) => new D(x.share).gt(0))) throw new Error("capital_paths_after_horizon_shares_must_sum_to_one");
  // The last effective payment (the last positive share) absorbs the representation remainder; a zero share stays zero.
  const last = s.map((x) => new D(x.share).gt(0)).lastIndexOf(true);
  return s.map((x, n) => ({year: x.year, share: n === last ? new D(1).minus(sum(s.filter((_, m) => m !== last).map((y) => y.share))) : new D(x.share)}));
};

/** Money owed after the horizon split by the adopted shares: every year but the last on eight decimals, the
 * last absorbing the remainder, so the principal closes exactly on the final payment. */
function splitResidual(residual: Decimal, shares: readonly {year: number; share: string}[]) {
  const s = sharesOf(shares), last = s.map((x) => x.share.gt(0)).lastIndexOf(true);
  // Earlier payments round down on eight decimals, so they never exceed the balance; the last effective payment
  // takes what remains (never negative) and a zero share pays exactly zero.
  const amounts = s.map((x, n) => n === last ? null : x.share.eq(0) ? new D(0) : residual.times(x.share).toDecimalPlaces(8, Decimal.ROUND_DOWN));
  const paid = sum(amounts.filter((a): a is Decimal => a !== null));
  return s.map((x, n) => ({year: x.year, amount: amounts[n] ?? residual.minus(paid)}));
}
const addMonths = (d: string, n: number) => {const x = new Date(`${d}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10);};
const monthEnd = (startOfMonth: string) => dayBefore(addMonths(startOfMonth, 1));

/** Settlement date of a seasonal line, and the cash source that pays it, verified on the base: one draw,
 * no principal in the horizon, settlement after the horizon and within twelve months of the draw, the
 * draw no larger than the seasonal working capital consumed in its period, and the same months one year
 * earlier releasing at least the draw. Anything else cannot leave the long-debt test. */
function seasonalSettlement(input: CapitalStructurePathsInput, periods: Period[], i: Instrument) {
  if (i.afterHorizon.kind !== "seasonal_release") return null;
  const fail = (why: string) => {throw new Error(`capital_paths_seasonal_release_unverified:${i.id}:${why}`);};
  const draws = i.draws.map((x, k) => ({x: new D(x), k})).filter((d) => d.x.gt(0));
  if (draws.length !== 1) fail("single_draw");
  if (i.principal.some((x) => new D(x).gt(0))) fail("principal_in_horizon");
  if (!new D(i.openingPrincipal).eq(0)) fail("opening_principal");
  const {x: amount, k} = draws[0]!, drawStart = periods[k]!.startDate;
  const settlement = monthEnd(addMonths(drawStart, i.afterHorizon.settlementMonthsAfterDraw - 1));
  const horizonEnd = input.periodEnds.at(-1)!;
  if (settlement <= horizonEnd || settlement > monthEnd(addMonths(dayAfter(horizonEnd), 11))) fail("settlement_outside_first_year_after_horizon");
  const consumed = new D(input.operating.workingCapitalCashFlow[k]!).neg();
  if (consumed.lt(amount)) fail("draw_above_seasonal_consumption");
  const yearBefore = periods.findIndex((p) => p.endDate === monthEnd(addMonths(dayAfter(periods[k]!.endDate), -13)));
  const until = monthEnd(addMonths(dayAfter(settlement), -13));
  const window = periods.filter((p, n) => n > yearBefore && p.endDate <= until).map((p) => periods.indexOf(p));
  if (yearBefore < 0 || !window.length) fail("no_release_in_the_base");
  const released = sum(window.map((n) => input.operating.workingCapitalCashFlow[n]!));
  if (released.lt(amount)) fail("release_below_draw");
  return {settlementDate: settlement, drawPeriodIndex: k, releaseWindow: window, consumedInDrawPeriod: fmt(consumed), releasedYearBefore: fmt(released)};
}

function validate(input: CapitalStructurePathsInput): Context {
  const periods = buildPeriods(input), n = periods.length;
  const sized = [input.index.annualByPeriod, input.operating.ebitda, input.operating.depreciation, input.operating.leasePayments, input.operating.workingCapitalCashFlow,
    input.operating.maintenanceCapex, ...input.projectVariants.flatMap((v) => v.effects ? Object.values(v.effects) : []),
    ...input.instruments.flatMap((i) => [i.draws, i.principal, i.rate.kind === "fixed" ? i.rate.annualRates : i.rate.spreads]),
    ...input.sensitivities.flatMap((s) => [s.ebitdaDelta, s.workingCapitalDelta])];
  if (sized.some((s) => s.length !== n)) throw new Error("capital_paths_series_length_mismatch");
  const ph = input.postHorizon, years = ph.years.length;
  if ([ph.ebitda, ph.leasePayments, ph.maintenanceCapex, ph.workingCapitalInvestment, ph.depreciation, ph.otherInterest].some((s) => s.length !== years)) throw new Error("capital_paths_series_length_mismatch");
  const horizonYear = Number(input.periodEnds.at(-1)!.slice(0, 4));
  if (ph.years.some((y, k) => y !== horizonYear + 1 + k) || !input.periodEnds.at(-1)!.endsWith("-12-31")) throw new Error("capital_paths_post_horizon_years_follow_the_horizon");
  const ids = (list: {id: string}[], what: string) => {if (new Set(list.map((x) => x.id)).size !== list.length) throw new Error(`capital_paths_duplicate_${what}`);};
  ids(input.instruments, "instrument"); ids(input.paths, "path"); ids(input.projectVariants, "variant"); ids(input.sensitivities, "sensitivity");
  const instruments = new Map(input.instruments.map((i) => [i.id, i]));
  const periodIds = new Set(input.periodEnds);
  for (const i of input.instruments) {
    // The payment calendar fixes the coupon treatment: semiannual interest accrues until paid, quarterly is paid as it accrues.
    if ((i.interestEvery === "semester") !== (i.couponTreatment === "accrued_until_paid")) throw new Error(`capital_paths_coupon_calendar_mismatch:${i.id}`);
    if (i.interestEvery === "semester" && periods.some((p) => p.months !== 3)) throw new Error("capital_paths_semester_needs_quarters");
    if ((i.role === "amended") !== (i.replaces !== null)) throw new Error(`capital_paths_amendment_names_its_contract:${i.id}`);
    if (i.replaces !== null && instruments.get(i.replaces)?.role !== "existing") throw new Error(`capital_paths_amendment_names_its_contract:${i.id}`);
    if (i.role === "new" && !new D(i.openingPrincipal).eq(0)) throw new Error(`capital_paths_new_instrument_opens_at_zero:${i.id}`);
    if (i.charges.some((c) => !periodIds.has(c.periodEnd))) throw new Error(`capital_paths_charge_off_calendar:${i.id}`);
    if (i.security.kind === "none" && (!new D(i.security.amount).eq(0) || i.security.countsAgainstBasket)) throw new Error(`capital_paths_security_inconsistent:${i.id}`);
    // The financed asset itself is the indenture's own exception; it never occupies the aggregate basket.
    if (i.security.kind === "financed_asset" && i.security.countsAgainstBasket) throw new Error(`capital_paths_security_inconsistent:${i.id}`);
    if (i.afterHorizon.kind === "scheduled") {sharesOf(i.afterHorizon.shares); i.afterHorizon.alternatives.forEach((a) => sharesOf(a.shares));}
    seasonalSettlement(input, periods, i);
    if (i.afterHorizon.kind === "scheduled" && [...i.afterHorizon.shares, ...i.afterHorizon.alternatives.flatMap((a) => a.shares)].some((s) => !ph.years.includes(s.year))) throw new Error(`capital_paths_after_horizon_outside_base:${i.id}`);
  }
  let statusQuo = 0;
  for (const p of input.paths) {
    if (!input.projectVariants.some((v) => v.id === p.projectVariantId)) throw new Error(`capital_paths_unknown_variant:${p.id}`);
    if (new Set(p.instrumentIds).size !== p.instrumentIds.length || p.instrumentIds.some((x) => !instruments.has(x))) throw new Error(`capital_paths_unknown_instrument:${p.id}`);
    const carried = p.instrumentIds.map((x) => instruments.get(x)!);
    // Every existing contract stays in the path, as itself or as its amendment; never both, never neither.
    for (const e of input.instruments.filter((i) => i.role === "existing")) {
      const count = carried.filter((i) => i.id === e.id || i.replaces === e.id).length;
      if (count !== 1) throw new Error(`capital_paths_existing_debt_omitted:${p.id}:${e.id}`);
    }
    for (const x of p.prepayments) if (!p.instrumentIds.includes(x.instrumentId) || !periodIds.has(x.periodEnd) || !instruments.get(x.instrumentId)!.prepayment) throw new Error(`capital_paths_prepayment_terms_required:${p.id}`);
    if (new Set(p.prepayments.map((x) => x.instrumentId)).size !== p.prepayments.length) throw new Error(`capital_paths_prepayment_twice:${p.id}`);
    for (const c of p.charges) if (!p.instrumentIds.includes(c.instrumentId) || !periodIds.has(c.periodEnd)) throw new Error(`capital_paths_charge_off_path:${p.id}`);
    if (p.role === "status_quo") statusQuo++;
  }
  if (statusQuo !== 1) throw new Error("capital_paths_one_status_quo_required");
  if (input.basket) {
    const holder = instruments.get(input.basket.holderId);
    if (!holder || holder.role !== "existing") throw new Error("capital_paths_basket_holder_unknown");
    // The occupied basket can never be read below the existing security that sits in it.
    const inBasket = sum(input.instruments.filter((i) => i.role === "existing" && i.security.countsAgainstBasket).map((i) => i.security.amount));
    if (new D(input.basket.occupied).lt(inBasket)) throw new Error("capital_paths_basket_usage_understated");
  }
  const cov = input.covenant;
  for (const m of [...cov.indenture.measurementPeriodEnds, ...(cov.policy?.measurementPeriodEnds ?? [])]) if (!periodIds.has(m)) throw new Error("capital_paths_covenant_date_off_calendar");
  if (!periodIds.has(input.stress.fromPeriodEnd)) throw new Error("capital_paths_stress_date_off_calendar");
  if (input.plan.soundingBy > input.plan.routeDecisionBy) throw new Error("capital_paths_plan_dates_out_of_order");
  if (!new D(input.demandQuantum).gt(0)) throw new Error("capital_paths_demand_quantum_positive");
  return {input, periods, instruments};
}

/** The structural checks of the kernel without running it: terms, calendar, paths and limits. */
export function checkCapitalStructurePathsInput(raw: unknown) {validate(capitalStructurePathsInputSchema.parse(raw));}

type Operating = {ebitda: Decimal[]; depreciation: Decimal[]; lease: Decimal[]; workingCapital: Decimal[]; maintenance: Decimal[]; growth: Decimal[]; startup: Decimal[]};
function operatingFor(ctx: Context, variantId: string, scenario: {stress: boolean; sensitivity: CapitalStructurePathsInput["sensitivities"][number] | null}): Operating {
  const {input, periods} = ctx, o = input.operating, v = input.projectVariants.find((x) => x.id === variantId)!.effects, s = scenario.sensitivity;
  const from = periods.findIndex((p) => p.id === input.stress.fromPeriodEnd);
  return {
    ebitda: periods.map((_, i) => {
      const base = new D(o.ebitda[i]!).plus(v ? v.ebitda[i]! : 0).plus(s ? s.ebitdaDelta[i]! : 0);
      // The stress scales the whole period EBITDA, project included, from its first period on.
      return new D(eight(scenario.stress && i >= from ? base.times(input.stress.ebitdaFactor) : base));
    }),
    depreciation: periods.map((_, i) => new D(o.depreciation[i]!).plus(v ? v.depreciation[i]! : 0)),
    lease: periods.map((_, i) => new D(o.leasePayments[i]!)),
    workingCapital: periods.map((_, i) => new D(o.workingCapitalCashFlow[i]!).plus(v ? v.startupWorkingCapitalCashFlow[i]! : 0).plus(s ? s.workingCapitalDelta[i]! : 0)),
    maintenance: periods.map((_, i) => new D(o.maintenanceCapex[i]!).plus(v ? v.maintenanceCapex[i]! : 0)),
    growth: periods.map((_, i) => new D(v ? v.growthCapex[i]! : 0)),
    startup: periods.map((_, i) => new D(v ? v.startupWorkingCapitalCashFlow[i]! : 0)),
  };
}

/** Remaining scheduled principal after a period, in the horizon and after it, with the year fraction to each payment. */
function remainingSchedule(ctx: Context, i: Instrument, from: number, residualBeforeAfterHorizon: Decimal) {
  const out: {amount: Decimal; years: Decimal}[] = [];
  let t = new D(0);
  ctx.periods.forEach((p, k) => {if (k > from) {t = t.plus(p.yearFraction); if (new D(i.principal[k]!).gt(0)) out.push({amount: new D(i.principal[k]!), years: t});}});
  if (i.afterHorizon.kind === "scheduled" && residualBeforeAfterHorizon.gt(0)) {
    const horizonYear = Number(ctx.input.periodEnds.at(-1)!.slice(0, 4));
    for (const s of splitResidual(residualBeforeAfterHorizon, i.afterHorizon.shares)) out.push({amount: s.amount, years: t.plus(s.year - horizonYear)});
  }
  return out;
}

type Built = {dated: DatedDebtInstrument; charges: FinancingCharge[]; scale: Decimal; prepaid: {periodIndex: number; amount: Decimal; premium: Decimal} | null};
/** One instrument on the company calendar, for one path: per-period effective rates, draws and principal,
 * the prepayment the path decides with its contractual premium, and every charge as a dated cash payment. */
function buildInstrument(ctx: Context, i: Instrument, path: Path, scale: Decimal, spreadOverride: string | null): Built {
  const {input, periods} = ctx;
  const draws = periods.map((_, k) => new D(eight(new D(i.draws[k]!).times(scale))));
  const scheduled = periods.map((_, k) => new D(eight(new D(i.principal[k]!).times(scale))));
  const prepayment = path.prepayments.find((x) => x.instrumentId === i.id);
  const at = prepayment ? periods.findIndex((p) => p.id === prepayment.periodEnd) : -1;
  let balance = new D(i.openingPrincipal);
  const holder: {prepaid: Built["prepaid"]} = {prepaid: null};
  const rows = periods.map((p, k) => {
    const opening = balance.plus(draws[k]!);
    const own = k > at && at >= 0 ? new D(0) : scheduled[k]!;
    if (own.gt(opening)) throw new Error(`capital_paths_principal_exceeds_balance:${i.id}`);
    let pre = new D(0);
    if (k === at) {
      pre = opening.minus(own);
      const residual = sum(scheduled.slice(k + 1)).gt(0) || i.afterHorizon.kind === "scheduled" ? pre.minus(sum(scheduled.slice(k + 1))) : new D(0);
      const terms = i.prepayment!;
      const premium = terms.basis === "flat" ? pre.times(terms.rate)
        : sum(remainingSchedule(ctx, i, k, residual).map((r) => r.amount.times(r.years))).times(terms.rate);
      holder.prepaid = {periodIndex: k, amount: pre, premium};
    }
    balance = opening.minus(own).minus(pre);
    const annual = spreadOverride !== null && i.rate.kind === "index_plus_spread" ? composed(input.index.annualByPeriod[k]!, spreadOverride) : annualRateAt(input, i, k);
    const pays = i.couponTreatment === "accrued_until_paid"
      ? {paysAccruedCoupon: p.endDate.slice(5, 7) === "06" || p.endDate.slice(5, 7) === "12" || k === at || (balance.eq(0) && opening.gt(0))} : {};
    return {period: p.id, startDate: p.startDate, endDate: p.endDate, indexationRate: "0",
      couponRate: periodRate(annual, p.yearFraction).toDecimalPlaces(16, Decimal.ROUND_HALF_UP).toFixed(),
      drawdown: eight(draws[k]!), scheduledPrincipal: eight(own), prepayment: eight(pre), repayAll: false, ...pays};
  });
  const charge = (id: string, periodEnd: string, category: FinancingCharge["category"], amount: Decimal): FinancingCharge => ({id: `${i.id}:${id}`, economicId: `${i.id}:${id}`,
    instrumentId: i.id, category, period: periodEnd, date: periodEnd, amount: eight(amount), treatment: "cash_paid", account: "available"});
  const charges = [...i.charges.map((c) => charge(c.id, c.periodEnd, c.category, new D(c.amount).times(scale))),
    ...path.charges.filter((c) => c.instrumentId === i.id).map((c) => charge(`path-${c.id}`, c.periodEnd, c.category, new D(c.amount))),
    ...(holder.prepaid && holder.prepaid.premium.gt(0) ? [charge("prepayment-premium", periods[holder.prepaid.periodIndex]!.id, "other", holder.prepaid.premium)] : [])]
    // A charge scaled to nothing with the amount is no charge at all.
    .filter((c) => new D(c.amount).gt(0));
  return {dated: {instrumentId: i.id, currency: input.currency, openingPrincipal: i.openingPrincipal, indexer: i.rate.kind === "fixed" ? "fixed" : "CDI",
    indexationTreatment: "not_applicable", couponTreatment: i.couponTreatment, couponBase: i.couponBase, drawdownAccount: "available", paymentAccount: "available", periods: rows},
    charges, scale, prepaid: holder.prepaid};
}

type Variation = {stress: boolean; sensitivity: CapitalStructurePathsInput["sensitivities"][number] | null; minimumCash: Decimal;
  scaled: {instrumentId: string; scale: Decimal} | null; spreadOverride: {instrumentId: string; spread: string} | null};

/** The path on the company calendar: debt and charges through the published financing kernel, taxes
 * recomputed from the interest and charges this path brings, cash through the published period-cash
 * kernel, the defined ratio on each measurement date and the indenture basket over the periods. */
function evaluatePath(ctx: Context, path: Path, v: Variation) {
  const {input, periods} = ctx;
  const op = operatingFor(ctx, path.projectVariantId, v);
  const carried = path.instrumentIds.map((x) => ctx.instruments.get(x)!);
  const built = carried.map((i) => buildInstrument(ctx, i, path, v.scaled?.instrumentId === i.id ? v.scaled.scale : new D(1), v.spreadOverride?.instrumentId === i.id ? v.spreadOverride.spread : null));
  const charges = built.flatMap((b) => b.charges);
  const assessments: FinancingCostAssessment[] = carried.flatMap((i) => financingCostCategories.map((category) => charges.some((c) => c.instrumentId === i.id && c.category === category)
    ? {instrumentId: i.id, category, status: "specified" as const, reason: "Adopted charge in the terms of the instrument or of the path"}
    : {instrumentId: i.id, category, status: "zero" as const, reason: "No charge of this category in the adopted terms"}));
  const financingInput = {debt: {openingDate: input.openingDate, endDate: input.periodEnds.at(-1)!, currency: input.currency, convention: "draw_at_period_start_pay_at_period_end" as const,
    instruments: built.map((b) => b.dated)}, assessments, charges, drawConvention: "gross_cash_before_withholding" as const};
  const financing = buildFinancingCashFlows(financingInput);
  if (financing.status !== "calculated") throw new Error("capital_paths_financing_incomplete");
  const rowsOf = (k: number) => financing.debt.map((x) => ({instrumentId: x.instrumentId, row: x.rows[k]!}));
  const flows = periods.map((p, k) => {
    const rows = rowsOf(k), inPeriod = charges.filter((c) => c.period === p.id);
    return {interestAccrued: sum(rows.map((r) => r.row.interestAndIndexationAccrued)), interestPaid: sum(rows.map((r) => r.row.couponPaid)),
      scheduledPrincipal: sum(rows.map((r) => r.row.scheduledPrincipal)), prepayment: sum(rows.map((r) => r.row.prepayment)), draws: sum(rows.map((r) => r.row.drawdown)),
      charges: sum(inPeriod.map((c) => c.amount))};
  });
  const taxes = calculatePeriodFinancingTaxes({rate: input.tax.rate, lossTreatment: input.tax.lossTreatment, periods: periods.map((p, k) => ({period: p.id,
    ebitda: fmt(op.ebitda[k]!), depreciationAndAmortization: fmt(op.depreciation[k]!), leasePayments: fmt(op.lease[k]!),
    financeExpense: fmt(flows[k]!.interestAccrued), financingCharges: fmt(flows[k]!.charges)}))});
  let wc = new D(0);
  const operating = {currency: input.currency, openingDate: input.openingDate, endDate: input.periodEnds.at(-1)!, openingWorkingCapital: zeroWc(),
    convention: "accrual_ebitda_to_cash_before_financing" as const,
    periods: periods.map((p, k) => {
      wc = wc.minus(op.workingCapital[k]!);
      return {id: p.id, startDate: p.startDate, endDate: p.endDate,
        // Lease payments are paid outside IFRS 16 EBITDA; carried as a fixed operating payment.
        revenue: {mode: "amount" as const, amount: eight(op.ebitda[k]!)}, variableOperatingExpense: "0", fixedOperatingExpense: eight(op.lease[k]!), nonCashEbitdaAdjustment: "0",
        closingWorkingCapital: {...zeroWc(), receivables: eight(D.max(wc, 0)), payables: eight(D.max(wc.neg(), 0))},
        cashTaxesPaid: eight(new D(taxes.rows[k]!.cashTax)), cashTaxRefunds: "0", maintenanceCapexPaid: eight(op.maintenance[k]!), growthCapexPaid: eight(op.growth[k]!)};
    })};
  const cash = buildCapitalPeriodCash({capitalMovements: [], capitalMovementInventory: {status: "declared_complete", reason: "No capital movements in the adopted paths"},
    operating, financing: {status: "provided", input: financingInput}, openingAvailable: input.openingAvailable, openingRestricted: "0", operatingCashAccount: "available"});
  if (cash.status !== "calculated") throw new Error("capital_paths_cash_incomplete");
  const rows = periods.map((p, k) => {
    const c = cash.rows[k]!, f = flows[k]!;
    const available = new D(c.cashBeforeFinancing).plus(op.growth[k]!).minus(op.startup[k]!);
    return {periodId: p.id, ebitda: fmt(op.ebitda[k]!), cashTax: taxes.rows[k]!.cashTax, cashBeforeFinancing: c.cashBeforeFinancing, availableForService: fmt(available),
      draws: fmt(f.draws), interestAccrued: fmt(f.interestAccrued), interestPaid: fmt(f.interestPaid), scheduledPrincipal: fmt(f.scheduledPrincipal), prepayment: fmt(f.prepayment),
      charges: fmt(f.charges), closingAvailable: c.closingAvailable, closingDebt: c.closingDebt};
  });
  return {op, built, financing, rows, taxes};
}

type Evaluated = ReturnType<typeof evaluatePath>;
function covenantRows(ctx: Context, e: Evaluated, limit: {limit: string; comparator: "lte" | "lt"; measurementPeriodEnds: string[]}) {
  const {input, periods} = ctx, h = input.covenant.history;
  const series = [...h.map((x) => ({months: x.months})), ...periods.map((p) => ({months: p.months}))];
  const projected = e.rows.map((r, k) => ({period: r.periodId, ebitda: r.ebitda, leasePayments: fmt(e.op.lease[k]!), closingDebt: r.closingDebt, closingAvailableCash: r.closingAvailable}));
  return limit.measurementPeriodEnds.map((m) => {
    // The window is the trailing twelve months; a history period may span more than one quarter.
    let at = h.length + periods.findIndex((p) => p.id === m), months = 0, count = 0;
    while (at >= 0 && months < 12) {months += series[at]!.months; count++; at--;}
    if (months !== 12) throw new Error("capital_paths_covenant_window_incomplete");
    const result = projectLeverageCovenant(projected, {leaseLiabilityInDebt: false, leaseLiability: "0", ebitdaExcludesLeases: input.covenant.ebitdaExcludesLeases,
      trailingPeriods: count, history: h.map((x) => ({period: x.id, ebitda: x.ebitda, leasePayments: x.leasePayments})), measurementPeriods: [m], limit: limit.limit, comparator: limit.comparator});
    const row = result.rows[0]!;
    return {periodId: m, netDebt: fmt(new D(row.netDebt)), trailingEbitda: fmt(new D(row.trailingEbitda)), ratio: fmt(new D(row.ratio)), headroom: fmt(new D(row.headroom)), complies: row.complies};
  });
}

/** Aggregate (or per-operation) use of the indenture basket in every period the basket holder is outstanding. */
function basketUse(ctx: Context, e: Evaluated, path: Path) {
  const b = ctx.input.basket;
  if (!b) return null;
  const holder = e.financing.debt.find((x) => x.instrumentId === b.holderId || ctx.instruments.get(x.instrumentId)!.replaces === b.holderId);
  const existingIn = sum(ctx.input.instruments.filter((i) => i.role === "existing" && i.security.countsAgainstBasket).map((i) => i.security.amount));
  const others = new D(b.occupied).minus(existingIn);
  let peak = new D(0), peakPeriod: string | null = null;
  const rows = ctx.periods.map((p, k) => {
    const live = (instrumentId: string) => {const r = e.financing.debt.find((x) => x.instrumentId === instrumentId)!.rows[k]!; return new D(r.openingPrincipal).plus(r.drawdown).gt(0);};
    const applies = holder !== undefined && live(holder.instrumentId);
    const users = path.instrumentIds.map((x) => ctx.instruments.get(x)!).filter((i) => i.security.countsAgainstBasket && live(i.id));
    const amounts = users.map((i) => new D(i.security.amount).times(e.built.find((x) => x.dated.instrumentId === i.id)!.scale));
    const used = !applies ? new D(0) : b.basis === "aggregate" ? others.plus(sum(amounts)) : D.max(0, ...amounts);
    if (applies && used.gt(peak)) {peak = used; peakPeriod = p.id;}
    return {periodId: p.id, applies, used: fmt(used), instrumentIds: applies ? users.map((i) => i.id) : []};
  });
  const excess = D.max(peak.minus(b.limit), 0);
  return {holderId: b.holderId, basis: b.basis, limit: fmt(new D(b.limit)), occupiedAtOpening: fmt(new D(b.occupied)), peak: fmt(peak), peakPeriodId: peakPeriod,
    excess: fmt(excess), consentRequired: excess.gt(0), rows};
}

/** The post-horizon amortization test, on the debt-capacity kernel of the published capacity method:
 * the principal still due after the horizon, against cash available after interest in each year. */
function amortizationTest(ctx: Context, e: Evaluated, unit: Instrument, unitShares: {year: number; share: Decimal}[], fixed: {instrument: Instrument; residual: Decimal}[], unitResidual: Decimal) {
  const {input} = ctx, ph = input.postHorizon, years = ph.years;
  const fixedRows = years.map((y) => {
    let interest = new D(0), principal = new D(0), closing = new D(0);
    for (const f of fixed) {
      const s = splitResidual(f.residual, (f.instrument.afterHorizon as {shares: {year: number; share: string}[]}).shares);
      const paidBefore = sum(s.filter((x) => x.year < y).map((x) => x.amount));
      const paidNow = sum(s.filter((x) => x.year === y).map((x) => x.amount));
      const open = f.residual.minus(paidBefore), close = open.minus(paidNow);
      // Annual average-balance approximation, the convention the capacity method adopts.
      interest = interest.plus(open.plus(close).div(2).times(annualRateAfter(input, f.instrument, y)));
      principal = principal.plus(paidNow); closing = closing.plus(close);
    }
    return {interest, principal, closing};
  });
  const last = [...unitShares].reverse().find((s) => s.share.gt(0))!.year;
  const capacity: DebtCapacityInput = {currency: input.currency, moneyUnit: "adopted", openingDate: input.periodEnds.at(-1)!, endDate: `${years.at(-1)}-12-31`,
    maximumAmount: fmt(unitResidual), monetaryQuantum: "0.00000001",
    horizon: {mode: "calibration_window", newDebtFinalPaymentDate: `${last}-12-31`, existingDebtFinalPaymentDates: [], sourceAnchor: "post-horizon amortization test"},
    scenarios: [{id: "base", sourceAnchor: "post-horizon annual base", openingAvailableCash: e.rows.at(-1)!.closingAvailable, cashNetting: "signed_available",
      includeNewAccruedInterestInDebt: false,
      rules: [{id: "minimum-cash", sourceAnchor: "minimum cash of policy", kind: "minimum_available_cash", threshold: input.minimumCash, measurement: "all_period_ends"}],
      periods: years.map((y, k) => {
        const r = annualRateAfter(input, unit, y), fx = fixedRows[k]!, share = unitShares.find((s) => s.year === y)?.share ?? new D(0);
        const affine = (v: Decimal.Value) => ({fixed: fmt(new D(v)), perUnitNewDebt: "0"});
        return {id: String(y), startDate: `${y}-01-01`, endDate: `${y}-12-31`, sourceAnchor: "post-horizon annual base",
          ebitda: affine(ph.ebitda[k]!), covenantEbitdaAdjustment: affine(new D(ph.leasePayments[k]!).neg()), nonCashEbitdaBridge: affine(0),
          cashLeasePayments: affine(ph.leasePayments[k]!), changeInWorkingCapital: affine(ph.workingCapitalInvestment[k]!), maintenanceCapex: affine(ph.maintenanceCapex[k]!), growthCapex: affine(0),
          taxableBaseBeforeNewDebtInterest: affine(new D(ph.ebitda[k]!).minus(ph.depreciation[k]!).minus(ph.leasePayments[k]!).minus(ph.otherInterest[k]!).minus(fx.interest)),
          cashTaxRate: input.tax.rate, lossTaxTreatment: "no_cash_benefit", newDebtTaxDeduction: "paid_interest", cfadsGrowthCapexTreatment: "exclude_growth_capex",
          cfadsDefinitionAnchor: "operating cash before growth investment", existingCashInterest: fmt(new D(ph.otherInterest[k]!).plus(fx.interest)),
          existingCashPrincipalPaid: fmt(fx.principal), otherExistingFinancingCashAvailable: affine(0), capitalCashAvailable: affine(0), existingDebtForRatio: fmt(fx.closing),
          // The principal outstanding at the horizon enters the first year as a start-of-year draw that
          // brings no cash (fully withheld): the kernel then carries its interest and amortization only.
          newFinancing: {drawAtStart: k === 0 ? "1" : "0", drawAtEnd: "0", principalPaidAtEnd: fmt(share),
            interestFactorOnOpeningAndStartDraw: fmt(r), interestFactorOnEndDraw: "0", interestFactorCreditOnEndAmortization: fmt(r.div(2)),
            factorConvention: "adopted_annual_average_balance_approximation", paysAccruedInterest: true, unpaidInterestBase: "principal_only",
            withheldCostPerUnitDraw: k === 0 ? "1" : "0", sourceAnchor: "post-horizon amortization profile"}};
      })}],
    definition: "maximum_monetary_quantum_amount_under_all_adopted_scenario_period_constraints"};
  const projected = projectDebtCapacityAmount(capacity, fmt(unitResidual));
  const rows = projected.financialRows[0]!.rows.map((r) => {
    const scheduled = new D(r.cashDebtService).minus(r.cashInterest), available = new D(r.cfads).minus(r.cashInterest);
    return {year: Number(r.periodId), scheduledAmortization: fmt(scheduled), availableAfterInterest: fmt(available), interest: r.cashInterest, closingAvailable: r.closingAvailableCash,
      shortfall: fmt(D.max(scheduled.minus(available), 0)), covered: available.gte(scheduled)};
  });
  return {years: rows, passes: rows.every((r) => r.covered), firstShortfallYear: rows.find((r) => !r.covered)?.year ?? null};
}

/** Every residual a path takes out of the long-debt test as seasonal is paid by working capital the base
 * shows, once: per draw period, the whole residual of its lines is within the seasonal consumption of that
 * period, and each period's release one year earlier is allocated to one line only (lines in draw order). */
function seasonalSourcesForPath(ctx: Context, path: Path, seasonal: {instrument: Instrument; residual: Decimal}[]) {
  const wc = ctx.input.operating.workingCapitalCashFlow.map((x) => new D(x));
  const releases = wc.map((x) => D.max(x, 0)), byPeriod = new Map<number, Decimal>();
  const lines = seasonal.map((r) => ({...r, s: seasonalSettlement(ctx.input, ctx.periods, r.instrument)!}))
    .sort((a, b) => a.s.drawPeriodIndex - b.s.drawPeriodIndex || a.instrument.id.localeCompare(b.instrument.id));
  for (const l of lines) {
    const used = (byPeriod.get(l.s.drawPeriodIndex) ?? new D(0)).plus(l.residual);
    if (used.gt(wc[l.s.drawPeriodIndex]!.neg())) throw new Error(`capital_paths_seasonal_release_unverified:${path.id}:residual_above_seasonal_consumption`);
    byPeriod.set(l.s.drawPeriodIndex, used);
    let need = l.residual;
    for (const n of l.s.releaseWindow) {const take = D.min(need, releases[n]!); releases[n] = releases[n]!.minus(take); need = need.minus(take);}
    if (need.gt(0)) throw new Error(`capital_paths_seasonal_release_unverified:${path.id}:release_already_used_or_short`);
  }
}

function afterHorizon(ctx: Context, e: Evaluated, path: Path) {
  const residuals = e.financing.debt.map((x) => ({instrument: ctx.instruments.get(x.instrumentId)!, residual: new D(x.closingPrincipal)})).filter((x) => x.residual.gt(0));
  const listed = residuals.map((r) => {const a = r.instrument.afterHorizon, settled = seasonalSettlement(ctx.input, ctx.periods, r.instrument);
    return {instrumentId: r.instrument.id, residual: fmt(r.residual), kind: a.kind, settlementDate: settled?.settlementDate ?? null,
      justification: a.kind === "seasonal_release" ? a.justification : a.kind === "not_tested" ? a.reason : null};});
  for (const r of residuals) if (r.instrument.afterHorizon.kind === "none") throw new Error(`capital_paths_residual_without_after_horizon_terms:${path.id}:${r.instrument.id}`);
  seasonalSourcesForPath(ctx, path, residuals.filter((r) => r.instrument.afterHorizon.kind === "seasonal_release"));
  const scheduled = residuals.filter((r) => r.instrument.afterHorizon.kind === "scheduled");
  const untested = residuals.filter((r) => r.instrument.afterHorizon.kind === "not_tested").map((r) => r.instrument.id);
  if (!scheduled.length) return {residuals: listed, untested, unitInstrumentId: null, tests: [], status: (untested.length ? "not_tested" : "pass") as GateStatus};
  // The test carries the largest residual (new debt first) through the kernel; the rest is fixed service.
  const unit = [...scheduled].sort((a, b) => (a.instrument.role === "existing" ? 1 : 0) - (b.instrument.role === "existing" ? 1 : 0) || b.residual.cmp(a.residual) || a.instrument.id.localeCompare(b.instrument.id))[0]!;
  const fixed = scheduled.filter((r) => r !== unit);
  const terms = unit.instrument.afterHorizon as Extract<Instrument["afterHorizon"], {kind: "scheduled"}>;
  const profiles = [{id: "adopted", label: "Perfil adotado", shares: terms.shares}, ...terms.alternatives];
  const tests = profiles.map((p) => ({instrumentId: unit.instrument.id, profileId: p.id, label: p.label, residual: fmt(unit.residual),
    ...amortizationTest(ctx, e, unit.instrument, sharesOf(p.shares), fixed, unit.residual)}));
  const adopted = tests[0]!;
  return {residuals: listed, untested, unitInstrumentId: unit.instrument.id, tests,
    status: (!adopted.passes ? "fail" : untested.length ? "not_tested" : "pass") as GateStatus};
}

function yearOf(id: string) {return Number(id.slice(0, 4));}
/** EBITDA of each calendar year the horizon covers, with the number of periods it sums. */
function ebitdaByYear(rows: {periodId: string; ebitda: string}[]) {
  return [...new Set(rows.map((r) => yearOf(r.periodId)))].map((y) => {const r = rows.filter((x) => yearOf(x.periodId) === y); return {year: y, periods: r.length, ebitda: fmt(sum(r.map((x) => x.ebitda)))};});
}
function byYear(rows: Evaluated["rows"]) {
  const years = [...new Set(rows.map((r) => yearOf(r.periodId)))];
  return years.map((y) => {
    const r = rows.filter((x) => yearOf(x.periodId) === y);
    const interestPaid = sum(r.map((x) => x.interestPaid)), scheduled = sum(r.map((x) => x.scheduledPrincipal)), prepayment = sum(r.map((x) => x.prepayment));
    const available = sum(r.map((x) => x.availableForService)), service = interestPaid.plus(scheduled).plus(prepayment);
    return {year: y, periods: r.length, interestPaid: fmt(interestPaid), scheduledPrincipal: fmt(scheduled), prepayment: fmt(prepayment), principal: fmt(scheduled.plus(prepayment)),
      service: fmt(service), serviceExcludingPrepayment: fmt(interestPaid.plus(scheduled)), availableForService: fmt(available),
      shortfallBeforePrepayment: fmt(D.max(interestPaid.plus(scheduled).minus(available), 0)), charges: fmt(sum(r.map((x) => x.charges)))};
  });
}

/** Everything one path produces under one variation, with its gates. */
function runPath(ctx: Context, path: Path, v: Omit<Variation, "stress">) {
  const base = evaluatePath(ctx, path, {...v, stress: false});
  const stress = evaluatePath(ctx, path, {...v, stress: true});
  const cov = ctx.input.covenant;
  const indenture = {base: covenantRows(ctx, base, cov.indenture), stress: covenantRows(ctx, stress, cov.indenture)};
  const policy = cov.policy ? {base: covenantRows(ctx, base, cov.policy), stress: covenantRows(ctx, stress, cov.policy)} : null;
  const basket = basketUse(ctx, base, path);
  const after = afterHorizon(ctx, base, path);
  const low = (rows: Evaluated["rows"]) => rows.reduce((m, r) => (new D(r.closingAvailable).lt(m.closingAvailable) ? r : m));
  const minBase = low(base.rows), minStress = low(stress.rows);
  const below = base.rows.filter((r) => new D(r.closingAvailable).lt(v.minimumCash)).map((r) => r.periodId);
  const gates: {id: CapitalPathGateId; status: GateStatus}[] = [
    {id: "minimum_cash_base", status: new D(minBase.closingAvailable).gte(v.minimumCash) ? "pass" : "fail"},
    {id: "cash_nonnegative_stress", status: new D(minStress.closingAvailable).gte(0) ? "pass" : "fail"},
    {id: "indenture_base", status: indenture.base.every((r) => r.complies) ? "pass" : "fail"},
    {id: "indenture_stress", status: indenture.stress.every((r) => r.complies) ? "pass" : "fail"},
    {id: "policy_base", status: !policy || policy.base.every((r) => r.complies) ? "pass" : "fail"},
    {id: "policy_stress", status: !policy || policy.stress.every((r) => r.complies) ? "pass" : "fail"},
    {id: "basket_without_consent", status: basket?.consentRequired ? "fail" : "pass"},
    {id: "amortization_after_horizon", status: after.status},
  ];
  const last = base.rows.at(-1)!, lastStress = stress.rows.at(-1)!;
  return {base, stress, indenture, policy, basket, after, gates, minBase, minStress, below,
    summary: {minimumCash: {periodId: minBase.periodId, amount: minBase.closingAvailable}, shortfallVsPolicyMinimum: fmt(D.max(new D(v.minimumCash).minus(minBase.closingAvailable), 0)),
      horizonFinancingCost: fmt(sum(base.rows.map((r) => new D(r.interestPaid).plus(r.charges)))), netDebtAtHorizon: fmt(new D(last.closingDebt).minus(last.closingAvailable)),
      stressNetDebtAtHorizon: fmt(new D(lastStress.closingDebt).minus(lastStress.closingAvailable))}};
}
type Run = ReturnType<typeof runPath>;

const failures = (r: Run) => r.gates.filter((g) => g.status !== "pass").length;
/** The declared order: paths inside every gate first, by financing cost to the horizon, then net debt at
 * the horizon; then the others by how many gates they miss, then the same cost and net debt. */
function rank(paths: Path[], runs: Map<string, Run>) {
  return [...paths].sort((a, b) => {
    const x = runs.get(a.id)!, y = runs.get(b.id)!;
    return failures(x) - failures(y) || new D(x.summary.horizonFinancingCost).cmp(y.summary.horizonFinancingCost)
      || new D(x.summary.netDebtAtHorizon).cmp(y.summary.netDebtAtHorizon) || a.id.localeCompare(b.id);
  });
}

/** The long new money of a path: the new or amended instrument with the largest principal still due
 * after the horizon on an adopted schedule. */
function longInstrument(ctx: Context, run: Run) {
  const t = run.after.tests[0];
  if (!t) return null;
  const i = ctx.instruments.get(t.instrumentId)!;
  return i.role === "existing" ? null : i;
}

/** Amount, draw period and amortization window of a path's long money, from its adopted terms. */
function longTerms(ctx: Context, i: Instrument) {
  const draws = i.draws.map((x, k) => ({x, k})).filter((d) => new D(d.x).gt(0));
  const horizonYears = ctx.periods.filter((_, k) => new D(i.principal[k]!).gt(0)).map((p) => yearOf(p.id));
  const after = i.afterHorizon.kind === "scheduled" ? sharesOf(i.afterHorizon.shares).filter((s) => s.share.gt(0)).map((s) => s.year) : [];
  const years = [...horizonYears, ...after];
  return {instrumentId: i.id, amount: fmt(sum(i.draws)), drawPeriodId: draws.length ? ctx.periods[draws[0]!.k]!.id : null,
    firstAmortizationYear: years.length ? Math.min(...years) : null, lastAmortizationYear: years.length ? Math.max(...years) : null};
}

function selection(ctx: Context, runs: Map<string, Run>) {
  const candidates = ctx.input.paths.filter((p) => p.role !== "companion");
  const ranking = rank(ctx.input.paths, runs);
  const ordered = ranking.filter((p) => p.role !== "companion");
  const recommended = ordered.find((p) => failures(runs.get(p.id)!) === 0) ?? null;
  const long = recommended ? longInstrument(ctx, runs.get(recommended.id)!) : null;
  // The dated fallback: the best path, companions included, whose long money comes from another kind of lender.
  const alternative = recommended && long ? ranking.find((p) => {
    if (p.id === recommended.id) return false;
    const other = longInstrument(ctx, runs.get(p.id)!);
    return other !== null && other.lenderKind !== long.lenderKind;
  }) ?? null : null;
  return {candidates, ranking, recommended, long, alternative};
}

/** The equivalent cost of new DI-plus-spread debt over its life, on the flows of the same indexed-debt kernel
 * that the cash calculation uses: draw at the start of its period, the instrument's own coupon base and
 * coupon treatment, principal in the horizon as adopted and after it split by the adopted shares (or paid on
 * the verified settlement of a seasonal line), every charge on its period end as cash. */
function instrumentCost(ctx: Context, i: Instrument, spreadOverride: string | null, sharesOverride: {year: number; share: string}[] | null) {
  const {input, periods} = ctx;
  if (i.role !== "new" || i.rate.kind !== "index_plus_spread") return {status: "not_applicable" as const, reason: "Instrument is not new DI-plus-spread debt"};
  const drawAt = i.draws.map((x, k) => ({x, k})).filter((d) => new D(d.x).gt(0));
  if (drawAt.length !== 1) return {status: "not_applicable" as const, reason: "Equivalent cost needs a single draw"};
  const k0 = drawAt[0]!.k, spreads = i.rate.spreads.slice(k0);
  if (spreadOverride === null && spreads.some((s) => !new D(s).eq(spreads[0]!))) return {status: "not_applicable" as const, reason: "Spread changes over the life"};
  const spread = spreadOverride ?? spreads[0]!;
  if (i.charges.some((c) => periods.findIndex((p) => p.id === c.periodEnd) < k0)) return {status: "not_applicable" as const, reason: "Charge before the draw"};
  const gross = new D(i.draws[k0]!), residual = gross.minus(sum(i.principal.slice(k0)));
  const a = i.afterHorizon, horizonYear = Number(input.periodEnds.at(-1)!.slice(0, 4));
  const after = new Map<string, Decimal>();
  if (residual.gt(0)) {
    if (a.kind === "scheduled") for (const x of splitResidual(residual, sharesOverride ?? a.shares)) after.set(`${x.year}-12-31`, x.amount);
    else if (a.kind === "seasonal_release") after.set(seasonalSettlement(input, periods, i)!.settlementDate, residual);
    else return {status: "not_applicable" as const, reason: "No adopted repayment after the horizon"};
  }
  const lastDate = [...after.keys()].sort().at(-1) ?? null;
  const grid: {id: string; startDate: string; endDate: string; yearFraction: Decimal; index: string; principal: Decimal}[] = [];
  for (let k = k0; k < periods.length; k++) grid.push({id: periods[k]!.id, startDate: k === k0 ? dayBefore(periods[k]!.startDate) : periods[k - 1]!.endDate,
    endDate: periods[k]!.endDate, yearFraction: periods[k]!.yearFraction, index: input.index.annualByPeriod[k]!, principal: new D(i.principal[k]!)});
  if (lastDate) {
    if (periods.some((p) => p.months !== 3)) return {status: "not_applicable" as const, reason: "Life after the horizon needs quarterly periods"};
    for (let y = horizonYear + 1; `${y}-01-01` <= lastDate; y++) for (const end of ["03-31", "06-30", "09-30", "12-31"]) {
      const date = `${y}-${end}`;
      if (date > lastDate) break;
      grid.push({id: date, startDate: grid.at(-1)!.endDate, endDate: date, yearFraction: new D("0.25"), index: afterHorizonIndex(input, y), principal: after.get(date) ?? new D(0)});
    }
    if (sum([...after.values()]).minus(sum(grid.filter((g) => after.has(g.endDate)).map((g) => g.principal))).abs().gt(0)) return {status: "not_applicable" as const, reason: "Settlement off the quarterly grid"};
  }
  // The same kernel and rounding as the cash calculation: per-period rates on 16 decimals, amounts on 8.
  let open = new D(0);
  const kernelPeriods: IndexedDebtPeriodInput[] = grid.map((g, n) => {
    const draw = n === 0 ? gross : new D(0);
    open = open.plus(draw).minus(g.principal);
    const pays = i.couponTreatment === "accrued_until_paid"
      ? {paysAccruedCoupon: g.endDate.slice(5, 7) === "06" || g.endDate.slice(5, 7) === "12" || (open.eq(0) && g.principal.gt(0))} : {};
    return {period: g.id, indexationRate: "0", couponRate: periodRate(composed(g.index, spread), g.yearFraction).toDecimalPlaces(16, Decimal.ROUND_HALF_UP).toFixed(),
      drawdown: eight(draw), scheduledPrincipal: eight(g.principal), prepayment: "0", ...pays};
  });
  if (!open.eq(0)) return {status: "not_applicable" as const, reason: "Principal does not close on the last payment"};
  const schedule = buildIndexedDebtSchedule({instrumentId: i.id, openingPrincipal: "0", indexer: "CDI", indexationTreatment: "not_applicable",
    couponTreatment: i.couponTreatment, couponBase: i.couponBase, periods: kernelPeriods});
  const flows = schedule.rows.map((row) => {
    const charges = sum(i.charges.filter((c) => c.periodEnd === row.period).map((c) => c.amount));
    return {periodEnd: row.period, interestPaid: row.couponPaid, principal: row.scheduledPrincipal, charges: fmt(charges),
      debtService: fmt(new D(row.couponPaid).plus(row.scheduledPrincipal))};
  });
  // Every dated charge of the instrument enters the solved flows, also one paid after the last amortization.
  if (!sum(flows.map((f) => f.charges)).eq(sum(i.charges.map((c) => c.amount)))) return {status: "not_applicable" as const, reason: "A dated charge falls outside the priced life"};
  const final = [...flows].reverse().find((f) => new D(f.debtService).gt(0))!;
  const finalIndex = flows.map((f) => new D(f.debtService).gt(0) || new D(f.charges).gt(0)).lastIndexOf(true);
  const categories = new Set(i.charges.map((c) => c.category));
  const cost = solveEquivalentFinancingSpread({baseDate: grid[0]!.startDate, currency: input.currency, moneyUnit: "adopted",
    intervals: grid.slice(0, finalIndex + 1).map((g) => ({id: g.id, startDate: g.startDate, endDate: g.endDate, yearFraction: fmt(g.yearFraction), annualIndex: g.index,
      yearFractionConvention: "adopted_year_fraction" as const, sourceAnchor: "adopted period grid"})),
    netFlows: [{id: "draw", date: grid[0]!.startDate, amount: fmt(gross), sourceAnchor: "adopted draw"},
      ...flows.slice(0, finalIndex + 1).map((f) => ({id: f.periodEnd, date: f.periodEnd, amount: fmt(new D(f.debtService).plus(f.charges).neg()), sourceAnchor: "indexed debt kernel"}))],
    costInventory: financingCostCategories.map((category) => categories.has(category) ? {category, status: "specified" as const, reason: "Adopted charge of the instrument"}
      : {category, status: "zero" as const, reason: "No charge of this category in the adopted terms"}),
    convention: "multiplicative_index_and_spread_on_net_borrower_flows", lowerSpread: "-0.5", upperSpread: "2"});
  if (cost.status !== "calculated") return {status: "not_applicable" as const, reason: "Equivalent cost could not be solved"};
  let t = new D(0), weighted = new D(0);
  grid.slice(0, finalIndex + 1).forEach((g, n) => {t = t.plus(g.yearFraction); weighted = weighted.plus(new D(flows[n]!.principal).times(t));});
  return {status: "calculated" as const, nominalSpread: spread, couponBase: i.couponBase, couponTreatment: i.couponTreatment, equivalentSpread: cost.annualSpread!,
    upfrontCharges: fmt(sum(i.charges.map((c) => c.amount))), weightedAverageLifeYears: fmt(weighted.div(gross)), termYears: fmt(t), finalPaymentDate: final.periodEnd,
    flows: flows.slice(0, finalIndex + 1)};
}

/** Equivalent cost of one adopted new instrument, alone, on its adopted or alternative profile and at an
 * optional spread: the same calculation the evaluation publishes. */
export function capitalPathInstrumentCost(raw: unknown, instrumentId: string, options: {profileId?: string; spread?: string} = {}) {
  const input = capitalStructurePathsInputSchema.parse(raw), ctx = validate(input);
  const i = ctx.instruments.get(instrumentId);
  if (!i) throw new Error("capital_paths_unknown_instrument");
  const profile = options.profileId && i.afterHorizon.kind === "scheduled" ? i.afterHorizon.alternatives.find((x) => x.id === options.profileId) : null;
  if (options.profileId && !profile) throw new Error("capital_paths_unknown_profile");
  return instrumentCost(ctx, i, options.spread ?? null, profile ? profile.shares : null);
}

function publishRun(ctx: Context, path: Path, r: Run) {
  return {id: path.id, label: path.label, role: path.role, projectVariantId: path.projectVariantId, instrumentIds: [...path.instrumentIds],
    prepayments: r.base.built.filter((b) => b.prepaid).map((b) => ({instrumentId: b.dated.instrumentId, periodId: ctx.periods[b.prepaid!.periodIndex]!.id,
      amount: fmt(b.prepaid!.amount), premium: fmt(b.prepaid!.premium)})),
    closingAvailableByPeriod: r.base.rows,
    stressClosingAvailableByPeriod: r.stress.rows.map((x) => ({periodId: x.periodId, ebitda: x.ebitda, cashTax: x.cashTax, closingAvailable: x.closingAvailable, closingDebt: x.closingDebt})),
    minimumCash: r.summary.minimumCash, stressMinimumCash: {periodId: r.minStress.periodId, amount: r.minStress.closingAvailable},
    belowPolicyMinimum: r.below, shortfallVsPolicyMinimum: r.summary.shortfallVsPolicyMinimum,
    debtServiceByYear: byYear(r.base.rows), ebitdaByYear: ebitdaByYear(r.base.rows),
    taxesInHorizon: r.base.taxes.totalCashTax, horizonFinancingCost: r.summary.horizonFinancingCost,
    accruedInterestInHorizon: fmt(sum(r.base.rows.map((x) => x.interestAccrued))),
    netDebtAtHorizon: r.summary.netDebtAtHorizon, stressNetDebtAtHorizon: r.summary.stressNetDebtAtHorizon,
    closingDebtAtHorizon: r.base.rows.at(-1)!.closingDebt, closingCashAtHorizon: r.base.rows.at(-1)!.closingAvailable,
    indenture: r.indenture, policy: r.policy, basket: r.basket,
    afterHorizon: {residuals: r.after.residuals, untested: r.after.untested, unitInstrumentId: r.after.unitInstrumentId},
    amortizationTests: r.after.tests, gates: r.gates, eligible: failures(r) === 0};
}

/**
 * Capital structure paths for a decision: every adopted path on the same company and the same
 * calendar, each recomputed by the published kernels (dated debt with interest accrued until paid,
 * charges, taxes per path, period cash, the defined ratio, the indenture basket, the capacity
 * kernel for amortization after the horizon and the equivalent financing cost). The order and the
 * recommendation come from declared gates and keys, never from text: inside the minimum cash, the
 * indenture and the policy in the base and the stress, the basket without consent and the
 * amortization after the horizon; then cost to the horizon and net debt. It contacts no one.
 */
export function evaluateCapitalStructurePaths(raw: unknown) {
  const input = capitalStructurePathsInputSchema.parse(raw);
  const ctx = validate(input);
  const minimum = new D(input.minimumCash);
  const runAll = (sensitivity: Variation["sensitivity"]) => new Map(input.paths.map((p) => [p.id, runPath(ctx, p, {sensitivity,
    minimumCash: sensitivity?.minimumCash ? new D(sensitivity.minimumCash) : minimum, scaled: null, spreadOverride: null})]));
  const runs = runAll(null);
  const chosen = selection(ctx, runs);
  const ranking = chosen.ranking.map((p, n) => ({pathId: p.id, rank: n + 1, role: p.role, eligible: failures(runs.get(p.id)!) === 0,
    failedGates: runs.get(p.id)!.gates.filter((g) => g.status !== "pass").map((g) => ({id: g.id, status: g.status}))}));
  const costs = input.instruments.filter((i) => i.role === "new").map((i) => {
    const c = instrumentCost(ctx, i, null, null);
    const alternatives = i.afterHorizon.kind === "scheduled" ? i.afterHorizon.alternatives.map((a) => ({profileId: a.id, label: a.label, ...instrumentCost(ctx, i, null, a.shares)})) : [];
    return {instrumentId: i.id, lenderKind: i.lenderKind, ...c, alternatives};
  });
  let recommendation = null;
  if (chosen.recommended) {
    const path = chosen.recommended, long = chosen.long;
    const conditionRuns = long && long.lenderKind === "capital_markets" ? runPath(ctx, path, {sensitivity: null, minimumCash: minimum, scaled: null,
      spreadOverride: {instrumentId: long.id, spread: input.plan.maximumSpread}}) : null;
    // Smallest issue that keeps the path inside every gate, on the adopted quantum (bisection; more money never tightens a gate here).
    let demand = null;
    if (long) {
      const full = sum(long.draws), q = new D(input.demandQuantum);
      const passes = (amount: Decimal) => failures(runPath(ctx, path, {sensitivity: null, minimumCash: minimum, scaled: {instrumentId: long.id, scale: amount.div(full)}, spreadOverride: null})) === 0;
      let lo = new D(0), hi = full;
      if (passes(lo)) hi = lo;
      else while (hi.minus(lo).gt(q)) {
        const mid = lo.plus(hi).div(2).div(q).floor().times(q);
        if (mid.lte(lo)) break;
        if (passes(mid)) hi = mid; else lo = mid;
      }
      demand = {instrumentId: long.id, issueTarget: fmt(full), issueFloorInsideGates: fmt(hi), quantum: fmt(q)};
    }
    const routeDeadline = [...input.instruments].filter((i) => i.role === "existing" && i.finalPaymentDate !== null
      && runs.get(path.id)!.base.built.some((b) => b.dated.instrumentId === i.id && b.prepaid)).map((i) => ({instrumentId: i.id, date: i.finalPaymentDate!})).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
    recommendation = {pathId: path.id, longInstrumentId: long?.id ?? null, longInstrument: long ? longTerms(ctx, long) : null,
      condition: conditionRuns && long ? {instrumentId: long.id, maximumSpread: input.plan.maximumSpread, gates: conditionRuns.gates,
        insideGates: failures(conditionRuns) === 0, horizonFinancingCost: conditionRuns.summary.horizonFinancingCost, minimumCash: conditionRuns.summary.minimumCash,
        cost: instrumentCost(ctx, long, input.plan.maximumSpread, null)} : null,
      demand, soundingBy: input.plan.soundingBy, routeDecisionBy: input.plan.routeDecisionBy,
      mustPrecede: routeDeadline, decidedBeforeMaturity: routeDeadline ? input.plan.routeDecisionBy < routeDeadline.date : true,
      daysToMaturity: routeDeadline ? Math.round((Date.parse(`${routeDeadline.date}T00:00:00Z`) - Date.parse(`${input.plan.routeDecisionBy}T00:00:00Z`)) / 86400000) : null,
      alternative: chosen.alternative ? {pathId: chosen.alternative.id, longInstrumentId: longInstrument(ctx, runs.get(chosen.alternative.id)!)!.id,
        longInstrument: longTerms(ctx, longInstrument(ctx, runs.get(chosen.alternative.id)!)!),
        conditions: runs.get(chosen.alternative.id)!.gates.filter((g) => g.status !== "pass").map((g) => g.id), decisionBy: input.plan.routeDecisionBy} : null};
  }
  const sensitivities = input.sensitivities.map((s) => {
    const sruns = runAll(s), sc = selection(ctx, sruns);
    const rec = chosen.recommended ? sruns.get(chosen.recommended.id)! : null;
    return {id: s.id, label: s.label, recommendedPathId: sc.recommended?.id ?? null,
      recommendationHolds: chosen.recommended !== null && sc.recommended?.id === chosen.recommended.id,
      onRecommended: rec ? {gates: rec.gates, minimumCash: rec.summary.minimumCash, stressMinimumCash: {periodId: rec.minStress.periodId, amount: rec.minStress.closingAvailable},
        indenture: rec.indenture, policy: rec.policy, netDebtAtHorizon: rec.summary.netDebtAtHorizon, ebitdaByYear: ebitdaByYear(rec.base.rows)} : null};
  });
  return {schemaVersion: "capital-structure-paths.v1" as const, engineVersion: capitalStructurePathsVersion, currency: input.currency,
    openingDate: input.openingDate, periodEnds: [...input.periodEnds], minimumCash: input.minimumCash,
    gateOrder: [...capitalPathGateIds],
    paths: input.paths.map((p) => publishRun(ctx, p, runs.get(p.id)!)),
    ranking, recommendation, instrumentCosts: costs, sensitivities,
    exclusions: ["intraperiod_liquidity", "investor_demand", "lender_appetite", "legal_opinion_on_indenture", "contact_with_counterparties"] as const};
}
export type CapitalStructurePathsResult = ReturnType<typeof evaluateCapitalStructurePaths>;
