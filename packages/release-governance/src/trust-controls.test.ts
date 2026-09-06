import {describe, expect, it} from "vitest";
import {
  evaluateAssuranceClaim,
  evaluateTrustReleaseGate,
  type ExternalAttestation,
  type TrustControlRecord,
  type TrustGateRequirement,
} from "./trust-controls";

const evaluatedAt = new Date("2026-09-06T15:00:00.000Z");
const scopeFingerprint = "a".repeat(64);

function control(overrides: Partial<TrustControlRecord> = {}): TrustControlRecord {
  return {
    controlId: "DATA-03",
    domain: "data",
    title: "Tenant isolation",
    applicable: true,
    exclusionJustification: null,
    ownerId: "security-data",
    state: "evidenced",
    evidence: [
      {
        evidenceId: "rls-suite-main-2026-09-06",
        kind: "automated_test",
        environment: "staging",
        collectedAt: "2026-09-06T12:00:00.000Z",
        validThrough: "2026-12-06T12:00:00.000Z",
        immutableRef: "ci://quality/rls/2026-09-06",
      },
      {
        evidenceId: "rls-production-snapshot-2026-09-06",
        kind: "configuration_snapshot",
        environment: "production",
        collectedAt: "2026-09-06T13:00:00.000Z",
        validThrough: "2026-10-06T13:00:00.000Z",
        immutableRef: "evidence://private/rls-production-2026-09-06",
      },
    ],
    findings: [],
    ...overrides,
  };
}

function requirement(overrides: Partial<TrustGateRequirement> = {}): TrustGateRequirement {
  return {
    controlId: "DATA-03",
    minimumState: "implemented",
    evidenceKinds: ["automated_test", "configuration_snapshot"],
    environments: ["staging", "production"],
    ...overrides,
  };
}

function attestation(kind: ExternalAttestation["kind"]): ExternalAttestation {
  return {
    kind,
    issuer: "Independent assurance provider",
    issuedAt: "2026-09-01T12:00:00.000Z",
    validThrough: "2027-09-01T12:00:00.000Z",
    scopeFingerprint,
    immutableRef: `evidence://private/${kind}-2026`,
  };
}

function independentlyTestedControl(): TrustControlRecord {
  return control({
    state: "independently_tested",
    evidence: [
      ...control().evidence,
      {
        evidenceId: "independent-control-assessment-2026",
        kind: "external_assessment",
        environment: "governance",
        collectedAt: "2026-09-01T12:00:00.000Z",
        validThrough: "2027-09-01T12:00:00.000Z",
        immutableRef: "evidence://private/control-assessment-2026",
      },
    ],
  });
}

describe("trust release gate", () => {
  it("allows a release only when every required control has an owner, sufficient state and current evidence", () => {
    const decision = evaluateTrustReleaseGate({
      releaseId: "release-2-vault-to-truth",
      requirements: [requirement()],
      controls: [control()],
      evaluatedAt,
    });

    expect(decision).toMatchObject({
      allowed: true,
      blockers: [],
      assessedControlIds: ["DATA-03"],
    });
  });

  it("fails closed for missing ownership, expired evidence and an accepted high finding", () => {
    const unsafe = control({
      ownerId: null,
      evidence: control().evidence.map((entry) => ({...entry, validThrough: "2026-09-05T12:00:00.000Z"})),
      findings: [
        {
          findingId: "finding-cross-tenant-1",
          severity: "high",
          status: "risk_accepted",
          ownerId: "security-data",
          dueAt: "2026-09-30T12:00:00.000Z",
        },
      ],
    });
    const decision = evaluateTrustReleaseGate({
      releaseId: "release-2-vault-to-truth",
      requirements: [requirement()],
      controls: [unsafe],
      evaluatedAt,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockers.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "control_owner_missing",
      "current_evidence_missing:automated_test",
      "current_evidence_missing:configuration_snapshot",
      "environment_evidence_missing:staging",
      "environment_evidence_missing:production",
      "open_high_finding",
    ]));
  });

  it("does not let a duplicate or excluded control silently satisfy a requirement", () => {
    const decision = evaluateTrustReleaseGate({
      releaseId: "release-0",
      requirements: [requirement(), requirement()],
      controls: [control(), control({applicable: false, exclusionJustification: "Not approved"})],
      evaluatedAt,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockers.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "duplicate_control_record",
      "duplicate_gate_requirement",
    ]));
  });

  it("rejects a release gate with no declared trust obligations", () => {
    expect(() => evaluateTrustReleaseGate({
      releaseId: "release-0",
      requirements: [],
      controls: [],
      evaluatedAt,
    })).toThrow();
  });
});

describe("assurance claims", () => {
  it("separates implemented controls from formal SOC 2 and ISO claims", () => {
    const controls = [independentlyTestedControl()];

    expect(evaluateAssuranceClaim({
      claim: "independently_tested",
      controls,
      requiredControlIds: ["DATA-03"],
      scopeFingerprint,
      evaluatedAt,
    }).allowed).toBe(true);

    const withoutReport = evaluateAssuranceClaim({
      claim: "soc2_type2_examined",
      controls,
      requiredControlIds: ["DATA-03"],
      scopeFingerprint,
      evaluatedAt,
    });
    expect(withoutReport.allowed).toBe(false);
    expect(withoutReport.blockers).toContain("current_external_attestation_required:soc2_type2");
  });

  it("requires a current third-party attestation for the exact system scope", () => {
    const controls = [control({state: "independently_tested"})];
    const wrongScope = {...attestation("iso27001_certificate"), scopeFingerprint: "b".repeat(64)};

    expect(evaluateAssuranceClaim({
      claim: "iso27001_certified",
      controls,
      requiredControlIds: ["DATA-03"],
      scopeFingerprint,
      attestations: [wrongScope],
      evaluatedAt,
    }).allowed).toBe(false);

    expect(evaluateAssuranceClaim({
      claim: "iso27001_certified",
      controls,
      requiredControlIds: ["DATA-03"],
      scopeFingerprint,
      attestations: [attestation("iso27001_certificate")],
      evaluatedAt,
    }).allowed).toBe(true);
  });

  it("does not accept a declared independent state without current independent evidence", () => {
    const decision = evaluateAssuranceClaim({
      claim: "independently_tested",
      controls: [control({state: "independently_tested"})],
      requiredControlIds: ["DATA-03"],
      scopeFingerprint,
      evaluatedAt,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toContain("claim_independent_assessment_missing:DATA-03");
  });

  it("blocks assurance claims with duplicate controls or an empty scope", () => {
    const duplicateDecision = evaluateAssuranceClaim({
      claim: "operating",
      controls: [control({state: "operating"}), control({state: "operating"})],
      requiredControlIds: ["DATA-03"],
      scopeFingerprint,
      evaluatedAt,
    });
    expect(duplicateDecision.allowed).toBe(false);
    expect(duplicateDecision.blockers).toContain("claim_duplicate_control:DATA-03");

    expect(() => evaluateAssuranceClaim({
      claim: "operating",
      controls: [],
      requiredControlIds: [],
      scopeFingerprint,
      evaluatedAt,
    })).toThrow();
  });
});
