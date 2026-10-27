import {z} from "zod";
import {capacityUuid} from "./debt-capacity-premises";
import type {ProposedHypothesis} from "./investment-premises";

const text = z.string().trim().min(1).max(2000);
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
/** Money carries at most eight decimals, as the adopted numeric representation reads it. */
const money = z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/), signedMoney = z.string().regex(/^-?\d{1,24}(?:\.\d{1,8})?$/);
const ratio = z.string().regex(/^-?\d{1,4}(?:\.\d{1,20})?$/), unsignedRatio = z.string().regex(/^\d{1,4}(?:\.\d{1,20})?$/);
const count = (max: number) => z.number().int().min(0).max(max);
const date = z.iso.date();
const origins = ["document", "informed", "market", "house", "estimate"] as const;
const originLabel: Record<(typeof origins)[number], string> = {document: "documento", informed: "informado", market: "faixa de mercado", house: "premissa da casa", estimate: "estimativa"};
/** A value and where it came from; the source names the document, the message, the market range or the house rule. */
const fact = <T extends z.ZodType>(value: T) => z.strictObject({value, origin: z.enum(origins), source: text});
const origin = z.strictObject({origin: z.enum(origins), source: text});
type Origin = z.infer<typeof origin>;

const proposal = z.strictObject({
  lender: text, firmness: z.enum(["indicative", "committed"]), termSheetDate: date, validityDays: count(365), amount: money, annualSpread: ratio, feeRate: unsignedRatio,
  drawDate: date, paymentDay: z.number().int().min(1).max(28), graceMonths: count(120), installments: z.number().int().min(1).max(360),
  installmentEveryMonths: z.number().int().min(1).max(12), interestEveryMonths: z.number().int().min(1).max(12), amortization: z.enum(["sac", "bullet"]),
  collateralKind: z.enum(["receivables_assignment", "financed_asset", "other_asset", "none"]), coverage: unsignedRatio, restrictedAccount: z.boolean(),
  covenant: z.strictObject({maximumRatio: unsignedRatio, testDates: z.array(date).min(1).max(24), definition: z.enum(["same_as_indenture", "not_stated"])}).nullable(),
  prepayment: z.strictObject({penaltyRate: unsignedRatio, penaltyMonths: count(360)}), reciprocity: z.enum(["none_stated", "stated"]), bankSawIndenture: z.boolean(),
});
const clauses = ["drawDate", "paymentDay", "termSheetDate", "bankSawIndenture"] as const;

/** The facts of one received proposal and of the company that would take it, each with its origin.
 * Nothing here is adopted until a person confirms the set; every number the method reads comes from the
 * adopted basis. The period runs from the company calendar's opening date to its last period end. */
export const receivedProposalFactsSchema = z.strictObject({
  receivedProposalId: z.uuid(), entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/), definitionVersionId: z.uuid(),
  openingDate: date, readingDate: fact(date), needDate: fact(date),
  /** The term sheet, with the clauses that came from somewhere else named apart. */
  proposal: fact(proposal), provenance: z.partialRecord(z.enum(clauses), origin).optional(),
  creditTax: fact(z.strictObject({fixedRate: unsignedRatio, dailyRate: unsignedRatio, maxDays: count(3660)})),
  indexCurve: fact(z.array(z.strictObject({year: z.number().int().min(2000).max(2200), annualRate: ratio})).min(1).max(40)),
  tax: fact(z.strictObject({regime: z.enum(["lucro_real", "lucro_presumido", "unknown"]), rate: unsignedRatio})),
  uses: z.array(fact(z.strictObject({id: key, label: text, amount: money, kind: z.enum(["seasonal_working_capital", "long_lived_capex", "refinancing", "other"]),
    tenorMinYears: unsignedRatio, tenorMaxYears: unsignedRatio}))).min(1).max(8),
  seasonalPeak: fact(money).nullable(),
  calendar: fact(z.strictObject({periodEnds: z.array(date).min(1).max(40), existingService: z.array(money).min(1).max(40), availableForService: z.array(signedMoney).min(1).max(40),
    closingCash: z.array(signedMoney).min(1).max(40), taxable: z.array(z.boolean()).min(1).max(40)})),
  minimumCash: fact(money).nullable(),
  indenture: fact(z.strictObject({maximumRatio: unsignedRatio, testDates: z.array(date).min(1).max(24), source: text})),
  policy: fact(z.strictObject({maximumRatio: unsignedRatio, testDates: z.array(date).min(1).max(24), source: text})).nullable(),
  measurements: fact(z.array(z.strictObject({date, scenario: z.string().regex(/^[a-z0-9-]{1,40}$/), debt: money, cash: signedMoney, reportedEbitda: signedMoney,
    definitionAdjustment: signedMoney})).min(1).max(12)),
  portfolio: z.array(fact(z.strictObject({id: key, label: text, amount: money, contract: z.enum(["assignable", "prohibited_without_consent"]), encumbrance: z.enum(["free", "assigned"]),
    holder: text.nullable(), pastDue: z.boolean(), countsAgainstBasket: z.boolean()}))).min(1).max(12),
  basket: fact(z.strictObject({limit: money, basis: z.enum(["aggregate", "per_operation"]), occupied: money, consentLeadDaysMin: count(365), consentLeadDaysMax: count(365)})),
  collateralReference: fact(z.strictObject({coverageLow: unsignedRatio, coverageHigh: unsignedRatio})),
  market: fact(z.strictObject({comparable: z.boolean(), low: unsignedRatio, median: unsignedRatio, high: unsignedRatio, sample: z.number().int().min(1).max(10000),
    confidence: z.enum(["high", "moderate", "low"]), observedOn: date})).nullable(),
  history: fact(z.strictObject({label: text, spread: ratio, date, adjustments: z.array(z.strictObject({id: key,
    family: z.enum(["pricing_date", "tenor", "guarantee", "instrument_distribution", "scale", "other"]), bps: ratio, anchor: text})).max(8)})).nullable(),
  variants: z.array(fact(z.strictObject({id: key, label: text, graceMonths: count(120), installments: z.number().int().min(1).max(360), coverage: unsignedRatio, restrictedAccount: z.boolean()}))).max(4),
  alternatives: z.array(fact(z.strictObject({id: key, label: text, allInSpread: ratio.nullable(), collateral: money, usesCovered: z.array(key).min(1).max(8),
    monthsToMoneyMin: count(120), monthsToMoneyMax: count(120)}))).max(4),
}).superRefine((f, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  const c = f.calendar.value, n = c.periodEnds.length, end = c.periodEnds[n - 1]!;
  if ([c.existingService, c.availableForService, c.closingCash, c.taxable].some((s) => s.length !== n)) fail("Every calendar series has one value per period");
  if (c.periodEnds.some((e, i) => e <= (i ? c.periodEnds[i - 1]! : f.openingDate))) fail("Period ends follow the opening date in order");
  const p = f.proposal.value;
  if (p.drawDate <= f.openingDate || p.drawDate > end) fail("The draw falls inside the company calendar");
  if (f.readingDate.value > p.drawDate) fail("The reading precedes the draw");
  if (p.amortization === "bullet" && p.installments !== 1) fail("A bullet has one installment");
  for (const m of f.measurements.value) if (!c.periodEnds.includes(m.date)) fail(`Covenant test ${m.date} is not a period end of the calendar`);
  const ids = (list: {value: {id: string}}[], what: string) => {if (new Set(list.map((x) => x.value.id)).size !== list.length) fail(`Duplicate ${what}`);};
  ids(f.uses, "use"); ids(f.portfolio, "bucket"); ids(f.variants, "variant"); ids(f.alternatives, "alternative");
  for (const {value: b} of f.portfolio) {
    if ((b.encumbrance === "assigned") !== (b.holder !== null)) fail(`Bucket ${b.id} names the holder of its assignment, and only then`);
    if (b.countsAgainstBasket && b.encumbrance !== "assigned") fail(`Bucket ${b.id} is free and cannot occupy the basket`);
  }
  const uses = new Set(f.uses.map((u) => u.value.id));
  for (const {value: a} of f.alternatives) if (a.usesCovered.some((u) => !uses.has(u))) fail(`Alternative ${a.id} covers a use the analysis does not carry`);
  if (new Set(f.indexCurve.value.map((x) => x.year)).size !== f.indexCurve.value.length) fail("Index curve has two rates for the same year");
});
export type ReceivedProposalFacts = z.infer<typeof receivedProposalFactsSchema>;

export const receivedProposalAnalysisId = (receivedProposalId: string) => capacityUuid(`offroad:received-proposal:${receivedProposalId}:analysis`);
/** The size of one working basis. */
export const maxReceivedProposalHypotheses = 256;

/** The hypotheses one confirmation adopts: every term, rate, date, use, calendar series, covenant test,
 * bucket, basket term, reference, variant and alternative the adopted reader reads, plus the order of
 * the lists, so the packet is composed from the basis alone. Every reason states the origin of the
 * number. Deterministic; nothing is calculated here. */
export function proposeReceivedProposalHypotheses(raw: unknown): ProposedHypothesis[] {
  const f = receivedProposalFactsSchema.parse(raw);
  const out: ProposedHypothesis[] = [], prefix = `received_proposal.${receivedProposalAnalysisId(f.receivedProposalId)}.`;
  const endDate = f.calendar.value.periodEnds.at(-1)!;
  const why = (x: Origin) => `Origem: ${originLabel[x.origin]}. ${x.source}`;
  const house = (source: string) => `Origem: premissa da casa. ${source}`;
  const add = (path: string, unit: string, value: ProposedHypothesis["value"], reason: string) => out.push({fieldPath: prefix + path,
    dimensions: {entityId: f.entityId, perimeter: f.perimeter, periodStart: f.openingDate, periodEnd: endDate, currency: f.currency, unit, scale: "1", scenario: "base", definitionVersionId: f.definitionVersionId},
    value, reason});
  const num = (path: string, unit: string, value: string | number, reason: string) => add(path, unit, {type: "number", value: String(value)}, reason);
  const txt = (path: string, unit: string, value: string, reason: string) => add(path, unit, {type: "text", value}, reason);
  const day = (path: string, value: string, reason: string) => add(path, "date", {type: "date", value}, reason);
  const bool = (path: string, value: boolean, reason: string) => add(path, "convention", {type: "boolean", value}, reason);
  const list = (path: string, unit: string, value: string[], reason: string) => add(path, unit, {type: "list", value}, reason);

  day("readingDate", f.readingDate.value, why(f.readingDate));
  day("needDate", f.needDate.value, why(f.needDate));
  const p = f.proposal.value, r = why(f.proposal), clause = (k: (typeof clauses)[number]) => f.provenance?.[k] ? why(f.provenance[k]!) : r;
  txt("proposal.lender", "text", p.lender, r);
  txt("proposal.indexer", "convention", "cdi_plus", r);
  txt("proposal.firmness", "convention", p.firmness, r);
  day("proposal.termSheetDate", p.termSheetDate, clause("termSheetDate"));
  num("proposal.validityDays", "days", p.validityDays, r);
  num("proposal.amount", "currency", p.amount, r);
  num("proposal.annualSpread", "ratio", p.annualSpread, r);
  num("proposal.feeRate", "ratio", p.feeRate, r);
  day("proposal.drawDate", p.drawDate, clause("drawDate"));
  num("proposal.paymentDay", "count", p.paymentDay, clause("paymentDay"));
  for (const k of ["graceMonths", "installments", "installmentEveryMonths", "interestEveryMonths"] as const) num(`proposal.${k}`, "count", p[k], r);
  txt("proposal.amortization", "convention", p.amortization, r);
  txt("proposal.collateralKind", "convention", p.collateralKind, r);
  num("proposal.coverage", "ratio", p.coverage, r);
  bool("proposal.restrictedAccount", p.restrictedAccount, r);
  if (p.covenant) {
    num("proposal.covenantLimit", "ratio", p.covenant.maximumRatio, r);
    list("proposal.covenantTestDates", "date", p.covenant.testDates, r);
    txt("proposal.covenantDefinition", "convention", p.covenant.definition, r);
  }
  num("proposal.prepaymentPenaltyRate", "ratio", p.prepayment.penaltyRate, r);
  num("proposal.prepaymentPenaltyMonths", "count", p.prepayment.penaltyMonths, r);
  txt("proposal.reciprocity", "convention", p.reciprocity, r);
  bool("proposal.bankSawIndenture", p.bankSawIndenture, clause("bankSawIndenture"));
  const t = f.creditTax.value;
  num("creditTax.fixedRate", "ratio", t.fixedRate, why(f.creditTax));
  num("creditTax.dailyRate", "ratio", t.dailyRate, why(f.creditTax));
  num("creditTax.maxDays", "days", t.maxDays, why(f.creditTax));
  const curve = [...f.indexCurve.value].sort((a, b) => a.year - b.year);
  list("curve.years", "identity", curve.map((x) => String(x.year)), why(f.indexCurve));
  list("curve.rates", "ratio", curve.map((x) => x.annualRate), why(f.indexCurve));
  txt("tax.regime", "convention", f.tax.value.regime, why(f.tax));
  num("tax.rate", "ratio", f.tax.value.rate, why(f.tax));
  for (const u of f.uses) {
    const v = u.value, q = `use.${v.id}.`, w = why(u);
    txt(q + "label", "text", v.label, w); num(q + "amount", "currency", v.amount, w); txt(q + "kind", "convention", v.kind, w);
    num(q + "tenorMinYears", "years", v.tenorMinYears, w); num(q + "tenorMaxYears", "years", v.tenorMaxYears, w);
  }
  if (f.seasonalPeak) num("seasonalPeak", "currency", f.seasonalPeak.value, why(f.seasonalPeak));
  const c = f.calendar.value, cw = why(f.calendar);
  list("calendar.periodEnds", "date", c.periodEnds, cw);
  list("calendar.existingService", "currency", c.existingService, cw);
  list("calendar.availableForService", "currency", c.availableForService, cw);
  list("calendar.closingCash", "currency", c.closingCash, cw);
  list("calendar.taxable", "boolean", c.taxable.map(String), cw);
  if (f.minimumCash) num("calendar.minimumCash", "currency", f.minimumCash.value, why(f.minimumCash));
  const ind = f.indenture.value;
  num("covenant.indentureLimit", "ratio", ind.maximumRatio, why(f.indenture));
  list("covenant.indentureTestDates", "date", ind.testDates, why(f.indenture));
  txt("covenant.indentureSource", "text", ind.source, why(f.indenture));
  if (f.policy) {
    num("covenant.policyLimit", "ratio", f.policy.value.maximumRatio, why(f.policy));
    list("covenant.policyTestDates", "date", f.policy.value.testDates, why(f.policy));
    txt("covenant.policySource", "text", f.policy.value.source, why(f.policy));
  }
  const ms = f.measurements.value, mw = why(f.measurements);
  list("covenant.dates", "date", ms.map((m) => m.date), mw);
  list("covenant.scenarios", "identity", ms.map((m) => m.scenario), mw);
  for (const k of ["debt", "cash", "reportedEbitda", "definitionAdjustment"] as const) list(`covenant.${k}`, "currency", ms.map((m) => m[k]), mw);
  for (const b of f.portfolio) {
    const v = b.value, q = `bucket.${v.id}.`, w = why(b);
    txt(q + "label", "text", v.label, w); num(q + "amount", "currency", v.amount, w); txt(q + "contract", "convention", v.contract, w);
    txt(q + "encumbrance", "convention", v.encumbrance, w); if (v.holder !== null) txt(q + "holder", "text", v.holder, w);
    bool(q + "pastDue", v.pastDue, w); bool(q + "countsAgainstBasket", v.countsAgainstBasket, w);
  }
  const k = f.basket.value, kw = why(f.basket);
  num("basket.limit", "currency", k.limit, kw); txt("basket.basis", "convention", k.basis, kw); num("basket.occupied", "currency", k.occupied, kw);
  num("basket.consentLeadDaysMin", "days", k.consentLeadDaysMin, kw); num("basket.consentLeadDaysMax", "days", k.consentLeadDaysMax, kw);
  num("collateralReference.coverageLow", "ratio", f.collateralReference.value.coverageLow, why(f.collateralReference));
  num("collateralReference.coverageHigh", "ratio", f.collateralReference.value.coverageHigh, why(f.collateralReference));
  if (f.market) {
    const m = f.market.value, w = why(f.market);
    bool("market.comparable", m.comparable, w);
    for (const x of ["low", "median", "high"] as const) num(`market.${x}`, "ratio", m[x], w);
    num("market.sample", "count", m.sample, w); txt("market.confidence", "convention", m.confidence, w); day("market.observedOn", m.observedOn, w);
  }
  if (f.history) {
    const h = f.history.value, w = why(f.history);
    txt("history.label", "text", h.label, w); num("history.spread", "ratio", h.spread, w); day("history.date", h.date, w);
    list("history.adjustmentIds", "identity", h.adjustments.map((a) => a.id), w);
    list("history.adjustmentFamilies", "convention", h.adjustments.map((a) => a.family), w);
    list("history.adjustmentBps", "ratio", h.adjustments.map((a) => a.bps), w);
    list("history.adjustmentAnchors", "text", h.adjustments.map((a) => a.anchor), w);
  }
  for (const x of f.variants) {
    const v = x.value, q = `variant.${v.id}.`, w = why(x);
    txt(q + "label", "text", v.label, w); num(q + "graceMonths", "count", v.graceMonths, w); num(q + "installments", "count", v.installments, w);
    num(q + "coverage", "ratio", v.coverage, w); bool(q + "restrictedAccount", v.restrictedAccount, w);
  }
  for (const x of f.alternatives) {
    const v = x.value, q = `alternative.${v.id}.`, w = why(x);
    txt(q + "label", "text", v.label, w); if (v.allInSpread !== null) num(q + "allInSpread", "ratio", v.allInSpread, w);
    num(q + "collateral", "currency", v.collateral, w); list(q + "usesCovered", "identity", v.usesCovered, w);
    num(q + "monthsToMoneyMin", "months", v.monthsToMoneyMin, w); num(q + "monthsToMoneyMax", "months", v.monthsToMoneyMax, w);
  }
  list("order.uses", "identity", f.uses.map((u) => u.value.id), house("Ordem dos usos como informada"));
  list("order.buckets", "identity", f.portfolio.map((b) => b.value.id), house("Ordem dos grupos da carteira como informada"));
  list("order.variants", "identity", f.variants.map((v) => v.value.id), house("Ordem dos pedidos ao banco como informada"));
  list("order.alternatives", "identity", f.alternatives.map((a) => a.value.id), house("Ordem das alternativas como informada"));
  // A working basis holds at most 256 premises; a set larger than that is refused here, not at confirmation.
  if (out.length > maxReceivedProposalHypotheses) throw new Error("received_proposal_premises_exceed_basis");
  return out;
}
