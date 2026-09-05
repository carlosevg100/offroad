import {createHash} from "node:crypto";

import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `build-debt-ledger`. Deterministic: the same rows, the same numbers,
 * whatever their order. Every figure is a Decimal string; every row carries the anchor of its
 * balance and, separately, the anchor of its terms; every net debt view names the source of its
 * definition. A reconciliation that fails blocks the ledger instead of being explained away, an
 * empty ledger is a legitimate state with its own anchor, and a release without a note produces
 * no rows at all.
 */
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const nonNegativeMoney = z.string().regex(/^\d+(\.\d+)?$/);
const anchorSchema = z.object({document: z.string().min(1), page: z.number().int().positive().optional(), note: z.string().optional(), clause: z.string().optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;

export const debtLedgerRowInputSchema = z.object({
  id: z.string().min(1),
  instrument: z.string().min(1),
  series: z.string().optional(),
  balance: money,
  priorBalance: money.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** `unknown` when no source in the base states the remuneration; a currency is not an indexer. */
  indexer: z.enum(["CDI", "IPCA", "fixed", "SOFR", "other", "unknown"]),
  spread: z.string().nullable().optional(),
  maturity: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  guarantee: z.string().nullable().optional(),
  lender: z.string().nullable().optional(),
  /** Transaction costs and similar contra lines are part of the note's total but are not debt to a lender. */
  contra: z.boolean().default(false),
  anchors: z.object({
    /** Where the balance comes from (the note of the financial statements). */
    balance: anchorSchema,
    /** Where indexer, spread, maturity and guarantee come from (indenture, trustee report); absent when nothing states them. */
    terms: anchorSchema.optional(),
  }).strict(),
}).strict();

export const debtLedgerInputSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unit: z.string().min(1),
  /** `note` when the debt note of the statements is in the base; `release_only` yields no rows. */
  source: z.enum(["note", "release_only"]),
  rows: z.array(debtLedgerRowInputSchema),
  /** Present when the base proves the company has no onerous debt; the ledger is then empty on evidence, not on silence. */
  noDebtEvidence: anchorSchema.optional(),
  balanceSheet: z.object({current: money, nonCurrent: money, anchor: anchorSchema}).strict().optional(),
  schedule: z.array(z.object({period: z.string().min(1), amount: money}).strict()).default([]),
  scheduleAnchor: anchorSchema.optional(),
  cash: z.object({cashAndEquivalents: money, financialInvestments: money, derivativeAssets: money, derivativeLiabilities: money, anchors: z.object({cash: anchorSchema, derivatives: anchorSchema}).strict()}).strict().optional(),
  releaseNetDebt: z.object({value: money, anchor: anchorSchema}).strict().optional(),
  contractualDefinitionAnchor: anchorSchema.optional(),
  /** Absolute tolerance for the reconciliation with the balance sheet, in the ledger's unit. Zero when the policy is not versioned. */
  tolerance: nonNegativeMoney.default("0"),
}).strict();
export type DebtLedgerInput = z.input<typeof debtLedgerInputSchema>;

export type DebtLedgerOutput = {
  schemaVersion: "method.build-debt-ledger.v2";
  referenceDate: string;
  unit: string;
  source: "note" | "release_only";
  state: "complete" | "blocked" | "empty" | "incomplete";
  blockReasons: string[];
  ledgerRows: Array<{id: string; instrument: string; series: string | null; balance: string; currency: string; indexer: string; spread: string | null; maturity: string | null; guarantee: string | null; lender: string | null; contra: boolean; anchors: {balance: Anchor; terms: Anchor | null}}>;
  grossDebt: string;
  /** Gross debt before contra lines (transaction costs), the denominator of every concentration share. */
  grossDebtBeforeContra: string;
  reconciliation: {state: "reconciled" | "difference" | "not_possible"; balanceSheetTotal: string | null; difference: string | null; tolerance: string; anchor: Anchor | null};
  schedule: {periods: Array<{period: string; amount: string; shareOfGross: string}>; total: string; matchesGross: boolean; anchor: Anchor | null} | null;
  netDebtViews: {
    releaseDefinitionRecalculated: {value: string; definition: string; definitionSource: Anchor | null; components: Record<string, string>; componentAnchors: Record<string, Anchor>} | null;
    contractual: {value: string; definition: string; definitionSource: Anchor | null; components: Record<string, string>; componentAnchors: Record<string, Anchor>} | null;
    releaseReported: {value: string; differenceToRecalculated: string | null; anchor: Anchor} | null;
  };
  byIndexer: Array<{indexer: string; balance: string; shareOfGrossBeforeContra: string; rows: string[]}>;
  byCurrency: Array<{currency: string; balance: string; shareOfGrossBeforeContra: string; rows: string[]}>;
  uncoveredTerms: Array<{rowId: string; field: "indexer" | "spread" | "maturity" | "guarantee" | "lender"; state: "insufficient_evidence"; reason: string}>;
  trace: {calculations: string[]; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const share = (part: Decimal, whole: Decimal) => (whole.isZero() ? "0" : out(part.div(whole)));
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Canonical form of the input: rows and periods sorted, so order never changes a fingerprint. */
function canonicalInput(input: z.infer<typeof debtLedgerInputSchema>) {
  return {...input, rows: [...input.rows].sort((a, b) => a.id.localeCompare(b.id)), schedule: [...input.schedule].sort((a, b) => a.period.localeCompare(b.period))};
}

export function buildDebtLedger(raw: DebtLedgerInput): DebtLedgerOutput {
  const input = canonicalInput(debtLedgerInputSchema.parse(raw));
  const rows = input.source === "release_only" ? [] : input.rows;
  const gross = rows.reduce((sum, row) => sum.plus(row.balance), d(0));
  const grossBeforeContra = rows.filter((row) => !row.contra).reduce((sum, row) => sum.plus(row.balance), d(0));

  const blockReasons: string[] = [];
  if (input.source === "release_only") blockReasons.push("only a release is in the base; a ledger needs the debt note of the financial statements, so no row is produced");
  if (input.source === "note" && rows.length === 0 && !input.noDebtEvidence) blockReasons.push("no rows and no evidence that the company has no onerous debt");

  let reconciliation: DebtLedgerOutput["reconciliation"] = {state: "not_possible", balanceSheetTotal: null, difference: null, tolerance: input.tolerance, anchor: null};
  if (input.balanceSheet && rows.length > 0) {
    const total = d(input.balanceSheet.current).plus(input.balanceSheet.nonCurrent);
    const difference = gross.minus(total);
    const within = difference.abs().lte(input.tolerance);
    reconciliation = {state: within ? "reconciled" : "difference", balanceSheetTotal: out(total), difference: out(difference), tolerance: input.tolerance, anchor: input.balanceSheet.anchor};
    if (!within) blockReasons.push(`ledger total ${out(gross)} differs from the balance sheet ${out(total)} by ${out(difference)}, above the tolerance ${input.tolerance}`);
  } else if (rows.length > 0) {
    blockReasons.push("no balance sheet totals in the base: the ledger cannot be reconciled");
  }

  let schedule: DebtLedgerOutput["schedule"] = null;
  if (input.schedule.length > 0 && rows.length > 0) {
    const total = input.schedule.reduce((sum, period) => sum.plus(period.amount), d(0));
    const matchesGross = total.eq(gross);
    schedule = {periods: input.schedule.map((period) => ({period: period.period, amount: out(d(period.amount)), shareOfGross: share(d(period.amount), gross)})), total: out(total), matchesGross, anchor: input.scheduleAnchor ?? null};
    if (!matchesGross) blockReasons.push(`schedule total ${out(total)} differs from the ledger total ${out(gross)}`);
  }

  let netDebtViews: DebtLedgerOutput["netDebtViews"] = {releaseDefinitionRecalculated: null, contractual: null, releaseReported: null};
  if (input.cash && rows.length > 0) {
    const cash = d(input.cash.cashAndEquivalents);
    const investments = d(input.cash.financialInvestments);
    const derivativeAssets = d(input.cash.derivativeAssets);
    const derivativeLiabilities = d(input.cash.derivativeLiabilities);
    const recalculated = gross.minus(cash).minus(investments);
    const contractual = gross.plus(derivativeLiabilities).minus(derivativeAssets).minus(cash).minus(investments);
    netDebtViews = {
      releaseDefinitionRecalculated: {
        value: out(recalculated),
        definition: "gross debt minus cash and equivalents minus financial investments, recalculated from the statements with the release's definition",
        definitionSource: input.releaseNetDebt?.anchor ?? null,
        components: {grossDebt: out(gross), cashAndEquivalents: out(cash), financialInvestments: out(investments)},
        componentAnchors: {cashAndEquivalents: input.cash.anchors.cash, financialInvestments: input.cash.anchors.cash},
      },
      contractual: {
        value: out(contractual),
        definition: "gross debt plus derivative liabilities minus derivative assets minus cash and equivalents minus financial investments, per the indenture definition",
        definitionSource: input.contractualDefinitionAnchor ?? null,
        components: {grossDebt: out(gross), derivativeLiabilities: out(derivativeLiabilities), derivativeAssets: out(derivativeAssets), cashAndEquivalents: out(cash), financialInvestments: out(investments)},
        componentAnchors: {derivativeLiabilities: input.cash.anchors.derivatives, derivativeAssets: input.cash.anchors.derivatives, cashAndEquivalents: input.cash.anchors.cash, financialInvestments: input.cash.anchors.cash},
      },
      releaseReported: input.releaseNetDebt ? {value: out(d(input.releaseNetDebt.value)), differenceToRecalculated: out(d(input.releaseNetDebt.value).minus(recalculated)), anchor: input.releaseNetDebt.anchor} : null,
    };
  }

  const group = (key: (row: (typeof rows)[number]) => string) => {
    const map = new Map<string, {balance: Decimal; rows: string[]}>();
    for (const row of rows) {
      if (row.contra) continue;
      const entry = map.get(key(row)) ?? {balance: d(0), rows: []};
      entry.balance = entry.balance.plus(row.balance);
      entry.rows.push(row.id);
      map.set(key(row), entry);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, entry]) => ({label, balance: out(entry.balance), shareOfGrossBeforeContra: share(entry.balance, grossBeforeContra), rows: entry.rows}));
  };

  const uncoveredTerms: DebtLedgerOutput["uncoveredTerms"] = [];
  for (const row of rows) {
    if (row.contra) continue;
    const missing: Array<DebtLedgerOutput["uncoveredTerms"][number]["field"]> = [];
    if (row.indexer === "unknown") missing.push("indexer");
    if (row.spread === undefined || row.spread === null) missing.push("spread");
    if (!row.maturity) missing.push("maturity");
    if (row.guarantee === undefined || row.guarantee === null) missing.push("guarantee");
    if (row.lender === undefined || row.lender === null) missing.push("lender");
    for (const field of missing) uncoveredTerms.push({rowId: row.id, field, state: "insufficient_evidence", reason: row.anchors.terms ? `${field} not stated by ${row.anchors.terms.document}` : `no source in the base states the ${field} of ${row.instrument}${row.series ? ` ${row.series}` : ""}`});
  }

  const state: DebtLedgerOutput["state"] = input.source === "release_only" ? "incomplete" : rows.length === 0 ? "empty" : blockReasons.length > 0 ? "blocked" : "complete";
  const body = {
    schemaVersion: "method.build-debt-ledger.v2" as const,
    referenceDate: input.referenceDate,
    unit: input.unit,
    source: input.source,
    state,
    blockReasons,
    ledgerRows: rows.map((row) => ({
      id: row.id, instrument: row.instrument, series: row.series ?? null, balance: out(d(row.balance)), currency: row.currency, indexer: row.indexer,
      spread: row.spread ?? null, maturity: row.maturity ?? null, guarantee: row.guarantee ?? null, lender: row.lender ?? null, contra: row.contra,
      anchors: {balance: row.anchors.balance, terms: row.anchors.terms ?? null},
    })),
    grossDebt: out(gross),
    grossDebtBeforeContra: out(grossBeforeContra),
    reconciliation,
    schedule,
    netDebtViews,
    byIndexer: group((row) => row.indexer).map(({label, ...rest}) => ({indexer: label, ...rest})),
    byCurrency: group((row) => row.currency).map(({label, ...rest}) => ({currency: label, ...rest})),
    uncoveredTerms,
  };
  return {...body, trace: {calculations: ["financial.debt_ledger_balance", "financial.debt_views", "financial.maturity_buckets", "financial.debt_grouping"], inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(body)}};
}
