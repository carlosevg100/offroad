/**
 * Aurora's desk state, built from her facts without a database.
 *
 * Used by the development-only preview so the desk panel can be looked at and iterated on
 * without uploading documents and waiting for a worker. Never imported by production code.
 */
import {analyzeCreditPosition, buildDeskInputs, projectLeverageTrajectory, questionsForCompany, type Fact} from "@offroad/credit-analysis";

const lines: Array<[string, string, string, string, string, string, string]> = [
  ["Banco Itaú", "9840000", "CDI + 4,10% a.a.", "2027-11-20", "Mensal", "Duplicatas 130%", "Dívida líquida/EBITDA <= 3,0x"],
  ["Banco Bradesco", "7500000", "CDI + 3,85% a.a.", "2028-04-15", "Mensal com 6m carência", "Aval dos sócios", "Dívida líquida/EBITDA <= 3,25x"],
  ["Banco Santander", "6260000", "CDI + 4,45% a.a.", "2027-03-10", "Mensal", "Duplicatas 125%", ""],
  ["Banco do Brasil", "5180000", "TLP + 2,90% a.a.", "2030-08-01", "Mensal", "Alienação fiduciária da frota", ""],
  ["Sicredi", "4120000", "CDI + 5,20% a.a.", "2027-06-30", "Mensal", "Aval dos sócios", ""],
  ["BTG Pactual", "3780000", "1,42% a.m.", "2026-12-20", "No vencimento", "Recebíveis cedidos", ""],
  ["Banco Volkswagen", "1820000", "1,18% a.m.", "2029-02-15", "Mensal", "Alienação fiduciária de 11 veículos", ""],
];

export const auroraFacts: Fact[] = [
  {fieldPath: "historical_financials.2025.revenue", value: "191200000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "16848000"},
  {fieldPath: "historical_financials.2025.cogs", value: "143400000"},
  {fieldPath: "historical_financials.2025.cash", value: "8420000"},
  {fieldPath: "historical_financials.2025.receivables", value: "47310000"},
  {fieldPath: "historical_financials.2025.inventory", value: "39880000"},
  {fieldPath: "historical_financials.2025.payables", value: "33540000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "45320000"},
  {fieldPath: "interim_financials.2026_07.revenue_7m", value: "121640000"},
  {fieldPath: "interim_financials.2026_07.receivables", value: "51940000"},
  ...lines.flatMap(([lender, balance, rate, maturity, amortization, collateral, covenants], index) => {
    const n = index + 1;
    return [
      {fieldPath: `debt.instruments.${n}.lender`, value: lender},
      {fieldPath: `debt.instruments.${n}.balance`, value: balance},
      {fieldPath: `debt.instruments.${n}.rate`, value: rate},
      {fieldPath: `debt.instruments.${n}.maturity`, value: maturity},
      {fieldPath: `debt.instruments.${n}.amortization`, value: amortization},
      {fieldPath: `debt.instruments.${n}.collateral`, value: collateral},
      ...(covenants ? [{fieldPath: `debt.instruments.${n}.covenants`, value: covenants}] : []),
    ];
  }),
  {fieldPath: "transaction.requested_amount", value: "42300000"},
  {fieldPath: "transaction.desired_term_months", value: "48"},
  {fieldPath: "transaction.desired_grace_months", value: "6"},
  {fieldPath: "transaction.expected_rate", value: "CDI + 4,00% a.a."},
  {fieldPath: "transaction.use_of_proceeds.1.item", value: "Capital de giro (reforço do ciclo de recebíveis)"},
  {fieldPath: "transaction.use_of_proceeds.1.amount", value: "25000000"},
  {fieldPath: "projections.2026.revenue", value: "208500000"},
  {fieldPath: "projections.2026.ebitda", value: "18760000"},
  {fieldPath: "projections.2027.ebitda", value: "22270000"},
  {fieldPath: "projections.2028.ebitda", value: "26320000"},
  {fieldPath: "projections.2029.ebitda", value: "29510000"},
  {fieldPath: "projections.2030.ebitda", value: "32490000"},
];

export function auroraDeskState() {
  const inputs = buildDeskInputs(auroraFacts, {
    referenceDate: "2026-08-21",
    indexLevels: {cdi: "0.105", tlp: "0.079", ipca: "0.045", tr: "0.002"},
    statedRequest: {amount: "40000000"},
  });
  const desk = inputs.desk ? analyzeCreditPosition(inputs.desk) : null;
  const trajectory = inputs.trajectory ? projectLeverageTrajectory(inputs.trajectory) : null;
  return {desk, trajectory, deskMissing: inputs.missing, clientQuestions: questionsForCompany(desk, trajectory, inputs.missing)};
}
