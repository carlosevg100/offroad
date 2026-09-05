import {createHash} from "node:crypto";

import {buildDebtBalanceBridge, checkIdentity} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `reconcile-financial-statements`. Proves that material numbers close
 * between statements, notes and release, runs the identities through financial-core, and keeps
 * every difference above the tolerance as an open divergence with its anchors. Two sources that
 * disagree are never averaged and never silently resolved.
 */
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const nonNegative = z.string().regex(/^\d+(\.\d+)?$/);
const anchorSchema = z.object({document: z.string().min(1), page: z.number().int().positive().optional(), note: z.string().optional(), table: z.string().optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;

export const reconciliationInputSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unit: z.string().min(1),
  /** Absolute tolerance per statement family, in the unit; a missing family means zero tolerance. */
  tolerance: z.record(z.string(), nonNegative).default({}),
  /** The same account stated by more than one source. */
  pairedAccounts: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    family: z.string().min(1),
    /** Values as each source states them; a definition tells the reader what the source counts. */
    sources: z.array(z.object({source: z.string().min(1), value: money, definition: z.string().min(1), anchor: anchorSchema}).strict()).min(2),
    /** A stated reconciliation between two sources (an adjustment line), when the note gives one. */
    explanation: z.object({adjustment: money, description: z.string().min(1), anchor: anchorSchema}).strict().nullable().default(null),
  }).strict()).default([]),
  /** Balance sheet identity: assets equal liabilities plus equity. */
  balanceSheet: z.object({assets: money, liabilities: money, equity: money, anchor: anchorSchema}).strict().nullable().default(null),
  /** Debt roll-forward from the note: opening plus movements equals closing. */
  debtBridge: z.object({
    opening: money,
    /** Each line of the note mapped to a category of financial-core's bridge; the mapping is part of the record. */
    lines: z.array(z.object({id: z.string().min(1), label: z.string().min(1), value: money, category: z.enum(["drawdowns", "accruedInterest", "pik", "indexation", "foreignExchange", "acquisitions", "otherAdditions", "amortizations", "prepayments", "writeOffs"])}).strict()).min(1),
    closing: money,
    anchor: anchorSchema,
  }).strict().nullable().default(null),
  /** Cash roll-forward: opening plus net change equals closing. */
  cashBridge: z.object({opening: money, netChange: money, closing: money, anchor: anchorSchema}).strict().nullable().default(null),
}).strict();
export type ReconciliationInput = z.input<typeof reconciliationInputSchema>;

export type ReconciliationOutput = {
  schemaVersion: "method.reconcile-financial-statements.v1";
  referenceDate: string;
  unit: string;
  state: "closes" | "differences_explained" | "open_divergences" | "identity_failed";
  reconciliations: Array<{
    id: string; label: string; family: string;
    values: Array<{source: string; value: string; definition: string; anchor: Anchor}>;
    spread: string;
    tolerance: string;
    state: "closes" | "explained" | "open";
    explanation: {adjustment: string; description: string; residual: string; anchor: Anchor} | null;
  }>;
  openDivergences: Array<{id: string; label: string; values: Array<{source: string; value: string; anchor: Anchor}>; reason: string}>;
  identities: Array<{id: string; formula: string; left: string; right: string; difference: string; holds: boolean; anchor: Anchor}>;
  trace: {calculations: Array<{id: string; formula: string; operands: Record<string, string>; result: string}>; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function canonical(input: z.infer<typeof reconciliationInputSchema>) {
  return {
    ...input,
    pairedAccounts: [...input.pairedAccounts].sort((a, b) => a.id.localeCompare(b.id)).map((account) => ({...account, sources: [...account.sources].sort((a, b) => a.source.localeCompare(b.source))})),
    debtBridge: input.debtBridge ? {...input.debtBridge, lines: [...input.debtBridge.lines].sort((a, b) => a.id.localeCompare(b.id))} : null,
  };
}

export function reconcileFinancialStatements(raw: ReconciliationInput): ReconciliationOutput {
  const input = canonical(reconciliationInputSchema.parse(raw));
  const calculations: ReconciliationOutput["trace"]["calculations"] = [];

  const reconciliations = input.pairedAccounts.map((account) => {
    const values = account.sources.map((source) => d(source.value));
    const spread = Decimal.max(...values).minus(Decimal.min(...values));
    const tolerance = d(input.tolerance[account.family] ?? "0");
    let state: "closes" | "explained" | "open" = spread.lte(tolerance) ? "closes" : "open";
    let explanation: ReconciliationOutput["reconciliations"][number]["explanation"] = null;
    if (state === "open" && account.explanation) {
      // The stated adjustment must bridge the two extremes exactly, within tolerance, to count.
      const residual = spread.minus(d(account.explanation.adjustment).abs());
      calculations.push({id: "financial.accounting_identity", formula: "spread - |adjustment|", operands: {spread: out(spread), adjustment: account.explanation.adjustment}, result: out(residual)});
      explanation = {adjustment: account.explanation.adjustment, description: account.explanation.description, residual: out(residual), anchor: account.explanation.anchor};
      if (residual.abs().lte(tolerance)) state = "explained";
    }
    return {
      id: account.id, label: account.label, family: account.family,
      values: account.sources.map((source) => ({source: source.source, value: out(d(source.value)), definition: source.definition, anchor: source.anchor})),
      spread: out(spread), tolerance: out(tolerance), state, explanation,
    };
  });

  const identities: ReconciliationOutput["identities"] = [];
  const identity = (id: string, formula: string, left: Decimal.Value, right: Decimal.Value, family: string, anchor: Anchor) => {
    const result = checkIdentity({id, left, right, absoluteTolerance: input.tolerance[family] ?? "0"});
    calculations.push({id: "financial.accounting_identity", formula, operands: {left: result.left, right: result.right, tolerance: result.tolerance}, result: result.difference});
    identities.push({id, formula, left: result.left, right: result.right, difference: result.difference, holds: result.status === "pass", anchor});
  };
  if (input.balanceSheet) {
    identity("balance_sheet", "assets = liabilities + equity", input.balanceSheet.assets, d(input.balanceSheet.liabilities).plus(input.balanceSheet.equity), "balance_sheet", input.balanceSheet.anchor);
  }
  if (input.debtBridge) {
    const byCategory: Record<string, Decimal> = {};
    for (const line of input.debtBridge.lines) byCategory[line.category] = (byCategory[line.category] ?? d(0)).plus(line.value);
    const bridge = buildDebtBalanceBridge({
      openingBalance: input.debtBridge.opening,
      ...Object.fromEntries(Object.entries(byCategory).map(([category, value]) => [category, out(value)])),
    });
    calculations.push({id: "financial.debt_balance_bridge", formula: "opening + additions - reductions", operands: Object.fromEntries(bridge.lines.map((line) => [line.id, line.value])), result: bridge.value});
    identity("debt_bridge", "opening + movements = closing", bridge.value, input.debtBridge.closing, "debt", input.debtBridge.anchor);
  }
  if (input.cashBridge) {
    identity("cash_bridge", "opening + net change = closing", d(input.cashBridge.opening).plus(input.cashBridge.netChange), input.cashBridge.closing, "cash", input.cashBridge.anchor);
  }

  const openDivergences = reconciliations.filter((entry) => entry.state === "open").map((entry) => ({
    id: entry.id, label: entry.label,
    values: entry.values.map((value) => ({source: value.source, value: value.value, anchor: value.anchor})),
    reason: entry.explanation ? `the stated adjustment leaves a residual of ${entry.explanation.residual}` : `sources differ by ${entry.spread} with no explanation in the base; carried as a divergence, no value chosen`,
  }));
  const state: ReconciliationOutput["state"] = identities.some((identity) => !identity.holds) ? "identity_failed" : openDivergences.length > 0 ? "open_divergences" : reconciliations.some((entry) => entry.state === "explained") ? "differences_explained" : "closes";
  const body = {schemaVersion: "method.reconcile-financial-statements.v1" as const, referenceDate: input.referenceDate, unit: input.unit, state, reconciliations, openDivergences, identities};
  return {...body, trace: {calculations, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(body)}};
}
