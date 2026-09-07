import {aggregateIndexedDebtSchedules, buildIndexedDebtSchedule, calculateLiquidityCoverage, type IndexedDebtInstrumentInput} from "@offroad/financial-core";
import Decimal from "decimal.js";

import {allocateContractualSchedule, budget2026_27, itrDebentureBalanceCosts, itrScheduleBuckets, loanTransactionCosts, managementSeries, marketAssumptions, outerYearsGrowth, outerYearsWorkingCapitalChange} from "./truth";

/**
 * The Camil projection shared by cases 02 and 05: debt service by safra year from the frozen ledger
 * and the synthetic contractual schedule, CFADS from the synthetic budget, liquidity coverage with
 * and without rollover, and the leverage path. Everything numeric comes from financial-core. The
 * parameters let case 05 vary capex by scenario and add a drawdown without touching the base.
 */
export type ProjectionOptions = {
  /** Capex by safra year beyond the budget year; default: maintenance capex growing 2% a year. */
  capexByPeriod?: Readonly<Record<string, Decimal.Value>>;
  /** Extra debt drawn in a period at an annual rate (spread over CDI), repaid bullet at `repayPeriod`. */
  newDebt?: {period: string; amount: Decimal.Value; spreadOverCdi: Decimal.Value; repayPeriod: string} | null;
  /** Whether maturing principal is rolled (contracted sources equal to scheduled principal). */
  rollover: boolean;
  /** Annual cash rate on refinanced principal. Required when rollover is true. Refinanced
   * principal is assumed bullet beyond the explicit horizon and starts paying interest in the
   * period after its refinancing. */
  rolloverAnnualRate?: Decimal.Value;
};

export type ProjectionYear = {
  period: string; revenue: string;
  ebitda: string; capex: string; workingCapital: string; taxes: string; cfads: string; leases: string; dividends: string;
  /** Principal shown in the ITR maturity bucket before future IPCA updates. */
  contractualPrincipal: string;
  /** Cash principal paid, including capitalized IPCA when an indexed bullet matures. */
  principal: string; interest: string; indexationCapitalized: string; cashDebtService: string;
  legacyInterest: string; rolloverInterest: string; rolledDebt: string;
  cashUses: string; dscr: string | null; interestCoverage: string | null;
  openingCash: string; contractedSources: string; sources: string; liquidityCoverage: string | null; closingCash: string; deficit: string;
  /** Legacy aliases retained for downstream fixtures. debtService is total cash uses and coverage is
   * liquidity coverage, not DSCR. */
  debtService: string; coverage: string | null;
  grossDebt: string; netDebt: string; leverage: string;
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
export const projectionPeriods: string[] = itrScheduleBuckets.map((bucket) => bucket.period);
/** Operational liquidity starts with cash and cash equivalents only. The additional R$25.095
 * thousand of financial investments is deductible in the reported covenant bridge but is not
 * assumed to satisfy the synthetic minimum-cash policy without liquidity evidence. */
export const openingCash = d(1_430_714);
export const openingCovenantDeductibleCash = d(1_430_714).plus(25_095);
export const openingGrossDebt = managementSeries.reduce((total, series) => total.plus(series.balance), d(0)).plus(loanTransactionCosts).plus(itrDebentureBalanceCosts);
/** Synthetic contractual cash principal before all transaction costs. It is reconciled to the
 * mixed-basis public maturity schedule through a separate transaction-cost bridge. */
export const openingContractualPrincipal = managementSeries.reduce((total, series) => total.plus(series.balance), d(0));
/** @deprecated Use openingContractualPrincipal. */
export const openingScheduledPrincipal = openingContractualPrincipal;
/** @deprecated Use the basis-specific openingScheduledPrincipal. */
export const openingContractualGrossDebt = openingScheduledPrincipal;

export function projectCamil(options: ProjectionOptions): {years: ProjectionYear[]; partials: string[]} {
  if (options.rollover && options.rolloverAnnualRate === undefined) {
    throw new RangeError("rolloverAnnualRate is required when rollover is true");
  }
  const {rows: scheduleRows, partials} = allocateContractualSchedule();
  const cdi = d(marketAssumptions.cdiAnnualPercent).div(100);
  const sofr = d(marketAssumptions.sofrAnnualPercent).div(100);
  const ipca = (index: number) => d(marketAssumptions.ipcaImpliedByYearPercent[Math.min(index, marketAssumptions.ipcaImpliedByYearPercent.length - 1)]!).div(100);
  const instruments: IndexedDebtInstrumentInput[] = managementSeries.map((series) => {
    const principalIn = (period: string) => scheduleRows.filter((row) => row.period === period && row.id === series.id).reduce((total, row) => total.plus(row.amount), d(0));
    const rate = series.rate;
    const isIpca = rate.type === "spread_over_index" && rate.index === "IPCA";
    if (isIpca) {
      const payments = projectionPeriods.map((period) => principalIn(period)).filter((amount) => amount.gt(0));
      if (payments.length !== 1 || !payments[0]!.eq(series.balance)) throw new Error(`${series.id}: the synthetic IPCA fixture must be a single bullet before repayAll can be used`);
    }
    return {
      instrumentId: series.id,
      openingPrincipal: d(series.balance),
      indexer: rate.type === "fixed" ? "fixed" : rate.index,
      indexationTreatment: isIpca ? "capitalized_principal" : "not_applicable",
      couponTreatment: "cash_paid",
      couponBase: "indexed_principal",
      periods: projectionPeriods.map((period, index) => ({
        period,
        indexationRate: isIpca ? ipca(index) : 0,
        couponRate: rate.type === "fixed" ? d(rate.rate).div(100) : rate.type === "percent_of_index" ? cdi.times(rate.percent).div(100) : rate.index === "IPCA" ? d(rate.spread).div(100) : (rate.index === "SOFR" ? sofr : cdi).plus(d(rate.spread).div(100)),
        scheduledPrincipal: isIpca && principalIn(period).gt(0) ? 0 : principalIn(period),
        repayAll: isIpca && principalIn(period).gt(0),
      })),
    };
  });
  if (options.newDebt) {
    const start = projectionPeriods.indexOf(options.newDebt.period);
    const end = projectionPeriods.indexOf(options.newDebt.repayPeriod);
    if (start < 0 || end < start) throw new RangeError("new debt periods must exist and repay after the drawdown");
    instruments.push({
      instrumentId: "new-debt", openingPrincipal: 0, indexer: "CDI", indexationTreatment: "not_applicable", couponTreatment: "cash_paid", couponBase: "indexed_principal",
      periods: projectionPeriods.map((period, index) => ({period, indexationRate: 0, couponRate: cdi.plus(options.newDebt!.spreadOverCdi), drawdown: index === start ? options.newDebt!.amount : 0, scheduledPrincipal: index === end ? options.newDebt!.amount : 0})),
    });
  }
  const aggregate = aggregateIndexedDebtSchedules(instruments.map((instrument) => buildIndexedDebtSchedule(instrument)));
  const service = (period: string) => aggregate.find((row) => row.period === period)!;

  const budgetYear = {ebitda: sum(budget2026_27.ebitda), taxes: sum(budget2026_27.cashTaxes), capex: sum(budget2026_27.maintenanceCapex) + sum(budget2026_27.growthCapex), maintenance: sum(budget2026_27.maintenanceCapex), workingCapital: sum(budget2026_27.changeInWorkingCapital), leases: sum(budget2026_27.leasePayments), dividends: sum(budget2026_27.dividends)};
  const inputs = projectionPeriods.map((period, index) => {
    const growth = d(1 + outerYearsGrowth).pow(index);
    const ebitda = index === 0 ? d(budgetYear.ebitda) : d(budgetYear.ebitda).times(growth);
    const defaultCapex = index === 0 ? d(budgetYear.capex) : d(budgetYear.maintenance).times(growth);
    const capex = options.capexByPeriod && options.capexByPeriod[period] !== undefined ? d(options.capexByPeriod[period]!) : defaultCapex;
    const workingCapital = index === 0 ? d(budgetYear.workingCapital) : d(outerYearsWorkingCapitalChange);
    const taxes = index === 0 ? d(budgetYear.taxes) : d(budgetYear.taxes).times(growth);
    const revenue = d(sum(budget2026_27.netRevenue)).times(growth);
    return {period, revenue, ebitda, capex, workingCapital, taxes, cfads: ebitda.minus(taxes).minus(capex).minus(workingCapital), leases: d(budgetYear.leases), dividends: index === 0 ? d(budgetYear.dividends) : d(budgetYear.dividends).times(growth)};
  });
  let refinancedOpening = d(0);
  const liquidityInputs = inputs.map((year) => {
    const row = service(year.period);
    const drawdown = d(row.drawdown);
    const principal = d(row.scheduledPrincipal);
    const legacyInterest = d(row.couponPaid).plus(row.indexationPaid);
    const rolloverInterest = options.rollover ? refinancedOpening.times(options.rolloverAnnualRate!) : d(0);
    const result = {period: year.period, openingCash, cfads: year.cfads, principal, interest: legacyInterest.plus(rolloverInterest), leases: year.leases, otherObligations: year.dividends, contractedSources: (options.rollover ? principal : d(0)).plus(drawdown), legacyInterest, rolloverInterest};
    if (options.rollover) refinancedOpening = refinancedOpening.plus(principal);
    return result;
  });
  const coverage = calculateLiquidityCoverage(liquidityInputs);
  let grossDebt = openingScheduledPrincipal;
  let rolledDebt = d(0);
  const years = inputs.map((year, index) => {
    const row = service(year.period);
    const closing = coverage[index]!;
    const liquidityInput = liquidityInputs[index]!;
    grossDebt = grossDebt.plus(row.indexationCapitalized).plus(row.drawdown).minus(options.rollover ? 0 : d(row.scheduledPrincipal));
    if (options.rollover) rolledDebt = rolledDebt.plus(row.scheduledPrincipal);
    const netDebt = grossDebt.minus(closing.closingCash);
    const legacyInterest = d(row.couponPaid).plus(row.indexationPaid);
    const rolloverInterest = liquidityInput.rolloverInterest;
    const interest = legacyInterest.plus(rolloverInterest);
    const principal = d(row.scheduledPrincipal);
    const cashDebtService = principal.plus(interest);
    const cashUses = cashDebtService.plus(year.leases).plus(year.dividends);
    const contractedSources = (options.rollover ? principal : d(0)).plus(row.drawdown);
    return {
      period: year.period, revenue: out(year.revenue), ebitda: out(year.ebitda), capex: out(year.capex), workingCapital: out(year.workingCapital), taxes: out(year.taxes), cfads: out(year.cfads), leases: out(year.leases), dividends: out(year.dividends),
      contractualPrincipal: out(scheduleRows.filter((entry) => entry.period === year.period).reduce((total, entry) => total.plus(entry.amount), d(0))),
      principal: out(principal), interest: out(interest), indexationCapitalized: row.indexationCapitalized, cashDebtService: out(cashDebtService),
      legacyInterest: out(legacyInterest), rolloverInterest: out(rolloverInterest), rolledDebt: out(rolledDebt),
      cashUses: out(cashUses), dscr: cashDebtService.isZero() ? null : out(year.cfads.div(cashDebtService)), interestCoverage: interest.isZero() ? null : out(year.ebitda.div(interest)),
      openingCash: closing.openingCash, contractedSources: out(contractedSources), sources: closing.sources, liquidityCoverage: closing.coverage, closingCash: closing.closingCash, deficit: closing.deficit,
      debtService: closing.debtService, coverage: closing.coverage,
      grossDebt: out(grossDebt), netDebt: out(netDebt), leverage: out(netDebt.div(year.ebitda)),
    };
  });
  return {years, partials};
}
