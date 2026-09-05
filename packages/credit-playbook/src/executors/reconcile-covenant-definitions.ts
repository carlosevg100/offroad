import {createHash} from "node:crypto";

import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `reconcile-covenant-definitions`. It never writes "breached": it
 * resolves which tier applies from dated facts, decides comparability by comparing the
 * components of the definitions (never by a caller's flag), and only then measures headroom.
 * An unproven condition leaves the limit unresolved and the item conditioned, with the reason.
 * A trustee report without the indenture yields a reported limit and no headroom. Every number
 * it produces carries its operands in the trace.
 */
const ratio = z.string().regex(/^\d+(\.\d+)?$/);
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const indentureAnchorSchema = z.object({document: z.string().min(1), clause: z.string().min(1), page: z.number().int().positive()}).strict();
const anchorSchema = z.object({document: z.string().min(1), clause: z.string().optional(), page: z.number().int().positive().optional(), note: z.string().optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;

/** The components a net debt definition is built from; comparability is decided on these, not on prose. */
export const netDebtComponentSchema = z.enum([
  "loans_and_financings", "debentures", "derivative_liabilities", "other_onerous_debt", "leases",
  "cash_and_equivalents", "financial_investments", "derivative_assets",
]);

export const covenantTierSchema = z.object({
  limit: ratio,
  condition: z.discriminatedUnion("type", [
    z.object({type: z.literal("unconditional")}).strict(),
    z.object({type: z.literal("until_reference_settled"), referenceInstruments: z.array(z.string().min(1)).min(1)}).strict(),
    z.object({type: z.literal("after_reference_settled"), referenceInstruments: z.array(z.string().min(1)).min(1)}).strict(),
  ]),
}).strict();

export const covenantInstrumentSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("indenture"),
    id: z.string().min(1),
    indexName: z.string().min(1),
    direction: z.enum(["maximum", "minimum"]).default("maximum"),
    netDebtDefinition: z.string().min(1),
    netDebtComponents: z.array(netDebtComponentSchema).min(1),
    ebitdaDefinition: z.string().min(1),
    /** Adjustments beyond the base definition (acquisition pro forma, sellers finance, ...). */
    ebitdaAdjustments: z.array(z.string().min(1)).default([]),
    measurement: z.object({frequency: z.enum(["annual", "semiannual", "quarterly"]), basis: z.string().min(1), fiscalYearEnd: z.string().regex(/^\d{2}-\d{2}$/)}).strict(),
    tiers: z.array(covenantTierSchema).min(1),
    anchor: indentureAnchorSchema,
  }).strict(),
  z.object({
    source: z.literal("trustee_report"),
    id: z.string().min(1),
    indexName: z.string().min(1),
    reportedLimit: ratio,
    reportedMeasurement: z.object({value: ratio, asOf: isoDate}).strict().nullable().default(null),
    anchor: anchorSchema,
  }).strict(),
]);

export const covenantReconciliationInputSchema = z.object({
  asOfDate: isoDate,
  instruments: z.array(covenantInstrumentSchema),
  referenceSettlements: z.array(z.object({
    instrument: z.string().min(1),
    maturityDate: isoDate,
    /** ordinary: settled in the ordinary course (at maturity or early); accelerated: settled by acceleration; outstanding: still alive; unknown: the base does not say. */
    settlement: z.enum(["ordinary", "accelerated", "outstanding", "unknown"]),
    settlementDate: isoDate.nullable().default(null),
    anchor: anchorSchema,
  }).strict()).default([]),
  /** Financial components at the as-of date, from the ledger; the executor computes net debt from them. */
  components: z.object({
    grossDebt: money, derivativeLiabilities: money, derivativeAssets: money, cashAndEquivalents: money, financialInvestments: money,
    anchors: z.object({debt: anchorSchema, cash: anchorSchema, derivatives: anchorSchema}).strict(),
  }).strict().nullable().default(null),
  /** LTM EBITDA as the company computes it for the covenant, when it is opened; null otherwise. */
  ltmEbitda: z.object({value: money, anchor: anchorSchema}).strict().nullable().default(null),
  reported: z.object({
    value: ratio,
    asOf: isoDate,
    definition: z.string().min(1),
    netDebtComponents: z.array(netDebtComponentSchema).min(1),
    ebitdaOpened: z.boolean(),
    anchor: anchorSchema,
  }).strict().nullable().default(null),
}).strict().superRefine((input, context) => {
  const seen = new Set<string>();
  for (const fact of input.referenceSettlements) {
    if (seen.has(fact.instrument)) context.addIssue({code: "custom", path: ["referenceSettlements"], message: `duplicate settlement fact for ${fact.instrument}`});
    seen.add(fact.instrument);
  }
  if (input.reported && input.reported.asOf > input.asOfDate) context.addIssue({code: "custom", path: ["reported", "asOf"], message: "the reported index is dated after the as-of date"});
});
export type CovenantReconciliationInput = z.input<typeof covenantReconciliationInputSchema>;

type Comparability = "comparable" | "conditional" | "not_comparable" | "no_reported_index";

export type CovenantReconciliationOutput = {
  schemaVersion: "method.reconcile-covenant-definitions.v2";
  asOfDate: string;
  state: "resolved" | "conditioned" | "blocked";
  blockReasons: string[];
  covenants: Array<{
    instrument: string;
    source: "indenture" | "trustee_report";
    indexName: string;
    direction: "maximum" | "minimum" | null;
    definitions: {netDebt: string | null; netDebtComponents: string[]; ebitda: string | null; ebitdaAdjustments: string[]} | null;
    measurement: {frequency: string; basis: string; fiscalYearEnd: string; nextMeasurementDate: string} | null;
    tiers: Array<{index: number; limit: string; condition: string; state: "applies" | "ended" | "not_yet" | "unproven" | "n/a"}>;
    applicableLimit: string | null;
    limitState: "resolved" | "reported_by_trustee" | "insufficient_evidence";
    limitConditions: string[];
    comparability: Comparability;
    comparabilityReasons: string[];
    headroom: {absolute: string; relative: string | null; basis: string} | null;
    status: "within_limit" | "above_limit_interim" | "unresolved";
    anchor: Anchor;
  }>;
  comparableIndex: {
    value: string;
    basis: "computed_from_components" | "reported";
    definition: string;
    netDebt: {value: string; formula: string; operands: Record<string, string>; anchors: Record<string, Anchor>} | null;
    ebitda: {value: string; basis: "opened" | "implied_from_reported"; formula: string | null} | null;
    anchor: Anchor | null;
  } | null;
  unprovenConditions: string[];
  trace: {calculations: Array<{id: string; formula: string; operands: Record<string, string>; result: string}>; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sortStrings = (values: readonly string[]) => [...values].sort();

function nextMeasurement(asOf: string, fiscalYearEnd: string): string {
  const [month, day] = fiscalYearEnd.split("-");
  const year = Number(asOf.slice(0, 4));
  const candidate = `${year}-${month}-${day}`;
  return candidate > asOf ? candidate : `${year + 1}-${month}-${day}`;
}

function canonical(input: z.infer<typeof covenantReconciliationInputSchema>) {
  return {
    ...input,
    instruments: [...input.instruments].sort((a, b) => a.id.localeCompare(b.id)).map((instrument) => instrument.source === "indenture"
      ? {...instrument, netDebtComponents: sortStrings(instrument.netDebtComponents), ebitdaAdjustments: sortStrings(instrument.ebitdaAdjustments), tiers: instrument.tiers.map((tier) => tier.condition.type === "unconditional" ? tier : {...tier, condition: {...tier.condition, referenceInstruments: sortStrings(tier.condition.referenceInstruments)}})}
      : instrument),
    referenceSettlements: [...input.referenceSettlements].sort((a, b) => a.instrument.localeCompare(b.instrument)),
    reported: input.reported ? {...input.reported, netDebtComponents: sortStrings(input.reported.netDebtComponents)} : null,
  };
}

export function reconcileCovenantDefinitions(raw: CovenantReconciliationInput): CovenantReconciliationOutput {
  const input = canonical(covenantReconciliationInputSchema.parse(raw));
  const calculations: CovenantReconciliationOutput["trace"]["calculations"] = [];
  const blockReasons: string[] = [];
  if (input.instruments.length === 0) blockReasons.push("no indenture and no trustee report in the base: nothing to reconcile");

  // The index the covenants are compared to: computed from components when the base holds them, else the reported one.
  let comparableIndex: CovenantReconciliationOutput["comparableIndex"] = null;
  if (input.components) {
    const c = input.components;
    const netDebt = d(c.grossDebt).plus(c.derivativeLiabilities).minus(c.derivativeAssets).minus(c.cashAndEquivalents).minus(c.financialInvestments);
    const operands = {grossDebt: c.grossDebt, derivativeLiabilities: c.derivativeLiabilities, derivativeAssets: c.derivativeAssets, cashAndEquivalents: c.cashAndEquivalents, financialInvestments: c.financialInvestments};
    calculations.push({id: "financial.debt_views", formula: "grossDebt + derivativeLiabilities - derivativeAssets - cashAndEquivalents - financialInvestments", operands, result: out(netDebt)});
    const netDebtBlock = {value: out(netDebt), formula: "grossDebt + derivativeLiabilities - derivativeAssets - cashAndEquivalents - financialInvestments", operands, anchors: {debt: c.anchors.debt, cash: c.anchors.cash, derivatives: c.anchors.derivatives}};
    if (input.ltmEbitda) {
      const index = netDebt.div(input.ltmEbitda.value);
      calculations.push({id: "financial.net_leverage", formula: "netDebt / ltmEbitda", operands: {netDebt: out(netDebt), ltmEbitda: input.ltmEbitda.value}, result: out(index)});
      comparableIndex = {value: out(index), basis: "computed_from_components", definition: "contractual net debt over the LTM EBITDA opened by the company", netDebt: netDebtBlock, ebitda: {value: input.ltmEbitda.value, basis: "opened", formula: null}, anchor: input.ltmEbitda.anchor};
    } else if (input.reported) {
      const implied = netDebt.div(input.reported.value);
      calculations.push({id: "financial.net_leverage", formula: "impliedEbitda = netDebt / reportedIndex", operands: {netDebt: out(netDebt), reportedIndex: input.reported.value}, result: out(implied)});
      comparableIndex = {value: input.reported.value, basis: "reported", definition: input.reported.definition, netDebt: netDebtBlock, ebitda: {value: out(implied), basis: "implied_from_reported", formula: "netDebt / reportedIndex"}, anchor: input.reported.anchor};
    }
  } else if (input.reported) {
    comparableIndex = {value: input.reported.value, basis: "reported", definition: input.reported.definition, netDebt: null, ebitda: null, anchor: input.reported.anchor};
  }

  const settlements = new Map(input.referenceSettlements.map((fact) => [fact.instrument, fact]));
  const unproven = new Set<string>();

  const covenants = input.instruments.map((instrument): CovenantReconciliationOutput["covenants"][number] => {
    if (instrument.source === "trustee_report") {
      return {
        instrument: instrument.id, source: "trustee_report", indexName: instrument.indexName, direction: null, definitions: null, measurement: null,
        tiers: [{index: 0, limit: instrument.reportedLimit, condition: "as reported by the trustee; the indenture is not in the base", state: "n/a"}],
        applicableLimit: instrument.reportedLimit, limitState: "reported_by_trustee",
        limitConditions: ["the indenture is not in the base: the limit is the trustee's report and no headroom is asserted"],
        comparability: "not_comparable", comparabilityReasons: ["definition, perimeter, adjustments and measurement date are not readable without the indenture"],
        headroom: null, status: "unresolved", anchor: instrument.anchor,
      };
    }
    const conditions: string[] = [];
    const tiers: CovenantReconciliationOutput["covenants"][number]["tiers"] = [];
    let applicable: {limit: string; tier: number} | null = null;
    instrument.tiers.forEach((tier, index) => {
      const condition = tier.condition;
      if (condition.type === "unconditional") {
        tiers.push({index, limit: tier.limit, condition: "unconditional", state: applicable ? "n/a" : "applies"});
        if (!applicable) applicable = {limit: tier.limit, tier: index};
        return;
      }
      const facts = condition.referenceInstruments.map((reference) => settlements.get(reference) ?? null);
      // A reference instrument is over when it matured or was settled ordinarily, whichever first;
      // an accelerated settlement keeps the lower tier; an unknown settlement after maturity is unproven.
      const over = facts.map((fact) => {
        if (!fact) return "unknown" as const;
        if (fact.settlement === "ordinary" && (fact.settlementDate === null || fact.settlementDate <= input.asOfDate)) return "ordinary" as const;
        if (fact.settlement === "accelerated") return "accelerated" as const;
        if (fact.maturityDate <= input.asOfDate) return fact.settlement === "outstanding" ? "outstanding_after_maturity" as const : "unknown" as const;
        return "alive" as const;
      });
      const label = condition.referenceInstruments.join(", ");
      if (condition.type === "until_reference_settled") {
        if (over.some((state) => state === "alive")) { tiers.push({index, limit: tier.limit, condition: `until ${label} matures or is settled ordinarily`, state: "applies"}); applicable ??= {limit: tier.limit, tier: index}; return; }
        if (over.some((state) => state === "accelerated")) { tiers.push({index, limit: tier.limit, condition: `until ${label} matures or is settled ordinarily; an accelerated settlement keeps this tier`, state: "applies"}); applicable ??= {limit: tier.limit, tier: index}; conditions.push(`a reference instrument (${label}) was settled by acceleration, so the ${tier.limit}x tier remains`); return; }
        tiers.push({index, limit: tier.limit, condition: `until ${label} matures or is settled ordinarily`, state: over.every((state) => state === "ordinary") ? "ended" : "unproven"});
        return;
      }
      if (over.every((state) => state === "ordinary")) { tiers.push({index, limit: tier.limit, condition: `after ordinary settlement of ${label}`, state: "applies"}); applicable ??= {limit: tier.limit, tier: index}; return; }
      if (over.some((state) => state === "alive")) { tiers.push({index, limit: tier.limit, condition: `after ordinary settlement of ${label}`, state: "not_yet"}); return; }
      tiers.push({index, limit: tier.limit, condition: `after ordinary settlement of ${label}`, state: "unproven"});
      if (over.some((state) => state === "outstanding_after_maturity")) conditions.push(`${label} matured and is recorded as outstanding; the ${tier.limit}x tier does not apply until ordinary settlement is proven`);
      else if (!over.some((state) => state === "accelerated")) conditions.push(`the ${tier.limit}x tier requires proof of ordinary settlement of ${label}; the base does not prove it`);
    });
    for (const condition of conditions) unproven.add(`${instrument.id}: ${condition}`);

    const measurement = {frequency: instrument.measurement.frequency, basis: instrument.measurement.basis, fiscalYearEnd: instrument.measurement.fiscalYearEnd, nextMeasurementDate: nextMeasurement(input.asOfDate, instrument.measurement.fiscalYearEnd)};

    const reasons: string[] = [];
    let comparability: Comparability = "no_reported_index";
    if (comparableIndex) {
      comparability = "comparable";
      if (comparableIndex.basis === "reported" && input.reported) {
        const contractual = new Set(instrument.netDebtComponents);
        const reportedComponents = new Set(input.reported.netDebtComponents);
        const missing = [...contractual].filter((component) => !reportedComponents.has(component));
        const extra = [...reportedComponents].filter((component) => !contractual.has(component));
        if (missing.length > 0 || extra.length > 0) { comparability = "not_comparable"; reasons.push(`the reported net debt differs from the indenture's components (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"})`); }
        if (!input.reported.ebitdaOpened) { if (comparability !== "not_comparable") comparability = "conditional"; reasons.push("the company does not open the EBITDA used in the reported index"); }
      }
      if (instrument.ebitdaAdjustments.length > 0 && !(comparableIndex.basis === "computed_from_components")) {
        if (comparability !== "not_comparable") comparability = "conditional";
        reasons.push(`this indenture adjusts EBITDA (${instrument.ebitdaAdjustments.join("; ")}) and the index does not show the adjustment`);
      }
      if (instrument.measurement.frequency !== "annual") reasons.push(`measurement is ${instrument.measurement.frequency}; the comparison below is against the next measurement on ${measurement.nextMeasurementDate}`);
    }

    let headroom: CovenantReconciliationOutput["covenants"][number]["headroom"] = null;
    let status: CovenantReconciliationOutput["covenants"][number]["status"] = "unresolved";
    if (applicable && comparability === "comparable" && comparableIndex) {
      const limit = d((applicable as {limit: string}).limit);
      const actual = d(comparableIndex.value);
      const absolute = instrument.direction === "maximum" ? limit.minus(actual) : actual.minus(limit);
      calculations.push({id: "structure.covenant_headroom", formula: instrument.direction === "maximum" ? "limit - actual" : "actual - limit", operands: {limit: out(limit), actual: out(actual)}, result: out(absolute)});
      headroom = {absolute: out(absolute), relative: limit.isZero() ? null : out(absolute.div(limit)), basis: `${comparableIndex.basis} index against the ${(applicable as {limit: string}).limit}x tier, ${instrument.direction}`};
      status = absolute.gte(0) ? "within_limit" : "above_limit_interim";
    }
    return {
      instrument: instrument.id, source: "indenture", indexName: instrument.indexName, direction: instrument.direction,
      definitions: {netDebt: instrument.netDebtDefinition, netDebtComponents: instrument.netDebtComponents, ebitda: instrument.ebitdaDefinition, ebitdaAdjustments: instrument.ebitdaAdjustments},
      measurement, tiers,
      applicableLimit: applicable ? (applicable as {limit: string}).limit : null,
      limitState: applicable ? "resolved" : "insufficient_evidence",
      limitConditions: sortStrings(conditions),
      comparability, comparabilityReasons: sortStrings(reasons),
      headroom, status, anchor: instrument.anchor,
    };
  });

  const state: CovenantReconciliationOutput["state"] = blockReasons.length > 0 ? "blocked" : covenants.every((covenant) => covenant.status !== "unresolved") ? "resolved" : "conditioned";
  const body = {
    schemaVersion: "method.reconcile-covenant-definitions.v2" as const,
    asOfDate: input.asOfDate,
    state,
    blockReasons,
    covenants,
    comparableIndex,
    unprovenConditions: sortStrings([...unproven]),
  };
  return {...body, trace: {calculations, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(body)}};
}
