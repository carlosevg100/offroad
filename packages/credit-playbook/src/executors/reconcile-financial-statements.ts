import {createHash} from "node:crypto";

import {buildDebtBalanceBridge, checkIdentity} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

import {referenceDataRegistry} from "../reference-data";

/**
 * Executor of the method `reconcile-financial-statements` (v8, after the seventh independent review).
 * Proves that material numbers close between statements, notes and release, runs the identities
 * through financial-core, and keeps every difference above the tolerance as an open divergence
 * with its anchors. Two sources that disagree are never averaged and never silently resolved. Two
 * sources are compared only when they count the same components at the same date; otherwise the
 * pair is `not_comparable`, which is not `closes`. An explanation names the source it starts from
 * and the source it reaches, with the sign preserved. A tolerance above zero exists only under a
 * versioned policy, and policy metadata is checked even at zero. A single-source account is recorded,
 * never compared. Inside an account that is not comparable as a whole, the sources that share a
 * definition, components and date are compared among themselves, so a divergence between two
 * carrying amounts is never lost behind a nominal or a fair value. Every component tag is a known
 * tag the definition text names. Every calculation carries the anchors of its operands. A figure the
 * source publishes in another scale enters with its stated value, unit and decimals, and its rounding
 * band is recorded, so two figures that differ by less than the coarser rounding close "within the
 * published rounding", never "exactly". A sign the source publishes as an expense is declared and
 * normalized in the trace. Every line of a bridge carries its own anchor. An empty base blocks.
 */
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const nonNegative = z.string().regex(/^\d+(\.\d+)?$/);
const nonEmpty = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const unitSchema = z.enum(["BRL", "BRL thousand", "BRL million", "USD", "USD thousand"]);
const anchorSchema = z.object({document: nonEmpty, page: z.number().int().positive().optional(), note: nonEmpty.optional(), table: nonEmpty.optional(), clause: nonEmpty.optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const toleranceSchema = z.object({value: nonNegative, policyKey: nonEmpty.optional(), policyVersion: nonEmpty.optional()}).strict();
/** A tolerance above zero must be the value the registered policy states for the family and the unit, at the policy's current version. */
function tolerancePolicyIssue(family: string, tolerance: z.infer<typeof toleranceSchema>, unit: string): string | null {
  const zero = new Decimal(tolerance.value).isZero();
  if (zero && !tolerance.policyKey && !tolerance.policyVersion) return null;
  if (!tolerance.policyKey || !tolerance.policyVersion) return zero ? `${family}: policy metadata must carry both policyKey and policyVersion, or neither` : `${family}: a tolerance above zero needs policyKey and policyVersion`;
  const policy = referenceDataRegistry.find((entry) => entry.key === tolerance.policyKey);
  if (!policy) return `${family}: policy ${tolerance.policyKey} is not in the reference-data registry`;
  if (policy.version !== tolerance.policyVersion) return `${family}: policy ${tolerance.policyKey} is at version ${policy.version}, not ${tolerance.policyVersion}`;
  if (zero) return null;
  if (policy.status === "required_missing" || policy.value === null || typeof policy.value !== "object") return `${family}: policy ${tolerance.policyKey} has no value yet; a tolerance above zero cannot rest on it`;
  const value = policy.value as {families?: Record<string, string>; familiesUnit?: string};
  const allowed = value.families?.[family];
  if (allowed === undefined) return `${family}: policy ${tolerance.policyKey} states no tolerance for this family`;
  if (value.familiesUnit !== unit) return `${family}: policy ${tolerance.policyKey} states its tolerances in ${value.familiesUnit ?? "no unit"}, not ${unit}`;
  if (!new Decimal(allowed).eq(tolerance.value)) return `${family}: policy ${tolerance.policyKey} states ${allowed}, not ${tolerance.value}`;
  return null;
}

/** Every component tag the executor accepts, with the words its definition text must contain; an unknown tag is refused. */
const COMPONENT_WORDS: Record<string, RegExp> = {
  gross_debt: /divida bruta|gross debt|emprestim|financiament|debenture/,
  cash: /caixa|disponibilidade|cash/,
  investments: /aplicac|investment/,
  derivative_liabilities: /derivativ/,
  derivative_assets: /derivativ/,
  leases: /arrendament|lease/,
  lease_liabilities: /arrendament|lease/,
  inventories: /estoque|inventor/,
  inventories_management_view: /gerencial|management/,
  advances_to_suppliers: /adiantamento|advance/,
  advances_to_producers: /adiantamento|advance/,
  dividends_declared: /dividend/,
  nominal: /nominal/,
  remaining_installments: /parcela|installment/,
  present_value: /valor presente|present value/,
  carrying_amount: /contabil|carrying|valor presente|present value/,
  fair_value: /valor justo|fair value/,
  interest: /juros|interest/,
  monetary_variation: /variac|variation|indexa/,
  ebitda: /ebitda/,
  quarter_annualized: /trimestre|quarter/,
  ltm: /doze meses|ultimos doze|ltm|twelve/,
};
export const knownComponents = Object.keys(COMPONENT_WORDS).sort();
const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const scaleUnits = z.enum(["BRL", "BRL thousand", "BRL million"]);
const SCALE: Record<z.infer<typeof scaleUnits>, string> = {"BRL": "1", "BRL thousand": "1000", "BRL million": "1000000"};

export const statementSourceSchema = z.object({
  source: nonEmpty,
  value: money,
  /** When the source publishes the figure in another scale (a release in R$ million with one decimal): the value as published, its unit and its decimals; the executor converts and records the rounding band. */
  stated: z.object({value: money, unit: scaleUnits, decimals: z.number().int().min(0).max(6)}).strict().nullable().default(null),
  /** as_published keeps the sign the source prints; absolute declares that the executor compares magnitudes (an expense printed in parentheses). */
  sign: z.enum(["as_published", "absolute"]).default("as_published"),
  /** The months the figure covers (12 for a twelve-month figure, 3 for a quarter, 0 for a balance at a date); sources covering different spans are not comparable whatever their keys. */
  periodMonths: z.number().int().min(0).max(60),
  /** When the value is recomputed from other figures, the derivation with each operand anchored; the executor re-runs it. */
  derivation: z.object({formula: z.enum(["sum", "difference"]), operands: z.array(z.object({label: nonEmpty, value: money, anchor: anchorSchema}).strict()).min(2)}).strict().nullable().default(null),
  /** What the source counts, as text, as a definition key shared by sources that count the same thing, and as component tags. */
  definition: nonEmpty,
  definitionKey: nonEmpty,
  definitionAnchor: anchorSchema,
  components: z.array(nonEmpty).min(1),
  /** The date the value is stated at; sources at different dates are not compared. */
  asOf: isoDate,
  anchor: anchorSchema,
}).strict();

export const reconciliationInputSchema = z.object({
  referenceDate: isoDate,
  unit: unitSchema,
  /** Absolute tolerance per statement family; a missing family means zero tolerance. */
  tolerance: z.record(nonEmpty, toleranceSchema).default({}),
  /** The same account stated by one or more sources. One source is recorded as single-source, never compared. */
  pairedAccounts: z.array(z.object({
    id: nonEmpty,
    label: nonEmpty,
    family: nonEmpty,
    sources: z.array(statementSourceSchema).min(1),
    /** Stated reconciliations from one source to another (adjustment lines), when the notes give them: to = from + adjustment. An account with n sources is explained only when every source is connected. */
    explanations: z.array(z.object({fromSource: nonEmpty, toSource: nonEmpty, adjustment: money, description: nonEmpty, anchor: anchorSchema}).strict()).default([]),
  }).strict()).default([]),
  /** Balance sheet identity: assets equal liabilities plus equity. Required for the state `closes`. */
  balanceSheet: z.object({assets: z.object({value: money, anchor: anchorSchema}).strict(), liabilities: z.object({value: money, anchor: anchorSchema}).strict(), equity: z.object({value: money, anchor: anchorSchema}).strict()}).strict().nullable().default(null),
  /** Debt roll-forward from the note: opening plus movements equals closing. */
  debtBridge: z.object({
    opening: z.object({value: money, anchor: anchorSchema}).strict(),
    /** Each line as the note prints it (a reduction may be printed in parentheses) and how it is read: as published or as a magnitude; the reading is traced. */
    lines: z.array(z.object({id: nonEmpty, label: nonEmpty, published: money, sign: z.enum(["as_published", "absolute"]).default("as_published"), category: z.enum(["drawdowns", "accruedInterest", "pik", "indexation", "foreignExchange", "acquisitions", "otherAdditions", "amortizations", "prepayments", "writeOffs"]), anchor: anchorSchema}).strict()).min(1),
    closing: z.object({value: money, anchor: anchorSchema}).strict(),
    anchor: anchorSchema,
  }).strict().nullable().default(null),
  /** Cash roll-forward: opening plus net change equals closing. */
  cashBridge: z.object({opening: z.object({value: money, anchor: anchorSchema}).strict(), netChange: z.object({value: money, anchor: anchorSchema}).strict(), closing: z.object({value: money, anchor: anchorSchema}).strict()}).strict().nullable().default(null),
  /** Interest expense: the note's accrued interest against the income statement's expense; the difference is recorded, never hidden. */
  /** Each side with the value as the source prints it (an expense may be negative) and how the executor is to read it: as printed or as a magnitude; the normalization is traced. */
  interestBridge: z.object({fromDebtMovement: z.object({value: money, sign: z.enum(["as_published", "absolute"]).default("as_published"), components: z.array(nonEmpty).min(1), anchor: anchorSchema}).strict(), fromIncomeStatement: z.object({value: money, sign: z.enum(["as_published", "absolute"]).default("as_published"), components: z.array(nonEmpty).min(1), anchor: anchorSchema}).strict()}).strict().nullable().default(null),
}).strict().superRefine((input, context) => {
  for (const [side, entry] of Object.entries(input.interestBridge ?? {})) for (const component of entry.components) if (!COMPONENT_WORDS[component]) context.addIssue({code: "custom", path: ["interestBridge", side], message: `unknown component tag ${component} in the interest bridge`});
  for (const [family, tolerance] of Object.entries(input.tolerance)) {
    const issue = tolerancePolicyIssue(family, tolerance, input.unit);
    if (issue) context.addIssue({code: "custom", path: ["tolerance", family], message: issue});
  }
  const ids = new Set<string>();
  input.pairedAccounts.forEach((account, index) => {
    if (ids.has(account.id)) context.addIssue({code: "custom", path: ["pairedAccounts", index, "id"], message: `duplicate account ${account.id}`});
    ids.add(account.id);
    const sources = new Set<string>();
    account.sources.forEach((source, position) => {
      if (sources.has(source.source)) context.addIssue({code: "custom", path: ["pairedAccounts", index, "sources", position], message: `duplicate source ${source.source} in ${account.id}`});
      sources.add(source.source);
      // The components a source declares must be readable in its definition text; a tag the text never names is a label.
      const text = normalize(source.definition);
      for (const component of source.components) {
        const words = COMPONENT_WORDS[component];
        if (!words) { context.addIssue({code: "custom", path: ["pairedAccounts", index, "sources", position, "components"], message: `${account.id}/${source.source}: unknown component tag ${component}; the known tags are ${knownComponents.join(", ")}`}); continue; }
        if (!words.test(text)) context.addIssue({code: "custom", path: ["pairedAccounts", index, "sources", position, "components"], message: `${account.id}/${source.source}: the definition text never names the component ${component}`});
      }
      if (source.stated) {
        const converted = new Decimal(source.stated.value).times(SCALE[source.stated.unit]).div(SCALE[input.unit as z.infer<typeof scaleUnits>] ?? "1");
        if (!converted.eq(source.value)) context.addIssue({code: "custom", path: ["pairedAccounts", index, "sources", position, "stated"], message: `${account.id}/${source.source}: ${source.stated.value} ${source.stated.unit} converts to ${converted.toFixed()} ${input.unit}, not ${source.value}`});
      }
      if (source.derivation) {
        const operands = source.derivation.operands.map((operand) => new Decimal(operand.value));
        const recomputed = source.derivation.formula === "sum" ? operands.reduce((sum, value) => sum.plus(value), new Decimal(0)) : operands.slice(1).reduce((left, value) => left.minus(value), operands[0]!);
        if (!recomputed.eq(source.value)) context.addIssue({code: "custom", path: ["pairedAccounts", index, "sources", position, "derivation"], message: `${account.id}/${source.source}: the derivation gives ${recomputed.toFixed()}, not ${source.value}`});
      }
    });
    const links = new Set<string>();
    account.explanations.forEach((explanation, position) => {
      if (!sources.has(explanation.fromSource) || !sources.has(explanation.toSource)) context.addIssue({code: "custom", path: ["pairedAccounts", index, "explanations", position], message: `an explanation of ${account.id} names a source the account does not have`});
      if (explanation.fromSource === explanation.toSource) context.addIssue({code: "custom", path: ["pairedAccounts", index, "explanations", position], message: `an explanation of ${account.id} must go from one source to another`});
      const link = `${explanation.fromSource}->${explanation.toSource}`;
      if (links.has(link)) context.addIssue({code: "custom", path: ["pairedAccounts", index, "explanations", position], message: `${account.id}: two explanations link ${link}; one adjustment per pair of sources`});
      links.add(link);
    });
  });
  const lineIds = new Set<string>();
  input.debtBridge?.lines.forEach((line, index) => {
    if (lineIds.has(line.id)) context.addIssue({code: "custom", path: ["debtBridge", "lines", index], message: `duplicate bridge line ${line.id}`});
    lineIds.add(line.id);
  });
});
export type ReconciliationInput = z.input<typeof reconciliationInputSchema>;

type PairState = "closes" | "explained" | "open" | "not_comparable" | "single_source";
type Calculation = {id: string; formula: string; operands: Record<string, string>; anchors: Record<string, Anchor>; result: string; unit: string};

export type ReconciliationOutput = {
  schema_version: "method.reconcile-financial-statements.v8";
  reference_date: string;
  unit: string;
  state: "closes" | "differences_explained" | "open_divergences" | "identity_failed" | "incomplete" | "blocked";
  block_reasons: string[];
  incomplete_reasons: string[];
  reconciliations: Array<{
    id: string; label: string; family: string;
    values: Array<{source: string; value: string; stated: {value: string; unit: string; decimals: number; roundingHalfBand: string} | null; sign: string; definition: string; definitionKey: string; definitionAnchor: Anchor; components: string[]; asOf: string; anchor: Anchor}>;
    comparability: {comparable: boolean; reasons: string[]};
    spread: string | null;
    /** The coarser published rounding among the sources (half of the last published digit, in the executor's unit); a spread inside it closes within the published rounding, never exactly. */
    rounding_half_band: string | null;
    tolerance: {value: string; policyKey: string | null; policyVersion: string | null};
    state: PairState;
    closes_within: "tolerance" | "published_rounding" | null;
    explanations: Array<{fromSource: string; toSource: string; adjustment: string; expected: string; actual: string; residual: string; holds: boolean; description: string; anchor: Anchor}>;
    /** Sources connected by explanations that hold; more than one group means the account is not explained as a whole. */
    explanation_groups: string[][];
    unexplained_sources: string[];
    /** Inside an account that is not comparable as a whole: the sources that share definition, components and date, compared among themselves. */
    comparable_subsets: Array<{definitionKey: string; components: string[]; asOf: string; sources: string[]; spread: string; state: "closes" | "open"}>;
  }>;
  open_divergences: Array<{id: string; label: string; values: Array<{source: string; value: string; anchor: Anchor}>; reason: string}>;
  identities: Array<{id: string; formula: string; left: string; right: string; difference: string; holds: boolean | null; state: "holds" | "fails" | "not_comparable"; anchors: Record<string, Anchor>}>;
  uncovered_terms: Array<{id: string; state: "insufficient_evidence"; reason: string}>;
  trace: {calculations: Calculation[]; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => compare(a, b))) : inner));
const fingerprint = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");
const sortStrings = (values: readonly string[]) => [...values].sort(compare);

function canonical(input: z.infer<typeof reconciliationInputSchema>) {
  return {
    ...input,
    pairedAccounts: [...input.pairedAccounts].sort((a, b) => compare(a.id, b.id)).map((account) => ({...account, sources: [...account.sources].sort((a, b) => compare(a.source, b.source)).map((source) => ({...source, components: sortStrings(source.components)})), explanations: [...account.explanations].sort((a, b) => compare(a.fromSource, b.fromSource) || compare(a.toSource, b.toSource) || compare(a.adjustment, b.adjustment) || compare(a.description, b.description) || compare(stableStringify(a.anchor), stableStringify(b.anchor)))})),
    debtBridge: input.debtBridge ? {...input.debtBridge, lines: [...input.debtBridge.lines].sort((a, b) => compare(a.id, b.id))} : null,
    interestBridge: input.interestBridge ? {fromDebtMovement: {...input.interestBridge.fromDebtMovement, components: sortStrings(input.interestBridge.fromDebtMovement.components)}, fromIncomeStatement: {...input.interestBridge.fromIncomeStatement, components: sortStrings(input.interestBridge.fromIncomeStatement.components)}} : null,
  };
}

export function reconcileFinancialStatements(raw: ReconciliationInput): ReconciliationOutput {
  const input = canonical(reconciliationInputSchema.parse(raw));
  const calculations: Calculation[] = [];
  const record = (calculation: Omit<Calculation, "unit" | "anchors"> & {anchors?: Record<string, Anchor>}) => calculations.push({...calculation, anchors: calculation.anchors ?? {}, unit: input.unit});
  const blockReasons: string[] = [];
  const incompleteReasons: string[] = [];
  const uncovered: ReconciliationOutput["uncovered_terms"] = [];
  const toleranceOf = (family: string) => {
    const tolerance = input.tolerance[family];
    return tolerance ? {value: tolerance.value, policyKey: tolerance.policyKey ?? null, policyVersion: tolerance.policyVersion ?? null} : {value: "0", policyKey: null, policyVersion: null};
  };
  if (input.pairedAccounts.length === 0 && !input.balanceSheet && !input.debtBridge && !input.cashBridge && !input.interestBridge) blockReasons.push("nothing to reconcile: no paired account, identity or bridge in the base");

  const reconciliations = input.pairedAccounts.map((account): ReconciliationOutput["reconciliations"][number] => {
    const tolerance = toleranceOf(account.family);
    const halfBand = (source: (typeof account.sources)[number]) => (source.stated ? d(10).pow(-source.stated.decimals).div(2).times(SCALE[source.stated.unit]).div(SCALE[input.unit as z.infer<typeof scaleUnits>] ?? "1") : d(0));
    const values = account.sources.map((source) => ({source: source.source, value: out(d(source.value)), stated: source.stated ? {value: source.stated.value, unit: source.stated.unit, decimals: source.stated.decimals, roundingHalfBand: out(halfBand(source))} : null, sign: source.sign, definition: source.definition, definitionKey: source.definitionKey, definitionAnchor: source.definitionAnchor, components: source.components, asOf: source.asOf, anchor: source.anchor}));
    const roundingBand = account.sources.reduce((widest, source) => Decimal.max(widest, halfBand(source)), d(0));
    for (const source of account.sources.filter((entry) => entry.stated)) record({id: `financial.scale_conversion:${account.id}:${source.source}`, formula: "stated value * stated scale / executor scale; rounding half band = 10^-decimals / 2 * stated scale / executor scale", operands: {stated: source.stated!.value, statedUnit: source.stated!.unit, decimals: String(source.stated!.decimals), converted: source.value, roundingHalfBand: out(halfBand(source))}, anchors: {source: source.anchor}, result: source.value});
    if (account.sources.length === 1) {
      uncovered.push({id: account.id, state: "insufficient_evidence", reason: `${account.label} has a single source (${account.sources[0]!.source}); recorded, not reconciled`});
      return {id: account.id, label: account.label, family: account.family, values, comparability: {comparable: false, reasons: ["single source"]}, spread: null, rounding_half_band: null, tolerance, state: "single_source", closes_within: null, explanations: [], explanation_groups: [[account.sources[0]!.source]], unexplained_sources: [], comparable_subsets: []};
    }
    // Comparability is decided on the definition key, the components and the date, never on the name of the account.
    const reasons: string[] = [];
    if (new Set(account.sources.map((source) => source.definitionKey)).size > 1) reasons.push(`the sources follow different definitions (${account.sources.map((source) => `${source.source}: ${source.definitionKey}`).join("; ")})`);
    if (new Set(account.sources.map((source) => source.components.join("+"))).size > 1) reasons.push(`the sources count different components (${account.sources.map((source) => `${source.source}: ${source.components.join(", ")}`).join("; ")})`);
    if (new Set(account.sources.map((source) => source.asOf)).size > 1) reasons.push(`the sources are dated differently (${account.sources.map((source) => `${source.source}: ${source.asOf}`).join("; ")})`);
    if (new Set(account.sources.map((source) => source.periodMonths)).size > 1) reasons.push(`the sources cover different spans (${account.sources.map((source) => `${source.source}: ${source.periodMonths} months`).join("; ")}); a quarter and a twelve-month figure never compare, whatever their keys`);
    const numbers = account.sources.map((source) => d(source.value));
    const spreadCheck = checkIdentity({id: `${account.id}:spread`, left: Decimal.max(...numbers), right: Decimal.min(...numbers), absoluteTolerance: tolerance.value});
    const spread = d(spreadCheck.difference);
    record({id: `financial.accounting_identity:${account.id}:spread`, formula: "max(values) - min(values)", operands: Object.fromEntries(account.sources.map((source) => [source.source, source.value])), anchors: Object.fromEntries(account.sources.map((source) => [source.source, source.anchor])), result: spreadCheck.difference});
    for (const source of account.sources.filter((entry) => entry.derivation)) record({id: `financial.accounting_identity:${account.id}:${source.source}:derivation`, formula: source.derivation!.formula === "sum" ? "sum(operands)" : "first - rest", operands: Object.fromEntries(source.derivation!.operands.map((operand) => [operand.label, operand.value])), anchors: Object.fromEntries(source.derivation!.operands.map((operand) => [operand.label, operand.anchor])), result: source.value});
    // Sources that share a definition, components and date are comparable among themselves even when the account as a whole is not.
    const subsetKey = (source: (typeof account.sources)[number]) => `${source.definitionKey}|${source.components.join("+")}|${source.asOf}|${source.periodMonths}`;
    const subsets = [...new Set(account.sources.map(subsetKey))].map((key) => account.sources.filter((source) => subsetKey(source) === key)).filter((group) => group.length > 1).map((group) => {
      const values = group.map((source) => d(source.value));
      const groupBand = group.reduce((widest, source) => Decimal.max(widest, halfBand(source)), d(0));
      const check = checkIdentity({id: `${account.id}:subset:${group[0]!.definitionKey}`, left: Decimal.max(...values), right: Decimal.min(...values), absoluteTolerance: Decimal.max(d(tolerance.value), groupBand).toFixed()});
      record({id: `financial.accounting_identity:${account.id}:subset:${group[0]!.definitionKey}`, formula: "max(values) - min(values) among sources sharing definition, components and date", operands: Object.fromEntries(group.map((source) => [source.source, source.value])), anchors: Object.fromEntries(group.map((source) => [source.source, source.anchor])), result: check.difference});
      return {definitionKey: group[0]!.definitionKey, components: group[0]!.components, asOf: group[0]!.asOf, sources: group.map((source) => source.source).sort(compare), spread: check.difference, state: check.status === "pass" ? "closes" as const : "open" as const};
    }).sort((a, b) => compare(a.definitionKey, b.definitionKey));
    // Each explanation is directional; an account is explained only when every source is connected by explanations that hold.
    const valueOf = new Map(account.sources.map((source) => [source.source, d(source.value)]));
    const explanations = account.explanations.map((explanation) => {
      const expected = valueOf.get(explanation.fromSource)!.plus(explanation.adjustment);
      const actual = valueOf.get(explanation.toSource)!;
      const pairBand = Decimal.max(halfBand(account.sources.find((source) => source.source === explanation.fromSource)!), halfBand(account.sources.find((source) => source.source === explanation.toSource)!));
      const check = checkIdentity({id: `${account.id}:${explanation.fromSource}->${explanation.toSource}`, left: actual, right: expected, absoluteTolerance: Decimal.max(d(tolerance.value), pairBand).toFixed()});
      record({id: `financial.accounting_identity:${account.id}:explanation:${explanation.fromSource}->${explanation.toSource}`, formula: "to - (from + adjustment)", operands: {from: out(valueOf.get(explanation.fromSource)!), adjustment: explanation.adjustment, to: out(actual)}, anchors: {from: account.sources.find((source) => source.source === explanation.fromSource)!.anchor, adjustment: explanation.anchor, to: account.sources.find((source) => source.source === explanation.toSource)!.anchor}, result: check.difference});
      return {fromSource: explanation.fromSource, toSource: explanation.toSource, adjustment: explanation.adjustment, expected: out(expected), actual: out(actual), residual: check.difference, holds: check.status === "pass", description: explanation.description, anchor: explanation.anchor};
    });
    const parent = new Map(account.sources.map((source) => [source.source, source.source]));
    const find = (node: string): string => (parent.get(node) === node ? node : find(parent.get(node)!));
    for (const explanation of explanations.filter((entry) => entry.holds)) parent.set(find(explanation.fromSource), find(explanation.toSource));
    const roots = new Set(account.sources.map((source) => find(source.source)));
    // The connected groups of sources; more than one group means the account is not explained as a whole and no source is hidden.
    const groups = [...roots].map((root) => account.sources.map((source) => source.source).filter((source) => find(source) === root).sort(compare)).sort((a, b) => compare(a[0]!, b[0]!));
    const unexplained = roots.size > 1 ? account.sources.map((source) => source.source) : [];
    // An explanation exists to bridge presentations that count different things; it never bridges different dates, and without one the pair is not comparable.
    // An explanation bridges presentations, never dates and never spans: sources of different dates or different months are not comparable whatever the adjustment.
    const datesDiffer = reasons.some((reason) => reason.startsWith("the sources are dated differently") || reason.startsWith("the sources cover different spans"));
    if (datesDiffer || (reasons.length > 0 && explanations.length === 0)) {
      return {id: account.id, label: account.label, family: account.family, values, comparability: {comparable: false, reasons}, spread: out(spread), rounding_half_band: out(roundingBand), tolerance, state: "not_comparable", closes_within: null, explanations, explanation_groups: groups, unexplained_sources: account.sources.map((source) => source.source), comparable_subsets: subsets};
    }
    let state: PairState;
    let closesWithin: "tolerance" | "published_rounding" | null = null;
    // A spread that fits the published rounding closes by that rounding, whatever the policy tolerance; the tolerance answers only beyond the rounding.
    if (roundingBand.gt(0) && spread.lte(roundingBand) && reasons.length === 0) { state = "closes"; closesWithin = "published_rounding"; }
    else if (spread.lte(tolerance.value) && reasons.length === 0) { state = "closes"; closesWithin = "tolerance"; }
    else if (explanations.length > 0 && roots.size === 1) state = "explained";
    else state = "open";
    // A pair that closes as a whole has no open subset: the subsets exist to compare inside an account that does not close as a whole.
    return {id: account.id, label: account.label, family: account.family, values, comparability: {comparable: reasons.length === 0, reasons}, spread: out(spread), rounding_half_band: out(roundingBand), tolerance, state, closes_within: closesWithin, explanations, explanation_groups: groups, unexplained_sources: state === "open" ? (unexplained.length > 0 ? unexplained : account.sources.map((source) => source.source)) : [], comparable_subsets: state === "closes" ? [] : subsets};
  });

  const identities: ReconciliationOutput["identities"] = [];
  const identity = (id: string, formula: string, left: Decimal.Value, right: Decimal.Value, family: string, anchors: Record<string, Anchor>) => {
    const result = checkIdentity({id, left, right, absoluteTolerance: toleranceOf(family).value});
    record({id: `financial.accounting_identity:${id}`, formula, operands: {left: result.left, right: result.right, tolerance: result.tolerance}, anchors, result: result.difference});
    identities.push({id, formula, left: result.left, right: result.right, difference: result.difference, holds: result.status === "pass", state: result.status === "pass" ? "holds" : "fails", anchors});
  };
  const absent = (id: string, reason: string) => { incompleteReasons.push(reason); uncovered.push({id, state: "insufficient_evidence", reason}); };
  if (input.balanceSheet) identity("balance_sheet", "assets = liabilities + equity", input.balanceSheet.assets.value, d(input.balanceSheet.liabilities.value).plus(input.balanceSheet.equity.value), "balance_sheet", {assets: input.balanceSheet.assets.anchor, liabilities: input.balanceSheet.liabilities.anchor, equity: input.balanceSheet.equity.anchor});
  else absent("balance_sheet", "the balance sheet identity was not tested: assets, liabilities and equity are not in the base");
  if (input.debtBridge) {
    const byCategory: Record<string, Decimal> = {};
    const lineValue = (line: (typeof input.debtBridge.lines)[number]) => (line.sign === "absolute" ? d(line.published).abs() : d(line.published));
    for (const line of input.debtBridge.lines) byCategory[line.category] = (byCategory[line.category] ?? d(0)).plus(lineValue(line));
    const bridge = buildDebtBalanceBridge({openingBalance: input.debtBridge.opening.value, ...Object.fromEntries(Object.entries(byCategory).map(([category, value]) => [category, out(value)]))});
    record({id: "financial.debt_balance_bridge", formula: "opening + additions - reductions; each line read as published or as a magnitude, as declared", operands: {opening: input.debtBridge.opening.value, ...Object.fromEntries(input.debtBridge.lines.flatMap((line) => [[`${line.id}:published`, line.published], [`${line.id}:read`, out(lineValue(line))], [`${line.id}:sign`, line.sign]]))}, anchors: {opening: input.debtBridge.opening.anchor, ...Object.fromEntries(input.debtBridge.lines.map((line) => [line.id, line.anchor]))}, result: bridge.value});
    identity("debt_bridge", "opening + movements = closing", bridge.value, input.debtBridge.closing.value, "debt", {note: input.debtBridge.anchor, opening: input.debtBridge.opening.anchor, closing: input.debtBridge.closing.anchor, ...Object.fromEntries(input.debtBridge.lines.map((line) => [line.id, line.anchor]))});
  } else absent("debt_bridge", "the debt roll-forward was not tested: the note's movement is not in the base");
  if (input.cashBridge) identity("cash_bridge", "opening + net change = closing", d(input.cashBridge.opening.value).plus(input.cashBridge.netChange.value), input.cashBridge.closing.value, "cash", {opening: input.cashBridge.opening.anchor, netChange: input.cashBridge.netChange.anchor, closing: input.cashBridge.closing.anchor});
  else absent("cash_bridge", "the cash bridge was not tested: opening, net change and closing are not in the base");
  if (input.interestBridge) {
    const left = input.interestBridge.fromDebtMovement;
    const right = input.interestBridge.fromIncomeStatement;
    const sameComponents = sortStrings(left.components).join("+") === sortStrings(right.components).join("+");
    // The sign the source prints is kept unless the caller declares a magnitude reading; the normalization is traced, never silent.
    const leftValue = left.sign === "absolute" ? d(left.value).abs() : d(left.value);
    const rightValue = right.sign === "absolute" ? d(right.value).abs() : d(right.value);
    const bridge = checkIdentity({id: "interest_bridge", left: leftValue, right: rightValue, absoluteTolerance: toleranceOf("interest").value});
    record({id: "financial.interest_expense_bridge", formula: "accrued interest in the debt movement - interest expense in the income statement, each read as published or as a magnitude as declared", operands: {fromDebtMovementPublished: left.value, fromDebtMovementRead: out(leftValue), fromDebtMovementSign: left.sign, fromIncomeStatementPublished: right.value, fromIncomeStatementRead: out(rightValue), fromIncomeStatementSign: right.sign, tolerance: bridge.tolerance, comparable: String(sameComponents)}, anchors: {fromDebtMovement: left.anchor, fromIncomeStatement: right.anchor}, result: bridge.difference});
    const anchors = {fromDebtMovement: left.anchor, fromIncomeStatement: right.anchor};
    if (sameComponents) identities.push({id: "interest_bridge", formula: "accrued interest (note) = interest expense (income statement)", left: bridge.left, right: bridge.right, difference: bridge.difference, holds: bridge.status === "pass", state: bridge.status === "pass" ? "holds" : "fails", anchors});
    else {
      identities.push({id: "interest_bridge", formula: "accrued interest (note) = interest expense (income statement)", left: bridge.left, right: bridge.right, difference: bridge.difference, holds: null, state: "not_comparable", anchors});
      uncovered.push({id: "interest_bridge", state: "insufficient_evidence", reason: `the note's figure counts ${left.components.join(", ")} and the income statement's counts ${right.components.join(", ")}; the difference of ${bridge.difference} is recorded, not bridged`});
    }
  } else absent("interest_bridge", "the interest expense bridge was not tested: the note's accrued interest or the income statement's expense is not in the base");

  const openDivergences = [
    ...reconciliations.filter((entry) => entry.state === "open" || entry.state === "not_comparable").map((entry) => ({
      id: entry.id, label: entry.label,
      values: entry.values.filter((value) => entry.unexplained_sources.includes(value.source)).map((value) => ({source: value.source, value: value.value, anchor: value.anchor})),
      reason: entry.state === "not_comparable"
        ? `the sources are not comparable: ${entry.comparability.reasons.join("; ")}; carried as a divergence, no value chosen${entry.comparable_subsets.length > 0 ? `; among themselves, ${entry.comparable_subsets.map((subset) => `${subset.sources.join(" and ")} (${subset.definitionKey}) differ by ${subset.spread} and ${subset.state === "closes" ? "close" : "stay open"}`).join("; ")}` : ""}`
        : entry.explanations.length > 0 ? `the stated adjustments leave ${entry.unexplained_sources.join(", ")} unexplained${entry.explanations.filter((explanation) => !explanation.holds).map((explanation) => ` (from ${explanation.fromSource} to ${explanation.toSource}: residual ${explanation.residual})`).join("")}` : `sources differ by ${entry.spread} with no explanation in the base; carried as a divergence, no value chosen`,
    })),
    ...reconciliations.flatMap((entry) => entry.comparable_subsets.filter((subset) => subset.state === "open").map((subset) => ({
      id: `${entry.id}:${subset.definitionKey}`, label: `${entry.label} (${subset.definitionKey})`,
      values: entry.values.filter((value) => subset.sources.includes(value.source)).map((value) => ({source: value.source, value: value.value, anchor: value.anchor})),
      reason: `${subset.sources.join(" and ")} state the same thing (${subset.definitionKey}, ${subset.components.join("+")}, ${subset.asOf}) and differ by ${subset.spread}; carried as a divergence, no value chosen`,
    }))),
  ];
  const state: ReconciliationOutput["state"] = blockReasons.length > 0 ? "blocked"
    : identities.some((entry) => entry.state === "fails") ? "identity_failed"
    : incompleteReasons.length > 0 ? "incomplete"
    : openDivergences.length > 0 ? "open_divergences"
    : reconciliations.some((entry) => entry.state === "explained") ? "differences_explained" : "closes";
  const body = {
    schema_version: "method.reconcile-financial-statements.v8" as const, reference_date: input.referenceDate, unit: input.unit, state,
    block_reasons: blockReasons, incomplete_reasons: incompleteReasons, reconciliations, open_divergences: openDivergences, identities, uncovered_terms: uncovered,
  };
  const inputFingerprint = fingerprint(input);
  return {...body, trace: {calculations, inputFingerprint, outputFingerprint: fingerprint({...body, calculations, inputFingerprint})}};
}
