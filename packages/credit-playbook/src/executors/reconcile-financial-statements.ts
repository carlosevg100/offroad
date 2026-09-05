import {createHash} from "node:crypto";

import {buildDebtBalanceBridge, checkIdentity} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `reconcile-financial-statements` (v2, after the first independent review).
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
  if (!new Decimal(tolerance.value).isZero() && (!tolerance.policyKey || !tolerance.policyVersion)) context.addIssue({code: "custom", path: ["policyKey"], message: "a tolerance above zero needs policyKey and policyVersion"});
});

export const statementSourceSchema = z.object({
  source: nonEmpty,
  value: money,
  /** What the source counts, as text, and as component tags the comparison is decided on. */
  definition: nonEmpty,
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
    /** A stated reconciliation from one source to another (an adjustment line), when the note gives one: to = from + adjustment. */
    explanation: z.object({fromSource: nonEmpty, toSource: nonEmpty, adjustment: money, description: nonEmpty, anchor: anchorSchema}).strict().nullable().default(null),
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
  cashBridge: z.object({opening: money, netChange: money, closing: money, anchor: anchorSchema}).strict().nullable().default(null),
  /** Interest expense: the note's accrued interest against the income statement's expense; the difference is recorded, never hidden. */
  interestBridge: z.object({fromDebtMovement: z.object({value: money, anchor: anchorSchema}).strict(), fromIncomeStatement: z.object({value: money, anchor: anchorSchema}).strict()}).strict().nullable().default(null),
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
    if (account.explanation) {
      if (!sources.has(account.explanation.fromSource) || !sources.has(account.explanation.toSource)) context.addIssue({code: "custom", path: ["pairedAccounts", index, "explanation"], message: `the explanation of ${account.id} names a source the account does not have`});
      if (account.explanation.fromSource === account.explanation.toSource) context.addIssue({code: "custom", path: ["pairedAccounts", index, "explanation"], message: `the explanation of ${account.id} must go from one source to another`});
    }
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
  schema_version: "method.reconcile-financial-statements.v2";
  reference_date: string;
  unit: string;
  state: "closes" | "differences_explained" | "open_divergences" | "identity_failed" | "incomplete" | "blocked";
  block_reasons: string[];
  incomplete_reasons: string[];
  reconciliations: Array<{
    id: string; label: string; family: string;
    values: Array<{source: string; value: string; definition: string; components: string[]; asOf: string; anchor: Anchor}>;
    comparability: {comparable: boolean; reasons: string[]};
    spread: string | null;
    tolerance: {value: string; policyKey: string | null; policyVersion: string | null};
    state: PairState;
    explanation: {fromSource: string; toSource: string; adjustment: string; expected: string; actual: string; residual: string; description: string; anchor: Anchor} | null;
  }>;
  open_divergences: Array<{id: string; label: string; values: Array<{source: string; value: string; anchor: Anchor}>; reason: string}>;
  identities: Array<{id: string; formula: string; left: string; right: string; difference: string; holds: boolean; anchor: Anchor}>;
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
    pairedAccounts: [...input.pairedAccounts].sort((a, b) => compare(a.id, b.id)).map((account) => ({...account, sources: [...account.sources].sort((a, b) => compare(a.source, b.source)).map((source) => ({...source, components: sortStrings(source.components)}))})),
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
    const values = account.sources.map((source) => ({source: source.source, value: out(d(source.value)), definition: source.definition, components: source.components, asOf: source.asOf, anchor: source.anchor}));
    if (account.sources.length === 1) {
      uncovered.push({id: account.id, state: "insufficient_evidence", reason: `${account.label} has a single source (${account.sources[0]!.source}); recorded, not reconciled`});
      return {id: account.id, label: account.label, family: account.family, values, comparability: {comparable: false, reasons: ["single source"]}, spread: null, tolerance, state: "single_source", explanation: null};
    }
    // Comparability is decided on the components and the date, never on the name of the account.
    const reasons: string[] = [];
    const componentSets = account.sources.map((source) => source.components.join("+"));
    if (new Set(componentSets).size > 1) reasons.push(`the sources count different components (${account.sources.map((source) => `${source.source}: ${source.components.join(", ")}`).join("; ")})`);
    if (new Set(account.sources.map((source) => source.asOf)).size > 1) reasons.push(`the sources are dated differently (${account.sources.map((source) => `${source.source}: ${source.asOf}`).join("; ")})`);
    const numbers = account.sources.map((source) => d(source.value));
    const spread = Decimal.max(...numbers).minus(Decimal.min(...numbers));
    record({id: `financial.accounting_identity:${account.id}:spread`, formula: "max(values) - min(values)", operands: Object.fromEntries(account.sources.map((source) => [source.source, source.value])), result: out(spread)});
    let explanation: ReconciliationOutput["reconciliations"][number]["explanation"] = null;
    if (account.explanation) {
      // The adjustment is directional: the source it starts from plus the adjustment must reach the source it names.
      const from = account.sources.find((source) => source.source === account.explanation!.fromSource)!;
      const to = account.sources.find((source) => source.source === account.explanation!.toSource)!;
      const expected = d(from.value).plus(account.explanation.adjustment);
      const residual = d(to.value).minus(expected);
      record({id: `financial.accounting_identity:${account.id}:explanation`, formula: "to - (from + adjustment)", operands: {from: from.value, adjustment: account.explanation.adjustment, to: to.value}, result: out(residual)});
      explanation = {fromSource: from.source, toSource: to.source, adjustment: account.explanation.adjustment, expected: out(expected), actual: out(d(to.value)), residual: out(residual), description: account.explanation.description, anchor: account.explanation.anchor};
    }
    if (reasons.length > 0 && !explanation) {
      return {id: account.id, label: account.label, family: account.family, values, comparability: {comparable: false, reasons}, spread: out(spread), tolerance, state: "not_comparable", explanation: null};
    }
    let state: PairState = spread.lte(tolerance.value) && reasons.length === 0 ? "closes" : "open";
    if (state === "open" && explanation && explanation !== null && d(explanation.residual).abs().lte(tolerance.value)) state = "explained";
    return {id: account.id, label: account.label, family: account.family, values, comparability: {comparable: reasons.length === 0, reasons}, spread: out(spread), tolerance, state, explanation};
  });

  const identities: ReconciliationOutput["identities"] = [];
  const identity = (id: string, formula: string, left: Decimal.Value, right: Decimal.Value, family: string, anchor: Anchor) => {
    const result = checkIdentity({id, left, right, absoluteTolerance: toleranceOf(family).value});
    record({id: `financial.accounting_identity:${id}`, formula, operands: {left: result.left, right: result.right, tolerance: result.tolerance}, result: result.difference});
    identities.push({id, formula, left: result.left, right: result.right, difference: result.difference, holds: result.status === "pass", anchor});
  };
  if (input.balanceSheet) identity("balance_sheet", "assets = liabilities + equity", input.balanceSheet.assets, d(input.balanceSheet.liabilities).plus(input.balanceSheet.equity), "balance_sheet", input.balanceSheet.anchor);
  else if (blockReasons.length === 0) { incompleteReasons.push("the balance sheet identity was not tested: assets, liabilities and equity are not in the base"); uncovered.push({id: "balance_sheet", state: "insufficient_evidence", reason: "no balance sheet totals in the base"}); }
  if (input.debtBridge) {
    const byCategory: Record<string, Decimal> = {};
    for (const line of input.debtBridge.lines) byCategory[line.category] = (byCategory[line.category] ?? d(0)).plus(line.value);
    const bridge = buildDebtBalanceBridge({openingBalance: input.debtBridge.opening, ...Object.fromEntries(Object.entries(byCategory).map(([category, value]) => [category, out(value)]))});
    record({id: "financial.debt_balance_bridge", formula: "opening + additions - reductions", operands: Object.fromEntries(bridge.lines.map((line) => [line.id, line.value])), result: bridge.value});
    identity("debt_bridge", "opening + movements = closing", bridge.value, input.debtBridge.closing, "debt", input.debtBridge.anchor);
  } else if (blockReasons.length === 0) incompleteReasons.push("the debt roll-forward was not tested: the note's movement is not in the base");
  if (input.cashBridge) identity("cash_bridge", "opening + net change = closing", d(input.cashBridge.opening).plus(input.cashBridge.netChange), input.cashBridge.closing, "cash", input.cashBridge.anchor);
  else if (blockReasons.length === 0) incompleteReasons.push("the cash bridge was not tested: opening, net change and closing are not in the base");
  if (input.interestBridge) {
    const difference = d(input.interestBridge.fromDebtMovement.value).minus(input.interestBridge.fromIncomeStatement.value);
    record({id: "financial.interest_expense_bridge", formula: "accrued interest in the debt movement - interest expense in the income statement", operands: {fromDebtMovement: input.interestBridge.fromDebtMovement.value, fromIncomeStatement: input.interestBridge.fromIncomeStatement.value}, result: out(difference)});
    identities.push({id: "interest_bridge", formula: "accrued interest (note) = interest expense (income statement)", left: out(d(input.interestBridge.fromDebtMovement.value)), right: out(d(input.interestBridge.fromIncomeStatement.value)), difference: out(difference), holds: difference.abs().lte(toleranceOf("interest").value), anchor: input.interestBridge.fromDebtMovement.anchor});
  } else if (blockReasons.length === 0) incompleteReasons.push("the interest expense bridge was not tested: the note's accrued interest or the income statement's expense is not in the base");

  const openDivergences = reconciliations.filter((entry) => entry.state === "open" || entry.state === "not_comparable").map((entry) => ({
    id: entry.id, label: entry.label,
    values: entry.values.map((value) => ({source: value.source, value: value.value, anchor: value.anchor})),
    reason: entry.state === "not_comparable"
      ? `the sources are not comparable: ${entry.comparability.reasons.join("; ")}; carried as a divergence, no value chosen`
      : entry.explanation ? `the stated adjustment from ${entry.explanation.fromSource} to ${entry.explanation.toSource} leaves a residual of ${entry.explanation.residual}` : `sources differ by ${entry.spread} with no explanation in the base; carried as a divergence, no value chosen`,
  }));
  const state: ReconciliationOutput["state"] = blockReasons.length > 0 ? "blocked"
    : identities.some((entry) => !entry.holds && entry.id !== "interest_bridge") ? "identity_failed"
    : openDivergences.length > 0 ? "open_divergences"
    : incompleteReasons.length > 0 ? "incomplete"
    : reconciliations.some((entry) => entry.state === "explained") ? "differences_explained" : "closes";
  const body = {
    schema_version: "method.reconcile-financial-statements.v2" as const, reference_date: input.referenceDate, unit: input.unit, state,
    block_reasons: blockReasons, incomplete_reasons: incompleteReasons, reconciliations, open_divergences: openDivergences, identities, uncovered_terms: uncovered,
  };
  return {...body, trace: {calculations, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint({...body, calculations})}};
}
