import Decimal from "decimal.js";
import {z} from "zod";
import {brazilianBusinessDays} from "@offroad/financial-core";
import type {ProposedHypothesis} from "./investment-premises";

const Exact = Decimal.clone({precision: 80, rounding: Decimal.ROUND_HALF_UP});
const text = z.string().trim().min(1).max(2000);
const amount = z.string().regex(/^\d{1,24}(?:\.\d{1,20})?$/);
const signed = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
const ratio = z.string().regex(/^-?\d{1,4}(?:\.\d{1,20})?$/);
const origins = ["document", "informed", "house", "estimate"] as const;
const originLabel: Record<(typeof origins)[number], string> = {document: "documento", informed: "informado", house: "premissa da casa", estimate: "estimativa"};
/** A value and where it came from; the source names the document, the message or the house rule. */
const fact = <T extends z.ZodType>(value: T) => z.strictObject({value, origin: z.enum(origins), source: text});
const quarterIndex = z.number().int().min(0).max(80);
const byQuarter = z.array(z.strictObject({quarter: quarterIndex, amount})).max(80);
const series = z.array(signed).min(1).max(80);

const existingDebt = z.strictObject({
  id: z.uuid(), label: text, openingPrincipal: amount,
  rate: z.discriminatedUnion("kind", [z.strictObject({kind: z.literal("floating"), annualSpread: ratio}), z.strictObject({kind: z.literal("fixed"), annualRate: ratio})]),
  couponBase: z.enum(["opening_principal", "average_principal"]),
  draws: byQuarter, amortization: byQuarter, prepayments: byQuarter,
  /** Quarters that settle the accrued coupon when the coupon is not paid every quarter. */
  accruedPaymentQuarters: z.array(quarterIndex).max(80).nullable(),
  charges: z.array(z.strictObject({id: text, category: z.enum(["origination_fee", "recurring_fee", "tax", "other"]), quarter: quarterIndex, amount, deductible: z.boolean()})).max(16),
});
const proposal = z.strictObject({
  id: z.uuid(), label: text, amount, annualSpread: ratio, feeRate: ratio, creditTax: z.boolean(),
  drawQuarter: quarterIndex,
  /** Quarters after the draw, the first counted as zero, of each equal installment; the last absorbs rounding. */
  amortizationQuarters: z.array(z.number().int().min(0).max(80)).min(1).max(40),
  /** Coupon settled every `couponEveryQuarters` quarters (1 quarterly, 2 semiannual) and at maturity. */
  couponEveryQuarters: z.number().int().min(1).max(4),
  collateralShareOfLoan: ratio,
  covenant: z.strictObject({name: text, limit: ratio, leaseLiabilityInDebt: z.boolean(), ebitdaExcludesLeases: z.boolean(), testFrequency: z.enum(["semiannual", "annual"])}),
  waiver: z.strictObject({instrumentId: z.uuid(), quarter: quarterIndex, cost: amount, deductible: z.boolean()}).nullable(),
  /** Contract dates: the draw date and the day of the month of each quarterly payment. With them the
   * lifetime runs on those dates, CDI accrues by national business days over 252 and periods split on
   * 1 January where the curve changes; without them each quarter counts as a quarter of a year. */
  contractDates: z.strictObject({drawDate: z.iso.date(), paymentDay: z.number().int().min(1).max(28)}).nullable(),
  /** Where each clause came from, when the clauses have different sources (a consent fee stated by the CFO,
   * the spread from the term sheet). A clause without its own entry takes the proposal's origin. */
  provenance: z.partialRecord(z.enum(["amount", "annualSpread", "feeRate", "creditTax", "schedule", "collateral", "covenant", "waiver", "contractDates"]),
    z.strictObject({origin: z.enum(origins), source: text})).optional(),
});

/** The facts of one comparison, each with its origin. These are proposals: nothing here is
 * adopted until a person confirms the set, and every number later read by the method comes from
 * the adopted basis, not from this object. Quarters are indexed from the first projected quarter. */
export const financingComparisonFactsSchema = z.strictObject({
  comparisonId: z.uuid(), entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/), definitionVersionId: z.uuid(),
  openingDate: z.iso.date(), quarterEnds: z.array(z.iso.date()).min(2).max(80),
  /** Annual index (CDI) by calendar year; the last year applies to every later year. */
  indexCurve: fact(z.array(z.strictObject({year: z.number().int().min(2000).max(2200), annualRate: ratio})).min(1).max(40)),
  company: z.strictObject({
    openingAvailableCash: fact(amount), ebitda: fact(series), leasePayments: fact(series), depreciationAndAmortization: fact(series),
    workingCapitalCashFlow: fact(series), maintenanceCapexPaid: fact(series), growthCapexPaid: fact(series),
    cashTaxRate: fact(ratio), freeReceivablesPool: fact(amount), leaseLiability: fact(amount),
    covenantHistory: fact(z.array(z.strictObject({period: text, ebitda: signed, leasePayments: signed})).min(1).max(8)),
    minimumCashPolicy: fact(amount).nullable(), maximumCollateralShare: fact(ratio).nullable(),
  }),
  existingDebt: fact(z.array(existingDebt).max(10)),
  proposals: z.array(fact(proposal)).min(1).max(4),
  /** Credit tax on loans: fixed rate plus daily rate up to a day cap, adopted with its source. */
  creditTax: fact(z.strictObject({fixedRate: ratio, dailyRate: ratio, maxDays: z.number().int().min(1).max(3650)})),
  stress: z.strictObject({ebitdaShock: fact(ratio), fromQuarter: fact(quarterIndex)}),
}).superRefine((f, ctx) => {
  const n = f.quarterEnds.length, fail = (message: string) => ctx.addIssue({code: "custom", message});
  for (const k of ["ebitda", "leasePayments", "depreciationAndAmortization", "workingCapitalCashFlow", "maintenanceCapexPaid", "growthCapexPaid"] as const)
    if (f.company[k].value.length !== n) fail(`Company ${k} must have one value per quarter`);
  for (const d of f.existingDebt.value) for (const q of [...d.draws, ...d.amortization, ...d.prepayments].map((x) => x.quarter)) if (q >= n) fail("Debt event outside the horizon");
  for (const p of f.proposals) if (p.value.drawQuarter >= n) fail("Proposal drawn outside the horizon");
  if (new Set([...f.existingDebt.value.map((d) => d.id), ...f.proposals.map((p) => p.value.id)]).size !== f.existingDebt.value.length + f.proposals.length) fail("Duplicate instrument");
});
export type FinancingComparisonFacts = z.infer<typeof financingComparisonFactsSchema>;

const rate16 = (v: Decimal) => v.toDecimalPlaces(16, Decimal.ROUND_HALF_UP).toFixed();
const nextDay = (d: string) => {const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10);};
const quarterEndAfter = (d: string, k: number) => {const x = new Date(`${d}T00:00:00Z`); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1 + 3 * k, 0)).toISOString().slice(0, 10);};

/** The hypotheses one confirmation adopts: the company's quarters, existing debt, each proposal
 * in the horizon and over its life, the case of the company and the bank's stress, which adopts
 * only the EBITDA it changes. Every reason states the origin of the number. Deterministic. */
export function proposeFinancingComparisonHypotheses(raw: unknown): ProposedHypothesis[] {
  const f = financingComparisonFactsSchema.parse(raw);
  const out: ProposedHypothesis[] = [], prefix = `comparison.${f.comparisonId}.`, n = f.quarterEnds.length;
  const endDate = f.quarterEnds[n - 1]!;
  const why = (x: {origin: (typeof origins)[number]; source: string}, extra = "") => `Origem: ${originLabel[x.origin]}. ${x.source}${extra ? ` ${extra}` : ""}`;
  const house = (source: string) => `Origem: premissa da casa. ${source}`;
  const add = (path: string, unit: string, value: ProposedHypothesis["value"], reason: string, scenario = "base") => out.push({fieldPath: prefix + path,
    dimensions: {entityId: f.entityId, perimeter: f.perimeter, periodStart: f.openingDate, periodEnd: endDate, currency: f.currency, unit, scale: "1", scenario, definitionVersionId: f.definitionVersionId},
    value, reason});
  const list = (path: string, unit: string, values: string[], reason: string, scenario?: string) => add(path, unit, {type: "list", value: values}, reason, scenario);
  const num = (path: string, unit: string, value: string, reason: string) => add(path, unit, {type: "number", value}, reason);
  const txt = (path: string, unit: string, value: string, reason: string) => add(path, unit, {type: "text", value}, reason);
  const curve = [...f.indexCurve.value].sort((a, b) => a.year - b.year);
  const indexOf = (year: number) => new Exact((curve.filter((c) => c.year <= year).at(-1) ?? curve[0]!).annualRate);
  const quarterly = (annual: Decimal) => rate16(annual.plus(1).pow("0.25").minus(1));
  const floating = (spread: string) => f.quarterEnds.map((e) => quarterly(indexOf(Number(e.slice(0, 4))).plus(1).mul(new Exact(spread).plus(1)).minus(1)));
  const fixed = (annual: string) => f.quarterEnds.map(() => quarterly(new Exact(annual)));
  const at = (events: {quarter: number; amount: string}[]) => f.quarterEnds.map((_, q) => events.filter((e) => e.quarter === q).reduce((s, e) => s.plus(e.amount), new Exact(0)).toFixed());
  const start = (q: number) => nextDay(q ? f.quarterEnds[q - 1]! : f.openingDate);
  const flags = (quarters: number[] | null) => f.quarterEnds.map((_, q) => String(quarters!.includes(q)));

  // The comparison's cases and the quarters of the company.
  txt("case.role", "convention", "base", house("Caso da companhia"));
  txt("case.label", "explanation", "Plano da companhia", house("Rótulo do caso"));
  const shock = f.stress.ebitdaShock.value, pct = new Exact(shock).times(100).toDecimalPlaces(0).toFixed();
  add("case.role", "convention", {type: "text", value: "stress"}, house("Caso que um credor usaria"), "bank-stress");
  add("case.label", "explanation", {type: "text", value: "Caso do banco"}, house("Rótulo do caso"), "bank-stress");
  list("case.changes", "explanation", [`EBITDA ${pct}% menor a partir de ${f.quarterEnds[f.stress.fromQuarter.value]}`], house("O que o caso muda em relação ao caso base"), "bank-stress");
  add("case.inherits", "convention", {type: "text", value: "base"}, house("Herda do caso base tudo o que não muda"), "bank-stress");
  list("periodEnds", "date", f.quarterEnds, house("Fim de cada trimestre do horizonte"));
  const c = f.company;
  num("company.openingAvailableCash", "currency", c.openingAvailableCash.value, why(c.openingAvailableCash));
  for (const [k, key] of [["ebitda", "ebitda"], ["cashLeasePayments", "leasePayments"], ["depreciationAndAmortization", "depreciationAndAmortization"],
    ["workingCapitalCashFlow", "workingCapitalCashFlow"], ["maintenanceCapexPaid", "maintenanceCapexPaid"], ["growthCapexPaid", "growthCapexPaid"]] as const)
    list(`company.${k}`, "currency", c[key].value, why(c[key]));
  list("company.ebitda", "currency", c.ebitda.value.map((v, q) => q >= f.stress.fromQuarter.value ? new Exact(v).mul(new Exact(1).minus(shock)).toFixed() : v),
    why(f.stress.ebitdaShock, `EBITDA ${pct}% menor.`), "bank-stress");
  num("company.cashTaxRate", "ratio", c.cashTaxRate.value, why(c.cashTaxRate));
  txt("company.lossTaxTreatment", "convention", "no_cash_benefit", house("Prejuízo não gera benefício de caixa"));
  num("company.freeReceivablesPool", "currency", c.freeReceivablesPool.value, why(c.freeReceivablesPool));
  list("company.covenantHistory.periods", "identity", c.covenantHistory.value.map((h) => h.period), why(c.covenantHistory));
  list("company.covenantHistory.ebitda", "currency", c.covenantHistory.value.map((h) => h.ebitda), why(c.covenantHistory));
  list("company.covenantHistory.leasePayments", "currency", c.covenantHistory.value.map((h) => h.leasePayments), why(c.covenantHistory));
  if (c.minimumCashPolicy) num("company.minimumCashPolicy", "currency", c.minimumCashPolicy.value, why(c.minimumCashPolicy));
  if (c.maximumCollateralShare) num("company.maximumCollateralShare", "ratio", c.maximumCollateralShare.value, why(c.maximumCollateralShare));

  const terms = (root: string, reason: string, o: {opening: string; rates: string[]; base: string; draws: string[]; amort: string[]; prepay: string[]; pays: number[] | null}) => {
    txt(`${root}.timing`, "convention", "draw_at_period_start_pay_at_period_end", house("Desembolso no início do trimestre, pagamentos no fim"));
    txt(`${root}.indexer`, "convention", "none", house("Indexador composto na taxa efetiva do período, sem correção de principal"));
    txt(`${root}.couponTreatment`, "convention", o.pays ? "accrued_until_paid" : "cash_paid", reason);
    txt(`${root}.couponBase`, "convention", o.base, reason);
    txt(`${root}.drawdownAccount`, "convention", "available", house("Recursos no caixa disponível"));
    txt(`${root}.paymentAccount`, "convention", "available", house("Pagamentos do caixa disponível"));
    num(`${root}.openingPrincipal`, "currency", o.opening, reason);
    list(`${root}.couponRates`, "ratio", o.rates, `${reason} Taxa efetiva trimestral composta com a curva adotada.`);
    list(`${root}.drawdowns`, "currency", o.draws, reason);
    list(`${root}.scheduledPrincipal`, "currency", o.amort, reason);
    list(`${root}.prepayments`, "currency", o.prepay, reason);
    list(`${root}.repayAll`, "boolean", f.quarterEnds.map(() => "false"), house("Sem quitação antecipada além do adotado"));
    if (o.pays) list(`${root}.paysAccruedCoupon`, "boolean", flags(o.pays), reason);
  };
  const charges = (root: string, rows: {id: string; category: string; quarter: number; amount: string; deductible: boolean; payee?: string}[], reason: string) => {
    if (!rows.length) return;
    if (rows.some((r) => r.payee)) list(`${root}.instrumentIds`, "identity", rows.map((r) => r.payee ?? "self"), reason);
    list(`${root}.chargeIds`, "identity", rows.map((r) => r.id), reason); list(`${root}.categories`, "convention", rows.map((r) => r.category), reason);
    list(`${root}.dates`, "date", rows.map((r) => start(r.quarter)), reason); list(`${root}.amounts`, "currency", rows.map((r) => r.amount), reason);
    list(`${root}.deductible`, "boolean", rows.map((r) => String(r.deductible)), reason);
  };
  const debtReason = why(f.existingDebt);
  for (const d of f.existingDebt.value) {
    terms(`debt.${d.id}`, `${debtReason} ${d.label}.`, {opening: d.openingPrincipal, rates: d.rate.kind === "floating" ? floating(d.rate.annualSpread) : fixed(d.rate.annualRate),
      base: d.couponBase, draws: at(d.draws), amort: at(d.amortization), prepay: at(d.prepayments), pays: d.accruedPaymentQuarters});
    charges(`debt.${d.id}.charges`, d.charges, `${debtReason} ${d.label}.`);
  }
  const tax = f.creditTax.value;
  for (const p of f.proposals) {
    const v = p.value, root = `proposal.${v.id}`, reason = why(p);
    const clause = (k: keyof NonNullable<typeof v.provenance>) => v.provenance?.[k] ? why(v.provenance[k]!) : reason;
    // Several clauses in one premise: each cited with its own origin, in one "Origem:" line.
    const cite = (parts: [keyof NonNullable<typeof v.provenance>, string][]) => `Origem: ${parts.map(([k, name]) => {
      const x = v.provenance?.[k] ?? p; return `${name}, ${originLabel[x.origin]} (${x.source})`;}).join("; ")}.`;
    add(`${root}.label`, "identity", {type: "text", value: v.label}, reason);
    const life = Math.max(...v.amortizationQuarters) + 1, share = new Exact(v.amount).div(v.amortizationQuarters.length).toDecimalPlaces(8);
    let repaid = new Exact(0);
    const lifeAmort = Array.from({length: life}, (_, q) => {
      if (!v.amortizationQuarters.includes(q)) return new Exact(0);
      const a = q === Math.max(...v.amortizationQuarters) ? new Exact(v.amount).minus(repaid) : share; repaid = repaid.plus(a); return a;
    });
    const settles = (q: number) => (q + 1) % v.couponEveryQuarters === 0 || q === life - 1;
    // Lifetime grid: quarter q after the draw ends a quarter of a year later, or, on contract dates,
    // payment q falls 3q months after the draw (amortization q on payment q, coupon every k payments),
    // split on 1 January where the curve changes.
    type LifePeriod = {end: string; fraction: string; convention: string; businessDays: number | null; index: string; principal: string; pays: boolean};
    const base = v.contractDates?.drawDate ?? (f.quarterEnds[v.drawQuarter - 1] ?? f.openingDate);
    const lifePeriods: LifePeriod[] = [];
    if (v.contractDates) {
      const d0 = new Date(`${v.contractDates.drawDate}T00:00:00Z`), day = v.contractDates.paymentDay;
      let from = v.contractDates.drawDate;
      for (let k = 1; k <= life - 1; k++) {
        const pay = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 3 * k, day)).toISOString().slice(0, 10);
        for (let cut = from; cut < pay;) {
          const jan = `${Number(cut.slice(0, 4)) + 1}-01-01`, end = jan < pay ? jan : pay, bd = brazilianBusinessDays(cut, end);
          const last = end === pay;
          lifePeriods.push({end, fraction: rate16(new Exact(bd).div(252)), convention: "business_days_252", businessDays: bd, index: indexOf(Number(cut.slice(0, 4))).toFixed(),
            principal: last ? lifeAmort[k]!.toFixed() : "0", pays: last && (k % v.couponEveryQuarters === 0 || k === life - 1)});
          cut = end;
        }
        from = pay;
      }
    } else for (let q = 0; q < life; q++) {
      const end = quarterEndAfter(base, q + 1);
      lifePeriods.push({end, fraction: "0.25", convention: "adopted_year_fraction", businessDays: null, index: indexOf(Number(end.slice(0, 4))).toFixed(),
        principal: lifeAmort[q]!.toFixed(), pays: settles(q)});
    }
    const days = Math.min(tax.maxDays, 365 * 100), creditTax = v.creditTax ? new Exact(v.amount).mul(new Exact(tax.dailyRate).mul(days).plus(tax.fixedRate)) : new Exact(0);
    const fee = new Exact(v.amount).mul(v.feeRate);
    // A charge of zero is not a charge: an explicitly zero fee adds nothing.
    charges(`${root}.charges`, [...(fee.gt(0) ? [{id: `${v.label}-fee`, category: "origination_fee", quarter: v.drawQuarter, amount: fee.toFixed(), deductible: true}] : []),
      ...(v.creditTax && creditTax.gt(0) ? [{id: `${v.label}-iof`, category: "tax", quarter: v.drawQuarter, amount: creditTax.toFixed(), deductible: true}] : []),
      ...(v.waiver ? [{id: `${v.label}-waiver`, category: "other", quarter: v.waiver.quarter, amount: v.waiver.cost, deductible: v.waiver.deductible, payee: v.waiver.instrumentId}] : [])],
      `${cite([["feeRate", "comissão"], ...(v.creditTax ? [["creditTax", "IOF"] as [keyof NonNullable<typeof v.provenance>, string]] : []),
        ...(v.waiver ? [["waiver", "waiver"] as [keyof NonNullable<typeof v.provenance>, string]] : [])])}${v.creditTax ? ` Regra do IOF: ${f.creditTax.source}.` : ""}`);
    const collateral = new Exact(v.amount).mul(v.collateralShareOfLoan).toFixed();
    num(`${root}.collateralConsumed`, "currency", collateral, `${clause("collateral")} Cessão de ${new Exact(v.collateralShareOfLoan).times(100).toFixed()}% do saldo.`);
    const months = v.covenant.testFrequency === "annual" ? ["12"] : ["06", "12"];
    txt(`${root}.covenant.name`, "identity", v.covenant.name, clause("covenant"));
    txt(`${root}.covenant.leaseLiabilityInDebt`, "boolean", String(v.covenant.leaseLiabilityInDebt), clause("covenant"));
    num(`${root}.covenant.leaseLiability`, "currency", c.leaseLiability.value, why(c.leaseLiability));
    txt(`${root}.covenant.ebitdaExcludesLeases`, "boolean", String(v.covenant.ebitdaExcludesLeases), clause("covenant"));
    num(`${root}.covenant.trailingPeriods`, "count", "4", house("EBITDA dos últimos quatro trimestres"));
    list(`${root}.covenant.measurementPeriods`, "date", f.quarterEnds.filter((e, q) => q >= v.drawQuarter && months.includes(e.slice(5, 7))), clause("covenant"));
    num(`${root}.covenant.limit`, "ratio", v.covenant.limit, clause("covenant"));
    txt(`${root}.covenant.comparator`, "convention", "lte", house("Cumpre quando o índice não passa do limite"));
    num(`${root}.lifetime.grossAdvance`, "currency", v.amount, clause("amount"));
    num(`${root}.lifetime.upfrontWithheldCosts`, "currency", fee.plus(creditTax).toFixed(), `${cite([["feeRate", "comissão"], ...(v.creditTax ? [["creditTax", "IOF"] as [keyof NonNullable<typeof v.provenance>, string]] : [])])} Comissão e IOF retidos na entrada.`);
    num(`${root}.lifetime.annualSpread`, "ratio", v.annualSpread, clause("annualSpread"));
    txt(`${root}.lifetime.unpaidInterestBase`, "convention", "principal_plus_accrued", house("Juros não pagos acumulam sobre principal e juros"));
    num(`${root}.lifetime.lowerSpread`, "ratio", "0", house("Intervalo de busca do custo efetivo"));
    num(`${root}.lifetime.upperSpread`, "ratio", "0.2", house("Intervalo de busca do custo efetivo"));
    list(`${root}.lifetime.periodEnds`, "date", lifePeriods.map((l) => l.end), clause(v.contractDates ? "contractDates" : "schedule"));
    list(`${root}.lifetime.yearFractions`, "ratio", lifePeriods.map((l) => l.fraction),
      v.contractDates ? house("Dias úteis do calendário nacional sobre 252") : house("Cada trimestre como um quarto de ano"));
    list(`${root}.lifetime.annualIndex`, "ratio", lifePeriods.map((l) => l.index), why(f.indexCurve));
    list(`${root}.lifetime.yearFractionConventions`, "convention", lifePeriods.map((l) => l.convention), v.contractDates ? house("CDI em dias úteis, base 252") : house("Fração de ano adotada"));
    add(`${root}.lifetime.drawDate`, "date", {type: "date", value: base},
      v.contractDates ? clause("contractDates") : house("Na grade trimestral, o desembolso abre o trimestre e é registrado no fim do trimestre anterior"));
    if (v.contractDates) {
      list(`${root}.lifetime.businessDays`, "count", lifePeriods.map((l) => String(l.businessDays)), house("Dias úteis entre as datas pelo calendário nacional de feriados bancários"));
    }
    list(`${root}.lifetime.scheduledPrincipal`, "currency", lifePeriods.map((l) => l.principal), clause("schedule"));
    list(`${root}.lifetime.paysAccruedInterest`, "boolean", lifePeriods.map((l) => String(l.pays)), clause("schedule"));
  }
  return out;
}
