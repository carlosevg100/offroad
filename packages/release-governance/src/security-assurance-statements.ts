import {createHash, verify} from "node:crypto";
import {z} from "zod";

const dateTimeSchema = z.string().datetime({offset: true});
const fingerprintSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const securityAssuranceClaimSchema = z.enum([
  "soc2_type2_examined",
  "iso27001_certified",
  "penetration_test_passed",
  "production_independently_audited",
]);
export type SecurityAssuranceClaim = z.infer<typeof securityAssuranceClaimSchema>;

export const securityAssuranceStatusSchema = z.enum([
  "planned",
  "in_progress",
  "not_certified",
  "not_independently_audited",
  "attested",
]);
export type SecurityAssuranceStatus = z.infer<typeof securityAssuranceStatusSchema>;

export const securityAssuranceScopeSchema = z.object({
  scopeId: z.string().min(1),
  scopeFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  environmentRefs: z.array(z.string().min(1)).min(1),
  systemRefs: z.array(z.string().min(1)).min(1),
}).superRefine((scope, context) => {
  if (new Set(scope.environmentRefs).size !== scope.environmentRefs.length) context.addIssue({code: "custom", path: ["environmentRefs"], message: "scope environment references must be unique"});
  if (new Set(scope.systemRefs).size !== scope.systemRefs.length) context.addIssue({code: "custom", path: ["systemRefs"], message: "scope system references must be unique"});
  if (scope.scopeFingerprint !== createSecurityAssuranceScopeFingerprint(scope)) {
    context.addIssue({code: "custom", path: ["scopeFingerprint"], message: "scope fingerprint does not match the declared scope"});
  }
});
export type SecurityAssuranceScope = z.infer<typeof securityAssuranceScopeSchema>;

export const securityAssuranceStatementSchema = z.object({
  statementId: z.string().regex(/^ASSURANCE-[A-Z0-9-]+$/),
  claim: securityAssuranceClaimSchema,
  status: securityAssuranceStatusSchema,
  scope: securityAssuranceScopeSchema,
  evidenceRef: z.string().regex(/^ASE-[A-Z0-9-]+$/).nullable(),
  issuedAt: dateTimeSchema.nullable(),
  validThrough: dateTimeSchema.nullable(),
}).superRefine((statement, context) => {
  const attested = statement.status === "attested";
  for (const [field, value] of [
    ["evidenceRef", statement.evidenceRef],
    ["issuedAt", statement.issuedAt],
    ["validThrough", statement.validThrough],
  ] as const) {
    if (attested && value === null) context.addIssue({code: "custom", path: [field], message: "attested statement requires external evidence and validity"});
    if (!attested && value !== null) context.addIssue({code: "custom", path: [field], message: "non-attested statement cannot carry attestation fields"});
  }
  const certificationClaim = statement.claim === "soc2_type2_examined" || statement.claim === "iso27001_certified";
  if (certificationClaim && statement.status === "not_independently_audited") context.addIssue({code: "custom", path: ["status"], message: "certification claim requires a certification status"});
  if (!certificationClaim && statement.status === "not_certified") context.addIssue({code: "custom", path: ["status"], message: "assessment claim requires an independent-assessment status"});
});
export type SecurityAssuranceStatement = z.infer<typeof securityAssuranceStatementSchema>;

export const securityAssuranceMilestoneSchema = z.object({
  milestoneId: z.string().regex(/^ASSURANCE-MILESTONE-[A-Z0-9-]+$/),
  framework: z.enum(["soc2", "iso27001", "penetration_test", "independent_audit"]),
  kind: z.enum(["gap_assessment", "remediation_plan", "readiness_review", "external_engagement", "retest"]),
  status: z.enum(["planned", "in_progress", "completed"]),
  scope: securityAssuranceScopeSchema,
  evidenceRef: z.string().min(1).nullable(),
}).superRefine((milestone, context) => {
  if (milestone.status === "completed" && !milestone.evidenceRef) {
    context.addIssue({code: "custom", path: ["evidenceRef"], message: "completed milestone requires evidence"});
  }
});
export type SecurityAssuranceMilestone = z.infer<typeof securityAssuranceMilestoneSchema>;

export const securityAssuranceTrustRootSchema = z.object({
  trustRootId: z.string().regex(/^ATR-[A-Z0-9-]+$/),
  issuer: z.string().min(1),
  publicKeyPem: z.string().min(1),
  permittedClaims: z.array(securityAssuranceClaimSchema).min(1),
  validFrom: dateTimeSchema,
  validThrough: dateTimeSchema,
  revokedAt: dateTimeSchema.nullable(),
});
export type SecurityAssuranceTrustRoot = z.infer<typeof securityAssuranceTrustRootSchema>;

export const securityAssuranceEvidenceSchema = z.object({
  evidenceRef: z.string().regex(/^ASE-[A-Z0-9-]+$/),
  claim: securityAssuranceClaimSchema,
  scopeFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  issuer: z.string().min(1),
  trustRootId: z.string().regex(/^ATR-[A-Z0-9-]+$/),
  issuedAt: dateTimeSchema,
  validThrough: dateTimeSchema,
  revokedAt: dateTimeSchema.nullable(),
  immutableRef: z.string().min(1),
  contentFingerprint: fingerprintSchema,
  detachedSignature: z.string().min(1),
});
export type SecurityAssuranceEvidence = z.infer<typeof securityAssuranceEvidenceSchema>;

export type SecurityAssuranceDecision = Readonly<{
  allowed: boolean;
  statementId: string;
  status: SecurityAssuranceStatus;
  blockers: readonly string[];
  canonicalText: Readonly<{"pt-BR": string; "en-US": string}>;
  decisionFingerprint: string;
}>;

const trustedDecisions = new WeakMap<SecurityAssuranceDecision, {
  source: SecurityAssuranceStatement;
  statement: SecurityAssuranceStatement;
}>();

/**
 * The caller must supply roots from a separately governed trust store. A root embedded in the
 * statement or attestation is never trusted. The current Offroad inventory supplies an empty
 * registry, so no external claim can be rendered until a real assessor root is onboarded.
 */
export function evaluateSecurityAssuranceStatementAgainstTrustedRoots(input: {
  statement: SecurityAssuranceStatement;
  evidence: SecurityAssuranceEvidence[];
  trustedRoots: SecurityAssuranceTrustRoot[];
  resolvedEvidence: Array<{evidenceRef: string; immutableRef: string; bytes: Uint8Array}>;
  evaluatedAt: Date;
}): SecurityAssuranceDecision {
  const source = input.statement;
  const statement = securityAssuranceStatementSchema.parse(source);
  const evidence = z.array(securityAssuranceEvidenceSchema).parse(input.evidence);
  const roots = z.array(securityAssuranceTrustRootSchema).parse(input.trustedRoots);
  const now = input.evaluatedAt.getTime();
  const blockers: string[] = [];

  if (statement.status === "attested") {
    const attestation = evidence.find((candidate) => candidate.evidenceRef === statement.evidenceRef);
    if (!attestation) blockers.push("attestation_evidence_missing");
    else {
      const root = roots.find((candidate) => candidate.trustRootId === attestation.trustRootId);
      if (!root) blockers.push("attestation_trust_root_missing");
      else {
        if (root.issuer !== attestation.issuer) blockers.push("attestation_issuer_mismatch");
        if (!root.permittedClaims.includes(attestation.claim)) blockers.push("attestation_claim_not_permitted");
        if (root.revokedAt && new Date(root.revokedAt).getTime() <= now) blockers.push("attestation_trust_root_revoked");
        if (new Date(root.validFrom).getTime() > now || new Date(root.validThrough).getTime() < now) blockers.push("attestation_trust_root_not_current");
        if (new Date(root.validThrough).getTime() <= new Date(root.validFrom).getTime()) blockers.push("attestation_trust_root_validity_window_invalid");
        const issuedAt = new Date(attestation.issuedAt).getTime();
        if (issuedAt < new Date(root.validFrom).getTime() || issuedAt > new Date(root.validThrough).getTime()) blockers.push("attestation_issued_outside_trust_root_window");
        if (!verifyAssuranceEvidenceSignature(attestation, root.publicKeyPem)) blockers.push("attestation_signature_invalid");
      }
      if (attestation.claim !== statement.claim) blockers.push("attestation_claim_mismatch");
      if (attestation.scopeFingerprint !== statement.scope.scopeFingerprint) blockers.push("attestation_scope_mismatch");
      if (attestation.issuedAt !== statement.issuedAt || attestation.validThrough !== statement.validThrough) blockers.push("attestation_validity_mismatch");
      if (attestation.revokedAt && new Date(attestation.revokedAt).getTime() <= now) blockers.push("attestation_revoked");
      if (new Date(attestation.issuedAt).getTime() > now || new Date(attestation.validThrough).getTime() < now) blockers.push("attestation_not_current");
      if (new Date(attestation.validThrough).getTime() <= new Date(attestation.issuedAt).getTime()) blockers.push("attestation_validity_window_invalid");
      const resolved = input.resolvedEvidence.find((candidate) => candidate.evidenceRef === attestation.evidenceRef);
      if (!resolved) blockers.push("attestation_bytes_unresolved");
      else {
        if (resolved.immutableRef !== attestation.immutableRef) blockers.push("attestation_immutable_ref_mismatch");
        if (sha256Bytes(resolved.bytes) !== attestation.contentFingerprint) blockers.push("attestation_content_fingerprint_mismatch");
      }
    }
  }

  const stableBlockers = [...new Set(blockers)].sort();
  const allowed = stableBlockers.length === 0;
  const effectiveStatus: SecurityAssuranceStatus = allowed ? statement.status : fallbackStatus(statement.claim);
  const canonicalText = deepFreeze(canonicalAssuranceText(statement.claim, effectiveStatus));
  const payload = {allowed, statementId: statement.statementId, status: effectiveStatus, blockers: stableBlockers, canonicalText};
  const decision = deepFreeze({...payload, decisionFingerprint: sha256(stableJson(payload))});
  trustedDecisions.set(decision, {source, statement: deepFreeze(structuredClone(statement))});
  return decision;
}

export function renderSecurityAssuranceStatement(
  statement: SecurityAssuranceStatement,
  decision: SecurityAssuranceDecision,
  locale: "pt-BR" | "en-US",
): string {
  const receipt = trustedDecisions.get(decision);
  if (!receipt || receipt.source !== statement || receipt.statement.statementId !== statement.statementId) {
    throw new Error("security assurance rendering requires the original statement and trusted decision receipt");
  }
  return decision.canonicalText[locale];
}

export function renderSecurityAssuranceMilestone(
  candidate: SecurityAssuranceMilestone,
  locale: "pt-BR" | "en-US",
  resolvedEvidenceRefs: readonly string[] = [],
): string {
  const milestone = securityAssuranceMilestoneSchema.parse(candidate);
  if (milestone.status === "completed" && !resolvedEvidenceRefs.includes(milestone.evidenceRef!)) {
    throw new Error("completed security assurance milestone requires resolved evidence");
  }
  const framework = frameworkLabel(milestone.framework);
  const kind = milestoneKindLabel(milestone.kind, locale);
  const status = milestoneStatusLabel(milestone.status, locale);
  return locale === "pt-BR"
    ? `${framework}: ${kind} — ${status}.`
    : `${framework}: ${kind} — ${status}.`;
}

export function assuranceEvidenceSigningPayload(evidence: Omit<SecurityAssuranceEvidence, "detachedSignature">): Buffer {
  return Buffer.from(stableJson(evidence), "utf8");
}

export function createSecurityAssuranceScopeFingerprint(
  scope: Pick<SecurityAssuranceScope, "scopeId" | "environmentRefs" | "systemRefs">,
): string {
  return createHash("sha256").update(stableJson({
    scopeId: scope.scopeId,
    environmentRefs: [...scope.environmentRefs].sort(),
    systemRefs: [...scope.systemRefs].sort(),
  })).digest("hex");
}

function verifyAssuranceEvidenceSignature(evidence: SecurityAssuranceEvidence, publicKeyPem: string): boolean {
  try {
    const {detachedSignature, ...payload} = evidence;
    return verify(null, assuranceEvidenceSigningPayload(payload), publicKeyPem, Buffer.from(detachedSignature, "base64"));
  } catch {
    return false;
  }
}

function fallbackStatus(claim: SecurityAssuranceClaim): SecurityAssuranceStatus {
  return claim === "soc2_type2_examined" || claim === "iso27001_certified"
    ? "not_certified"
    : "not_independently_audited";
}

function canonicalAssuranceText(claim: SecurityAssuranceClaim, status: SecurityAssuranceStatus) {
  const labels: Record<SecurityAssuranceClaim, {"pt-BR": string; "en-US": string}> = {
    soc2_type2_examined: {"pt-BR": "SOC 2 Type II", "en-US": "SOC 2 Type II"},
    iso27001_certified: {"pt-BR": "ISO/IEC 27001", "en-US": "ISO/IEC 27001"},
    penetration_test_passed: {"pt-BR": "Teste de penetração independente", "en-US": "Independent penetration test"},
    production_independently_audited: {"pt-BR": "Auditoria independente de produção", "en-US": "Independent production audit"},
  };
  const statusText: Record<SecurityAssuranceStatus, {"pt-BR": string; "en-US": string}> = {
    planned: {"pt-BR": "planejado; não concluído", "en-US": "planned; not completed"},
    in_progress: {"pt-BR": "em andamento; não concluído", "en-US": "in progress; not completed"},
    not_certified: {"pt-BR": "não certificado", "en-US": "not certified"},
    not_independently_audited: {"pt-BR": "não auditado nem atestado de forma independente", "en-US": "not independently audited or attested"},
    attested: {"pt-BR": "atestado no escopo e período indicados", "en-US": "attested for the stated scope and period"},
  };
  return {
    "pt-BR": `${labels[claim]["pt-BR"]}: ${statusText[status]["pt-BR"]}.`,
    "en-US": `${labels[claim]["en-US"]}: ${statusText[status]["en-US"]}.`,
  };
}

function frameworkLabel(framework: SecurityAssuranceMilestone["framework"]): string {
  return ({soc2: "SOC 2", iso27001: "ISO/IEC 27001", penetration_test: "Pentest", independent_audit: "Auditoria independente"})[framework];
}

function milestoneKindLabel(kind: SecurityAssuranceMilestone["kind"], locale: "pt-BR" | "en-US"): string {
  const labels = {
    gap_assessment: {"pt-BR": "avaliação de lacunas", "en-US": "gap assessment"},
    remediation_plan: {"pt-BR": "plano de remediação", "en-US": "remediation plan"},
    readiness_review: {"pt-BR": "revisão de readiness", "en-US": "readiness review"},
    external_engagement: {"pt-BR": "contratação externa", "en-US": "external engagement"},
    retest: {"pt-BR": "reteste", "en-US": "retest"},
  } as const;
  return labels[kind][locale];
}

function milestoneStatusLabel(status: SecurityAssuranceMilestone["status"], locale: "pt-BR" | "en-US"): string {
  const labels = {
    planned: {"pt-BR": "planejado", "en-US": "planned"},
    in_progress: {"pt-BR": "em andamento", "en-US": "in progress"},
    completed: {"pt-BR": "concluído com evidência referenciada", "en-US": "completed with referenced evidence"},
  } as const;
  return labels[status][locale];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256Bytes(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
