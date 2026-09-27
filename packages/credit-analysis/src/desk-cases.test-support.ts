import type {DeskInput} from "./analyze";
import {buildDeskInputs, type Fact} from "./from-facts";
import type {TrajectoryInput} from "./trajectory";
import {deskRuns} from "./verdict-cases.test-support";

/**
 * Every input the desk battery, the leverage trajectory and the questions to the company are pinned
 * on (stage 19, post-closure polish). Test support only:
 *
 * - the six distinct desks of the twelve verdict runs (the gold answer keys of Camil, Fakeco, Nimbus
 *   and Rede Horizonte, the simulated ask of Camil and the synthetic Aurora case), with their
 *   trajectories and the trajectories the verdict re-ran for the bigger ticket;
 * - the fixtures the package's own tests read (Aurora as the truth file states her, the Series A
 *   startup and its short-runway variant, the listed company, the maturity profile of a note), and
 *   synthetic inputs that reach the findings no fixture reaches, so that every sentence and every
 *   figure of the battery and of the trajectory is pinned;
 * - the case with no desk at all, where the questions degrade to document requests.
 */

export type DeskCase = {desk: DeskInput | null; trajectory: TrajectoryInput | null; missing: string[]};

const fromFacts = (facts: Fact[], options: Parameters<typeof buildDeskInputs>[1]): DeskCase => {
  const inputs = buildDeskInputs(facts, options);
  return {desk: inputs.desk, trajectory: inputs.trajectory, missing: inputs.missing};
};

/** Aurora Distribuidora, as the truth file states her (the package's unit fixture). */
const auroraDesk = (): DeskInput => ({
  indexLevels: {cdi: "0.105", tlp: "0.079"},
  referenceDate: "2026-08-21",
  audited: {year: 2025, revenue: "191200000", ebitda: "16848000", cogs: "143400000"},
  balance: {periodEnd: "2025-12-31", cash: "8420000", receivables: "47310000", inventory: "39880000", suppliers: "33540000", grossDebt: "45320000"},
  interim: {periodEnd: "2026-07-31", months: 7, revenue: "121640000", receivables: "51940000"},
  debt: [
    {lender: "Banco Itaú", balance: "9840000", rate: "CDI + 4,10% a.a.", maturity: "2027-11-20", collateral: "Duplicatas 130%", covenant: "Dívida líquida/EBITDA <= 3,0x"},
    {lender: "Banco Bradesco", balance: "7500000", rate: "CDI + 3,85% a.a.", maturity: "2028-04-15", collateral: "Aval dos sócios", covenant: "Dívida líquida/EBITDA <= 3,25x"},
    {lender: "Banco Santander", balance: "6260000", rate: "CDI + 4,45% a.a.", maturity: "2027-03-10", collateral: "Duplicatas 125%"},
    {lender: "Banco do Brasil", balance: "5180000", rate: "TLP + 2,90% a.a.", maturity: "2030-08-01", collateral: "Alienação fiduciária da frota"},
    {lender: "Sicredi", balance: "4120000", rate: "CDI + 5,20% a.a.", maturity: "2027-06-30", collateral: "Aval dos sócios"},
    {lender: "BTG Pactual", balance: "3780000", rate: "1,42% a.m.", maturity: "2026-12-20", collateral: "Recebíveis cedidos"},
    {lender: "Banco Volkswagen", balance: "1820000", rate: "1,18% a.m.", maturity: "2029-02-15", collateral: "Alienação fiduciária de 11 veículos"},
  ],
  request: {
    amounts: [{value: "40000000", source: "carta do CFO"}, {value: "42300000", source: "plano do projeto"}],
    termMonths: 48,
    graceMonths: 6,
    rateAsk: "CDI + 4,00% a.a.",
    workingCapitalAsk: "25000000",
  },
  project: {operationDate: "2027-09-01"},
  projectedNextYear: {year: 2026, revenue: "208500000"},
});

/** Aurora's trajectory, as the package's trajectory test states it. */
const auroraTrajectory = (): TrajectoryInput => ({
  referenceDate: "2026-08-21",
  cash: "8420000",
  existing: [
    {lender: "Banco Itaú", balance: "9840000", maturity: "2027-11-20", amortization: "Mensal", hasCovenant: true},
    {lender: "Banco Bradesco", balance: "7500000", maturity: "2028-04-15", amortization: "Mensal com 6m carência", hasCovenant: true},
    {lender: "Banco Santander", balance: "6260000", maturity: "2027-03-10", amortization: "Mensal"},
    {lender: "Banco do Brasil", balance: "5180000", maturity: "2030-08-01", amortization: "Mensal"},
    {lender: "Sicredi", balance: "4120000", maturity: "2027-06-30", amortization: "Mensal"},
    {lender: "BTG Pactual", balance: "3780000", maturity: "2026-12-20", amortization: "No vencimento"},
    {lender: "Banco Volkswagen", balance: "1820000", maturity: "2029-02-15", amortization: "Mensal"},
  ],
  newDebt: {amount: "42300000", termMonths: 48, graceMonths: 6},
  auditedEbitda: "16848000",
  projectedEbitda: [
    {year: 2026, ebitda: "18760000"},
    {year: 2027, ebitda: "22270000"},
    {year: 2028, ebitda: "26320000"},
    {year: 2029, ebitda: "29510000"},
    {year: 2030, ebitda: "32490000"},
  ],
  existingCovenants: [
    {lender: "Banco Itaú", maximum: "3.0"},
    {lender: "Banco Bradesco", maximum: "3.25"},
  ],
});

/** The Aurora facts the questions test reads, with a stated request that diverges from the room. */
const auroraQuestionFacts: Fact[] = [
  {fieldPath: "historical_financials.2025.revenue", value: "191200000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "16848000"},
  {fieldPath: "historical_financials.2025.cogs", value: "143400000"},
  {fieldPath: "historical_financials.2025.cash", value: "8420000"},
  {fieldPath: "historical_financials.2025.receivables", value: "47310000"},
  {fieldPath: "historical_financials.2025.inventory", value: "39880000"},
  {fieldPath: "historical_financials.2025.payables", value: "33540000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "45320000"},
  {fieldPath: "debt.instruments.1.lender", value: "Banco Itaú"},
  {fieldPath: "debt.instruments.1.balance", value: "9840000"},
  {fieldPath: "debt.instruments.1.covenants", value: "Dívida líquida/EBITDA <= 3,0x"},
  {fieldPath: "transaction.requested_amount", value: "42300000"},
  {fieldPath: "transaction.desired_term_months", value: "48"},
  {fieldPath: "transaction.desired_grace_months", value: "6"},
  {fieldPath: "transaction.use_of_proceeds.1.item", value: "Capital de giro"},
  {fieldPath: "transaction.use_of_proceeds.1.amount", value: "25000000"},
  {fieldPath: "projections.2026.revenue", value: "208500000"},
  {fieldPath: "projections.2026.ebitda", value: "18760000"},
];

/** The Series A startup of the venture test: the desk reads runway, not turns. */
const nimbusFacts: Fact[] = [
  {fieldPath: "historical_financials.2025.revenue", value: "28600000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "-19400000"},
  {fieldPath: "historical_financials.2025.cash", value: "36400000"},
  {fieldPath: "historical_financials.2025.receivables", value: "3700000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "3500000"},
  {fieldPath: "interim_financials.2026_07.revenue_7m", value: "21900000"},
  {fieldPath: "interim_financials.2026_07.cash", value: "24100000"},
  {fieldPath: "interim_financials.2026_07.receivables", value: "4900000"},
  {fieldPath: "interim_financials.2026_07.gross_debt", value: "3200000"},
  {fieldPath: "interim_financials.2026_07.arr", value: "37326000"},
  {fieldPath: "interim_financials.2026_07.monthly_burn", value: "1850000"},
  {fieldPath: "company.runway_months", value: "16"},
  {fieldPath: "company.net_revenue_retention", value: "0.93"},
  {fieldPath: "customers.top_customers.1.share_pct", value: "0.24"},
  {fieldPath: "debt.instruments.1.lender", value: "FINEP"},
  {fieldPath: "debt.instruments.1.balance", value: "3200000"},
  {fieldPath: "debt.instruments.1.rate", value: "TR + 5,00% a.a."},
  {fieldPath: "debt.covenants.1.metric", value: "Dívida líquida / EBITDA"},
  {fieldPath: "debt.covenants.1.threshold", value: "3.0"},
  {fieldPath: "transaction.requested_amount", value: "15000000"},
  {fieldPath: "transaction.desired_term_months", value: "36"},
  {fieldPath: "transaction.desired_grace_months", value: "12"},
  {fieldPath: "projections.2026.ebitda", value: "-10000000"},
  {fieldPath: "projections.2027.ebitda", value: "2000000"},
];
const nimbusOptions = {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105", tlp: "0.079", ipca: "0.045", tr: "0.002"}};

/** The listed company of the listed-company test. */
const camilFacts: Fact[] = [
  {fieldPath: "historical_financials.2025.revenue", value: "11115000000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "915300000"},
  {fieldPath: "historical_financials.2025.cogs", value: "8622700000"},
  {fieldPath: "historical_financials.2025.cash", value: "1997608000"},
  {fieldPath: "historical_financials.2025.receivables", value: "1019433000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "4988383000"},
  {fieldPath: "interim_financials.2026_05.revenue_3m", value: "2667975000"},
  {fieldPath: "interim_financials.2026_05.cash", value: "1430714000"},
  {fieldPath: "interim_financials.2026_05.receivables", value: "1881602000"},
  {fieldPath: "interim_financials.2026_05.gross_debt", value: "5670186000"},
  {fieldPath: "debt.instruments.1.lender", value: "Bancos (capital de giro)"},
  {fieldPath: "debt.instruments.1.balance", value: "2417000000"},
  {fieldPath: "debt.instruments.2.lender", value: "14ª emissão, 1ª série"},
  {fieldPath: "debt.instruments.2.balance", value: "438918000"},
  {fieldPath: "debt.instruments.2.rate", value: "104% do DI"},
  {fieldPath: "debt.instruments.2.maturity", value: "2029-06-15"},
  {fieldPath: "debt.instruments.3.lender", value: "15ª emissão, 2ª série"},
  {fieldPath: "debt.instruments.3.balance", value: "408703000"},
  {fieldPath: "debt.instruments.3.rate", value: "14,15% a.a. pré"},
  {fieldPath: "debt.instruments.3.maturity", value: "2032-11-12"},
  {fieldPath: "debt.instruments.4.lender", value: "13ª emissão, 2ª série"},
  {fieldPath: "debt.instruments.4.balance", value: "282357000"},
  {fieldPath: "debt.instruments.4.rate", value: "IPCA + 6,3416% a.a."},
  {fieldPath: "debt.instruments.4.maturity", value: "2030-11-14"},
  {fieldPath: "debt.covenants.1.metric", value: "Dívida líquida / EBITDA"},
  {fieldPath: "debt.covenants.1.threshold", value: "4.0"},
  {fieldPath: "transaction.requested_amount", value: "1500000000"},
  {fieldPath: "transaction.desired_term_months", value: "84"},
  {fieldPath: "transaction.desired_grace_months", value: "24"},
  {fieldPath: "transaction.refinancing", value: "1229828000"},
];
const camilOptions = {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105", tlp: "0.079", ipca: "0.045"}};

/** A note's amortisation windows, when the lines carry no maturities (the maturity-profile test). */
const profileFacts: Fact[] = [
  {fieldPath: "historical_financials.2025.revenue", value: "11115000000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "915300000"},
  {fieldPath: "historical_financials.2025.cash", value: "1430714000"},
  {fieldPath: "historical_financials.2025.receivables", value: "1881602000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "5670186000"},
  {fieldPath: "debt.instruments.1.lender", value: "Bancos (capital de giro)"},
  {fieldPath: "debt.instruments.1.balance", value: "2417000000"},
  {fieldPath: "debt.instruments.2.lender", value: "Debêntures"},
  {fieldPath: "debt.instruments.2.balance", value: "3253186000"},
  {fieldPath: "debt.maturity_profile.1.window", value: "Jun/26 a Mai/27"},
  {fieldPath: "debt.maturity_profile.1.amount", value: "1229828000"},
  {fieldPath: "debt.maturity_profile.2.window", value: "Jun/27 a Mai/28"},
  {fieldPath: "debt.maturity_profile.2.amount", value: "776868000"},
  {fieldPath: "debt.maturity_profile.3.window", value: "Após Jun/31"},
  {fieldPath: "debt.maturity_profile.3.amount", value: "809198000"},
  {fieldPath: "transaction.requested_amount", value: "1500000000"},
];

/** Every path `buildDeskInputs` reports missing, as the no-desk case asks for them. */
const everyMissingPath = [
  "historical_financials.{ano}.revenue",
  "historical_financials.{ano}.ebitda",
  "historical_financials.{ano}.cash",
  "historical_financials.{ano}.gross_debt",
  "debt.instruments",
  "transaction.requested_amount",
  "projections.{ano}.ebitda",
  "transaction.desired_term_months",
  "transaction.desired_grace_months",
];

/** The desk cases by key. */
export function deskCases(): Record<string, DeskCase> {
  const cases: Record<string, DeskCase> = {};
  const runs = deskRuns();
  // Unpriced and priced runs share the desk; the priced ones add the trajectories the verdict re-ran.
  for (const [key, run] of Object.entries(runs)) {
    const base = key.replace(/:(?:unpriced|cra|ccb)$/, "").replace(/:cra:ask-800$/, ":ask-800");
    cases[base] ??= {desk: run.inputs.desk, trajectory: run.inputs.trajectory, missing: run.inputs.missing};
    run.simulations.forEach((simulated, index) => {
      cases[`${key}:simulation-${index + 1}`] = {desk: null, trajectory: simulated, missing: []};
    });
  }

  cases["unit:aurora"] = {desk: auroraDesk(), trajectory: auroraTrajectory(), missing: []};
  cases["unit:aurora-questions"] = fromFacts(auroraQuestionFacts, {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105"}, statedRequest: {amount: "40000000"}});
  const nimbus = fromFacts(nimbusFacts, nimbusOptions);
  cases["unit:nimbus"] = nimbus;
  cases["unit:nimbus-short-runway"] = {...nimbus, desk: {...nimbus.desk!, balance: {...nimbus.desk!.balance, cash: "14000000"}}};
  cases["unit:camil-listed"] = fromFacts(camilFacts, camilOptions);
  cases["unit:maturity-profile"] = fromFacts(profileFacts, {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105"}});
  cases["unit:no-desk"] = {desk: null, trajectory: null, missing: everyMissingPath};

  // Synthetic variants for the branches no fixture reaches.
  const aurora = auroraDesk();
  // The schedule above the balance sheet, and a line whose cost cannot be put on the common axis.
  cases["unit:aurora-schedule-above-balance"] = {desk: {...aurora, balance: {...aurora.balance, grossDebt: "36000000"}}, trajectory: null, missing: []};
  cases["unit:aurora-unpriced-lines"] = {desk: {...aurora, indexLevels: {cdi: "0.105"}, debt: [...aurora.debt, {lender: "Factoring local", balance: "900000", rate: "taxa combinada com o gerente"}]}, trajectory: null, missing: []};
  // Interest coverage under 1.5x at the rate asked, and between 1.5x and 2x at the stack's cost.
  cases["unit:aurora-thin-coverage-ask"] = {desk: {...aurora, audited: {...aurora.audited, financialExpenses: "9000000"}}, trajectory: null, missing: []};
  const requestWithoutRate = {...aurora.request};
  delete requestWithoutRate.rateAsk;
  cases["unit:aurora-thin-coverage-stack"] = {desk: {...aurora, audited: {...aurora.audited, financialExpenses: "-6000000"}, request: {...requestWithoutRate, amounts: [{value: "20000000", source: "carta do CFO"}]}}, trajectory: null, missing: []};
  // A runway between nine and twelve months, and a raise priced at the rate the company asks.
  cases["unit:nimbus-runway-under-twelve"] = {...nimbus, desk: {...nimbus.desk!, balance: {...nimbus.desk!.balance, cash: "20000000"}}};
  cases["unit:nimbus-rate-asked"] = {...nimbus, desk: {...nimbus.desk!, request: {...nimbus.desk!.request, rateAsk: "CDI + 6,00% a.a."}}};
  // The trajectory with EBITDA held at the audited level, a PRICE line, and a floor and cushion of its own.
  cases["unit:trajectory-held-flat"] = {desk: null, missing: [], trajectory: {
    ...auroraTrajectory(),
    ebitdaHeldFlat: true,
    projectedEbitda: [{year: 2026, ebitda: "16848000"}, {year: 2027, ebitda: "16848000"}, {year: 2028, ebitda: "16848000"}],
    existing: [...auroraTrajectory().existing, {lender: "Leasing PRICE", balance: "2500000", maturity: "2029-08-15", amortization: "Price"}],
    growthHaircut: "0.4",
    covenantCushion: "0.75",
    covenantFloor: "3",
  }};

  // Trajectories the package's trajectory test reads.
  cases["unit:trajectory-flat-line"] = {desk: null, trajectory: {...auroraTrajectory(), existing: [{lender: "Banco X", balance: "10000000"}], existingCovenants: []}, missing: []};
  cases["unit:trajectory-below-base"] = {desk: null, trajectory: {...auroraTrajectory(), projectedEbitda: [{year: 2026, ebitda: "15000000"}]}, missing: []};
  cases["unit:trajectory-nearest-first"] = {desk: null, missing: [], trajectory: {
    referenceDate: "2026-06-30", cash: "0", auditedEbitda: "500",
    projectedEbitda: [{year: 2027, ebitda: "500"}, {year: 2031, ebitda: "500"}],
    existing: [
      {lender: "Bilaterais 12m", balance: "1000", maturity: "2027-06-30", amortization: "mensal"},
      {lender: "Debênture 2031", balance: "1000", maturity: "2031-06-30", amortization: "bullet"},
    ],
    existingCovenants: [],
    newDebt: {amount: "1000", termMonths: 60, graceMonths: 12, refinancing: "1000"},
  }};
  cases["unit:trajectory-pure-swap"] = {desk: null, missing: [], trajectory: {
    referenceDate: "2026-06-30", cash: "1000", balanceGrossDebt: "5000", auditedEbitda: "1000",
    projectedEbitda: [{year: 2027, ebitda: "1000"}],
    existing: [{lender: "A", balance: "2600", maturity: "2027-06-30"}, {lender: "B", balance: "2500", maturity: "2031-06-30"}],
    existingCovenants: [],
    newDebt: {amount: "700", termMonths: 60, graceMonths: 12, refinancing: "700"},
  }};
  return cases;
}
