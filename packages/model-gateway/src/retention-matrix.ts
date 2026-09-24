import {z} from "zod";
import {dataClassificationSchema, modelPurposeSchema} from "./data-policy";

export const retentionMatrixVersion = "offroad-provider-retention-v2";
export const processingProviderSchema = z.enum(["anthropic", "openai", "perplexity", "firecrawl"]);
export const processingResourceSchema = z.enum([
  "inference", "inline_document", "file_upload", "prompt_cache", "schema_cache",
  "batch", "background", "external_search", "external_tool", "embedding", "persisted_state",
]);
export type ProcessingResource = z.infer<typeof processingResourceSchema>;
const identifier = z.string().min(1).max(200);
const seconds = z.number().int().nonnegative().max(315360000);

/** These are separate obligations. store:false is not an abuse-log or cache guarantee. */
export const retentionCategoriesSchema = z.object({
  requestContentSeconds: seconds,
  abuseMonitoringSeconds: seconds,
  applicationStateSeconds: seconds,
  cacheSeconds: seconds,
  metadataSeconds: seconds,
  exceptions: z.array(z.enum(["legal_hold", "security_investigation", "policy_enforcement"])),
}).strict();

export const processingAssuranceSchema = z.object({
  id: z.uuid(),
  policyVersion: z.literal(retentionMatrixVersion),
  accountRef: identifier,
  projectRef: identifier,
  /** Deployment credential version reference, never a credential or its contents. */
  credentialBinding: identifier,
  provider: processingProviderSchema,
  models: z.array(identifier).min(1).max(50),
  endpoint: z.url(),
  resource: processingResourceSchema,
  region: identifier,
  eligibility: z.enum(["supported", "prohibited", "unknown"]),
  purposes: z.array(modelPurposeSchema).min(1),
  classifications: z.array(dataClassificationSchema).min(1),
  rights: z.array(identifier).min(1),
  trainingUse: z.enum(["prohibited", "permitted", "unknown"]),
  retention: retentionCategoriesSchema,
  zeroRetention: z.enum(["verified", "not_contracted", "ineligible", "unknown"]),
  evidence: z.array(z.object({
    kind: z.enum(["provider_terms", "account_configuration", "credential_binding"]),
    reference: z.string().min(1).max(1000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).min(3),
  reviewedBy: identifier,
  reviewedAt: z.iso.datetime({offset: true}),
  /** Always stated. A date expires at that instant; null holds until revoked or superseded. */
  validThrough: z.iso.datetime({offset: true}).nullable(),
  revokedAt: z.iso.datetime({offset: true}).nullable(),
}).strict();
export type ProcessingAssurance = z.infer<typeof processingAssuranceSchema>;

/** Constructed by the authorized control plane, never by model output. */
export const processingRequirementSchema = z.object({
  policyVersion: z.literal(retentionMatrixVersion),
  accountRef: identifier,
  projectRef: identifier,
  credentialBinding: identifier,
  provider: processingProviderSchema,
  model: identifier,
  endpoint: z.url(),
  resource: processingResourceSchema,
  region: identifier,
  purpose: modelPurposeSchema,
  classification: dataClassificationSchema,
  sourceClassification: dataClassificationSchema,
  rights: z.array(identifier).min(1),
  externalProcessingAllowed: z.boolean(),
  maxRetention: retentionCategoriesSchema,
}).strict();
export type ProcessingRequirement = z.infer<typeof processingRequirementSchema>;
export type ProcessingEligibilityDecision = {
  allowed: boolean;
  policyVersion: typeof retentionMatrixVersion;
  assuranceId: string | null;
  reasons: string[];
};
