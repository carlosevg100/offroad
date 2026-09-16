import {z} from "zod";

/** A content-free reference. Protected authority snapshots never leave the database. */
export const domainEventSchema = z.strictObject({
  id: z.uuid(),
  organizationId: z.uuid(),
  aggregateKind: z.enum(["membership", "resource_grant", "workspace_capability", "commercial_account_link", "access_policy"]),
  aggregateId: z.uuid(),
  aggregateVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  eventVersion: z.literal(1),
  actorKind: z.enum(["user", "system"]),
  actorId: z.uuid().nullable(),
  reason: z.enum(["created", "changed", "removed"]),
  effect: z.literal("revalidate_authority"),
  correlationId: z.uuid(),
}).refine((event) => (event.actorKind === "user") === (event.actorId !== null), {message: "Actor identity must match its kind"});
export type DomainEvent = z.infer<typeof domainEventSchema>;
