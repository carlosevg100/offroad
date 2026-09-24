import {
  processingAssuranceSchema, processingRequirementSchema, retentionMatrixVersion,
  type ProcessingEligibilityDecision, type ProcessingRequirement,
} from "./retention-matrix";

const ranks = {public: 0, internal: 1, confidential: 2, restricted: 3};
const categories = ["requestContentSeconds", "abuseMonitoringSeconds", "applicationStateSeconds", "cacheSeconds", "metadataSeconds"] as const;

/** Exact lookup, no provider-wide inheritance, wildcard model, or cached authorization. */
export function evaluateResourceEligibility(input: {
  requirement: ProcessingRequirement;
  assurances: readonly unknown[];
  now: Date;
}): ProcessingEligibilityDecision {
  const deny = (...reasons: string[]): ProcessingEligibilityDecision => ({
    allowed: false, policyVersion: retentionMatrixVersion, assuranceId: null, reasons,
  });
  const parsed = processingRequirementSchema.safeParse(input.requirement);
  if (!parsed.success || !Number.isFinite(input.now.getTime())) return deny("processing_requirement_invalid");
  const r = parsed.data;
  if (!r.externalProcessingAllowed) return deny("external_processing_not_authorized");
  if (ranks[r.classification] < ranks[r.sourceClassification]) return deny("classification_downgrade");
  const records = input.assurances.map(a => processingAssuranceSchema.safeParse(a));
  if (records.some(a => !a.success)) return deny("processing_matrix_invalid");
  const matches = records.flatMap(a => a.success ? [a.data] : []).filter(a =>
    a.accountRef === r.accountRef && a.projectRef === r.projectRef &&
    a.credentialBinding === r.credentialBinding && a.provider === r.provider &&
    a.models.includes(r.model) && a.endpoint === r.endpoint && a.resource === r.resource &&
    a.region === r.region && a.revokedAt === null);
  if (matches.length === 0) return deny("processing_assurance_missing");
  // Replacement is explicit revocation + a new immutable record, never last-write-wins.
  if (matches.length !== 1) return deny("processing_assurance_ambiguous");
  const a = matches[0]!;
  const reasons: string[] = [];
  if (a.eligibility !== "supported") reasons.push("processing_resource_not_supported");
  if (a.trainingUse !== "prohibited") reasons.push("provider_training_not_prohibited");
  if (!a.purposes.includes(r.purpose)) reasons.push("processing_purpose_not_approved");
  if (!a.classifications.includes(r.classification)) reasons.push("processing_classification_not_approved");
  if (r.rights.some(right => !a.rights.includes(right))) reasons.push("processing_rights_not_approved");
  if (["provider_terms", "account_configuration", "credential_binding"].some(kind => !a.evidence.some(e => e.kind === kind))) reasons.push("processing_evidence_incomplete");
  // A stated date expires exactly as before. A null validThrough has no date to pass: it holds until
  // revoked, and superseding it is a revocation plus a new record, as above. Written so that a date
  // that does not parse fails closed instead of comparing false.
  const reviewed = Date.parse(a.reviewedAt), now = input.now.getTime();
  const expires = a.validThrough === null ? Number.POSITIVE_INFINITY : Date.parse(a.validThrough);
  if (!(reviewed <= now && expires > reviewed && expires > now)) reasons.push("processing_assurance_outside_validity");
  for (const category of categories) if (a.retention[category] > r.maxRetention[category]) reasons.push(`retention_exceeds_${category}`);
  if (a.retention.exceptions.some(exception => !r.maxRetention.exceptions.includes(exception))) reasons.push("retention_exception_not_accepted");
  return {allowed: reasons.length === 0, policyVersion: retentionMatrixVersion, assuranceId: a.id, reasons};
}
