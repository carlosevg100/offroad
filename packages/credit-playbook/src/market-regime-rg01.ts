/**
 * The RG-01 monitor's evaluator and the declaration it reads (docs/build/market-reference/M2-PARTE-6.md).
 * The database evaluates (private.market_evaluate_rg01_v1); this twin exists for differential tests with the
 * vectors in vectors/market-rg01.json, produced by an independent generator. Pure and deterministic.
 */
import {createHash} from "node:crypto";
import {brazilianNationalHolidays} from "@offroad/financial-core";
import Decimal from "decimal.js";

export const rg01Rule = "market-rg01.v1";
export const freshnessRule = "market-freshness.v1";

/** market-policy.v1: market-odbl.v1 (keys by code point, no whitespace, minimal escaping) with JSON
 * integers written as decimal text; a fraction is refused. The caller adds the final newline. */
export class MarketPolicyCanonicalError extends Error {}

function policyString(text: string): string {
  let out = "\"";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === "\"") out += "\\\"";
    else if (ch === "\\") out += "\\\\";
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  return `${out}"`;
}

function byCodePoint(a: string, b: string): number {
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

export function canonicalPolicy(value: unknown): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "string") return policyString(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new MarketPolicyCanonicalError("market_policy_fraction_not_allowed");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalPolicy).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => byCodePoint(a, b));
    return `{${entries.map(([k, v]) => `${policyString(k)}:${canonicalPolicy(v)}`).join(",")}}`;
  }
  throw new MarketPolicyCanonicalError("market_policy_value_invalid");
}

type RegimeValue = {
  regime: string; validFrom: string; decidedBy: string; reviewDeadlineBusinessDays: number;
  referenceConditions: {selicTargetPct: string; easingCycle: {startedOn: string; fromPct: string; cuts: number; stepBps: number; cumulativeBps: number; copomDecisions: string[]; effectiveNextDay: boolean}};
  triggers: {id: string; condition: string; action: string; scope: string}[];
};

/** The part of policy.pricing.regime the RG-01 monitor uses, pinned in the database by its text. */
export function rg01Projection(policyId: string, policyVersion: string, value: RegimeValue) {
  const trigger = value.triggers.find((t) => t.id === "RG-01");
  if (!trigger) throw new MarketPolicyCanonicalError("market_policy_trigger_missing");
  const c = value.referenceConditions.easingCycle;
  return {
    policyId, policyVersion, regime: value.regime, validFrom: value.validFrom,
    easingCycle: {startedOn: c.startedOn, fromPct: c.fromPct, cuts: c.cuts, stepBps: c.stepBps, copomDecisions: c.copomDecisions,
      effectiveNextDay: c.effectiveNextDay, cumulativeBps: c.cumulativeBps},
    selicTargetPct: value.referenceConditions.selicTargetPct,
    trigger: {id: trigger.id, condition: trigger.condition, action: trigger.action, scope: trigger.scope},
    reviewDeadlineBusinessDays: value.reviewDeadlineBusinessDays, decidedBy: value.decidedBy,
  };
}

export function projectionText(projection: unknown): string {
  return `${canonicalPolicy(projection)}\n`;
}

// --- Business days -----------------------------------------------------------------------------------
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function businessDay(date: string): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6 && !brazilianNationalHolidays(Number(date.slice(0, 4))).includes(date);
}

function nextBusinessDay(date: string): string {
  let d = addDays(date, 1);
  while (!businessDay(d)) d = addDays(d, 1);
  return d;
}

/** Decision 5: the second business day after the first business day strictly after the meeting's end. */
export function freshnessDeadline(meetingEnd: string): string {
  return nextBusinessDay(nextBusinessDay(nextBusinessDay(meetingEnd)));
}

// --- Evaluator ---------------------------------------------------------------------------------------
export type Rg01Communique = {meeting: number; decision: "raise" | "cut" | "hold"; targetPct: string; readable: boolean; disputed: boolean};
export type Rg01Meeting = {endDate: string; kind: "ordinary" | "extraordinary"; communique: Rg01Communique | null; previous: string | null; change: string | null};
export type Rg01Snapshot = {
  dataBase: string;
  declaration: {id: string; cycle: {decisions: string[]; fromPct: string; finalPct: string; stepBps: number; cuts: number; cumulativeBps: number}};
  calendarYearsRequired: number[]; calendarYearsPresent: number[];
  selectionEntries: number; entriesSha256: string;
  meetings: Rg01Meeting[];
};
export type Rg01MeetingState = "disputed" | "unavailable" | "missing" | "series_disagreement" | "corroborated" | "awaiting_series";
export type Rg01Result = "fired" | "pending_confirmation" | "not_fired" | "incomplete";

const gapCode: Record<Exclude<Rg01MeetingState, "corroborated">, string> = {
  missing: "communique_missing", awaiting_series: "series_pending", series_disagreement: "series_disagreement",
  unavailable: "communique_unavailable", disputed: "meeting_disputed",
};

/** The one state of a meeting, in this order: a dispute wins over agreeing evidence. */
export function meetingState(m: Rg01Meeting): Rg01MeetingState {
  const c = m.communique;
  if (c?.disputed) return "disputed";
  if (c && !c.readable) return "unavailable";
  if (!c) return "missing";
  if (m.previous === null || m.change === null) return "awaiting_series";
  const p = new Decimal(m.previous), n = new Decimal(m.change), t = new Decimal(c.targetPct);
  const direction = c.decision === "raise" ? n.gt(p) : c.decision === "cut" ? n.lt(p) : n.eq(p);
  return direction && n.eq(t) ? "corroborated" : "series_disagreement";
}

const sortCodePoint = (xs: string[]) => [...xs].sort(byCodePoint);

export function evaluateRg01(snapshot: Rg01Snapshot) {
  const D = snapshot.dataBase, cycle = snapshot.declaration.cycle;
  const lastDeclared = [...cycle.decisions].sort().at(-1)!;
  const rows = [...snapshot.meetings].sort((a, b) => (a.endDate < b.endDate ? -1 : a.endDate > b.endDate ? 1 : 0)).map((m) => ({
    m, endDate: m.endDate, state: meetingState(m), deadline: freshnessDeadline(m.endDate), decision: m.communique?.decision ?? null,
    baseline: cycle.decisions.includes(m.endDate), relevant: lastDeclared < m.endDate && m.endDate <= D,
  }));
  const relevant = rows.filter((r) => r.relevant);
  const missingYears = snapshot.calendarYearsRequired.filter((y) => !snapshot.calendarYearsPresent.includes(y));
  let gaps = [...missingYears.map((y) => `calendar_missing:${y}`),
    ...relevant.filter((r) => r.state !== "corroborated").map((r) => `${gapCode[r.state as Exclude<Rg01MeetingState, "corroborated">]}:${r.endDate}`)];
  const witnesses = relevant.filter((r) => r.decision === "raise" && r.state === "corroborated").map((r) => r.endDate);
  let result: Rg01Result;
  if (witnesses.length > 0) result = "fired";
  else if (relevant.some((r) => r.decision === "raise" && r.state === "awaiting_series")) result = "pending_confirmation";
  else if (missingYears.length === 0 && relevant.every((r) => r.state === "corroborated")) result = "not_fired";
  else result = "incomplete";
  // Decision 5, in this order: a relevant meeting past its deadline and not corroborated; no observation; current.
  const freshness = relevant.some((r) => r.deadline < D && r.state !== "corroborated") ? "stale"
    : snapshot.selectionEntries === 0 ? "absent" : "current";
  // The declared baseline against the evidence; informative only.
  let contra: string[] = [];
  const base = new Map(rows.filter((r) => r.baseline).map((r) => [r.endDate, r]));
  for (const d of cycle.decisions) {
    const r = base.get(d);
    if (!r || r.state !== "corroborated" || r.decision !== "cut") contra.push(`baseline_meeting:${d}`);
  }
  if (cycle.decisions.length !== cycle.cuts) contra.push("baseline_count");
  if (!contra.some((c) => c.startsWith("baseline_meeting"))) {
    if (!new Decimal(base.get(cycle.decisions[0]!)!.m.previous!).eq(cycle.fromPct)) contra.push("baseline_from");
    let total = new Decimal(0);
    for (const d of cycle.decisions) {
      const m = base.get(d)!.m, step = new Decimal(m.previous!).minus(m.change!).times(100);
      total = total.plus(step);
      if (!step.eq(cycle.stepBps)) contra.push(`baseline_step:${d}`);
    }
    if (!new Decimal(base.get(cycle.decisions.at(-1)!)!.m.change!).eq(cycle.finalPct)) contra.push("baseline_final");
    if (!total.negated().eq(cycle.cumulativeBps)) contra.push("baseline_cumulative");
  }
  gaps = sortCodePoint(gaps); contra = sortCodePoint(contra);
  const stateText = ["market-rg01-state.v1", `declaration:${snapshot.declaration.id}`, `result:${result}`, `freshness:${freshness}`,
    `primary:${witnesses[0] ?? ""}`, ...witnesses.map((w) => `witness:${w}`),
    ...rows.filter((r) => r.relevant || r.baseline).map((r) => `meeting:${r.endDate}|${r.state}`),
    ...gaps.map((g) => `gap:${g}`), ...contra.map((c) => `baseline:${c}`), `entries:${snapshot.entriesSha256}`].join("\n");
  return {
    result, freshness, primaryWitness: witnesses[0] ?? null, witnesses,
    meetings: rows.map((r) => ({endDate: r.endDate, state: r.state, deadline: r.deadline, relevant: r.relevant, baseline: r.baseline})),
    gaps, baselineContradictions: contra, stateText, stateSha256: createHash("sha256").update(stateText, "utf8").digest("hex"),
  };
}
