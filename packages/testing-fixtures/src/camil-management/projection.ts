import {aggregateIndexedDebtSchedules, buildIndexedDebtSchedule, calculateLiquidityCoverage, type IndexedDebtInstrumentInput} from "@offroad/financial-core";
import Decimal from "decimal.js";

import {allocateContractualSchedule, budget2026_27, itrDebentureCosts, itrScheduleBuckets, loanTransactionCosts, managementSeries, marketAssumptions, outerYearsGrowth, outerYearsWorkingCapitalChange} from "./truth";

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
};

export type ProjectionYear = {
  period: string;
  ebitda: string; capex: string; workingCapital: string; taxes: string; cfads: string; leases: string; dividends: string;
  principal: string; interest: string; indexationCapitalized: string; debtService: string;
  openingCash: string; sources: string; coverage: string | null; closingCash: string; deficit: string;
  grossDebt: string; netDebt: string; leverage: string;
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
export const projectionPeriods: string[] = itrScheduleBuckets.map((bucket) => bucket.period);
export const openingCash = d(1_430_714).plus(25_095);
export const openingGrossDebt = managementSeries.reduce((total, series) => total.plus(series.balance), d(0)).plus(loanTransactionCosts).plus(itrDebentureCosts);

export function projectCamil(options: ProjectionOptions): {years: ProjectionYear[]; partials: string[]} {
  const {rows: scheduleRows, partials} = allocateContractualSchedule();
  const cdi = d(marketAssumptions.cdiAnnualPercent).div(100);
  const sofr = d(marketAssumptions.sofrAnnualPercent).div(100);
  const ipca = (index: number) => d(marketAssumptions.ipcaImpliedByYearPercent[Math.min(index, marketAssumptions.ipcaImpliedByYearPercent.length - 1)]!).div(100);
  const instruments: IndexedDebtInstrumentInput[] = managementSeries.map((series) => {
    const principalIn = (period: string) => scheduleRows.filter((row) => row.period === period && row.id === series.id).reduce((total, row) => total.plus(row.amount), d(0));
    const rate = series.rate;
    const isIpca = rate.type === "spread_over_index" && rate.index === "IPCA";
    return {
      instrumentId: series.id,
      openingPrincipal: d(series.balance).plus(series.id === "loan-brl" ? loanTransactionCosts : 0),
      indexer: rate.type === "fixed" ? "fixed" : rate.index,
      indexationTreatment: isIpca ? "capitalized_principal" : "not_applicable",
      couponTreatment: "cash_paid",
      couponBase: "indexed_principal",
      periods: projectionPeriods.map((period, index) => ({
        period,
        indexationRate: isIpca ? ipca(index) : 0,
        couponRate: rate.type === "fixed" ? d(rate.rate).div(100) : rate.type === "percent_of_index" ? cdi.times(rate.percent).div(100) : rate.index === "IPCA" ? d(rate.spread).div(100) : (rate.index === "SOFR" ? sofr : cdi).plus(d(rate.spread).div(100)),
        scheduledPrincipal: principalIn(period),
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
    return {period, ebitda, capex, workingCapital, taxes, cfads: ebitda.minus(taxes).minus(capex).minus(workingCapital), leases: d(budgetYear.leases), dividends: index === 0 ? d(budgetYear.dividends) : d(budgetYear.dividends).times(growth)};
  });
  const coverage = calculateLiquidityCoverage(inputs.map((year) => {
    const row = service(year.period);
    const drawdown = d(row.drawdown);
    return {period: year.period, openingCash, cfads: year.cfads, principal: row.scheduledPrincipal, interest: d(row.couponPaid).plus(row.indexationPaid), leases: year.leases, otherObligations: year.dividends, contractedSources: (options.rollover ? d(row.scheduledPrincipal) : d(0)).plus(drawdown)};
  }));
  let grossDebt = openingGrossDebt;
  const years = inputs.map((year, index) => {
    const row = service(year.period);
    const closing = coverage[index]!;
    grossDebt = grossDebt.plus(row.indexationCapitalized).plus(row.drawdown).minus(options.rollover ? 0 : d(row.scheduledPrincipal)).minus(options.newDebt && year.period === options.newDebt.repayPeriod ? 0 : 0);
    if (!options.rollover) grossDebt = grossDebt; // principal repaid without rollover already left the balance above
    const netDebt = grossDebt.minus(closing.closingCash);
    return {
      period: year.period, ebitda: out(year.ebitda), capex: out(year.capex), workingCapital: out(year.workingCapital), taxes: out(year.taxes), cfads: out(year.cfads), leases: out(year.leases), dividends: out(year.dividends),
      principal: row.scheduledPrincipal, interest: out(d(row.couponPaid).plus(row.indexationPaid)), indexationCapitalized: row.indexationCapitalized, debtService: closing.debtService,
      openingCash: closing.openingCash, sources: closing.sources, coverage: closing.coverage, closingCash: closing.closingCash, deficit: closing.deficit,
      grossDebt: out(grossDebt), netDebt: out(netDebt), leverage: out(netDebt.div(year.ebitda)),
    };
  });
  return {years, partials};
}
