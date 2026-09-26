import {executionRequestTextMaxLength} from "@/lib/execution/request-limits";

import type {WorkUpdateNames} from "./work-update-names";
import type {
  InstitutionalHoldKind, MethodRef, WorkFollowupRow, WorkMilestoneRow, WorkUpdateChangeRow, WorkUpdateHoldKind, WorkUpdateInstitutionalChangeRow, WorkUpdateRow,
  WorkUpdateStatus, WorkUpdateView,
} from "./work-update-view";

/** Reason codes a person may give when declining, in the order the interface offers them. */
export const declineReasonCodes = ["not_needed", "cost_not_justified", "inputs_disputed", "other"] as const;
export type DeclineReasonCode = (typeof declineReasonCodes)[number];

/** What changed in one input, across the dependents it affected. Every text is a display name
 * resolved on the server: a document's own name, a premise's metric or adopted definition (null when
 * neither names it), a method's published title, the financial model; never an internal key. */
export type WorkUpdateChange = Readonly<{
  key: string;
  kind: "source_version" | "assumption_slot" | "method_release" | "institutional_configuration" | "graph_incomplete";
  name: string | null;
  from: string | null;
  to: string | null;
  gap: "no_recorded_edges" | "head_unknown" | "head_behind_pin" | null;
  executions: readonly string[];
}>;

/** One recomputation of an update: an execution redone from its original, or the financial model
 * recalculated. A scheduled one can be declined alone while the update is open. */
export type WorkUpdateRecomputation = Readonly<{
  candidateId: string;
  kind: "execution" | "institutional";
  revision: number;
  label: string;
  state: "scheduled" | "settled" | "declined" | "failed";
  produced: boolean;
  resultReady: boolean;
  reason: string | null;
  canDecline: boolean;
}>;

export type WorkUpdateAuthorization = Readonly<{candidateId: string; revision: number; label: string; maxCostMicrousd: number; maxModelCalls: number}>;
export type WorkUpdateHold = Readonly<{kind: WorkUpdateHoldKind | InstitutionalHoldKind; execution: string}>;

export type WorkUpdateItem = Readonly<{
  updateId: string;
  status: WorkUpdateStatus;
  revision: number;
  updatedAt: string;
  open: boolean;
  changes: readonly WorkUpdateChange[];
  recomputed: readonly WorkUpdateRecomputation[];
  stayedValid: readonly string[];
  awaitingAuthorization: readonly WorkUpdateAuthorization[];
  holds: readonly WorkUpdateHold[];
  /** Later updates that only repeated changes this one already covers, shown inside it. */
  merged: number;
  canAdopt: boolean;
  canDecline: boolean;
  declineReason: DeclineReasonCode | null;
  decidedAt: string | null;
}>;

/** A follow-up typed in the conversation: the base it continues, the execution it led to and where
 * it stands. A ready one can be adopted as the new base; an open, scheduled or ready one declined. */
export type WorkFollowupItem = Readonly<{
  requestId: string;
  status: WorkUpdateStatus;
  revision: number;
  text: string;
  base: Readonly<{label: string; revision: number}>;
  execution: Readonly<{name: string; state: "running" | "result" | "ended"}> | null;
  open: boolean;
  canAdopt: boolean;
  canDecline: boolean;
  /** The objective that fulfils the follow-up when an execution request carries it (see
   * `followupObjective`); null when its text does not fit one objective. */
  objective: string | null;
  /** A person's execution request with that objective would fulfil the follow-up now: it waits for
   * its first execution, or the one it led to ended without a result. */
  canRequestExecution: boolean;
  declineReason: DeclineReasonCode | null;
  decidedAt: string | null;
}>;

/** A recalculated result of the financial model that waits for the adoption of an open update: its
 * candidate settled with a completed result that is not the current one. `covers` lists the results
 * the adoption would replace; `adoptable` says whether the update can be adopted now or still waits
 * for another part of it. */
export type InstitutionalRecalculationWait = Readonly<{updateId: string; adoptable: boolean; covers: readonly string[]}>;

export type WorkUpdatesModel = Readonly<{
  open: readonly WorkUpdateItem[];
  closed: readonly WorkUpdateItem[];
  followups: readonly WorkFollowupItem[];
  recalculations: readonly InstitutionalRecalculationWait[];
  awaitingDecision: number;
}>;

const openStatuses: ReadonlySet<WorkUpdateStatus> = new Set(["open", "awaiting_authorization", "scheduled", "ready"]);

function text(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

/** The version a fact names, as a person reads it: the version number of a source, the revision of
 * the working basis for an assumption, the revision of the approved configuration of the financial
 * model. A method release is named by its identifiers only, which are not shown: the text says a
 * newer version was published. */
function version(change: WorkUpdateChangeRow | WorkUpdateInstitutionalChangeRow, side: "pinned" | "head"): string | null {
  const value = change[side];
  if (!value) return null;
  if (change.dependencyKind === "source_version") return text(value.versionNo);
  if (change.dependencyKind === "assumption_slot" || change.dependencyKind === "institutional_configuration") return text(value.revision);
  return null;
}

/** A dependent as a person reads it: an execution by its method, the financial model by its name. */
type DependentRef = Readonly<{id: string; name: string}>;

/** The dependents as a person reads them: one entry per display name, with how many carry it. */
function dependentNames(entries: readonly DependentRef[], names: WorkUpdateNames): string[] {
  const byName = new Map<string, Set<string>>();
  for (const entry of entries) byName.set(entry.name, (byName.get(entry.name) ?? new Set<string>()).add(entry.id));
  return [...byName].map(([name, ids]) => names.repeated(name, ids.size));
}

type ExecutionRef = Readonly<{executionId: string; method: MethodRef | null}>;
const executionRefs = (entries: readonly ExecutionRef[], names: WorkUpdateNames): DependentRef[] =>
  entries.map((entry) => ({id: entry.executionId, name: names.method(entry.method)}));

function changeName(fact: WorkUpdateChangeRow | WorkUpdateInstitutionalChangeRow, kind: WorkUpdateChange["kind"], names: WorkUpdateNames): string | null {
  if (kind === "source_version") return fact.name;
  if (kind === "institutional_configuration") return names.institutionalModel();
  if (!("premise" in fact)) return null;
  if (kind === "assumption_slot") return names.premise(fact.premise);
  if (kind === "method_release") return names.method(fact.method ?? {methodId: fact.logicalKey, houseTitle: null});
  return null;
}

function numeric(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

type Fact = Readonly<{fact: WorkUpdateChangeRow | WorkUpdateInstitutionalChangeRow; dependent: DependentRef}>;

/** Every fact of an update, each with the dependent it invalidated: the executions and the financial model. */
function factsOf(update: WorkUpdateRow, names: WorkUpdateNames): Fact[] {
  return update.affected.flatMap((entry): Fact[] => entry.dependentKind === "institutional_result"
    ? entry.institutionalChanges.map((fact) => ({fact, dependent: {id: entry.executionId, name: names.institutionalModel()}}))
    : entry.changes.map((fact) => ({fact, dependent: {id: entry.executionId, name: names.method(entry.method)}})));
}

/** One entry per changed input: the oldest pinned version and the newest head across the facts. */
function changesOf(updates: readonly WorkUpdateRow[], names: WorkUpdateNames): WorkUpdateChange[] {
  type Entry = {change: Omit<WorkUpdateChange, "executions">; dependents: DependentRef[]; fromRank: number; toRank: number};
  const byKey = new Map<string, Entry>();
  for (const {fact, dependent} of updates.flatMap((update) => factsOf(update, names))) {
    const kind = fact.reasonClass === "graph_incomplete" && fact.dependencyKind === null ? "graph_incomplete" : fact.dependencyKind ?? "graph_incomplete";
    const key = `${kind}:${fact.logicalKey}`;
    const from = version(fact, "pinned");
    const to = version(fact, "head");
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, {change: {key, kind, name: changeName(fact, kind, names), from, to, gap: fact.gap}, dependents: [dependent], fromRank: numeric(from), toRank: numeric(to)});
      continue;
    }
    const earlier = numeric(from) < current.fromRank;
    const later = numeric(to) > current.toRank;
    byKey.set(key, {
      change: {
        ...current.change,
        name: current.change.name ?? changeName(fact, kind, names),
        from: earlier ? from : current.change.from,
        to: later ? to : current.change.to,
        gap: current.change.gap ?? fact.gap,
      },
      dependents: [...current.dependents, dependent],
      fromRank: earlier ? numeric(from) : current.fromRank,
      toRank: later ? numeric(to) : current.toRank,
    });
  }
  return [...byKey.values()].map((entry) => ({...entry.change, executions: dependentNames(entry.dependents, names)}));
}

function declineReason(value: string | null): DeclineReasonCode | null {
  const code = value?.startsWith("person_declined:") ? value.slice("person_declined:".length) : null;
  return code && (declineReasonCodes as readonly string[]).includes(code) ? code as DeclineReasonCode : null;
}

function recomputationsOf(update: WorkUpdateRow, open: boolean, names: WorkUpdateNames): WorkUpdateRecomputation[] {
  const executions = update.candidates
    .filter((candidate) => candidate.state !== "awaiting_authorization" && !(candidate.state === "declined" && candidate.reason === "superseded"))
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      kind: "execution" as const,
      revision: candidate.revision,
      label: names.method(candidate.baseMethod),
      state: candidate.state as WorkUpdateRecomputation["state"],
      produced: candidate.executionId !== null,
      resultReady: candidate.resultMilestoneId !== null,
      reason: candidate.reason,
      canDecline: open && candidate.state === "scheduled",
    }));
  const institutional = update.institutionalCandidates
    .filter((candidate) => !(candidate.state === "declined" && candidate.reason === "superseded"))
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      kind: "institutional" as const,
      revision: candidate.revision,
      label: names.institutionalModel(),
      state: candidate.state,
      // The recalculation is queued with its candidate; it is being produced once the worker wrote it.
      produced: candidate.resultStatus === "completed",
      resultReady: candidate.resultMilestoneId !== null,
      reason: candidate.reason,
      canDecline: open && candidate.state === "scheduled",
    }));
  return [...executions, ...institutional];
}

function itemOf(update: WorkUpdateRow, merged: readonly WorkUpdateRow[], names: WorkUpdateNames): WorkUpdateItem {
  const open = openStatuses.has(update.status);
  return {
    updateId: update.requestId,
    status: update.status,
    revision: update.revision,
    updatedAt: update.updatedAt,
    open,
    changes: changesOf([update, ...merged], names),
    recomputed: recomputationsOf(update, open, names),
    stayedValid: dependentNames(executionRefs(update.unaffected, names), names),
    awaitingAuthorization: open ? update.candidates.filter((candidate) => candidate.state === "awaiting_authorization").map((candidate) => ({
      candidateId: candidate.candidateId,
      revision: candidate.revision,
      label: names.method(candidate.baseMethod),
      maxCostMicrousd: candidate.maxCostMicrousd,
      maxModelCalls: candidate.maxModelCalls,
    })) : [],
    holds: open ? update.affected.flatMap((entry): WorkUpdateHold[] => entry.dependentKind === "institutional_result"
      ? entry.institutionalHolds.filter((hold) => hold.releasedAt === null).map((hold) => ({kind: hold.kind, execution: names.institutionalModel()}))
      : entry.holds.filter((hold) => hold.releasedAt === null).map((hold) => ({kind: hold.kind, execution: names.method(entry.method)}))) : [],
    merged: merged.length,
    canAdopt: update.status === "ready",
    canDecline: open,
    declineReason: declineReason(update.declineReason),
    decidedAt: update.decision?.occurredAt ?? null,
  };
}

/**
 * An update superseded because an older update already covers its changes (the planner points it at
 * that older one) is merged into it: it adds nothing of its own to decide, so it is shown inside the
 * update that covers it, never as a separate closed entry. An update replaced by a newer one stays
 * where it is. Returns the updates to show, each with the ones merged into it.
 */
function foldMerged(updates: readonly WorkUpdateRow[]): Array<Readonly<{update: WorkUpdateRow; merged: WorkUpdateRow[]}>> {
  const byId = new Map(updates.map((update) => [update.requestId, update]));
  const time = (value: string) => Date.parse(value);
  const coverOf = (update: WorkUpdateRow): WorkUpdateRow | null => {
    let current = update;
    for (let depth = 0; depth < 16; depth += 1) {
      const cover = current.status === "superseded" && current.supersededByRequestId ? byId.get(current.supersededByRequestId) : undefined;
      if (!cover || time(cover.createdAt) > time(current.createdAt)) return current === update ? null : current;
      current = cover;
    }
    return current === update ? null : current;
  };
  const merged = new Map<string, WorkUpdateRow[]>();
  const shown: WorkUpdateRow[] = [];
  for (const update of updates) {
    const cover = coverOf(update);
    if (cover) merged.set(cover.requestId, [...(merged.get(cover.requestId) ?? []), update]);
    else shown.push(update);
  }
  return shown.map((update) => ({update, merged: merged.get(update.requestId) ?? []}));
}

function followupExecutionState(row: WorkFollowupRow): "running" | "result" | "ended" | null {
  if (!row.execution) return null;
  if (row.execution.resultMilestoneId) return "result";
  return row.execution.jobStatus && ["queued", "leased", "awaiting_approval"].includes(row.execution.jobStatus) ? "running" : "ended";
}

/**
 * The objective that cites a follow-up. The database fulfils a follow-up with the next execution a
 * person requests whose objectives carry its text, compared without case and with every run of
 * whitespace as one space (`private.work_followup_citation_v1`). The request form reads one
 * objective per line, so the text goes on one line, collapsing the same whitespace the database
 * collapses; a text longer than one objective cannot be cited and gives null.
 */
export function followupObjective(text: string): string | null {
  const line = text.replace(/[ \t\n\r\f\v]+/g, " ").trim();
  return line && line.length <= executionRequestTextMaxLength ? line : null;
}

function followupOf(row: WorkFollowupRow, milestones: ReadonlyMap<string, WorkMilestoneRow>, names: WorkUpdateNames, label: (raw: string) => string): WorkFollowupItem {
  const open = openStatuses.has(row.status);
  const base = milestones.get(row.baseMilestoneId);
  const state = followupExecutionState(row);
  const objective = followupObjective(row.request);
  return {
    requestId: row.requestId,
    status: row.status,
    revision: row.revision,
    text: row.request,
    base: {label: base ? label(base.label) : label("user_followup"), revision: row.baseRevision},
    execution: row.execution && state ? {name: names.method(row.execution.method), state} : null,
    open,
    canAdopt: row.status === "ready",
    canDecline: open,
    objective,
    // The database links a new request only to an open follow-up, or to a scheduled one whose
    // execution is no longer live; a ready one already has its result.
    canRequestExecution: objective !== null && (row.status === "open" || (row.status === "scheduled" && state === "ended")),
    declineReason: declineReason(row.declineReason),
    decidedAt: row.decision?.occurredAt ?? null,
  };
}

/** The recalculated results of the financial model that wait in open updates for adoption, the ones
 * the person can adopt now first. Only the adoption makes such a result current (5C). */
function recalculationWaits(updates: readonly WorkUpdateRow[]): InstitutionalRecalculationWait[] {
  const waits = updates.filter((update) => openStatuses.has(update.status)).flatMap((update) => update.institutionalCandidates
    .filter((candidate) => candidate.state === "settled" && candidate.resultStatus === "completed" && !candidate.current)
    .map((candidate) => ({updateId: update.requestId, adoptable: update.status === "ready", covers: [...candidate.resultIds]})));
  return [...waits.filter((wait) => wait.adoptable), ...waits.filter((wait) => !wait.adoptable)];
}

/** The recalculation that waits for adoption and would replace the result the results panel shows:
 * the first wait whose candidate covers that result. Null when none does, or when the updates could
 * not be read. */
export function recalculationAwaitingAdoption(model: WorkUpdatesModel | null, resultId: string): InstitutionalRecalculationWait | null {
  return model?.recalculations.find((wait) => wait.covers.includes(resultId)) ?? null;
}

/** What the execution request shows when it starts from a follow-up: its text, the objective that
 * cites it and the base it continues, or that it no longer waits for an execution. The request
 * action validates everything as for any other request; this only fills the form. */
export type ExecutionFollowup =
  | Readonly<{state: "ready"; requestId: string; text: string; objective: string; base: Readonly<{label: string; revision: number}>}>
  | Readonly<{state: "unavailable"}>;

export function executionFollowup(model: WorkUpdatesModel | null, requestId: string): ExecutionFollowup {
  const item = model?.followups.find((followup) => followup.requestId === requestId);
  if (!item?.canRequestExecution || item.objective === null) return {state: "unavailable"};
  return {state: "ready", requestId: item.requestId, text: item.text, objective: item.objective, base: item.base};
}

/**
 * The update section of a work: open updates first (the database already orders them), then the
 * recent closed ones, each with the later updates merged into it; then the follow-ups typed in the
 * conversation. An update awaits a decision when it is ready to adopt or a recomputation waits for
 * authorization; a follow-up when its execution's result is ready to adopt. The recalculated results
 * of the financial model that wait in open updates are listed for the results panel. `names` turns
 * the view's identifiers into display names on the server, and `label` a milestone label into the
 * words a person reads.
 */
export function workUpdatesModel(view: Pick<WorkUpdateView, "updates"> & Partial<Pick<WorkUpdateView, "followups" | "milestones">>, names: WorkUpdateNames,
  label: (raw: string) => string = (raw) => raw): WorkUpdatesModel {
  const items = foldMerged(view.updates).map(({update, merged}) => itemOf(update, merged, names));
  const open = items.filter((item) => item.open);
  const milestones = new Map((view.milestones ?? []).map((row) => [row.milestoneId, row]));
  const followups = (view.followups ?? []).map((row) => followupOf(row, milestones, names, label));
  return {
    open,
    closed: items.filter((item) => !item.open),
    followups,
    recalculations: recalculationWaits(view.updates),
    awaitingDecision: open.filter((item) => item.canAdopt || item.awaitingAuthorization.length > 0).length + followups.filter((item) => item.canAdopt).length,
  };
}
