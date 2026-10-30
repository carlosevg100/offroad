import {readFileSync} from "node:fs";
import type {OriginatorCreditReviewFacts} from "./originator-credit-review";

const sourceCase = JSON.parse(readFileSync(new URL("../../testing-fixtures/gold/fidc-originator/input/source-case.json", import.meta.url), "utf8"));
const prepared = JSON.parse(readFileSync(new URL("../../testing-fixtures/gold/fidc-originator/input/credit.json", import.meta.url), "utf8")).input;

/** Synthetic documentary literals for the source-normalization layer; not a native-file acceptance receipt. */
export function originatorCreditReviewFixture(): OriginatorCreditReviewFacts {
  const sources: OriginatorCreditReviewFacts["sources"] = [], contexts: OriginatorCreditReviewFacts["contexts"] = [];
  const sourceNumbers = new Map<string, number>();
  const identifier = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;
  function atom(value: string, sourceId: string, unit: "currency" | "ratio" | "multiple" | "count" = "currency") {
    if (!sourceNumbers.has(sourceId)) {
      const n = sourceNumbers.size + 1; sourceNumbers.set(sourceId, n);
      sources.push({id: sourceId, documentId: identifier(n), sourceVersionId: identifier(n + 100), sha256: n.toString(16).repeat(64).slice(0, 64), anchor: "page:1", quote: "Synthetic source; values in BRL currency units; ", origin: "provided_document", consultedAt: "2026-10-29"});
    }
    sources.find(s => s.id === sourceId)!.quote += `value=${value}; `;
    const contextId = sourceId + "-" + unit;
    if (!contexts.some(c => c.id === contextId)) contexts.push({id: contextId, sourceId, unit, notation: "decimal_notation", currency: unit === "currency" ? "BRL" : null, declaredScale: unit === "currency" ? "1" : null, representation: unit === "currency" ? "already_in_currency_units" : null, ratioConvention: unit === "ratio" ? "fraction" : null});
    return {literal: value, sourceId, contextId};
  }
  const a = (value: string) => atom(value, "statements");
  const b = sourceCase.balance_september;
  const statement = (period: string, start: string, end: string) => {
    const s = sourceCase.annual.find((p: {period: string}) => p.period === period);
    return {entityId: "synthetic-cedent", perimeter: "standalone", currency: "BRL", start, end, grossRevenue: a(s.gross), deductions: a(s.deductions), netRevenue: a(s.net), ebitda: a(s.ebitda)};
  };
  const p = prepared.policy;
  const pn = (value: string, unit: "currency" | "ratio" | "multiple" | "count" = "currency") => atom(value, "policy", unit);
  const r = sourceCase.receivables_bridge, rn = (value: string) => atom(value, "receivables-movements");
  return {
    entityId: "synthetic-cedent", perimeter: "standalone", currency: "BRL", analysisDate: sourceCase.analysis_date, reportingDate: sourceCase.reporting_date,
    sources, contexts,
    request: {fundProgramId: "synthetic-program", operationStartDate: sourceCase.analysis_date, requestedTermDays: 120, requestedAdditionalFace: "3000000", currentFundFaceExposure: "500000", regulationTotalFaceCap: "5000000"},
    financials: {priorFullYear: statement("2025", "2025-01-01", "2025-12-31"), priorComparable: statement("2025-01/09", "2025-01-01", "2025-09-30"), currentComparable: statement("2026-01/09", "2026-01-01", "2026-09-30"), historical: [statement("2024", "2024-01-01", "2024-12-31")],
      balance: {asOf: "2026-09-30", cash: a(b.cash), restrictedCash: a(b.restricted_cash), receivables: a(b.receivables), impairmentAllowance: a(b.pdd), inventory: a(b.inventory), otherCurrentAssets: a(b.other_current_assets), fixedAssets: a(b.fixed_assets), bankDebt: a(b.bank_debt), nonbankRecourse: a(b.nonbank_recourse), suppliers: a(b.suppliers), taxDebt: a(b.tax_debt), otherLiabilities: a(b.other_liabilities), equity: a(b.equity)},
      bankLinesAsOf: "2026-09-30", bankLines: sourceCase.bank_lines.map((l: {id: string; used: string; limit: string}) => ({id: l.id, used: atom(l.used, "bank-lines"), limit: atom(l.limit, "bank-lines")})),
      scr: {asOf: "2026-09-30", utilizedDebt: atom(sourceCase.scr.current_used, "scr"), pastDue: atom(sourceCase.scr.past_due, "scr"), lossClassified: atom(sourceCase.scr.loss_classified, "scr")}},
    portfolio: {entityId: "synthetic-cedent", asOf: "2026-09-30", groupMappingConfirmed: true, supportsAdditionalExposure: true, rows: prepared.titles.map((t: Record<string, string | boolean | null>) => ({...t, face: atom(String(t.face), "portfolio")}))},
    cashBeforeNewCoobligation: sourceCase.cash_dates.map((date: string, i: number) => ({date, amount: atom(sourceCase.cash_before_new_coobligation[i], "cash-plan")})),
    reconciliation: {entityId: "synthetic-cedent", perimeter: "standalone", periodStart: "2026-01-01", periodEnd: "2026-09-30",
      monthlyGrossRevenue: sourceCase.monthly_gross.map((amount: string, i: number) => ({month: `2026-${String(i + 1).padStart(2, "0")}`, amount: atom(amount, "sales")})),
      salesByGroup: sourceCase.sales_abc.map(([groupId, amount]: string[]) => ({groupId, amount: atom(amount!, "sales")})),
      receivables: {opening: rn(r.opening), issued: rn(r.issued), debtorCollections: rn(r.debtor_collections), repurchases: rn(r.repurchases), dilution: rn(r.dilution), writeoffs: rn(r.writeoffs), closing: rn(r.closing)},
      impairment: {opening: rn(r.pdd_open), additions: rn(r.pdd_additions), reversals: rn(r.pdd_reversals), usedOnWriteoffs: rn(r.pdd_used_on_writeoffs), closing: rn(r.pdd_close), olderWriteoffRecoveries: rn(r.older_writeoff_recoveries)}, cancellationScenario: null},
    policy: {fundProgramId: "synthetic-program", sourceId: "policy", effectiveFrom: p.effectiveFrom, effectiveUntil: p.effectiveUntil,
      financialMaxAgeDays: pn(String(p.financialMaxAgeDays), "count"), scrMaxAgeDays: pn(String(p.scrMaxAgeDays), "count"), tapeMaxAgeDays: pn(String(p.tapeMaxAgeDays), "count"), maxTermDays: pn(String(p.maxTermDays), "count"),
      groupFaceCap: pn(p.groupFaceCap), cashFloor: pn(p.cashFloor), coobligationStressRatio: pn(p.coobligationStressRatio, "ratio"), severeStressRatio: pn(p.severeStressRatio, "ratio"), exclusionPriority: p.exclusionPriority,
      declineOnScrPastDue: p.declineOnScrPastDue, declineOnScrLoss: p.declineOnScrLoss,
      scoring: p.scoring.map((r: {metric: "netDebtToEbitda" | "originalPastDueRatio" | "largestGroupRatio"; bands: Array<{upperInclusive: string | null; points: number}>}) => ({metric: r.metric, bands: r.bands.map(b => ({upperInclusive: b.upperInclusive === null ? null : pn(b.upperInclusive, r.metric === "netDebtToEbitda" ? "multiple" : "ratio"), points: pn(String(b.points), "count")}))})),
      grades: p.grades.map((g: {grade: string; maxScore: number | null; totalFaceCap: string}) => ({grade: g.grade, maxScore: g.maxScore === null ? null : pn(String(g.maxScore), "count"), totalFaceCap: pn(g.totalFaceCap)})),
    },
  } as OriginatorCreditReviewFacts;
}
