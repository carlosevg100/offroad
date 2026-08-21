/**
 * Nimbus's desk state, built from her facts without a database: the cash-burning profile on
 * the development preview, beside Aurora's. Never imported by production code.
 */
import {analyzeCreditPosition, buildDeskInputs, projectLeverageTrajectory, questionsForCompany, type Fact} from "@offroad/credit-analysis";

export const nimbusFacts: Fact[] = [
  {fieldPath: "historical_financials.2024.revenue", value: "16100000"},
  {fieldPath: "historical_financials.2024.ebitda", value: "-14800000"},
  {fieldPath: "historical_financials.2025.revenue", value: "28600000"},
  {fieldPath: "historical_financials.2025.cogs", value: "7150000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "-19400000"},
  {fieldPath: "historical_financials.2025.cash", value: "36400000"},
  {fieldPath: "historical_financials.2025.receivables", value: "3700000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "3500000"},
  {fieldPath: "interim_financials.2026_07.revenue_7m", value: "21900000"},
  {fieldPath: "interim_financials.2026_07.ebitda_7m", value: "-12600000"},
  {fieldPath: "interim_financials.2026_07.cash", value: "24100000"},
  {fieldPath: "interim_financials.2026_07.receivables", value: "4900000"},
  {fieldPath: "interim_financials.2026_07.gross_debt", value: "3200000"},
  {fieldPath: "interim_financials.2026_07.arr", value: "37326000"},
  {fieldPath: "interim_financials.2026_07.mrr", value: "3110500"},
  {fieldPath: "interim_financials.2026_07.monthly_burn", value: "1850000"},
  {fieldPath: "company.runway_months", value: "16"},
  {fieldPath: "company.net_revenue_retention", value: "1.152"},
  {fieldPath: "company.last_equity_round.amount", value: "48000000"},
  {fieldPath: "company.last_equity_round.date", value: "2025-03-14"},
  {fieldPath: "customers.top_customers.1.share_pct", value: "0.068"},
  {fieldPath: "debt.instruments.1.lender", value: "FINEP"},
  {fieldPath: "debt.instruments.1.balance", value: "3200000"},
  {fieldPath: "debt.instruments.1.rate", value: "TR + 5,00% a.a."},
  {fieldPath: "debt.instruments.1.maturity", value: "2029-06-15"},
  {fieldPath: "debt.instruments.1.amortization", value: "Mensal com 24m carência"},
  {fieldPath: "transaction.requested_amount", value: "15000000"},
  {fieldPath: "transaction.desired_term_months", value: "36"},
  {fieldPath: "transaction.desired_grace_months", value: "12"},
];

export function nimbusDeskState() {
  const inputs = buildDeskInputs(nimbusFacts, {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105", tlp: "0.079", ipca: "0.045", tr: "0.002"}});
  const desk = inputs.desk ? analyzeCreditPosition(inputs.desk) : null;
  const trajectory = inputs.trajectory ? projectLeverageTrajectory(inputs.trajectory) : null;
  return {desk, trajectory, deskMissing: inputs.missing, clientQuestions: questionsForCompany(desk, trajectory, inputs.missing)};
}
