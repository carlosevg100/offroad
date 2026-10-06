import {describe, expect, it} from "vitest";
import {assessFrameworkReadiness, frameworkReadinessCriteria} from "./framework-readiness";

/** Contract-only fixtures. These are never run receipts or production-readiness evidence. */
const fixture = () => {
  const commit = "a".repeat(40), fingerprint = "b".repeat(64);
  return {commit,
    journal: ["gjkkjtbfnssdsbmlhmwk", "ifnogpksgdadruooqydi"].map((projectId) => ({projectId, fingerprint})),
    checks: frameworkReadinessCriteria.flatMap(([criterion, file]) => ["staging", "isolated_ci"].map((environment) => ({criterion, environment, commit, source: `supabase/tests/${file}`, sourceFingerprint: fingerprint, receiptFingerprint: fingerprint, exitCode: 0}))),
    journey: {commit, workId: "a4240000-0000-4000-8000-000000000001", executionId: "a4240000-0000-4000-8000-000000000002", manifestFingerprint: fingerprint, profileFingerprint: fingerprint, source: "apps/web/e2e/framework-readiness.spec.ts", receiptFingerprint: fingerprint, exitCode: 0, sameWork: true, startedWithoutIntake: true, workerAuthoredResult: true},
    deployment: {webCommit: commit, workerCommit: commit, webReady: true, workerStable: true, workerBootVerified: true, pinnedExecutorsVerified: true},
    cleanup: {temporaryAccessRevoked: true, operationalFixturesAbsent: true},
    provider: {privateTransportProven: false, unprovenPrivateTransportDisabled: true}};
};

describe("framework readiness evidence contract", () => {
  it("distinguishes technical closure from product trials, real provider transport and certification", () => {
    expect(assessFrameworkReadiness(fixture())).toMatchObject({technicalEvidenceComplete: true, criteria: 21, productTrialsPerformed: false, externalCertification: false, privateProviderTransport: "disabled_unproven"});
  });
  for (const [criterion] of frameworkReadinessCriteria) {
    it(`refuses ${criterion} when the staging proof is absent`, () => {
      const value = fixture(); value.checks = value.checks.filter((x) => x.criterion !== criterion || x.environment !== "staging");
      expect(assessFrameworkReadiness(value).technicalEvidenceComplete).toBe(false);
    });
  }
  it("refuses a failed run, duplicate receipt, changed test and different revision", () => {
    for (const mutate of [
      (v: ReturnType<typeof fixture>) => {v.checks[0]!.exitCode = 1;},
      (v: ReturnType<typeof fixture>) => {v.checks[0]!.sourceFingerprint = "c".repeat(64);},
      (v: ReturnType<typeof fixture>) => {v.checks.push(v.checks[0]!);},
      (v: ReturnType<typeof fixture>) => {v.checks[0]!.source = "supabase/tests/unrelated.sql";},
      (v: ReturnType<typeof fixture>) => {v.checks[0]!.commit = "c".repeat(40);},
    ]) {const value = fixture(); mutate(value); expect(assessFrameworkReadiness(value).technicalEvidenceComplete).toBe(false);}
  });
  it("refuses an injected production fixture environment", () => {
    const value = fixture(); value.checks[0]!.environment = "production";
    expect(() => assessFrameworkReadiness(value)).toThrow();
  });
  it("requires both actual environments and a single work executed by the worker", () => {
    const value = fixture(); value.journal[1] = value.journal[0]!;
    expect(assessFrameworkReadiness(value).technicalEvidenceComplete).toBe(false);
    const other = fixture(); other.journey.sameWork = false;
    expect(assessFrameworkReadiness(other).technicalEvidenceComplete).toBe(false);
    other.journey.sameWork = true; other.journey.workerAuthoredResult = false;
    expect(assessFrameworkReadiness(other).technicalEvidenceComplete).toBe(false);
  });
  it("refuses an old deployment, unavailable boot, leftover access and enabled unproven provider", () => {
    for (const mutate of [
      (v: ReturnType<typeof fixture>) => {v.deployment.workerCommit = "d".repeat(40);},
      (v: ReturnType<typeof fixture>) => {v.deployment.workerBootVerified = false;},
      (v: ReturnType<typeof fixture>) => {v.cleanup.temporaryAccessRevoked = false;},
      (v: ReturnType<typeof fixture>) => {v.cleanup.operationalFixturesAbsent = false;},
      (v: ReturnType<typeof fixture>) => {v.provider.unprovenPrivateTransportDisabled = false;},
    ]) {const value = fixture(); mutate(value); expect(assessFrameworkReadiness(value).technicalEvidenceComplete).toBe(false);}
  });
});
