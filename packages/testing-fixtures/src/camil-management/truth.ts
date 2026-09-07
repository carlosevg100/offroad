import Decimal from "decimal.js";

/**
 * Synthetic management data for Case 02 (CFO of Camil preparing the board). Everything here is
 * invented for the test and labeled as such inside every file: Camil never sent a budget, a capex
 * plan, a cash policy or a contractual schedule to anyone. The numbers are calibrated to the public
 * filings (ITR of 31/05/2026) so that the identity with Case 01 holds where the fact is public: the
 * contractual schedule ties to the safra-year buckets of note 15 and the opening debt is the
 * ledger of Case 01, series by series. Unit: R$ thousand, consolidated.
 */
export const camilManagementLabel = "FIXTURE SINTÉTICA PARA TESTE DE PLATAFORMA. Dados gerenciais inventados, calibrados às demonstrações públicas da Camil (ITR de 31/05/2026). Não representam informação da companhia.";

/** Safra years of the ITR schedule (note 15, p. 40), in R$ thousand. These buckets mix
 * debenture principal before transaction costs with loan carrying amounts after transaction
 * costs. They are a public accounting schedule, not contractual cash principal. */
export const itrScheduleBuckets = [
  {period: "2026/27", amount: 1_229_828},
  {period: "2027/28", amount: 776_868},
  {period: "2028/29", amount: 1_228_475},
  {period: "2029/30", amount: 694_497},
  {period: "2030/31", amount: 994_544},
  {period: "after 2031", amount: 809_198},
] as const;
/** Balance-sheet transaction cost in note 15. The maturity table carries a R$1 thousand rounding
 * difference and is intentionally represented by a separate constant below. */
export const itrDebentureBalanceCosts = -63_225;
export const itrScheduleDebentureCosts = -63_224;
/** @deprecated Use the explicit balance or schedule constant. */
export const itrDebentureCosts = itrScheduleDebentureCosts;

export type ManagementSeries = {
  id: string;
  label: string;
  balance: number;
  currency: "BRL" | "USD" | "CLP" | "PEN";
  maturity: string | null;
  /** Public remuneration (trustee reports) or the management's own rate for bank lines (synthetic). */
  rate: {type: "spread_over_index"; index: "CDI" | "IPCA" | "SOFR"; spread: number} | {type: "percent_of_index"; index: "CDI"; percent: number} | {type: "fixed"; rate: number};
  rateSource: "public" | "synthetic";
};

export const managementSeries: readonly ManagementSeries[] = [
  {id: "loan-brl", label: "Capital de giro, moeda nacional", balance: 1_314_412, currency: "BRL", maturity: null, rate: {type: "spread_over_index", index: "CDI", spread: 1.5}, rateSource: "synthetic"},
  {id: "loan-usd", label: "Capital de giro, USD", balance: 867_244, currency: "USD", maturity: null, rate: {type: "spread_over_index", index: "SOFR", spread: 2.0}, rateSource: "synthetic"},
  {id: "loan-clp", label: "Capital de giro, CLP", balance: 54_180, currency: "CLP", maturity: null, rate: {type: "fixed", rate: 7.0}, rateSource: "synthetic"},
  {id: "loan-pen", label: "Capital de giro, PEN", balance: 181_158, currency: "PEN", maturity: null, rate: {type: "fixed", rate: 7.5}, rateSource: "synthetic"},
  {id: "deb-11-1", label: "Debêntures 11ª emissão, 1ª série", balance: 151_795, currency: "BRL", maturity: "2028-10-30", rate: {type: "spread_over_index", index: "CDI", spread: 1.55}, rateSource: "public"},
  {id: "deb-11-2", label: "Debêntures 11ª emissão, 2ª série", balance: 505_984, currency: "BRL", maturity: "2028-10-30", rate: {type: "spread_over_index", index: "CDI", spread: 1.55}, rateSource: "public"},
  {id: "deb-13-1", label: "Debêntures 13ª emissão, 1ª série", balance: 306_038, currency: "BRL", maturity: "2028-11-16", rate: {type: "spread_over_index", index: "CDI", spread: 0.65}, rateSource: "public"},
  {id: "deb-13-2", label: "Debêntures 13ª emissão, 2ª série", balance: 282_357, currency: "BRL", maturity: "2030-11-18", rate: {type: "spread_over_index", index: "IPCA", spread: 6.3416}, rateSource: "public"},
  {id: "deb-13-3", label: "Debêntures 13ª emissão, 3ª série", balance: 110_321, currency: "BRL", maturity: "2033-11-16", rate: {type: "spread_over_index", index: "IPCA", spread: 6.5264}, rateSource: "public"},
  {id: "deb-14-1", label: "Debêntures 14ª emissão, 1ª série", balance: 438_918, currency: "BRL", maturity: "2029-06-15", rate: {type: "percent_of_index", index: "CDI", percent: 104}, rateSource: "public"},
  {id: "deb-14-2", label: "Debêntures 14ª emissão, 2ª série", balance: 204_059, currency: "BRL", maturity: "2031-06-16", rate: {type: "spread_over_index", index: "IPCA", spread: 6.8286}, rateSource: "public"},
  {id: "deb-14-3", label: "Debêntures 14ª emissão, 3ª série", balance: 66_024, currency: "BRL", maturity: "2034-06-15", rate: {type: "spread_over_index", index: "IPCA", spread: 6.9982}, rateSource: "public"},
  {id: "deb-15-1", label: "Debêntures 15ª emissão, 1ª série", balance: 770_123, currency: "BRL", maturity: "2030-11-18", rate: {type: "percent_of_index", index: "CDI", percent: 105}, rateSource: "public"},
  {id: "deb-15-2", label: "Debêntures 15ª emissão, 2ª série", balance: 408_703, currency: "BRL", maturity: "2032-11-16", rate: {type: "fixed", rate: 14.15}, rateSource: "public"},
  {id: "deb-15-3", label: "Debêntures 15ª emissão, 3ª série", balance: 50_401, currency: "BRL", maturity: "2032-11-16", rate: {type: "spread_over_index", index: "IPCA", spread: 8.2}, rateSource: "public"},
  {id: "deb-15-4", label: "Debêntures 15ª emissão, 4ª série", balance: 30_793, currency: "BRL", maturity: "2035-11-16", rate: {type: "spread_over_index", index: "IPCA", spread: 8.7}, rateSource: "public"},
];
export const loanTransactionCosts = -9_099;

/** Which safra year a calendar date falls in (June to May). */
export const safraYearOf = (isoDate: string): string => {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const start = month >= 6 ? year : year - 1;
  return start >= 2031 ? "after 2031" : `${start}/${String(start + 1).slice(2)}`;
};

/** Budget 2026/27 by quarter (safra year June 2026 to May 2027), synthetic, calibrated to 1T26. */
export const budget2026_27 = {
  quarters: ["2T26/27 (jun-ago/26)", "3T26/27 (set-nov/26)", "4T26/27 (dez/26-fev/27)", "1T27/28 (mar-mai/27)"],
  netRevenue: [2_740_000, 2_860_000, 2_560_000, 2_740_000],
  ebitda: [222_000, 240_000, 205_000, 227_000],
  cashTaxes: [12_000, 18_000, 15_000, 15_000],
  maintenanceCapex: [45_000, 45_000, 45_000, 45_000],
  growthCapex: [40_000, 70_000, 70_000, 40_000],
  changeInWorkingCapital: [350_000, 150_000, -300_000, -150_000],
  leasePayments: [15_000, 15_000, 15_000, 15_000],
  dividends: [90_000, 0, 0, 0],
} as const;

/** Beyond the budget year, management projects flat volumes with 2% nominal growth (synthetic). */
export const outerYearsGrowth = 0.02;
export const outerYearsWorkingCapitalChange = 50_000;

export const minimumCashPolicy = {
  floor: 900_000,
  rule: "caixa mínimo de R$ 900 milhões, cerca de trinta dias de receita líquida, mais cobertura de 1,0x do serviço da dívida dos doze meses seguintes com caixa e linhas comprometidas",
  committedLines: 0,
  reviewCycle: "anual, no orçamento",
} as const;

/** Market assumptions frozen from the Case 01 pack (04/09/2026) and declared as the base scenario. */
export const marketAssumptions = {
  cdiDailyRatePercent: 0.05166,
  cdiAnnualPercent: 13.91,
  selicMetaPercent: 14.0,
  sofrAnnualPercent: 4.3,
  ipcaImpliedByYearPercent: [6.052, 5.7576, 5.6539, 5.6419, 5.6755, 5.7323],
  source: "bcb_sgs_cdi_diario (série 12), bcb_sgs_selic_meta (série 432) e anbima_ettj_2026-09-04 (inflação implícita por vértice) no source pack v3; SOFR assumida (sintética)",
} as const;

/**
 * The synthetic contractual schedule by series: debentures at maturity, moved to the previous
 * safra year when a bucket of the ITR would overflow (declared partial amortizations), and bank
 * lines filling the remaining public schedule before their transaction-cost add-back. The cash
 * rows contain gross principal. A separate bridge back to the public mixed-basis buckets is
 * verified below; the split remains synthetic.
 */
export function allocateContractualSchedule(): {rows: Array<{period: string; id: string; amount: Decimal}>; partials: string[]; totalByPeriod: (period: string) => Decimal; loanScheduleBridgeByPeriod: (period: string) => Decimal} {
  const d = (value: Decimal.Value) => new Decimal(value);
  const fmt = (value: Decimal.Value) => d(value).toDecimalPlaces(0).toNumber().toLocaleString("pt-BR");
  const periods = itrScheduleBuckets.map((bucket) => bucket.period);
  const bucketTarget = new Map(itrScheduleBuckets.map((bucket) => [bucket.period, d(bucket.amount)]));
  const allocation = new Map<string, Map<string, Decimal>>();
  const put = (period: string, id: string, amount: Decimal) => {
    const row = allocation.get(period) ?? new Map<string, Decimal>();
    row.set(id, (row.get(id) ?? d(0)).plus(amount));
    allocation.set(period, row);
  };
  const debentures = managementSeries.filter((series) => series.maturity !== null);
  for (const series of debentures) put(safraYearOf(series.maturity!), series.id, d(series.balance));
  const partials: string[] = [];
  for (let index = periods.length - 1; index > 0; index -= 1) {
    const period = periods[index]!;
    const row = allocation.get(period) ?? new Map<string, Decimal>();
    let total = [...row.values()].reduce((sum, value) => sum.plus(value), d(0));
    const target = bucketTarget.get(period)!;
    const ordered = [...row.entries()].sort((a, b) => b[1].comparedTo(a[1]) || (a[0] < b[0] ? -1 : 1));
    for (const [id, amount] of ordered) {
      if (total.lte(target)) break;
      const excess = Decimal.min(amount, total.minus(target));
      row.set(id, amount.minus(excess));
      put(periods[index - 1]!, id, excess);
      partials.push(`${id}: ${fmt(excess)} amortizados em ${periods[index - 1]} (parcial, sintético)`);
      total = total.minus(excess);
    }
  }
  const loans = managementSeries.filter((series) => series.maturity === null);
  const loanTotalGross = loans.reduce((sum, series) => sum.plus(series.balance), d(0));
  const loanTotalNet = loanTotalGross.plus(loanTransactionCosts);
  let loanRemaining = loanTotalNet;
  const loanByPeriod = new Map<string, Decimal>();
  for (const period of periods) {
    const row = allocation.get(period) ?? new Map<string, Decimal>();
    const debenturesHere = [...row.values()].reduce((sum, value) => sum.plus(value), d(0));
    const room = bucketTarget.get(period)!.minus(debenturesHere);
    const fill = Decimal.max(Decimal.min(room, loanRemaining), 0);
    loanByPeriod.set(period, fill);
    loanRemaining = loanRemaining.minus(fill);
  }
  if (!loanRemaining.abs().lte(1)) throw new Error(`loans do not fit the ITR buckets: ${loanRemaining.toFixed()}`);
  const unroundedGrossByPeriod = new Map(periods.map((period) => [period, loanByPeriod.get(period)!.div(loanTotalNet).times(loanTotalGross)]));
  const contractualLoanByPeriod: Map<string, Decimal> = new Map(periods.map((period) => [period, unroundedGrossByPeriod.get(period)!.toDecimalPlaces(0, Decimal.ROUND_HALF_UP)]));
  const grossRoundingDelta = loanTotalGross.minus([...contractualLoanByPeriod.values()].reduce((sum, value) => sum.plus(value), d(0)));
  const largestLoanPeriod = [...periods].sort((a, b) => loanByPeriod.get(b)!.comparedTo(loanByPeriod.get(a)!))[0]!;
  contractualLoanByPeriod.set(largestLoanPeriod, contractualLoanByPeriod.get(largestLoanPeriod)!.plus(grossRoundingDelta));

  // Integer allocation in R$ thousand with both row and column controls. Each period is
  // apportioned over the remaining balances by largest remainder; the final non-zero period takes
  // every remaining balance. This prevents a visually rounded workbook from being R$1 thousand
  // out of balance even when the underlying decimals add exactly.
  const activeLoanPeriods = periods.filter((period) => contractualLoanByPeriod.get(period)!.gt(0));
  const remainingByLoan = new Map(loans.map((series) => [series.id, d(series.balance)]));
  const loanRows: Array<{period: string; id: string; amount: Decimal}> = [];
  for (const [periodIndex, period] of activeLoanPeriods.entries()) {
    if (periodIndex === activeLoanPeriods.length - 1) {
      for (const series of loans) loanRows.push({period, id: series.id, amount: remainingByLoan.get(series.id)!});
      break;
    }
    const target = contractualLoanByPeriod.get(period)!;
    const totalRemaining = [...remainingByLoan.values()].reduce((sum, value) => sum.plus(value), d(0));
    const allocations = loans.map((series) => {
      const quota = target.times(remainingByLoan.get(series.id)!).div(totalRemaining);
      const floor = quota.toDecimalPlaces(0, Decimal.ROUND_FLOOR);
      return {series, amount: floor, remainder: quota.minus(floor)};
    });
    let units = target.minus(allocations.reduce((sum, entry) => sum.plus(entry.amount), d(0))).toNumber();
    for (const entry of [...allocations].sort((a, b) => b.remainder.comparedTo(a.remainder) || a.series.id.localeCompare(b.series.id))) {
      if (units <= 0) break;
      if (entry.amount.lt(remainingByLoan.get(entry.series.id)!)) {
        entry.amount = entry.amount.plus(1);
        units -= 1;
      }
    }
    if (units !== 0) throw new Error(`loan allocation rounding did not close in ${period}`);
    for (const entry of allocations) {
      loanRows.push({period, id: entry.series.id, amount: entry.amount});
      remainingByLoan.set(entry.series.id, remainingByLoan.get(entry.series.id)!.minus(entry.amount));
    }
  }
  const rows: Array<{period: string; id: string; amount: Decimal}> = [];
  for (const period of periods) {
    for (const series of debentures) { const amount = allocation.get(period)?.get(series.id); if (amount && amount.gt(0)) rows.push({period, id: series.id, amount}); }
    rows.push(...loanRows.filter((row) => row.period === period && row.amount.gt(0)));
  }
  const totalByPeriod = (period: string) => rows.filter((row) => row.period === period).reduce((sum, row) => sum.plus(row.amount), d(0));
  // The public schedule is R$1 thousand below the gross-principal less the disclosed R$9.099
  // thousand loan transaction cost. The bridge therefore totals R$9.100 thousand; the offset is
  // paired with the R$1 thousand difference between debenture costs in the schedule and balance.
  const loanScheduleBridgeByPeriod = (period: string) => loanByPeriod.get(period)!.minus(contractualLoanByPeriod.get(period)!);
  for (const bucket of itrScheduleBuckets) {
    const bridged = totalByPeriod(bucket.period).plus(loanScheduleBridgeByPeriod(bucket.period));
    if (!bridged.minus(bucket.amount).abs().lte(1)) throw new Error(`bucket ${bucket.period} does not tie after transaction costs: ${bridged.toFixed()} vs ${bucket.amount}`);
  }
  return {rows, partials, totalByPeriod, loanScheduleBridgeByPeriod};
}
