import Decimal from "decimal.js";
import type {IsoDate} from "./receivables/contracts";
import {classifyReceivablesPoolTitle, type ReceivablesPoolEligibilityPolicy, type ReceivablesPoolEligibilityReason} from "./receivables/pool-eligibility";
import {composeIndexAndSpread, spreadOverIndex} from "./rate-composition";

export const receivablesFundingVersion = "2026.10.26-v1";
const Exact = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});

/** One bucket of the receivables portfolio as the aging and the contracts show it. */
export type ReceivablesFundingItem = {
  id: string; label: string; amount: string;
  /** Whether the debtor's contract allows assignment to a third party without its consent. */
  contract: "assignable" | "prohibited_without_consent";
  encumbrance: "free" | "assigned" | "pledged";
  /** Who holds the encumbrance and what releases it, as the debt table states them. */
  encumbranceHolder: string | null; releaseEvent: string | null;
  /** The bucket's dates as the eligibility test reads them: the latest due date of an overdue bucket, the average due date otherwise. */
  originDate: string; dueDate: string;
  registration: "registered" | "not_required" | "missing";
  creditTier: "selected" | "standard";
  /** Whether the debtor runs its own supplier finance program. */
  anchorProgram: "active" | "none" | "unknown";
  /** One debtor, or several; for several, the largest debtor's balance, when known, proves the sublimit. */
  debtorCount: number | null; largestDebtorAmount: string | null;
  /** Canonical key of the debtor (a document number or registry key) for one debtor, or of the declared
   * debtor set for several. Lots of one debtor share its key and its exposure is summed before the sublimit. */
  debtorKey: string;
  /** For several debtors only: whether the set is declared disjoint from every other item's debtors. */
  debtorSetDisjoint: boolean | null;
};
export const receivablesFundingOptionKinds = ["anchor_program", "fidc", "bank_discount", "bank_line"] as const;
export type ReceivablesFundingOptionKind = typeof receivablesFundingOptionKinds[number];
export type ReceivablesFundingEligibility = {
  maxDaysPastDue: number; maxRemainingTermDays: number;
  registrationRule: "required" | "not_required";
  minCreditTier: "selected" | "standard";
  /** Per debtor; null when the option states no sublimit. */
  sublimitPerDebtor: string | null;
  /** Anchor programs only: the debtors whose own program this is. */
  anchorItemIds: readonly string[];
};
/** How the rate is quoted: per 30-day month compounded, annual effective, or the DI plus a multiplicative spread. */
export type ReceivablesFundingRate = {basis: "monthly" | "annual" | "di_plus"; rate: string};
export type ReceivablesFundingOption = {
  id: string; label: string; kind: ReceivablesFundingOptionKind; recourse: "with_recourse" | "without_recourse";
  /** Null only for the bank line, which does not depend on the portfolio. */
  eligibility: ReceivablesFundingEligibility | null;
  rate: ReceivablesFundingRate;
  /** IOF per day on the amount (capped) and additional IOF, charged on every draw; a rollover renews the draw every rolloverDays. */
  iofDaily: string; iofDailyCapDays: number; iofAdditional: string; rolloverDays: number | null; upfrontFee: string;
  /** Collateral of a credit: none, an assignment of receivables, or not stated. A sale carries none. */
  collateral: "none" | "receivables_assignment" | "unknown";
  /** Days from the documentation to the first funding; null when the source does not state them. */
  leadDaysMin: number | null; leadDaysMax: number | null;
};
export type ReceivablesFundingInput = {
  currency: string; referenceDate: string;
  items: readonly ReceivablesFundingItem[];
  options: readonly ReceivablesFundingOption[];
  /** The need: the average amount in use for the time in use, and the peak. */
  needAverage: string; needPeak: string; needStartDate: string;
  /** Time in use: calendar days for monthly rates and IOF, business days over 252 for annual rates. */
  calendarDays: number; businessDays: number;
  annualDi: string;
  /** Average collection term of the portfolio, for the volume that turns over each month. */
  averageTermDays: number;
  needProfile: "seasonal" | "structural";
  dedicatedVehicleThreshold: {min: string; max: string};
  /** What remains of the permitted-lien basket of the indenture, when the debt table states it. */
  lienBasketRemaining: string | null;
};

/** Reasons a title can wait for before closing; every other reason excludes it. */
const curable: readonly ReceivablesPoolEligibilityReason[] = ["registration_missing"];
const tierRank = {selected: 0, standard: 1} as const;
const saleKinds: readonly ReceivablesFundingOptionKind[] = ["anchor_program", "fidc"];

function day(value: string) {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw new Error("receivables_funding_invalid_date");
  const d = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error("receivables_funding_invalid_date");
  return d;
}
const addDays = (value: string, days: number) => new Date(day(value).getTime() + days * 86400000).toISOString().slice(0, 10);
const between = (a: string, b: string) => (day(b).getTime() - day(a).getTime()) / 86400000;
function amount(value: string) {
  if (typeof value !== "string" || !/^\d{1,24}(?:\.\d{1,20})?$/.test(value)) throw new Error("receivables_funding_invalid_amount");
  return new Exact(value);
}
const text = (value: string, code: string) => {if (typeof value !== "string" || !value.trim() || value.length > 2000) throw new Error(code); return value;};
const int = (value: number, min: number, max: number, code: string) => {if (!Number.isInteger(value) || value < min || value > max) throw new Error(code); return value;};
const out = (v: Decimal) => v.toDecimalPlaces(20).toFixed();

/** What a receivables portfolio turns into as cash: which buckets can be sold and to whom, with the
 * reason for every exclusion; the volume each option takes under its eligibility and sublimit; the
 * cost of each option for the same amount and time in use, against the bank line, with every rate
 * converted to annual effective before comparing; the balance sheet and negative pledge effect of
 * each; a plan that fills the peak from the cheapest option, the bank line kept as reserve; the
 * date the process must start; and whether a dedicated vehicle fits the need. Volumes and prices
 * are indicative: no buyer is contacted and no approval is implied. */
export function assessReceivablesFunding(input: ReceivablesFundingInput) {
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("receivables_funding_invalid_currency");
  day(input.referenceDate); day(input.needStartDate);
  if (input.needStartDate < input.referenceDate) throw new Error("receivables_funding_need_before_reference");
  if (!input.items.length || input.items.length > 32 || !input.options.length || input.options.length > 8) throw new Error("receivables_funding_count");
  const calendarDays = int(input.calendarDays, 1, 3660, "receivables_funding_days"), businessDays = int(input.businessDays, 1, 2520, "receivables_funding_days");
  const averageTermDays = int(input.averageTermDays, 1, 3660, "receivables_funding_days");
  const needAverage = amount(input.needAverage), needPeak = amount(input.needPeak), di = amount(input.annualDi);
  if (!needAverage.gt(0) || needPeak.lt(needAverage)) throw new Error("receivables_funding_need");
  const vMin = amount(input.dedicatedVehicleThreshold.min), vMax = amount(input.dedicatedVehicleThreshold.max);
  if (vMax.lt(vMin)) throw new Error("receivables_funding_vehicle_threshold");
  const basket = input.lienBasketRemaining === null ? null : amount(input.lienBasketRemaining);
  if (!["seasonal", "structural"].includes(input.needProfile)) throw new Error("receivables_funding_need_profile");

  const items = new Map<string, ReceivablesFundingItem & {value: Decimal}>();
  for (const i of input.items) {
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(i.id) || items.has(i.id)) throw new Error("receivables_funding_duplicate_item");
    text(i.label, "receivables_funding_label_required");
    const value = amount(i.amount);
    if (!value.gt(0)) throw new Error("receivables_funding_item_amount");
    if (!["assignable", "prohibited_without_consent"].includes(i.contract) || !["free", "assigned", "pledged"].includes(i.encumbrance)
      || !["registered", "not_required", "missing"].includes(i.registration) || !["selected", "standard"].includes(i.creditTier)
      || !["active", "none", "unknown"].includes(i.anchorProgram)) throw new Error("receivables_funding_item_kind");
    // An encumbrance names who holds it; a free bucket names nobody.
    if ((i.encumbrance === "free") !== (i.encumbranceHolder === null)) throw new Error("receivables_funding_encumbrance_holder");
    if (i.encumbranceHolder !== null) text(i.encumbranceHolder, "receivables_funding_encumbrance_holder");
    if (i.releaseEvent !== null && (i.encumbrance === "free" || !i.releaseEvent.trim())) throw new Error("receivables_funding_release_event");
    day(i.originDate); day(i.dueDate);
    if (i.originDate > input.referenceDate || i.dueDate < i.originDate) throw new Error("receivables_funding_item_dates");
    if (i.debtorCount !== null) int(i.debtorCount, 1, 1000000, "receivables_funding_debtor_count");
    if (i.largestDebtorAmount !== null) {
      const largest = amount(i.largestDebtorAmount);
      if (!largest.gt(0) || largest.gt(value) || i.debtorCount === 1) throw new Error("receivables_funding_largest_debtor");
      // The bucket cannot hold more than its debtors at the largest balance each: contradictory data is refused, not capped.
      if (i.debtorCount !== null && value.gt(largest.mul(i.debtorCount))) throw new Error("receivables_funding_largest_debtor");
    }
    if (typeof i.debtorKey !== "string" || !/^[a-z0-9][a-z0-9.-]{0,79}$/.test(i.debtorKey)) throw new Error("receivables_funding_debtor_key");
    if ((i.debtorCount === 1) !== (i.debtorSetDisjoint === null)) throw new Error("receivables_funding_debtor_set");
    items.set(i.id, {...i, value});
  }
  // A debtor's lots share one key and one contract and program; a debtor set's key belongs to it alone.
  const byKey = new Map<string, (ReceivablesFundingItem & {value: Decimal})[]>();
  for (const i of items.values()) byKey.set(i.debtorKey, [...byKey.get(i.debtorKey) ?? [], i]);
  for (const lots of byKey.values()) {
    if (lots.length > 1 && lots.some(l => l.debtorCount !== 1)) throw new Error("receivables_funding_debtor_key_conflict");
    if (lots.some(l => l.contract !== lots[0]!.contract || l.anchorProgram !== lots[0]!.anchorProgram)) throw new Error("receivables_funding_debtor_lots_inconsistent");
  }
  const gross = [...items.values()].reduce((s, i) => s.plus(i.value), new Exact(0));

  const optionIds = new Set<string>();
  const options = input.options.map(o => {
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(o.id) || optionIds.has(o.id)) throw new Error("receivables_funding_duplicate_option");
    optionIds.add(o.id); text(o.label, "receivables_funding_label_required");
    if (!receivablesFundingOptionKinds.includes(o.kind) || !["with_recourse", "without_recourse"].includes(o.recourse)) throw new Error("receivables_funding_option_kind");
    // A program run by the debtor carries no recourse to the seller; a discount and a line always do.
    if ((o.kind === "anchor_program" && o.recourse !== "without_recourse") || ((o.kind === "bank_discount" || o.kind === "bank_line") && o.recourse !== "with_recourse")) throw new Error("receivables_funding_option_recourse");
    if ((o.kind === "bank_line") !== (o.eligibility === null)) throw new Error("receivables_funding_option_eligibility");
    if (saleKinds.includes(o.kind) && o.collateral !== "none") throw new Error("receivables_funding_sale_with_collateral");
    if (!["none", "receivables_assignment", "unknown"].includes(o.collateral)) throw new Error("receivables_funding_option_collateral");
    if ((o.leadDaysMin === null) !== (o.leadDaysMax === null)) throw new Error("receivables_funding_lead_days");
    if (o.leadDaysMin !== null) {int(o.leadDaysMin, 0, 365, "receivables_funding_lead_days"); int(o.leadDaysMax!, o.leadDaysMin, 365, "receivables_funding_lead_days");}
    int(o.iofDailyCapDays, 0, 3660, "receivables_funding_days");
    if (o.rolloverDays !== null) int(o.rolloverDays, 1, calendarDays, "receivables_funding_rollover_days");
    if (!["monthly", "annual", "di_plus"].includes(o.rate.basis)) throw new Error("receivables_funding_rate_basis");
    const e = o.eligibility;
    if (e) {
      int(e.maxDaysPastDue, 0, 3660, "receivables_funding_policy"); int(e.maxRemainingTermDays, 1, 3660, "receivables_funding_policy");
      if (!["required", "not_required"].includes(e.registrationRule) || !["selected", "standard"].includes(e.minCreditTier)) throw new Error("receivables_funding_policy");
      if (e.sublimitPerDebtor !== null && !amount(e.sublimitPerDebtor).gt(0)) throw new Error("receivables_funding_policy");
      if ((o.kind === "anchor_program") !== (e.anchorItemIds.length > 0)) throw new Error("receivables_funding_anchor_items");
      if (new Set(e.anchorItemIds).size !== e.anchorItemIds.length) throw new Error("receivables_funding_anchor_items");
      // A program is the debtor's own: it buys only that debtor, and only while the program is active.
      for (const id of e.anchorItemIds) {
        const i = items.get(id);
        if (!i) throw new Error("receivables_funding_anchor_items");
        if (i.anchorProgram !== "active") throw new Error("receivables_funding_anchor_program_not_active");
      }
    }
    return o;
  });
  const anchored = new Set(options.flatMap(o => o.eligibility?.anchorItemIds ?? []));
  // A program buys the debtor, not one lot of it: every lot of an anchored debtor is named by the same program.
  for (const o of options) for (const id of o.eligibility?.anchorItemIds ?? []) {
    if (byKey.get(items.get(id)!.debtorKey)!.some(l => !o.eligibility!.anchorItemIds.includes(l.id))) throw new Error("receivables_funding_debtor_lots_inconsistent");
  }

  type Unverified = "largest_debtor" | "debtor_set_overlap";
  /** The volume an option takes from every bucket: the eligibility kernel's reasons per lot, the
   * curable ones apart; then the debtor sublimit on the exposure summed per debtor key across lots.
   * A debtor with its own program goes to the program only. */
  function takeAll(o: ReceivablesFundingOption, list: readonly (ReceivablesFundingItem & {value: Decimal})[]) {
    const e = o.eligibility!, cap = e.sublimitPerDebtor === null ? null : amount(e.sublimitPerDebtor);
    const tested = list.map(i => {
      const offered = o.kind === "anchor_program" ? e.anchorItemIds.includes(i.id) : !anchored.has(i.id);
      if (!offered) return {i, offered, reasons: [] as string[], curable: [] as string[], eligible: new Exact(0)};
      const policy: ReceivablesPoolEligibilityPolicy = {maxDaysPastDue: e.maxDaysPastDue, maxRemainingTermDays: e.maxRemainingTermDays, minSeasoningDays: 0,
        // The debtor's own program is its consent; every other buyer needs an assignable contract.
        requireAssignable: o.kind !== "anchor_program", requireEvidenceVerified: false, registrationRule: e.registrationRule,
        excludeDisputed: false, excludeRelatedParties: false, excludeEncumbered: true, allowedDebtorSectors: []};
      const c = classifyReceivablesPoolTitle({outstandingBalance: i.amount, defaultedBalance: "0", originDate: i.originDate as IsoDate, dueDate: i.dueDate as IsoDate,
        assignable: i.contract === "assignable", evidenceVerified: true, anchorVerified: true, registration: i.registration,
        encumbrance: i.encumbrance, disputed: false, relatedParty: false, debtorSector: ""}, policy, input.referenceDate as IsoDate);
      const reasons: string[] = c.reasons.filter(r => !curable.includes(r));
      if (tierRank[i.creditTier] > tierRank[e.minCreditTier]) reasons.push("credit_tier_outside_policy");
      return {i, offered, reasons, curable: c.reasons.filter(r => curable.includes(r)), eligible: reasons.length ? new Exact(0) : i.value};
    });
    // One debtor's eligible lots share one sublimit, filled in the order of the lots.
    const room = new Map<string, Decimal>();
    return tested.map(t => {
      const base = {itemId: t.i.id, offered: t.offered, reasons: t.reasons, curable: t.curable};
      if (!t.eligible.gt(0)) return {...base, retained: "0", sublimitVerified: true, unverifiedBy: [] as Unverified[], sublimitExcess: "0"};
      let retained: Decimal, unverifiedBy: Unverified[] = [];
      if (t.i.debtorCount === 1) {
        const left = room.get(t.i.debtorKey) ?? cap;
        retained = left === null ? t.eligible : Decimal.min(t.eligible, left);
        if (left !== null) room.set(t.i.debtorKey, left.minus(retained));
      } else {
        const b = bucket(t.i, cap);
        retained = b.retained; if (!b.verified) unverifiedBy.push("largest_debtor");
        // Without a declared disjoint set, a debtor of the bucket may hold lots elsewhere: the sublimit is not proved.
        if (cap !== null && t.i.debtorSetDisjoint === false) unverifiedBy.push("debtor_set_overlap");
      }
      return {...base, retained: out(retained), sublimitVerified: !unverifiedBy.length, unverifiedBy, sublimitExcess: out(t.eligible.minus(retained))};
    });
  }
  /** Several debtors are proved within the sublimit only by the largest one; otherwise the volume is
   * an upper bound (count times sublimit, less the known excess). */
  function bucket(i: ReceivablesFundingItem & {value: Decimal}, cap: Decimal | null) {
    if (cap === null) return {retained: i.value, verified: true};
    const largest = i.largestDebtorAmount === null ? null : new Exact(i.largestDebtorAmount);
    if (largest !== null && largest.lte(cap)) return {retained: i.debtorCount === null ? i.value : Decimal.min(i.value, cap.mul(i.debtorCount)), verified: true};
    let bound = i.value.minus(largest === null ? 0 : Decimal.max(largest.minus(cap), 0));
    if (i.debtorCount !== null) bound = Decimal.min(bound, cap.mul(i.debtorCount));
    return {retained: bound, verified: false};
  }

  const di1 = di.plus(1);
  const costed = options.map(o => {
    const rate = amount(o.rate.rate);
    let annual: Decimal, monthly: Decimal, factor: Decimal;
    if (o.rate.basis === "monthly") {
      annual = rate.plus(1).pow(12).minus(1); monthly = rate;
      factor = rate.plus(1).pow(new Exact(calendarDays).div(30));
    } else {
      annual = o.rate.basis === "annual" ? rate : new Exact(composeIndexAndSpread({index: "DI", annualIndex: di.toFixed(), annualSpread: rate.toFixed()}).value);
      monthly = annual.plus(1).pow(new Exact(1).div(12)).minus(1);
      factor = annual.plus(1).pow(new Exact(businessDays).div(252));
    }
    const spread = new Exact(spreadOverIndex({annualRate: annual.toFixed(), annualIndex: di.toFixed()}).value);
    // Whole draws: a rollover started inside the time in use is a draw and pays the additional IOF in full;
    // daily IOF runs on the days each draw is in use, the last one possibly shorter, each capped.
    const draws = o.rolloverDays === null ? 1 : Math.ceil(calendarDays / o.rolloverDays);
    const term = o.rolloverDays ?? calendarDays;
    const iofDays = Array.from({length: draws}, (_, n) => Math.min(term, calendarDays - n * term, o.iofDailyCapDays)).reduce((a, b) => a + b, 0);
    const interest = needAverage.mul(factor.minus(1));
    const iof = needAverage.mul(amount(o.iofDaily).mul(iofDays).plus(amount(o.iofAdditional).mul(draws)));
    const fee = needAverage.mul(amount(o.upfrontFee));
    const total = interest.plus(iof).plus(fee);
    const period = total.div(needAverage);
    const byItem = o.eligibility ? takeAll(o, [...items.values()]) : [];
    const volume = o.eligibility ? byItem.reduce((s, b) => s.plus(b.retained), new Exact(0)) : null;
    const sale = saleKinds.includes(o.kind);
    const liability = !sale || o.recourse === "with_recourse";
    const lien = sale ? "not_a_guarantee_confirm_with_counsel" as const
      : o.collateral === "receivables_assignment" ? "uses_basket" as const : o.collateral === "unknown" ? "uses_basket_if_collateralized" as const : "none" as const;
    return {id: o.id, label: o.label, kind: o.kind, recourse: o.recourse, indicative: true as const,
      volume: volume === null ? null : out(volume), volumeVerified: byItem.every(b => b.sublimitVerified), byItem,
      rates: {basis: o.rate.basis, quoted: out(rate), annualEffective: out(annual), monthlyEquivalent: out(monthly), spreadOverDi: out(spread)},
      cost: {amount: out(needAverage), calendarDays, businessDays, draws, iofDays, interest: out(interest), iof: out(iof), fee: out(fee), total: out(total),
        allInPeriod: out(period), allInAnnual: out(period.plus(1).pow(new Exact(252).div(businessDays)).minus(1))},
      iofApplies: iof.gt(0), coversAverage: volume === null ? null : volume.gte(needAverage), coversPeak: volume === null ? null : volume.gte(needPeak),
      /** A sale with recourse tends to stay on the balance sheet as a liability; without recourse it leaves it. */
      balanceSheet: liability ? (sale ? "tends_to_remain_as_liability" as const : "liability" as const) : "derecognized" as const,
      measuredDebtAdded: out(liability ? needAverage : new Exact(0)), lien,
      fitsLienBasket: basket === null || lien === "none" || lien === "not_a_guarantee_confirm_with_counsel" ? null : needAverage.lte(basket),
      leadDays: o.leadDaysMin === null ? null : {min: o.leadDaysMin, max: o.leadDaysMax!}};
  });
  const bankLines = costed.filter(c => c.kind === "bank_line").sort((a, b) => new Exact(a.cost.total).cmp(b.cost.total) || (a.id < b.id ? -1 : 1));
  const line = bankLines[0] ?? null;
  const ranked = [...costed].sort((a, b) => new Exact(a.cost.total).cmp(b.cost.total) || (a.id < b.id ? -1 : 1))
    .map(c => ({id: c.id, total: c.cost.total, differenceToBankLine: line === null ? null : out(new Exact(c.cost.total).minus(line.cost.total))}));

  // What can be sold: per bucket, the most any sale option takes; the rest is excluded with every reason the options gave.
  const sales = costed.filter(c => saleKinds.includes(c.kind));
  const portfolio = [...items.values()].map(i => {
    const takes = sales.map(s => s.byItem.find(b => b.itemId === i.id)!).filter(b => b.offered);
    const best = takes.reduce((m, b) => new Exact(b.retained).gt(m) ? new Exact(b.retained) : m, new Exact(0));
    // The reasons no sale option overcomes; when each option fails for its own reason, all of them.
    const common = [...new Set(takes.flatMap(b => b.reasons))].filter(r => takes.every(b => b.reasons.includes(r)));
    // A lot some option accepts is cut only by the debtor sublimit, even when the cut leaves nothing of it.
    const accepted = takes.some(b => !b.reasons.length);
    const reasons = accepted ? (best.lt(i.value) ? ["debtor_sublimit"] : []) : (common.length ? common : [...new Set(takes.flatMap(b => b.reasons))]).sort();
    if (!takes.length) reasons.push("not_offered_to_any_sale_option");
    const excluded = i.value.minus(best);
    return {itemId: i.id, label: i.label, amount: out(i.value), assignable: out(best), excluded: out(excluded), reasons: excluded.gt(0) ? reasons : [],
      curable: [...new Set(takes.filter(b => new Exact(b.retained).gt(0)).flatMap(b => b.curable))].sort(),
      encumbranceHolder: i.encumbranceHolder, releaseEvent: i.releaseEvent};
  });
  const assignable = portfolio.reduce((s, p) => s.plus(p.assignable), new Exact(0));
  const excludedTotal = portfolio.reduce((s, p) => s.plus(p.excluded), new Exact(0));
  if (!assignable.plus(excludedTotal).eq(gross)) throw new Error("receivables_funding_reconciliation");

  // After a release, the encumbered bucket is tested as free by the same options: an upper bound until it is.
  const releases = [...items.values()].filter(i => i.encumbrance !== "free" && i.releaseEvent !== null).map(i => {
    const freed = {...i, encumbrance: "free" as const};
    const list = [...items.values()].map(x => x.id === i.id ? freed : x);
    const best = options.filter(o => saleKinds.includes(o.kind)).map(o => takeAll(o, list).find(b => b.itemId === i.id)!)
      .reduce((m, b) => new Exact(b.retained).gt(m.value) ? {value: new Exact(b.retained), verified: b.sublimitVerified} : m, {value: new Exact(0), verified: true});
    return {itemId: i.id, amount: out(i.value), holder: i.encumbranceHolder!, releaseEvent: i.releaseEvent!, assignableAfterRelease: out(best.value), verified: best.verified};
  });

  // Plan: the cheapest options first. Each option's capacity is recomputed on what is still unsold: a
  // named debtor's accepted lots share the option's own sublimit, so a balance bought in part earlier
  // keeps the same headroom whether it sits in one lot or several; a bucket keeps its bound. Each option
  // takes the least of its capacity per lot and what is still missing to the peak.
  const unsold = new Map([...items.values()].map(i => [i.id, i.value]));
  const plan: {optionId: string; capacity: string; amount: string; cumulative: string}[] = [];
  let cumulative = new Exact(0);
  for (const r of ranked) {
    if (cumulative.gte(needPeak)) break;
    const c = costed.find(x => x.id === r.id)!;
    if (c.kind === "bank_line") continue;
    let add = new Exact(0), capacity = new Exact(0);
    const cap = options.find(o => o.id === c.id)!.eligibility!.sublimitPerDebtor;
    const headroom = new Map<string, Decimal>();
    for (const b of c.byItem) {
      const i = items.get(b.itemId)!;
      let free: Decimal;
      if (i.debtorCount === 1) {
        if (!b.offered || b.reasons.length) continue;
        const left = headroom.get(i.debtorKey) ?? (cap === null ? null : new Exact(cap));
        free = left === null ? unsold.get(b.itemId)! : Decimal.min(unsold.get(b.itemId)!, left);
        if (left !== null) headroom.set(i.debtorKey, left.minus(free));
      } else free = Decimal.min(new Exact(b.retained), unsold.get(b.itemId)!);
      if (!free.gt(0)) continue;
      capacity = capacity.plus(free);
      const take = Decimal.min(free, needPeak.minus(cumulative).minus(add));
      if (take.gt(0)) {add = add.plus(take); unsold.set(b.itemId, unsold.get(b.itemId)!.minus(take));}
    }
    if (!add.gt(0)) continue;
    cumulative = cumulative.plus(add);
    plan.push({optionId: c.id, capacity: out(capacity), amount: out(add), cumulative: out(cumulative)});
  }
  const leads = plan.map(p => costed.find(c => c.id === p.optionId)!.leadDays);
  // Without the lead time of every planned option the start date is not stated.
  const planLead = leads.length && leads.every(l => l !== null) ? Math.max(...leads.map(l => l!.max)) : null;
  const startBy = planLead === null ? null : addDays(input.needStartDate, -planLead);
  const curableByCode = new Map<string, Decimal>();
  for (const p of portfolio) for (const r of p.curable) curableByCode.set(r, (curableByCode.get(r) ?? new Exact(0)).plus(p.assignable));

  const fidcVolumes = costed.filter(c => c.kind === "fidc").map(c => new Exact(c.volume!));
  const turnover = fidcVolumes.length ? Decimal.max(...fidcVolumes).mul(30).div(averageTermDays) : new Exact(0);
  const vehicle = input.needProfile === "seasonal" ? "not_for_seasonal_need" as const
    : turnover.gte(vMax) ? "worth_studying" as const : turnover.lt(vMin) ? "below_threshold" as const : "borderline" as const;

  const questions = [
    ...[...items.values()].filter(i => i.contract === "prohibited_without_consent" && i.anchorProgram === "unknown").map(i => ({code: "anchor_program_of_restricted_debtor" as const, itemId: i.id, amount: out(i.value)})),
    ...[...items.values()].filter(i => i.anchorProgram === "active" && !anchored.has(i.id)).map(i => ({code: "anchor_program_terms" as const, itemId: i.id, amount: out(i.value)})),
    ...curableByCode.has("registration_missing") ? [{code: "duplicata_registration_capability" as const, itemId: null, amount: out(curableByCode.get("registration_missing")!)}] : [],
  ];
  type GapReason = "largest_debtor_not_informed" | "debtor_set_not_declared_disjoint" | "lead_time_not_informed";
  const gaps: {item: string; reason: GapReason}[] = [];
  const unproved = (i: ReceivablesFundingItem, why: Unverified) => costed.some(c => c.byItem.some(b => b.itemId === i.id && b.unverifiedBy.includes(why) && new Exact(b.retained).gt(0)));
  for (const i of items.values()) {
    if (unproved(i, "largest_debtor")) gaps.push({item: `item.${i.id}.largestDebtorAmount`, reason: "largest_debtor_not_informed"});
    if (unproved(i, "debtor_set_overlap")) gaps.push({item: `item.${i.id}.debtorSetDisjoint`, reason: "debtor_set_not_declared_disjoint"});
  }
  for (const p of plan) if (costed.find(c => c.id === p.optionId)!.leadDays === null) gaps.push({item: `option.${p.optionId}.leadDays`, reason: "lead_time_not_informed"});
  return {schemaVersion: "receivables-funding.v1" as const, version: receivablesFundingVersion, currency: input.currency, referenceDate: input.referenceDate,
    need: {average: out(needAverage), peak: out(needPeak), startDate: input.needStartDate, calendarDays, businessDays, profile: input.needProfile},
    portfolio: {gross: out(gross), assignable: out(assignable), excluded: out(excludedTotal), items: portfolio, releases},
    options: costed, ranking: ranked, bankLine: line === null ? null : line.id,
    plan: {steps: plan, covered: out(cumulative), coversPeak: cumulative.gte(needPeak), reserve: line === null ? null : line.id},
    timing: {startBy, slackDays: startBy === null ? null : between(input.referenceDate, startBy), leadDaysMax: planLead,
      conditionsPrecedent: [...curableByCode.entries()].map(([code, v]) => ({code: code === "registration_missing" ? "duplicata_registration" as const : "other" as const, amount: out(v)}))},
    dedicatedVehicle: {monthlyAssignable: out(turnover), thresholdMin: out(vMin), thresholdMax: out(vMax), profile: input.needProfile, reading: vehicle},
    questions, gaps};
}
export type ReceivablesFunding = ReturnType<typeof assessReceivablesFunding>;
