import {createHash} from "node:crypto";

import {calculateCovenantHeadroom} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `reconcile-covenant-definitions` (v3, after the second independent review).
 * It never writes "breached". Each indenture carries the anchor of its definitions and one anchor per
 * tier; EBITDA adjustments are typed (denominator additions versus numerator obligations) and never
 * folded together; the net debt of each instrument is computed from that instrument's own component
 * list over dated component values with their own anchors, so a definition that adds leases or drops
 * derivatives changes the number or refuses the comparison; the reported index is comparable only at
 * the as-of date, with the same components and an opened EBITDA value; an ordinary settlement needs
 * its date; the next measurement follows the frequency the indenture states; every unproven tier
 * leaves a written condition. Headroom comes from financial-core and only when everything above holds.
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
type NetDebtComponent = z.infer<typeof netDebtComponentSchema>;
const DEDUCTIONS = new Set<NetDebtComponent>(["cash_and_equivalents", "financial_investments", "derivative_assets"]);
/** An open-ended residual ("qualquer outra dívida onerosa"): its absence from the base is a condition, not a mismatch. */
const RESIDUAL: NetDebtComponent = "other_onerous_debt";

export const covenantTierSchema = z.object({
  limit: ratio,
  condition: z.discriminatedUnion("type", [
    z.object({type: z.literal("unconditional")}).strict(),
    z.object({type: z.literal("until_reference_settled"), referenceInstruments: z.array(z.string().min(1)).min(1)}).strict(),
    z.object({type: z.literal("after_reference_settled"), referenceInstruments: z.array(z.string().min(1)).min(1)}).strict(),
  ]),
  anchor: indentureAnchorSchema,
}).strict();

/** Adjustments beyond the base EBITDA definition, typed by the side of the ratio they touch. */
export const ebitdaAdjustmentSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["denominator_addition", "numerator_obligation", "other"]),
  description: z.string().min(1),
  anchor: indentureAnchorSchema,
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
    ebitdaAdjustments: z.array(ebitdaAdjustmentSchema).default([]),
    measurement: z.object({frequency: z.enum(["annual", "semiannual", "quarterly"]), basis: z.string().min(1), fiscalYearEnd: z.string().regex(/^\d{2}-\d{2}$/)}).strict(),
    /** Tiers in the order the indenture states them. */
    tiers: z.array(covenantTierSchema).min(1),
    definitionsAnchor: indentureAnchorSchema,
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

/** One line of the base with the components it covers (an aggregated note line may cover two), its date and its own anchor. */
export const componentValueSchema = z.object({
  component: netDebtComponentSchema,
  covers: z.array(netDebtComponentSchema).min(1),
  value: money,
  asOf: isoDate,
  anchor: anchorSchema,
}).strict();

export const covenantReconciliationInputSchema = z.object({
  asOfDate: isoDate,
  instruments: z.array(covenantInstrumentSchema),
  referenceSettlements: z.array(z.object({
    instrument: z.string().min(1),
    maturityDate: isoDate,
    /** ordinary: settled in the ordinary course (needs the date); accelerated: settled by acceleration; outstanding: still alive; unknown: the base does not say. */
    settlement: z.enum(["ordinary", "accelerated", "outstanding", "unknown"]),
    settlementDate: isoDate.nullable().default(null),
    anchor: anchorSchema,
  }).strict()).default([]),
  componentValues: z.array(componentValueSchema).default([]),
  /** LTM EBITDA as the company computes it for the covenant, when it is opened, with the adjustment ids it already incorporates. */
  ltmEbitda: z.object({value: money, asOf: isoDate, incorporatesAdjustments: z.array(z.string().min(1)).default([]), anchor: anchorSchema}).strict().nullable().default(null),
  reported: z.object({
    value: ratio,
    asOf: isoDate,
    definition: z.string().min(1),
    /** The components the base actually enumerates for the reported net debt, not the contractual phrase. */
    netDebtComponents: z.array(netDebtComponentSchema).min(1),
    /** The opened EBITDA behind the reported index, when the base shows it; a flag is not an opening. */
    ebitdaOpening: z.object({value: money, asOf: isoDate, anchor: anchorSchema}).strict().nullable().default(null),
    anchor: anchorSchema,
  }).strict().nullable().default(null),
}).strict().superRefine((input, context) => {
  const seenFacts = new Set<string>();
  input.referenceSettlements.forEach((fact, index) => {
    if (seenFacts.has(fact.instrument)) context.addIssue({code: "custom", path: ["referenceSettlements", index], message: `duplicate settlement fact for ${fact.instrument}`});
    seenFacts.add(fact.instrument);
    if (fact.settlement === "ordinary" && fact.settlementDate === null) context.addIssue({code: "custom", path: ["referenceSettlements", index, "settlementDate"], message: `an ordinary settlement of ${fact.instrument} needs its date; without it the fact is unknown, not ordinary`});
  });
  const seenInstruments = new Set<string>();
  input.instruments.forEach((instrument, index) => {
    if (seenInstruments.has(instrument.id)) context.addIssue({code: "custom", path: ["instruments", index], message: `duplicate instrument ${instrument.id}`});
    seenInstruments.add(instrument.id);
    if (instrument.source === "indenture") {
      const adjustmentIds = new Set<string>();
      instrument.ebitdaAdjustments.forEach((adjustment, position) => {
        if (adjustmentIds.has(adjustment.id)) context.addIssue({code: "custom", path: ["instruments", index, "ebitdaAdjustments", position], message: `duplicate adjustment ${adjustment.id}`});
        adjustmentIds.add(adjustment.id);
      });
    }
  });
  const covered = new Set<string>();
  input.componentValues.forEach((line, index) => {
    if (!line.covers.includes(line.component)) context.addIssue({code: "custom", path: ["componentValues", index, "covers"], message: "a line must cover its own component"});
    if (line.asOf !== input.asOfDate) context.addIssue({code: "custom", path: ["componentValues", index, "asOf"], message: `component ${line.component} is dated ${line.asOf}, not the as-of date ${input.asOfDate}`});
    for (const component of line.covers) {
      if (covered.has(component)) context.addIssue({code: "custom", path: ["componentValues", index], message: `component ${component} is covered twice`});
      covered.add(component);
    }
  });
  if (input.ltmEbitda && input.ltmEbitda.asOf !== input.asOfDate) context.addIssue({code: "custom", path: ["ltmEbitda", "asOf"], message: "the opened EBITDA must be dated at the as-of date"});
  if (input.reported && input.reported.asOf > input.asOfDate) context.addIssue({code: "custom", path: ["reported", "asOf"], message: "the reported index is dated after the as-of date"});
});
export type CovenantReconciliationInput = z.input<typeof covenantReconciliationInputSchema>;

type Comparability = "comparable" | "conditional" | "not_comparable" | "no_index";
type Calculation = {id: string; formula: string; operands: Record<string, string>; result: string};

export type CovenantReconciliationOutput = {
  schemaVersion: "method.reconcile-covenant-definitions.v3";
  asOfDate: string;
  state: "resolved" | "conditioned" | "blocked";
  blockReasons: string[];
  covenants: Array<{
    instrument: string;
    source: "indenture" | "trustee_report";
    indexName: string;
    direction: "maximum" | "minimum" | null;
    definitions: {netDebt: string; netDebtComponents: string[]; ebitda: string; ebitdaAdjustments: Array<{id: string; kind: string; description: string; anchor: Anchor}>; anchor: Anchor} | null;
    measurement: {frequency: string; basis: string; fiscalYearEnd: string; nextMeasurementDate: string} | null;
    tiers: Array<{index: number; limit: string; condition: string; state: "applies" | "ended" | "not_yet" | "unproven" | "n/a"; anchor: Anchor}>;
    applicableLimit: string | null;
    limitState: "resolved" | "reported_by_trustee" | "insufficient_evidence";
    limitConditions: string[];
    reportedMeasurement: {value: string; asOf: string} | null;
    netDebtByDefinition: {value: string; formula: string; operands: Record<string, string>; anchors: Record<string, Anchor>; residualAssumedZero: boolean} | null;
    index: {value: string; basis: "computed_from_components" | "reported"; ebitda: {value: string; basis: "opened" | "implied_from_reported"}; anchor: Anchor} | null;
    comparability: Comparability;
    comparabilityReasons: string[];
    headroom: {absolute: string; relative: string | null; basis: string} | null;
    status: "within_limit" | "above_limit_interim" | "unresolved";
  }>;
  unprovenConditions: string[];
  legalConditions: string[];
  trace: {calculations: Calculation[]; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sortStrings = (values: readonly string[]) => [...values].sort(compare);

const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
/** Next measurement after the as-of date: the fiscal year end and, for shorter frequencies, the month ends between. */
export function nextMeasurement(asOf: string, fiscalYearEnd: string, frequency: "annual" | "semiannual" | "quarterly"): string {
  const [endMonth, endDay] = fiscalYearEnd.split("-").map(Number) as [number, number];
  const step = frequency === "annual" ? 12 : frequency === "semiannual" ? 6 : 3;
  const year = Number(asOf.slice(0, 4));
  const candidates: string[] = [];
  for (const base of [year - 1, year, year + 1]) {
    for (let offset = 0; offset < 12; offset += step) {
      const total = endMonth - 1 + offset;
      const y = base + Math.floor(total / 12);
      const m = (total % 12) + 1;
      const day = endDay >= lastDay(base, endMonth) ? lastDay(y, m) : Math.min(endDay, lastDay(y, m));
      candidates.push(`${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  }
  return candidates.filter((candidate) => candidate > asOf).sort(compare)[0]!;
}

function canonical(input: z.infer<typeof covenantReconciliationInputSchema>) {
  return {
    ...input,
    instruments: [...input.instruments].sort((a, b) => compare(a.id, b.id)).map((instrument) => instrument.source === "indenture"
      ? {
          ...instrument,
          netDebtComponents: sortStrings(instrument.netDebtComponents) as NetDebtComponent[],
          ebitdaAdjustments: [...instrument.ebitdaAdjustments].sort((a, b) => compare(a.id, b.id)),
          tiers: instrument.tiers.map((tier) => tier.condition.type === "unconditional" ? tier : {...tier, condition: {...tier.condition, referenceInstruments: sortStrings(tier.condition.referenceInstruments)}}),
        }
      : instrument),
    referenceSettlements: [...input.referenceSettlements].sort((a, b) => compare(a.instrument, b.instrument)),
    componentValues: [...input.componentValues].sort((a, b) => compare(a.component, b.component)).map((line) => ({...line, covers: sortStrings(line.covers) as NetDebtComponent[]})),
    ltmEbitda: input.ltmEbitda ? {...input.ltmEbitda, incorporatesAdjustments: sortStrings(input.ltmEbitda.incorporatesAdjustments)} : null,
    reported: input.reported ? {...input.reported, netDebtComponents: sortStrings(input.reported.netDebtComponents) as NetDebtComponent[]} : null,
  };
}

export function reconcileCovenantDefinitions(raw: CovenantReconciliationInput): CovenantReconciliationOutput {
  const input = canonical(covenantReconciliationInputSchema.parse(raw));
  const calculations: Calculation[] = [];
  const blockReasons: string[] = [];
  if (input.instruments.length === 0) blockReasons.push("no indenture and no trustee report in the base: nothing to reconcile");

  const lineFor = new Map<NetDebtComponent, (typeof input.componentValues)[number]>();
  for (const line of input.componentValues) for (const component of line.covers) lineFor.set(component, line);
  const settlements = new Map(input.referenceSettlements.map((fact) => [fact.instrument, fact]));
  const unproven = new Set<string>();
  const legal = new Set<string>();
  const leasesLine = lineFor.get("leases");

  const covenants = input.instruments.map((instrument): CovenantReconciliationOutput["covenants"][number] => {
    if (instrument.source === "trustee_report") {
      return {
        instrument: instrument.id, source: "trustee_report", indexName: instrument.indexName, direction: null, definitions: null, measurement: null,
        tiers: [{index: 0, limit: instrument.reportedLimit, condition: "as reported by the trustee; the indenture is not in the base", state: "n/a", anchor: instrument.anchor}],
        applicableLimit: instrument.reportedLimit, limitState: "reported_by_trustee",
        limitConditions: ["the indenture is not in the base: the limit is the trustee's report and no headroom is asserted"],
        reportedMeasurement: instrument.reportedMeasurement,
        netDebtByDefinition: null, index: null,
        comparability: "not_comparable", comparabilityReasons: ["definition, perimeter, adjustments and measurement date are not readable without the indenture"],
        headroom: null, status: "unresolved",
      };
    }

    // 1. Which tier applies, from dated facts only.
    const conditions: string[] = [];
    const tiers: CovenantReconciliationOutput["covenants"][number]["tiers"] = [];
    let applicable: {limit: string; tier: number} | null = null;
    instrument.tiers.forEach((tier, index) => {
      const condition = tier.condition;
      if (condition.type === "unconditional") {
        tiers.push({index, limit: tier.limit, condition: "unconditional", state: applicable ? "n/a" : "applies", anchor: tier.anchor});
        applicable ??= {limit: tier.limit, tier: index};
        return;
      }
      const facts = condition.referenceInstruments.map((reference) => settlements.get(reference) ?? null);
      // A reference instrument is over when it matured or was settled ordinarily on a proven date; an accelerated
      // settlement keeps the lower tier; a maturity passed without proof of settlement is unproven.
      const over = facts.map((fact) => {
        if (!fact) return "unknown" as const;
        if (fact.settlement === "ordinary" && fact.settlementDate !== null && fact.settlementDate <= input.asOfDate) return "ordinary" as const;
        if (fact.settlement === "accelerated") return "accelerated" as const;
        if (fact.maturityDate <= input.asOfDate) return fact.settlement === "outstanding" ? "outstanding_after_maturity" as const : "unknown" as const;
        return "alive" as const;
      });
      const label = condition.referenceInstruments.join(", ");
      if (condition.type === "until_reference_settled") {
        if (over.some((state) => state === "alive")) { tiers.push({index, limit: tier.limit, condition: `until ${label} matures or is settled ordinarily`, state: "applies", anchor: tier.anchor}); applicable ??= {limit: tier.limit, tier: index}; return; }
        if (over.some((state) => state === "accelerated")) { tiers.push({index, limit: tier.limit, condition: `until ${label} matures or is settled ordinarily; an accelerated settlement keeps this tier`, state: "applies", anchor: tier.anchor}); applicable ??= {limit: tier.limit, tier: index}; conditions.push(`a reference instrument (${label}) was settled by acceleration, so the ${tier.limit}x tier remains`); return; }
        const ended = over.every((state) => state === "ordinary");
        tiers.push({index, limit: tier.limit, condition: `until ${label} matures or is settled ordinarily`, state: ended ? "ended" : "unproven", anchor: tier.anchor});
        if (!ended) conditions.push(`the end of the ${tier.limit}x tier requires proof of ordinary settlement of ${label}; the base does not prove it`);
        return;
      }
      if (over.every((state) => state === "ordinary")) { tiers.push({index, limit: tier.limit, condition: `after ordinary settlement of ${label}`, state: "applies", anchor: tier.anchor}); applicable ??= {limit: tier.limit, tier: index}; return; }
      if (over.some((state) => state === "alive")) { tiers.push({index, limit: tier.limit, condition: `after ordinary settlement of ${label}`, state: "not_yet", anchor: tier.anchor}); return; }
      tiers.push({index, limit: tier.limit, condition: `after ordinary settlement of ${label}`, state: "unproven", anchor: tier.anchor});
      if (over.some((state) => state === "outstanding_after_maturity")) conditions.push(`${label} matured and is recorded as outstanding; the ${tier.limit}x tier does not apply until ordinary settlement is proven`);
      else if (over.some((state) => state === "accelerated")) conditions.push(`${label} was settled by acceleration; the ${tier.limit}x tier does not apply`);
      else conditions.push(`the ${tier.limit}x tier requires proof of ordinary settlement of ${label}; the base does not prove it`);
    });
    for (const condition of conditions) unproven.add(`${instrument.id}: ${condition}`);

    const measurement = {frequency: instrument.measurement.frequency, basis: instrument.measurement.basis, fiscalYearEnd: instrument.measurement.fiscalYearEnd, nextMeasurementDate: nextMeasurement(input.asOfDate, instrument.measurement.fiscalYearEnd, instrument.measurement.frequency)};

    // 2. Net debt by this instrument's own definition, from dated component lines.
    const reasons: string[] = [];
    const wanted = new Set(instrument.netDebtComponents);
    const residualWanted = wanted.has(RESIDUAL);
    const residualOpen = residualWanted && !lineFor.has(RESIDUAL);
    if (residualWanted && !wanted.has("leases") && leasesLine) legal.add(`${instrument.id}: whether lease liabilities (${leasesLine.value}, ${leasesLine.anchor.document}) fall under "${RESIDUAL}" needs legal review; they are excluded from the computed net debt until then`);
    const missing = instrument.netDebtComponents.filter((component) => component !== RESIDUAL && !lineFor.has(component));
    let netDebtByDefinition: CovenantReconciliationOutput["covenants"][number]["netDebtByDefinition"] = null;
    if (missing.length === 0 && input.componentValues.length > 0) {
      const lines = [...new Set(instrument.netDebtComponents.map((component) => lineFor.get(component)).filter((line): line is NonNullable<typeof line> => line !== undefined))];
      const foreign = lines.flatMap((line) => line.covers.filter((component) => !wanted.has(component)));
      if (foreign.length > 0) {
        reasons.push(`the base aggregates ${foreign.join(", ")} into a line this definition excludes; net debt by this definition is not computable`);
      } else {
        let total = d(0);
        const operands: Record<string, string> = {};
        const anchors: Record<string, Anchor> = {};
        const terms: string[] = [];
        for (const line of lines) {
          const sign = DEDUCTIONS.has(line.component) ? -1 : 1;
          total = total.plus(d(line.value).times(sign));
          operands[line.component] = line.value;
          anchors[line.component] = line.anchor;
          terms.push(`${sign < 0 ? "- " : "+ "}${line.component}`);
        }
        const formula = terms.join(" ").replace(/^\+ /, "");
        calculations.push({id: `financial.debt_views:${instrument.id}`, formula, operands, result: out(total)});
        netDebtByDefinition = {value: out(total), formula, operands, anchors, residualAssumedZero: residualOpen};
        if (residualOpen) reasons.push(`"${RESIDUAL}" is not enumerated in the base; the computed net debt assumes none beyond the lines above (condition)`);
      }
    } else if (missing.length > 0) {
      reasons.push(`no dated value in the base for ${missing.join(", ")}; net debt by this definition is not computable`);
    }

    // 3. The index to compare: computed from the opened EBITDA, else the reported one at the same date and components.
    let index: CovenantReconciliationOutput["covenants"][number]["index"] = null;
    let comparability: Comparability = "no_index";
    if (netDebtByDefinition && input.ltmEbitda) {
      const value = d(netDebtByDefinition.value).div(input.ltmEbitda.value);
      calculations.push({id: `financial.net_leverage:${instrument.id}`, formula: "netDebtByDefinition / ltmEbitda", operands: {netDebtByDefinition: netDebtByDefinition.value, ltmEbitda: input.ltmEbitda.value}, result: out(value)});
      index = {value: out(value), basis: "computed_from_components", ebitda: {value: input.ltmEbitda.value, basis: "opened"}, anchor: input.ltmEbitda.anchor};
      comparability = residualOpen ? "conditional" : "comparable";
      const incorporated = new Set(input.ltmEbitda.incorporatesAdjustments);
      for (const adjustment of instrument.ebitdaAdjustments) {
        if (incorporated.has(adjustment.id)) continue;
        comparability = "conditional";
        reasons.push(adjustment.kind === "numerator_obligation"
          ? `the opened EBITDA does not state how the numerator obligation "${adjustment.id}" (${adjustment.description}) is treated`
          : `the opened EBITDA does not state whether it incorporates "${adjustment.id}" (${adjustment.description})`);
      }
    } else if (input.reported) {
      const reported = input.reported;
      comparability = "comparable";
      if (reported.asOf !== input.asOfDate) { comparability = "not_comparable"; reasons.push(`the reported index is dated ${reported.asOf}, not the as-of date ${input.asOfDate}`); }
      const reportedSet = new Set(reported.netDebtComponents);
      const missingInReported = instrument.netDebtComponents.filter((component) => component !== RESIDUAL && !reportedSet.has(component));
      const extraInReported = reported.netDebtComponents.filter((component) => !wanted.has(component));
      if (missingInReported.length > 0 || extraInReported.length > 0) { comparability = "not_comparable"; reasons.push(`the reported net debt differs from the indenture's components (missing: ${missingInReported.join(", ") || "none"}; extra: ${extraInReported.join(", ") || "none"})`); }
      if (residualWanted && !reportedSet.has(RESIDUAL)) { if (comparability !== "not_comparable") comparability = "conditional"; reasons.push(`the base does not state whether the reported net debt includes "${RESIDUAL}" (condition)`); }
      if (!reported.ebitdaOpening) { if (comparability !== "not_comparable") comparability = "conditional"; reasons.push("the base does not open the EBITDA behind the reported index"); }
      for (const adjustment of instrument.ebitdaAdjustments) { if (comparability !== "not_comparable") comparability = "conditional"; reasons.push(`this indenture carries the adjustment "${adjustment.id}" (${adjustment.kind}) and the reported index does not show it`); }
      const ebitda = reported.ebitdaOpening
        ? {value: reported.ebitdaOpening.value, basis: "opened" as const}
        : netDebtByDefinition
          ? (() => { const implied = d(netDebtByDefinition.value).div(reported.value); calculations.push({id: `financial.net_leverage:${instrument.id}`, formula: "impliedEbitda = netDebtByDefinition / reportedIndex", operands: {netDebtByDefinition: netDebtByDefinition.value, reportedIndex: reported.value}, result: out(implied)}); return {value: out(implied), basis: "implied_from_reported" as const}; })()
          : null;
      if (ebitda) index = {value: reported.value, basis: "reported", ebitda, anchor: reported.anchor};
      else { index = {value: reported.value, basis: "reported", ebitda: {value: "", basis: "implied_from_reported"}, anchor: reported.anchor}; if (comparability !== "not_comparable") comparability = "conditional"; reasons.push("no net debt by definition and no opened EBITDA: the reported index stands alone"); }
    }
    if (comparability !== "no_index" && instrument.measurement.frequency !== "annual") reasons.push(`measurement is ${instrument.measurement.frequency}; the next measurement is ${measurement.nextMeasurementDate}`);

    // 4. Headroom only when the limit is resolved and the comparison is full.
    let headroom: CovenantReconciliationOutput["covenants"][number]["headroom"] = null;
    let status: CovenantReconciliationOutput["covenants"][number]["status"] = "unresolved";
    if (applicable && comparability === "comparable" && index) {
      const limit = (applicable as {limit: string}).limit;
      const result = calculateCovenantHeadroom({actual: index.value, limit, direction: instrument.direction});
      calculations.push({id: `structure.covenant_headroom:${instrument.id}`, formula: instrument.direction === "maximum" ? "limit - actual" : "actual - limit", operands: {limit, actual: index.value}, result: result.absolute});
      headroom = {absolute: result.absolute, relative: result.percentage, basis: `${index.basis} index against the ${limit}x tier, ${instrument.direction}`};
      status = result.passes ? "within_limit" : "above_limit_interim";
    }
    return {
      instrument: instrument.id, source: "indenture", indexName: instrument.indexName, direction: instrument.direction,
      definitions: {netDebt: instrument.netDebtDefinition, netDebtComponents: instrument.netDebtComponents, ebitda: instrument.ebitdaDefinition, ebitdaAdjustments: instrument.ebitdaAdjustments, anchor: instrument.definitionsAnchor},
      measurement, tiers,
      applicableLimit: applicable ? (applicable as {limit: string}).limit : null,
      limitState: applicable ? "resolved" : "insufficient_evidence",
      limitConditions: sortStrings(conditions),
      reportedMeasurement: null,
      netDebtByDefinition, index,
      comparability, comparabilityReasons: sortStrings(reasons),
      headroom, status,
    };
  });

  const state: CovenantReconciliationOutput["state"] = blockReasons.length > 0 ? "blocked" : covenants.every((covenant) => covenant.status !== "unresolved") ? "resolved" : "conditioned";
  const body = {
    schemaVersion: "method.reconcile-covenant-definitions.v3" as const,
    asOfDate: input.asOfDate,
    state,
    blockReasons,
    covenants,
    unprovenConditions: sortStrings([...unproven]),
    legalConditions: sortStrings([...legal]),
  };
  return {...body, trace: {calculations, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(body)}};
}
