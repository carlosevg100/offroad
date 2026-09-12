import {calculateAdjustedEbitda, calculateLeverage} from "@offroad/financial-core";
import {supermarketFixture, websiteOfferFixture} from "@offroad/testing-fixtures";
import type {AppLocale} from "@/i18n/routing";
import type {FinancialBaseline} from "@/components/public-workbench";

/** Public fictional example. Financial calculations stay in the financial core. */
export function websiteFinancialBaseline(locale: AppLocale): FinancialBaseline {
  const metrics = supermarketFixture.metrics;
  const ebitda = calculateAdjustedEbitda(metrics.reportedEbitda, [...metrics.approvedAdjustments]);
  const adjustments = calculateAdjustedEbitda("0", [...metrics.approvedAdjustments]);
  const leverage = calculateLeverage(metrics.netDebt, ebitda.value);
  const amount = new Intl.NumberFormat(locale, {minimumFractionDigits: 1, maximumFractionDigits: 1});
  const ratio = new Intl.NumberFormat(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  return {
    reported: amount.format(Number(metrics.reportedEbitda)),
    adjustment: amount.format(Number(adjustments.value)),
    adjusted: amount.format(Number(ebitda.value)),
    debt: amount.format(Number(metrics.netDebt)),
    leverage: `${ratio.format(Number(leverage.value))}x`,
  };
}

/** Display formatting only. The synthetic score is a disclosed example, not an ML result. */
export function websiteOfferExample(locale: AppLocale) {
  const f = websiteOfferFixture;
  const n = new Intl.NumberFormat(locale, {maximumFractionDigits: 1});
  return {
    count: n.format(f.documentCount),
    receivables: n.format(f.receivablesBrlMillions),
    spread: n.format(f.ccbSpreadPercentagePoints),
    fund: f.lender.name,
    ticketMin: n.format(f.lender.ticketMinBrlMillions), ticketMax: n.format(f.lender.ticketMaxBrlMillions),
    minYears: n.format(f.lender.minYears), maxYears: n.format(f.lender.maxYears),
    concentrationLimit: n.format(f.lender.maxDebtorConcentrationPercent),
    concentration: n.format(f.transaction.debtorConcentrationPercent),
    amount: n.format(f.transaction.amountBrlMillions), years: n.format(f.transaction.termYears),
    score: f.score, scoreMaximum: f.scoreMaximum,
    criteria: f.criteria.map(criterion => ({...criterion})),
  };
}

export type WebsiteOfferExample = ReturnType<typeof websiteOfferExample>;
