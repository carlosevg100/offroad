import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {
  currentSecurityInventory,
  evaluateSecurityCurrentStateInventory,
  evaluateSecurityCurrentStateInventoryTrusted,
  masterTrustControlCatalogue,
  renderSecurityCurrentStateInventory,
  type SecurityCurrentStateInventory,
} from "./index";

function copyInventory(): SecurityCurrentStateInventory {
  return structuredClone(currentSecurityInventory);
}

describe("security current-state inventory", () => {
  it("keeps synchronous validation declaration-only and never treats it as current-state truth", () => {
    const decision = evaluateSecurityCurrentStateInventory(currentSecurityInventory, masterTrustControlCatalogue);
    expect(decision.structurallyValid, JSON.stringify(decision.blockers)).toBe(true);
    expect(decision.evidenceVerification).toBe("declaration_only");
    expect(decision.currentStateTruthVerified).toBe(false);
    expect(decision.assuranceReady).toBe(false);
    expect(decision.blockers).toEqual([]);
    expect(decision.counts).toMatchObject({environments: 6, systems: 8, dataStores: 8, dataFlows: 24, identities: 11, vendors: 17, openGaps: 18});
    expect(decision.warnings).toContainEqual({code: "operator_observation_not_independently_verified", subjectRef: "SEV-AWS-DEPLOY-ROLE-SNAPSHOT"});
  });

  it("resolves every repository and local evidence byte before asserting current-state truth", async () => {
    for (const evidence of currentSecurityInventory.evidenceIndex) {
      if (["repository_file", "automated_test", "configuration", "design_reference"].includes(evidence.kind)) {
        const path = fileURLToPath(new URL(`../../../${evidence.ref}`, import.meta.url));
        expect(existsSync(path), `${evidence.evidenceId} -> ${evidence.ref}`).toBe(true);
        expect(() => execFileSync("git", ["cat-file", "-e", `${currentSecurityInventory.baseline.commit}:${evidence.ref}`], {stdio: "pipe"}), `${evidence.evidenceId} must exist in the declared baseline commit`).not.toThrow();
      }
      if (["external_snapshot", "contract_record", "operator_observation"].includes(evidence.kind)) {
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

    const decision = await evaluateSecurityCurrentStateInventoryTrusted(currentSecurityInventory, masterTrustControlCatalogue);
    expect(decision.structurallyValid, JSON.stringify(decision.blockers)).toBe(true);
    expect(decision.evidenceVerification).toBe("repository_and_local_bytes");
    expect(decision.currentStateTruthVerified).toBe(true);
    expect(decision.evidenceResolutions).toHaveLength(currentSecurityInventory.evidenceIndex.length);
    const generatedPath = fileURLToPath(new URL("../../../docs/security/CURRENT_STATE_INVENTORY.md", import.meta.url));
    expect(readFileSync(generatedPath, "utf8")).toBe(renderSecurityCurrentStateInventory(currentSecurityInventory, decision));
  });

  it("makes the evaluation OIDC, secret retrieval and provider boundaries explicit", () => {
    const identity = currentSecurityInventory.identities.find((item) => item.identityId === "ID-GITHUB-EVALS-OIDC");
    expect(identity).toMatchObject({systemRef: "SYS-GITHUB", privilege: "workload_scoped", status: "partial"});
    const expectedFlows = ["FLOW-GITHUB-EVAL-SECRETS", "FLOW-GITHUB-EVAL-ANTHROPIC", "FLOW-GITHUB-EVAL-OPENAI", "FLOW-GITHUB-EVAL-PERPLEXITY"];
    expect(currentSecurityInventory.dataFlows.filter((item) => expectedFlows.includes(item.flowId)).map((item) => item.flowId).sort()).toEqual(expectedFlows.sort());
    for (const flowId of expectedFlows) {
      const flow = currentSecurityInventory.dataFlows.find((item) => item.flowId === flowId)!;
      expect(flow.environmentRefs).toContain("ENV-CI");
      expect(flow.status).not.toBe("verified");
      expect(flow.gapRefs).toContain("SG-PROVIDER-ASSURANCE");
    }
    expect(currentSecurityInventory.dataFlows.find((item) => item.flowId === "FLOW-GITHUB-EVAL-SECRETS")!.gapRefs).toContain("SG-PRIVILEGED-ACCESS");
  });

  it("never treats the IAM operator note as verified or recommends a grant first", () => {
    const evidence = currentSecurityInventory.evidenceIndex.find((item) => item.evidenceId === "SEV-AWS-DEPLOY-ROLE-SNAPSHOT")!;
    const gap = currentSecurityInventory.gaps.find((item) => item.gapId === "SG-DEPLOY-DIAGNOSTICS")!;
    expect(evidence.kind).toBe("operator_observation");
    expect(evidence.description).toContain("effective IAM permissions remain unknown");
    expect(gap.title).toContain("not independently verified");
    expect(gap.nextAction).toMatch(/^Collect a dated IAM policy/);
    expect(gap.nextAction).toContain("Only after proving an actual denial");
  });

  it("models the Codex review as a privileged agentic boundary", () => {
    expect(currentSecurityInventory.systems.find((item) => item.systemId === "SYS-CODEX-CI")?.purpose).toContain("danger-full-access");
    expect(currentSecurityInventory.identities.find((item) => item.identityId === "ID-CODEX-CI")).toMatchObject({privilege: "privileged", status: "partial"});
    const gap = currentSecurityInventory.gaps.find((item) => item.gapId === "SG-CODEX-CI-AGENT-BOUNDARY")!;
    for (const phrase of ["prompt-injection", "network egress", "commands/tools", "logs/artifacts"]) expect(gap.nextAction).toContain(phrase);
  });

  it("inventories npm, Actions, Supabase local images and Playwright browser supply paths", () => {
    const expected = ["FLOW-NPM-SUPPLY", "FLOW-GITHUB-ACTIONS-SUPPLY", "FLOW-SUPABASE-LOCAL-IMAGES", "FLOW-PLAYWRIGHT-BROWSERS"];
    expect(currentSecurityInventory.dataFlows.filter((item) => expected.includes(item.flowId)).map((item) => item.flowId).sort()).toEqual(expected.sort());
    for (const flowId of expected) expect(currentSecurityInventory.dataFlows.find((item) => item.flowId === flowId)?.gapRefs).toContain("SG-ASSET-DISCOVERY");
  });

  it("uses declared handling environments without implying an enforced permission matrix", () => {
    expect(currentSecurityInventory.scopeRelationship.environmentDataMatrixState).toBe("not_inventoried");
    expect(currentSecurityInventory.dataClasses.every((item) => item.declaredHandlingEnvironmentRefs.length > 0)).toBe(true);
  });

  it("fails closed on duplicate identifiers", () => {
    const inventory = copyInventory();
    inventory.systems.push({...inventory.systems[0]!});
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.structurallyValid).toBe(false);
    expect(decision.blockers).toContainEqual({code: "duplicate_system_id", subjectRef: "SYS-WEB"});
  });

  it("fails closed when an owner or backup owner is absent", () => {
    const inventory = copyInventory();
    inventory.systems[0]!.owner = {ownerRole: null, backupOwnerRole: null, assignment: "unassigned"};
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
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
    expiring.validThrough = "2020-09-06T23:59:59.000-03:00";
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "evidence_ref_missing:SEV-NOT-REAL", subjectRef: "SYS-WEB"},
      {code: "evidence_expired", subjectRef: "SEV-WEB-UPLOAD"},
    ]));
  });

  it("fails closed when repository or external evidence violates its freshness contract", () => {
    const inventory = copyInventory();
    inventory.evidenceIndex.find((item) => item.evidenceId === "SEV-WEB-UPLOAD")!.immutableFingerprint = "deadbeef";
    const observation = inventory.evidenceIndex.find((item) => item.evidenceId === "SEV-AWS-DEPLOY-ROLE-SNAPSHOT")!;
    observation.freshness = "immutable";
    observation.validThrough = null;
    observation.immutableFingerprint = inventory.baseline.commit;
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "repository_evidence_commit_mismatch", subjectRef: "SEV-WEB-UPLOAD"},
      {code: "external_evidence_must_be_time_bound", subjectRef: "SEV-AWS-DEPLOY-ROLE-SNAPSHOT"},
    ]));
  });

  it("fails closed when an environment has no classification", () => {
    const inventory = copyInventory();
    inventory.environments[0]!.classification = null;
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toContainEqual({code: "environment_classification_missing", subjectRef: "ENV-PRODUCTION"});
  });

  it("fails closed when accidental secret material reaches any inventory string", () => {
    const inventory = copyInventory();
    inventory.limitations.push("accidental gh" + "p_0123456789abcdefghijklmnopqrst token");
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toContainEqual({code: "secret_material_detected:github_token", subjectRef: null});
  });

  it.each([
    ["github_fine_grained_token", "github_" + "pat_0123456789abcdefghijklmnopqrst"],
    ["perplexity_key", "pplx-0123456789abcdefghijklmnopqrst"],
    ["firecrawl_key", "fc-0123456789abcdefghijklmnopqrst"],
    ["supabase_secret_key", "sb_" + "secret_0123456789abcdefghijklmnopqrst"],
    ["posthog_personal_key", "phc_0123456789abcdefghijklmnopqrst"],
    ["aws_access_key", "ASIA" + "0123456789ABCDEF"],
    ["aws_session_token", "FwoGZXIvYXdzE" + "0123456789abcdefghijklmnopqrstuvwxyz+/="],
    ["anthropic_key", "sk-ant-" + "0123456789abcdefghijklmnopqrst"],
    ["openai_style_key", "sk-proj-" + "0123456789abcdefghijklmnopqrst"],
    ["sentry_auth_token", "sntrys_" + "0123456789abcdefghijklmnopqrst"],
    ["vercel_token", "vercel_" + "0123456789abcdefghijklmnopqrst"],
  ])("detects current provider secret format %s before schema parsing", (code, secret) => {
    const inventory = copyInventory() as SecurityCurrentStateInventory & {unexpected?: unknown};
    inventory.unexpected = {value: secret};
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toContainEqual({code: `secret_material_detected:${code}`, subjectRef: null});
  });

  it("detects a secret in an unknown sensitive field before Zod can strip it", () => {
    const inventory = copyInventory() as SecurityCurrentStateInventory & {unexpected?: unknown};
    inventory.unexpected = {aws_secret_access_key: "0123456789abcdefghijklmnopqrstuv"};
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toContainEqual({code: "secret_material_detected:sensitive_field", subjectRef: null});
  });

  it("detects an isolated AWS secret-access-key-shaped value", () => {
    const inventory = copyInventory() as SecurityCurrentStateInventory & {unexpected?: unknown};
    inventory.unexpected = {value: "Abcdefghij1lmnopqrstuvwx/yzABCDEFGHIJKLM"};
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toContainEqual({code: "secret_material_detected:aws_secret_access_key", subjectRef: null});
  });

  it("allows an empty future gap collection at the schema level and reports unresolved backlinks", () => {
    const inventory = copyInventory();
    inventory.gaps = [];
    expect(() => evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue)).not.toThrow();
    expect(evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue).structurallyValid).toBe(false);
  });

  it("fails closed when a gap reference and its target are not bidirectional", () => {
    const inventory = copyInventory();
    inventory.systems[0]!.gapRefs.push("SG-DATA-LIFECYCLE");
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toContainEqual({code: "gap_target_backref_missing:SG-DATA-LIFECYCLE", subjectRef: "SYS-WEB"});
  });

  it("fails closed once the inventory review SLA has elapsed using the internal clock", () => {
    const inventory = copyInventory();
    inventory.baseline.reviewDueAt = "2020-09-15T09:20:00.000-03:00";
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toContainEqual({code: "baseline_review_overdue", subjectRef: inventory.baseline.commit});
  });

  it("fails closed on an invalid declared date and exposes no caller-controlled clock", () => {
    const inventory = copyInventory();
    inventory.baseline.reviewDueAt = "not-a-date";
    expect(() => evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue)).toThrow();
    expect(evaluateSecurityCurrentStateInventory.length).toBe(2);
  });

  it("fails trusted evaluation when a declared repository path does not exist", async () => {
    const inventory = copyInventory();
    inventory.evidenceIndex.find((item) => item.evidenceId === "SEV-WEB-UPLOAD")!.ref = "apps/web/src/not-a-real-file.ts";
    const decision = await evaluateSecurityCurrentStateInventoryTrusted(inventory, masterTrustControlCatalogue);
    expect(decision.currentStateTruthVerified).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "evidence_bytes_unresolvable", subjectRef: "SEV-WEB-UPLOAD"},
      {code: "evidence_resolution_incomplete", subjectRef: null},
    ]));
  });

  it("fails trusted evaluation when an operator observation claims a confirmed fact", async () => {
    const inventory = copyInventory();
    inventory.evidenceIndex.find((item) => item.evidenceId === "SEV-AWS-DEPLOY-ROLE-SNAPSHOT")!.description = "Confirmed effective IAM denial.";
    const decision = await evaluateSecurityCurrentStateInventoryTrusted(inventory, masterTrustControlCatalogue);
    expect(decision.currentStateTruthVerified).toBe(false);
    expect(decision.blockers).toContainEqual({code: "operator_observation_asserts_verified_fact", subjectRef: "SEV-AWS-DEPLOY-ROLE-SNAPSHOT"});
  });

  it("fails trusted evaluation when a local observation hash is invented", async () => {
    const inventory = copyInventory();
    inventory.evidenceIndex.find((item) => item.evidenceId === "SEV-AWS-DEPLOY-ROLE-SNAPSHOT")!.contentFingerprint = `sha256:${"0".repeat(64)}`;
    const decision = await evaluateSecurityCurrentStateInventoryTrusted(inventory, masterTrustControlCatalogue);
    expect(decision.currentStateTruthVerified).toBe(false);
    expect(decision.blockers).toContainEqual({code: "external_evidence_content_mismatch", subjectRef: "SEV-AWS-DEPLOY-ROLE-SNAPSHOT"});
  });

  it("fails trusted evaluation when a repository content hash is invented", async () => {
    const inventory = copyInventory();
    inventory.evidenceIndex.find((item) => item.evidenceId === "SEV-WEB-UPLOAD")!.contentFingerprint = `sha256:${"f".repeat(64)}`;
    const decision = await evaluateSecurityCurrentStateInventoryTrusted(inventory, masterTrustControlCatalogue);
    expect(decision.currentStateTruthVerified).toBe(false);
    expect(decision.blockers).toContainEqual({code: "repository_evidence_content_mismatch", subjectRef: "SEV-WEB-UPLOAD"});
  });
});
