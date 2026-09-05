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

/** Safra years of the ITR schedule (note 15, p. 40), in R$ thousand, net of loan transaction costs. */
export const itrScheduleBuckets = [
  {period: "2026/27", amount: 1_229_828},
  {period: "2027/28", amount: 776_868},
  {period: "2028/29", amount: 1_228_475},
  {period: "2029/30", amount: 694_497},
  {period: "2030/31", amount: 994_544},
  {period: "after 2031", amount: 809_198},
] as const;
export const itrDebentureCosts = -63_224;

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
 * The contractual schedule by series: debentures at maturity, moved to the previous safra year when a
 * bucket of the ITR would overflow (declared partial amortizations), bank lines filling what remains pro
 * rata to their balances. The per-year totals tie to note 15 by construction; the split is synthetic.
 */
export function allocateContractualSchedule(): {rows: Array<{period: string; id: string; amount: Decimal}>; partials: string[]; totalByPeriod: (period: string) => Decimal} {
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
  const loanTotalNet = loans.reduce((sum, series) => sum.plus(series.balance), d(0)).plus(loanTransactionCosts);
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
  const loanShare = (series: ManagementSeries) => d(series.balance).plus(series.id === "loan-brl" ? loanTransactionCosts : 0).div(loanTotalNet);
  const rows: Array<{period: string; id: string; amount: Decimal}> = [];
  for (const period of periods) {
    for (const series of debentures) { const amount = allocation.get(period)?.get(series.id); if (amount && amount.gt(0)) rows.push({period, id: series.id, amount}); }
    for (const series of loans) { const amount = loanByPeriod.get(period)!.times(loanShare(series)); if (amount.gt(0)) rows.push({period, id: series.id, amount}); }
  }
  const totalByPeriod = (period: string) => rows.filter((row) => row.period === period).reduce((sum, row) => sum.plus(row.amount), d(0));
  for (const bucket of itrScheduleBuckets) {
    if (!totalByPeriod(bucket.period).minus(bucket.amount).abs().lte(1)) throw new Error(`bucket ${bucket.period} does not tie: ${totalByPeriod(bucket.period).toFixed()} vs ${bucket.amount}`);
  }
  return {rows, partials, totalByPeriod};
}
