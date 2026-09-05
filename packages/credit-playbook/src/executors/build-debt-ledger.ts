import {createHash} from "node:crypto";

import Decimal from "decimal.js";
import {z} from "zod";

/**
 * Executor of the method `build-debt-ledger`, fifth version after four independent reviews.
 * Deterministic: the same rows, the same numbers, whatever their order; duplicate ids are refused.
 * Every row carries the anchor of its balance and, field by field, the anchor of each term it
 * states; the two facts of a lender (formal holder, economic creditors) each carry their own anchor.
 * A contra line is not an obligation. A net debt view is computed only when its definition is in the
 * base and its text agrees with the formula executed. Reconciliation runs on the total and, when the
 * rows carry the split, on current and non-current separately; the first period of the schedule is
 * checked against the current liabilities. A tolerance above zero needs a versioned policy. An
 * empty ledger exists only on evidence, and silence blocks. Every calculation lists its operands.
 * The first period of the schedule is the one that ends within twelve months of the reference date,
 * never a label; each row's split must add up to its balance; a definition's text is parsed into what
 * it adds and what it deducts before the formula runs; fingerprints ignore key and nested-array order.
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
  /** Absent on contra lines, which are not obligations to a lender. */
  obligation: z.object({
    kind: z.enum(["loan", "debenture", "commercial_note", "cpr", "lease", "other"]),
    /** Only disbursed obligations are debt; an authorized operation is not a row. */
    disbursed: z.literal(true),
    /** The views this row belongs to, as the definitions state; a lease inside the contractual view needs the anchor of that inclusion. */
    views: z.array(z.enum(["release", "contractual"])).min(1),
  }).strict().optional(),
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
    lenderFormalHolder: anchorSchema.optional(),
    lenderEconomicCreditors: anchorSchema.optional(),
    classification: anchorSchema.optional(),
    /** Where the base says this row belongs to the contractual view (needed for leases). */
    viewInclusion: anchorSchema.optional(),
  }).strict(),
}).strict().superRefine((row, context) => {
  const balance = new Decimal(row.balance);
  if (row.contra && balance.gte(0)) context.addIssue({code: "custom", path: ["contra"], message: `contra line ${row.id} must carry a negative balance`});
  if (!row.contra && balance.lt(0)) context.addIssue({code: "custom", path: ["balance"], message: `row ${row.id} has a negative balance and is not a contra line`});
  if (row.contra && row.obligation) context.addIssue({code: "custom", path: ["obligation"], message: `contra line ${row.id} is not an obligation to a lender; drop its obligation`});
  if (!row.contra && !row.obligation) context.addIssue({code: "custom", path: ["obligation"], message: `row ${row.id} needs its obligation (kind, disbursed, views)`});
  for (const field of ["remuneration", "maturity", "guarantee", "classification"] as const) {
    if (row[field] !== null && row[field] !== undefined && !row.anchors[field]) context.addIssue({code: "custom", path: ["anchors", field], message: `${field} of ${row.id} is stated without an anchor; a term without a source is not a term`});
  }
  if (row.lender?.formalHolder && !row.anchors.lenderFormalHolder) context.addIssue({code: "custom", path: ["anchors", "lenderFormalHolder"], message: `the formal holder of ${row.id} is stated without an anchor`});
  if (row.lender?.economicCreditors && !row.anchors.lenderEconomicCreditors) context.addIssue({code: "custom", path: ["anchors", "lenderEconomicCreditors"], message: `the economic creditors of ${row.id} are stated without an anchor`});
  if (row.obligation?.kind === "lease" && row.obligation.views.includes("contractual") && !row.anchors.viewInclusion) context.addIssue({code: "custom", path: ["anchors", "viewInclusion"], message: `lease ${row.id} sits in the contractual view without the anchor that includes it`});
  if (row.classification && !new Decimal(row.classification.current).plus(row.classification.nonCurrent).eq(balance)) context.addIssue({code: "custom", path: ["classification"], message: `the split of ${row.id} (${row.classification.current} + ${row.classification.nonCurrent}) does not add up to its balance ${row.balance}`});
});

export const toleranceSchema = z.object({
  value: nonNegativeMoney,
  /** A tolerance above zero exists only under a versioned policy. */
  policyKey: nonEmpty.optional(),
  policyVersion: nonEmpty.optional(),
}).strict().superRefine((tolerance, context) => {
  if (!new Decimal(tolerance.value).isZero() && (!tolerance.policyKey || !tolerance.policyVersion)) context.addIssue({code: "custom", path: ["policyKey"], message: "a tolerance above zero needs policyKey and policyVersion"});
});

export const debtLedgerInputSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  unit: z.enum(["BRL", "BRL thousand", "BRL million", "USD", "USD thousand"]),
  /** `note` when the debt note of the statements is in the base; `release_only` blocks: a release is not a ledger. */
  source: z.enum(["note", "release_only"]),
  rows: z.array(debtLedgerRowInputSchema),
  /** Present when the base proves the company has no onerous debt; the ledger is then empty on evidence, not on silence. */
  noDebtEvidence: anchorSchema.optional(),
  /** Independent totals from the balance sheet itself, never from the debt note. */
  balanceSheet: z.object({current: money, nonCurrent: money, anchor: anchorSchema}).strict().optional(),
  schedule: z.object({
    /** `endsAt` is the calendar end of the period; null for open-ended buckets and adjustment lines. */
    periods: z.array(z.object({period: nonEmpty, amount: money, endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()}).strict()).min(1),
    anchor: anchorSchema,
  }).strict().optional(),
  cash: z.object({
    cashAndEquivalents: z.object({value: money, anchor: anchorSchema}).strict(),
    financialInvestments: z.object({value: money, anchor: anchorSchema}).strict(),
    derivativeAssets: z.object({value: money, anchor: anchorSchema}).strict(),
    derivativeLiabilities: z.object({value: money, anchor: anchorSchema}).strict(),
  }).strict().optional(),
  /** The literal definitions with their sources; a view is computed only when its definition is here and agrees with the formula. */
  definitions: z.object({
    release: z.object({text: nonEmpty, anchor: anchorSchema}).strict().optional(),
    contractual: z.object({text: nonEmpty, anchor: anchorSchema}).strict().optional(),
  }).strict().default({}),
  releaseReportedNetDebt: z.object({value: money, anchor: anchorSchema}).strict().optional(),
  tolerance: toleranceSchema.default({value: "0"}),
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
type View = {value: string; definition: string; definitionSource: Anchor; components: Record<string, string>; componentAnchors: Record<string, Anchor>; rowsIncluded: string[]; residualAssumedZero: boolean};
type UncoveredField = "remuneration" | "maturity" | "guarantee" | "lender_formal_holder" | "lender_economic_creditors" | "classification";

export type DebtLedgerOutput = {
  schemaVersion: "method.build-debt-ledger.v5";
  referenceDate: string;
  priorDate: string | null;
  unit: string;
  source: "note" | "release_only";
  state: "complete" | "blocked" | "empty" | "incomplete";
  blockReasons: string[];
  incompleteReasons: string[];
  ledgerRows: Array<{
    id: string; instrument: string; series: string | null; obligation: Row["obligation"] | null; balance: string; priorBalance: string | null; currency: string;
    remuneration: Row["remuneration"]; maturity: string | null; guarantee: string | null; lender: Row["lender"]; classification: Row["classification"]; contra: boolean;
    anchors: Row["anchors"];
  }>;
  grossDebt: string;
  grossDebtPrior: string | null;
  grossDebtBeforeContra: string;
  reconciliation: {
    total: {state: "reconciled" | "difference" | "not_possible"; balanceSheetTotal: string | null; difference: string | null};
    split: {state: "reconciled" | "difference" | "not_possible"; currentDifference: string | null; nonCurrentDifference: string | null; reason: string | null};
    tolerance: {value: string; policyKey: string | null; policyVersion: string | null};
    anchor: Anchor | null;
  };
  schedule: {periods: Array<{period: string; amount: string; shareOfGross: string}>; total: string; matchesGross: boolean; currentPeriod: {period: string; amount: string; balanceSheetCurrent: string; difference: string; matches: boolean} | null; anchor: Anchor} | null;
  netDebtViews: {release: View | null; contractual: View | null; releaseReported: {value: string; differenceToRelease: string | null; anchor: Anchor} | null};
  byIndexer: Array<{indexer: string; balance: string; shareOfGrossBeforeContra: string; rows: string[]}>;
  byCurrency: Array<{currency: string; balance: string; shareOfGrossBeforeContra: string; rows: string[]}>;
  uncoveredTerms: Array<{rowId: string; field: UncoveredField; state: "insufficient_evidence"; reason: string}>;
  trace: {calculations: Array<{id: string; formula: string; operands: Record<string, string>; result: string}>; inputFingerprint: string; outputFingerprint: string};
};

const d = (value: Decimal.Value) => new Decimal(value);
const out = (value: Decimal) => value.toDecimalPlaces(8).toFixed();
const share = (part: Decimal, whole: Decimal) => (whole.isZero() ? "0" : out(part.div(whole)));
const fingerprint = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");
const indexerOf = (row: Row): string => row.remuneration === null ? "unknown" : row.remuneration.type === "fixed" ? "fixed" : row.remuneration.index;
const DERIVATIVES = /derivativ|derivative/;
const CASH = /caixa|disponibilidade|cash/;
const RESIDUAL = /outra rubrica que se refira a divida onerosa|outra divida onerosa|outras dividas onerosas|other onerous debt|divida onerosa/;

const DEBT = /emprestim|financiament|debenture|divida|debt|loan|borrowing/;
const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** What a definition adds and what it deducts: the text before the first "menos"/"less"/"minus" and the text after it. */
export function parseDefinition(text: string): {added: string; deducted: string | null} {
  const plain = normalize(text);
  const match = /\b(menos|less|minus|deduzid[oa]s?( de)?)\b/.exec(plain);
  if (!match) return {added: plain, deducted: null};
  return {added: plain.slice(0, match.index), deducted: plain.slice(match.index + match[0].length)};
}

/** The text of a definition must agree with the formula the view executes; a contradiction is a block, not a warning. */
function definitionDisagreement(name: "release" | "contractual", text: string): string | null {
  const parsed = parseDefinition(text);
  if (parsed.deducted === null) return `the ${name} definition never deducts anything; the view deducts cash and investments`;
  if (!DEBT.test(parsed.added)) return `the ${name} definition adds no debt line; the view sums loans, financings and debentures`;
  if (!CASH.test(parsed.deducted)) return `the ${name} definition does not deduct cash; the view deducts cash and equivalents`;
  if (CASH.test(parsed.added)) return `the ${name} definition adds cash; the view deducts it`;
  if (name === "release" && DERIVATIVES.test(plainText(text))) return "the release definition mentions derivatives; the release view executed excludes them";
  if (name === "contractual" && !DERIVATIVES.test(parsed.added)) return "the contractual definition adds no derivative liabilities; the contractual view executed adds them";
  if (name === "contractual" && !DERIVATIVES.test(parsed.deducted)) return "the contractual definition deducts no derivative assets; the contractual view executed deducts them";
  return null;
}
const plainText = (text: string) => normalize(text);

function canonical(input: z.infer<typeof debtLedgerInputSchema>) {
  return {
    ...input,
    rows: [...input.rows].sort((a, b) => compare(a.id, b.id)).map((row) => (row.obligation ? {...row, obligation: {...row.obligation, views: [...row.obligation.views].sort(compare)}} : row)),
    schedule: input.schedule ? {...input.schedule, periods: [...input.schedule.periods].sort((a, b) => compare(a.period, b.period))} : undefined,
  };
}

/** JSON with object keys sorted at every level, so the fingerprint ignores the order a caller wrote its keys in. */
export const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) => (inner && typeof inner === "object" && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => compare(a, b))) : inner));

export function buildDebtLedger(raw: DebtLedgerInput): DebtLedgerOutput {
  const input = canonical(debtLedgerInputSchema.parse(raw));
  const calculations: DebtLedgerOutput["trace"]["calculations"] = [];
  const rows = input.source === "release_only" ? [] : input.rows;
  const blockReasons: string[] = [];
  const incompleteReasons: string[] = [];
  const tolerance = d(input.tolerance.value);
  const toleranceOut = {value: input.tolerance.value, policyKey: input.tolerance.policyKey ?? null, policyVersion: input.tolerance.policyVersion ?? null};

  const balances = Object.fromEntries(rows.map((row) => [row.id, row.balance]));
  const gross = rows.reduce((sum, row) => sum.plus(row.balance), d(0));
  const grossBeforeContra = rows.filter((row) => !row.contra).reduce((sum, row) => sum.plus(row.balance), d(0));
  const priorKnown = rows.length > 0 && rows.every((row) => row.priorBalance !== null);
  const grossPrior = priorKnown ? rows.reduce((sum, row) => sum.plus(row.priorBalance!), d(0)) : null;
  calculations.push({id: "financial.debt_ledger_balance", formula: "sum(rows.balance)", operands: balances, result: out(gross)});
  calculations.push({id: "financial.debt_ledger_balance_before_contra", formula: "sum(rows.balance where not contra)", operands: Object.fromEntries(rows.filter((row) => !row.contra).map((row) => [row.id, row.balance])), result: out(grossBeforeContra)});
  if (grossPrior) calculations.push({id: "financial.debt_ledger_balance_prior", formula: "sum(rows.priorBalance)", operands: Object.fromEntries(rows.map((row) => [row.id, row.priorBalance!])), result: out(grossPrior)});

  if (input.source === "release_only") blockReasons.push("only a release is in the base; a ledger needs the debt note of the financial statements, so no row is produced");
  if (input.source === "note" && rows.length === 0 && !input.noDebtEvidence) blockReasons.push("no rows and no evidence that the company has no onerous debt: silence is not an empty ledger");
  if (input.noDebtEvidence && rows.length > 0) blockReasons.push("the base claims no onerous debt and the note carries rows; the contradiction blocks the ledger");
  if (rows.length === 0 && input.noDebtEvidence && input.balanceSheet && !d(input.balanceSheet.current).plus(input.balanceSheet.nonCurrent).isZero()) {
    blockReasons.push("the base claims no onerous debt but the balance sheet carries debt totals; the contradiction blocks the ledger");
  }

  let reconciliation: DebtLedgerOutput["reconciliation"] = {total: {state: "not_possible", balanceSheetTotal: null, difference: null}, split: {state: "not_possible", currentDifference: null, nonCurrentDifference: null, reason: "no balance sheet in the base"}, tolerance: toleranceOut, anchor: null};
  if (input.balanceSheet && rows.length > 0) {
    const sheetCurrent = d(input.balanceSheet.current);
    const sheetNonCurrent = d(input.balanceSheet.nonCurrent);
    const total = sheetCurrent.plus(sheetNonCurrent);
    const difference = gross.minus(total);
    const within = difference.abs().lte(tolerance);
    calculations.push({id: "financial.accounting_identity", formula: "sum(rows.balance) - (balanceSheet.current + balanceSheet.nonCurrent)", operands: {ledger: out(gross), balanceSheetCurrent: out(sheetCurrent), balanceSheetNonCurrent: out(sheetNonCurrent), tolerance: input.tolerance.value}, result: out(difference)});
    if (!within) blockReasons.push(`ledger total ${out(gross)} differs from the balance sheet ${out(total)} by ${out(difference)}, above the tolerance ${input.tolerance.value}`);
    let split: DebtLedgerOutput["reconciliation"]["split"] = {state: "not_possible", currentDifference: null, nonCurrentDifference: null, reason: "not every row carries its current and non-current split"};
    if (rows.every((row) => row.classification !== null)) {
      const current = rows.reduce((sum, row) => sum.plus(row.classification!.current), d(0));
      const nonCurrent = rows.reduce((sum, row) => sum.plus(row.classification!.nonCurrent), d(0));
      const currentDifference = current.minus(sheetCurrent);
      const nonCurrentDifference = nonCurrent.minus(sheetNonCurrent);
      calculations.push({id: "financial.accounting_identity:split", formula: "(sum(rows.current) - balanceSheet.current, sum(rows.nonCurrent) - balanceSheet.nonCurrent)", operands: {rowsCurrent: out(current), rowsNonCurrent: out(nonCurrent), balanceSheetCurrent: out(sheetCurrent), balanceSheetNonCurrent: out(sheetNonCurrent)}, result: `${out(currentDifference)},${out(nonCurrentDifference)}`});
      const splitWithin = currentDifference.abs().lte(tolerance) && nonCurrentDifference.abs().lte(tolerance);
      split = {state: splitWithin ? "reconciled" : "difference", currentDifference: out(currentDifference), nonCurrentDifference: out(nonCurrentDifference), reason: null};
      if (!splitWithin) blockReasons.push(`the split of the rows differs from the balance sheet (current ${out(currentDifference)}, non-current ${out(nonCurrentDifference)}); a compensating error between the two is not a reconciliation`);
    }
    reconciliation = {total: {state: within ? "reconciled" : "difference", balanceSheetTotal: out(total), difference: out(difference)}, split, tolerance: toleranceOut, anchor: input.balanceSheet.anchor};
  } else if (rows.length > 0) {
    incompleteReasons.push("no balance sheet totals in the base: the ledger is not reconciled");
  }

  let schedule: DebtLedgerOutput["schedule"] = null;
  if (input.schedule && rows.length > 0) {
    const total = input.schedule.periods.reduce((sum, period) => sum.plus(period.amount), d(0));
    const matchesGross = total.eq(gross);
    calculations.push({id: "financial.maturity_buckets", formula: "sum(schedule.periods.amount) - sum(rows.balance)", operands: {...Object.fromEntries(input.schedule.periods.map((period) => [`period:${period.period}`, period.amount])), ledger: out(gross)}, result: out(total.minus(gross))});
    if (!matchesGross) blockReasons.push(`schedule total ${out(total)} differs from the ledger total ${out(gross)}`);
    let currentPeriod: NonNullable<DebtLedgerOutput["schedule"]>["currentPeriod"] = null;
    const horizon = new Date(`${input.referenceDate}T00:00:00Z`); horizon.setUTCFullYear(horizon.getUTCFullYear() + 1);
    const dated = input.schedule.periods.filter((entry) => entry.endsAt !== null).sort((a, b) => compare(a.endsAt!, b.endsAt!));
    const first = dated[0];
    if (first && first.endsAt! <= horizon.toISOString().slice(0, 10) && input.balanceSheet) {
      const difference = d(first.amount).minus(input.balanceSheet.current);
      const matches = difference.abs().lte(tolerance);
      calculations.push({id: "financial.maturity_buckets:current", formula: "schedule[earliest endsAt within twelve months].amount - balanceSheet.current", operands: {period: first.period, endsAt: first.endsAt!, amount: first.amount, balanceSheetCurrent: input.balanceSheet.current}, result: out(difference)});
      currentPeriod = {period: first.period, amount: out(d(first.amount)), balanceSheetCurrent: out(d(input.balanceSheet.current)), difference: out(difference), matches};
      if (!matches) blockReasons.push(`the first period of the schedule (${first.period}, ending ${first.endsAt}: ${first.amount}) differs from the current liabilities ${input.balanceSheet.current} by ${out(difference)}; a schedule that only matches in total is not checked`);
    } else if (rows.length > 0) {
      incompleteReasons.push(first ? "the schedule's first period is not checked against the current liabilities (no period ends within twelve months, or no balance sheet)" : "the schedule's periods carry no end dates; the first period is not checked against the current liabilities");
    }
    schedule = {periods: input.schedule.periods.map((period) => ({period: period.period, amount: out(d(period.amount)), shareOfGross: share(d(period.amount), gross)})), total: out(total), matchesGross, currentPeriod, anchor: input.schedule.anchor};
  } else if (rows.length > 0) {
    incompleteReasons.push("no maturity schedule with an anchor in the base");
  }

  const view = (name: "release" | "contractual", definition: {text: string; anchor: Anchor}): View => {
    const included = rows.filter((row) => row.contra || row.obligation!.views.includes(name));
    const debt = included.reduce((sum, row) => sum.plus(row.balance), d(0));
    calculations.push({id: `financial.debt_views:${name}:debt`, formula: "sum(rows.balance where row in view)", operands: Object.fromEntries(included.map((row) => [row.id, row.balance])), result: out(debt)});
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
    calculations.push({id: `financial.debt_views:${name}`, formula, operands, result: out(value)});
    return {value: out(value), definition: definition.text, definitionSource: definition.anchor, components: operands, componentAnchors: anchors, rowsIncluded: included.map((row) => row.id), residualAssumedZero: name === "contractual" && RESIDUAL.test(normalize(definition.text))};
  };
  const netDebtViews: DebtLedgerOutput["netDebtViews"] = {release: null, contractual: null, releaseReported: null};
  if (rows.length > 0) {
    if (!input.cash) incompleteReasons.push("no cash, investments and derivatives in the base: net debt views are not computed");
    else {
      for (const name of ["release", "contractual"] as const) {
        const definition = input.definitions[name];
        if (!definition) { incompleteReasons.push(`no ${name} definition with a source: the ${name} view is not computed`); continue; }
        const disagreement = definitionDisagreement(name, definition.text);
        if (disagreement) { blockReasons.push(disagreement); continue; }
        netDebtViews[name] = view(name, definition);
      }
    }
    if (input.releaseReportedNetDebt) {
      const reported = d(input.releaseReportedNetDebt.value);
      const differenceToRelease = netDebtViews.release ? reported.minus(netDebtViews.release.value) : null;
      if (differenceToRelease) calculations.push({id: "financial.debt_views:release:reported_difference", formula: "releaseReportedNetDebt - releaseView", operands: {releaseReportedNetDebt: out(reported), releaseView: netDebtViews.release!.value}, result: out(differenceToRelease)});
      netDebtViews.releaseReported = {value: out(reported), differenceToRelease: differenceToRelease ? out(differenceToRelease) : null, anchor: input.releaseReportedNetDebt.anchor};
    }
  }

  const group = (dimension: string, key: (row: Row) => string) => {
    const map = new Map<string, {balance: Decimal; rows: Row[]}>();
    for (const row of rows) {
      if (row.contra) continue;
      const entry = map.get(key(row)) ?? {balance: d(0), rows: []};
      entry.balance = entry.balance.plus(row.balance);
      entry.rows.push(row);
      map.set(key(row), entry);
    }
    return [...map.entries()].sort(([a], [b]) => compare(a, b)).map(([label, entry]) => {
      calculations.push({id: `financial.debt_ledger_group:${dimension}:${label}`, formula: "sum(rows.balance in group) ; share = group / grossBeforeContra", operands: {...Object.fromEntries(entry.rows.map((row) => [row.id, row.balance])), grossBeforeContra: out(grossBeforeContra)}, result: `${out(entry.balance)};${share(entry.balance, grossBeforeContra)}`});
      return {label, balance: out(entry.balance), shareOfGrossBeforeContra: share(entry.balance, grossBeforeContra), rows: entry.rows.map((row) => row.id)};
    });
  };

  const uncoveredTerms: DebtLedgerOutput["uncoveredTerms"] = [];
  for (const row of rows) {
    if (row.contra) continue;
    const label = `${row.instrument}${row.series ? ` ${row.series}` : ""}`;
    if (row.remuneration === null) uncoveredTerms.push({rowId: row.id, field: "remuneration", state: "insufficient_evidence", reason: `no source in the base states the remuneration of ${label}; the currency is not an indexer`});
    if (row.maturity === null) uncoveredTerms.push({rowId: row.id, field: "maturity", state: "insufficient_evidence", reason: `no source in the base states the maturity of ${label}`});
    if (row.guarantee === null) uncoveredTerms.push({rowId: row.id, field: "guarantee", state: "insufficient_evidence", reason: `no source in the base states the guarantee of ${label}`});
    if (!row.lender?.formalHolder) uncoveredTerms.push({rowId: row.id, field: "lender_formal_holder", state: "insufficient_evidence", reason: `no source in the base states the formal holder of ${label}`});
    if (!row.lender?.economicCreditors) uncoveredTerms.push({rowId: row.id, field: "lender_economic_creditors", state: "insufficient_evidence", reason: `no source in the base states who economically decides for ${label}`});
    if (row.classification === null) uncoveredTerms.push({rowId: row.id, field: "classification", state: "insufficient_evidence", reason: `the note gives current and non-current totals, not the split of ${label}`});
  }

  const state: DebtLedgerOutput["state"] = blockReasons.length > 0
    ? "blocked"
    : rows.length === 0
      ? "empty"
      : incompleteReasons.length > 0 ? "incomplete" : "complete";
  const body = {
    schemaVersion: "method.build-debt-ledger.v5" as const,
    referenceDate: input.referenceDate, priorDate: input.priorDate, unit: input.unit, source: input.source, state, blockReasons, incompleteReasons,
    ledgerRows: rows.map((row) => ({
      id: row.id, instrument: row.instrument, series: row.series ?? null, obligation: row.obligation ?? null, balance: out(d(row.balance)), priorBalance: row.priorBalance === null ? null : out(d(row.priorBalance)),
      currency: row.currency, remuneration: row.remuneration, maturity: row.maturity, guarantee: row.guarantee, lender: row.lender, classification: row.classification, contra: row.contra, anchors: row.anchors,
    })),
    grossDebt: out(gross), grossDebtPrior: grossPrior ? out(grossPrior) : null, grossDebtBeforeContra: out(grossBeforeContra),
    reconciliation, schedule, netDebtViews,
    byIndexer: group("indexer", indexerOf).map(({label, ...rest}) => ({indexer: label, ...rest})),
    byCurrency: group("currency", (row) => row.currency).map(({label, ...rest}) => ({currency: label, ...rest})),
    uncoveredTerms,
  };
  return {...body, trace: {calculations, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(body)}};
}
