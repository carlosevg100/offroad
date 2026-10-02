import {fingerprintInstitutionalModelConfiguration, type InstitutionalModelConfiguration} from "@offroad/financial-model";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/types/database";
import {loadInstitutionalConfigurationReviewBasis, type InstitutionalConfigurationReviewBasis} from "./institutional-configuration-review-command";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const numeric = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const unit = z.enum(["currency", "percent", "days", "multiple", "quantity", "index"]);
const candidateSchema = z.object({candidateId: z.uuid(), revision: z.number().int().positive(), status: z.enum(["review_required", "approved", "rejected"]), configurationFingerprint: hash, parentFingerprint: hash,
  configuration: z.object({currency: z.string().min(1), assumptionBook: z.object({assumptions: z.array(z.object({id: z.string(), label: z.object({pt: z.string().min(1), en: z.string().min(1)}), unit, values: z.record(z.string(), z.string())}).passthrough())}).passthrough()}).passthrough(),
  answerEvidence: z.object({messageId: z.uuid(), requestId: z.uuid(), answeredBy: z.uuid(), answeredAt: z.iso.datetime({offset: true}), responseFingerprint: hash, assumptionId: z.string(), period: z.string().regex(/^\d{4}$/), unit, canonicalValue: numeric, priorValue: numeric.nullable()}),
});
export type InstitutionalConfigurationReview = {candidateId: string; revision: number; status: "review_required" | "approved" | "rejected"; configurationFingerprint: string; parentFingerprint: string; label: {pt: string; en: string}; period: string; unit: z.infer<typeof unit>; currency: string; priorValue: string | null; proposedValue: string; canApprove: boolean; sourceMessageId: string; answeredAt: string; reviewBasis?:InstitutionalConfigurationReviewBasis};

/** Project-authorized RPC input only. Full configuration stays on the server; malformed or
 * unbound proposals never become actionable review cards. Bootstrap revisions have no answer. */
export function parseInstitutionalConfigurationReviews(value: unknown): InstitutionalConfigurationReview[] {
  if (!Array.isArray(value)) return [];
  const approvedHeadSchema = z.object({status: z.literal("approved"), revision: z.number().int().positive(), configurationFingerprint: hash, configuration: z.record(z.string(), z.unknown())});
  const approved = value.flatMap(raw => {
    const parsed = approvedHeadSchema.safeParse(raw);
    if (!parsed.success || fingerprintInstitutionalModelConfiguration(parsed.data.configuration as unknown as InstitutionalModelConfiguration) !== parsed.data.configurationFingerprint) return [];
    return [parsed.data];
  }).sort((a, b) => b.revision - a.revision)[0];
  const result: InstitutionalConfigurationReview[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const parsed = candidateSchema.safeParse(raw);
    if (!parsed.success) continue;
    const c = parsed.data;
    if (seen.has(c.candidateId)) return [];
    seen.add(c.candidateId);
    const matches = c.configuration.assumptionBook.assumptions.filter(a => a.id === c.answerEvidence.assumptionId);
    if (matches.length !== 1 || matches[0].unit !== c.answerEvidence.unit || matches[0].values[c.answerEvidence.period] !== c.answerEvidence.canonicalValue) continue;
    // Fingerprint the original persisted object, not a schema projection that may omit fields.
    if (fingerprintInstitutionalModelConfiguration((raw as {configuration: InstitutionalModelConfiguration}).configuration) !== c.configurationFingerprint) continue;
    result.push({candidateId: c.candidateId, revision: c.revision, status: c.status, configurationFingerprint: c.configurationFingerprint, parentFingerprint: c.parentFingerprint,
      label: matches[0].label, period: c.answerEvidence.period, unit: c.answerEvidence.unit, currency: c.configuration.currency,
      priorValue: c.answerEvidence.priorValue, proposedValue: c.answerEvidence.canonicalValue, canApprove: c.status === "review_required" && approved?.configurationFingerprint === c.parentFingerprint, sourceMessageId: c.answerEvidence.messageId, answeredAt: c.answerEvidence.answeredAt});
  }
  return result;
}
export async function loadInstitutionalConfigurationReviews(client: SupabaseClient<Database>, projectId: string) {
  const {data, error} = await client.rpc("read_institutional_configuration_reviews_v1", {p_project_id: projectId});
  if(error)return [];
  const reviews=parseInstitutionalConfigurationReviews(data);
  const bound=await Promise.all(reviews.map(async review=>{
    const basis=await loadInstitutionalConfigurationReviewBasis(client,projectId,review.candidateId);
    if(!basis||basis.configurationFingerprint!==review.configurationFingerprint||basis.parentFingerprint!==review.parentFingerprint||basis.status!==review.status)return null;
    return {...review,reviewBasis:basis};
  }));
  return bound.filter((review):review is InstitutionalConfigurationReview & {reviewBasis:InstitutionalConfigurationReviewBasis}=>review!==null);
}
