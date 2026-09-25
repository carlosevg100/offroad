import type {WorkUpdateNames} from "./work-update-names";
import type {MethodRef, WorkUpdateChangeRow, WorkUpdateHoldKind, WorkUpdateRow, WorkUpdateStatus, WorkUpdateView} from "./work-update-view";

/** Reason codes a person may give when declining, in the order the interface offers them. */
export const declineReasonCodes = ["not_needed", "cost_not_justified", "inputs_disputed", "other"] as const;
export type DeclineReasonCode = (typeof declineReasonCodes)[number];

/** What changed in one input, across the executions it affected. Every text is a display name
 * resolved on the server: a document's own name, a premise's metric or adopted definition (null when
 * neither names it), a method's published title; never an internal key. */
export type WorkUpdateChange = Readonly<{
  key: string;
  kind: "source_version" | "assumption_slot" | "method_release" | "graph_incomplete";
  name: string | null;
  from: string | null;
  to: string | null;
  gap: "no_recorded_edges" | "head_unknown" | "head_behind_pin" | null;
  executions: readonly string[];
}>;

export type WorkUpdateRecomputation = Readonly<{
  candidateId: string;
  label: string;
  state: "scheduled" | "settled" | "declined" | "failed";
  produced: boolean;
  resultReady: boolean;
  reason: string | null;
}>;

export type WorkUpdateAuthorization = Readonly<{candidateId: string; revision: number; label: string; maxCostMicrousd: number; maxModelCalls: number}>;
export type WorkUpdateHold = Readonly<{kind: WorkUpdateHoldKind; execution: string}>;

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
  canAdopt: boolean;
  canDecline: boolean;
  declineReason: DeclineReasonCode | null;
  decidedAt: string | null;
}>;

export type WorkUpdatesModel = Readonly<{open: readonly WorkUpdateItem[]; closed: readonly WorkUpdateItem[]; awaitingDecision: number}>;

const openStatuses: ReadonlySet<WorkUpdateStatus> = new Set(["open", "awaiting_authorization", "scheduled", "ready"]);

function text(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

/** The version a fact names, as a person reads it: the version number of a source, the revision of
 * the working basis for an assumption. A method release is named by its identifiers only, which are
 * not shown: the text says a newer version was published. */
function version(change: WorkUpdateChangeRow, side: "pinned" | "head"): string | null {
  const value = change[side];
  if (!value) return null;
  if (change.dependencyKind === "source_version") return text(value.versionNo);
  if (change.dependencyKind === "assumption_slot") return text(value.revision);
  return null;
}

type ExecutionRef = Readonly<{executionId: string; method: MethodRef | null}>;

/** The executions as a person reads them: one entry per display name, with how many carry it. */
function executionNames(entries: readonly ExecutionRef[], names: WorkUpdateNames): string[] {
  const byName = new Map<string, Set<string>>();
  for (const entry of entries) {
    const name = names.method(entry.method);
    byName.set(name, (byName.get(name) ?? new Set<string>()).add(entry.executionId));
  }
  return [...byName].map(([name, executions]) => names.repeated(name, executions.size));
}

function changeName(fact: WorkUpdateChangeRow, kind: WorkUpdateChange["kind"], names: WorkUpdateNames): string | null {
  if (kind === "source_version") return fact.name;
  if (kind === "assumption_slot") return names.premise(fact.premise);
  if (kind === "method_release") return names.method(fact.method ?? {methodId: fact.logicalKey, houseTitle: null});
  return null;
}

function numeric(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/** One entry per changed input: the oldest pinned version and the newest head across the facts. */
function changesOf(update: WorkUpdateRow, names: WorkUpdateNames): WorkUpdateChange[] {
  type Entry = {change: Omit<WorkUpdateChange, "executions">; executions: ExecutionRef[]; fromRank: number; toRank: number};
  const byKey = new Map<string, Entry>();
  for (const execution of update.affected) {
    for (const fact of execution.changes) {
      const kind = fact.reasonClass === "graph_incomplete" && fact.dependencyKind === null ? "graph_incomplete" : fact.dependencyKind ?? "graph_incomplete";
      const key = `${kind}:${fact.logicalKey}`;
      const from = version(fact, "pinned");
      const to = version(fact, "head");
      const current = byKey.get(key);
      const reference = {executionId: execution.executionId, method: execution.method};
      if (!current) {
        byKey.set(key, {change: {key, kind, name: changeName(fact, kind, names), from, to, gap: fact.gap}, executions: [reference], fromRank: numeric(from), toRank: numeric(to)});
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
        executions: [...current.executions, reference],
        fromRank: earlier ? numeric(from) : current.fromRank,
        toRank: later ? numeric(to) : current.toRank,
      });
    }
  }
  return [...byKey.values()].map((entry) => ({...entry.change, executions: executionNames(entry.executions, names)}));
}

function declineReason(value: string | null): DeclineReasonCode | null {
  const code = value?.startsWith("person_declined:") ? value.slice("person_declined:".length) : null;
  return code && (declineReasonCodes as readonly string[]).includes(code) ? code as DeclineReasonCode : null;
}

function itemOf(update: WorkUpdateRow, names: WorkUpdateNames): WorkUpdateItem {
  const open = openStatuses.has(update.status);
  return {
    updateId: update.requestId,
    status: update.status,
    revision: update.revision,
    updatedAt: update.updatedAt,
    open,
    changes: changesOf(update, names),
    recomputed: update.candidates
      .filter((candidate) => candidate.state !== "awaiting_authorization" && !(candidate.state === "declined" && candidate.reason === "superseded"))
      .map((candidate) => ({
        candidateId: candidate.candidateId,
        label: names.method(candidate.baseMethod),
        state: candidate.state as WorkUpdateRecomputation["state"],
        produced: candidate.executionId !== null,
        resultReady: candidate.resultMilestoneId !== null,
        reason: candidate.reason,
      })),
    stayedValid: executionNames(update.unaffected, names),
    awaitingAuthorization: open ? update.candidates.filter((candidate) => candidate.state === "awaiting_authorization").map((candidate) => ({
      candidateId: candidate.candidateId,
      revision: candidate.revision,
      label: names.method(candidate.baseMethod),
      maxCostMicrousd: candidate.maxCostMicrousd,
      maxModelCalls: candidate.maxModelCalls,
    })) : [],
    holds: open ? update.affected.flatMap((execution) => execution.holds.filter((hold) => hold.releasedAt === null)
      .map((hold) => ({kind: hold.kind, execution: names.method(execution.method)}))) : [],
    canAdopt: update.status === "ready",
    canDecline: open,
    declineReason: declineReason(update.declineReason),
    decidedAt: update.decision?.occurredAt ?? null,
  };
}

/**
 * The update section of a work: open updates first (the database already orders them), then the
 * recent closed ones. An update awaits a decision when it is ready to adopt or a recomputation
 * waits for authorization. `names` turns the view's identifiers into display names on the server.
 */
export function workUpdatesModel(view: Pick<WorkUpdateView, "updates">, names: WorkUpdateNames): WorkUpdatesModel {
  const items = view.updates.map((update) => itemOf(update, names));
  const open = items.filter((item) => item.open);
  return {
    open,
    closed: items.filter((item) => !item.open),
    awaitingDecision: open.filter((item) => item.canAdopt || item.awaitingAuthorization.length > 0).length,
  };
}
