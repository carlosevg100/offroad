import {z} from "zod";
import type {Provider} from "./types";

export const providerDataPolicyVersion = "offroad-provider-data-policy-v1";

export const dataClassificationSchema = z.enum(["public", "internal", "confidential", "restricted"]);
export type DataClassification = z.infer<typeof dataClassificationSchema>;

export const modelPurposeSchema = z.enum([
  "public_research",
  "document_processing",
  "case_analysis",
  "artifact_generation",
  "localization",
  "evaluation",
]);
export type ModelPurpose = z.infer<typeof modelPurposeSchema>;

export const dataHandlingContextSchema = z.object({
  classification: dataClassificationSchema,
  purpose: modelPurposeSchema,
  requiredPolicyVersion: z.string().min(1),
});
export type DataHandlingContext = z.infer<typeof dataHandlingContextSchema>;

export const providerDataAssuranceSchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  policyVersion: z.string().min(1),
  approvedPurposes: z.array(modelPurposeSchema),
  allowedClassifications: z.array(dataClassificationSchema),
  trainingUse: z.enum(["prohibited", "permitted", "unknown"]),
  storage: z.enum(["no_store", "provider_retention", "unknown"]),
  reviewedAt: z.string().datetime({offset: true}),
  validThrough: z.string().datetime({offset: true}),
});
export type ProviderDataAssurance = z.infer<typeof providerDataAssuranceSchema>;

export const providerDataDecisionSchema = z.object({
  allowed: z.boolean(),
  provider: z.enum(["anthropic", "openai"]),
  policyVersion: z.string().min(1).nullable(),
  reasons: z.array(z.string().min(1)),
});
export type ProviderDataDecision = z.infer<typeof providerDataDecisionSchema>;

/**
 * Pure, fail-closed provider decision. It proves only what the supplied assurance record says;
 * it does not encode or invent contractual promises by a vendor.
 */
export function evaluateProviderDataPolicy(input: {
  provider: Provider;
  context: DataHandlingContext;
  assurance: ProviderDataAssurance | undefined;
  now?: Date;
}): ProviderDataDecision {
  const context = dataHandlingContextSchema.parse(input.context);
  const assurance = input.assurance ? providerDataAssuranceSchema.parse(input.assurance) : undefined;
  const reasons: string[] = [];
  if (!assurance) {
    reasons.push("provider_assurance_missing");
    return {allowed: false, provider: input.provider, policyVersion: null, reasons};
  }
  if (assurance.provider !== input.provider) reasons.push("provider_assurance_mismatch");
  if (assurance.policyVersion !== context.requiredPolicyVersion) reasons.push("provider_policy_version_mismatch");
  if (!assurance.approvedPurposes.includes(context.purpose)) reasons.push("purpose_not_approved");
  if (!assurance.allowedClassifications.includes(context.classification)) reasons.push("data_classification_not_approved");
  if (assurance.trainingUse !== "prohibited") reasons.push("provider_training_use_not_prohibited");
  if (context.classification !== "public" && assurance.storage !== "no_store") reasons.push("non_public_data_requires_no_store");
  const now = (input.now ?? new Date()).getTime();
  const reviewedAt = new Date(assurance.reviewedAt).getTime();
  const validThrough = new Date(assurance.validThrough).getTime();
  if (reviewedAt > now) reasons.push("provider_assurance_reviewed_in_future");
  if (validThrough <= reviewedAt) reasons.push("provider_assurance_window_invalid");
  if (validThrough < now) reasons.push("provider_assurance_expired");
  return {allowed: reasons.length === 0, provider: input.provider, policyVersion: assurance.policyVersion, reasons};
}
