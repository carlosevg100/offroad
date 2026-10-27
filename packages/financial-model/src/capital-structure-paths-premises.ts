import {z} from "zod";
import {capitalStructurePathsInputSchema, checkCapitalStructurePathsInput, type CapitalStructurePathsInput} from "@offroad/financial-core";
import {capacityUuid} from "./debt-capacity-premises";
import type {ProposedHypothesis} from "./investment-premises";

const text = z.string().trim().min(1).max(2000);
const money = z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/);
const origins = ["document", "informed", "market", "house", "estimate", "analysis"] as const;
const originLabel: Record<(typeof origins)[number], string> = {document: "documento", informed: "informado", market: "faixa de mercado", house: "premissa da casa",
  estimate: "estimativa", analysis: "resultado revisado de outro método"};
/** A value and where it came from; the source names the document, the message, the market range, the house rule or the reviewed result. */
const fact = <T extends z.ZodType>(value: T) => z.strictObject({value, origin: z.enum(origins), source: text});
type Origin = {origin: (typeof origins)[number]; source: string};
const shape = capitalStructurePathsInputSchema.shape;
const covenant = shape.covenant.shape;

/** The facts of one capital structure decision, each with its origin. Nothing here is adopted until a person
 * confirms the set; every number the method reads comes from the adopted basis. */
export const capitalPathsFactsSchema = z.strictObject({
  capitalPathsId: z.uuid(), entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/), definitionVersionId: z.uuid(), openingDate: z.iso.date(),
  company: fact(z.strictObject({periodEnds: shape.periodEnds, openingAvailable: shape.openingAvailable, operating: shape.operating})),
  minimumCash: fact(money),
  index: fact(shape.index), tax: fact(shape.tax),
  variants: z.array(fact(shape.projectVariants.element)).min(1).max(6),
  stress: fact(shape.stress),
  indenture: fact(z.strictObject({ebitdaExcludesLeases: covenant.ebitdaExcludesLeases, history: covenant.history, indenture: covenant.indenture})),
  policy: fact(covenant.policy.unwrap()).nullable(),
  basket: fact(shape.basket.unwrap()).nullable(),
  instruments: z.array(fact(shape.instruments.element)).min(1).max(24),
  paths: z.array(fact(shape.paths.element)).min(1).max(12),
  postHorizon: fact(shape.postHorizon), plan: fact(shape.plan),
  sensitivities: z.array(fact(shape.sensitivities.element)).max(6),
  demandQuantum: fact(money),
}).superRefine((f, ctx) => {
  // The facts must already make a valid kernel input: the same validation, before any premise is proposed.
  try {checkCapitalStructurePathsInput(capitalPathsKernelFromFacts(f));}
  catch (error) {ctx.addIssue({code: "custom", message: `Facts do not make a valid capital paths input: ${error instanceof Error ? error.message.slice(0, 300) : "invalid"}`});}
});
export type CapitalPathsFacts = z.infer<typeof capitalPathsFactsSchema>;

type Facts = Omit<CapitalPathsFacts, never>;
/** The kernel input the facts state, values only. */
export function capitalPathsKernelFromFacts(f: Facts): CapitalStructurePathsInput {
  return {currency: f.currency, openingDate: f.openingDate, periodEnds: f.company.value.periodEnds, openingAvailable: f.company.value.openingAvailable,
    minimumCash: f.minimumCash.value, index: f.index.value, tax: f.tax.value, operating: f.company.value.operating, availableForService: "operating_cash_before_project_investment",
    projectVariants: f.variants.map((v) => v.value), stress: f.stress.value,
    covenant: {...f.indenture.value, policy: f.policy?.value ?? null}, basket: f.basket?.value ?? null,
    instruments: f.instruments.map((i) => i.value), paths: f.paths.map((p) => p.value), postHorizon: f.postHorizon.value, plan: f.plan.value,
    sensitivities: f.sensitivities.map((s) => s.value), demandQuantum: f.demandQuantum.value};
}

export type CapitalPathsContribution = {path: string; unit: string; value: ProposedHypothesis["value"]; group: string};
/** Every operand the adopted reader reads, as field paths, units and values: the one encoding of a capital
 * paths analysis into a working basis. `group` names the fact the operand comes from. */
export function encodeCapitalPaths(k: CapitalStructurePathsInput): CapitalPathsContribution[] {
  const out: CapitalPathsContribution[] = [];
  const add = (group: string, path: string, unit: string, value: ProposedHypothesis["value"]) => out.push({group, path, unit, value});
  const num = (g: string, p: string, unit: string, v: string) => add(g, p, unit, {type: "number", value: v});
  const txt = (g: string, p: string, unit: string, v: string) => add(g, p, unit, {type: "text", value: v});
  const day = (g: string, p: string, v: string) => add(g, p, "date", {type: "date", value: v});
  const list = (g: string, p: string, unit: string, v: string[]) => add(g, p, unit, {type: "list", value: v});
  list("company", "company.periodEnds", "date", k.periodEnds);
  num("company", "company.openingAvailable", "currency", k.openingAvailable);
  num("minimumCash", "company.minimumCash", "currency", k.minimumCash);
  txt("house", "company.availableForService", "convention", k.availableForService);
  list("index", "index.byPeriod", "ratio", k.index.annualByPeriod);
  list("index", "index.afterYears", "identity", k.index.afterHorizon.map((x) => String(x.year)));
  list("index", "index.afterRates", "ratio", k.index.afterHorizon.map((x) => x.annualRate));
  num("tax", "tax.rate", "ratio", k.tax.rate);
  txt("tax", "tax.lossTreatment", "convention", k.tax.lossTreatment);
  for (const x of ["ebitda", "depreciation", "leasePayments", "workingCapitalCashFlow", "maintenanceCapex"] as const) list("company", `operating.${x}`, "currency", k.operating[x]);
  for (const v of k.projectVariants) {
    const q = `variant.${v.id}.`, g = `variant:${v.id}`;
    txt(g, q + "label", "text", v.label); txt(g, q + "kind", "convention", v.effects ? "project" : "none");
    if (v.effects) for (const x of ["ebitda", "depreciation", "maintenanceCapex", "growthCapex", "startupWorkingCapitalCashFlow"] as const) list(g, q + x, "currency", v.effects[x]);
  }
  txt("stress", "stress.label", "text", k.stress.label); num("stress", "stress.ebitdaFactor", "ratio", k.stress.ebitdaFactor); day("stress", "stress.fromPeriodEnd", k.stress.fromPeriodEnd);
  const c = k.covenant;
  add("indenture", "covenant.ebitdaExcludesLeases", "convention", {type: "boolean", value: c.ebitdaExcludesLeases});
  list("indenture", "covenant.historyIds", "identity", c.history.map((h) => h.id));
  list("indenture", "covenant.historyMonths", "months", c.history.map((h) => String(h.months)));
  list("indenture", "covenant.historyEbitda", "currency", c.history.map((h) => h.ebitda));
  list("indenture", "covenant.historyLeasePayments", "currency", c.history.map((h) => h.leasePayments));
  num("indenture", "covenant.indentureLimit", "ratio", c.indenture.limit); txt("indenture", "covenant.indentureComparator", "convention", c.indenture.comparator);
  list("indenture", "covenant.indentureDates", "date", c.indenture.measurementPeriodEnds); txt("indenture", "covenant.indentureSource", "text", c.indenture.source);
  if (c.policy) {
    num("policy", "covenant.policyLimit", "ratio", c.policy.limit); txt("policy", "covenant.policyComparator", "convention", c.policy.comparator);
    list("policy", "covenant.policyDates", "date", c.policy.measurementPeriodEnds); txt("policy", "covenant.policySource", "text", c.policy.source);
    txt("policy", "covenant.policyDefinition", "convention", c.policy.definition);
  }
  if (k.basket) {
    const b = k.basket;
    txt("basket", "basket.holderId", "identity", b.holderId); num("basket", "basket.limit", "currency", b.limit); txt("basket", "basket.basis", "convention", b.basis);
    num("basket", "basket.occupied", "currency", b.occupied); txt("basket", "basket.source", "text", b.source);
  }
  for (const i of k.instruments) {
    const q = `instrument.${i.id}.`, g = `instrument:${i.id}`;
    txt(g, q + "label", "text", i.label);
    list(g, q + "terms", "convention", [i.role, i.lenderKind, i.rate.kind, i.interestEvery, i.couponTreatment, i.couponBase, i.security.kind, String(i.security.countsAgainstBasket), i.afterHorizon.kind]);
    list(g, q + "principal", "currency", [i.openingPrincipal, i.security.amount]);
    list(g, q + "rates", "ratio", i.rate.kind === "fixed" ? i.rate.annualRates : i.rate.spreads);
    list(g, q + "draws", "currency", i.draws); list(g, q + "amortization", "currency", i.principal);
    if (i.replaces) txt(g, q + "replaces", "identity", i.replaces);
    if (i.finalPaymentDate) day(g, q + "finalPaymentDate", i.finalPaymentDate);
    if (i.charges.length) {
      list(g, q + "chargeSlots", "identity", i.charges.map((x) => `${x.id}|${x.periodEnd}|${x.category}`));
      list(g, q + "chargeAmounts", "currency", i.charges.map((x) => x.amount));
    }
    if (i.prepayment) {txt(g, q + "prepaymentBasis", "convention", i.prepayment.basis); num(g, q + "prepaymentRate", "ratio", i.prepayment.rate);}
    const a = i.afterHorizon;
    if (a.kind === "scheduled") {
      list(g, q + "afterYears", "identity", a.shares.map((s) => String(s.year))); list(g, q + "afterShares", "ratio", a.shares.map((s) => s.share));
      if (a.alternatives.length) {
        list(g, q + "alternativeSlots", "identity", a.alternatives.flatMap((x) => x.shares.map((s) => `${x.id}|${s.year}`)));
        list(g, q + "alternativeShares", "ratio", a.alternatives.flatMap((x) => x.shares.map((s) => s.share)));
        list(g, q + "alternativeLabels", "text", a.alternatives.map((x) => `${x.id}|${x.label}`));
      }
    }
    if (a.kind === "not_tested") txt(g, q + "afterReason", "text", a.reason);
  }
  for (const p of k.paths) {
    const q = `path.${p.id}.`, g = `path:${p.id}`;
    txt(g, q + "label", "text", p.label); list(g, q + "terms", "convention", [p.role, p.projectVariantId]); list(g, q + "instruments", "identity", p.instrumentIds);
    if (p.prepayments.length) list(g, q + "prepayments", "identity", p.prepayments.map((x) => `${x.instrumentId}|${x.periodEnd}`));
    if (p.charges.length) {
      list(g, q + "chargeSlots", "identity", p.charges.map((x) => `${x.id}|${x.instrumentId}|${x.periodEnd}|${x.category}`));
      list(g, q + "chargeAmounts", "currency", p.charges.map((x) => x.amount));
    }
  }
  const ph = k.postHorizon;
  list("postHorizon", "postHorizon.years", "identity", ph.years.map(String));
  for (const x of ["ebitda", "leasePayments", "maintenanceCapex", "workingCapitalInvestment", "depreciation", "otherInterest"] as const) list("postHorizon", `postHorizon.${x}`, "currency", ph[x]);
  num("plan", "plan.maximumSpread", "ratio", k.plan.maximumSpread); day("plan", "plan.soundingBy", k.plan.soundingBy); day("plan", "plan.routeDecisionBy", k.plan.routeDecisionBy);
  for (const s of k.sensitivities) {
    const q = `sensitivity.${s.id}.`, g = `sensitivity:${s.id}`;
    txt(g, q + "label", "text", s.label); list(g, q + "ebitdaDelta", "currency", s.ebitdaDelta); list(g, q + "workingCapitalDelta", "currency", s.workingCapitalDelta);
    if (s.minimumCash) num(g, q + "minimumCash", "currency", s.minimumCash);
  }
  num("demandQuantum", "demandQuantum", "currency", k.demandQuantum);
  list("house", "order.variants", "identity", k.projectVariants.map((v) => v.id));
  list("house", "order.instruments", "identity", k.instruments.map((i) => i.id));
  list("house", "order.paths", "identity", k.paths.map((p) => p.id));
  list("house", "order.sensitivities", "identity", k.sensitivities.map((s) => s.id));
  return out;
}

export const capitalPathsAnalysisId = (capitalPathsId: string) => capacityUuid(`offroad:capital-structure-paths:${capitalPathsId}:analysis`);
/** The size of one working basis. */
export const maxCapitalPathsHypotheses = 256;

/** The hypotheses one confirmation adopts: every operand the adopted reader reads, plus the order of the
 * lists, so the packet is composed from the basis alone. Every reason states the origin of the number.
 * Deterministic; nothing is calculated here. */
export function proposeCapitalPathsHypotheses(raw: unknown): ProposedHypothesis[] {
  const f = capitalPathsFactsSchema.parse(raw);
  const prefix = `capital_paths.${capitalPathsAnalysisId(f.capitalPathsId)}.`, endDate = f.company.value.periodEnds.at(-1)!;
  const why = (x: Origin) => `Origem: ${originLabel[x.origin]}. ${x.source}`;
  const byGroup = (g: string): string => {
    const [kind, id] = g.split(":");
    const one = (list: {value: {id: string}; origin: Origin["origin"]; source: string}[]) => why(list.find((x) => x.value.id === id)!);
    switch (kind) {
      case "variant": return one(f.variants);
      case "instrument": return one(f.instruments);
      case "path": return one(f.paths);
      case "sensitivity": return one(f.sensitivities);
      case "house": return "Origem: premissa da casa. Convenção do método: ordem das listas e caixa disponível antes do investimento do projeto";
      case "company": return why(f.company);
      case "minimumCash": return why(f.minimumCash);
      case "index": return why(f.index);
      case "tax": return why(f.tax);
      case "stress": return why(f.stress);
      case "indenture": return why(f.indenture);
      case "policy": return why(f.policy!);
      case "basket": return why(f.basket!);
      case "postHorizon": return why(f.postHorizon);
      case "plan": return why(f.plan);
      default: return why(f.demandQuantum);
    }
  };
  const out = encodeCapitalPaths(capitalPathsKernelFromFacts(f)).map((c): ProposedHypothesis => ({fieldPath: prefix + c.path,
    dimensions: {entityId: f.entityId, perimeter: f.perimeter, periodStart: f.openingDate, periodEnd: endDate, currency: f.currency, unit: c.unit, scale: "1", scenario: "base",
      definitionVersionId: f.definitionVersionId}, value: c.value, reason: byGroup(c.group)}));
  // A working basis holds at most 256 premises; a set larger than that is refused here, not at confirmation.
  if (out.length > maxCapitalPathsHypotheses) throw new Error("capital_paths_premises_exceed_basis");
  return out;
}
