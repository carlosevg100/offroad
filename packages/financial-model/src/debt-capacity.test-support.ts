import Decimal from "decimal.js";
import type {AdoptedDebtCapacityInput} from "./adopted-debt-capacity";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";

// Synthetic adopted basis of ficha C04 (fictitious Aurora after the 2027 plan of C32), annual 2027
// to 2033, in R$ million. Drivers mirror the independent oracle modelo_c04.py so the engine can be
// checked against it; they are calibration hypotheses, never production parameters.
const D = Decimal.clone({precision: 60});
const years = [2027, 2028, 2029, 2030, 2031, 2032, 2033];
const CDI: Record<number, string> = {2027: "0.14", 2028: "0.1275", 2029: "0.12", 2030: "0.12", 2031: "0.12", 2032: "0.12", 2033: "0.12"};
const TLP = "0.079", LEASE = "3", MAINTENANCE = "8", WORKING_CAPITAL = "2.5", TAX = "0.34", DA = "12", OPENING_CASH = "15.3", SEASONAL_LINE = "20";
const EBITDA: Record<number, string> = {2027: "56.6", 2028: "58.8", 2029: "61.2", 2030: "63.6", 2031: "66.1", 2032: "68.7", 2033: "71.5"};
export const c04Schedules = {
  informed: {capex: {2027: "30", 2028: "30"} as Record<number, string>, projectEbitda: {2029: "6", 2030: "12", 2031: "12", 2032: "12", 2033: "12"} as Record<number, string>},
  phased: {capex: {2028: "30", 2029: "30"} as Record<number, string>, projectEbitda: {2030: "6", 2031: "12", 2032: "12", 2033: "12"} as Record<number, string>},
} as const;
/** Five years with grace to 2030 (the structure the size table uses) and BNDES over eight years. */
export const c04Structures = {
  fiveYears: {rate: (y: number) => new D(CDI[y]!).plus("0.025"), amortization: {2030: "1/3", 2031: "1/3", 2032: "1/3"} as Record<number, string>},
  bndes: {rate: () => new D(TLP).plus("0.03"), amortization: {2030: "1/6", 2031: "1/6", 2032: "1/6", 2033: "1/6"} as Record<number, string>},
} as const;
// Existing debt after the 2027 plan: debenture of 80 amortizing 16 a year from 2029, the older FINAME.
const debenture: Record<number, string> = {2026: "80", 2027: "80", 2028: "80", 2029: "64", 2030: "48", 2031: "32", 2032: "16", 2033: "0"};
const finame: Record<number, string> = {2026: "23.33", 2027: "16.66", 2028: "9.99", 2029: "3.32", 2030: "0", 2031: "0", 2032: "0", 2033: "0"};
const fraction = (v: string) => v.includes("/") ? new D(v.split("/")[0]!).div(v.split("/")[1]!) : new D(v);
const s = (v: Decimal) => v.toDecimalPlaces(20).toFixed();

/** One capacity analysis (one schedule and one structure) with the base and the adverse case
 * (EBITDA 15% lower) and the three limits of the ficha as separate adopted rules. */
export function c04Analysis(f: ReturnType<typeof analysisTestBasis>, o: {analysisId: string; label: string; schedule: keyof typeof c04Schedules; structure: keyof typeof c04Structures; review: string | null}) {
  const pfx = `debt_capacity.${o.analysisId}.`;
  const num = (p: string, unit: string, value: string, scenario: string) => f.contribute(pfx + p, unit, {type: "number", value}, scenario);
  const text = (p: string, value: string, scenario: string) => f.contribute(pfx + p, "convention", {type: "text", value}, scenario);
  const list = (p: string, unit: string, value: string[], scenario: string) => f.contribute(pfx + p, unit, {type: "list", value}, scenario);
  const sched = c04Schedules[o.schedule], st = c04Structures[o.structure];
  const scenario = (adverse: boolean, sid: string, rules: {id: string; kind: string; threshold: string}[]) => {
    const sc = `${o.label}:${adverse ? "adverse" : "base"}`, p = `scenario.${sid}.`, keep = adverse ? new D("0.85") : new D(1);
    const project = (y: number) => new D(sched.projectEbitda[y] ?? "0");
    const capexShare = (y: number) => new D(sched.capex[y] ?? "0").div(60);
    const interestExisting = (y: number) => new D(debenture[y - 1]!).plus(debenture[y]!).div(2).times(new D(CDI[y]!).plus("0.029"))
      .plus(new D(finame[y - 1]!).plus(finame[y]!).div(2).times(new D(TLP).plus("0.018"))).plus(new D(SEASONAL_LINE).times("0.5").times(new D(CDI[y]!).plus("0.02")));
    const projectDa = (y: number) => new D(y >= 2029 ? 6 : y === 2028 ? 3 : 0).div(60);
    const affine: Record<string, [string[], string[]]> = {
      ebitda: [years.map((y) => s(new D(EBITDA[y]!).times(keep))), years.map((y) => s(project(y).times(keep).div(60)))],
      covenantEbitdaAdjustment: [years.map(() => "-" + LEASE), years.map(() => "0")],
      nonCashEbitdaBridge: [years.map(() => "0"), years.map(() => "0")],
      cashLeasePayments: [years.map(() => LEASE), years.map(() => "0")],
      changeInWorkingCapital: [years.map(() => WORKING_CAPITAL), years.map((y) => s(project(y).minus(project(y - 1)).div(60)))],
      maintenanceCapex: [years.map(() => MAINTENANCE), years.map((y) => s(project(y).gt(0) ? new D("1.5").div(60) : new D(0)))],
      growthCapex: [years.map(() => "0"), years.map((y) => s(capexShare(y)))],
      taxableBaseBeforeNewDebtInterest: [years.map((y) => s(new D(EBITDA[y]!).times(keep).minus(DA).minus(LEASE).minus(interestExisting(y)))),
        years.map((y) => s(project(y).times(keep).div(60).minus(projectDa(y))))],
      otherExistingFinancingCashAvailable: [years.map(() => "0"), years.map(() => "0")],
      capitalCashAvailable: [years.map(() => "0"), years.map(() => "0")],
    };
    const rate = (y: number) => st.rate(y);
    const ratios: Record<string, string[]> = {
      drawAtStart: years.map(() => "0"), drawAtEnd: years.map((y) => s(capexShare(y))),
      principalPaidAtEnd: years.map((y) => s(st.amortization[y] ? fraction(st.amortization[y]!) : new D(0))),
      interestFactorOnOpeningAndStartDraw: years.map((y) => s(rate(y))), interestFactorOnEndDraw: years.map((y) => s(rate(y).div(2))),
      interestFactorCreditOnEndAmortization: years.map((y) => s(rate(y).div(2))), withheldCostPerUnitDraw: years.map(() => "0")};
    return {id: sid, scenario: sc, terms: {openingAvailableCash: num(p + "openingAvailableCash", "currency", OPENING_CASH, sc),
      cashNetting: text(p + "cashNetting", "signed_available", sc),
      includeNewAccruedInterestInDebt: f.contribute(pfx + p + "includeNewAccruedInterestInDebt", "convention", {type: "boolean", value: false}, sc),
      periodEnds: list(p + "periodEnds", "date", years.map((y) => `${y}-12-31`), sc),
      affine: Object.fromEntries(Object.entries(affine).map(([k, [fixed, unit]]) => [k, {fixed: list(p + k + ".fixed", "currency", fixed, sc), perUnitNewDebt: list(p + k + ".perUnitNewDebt", "ratio", unit, sc)}])),
      money: {existingCashInterest: list(p + "existingCashInterest", "currency", years.map((y) => s(interestExisting(y))), sc),
        existingCashPrincipalPaid: list(p + "existingCashPrincipalPaid", "currency", years.map((y) => s(new D(debenture[y - 1]!).minus(debenture[y]!).plus(finame[y - 1]!).minus(finame[y]!))), sc),
        existingDebtForRatio: list(p + "existingDebtForRatio", "currency", years.map((y) => s(new D(debenture[y]!).plus(finame[y]!).plus(SEASONAL_LINE))), sc)},
      ratios: {cashTaxRate: list(p + "cashTaxRate", "ratio", years.map(() => TAX), sc)},
      conventions: {lossTaxTreatment: list(p + "lossTaxTreatment", "convention", years.map(() => "no_cash_benefit"), sc),
        newDebtTaxDeduction: list(p + "newDebtTaxDeduction", "convention", years.map(() => "paid_interest"), sc),
        cfadsGrowthCapexTreatment: list(p + "cfadsGrowthCapexTreatment", "convention", years.map(() => "exclude_growth_capex"), sc)},
      cfadsDefinitionAnchors: list(p + "cfadsDefinitionAnchors", "reference_id", years.map(() => "C04 caixa disponível"), sc),
      newFinancing: {ratios: Object.fromEntries(Object.entries(ratios).map(([k, v]) => [k, list(p + "newFinancing." + k, "ratio", v, sc)])),
        conventions: {factorConvention: list(p + "newFinancing.factorConvention", "convention", years.map(() => "adopted_annual_average_balance_approximation"), sc),
          paysAccruedInterest: list(p + "newFinancing.paysAccruedInterest", "convention", years.map(() => "true"), sc),
          unpaidInterestBase: list(p + "newFinancing.unpaidInterestBase", "convention", years.map(() => "principal_only"), sc)}}},
      rules: rules.map((r) => ({id: r.id, kind: text(p + `rule.${r.id}.kind`, r.kind, sc),
        threshold: num(p + `rule.${r.id}.threshold`, r.kind === "minimum_available_cash" ? "currency" : "ratio", r.threshold, sc)}))};
  };
  const rid = (k: number) => id(Number.parseInt(o.analysisId.slice(-4), 10) * 10 + k);
  const limits = {covenant: [rid(1), rid(2)], market: [rid(3)], interest: [rid(4)]};
  const base = scenario(false, rid(5), [{id: limits.covenant[0]!, kind: "maximum_net_debt_to_ebitda", threshold: "2.5"},
    {id: limits.market[0]!, kind: "maximum_net_debt_to_ebitda", threshold: "2.75"}, {id: limits.interest[0]!, kind: "minimum_interest_coverage", threshold: "2.5"}]);
  const adverse = scenario(true, rid(6), [{id: limits.covenant[1]!, kind: "maximum_net_debt_to_ebitda", threshold: "3"}]);
  const top = `${o.label}:base`;
  const input = {...f.context, analysisId: o.analysisId, scenario: top,
    maximumAmount: num("maximumAmount", "currency", "200", top), monetaryQuantum: num("monetaryQuantum", "currency", "0.01", top),
    fixedReviewAmount: o.review === null ? null : num("fixedReviewAmount", "currency", o.review, top),
    horizonMode: text("horizonMode", "calibration_window", top),
    newDebtFinalPaymentDate: f.contribute(pfx + "newDebtFinalPaymentDate", "date", {type: "date", value: o.structure === "bndes" ? "2033-12-31" : "2032-12-31"}, top),
    existingDebtFinalPaymentDates: list("existingDebtFinalPaymentDates", "date", ["2033-12-31"], top),
    scenarios: [base, adverse]} as unknown as AdoptedDebtCapacityInput;
  return {input, limits};
}

/** The question of the ficha: the informed schedule and the phased one, five-year structure, with a
 * review of the R$ 60 mi project in each. One adopted basis, under the 256-premise limit. */
export function c04CapacityBasis(o: {structure?: keyof typeof c04Structures; review?: string} = {}) {
  const f = analysisTestBasis("", "2026-12-31", "2033-12-31");
  const structure = o.structure ?? "fiveYears";
  const informed = c04Analysis(f, {analysisId: id(4401), label: "informed", schedule: "informed", structure, review: o.review ?? "60"});
  const phased = c04Analysis(f, {analysisId: id(4402), label: "phased", schedule: "phased", structure, review: o.review ?? "60"});
  const seal = () => {const envelope = f.seal(); informed.input.envelope = envelope; phased.input.envelope = envelope; return {informed: informed.input, phased: phased.input};};
  return {basis: f, informed, phased, seal};
}

/** The C04 packet: the informed schedule and the phased alternative, with the three limits named. */
export function c04PacketInput(o: {structure?: keyof typeof c04Structures; review?: string} = {}) {
  const b = c04CapacityBasis(o);
  const limits = (l: {covenant: string[]; market: string[]; interest: string[]}) => [
    {id: "covenant", label: "Covenant da escritura com folga de 0,5x no base e 3,0x no adverso", ruleIds: l.covenant},
    {id: "market", label: "Alavancagem de 2,75x acima da qual preço e apetite pioram", ruleIds: l.market},
    {id: "interest", label: "Cobertura de juros mínima de 2,5x", ruleIds: l.interest}];
  const seal = () => {
    const s = b.seal();
    return {schemaVersion: "debt-capacity-packet-input.v1" as const, question: "Quanto de dívida a gente aguenta tomar para a segunda linha de R$ 60 milhões?",
      cases: [{id: "informed", role: "informed" as const, label: "2S27 e 1S28, como informado", changes: [] as string[], analysis: s.informed, limits: limits(b.informed.limits)},
        {id: "phased", role: "alternative" as const, label: "Faseado em 2028 e 2029", changes: ["Desembolso em 2028 e 2029; resultado a partir de 2030"], analysis: s.phased, limits: limits(b.phased.limits)}]};
  };
  return {basis: b.basis, seal};
}

/** The independent review's counterexample: minimum cash needs at least 100 of new debt and
 * interest coverage allows at most 20. No amount satisfies both. */
export function c04DisconnectedPacketInput() {
  const f = analysisTestBasis("", "2026-12-31", "2028-12-31"), aid = id(4490), pfx = `debt_capacity.${aid}.`, sc = "disconnected:base";
  const num = (p: string, unit: string, value: string) => f.contribute(pfx + p, unit, {type: "number", value}, sc);
  const text = (p: string, value: string) => f.contribute(pfx + p, "convention", {type: "text", value}, sc);
  const list = (p: string, unit: string, value: string[]) => f.contribute(pfx + p, unit, {type: "list", value}, sc);
  const sid = id(44905), p = `scenario.${sid}.`, two = (a: string, b: string) => [a, b];
  const affineValues: Record<string, string[]> = {ebitda: two("20", "200"), growthCapex: two("100", "0")};
  const affine = Object.fromEntries(["ebitda", "covenantEbitdaAdjustment", "nonCashEbitdaBridge", "cashLeasePayments", "changeInWorkingCapital", "maintenanceCapex", "growthCapex",
    "taxableBaseBeforeNewDebtInterest", "otherExistingFinancingCashAvailable", "capitalCashAvailable"].map((k) => [k, {fixed: list(p + k + ".fixed", "currency", affineValues[k] ?? two("0", "0")),
    perUnitNewDebt: list(p + k + ".perUnitNewDebt", "ratio", two("0", "0"))}]));
  const ratios: Record<string, string[]> = {drawAtStart: two("1", "0"), drawAtEnd: two("0", "0"), principalPaidAtEnd: two("0", "1"), interestFactorOnOpeningAndStartDraw: two("0.1", "0.1"),
    interestFactorOnEndDraw: two("0", "0"), interestFactorCreditOnEndAmortization: two("0", "0"), withheldCostPerUnitDraw: two("0", "0")};
  const cashRule = id(44901), coverageRule = id(44902);
  const scenario = {id: sid, scenario: sc, terms: {openingAvailableCash: num(p + "openingAvailableCash", "currency", "0"), cashNetting: text(p + "cashNetting", "signed_available"),
    includeNewAccruedInterestInDebt: f.contribute(pfx + p + "includeNewAccruedInterestInDebt", "convention", {type: "boolean", value: false}, sc),
    periodEnds: list(p + "periodEnds", "date", ["2027-12-31", "2028-12-31"]), affine,
    money: Object.fromEntries(["existingCashInterest", "existingCashPrincipalPaid", "existingDebtForRatio"].map((k) => [k, list(p + k, "currency", two("0", "0"))])),
    ratios: {cashTaxRate: list(p + "cashTaxRate", "ratio", two("0", "0"))},
    conventions: {lossTaxTreatment: list(p + "lossTaxTreatment", "convention", two("no_cash_benefit", "no_cash_benefit")), newDebtTaxDeduction: list(p + "newDebtTaxDeduction", "convention", two("paid_interest", "paid_interest")),
      cfadsGrowthCapexTreatment: list(p + "cfadsGrowthCapexTreatment", "convention", two("exclude_growth_capex", "exclude_growth_capex"))},
    cfadsDefinitionAnchors: list(p + "cfadsDefinitionAnchors", "reference_id", two("counterexample", "counterexample")),
    newFinancing: {ratios: Object.fromEntries(Object.entries(ratios).map(([k, v]) => [k, list(p + "newFinancing." + k, "ratio", v)])),
      conventions: {factorConvention: list(p + "newFinancing.factorConvention", "convention", two("dated_contract_split_at_cash_flows", "dated_contract_split_at_cash_flows")),
        paysAccruedInterest: list(p + "newFinancing.paysAccruedInterest", "convention", two("true", "true")),
        unpaidInterestBase: list(p + "newFinancing.unpaidInterestBase", "convention", two("principal_plus_accrued", "principal_plus_accrued"))}}},
    rules: [{id: cashRule, kind: text(p + `rule.${cashRule}.kind`, "minimum_available_cash"), threshold: num(p + `rule.${cashRule}.threshold`, "currency", "10")},
      {id: coverageRule, kind: text(p + `rule.${coverageRule}.kind`, "minimum_interest_coverage"), threshold: num(p + `rule.${coverageRule}.threshold`, "ratio", "10")}]};
  const analysis = {...f.context, analysisId: aid, scenario: sc, maximumAmount: num("maximumAmount", "currency", "200"), monetaryQuantum: num("monetaryQuantum", "currency", "1"),
    fixedReviewAmount: null, horizonMode: text("horizonMode", "full_settlement"),
    newDebtFinalPaymentDate: f.contribute(pfx + "newDebtFinalPaymentDate", "date", {type: "date", value: "2028-12-31"}, sc),
    existingDebtFinalPaymentDates: list("existingDebtFinalPaymentDates", "date", []), scenarios: [scenario]} as unknown as AdoptedDebtCapacityInput;
  const envelope = f.seal(); analysis.envelope = envelope;
  return {schemaVersion: "debt-capacity-packet-input.v1" as const, question: "Quanto cabe?",
    cases: [{id: "informed", role: "informed" as const, label: "Contraexemplo", changes: [] as string[], analysis,
      limits: [{id: "cash", label: "Caixa mínimo", ruleIds: [cashRule]}, {id: "interest", label: "Cobertura de juros", ruleIds: [coverageRule]}]}]};
}

/** The facts of ficha C04 as the conversation would state them (fictitious Aurora, R$ million),
 * for the premises path: the same calibration the hand-built basis above adopts. */
export function auroraCapacityFacts(): import("./debt-capacity-premises").DebtCapacityFacts {
  const doc = <T>(value: T, source: string) => ({value, origin: "document" as const, source});
  const informed = <T>(value: T, source: string) => ({value, origin: "informed" as const, source});
  const houseFact = <T>(value: T, source: string) => ({value, origin: "house" as const, source});
  const per = (f: (y: number) => Decimal | string) => years.map((y) => {const v = f(y); return typeof v === "string" ? v : s(v);});
  const cash = (f: (y: number) => Decimal | string) => years.map((y) => new D(f(y)).toDecimalPlaces(8).toFixed());
  const interestExisting = (y: number) => new D(debenture[y - 1]!).plus(debenture[y]!).div(2).times(new D(CDI[y]!).plus("0.029"))
    .plus(new D(finame[y - 1]!).plus(finame[y]!).div(2).times(new D(TLP).plus("0.018"))).plus(new D(SEASONAL_LINE).times("0.5").times(new D(CDI[y]!).plus("0.02")));
  const projectCase = (key: keyof typeof c04Schedules) => {
    const sched = c04Schedules[key], project = (y: number) => new D(sched.projectEbitda[y] ?? "0");
    return {capex: per((y) => sched.capex[y] ?? "0"), ebitda: per((y) => project(y)),
      depreciation: per((y) => new D(y >= 2029 ? 6 : y === 2028 ? 3 : 0)), maintenanceCapex: per((y) => project(y).gt(0) ? new D("1.5") : new D(0)),
      workingCapitalInvestment: per((y) => project(y).minus(project(y - 1)))};
  };
  return {capacityId: id(4400), entityId: id(1), perimeter: "standalone", currency: "BRL", definitionVersionId: id(3),
    openingDate: "2026-12-31", periodEnds: years.map((y) => `${y}-12-31`),
    company: {openingAvailableCash: doc(OPENING_CASH, "balanço de dezembro de 2026"), ebitda: doc(per((y) => EBITDA[y]!), "projeção da companhia"),
      leasePayments: doc(per(() => LEASE), "projeção da companhia"), depreciation: doc(per(() => DA), "projeção da companhia"),
      maintenanceCapex: doc(per(() => MAINTENANCE), "projeção da companhia"), workingCapitalInvestment: doc(per(() => WORKING_CAPITAL), "projeção da companhia"),
      cashTaxRate: informed(TAX, "lucro real, alíquota de 34%"), covenantEbitdaExcludesLeases: doc(true, "escritura da debênture, EBITDA sem IFRS 16")},
    existingDebt: doc({closingDebt: per((y) => new D(debenture[y]!).plus(finame[y]!).plus(SEASONAL_LINE)), principalPaid: per((y) => new D(debenture[y - 1]!).minus(debenture[y]!).plus(finame[y - 1]!).minus(finame[y]!)),
      cashInterest: cash(interestExisting), finalPaymentDates: ["2033-12-31"]}, "tabela de dívida"),
    cases: [informed({id: "informed", role: "informed" as const, label: "2S27 e 1S28, como informado", changes: [], ...projectCase("informed")}, "plano da segunda linha"),
      informed({id: "phased", role: "alternative" as const, label: "Faseado em 2028 e 2029", changes: ["Desembolso em 2028 e 2029; resultado a partir de 2030"], ...projectCase("phased")}, "alternativa discutida na conversa")],
    structure: houseFact({label: "Cinco anos com carência até 2030", annualRate: per((y) => c04Structures.fiveYears.rate(y)),
      amortizationShares: per((y) => c04Structures.fiveYears.amortization[y] ? fraction(c04Structures.fiveYears.amortization[y]!) : new D(0)), finalPaymentDate: "2032-12-31"}, "estrutura de referência de mercado, CDI + 2,5%"),
    limits: [doc({id: "covenant", label: "Covenant da escritura com folga de 0,5x no base e 3,0x no adverso", kind: "maximum_net_debt_to_ebitda" as const, base: "2.5", adverse: "3"}, "escritura, limite 3,0x"),
      houseFact({id: "market", label: "Alavancagem de 2,75x acima da qual preço e apetite pioram", kind: "maximum_net_debt_to_ebitda" as const, base: "2.75", adverse: null}, "faixa de mercado"),
      houseFact({id: "interest", label: "Cobertura de juros mínima de 2,5x", kind: "minimum_interest_coverage" as const, base: "2.5", adverse: null}, "referência de crédito")],
    stress: {ebitdaShock: houseFact("0.15", "caso adverso do banco, EBITDA 15% menor")},
    requestedAmount: informed("60", "segunda linha de R$ 60 milhões"), monetaryQuantum: houseFact("0.01", "resolução de R$ 10 mil")};
}
