import {randomUUID} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {composeCapitalExecutionRequest, executionContractBasisSchema, type CapitalExecutionComposition} from "@offroad/execution-request";

/**
 * The dependency recompute of stage 18 (increment 3B). The database plans a zero-budget candidate
 * when an input of an execution changed; this loop produces it: it claims the candidate with a
 * lease, asks the database for the basis the execution request would assemble for the original
 * requester at the head inputs, keeps what the root execution was asked (question, objectives,
 * reference date and situations), composes packet, contract and gates with the same composition
 * as the web request action, and submits the three texts through the closed worker RPC, which
 * re-checks the key, re-evaluates the requester's authority and records lineage with the new
 * execution. A refusal found here is recorded by its code. Nothing here calls a model, and the log
 * carries identifiers and codes only.
 */

const originSchema = z.object({
  methodId: z.string().nullable(),
  purpose: z.string().nullable(),
  question: z.string().nullable(),
  objectives: z.array(z.string()).nullable(),
  asOf: z.string().nullable(),
  situationIds: z.array(z.string()).nullable(),
}).strict();

export const recomputeClaimSchema = z.object({
  claimed: z.literal(true),
  candidateId: z.uuid(),
  leaseId: z.uuid(),
  capability: z.string().regex(/^[a-f0-9]{64}$/),
  attempt: z.number().int().positive(),
  leaseExpiresAt: z.iso.datetime({offset: true}),
  organizationId: z.uuid(),
  workId: z.uuid(),
  requestId: z.uuid(),
  baseExecutionId: z.uuid(),
  // Read as the root recorded it; an origin that does not parse is recorded as unavailable below.
  origin: z.unknown(),
}).strict();
export type RecomputeClaim = z.infer<typeof recomputeClaimSchema>;

const endedSchema = z.object({state: z.enum(["scheduled", "awaiting_authorization", "settled", "declined", "failed"]), reason: z.string().nullable().optional()}).loose();
const basisResponseSchema = z.union([
  z.object({available: z.literal(true), versionId: z.uuid(), basis: z.unknown()}).strict(),
  z.object({available: z.literal(false)}).loose().and(endedSchema),
]);
const submitResponseSchema = z.union([
  z.object({produced: z.literal(true), candidateId: z.uuid(), executionId: z.uuid()}).loose(),
  z.object({produced: z.literal(false), candidateId: z.uuid()}).loose().and(endedSchema),
]);
const failResponseSchema = z.object({failed: z.boolean(), candidateId: z.uuid()}).loose().and(endedSchema);

/** The codes the database accepts for a refusal found before submitting. */
export type RecomputeFailureCode = "company_unregistered" | "situation_required" | "situation_unknown" | "method_not_applicable" | "selection_invalid" | "voice_blocked"
  | "gates_invalid" | "method_unavailable" | "origin_unavailable" | "basis_unavailable" | "provenance_denied" | "composition_failed";

export type DependencyRecomputeQueue = {
  claim(): Promise<RecomputeClaim | null>;
  basis(claim: RecomputeClaim): Promise<z.infer<typeof basisResponseSchema>>;
  submit(claim: RecomputeClaim, contractText: string, snapshotText: string, gatesText: string): Promise<z.infer<typeof submitResponseSchema>>;
  fail(claim: RecomputeClaim, code: RecomputeFailureCode): Promise<z.infer<typeof failResponseSchema>>;
};

/** Transport budget grows with the payload: ten seconds plus two per MiB, never above thirty. */
export function recomputeTransportTimeoutMs(bytes: number): number {
  return Math.min(30_000, 10_000 + Math.ceil(Math.max(0, bytes) / 1_048_576) * 2_000);
}

export function createDependencyRecomputeQueue(client: SupabaseClient, workerToken: string, leaseSeconds = 120): DependencyRecomputeQueue {
  const rpc = async (name: string, args: Record<string, unknown>, bytes = 0) => {
    const {data, error} = await client.rpc(name, args).abortSignal(AbortSignal.timeout(recomputeTransportTimeoutMs(bytes)));
    if (error) throw new Error("recompute_transport_failed");
    return data as unknown;
  };
  const lease = (claim: RecomputeClaim) => ({p_worker_token: workerToken, p_candidate: claim.candidateId, p_lease: claim.leaseId, p_capability: claim.capability});
  return {
    async claim() {
      const data = await rpc("worker_claim_dependency_recompute_v1", {p_worker_token: workerToken, p_lease_seconds: leaseSeconds});
      if (z.object({claimed: z.literal(false)}).strict().safeParse(data).success) return null;
      return recomputeClaimSchema.parse(data);
    },
    async basis(claim) {
      return basisResponseSchema.parse(await rpc("worker_dependency_recompute_basis_v1", lease(claim)));
    },
    async submit(claim, contractText, snapshotText, gatesText) {
      const bytes = Buffer.byteLength(contractText, "utf8") + Buffer.byteLength(snapshotText, "utf8") + Buffer.byteLength(gatesText, "utf8");
      return submitResponseSchema.parse(await rpc("worker_submit_dependency_recompute_v1",
        {...lease(claim), p_contract_text: contractText, p_snapshot_text: snapshotText, p_gates_text: gatesText}, bytes));
    },
    async fail(claim, code) {
      return failResponseSchema.parse(await rpc("worker_fail_dependency_recompute_v1", {...lease(claim), p_code: code}));
    },
  };
}

/**
 * The health of the recompute (stage 18, increment 6A): counts and ages across all organizations, never
 * an identifier. The loop reads it at most every 30 seconds and logs `recompute.health` for the
 * CloudWatch filters of monitoring/dependency-recompute-alarms.json; when the oldest scheduled wait
 * passes 30 minutes or a lease expired, it also logs `recompute.backlog.failed` with the same numbers.
 * A failed or malformed read logs `recompute.poll.failed` with reason `health_failed` and never stops
 * the loop.
 */
export const recomputeHealthSchema = z.object({
  scheduledCount: z.number().int().nonnegative(),
  oldestScheduledSeconds: z.number().int().nonnegative(),
  expiredLeaseCount: z.number().int().nonnegative(),
  awaitingAuthorizationCount: z.number().int().nonnegative(),
}).strict();
export type RecomputeHealth = z.infer<typeof recomputeHealthSchema>;
export const RECOMPUTE_HEALTH_INTERVAL_MS = 30_000;
export const RECOMPUTE_BACKLOG_SECONDS = 1_800;

type Log = (event: string, detail?: Record<string, unknown>) => void;
export type RecomputeHealthMonitor = {maybeRead(): Promise<RecomputeHealth | null>};

export function createRecomputeHealthMonitor(client: SupabaseClient, workerToken: string, log: Log,
  options: {now?: () => number; intervalMs?: number} = {}): RecomputeHealthMonitor {
  const now = options.now ?? Date.now;
  const intervalMs = options.intervalMs ?? RECOMPUTE_HEALTH_INTERVAL_MS;
  let lastReadAt: number | null = null;
  return {
    async maybeRead() {
      const at = now();
      // A failed read counts as a read: a broken endpoint is retried every 30 seconds, not every pass.
      if (lastReadAt !== null && at - lastReadAt < intervalMs) return null;
      lastReadAt = at;
      try {
        const {data, error} = await client.rpc("worker_dependency_recompute_health_v1", {p_worker_token: workerToken})
          .abortSignal(AbortSignal.timeout(recomputeTransportTimeoutMs(0)));
        const parsed = error ? null : recomputeHealthSchema.safeParse(data);
        if (!parsed?.success) {
          log("recompute.poll.failed", {reason: "health_failed"});
          return null;
        }
        const {scheduledCount, oldestScheduledSeconds, expiredLeaseCount, awaitingAuthorizationCount} = parsed.data;
        const numbers = {scheduledCount, oldestScheduledSeconds, expiredLeaseCount, awaitingAuthorizationCount};
        log("recompute.health", numbers);
        if (oldestScheduledSeconds > RECOMPUTE_BACKLOG_SECONDS || expiredLeaseCount > 0) log("recompute.backlog.failed", numbers);
        return parsed.data;
      } catch {
        log("recompute.poll.failed", {reason: "health_failed"});
        return null;
      }
    },
  };
}

export type RecomputeOutcome =
  | {status: "idle"}
  | {status: "produced"; candidateId: string; executionId: string}
  | {status: "declined" | "failed" | "stale"; candidateId: string; reason: string};

type Refused = Extract<CapitalExecutionComposition, {ok: false}>;
/** The code a composition refusal is recorded under: gate refusals keep their own code. */
export function recomputeFailureCode(refused: Refused): RecomputeFailureCode {
  return refused.error === "composition_invalid" ? "composition_failed" : refused.error;
}

const endedOutcome = (candidateId: string, state: string, reason: string | null | undefined): RecomputeOutcome =>
  state === "declined" || state === "failed" ? {status: state, candidateId, reason: reason ?? state} : {status: "stale", candidateId, reason: reason ?? state};

/**
 * Claims one scheduled candidate and produces it, or records why it cannot be produced. Returns
 * `idle` when nothing is schedulable. A transport failure is thrown: the lease then expires and the
 * next claim takes the candidate again, up to its attempt limit.
 */
export async function runDependencyRecomputeOnce(queue: DependencyRecomputeQueue, options: {now?: () => Date; newId?: () => string} = {}): Promise<RecomputeOutcome> {
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? randomUUID;
  const claim = await queue.claim();
  if (!claim) return {status: "idle"};
  const fail = async (code: RecomputeFailureCode): Promise<RecomputeOutcome> => {
    const recorded = await queue.fail(claim, code);
    return endedOutcome(claim.candidateId, recorded.state, recorded.reason ?? code);
  };
  // What the root execution was asked is kept as it was asked; without it there is nothing to recompute.
  const parsedOrigin = originSchema.safeParse(claim.origin);
  const origin = parsedOrigin.success ? parsedOrigin.data : null;
  if (!origin || origin.question === null || !origin.objectives?.length || origin.asOf === null || origin.situationIds === null || origin.purpose === null) {
    return fail("origin_unavailable");
  }
  const assembled = await queue.basis(claim);
  if (!assembled.available) {
    if (assembled.state !== "scheduled") return endedOutcome(claim.candidateId, assembled.state, assembled.reason);
    return fail("basis_unavailable");
  }
  const basis = executionContractBasisSchema.safeParse(assembled.basis);
  if (!basis.success || basis.data.organizationId !== claim.organizationId || basis.data.workId !== claim.workId
    || basis.data.versionId !== assembled.versionId || basis.data.purpose !== origin.purpose) {
    return fail("basis_unavailable");
  }
  const composed = composeCapitalExecutionRequest({
    basis: basis.data,
    ask: {question: origin.question, objectives: origin.objectives, asOf: origin.asOf, situationIds: origin.situationIds},
    // The candidate is the request id, so a repeated submission can never create a second execution.
    ids: {executionId: newId(), requestId: claim.candidateId, processingRunId: newId(), snapshotId: newId()},
    now: now(),
  });
  if (!composed.ok) return fail(recomputeFailureCode(composed));
  const submitted = await queue.submit(claim, composed.contractText, composed.snapshotText, composed.gatesText);
  if (submitted.produced) return {status: "produced", candidateId: claim.candidateId, executionId: submitted.executionId};
  return endedOutcome(claim.candidateId, submitted.state, submitted.reason);
}

/**
 * One pass of the recompute loop, as the worker runs it every five seconds: up to `limit` candidates,
 * with the health read, when due, before each claim, so a long pass still reports it. A transport
 * failure ends the pass with `recompute.poll.failed`; the lease then expires and a later pass claims
 * the candidate again.
 */
export async function runDependencyRecomputePass(queue: DependencyRecomputeQueue, health: RecomputeHealthMonitor, log: Log,
  options: {stopping?: () => boolean; limit?: number} = {}): Promise<void> {
  const stopping = options.stopping ?? (() => false);
  const limit = options.limit ?? 10;
  try {
    for (let batch = 0; batch < limit && !stopping(); batch++) {
      await health.maybeRead();
      const outcome = await runDependencyRecomputeOnce(queue);
      if (outcome.status === "idle") break;
      log("recompute.finished", outcome.status === "produced"
        ? {candidate: outcome.candidateId, execution: outcome.executionId, status: outcome.status}
        : {candidate: outcome.candidateId, status: outcome.status, reason: outcome.reason});
    }
  } catch { log("recompute.poll.failed", {reason: "recompute_transport_failed"}); }
}
