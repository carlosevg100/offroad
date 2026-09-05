import {createHash} from "node:crypto";

import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `build-debt-ledger`, third version after two independent reviews.
 * Deterministic: the same rows, the same numbers, whatever their order; duplicate ids are refused.
 * Every row carries the anchor of its balance and, field by field, the anchor of each term it
 * states; a term without an anchor is refused. Remuneration is typed (spread over an index,
 * percent of an index, fixed coupon), never a free string. A net debt view is computed only when
 * its definition and source are in the base. An empty ledger exists only on evidence, and silence
 * blocks. `complete` requires reconciliation, schedule and both views.
 */
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
const nonNegativeMoney = z.string().regex(/^\d+(\.\d+)?$/);
const nonEmpty = z.string().trim().min(1);
const anchorSchema = z.object({document: nonEmpty, page: z.number().int().positive().optional(), note: nonEmpty.optional(), clause: nonEmpty.optional(), table: nonEmpty.optional()}).strict();
type Anchor = z.infer<typeof anchorSchema>;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const remunerationSchema = z.discriminatedUnion("type", [
  z.object({type: z.literal("spread_over_index"), index: z.enum(["CDI", "IPCA", "SOFR", "other"]), spreadPercentPerYear: z.string().regex(/^-?\d+(\.\d+)?$/)}).strict(),
  z.object({type: z.literal("percent_of_index"), index: z.enum(["CDI", "SOFR", "other"]), percentOfIndex: nonNegativeMoney}).strict(),
  z.object({type: z.literal("fixed"), ratePercentPerYear: z.string().regex(/^-?\d+(\.\d+)?$/)}).strict(),
]);

export const debtLedgerRowInputSchema = z.object({
  id: nonEmpty,
  instrument: nonEmpty,
  series: nonEmpty.optional(),
  obligation: z.object({
    kind: z.enum(["loan", "debenture", "commercial_note", "cpr", "lease", "other"]),
    /** Only disbursed obligations are debt; an authorized operation is not a row. */
    disbursed: z.literal(true),
    /** The views this row belongs to, as the definitions state; leases sit outside the contractual view unless the indenture says otherwise. */
    views: z.array(z.enum(["release", "contractual"])).min(1),
  }).strict(),
  balance: money,
  priorBalance: money.nullable().default(null),
  currency: z.string().regex(/^[A-Z]{3}$/),
  remuneration: remunerationSchema.nullable().default(null),
  maturity: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  guarantee: nonEmpty.nullable().default(null),
  lender: z.object({formalHolder: nonEmpty.nullable(), economicCreditors: nonEmpty.nullable()}).strict().nullable().default(null),
  classification: z.object({current: money, nonCurrent: money}).strict().nullable().default(null),
  /** Transaction costs and similar contra lines are part of the note's total but are not debt to a lender; they must be negative. */
  contra: z.boolean().default(false),
  anchors: z.object({
    balance: anchorSchema,
    remuneration: anchorSchema.optional(),
    maturity: anchorSchema.optional(),
    guarantee: anchorSchema.optional(),
    lender: anchorSchema.optional(),
    classification: anchorSchema.optional(),
  }).strict(),
}).strict().superRefine((row, context) => {
  const balance = new Decimal(row.balance);
  if (row.contra && balance.gte(0)) context.addIssue({code: "custom", path: ["contra"], message: `contra line ${row.id} must carry a negative balance`});
  if (!row.contra && balance.lt(0)) context.addIssue({code: "custom", path: ["balance"], message: `row ${row.id} has a negative balance and is not a contra line`});
  for (const field of ["remuneration", "maturity", "guarantee", "lender", "classification"] as const) {
    if (row[field] !== null && row[field] !== undefined && !row.anchors[field]) context.addIssue({code: "custom", path: ["anchors", field], message: `${field} of ${row.id} is stated without an anchor; a term without a source is not a term`});
  }
});

export const debtLedgerInputSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  unit: z.enum(["BRL", "BRL thousand", "BRL million", "USD", "USD thousand"]),
  /** `note` when the debt note of the statements is in the base; `release_only` yields no rows. */
  source: z.enum(["note", "release_only"]),
  rows: z.array(debtLedgerRowInputSchema),
  /** Present when the base proves the company has no onerous debt; the ledger is then empty on evidence, not on silence. */
  noDebtEvidence: anchorSchema.optional(),
  /** Independent totals from the balance sheet itself, never from the debt note. */
  balanceSheet: z.object({current: money, nonCurrent: money, anchor: anchorSchema}).strict().optional(),
  schedule: z.object({periods: z.array(z.object({period: nonEmpty, amount: money}).strict()).min(1), anchor: anchorSchema}).strict().optional(),
  cash: z.object({
    cashAndEquivalents: z.object({value: money, anchor: anchorSchema}).strict(),
    financialInvestments: z.object({value: money, anchor: anchorSchema}).strict(),
    derivativeAssets: z.object({value: money, anchor: anchorSchema}).strict(),
    derivativeLiabilities: z.object({value: money, anchor: anchorSchema}).strict(),
  }).strict().optional(),
  /** The literal definitions with their sources; a view is computed only when its definition is here. */
  definitions: z.object({
    release: z.object({text: nonEmpty, anchor: anchorSchema}).strict().optional(),
    contractual: z.object({text: nonEmpty, anchor: anchorSchema}).strict().optional(),
  }).strict().default({}),
  releaseReportedNetDebt: z.object({value: money, anchor: anchorSchema}).strict().optional(),
  /** Absolute tolerance for the reconciliation with the balance sheet, in the ledger's unit. Zero when the policy is not versioned. */
  tolerance: nonNegativeMoney.default("0"),
}).strict().superRefine((input, context) => {
  const ids = new Set<string>();
  for (const row of input.rows) {
    if (ids.has(row.id)) context.addIssue({code: "custom", path: ["rows"], message: `duplicate row id ${row.id}`});
    ids.add(row.id);
  }
  const periods = new Set<string>();
  for (const period of input.schedule?.periods ?? []) {
    if (periods.has(period.period)) context.addIssue({code: "custom", path: ["schedule", "periods"], message: `duplicate period ${period.period}`});
    periods.add(period.period);
  }
});
export type DebtLedgerInput = z.input<typeof debtLedgerInputSchema>;

type Row = z.infer<typeof debtLedgerRowInputSchema>;
type View = {value: string; definition: string; definitionSource: Anchor; components: Record<string, string>; componentAnchors: Record<string, Anchor>; rowsIncluded: string[]};

export type DebtLedgerOutput = {
  schemaVersion: "method.build-debt-ledger.v3";
  referenceDate: string;
  priorDate: string | null;
  unit: string;
  source: "note" | "release_only";
  state: "complete" | "blocked" | "empty" | "incomplete";
  blockReasons: string[];
  incompleteReasons: string[];
  ledgerRows: Array<{
    id: string; instrument: string; series: string | null; obligation: Row["obligation"]; balance: string; priorBalance: string | null; currency: string;
    remuneration: Row["remuneration"]; maturity: string | null; guarantee: string | null; lender: Row["lender"]; classification: Row["classification"]; contra: boolean;
    anchors: Row["anchors"];
  }>;
  grossDebt: string;
  grossDebtPrior: string | null;
  grossDebtBeforeContra: string;
  reconciliation: {state: "reconciled" | "difference" | "not_possible"; balanceSheetTotal: string | null; difference: string | null; tolerance: string; anchor: Anchor | null};
  schedule: {periods: Array<{period: string; amount: string; shareOfGross: string}>; total: string; matchesGross: boolean; anchor: Anchor} | null;
  netDebtViews: {release: View | null; contractual: View | null; releaseReported: {value: string; differenceToRelease: string | null; anchor: Anchor} | null};
  byIndexer: Array<{indexer: string; balance: string; shareOfGrossBeforeContra: string; rows: string[]}>;
  byCurrency: Array<{currency: string; balance: string; shareOfGrossBeforeContra: string; rows: string[]}>;
  uncoveredTerms: Array<{rowId: string; field: "remuneration" | "maturity" | "guarantee" | "lender" | "classification"; state: "insufficient_evidence"; reason: string}>;
  trace: {calculations: Array<{id: string; formula: string; operands: Record<string, string>; result: string}>; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const share = (part: Decimal, whole: Decimal) => (whole.isZero() ? "0" : out(part.div(whole)));
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const indexerOf = (row: Row): string => row.remuneration === null ? "unknown" : row.remuneration.type === "fixed" ? "fixed" : row.remuneration.index;

function canonical(input: z.infer<typeof debtLedgerInputSchema>) {
  return {
    ...input,
    rows: [...input.rows].sort((a, b) => compare(a.id, b.id)),
    schedule: input.schedule ? {...input.schedule, periods: [...input.schedule.periods].sort((a, b) => compare(a.period, b.period))} : undefined,
  };
}

export function buildDebtLedger(raw: DebtLedgerInput): DebtLedgerOutput {
  const input = canonical(debtLedgerInputSchema.parse(raw));
  const calculations: DebtLedgerOutput["trace"]["calculations"] = [];
  const rows = input.source === "release_only" ? [] : input.rows;
  const blockReasons: string[] = [];
  const incompleteReasons: string[] = [];

  const gross = rows.reduce((sum, row) => sum.plus(row.balance), d(0));
  const grossBeforeContra = rows.filter((row) => !row.contra).reduce((sum, row) => sum.plus(row.balance), d(0));
  const priorKnown = rows.length > 0 && rows.every((row) => row.priorBalance !== null);
  const grossPrior = priorKnown ? rows.reduce((sum, row) => sum.plus(row.priorBalance!), d(0)) : null;
  calculations.push({id: "financial.debt_ledger_balance", formula: "sum(rows.balance)", operands: {rows: String(rows.length)}, result: out(gross)});

  if (input.source === "release_only") blockReasons.push("only a release is in the base; a ledger needs the debt note of the financial statements, so no row is produced");
  if (input.source === "note" && rows.length === 0 && !input.noDebtEvidence) blockReasons.push("no rows and no evidence that the company has no onerous debt: silence is not an empty ledger");
  if (rows.length === 0 && input.noDebtEvidence && input.balanceSheet && !d(input.balanceSheet.current).plus(input.balanceSheet.nonCurrent).isZero()) {
    blockReasons.push("the base claims no onerous debt but the balance sheet carries debt totals; the contradiction blocks the ledger");
  }

  let reconciliation: DebtLedgerOutput["reconciliation"] = {state: "not_possible", balanceSheetTotal: null, difference: null, tolerance: input.tolerance, anchor: null};
  if (input.balanceSheet && rows.length > 0) {
    const total = d(input.balanceSheet.current).plus(input.balanceSheet.nonCurrent);
    const difference = gross.minus(total);
    const within = difference.abs().lte(input.tolerance);
    calculations.push({id: "financial.accounting_identity", formula: "sum(rows.balance) - (balanceSheet.current + balanceSheet.nonCurrent)", operands: {ledger: out(gross), balanceSheet: out(total), tolerance: input.tolerance}, result: out(difference)});
    reconciliation = {state: within ? "reconciled" : "difference", balanceSheetTotal: out(total), difference: out(difference), tolerance: input.tolerance, anchor: input.balanceSheet.anchor};
    if (!within) blockReasons.push(`ledger total ${out(gross)} differs from the balance sheet ${out(total)} by ${out(difference)}, above the tolerance ${input.tolerance}`);
  } else if (rows.length > 0) {
    incompleteReasons.push("no balance sheet totals in the base: the ledger is not reconciled");
  }

  let schedule: DebtLedgerOutput["schedule"] = null;
  if (input.schedule && rows.length > 0) {
    const total = input.schedule.periods.reduce((sum, period) => sum.plus(period.amount), d(0));
    const matchesGross = total.eq(gross);
    calculations.push({id: "financial.maturity_buckets", formula: "sum(schedule.periods.amount) - sum(rows.balance)", operands: {schedule: out(total), ledger: out(gross)}, result: out(total.minus(gross))});
    schedule = {periods: input.schedule.periods.map((period) => ({period: period.period, amount: out(d(period.amount)), shareOfGross: share(d(period.amount), gross)})), total: out(total), matchesGross, anchor: input.schedule.anchor};
    if (!matchesGross) blockReasons.push(`schedule total ${out(total)} differs from the ledger total ${out(gross)}`);
  } else if (rows.length > 0) {
    incompleteReasons.push("no maturity schedule with an anchor in the base");
  }

  const view = (name: "release" | "contractual", definition: {text: string; anchor: Anchor}): View => {
    const included = rows.filter((row) => row.obligation.views.includes(name) || row.contra);
    const debt = included.reduce((sum, row) => sum.plus(row.balance), d(0));
    const cash = input.cash!;
    const operands: Record<string, string> = {debt: out(debt), cashAndEquivalents: cash.cashAndEquivalents.value, financialInvestments: cash.financialInvestments.value};
    const anchors: Record<string, Anchor> = {cashAndEquivalents: cash.cashAndEquivalents.anchor, financialInvestments: cash.financialInvestments.anchor};
    let value = debt.minus(cash.cashAndEquivalents.value).minus(cash.financialInvestments.value);
    let formula = "debt - cashAndEquivalents - financialInvestments";
    if (name === "contractual") {
      value = value.plus(cash.derivativeLiabilities.value).minus(cash.derivativeAssets.value);
      formula = "debt + derivativeLiabilities - derivativeAssets - cashAndEquivalents - financialInvestments";
      operands.derivativeLiabilities = cash.derivativeLiabilities.value; operands.derivativeAssets = cash.derivativeAssets.value;
      anchors.derivativeLiabilities = cash.derivativeLiabilities.anchor; anchors.derivativeAssets = cash.derivativeAssets.anchor;
    }
    calculations.push({id: "financial.debt_views", formula: `${name}: ${formula}`, operands, result: out(value)});
    return {value: out(value), definition: definition.text, definitionSource: definition.anchor, components: operands, componentAnchors: anchors, rowsIncluded: included.map((row) => row.id)};
  };
  let netDebtViews: DebtLedgerOutput["netDebtViews"] = {release: null, contractual: null, releaseReported: null};
  if (rows.length > 0) {
    if (!input.cash) incompleteReasons.push("no cash, investments and derivatives in the base: net debt views are not computed");
    else {
      if (input.definitions.release) netDebtViews.release = view("release", input.definitions.release);
      else incompleteReasons.push("no release definition with a source: the release view is not computed");
      if (input.definitions.contractual) netDebtViews.contractual = view("contractual", input.definitions.contractual);
      else incompleteReasons.push("no contractual definition with a source: the contractual view is not computed");
    }
    if (input.releaseReportedNetDebt) {
      const reported = d(input.releaseReportedNetDebt.value);
      netDebtViews.releaseReported = {value: out(reported), differenceToRelease: netDebtViews.release ? out(reported.minus(netDebtViews.release.value)) : null, anchor: input.releaseReportedNetDebt.anchor};
    }
  }

  const group = (key: (row: Row) => string) => {
    const map = new Map<string, {balance: Decimal; rows: string[]}>();
    for (const row of rows) {
      if (row.contra) continue;
      const entry = map.get(key(row)) ?? {balance: d(0), rows: []};
      entry.balance = entry.balance.plus(row.balance);
      entry.rows.push(row.id);
      map.set(key(row), entry);
    }
    return [...map.entries()].sort(([a], [b]) => compare(a, b)).map(([label, entry]) => ({label, balance: out(entry.balance), shareOfGrossBeforeContra: share(entry.balance, grossBeforeContra), rows: entry.rows}));
  };

  const uncoveredTerms: DebtLedgerOutput["uncoveredTerms"] = [];
  for (const row of rows) {
    if (row.contra) continue;
    const label = `${row.instrument}${row.series ? ` ${row.series}` : ""}`;
    if (row.remuneration === null) uncoveredTerms.push({rowId: row.id, field: "remuneration", state: "insufficient_evidence", reason: `no source in the base states the remuneration of ${label}; the currency is not an indexer`});
    if (row.maturity === null) uncoveredTerms.push({rowId: row.id, field: "maturity", state: "insufficient_evidence", reason: `no source in the base states the maturity of ${label}`});
    if (row.guarantee === null) uncoveredTerms.push({rowId: row.id, field: "guarantee", state: "insufficient_evidence", reason: `no source in the base states the guarantee of ${label}`});
    if (row.lender === null) uncoveredTerms.push({rowId: row.id, field: "lender", state: "insufficient_evidence", reason: `no source in the base states the holder of ${label}`});
    if (row.classification === null) uncoveredTerms.push({rowId: row.id, field: "classification", state: "insufficient_evidence", reason: `the note gives current and non-current totals, not the split of ${label}`});
  }

  const state: DebtLedgerOutput["state"] = blockReasons.length > 0
    ? "blocked"
    : input.source === "release_only"
      ? "incomplete"
      : rows.length === 0
        ? "empty"
        : incompleteReasons.length > 0 ? "incomplete" : "complete";
  const body = {
    schemaVersion: "method.build-debt-ledger.v3" as const,
    referenceDate: input.referenceDate, priorDate: input.priorDate, unit: input.unit, source: input.source, state, blockReasons, incompleteReasons,
    ledgerRows: rows.map((row) => ({
      id: row.id, instrument: row.instrument, series: row.series ?? null, obligation: row.obligation, balance: out(d(row.balance)), priorBalance: row.priorBalance === null ? null : out(d(row.priorBalance)),
      currency: row.currency, remuneration: row.remuneration, maturity: row.maturity, guarantee: row.guarantee, lender: row.lender, classification: row.classification, contra: row.contra, anchors: row.anchors,
    })),
    grossDebt: out(gross), grossDebtPrior: grossPrior ? out(grossPrior) : null, grossDebtBeforeContra: out(grossBeforeContra),
    reconciliation, schedule, netDebtViews,
    byIndexer: group(indexerOf).map(({label, ...rest}) => ({indexer: label, ...rest})),
    byCurrency: group((row) => row.currency).map(({label, ...rest}) => ({currency: label, ...rest})),
    uncoveredTerms,
  };
  return {...body, trace: {calculations, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(body)}};
}
