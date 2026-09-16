import type {SupabaseClient} from "@supabase/supabase-js";
import {domainEventSchema} from "@offroad/domain-contracts";
import {z} from "zod";

const health = {
  blockedCount: z.number().int().nonnegative(),
  oldestPendingSeconds: z.number().nonnegative(),
};
const claimSchema = z.discriminatedUnion("claimed", [
  z.strictObject({claimed: z.literal(false), ...health}),
  z.strictObject({claimed: z.literal(true), ...health, outboxId: z.uuid(), capability: z.string().regex(/^[a-f0-9]{64}$/), event: domainEventSchema}),
]);
const completionSchema = z.strictObject({completed: z.boolean(), replayed: z.boolean(), appliedCount: z.number().int().nonnegative()});
type Log = (event: string, detail?: Record<string, unknown>) => void;

/** The database executes and acknowledges the internal effect atomically. Lost replies can
 * be retried; a crashed process leaves an expiring lease, never an in-memory-only event. */
export function createEventOutboxConsumer(client: SupabaseClient, workerToken: string, log: Log) {
  return {
    async poll(): Promise<boolean> {
      const claim = await client.rpc("claim_event_outbox_v1", {p_worker_token: workerToken});
      if (claim.error) { log("outbox.poll.failed", {reason: "rpc_failed"}); return false; }
      const parsed = claimSchema.safeParse(claim.data);
      if (!parsed.success) { log("outbox.poll.failed", {reason: "invalid_contract"}); return false; }
      const item = parsed.data;
      log("outbox.health", {blockedCount: item.blockedCount, oldestPendingSeconds: item.oldestPendingSeconds});
      if (item.blockedCount > 0 || item.oldestPendingSeconds > 300) {
        log("outbox.backlog.failed", {blockedCount: item.blockedCount, oldestPendingSeconds: item.oldestPendingSeconds});
      }
      if (!item.claimed) return false;
      const args = {p_worker_token: workerToken, p_outbox_id: item.outboxId, p_capability: item.capability};
      // At most one immediate retry on an ambiguous response; the same capability makes
      // an already committed completion harmless. No event payload is executed in JS.
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await client.rpc("complete_event_outbox_v1", args);
        if (result.error) continue;
        const completed = completionSchema.safeParse(result.data);
        if (!completed.success) break;
        log("outbox.processed", {eventId: item.event.id, ...completed.data});
        return true;
      }
      log("outbox.complete.failed", {eventId: item.event.id, reason: "completion_unconfirmed"});
      return false;
    },
  };
}
