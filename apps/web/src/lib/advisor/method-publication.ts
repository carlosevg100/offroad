import {z} from "zod";
import {methodComponentSchema} from "@offroad/credit-playbook";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const identity = {locale: z.enum(["pt-BR", "en-US"]), id: z.uuid()};
export const methodCommandSchema = z.discriminatedUnion("action", [
 z.object({...identity, action: z.literal("submit"), title: z.string().trim().min(1).max(180), baseReleaseId: z.string().min(1).max(200), overrides: z.array(z.json()).max(100), unitId: z.uuid().nullable(), workType: z.string().trim().min(3).max(120)}).strict(),
 z.object({...identity, action: z.literal("review"), reviewId: z.uuid(), fingerprint: hash, evidenceFingerprint: hash, reason: z.string().trim().min(20).max(4000)}).strict(),
 z.object({...identity, action: z.literal("publish"), reviewId: z.uuid(), fingerprint: hash}).strict(),
 z.object({...identity, action: z.literal("retire"), reason: z.string().trim().min(5).max(2000)}).strict(),
 z.object({...identity, action: z.literal("bind"), bindingId: z.uuid(), expectedBindingId: z.uuid().nullable(), unitId: z.uuid().nullable(), workType: z.string().trim().min(3).max(120).nullable(), workId: z.uuid().nullable()}).strict(),
 z.object({locale: identity.locale, action: z.literal("policy"), separateReviewer: z.boolean()}).strict(),
]);
export const methodPageSchema = z.object({
 rows: z.array(z.object({id: z.uuid(), title: z.string(), status: z.enum(["candidate", "published", "retired"]), base_release_id: z.string().nullable(), manifest: z.record(z.string(), z.unknown()), manifest_fingerprint: hash, evidence_fingerprint: hash, created_by: z.uuid().nullable(), published_at: z.string().nullable(), retired_at: z.string().nullable(), reviews: z.array(z.object({id: z.uuid(), reviewed_by: z.uuid(), review_text: z.string(), created_at: z.string()}))})),
 bases: z.array(z.object({id: z.string(), methodId: z.string(), version: z.string(), manifestHash: hash, components: z.array(methodComponentSchema), evidence: z.array(z.object({path: z.string(), hash})), approval: z.object({approvedBy: z.string(), approvedAt: z.string(), approvalSource: z.string()})})),
 bindings: z.array(z.object({id: z.uuid(), releaseId: z.uuid(), unitId: z.uuid().nullable(), workType: z.string().nullable(), workId: z.uuid().nullable()})),
 unavailableReceipts: z.array(z.object({id: z.uuid(), published_at: z.string(), retired_at: z.string().nullable()})),
 scopeId: z.uuid(), canRead: z.boolean(), canWork: z.boolean(), canPublish: z.boolean(), canManage: z.boolean(), separateReviewer: z.boolean(), offset: z.number(),
});
export type MethodPage = z.infer<typeof methodPageSchema> & {viewerId: string; organizationId: string};
export type MethodActionResult = {ok: true} | {ok: false; error: "invalid" | "denied" | "stale"};
