import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {
  currentSecurityInventory,
  currentSecurityAssuranceMilestones,
  evaluateSecurityCurrentStateInventory,
  evaluateSecurityCurrentStateInventoryTrusted,
  findForbiddenAssuranceClaims,
  getSecurityAssuranceMilestoneEvidenceBinding,
  issueTrustedSecurityEvidenceResolutionReceipt,
  masterTrustControlCatalogue,
  renderSecurityCurrentStateInventory,
  type SecurityCurrentStateInventory,
  type SecurityAssuranceMilestoneEvidenceBinding,
} from "./index";
import {
  renderSecurityAssuranceMilestone,
  securityAssuranceMilestoneSchema,
} from "./security-assurance-statements.ts";

function copyInventory(): SecurityCurrentStateInventory {
  return structuredClone(currentSecurityInventory);
}

describe("security current-state inventory", () => {
  it("keeps synchronous validation declaration-only and never treats it as current-state truth", () => {
    const decision = evaluateSecurityCurrentStateInventory(currentSecurityInventory, masterTrustControlCatalogue);
    expect(decision.structurallyValid, JSON.stringify(decision.blockers)).toBe(true);
    expect(currentSecurityInventory.baseline).toMatchObject({
      waveId: "wave-14", reviewCadence: "per_wave", waveStatus: "open", materialChangeState: "reviewed", reviewDueAt: null,
    });
    expect(decision.evidenceVerification).toBe("declaration_only");
    expect(decision.currentStateTruthVerified).toBe(false);
    expect(decision.assuranceReady).toBe(false);
    expect(decision.blockers).toEqual([]);
    expect(decision.counts).toMatchObject({environments: 6, systems: 8, dataStores: 8, dataFlows: 28, identities: 12, vendors: 19, openGaps: 18, coverageClaims: 8});
    expect(decision.warnings).toContainEqual({code: "operator_observation_not_independently_verified", subjectRef: "SEV-AWS-DEPLOY-ROLE-SNAPSHOT"});
  });

  it("retires only the three remediated wave-one findings while requiring their regression evidence", () => {
    const closed = ["SG-CREATOR-RESIDUAL-AUTHORITY", "SG-PROJECT-MEMBERSHIP-READ", "SG-PROFILE-ANALYTICAL-DEPTH"];
    expect(currentSecurityInventory.gaps.filter((gap) => closed.includes(gap.gapId))).toEqual([]);
    for (const evidenceRef of ["SEV-CREATOR-REGRESSION", "SEV-ACCESS-REGRESSION", "SEV-PROFILE-REGRESSION"]) {
      const attacked = copyInventory();
      attacked.evidenceIndex = attacked.evidenceIndex.filter((item) => item.evidenceId !== evidenceRef);
      const decision = evaluateSecurityCurrentStateInventory(attacked, masterTrustControlCatalogue);
      expect(decision.structurallyValid).toBe(false);
      expect(decision.blockers.some((item) => item.subjectRef === evidenceRef)).toBe(true);
    }
  });

  it("requires the delivered workspace and outbox evidence at wave-two closeout", () => {
    for (const evidenceRef of ["SEV-WORKSPACE-CONTEXT-REGRESSION", "SEV-OUTBOX-SCHEMA", "SEV-OUTBOX-CONTRACT", "SEV-OUTBOX-REVOCATION", "SEV-OUTBOX-MONITORING"]) {
      const attacked = copyInventory();
      attacked.evidenceIndex = attacked.evidenceIndex.filter((item) => item.evidenceId !== evidenceRef);
      const decision = evaluateSecurityCurrentStateInventory(attacked, masterTrustControlCatalogue);
      expect(decision.structurallyValid).toBe(false);
      expect(decision.blockers.some((item) => item.subjectRef === evidenceRef)).toBe(true);
    }
  });

  it("requires delivered policy, barriers, bounded delegation and export evidence at wave-three closeout", () => {
    for (const evidenceRef of ["SEV-POLICY-SCHEMA", "SEV-POLICY-RESOURCE-BOUND", "SEV-POLICY-BARRIERS", "SEV-POLICY-DELEGATION", "SEV-POLICY-ISOLATION", "SEV-POLICY-EVENT-ONCE", "SEV-POLICY-TYPED-CONTRACT", "SEV-POLICY-EXPORT", "SEV-POLICY-INSTALLED-EVAL"]) {
      expect(currentSecurityInventory.evidenceIndex.some((item) => item.evidenceId === evidenceRef)).toBe(true);
      const attacked = copyInventory();
      attacked.evidenceIndex = attacked.evidenceIndex.filter((item) => item.evidenceId !== evidenceRef);
      const decision = evaluateSecurityCurrentStateInventory(attacked, masterTrustControlCatalogue);
      expect(decision.structurallyValid).toBe(false);
      expect(decision.blockers.some((item) => item.subjectRef === evidenceRef)).toBe(true);
    }
  });

  it("requires delivered dossier isolation, public identity and bounded worker evidence at wave-four closeout", () => {
    for (const evidenceRef of ["SEV-DOSSIER-SCHEMA", "SEV-DOSSIER-ISOLATION", "SEV-DOSSIER-PUBLIC-CACHE", "SEV-DOSSIER-CONTRACT", "SEV-DOSSIER-WORKER", "SEV-DOSSIER-INSTALLED-EVAL", "SEV-DOSSIER-INSTALLATION"]) {
      expect(currentSecurityInventory.evidenceIndex.some((item) => item.evidenceId === evidenceRef)).toBe(true);
      const attacked = copyInventory();
      attacked.evidenceIndex = attacked.evidenceIndex.filter((item) => item.evidenceId !== evidenceRef);
      const decision = evaluateSecurityCurrentStateInventory(attacked, masterTrustControlCatalogue);
      expect(decision.structurallyValid).toBe(false);
      expect(decision.blockers.some((item) => item.subjectRef === evidenceRef)).toBe(true);
    }
  });

  it("requires immutable source, delegated verification and download evidence at wave-five closeout", () => {
    for (const evidenceRef of ["SEV-SOURCE-PDF-STRUCTURE", "SEV-SOURCE-PDF-REGRESSION", "SEV-SOURCE-E2E", "SEV-SOURCE-SCHEMA", "SEV-SOURCE-LEGACY-INSERT", "SEV-SOURCE-ISOLATION", "SEV-SOURCE-CONTRACT", "SEV-SOURCE-JOB", "SEV-SOURCE-STORAGE", "SEV-SOURCE-DOWNLOAD", "SEV-SOURCE-INSTALLED-EVAL", "SEV-SOURCE-INSTALLATION", "SEV-SOURCE-BEFORE", "SEV-SOURCE-BEFORE-SQL"]) {
      expect(currentSecurityInventory.evidenceIndex.some((item) => item.evidenceId === evidenceRef)).toBe(true);
      const attacked = copyInventory();
      attacked.evidenceIndex = attacked.evidenceIndex.filter((item) => item.evidenceId !== evidenceRef);
      const decision = evaluateSecurityCurrentStateInventory(attacked, masterTrustControlCatalogue);
      expect(decision.structurallyValid).toBe(false);
      expect(decision.blockers.some((item) => item.subjectRef === evidenceRef)).toBe(true);
    }
  });

  it("requires source rights and real retrieval evidence at wave-six closeout", () => {
    for (const evidenceRef of ["SEV-RIGHTS-SCHEMA", "SEV-RIGHTS-RETRIEVAL", "SEV-RIGHTS-DEADLINE", "SEV-RIGHTS-DELIVERY", "SEV-RIGHTS-SCOPE", "SEV-RIGHTS-JOB", "SEV-RIGHTS-PERFORMANCE", "SEV-RIGHTS-PUBLIC-CACHE", "SEV-RIGHTS-ADAPTER", "SEV-RIGHTS-ADAPTER-EVAL", "SEV-RIGHTS-REGISTRY", "SEV-RIGHTS-INSTALLATION", "SEV-RIGHTS-INSTALLED-EVAL"]) {
      expect(currentSecurityInventory.evidenceIndex.some((item) => item.evidenceId === evidenceRef)).toBe(true);
      const attacked = copyInventory();
      attacked.evidenceIndex = attacked.evidenceIndex.filter((item) => item.evidenceId !== evidenceRef);
      const decision = evaluateSecurityCurrentStateInventory(attacked, masterTrustControlCatalogue);
      expect(decision.structurallyValid).toBe(false);
      expect(decision.blockers.some((item) => item.subjectRef === evidenceRef)).toBe(true);
    }
  });

  it("requires observation and immutable history evidence at wave-seven closeout", () => {
    for (const evidenceRef of ["SEV-OBS-SCHEMA", "SEV-OBS-AUTHORITY", "SEV-OBS-VALUES", "SEV-OBS-DIMENSIONS", "SEV-OBS-DOSSIER", "SEV-OBS-REVISION", "SEV-OBS-CONTRACT", "SEV-OBS-HISTORY", "SEV-OBS-PINNED", "SEV-OBS-READING", "SEV-OBS-READING-EVAL", "SEV-OBS-DECIMAL", "SEV-OBS-INSTALLATION", "SEV-OBS-INSTALLED-EVAL"]) {
      expect(currentSecurityInventory.evidenceIndex.some((item) => item.evidenceId === evidenceRef)).toBe(true);
      const attacked = copyInventory();
      attacked.evidenceIndex = attacked.evidenceIndex.filter((item) => item.evidenceId !== evidenceRef);
      const decision = evaluateSecurityCurrentStateInventory(attacked, masterTrustControlCatalogue);
      expect(decision.structurallyValid).toBe(false);
      expect(decision.blockers.some((item) => item.subjectRef === evidenceRef)).toBe(true);
    }
  });

  it("requires contextual adoption and immutable basis evidence at wave-eight closeout", () => {
    for (const evidenceRef of ["SEV-ADOPT-SCHEMA", "SEV-ADOPT-BINDING", "SEV-ADOPT-RIGHTS", "SEV-ADOPT-IDENTITY", "SEV-ADOPT-CONTRACT", "SEV-ADOPT-SQL", "SEV-ADOPT-DEPENDENCIES", "SEV-ADOPT-EXECUTION", "SEV-ADOPT-CONCURRENCY", "SEV-ADOPT-DIFF", "SEV-ADOPT-MATH", "SEV-ADOPT-SELECTION", "SEV-ADOPT-E2E", "SEV-ADOPT-INSTALLATION", "SEV-ADOPT-INSTALLED-EVAL"]) {
      expect(currentSecurityInventory.evidenceIndex.some((item) => item.evidenceId === evidenceRef)).toBe(true);
      const attacked = copyInventory();
      attacked.evidenceIndex = attacked.evidenceIndex.filter((item) => item.evidenceId !== evidenceRef);
      const decision = evaluateSecurityCurrentStateInventory(attacked, masterTrustControlCatalogue);
      expect(decision.structurallyValid).toBe(false);
      expect(decision.blockers.some((item) => item.subjectRef === evidenceRef)).toBe(true);
    }
  });

  it("requires persistent work entry and authority evidence at wave-nine closeout", () => {
    for (const evidenceRef of ["SEV-WORK-STORAGE", "SEV-WORK-COMMANDS", "SEV-WORK-LEGACY", "SEV-WORK-SPECIALIZED", "SEV-WORK-REPLAY", "SEV-WORK-STORAGE-SQL", "SEV-WORK-ENTRY-SQL", "SEV-WORK-LEGACY-SQL", "SEV-WORK-RUNTIME", "SEV-WORK-RUNTIME-TEST", "SEV-WORK-COMPILE", "SEV-WORK-CONTEXT", "SEV-WORK-WEB", "SEV-WORK-E2E", "SEV-WORK-AUTH-REPLAY"]) {
      expect(currentSecurityInventory.evidenceIndex.some((item) => item.evidenceId === evidenceRef)).toBe(true);
      const attacked = copyInventory();
      attacked.evidenceIndex = attacked.evidenceIndex.filter((item) => item.evidenceId !== evidenceRef);
      const decision = evaluateSecurityCurrentStateInventory(attacked, masterTrustControlCatalogue);
      expect(decision.structurallyValid).toBe(false);
      expect(decision.blockers.some((item) => item.subjectRef === evidenceRef)).toBe(true);
    }
  });

  it("requires contribution lineage and channel authority evidence at wave-ten closeout", () => {
    for (const evidenceRef of ["SEV-CONTRIBUTION-AUDIT", "SEV-CONTRIBUTION-SCHEMA", "SEV-CONTRIBUTION-INTEGRITY", "SEV-CONTRIBUTION-ISOLATION", "SEV-CONTRIBUTION-RIGHTS", "SEV-CONTRIBUTION-CONCURRENCY", "SEV-CONTRIBUTION-E2E", "SEV-CONTRIBUTION-ACTIONS", "SEV-CONTRIBUTION-PROTOCOL"]) {
      expect(currentSecurityInventory.evidenceIndex.some((item) => item.evidenceId === evidenceRef)).toBe(true);
      const attacked = copyInventory();
      attacked.evidenceIndex = attacked.evidenceIndex.filter((item) => item.evidenceId !== evidenceRef);
      const decision = evaluateSecurityCurrentStateInventory(attacked, masterTrustControlCatalogue);
      expect(decision.structurallyValid).toBe(false);
      expect(decision.blockers.some((item) => item.subjectRef === evidenceRef)).toBe(true);
    }
  });

  it("requires exact human publication and inherited rights evidence at wave-eleven closeout", () => {
    for (const evidenceRef of ["SEV-VAULT-WORKER-AUTHORITY", "SEV-VAULT-LEGACY-GRANTS", "SEV-VAULT-LEGACY-NEGATIVE", "SEV-VAULT-SCHEMA", "SEV-VAULT-EXPORT", "SEV-VAULT-LEGACY", "SEV-VAULT-RECEIPTS", "SEV-VAULT-HUMAN", "SEV-VAULT-ISOLATION", "SEV-VAULT-DERIVED", "SEV-VAULT-CONCURRENCY", "SEV-VAULT-E2E", "SEV-VAULT-ACTIONS", "SEV-VAULT-PROTOCOL"]) {
      expect(currentSecurityInventory.evidenceIndex.some((item) => item.evidenceId === evidenceRef)).toBe(true);
      const attacked = copyInventory();
      attacked.evidenceIndex = attacked.evidenceIndex.filter((item) => item.evidenceId !== evidenceRef);
      const decision = evaluateSecurityCurrentStateInventory(attacked, masterTrustControlCatalogue);
      expect(decision.structurallyValid).toBe(false);
      expect(decision.blockers.some((item) => item.subjectRef === evidenceRef)).toBe(true);
    }
  });

  it("requires procedure compiler and candidate boundaries at wave-twelve closeout", () => {
    for (const evidenceRef of ["SEV-PROCEDURE-COMPONENTS", "SEV-PROCEDURE-COMPILER", "SEV-PROCEDURE-NEGATIVES", "SEV-PROCEDURE-BUILD", "SEV-PROCEDURE-PROJECTION", "SEV-PROCEDURE-PROJECTION-TEST", "SEV-PROCEDURE-WORKER", "SEV-PROCEDURE-WORKER-TEST", "SEV-PROCEDURE-AUTHORING", "SEV-PROCEDURE-CANDIDATE"]) {
      expect(currentSecurityInventory.evidenceIndex.some((item) => item.evidenceId === evidenceRef)).toBe(true);
      const attacked = copyInventory();
      attacked.evidenceIndex = attacked.evidenceIndex.filter((item) => item.evidenceId !== evidenceRef);
      const decision = evaluateSecurityCurrentStateInventory(attacked, masterTrustControlCatalogue);
      expect(decision.structurallyValid).toBe(false);
      expect(decision.blockers.some((item) => item.subjectRef === evidenceRef)).toBe(true);
    }
  });

  it("requires method publication and execution boundaries at wave-thirteen closeout", () => {
    for (const evidenceRef of ["SEV-METHOD-COMPOSITION", "SEV-METHOD-COMPOSITION-TEST", "SEV-METHOD-SCHEMA", "SEV-METHOD-PUBLICATION-TEST", "SEV-METHOD-RIGHTS-TEST", "SEV-METHOD-PIN-TEST", "SEV-METHOD-CONCURRENCY", "SEV-METHOD-UI", "SEV-METHOD-UI-E2E", "SEV-METHOD-WORKER", "SEV-METHOD-WORKER-TEST", "SEV-METHOD-CALLBACK", "SEV-METHOD-LEGACY-TEST"]) {
      expect(currentSecurityInventory.evidenceIndex.some((item) => item.evidenceId === evidenceRef)).toBe(true);
      const attacked = copyInventory();
      attacked.evidenceIndex = attacked.evidenceIndex.filter((item) => item.evidenceId !== evidenceRef);
      const decision = evaluateSecurityCurrentStateInventory(attacked, masterTrustControlCatalogue);
      expect(decision.structurallyValid).toBe(false);
      expect(decision.blockers.some((item) => item.subjectRef === evidenceRef)).toBe(true);
    }
  });

  it("requires platform corpus publication boundaries at wave-fourteen closeout", () => {
    for (const evidenceRef of ["SEV-PLATFORM-METHOD-REPLAY", "SEV-PLATFORM-METHOD-IDENTITY", "SEV-PLATFORM-METHOD-INGRESS", "SEV-PLATFORM-METHOD-PREPARE", "SEV-PLATFORM-METHOD-PREPARE-TEST", "SEV-PLATFORM-METHOD-CLI", "SEV-PLATFORM-METHOD-SQL", "SEV-PLATFORM-METHOD-CONCURRENCY"]) {
      expect(currentSecurityInventory.evidenceIndex.some((item) => item.evidenceId === evidenceRef)).toBe(true);
      const attacked = copyInventory();
      attacked.evidenceIndex = attacked.evidenceIndex.filter((item) => item.evidenceId !== evidenceRef);
      const decision = evaluateSecurityCurrentStateInventory(attacked, masterTrustControlCatalogue);
      expect(decision.structurallyValid).toBe(false);
      expect(decision.blockers.some((item) => item.subjectRef === evidenceRef)).toBe(true);
    }
  });

  it("rejects the previous wave identity even when it accompanies the current snapshot", () => {
    const archived = copyInventory();
    archived.baseline.waveId = "wave-13";
    archived.baseline.waveStatus = "closed";
    const decision = evaluateSecurityCurrentStateInventory(archived, masterTrustControlCatalogue);
    expect(decision.currentStateTruthVerified).toBe(false);
    expect(decision.blockers).toContainEqual({code: "baseline_wave_closed", subjectRef: "wave-13"});
    expect(decision.blockers).toContainEqual({code: "baseline_wave_unknown", subjectRef: "wave-13"});
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
        const artifact = JSON.parse(content.toString("utf8")) as {collector?: unknown; capturedAt?: unknown; validThrough?: unknown; origin?: unknown};
        expect(artifact.collector).toEqual(evidence.collector);
        expect(artifact.capturedAt).toBe(evidence.capturedAt);
        expect(artifact.validThrough).toBe(evidence.validThrough);
        expect(artifact.origin).toMatchObject({repository: "carlosevg100/offroad", environmentRef: "ENV-PRODUCTION"});
      }
    }

    const decision = await evaluateSecurityCurrentStateInventoryTrusted(currentSecurityInventory, masterTrustControlCatalogue);
    expect(decision.structurallyValid, JSON.stringify(decision.blockers)).toBe(true);
    expect(decision.evidenceVerification).toBe("repository_and_local_bytes");
    expect(decision.currentStateTruthVerified).toBe(true);
    expect(decision.repositoryResolution).toMatchObject({
      declaredRepository: "carlosevg100/offroad",
      trustedRemote: "github.com/carlosevg100/offroad",
      resolvedCommit: currentSecurityInventory.baseline.commit,
      commitContainedInMain: true,
    });
    expect(decision.evidenceResolutions).toHaveLength(currentSecurityInventory.evidenceIndex.length);
    expect(decision.claimAssessments).toHaveLength(8);
    expect(decision.claimAssessments.every((claim) => claim.status === "blocked_by_open_gaps")).toBe(true);
    const generatedPath = fileURLToPath(new URL("../../../docs/security/CURRENT_STATE_INVENTORY.md", import.meta.url));
    const rendered = renderSecurityCurrentStateInventory(currentSecurityInventory, decision);
    expect(readFileSync(generatedPath, "utf8")).toBe(rendered);
    expect(rendered).toContain("SOC 2: plano de remediação. Status: concluído com evidência referenciada.");
    expect(rendered).toContain("ISO/IEC 27001: avaliação de lacunas. Status: planejado.");
  // This resolves every immutable Git object and local receipt under concurrent workspace tests.
  }, 30_000);

  it("makes the evaluation OIDC, secret retrieval and provider boundaries explicit", () => {
    const identity = currentSecurityInventory.identities.find((item) => item.identityId === "ID-GITHUB-EVALS-OIDC");
    expect(identity).toMatchObject({systemRef: "SYS-GITHUB", privilege: "workload_scoped"});
    const expectedFlows = ["FLOW-GITHUB-EVAL-SECRETS", "FLOW-GITHUB-EVAL-ANTHROPIC", "FLOW-GITHUB-EVAL-OPENAI", "FLOW-GITHUB-EVAL-PERPLEXITY"];
    expect(currentSecurityInventory.dataFlows.filter((item) => expectedFlows.includes(item.flowId)).map((item) => item.flowId).sort()).toEqual(expectedFlows.sort());
    for (const flowId of expectedFlows) {
      const flow = currentSecurityInventory.dataFlows.find((item) => item.flowId === flowId)!;
      expect(flow.environmentRefs).toContain("ENV-CI");
      expect(flow.gapRefs).toContain("SG-PROVIDER-ASSURANCE");
    }
    expect(currentSecurityInventory.dataFlows.find((item) => item.flowId === "FLOW-GITHUB-EVAL-SECRETS")!.gapRefs).toContain("SG-PRIVILEGED-ACCESS");
  });

  it("binds a resolved-evidence receipt to the exact governed milestone relationship", async () => {
    const trusted = await evaluateSecurityCurrentStateInventoryTrusted(currentSecurityInventory, masterTrustControlCatalogue);
    const binding = getSecurityAssuranceMilestoneEvidenceBinding("ASSURANCE-MILESTONE-REMEDIATION-PLAN");
    expect(binding).not.toBeNull();
    const receipt = issueTrustedSecurityEvidenceResolutionReceipt(currentSecurityInventory, trusted, binding!);
    expect(receipt).toMatchObject({
      milestoneId: "ASSURANCE-MILESTONE-REMEDIATION-PLAN",
      framework: "soc2",
      kind: "remediation_plan",
      evidenceRef: "SEV-SECURITY-PLAN",
    });

    const isoMilestone = currentSecurityAssuranceMilestones.find((milestone) =>
      milestone.milestoneId === "ASSURANCE-MILESTONE-ISO-GAP")!;
    const arbitraryCompletedIso = securityAssuranceMilestoneSchema.parse({
      ...isoMilestone,
      status: "completed",
      evidenceRef: "SEV-SECURITY-PLAN",
    });
    expect(() => renderSecurityAssuranceMilestone(arbitraryCompletedIso, "pt-BR", receipt)).toThrow(/governed catalogue record/);

    const inventedAgentsScopeRelation = {
      ...binding!,
      evidenceRef: "SEV-AGENTS-SCOPE",
    } as SecurityAssuranceMilestoneEvidenceBinding;
    expect(() => issueTrustedSecurityEvidenceResolutionReceipt(
      currentSecurityInventory,
      trusted,
      inventedAgentsScopeRelation,
    )).toThrow(/governed catalogue binding/);
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
    expect(currentSecurityInventory.identities.find((item) => item.identityId === "ID-CODEX-CI")).toMatchObject({privilege: "privileged"});
    const gap = currentSecurityInventory.gaps.find((item) => item.gapId === "SG-CODEX-CI-AGENT-BOUNDARY")!;
    for (const phrase of ["prompt-injection", "network egress", "commands/tools", "logs/artifacts"]) expect(gap.nextAction).toContain(phrase);
    const sourceFlow = currentSecurityInventory.dataFlows.find((item) => item.flowId === "FLOW-CODEX-SOURCE");
    expect(sourceFlow).toMatchObject({sourceRef: "SYS-CODEX-CI", destinationRef: "STORE-SOURCE"});
    expect(sourceFlow?.dataClassIds).toContain("credential_secret");
    expect(currentSecurityInventory.dataFlows.find((item) => item.flowId === "FLOW-CODEX-OPENAI")?.dataClassIds).toContain("credential_secret");
  });

  it("fails closed if canonical claims or 17 of 18 required gaps are removed and references are reused", () => {
    const inventory = copyInventory();
    const retainedGap = inventory.gaps.find((gap) => gap.gapId === "SG-ENV-DATA-MAPPING")!;
    const allEntityIds = [
      ...inventory.environments.map((item) => item.environmentId),
      ...inventory.dataClasses.map((item) => item.dataClassId),
      ...inventory.systems.map((item) => item.systemId),
      ...inventory.dataStores.map((item) => item.storeId),
      ...inventory.dataFlows.map((item) => item.flowId),
      ...inventory.identities.map((item) => item.identityId),
      ...inventory.vendors.map((item) => item.vendorId),
    ];
    retainedGap.targetRefs = allEntityIds;
    inventory.gaps = [retainedGap];
    for (const entity of [
      ...inventory.environments,
      ...inventory.dataClasses,
      ...inventory.systems,
      ...inventory.dataStores,
      ...inventory.dataFlows,
      ...inventory.identities,
      ...inventory.vendors,
    ]) entity.gapRefs = [retainedGap.gapId];
    inventory.coverageClaims = inventory.coverageClaims.slice(0, 1);
    inventory.coverageClaims[0]!.requiredGaps = [{gapRef: retainedGap.gapId, severity: retainedGap.severity, requiredStatus: "open"}];
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.currentStateTruthVerified).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "canonical_coverage_catalogue_mismatch", subjectRef: null},
      {code: "canonical_claim_missing", subjectRef: "SCL-AI-PROVIDER-BOUNDARY"},
      {code: "canonical_gap_missing", subjectRef: "SG-OWNER-ASSIGNMENT"},
    ]));
    expect(decision.claimAssessments.some((claim) => claim.status === "coverage_contract_invalid")).toBe(true);
  });

  it("ignores caller-authored status and fails closed if a canonical gap is reclassified", () => {
    const inventory = copyInventory();
    const gap = inventory.gaps.find((item) => item.gapId === "SG-CODEX-CI-AGENT-BOUNDARY")!;
    (gap as typeof gap & {status: string}).status = "resolved";
    gap.severity = "low";
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "canonical_gap_severity_mismatch", subjectRef: gap.gapId},
      {code: "canonical_gap_relationship_mismatch", subjectRef: gap.gapId},
    ]));
    expect(decision.gapAssessments.find((item) => item.gapId === gap.gapId)?.status).toBe("coverage_contract_invalid");
  });

  it("derives entity status and strips caller-authored status before rendering", async () => {
    expect(currentSecurityInventory.systems.every((item) => !("status" in item))).toBe(true);
    expect(currentSecurityInventory.gaps.every((item) => !("status" in item))).toBe(true);
    const baseline = await evaluateSecurityCurrentStateInventoryTrusted(currentSecurityInventory, masterTrustControlCatalogue);
    expect(baseline.entityAssessments.find((item) => item.entityId === "SYS-CODEX-CI")?.status).toBe("partial");
    expect(baseline.gapAssessments.find((item) => item.gapId === "SG-CODEX-CI-AGENT-BOUNDARY")?.status).toBe("open");

    const inventory = copyInventory();
    (inventory.systems[0] as typeof inventory.systems[number] & {status: string}).status = "verified";
    const attacked = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    const clean = evaluateSecurityCurrentStateInventory(currentSecurityInventory, masterTrustControlCatalogue);
    expect(attacked.entityAssessments).toEqual(clean.entityAssessments);
    expect(attacked.inventoryFingerprint).toBe(clean.inventoryFingerprint);
    expect(() => renderSecurityCurrentStateInventory(inventory, attacked)).toThrow(/unchanged trusted decision/);
    expect(renderSecurityCurrentStateInventory(currentSecurityInventory, baseline)).toContain("## Resultado do validador");
  });

  it("rejects coordinated entity and gap relationship edits from both sides", () => {
    const inventory = copyInventory();
    const entity = inventory.systems.find((item) => item.systemId === "SYS-CODEX-CI")!;
    const gap = inventory.gaps.find((item) => item.gapId === "SG-CODEX-CI-AGENT-BOUNDARY")!;
    entity.gapRefs = [];
    gap.targetRefs = gap.targetRefs.filter((targetRef) => targetRef !== entity.systemId);
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "canonical_entity_relationship_mismatch", subjectRef: entity.systemId},
      {code: "canonical_gap_relationship_mismatch", subjectRef: gap.gapId},
    ]));
    expect(decision.entityAssessments.find((item) => item.entityId === entity.systemId)?.status).toBe("coverage_contract_invalid");
  });

  it("rejects caller edits to canonical entity evidence and control relationships", () => {
    const inventory = copyInventory();
    const entity = inventory.systems.find((item) => item.systemId === "SYS-CODEX-CI")!;
    entity.evidenceRefs = ["SEV-AGENTS-SCOPE"];
    entity.controlIds = ["TRUST-AI-01"];
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toContainEqual({code: "canonical_entity_relationship_mismatch", subjectRef: entity.systemId});
  });

  it.each([
    ["vendor assurance states", (inventory: SecurityCurrentStateInventory) => {
      const vendor = inventory.vendors.find((item) => item.vendorId === "VEN-ANTHROPIC")!;
      vendor.activationState = "live_verified";
      vendor.contractState = "verified_current";
      vendor.retentionState = "verified_current";
      vendor.trainingUseState = "prohibited_verified";
      vendor.regionState = "verified_current";
    }],
    ["data-flow topology and classification", (inventory: SecurityCurrentStateInventory) => {
      const flow = inventory.dataFlows.find((item) => item.flowId === "FLOW-WORKER-ANTHROPIC")!;
      flow.destinationRef = "STORE-POSTGRES";
      flow.direction = "internal";
      flow.dataClassIds = ["public"];
      flow.authorizationBoundary = "No external transfer.";
    }],
    ["store recovery and tenancy assurance", (inventory: SecurityCurrentStateInventory) => {
      const store = inventory.dataStores.find((item) => item.storeId === "STORE-POSTGRES")!;
      store.backupState = "tested";
      store.retentionState = "defined";
      store.tenancyBoundary = "Fully verified tenant isolation.";
    }],
    ["identity authority and named ownership", (inventory: SecurityCurrentStateInventory) => {
      const identity = inventory.identities.find((item) => item.identityId === "ID-PRIVILEGED-HUMANS")!;
      identity.privilege = "public";
      identity.lifecycleState = "defined";
      identity.authentication = "Phishing-resistant MFA verified.";
      identity.owner = {ownerRole: "Named CISO", backupOwnerRole: "Named deputy", assignment: "named"};
    }],
    ["gap narrative and ownership", (inventory: SecurityCurrentStateInventory) => {
      const gap = inventory.gaps.find((item) => item.gapId === "SG-CODEX-CI-AGENT-BOUNDARY")!;
      gap.title = "All agent security controls operating";
      gap.nextAction = "No further action required.";
      gap.owner = {ownerRole: "Certified security team", backupOwnerRole: "External auditor", assignment: "named"};
    }],
    ["evidence assurance narrative", (inventory: SecurityCurrentStateInventory) => {
      inventory.evidenceIndex.find((item) => item.evidenceId === "SEV-RLS-TEST")!.description =
        "SOC 2 Type II certified; pentest passed; continuous production tenant isolation verified.";
    }],
    ["baseline freshness horizon", (inventory: SecurityCurrentStateInventory) => {
      inventory.generatedAt = "2098-01-01T00:00:00.000Z";
      inventory.baseline.evidenceCutoff = "2098-01-01T00:00:00.000Z";
      inventory.baseline.reviewDueAt = "2099-01-01T00:00:00.000Z";
    }],
  ] satisfies Array<[string, (inventory: SecurityCurrentStateInventory) => void]>) (
    "rejects caller-authored %s from the complete canonical snapshot",
    async (_label, mutate) => {
      const inventory = copyInventory();
      mutate(inventory);
      const decision = await evaluateSecurityCurrentStateInventoryTrusted(inventory, masterTrustControlCatalogue);
      expect(decision.structurallyValid).toBe(false);
      expect(decision.currentStateTruthVerified).toBe(false);
      expect(decision.blockers).toContainEqual({
        code: "canonical_inventory_snapshot_mismatch",
        subjectRef: inventory.inventoryVersion,
      });
    },
  );

  it.each([
    "SOC 2 is certified",
    "SOC 2—certified",
    "Pentest: passed",
    "Production is verified",
    "SOC 2 is certi\u200bfied",
  ])("fails closed before rendering invalid payload narrative: %s", async (claim) => {
    const trusted = await evaluateSecurityCurrentStateInventoryTrusted(currentSecurityInventory, masterTrustControlCatalogue);
    const inventory = copyInventory();
    inventory.limitations = [claim];
    const invalid = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);

    expect(invalid.currentStateTruthVerified).toBe(false);
    expect(() => renderSecurityCurrentStateInventory(inventory, invalid)).toThrow(/unchanged trusted decision/);
    expect(() => renderSecurityCurrentStateInventory(inventory, trusted)).toThrow(/unchanged trusted decision/);
  }, 30_000);

  it.each([
    "SOC 2 is certified",
    "SOC 2 is not certified",
    "ISO 27001 gap assessment is complete",
    "Pentest remediation plan completed",
    "A SOC 2 será certificada no próximo trimestre",
    "SOC 2 has not been certified — Production has been independently audited",
  ])("treats arbitrary assurance prose as noncanonical regardless of apparent polarity: %s", (claim) => {
    expect(findForbiddenAssuranceClaims(claim)).toEqual(expect.arrayContaining([
      expect.objectContaining({code: "noncanonical_assurance_language"}),
    ]));
  });

  it("rejects a reconstructed decision and freezes the trusted render snapshot against late getters", async () => {
    const trusted = await evaluateSecurityCurrentStateInventoryTrusted(currentSecurityInventory, masterTrustControlCatalogue);
    const reconstructed = structuredClone(trusted);
    expect(() => renderSecurityCurrentStateInventory(currentSecurityInventory, reconstructed)).toThrow(/unchanged trusted decision/);

    expect(Object.isFrozen(trusted)).toBe(true);
    expect(Object.isFrozen(trusted.counts)).toBe(true);
    const trustedCounts = trusted.counts;
    let countsRead = 0;
    let assuranceRead = 0;
    expect(() => Object.defineProperty(trusted, "counts", {
      configurable: true,
      enumerable: true,
      get: () => {
        countsRead += 1;
        return countsRead === 1 ? trustedCounts : {...trustedCounts, openGaps: 0};
      },
    })).toThrow();
    expect(() => Object.defineProperty(trusted, "assuranceReady", {
      configurable: true,
      enumerable: true,
      get: () => {
        assuranceRead += 1;
        return assuranceRead > 1;
      },
    })).toThrow();

    const rendered = renderSecurityCurrentStateInventory(currentSecurityInventory, trusted);
    expect(rendered).toContain("| Lacunas abertas | 18 |");
    expect(rendered).toContain("| Assurance ready | não |");
    expect(countsRead).toBe(0);
    expect(assuranceRead).toBe(0);
  }, 30_000);

  it("derives the evidence cutoff and refuses an invented review deadline", () => {
    const inventory = copyInventory();
    inventory.baseline.evidenceCutoff = "2026-09-07T09:42:59.000-03:00";
    inventory.baseline.reviewDueAt = "2026-09-15T09:43:00.000-03:00";
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "evidence_cutoff_not_derived_from_manifest", subjectRef: inventory.baseline.commit},
      {code: "canonical_review_due_at_mismatch", subjectRef: inventory.baseline.commit},
    ]));
  });

  it("rejects future snapshot dates against the evaluator's internal clock", () => {
    const inventory = copyInventory();
    inventory.generatedAt = "2098-01-01T00:00:00.000Z";
    inventory.baseline.evidenceCutoff = "2098-01-01T00:00:00.000Z";
    inventory.baseline.reviewDueAt = "2098-01-08T00:00:00.000Z";
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "snapshot_generated_in_future", subjectRef: inventory.inventoryVersion},
      {code: "evidence_cutoff_in_future", subjectRef: inventory.baseline.commit},
    ]));
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
      {code: "operator_observation_requires_bounded_freshness", subjectRef: "SEV-AWS-DEPLOY-ROLE-SNAPSHOT"},
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
    ["aws_sts_session_token", "IQoJb3JpZ2luX2" + "0123456789abcdefghijklmnopqrstuvwxyz+/="],
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

  it("still rejects an elapsed explicit review deadline using the internal clock", () => {
    const inventory = copyInventory();
    inventory.baseline.reviewDueAt = "2020-09-15T09:20:00.000-03:00";
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toContainEqual({code: "baseline_review_overdue", subjectRef: inventory.baseline.commit});
  });

  it.each([
    ["closed wave", (inventory: SecurityCurrentStateInventory) => { inventory.baseline.waveStatus = "closed"; }, "baseline_wave_closed"],
    ["unknown wave", (inventory: SecurityCurrentStateInventory) => { inventory.baseline.waveId = "wave-not-authorized"; }, "baseline_wave_unknown"],
    ["material change pending review", (inventory: SecurityCurrentStateInventory) => { inventory.baseline.materialChangeState = "review_required"; }, "baseline_material_change_requires_review"],
  ] as const)("blocks %s without relying on a calendar deadline", (_label, mutate, code) => {
    const inventory = copyInventory();
    mutate(inventory);
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.structurallyValid).toBe(false);
    expect(decision.blockers).toContainEqual({code, subjectRef: inventory.baseline.waveId});
  });

  it("refuses fabricated renewal of both baseline and observation into a future wave", async () => {
    const inventory = copyInventory();
    inventory.baseline.waveId = "wave-unapproved";
    inventory.baseline.waveStatus = "open";
    inventory.baseline.materialChangeState = "reviewed";
    const observation = inventory.evidenceIndex.find((item) => item.evidenceId === "SEV-AWS-DEPLOY-ROLE-SNAPSHOT")!;
    observation.waveId = "wave-unapproved";
    const decision = await evaluateSecurityCurrentStateInventoryTrusted(inventory, masterTrustControlCatalogue);
    expect(decision.currentStateTruthVerified).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "baseline_wave_unknown", subjectRef: "wave-unapproved"},
      {code: "canonical_inventory_snapshot_mismatch", subjectRef: inventory.inventoryVersion},
      {code: "evidence_wave_mismatch", subjectRef: observation.evidenceId},
      {code: "external_evidence_declaration_not_allowlisted", subjectRef: observation.evidenceId},
    ]));
  });

  it("refuses borrowing a wave binding to remove a contract or snapshot expiry", () => {
    for (const kind of ["contract_record", "external_snapshot"] as const) {
      const inventory = copyInventory();
      const observation = inventory.evidenceIndex.find((item) => item.evidenceId === "SEV-AWS-DEPLOY-ROLE-SNAPSHOT")!;
      observation.kind = kind;
      const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
      expect(decision.blockers).toEqual(expect.arrayContaining([
        {code: "external_evidence_must_be_time_bound", subjectRef: observation.evidenceId},
        {code: "wave_bound_evidence_requires_operator_observation", subjectRef: observation.evidenceId},
      ]));
    }
  });

  it("requires a real expiry for time-bound evidence and keeps expired evidence blocked", () => {
    const inventory = copyInventory();
    const observation = inventory.evidenceIndex.find((item) => item.evidenceId === "SEV-AWS-DEPLOY-ROLE-SNAPSHOT")!;
    observation.freshness = "time_bound";
    observation.waveId = null;
    observation.validThrough = null;
    expect(evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue).blockers)
      .toContainEqual({code: "time_bound_evidence_requires_expiry", subjectRef: observation.evidenceId});
    observation.validThrough = "2020-01-01T00:00:00.000Z";
    expect(evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue).blockers)
      .toContainEqual({code: "evidence_expired", subjectRef: observation.evidenceId});
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
      {code: "canonical_evidence_manifest_mismatch", subjectRef: "SEV-WEB-UPLOAD"},
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

  it.each([
    ["collector", (evidence: SecurityCurrentStateInventory["evidenceIndex"][number]) => { evidence.collector = {name: "invented", version: "9", principalClass: "self-declared"}; }],
    ["waveId", (evidence: SecurityCurrentStateInventory["evidenceIndex"][number]) => { evidence.waveId = "wave-unapproved"; }],
    ["freshness", (evidence: SecurityCurrentStateInventory["evidenceIndex"][number]) => { evidence.freshness = "time_bound"; }],
    ["capturedAt", (evidence: SecurityCurrentStateInventory["evidenceIndex"][number]) => { evidence.capturedAt = "2026-09-07T09:21:00.000-03:00"; }],
    ["validThrough", (evidence: SecurityCurrentStateInventory["evidenceIndex"][number]) => { evidence.validThrough = "2026-09-13T09:20:00.000-03:00"; }],
    ["authorityRef", (evidence: SecurityCurrentStateInventory["evidenceIndex"][number]) => { evidence.authorityRef = "AUTH-TRUSTED-GIT-BASELINE"; }],
  ])("rejects forged external evidence %s metadata even when referenced bytes still resolve", async (_field, forge) => {
    const inventory = copyInventory();
    forge(inventory.evidenceIndex.find((item) => item.evidenceId === "SEV-AWS-DEPLOY-ROLE-SNAPSHOT")!);
    const decision = await evaluateSecurityCurrentStateInventoryTrusted(inventory, masterTrustControlCatalogue);
    expect(decision.currentStateTruthVerified).toBe(false);
    expect(decision.blockers).toContainEqual({code: "external_evidence_declaration_not_allowlisted", subjectRef: "SEV-AWS-DEPLOY-ROLE-SNAPSHOT"});
  });

  it("rejects a forged repository label before trusted evaluation", async () => {
    const inventory = copyInventory();
    (inventory as unknown as {baseline: {repository: string}}).baseline.repository = "attacker/fork";
    await expect(evaluateSecurityCurrentStateInventoryTrusted(inventory, masterTrustControlCatalogue)).rejects.toThrow();
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
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "canonical_evidence_manifest_mismatch", subjectRef: "SEV-WEB-UPLOAD"},
      {code: "repository_evidence_content_mismatch", subjectRef: "SEV-WEB-UPLOAD"},
    ]));
  });

  it("rejects substitution of a canonical evidence reference even when the substituted bytes and hash are real", async () => {
    const inventory = copyInventory();
    const evidence = inventory.evidenceIndex.find((item) => item.evidenceId === "SEV-WEB-UPLOAD")!;
    const substitutedBytes = execFileSync("git", ["show", `${inventory.baseline.commit}:AGENTS.md`]);
    evidence.ref = "AGENTS.md";
    evidence.contentFingerprint = `sha256:${createHash("sha256").update(substitutedBytes).digest("hex")}`;
    const decision = await evaluateSecurityCurrentStateInventoryTrusted(inventory, masterTrustControlCatalogue);
    expect(decision.currentStateTruthVerified).toBe(false);
    expect(decision.blockers).toContainEqual({code: "canonical_evidence_manifest_mismatch", subjectRef: "SEV-WEB-UPLOAD"});
  });

  it("makes every evidence content fingerprint mandatory", () => {
    const inventory = copyInventory();
    (inventory.evidenceIndex[0] as unknown as {contentFingerprint: null}).contentFingerprint = null;
    expect(() => evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue)).toThrow();
  });
});
