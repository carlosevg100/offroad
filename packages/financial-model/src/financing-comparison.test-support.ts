import Decimal from "decimal.js";
import type {AdoptedFinancingComparisonInput} from "./adopted-financing-comparison";
import {createHash} from "node:crypto";
import type {AdoptionBasisEntry, AdoptionBasisSnapshot} from "@offroad/reconciliation";
import {proposeFinancingComparisonHypotheses, type FinancingComparisonFacts} from "./financing-comparison-premises";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";

// Ficha C02 (fictitious company "Aurora") read entirely from adopted premises. Expected values
// come from the independent Python oracle modelo_c02.py (resultados.json), never from this code.
const P = Decimal.clone({precision: 60});
export const c02PeriodEnds = ["2026-09-30", "2026-12-31", "2027-03-31", "2027-06-30", "2027-09-30", "2027-12-31", "2028-03-31", "2028-06-30", "2028-09-30", "2028-12-31"];
const starts = ["2026-07-01", ...c02PeriodEnds.slice(0, -1).map((e) => {const d = new Date(`${e}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);})];
const cdi = ["0.149", "0.149", "0.14", "0.14", "0.14", "0.14", "0.1275", "0.1275", "0.1275", "0.1275"];
const rate16 = (v: Decimal) => v.toDecimalPlaces(16, Decimal.ROUND_HALF_UP).toFixed();
const floating = (spread: string) => cdi.map((c) => rate16(new P(c).plus(1).mul(new P(spread).plus(1)).pow("0.25").minus(1)));
const fixed = (annual: string) => cdi.map(() => rate16(new P(annual).plus(1).pow("0.25").minus(1)));
const ebitdaBase = ["13.5", "14", "14", "14", "14.3", "14.3", "14.7", "14.7", "14.7", "14.7"];
const iof = (v: string) => new P(v).mul(new P("0.000082").mul(182).plus("0.0038")).toFixed();
const IOF70 = new P(70).mul("0.03373").toFixed();
export const c02Ids = {debenture: id(901), bradesco: id(902), finame: id(903), giro26: id(904), giro27: id(905), giro28: id(906), itau: id(911), santander: id(912), fundo: id(913), itauNegotiated: id(914), santander230: id(915)};

/** Synthetic adopted basis of ficha C02 (fictitious company "Aurora"); calibration only, never
 * production parameters. `shock` cuts EBITDA from 4T26 on, as the bank's stress case does. */
export function c02ComparisonFixture(shock = "0", o: {negotiated?: boolean} = {}) {
  const f = analysisTestBasis(`comparison.${id(4)}.`, "2026-06-30", "2028-12-31");
  const number = (p: string, unit: string, value: string) => f.contribute(p, unit, {type: "number", value});
  const text = (p: string, unit: string, value: string) => f.contribute(p, unit, {type: "text", value});
  const date = (p: string, value: string) => f.contribute(p, "date", {type: "date", value});
  const list = (p: string, unit: string, value: string[]) => f.contribute(p, unit, {type: "list", value});
  const q10 = (v: (q: number) => string) => c02PeriodEnds.map((_, q) => v(q));
  const terms = (path: string, opening: string, rates: string[], o: {draw?: [number, string]; amort?: Record<number, string>; prepay?: Record<number, string>; pays?: number[]; base?: string}) => ({
    timing: text(`${path}.timing`, "convention", "draw_at_period_start_pay_at_period_end"), indexer: text(`${path}.indexer`, "convention", "none"),
    indexationTreatment: text(`${path}.indexationTreatment`, "convention", "not_applicable"),
    couponTreatment: text(`${path}.couponTreatment`, "convention", o.pays ? "accrued_until_paid" : "cash_paid"),
    couponBase: text(`${path}.couponBase`, "convention", o.base ?? "opening_principal"),
    drawdownAccount: text(`${path}.drawdownAccount`, "convention", "available"), paymentAccount: text(`${path}.paymentAccount`, "convention", "available"),
    openingPrincipal: number(`${path}.openingPrincipal`, "currency", opening),
    indexationRates: list(`${path}.indexationRates`, "ratio", q10(() => "0")), couponRates: list(`${path}.couponRates`, "ratio", rates),
    drawdowns: list(`${path}.drawdowns`, "currency", q10((q) => o.draw && o.draw[0] === q ? o.draw[1] : "0")),
    scheduledPrincipal: list(`${path}.scheduledPrincipal`, "currency", q10((q) => o.amort?.[q] ?? "0")),
    prepayments: list(`${path}.prepayments`, "currency", q10((q) => o.prepay?.[q] ?? "0")),
    repayAll: list(`${path}.repayAll`, "boolean", q10(() => "false")),
    ...(o.pays ? {paysAccruedCoupon: list(`${path}.paysAccruedCoupon`, "boolean", q10((q) => String(o.pays!.includes(q))))} : {})});
  const charges = (path: string, rows: [string, string, number, string, boolean, string?][]) => rows.length ? {
    chargeIds: list(`${path}.chargeIds`, "identity", rows.map((r) => r[0])), categories: list(`${path}.categories`, "convention", rows.map((r) => r[1])),
    dates: list(`${path}.dates`, "date", rows.map((r) => starts[r[2]]!)), amounts: list(`${path}.amounts`, "currency", rows.map((r) => r[3])),
    deductible: list(`${path}.deductible`, "boolean", rows.map((r) => String(r[4]))),
    ...(rows.some((r) => r[5]) ? {instrumentIds: list(`${path}.instrumentIds`, "identity", rows.map((r) => r[5] ?? "self"))} : {})} : null;
  const finameAmort = Object.fromEntries(c02PeriodEnds.map((_, q) => [q, new P(30).div(54).mul(3).toDecimalPlaces(8).toFixed()]));
  const instruments = [
    {id: c02Ids.debenture, terms: terms(`debt.${c02Ids.debenture}`, "60", floating("0.024"), {amort: {1: "15", 3: "15", 5: "15", 7: "15"}, pays: [1, 3, 5, 7, 9]}), charges: null},
    {id: c02Ids.bradesco, terms: terms(`debt.${c02Ids.bradesco}`, "40", floating("0.026"), {prepay: {2: "40"}}),
      charges: charges(`debt.${c02Ids.bradesco}.charges`, [["bradesco-premium", "other", 2, "0.4", true]])},
    {id: c02Ids.finame, terms: terms(`debt.${c02Ids.finame}`, "30", fixed("0.097"), {amort: finameAmort, base: "average_principal"}), charges: null},
    ...([[c02Ids.giro26, "0.025", 1, "17", 2], [c02Ids.giro27, "0.020", 5, "20", 6], [c02Ids.giro28, "0.020", 9, "20", undefined]] as const).map(([gid, s, q, v, repay]) => ({id: gid,
      terms: terms(`debt.${gid}`, "0", floating(s), {draw: [q, v], ...(repay !== undefined ? {amort: {[repay]: v}} : {})}),
      charges: charges(`debt.${gid}.charges`, [[`${gid}-fee`, "origination_fee", q, new P(v).mul("0.003").toFixed(), true], [`${gid}-iof`, "tax", q, iof(v), true]])})),
  ];
  const proposal = (pid: string, label: string, spread: string, fee: string, withIof: boolean, lifeAmort: number[], semiannual: boolean, inHorizon: Record<number, string>,
    collateral: string, cov: {lease: boolean; dates: number[]; limit: string}) => {
    const path = `proposal.${pid}`;
    let repaid = new P(0); const lifeEnds: string[] = [], amort: string[] = [], pays: string[] = [], index: string[] = [];
    for (let q = 0; q < 21; q++) {
      lifeEnds.push(new Date(Date.UTC(2027 + Math.floor(q / 4), (q % 4 + 1) * 3, 0)).toISOString().slice(0, 10));
      const a = lifeAmort.includes(q) ? (q === lifeAmort.at(-1) ? new P(70).minus(repaid) : new P(70).div(lifeAmort.length).toDecimalPlaces(8)) : new P(0);
      repaid = repaid.plus(a); amort.push(a.toFixed()); pays.push(String(!semiannual || q % 2 === 1 || q === 20)); index.push(q < 4 ? "0.14" : q < 8 ? "0.1275" : "0.12");
    }
    return {id: pid, label,
      terms: terms(`${path}.terms`, "0", floating(spread), {draw: [2, "70"], amort: inHorizon, ...(semiannual ? {pays: [3, 5, 7, 9]} : {})}),
      charges: charges(`${path}.charges`, [[`${label}-fee`, "origination_fee", 2, new P(70).mul(fee).toFixed(), true], ...(withIof ? [[`${label}-iof`, "tax", 2, IOF70, true] as [string, string, number, string, boolean, string?]] : []),
        ...(new P(collateral).gt(0) ? [[`${label}-waiver`, "other", 1, "0.525", false, c02Ids.debenture] as [string, string, number, string, boolean, string]] : [])]),
      collateralConsumed: number(`${path}.collateralConsumed`, "currency", collateral),
      covenant: {name: text(`${path}.covenant.name`, "identity", cov.lease ? "lease liability in debt, IFRS 16 EBITDA" : "excluding leases"),
        leaseLiabilityInDebt: text(`${path}.covenant.leaseLiabilityInDebt`, "boolean", String(cov.lease)), leaseLiability: number(`${path}.covenant.leaseLiability`, "currency", "8"),
        ebitdaExcludesLeases: text(`${path}.covenant.ebitdaExcludesLeases`, "boolean", String(!cov.lease)), trailingPeriods: number(`${path}.covenant.trailingPeriods`, "count", "4"),
        measurementPeriods: list(`${path}.covenant.measurementPeriods`, "date", cov.dates.map((q) => c02PeriodEnds[q]!)), limit: number(`${path}.covenant.limit`, "ratio", cov.limit),
        comparator: text(`${path}.covenant.comparator`, "convention", "lte")},
      lifetime: {grossAdvance: number(`${path}.lifetime.grossAdvance`, "currency", "70"),
        upfrontWithheldCosts: number(`${path}.lifetime.upfrontWithheldCosts`, "currency", new P(70).mul(fee).plus(withIof ? IOF70 : 0).toFixed()),
        annualSpread: number(`${path}.lifetime.annualSpread`, "ratio", spread), unpaidInterestBase: text(`${path}.lifetime.unpaidInterestBase`, "convention", "principal_plus_accrued"),
        lowerSpread: number(`${path}.lifetime.lowerSpread`, "ratio", "0"), upperSpread: number(`${path}.lifetime.upperSpread`, "ratio", "0.2"),
        periodEnds: list(`${path}.lifetime.periodEnds`, "date", lifeEnds), yearFractions: list(`${path}.lifetime.yearFractions`, "ratio", lifeEnds.map(() => "0.25")),
        annualIndex: list(`${path}.lifetime.annualIndex`, "ratio", index),
        yearFractionConventions: list(`${path}.lifetime.yearFractionConventions`, "convention", lifeEnds.map(() => "adopted_year_fraction")),
        scheduledPrincipal: list(`${path}.lifetime.scheduledPrincipal`, "currency", amort), paysAccruedInterest: list(`${path}.lifetime.paysAccruedInterest`, "boolean", pays)}};
  };
  const proposals = o.negotiated ? [] : [
    proposal(c02Ids.itau, "itau", "0.023", "0.010", true, [6, 8, 10, 12, 14, 16, 18, 20], false, {8: "8.75"}, "28", {lease: true, dates: [3, 5, 7, 9], limit: "3"}),
    proposal(c02Ids.santander, "santander", "0.0255", "0.008", true, [10, 12, 14, 16, 18, 20], false, {}, "21", {lease: false, dates: [5, 9], limit: "3"}),
    proposal(c02Ids.fundo, "fundo", "0.031", "0.015", false, [16, 20], true, {}, "0", {lease: false, dates: [3, 5, 7, 9], limit: "2.75"}),
  ];
  // Negotiation round of the ficha, compared on its own: Itaú with Santander's grace and a 30% assignment; Santander at CDI + 2.30.
  if (o.negotiated) proposals.push(
      proposal(c02Ids.itauNegotiated, "itau-negotiated", "0.023", "0.010", true, [10, 12, 14, 16, 18, 20], false, {}, "21", {lease: true, dates: [3, 5, 7, 9], limit: "3"}),
      proposal(c02Ids.santander230, "santander-230", "0.023", "0.008", true, [10, 12, 14, 16, 18, 20], false, {}, "21", {lease: false, dates: [5, 9], limit: "3"}));
  const company = {openingAvailableCash: number("company.openingAvailableCash", "currency", "35"),
    money: {ebitda: list("company.ebitda", "currency", q10((q) => new P(ebitdaBase[q]!).mul(q >= 1 ? new P(1).minus(shock) : 1).toFixed())),
      cashLeasePayments: list("company.cashLeasePayments", "currency", q10(() => "0.75")),
      depreciationAndAmortization: list("company.depreciationAndAmortization", "currency", q10(() => "3")),
      workingCapitalCashFlow: list("company.workingCapitalCashFlow", "currency", q10((q) => new P("-0.625").plus([1, 5, 9].includes(q) ? -25 : 0).plus([2, 6].includes(q) ? 25 : 0).toFixed())),
      maintenanceCapexPaid: list("company.maintenanceCapexPaid", "currency", q10(() => "2")), growthCapexPaid: list("company.growthCapexPaid", "currency", q10(() => "0"))},
    cashTaxRate: number("company.cashTaxRate", "ratio", "0.34"), lossTaxTreatment: text("company.lossTaxTreatment", "convention", "no_cash_benefit"),
    freeReceivablesPool: number("company.freeReceivablesPool", "currency", "58"), minimumCashPolicy: number("company.minimumCashPolicy", "currency", "15"), minimumCashFrom: date("company.minimumCashFrom", c02PeriodEnds[2]!),
    covenantHistoryPeriods: list("company.covenantHistory.periods", "identity", ["1T26", "2T26"]),
    covenantHistoryEbitda: list("company.covenantHistory.ebitda", "currency", ["13.5", "13.5"]),
    covenantHistoryLeasePayments: list("company.covenantHistory.leasePayments", "currency", ["0.75", "0.75"])};
  const input = {...f.context, comparisonId: id(4), scenario: "base", periodEnds: list("periodEnds", "date", c02PeriodEnds), company, instruments, proposals} as unknown as AdoptedFinancingComparisonInput;
  return {...f, input, seal: () => ({...input, envelope: f.seal()})};
}


/** Adds an adopted stressed EBITDA under its own scenario that inherits everything else from
 * the base: the stressed case adopts only what it changes. */
export function c02StressCase(f: ReturnType<typeof c02ComparisonFixture>, scenario: string, shock: string): AdoptedFinancingComparisonInput {
  const base = f.entries.find((e) => e.fieldPath.endsWith(".company.ebitda"))!;
  const values = (base.value as {value: string[]}).value.map((v, q) => new P(v).mul(q >= 1 ? new P(1).minus(shock) : 1).toFixed());
  const ebitda = f.contribute("company.ebitda", "currency", {type: "list", value: values}, scenario);
  const input = structuredClone(f.input);
  input.scenario = scenario; input.inheritedScenario = f.input.scenario; input.company.money.ebitda = ebitda;
  return input;
}

/** C02 packet: the base and the bank's stress (EBITDA -15% from 4T26), one adopted basis. */
export function c02PacketInput(o: {negotiated?: boolean} = {}) {
  const f = c02ComparisonFixture("0", o), stress = c02StressCase(f, "bank-stress", "0.15");
  const input = {schemaVersion: "financing-comparison-packet-input.v1" as const,
    question: "Qual das três propostas de R$ 70 mi para a mesma necessidade cabe na companhia e quanto custa de fato?",
    cases: [{id: "base", role: "base" as const, label: "Plano da companhia", changes: [] as string[], analysis: f.input},
      {id: "bank-stress", role: "stress" as const, label: "Caso do banco", changes: ["EBITDA 15% menor a partir do 4T26"], analysis: stress}]};
  const seal = () => {const {envelope} = f.seal(); for (const c of input.cases) c.analysis.envelope = envelope; return input;};
  return {basis: f, input, seal};
}

// Ficha C02 (fictitious "Aurora") stated as facts with origin, the way a conversation and its
// documents would state them. Expected values come from the independent oracle modelo_c02.py.
const informed = <T>(value: T, source = "Term sheet ou tabela de dívida da companhia") => ({value, origin: "document" as const, source});
const auroraEnds = ["2026-09-30", "2026-12-31", "2027-03-31", "2027-06-30", "2027-09-30", "2027-12-31", "2028-03-31", "2028-06-30", "2028-09-30", "2028-12-31"];
const auroraQ10 = (v: (q: number) => string) => auroraEnds.map((_, q) => v(q));
const auroraIof = (v: string, days: number) => new P(v).mul(new P("0.000082").mul(days).plus("0.0038")).toFixed();
export const auroraIds = {itau: id(911), santander: id(912), fundo: id(913), debenture: id(901)};
/** `dated` puts the lifetime on the contract dates of the ficha: draw on 15/jan/27, payments on the 15th. */
export function auroraFacts(o: {dated?: boolean} = {}): FinancingComparisonFacts {
  const giro = (n: number, spread: string, q: number, v: string, repay?: number) => ({id: id(903 + n), label: `Giro ${n}`, openingPrincipal: "0", rate: {kind: "floating" as const, annualSpread: spread},
    couponBase: "opening_principal" as const, draws: [{quarter: q, amount: v}], amortization: repay === undefined ? [] : [{quarter: repay, amount: v}], prepayments: [], accruedPaymentQuarters: null,
    charges: [{id: `giro-${n}-fee`, category: "origination_fee" as const, quarter: q, amount: new P(v).mul("0.003").toFixed(), deductible: true},
      {id: `giro-${n}-iof`, category: "tax" as const, quarter: q, amount: auroraIof(v, 182), deductible: true}]});
  const proposal = (pid: string, label: string, spread: string, fee: string, creditTax: boolean, amort: number[], every: number, share: string,
    cov: {name: string; limit: string; lease: boolean; freq: "semiannual" | "annual"}) => informed({id: pid, label, amount: "70", annualSpread: spread, feeRate: fee, creditTax,
    drawQuarter: 2, amortizationQuarters: amort, couponEveryQuarters: every, collateralShareOfLoan: share,
    covenant: {name: cov.name, limit: cov.limit, leaseLiabilityInDebt: cov.lease, ebitdaExcludesLeases: !cov.lease, testFrequency: cov.freq},
    waiver: share !== "0" ? {instrumentId: auroraIds.debenture, quarter: 1, cost: "0.525", deductible: false} : null,
    contractDates: o.dated ? {drawDate: "2027-01-15", paymentDay: 15} : null}, `Term sheet ${label}`);
  return {comparisonId: id(4), entityId: id(1), perimeter: "standalone", currency: "BRL", definitionVersionId: id(3), openingDate: "2026-06-30", quarterEnds: auroraEnds,
    indexCurve: informed([{year: 2026, annualRate: "0.149"}, {year: 2027, annualRate: "0.14"}, {year: 2028, annualRate: "0.1275"}, {year: 2029, annualRate: "0.12"}], "Curva DI de mercado na data"),
    company: {openingAvailableCash: informed("35"), ebitda: informed(["13.5", "14", "14", "14", "14.3", "14.3", "14.7", "14.7", "14.7", "14.7"], "Projeção trimestral da companhia"),
      leasePayments: informed(auroraQ10(() => "0.75")), depreciationAndAmortization: informed(auroraQ10(() => "3")),
      workingCapitalCashFlow: informed(auroraQ10((q) => new P("-0.625").plus([1, 5, 9].includes(q) ? -25 : 0).plus([2, 6].includes(q) ? 25 : 0).toFixed())),
      maintenanceCapexPaid: informed(auroraQ10(() => "2")), growthCapexPaid: informed(auroraQ10(() => "0")), cashTaxRate: informed("0.34"), freeReceivablesPool: informed("58"),
      leaseLiability: informed("8"), covenantHistory: informed([{period: "1T26", ebitda: "13.5", leasePayments: "0.75"}, {period: "2T26", ebitda: "13.5", leasePayments: "0.75"}]),
      minimumCashPolicy: informed("15", "Política de caixa mínimo informada"), maximumCollateralShare: null},
    existingDebt: informed([
      {id: auroraIds.debenture, label: "Debênture 2021", openingPrincipal: "60", rate: {kind: "floating", annualSpread: "0.024"}, couponBase: "opening_principal",
        draws: [], amortization: [1, 3, 5, 7].map((quarter) => ({quarter, amount: "15"})), prepayments: [], accruedPaymentQuarters: [1, 3, 5, 7, 9], charges: []},
      {id: id(902), label: "CCB Bradesco", openingPrincipal: "40", rate: {kind: "floating", annualSpread: "0.026"}, couponBase: "opening_principal",
        draws: [], amortization: [], prepayments: [{quarter: 2, amount: "40"}], accruedPaymentQuarters: null,
        charges: [{id: "bradesco-premium", category: "other", quarter: 2, amount: "0.4", deductible: true}]},
      {id: id(903), label: "FINAME", openingPrincipal: "30", rate: {kind: "fixed", annualRate: "0.097"}, couponBase: "average_principal",
        draws: [], amortization: auroraEnds.map((_, quarter) => ({quarter, amount: new P(30).div(54).mul(3).toDecimalPlaces(8).toFixed()})), prepayments: [], accruedPaymentQuarters: null, charges: []},
      giro(1, "0.025", 1, "17", 2), giro(2, "0.020", 5, "20", 6), giro(3, "0.020", 9, "20"),
    ]),
    proposals: [
      proposal(auroraIds.itau, "itau", "0.023", "0.010", true, [6, 8, 10, 12, 14, 16, 18, 20], 1, "0.4", {name: "Dívida líquida com arrendamentos sobre EBITDA IFRS 16", limit: "3", lease: true, freq: "semiannual"}),
      proposal(auroraIds.santander, "santander", "0.0255", "0.008", true, [10, 12, 14, 16, 18, 20], 1, "0.3", {name: "Definição da escritura de 2021", limit: "3", lease: false, freq: "annual"}),
      proposal(auroraIds.fundo, "fundo", "0.031", "0.015", false, [16, 20], 2, "0", {name: "Dívida líquida sobre EBITDA sem IFRS 16", limit: "2.75", lease: false, freq: "semiannual"}),
    ],
    creditTax: {value: {fixedRate: "0.0038", dailyRate: "0.000082", maxDays: 365}, origin: "house", source: "IOF de crédito para pessoa jurídica adotado pela casa"},
    stress: {ebitdaShock: {value: "0.15", origin: "house", source: "Caso que um banco tende a usar"}, fromQuarter: {value: 1, origin: "house", source: "A partir do trimestre seguinte"}},
  };
}

/** Adopts the hypotheses proposed from facts as a person's confirmation would, in one synthetic basis. */
export function adoptAuroraFacts(facts: FinancingComparisonFacts) {
  let n = 5000;
  const entries: AdoptionBasisEntry[] = proposeFinancingComparisonHypotheses(facts).map((h) => ({decisionId: id(n++), slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
    kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions}, value: h.value, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: "managerial", actorId: id(5), reason: h.reason}) as AdoptionBasisEntry);
  const snapshot: AdoptionBasisSnapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(500), setId: id(6), workId: id(7), purpose: "synthetic financing comparison",
    contextKey: "synthetic", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  return {entries, envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}, scope: {workId: id(7), purpose: snapshot.purpose, versionId: id(500)}};
}
