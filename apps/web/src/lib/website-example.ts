import {calculateAdjustedEbitda, calculateLeverage} from "@offroad/financial-core";
import {supermarketFixture} from "@offroad/testing-fixtures";
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
