import {customers, debt, interim2026} from "./truth";

/**
 * The receivables tape and aging of Aurora at 31/07/2026 (Case 03), synthetic and declared: the
 * balance ties to the interim balance sheet, the concentration follows the 2025 customer file, the
 * public-sector debtor pays late, and the encumbrances tie to the debt map (duplicatas pledged at
 * 130% to Itaú and 125% to Santander; receivables assigned to BTG). Every number below is derived
 * from those declared rules by a seeded generator, never typed by hand.
 */
export const receivablesReferenceDate = "2026-07-31";
export const receivablesTotal = interim2026.receivables;
export const receivablesLabel = "FIXTURE SINTÉTICA PARA TESTE DE PLATAFORMA. Carteira de recebíveis inventada, calibrada ao balancete de julho de 2026 da Aurora (empresa fictícia).";

export type AgingBucket = "current" | "days_1_30" | "days_31_60" | "days_61_90" | "days_91_plus";
export const agingBuckets: readonly AgingBucket[] = ["current", "days_1_30", "days_31_60", "days_61_90", "days_91_plus"];
const daysPastDueOf: Record<AgingBucket, number> = {current: 0, days_1_30: 15, days_31_60: 45, days_61_90: 75, days_91_plus: 120};

/** Aging profile by debtor class (shares of the debtor's balance). */
const profiles: Record<"private" | "public", Record<AgingBucket, number>> = {
  private: {current: 0.78, days_1_30: 0.12, days_31_60: 0.05, days_61_90: 0.025, days_91_plus: 0.025},
  public: {current: 0.6, days_1_30: 0.2, days_31_60: 0.1, days_61_90: 0.05, days_91_plus: 0.05},
};

export type ReceivablesDebtor = {id: string; name: string; share: number; sector: "private" | "public"; terms: string};

/** The five named customers keep their 2025 revenue shares; forty small debtors share the rest on a decreasing scale. */
export function receivablesDebtors(): ReceivablesDebtor[] {
  const named = customers.map((customer, index) => ({id: `D${String(index + 1).padStart(2, "0")}`, name: customer.name, share: customer.share, sector: customer.name.startsWith("Prefeitura") ? "public" as const : "private" as const, terms: customer.terms}));
  const rest = 1 - named.reduce((sum, debtor) => sum + debtor.share, 0);
  const weights = Array.from({length: 40}, (_, index) => 1 / (index + 6));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const small = weights.map((weight, index) => ({id: `D${String(index + 6).padStart(2, "0")}`, name: `Cliente ${String(index + 6).padStart(2, "0")} (revenda regional)`, share: (rest * weight) / weightTotal, sector: "private" as const, terms: index % 3 === 0 ? "30 dias" : "45 dias"}));
  return [...named, ...small];
}

/** Encumbrances from the debt map: pledged duplicatas cover the bank lines at their coverage ratios; BTG holds assigned receivables. */
export const encumbrances = [
  {contract: "Banco Itaú, capital de giro", kind: "pledged" as const, amount: Math.round(debt[0].outstanding * 1.3), rule: "duplicatas 130% do saldo (mapa de dívida)"},
  {contract: "Banco Santander, capital de giro", kind: "pledged" as const, amount: Math.round(debt[2].outstanding * 1.25), rule: "duplicatas 125% do saldo (mapa de dívida)"},
  {contract: "BTG Pactual, antecipação de recebíveis", kind: "assigned" as const, amount: debt[5].outstanding, rule: "recebíveis cedidos (mapa de dívida)"},
] as const;

export type TapeRow = {receivableId: string; debtorId: string; debtorName: string; sector: "private" | "public"; balance: number; bucket: AgingBucket; daysPastDue: number; dueDate: string; encumbrance: "free" | "pledged" | "assigned"; contract: string | null};

const lcg = (seed: number) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const isoDaysBefore = (reference: string, days: number) => { const date = new Date(`${reference}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - days); return date.toISOString().slice(0, 10); };

/** Splits an integer amount into `parts` integers that sum exactly to it, with a seeded spread. */
function split(amount: number, parts: number, random: () => number): number[] {
  if (parts <= 1) return [amount];
  const weights = Array.from({length: parts}, () => 0.5 + random());
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const values = weights.map((weight) => Math.floor((amount * weight) / total));
  values[values.length - 1]! += amount - values.reduce((sum, value) => sum + value, 0);
  return values;
}

/** The tape: every duplicata with debtor, bucket, due date and encumbrance; balances tie to the interim balance sheet exactly. */
export function buildReceivablesTape(): TapeRow[] {
  const random = lcg(20260731);
  const debtors = receivablesDebtors();
  const balances = debtors.map((debtor) => Math.floor(receivablesTotal * debtor.share));
  balances[balances.length - 1]! += receivablesTotal - balances.reduce((sum, value) => sum + value, 0);
  const rows: TapeRow[] = [];
  let sequence = 0;
  debtors.forEach((debtor, index) => {
    const profile = profiles[debtor.sector];
    const byBucket = agingBuckets.map((bucket) => Math.floor(balances[index]! * profile[bucket]));
    byBucket[0]! += balances[index]! - byBucket.reduce((sum, value) => sum + value, 0);
    agingBuckets.forEach((bucket, bucketIndex) => {
      const amount = byBucket[bucketIndex]!;
      if (amount <= 0) return;
      const parts = Math.min(25, Math.max(1, Math.round(amount / 120_000)));
      for (const balance of split(amount, parts, random)) {
        sequence += 1;
        const daysPastDue = daysPastDueOf[bucket];
        const dueDate = bucket === "current" ? isoDaysBefore(receivablesReferenceDate, -(15 + (sequence % 45))) : isoDaysBefore(receivablesReferenceDate, daysPastDue);
        rows.push({receivableId: `DUP-${String(sequence).padStart(6, "0")}`, debtorId: debtor.id, debtorName: debtor.name, sector: debtor.sector, balance, bucket, daysPastDue, dueDate, encumbrance: "free", contract: null});
      }
    });
  });
  // Encumbrances take current receivables in debtor order, the assigned slice from the second and fourth debtors (the bank keeps the best names).
  const take = (kind: "pledged" | "assigned", contract: string, amount: number, debtorIds: string[] | null) => {
    let remaining = amount;
    for (const row of rows) {
      if (remaining <= 0) break;
      if (row.encumbrance !== "free" || row.bucket !== "current") continue;
      if (debtorIds && !debtorIds.includes(row.debtorId)) continue;
      if (row.balance > remaining) continue;
      row.encumbrance = kind; row.contract = contract; remaining -= row.balance;
    }
    return amount - remaining;
  };
  const covered = [
    take("assigned", encumbrances[2].contract, encumbrances[2].amount, ["D02", "D04"]),
    take("pledged", encumbrances[0].contract, encumbrances[0].amount, null),
    take("pledged", encumbrances[1].contract, encumbrances[1].amount, null),
  ];
  if (covered.some((value, index) => Math.abs(value - [encumbrances[2].amount, encumbrances[0].amount, encumbrances[1].amount][index]!) > 150_000)) throw new Error(`encumbrances not placed: ${covered.join(", ")}`);
  return rows;
}

export function agingByDebtor(rows: readonly TapeRow[]) {
  const map = new Map<string, {debtorId: string; debtorName: string; sector: string; total: number; buckets: Record<AgingBucket, number>}>();
  for (const row of rows) {
    const entry = map.get(row.debtorId) ?? {debtorId: row.debtorId, debtorName: row.debtorName, sector: row.sector, total: 0, buckets: {current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_91_plus: 0}};
    entry.total += row.balance; entry.buckets[row.bucket] += row.balance; map.set(row.debtorId, entry);
  }
  return [...map.values()].sort((a, b) => b.total - a.total || (a.debtorId < b.debtorId ? -1 : 1));
}
