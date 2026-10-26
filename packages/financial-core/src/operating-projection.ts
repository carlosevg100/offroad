import Decimal from "decimal.js";
import {buildOperatingCashProjection, operatingCashProjectionVersion, type OperatingProjectionPeriod, type OperatingWorkingCapital} from "./operating-cash-projection";

export const operatingProjectionVersion = "2026.10.26-v1";
const Exact = Decimal.clone({precision: 100, rounding: Decimal.ROUND_HALF_UP});

/** Drivers of the last actual year: enough to rebuild revenue, EBITDA and working capital by days. */
export const actualOperatingDriverNames = ["volume", "netUnitPrice", "inputCostPerUnit", "otherVariableCostPerUnit", "fixedCosts",
  "receivableDays", "inventoryDays", "payableDays"] as const;
/** Drivers of each projected year. Volume times unit price must give revenue in the projection's currency scale. */
export const projectedOperatingDriverNames = [...actualOperatingDriverNames, "maintenanceCapex", "leasePayments", "depreciation",
  "interestExpense", "taxRate"] as const;
export type ActualOperatingDriver = (typeof actualOperatingDriverNames)[number];
export type ProjectedOperatingDriver = (typeof projectedOperatingDriverNames)[number];
export type OperatingDriverColumns = Record<ProjectedOperatingDriver, readonly string[]>;

/** A scenario changes only what it names, over the drivers of the scenario it is based on, in this order:
 * volume growth from the actual year or a volume factor, whole driver columns, then an input cost shock. */
export type DriverProjectionScenario = {
  id: string; label: string; role: "alternative" | "informed"; basedOn: string;
  /** Volume of year n is the actual volume times (1 + rate)^n. */
  volumeGrowthRate: string | null;
  /** Every projected volume of the scenario it is based on times this factor. */
  volumeFactor: string | null;
  overrides: Partial<Record<ProjectedOperatingDriver, readonly string[]>>;
  /** The input cost rises by `rate` from `fromPeriodId`. In that year (12 - lag) / 12 of the rise reaches the
   * unit price; from the next year all of it does. A lag of 12 months is no pass-through in the year. */
  inputCostShock: {fromPeriodId: string; rate: string; passThroughLagMonths: number} | null;
};
/** The company's own budget or revision for one metric of one period. Compared, never replaced. */
export type CompanyProjectionVersion = {id: string; label: string; status: "approved" | "under_review"; periodId: string;
  metric: "revenue" | "ebitda"; value: string};
export type DriverOperatingProjectionInput = {
  currency: string; dayCountBasis: 360 | 365;
  /** Largest relative difference between the rebuilt and the reported actual revenue and EBITDA. */
  calibrationTolerance: string;
  actual: {id: string; startDate: string; endDate: string; drivers: Record<ActualOperatingDriver, string>; reportedRevenue: string; reportedEbitda: string};
  periods: readonly {id: string; startDate: string; endDate: string}[];
  base: OperatingDriverColumns;
  scenarios: readonly DriverProjectionScenario[];
  companyVersions: readonly CompanyProjectionVersion[];
};

const fail = (code: string): never => {throw new Error(code);};
function amount(value: string, code = "operating_projection_invalid_amount", signed = false) {
  if (typeof value !== "string" || !(signed ? /^-?\d{1,24}(?:\.\d{1,20})?$/ : /^\d{1,24}(?:\.\d{1,20})?$/).test(value)) fail(code);
  return new Exact(value);
}
/** Money, volumes, unit prices and days carry at most eight decimals, as the operating engine reads them. */
function operand(value: string, signed = false) {
  if (typeof value !== "string" || !(signed ? /^-?\d{1,24}(?:\.\d{1,8})?$/ : /^\d{1,24}(?:\.\d{1,8})?$/).test(value)) fail("operating_projection_invalid_amount");
  return new Exact(value);
}
function date(value: string) {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) fail("operating_projection_invalid_date");
  const d = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) fail("operating_projection_invalid_date");
}
const text = (value: string, code: string) => {if (typeof value !== "string" || !value.trim() || value.length > 300) fail(code); return value;};
const out = (v: Decimal) => v.toDecimalPlaces(20).toFixed();
/** The only rounding: operands handed to the operating engine, half up to eight decimals. */
const eight = (v: Decimal) => v.toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
const ratio = (a: Decimal, b: Decimal) => b.gt(0) ? out(a.div(b)) : null;

type Resolved = Record<ProjectedOperatingDriver, Decimal[]>;

/** Projection by driver over the existing operating engine (`buildOperatingCashProjection`): revenue is
 * volume times net unit price; variable cost is volume times the input cost and the other variable costs
 * per unit; fixed costs as adopted; working capital by days on revenue (receivables) and on variable cost
 * (inventory and payables); income tax at the adopted rate on EBITDA less depreciation, lease payments
 * and interest, never below zero; cash available for debt is the engine's cash before financing less
 * lease payments. The last actual year is rebuilt from its drivers first; when it does not reproduce the
 * reported revenue and EBITDA within the tolerance, no projection is returned. Company versions are
 * compared with the base, never replaced. Sensitivities are linear and in currency: one percent of unit
 * price and of input cost on EBITDA, and one day of receivables on working capital. */
export function buildDriverOperatingProjection(input: DriverOperatingProjectionInput) {
  if (!/^[A-Z]{3}$/.test(input.currency)) fail("operating_projection_invalid_currency");
  if (input.dayCountBasis !== 360 && input.dayCountBasis !== 365) fail("operating_projection_day_count_basis");
  const tolerance = amount(input.calibrationTolerance);
  if (tolerance.gte(1)) fail("operating_projection_calibration_tolerance");
  const days = new Exact(input.dayCountBasis);
  const a = input.actual;
  date(a.startDate); date(a.endDate);
  if (a.endDate < a.startDate) fail("operating_projection_actual_period");
  text(a.id, "operating_projection_period_identity");
  if (!a.drivers || Object.keys(a.drivers).sort().join() !== [...actualOperatingDriverNames].sort().join()) fail("operating_projection_actual_drivers_required");
  const ad = Object.fromEntries(actualOperatingDriverNames.map((k) => [k, operand(a.drivers[k])])) as Record<ActualOperatingDriver, Decimal>;
  if (!input.periods.length || input.periods.length > 40) fail("operating_projection_period_limit");
  const periodIds = input.periods.map((p) => text(p.id, "operating_projection_period_identity"));
  if (new Set([a.id, ...periodIds]).size !== periodIds.length + 1) fail("operating_projection_period_identity");
  const n = input.periods.length;

  // Calibration on the last actual year.
  const actualRevenue = ad.volume.mul(ad.netUnitPrice);
  const actualVariable = ad.volume.mul(ad.inputCostPerUnit.plus(ad.otherVariableCostPerUnit));
  const actualEbitda = actualRevenue.minus(actualVariable).minus(ad.fixedCosts);
  const reportedRevenue = operand(a.reportedRevenue, true), reportedEbitda = operand(a.reportedEbitda, true);
  const gap = (modeled: Decimal, reported: Decimal) => reported.isZero() ? (modeled.isZero() ? new Exact(0) : null) : modeled.minus(reported).abs().div(reported.abs());
  const revenueGap = gap(actualRevenue, reportedRevenue), ebitdaGap = gap(actualEbitda, reportedEbitda);
  const reproduces = revenueGap !== null && ebitdaGap !== null && revenueGap.lte(tolerance) && ebitdaGap.lte(tolerance);
  const calibration = {periodId: a.id, startDate: a.startDate, endDate: a.endDate,
    reportedRevenue: out(reportedRevenue), modeledRevenue: out(actualRevenue), reportedEbitda: out(reportedEbitda), modeledEbitda: out(actualEbitda),
    revenueRelativeDifference: revenueGap === null ? null : out(revenueGap), ebitdaRelativeDifference: ebitdaGap === null ? null : out(ebitdaGap),
    tolerance: out(tolerance), reproduces};

  // Driver columns of the base, then of each scenario over the one it is based on.
  const column = (values: readonly string[] | undefined, name: ProjectedOperatingDriver) => {
    if (!Array.isArray(values) || values.length !== n) fail("operating_projection_column_length");
    return values!.map((v) => name === "taxRate" ? amount(v) : operand(v));
  };
  if (!input.base || Object.keys(input.base).sort().join() !== [...projectedOperatingDriverNames].sort().join()) fail("operating_projection_base_drivers_required");
  const base = Object.fromEntries(projectedOperatingDriverNames.map((k) => [k, column(input.base[k], k)])) as Resolved;
  const checkRates = (r: Resolved) => {if (r.taxRate.some((t) => t.gte(1))) fail("operating_projection_tax_rate");};
  checkRates(base);
  const resolved = new Map<string, Resolved>([["base", base]]);
  const scenarioIds = new Set<string>();
  if (input.scenarios.length > 12) fail("operating_projection_scenario_limit");
  for (const s of input.scenarios) {
    if (text(s.id, "operating_projection_scenario_identity") === "base" || scenarioIds.has(s.id)) fail("operating_projection_scenario_identity");
    text(s.label, "operating_projection_label_required");
    if (s.role !== "alternative" && s.role !== "informed") fail("operating_projection_scenario_role");
    const from = resolved.get(s.basedOn);
    if (!from) fail("operating_projection_unknown_scenario");
    scenarioIds.add(s.id);
    const r = Object.fromEntries(projectedOperatingDriverNames.map((k) => [k, [...from![k]]])) as Resolved;
    if (s.volumeGrowthRate !== null && s.volumeFactor !== null) fail("operating_projection_volume_rule_conflict");
    if ((s.volumeGrowthRate !== null || s.volumeFactor !== null) && s.overrides.volume) fail("operating_projection_volume_rule_conflict");
    if (s.volumeGrowthRate !== null) {
      const g = amount(s.volumeGrowthRate, "operating_projection_invalid_amount", true);
      if (!g.gt(-1)) fail("operating_projection_volume_rule");
      r.volume = r.volume.map((_, i) => ad.volume.mul(g.plus(1).pow(i + 1)));
    }
    if (s.volumeFactor !== null) {
      const f = amount(s.volumeFactor);
      if (!f.gt(0)) fail("operating_projection_volume_rule");
      r.volume = r.volume.map((v) => v.mul(f));
    }
    const overridden = Object.keys(s.overrides ?? {});
    if (overridden.some((k) => !(projectedOperatingDriverNames as readonly string[]).includes(k))) fail("operating_projection_unknown_driver");
    for (const k of overridden as ProjectedOperatingDriver[]) r[k] = column(s.overrides[k], k);
    if (s.inputCostShock !== null) {
      const c = s.inputCostShock, at = periodIds.indexOf(c.fromPeriodId), rise = amount(c.rate, "operating_projection_invalid_amount", true);
      if (at < 0) fail("operating_projection_unknown_period");
      if (!rise.gt(-1)) fail("operating_projection_shock_rate");
      if (!Number.isInteger(c.passThroughLagMonths) || c.passThroughLagMonths < 0 || c.passThroughLagMonths > 12) fail("operating_projection_pass_through_lag");
      const firstYearShare = new Exact(12 - c.passThroughLagMonths).div(12);
      for (let i = at; i < n; i++) {
        const before = r.inputCostPerUnit[i]!, increase = before.mul(rise);
        r.inputCostPerUnit[i] = before.plus(increase);
        r.netUnitPrice[i] = r.netUnitPrice[i]!.plus(i === at ? increase.mul(firstYearShare) : increase);
      }
    }
    checkRates(r);
    resolved.set(s.id, r);
  }
  const versionIds = new Set<string>();
  if (input.companyVersions.length > 12) fail("operating_projection_company_version_limit");
  for (const v of input.companyVersions) {
    if (!text(v.id, "operating_projection_company_version_identity") || versionIds.has(v.id)) fail("operating_projection_company_version_identity");
    versionIds.add(v.id); text(v.label, "operating_projection_label_required");
    if (!periodIds.includes(v.periodId)) fail("operating_projection_unknown_period");
    if (v.status !== "approved" && v.status !== "under_review") fail("operating_projection_company_version_status");
    if (v.metric !== "revenue" && v.metric !== "ebitda") fail("operating_projection_company_version_metric");
    operand(v.value, true);
  }
  const exclusions = ["financing", "debt_service", "contractual_cfads", "tax_rule_inference", "loss_carryforward", "intraperiod_liquidity"] as const;
  const head = {schemaVersion: "operating-projection.v1" as const, version: operatingProjectionVersion, engineVersion: operatingCashProjectionVersion,
    currency: input.currency, dayCountBasis: input.dayCountBasis, calibration, rounding: "engine_operands_half_up_8_decimals" as const, exclusions};
  if (!reproduces) return {...head, projection: null};

  const balances = (revenue: Decimal, variable: Decimal, d: {receivableDays: Decimal; inventoryDays: Decimal; payableDays: Decimal}): OperatingWorkingCapital => ({
    receivables: eight(revenue.mul(d.receivableDays).div(days)).toFixed(), inventory: eight(variable.mul(d.inventoryDays).div(days)).toFixed(),
    payables: eight(variable.mul(d.payableDays).div(days)).toFixed(), otherOperatingAssets: "0", otherOperatingLiabilities: "0"});
  const opening = balances(actualRevenue, eight(actualVariable), ad);
  function run(id: string) {
    const r = resolved.get(id)!;
    const lines = input.periods.map((p, i) => {
      const volume = eight(r.volume[i]!), price = eight(r.netUnitPrice[i]!);
      const revenue = volume.mul(price), variable = eight(volume.mul(r.inputCostPerUnit[i]!.plus(r.otherVariableCostPerUnit[i]!)));
      const ebitda = revenue.minus(variable).minus(r.fixedCosts[i]!);
      const taxBase = ebitda.minus(r.depreciation[i]!).minus(r.leasePayments[i]!).minus(r.interestExpense[i]!);
      const tax = taxBase.gt(0) ? eight(taxBase.mul(r.taxRate[i]!)) : new Exact(0);
      const period: OperatingProjectionPeriod = {id: p.id, startDate: p.startDate, endDate: p.endDate,
        revenue: {mode: "drivers", quantity: volume.toFixed(), netUnitPrice: price.toFixed()},
        variableOperatingExpense: variable.toFixed(), fixedOperatingExpense: r.fixedCosts[i]!.toFixed(), nonCashEbitdaAdjustment: "0",
        closingWorkingCapital: balances(revenue, variable, {receivableDays: r.receivableDays[i]!, inventoryDays: r.inventoryDays[i]!, payableDays: r.payableDays[i]!}),
        cashTaxesPaid: tax.toFixed(), cashTaxRefunds: "0", maintenanceCapexPaid: r.maintenanceCapex[i]!.toFixed(), growthCapexPaid: "0"};
      return {period, volume, price, inputCost: r.inputCostPerUnit[i]!, tax, lease: r.leasePayments[i]!};
    });
    const engine = buildOperatingCashProjection({currency: input.currency, openingDate: a.endDate, endDate: input.periods[n - 1]!.endDate,
      openingWorkingCapital: opening, periods: lines.map((l) => l.period), convention: "accrual_ebitda_to_cash_before_financing"});
    return engine.rows.map((row, i) => {
      const l = lines[i]!, ebitda = new Exact(row.ebitda), revenue = new Exact(row.netRevenue);
      const cash = new Exact(row.cashBeforeFinancing).minus(l.lease);
      return {periodId: row.periodId, startDate: row.startDate, endDate: row.endDate,
        volume: out(l.volume), netUnitPrice: out(l.price), inputCostPerUnit: out(eight(l.inputCost)),
        revenue: row.netRevenue, variableCosts: l.period.variableOperatingExpense, fixedCosts: l.period.fixedOperatingExpense, ebitda: row.ebitda,
        margin: ratio(ebitda, revenue), receivables: l.period.closingWorkingCapital.receivables, inventory: l.period.closingWorkingCapital.inventory,
        payables: l.period.closingWorkingCapital.payables, workingCapital: row.closingNetWorkingCapital, changeInWorkingCapital: row.changeInNetWorkingCapital,
        incomeTax: l.period.cashTaxesPaid, maintenanceCapex: l.period.maintenanceCapexPaid, cashBeforeLeases: row.cashBeforeFinancing,
        leasePayments: out(l.lease), cashAvailableForDebt: out(cash), conversion: ebitda.gt(0) ? out(cash.div(ebitda)) : null};
    });
  }
  const baseRows = run("base");
  const rowsById = new Map([["base", baseRows]]);
  const scenarios = input.scenarios.map((s) => {
    const rows = run(s.id), reference = rowsById.get(s.basedOn)!;
    rowsById.set(s.id, rows);
    return {id: s.id, label: s.label, role: s.role, basedOn: s.basedOn, volumeGrowthRate: s.volumeGrowthRate, volumeFactor: s.volumeFactor,
      overriddenDrivers: Object.keys(s.overrides).sort(), inputCostShock: s.inputCostShock === null ? null : {...s.inputCostShock},
      rows: rows.map((row, i) => {
        const ref = reference[i]!, d = (k: "ebitda" | "cashAvailableForDebt" | "changeInWorkingCapital") => out(new Exact(row[k]).minus(ref[k]));
        return {...row, effects: {ebitda: d("ebitda"), cashAvailableForDebt: d("cashAvailableForDebt"), changeInWorkingCapital: d("changeInWorkingCapital")}};
      })};
  });
  const sensitivities = baseRows.map((row, i) => {
    const ebitdaPerPrice = new Exact(row.revenue).div(100);
    return {periodId: row.periodId, ebitdaPerOnePercentPrice: out(ebitdaPerPrice),
      ebitdaLossPerOnePercentInputCost: out(new Exact(row.volume).mul(base.inputCostPerUnit[i]!).div(100)),
      workingCapitalPerReceivableDay: out(new Exact(row.revenue).div(days)),
      pricePercentShareOfEbitda: ratio(ebitdaPerPrice, new Exact(row.ebitda))};
  });
  const comparisons = input.companyVersions.map((v) => {
    const row = baseRows.find((r) => r.periodId === v.periodId)!, ours = new Exact(v.metric === "ebitda" ? row.ebitda : row.revenue);
    const difference = new Exact(v.value).minus(ours), volume = new Exact(row.volume);
    return {id: v.id, label: v.label, status: v.status, periodId: v.periodId, metric: v.metric, companyValue: out(new Exact(v.value)), projectedValue: out(ours),
      difference: out(difference), relativeDifference: ratio(difference, ours),
      /** The change in net unit price that alone would close the difference, all else as projected. */
      unitPriceEquivalent: volume.gt(0) ? out(difference.div(volume)) : null};
  });
  const largest = scenarios.flatMap((s) => s.rows.map((r) => ({scenarioId: s.id, periodId: r.periodId, cashEffect: r.effects.cashAvailableForDebt,
    workingCapitalChangeEffect: r.effects.changeInWorkingCapital})))
    .reduce<null | {scenarioId: string; periodId: string; cashEffect: string; workingCapitalChangeEffect: string}>((w, x) =>
      new Exact(x.cashEffect).lt(w === null ? 0 : w.cashEffect) ? x : w, null);
  return {...head, projection: {base: baseRows, scenarios, sensitivities, comparisons, largestCashReduction: largest}};
}
export type DriverOperatingProjection = ReturnType<typeof buildDriverOperatingProjection>;
