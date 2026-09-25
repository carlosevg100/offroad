import {z} from "zod";

/** Changes of an input that executions depend on: the consumer also propagates dependencies. */
export const dependencyChangeAggregateKinds = ["source_version", "method_release"] as const;
/** Kinds recorded before stage 18 with revalidate_authority and propagating dependencies after it. */
const adoptionAggregateKinds: readonly string[] = ["adoption_decision", "assumption_version"];

/**
 * A content-free reference. Protected authority snapshots never leave the database. Every event
 * revalidates authority; `propagate_dependencies` means the database also applies the dependency
 * effect in the same completion (stage 18). The effect follows the kind, as in the database.
 */
export const domainEventSchema = z.strictObject({
  id: z.uuid(),
  organizationId: z.uuid(),
  aggregateKind: z.enum(["membership", "resource_grant", "workspace_capability", "commercial_account_link", "access_policy", "observation", "metric_definition", "adoption_decision", "assumption_version", ...dependencyChangeAggregateKinds]),
  aggregateId: z.uuid(),
  aggregateVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  eventVersion: z.literal(1),
  actorKind: z.enum(["user", "system"]),
  actorId: z.uuid().nullable(),
  reason: z.enum(["created", "changed", "removed"]),
  effect: z.enum(["revalidate_authority", "propagate_dependencies"]),
  correlationId: z.uuid(),
}).refine((event) => (event.actorKind === "user") === (event.actorId !== null), {message: "Actor identity must match its kind"})
  .refine((event) => (dependencyChangeAggregateKinds as readonly string[]).includes(event.aggregateKind)
    ? event.effect === "propagate_dependencies"
    : adoptionAggregateKinds.includes(event.aggregateKind) || event.effect === "revalidate_authority",
  {message: "Effect must follow the aggregate kind"});
export type DomainEvent = z.infer<typeof domainEventSchema>;
