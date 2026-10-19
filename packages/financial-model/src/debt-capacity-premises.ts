import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";
import type {ProposedHypothesis} from "./investment-premises";

const Exact = Decimal.clone({precision: 80, rounding: Decimal.ROUND_HALF_UP});
const text = z.string().trim().min(1).max(2000);
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const amount = z.string().regex(/^\d{1,24}(?:\.\d{1,20})?$/);
const signed = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
/** Money carries at most eight decimals, as the adopted numeric representation reads it. */
const money = z.string().regex(/^-?\d{1,24}(?:\.\d{1,8})?$/);
const ratio = z.string().regex(/^-?\d{1,4}(?:\.\d{1,20})?$/);
const share = z.string().regex(/^(?:0(?:\.\d{1,20})?|1(?:\.0{1,20})?)$/);
const origins = ["document", "informed", "house", "estimate"] as const;
const originLabel: Record<(typeof origins)[number], string> = {document: "documento", informed: "informado", house: "premissa da casa", estimate: "estimativa"};
/** A value and where it came from; the source names the document, the message or the house rule. */
const fact = <T extends z.ZodType>(value: T) => z.strictObject({value, origin: z.enum(origins), source: text});
const series = z.array(money).min(1).max(40);
const s20 = (v: Decimal) => v.toDecimalPlaces(20).toFixed();
const s8 = (v: Decimal) => v.toDecimalPlaces(8).toFixed();

/** One way of spending the use the new debt finances: when it is spent and what it brings. All
 * series are per period of the projection; the project's figures are its own, not the company's. */
const projectCase = z.strictObject({
  id: key, role: z.enum(["informed", "alternative"]), label: text, changes: z.array(text).max(20),
  capex: series, ebitda: series, depreciation: series, maintenanceCapex: series, workingCapitalInvestment: series,
});
const limit = z.strictObject({
  id: key, label: text, kind: z.enum(["maximum_net_debt_to_ebitda", "minimum_interest_coverage", "minimum_available_cash"]),
  /** The threshold in the company's case; in the adverse case only when the limit applies there too. */
  base: signed, adverse: signed.nullable(),
});

/** The facts of one capacity question, each with its origin. Nothing here is adopted until a person
 * confirms the set; every number the method reads comes from the adopted basis, not from this object.
 * Periods are the projection's (annual by default) and money is in the company's currency units. */
export const debtCapacityFactsSchema = z.strictObject({
  capacityId: z.uuid(), entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/), definitionVersionId: z.uuid(),
  openingDate: z.iso.date(), periodEnds: z.array(z.iso.date()).min(2).max(40),
  company: z.strictObject({
    openingAvailableCash: fact(money), ebitda: fact(series), leasePayments: fact(series), depreciation: fact(series),
    maintenanceCapex: fact(series), workingCapitalInvestment: fact(series), cashTaxRate: fact(share),
    /** The covenant's EBITDA excludes lease payments (pre-IFRS 16), as the indenture defines it. */
    covenantEbitdaExcludesLeases: fact(z.boolean()),
  }),
  /** The debt in place with its plan: closing balance as the covenant counts it, scheduled principal and cash interest. */
  existingDebt: fact(z.strictObject({closingDebt: series, principalPaid: series, cashInterest: series, finalPaymentDates: z.array(z.iso.date()).max(40)})),
  /** The informed use and at most one alternative: a working basis holds 256 premises and each schedule
   * carries a complete analysis in both scenarios. */
  cases: z.array(fact(projectCase)).min(1).max(2),
  /** The structure of the new debt: all-in annual rate per period, share of principal repaid at each period end, last payment. */
  structure: fact(z.strictObject({label: text, annualRate: z.array(ratio).min(1).max(40), amortizationShares: z.array(ratio).min(1).max(40), finalPaymentDate: z.iso.date()})),
  limits: z.array(fact(limit)).min(1).max(4),
  stress: z.strictObject({ebitdaShock: fact(share)}),
  /** The amount asked for, reviewed on every limit; absent, only the capacity is measured. */
  requestedAmount: fact(amount).nullable(),
  /** Search resolution of the capacity, in currency units. */
  monetaryQuantum: fact(amount),
}).superRefine((f, ctx) => {
  const n = f.periodEnds.length, fail = (message: string) => ctx.addIssue({code: "custom", message});
  if (f.periodEnds.some((d, i) => d <= (i ? f.periodEnds[i - 1]! : f.openingDate))) fail("Period ends must be increasing after the opening date");
  for (const k of ["ebitda", "leasePayments", "depreciation", "maintenanceCapex", "workingCapitalInvestment"] as const)
    if (f.company[k].value.length !== n) fail(`Company ${k} must have one value per period`);
  for (const k of ["closingDebt", "principalPaid", "cashInterest"] as const) if (f.existingDebt.value[k].length !== n) fail(`Existing debt ${k} must have one value per period`);
  const st = f.structure.value;
  if (st.annualRate.length !== n || st.amortizationShares.length !== n) fail("Structure must have one rate and one repayment share per period");
  // The shares repay the debt once, never more; a schedule that leaves principal after the horizon is a calibration window.
  if (st.amortizationShares.some((x) => new Exact(x).lt(0)) || st.amortizationShares.reduce((t, x) => t.plus(x), new Exact(0)).gt(1)) fail("Repayment shares must be non-negative and add up to at most one");
  if (new Set(f.cases.map((c) => c.value.id)).size !== f.cases.length || f.cases.filter((c) => c.value.role === "informed").length !== 1) fail("Exactly one informed case and unique case ids");
  for (const c of f.cases) {
    const v = c.value;
    for (const k of ["capex", "ebitda", "depreciation", "maintenanceCapex", "workingCapitalInvestment"] as const) if (v[k].length !== n) fail(`Case ${v.id} ${k} must have one value per period`);
    if (v.capex.some((x) => new Exact(x).lt(0)) || !v.capex.reduce((t, x) => t.plus(x), new Exact(0)).gt(0)) fail(`Case ${v.id} needs a positive use to finance`);
    if (v.role === "informed" && v.changes.length) fail("The informed case declares no changes");
    if (v.role === "alternative" && !v.changes.length) fail("An alternative must say what it changes");
  }
  if (new Set(f.limits.map((l) => l.value.id)).size !== f.limits.length) fail("Duplicate limit");
  // The adverse scenario is a scenario only when some limit applies there.
  if (f.limits.every((l) => l.value.adverse === null)) fail("At least one limit must apply in the adverse case");
});
export type DebtCapacityFacts = z.infer<typeof debtCapacityFactsSchema>;

/** RFC 4122 version 5 identity under the URL namespace, so a confirmation is reproducible. */
export function capacityUuid(name: string) {
  const ns = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
  const h = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6]! & 0x0f) | 0x50; h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
export const capacityAnalysisId = (capacityId: string, caseId: string) => capacityUuid(`offroad:capacity:${capacityId}:case:${caseId}`);
const ruleId = (capacityId: string, caseId: string, limitId: string, stressed: boolean) => capacityUuid(`offroad:capacity:${capacityId}:case:${caseId}:limit:${limitId}:${stressed ? "adverse" : "base"}`);
const scenarioId = (capacityId: string, caseId: string, stressed: boolean) => capacityUuid(`offroad:capacity:${capacityId}:case:${caseId}:scenario:${stressed ? "adverse" : "base"}`);

/** The hypotheses one confirmation adopts: for each case (as informed and each alternative) a
 * complete capacity analysis with the company's case and the adverse case, which changes only the
 * EBITDA the stress names. The new debt finances the case's use and is drawn as it is spent; its
 * interest uses the annual average-balance approximation the method declares. Every reason states
 * the origin of the number. Deterministic; nothing is calculated here. */
/** The size of one working basis. */
export const maxCapacityHypotheses = 256;
export function proposeDebtCapacityHypotheses(raw: unknown): ProposedHypothesis[] {
  const f = debtCapacityFactsSchema.parse(raw);
  const out: ProposedHypothesis[] = [], n = f.periodEnds.length, endDate = f.periodEnds[n - 1]!;
  const why = (x: {origin: (typeof origins)[number]; source: string}, extra = "") => `Origem: ${originLabel[x.origin]}. ${x.source}${extra ? ` ${extra}` : ""}`;
  const house = (source: string) => `Origem: premissa da casa. ${source}`;
  const cite = (parts: [string, {origin: (typeof origins)[number]; source: string}][]) => `Origem: ${parts.map(([name, x]) => `${name}, ${originLabel[x.origin]} (${x.source})`).join("; ")}.`;
  const co = f.company, debt = f.existingDebt, st = f.structure.value, keepFactor = new Exact(1).minus(f.stress.ebitdaShock.value);
  const D = (v: string) => new Exact(v);
  const lastPayment = [st.finalPaymentDate, ...debt.value.finalPaymentDates].sort().at(-1)!;
  // Full settlement only when the projection reaches the last payment and the debt in place ends it at zero;
  // a revolving line still open at the end leaves the capacity valid for the projected window.
  const horizonMode = endDate >= lastPayment && new Exact(debt.value.closingDebt[n - 1]!).isZero() ? "full_settlement" : "calibration_window";
  for (const c of f.cases) {
    const v = c.value, aid = capacityAnalysisId(f.capacityId, v.id), prefix = `debt_capacity.${aid}.`;
    const total = v.capex.reduce((t, x) => t.plus(x), new Exact(0));
    const perUnit = (xs: string[]) => xs.map((x) => s20(D(x).div(total)));
    const add = (path: string, unit: string, value: ProposedHypothesis["value"], reason: string, scenario: string) => out.push({fieldPath: prefix + path,
      dimensions: {entityId: f.entityId, perimeter: f.perimeter, periodStart: f.openingDate, periodEnd: endDate, currency: f.currency, unit, scale: "1", scenario, definitionVersionId: f.definitionVersionId},
      value, reason});
    const list = (path: string, unit: string, values: string[], reason: string, scenario: string) => add(path, unit, {type: "list", value: values}, reason, scenario);
    const num = (path: string, unit: string, value: string, reason: string, scenario: string) => add(path, unit, {type: "number", value}, reason, scenario);
    const txt = (path: string, unit: string, value: string, reason: string, scenario: string) => add(path, unit, {type: "text", value}, reason, scenario);
    const top = `${v.id}:base`;
    // The case: its role, label and what it changes, so the packet is composed from the basis alone.
    txt("case.role", "convention", v.role, why(c), top);
    txt("case.label", "explanation", v.label, why(c), top);
    list("case.changes", "explanation", v.changes, why(c), top);
    // The search: up to five times the use, at the adopted resolution.
    num("maximumAmount", "currency", s8(total.times(5)), house("Busca da capacidade até cinco vezes o uso a financiar"), top);
    num("monetaryQuantum", "currency", f.monetaryQuantum.value, why(f.monetaryQuantum), top);
    if (f.requestedAmount) num("fixedReviewAmount", "currency", f.requestedAmount.value, why(f.requestedAmount), top);
    txt("horizonMode", "convention", horizonMode, house(horizonMode === "full_settlement"
      ? "A projeção cobre o último pagamento de toda a dívida" : "A projeção termina com dívida em aberto; a capacidade vale para a janela projetada"), top);
    add("newDebtFinalPaymentDate", "date", {type: "date", value: st.finalPaymentDate}, why(f.structure), top);
    list("existingDebtFinalPaymentDates", "date", debt.value.finalPaymentDates, why(debt), top);
    // Each limit names the adopted rules that make it, so the binding one is identified.
    for (const l of f.limits) {
      txt(`limit.${l.value.id}.label`, "explanation", l.value.label, why(l), top);
      list(`limit.${l.value.id}.ruleIds`, "identity", [false, true].flatMap((stressed) => (stressed ? l.value.adverse : l.value.base) === null ? [] : [ruleId(f.capacityId, v.id, l.value.id, stressed)]), why(l), top);
    }
    for (const stressed of [false, true]) {
      const sid = scenarioId(f.capacityId, v.id, stressed), sc = `${v.id}:${stressed ? "adverse" : "base"}`, p = `scenario.${sid}.`;
      const keep = stressed ? keepFactor : new Exact(1);
      const shock = stressed ? ` ${cite([["choque do caso adverso", f.stress.ebitdaShock]])}` : "";
      list(p + "periodEnds", "date", f.periodEnds, house("Períodos da projeção adotada"), sc);
      num(p + "openingAvailableCash", "currency", co.openingAvailableCash.value, why(co.openingAvailableCash), sc);
      txt(p + "cashNetting", "convention", "signed_available", house("Caixa disponível descontado da dívida com o sinal que tiver"), sc);
      add(p + "includeNewAccruedInterestInDebt", "convention", {type: "boolean", value: false}, house("Juros da dívida nova pagos no período, sem acúmulo"), sc);
      const pair = (name: string, fixed: string[], unit: string[], reason: string) => {
        list(p + name + ".fixed", "currency", fixed, reason, sc);
        list(p + name + ".perUnitNewDebt", "ratio", unit, reason, sc);
      };
      const ebitda = co.ebitda.value.map((x) => s8(D(x).times(keep)));
      pair("ebitda", ebitda, v.ebitda.map((x) => s20(D(x).times(keep).div(total))), cite([["EBITDA da companhia", co.ebitda], ["EBITDA do projeto", c]]) + shock);
      pair("covenantEbitdaAdjustment", co.leasePayments.value.map((x) => co.covenantEbitdaExcludesLeases.value ? s8(D(x).neg()) : "0"), f.periodEnds.map(() => "0"),
        cite([["definição do EBITDA do covenant", co.covenantEbitdaExcludesLeases], ["arrendamentos pagos", co.leasePayments]]));
      pair("nonCashEbitdaBridge", f.periodEnds.map(() => "0"), f.periodEnds.map(() => "0"), house("Sem ajuste não caixa entre o EBITDA e o caixa operacional"));
      pair("cashLeasePayments", co.leasePayments.value, f.periodEnds.map(() => "0"), why(co.leasePayments));
      pair("changeInWorkingCapital", co.workingCapitalInvestment.value, perUnit(v.workingCapitalInvestment), cite([["capital de giro da companhia", co.workingCapitalInvestment], ["capital de giro do projeto", c]]));
      pair("maintenanceCapex", co.maintenanceCapex.value, perUnit(v.maintenanceCapex), cite([["manutenção da companhia", co.maintenanceCapex], ["manutenção do projeto", c]]));
      pair("growthCapex", f.periodEnds.map(() => "0"), perUnit(v.capex), cite([["uso a financiar", c]]));
      // Taxable base before the new debt's interest: EBITDA less depreciation, lease payments and existing interest.
      pair("taxableBaseBeforeNewDebtInterest",
        f.periodEnds.map((_, i) => s8(D(co.ebitda.value[i]!).times(keep).minus(co.depreciation.value[i]!).minus(co.leasePayments.value[i]!).minus(debt.value.cashInterest[i]!))),
        f.periodEnds.map((_, i) => s20(D(v.ebitda[i]!).times(keep).minus(v.depreciation[i]!).div(total))),
        cite([["EBITDA", co.ebitda], ["depreciação", co.depreciation], ["arrendamentos", co.leasePayments], ["juros da dívida vigente", debt], ["resultado do projeto", c]])
          + " Premissa da casa: base tributável antes dos juros da dívida nova." + shock);
      pair("otherExistingFinancingCashAvailable", f.periodEnds.map(() => "0"), f.periodEnds.map(() => "0"), house("Sem outra fonte de financiamento vigente além da informada"));
      pair("capitalCashAvailable", f.periodEnds.map(() => "0"), f.periodEnds.map(() => "0"), house("Sem aporte de capital no período"));
      list(p + "existingCashInterest", "currency", debt.value.cashInterest, why(debt), sc);
      list(p + "existingCashPrincipalPaid", "currency", debt.value.principalPaid, why(debt), sc);
      list(p + "existingDebtForRatio", "currency", debt.value.closingDebt, why(debt), sc);
      list(p + "cashTaxRate", "ratio", f.periodEnds.map(() => co.cashTaxRate.value), why(co.cashTaxRate), sc);
      list(p + "lossTaxTreatment", "convention", f.periodEnds.map(() => "no_cash_benefit"), house("Prejuízo fiscal sem benefício de caixa no período"), sc);
      list(p + "newDebtTaxDeduction", "convention", f.periodEnds.map(() => "paid_interest"), house("Juros da dívida nova dedutíveis quando pagos"), sc);
      list(p + "cfadsGrowthCapexTreatment", "convention", f.periodEnds.map(() => "exclude_growth_capex"), house("Caixa para o serviço da dívida antes do investimento financiado"), sc);
      list(p + "cfadsDefinitionAnchors", "reference_id", f.periodEnds.map(() => "caixa disponível para o serviço da dívida"), house("Definição de caixa disponível do método"), sc);
      const nf = (name: string, values: string[], reason: string) => list(p + "newFinancing." + name, "ratio", values, reason, sc);
      const rate = st.annualRate.map((x) => D(x));
      nf("drawAtStart", f.periodEnds.map(() => "0"), house("Desembolso ao fim de cada período, conforme o uso é gasto"));
      nf("drawAtEnd", perUnit(v.capex), cite([["uso a financiar", c]]));
      nf("principalPaidAtEnd", st.amortizationShares, why(f.structure));
      nf("interestFactorOnOpeningAndStartDraw", rate.map(s20), why(f.structure));
      nf("interestFactorOnEndDraw", rate.map((r) => s20(r.div(2))), why(f.structure, "Premissa da casa: saldo médio anual."));
      nf("interestFactorCreditOnEndAmortization", rate.map((r) => s20(r.div(2))), why(f.structure, "Premissa da casa: saldo médio anual."));
      nf("withheldCostPerUnitDraw", f.periodEnds.map(() => "0"), house("Custos de entrada fora da capacidade; medidos pela comparação de propostas"));
      list(p + "newFinancing.factorConvention", "convention", f.periodEnds.map(() => "adopted_annual_average_balance_approximation"), house("Aproximação anual por saldo médio declarada pelo método"), sc);
      list(p + "newFinancing.paysAccruedInterest", "convention", f.periodEnds.map(() => "true"), house("Juros pagos em cada período"), sc);
      list(p + "newFinancing.unpaidInterestBase", "convention", f.periodEnds.map(() => "principal_only"), house("Sem juros sobre juros"), sc);
      for (const l of f.limits) {
        const threshold = stressed ? l.value.adverse : l.value.base;
        if (threshold === null) continue;
        const rid = ruleId(f.capacityId, v.id, l.value.id, stressed);
        txt(p + `rule.${rid}.kind`, "convention", l.value.kind, why(l), sc);
        num(p + `rule.${rid}.threshold`, l.value.kind === "minimum_available_cash" ? "currency" : "ratio", threshold, why(l), sc);
      }
    }
  }
  // A working basis holds at most 256 premises; a set larger than that is refused here, not at confirmation.
  if (out.length > maxCapacityHypotheses) throw new Error("capacity_premises_exceed_basis");
  return out;
}
