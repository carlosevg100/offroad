import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

export const trustControlDomainSchema = z.enum([
  "governance",
  "identity",
  "data",
  "application",
  "documents",
  "ai",
  "sdlc",
  "cloud",
  "operations",
  "vendor",
  "people",
]);
export type TrustControlDomain = z.infer<typeof trustControlDomainSchema>;

export const trustControlStateSchema = z.enum([
  "not_designed",
  "designed",
  "implemented",
  "operating",
  "evidenced",
  "independently_tested",
  "exception_open",
]);
export type TrustControlState = z.infer<typeof trustControlStateSchema>;

export const trustEvidenceKindSchema = z.enum([
  "policy",
  "design",
  "automated_test",
  "configuration_snapshot",
  "operating_record",
  "exercise",
  "contract",
  "external_assessment",
]);
export type TrustEvidenceKind = z.infer<typeof trustEvidenceKindSchema>;

export const trustEnvironmentSchema = z.enum(["governance", "development", "staging", "production"]);
export type TrustEnvironment = z.infer<typeof trustEnvironmentSchema>;

export const trustEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  kind: trustEvidenceKindSchema,
  environment: trustEnvironmentSchema,
  collectedAt: z.string().datetime({offset: true}),
  validThrough: z.string().datetime({offset: true}).nullable(),
  immutableRef: z.string().min(1),
});
export type TrustEvidence = z.infer<typeof trustEvidenceSchema>;

export const trustFindingSchema = z.object({
  findingId: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["open", "risk_accepted", "remediated", "retested"]),
  ownerId: z.string().min(1).nullable(),
  dueAt: z.string().datetime({offset: true}).nullable(),
});
export type TrustFinding = z.infer<typeof trustFindingSchema>;

export const trustControlRecordSchema = z.object({
  controlId: z.string().regex(/^[A-Z][A-Z0-9_/-]*-[0-9]{2,3}$/),
  domain: trustControlDomainSchema,
  title: z.string().min(1),
  applicable: z.boolean(),
  exclusionJustification: z.string().min(1).nullable(),
  ownerId: z.string().min(1).nullable(),
  state: trustControlStateSchema,
  evidence: z.array(trustEvidenceSchema),
  findings: z.array(trustFindingSchema),
});
export type TrustControlRecord = z.infer<typeof trustControlRecordSchema>;

const auditableControlStateSchema = z.enum([
  "designed",
  "implemented",
  "operating",
  "evidenced",
  "independently_tested",
]);

export const trustGateRequirementSchema = z.object({
  controlId: trustControlRecordSchema.shape.controlId,
  minimumState: auditableControlStateSchema,
  evidenceKinds: z.array(trustEvidenceKindSchema),
  environments: z.array(trustEnvironmentSchema),
});
export type TrustGateRequirement = z.infer<typeof trustGateRequirementSchema>;

export const trustGateIssueSchema = z.object({
  code: z.string().min(1),
  controlId: trustControlRecordSchema.shape.controlId,
});
export type TrustGateIssue = z.infer<typeof trustGateIssueSchema>;

export const trustReleaseGateDecisionSchema = z.object({
  allowed: z.boolean(),
  releaseId: z.string().min(1),
  blockers: z.array(trustGateIssueSchema),
  warnings: z.array(trustGateIssueSchema),
  assessedControlIds: z.array(trustControlRecordSchema.shape.controlId),
  decisionFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type TrustReleaseGateDecision = z.infer<typeof trustReleaseGateDecisionSchema>;

/**
 * Evaluates the trust obligations of one release without turning compliance into a weighted score.
 * A single missing boundary, owner, current evidence item, or critical/high finding blocks the
 * release. Sensitive evidence remains outside this object; only immutable opaque references enter.
 */
export function evaluateTrustReleaseGate(input: {
  releaseId: string;
  requirements: TrustGateRequirement[];
  controls: TrustControlRecord[];
  evaluatedAt?: Date;
}): TrustReleaseGateDecision {
  const releaseId = z.string().min(1).parse(input.releaseId);
  const requirements = z.array(trustGateRequirementSchema).min(1).parse(input.requirements);
  const controls = z.array(trustControlRecordSchema).parse(input.controls);
  const evaluatedAt = input.evaluatedAt ?? new Date();
  const blockers: TrustGateIssue[] = [];
  const warnings: TrustGateIssue[] = [];
  const controlsById = new Map<string, TrustControlRecord>();

  for (const control of controls) {
    if (controlsById.has(control.controlId)) {
      blockers.push({code: "duplicate_control_record", controlId: control.controlId});
      continue;
    }
    controlsById.set(control.controlId, control);
  }

  const requirementIds = new Set<string>();
  for (const requirement of requirements) {
    if (requirementIds.has(requirement.controlId)) {
      blockers.push({code: "duplicate_gate_requirement", controlId: requirement.controlId});
      continue;
    }
    requirementIds.add(requirement.controlId);
    const control = controlsById.get(requirement.controlId);
    if (!control) {
      blockers.push({code: "required_control_missing", controlId: requirement.controlId});
      continue;
    }
    if (!control.applicable) {
      blockers.push({code: "required_control_marked_not_applicable", controlId: control.controlId});
      continue;
    }
    if (!control.ownerId) blockers.push({code: "control_owner_missing", controlId: control.controlId});
    if (control.state === "exception_open" || controlStateRank[control.state] < controlStateRank[requirement.minimumState]) {
      blockers.push({code: "control_state_below_release_requirement", controlId: control.controlId});
    }

    const currentEvidence = control.evidence.filter((entry) => isCurrentEvidence(entry, evaluatedAt));
    const currentKinds = new Set(currentEvidence.map((entry) => entry.kind));
    const currentEnvironments = new Set(currentEvidence.map((entry) => entry.environment));
    for (const kind of new Set(requirement.evidenceKinds)) {
      if (!currentKinds.has(kind)) blockers.push({code: `current_evidence_missing:${kind}`, controlId: control.controlId});
    }
    for (const environment of new Set(requirement.environments)) {
      if (!currentEnvironments.has(environment)) {
        blockers.push({code: `environment_evidence_missing:${environment}`, controlId: control.controlId});
      }
    }

    for (const finding of control.findings) {
      if (finding.status === "remediated" || finding.status === "retested") continue;
      if (finding.severity === "critical" || finding.severity === "high") {
        blockers.push({code: `open_${finding.severity}_finding`, controlId: control.controlId});
      } else {
        warnings.push({code: `open_${finding.severity}_finding`, controlId: control.controlId});
      }
      if (!finding.ownerId) blockers.push({code: "open_finding_owner_missing", controlId: control.controlId});
      if (!finding.dueAt || new Date(finding.dueAt).getTime() < evaluatedAt.getTime()) {
        blockers.push({code: "open_finding_due_date_missing_or_expired", controlId: control.controlId});
      }
    }
  }

  const payload = {
    allowed: blockers.length === 0,
    releaseId,
    blockers: stableIssues(blockers),
    warnings: stableIssues(warnings),
    assessedControlIds: [...requirementIds].sort(),
  };
  return trustReleaseGateDecisionSchema.parse({...payload, decisionFingerprint: fingerprintJson(payload)});
}

export const assuranceClaimSchema = z.enum([
  "designed_for",
  "implemented",
  "operating",
  "independently_tested",
  "soc2_type2_examined",
  "iso27001_certified",
]);
export type AssuranceClaim = z.infer<typeof assuranceClaimSchema>;

export const externalAttestationSchema = z.object({
  kind: z.enum(["soc2_type2", "iso27001_certificate"]),
  issuer: z.string().min(1),
  issuedAt: z.string().datetime({offset: true}),
  validThrough: z.string().datetime({offset: true}),
  scopeFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  immutableRef: z.string().min(1),
});
/** @deprecated Metadata alone has no authority. Use the governed signed-assurance boundary. */
export type ExternalAttestation = z.infer<typeof externalAttestationSchema>;

export const assuranceClaimDecisionSchema = z.object({
  allowed: z.boolean(),
  claim: assuranceClaimSchema,
  blockers: z.array(z.string().min(1)),
  decisionFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type AssuranceClaimDecision = z.infer<typeof assuranceClaimDecisionSchema>;

/** Prevents a technical control state from being presented as a formal third-party assurance. */
export function evaluateAssuranceClaim(input: {
  claim: AssuranceClaim;
  controls: TrustControlRecord[];
  requiredControlIds: string[];
  scopeFingerprint: string;
  attestations?: ExternalAttestation[];
  evaluatedAt?: Date;
}): AssuranceClaimDecision {
  const claim = assuranceClaimSchema.parse(input.claim);
  const controls = z.array(trustControlRecordSchema).parse(input.controls);
  const requiredControlIds = z.array(trustControlRecordSchema.shape.controlId).min(1).parse(input.requiredControlIds);
  const scopeFingerprint = z.string().regex(/^[a-f0-9]{64}$/).parse(input.scopeFingerprint);
  const attestations = z.array(externalAttestationSchema).parse(input.attestations ?? []);
  const evaluatedAt = input.evaluatedAt ?? new Date();
  const blockers: string[] = [];
  if (formalExternalClaims.has(claim)) {
    blockers.push("formal_external_claim_requires_governed_signed_statement");
  }
  const controlsById = new Map<string, TrustControlRecord>();
  for (const control of controls) {
    if (controlsById.has(control.controlId)) blockers.push(`claim_duplicate_control:${control.controlId}`);
    controlsById.set(control.controlId, control);
  }
  const minimumState = claimMinimumState[claim];

  for (const controlId of new Set(requiredControlIds)) {
    const control = controlsById.get(controlId);
    if (!control || !control.applicable) {
      blockers.push(`claim_control_missing_or_excluded:${controlId}`);
      continue;
    }
    if (!control.ownerId) blockers.push(`claim_control_owner_missing:${controlId}`);
    if (control.state === "exception_open" || controlStateRank[control.state] < controlStateRank[minimumState]) {
      blockers.push(`claim_control_state_insufficient:${controlId}`);
    }
    const currentEvidence = control.evidence.filter((entry) => isCurrentEvidence(entry, evaluatedAt));
    if (claimsRequiringCurrentEvidence.has(claim) && currentEvidence.length === 0) {
      blockers.push(`claim_current_evidence_missing:${controlId}`);
    }
    if (claim === "independently_tested" && !currentEvidence.some((entry) => entry.kind === "external_assessment")) {
      blockers.push(`claim_independent_assessment_missing:${controlId}`);
    }
    if (control.findings.some((finding) => (finding.status === "open" || finding.status === "risk_accepted")
      && (finding.severity === "critical" || finding.severity === "high"))) {
      blockers.push(`claim_blocked_by_material_finding:${controlId}`);
    }
  }

  // Keep parsing the legacy field to reject malformed callers, but never treat caller-supplied
  // metadata as attestation authority. Formal external claims use security-assurance-statements.ts,
  // where bytes, signature, trust root, scope, validity and revocation are all verified.
  void attestations;
  void scopeFingerprint;

  const payload = {allowed: blockers.length === 0, claim, blockers: [...new Set(blockers)].sort()};
  return assuranceClaimDecisionSchema.parse({...payload, decisionFingerprint: fingerprintJson(payload)});
}

const controlStateRank: Record<TrustControlState, number> = {
  exception_open: -1,
  not_designed: 0,
  designed: 1,
  implemented: 2,
  operating: 3,
  evidenced: 4,
  independently_tested: 5,
};

const claimMinimumState: Record<AssuranceClaim, z.infer<typeof auditableControlStateSchema>> = {
  designed_for: "designed",
  implemented: "implemented",
  operating: "operating",
  independently_tested: "independently_tested",
  soc2_type2_examined: "evidenced",
  iso27001_certified: "evidenced",
};

const formalExternalClaims = new Set<AssuranceClaim>(["soc2_type2_examined", "iso27001_certified"]);

const claimsRequiringCurrentEvidence = new Set<AssuranceClaim>([
  "operating",
  "independently_tested",
  "soc2_type2_examined",
  "iso27001_certified",
]);

function isCurrentEvidence(evidence: TrustEvidence, evaluatedAt: Date): boolean {
  const collected = new Date(evidence.collectedAt).getTime();
  const validThrough = evidence.validThrough
    ? new Date(evidence.validThrough).getTime()
    : Number.POSITIVE_INFINITY;
  return collected <= evaluatedAt.getTime() && validThrough >= evaluatedAt.getTime();
}

function stableIssues(issues: TrustGateIssue[]): TrustGateIssue[] {
  return [...new Map(issues
    .sort((left, right) => `${left.controlId}:${left.code}`.localeCompare(`${right.controlId}:${right.code}`))
    .map((issue) => [`${issue.controlId}:${issue.code}`, issue])).values()];
}
