/**
 * SYNTHETIC. A fictitious distributor ("Aurora") used to compile, render and pin the governed
 * credit materials. The facts and the parameters are the ones the case-materials, case-render and
 * case-export tests already used for Aurora, gathered in one place and extended just enough to
 * reach every compiled section: seven lenders with two covenants, three audited years, an interim
 * position with its last-twelve-months EBITDA (which anchors the headline metrics), six ranked
 * customers with a tie for the largest share, an adjusted EBITDA, projections
 * with a minimum DSCR, a project cost and the ownership of the company. Nothing here is a real
 * company, a real lender relationship or a real number, and no production path may read it.
 */

export type SyntheticFact = {readonly fieldPath: string; readonly value: string};

const lenders = [
  ["Banco Itaú", "9840000", "CDI + 4,10% a.a.", "2027-11-20", "Mensal", "Duplicatas 130%", "Dívida líquida/EBITDA <= 3,0x"],
  ["Banco Bradesco", "7500000", "CDI + 3,85% a.a.", "2028-04-15", "Mensal com 6m carência", "Aval dos sócios", "Dívida líquida/EBITDA <= 3,25x"],
  ["Banco Santander", "6260000", "CDI + 4,45% a.a.", "2027-03-10", "Mensal", "Duplicatas 125%", ""],
  ["Banco do Brasil", "5180000", "TLP + 2,90% a.a.", "2030-08-01", "Mensal", "Alienação fiduciária da frota", ""],
  ["Sicredi", "4120000", "CDI + 5,20% a.a.", "2027-06-30", "Mensal", "Aval dos sócios", ""],
  ["BTG Pactual", "3780000", "1,42% a.m.", "2026-12-20", "No vencimento", "Recebíveis cedidos", ""],
  ["Banco Volkswagen", "1820000", "1,18% a.m.", "2029-02-15", "Mensal", "Alienação fiduciária de 11 veículos", ""],
] as const;

const facts: readonly SyntheticFact[] = [
  {fieldPath: "company.legal_name", value: "Aurora Distribuidora de Materiais de Construção Ltda"},
  {fieldPath: "company.sector", value: "Distribuição de materiais de construção"},
  {fieldPath: "company.founded_year", value: "2004"},
  {fieldPath: "company.city", value: "São José dos Campos (SP)"},
  {fieldPath: "company.employees", value: "214"},
  {fieldPath: "company.controllers.1.name", value: "Helena Bastos Corrêa"},
  {fieldPath: "company.controllers.1.ownership_pct", value: "0.52"},
  {fieldPath: "company.controllers.2.name", value: "Rafael Bastos Corrêa"},
  {fieldPath: "company.controllers.2.ownership_pct", value: "0.33"},
  {fieldPath: "company.controllers.3.name", value: "Participações Vale do Paraíba Ltda"},
  {fieldPath: "company.controllers.3.ownership_pct", value: "0.15"},
  {fieldPath: "company.auditor.firm", value: "Auditoria Sintética Independentes"},
  {fieldPath: "company.auditor.opinion", value: "sem ressalvas"},
  {fieldPath: "company.management.1.name", value: "Helena Bastos Corrêa"},
  {fieldPath: "company.management.1.title", value: "Diretora-presidente"},
  // The list is the ranking the source declares; the fourth ties the first for the largest share.
  {fieldPath: "customers.top_customers.1.share_pct", value: "0.181"},
  {fieldPath: "customers.top_customers.2.share_pct", value: "0.12"},
  {fieldPath: "customers.top_customers.3.share_pct", value: "0.095"},
  {fieldPath: "customers.top_customers.4.share_pct", value: "0.181"},
  {fieldPath: "customers.top_customers.5.share_pct", value: "0.05"},
  {fieldPath: "customers.top_customers.6.share_pct", value: "0.04"},
  {fieldPath: "customers.contract_terms", value: "Contratos de fornecimento de 12 meses, renováveis, rescindíveis com 90 dias de aviso."},
  {fieldPath: "customers.seasonality", value: "Receita concentrada entre março e novembro."},
  {fieldPath: "historical_financials.2023.revenue", value: "142800000"},
  {fieldPath: "historical_financials.2023.ebitda", value: "12710000"},
  {fieldPath: "historical_financials.2024.revenue", value: "168400000"},
  {fieldPath: "historical_financials.2024.ebitda", value: "14924000"},
  {fieldPath: "historical_financials.2025.revenue", value: "191200000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "16848000"},
  {fieldPath: "historical_financials.2025.adjusted_ebitda", value: "17420000"},
  {fieldPath: "historical_financials.2025.cogs", value: "143400000"},
  {fieldPath: "historical_financials.2025.cash", value: "8420000"},
  {fieldPath: "historical_financials.2025.receivables", value: "47310000"},
  {fieldPath: "historical_financials.2025.inventory", value: "39880000"},
  {fieldPath: "historical_financials.2025.payables", value: "33540000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "45320000"},
  {fieldPath: "interim_financials.2026_07.revenue_7m", value: "121640000"},
  {fieldPath: "interim_financials.2026_07.cash", value: "7960000"},
  {fieldPath: "interim_financials.2026_07.receivables", value: "51940000"},
  {fieldPath: "interim_financials.2026_07.ebitda_ltm", value: "17380000"},
  {fieldPath: "debt.total_gross", value: "45320000"},
  ...lenders.flatMap(([lender, balance, rate, maturity, amortization, collateral, covenant], index) => {
    const n = index + 1;
    return [
      {fieldPath: `debt.instruments.${n}.lender`, value: lender},
      {fieldPath: `debt.instruments.${n}.balance`, value: balance},
      {fieldPath: `debt.instruments.${n}.rate`, value: rate},
      {fieldPath: `debt.instruments.${n}.maturity`, value: maturity},
      {fieldPath: `debt.instruments.${n}.amortization`, value: amortization},
      {fieldPath: `debt.instruments.${n}.collateral`, value: collateral},
      ...(covenant ? [{fieldPath: `debt.instruments.${n}.covenants`, value: covenant}] : []),
    ];
  }),
  {fieldPath: "transaction.requested_amount", value: "42300000"},
  {fieldPath: "transaction.desired_term_months", value: "48"},
  {fieldPath: "transaction.desired_grace_months", value: "6"},
  {fieldPath: "transaction.expected_rate", value: "CDI + 4,00% a.a."},
  {fieldPath: "transaction.use_of_proceeds.1.item", value: "Capital de giro (reforço do ciclo de recebíveis)"},
  {fieldPath: "transaction.use_of_proceeds.1.amount", value: "25000000"},
  {fieldPath: "projections.2026.revenue", value: "208500000"},
  ...[["2026", "18760000"], ["2027", "22270000"], ["2028", "26320000"], ["2029", "29510000"], ["2030", "32490000"]].map(([year, ebitda]) => ({
    fieldPath: `projections.${year}.ebitda`, value: ebitda!,
  })),
  {fieldPath: "projections.minimum_dscr", value: "1.385"},
  {fieldPath: "projections.key_assumptions.1.driver", value: "Crescimento de volume"},
  {fieldPath: "projections.key_assumptions.1.value", value: "9% a.a."},
  {fieldPath: "project.total_cost", value: "18650000"},
];

/** One institutional scenario period as the approved statements print it; the ratios carry the rounding the tables apply. */
export type SyntheticStatementPeriod = {
  readonly period: string; readonly revenue: string; readonly ebitda: string; readonly netIncome: string; readonly totalAssets: string;
  readonly totalLiabilitiesAndEquity: string; readonly cfads: string; readonly closingGrossDebt: string; readonly unrestrictedCash: string;
  readonly balanceCheck: string; readonly netDebt: string; readonly netDebtToEbitda: string | null; readonly dscr: string | null;
  readonly interestCoverage: string | null; readonly debtService: string; readonly liquidityHeadroom: string;
};

export const syntheticCreditMaterialsCase = {
  synthetic: true as const,
  companyName: "Aurora Distribuidora de Materiais de Construção Ltda",
  referenceDate: "2026-08-21",
  issuedOn: "2026-08-21",
  indexLevels: {cdi: "0.105", tlp: "0.079", ipca: "0.045", tr: "0.002"},
  statedRequest: {amount: "40000000"},
  facts,
  /** Gross debt on the balance sheet for the three reconciliation outcomes of the debt schedule (sum 38,500,000). */
  grossDebtVariants: {balanceAboveSchedule: "45320000", withinTolerance: "38900000", scheduleAboveBalance: "36000000"},
  capacity: {archetypeId: "growth_expansion" as const, requested: "42300000", cfads: "16848000", adjustedEbitda: "16848000", existingNetDebt: "36900000", annualDebtServiceFactor: "0.40"},
  termSheet: {archetypeId: "growth_expansion" as const, requestedTermMonths: 48, requestedGraceMonths: 6, expectedRate: "CDI + 4,00% a.a."},
  rating: {financialExpenses: "6140000", priorEbitda: "14924000", topCustomerShare: "0.181", evidenceRank: "1.8"},
  stress: {revenue: "191200000", topCustomerShare: "0.181"},
  instruments: {legalForm: "ltda" as const, amount: "42300000"},
  collateral: {assets: [{description: "Recebíveis", type: "receivables" as const, value: "51940000", encumbered: "24400000"}], amount: "42300000"},
  price: {instrument: "ccb" as const, rating: "watch" as const, cdi: "0.105", tenorMonths: 48, collateralCoverage: "1.25", amount: "42300000"},
  operation: {amount: "42300000", termMonths: 48, graceMonths: 6, instrument: "CCB"},
  /** The deliverable workbook entry of the package: its compiled fingerprint and editable assumptions. */
  financialModel: {
    artifactFingerprint: "5".repeat(64),
    periods: ["2026", "2027", "2028", "2029", "2030"],
    sheetNames: {pt: ["Premissas", "Resultado", "Dívida"], en: ["Assumptions", "Results", "Debt"]},
    deskAssumptions: ["taxa_de_juros", "crescimento", "margem"],
    selectedAlternativeId: "target-structure",
    amount: "42300000",
    termMonths: 48,
    graceMonths: 6,
    supportIds: ["transaction.requested_amount", "projections.2026.ebitda"],
  },
  /**
   * Approved statements of one scenario, with ratios carrying more decimals than the tables print,
   * one ratio exactly on a tie that binary floating point also represents exactly (3.125), a negative
   * ratio and a missing one.
   */
  institutionalScenario: {
    name: "Cenário aprovado sintético",
    currency: "BRL",
    periods: [
      {period: "2026", revenue: "208500000", ebitda: "18760000", netIncome: "7412500.5", totalAssets: "151200000", totalLiabilitiesAndEquity: "151200000",
        cfads: "12450000.75", closingGrossDebt: "58620000", unrestrictedCash: "9310000", balanceCheck: "0", netDebt: "49310000",
        netDebtToEbitda: "2.62846481", dscr: "1.00612", interestCoverage: "2.67891", debtService: "12388059.7", liquidityHeadroom: "3120000"},
      {period: "2027", revenue: "231400000", ebitda: "22270000", netIncome: "9876543.21", totalAssets: "163900000", totalLiabilitiesAndEquity: "163900000",
        cfads: "15210000", closingGrossDebt: "54180000", unrestrictedCash: "11940000", balanceCheck: "0", netDebt: "42240000",
        netDebtToEbitda: "1.89672205", dscr: "1.23456789", interestCoverage: "3.125", debtService: "12320000", liquidityHeadroom: "5480000"},
      {period: "2028", revenue: "254100000", ebitda: "26320000", netIncome: "-1250000", totalAssets: "171300000", totalLiabilitiesAndEquity: "171300000",
        cfads: "-3290000.4", closingGrossDebt: "49740000", unrestrictedCash: "4120000", balanceCheck: "0", netDebt: "45620000",
        netDebtToEbitda: "-0.12817", dscr: null, interestCoverage: "0.994999", debtService: "11890000", liquidityHeadroom: "-760000"},
    ] satisfies readonly SyntheticStatementPeriod[],
  },
};
