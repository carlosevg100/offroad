import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {
  currentSecurityInventory,
  evaluateSecurityCurrentStateInventory,
  masterTrustControlCatalogue,
  renderSecurityCurrentStateInventory,
  type SecurityCurrentStateInventory,
} from "./index";

const evaluationTime = new Date(currentSecurityInventory.baseline.evidenceCutoff);

function copyInventory(): SecurityCurrentStateInventory {
  return structuredClone(currentSecurityInventory);
}

describe("security current-state inventory", () => {
  it("accepts the factual repository baseline without claiming assurance readiness", () => {
    const decision = evaluateSecurityCurrentStateInventory(currentSecurityInventory, masterTrustControlCatalogue, new Date());

    expect(decision.structurallyValid).toBe(true);
    expect(decision.assuranceReady).toBe(false);
    expect(decision.blockers).toEqual([]);
    expect(decision.counts).toMatchObject({environments: 6, systems: 7, dataStores: 7, dataFlows: 13, identities: 9, vendors: 13, openGaps: 17});
  });

  it("requires every repository evidence reference to exist and keeps the generated view in parity", () => {
    for (const evidence of currentSecurityInventory.evidenceIndex) {
      if (evidence.kind === "repository_file" || evidence.kind === "automated_test" || evidence.kind === "configuration" || evidence.kind === "design_reference") {
        const path = fileURLToPath(new URL(`../../../${evidence.ref}`, import.meta.url));
        expect(existsSync(path), `${evidence.evidenceId} -> ${evidence.ref}`).toBe(true);
        expect(() => execFileSync("git", ["cat-file", "-e", `${currentSecurityInventory.baseline.commit}:${evidence.ref}`], {stdio: "pipe"}), `${evidence.evidenceId} must exist in the declared baseline commit`).not.toThrow();
      }
      if (evidence.kind === "external_snapshot" || evidence.kind === "contract_record") {
        const path = fileURLToPath(new URL(`../../../${evidence.ref}`, import.meta.url));
        expect(existsSync(path), `${evidence.evidenceId} -> ${evidence.ref}`).toBe(true);
        const content = readFileSync(path);
        const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
        expect(evidence.contentFingerprint).toBe(digest);
        const artifact = JSON.parse(content.toString("utf8")) as {collector?: unknown; capturedAt?: unknown; validThrough?: unknown};
        expect(artifact.collector).toEqual(evidence.collector);
        expect(artifact.capturedAt).toBe(evidence.capturedAt);
        expect(artifact.validThrough).toBe(evidence.validThrough);
      }
    }

    const decision = evaluateSecurityCurrentStateInventory(currentSecurityInventory, masterTrustControlCatalogue, new Date());
    const generatedPath = fileURLToPath(new URL("../../../docs/security/CURRENT_STATE_INVENTORY.md", import.meta.url));
    expect(readFileSync(generatedPath, "utf8")).toBe(renderSecurityCurrentStateInventory(currentSecurityInventory, decision));
  });

  it("fails closed on duplicate identifiers", () => {
    const inventory = copyInventory();
    inventory.systems.push({...inventory.systems[0]!});
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue, evaluationTime);

    expect(decision.structurallyValid).toBe(false);
    expect(decision.blockers).toContainEqual({code: "duplicate_system_id", subjectRef: "SYS-WEB"});
  });

  it("fails closed when an owner or backup owner is absent", () => {
    const inventory = copyInventory();
    inventory.systems[0]!.owner = {ownerRole: null, backupOwnerRole: null, assignment: "unassigned"};
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue, evaluationTime);

    expect(decision.structurallyValid).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "owner_missing", subjectRef: "SYS-WEB"},
      {code: "backup_owner_missing", subjectRef: "SYS-WEB"},
    ]));
  });

  it("fails closed on absent or expired evidence", () => {
    const inventory = copyInventory();
    inventory.systems[0]!.evidenceRefs.push("SEV-NOT-REAL");
    const expiring = inventory.evidenceIndex.find((item) => item.evidenceId === "SEV-WEB-UPLOAD")!;
    expiring.freshness = "time_bound";
    expiring.immutableFingerprint = null;
    expiring.validThrough = "2026-09-06T23:59:59.000-03:00";
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue, new Date("2026-09-07T12:00:00.000-03:00"));

    expect(decision.structurallyValid).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "evidence_ref_missing:SEV-NOT-REAL", subjectRef: "SYS-WEB"},
      {code: "evidence_expired", subjectRef: "SEV-WEB-UPLOAD"},
    ]));
  });

  it("fails closed when repository or external evidence violates its freshness contract", () => {
    const inventory = copyInventory();
    inventory.evidenceIndex.find((item) => item.evidenceId === "SEV-WEB-UPLOAD")!.immutableFingerprint = "deadbeef";
    const liveSnapshot = inventory.evidenceIndex.find((item) => item.evidenceId === "SEV-AWS-DEPLOY-ROLE-SNAPSHOT")!;
    liveSnapshot.freshness = "immutable";
    liveSnapshot.validThrough = null;
    liveSnapshot.immutableFingerprint = inventory.baseline.commit;
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue, evaluationTime);

    expect(decision.structurallyValid).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "repository_evidence_commit_mismatch", subjectRef: "SEV-WEB-UPLOAD"},
      {code: "external_evidence_must_be_time_bound", subjectRef: "SEV-AWS-DEPLOY-ROLE-SNAPSHOT"},
    ]));
  });

  it("fails closed when an environment has no classification", () => {
    const inventory = copyInventory();
    inventory.environments[0]!.classification = null;
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue, evaluationTime);

    expect(decision.structurallyValid).toBe(false);
    expect(decision.blockers).toContainEqual({code: "environment_classification_missing", subjectRef: "ENV-PRODUCTION"});
  });

  it("fails closed when accidental secret material reaches any inventory string", () => {
    const inventory = copyInventory();
    inventory.limitations.push("accidental gh" + "p_0123456789abcdefghijklmnopqrst token");
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue, evaluationTime);

    expect(decision.structurallyValid).toBe(false);
    expect(decision.blockers).toContainEqual({code: "secret_material_detected:github_token", subjectRef: null});
  });

  it.each([
    ["github_fine_grained_token", "github_" + "pat_0123456789abcdefghijklmnopqrst"],
    ["perplexity_key", "pplx-0123456789abcdefghijklmnopqrst"],
    ["firecrawl_key", "fc-0123456789abcdefghijklmnopqrst"],
    ["supabase_secret_key", "sb_" + "secret_0123456789abcdefghijklmnopqrst"],
    ["posthog_personal_key", "phc_0123456789abcdefghijklmnopqrst"],
  ])("detects current provider secret format %s before schema parsing", (code, secret) => {
    const inventory = copyInventory() as SecurityCurrentStateInventory & {unexpected?: unknown};
    inventory.unexpected = {value: secret};
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue, evaluationTime);

    expect(decision.blockers).toContainEqual({code: `secret_material_detected:${code}`, subjectRef: null});
  });

  it("detects a secret in an unknown sensitive field before Zod can strip it", () => {
    const inventory = copyInventory() as SecurityCurrentStateInventory & {unexpected?: unknown};
    inventory.unexpected = {aws_secret_access_key: "0123456789abcdefghijklmnopqrstuv"};
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue, evaluationTime);

    expect(decision.blockers).toContainEqual({code: "secret_material_detected:sensitive_field", subjectRef: null});
  });

  it("detects an isolated AWS secret-access-key-shaped value", () => {
    const inventory = copyInventory() as SecurityCurrentStateInventory & {unexpected?: unknown};
    inventory.unexpected = {value: "Abcdefghij1lmnopqrstuvwx/yzABCDEFGHIJKLM"};
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue, evaluationTime);

    expect(decision.blockers).toContainEqual({code: "secret_material_detected:aws_secret_access_key", subjectRef: null});
  });

  it("allows an empty future gap collection at the schema level and reports unresolved backlinks", () => {
    const inventory = copyInventory();
    inventory.gaps = [];

    expect(() => evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue, evaluationTime)).not.toThrow();
    expect(evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue, evaluationTime).structurallyValid).toBe(false);
  });

  it("fails closed when a gap reference and its target are not bidirectional", () => {
    const inventory = copyInventory();
    inventory.systems[0]!.gapRefs.push("SG-DATA-LIFECYCLE");
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue, evaluationTime);

    expect(decision.blockers).toContainEqual({code: "gap_target_backref_missing:SG-DATA-LIFECYCLE", subjectRef: "SYS-WEB"});
  });

  it("fails closed once the inventory review SLA has elapsed", () => {
    const inventory = copyInventory();
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue, new Date("2026-09-15T09:20:00.000-03:00"));

    expect(decision.blockers).toContainEqual({code: "baseline_review_overdue", subjectRef: inventory.baseline.commit});
  });
});
