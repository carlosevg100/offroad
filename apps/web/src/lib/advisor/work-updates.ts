import type {WorkUpdateChangeRow, WorkUpdateHoldKind, WorkUpdateRow, WorkUpdateStatus, WorkUpdateView} from "./work-update-view";

/** Reason codes a person may give when declining, in the order the interface offers them. */
export const declineReasonCodes = ["not_needed", "cost_not_justified", "inputs_disputed", "other"] as const;
export type DeclineReasonCode = (typeof declineReasonCodes)[number];

/** What changed in one input, across the executions it affected. */
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
  label: string | null;
  state: "scheduled" | "settled" | "declined" | "failed";
  produced: boolean;
  resultReady: boolean;
  reason: string | null;
}>;

export type WorkUpdateAuthorization = Readonly<{candidateId: string; revision: number; label: string | null; maxCostMicrousd: number; maxModelCalls: number}>;
export type WorkUpdateHold = Readonly<{kind: WorkUpdateHoldKind; execution: string | null}>;

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
 * the working basis for an assumption, the release of a procedure. */
function version(change: WorkUpdateChangeRow, side: "pinned" | "head"): string | null {
  const value = change[side];
  if (!value) return null;
  if (change.dependencyKind === "source_version") return text(value.versionNo);
  if (change.dependencyKind === "assumption_slot") return text(value.revision);
  if (change.dependencyKind === "method_release") return text(value.houseReleaseId) ?? text(value.platformReleaseId);
  return null;
}

function numeric(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/** One entry per changed input: the oldest pinned version and the newest head across the facts. */
function changesOf(update: WorkUpdateRow): WorkUpdateChange[] {
  const byKey = new Map<string, {change: WorkUpdateChange; fromRank: number; toRank: number}>();
  for (const execution of update.affected) {
    for (const fact of execution.changes) {
      const kind = fact.reasonClass === "graph_incomplete" && fact.dependencyKind === null ? "graph_incomplete" : fact.dependencyKind ?? "graph_incomplete";
      const key = `${kind}:${fact.logicalKey}`;
      const from = version(fact, "pinned");
      const to = version(fact, "head");
      const current = byKey.get(key);
      const executions = [...new Set([...(current?.change.executions ?? []), execution.label ?? execution.executionId])];
      if (!current) {
        byKey.set(key, {change: {key, kind, name: fact.name, from, to, gap: fact.gap, executions}, fromRank: numeric(from), toRank: numeric(to)});
        continue;
      }
      const earlier = numeric(from) < current.fromRank;
      const later = numeric(to) > current.toRank;
      byKey.set(key, {
        change: {
          ...current.change,
          name: current.change.name ?? fact.name,
          from: earlier ? from : current.change.from,
          to: later ? to : current.change.to,
          gap: current.change.gap ?? fact.gap,
          executions,
        },
        fromRank: earlier ? numeric(from) : current.fromRank,
        toRank: later ? numeric(to) : current.toRank,
      });
    }
  }
  return [...byKey.values()].map((entry) => entry.change);
}

function declineReason(value: string | null): DeclineReasonCode | null {
  const code = value?.startsWith("person_declined:") ? value.slice("person_declined:".length) : null;
  return code && (declineReasonCodes as readonly string[]).includes(code) ? code as DeclineReasonCode : null;
}

function itemOf(update: WorkUpdateRow): WorkUpdateItem {
  const labelOf = new Map(update.affected.map((execution) => [execution.executionId, execution.label]));
  const open = openStatuses.has(update.status);
  return {
    updateId: update.requestId,
    status: update.status,
    revision: update.revision,
    updatedAt: update.updatedAt,
    open,
    changes: changesOf(update),
    recomputed: update.candidates
      .filter((candidate) => candidate.state !== "awaiting_authorization" && !(candidate.state === "declined" && candidate.reason === "superseded"))
      .map((candidate) => ({
        candidateId: candidate.candidateId,
        label: candidate.baseLabel,
        state: candidate.state as WorkUpdateRecomputation["state"],
        produced: candidate.executionId !== null,
        resultReady: candidate.resultMilestoneId !== null,
        reason: candidate.reason,
      })),
    stayedValid: update.unaffected.map((execution) => execution.label ?? execution.executionId),
    awaitingAuthorization: open ? update.candidates.filter((candidate) => candidate.state === "awaiting_authorization").map((candidate) => ({
      candidateId: candidate.candidateId,
      revision: candidate.revision,
      label: candidate.baseLabel,
      maxCostMicrousd: candidate.maxCostMicrousd,
      maxModelCalls: candidate.maxModelCalls,
    })) : [],
    holds: open ? update.affected.flatMap((execution) => execution.holds.filter((hold) => hold.releasedAt === null)
      .map((hold) => ({kind: hold.kind, execution: labelOf.get(execution.executionId) ?? execution.label}))) : [],
    canAdopt: update.status === "ready",
    canDecline: open,
    declineReason: declineReason(update.declineReason),
    decidedAt: update.decision?.occurredAt ?? null,
  };
}

/**
 * The update section of a work: open updates first (the database already orders them), then the
 * recent closed ones. An update awaits a decision when it is ready to adopt or a recomputation
 * waits for authorization.
 */
export function workUpdatesModel(view: Pick<WorkUpdateView, "updates">): WorkUpdatesModel {
  const items = view.updates.map(itemOf);
  const open = items.filter((item) => item.open);
  return {
    open,
    closed: items.filter((item) => !item.open),
    awaitingDecision: open.filter((item) => item.canAdopt || item.awaitingAuthorization.length > 0).length,
  };
}
