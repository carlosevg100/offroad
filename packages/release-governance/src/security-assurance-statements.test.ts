import {createHash, generateKeyPairSync, sign} from "node:crypto";
import {describe, expect, it} from "vitest";
import {findNonCanonicalAssuranceLanguage} from "./security-assurance-language.ts";
import {
  assuranceEvidenceSigningPayload,
  createSecurityAssuranceScopeFingerprint,
  evaluateSecurityAssuranceStatement,
  renderSecurityAssuranceMilestone,
  renderSecurityAssuranceStatement,
  securityAssuranceMilestoneSchema,
  securityAssuranceStatementSchema,
  securityAssuranceTrustRootSchema,
  validateSecurityAssuranceTrustRootCryptography,
  type SecurityAssuranceDecision,
  type SecurityAssuranceEvidence,
  type SecurityAssuranceTrustRoot,
} from "./security-assurance-statements.ts";
import type {TrustedSecurityEvidenceResolutionReceipt} from "./security-current-state.ts";

const scopeSeed = {
  scopeId: "offroad-production",
  environmentRefs: ["ENV-PRODUCTION"],
  systemRefs: ["SYS-WEB", "SYS-WORKER"],
};
const scope = {...scopeSeed, scopeFingerprint: createSecurityAssuranceScopeFingerprint(scopeSeed)};
const reportBytes = Buffer.from("independent assessment report bytes", "utf8");
const {privateKey, publicKey} = generateKeyPairSync("ed25519");
const selfGeneratedRoot: SecurityAssuranceTrustRoot = {
  trustRootId: "ATR-SELF-GENERATED",
  keyId: "self-generated-key",
  algorithm: "Ed25519",
  issuer: "Self Generated Assessor",
  publicKeyPem: publicKey.export({type: "spki", format: "pem"}).toString(),
  permittedClaims: ["soc2_type2_examined"],
  validFrom: "2020-01-01T00:00:00.000Z",
  validThrough: "2099-01-01T00:00:00.000Z",
  revokedAt: null,
};

function attestedStatement() {
  return securityAssuranceStatementSchema.parse({
    statementId: "ASSURANCE-SOC2-TYPE2",
    claim: "soc2_type2_examined",
    status: "attested",
    scope,
    evidenceRef: "ASE-SOC2-REPORT",
    issuedAt: "2026-08-01T00:00:00.000Z",
    validThrough: "2099-01-01T00:00:00.000Z",
  });
}

function signedEvidence(overrides: Partial<Omit<SecurityAssuranceEvidence, "detachedSignature">> = {}): SecurityAssuranceEvidence {
  const unsigned: Omit<SecurityAssuranceEvidence, "detachedSignature"> = {
    evidenceRef: "ASE-SOC2-REPORT",
    claim: "soc2_type2_examined",
    scopeFingerprint: scope.scopeFingerprint,
    issuer: selfGeneratedRoot.issuer,
    trustRootId: selfGeneratedRoot.trustRootId,
    keyId: selfGeneratedRoot.keyId,
    algorithm: "Ed25519",
    issuedAt: "2026-08-01T00:00:00.000Z",
    validThrough: "2099-01-01T00:00:00.000Z",
    revokedAt: null,
    immutableRef: "evidence://assessor/report/2026",
    contentFingerprint: `sha256:${createHash("sha256").update(reportBytes).digest("hex")}`,
    ...overrides,
  };
  return {...unsigned, detachedSignature: sign(null, assuranceEvidenceSigningPayload(unsigned), privateKey).toString("base64")};
}

const resolvedReport = [{
  evidenceRef: "ASE-SOC2-REPORT",
  immutableRef: "evidence://assessor/report/2026",
  bytes: reportBytes,
}];

describe("governed security assurance statements", () => {
  it("rejects a caller-supplied self-generated trust root even when its signature is valid", () => {
    const statement = attestedStatement();
    const evaluateWithForbiddenRoots = evaluateSecurityAssuranceStatement as unknown as (input: {
      statement: typeof statement;
      evidence: SecurityAssuranceEvidence[];
      resolvedEvidence: typeof resolvedReport;
      trustedRoots: SecurityAssuranceTrustRoot[];
    }) => SecurityAssuranceDecision;
    const decision = evaluateWithForbiddenRoots({
      statement,
      evidence: [signedEvidence()],
      resolvedEvidence: resolvedReport,
      trustedRoots: [selfGeneratedRoot],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("not_certified");
    expect(decision.blockers).toContain("attestation_trust_root_missing");
    expect(decision.trustRegistryFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(renderSecurityAssuranceStatement(statement, decision, "pt-BR")).toBe("SOC 2 Type II: não certificado.");
  });

  it.each([
    ["missing evidence", [], "attestation_evidence_missing"],
    ["wrong scope", [signedEvidence({scopeFingerprint: "c".repeat(64)})], "attestation_scope_mismatch"],
    ["expired evidence", [signedEvidence({validThrough: "2020-01-01T00:00:00.000Z"})], "attestation_not_current"],
    ["revoked evidence", [signedEvidence({revokedAt: "2020-01-01T00:00:00.000Z"})], "attestation_revoked"],
  ] as const)("downgrades an external claim on %s", (_label, evidence, blocker) => {
    const statement = attestedStatement();
    const decision = evaluateSecurityAssuranceStatement({
      statement,
      evidence: [...evidence],
      resolvedEvidence: resolvedReport,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("not_certified");
    expect(decision.blockers).toContain(blocker);
  });

  it.each([
    ["duplicate evidence", {evidence: [signedEvidence(), signedEvidence()]}, "duplicate_attestation_evidence:ASE-SOC2-REPORT"],
    ["duplicate resolved bytes", {resolvedEvidence: [...resolvedReport, ...resolvedReport]}, "duplicate_resolved_attestation_bytes:ASE-SOC2-REPORT"],
  ])("fails closed on %s", (_label, override, blocker) => {
    const decision = evaluateSecurityAssuranceStatement({
      statement: attestedStatement(),
      evidence: [signedEvidence()],
      resolvedEvidence: resolvedReport,
      ...override,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toContain(blocker);
  });

  it.each([
    ["unresolved bytes", [], "attestation_bytes_unresolved"],
    ["wrong immutable reference", [{...resolvedReport[0]!, immutableRef: "evidence://wrong"}], "attestation_immutable_ref_mismatch"],
    ["wrong content bytes", [{...resolvedReport[0]!, bytes: Buffer.from("tampered")}], "attestation_content_fingerprint_mismatch"],
  ] as const)("does not render attested status with %s", (_label, resolvedEvidence, blocker) => {
    const decision = evaluateSecurityAssuranceStatement({
      statement: attestedStatement(),
      evidence: [signedEvidence()],
      resolvedEvidence: [...resolvedEvidence],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("not_certified");
    expect(decision.blockers).toContain(blocker);
  });

  it("rejects Ed448 key material even when its caller label says Ed25519", () => {
    const {publicKey: ed448PublicKey} = generateKeyPairSync("ed448");
    const mislabeledRoot: SecurityAssuranceTrustRoot = {
      ...selfGeneratedRoot,
      publicKeyPem: ed448PublicKey.export({type: "spki", format: "pem"}).toString(),
    };
    expect(validateSecurityAssuranceTrustRootCryptography(mislabeledRoot)).toEqual(["attestation_trust_root_key_type_invalid"]);
    expect(() => securityAssuranceTrustRootSchema.parse({...mislabeledRoot, algorithm: "Ed448"})).toThrow();
  });

  it("rejects a reconstructed decision or substituted statement at the rendering boundary", () => {
    const statement = attestedStatement();
    const decision = evaluateSecurityAssuranceStatement({statement, evidence: [signedEvidence()], resolvedEvidence: resolvedReport});
    expect(() => renderSecurityAssuranceStatement(structuredClone(statement), decision, "pt-BR")).toThrow(/original statement/);
    expect(() => renderSecurityAssuranceStatement(statement, structuredClone(decision), "pt-BR")).toThrow(/trusted decision/);
  });

  it.each([
    ["planned", "SOC 2 Type II: planejado; não concluído."],
    ["in_progress", "SOC 2 Type II: em andamento; não concluído."],
    ["not_certified", "SOC 2 Type II: não certificado."],
  ] as const)("renders the honest %s state without attestation fields", (status, expected) => {
    const statement = securityAssuranceStatementSchema.parse({
      statementId: "ASSURANCE-SOC2-TYPE2", claim: "soc2_type2_examined", status, scope,
      evidenceRef: null, issuedAt: null, validThrough: null,
    });
    const decision = evaluateSecurityAssuranceStatement({statement, evidence: [], resolvedEvidence: []});
    expect(decision.allowed).toBe(true);
    expect(renderSecurityAssuranceStatement(statement, decision, "pt-BR")).toBe(expected);
  });

  it("keeps planned milestones typed and rejects invented evidence receipts for completion", () => {
    const planned = securityAssuranceMilestoneSchema.parse({
      milestoneId: "ASSURANCE-MILESTONE-ISO-GAP", framework: "iso27001", kind: "gap_assessment",
      status: "planned", scope, evidenceRef: null,
    });
    expect(renderSecurityAssuranceMilestone(planned, "pt-BR")).toBe("ISO/IEC 27001: avaliação de lacunas — planejado.");
    expect(() => securityAssuranceMilestoneSchema.parse({...planned, status: "completed", evidenceRef: null})).toThrow(/completed milestone requires evidence/);
    const completed = securityAssuranceMilestoneSchema.parse({...planned, status: "completed", evidenceRef: "SEV-SECURITY-PLAN"});
    const inventedReceipt = Object.freeze({
      receiptId: `sha256:${"a".repeat(64)}`,
      evidenceRef: "SEV-SECURITY-PLAN",
      contentFingerprint: `sha256:${"b".repeat(64)}`,
    }) as TrustedSecurityEvidenceResolutionReceipt;
    expect(() => renderSecurityAssuranceMilestone(completed, "pt-BR", inventedReceipt)).toThrow(/trusted evidence receipt/);
    expect(() => renderSecurityAssuranceMilestone(completed, "pt-BR", null)).toThrow(/trusted evidence receipt/);
  });

  it.each([
    "SOC 2 is certified",
    "SOC 2 has not been certified — Production has been independently audited",
    "While SOC 2 is planned, penetration testing has passed",
    "Possuímos certificação ISO 27001 vigente",
  ])("blocks mixed-polarity and arbitrary positive assurance prose: %s", (prose) => {
    expect(findNonCanonicalAssuranceLanguage(prose)).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "noncanonical_assurance_language"}),
    ]));
  });

  it("does not allow callers to subtract arbitrary assurance prose as if it were canonical", () => {
    const prose = "SOC 2 certified";
    const tryCallerAllowlist = findNonCanonicalAssuranceLanguage as unknown as (
      output: string,
      callerAllowlist: readonly string[],
    ) => ReturnType<typeof findNonCanonicalAssuranceLanguage>;
    expect(tryCallerAllowlist(prose, [prose])).toEqual([
      {code: "noncanonical_assurance_language", match: "soc 2"},
    ]);
  });
});
