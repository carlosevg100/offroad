import {z} from "zod";

export const revocationDestinations = ["authority_outbox", "search", "cache", "jobs", "artifacts", "storage"] as const;
export const revocationTargetSchema = z.strictObject({
  destination: z.enum(revocationDestinations), state: z.enum(["pending", "completed", "blocked"]),
  deadlineAt: z.iso.datetime({offset: true}), completedAt: z.iso.datetime({offset: true}).nullable(),
  receiptFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
}).refine(t => (t.state === "completed") === (t.completedAt !== null && t.receiptFingerprint !== null), "completion_requires_receipt");

/** Operational receipts never confer authority. Denial stays synchronous in PostgreSQL. */
export function evaluateRevocationReceipts(input: unknown, now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error("revocation_clock_invalid");
  const targets = z.array(revocationTargetSchema).max(6).parse(input);
  if (new Set(targets.map(t => t.destination)).size !== targets.length) throw new Error("revocation_duplicate_destination");
  const missing = revocationDestinations.filter(d => !targets.some(t => t.destination === d));
  const blocked = targets.filter(t => t.state === "blocked").map(t => t.destination);
  const overdue = targets.filter(t => t.state !== "completed" && Date.parse(t.deadlineAt) <= now.getTime()).map(t => t.destination);
  return {completed: missing.length === 0 && targets.every(t => t.state === "completed"), missing, blocked, overdue};
}

/** Preservation and authorization are independent, including an expired object under legal hold. */
export function evaluateRetentionDisposition(input: {
  currentlyAuthorized: boolean; expired: boolean; legalHold: boolean; deletionStarted: boolean;
}) {
  return {
    mayUse: input.currentlyAuthorized && !input.expired && !input.deletionStarted,
    mayErase: input.expired && !input.legalHold,
    disposition: input.legalHold ? "preserve_under_hold" : input.expired ? "erase" : "retain",
  } as const;
}
