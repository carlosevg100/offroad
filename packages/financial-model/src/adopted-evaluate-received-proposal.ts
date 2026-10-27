import Decimal from "decimal.js";
import {z} from "zod";
import {evaluateReceivedProposal, financialCoreVersion, type ReceivedProposalInput} from "@offroad/financial-core";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {adoptedAnalysisContextSchema, createAnalysisBinding} from "./adopted-analysis-binding";
import {receivedProposalAdoptedExclusions, receivedProposalFingerprint} from "./evaluate-received-proposal-results";

const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), words = z.string().trim().min(1).max(2000);
const unsigned = z.string().regex(/^\d{1,24}(?:\.\d{1,20})?$/), signed = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
const whole = z.string().regex(/^\d{1,7}$/), ratio = z.string().regex(/^-?\d{1,4}(?:\.\d{1,20})?$/);
const optional = selection.nullable();

/** One received proposal and the company that would take it. The period runs from the company calendar's
 * opening date to its last period end; every term, rate, date, use, bucket, covenant test, reference and
 * variant is an adopted contribution read in its own context. */
export const adoptedReceivedProposalInputSchema = adoptedAnalysisContextSchema.safeExtend({
  analysisId: z.uuid(), scenario: z.string().trim().min(1).max(160),
  readingDate: selection, needDate: selection,
  proposal: z.strictObject({lender: selection, indexer: selection, firmness: selection, termSheetDate: selection, validityDays: selection, amount: selection, annualSpread: selection,
    feeRate: selection, drawDate: selection, paymentDay: selection, graceMonths: selection, installments: selection, installmentEveryMonths: selection, interestEveryMonths: selection,
    amortization: selection, collateralKind: selection, coverage: selection, restrictedAccount: selection, covenantLimit: optional, covenantTestDates: optional, covenantDefinition: optional,
    prepaymentPenaltyRate: selection, prepaymentPenaltyMonths: selection, reciprocity: selection, bankSawIndenture: selection}),
  creditTax: z.strictObject({fixedRate: selection, dailyRate: selection, maxDays: selection}),
  curve: z.strictObject({years: selection, rates: selection}),
  tax: z.strictObject({regime: selection, rate: selection, taxableAfterCalendar: optional}),
  uses: z.array(z.strictObject({id: key, label: selection, amount: selection, kind: selection, tenorMinYears: selection, tenorMaxYears: selection})).min(1).max(8),
  seasonalPeak: optional,
  calendar: z.strictObject({periodEnds: selection, existingService: selection, availableForService: selection, closingCash: selection, taxable: selection, minimumCash: optional}),
  covenant: z.strictObject({indentureLimit: selection, indentureTestDates: selection, indentureSource: selection, requiredScenarios: selection, policyLimit: optional, policyTestDates: optional, policySource: optional,
    /** The covenant tests without the proposal, as parallel lists; all absent when no test was adopted at all. */
    dates: optional, scenarios: optional, debt: optional, cash: optional, reportedEbitda: optional, definitionAdjustment: optional}),
  portfolio: z.array(z.strictObject({id: key, label: selection, amount: selection, contract: selection, encumbrance: selection, holder: optional, pastDue: selection,
    countsAgainstBasket: selection})).min(1).max(12),
  basket: z.strictObject({limit: selection, basis: selection, occupied: selection, consentLeadDaysMin: selection, consentLeadDaysMax: selection}),
  collateralReference: z.strictObject({coverageLow: selection, coverageHigh: selection}),
  market: z.strictObject({comparable: selection, low: selection, median: selection, high: selection, sample: selection, confidence: selection, observedOn: selection}).nullable(),
  history: z.strictObject({label: selection, spread: selection, date: selection, adjustmentIds: selection, adjustmentFamilies: selection, adjustmentBps: selection, adjustmentAnchors: selection}).nullable(),
  variants: z.array(z.strictObject({id: key, label: selection, graceMonths: selection, installments: selection, coverage: selection, restrictedAccount: selection})).max(4),
  alternatives: z.array(z.strictObject({id: key, label: selection, allInSpread: optional, collateral: selection, usesCovered: selection, monthsToMoneyMin: selection,
    monthsToMoneyMax: selection})).max(4),
}).refine(i => i.endDate > i.openingDate, "Invalid horizon")
  .refine(i => [i.uses, i.portfolio, i.variants, i.alternatives].every(list => new Set(list.map(x => x.id)).size === list.length), "Duplicate id")
  .refine(i => (i.proposal.covenantLimit === null) === (i.proposal.covenantTestDates === null) && (i.proposal.covenantLimit === null) === (i.proposal.covenantDefinition === null), "Lender covenant needs limit, dates and definition")
  .refine(i => new Set([i.covenant.dates, i.covenant.scenarios, i.covenant.debt, i.covenant.cash, i.covenant.reportedEbitda, i.covenant.definitionAdjustment].map(x => x === null)).size === 1, "Covenant tests need every list or none")
  .refine(i => (i.covenant.policyLimit === null) === (i.covenant.policyTestDates === null) && (i.covenant.policyLimit === null) === (i.covenant.policySource === null), "Board policy needs limit, dates and source");
export type AdoptedReceivedProposalInput = z.infer<typeof adoptedReceivedProposalInputSchema>;

/** A received proposal over one adopted basis. Nothing contacts the lender, accepts the proposal or
 * projects the company: the company calendar and covenant tests come adopted from the projection. */
export function calculateAdoptedReceivedProposal(raw: unknown) {
  const input = adoptedReceivedProposalInputSchema.parse(raw), prefix = `received_proposal.${input.analysisId}.`, sc = input.scenario;
  const p = input.proposal, c = input.calendar, v = input.covenant;
  const monetary = [p.amount, input.seasonalPeak, c.existingService, c.availableForService, c.closingCash, c.minimumCash, v.debt, v.cash, v.reportedEbitda, v.definitionAdjustment,
    input.basket.limit, input.basket.occupied, ...input.uses.map(u => u.amount), ...input.portfolio.map(b => b.amount), ...input.alternatives.map(a => a.collateral)]
    .filter((s): s is z.infer<typeof selection> => s !== null);
  const b = createAnalysisBinding(input, monetary);
  let complete = true;
  const need = <T>(x: T | null): T => {if (x === null) complete = false; return x as T;};
  type Kind = "number" | "text" | "date" | "boolean" | "list";
  const read = <T>(s: z.infer<typeof selection>, path: string, unit: string, type: Kind, schema: z.ZodType<T>) => need(b.read(s, prefix + path, sc, unit, type, schema));
  const maybe = <T>(s: z.infer<typeof selection> | null, path: string, unit: string, type: Kind, schema: z.ZodType<T>) => s === null ? null : read(s, path, unit, type, schema);
  const count = (s: z.infer<typeof selection>, path: string, unit = "count") => Number(read(s, path, unit, "number", whole));
  const flag = (s: z.infer<typeof selection>, path: string) => read(s, path, "convention", "boolean", z.boolean());
  const dates = z.array(z.iso.date()).min(1).max(40), money = z.array(signed).min(1).max(40);
  // A list of test dates or period ends holds each date once; a repetition is refused by name, never collapsed.
  const uniqueDates = dates.refine((v) => new Set(v).size === v.length, "received_proposal_duplicate_test_date");
  const convention = <const T extends readonly [string, ...string[]]>(s: z.infer<typeof selection>, path: string, values: T) => read(s, path, "convention", "text", z.enum(values));
  const lenderCovenant = p.covenantLimit === null ? null : {maximumRatio: read(p.covenantLimit, "proposal.covenantLimit", "ratio", "number", unsigned),
    testDates: read(p.covenantTestDates!, "proposal.covenantTestDates", "date", "list", uniqueDates),
    definition: convention(p.covenantDefinition!, "proposal.covenantDefinition", ["same_as_indenture", "not_stated"])};
  const proposal: ReceivedProposalInput["proposal"] = {
    lender: read(p.lender, "proposal.lender", "text", "text", words), indexer: convention(p.indexer, "proposal.indexer", ["cdi_plus", "percent_of_cdi", "ipca_plus", "fixed"]),
    firmness: convention(p.firmness, "proposal.firmness", ["indicative", "committed"]), termSheetDate: read(p.termSheetDate, "proposal.termSheetDate", "date", "date", z.iso.date()),
    validityDays: count(p.validityDays, "proposal.validityDays", "days"), amount: read(p.amount, "proposal.amount", "currency", "number", unsigned),
    annualSpread: read(p.annualSpread, "proposal.annualSpread", "ratio", "number", ratio), feeRate: read(p.feeRate, "proposal.feeRate", "ratio", "number", unsigned),
    drawDate: read(p.drawDate, "proposal.drawDate", "date", "date", z.iso.date()), paymentDay: count(p.paymentDay, "proposal.paymentDay"),
    graceMonths: count(p.graceMonths, "proposal.graceMonths"), installments: count(p.installments, "proposal.installments"),
    installmentEveryMonths: count(p.installmentEveryMonths, "proposal.installmentEveryMonths"), interestEveryMonths: count(p.interestEveryMonths, "proposal.interestEveryMonths"),
    amortization: convention(p.amortization, "proposal.amortization", ["sac", "bullet"]),
    collateralKind: convention(p.collateralKind, "proposal.collateralKind", ["receivables_assignment", "financed_asset", "other_asset", "none"]),
    coverage: read(p.coverage, "proposal.coverage", "ratio", "number", unsigned), restrictedAccount: flag(p.restrictedAccount, "proposal.restrictedAccount"),
    covenant: lenderCovenant,
    prepayment: {penaltyRate: read(p.prepaymentPenaltyRate, "proposal.prepaymentPenaltyRate", "ratio", "number", unsigned), penaltyMonths: count(p.prepaymentPenaltyMonths, "proposal.prepaymentPenaltyMonths")},
    reciprocity: convention(p.reciprocity, "proposal.reciprocity", ["none_stated", "stated"]), bankSawIndenture: flag(p.bankSawIndenture, "proposal.bankSawIndenture")};
  const years = read(input.curve.years, "curve.years", "identity", "list", z.array(z.string().regex(/^\d{4}$/)).min(1).max(40));
  const rates = read(input.curve.rates, "curve.rates", "ratio", "list", z.array(ratio).min(1).max(40));
  const list = <T>(s: z.infer<typeof selection>, path: string, unit: string, schema: z.ZodType<T>) => read(s, path, unit, "list", schema);
  const tests = v.dates !== null;
  const opt = <T>(s: z.infer<typeof selection> | null, path: string, unit: string, schema: z.ZodType<T>): T | null => s === null ? null : list(s, path, unit, schema);
  const measurement = {dates: tests ? opt(v.dates, "covenant.dates", "date", dates) : [], scenarios: tests ? opt(v.scenarios, "covenant.scenarios", "identity", z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).min(1).max(12)) : [],
    debt: tests ? opt(v.debt, "covenant.debt", "currency", money) : [], cash: tests ? opt(v.cash, "covenant.cash", "currency", money) : [],
    reportedEbitda: tests ? opt(v.reportedEbitda, "covenant.reportedEbitda", "currency", money) : [],
    definitionAdjustment: tests ? opt(v.definitionAdjustment, "covenant.definitionAdjustment", "currency", money) : []};
  const m = input.market, h = input.history;
  const history = h === null ? null : {label: read(h.label, "history.label", "text", "text", words), spread: read(h.spread, "history.spread", "ratio", "number", ratio),
    date: read(h.date, "history.date", "date", "date", z.iso.date()), ids: list(h.adjustmentIds, "history.adjustmentIds", "identity", z.array(key).max(8)),
    families: list(h.adjustmentFamilies, "history.adjustmentFamilies", "convention", z.array(z.enum(["pricing_date", "tenor", "guarantee", "instrument_distribution", "scale", "other"])).max(8)),
    bps: list(h.adjustmentBps, "history.adjustmentBps", "ratio", z.array(signed).max(8)), anchors: list(h.adjustmentAnchors, "history.adjustmentAnchors", "text", z.array(words).max(8))};
  const kernelInput = {currency: input.currency, readingDate: read(input.readingDate, "readingDate", "date", "date", z.iso.date()),
    needDate: read(input.needDate, "needDate", "date", "date", z.iso.date()), proposal,
    creditTax: {fixedRate: read(input.creditTax.fixedRate, "creditTax.fixedRate", "ratio", "number", unsigned), dailyRate: read(input.creditTax.dailyRate, "creditTax.dailyRate", "ratio", "number", unsigned),
      maxDays: count(input.creditTax.maxDays, "creditTax.maxDays", "days")},
    indexCurve: years && rates ? years.map((y, i) => ({year: Number(y), annualRate: rates[i] ?? ""})) : [],
    tax: {regime: convention(input.tax.regime, "tax.regime", ["lucro_real", "lucro_presumido", "unknown"]), rate: read(input.tax.rate, "tax.rate", "ratio", "number", unsigned.refine((v) => new Decimal(v).gte(0) && new Decimal(v).lte(1), "received_proposal_tax_rate_out_of_domain")),
      taxableAfterCalendar: input.tax.taxableAfterCalendar === null ? null : flag(input.tax.taxableAfterCalendar, "tax.taxableAfterCalendar")},
    uses: input.uses.map(u => {const q = `use.${u.id}.`; return {id: u.id, label: read(u.label, q + "label", "text", "text", words), amount: read(u.amount, q + "amount", "currency", "number", unsigned),
      kind: convention(u.kind, q + "kind", ["seasonal_working_capital", "long_lived_capex", "refinancing", "other"]),
      tenorMinYears: read(u.tenorMinYears, q + "tenorMinYears", "years", "number", unsigned), tenorMaxYears: read(u.tenorMaxYears, q + "tenorMaxYears", "years", "number", unsigned)};}),
    seasonalPeak: maybe(input.seasonalPeak, "seasonalPeak", "currency", "number", unsigned),
    calendar: {openingDate: input.openingDate, periodEnds: list(c.periodEnds, "calendar.periodEnds", "date", uniqueDates), existingService: list(c.existingService, "calendar.existingService", "currency", money),
      availableForService: list(c.availableForService, "calendar.availableForService", "currency", money), closingCash: list(c.closingCash, "calendar.closingCash", "currency", money),
      taxable: (list(c.taxable, "calendar.taxable", "boolean", z.array(z.enum(["true", "false"])).min(1).max(40)) ?? []).map(x => x === "true"),
      minimumCash: maybe(c.minimumCash, "calendar.minimumCash", "currency", "number", unsigned)},
    covenant: {indenture: {maximumRatio: read(v.indentureLimit, "covenant.indentureLimit", "ratio", "number", unsigned), testDates: list(v.indentureTestDates, "covenant.indentureTestDates", "date", uniqueDates),
      source: read(v.indentureSource, "covenant.indentureSource", "text", "text", words)},
      requiredScenarios: list(v.requiredScenarios, "covenant.requiredScenarios", "identity", z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).min(1).max(4)),
      policy: v.policyLimit === null ? null : {maximumRatio: read(v.policyLimit, "covenant.policyLimit", "ratio", "number", unsigned),
        testDates: list(v.policyTestDates!, "covenant.policyTestDates", "date", uniqueDates), source: read(v.policySource!, "covenant.policySource", "text", "text", words)},
      measurements: (measurement.dates ?? []).map((date, i) => ({date, scenario: measurement.scenarios?.[i] ?? "", debt: measurement.debt?.[i] ?? "", cash: measurement.cash?.[i] ?? "",
        reportedEbitda: measurement.reportedEbitda?.[i] ?? "", definitionAdjustment: measurement.definitionAdjustment?.[i] ?? ""}))},
    portfolio: input.portfolio.map(x => {const q = `bucket.${x.id}.`; return {id: x.id, label: read(x.label, q + "label", "text", "text", words), amount: read(x.amount, q + "amount", "currency", "number", unsigned),
      contract: convention(x.contract, q + "contract", ["assignable", "prohibited_without_consent"]), encumbrance: convention(x.encumbrance, q + "encumbrance", ["free", "assigned"]),
      holder: maybe(x.holder, q + "holder", "text", "text", words), pastDue: flag(x.pastDue, q + "pastDue"), countsAgainstBasket: flag(x.countsAgainstBasket, q + "countsAgainstBasket")};}),
    basket: {limit: read(input.basket.limit, "basket.limit", "currency", "number", unsigned), basis: convention(input.basket.basis, "basket.basis", ["aggregate", "per_operation"]),
      occupied: read(input.basket.occupied, "basket.occupied", "currency", "number", unsigned), consentLeadDaysMin: count(input.basket.consentLeadDaysMin, "basket.consentLeadDaysMin", "days"),
      consentLeadDaysMax: count(input.basket.consentLeadDaysMax, "basket.consentLeadDaysMax", "days")},
    collateralReference: {coverageLow: read(input.collateralReference.coverageLow, "collateralReference.coverageLow", "ratio", "number", unsigned),
      coverageHigh: read(input.collateralReference.coverageHigh, "collateralReference.coverageHigh", "ratio", "number", unsigned)},
    market: m === null ? null : {comparable: flag(m.comparable, "market.comparable"), low: read(m.low, "market.low", "ratio", "number", unsigned), median: read(m.median, "market.median", "ratio", "number", unsigned),
      high: read(m.high, "market.high", "ratio", "number", unsigned), sample: count(m.sample, "market.sample"), confidence: convention(m.confidence, "market.confidence", ["high", "moderate", "low"]),
      observedOn: read(m.observedOn, "market.observedOn", "date", "date", z.iso.date())},
    history: history === null ? null : {label: history.label, spread: history.spread, date: history.date,
      adjustments: (history.ids ?? []).map((id, i) => ({id, family: history.families?.[i] ?? "other", bps: history.bps?.[i] ?? "", anchor: history.anchors?.[i] ?? ""}))},
    variants: input.variants.map(x => {const q = `variant.${x.id}.`; return {id: x.id, label: read(x.label, q + "label", "text", "text", words), graceMonths: count(x.graceMonths, q + "graceMonths"),
      installments: count(x.installments, q + "installments"), coverage: read(x.coverage, q + "coverage", "ratio", "number", unsigned), restrictedAccount: flag(x.restrictedAccount, q + "restrictedAccount")};}),
    alternatives: input.alternatives.map(x => {const q = `alternative.${x.id}.`; return {id: x.id, label: read(x.label, q + "label", "text", "text", words),
      allInSpread: maybe(x.allInSpread, q + "allInSpread", "ratio", "number", ratio), collateral: read(x.collateral, q + "collateral", "currency", "number", unsigned),
      usesCovered: read(x.usesCovered, q + "usesCovered", "identity", "list", z.array(key).min(1).max(8)), monthsToMoneyMin: count(x.monthsToMoneyMin, q + "monthsToMoneyMin", "months"),
      monthsToMoneyMax: count(x.monthsToMoneyMax, q + "monthsToMoneyMax", "months")};}),
  } as ReceivedProposalInput;
  // Parallel lists must agree in length; a list one short would silently drop a test or an adjustment.
  if (complete) {
    const lengths = [measurement.scenarios, measurement.debt, measurement.cash, measurement.reportedEbitda, measurement.definitionAdjustment].map(x => x!.length);
    if (lengths.some(l => l !== measurement.dates!.length) || years!.length !== rates!.length
      || (history && [history.families, history.bps, history.anchors].some(x => x!.length !== history.ids!.length))) throw new Error("received_proposal_list_length_mismatch");
    const pairs = measurement.dates!.map((d, i) => `${d}|${measurement.scenarios![i]}`);
    if (new Set(pairs).size !== pairs.length) throw new Error("received_proposal_covenant_duplicate_test");
  }
  const evaluation = complete ? (({operands, ...rest}) => ({...rest, schedule: operands.received}))(evaluateReceivedProposal(kernelInput)) : null;
  const payload = {schemaVersion: "adopted-received-proposal.v1" as const, financialCoreVersion, scope: input.scope, analysisId: input.analysisId,
    entityId: input.entityId, perimeter: input.perimeter, currency: input.currency, basisFingerprint: input.envelope.fingerprint, evaluation,
    gaps: b.gaps, bindings: b.bindings, normalization: b.normalization, contributions: [...b.used.values()],
    status: evaluation ? "partial_composition" as const : "missing_inputs" as const,
    derivedDependencies: [{result: "received_proposal", decisionIds: [...b.used.keys()]}],
    classification: [...b.used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: [...receivedProposalAdoptedExclusions],
    grantsExecution: false as const, grantsPublication: false as const};
  return {...payload, fingerprint: receivedProposalFingerprint(payload)};
}
