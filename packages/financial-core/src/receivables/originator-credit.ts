import Decimal from "decimal.js";
import {decimal, full, requireNonNegative, requireUnitInterval, sum, ZERO, type ReceivablesPoolKernelTrace} from "./pool-shared";
import {originatorDay as day} from "./originator-shared";

export const originatorCreditKernelVersion = "2026.10.30-v1";
type Money = string;
type DateText = string;
export type OriginatorTitle = {
  reference: string; debtorId: string; groupId: string; issueDate: DateText;
  originalDueDate: DateText; currentDueDate: DateText; face: Money;
  assignment: "free" | "assigned" | "unknown";
  invoice: "active" | "cancelled" | "unknown";
  delivery: "verified" | "missing" | "unknown";
  relatedParty: boolean | null;
};
export const originatorExclusionReasons = ["prior_assignment", "related_party", "invoice_cancelled", "original_arrears", "delivery_unverified", "term_exceeded", "unknown_evidence", "outside_reporting_date", "zero_balance"] as const;
export type OriginatorExclusionReason = typeof originatorExclusionReasons[number];
export type OriginatorScoringMetric = "netDebtToEbitda" | "originalPastDueRatio" | "largestGroupRatio";
export type OriginatorCreditPolicy = {
  effectiveFrom: DateText; effectiveUntil: DateText | null;
  financialMaxAgeDays: number; scrMaxAgeDays: number; tapeMaxAgeDays: number;
  maxTermDays: number; groupFaceCap: Money;
  exclusionPriority: readonly OriginatorExclusionReason[];
  scoring: ReadonlyArray<{metric: OriginatorScoringMetric; bands: ReadonlyArray<{upperInclusive: string | null; points: number}>}>;
  grades: ReadonlyArray<{grade: string; maxScore: number | null; totalFaceCap: Money}>;
  declineOnScrPastDue: boolean; declineOnScrLoss: boolean;
  cashFloor: Money; coobligationStressRatio: string; severeStressRatio: string;
};
export type OriginatorFinancialPosition = {
  /** Utilized bank debt; unused commitments are supplied separately and never added. */
  bankUsed: Money; unusedBankLimits: Money; additionalRecourseDebt: Money; taxDebt: Money;
  cash: Money; restrictedCash: Money; ebitdaLtm: string;
  financialDate: DateText; scrDate: DateText; tapeDate: DateText;
  scrPastDue: Money; scrLossClassified: Money;
};
export type OriginatorCreditInput = {
  analysisDate: DateText; reportingDate: DateText; operationStartDate: DateText; requestedTermDays: number;
  requestedAdditionalFace: Money; currentFundFaceExposure: Money; regulationTotalFaceCap: Money;
  /** The caller must confirm that the selected unencumbered pool supports additional exposure. */
  poolSupportsAdditionalExposure: boolean;
  financials: OriginatorFinancialPosition; titles: readonly OriginatorTitle[];
  /** Already includes existing obligations; only NEW coobligation is stressed. */
  cashBeforeNewCoobligation: ReadonlyArray<{date: DateText; amount: Money}>;
  policy: OriginatorCreditPolicy | null;
};
export type OriginatorCreditResult = {
  version: typeof originatorCreditKernelVersion;
  analysisDate: DateText; reportingDate: DateText; operationStartDate: DateText; requestedTermDays: number;
  decisionAuthority: "committee";
  status: "not_evaluated" | "needs_evidence" | "recommend_decline" | "no_additional_capacity" | "recommend_conditional";
  gaps: string[]; vetoes: string[];
  metrics: {
    rawRows: number; uniqueTitles: number; duplicateRows: number;
    rawFace: string; uniqueFace: string; duplicateFace: string;
    originalPastDueFace: string; currentPastDueFace: string; originalPastDueRatio: string;
    largestGroupFace: string; topFiveGroupsFace: string; largestGroupRatio: string; hhi: string;
    adjustedDebt: string; freeCash: string; netDebt: string; unusedBankLimits: string;
    netDebtToEbitda: string | null;
  };
  eligibility: null | {
    preliminaryFace: string; eligibleFace: string;
    accepted: Array<{reference: string; debtorId: string; issueDate: DateText; face: string}>;
    excluded: Array<{reference: string; debtorId: string; issueDate: DateText; reason: OriginatorExclusionReason | "concentration"; face: string}>;
  };
  rating: null | {points: number; grade: string; totalFaceCap: string};
  capacity: null | {
    ratingHeadroom: string; regulationHeadroom: string; collateralHeadroom: string;
    liquidityHeadroom: string | null; additionalFace: string; resultingTotalFace: string;
    minimumCashBeforeNewStress: string; stressedMinimumCash: string; headroomAboveCashFloor: string;
    severeMinimumCash: string; severeDeficit: string; requestedFaceCashDeficit: string;
    maturityCashAfterStress: string | null; requestedMinimumCash: string; requestedMaturityCashAfterStress: string | null;
  };
  traces: ReceivablesPoolKernelTrace[];
};

const id = (v: string) => {if (typeof v !== "string" || !v.trim()) throw new RangeError("originator_identity_required"); return v;};
function finite(v: string): Decimal {const d = decimal(v); if (!d.isFinite()) throw new RangeError("originator_non_finite_number"); return d;}
function integer(v: number, positive = false): number {
  if (!Number.isSafeInteger(v) || v < (positive ? 1 : 0)) throw new RangeError("originator_invalid_day_or_score");
  return v;
}
const money = (v: Money) => requireNonNegative("originator_amount", v);
const positivePart = (v: Decimal) => Decimal.max(ZERO, v);
function ratio(a: Decimal, b: Decimal): Decimal {return b.isZero() ? ZERO : a.div(b);}
const trace = (name: string, formula: string, operands: Record<string, string>, result: Decimal): ReceivablesPoolKernelTrace => ({id: `receivables.originator.${name}`, formula, operands, result: full(result)});

function validatePolicy(p: OriginatorCreditPolicy): void {
  day(p.effectiveFrom); if (p.effectiveUntil !== null && day(p.effectiveUntil) < day(p.effectiveFrom)) throw new RangeError("originator_policy_dates");
  for (const n of [p.financialMaxAgeDays, p.scrMaxAgeDays, p.tapeMaxAgeDays]) integer(n);
  integer(p.maxTermDays, true); money(p.groupFaceCap); money(p.cashFloor);
  requireUnitInterval("originator_stress", p.coobligationStressRatio); requireUnitInterval("originator_severe_stress", p.severeStressRatio);
  if (decimal(p.severeStressRatio).lt(p.coobligationStressRatio)) throw new RangeError("originator_severe_stress_below_base");
  if (p.exclusionPriority.length !== originatorExclusionReasons.length || new Set(p.exclusionPriority).size !== originatorExclusionReasons.length || originatorExclusionReasons.some(x => !p.exclusionPriority.includes(x))) throw new RangeError("originator_exclusion_order_incomplete");
  const metrics = new Set<string>();
  for (const rule of p.scoring) {
    if (!["netDebtToEbitda", "originalPastDueRatio", "largestGroupRatio"].includes(rule.metric) || metrics.has(rule.metric) || !rule.bands.length) throw new RangeError("originator_score_rule_invalid");
    metrics.add(rule.metric);
    let previous: Decimal | null = null;
    for (const [i, band] of rule.bands.entries()) {
      integer(band.points);
      if (band.upperInclusive === null) {if (i !== rule.bands.length - 1) throw new RangeError("originator_score_bands_invalid");}
      else {const bound = finite(band.upperInclusive); if (previous !== null && bound.lte(previous)) throw new RangeError("originator_score_bands_invalid"); previous = bound;}
    }
    if (rule.bands.at(-1)?.upperInclusive !== null) throw new RangeError("originator_score_bands_incomplete");
  }
  if (!p.scoring.length || !p.grades.length) throw new RangeError("originator_rating_policy_missing");
  let previousScore = -1; const grades = new Set<string>();
  for (const [i, grade] of p.grades.entries()) {
    if (grades.has(id(grade.grade))) throw new RangeError("originator_grade_duplicate"); grades.add(grade.grade); money(grade.totalFaceCap);
    if (grade.maxScore === null) {if (i !== p.grades.length - 1) throw new RangeError("originator_grades_invalid");}
    else {integer(grade.maxScore); if (grade.maxScore <= previousScore) throw new RangeError("originator_grades_invalid"); previousScore = grade.maxScore;}
  }
  if (p.grades.at(-1)?.maxScore !== null) throw new RangeError("originator_grades_incomplete");
}

/** The policy is supplied evidence. This kernel has no default rating, veto or monetary cap. */
export function analyzeOriginatorCredit(input: OriginatorCreditInput): OriginatorCreditResult {
  const analysisDay = day(input.analysisDate), reportDay = day(input.reportingDate), operationDay = day(input.operationStartDate);
  if (reportDay > analysisDay) throw new RangeError("originator_future_reporting_date");
  integer(input.requestedTermDays, true);
  const requested = money(input.requestedAdditionalFace), current = money(input.currentFundFaceExposure), regulation = money(input.regulationTotalFaceCap);
  const f = input.financials, ebitda = finite(f.ebitdaLtm), bank = money(f.bankUsed), unused = money(f.unusedBankLimits);
  const cash = money(f.cash), restricted = money(f.restrictedCash);
  if (restricted.gt(cash)) throw new RangeError("originator_restricted_cash_exceeds_cash");
  const adjustedDebt = bank.plus(money(f.additionalRecourseDebt)).plus(money(f.taxDebt));
  const freeCash = cash.minus(restricted), netDebt = adjustedDebt.minus(freeCash);
  const leverage = ebitda.gt(0) ? netDebt.div(ebitda) : null;
  money(f.scrPastDue); money(f.scrLossClassified);
  for (const d of [f.financialDate, f.scrDate, f.tapeDate]) if (day(d) > analysisDay) throw new RangeError("originator_future_source_date");
  const unique = new Map<string, OriginatorTitle>(), groups = new Map<string, Decimal>();
  let rawFace = ZERO, uniqueFace = ZERO, originalPastDue = ZERO, currentPastDue = ZERO;
  for (const title of input.titles) {
    id(title.reference); id(title.debtorId); id(title.groupId); const amount = money(title.face);
    const issued = day(title.issueDate); if (day(title.originalDueDate) < issued || day(title.currentDueDate) < issued) throw new RangeError("originator_title_dates_invalid");
    if (!["free", "assigned", "unknown"].includes(title.assignment) || !["active", "cancelled", "unknown"].includes(title.invoice) || !["verified", "missing", "unknown"].includes(title.delivery) || ![true, false, null].includes(title.relatedParty)) throw new RangeError("originator_title_evidence_invalid");
    rawFace = rawFace.plus(amount);
    const key = JSON.stringify([title.reference, title.debtorId, title.issueDate]);
    const existing = unique.get(key);
    if (existing) {
      if (!money(existing.face).eq(amount) || ["groupId", "originalDueDate", "currentDueDate", "assignment", "invoice", "delivery", "relatedParty"].some(k => existing[k as keyof OriginatorTitle] !== title[k as keyof OriginatorTitle])) throw new RangeError("originator_duplicate_conflict");
      continue;
    }
    unique.set(key, title); uniqueFace = uniqueFace.plus(amount);
    groups.set(title.groupId, (groups.get(title.groupId) ?? ZERO).plus(amount));
    if (day(title.originalDueDate) < reportDay) originalPastDue = originalPastDue.plus(amount);
    if (day(title.currentDueDate) < reportDay) currentPastDue = currentPastDue.plus(amount);
  }
  const sortedGroups = [...groups.values()].sort((a, b) => b.cmp(a));
  const largestGroup = sortedGroups[0] ?? ZERO, topFive = sum(sortedGroups.slice(0, 5));
  const metrics: OriginatorCreditResult["metrics"] = {
    rawRows: input.titles.length, uniqueTitles: unique.size, duplicateRows: input.titles.length - unique.size,
    rawFace: full(rawFace), uniqueFace: full(uniqueFace), duplicateFace: full(rawFace.minus(uniqueFace)),
    originalPastDueFace: full(originalPastDue), currentPastDueFace: full(currentPastDue), originalPastDueRatio: full(ratio(originalPastDue, uniqueFace)),
    largestGroupFace: full(largestGroup), topFiveGroupsFace: full(topFive), largestGroupRatio: full(ratio(largestGroup, uniqueFace)),
    hhi: full(sum(sortedGroups.map(v => ratio(v, uniqueFace).pow(2)))), adjustedDebt: full(adjustedDebt), freeCash: full(freeCash), netDebt: full(netDebt), unusedBankLimits: full(unused), netDebtToEbitda: leverage === null ? null : full(leverage),
  };
  const traces: ReceivablesPoolKernelTrace[] = [
    trace("adjusted_debt", "bankUsed + additionalRecourseDebt + taxDebt; unused limits excluded", {bankUsed: full(bank), additionalRecourseDebt: f.additionalRecourseDebt, taxDebt: f.taxDebt, unusedBankLimitsExcluded: full(unused)}, adjustedDebt),
    trace("free_cash", "cash - restrictedCash", {cash: f.cash, restrictedCash: f.restrictedCash}, freeCash),
    trace("net_debt", "adjustedDebt - freeCash", {adjustedDebt: full(adjustedDebt), freeCash: full(freeCash)}, netDebt),
    trace("unique_pool", "sum of economically consistent unique (reference, debtor, issueDate) faces", {rawFace: full(rawFace), duplicateFace: full(rawFace.minus(uniqueFace)), uniqueTitles: String(unique.size)}, uniqueFace),
    trace("original_arrears", "sum original overdue faces / unique pool face", {originalPastDueFace: full(originalPastDue), uniqueFace: full(uniqueFace)}, ratio(originalPastDue, uniqueFace)),
    trace("group_concentration", "largest economic group face / unique pool face", {largestGroupFace: full(largestGroup), uniqueFace: full(uniqueFace)}, ratio(largestGroup, uniqueFace)),
  ];
  if (leverage !== null) traces.push(trace("leverage", "netDebt / ebitdaLtm", {netDebt: full(netDebt), ebitdaLtm: f.ebitdaLtm}, leverage));
  const result: OriginatorCreditResult = {version: originatorCreditKernelVersion, analysisDate: input.analysisDate, reportingDate: input.reportingDate, operationStartDate: input.operationStartDate, requestedTermDays: input.requestedTermDays, decisionAuthority: "committee", status: "not_evaluated", gaps: [], vetoes: [], metrics, eligibility: null, rating: null, capacity: null, traces};
  const p = input.policy;
  if (uniqueFace.isZero()) result.gaps.push("nonzero_portfolio_missing");
  if ([...unique.values()].some(t => day(t.issueDate) > reportDay)) result.gaps.push("source_universe_outside_cutoff");
  if (p === null) {result.gaps.push("credit_policy_missing"); return result;}
  validatePolicy(p);
  if (day(p.effectiveFrom) > Math.min(analysisDay, operationDay) || (p.effectiveUntil !== null && day(p.effectiveUntil) < Math.max(analysisDay, operationDay))) result.gaps.push("credit_policy_outside_validity");
  for (const [name, date, maxAge] of [["financial", f.financialDate, p.financialMaxAgeDays], ["scr", f.scrDate, p.scrMaxAgeDays], ["tape", f.tapeDate, p.tapeMaxAgeDays]] as const) if (Math.max(analysisDay, operationDay) - day(date) > maxAge) result.gaps.push(`${name}_stale`);
  if (leverage === null) result.gaps.push("positive_ltm_ebitda_missing");
  if (!input.poolSupportsAdditionalExposure) result.gaps.push("additional_collateral_scope_unconfirmed");
  if (p.declineOnScrPastDue && money(f.scrPastDue).gt(0)) result.vetoes.push("scr_past_due_policy_veto");
  if (p.declineOnScrLoss && money(f.scrLossClassified).gt(0)) result.vetoes.push("scr_loss_policy_veto");
  if (input.requestedTermDays > p.maxTermDays) result.vetoes.push("requested_term_exceeds_policy");
  const accepted: NonNullable<OriginatorCreditResult["eligibility"]>["accepted"] = [], excluded: NonNullable<OriginatorCreditResult["eligibility"]>["excluded"] = [];
  const candidates: OriginatorTitle[] = []; let preliminary = ZERO;
  for (const title of unique.values()) {
    const reasons = new Set<OriginatorExclusionReason>();
    if (title.assignment === "assigned") reasons.add("prior_assignment");
    if (title.relatedParty === true) reasons.add("related_party");
    if (title.invoice === "cancelled") reasons.add("invoice_cancelled");
    if (day(title.originalDueDate) < reportDay) reasons.add("original_arrears");
    if (title.delivery !== "verified") reasons.add("delivery_unverified");
    if (day(title.currentDueDate) - operationDay > p.maxTermDays) reasons.add("term_exceeded");
    if (title.assignment === "unknown" || title.invoice === "unknown" || title.relatedParty === null) reasons.add("unknown_evidence");
    if (day(title.issueDate) > reportDay) reasons.add("outside_reporting_date");
    if (money(title.face).isZero()) reasons.add("zero_balance");
    const reason = p.exclusionPriority.find(r => reasons.has(r));
    if (reason) excluded.push({reference: title.reference, debtorId: title.debtorId, issueDate: title.issueDate, reason, face: full(money(title.face))});
    else {candidates.push(title); preliminary = preliminary.plus(title.face);}
  }
  const usedByGroup = new Map<string, Decimal>(); let eligible = ZERO;
  // The procedure declares partial-face retention, ordered by original due date and reference.
  candidates.sort((a, b) => a.originalDueDate.localeCompare(b.originalDueDate) || a.reference.localeCompare(b.reference) || a.debtorId.localeCompare(b.debtorId) || a.issueDate.localeCompare(b.issueDate));
  for (const title of candidates) {
    const used = usedByGroup.get(title.groupId) ?? ZERO, amount = money(title.face);
    const retained = Decimal.min(amount, positivePart(money(p.groupFaceCap).minus(used)));
    usedByGroup.set(title.groupId, used.plus(retained)); eligible = eligible.plus(retained);
    if (retained.gt(0)) accepted.push({reference: title.reference, debtorId: title.debtorId, issueDate: title.issueDate, face: full(retained)});
    if (retained.lt(amount)) excluded.push({reference: title.reference, debtorId: title.debtorId, issueDate: title.issueDate, reason: "concentration", face: full(amount.minus(retained))});
  }
  if (!eligible.plus(sum(excluded.map(x => x.face))).eq(uniqueFace)) throw new Error("originator_eligibility_does_not_reconcile");
  excluded.sort((a, b) => a.reason.localeCompare(b.reason) || a.reference.localeCompare(b.reference) || a.debtorId.localeCompare(b.debtorId) || a.issueDate.localeCompare(b.issueDate));
  result.eligibility = {preliminaryFace: full(preliminary), eligibleFace: full(eligible), accepted, excluded};
  traces.push(trace("eligible_pool", "uniqueFace - exclusive source/policy exclusions - concentration excess", {uniqueFace: full(uniqueFace), preliminaryFace: full(preliminary), groupFaceCap: p.groupFaceCap, excludedFace: full(sum(excluded.map(x => x.face)))}, eligible));
  if (leverage !== null && result.gaps.length === 0) {
    let points = 0;
    for (const rule of p.scoring) {
      const value = finite(metrics[rule.metric]!);
      const band = rule.bands.find(b => b.upperInclusive === null || value.lte(b.upperInclusive));
      if (!band) throw new Error("originator_scoring_band_missing"); points += band.points;
      traces.push(trace(`score_${rule.metric}`, "points from the first supplied inclusive score band", {metricValue: full(value), upperInclusive: band.upperInclusive ?? "unbounded"}, decimal(band.points)));
    }
    const grade = p.grades.find(g => g.maxScore === null || points <= g.maxScore)!;
    result.rating = {points, grade: grade.grade, totalFaceCap: full(money(grade.totalFaceCap))};
  }
  const snapshots = [...input.cashBeforeNewCoobligation].sort((a, b) => a.date.localeCompare(b.date));
  const dates = new Set<string>();
  for (const snapshot of snapshots) {day(snapshot.date); finite(snapshot.amount); if (dates.has(snapshot.date)) throw new RangeError("originator_duplicate_cash_date"); dates.add(snapshot.date);}
  const horizon = operationDay + input.requestedTermDays;
  const inHorizon = snapshots.filter(s => day(s.date) >= operationDay && day(s.date) <= horizon);
  if (!inHorizon.length || !snapshots.some(s => day(s.date) === operationDay) || !snapshots.some(s => day(s.date) === horizon)) result.gaps.push("cash_horizon_incomplete");
  if (result.gaps.length || result.rating === null) {result.status = result.vetoes.length ? "recommend_decline" : "needs_evidence"; return result;}
  const minimum = Decimal.min(...inHorizon.map(s => finite(s.amount))), floor = money(p.cashFloor), stress = decimal(p.coobligationStressRatio), severe = decimal(p.severeStressRatio);
  const liquidity = stress.isZero() ? null : positivePart(minimum.minus(floor)).div(stress);
  const ratingHeadroom = positivePart(money(result.rating.totalFaceCap).minus(current));
  const regulationHeadroom = positivePart(regulation.minus(current));
  const constraints = [requested, ratingHeadroom, regulationHeadroom, eligible];
  if (liquidity !== null) constraints.push(liquidity);
  if (minimum.lt(floor) || result.vetoes.length) constraints.push(ZERO);
  const additional = Decimal.min(...constraints), stressed = minimum.minus(additional.times(stress)), severeMinimum = minimum.minus(additional.times(severe));
  const maturity = snapshots.find(s => day(s.date) === horizon);
  result.capacity = {ratingHeadroom: full(ratingHeadroom), regulationHeadroom: full(regulationHeadroom), collateralHeadroom: full(eligible), liquidityHeadroom: liquidity === null ? null : full(liquidity), additionalFace: full(additional), resultingTotalFace: full(current.plus(additional)), minimumCashBeforeNewStress: full(minimum), stressedMinimumCash: full(stressed), headroomAboveCashFloor: full(stressed.minus(floor)), severeMinimumCash: full(severeMinimum), severeDeficit: full(positivePart(floor.minus(severeMinimum))), requestedFaceCashDeficit: full(positivePart(floor.minus(minimum.minus(requested.times(stress))))), maturityCashAfterStress: maturity ? full(finite(maturity.amount).minus(additional.times(stress))) : null, requestedMinimumCash: full(minimum.minus(requested.times(stress))), requestedMaturityCashAfterStress: maturity ? full(finite(maturity.amount).minus(requested.times(stress))) : null};
  traces.push(trace("additional_capacity", "max(0, min(requested additional face, grade total minus existing, regulation total minus existing, additional eligible collateral, cash stress capacity)); zero for a policy veto or existing cash-floor breach", {requested: full(requested), existingFace: full(current), gradeTotalCap: result.rating.totalFaceCap, regulationTotalCap: full(regulation), eligibleAdditionalFace: full(eligible), minimumCash: full(minimum), cashFloor: full(floor), stressRatio: full(stress), vetoes: result.vetoes.join(",")}, additional));
  traces.push(trace("stressed_minimum_cash", "minimum cash including existing obligations - new additional face * stress ratio", {minimumCash: full(minimum), newAdditionalFace: full(additional), stressRatio: full(stress)}, stressed));
  traces.push(trace("severe_minimum_cash", "minimum cash - new additional face * severe stress ratio", {minimumCash: full(minimum), newAdditionalFace: full(additional), severeStressRatio: full(severe)}, severeMinimum));
  traces.push(trace("cash_headroom", "stressed minimum cash - supplied cash floor", {stressedMinimumCash: full(stressed), cashFloor: full(floor)}, stressed.minus(floor)));
  traces.push(trace("severe_deficit", "max(0, cash floor - severe minimum cash)", {cashFloor: full(floor), severeMinimumCash: full(severeMinimum)}, positivePart(floor.minus(severeMinimum))));
  traces.push(trace("requested_cash_deficit", "max(0, cash floor - (minimum cash - requested additional face * stress ratio))", {cashFloor: full(floor), minimumCash: full(minimum), requestedAdditionalFace: full(requested), stressRatio: full(stress)}, positivePart(floor.minus(minimum.minus(requested.times(stress))))));
  result.status = result.vetoes.length ? "recommend_decline" : additional.isZero() ? "no_additional_capacity" : "recommend_conditional";
  return result;
}
