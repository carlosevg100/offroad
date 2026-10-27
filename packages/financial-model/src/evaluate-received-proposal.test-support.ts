import type {ReceivedProposalInput} from "@offroad/financial-core";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";
import type {AdoptedReceivedProposalInput} from "./adopted-evaluate-received-proposal";
import type {ReceivedProposalFacts} from "./evaluate-received-proposal-premises";

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
export const receivedProposalEndDate = "2028-12-31";
export const receivedProposalQuestion = "O Itaú mandou proposta de CCB de R$ 30 milhões, três anos, CDI mais 2,1, com cessão fiduciária de recebíveis. É boa?";

/** The same calibration as adopted contributions, field by field, in the paths the premises propose. */
export function auroraReceivedProposalBasis(k: ReceivedProposalInput = auroraReceivedProposal()) {
  const f = analysisTestBasis(`received_proposal.${id(95)}.`, k.calendar.openingDate, receivedProposalEndDate);
  const num = (p: string, unit: string, value: string | number) => f.contribute(p, unit, {type: "number", value: String(value)});
  const text = (p: string, value: string, unit = "text") => f.contribute(p, unit, {type: "text", value});
  const date = (p: string, value: string) => f.contribute(p, "date", {type: "date", value});
  const bool = (p: string, value: boolean) => f.contribute(p, "convention", {type: "boolean", value});
  const list = (p: string, unit: string, value: string[]) => f.contribute(p, unit, {type: "list", value});
  const p = k.proposal, c = k.calendar, v = k.covenant;
  const input = {...f.context, analysisId: id(95), scenario: "base", readingDate: date("readingDate", k.readingDate), needDate: date("needDate", k.needDate),
    proposal: {lender: text("proposal.lender", p.lender), indexer: text("proposal.indexer", p.indexer, "convention"), firmness: text("proposal.firmness", p.firmness, "convention"),
      termSheetDate: date("proposal.termSheetDate", p.termSheetDate), validityDays: num("proposal.validityDays", "days", p.validityDays), amount: num("proposal.amount", "currency", p.amount),
      annualSpread: num("proposal.annualSpread", "ratio", p.annualSpread), feeRate: num("proposal.feeRate", "ratio", p.feeRate), drawDate: date("proposal.drawDate", p.drawDate),
      paymentDay: num("proposal.paymentDay", "count", p.paymentDay), graceMonths: num("proposal.graceMonths", "count", p.graceMonths), installments: num("proposal.installments", "count", p.installments),
      installmentEveryMonths: num("proposal.installmentEveryMonths", "count", p.installmentEveryMonths), interestEveryMonths: num("proposal.interestEveryMonths", "count", p.interestEveryMonths),
      amortization: text("proposal.amortization", p.amortization, "convention"), collateralKind: text("proposal.collateralKind", p.collateralKind, "convention"),
      coverage: num("proposal.coverage", "ratio", p.coverage), restrictedAccount: bool("proposal.restrictedAccount", p.restrictedAccount),
      covenantLimit: p.covenant ? num("proposal.covenantLimit", "ratio", p.covenant.maximumRatio) : null,
      covenantTestDates: p.covenant ? list("proposal.covenantTestDates", "date", [...p.covenant.testDates]) : null,
      covenantDefinition: p.covenant ? text("proposal.covenantDefinition", p.covenant.definition, "convention") : null,
      prepaymentPenaltyRate: num("proposal.prepaymentPenaltyRate", "ratio", p.prepayment.penaltyRate), prepaymentPenaltyMonths: num("proposal.prepaymentPenaltyMonths", "count", p.prepayment.penaltyMonths),
      reciprocity: text("proposal.reciprocity", p.reciprocity, "convention"), bankSawIndenture: bool("proposal.bankSawIndenture", p.bankSawIndenture)},
    creditTax: {fixedRate: num("creditTax.fixedRate", "ratio", k.creditTax.fixedRate), dailyRate: num("creditTax.dailyRate", "ratio", k.creditTax.dailyRate), maxDays: num("creditTax.maxDays", "days", k.creditTax.maxDays)},
    curve: {years: list("curve.years", "identity", k.indexCurve.map((x) => String(x.year))), rates: list("curve.rates", "ratio", k.indexCurve.map((x) => x.annualRate))},
    tax: {regime: text("tax.regime", k.tax.regime, "convention"), rate: num("tax.rate", "ratio", k.tax.rate)},
    uses: k.uses.map((u) => {const q = `use.${u.id}.`; return {id: u.id, label: text(q + "label", u.label), amount: num(q + "amount", "currency", u.amount), kind: text(q + "kind", u.kind, "convention"),
      tenorMinYears: num(q + "tenorMinYears", "years", u.tenorMinYears), tenorMaxYears: num(q + "tenorMaxYears", "years", u.tenorMaxYears)};}),
    seasonalPeak: k.seasonalPeak === null ? null : num("seasonalPeak", "currency", k.seasonalPeak),
    calendar: {periodEnds: list("calendar.periodEnds", "date", [...c.periodEnds]), existingService: list("calendar.existingService", "currency", [...c.existingService]),
      availableForService: list("calendar.availableForService", "currency", [...c.availableForService]), closingCash: list("calendar.closingCash", "currency", [...c.closingCash]),
      taxable: list("calendar.taxable", "boolean", c.taxable.map(String)), minimumCash: c.minimumCash === null ? null : num("calendar.minimumCash", "currency", c.minimumCash)},
    covenant: {indentureLimit: num("covenant.indentureLimit", "ratio", v.indenture.maximumRatio), indentureTestDates: list("covenant.indentureTestDates", "date", [...v.indenture.testDates]),
      indentureSource: text("covenant.indentureSource", v.indenture.source), requiredScenarios: list("covenant.requiredScenarios", "identity", [...v.requiredScenarios]),
      policyLimit: v.policy ? num("covenant.policyLimit", "ratio", v.policy.maximumRatio) : null, policyTestDates: v.policy ? list("covenant.policyTestDates", "date", [...v.policy.testDates]) : null,
      policySource: v.policy ? text("covenant.policySource", v.policy.source) : null,
      dates: list("covenant.dates", "date", v.measurements.map((m) => m.date)), scenarios: list("covenant.scenarios", "identity", v.measurements.map((m) => m.scenario)),
      debt: list("covenant.debt", "currency", v.measurements.map((m) => m.debt)), cash: list("covenant.cash", "currency", v.measurements.map((m) => m.cash)),
      reportedEbitda: list("covenant.reportedEbitda", "currency", v.measurements.map((m) => m.reportedEbitda)),
      definitionAdjustment: list("covenant.definitionAdjustment", "currency", v.measurements.map((m) => m.definitionAdjustment))},
    portfolio: k.portfolio.map((b) => {const q = `bucket.${b.id}.`; return {id: b.id, label: text(q + "label", b.label), amount: num(q + "amount", "currency", b.amount),
      contract: text(q + "contract", b.contract, "convention"), encumbrance: text(q + "encumbrance", b.encumbrance, "convention"), holder: b.holder === null ? null : text(q + "holder", b.holder),
      pastDue: bool(q + "pastDue", b.pastDue), countsAgainstBasket: bool(q + "countsAgainstBasket", b.countsAgainstBasket)};}),
    basket: {limit: num("basket.limit", "currency", k.basket.limit), basis: text("basket.basis", k.basket.basis, "convention"), occupied: num("basket.occupied", "currency", k.basket.occupied),
      consentLeadDaysMin: num("basket.consentLeadDaysMin", "days", k.basket.consentLeadDaysMin), consentLeadDaysMax: num("basket.consentLeadDaysMax", "days", k.basket.consentLeadDaysMax)},
    collateralReference: {coverageLow: num("collateralReference.coverageLow", "ratio", k.collateralReference.coverageLow), coverageHigh: num("collateralReference.coverageHigh", "ratio", k.collateralReference.coverageHigh)},
    market: k.market === null ? null : {comparable: bool("market.comparable", k.market.comparable), low: num("market.low", "ratio", k.market.low), median: num("market.median", "ratio", k.market.median),
      high: num("market.high", "ratio", k.market.high), sample: num("market.sample", "count", k.market.sample), confidence: text("market.confidence", k.market.confidence, "convention"),
      observedOn: date("market.observedOn", k.market.observedOn)},
    history: k.history === null ? null : {label: text("history.label", k.history.label), spread: num("history.spread", "ratio", k.history.spread), date: date("history.date", k.history.date),
      adjustmentIds: list("history.adjustmentIds", "identity", k.history.adjustments.map((a) => a.id)), adjustmentFamilies: list("history.adjustmentFamilies", "convention", k.history.adjustments.map((a) => a.family)),
      adjustmentBps: list("history.adjustmentBps", "ratio", k.history.adjustments.map((a) => a.bps)), adjustmentAnchors: list("history.adjustmentAnchors", "text", k.history.adjustments.map((a) => a.anchor))},
    variants: k.variants.map((x) => {const q = `variant.${x.id}.`; return {id: x.id, label: text(q + "label", x.label), graceMonths: num(q + "graceMonths", "count", x.graceMonths),
      installments: num(q + "installments", "count", x.installments), coverage: num(q + "coverage", "ratio", x.coverage), restrictedAccount: bool(q + "restrictedAccount", x.restrictedAccount)};}),
    alternatives: k.alternatives.map((x) => {const q = `alternative.${x.id}.`; return {id: x.id, label: text(q + "label", x.label),
      allInSpread: x.allInSpread === null ? null : num(q + "allInSpread", "ratio", x.allInSpread), collateral: num(q + "collateral", "currency", x.collateral),
      usesCovered: list(q + "usesCovered", "identity", [...x.usesCovered]), monthsToMoneyMin: num(q + "monthsToMoneyMin", "months", x.monthsToMoneyMin),
      monthsToMoneyMax: num(q + "monthsToMoneyMax", "months", x.monthsToMoneyMax)};}),
  } as unknown as AdoptedReceivedProposalInput;
  const seal = () => ({...input, envelope: f.seal()});
  return {...f, input, seal};
}

/** The facts of ficha 1 as the conversation and its documents state them, with origin, for the premises
 * path: the same calibration the hand-built basis above adopts. */
export function auroraReceivedProposalFacts(k: ReceivedProposalInput = auroraReceivedProposal()): ReceivedProposalFacts {
  const doc = <T>(value: T, source: string) => ({value, origin: "document" as const, source});
  const informed = <T>(value: T, source: string) => ({value, origin: "informed" as const, source});
  const market = <T>(value: T, source: string) => ({value, origin: "market" as const, source});
  const house = <T>(value: T, source: string) => ({value, origin: "house" as const, source});
  const estimate = <T>(value: T, source: string) => ({value, origin: "estimate" as const, source});
  const {lender, firmness, termSheetDate, validityDays, amount, annualSpread, feeRate, drawDate, paymentDay, graceMonths, installments, installmentEveryMonths, interestEveryMonths,
    amortization, collateralKind, coverage, restrictedAccount, covenant, prepayment, reciprocity, bankSawIndenture} = k.proposal;
  return {receivedProposalId: id(96), entityId: id(1), perimeter: "standalone", currency: "BRL", definitionVersionId: id(3), openingDate: k.calendar.openingDate,
    readingDate: estimate(k.readingDate, "data de leitura do cenário (C32, 14/08/2026)"), needDate: informed(k.needDate, "compra de safra a partir de outubro"),
    proposal: doc({lender, firmness, termSheetDate, validityDays, amount, annualSpread, feeRate, drawDate, paymentDay, graceMonths, installments, installmentEveryMonths, interestEveryMonths,
      amortization, collateralKind, coverage, restrictedAccount, covenant: covenant ? {...covenant, testDates: [...covenant.testDates]} : null, prepayment: {...prepayment}, reciprocity, bankSawIndenture},
      "term sheet do Itaú"),
    indexer: doc(k.proposal.indexer, "term sheet do Itaú: CDI mais 2,10% ao ano"),
    covenantScenarios: house([...k.covenant.requiredScenarios], "caso da companhia e caso do banco, com EBITDA 15% menor (árvore da ficha 1)"),
    provenance: {drawDate: {origin: "estimate", source: "desembolso previsto para outubro; dia 1º adotado"}, paymentDay: {origin: "estimate", source: "pagamentos no dia do desembolso"},
      termSheetDate: {origin: "estimate", source: "data do cenário (C32, 14/08/2026)"}, bankSawIndenture: {origin: "informed", source: "o banco viu as demonstrações de 2025 e o gerencial, não a escritura"}},
    creditTax: house({...k.creditTax}, "IOF de crédito para pessoa jurídica adotado pela casa"),
    indexCurve: market(k.indexCurve.map((x) => ({...x})), "curva DI de referência do cenário em 14/08/2026 (C32)"),
    tax: doc({...k.tax}, "lucro real, demonstrações de 2025"),
    uses: k.uses.map((u) => informed({...u}, u.kind === "seasonal_working_capital" ? "uso informado; recompõe até março" : "uso informado; vida útil da linha de dez anos (C32)")),
    seasonalPeak: k.seasonalPeak === null ? null : informed(k.seasonalPeak, "a safra consome cerca de R$ 25 milhões de outubro a dezembro"),
    calendar: estimate({periodEnds: [...k.calendar.periodEnds], existingService: [...k.calendar.existingService], availableForService: [...k.calendar.availableForService],
      closingCash: [...k.calendar.closingCash], taxable: [...k.calendar.taxable]}, "projeção trimestral sem nova captação (C32, rota manter e rolar), dívida da tabela de junho de 2026"),
    minimumCash: k.calendar.minimumCash === null ? null : house(k.calendar.minimumCash, "caixa mínimo de cerca de duas semanas de desembolso (C32)"),
    indenture: doc({...k.covenant.indenture, testDates: [...k.covenant.indenture.testDates]}, "escritura de 2021 com o aditamento de 2023 (C09)"),
    policy: k.covenant.policy === null ? null : doc({...k.covenant.policy, testDates: [...k.covenant.policy.testDates]}, "ata do conselho de março de 2026 (C09)"),
    measurements: estimate(k.covenant.measurements.map((m) => ({...m})), "apurações sem a proposta na definição da escritura, caso base e do banco (C32)"),
    portfolio: k.portfolio.map((b) => doc({...b}, b.id === "rede-a" ? "contrato da rede A veda a cessão (C09)" : "aging de junho de 2026 e tabela de dívida")),
    basket: doc({...k.basket}, "negative pledge da escritura com exceção agregada de R$ 15 mi; R$ 12 mi ocupados pela cessão ao Bradesco (C32, A05); prazo de assembleia de referência de mercado"),
    collateralReference: house({...k.collateralReference}, "cobertura usual de 120% a 130% sem conta vinculada (árvore da ficha 1)"),
    market: k.market === null ? null : market({...k.market}, "doze comparáveis em 120 dias, seis bancárias e seis emissões ajustadas por prazo e garantia"),
    history: k.history === null ? null : estimate({...k.history, adjustments: k.history.adjustments.map((a) => ({...a}))}, "ponte entre a CCB do Bradesco de 2024 e a proposta, parcelas estimadas com a amostra declarada"),
    variants: k.variants.map((v) => house({...v}, "pedido ao banco avaliado pelo método")),
    alternatives: k.alternatives.map((a) => estimate({...a, usesCovered: [...a.usesCovered]}, "alternativa da companhia pelo método de estrutura de capital (C32)")),
  };
}
