import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {existsSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {
  currentSecurityInventory,
  evaluateSecurityCurrentStateInventory,
  evaluateSecurityCurrentStateInventoryTrusted,
  findForbiddenAssuranceClaims,
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
    expect(decision.counts).toMatchObject({environments: 6, systems: 8, dataStores: 8, dataFlows: 25, identities: 11, vendors: 17, openGaps: 18, coverageClaims: 8});
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
    expect(readFileSync(generatedPath, "utf8")).toBe(renderSecurityCurrentStateInventory(currentSecurityInventory, decision));
  });

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
  });

  it.each([
    ["SOC 2 is certified", "certification_claim"],
    ["SOC 2—certified", "certification_claim"],
    ["SOC 2 is now certified", "certification_claim"],
    ["SOC 2 has successfully been certified", "certification_claim"],
    ["SOC 2 has now been certified", "certification_claim"],
    ["ISO 27001 is fully compliant", "certification_claim"],
    ["ISO/IEC 27001 is certified", "certification_claim"],
    ["Pentest: passed", "pentest_claim"],
    ["Pentest has successfully passed", "pentest_claim"],
    ["Production is verified", "live_assurance_claim"],
    ["Production is independently verified", "live_assurance_claim"],
    ["Production controls have been independently validated", "live_assurance_claim"],
    ["Penetration testing has passed", "pentest_claim"],
    ["SOC 2 certification is complete", "certification_claim"],
    ["Production has been independently audited", "live_assurance_claim"],
    ["SOC 2 has not been certified, and ISO 27001 has been certified", "certification_claim"],
    ["We have not been certified under SOC 2, ISO 27001 has been certified", "certification_claim"],
    ["We have not been certified under SOC 2 / penetration testing has passed", "pentest_claim"],
    ["SOC 2 has not been certified — Production has been independently audited", "live_assurance_claim"],
    ["While SOC 2 still needs to be certified, penetration testing has passed", "pentest_claim"],
    ["Não fomos certificados pela SOC 2, a ISO 27001 foi certificada", "certification_claim"],
    ["Não fomos certificados pela SOC 2 / o teste de invasão foi aprovado", "pentest_claim"],
    ["Não fomos certificados pela SOC 2 — a produção foi auditada", "live_assurance_claim"],
    ["Enquanto a SOC 2 ainda precisa ser certificada, o teste de penetração foi aprovado", "pentest_claim"],
    ["SOC 2 is certi\u200bfied", "certification_claim"],
  ] as const)("normalizes and detects forbidden assurance language: %s", (claim, code) => {
    expect(findForbiddenAssuranceClaims(claim)).toEqual(expect.arrayContaining([
      expect.objectContaining({code}),
    ]));
  });

  it.each([
    "SOC 2 is not certified",
    "We have not been certified under SOC 2",
    "We have never been certified under SOC 2",
    "SOC 2 has yet to be certified",
    "SOC 2 still needs to be certified",
    "ISO 27001 is not compliant",
    "Pentest has not passed",
    "Production is not verified",
    "Telemetry activation is not live-verified",
    "SOC 2 não é certificado",
    "SOC 2 ainda precisa ser certificado",
    "Não fomos certificados pela SOC 2",
    "ISO 27001 não está em conformidade",
    "Não estamos em conformidade com ISO 27001",
    "Pentest não foi aprovado",
    "Produção não está verificada",
  ])("permits an explicit negative assurance statement: %s", (claim) => {
    expect(findForbiddenAssuranceClaims(claim)).toEqual([]);
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
  });

  it("derives the evidence cutoff and enforces the bounded review window", () => {
    const inventory = copyInventory();
    inventory.baseline.evidenceCutoff = "2026-09-07T09:42:59.000-03:00";
    inventory.baseline.reviewDueAt = "2026-09-15T09:43:00.000-03:00";
    const decision = evaluateSecurityCurrentStateInventory(inventory, masterTrustControlCatalogue);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      {code: "evidence_cutoff_not_derived_from_manifest", subjectRef: inventory.baseline.commit},
      {code: "baseline_review_window_exceeds_policy", subjectRef: inventory.inventoryVersion},
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
