import {createHash} from "node:crypto";
import {z} from "zod";
import {evaluateCapitalStructurePaths, financialCoreVersion, type CapitalStructurePathsInput} from "@offroad/financial-core";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {adoptedAnalysisContextSchema, createAnalysisBinding} from "./adopted-analysis-binding";
import {capitalPathsAdoptedExclusions} from "./capital-structure-paths-results";

const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), words = z.string().trim().min(1).max(2000);
const money = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/), ratio = z.string().regex(/^-?\d{1,4}(?:\.\d{1,20})?$/);
const optional = selection.nullable();
type Selection = z.infer<typeof selection>;

const instrument = z.strictObject({id: key, label: selection,
  /** [role, lenderKind, rateKind, interestEvery, couponTreatment, couponBase, securityKind, countsAgainstBasket, afterHorizonKind]. */
  terms: selection,
  /** [opening principal, security amount]. */
  principal: selection, rates: selection, draws: selection, amortization: selection,
  replaces: optional, finalPaymentDate: optional, chargeSlots: optional, chargeAmounts: optional, prepaymentBasis: optional, prepaymentRate: optional,
  afterYears: optional, afterShares: optional, afterReason: optional, afterSettlementMonths: optional, alternativeSlots: optional, alternativeShares: optional, alternativeLabels: optional});
const path = z.strictObject({id: key, label: selection, /** [role, project variant]. */ terms: selection, instruments: selection,
  prepayments: optional, chargeSlots: optional, chargeAmounts: optional});
const variant = z.strictObject({id: key, label: selection, kind: selection, ebitda: optional, depreciation: optional, maintenanceCapex: optional, growthCapex: optional,
  startupWorkingCapitalCashFlow: optional});

/** The capital structure paths of one company over one horizon. Every number, date, term, path, limit and
 * sensitivity is an adopted contribution read in its own context; the horizon runs from the company's
 * opening date to its last period end. Nothing here recommends: the order comes from the kernel's gates. */
export const adoptedCapitalPathsInputSchema = adoptedAnalysisContextSchema.safeExtend({
  analysisId: z.uuid(), scenario: z.string().trim().min(1).max(160),
  company: z.strictObject({openingAvailable: selection, minimumCash: selection, periodEnds: selection, availableForService: selection}),
  index: z.strictObject({byPeriod: selection, afterYears: selection, afterRates: selection}),
  tax: z.strictObject({rate: selection, lossTreatment: selection}),
  operating: z.strictObject({ebitda: selection, depreciation: selection, leasePayments: selection, workingCapitalCashFlow: selection, maintenanceCapex: selection}),
  variants: z.array(variant).min(1).max(6),
  stress: z.strictObject({label: selection, ebitdaFactor: selection, fromPeriodEnd: selection}),
  covenant: z.strictObject({ebitdaExcludesLeases: selection, historyIds: selection, historyMonths: selection, historyEbitda: selection, historyLeasePayments: selection,
    indentureLimit: selection, indentureComparator: selection, indentureDates: selection, indentureSource: selection,
    policyLimit: optional, policyComparator: optional, policyDates: optional, policySource: optional, policyDefinition: optional}),
  basket: z.strictObject({holderId: selection, limit: selection, basis: selection, occupied: selection, source: selection}).nullable(),
  instruments: z.array(instrument).min(1).max(24),
  paths: z.array(path).min(1).max(12),
  postHorizon: z.strictObject({years: selection, ebitda: selection, leasePayments: selection, maintenanceCapex: selection, workingCapitalInvestment: selection,
    depreciation: selection, otherInterest: selection}),
  plan: z.strictObject({maximumSpread: selection, soundingBy: selection, routeDecisionBy: selection}),
  sensitivities: z.array(z.strictObject({id: key, label: selection, ebitdaDelta: selection, workingCapitalDelta: selection, minimumCash: optional})).max(6),
  demandQuantum: selection,
}).refine(i => [i.variants, i.instruments, i.paths, i.sensitivities].every(list => new Set(list.map(x => x.id)).size === list.length), "Duplicate id")
  .refine(i => [i.covenant.policyLimit, i.covenant.policyComparator, i.covenant.policyDates, i.covenant.policySource, i.covenant.policyDefinition].every(x => (x === null) === (i.covenant.policyLimit === null)),
    "Board policy needs limit, comparator, dates, source and definition");
export type AdoptedCapitalPathsInput = z.infer<typeof adoptedCapitalPathsInputSchema>;

const instrumentTerms = z.tuple([z.enum(["existing", "amended", "new"]), z.enum(["bank", "capital_markets", "development_bank"]), z.enum(["index_plus_spread", "fixed"]),
  z.enum(["quarter", "semester"]), z.enum(["cash_paid", "accrued_until_paid"]), z.enum(["opening_principal", "average_principal"]), z.enum(["receivables", "financed_asset", "none"]),
  z.enum(["true", "false"]), z.enum(["none", "seasonal_release", "not_tested", "scheduled"])]);
const slot = (parts: number) => z.array(z.string().refine(s => s.split("|").length === parts && s.split("|").every(x => x.length > 0), "Slot parts")).max(16);

/** Reads the adopted basis into the kernel input and runs the kernel. A missing operand leaves the evaluation
 * out and is named as a gap; an inconsistent set of terms (a group half adopted, lists of different length)
 * is refused by name. */
export function calculateAdoptedCapitalStructurePaths(raw: unknown) {
  const input = adoptedCapitalPathsInputSchema.parse(raw), prefix = `capital_paths.${input.analysisId}.`, sc = input.scenario;
  const currency: Selection[] = [input.company.openingAvailable, input.company.minimumCash, ...Object.values(input.operating),
    ...input.variants.flatMap(v => [v.ebitda, v.depreciation, v.maintenanceCapex, v.growthCapex, v.startupWorkingCapitalCashFlow]),
    input.covenant.historyEbitda, input.covenant.historyLeasePayments, ...(input.basket ? [input.basket.limit, input.basket.occupied] : []),
    ...input.instruments.flatMap(i => [i.principal, i.draws, i.amortization, i.chargeAmounts]), ...input.paths.map(p => p.chargeAmounts),
    input.postHorizon.ebitda, input.postHorizon.leasePayments, input.postHorizon.maintenanceCapex, input.postHorizon.workingCapitalInvestment, input.postHorizon.depreciation,
    input.postHorizon.otherInterest, ...input.sensitivities.flatMap(s => [s.ebitdaDelta, s.workingCapitalDelta, s.minimumCash]), input.demandQuantum]
    .filter((s): s is Selection => s !== null);
  const b = createAnalysisBinding(input, currency);
  let complete = true;
  const need = <T>(x: T | null): T => {if (x === null) complete = false; return x as T;};
  type Kind = "number" | "text" | "date" | "boolean" | "list";
  const read = <T>(s: Selection, p: string, unit: string, type: Kind, schema: z.ZodType<T>) => need(b.read(s, prefix + p, sc, unit, type, schema));
  const maybe = <T>(s: Selection | null, p: string, unit: string, type: Kind, schema: z.ZodType<T>) => s === null ? null : read(s, p, unit, type, schema);
  const list = <T>(s: Selection, p: string, unit: string, schema: z.ZodType<T>) => read(s, p, unit, "list", schema);
  const amounts = z.array(money).min(1).max(40), rates = z.array(ratio).min(1).max(40), dates = z.array(z.iso.date()).min(1).max(40);
  const years = z.array(z.string().regex(/^\d{4}$/)).min(1).max(15);
  const text = (s: Selection, p: string) => read(s, p, "text", "text", words);
  const convention = <const T extends readonly [string, ...string[]]>(s: Selection, p: string, values: T) => read(s, p, "convention", "text", z.enum(values));
  const c = input.company, cov = input.covenant, ph = input.postHorizon;
  const variants = input.variants.map(v => {
    const q = `variant.${v.id}.`, kind = convention(v.kind, q + "kind", ["project", "none"]);
    const effects = [v.ebitda, v.depreciation, v.maintenanceCapex, v.growthCapex, v.startupWorkingCapitalCashFlow];
    if (kind && effects.some(x => (x === null) !== (kind === "none"))) throw new Error(`capital_paths_variant_effects_incomplete:${v.id}`);
    return {id: v.id, label: text(v.label, q + "label"), effects: kind !== "project" ? null : {ebitda: list(v.ebitda!, q + "ebitda", "currency", amounts),
      depreciation: list(v.depreciation!, q + "depreciation", "currency", amounts), maintenanceCapex: list(v.maintenanceCapex!, q + "maintenanceCapex", "currency", amounts),
      growthCapex: list(v.growthCapex!, q + "growthCapex", "currency", amounts), startupWorkingCapitalCashFlow: list(v.startupWorkingCapitalCashFlow!, q + "startupWorkingCapitalCashFlow", "currency", amounts)}};
  });
  const instruments = input.instruments.map(i => {
    const q = `instrument.${i.id}.`, t = list(i.terms, q + "terms", "convention", instrumentTerms);
    const principal = list(i.principal, q + "principal", "currency", z.tuple([money, money]));
    const slots = maybe(i.chargeSlots, q + "chargeSlots", "identity", "list", slot(3)), chargeAmounts = maybe(i.chargeAmounts, q + "chargeAmounts", "currency", "list", z.array(money).max(16));
    if ((i.chargeSlots === null) !== (i.chargeAmounts === null) || (slots && chargeAmounts && slots.length !== chargeAmounts.length)) throw new Error(`capital_paths_charge_terms_incomplete:${i.id}`);
    if ((i.prepaymentBasis === null) !== (i.prepaymentRate === null)) throw new Error(`capital_paths_prepayment_terms_incomplete:${i.id}`);
    const alternatives = [i.alternativeSlots, i.alternativeShares, i.alternativeLabels];
    if (alternatives.some(x => (x === null) !== (i.alternativeSlots === null))) throw new Error(`capital_paths_after_horizon_terms_incomplete:${i.id}`);
    const rateList = list(i.rates, q + "rates", "ratio", rates);
    const afterKind = t?.[8];
    if (afterKind && ((afterKind === "scheduled") !== (i.afterYears !== null && i.afterShares !== null) || (afterKind === "not_tested" || afterKind === "seasonal_release") !== (i.afterReason !== null)
      || (afterKind === "seasonal_release") !== (i.afterSettlementMonths !== null)
      || (afterKind !== "scheduled" && i.alternativeSlots !== null))) throw new Error(`capital_paths_after_horizon_terms_incomplete:${i.id}`);
    const afterYears = maybe(i.afterYears, q + "afterYears", "identity", "list", years), afterShares = maybe(i.afterShares, q + "afterShares", "ratio", "list", rates);
    const altSlots = maybe(i.alternativeSlots, q + "alternativeSlots", "identity", "list", slot(2)), altShares = maybe(i.alternativeShares, q + "alternativeShares", "ratio", "list", rates);
    const altLabels = maybe(i.alternativeLabels, q + "alternativeLabels", "text", "list", slot(2));
    if ((afterYears && afterShares && afterYears.length !== afterShares.length) || (altSlots && altShares && altSlots.length !== altShares.length)) throw new Error(`capital_paths_list_length_mismatch:${i.id}`);
    const after = (): CapitalStructurePathsInput["instruments"][number]["afterHorizon"] => {
      if (afterKind === "scheduled") {
        const ids = [...new Set((altSlots ?? []).map(s => s.split("|")[0]!))];
        return {kind: "scheduled", shares: (afterYears ?? []).map((y, n) => ({year: Number(y), share: afterShares?.[n] ?? ""})),
          alternatives: ids.map(id => ({id, label: (altLabels ?? []).find(l => l.split("|")[0] === id)?.split("|").slice(1).join("|") ?? "",
            shares: (altSlots ?? []).flatMap((s, n) => s.split("|")[0] === id ? [{year: Number(s.split("|")[1]), share: altShares?.[n] ?? ""}] : [])}))};
      }
      if (afterKind === "not_tested") return {kind: "not_tested", reason: maybe(i.afterReason, q + "afterReason", "text", "text", words) ?? ""};
      if (afterKind === "seasonal_release") return {kind: "seasonal_release", justification: maybe(i.afterReason, q + "afterReason", "text", "text", words) ?? "",
        settlementMonthsAfterDraw: Number(maybe(i.afterSettlementMonths, q + "afterSettlementMonths", "months", "number", z.string().regex(/^\d{1,2}$/)) ?? "0")};
      return {kind: "none"};
    };
    const afterHorizon = after();
    const prepaymentBasis = maybe(i.prepaymentBasis, q + "prepaymentBasis", "convention", "text", z.enum(["flat", "per_year_of_weighted_remaining_life"]));
    const prepaymentRate = maybe(i.prepaymentRate, q + "prepaymentRate", "ratio", "number", ratio);
    return {id: i.id, label: text(i.label, q + "label"), role: t?.[0] ?? "new", replaces: maybe(i.replaces, q + "replaces", "identity", "text", key),
      lenderKind: t?.[1] ?? "bank", openingPrincipal: principal?.[0] ?? "0", finalPaymentDate: maybe(i.finalPaymentDate, q + "finalPaymentDate", "date", "date", z.iso.date()),
      rate: t?.[2] === "fixed" ? {kind: "fixed" as const, annualRates: rateList ?? []} : {kind: "index_plus_spread" as const, spreads: rateList ?? []},
      interestEvery: t?.[3] ?? "quarter", couponTreatment: t?.[4] ?? "cash_paid", couponBase: t?.[5] ?? "opening_principal",
      draws: list(i.draws, q + "draws", "currency", amounts), principal: list(i.amortization, q + "amortization", "currency", amounts),
      charges: (slots ?? []).map((s, n) => {const [id, periodEnd, category] = s.split("|"); return {id: id!, periodEnd: periodEnd!, category: category as "origination_fee", amount: chargeAmounts?.[n] ?? ""};}),
      security: {kind: t?.[6] ?? "none", amount: principal?.[1] ?? "0", countsAgainstBasket: t?.[7] === "true"},
      prepayment: prepaymentBasis && prepaymentRate ? {basis: prepaymentBasis, rate: prepaymentRate} : null, afterHorizon};
  });
  const paths = input.paths.map(p => {
    const q = `path.${p.id}.`, t = list(p.terms, q + "terms", "convention", z.tuple([z.enum(["status_quo", "candidate", "companion"]), key]));
    const prepayments = maybe(p.prepayments, q + "prepayments", "identity", "list", slot(2));
    const slots = maybe(p.chargeSlots, q + "chargeSlots", "identity", "list", slot(4)), chargeAmounts = maybe(p.chargeAmounts, q + "chargeAmounts", "currency", "list", z.array(money).max(8));
    if ((p.chargeSlots === null) !== (p.chargeAmounts === null) || (slots && chargeAmounts && slots.length !== chargeAmounts.length)) throw new Error(`capital_paths_charge_terms_incomplete:${p.id}`);
    return {id: p.id, label: text(p.label, q + "label"), role: t?.[0] ?? "candidate", projectVariantId: t?.[1] ?? "",
      instrumentIds: list(p.instruments, q + "instruments", "identity", z.array(key).min(1).max(16)),
      prepayments: (prepayments ?? []).map(s => ({instrumentId: s.split("|")[0]!, periodEnd: s.split("|")[1]!})),
      charges: (slots ?? []).map((s, n) => {const [id, instrumentId, periodEnd, category] = s.split("|"); return {id: id!, instrumentId: instrumentId!, periodEnd: periodEnd!,
        category: category as "other", amount: chargeAmounts?.[n] ?? ""};})};
  });
  const historyIds = list(cov.historyIds, "covenant.historyIds", "identity", z.array(key).max(8));
  const historyMonths = list(cov.historyMonths, "covenant.historyMonths", "months", z.array(z.string().regex(/^\d{1,2}$/)).max(8));
  const historyEbitda = list(cov.historyEbitda, "covenant.historyEbitda", "currency", z.array(money).max(8));
  const historyLease = list(cov.historyLeasePayments, "covenant.historyLeasePayments", "currency", z.array(money).max(8));
  const afterYears = list(input.index.afterYears, "index.afterYears", "identity", years), afterRates = list(input.index.afterRates, "index.afterRates", "ratio", rates);
  const k = input.basket;
  const kernelInput = {currency: input.currency, openingDate: input.openingDate,
    periodEnds: list(c.periodEnds, "company.periodEnds", "date", dates), openingAvailable: read(c.openingAvailable, "company.openingAvailable", "currency", "number", money),
    minimumCash: read(c.minimumCash, "company.minimumCash", "currency", "number", money),
    index: {name: "DI" as const, annualByPeriod: list(input.index.byPeriod, "index.byPeriod", "ratio", rates),
      afterHorizon: (afterYears ?? []).map((y, n) => ({year: Number(y), annualRate: afterRates?.[n] ?? ""}))},
    tax: {rate: read(input.tax.rate, "tax.rate", "ratio", "number", ratio), lossTreatment: convention(input.tax.lossTreatment, "tax.lossTreatment", ["no_cash_benefit"])},
    operating: Object.fromEntries((["ebitda", "depreciation", "leasePayments", "workingCapitalCashFlow", "maintenanceCapex"] as const).map(x => [x, list(input.operating[x], `operating.${x}`, "currency", amounts)])),
    availableForService: convention(c.availableForService, "company.availableForService", ["operating_cash_before_project_investment"]),
    projectVariants: variants,
    stress: {id: "estresse", label: text(input.stress.label, "stress.label"), ebitdaFactor: read(input.stress.ebitdaFactor, "stress.ebitdaFactor", "ratio", "number", ratio),
      fromPeriodEnd: read(input.stress.fromPeriodEnd, "stress.fromPeriodEnd", "date", "date", z.iso.date())},
    covenant: {ebitdaExcludesLeases: read(cov.ebitdaExcludesLeases, "covenant.ebitdaExcludesLeases", "convention", "boolean", z.boolean()),
      history: (historyIds ?? []).map((id, n) => ({id, months: Number(historyMonths?.[n] ?? "0"), ebitda: historyEbitda?.[n] ?? "", leasePayments: historyLease?.[n] ?? ""})),
      indenture: {limit: read(cov.indentureLimit, "covenant.indentureLimit", "ratio", "number", ratio), comparator: convention(cov.indentureComparator, "covenant.indentureComparator", ["lte", "lt"]),
        measurementPeriodEnds: list(cov.indentureDates, "covenant.indentureDates", "date", dates), source: text(cov.indentureSource, "covenant.indentureSource")},
      policy: cov.policyLimit === null ? null : {limit: read(cov.policyLimit, "covenant.policyLimit", "ratio", "number", ratio),
        comparator: convention(cov.policyComparator!, "covenant.policyComparator", ["lte", "lt"]), measurementPeriodEnds: list(cov.policyDates!, "covenant.policyDates", "date", dates),
        definition: convention(cov.policyDefinition!, "covenant.policyDefinition", ["indenture_definition"]), source: text(cov.policySource!, "covenant.policySource")}},
    basket: k === null ? null : {holderId: read(k.holderId, "basket.holderId", "identity", "text", key), limit: read(k.limit, "basket.limit", "currency", "number", money),
      basis: convention(k.basis, "basket.basis", ["aggregate", "per_operation"]), occupied: read(k.occupied, "basket.occupied", "currency", "number", money), source: text(k.source, "basket.source")},
    instruments, paths,
    postHorizon: {years: (list(ph.years, "postHorizon.years", "identity", years) ?? []).map(Number),
      ...Object.fromEntries((["ebitda", "leasePayments", "maintenanceCapex", "workingCapitalInvestment", "depreciation", "otherInterest"] as const).map(x => [x, list(ph[x], `postHorizon.${x}`, "currency", amounts)]))},
    plan: {maximumSpread: read(input.plan.maximumSpread, "plan.maximumSpread", "ratio", "number", ratio), soundingBy: read(input.plan.soundingBy, "plan.soundingBy", "date", "date", z.iso.date()),
      routeDecisionBy: read(input.plan.routeDecisionBy, "plan.routeDecisionBy", "date", "date", z.iso.date())},
    sensitivities: input.sensitivities.map(s => {const q = `sensitivity.${s.id}.`; return {id: s.id, label: text(s.label, q + "label"),
      ebitdaDelta: list(s.ebitdaDelta, q + "ebitdaDelta", "currency", amounts), workingCapitalDelta: list(s.workingCapitalDelta, q + "workingCapitalDelta", "currency", amounts),
      minimumCash: maybe(s.minimumCash, q + "minimumCash", "currency", "number", money)};}),
    demandQuantum: read(input.demandQuantum, "demandQuantum", "currency", "number", money),
  };
  if (complete && ((afterYears!.length !== afterRates!.length) || [historyMonths, historyEbitda, historyLease].some(x => x!.length !== historyIds!.length))) throw new Error("capital_paths_list_length_mismatch");
  // The adopted periods end where the analysis ends; a horizon read from another window is refused.
  if (complete && kernelInput.periodEnds!.at(-1) !== input.endDate) throw new Error("capital_paths_horizon_mismatch");
  const evaluation = complete ? evaluateCapitalStructurePaths(kernelInput) : null;
  const payload = {schemaVersion: "adopted-capital-structure-paths.v1" as const, financialCoreVersion, scope: input.scope, analysisId: input.analysisId,
    entityId: input.entityId, perimeter: input.perimeter, currency: input.currency, basisFingerprint: input.envelope.fingerprint, evaluation,
    gaps: b.gaps, bindings: b.bindings, normalization: b.normalization, contributions: [...b.used.values()],
    status: evaluation ? "partial_composition" as const : "missing_inputs" as const,
    derivedDependencies: [{result: "capital_structure_paths", decisionIds: [...b.used.keys()]}],
    classification: [...b.used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: [...capitalPathsAdoptedExclusions],
    grantsExecution: false as const, grantsPublication: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
