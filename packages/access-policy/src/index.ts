import {z} from "zod";

/** Vocabulary and wire validation only. PostgreSQL is the sole policy decision point. */
export const resourceActionSchema = z.enum(["read", "work", "manage", "publish"]);
export const resourcePurposeSchema = z.enum(["analysis", "retrieval", "publication", "export"]);
export const policyEffectSchema = z.enum(["allow", "deny"]);
export const policyPrincipalSchema = z.discriminatedUnion("kind", [
  z.strictObject({kind: z.literal("human"), id: z.uuid(), organizationId: z.uuid(), userId: z.uuid()}),
  z.strictObject({kind: z.literal("worker"), id: z.uuid(), organizationId: z.uuid(), humanPrincipalId: z.uuid(), processingJobId: z.uuid(), resourceId: z.uuid(), workerTokenId: z.uuid(), accountUserId: z.uuid(), expiresAt: z.iso.datetime({offset: true})}),
]);
export const accessExplanationSchema = z.discriminatedUnion("allowed", [
  z.strictObject({allowed: z.literal(false), capabilities: z.tuple([])}),
  z.strictObject({allowed: z.literal(true), capabilities: z.array(resourceActionSchema).min(1), policyVersion: z.literal(1)}),
]);
export const accessGroupCommandSchema = z.strictObject({
  id: z.uuid().nullable(), name: z.string().trim().min(1).max(120), enabled: z.boolean().default(true),
  unitId: z.uuid().nullable().default(null), parentGroupId: z.null().default(null),
});
export const accessGroupMemberCommandSchema = z.strictObject({
  groupId: z.uuid(), userId: z.uuid(), enabled: z.boolean().default(true), expiresAt: z.iso.datetime({offset: true}).nullable().default(null),
});
export const barrierMemberSchema = z.union([
  z.strictObject({userId: z.uuid(), effect: policyEffectSchema, expiresAt: z.iso.datetime({offset: true}).nullable().optional()}),
  z.strictObject({groupId: z.uuid(), effect: policyEffectSchema, expiresAt: z.iso.datetime({offset: true}).nullable().optional()}),
]);
export const informationBarrierCommandSchema = z.strictObject({
  id: z.uuid().nullable(), resourceId: z.uuid(), name: z.string().trim().min(1).max(120), enabled: z.boolean().default(true), members: z.array(barrierMemberSchema).max(1000),
});
export type AccessExplanation = z.infer<typeof accessExplanationSchema>;
export type PolicyPrincipal = z.infer<typeof policyPrincipalSchema>;

/** Checked-in cases are consumed by SQL too; they specify expected decisions, not a JS evaluator. */
export const policyConformanceVectorSchema = z.strictObject({id: z.string().regex(/^[a-z_]+$/), action: resourceActionSchema, purpose: resourcePurposeSchema, expected: z.boolean()});

export const accessAdministrationSchema = z.strictObject({canAdminister: z.boolean()});
/** Display only. Missing/malformed server capabilities never fall back to membership role. */
export function accessAdministration(value: unknown): {canAdminister: boolean} {
 const parsed=accessAdministrationSchema.safeParse(value);
 return parsed.success ? parsed.data : {canAdminister:false};
}
