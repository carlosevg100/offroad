import {createHash} from "node:crypto";

import {buildDebtBalanceBridge, checkIdentity} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

import {referenceDataRegistry} from "../reference-data";

/**
 * Executor of the method `reconcile-financial-statements` (v3, after the second independent review).
 * Proves that material numbers close between statements, notes and release, runs the identities
 * through financial-core, and keeps every difference above the tolerance as an open divergence
 * with its anchors. Two sources that disagree are never averaged and never silently resolved. Two
 * sources are compared only when they count the same components at the same date; otherwise the
 * pair is `not_comparable`, which is not `closes`. An explanation names the source it starts from
 * and the source it reaches, with the sign preserved. A tolerance above zero exists only under a
 * versioned policy. A single-source account is recorded, never compared. An empty base blocks.
 */
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const nonNegative = z.string().regex(/^\d+(\.\d+)?$/);
const nonEmpty = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const unitSchema = z.enum(["BRL", "BRL thousand", "BRL million", "USD", "USD thousand"]);
const anchorSchema = z.object({document: nonEmpty, page: z.number().int().positive().optional(), note: nonEmpty.optional(), table: nonEmpty.optional(), clause: nonEmpty.optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const toleranceSchema = z.object({value: nonNegative, policyKey: nonEmpty.optional(), policyVersion: nonEmpty.optional()}).strict().superRefine((tolerance, context) => {
  if (new Decimal(tolerance.value).isZero()) return;
  if (!tolerance.policyKey || !tolerance.policyVersion) { context.addIssue({code: "custom", path: ["policyKey"], message: "a tolerance above zero needs policyKey and policyVersion"}); return; }
  const policy = referenceDataRegistry.find((entry) => entry.key === tolerance.policyKey);
  if (!policy) { context.addIssue({code: "custom", path: ["policyKey"], message: `policy ${tolerance.policyKey} is not in the reference-data registry`}); return; }
  if (policy.version !== tolerance.policyVersion) context.addIssue({code: "custom", path: ["policyVersion"], message: `policy ${tolerance.policyKey} is at version ${policy.version}, not ${tolerance.policyVersion}`});
  if (policy.status === "required_missing") context.addIssue({code: "custom", path: ["policyKey"], message: `policy ${tolerance.policyKey} has no value yet; a tolerance above zero cannot rest on it`});
});

export const statementSourceSchema = z.object({
  source: nonEmpty,
  value: money,
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
  balanceSheet: z.object({assets: money, liabilities: money, equity: money, anchor: anchorSchema}).strict().nullable().default(null),
  /** Debt roll-forward from the note: opening plus movements equals closing. */
  debtBridge: z.object({
    opening: money,
    lines: z.array(z.object({id: nonEmpty, label: nonEmpty, value: money, category: z.enum(["drawdowns", "accruedInterest", "pik", "indexation", "foreignExchange", "acquisitions", "otherAdditions", "amortizations", "prepayments", "writeOffs"])}).strict()).min(1),
    closing: money,
    anchor: anchorSchema,
  }).strict().nullable().default(null),
  /** Cash roll-forward: opening plus net change equals closing. */
  cashBridge: z.object({opening: z.object({value: money, anchor: anchorSchema}).strict(), netChange: z.object({value: money, anchor: anchorSchema}).strict(), closing: z.object({value: money, anchor: anchorSchema}).strict()}).strict().nullable().default(null),
  /** Interest expense: the note's accrued interest against the income statement's expense; the difference is recorded, never hidden. */
  interestBridge: z.object({fromDebtMovement: z.object({value: money, components: z.array(nonEmpty).min(1), anchor: anchorSchema}).strict(), fromIncomeStatement: z.object({value: money, components: z.array(nonEmpty).min(1), anchor: anchorSchema}).strict()}).strict().nullable().default(null),
}).strict().superRefine((input, context) => {
  const ids = new Set<string>();
  input.pairedAccounts.forEach((account, index) => {
    if (ids.has(account.id)) context.addIssue({code: "custom", path: ["pairedAccounts", index, "id"], message: `duplicate account ${account.id}`});
    ids.add(account.id);
    const sources = new Set<string>();
    account.sources.forEach((source, position) => {
      if (sources.has(source.source)) context.addIssue({code: "custom", path: ["pairedAccounts", index, "sources", position], message: `duplicate source ${source.source} in ${account.id}`});
      sources.add(source.source);
    });
    account.explanations.forEach((explanation, position) => {
      if (!sources.has(explanation.fromSource) || !sources.has(explanation.toSource)) context.addIssue({code: "custom", path: ["pairedAccounts", index, "explanations", position], message: `an explanation of ${account.id} names a source the account does not have`});
      if (explanation.fromSource === explanation.toSource) context.addIssue({code: "custom", path: ["pairedAccounts", index, "explanations", position], message: `an explanation of ${account.id} must go from one source to another`});
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
type Calculation = {id: string; formula: string; operands: Record<string, string>; result: string; unit: string};

export type ReconciliationOutput = {
  schema_version: "method.reconcile-financial-statements.v3";
  reference_date: string;
  unit: string;
  state: "closes" | "differences_explained" | "open_divergences" | "identity_failed" | "incomplete" | "blocked";
  block_reasons: string[];
  incomplete_reasons: string[];
  reconciliations: Array<{
    id: string; label: string; family: string;
    values: Array<{source: string; value: string; definition: string; definitionKey: string; definitionAnchor: Anchor; components: string[]; asOf: string; anchor: Anchor}>;
    comparability: {comparable: boolean; reasons: string[]};
    spread: string | null;
    tolerance: {value: string; policyKey: string | null; policyVersion: string | null};
    state: PairState;
    explanations: Array<{fromSource: string; toSource: string; adjustment: string; expected: string; actual: string; residual: string; holds: boolean; description: string; anchor: Anchor}>;
    /** Sources connected by explanations that hold; more than one group means the account is not explained as a whole. */
    explanation_groups: string[][];
    unexplained_sources: string[];
  }>;
  open_divergences: Array<{id: string; label: string; values: Array<{source: string; value: string; anchor: Anchor}>; reason: string}>;
  identities: Array<{id: string; formula: string; left: string; right: string; difference: string; holds: boolean | null; state: "holds" | "fails" | "not_comparable"; anchor: Anchor}>;
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
    pairedAccounts: [...input.pairedAccounts].sort((a, b) => compare(a.id, b.id)).map((account) => ({...account, sources: [...account.sources].sort((a, b) => compare(a.source, b.source)).map((source) => ({...source, components: sortStrings(source.components)})), explanations: [...account.explanations].sort((a, b) => compare(a.fromSource, b.fromSource) || compare(a.toSource, b.toSource) || compare(a.adjustment, b.adjustment))})),
    debtBridge: input.debtBridge ? {...input.debtBridge, lines: [...input.debtBridge.lines].sort((a, b) => compare(a.id, b.id))} : null,
  };
}

export function reconcileFinancialStatements(raw: ReconciliationInput): ReconciliationOutput {
  const input = canonical(reconciliationInputSchema.parse(raw));
  const calculations: Calculation[] = [];
  const record = (calculation: Omit<Calculation, "unit">) => calculations.push({...calculation, unit: input.unit});
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
    const values = account.sources.map((source) => ({source: source.source, value: out(d(source.value)), definition: source.definition, definitionKey: source.definitionKey, definitionAnchor: source.definitionAnchor, components: source.components, asOf: source.asOf, anchor: source.anchor}));
    if (account.sources.length === 1) {
      uncovered.push({id: account.id, state: "insufficient_evidence", reason: `${account.label} has a single source (${account.sources[0]!.source}); recorded, not reconciled`});
      return {id: account.id, label: account.label, family: account.family, values, comparability: {comparable: false, reasons: ["single source"]}, spread: null, tolerance, state: "single_source", explanations: [], explanation_groups: [[account.sources[0]!.source]], unexplained_sources: []};
    }
    // Comparability is decided on the definition key, the components and the date, never on the name of the account.
    const reasons: string[] = [];
    if (new Set(account.sources.map((source) => source.definitionKey)).size > 1) reasons.push(`the sources follow different definitions (${account.sources.map((source) => `${source.source}: ${source.definitionKey}`).join("; ")})`);
    if (new Set(account.sources.map((source) => source.components.join("+"))).size > 1) reasons.push(`the sources count different components (${account.sources.map((source) => `${source.source}: ${source.components.join(", ")}`).join("; ")})`);
    if (new Set(account.sources.map((source) => source.asOf)).size > 1) reasons.push(`the sources are dated differently (${account.sources.map((source) => `${source.source}: ${source.asOf}`).join("; ")})`);
    const numbers = account.sources.map((source) => d(source.value));
    const spread = Decimal.max(...numbers).minus(Decimal.min(...numbers));
    record({id: `financial.accounting_identity:${account.id}:spread`, formula: "max(values) - min(values)", operands: Object.fromEntries(account.sources.map((source) => [source.source, source.value])), result: out(spread)});
    // Each explanation is directional; an account is explained only when every source is connected by explanations that hold.
    const valueOf = new Map(account.sources.map((source) => [source.source, d(source.value)]));
    const explanations = account.explanations.map((explanation) => {
      const expected = valueOf.get(explanation.fromSource)!.plus(explanation.adjustment);
      const actual = valueOf.get(explanation.toSource)!;
      const residual = actual.minus(expected);
      record({id: `financial.accounting_identity:${account.id}:explanation:${explanation.fromSource}->${explanation.toSource}`, formula: "to - (from + adjustment)", operands: {from: out(valueOf.get(explanation.fromSource)!), adjustment: explanation.adjustment, to: out(actual)}, result: out(residual)});
      return {fromSource: explanation.fromSource, toSource: explanation.toSource, adjustment: explanation.adjustment, expected: out(expected), actual: out(actual), residual: out(residual), holds: residual.abs().lte(tolerance.value), description: explanation.description, anchor: explanation.anchor};
    });
    const parent = new Map(account.sources.map((source) => [source.source, source.source]));
    const find = (node: string): string => (parent.get(node) === node ? node : find(parent.get(node)!));
    for (const explanation of explanations.filter((entry) => entry.holds)) parent.set(find(explanation.fromSource), find(explanation.toSource));
    const roots = new Set(account.sources.map((source) => find(source.source)));
    // The connected groups of sources; more than one group means the account is not explained as a whole and no source is hidden.
    const groups = [...roots].map((root) => account.sources.map((source) => source.source).filter((source) => find(source) === root).sort(compare)).sort((a, b) => compare(a[0]!, b[0]!));
    const unexplained = roots.size > 1 ? account.sources.map((source) => source.source) : [];
    if (reasons.length > 0 && explanations.length === 0) {
      return {id: account.id, label: account.label, family: account.family, values, comparability: {comparable: false, reasons}, spread: out(spread), tolerance, state: "not_comparable", explanations, explanation_groups: groups, unexplained_sources: account.sources.map((source) => source.source)};
    }
    let state: PairState;
    if (spread.lte(tolerance.value) && reasons.length === 0) state = "closes";
    else if (explanations.length > 0 && roots.size === 1) state = "explained";
    else state = "open";
    return {id: account.id, label: account.label, family: account.family, values, comparability: {comparable: reasons.length === 0, reasons}, spread: out(spread), tolerance, state, explanations, explanation_groups: groups, unexplained_sources: state === "open" ? (unexplained.length > 0 ? unexplained : account.sources.map((source) => source.source)) : []};
  });

  const identities: ReconciliationOutput["identities"] = [];
  const identity = (id: string, formula: string, left: Decimal.Value, right: Decimal.Value, family: string, anchor: Anchor) => {
    const result = checkIdentity({id, left, right, absoluteTolerance: toleranceOf(family).value});
    record({id: `financial.accounting_identity:${id}`, formula, operands: {left: result.left, right: result.right, tolerance: result.tolerance}, result: result.difference});
    identities.push({id, formula, left: result.left, right: result.right, difference: result.difference, holds: result.status === "pass", state: result.status === "pass" ? "holds" : "fails", anchor});
  };
  const absent = (id: string, reason: string) => { if (blockReasons.length === 0) { incompleteReasons.push(reason); uncovered.push({id, state: "insufficient_evidence", reason}); } };
  if (input.balanceSheet) identity("balance_sheet", "assets = liabilities + equity", input.balanceSheet.assets, d(input.balanceSheet.liabilities).plus(input.balanceSheet.equity), "balance_sheet", input.balanceSheet.anchor);
  else absent("balance_sheet", "the balance sheet identity was not tested: assets, liabilities and equity are not in the base");
  if (input.debtBridge) {
    const byCategory: Record<string, Decimal> = {};
    for (const line of input.debtBridge.lines) byCategory[line.category] = (byCategory[line.category] ?? d(0)).plus(line.value);
    const bridge = buildDebtBalanceBridge({openingBalance: input.debtBridge.opening, ...Object.fromEntries(Object.entries(byCategory).map(([category, value]) => [category, out(value)]))});
    record({id: "financial.debt_balance_bridge", formula: "opening + additions - reductions", operands: Object.fromEntries(bridge.lines.map((line) => [line.id, line.value])), result: bridge.value});
    identity("debt_bridge", "opening + movements = closing", bridge.value, input.debtBridge.closing, "debt", input.debtBridge.anchor);
  } else absent("debt_bridge", "the debt roll-forward was not tested: the note's movement is not in the base");
  if (input.cashBridge) identity("cash_bridge", "opening + net change = closing", d(input.cashBridge.opening.value).plus(input.cashBridge.netChange.value), input.cashBridge.closing.value, "cash", input.cashBridge.netChange.anchor);
  else absent("cash_bridge", "the cash bridge was not tested: opening, net change and closing are not in the base");
  if (input.interestBridge) {
    const left = input.interestBridge.fromDebtMovement;
    const right = input.interestBridge.fromIncomeStatement;
    const difference = d(left.value).minus(right.value);
    const sameComponents = sortStrings(left.components).join("+") === sortStrings(right.components).join("+");
    record({id: "financial.interest_expense_bridge", formula: "accrued interest in the debt movement - interest expense in the income statement", operands: {fromDebtMovement: left.value, fromIncomeStatement: right.value, comparable: String(sameComponents)}, result: out(difference)});
    if (sameComponents) identities.push({id: "interest_bridge", formula: "accrued interest (note) = interest expense (income statement)", left: out(d(left.value)), right: out(d(right.value)), difference: out(difference), holds: difference.abs().lte(toleranceOf("interest").value), state: difference.abs().lte(toleranceOf("interest").value) ? "holds" : "fails", anchor: left.anchor});
    else {
      identities.push({id: "interest_bridge", formula: "accrued interest (note) = interest expense (income statement)", left: out(d(left.value)), right: out(d(right.value)), difference: out(difference), holds: null, state: "not_comparable", anchor: left.anchor});
      uncovered.push({id: "interest_bridge", state: "insufficient_evidence", reason: `the note's figure counts ${left.components.join(", ")} and the income statement's counts ${right.components.join(", ")}; the difference of ${out(difference)} is recorded, not bridged`});
    }
  } else absent("interest_bridge", "the interest expense bridge was not tested: the note's accrued interest or the income statement's expense is not in the base");

  const openDivergences = reconciliations.filter((entry) => entry.state === "open" || entry.state === "not_comparable").map((entry) => ({
    id: entry.id, label: entry.label,
    values: entry.values.filter((value) => entry.unexplained_sources.includes(value.source)).map((value) => ({source: value.source, value: value.value, anchor: value.anchor})),
    reason: entry.state === "not_comparable"
      ? `the sources are not comparable: ${entry.comparability.reasons.join("; ")}; carried as a divergence, no value chosen`
      : entry.explanations.length > 0 ? `the stated adjustments leave ${entry.unexplained_sources.join(", ")} unexplained${entry.explanations.filter((explanation) => !explanation.holds).map((explanation) => ` (from ${explanation.fromSource} to ${explanation.toSource}: residual ${explanation.residual})`).join("")}` : `sources differ by ${entry.spread} with no explanation in the base; carried as a divergence, no value chosen`,
  }));
  const state: ReconciliationOutput["state"] = blockReasons.length > 0 ? "blocked"
    : identities.some((entry) => entry.state === "fails" && entry.id !== "interest_bridge") ? "identity_failed"
    : openDivergences.length > 0 ? "open_divergences"
    : incompleteReasons.length > 0 ? "incomplete"
    : reconciliations.some((entry) => entry.state === "explained") ? "differences_explained" : "closes";
  const body = {
    schema_version: "method.reconcile-financial-statements.v3" as const, reference_date: input.referenceDate, unit: input.unit, state,
    block_reasons: blockReasons, incomplete_reasons: incompleteReasons, reconciliations, open_divergences: openDivergences, identities, uncovered_terms: uncovered,
  };
  return {...body, trace: {calculations, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint({...body, calculations})}};
}
