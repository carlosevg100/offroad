import {z} from "zod";
import {capitalProcedurePacketV2OutputSchema} from "@offroad/financial-model";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const outcome = z.enum(["succeeded", "partial"]);
const committed = z.object({outcome, reason: z.string(), resultFingerprint: hash, canonicalResult: z.string(), committedAt: z.string()});
const withheld = z.object({withheld: z.literal("inputs_not_current"), outcome, reason: z.string(), resultFingerprint: hash, committedAt: z.string()});
/** What a participant reads back: identity and state always, result bytes only while inputs are current. */
export const workExecutionReadSchema = z.object({
  schemaVersion: z.literal("work-execution-read.v1"),
  executionId: z.uuid(), workId: z.uuid(), requestId: z.uuid(), processingRunId: z.uuid(), createdAt: z.string(),
  job: z.object({status: z.string(), attempts: z.number().int().nonnegative(), lastErrorCode: z.string().nullable(), availableAt: z.string().nullable(), updatedAt: z.string()}).nullable(),
  run: z.object({status: z.string(), completedAt: z.string().nullable(), usage: z.unknown()}).nullable(),
  manifest: z.object({contractFingerprint: hash, inputFingerprint: hash, purpose: z.string().nullable(), method: z.object({methodId: z.string(), methodVersion: z.string()}).loose().nullable(), budget: z.unknown(), requestedAt: z.string().nullable()}).nullable(),
  operation: z.object({state: z.string(), settledOutcome: z.string().nullable(), settledReason: z.string().nullable(), resultFingerprint: z.string().nullable()}).nullable(),
  result: z.union([z.null(), withheld, committed]),
  inputsCurrent: z.boolean(),
});
export const workExecutionListSchema = z.array(z.object({
  executionId: z.uuid(), requestId: z.uuid(), processingRunId: z.uuid(), createdAt: z.string(),
  jobStatus: z.string().nullable(), runStatus: z.string().nullable(), outcome: z.string().nullable(), reason: z.string().nullable(), purpose: z.string().nullable(),
}));

export type WorkExecutionState = "queued" | "leased" | "succeeded" | "partial" | "failed" | "withheld" | "unknown";
export type WorkExecutionPacket = {
  status: "framed" | "partial" | "prepared_for_human_review"; question: string; asOf: string;
  alternatives: Array<{id: string; label: string; kind: string; calculated: boolean}>;
  informationGaps: Array<{subjectId: string | null; code: string; reason: string}>;
  contractualGaps: Array<{subjectId: string; code: string}>;
  nextRequirements: string[]; unresolved: string[]; contributions: number; fingerprint: string;
};
export type WorkExecutionView = {
  executionId: string; workId: string; requestId: string; processingRunId: string; createdAt: string;
  state: WorkExecutionState; outcome: "succeeded" | "partial" | null; reason: string | null; inputsCurrent: boolean;
  job: {status: string; attempts: number; lastErrorCode: string | null; updatedAt: string} | null;
  manifest: {purpose: string | null; methodId: string | null; methodVersion: string | null; requestedAt: string | null; contractFingerprint: string; inputFingerprint: string} | null;
  result: null | {withheld: true; resultFingerprint: string; committedAt: string}
    | {withheld: false; resultFingerprint: string; committedAt: string; packet: WorkExecutionPacket | null; marker: {status: string; reason: string} | null};
};
export type WorkExecutionListItem = {executionId: string; createdAt: string; state: WorkExecutionState; outcome: string | null; reason: string | null; purpose: string | null};

const known: Record<string, WorkExecutionState> = {queued: "queued", leased: "leased", succeeded: "succeeded", partial: "partial", failed: "failed"};
export function workExecutionState(input: {withheld?: boolean; outcome: string | null; jobStatus: string | null}): WorkExecutionState {
  if (input.withheld) return "withheld";
  if (input.outcome === "succeeded" || input.outcome === "partial") return input.outcome;
  return (input.jobStatus ? known[input.jobStatus] : undefined) ?? "unknown";
}

/** The committed bytes are either the published packet or the worker's partial marker. Anything
 * else is shown by fingerprint only: this screen never narrates a result it cannot validate. */
export function readCommittedResult(canonicalResult: string): {packet: WorkExecutionPacket | null; marker: {status: string; reason: string} | null} {
  let parsed: unknown;
  try { parsed = JSON.parse(canonicalResult); } catch { return {packet: null, marker: null}; }
  const packet = capitalProcedurePacketV2OutputSchema.safeParse(parsed);
  if (packet.success) {
    const d = packet.data.decision;
    return {marker: null, packet: {status: packet.data.status, question: d.question, asOf: d.asOf,
      alternatives: d.alternatives.map(a => ({id: a.id, label: a.label, kind: a.kind, calculated: a.projection.summary !== null})),
      informationGaps: d.informationGaps, contractualGaps: packet.data.contractualGaps, nextRequirements: d.nextRequirements, unresolved: d.unresolved,
      contributions: d.provenance.contributionIds.length, fingerprint: packet.data.fingerprint}};
  }
  const marker = z.object({status: z.literal("partial"), reason: z.string()}).strict().safeParse(parsed);
  return {packet: null, marker: marker.success ? marker.data : null};
}

export function projectWorkExecution(raw: unknown): WorkExecutionView {
  const r = workExecutionReadSchema.parse(raw);
  const result = r.result === null ? null
    : "withheld" in r.result ? {withheld: true as const, resultFingerprint: r.result.resultFingerprint, committedAt: r.result.committedAt}
    : {withheld: false as const, resultFingerprint: r.result.resultFingerprint, committedAt: r.result.committedAt, ...readCommittedResult(r.result.canonicalResult)};
  return {executionId: r.executionId, workId: r.workId, requestId: r.requestId, processingRunId: r.processingRunId, createdAt: r.createdAt,
    state: workExecutionState({withheld: result?.withheld, outcome: r.result?.outcome ?? null, jobStatus: r.job?.status ?? null}),
    outcome: r.result?.outcome ?? null, reason: r.result?.reason ?? null, inputsCurrent: r.inputsCurrent,
    job: r.job ? {status: r.job.status, attempts: r.job.attempts, lastErrorCode: r.job.lastErrorCode, updatedAt: r.job.updatedAt} : null,
    manifest: r.manifest ? {purpose: r.manifest.purpose, methodId: r.manifest.method?.methodId ?? null, methodVersion: r.manifest.method?.methodVersion ?? null,
      requestedAt: r.manifest.requestedAt, contractFingerprint: r.manifest.contractFingerprint, inputFingerprint: r.manifest.inputFingerprint} : null,
    result};
}

export function projectWorkExecutionList(raw: unknown, pageSize = 25): {items: WorkExecutionListItem[]; nextCursor: string | null} {
  const rows = workExecutionListSchema.parse(raw);
  const items = rows.slice(0, pageSize).map(row => ({executionId: row.executionId, createdAt: row.createdAt, outcome: row.outcome, reason: row.reason, purpose: row.purpose,
    state: workExecutionState({outcome: row.outcome, jobStatus: row.jobStatus})}));
  return {items, nextCursor: rows.length > pageSize ? items[pageSize - 1]!.executionId : null};
}
