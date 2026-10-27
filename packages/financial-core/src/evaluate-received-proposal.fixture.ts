import type {ReceivedProposalInput} from "./evaluate-received-proposal";

/** Aurora Alimentos and the Itaú term sheet of ficha 1 (synthetic), with the corrections of fichas C32,
 * A05 and C09: the indenture basket of R$ 15 mi is aggregate and R$ 12 mi of it is the Bradesco
 * assignment; retailer A (32% of the portfolio) forbids assignment; the indenture covenant is 3.0x
 * (2023 amendment) and the board policy 2.5x. The company without the proposal, quarter by quarter, is
 * the C32 oracle's "keep and roll" route (modelo_aurora_c32.py), base and bank case. BRL millions.
 * Synthetic calibration, never a production parameter. */
export const auroraPeriodEnds = ["2026-09-30", "2026-12-31", "2027-03-31", "2027-06-30", "2027-09-30", "2027-12-31", "2028-03-31", "2028-06-30", "2028-09-30", "2028-12-31"];
export const auroraBankCase = {
  closingCash: ["39.430246", "-12.2166881", "12.02020387", "-9.87983937", "-48.72005072", "-85.93699927", "-55.72208823", "-66.59216361", "-61.51231404", "-81.40670829"],
  measurements: [{date: "2026-12-31", debt: "111.66666667", cash: "-12.2166881", reportedEbitda: "52.4"}, {date: "2027-06-30", debt: "93.33333333", cash: "-9.87983937", reportedEbitda: "49.625"},
    {date: "2027-12-31", debt: "35", cash: "-85.93699927", reportedEbitda: "50.8725"}, {date: "2028-06-30", debt: "16.66666667", cash: "-66.59216361", reportedEbitda: "54.1875"},
    {date: "2028-12-31", debt: "13.33333333", cash: "-81.40670829", reportedEbitda: "55.08"}],
};
export function auroraReceivedProposal(): ReceivedProposalInput {
  const measurement = (scenario: string, m: {date: string; debt: string; cash: string; reportedEbitda: string}) => ({...m, scenario, definitionAdjustment: "-3"});
  return {
    currency: "BRL", readingDate: "2026-08-14", needDate: "2026-10-01",
    proposal: {lender: "Itaú", indexer: "cdi_plus", firmness: "indicative", termSheetDate: "2026-08-14", validityDays: 30,
      amount: "30", annualSpread: "0.021", feeRate: "0.008", drawDate: "2026-10-01", paymentDay: 1,
      graceMonths: 6, installments: 30, installmentEveryMonths: 1, interestEveryMonths: 1, amortization: "sac",
      collateralKind: "receivables_assignment", coverage: "1.3", restrictedAccount: true,
      covenant: {maximumRatio: "3", testDates: ["2026-12-31", "2027-06-30", "2027-12-31", "2028-06-30", "2028-12-31"], definition: "not_stated"},
      prepayment: {penaltyRate: "0.01", penaltyMonths: 12}, reciprocity: "none_stated", bankSawIndenture: false},
    creditTax: {fixedRate: "0.0038", dailyRate: "0.000082", maxDays: 365},
    indexCurve: [{year: 2026, annualRate: "0.149"}, {year: 2027, annualRate: "0.14"}, {year: 2028, annualRate: "0.1275"}, {year: 2029, annualRate: "0.12"}],
    tax: {regime: "lucro_real", rate: "0.34"},
    uses: [{id: "safra", label: "Compra de safra de outubro a dezembro", amount: "20", kind: "seasonal_working_capital", tenorMinYears: "0.25", tenorMaxYears: "0.5"},
      {id: "embalagem", label: "Antecipar a linha de embalagem", amount: "10", kind: "long_lived_capex", tenorMinYears: "5", tenorMaxYears: "10"}],
    seasonalPeak: "25",
    calendar: {openingDate: "2026-06-30", periodEnds: auroraPeriodEnds,
      existingService: ["4.02951219", "24.07254049", "3.86960366", "22.45057503", "43.79155462", "19.56780381", "2.11544869", "18.19399222", "2.03739965", "1.99837512"],
      availableForService: ["8.45975819", "8.81160639", "8.49249563", "8.98603179", "9.29079327", "8.91505526", "8.93415973", "8.92771685", "8.72104921", "8.70778087"],
      closingCash: ["39.430246", "-10.8306881", "14.79220387", "-5.67233937", "-42.97310072", "-78.62584927", "-46.80713823", "-56.07341361", "-49.38976404", "-67.68035829"],
      taxable: auroraPeriodEnds.map(() => true), minimumCash: "15"},
    covenant: {indenture: {maximumRatio: "3", testDates: ["2026-12-31", "2027-12-31", "2028-12-31"], source: "Escritura de 2021 com o aditamento de 2023"},
      policy: {maximumRatio: "2.5", testDates: ["2026-12-31", "2027-12-31", "2028-12-31"], source: "Ata do conselho de março de 2026"},
      requiredScenarios: ["base", "bank"],
      measurements: [
        measurement("base", {date: "2026-12-31", debt: "111.66666667", cash: "-10.8306881", reportedEbitda: "54.5"}),
        measurement("base", {date: "2027-06-30", debt: "93.33333333", cash: "-5.67233937", reportedEbitda: "56"}),
        measurement("base", {date: "2027-12-31", debt: "35", cash: "-78.62584927", reportedEbitda: "59.85"}),
        measurement("base", {date: "2028-06-30", debt: "16.66666667", cash: "-56.07341361", reportedEbitda: "63.75"}),
        measurement("base", {date: "2028-12-31", debt: "13.33333333", cash: "-67.68035829", reportedEbitda: "64.8"}),
        ...auroraBankCase.measurements.map((m) => measurement("bank", m))]},
    portfolio: [
      {id: "rede-a", label: "Rede A (maior cliente)", amount: "18.56", contract: "prohibited_without_consent", encumbrance: "free", holder: null, pastDue: false, countsAgainstBasket: false},
      {id: "redes-c-d", label: "Contratos de dois clientes cedidos ao Bradesco", amount: "12", contract: "assignable", encumbrance: "assigned", holder: "Bradesco", pastDue: false, countsAgainstBasket: true},
      {id: "vencidos", label: "Atraso acima de 30 dias", amount: "2.03", contract: "assignable", encumbrance: "free", holder: null, pastDue: true, countsAgainstBasket: false},
      {id: "demais", label: "Demais clientes em dia", amount: "25.41", contract: "assignable", encumbrance: "free", holder: null, pastDue: false, countsAgainstBasket: false}],
    basket: {limit: "15", basis: "aggregate", occupied: "12", consentLeadDaysMin: 20, consentLeadDaysMax: 30},
    collateralReference: {coverageLow: "1.2", coverageHigh: "1.3"},
    market: {comparable: true, low: "0.017", median: "0.019", high: "0.022", sample: 12, confidence: "high", observedOn: "2026-08-14"},
    history: {label: "CCB Bradesco de setembro de 2024", spread: "0.026", date: "2024-09-15", adjustments: [
      {id: "mercado", family: "pricing_date", bps: "-60", anchor: "Referência do perfil em 2024 e hoje (objeto de mercado)"},
      {id: "risco", family: "other", bps: "15", anchor: "Alavancagem de 1,4x para cerca de 2,4x"},
      {id: "estrutura", family: "guarantee", bps: "-25", anchor: "Cessão rotativa a 130% com conta vinculada contra contratos a 80% sem conta"}]},
    variants: [
      {id: "carencia-12-prazo-48", label: "Carência de 12 meses e prazo de 48", graceMonths: 12, installments: 36, coverage: "1.3", restrictedAccount: true},
      {id: "carencia-12-prazo-60", label: "Carência de 12 meses e prazo de 60", graceMonths: 12, installments: 48, coverage: "1.3", restrictedAccount: true},
      {id: "cobertura-120-sem-conta", label: "Cobertura de 120% sem conta vinculada", graceMonths: 6, installments: 30, coverage: "1.2", restrictedAccount: false}],
    alternatives: [
      {id: "giro-seis-meses", label: "Linha de giro de seis meses para a safra", allInSpread: "0.068", collateral: "3", usesCovered: ["safra"], monthsToMoneyMin: 0, monthsToMoneyMax: 1},
      {id: "finame-linha", label: "Finame para a linha de embalagem", allInSpread: null, collateral: "0", usesCovered: ["embalagem"], monthsToMoneyMin: 3, monthsToMoneyMax: 5}],
  };
}
