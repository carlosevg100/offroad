import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

const uuid = z.uuid();
const health = {blockedCount: z.number().int().nonnegative(), oldestPendingSeconds: z.number().nonnegative(), heldCount: z.number().int().nonnegative()};
const claimSchema = z.discriminatedUnion("claimed", [
  z.strictObject({claimed: z.literal(false), ...health}),
  z.strictObject({claimed: z.literal(true), ...health, actionId: uuid, capability: z.string().regex(/^[a-f0-9]{64}$/),
    bucket: z.enum(["case-artifacts", "opportunity-documents", "document-layers", "capital-input-capture"]),
    path: z.string().min(1).max(1024), leaseExpiresAt: z.iso.datetime({offset: true})}),
]);
const ackSchema = z.strictObject({completed: z.literal(true), replayed: z.boolean()});
const retrySchema = z.strictObject({retryScheduled: z.boolean(), blocked: z.boolean()});
type Log = (event: string, detail?: Record<string, unknown>) => void;

function exactAbsent(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const e = error as {status?: unknown; statusCode?: unknown; message?: unknown};
  return [400, 404].includes(Number(e.status)) && Number(e.statusCode) === 404
    && typeof e.message === "string" && /^(object not found|the resource was not found)$/i.test(e.message);
}

/** Dedicated retention identity, independent of a revoked analysis job. PostgreSQL grants only
 * the exact leased path and metadata operations; cleanup never authorizes a byte download. */
export function createRetentionWorker(client: SupabaseClient, workerToken: string, log: Log, now = Date.now) {
  return {
    async poll(): Promise<boolean> {
      const claimed = await client.rpc("worker_claim_retention_action_v1", {p_worker_token: workerToken});
      if (claimed.error) {log("retention.poll.failed", {reason: "authority_or_transport_failed"}); return false;}
      const parsed = claimSchema.safeParse(claimed.data);
      if (!parsed.success) {log("retention.poll.failed", {reason: "invalid_contract"}); return false;}
      const item = parsed.data;
      log("retention.health", {blockedCount: item.blockedCount, oldestPendingSeconds: item.oldestPendingSeconds, heldCount: item.heldCount});
      if (!item.claimed) return false;
      const args = {p_worker_token: workerToken, p_action_id: item.actionId, p_capability: item.capability};
      let reason = "storage_delete_failed";
      try {
        const live = () => {if (Date.parse(item.leaseExpiresAt) <= now()) throw new Error("retention_lease_expired");};
        live();
        const revalidated = await client.rpc("worker_revalidate_retention_action_v1", args);
        if (revalidated.error || revalidated.data !== true) throw new Error("retention_scope_denied");
        const storage = client.storage.from(item.bucket);
        const removed = await storage.remove([item.path]);
        if (removed.error || !Array.isArray(removed.data) || removed.data.some(o => o.name !== item.path)) throw new Error("retention_delete_unconfirmed");
        live(); reason = "storage_absence_unconfirmed";
        const absent = await storage.info(item.path);
        if (absent.data || !exactAbsent(absent.error)) throw new Error("retention_absence_unconfirmed");
        live();
      } catch {
        const retry = await client.rpc("worker_retry_retention_action_v1", {...args, p_reason: reason});
        const result = !retry.error && retrySchema.safeParse(retry.data);
        log("retention.retry", {confirmed: !!result && result.success});
        return false;
      }
      // Lost ACK is reconciled through the same identity on the next lease; never log success
      // after a transport failure or turn an HTTP 403/timeout into evidence of erasure.
      const ack = await client.rpc("worker_ack_retention_action_v1", {...args, p_storage_absence_confirmed: true});
      if (ack.error || !ackSchema.safeParse(ack.data).success) {log("retention.ack.failed", {reason: "completion_unconfirmed"}); return false;}
      log("retention.completed"); return true;
    },
  };
}
