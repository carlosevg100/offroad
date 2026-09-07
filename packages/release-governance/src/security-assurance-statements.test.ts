import {createHash, generateKeyPairSync, sign} from "node:crypto";
import {describe, expect, it} from "vitest";
import {
  assuranceEvidenceSigningPayload,
  createSecurityAssuranceScopeFingerprint,
  evaluateSecurityAssuranceStatementAgainstTrustedRoots,
  renderSecurityAssuranceMilestone,
  renderSecurityAssuranceStatement,
  securityAssuranceMilestoneSchema,
  securityAssuranceStatementSchema,
  type SecurityAssuranceEvidence,
  type SecurityAssuranceTrustRoot,
} from "./security-assurance-statements.ts";
import {findNonCanonicalAssuranceLanguage} from "./security-assurance-language.ts";

const now = new Date("2026-09-07T12:00:00.000Z");
const scopeSeed = {
  scopeId: "offroad-production",
  environmentRefs: ["ENV-PRODUCTION"],
  systemRefs: ["SYS-WEB", "SYS-WORKER"],
};
const scope = {...scopeSeed, scopeFingerprint: createSecurityAssuranceScopeFingerprint(scopeSeed)};
const reportBytes = Buffer.from("independent assessment report bytes", "utf8");
const {privateKey, publicKey} = generateKeyPairSync("ed25519");
const root: SecurityAssuranceTrustRoot = {
  trustRootId: "ATR-TEST-ASSESSOR",
  issuer: "Independent Test Assessor",
  publicKeyPem: publicKey.export({type: "spki", format: "pem"}).toString(),
  permittedClaims: ["soc2_type2_examined"],
  validFrom: "2026-01-01T00:00:00.000Z",
  validThrough: "2027-01-01T00:00:00.000Z",
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
    validThrough: "2026-12-31T23:59:59.000Z",
  });
}

function signedEvidence(overrides: Partial<Omit<SecurityAssuranceEvidence, "detachedSignature">> = {}): SecurityAssuranceEvidence {
  const unsigned = {
    evidenceRef: "ASE-SOC2-REPORT",
    claim: "soc2_type2_examined" as const,
    scopeFingerprint: scope.scopeFingerprint,
    issuer: root.issuer,
    trustRootId: root.trustRootId,
    issuedAt: "2026-08-01T00:00:00.000Z",
    validThrough: "2026-12-31T23:59:59.000Z",
    revokedAt: null,
    immutableRef: "evidence://assessor/report/2026",
    contentFingerprint: `sha256:${createHash("sha256").update(reportBytes).digest("hex")}` as const,
    ...overrides,
  };
  return {...unsigned, detachedSignature: sign(null, assuranceEvidenceSigningPayload(unsigned), privateKey).toString("base64")};
}

describe("governed security assurance statements", () => {
  it("renders an attested claim only from current, scope-matched, signed evidence under a trusted root", () => {
    const statement = attestedStatement();
    const decision = evaluateSecurityAssuranceStatementAgainstTrustedRoots({statement, evidence: [signedEvidence()], trustedRoots: [root], resolvedEvidence: [{evidenceRef: "ASE-SOC2-REPORT", immutableRef: "evidence://assessor/report/2026", bytes: reportBytes}], evaluatedAt: now});
    expect(decision.allowed).toBe(true);
    expect(decision.status).toBe("attested");
    expect(renderSecurityAssuranceStatement(statement, decision, "pt-BR")).toBe("SOC 2 Type II: atestado no escopo e período indicados.");
  });

  it.each([
    ["missing evidence", [], [root], "attestation_evidence_missing"],
    ["missing trust root", [signedEvidence()], [], "attestation_trust_root_missing"],
    ["wrong scope", [signedEvidence({scopeFingerprint: "c".repeat(64)})], [root], "attestation_scope_mismatch"],
    ["expired evidence", [signedEvidence({validThrough: "2026-09-01T00:00:00.000Z"})], [root], "attestation_not_current"],
    ["revoked evidence", [signedEvidence({revokedAt: "2026-09-01T00:00:00.000Z"})], [root], "attestation_revoked"],
    ["revoked root", [signedEvidence()], [{...root, revokedAt: "2026-09-01T00:00:00.000Z"}], "attestation_trust_root_revoked"],
  ] as const)("downgrades an external claim on %s", (_label, evidence, trustedRoots, blocker) => {
    const statement = attestedStatement();
    const decision = evaluateSecurityAssuranceStatementAgainstTrustedRoots({
      statement,
      evidence: [...evidence],
      trustedRoots: [...trustedRoots],
      resolvedEvidence: [{evidenceRef: "ASE-SOC2-REPORT", immutableRef: "evidence://assessor/report/2026", bytes: reportBytes}],
      evaluatedAt: now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("not_certified");
    expect(decision.blockers).toContain(blocker);
    expect(renderSecurityAssuranceStatement(statement, decision, "en-US")).toBe("SOC 2 Type II: not certified.");
  });

  it("rejects a tampered attestation and a reconstructed render decision", () => {
    const statement = attestedStatement();
    const evidence = signedEvidence();
    evidence.immutableRef = "evidence://attacker/replacement";
    const decision = evaluateSecurityAssuranceStatementAgainstTrustedRoots({statement, evidence: [evidence], trustedRoots: [root], resolvedEvidence: [{evidenceRef: "ASE-SOC2-REPORT", immutableRef: "evidence://assessor/report/2026", bytes: reportBytes}], evaluatedAt: now});
    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toContain("attestation_signature_invalid");
    expect(() => renderSecurityAssuranceStatement(structuredClone(statement), decision, "pt-BR")).toThrow(/original statement/);
    expect(() => renderSecurityAssuranceStatement(statement, structuredClone(decision), "pt-BR")).toThrow(/trusted decision/);
  });

  it.each([
    ["unresolved bytes", [], "attestation_bytes_unresolved"],
    ["wrong immutable reference", [{evidenceRef: "ASE-SOC2-REPORT", immutableRef: "evidence://wrong", bytes: reportBytes}], "attestation_immutable_ref_mismatch"],
    ["wrong content bytes", [{evidenceRef: "ASE-SOC2-REPORT", immutableRef: "evidence://assessor/report/2026", bytes: Buffer.from("tampered")}], "attestation_content_fingerprint_mismatch"],
  ] as const)("does not render attested status with %s", (_label, resolvedEvidence, blocker) => {
    const statement = attestedStatement();
    const decision = evaluateSecurityAssuranceStatementAgainstTrustedRoots({
      statement, evidence: [signedEvidence()], trustedRoots: [root], resolvedEvidence: [...resolvedEvidence], evaluatedAt: now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("not_certified");
    expect(decision.blockers).toContain(blocker);
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
    const decision = evaluateSecurityAssuranceStatementAgainstTrustedRoots({statement, evidence: [], trustedRoots: [], resolvedEvidence: [], evaluatedAt: now});
    expect(decision.allowed).toBe(true);
    expect(renderSecurityAssuranceStatement(statement, decision, "pt-BR")).toBe(expected);
  });

  it("keeps milestones structured and prevents unevidenced completion", () => {
    const planned = securityAssuranceMilestoneSchema.parse({
      milestoneId: "ASSURANCE-MILESTONE-ISO-GAP", framework: "iso27001", kind: "gap_assessment",
      status: "planned", scope, evidenceRef: null,
    });
    expect(renderSecurityAssuranceMilestone(planned, "pt-BR")).toBe("ISO/IEC 27001: avaliação de lacunas — planejado.");
    expect(() => securityAssuranceMilestoneSchema.parse({...planned, status: "completed", evidenceRef: null})).toThrow(/completed milestone requires evidence/);
    const completed = securityAssuranceMilestoneSchema.parse({...planned, status: "completed", evidenceRef: "SEV-SECURITY-PLAN"});
    expect(() => renderSecurityAssuranceMilestone(completed, "pt-BR", [])).toThrow(/requires resolved evidence/);
    expect(renderSecurityAssuranceMilestone(completed, "pt-BR", ["SEV-SECURITY-PLAN"])).toContain("concluído com evidência referenciada");
  });

  it.each([
    "SOC 2 has not been certified, but ISO 27001 is certified",
    "While SOC 2 is planned, penetration testing has passed",
    "A auditoria SOC 2 será concluída no próximo trimestre",
    "Production has been independently audited",
    "Possuímos certificação ISO 27001 vigente",
  ])("blocks arbitrary high-risk prose instead of attempting NLP: %s", (prose) => {
    expect(findNonCanonicalAssuranceLanguage(prose)).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "noncanonical_assurance_language"}),
    ]));
  });

  it("permits only the exact output of the canonical statement and milestone renderers", () => {
    const statement = securityAssuranceStatementSchema.parse({
      statementId: "ASSURANCE-SOC2-TYPE2", claim: "soc2_type2_examined", status: "not_certified", scope,
      evidenceRef: null, issuedAt: null, validThrough: null,
    });
    const decision = evaluateSecurityAssuranceStatementAgainstTrustedRoots({statement, evidence: [], trustedRoots: [], resolvedEvidence: [], evaluatedAt: now});
    const canonicalStatement = renderSecurityAssuranceStatement(statement, decision, "pt-BR");
    expect(findNonCanonicalAssuranceLanguage(canonicalStatement, [canonicalStatement])).toEqual([]);
    expect(findNonCanonicalAssuranceLanguage(`${canonicalStatement} SOC 2 certified`, [canonicalStatement])).toHaveLength(1);
  });
});
