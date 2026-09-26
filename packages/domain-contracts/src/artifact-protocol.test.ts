import {describe, expect, it} from "vitest";
import type {z} from "zod";

import {
  artifactBlockSchema,
  artifactClaimSchema,
  artifactManifestSchema,
  artifactManifestSchemaVersion,
  artifactRevisionDraftSchema,
  artifactRevisionSchema,
  artifactSchema,
  audienceWithinRestriction,
  compareRevisions,
  derivedSourceRequirements,
  describeRevisionChange,
  freezeArtifactValue,
  freshness,
  legacyProjection,
  linksFromManifest,
  manifestLegacySchema,
  manifestFromCapitalProcedurePacket,
  manifestFromDecisionArtifactContract,
  manifestFromDocumentWorkProduct,
  manifestFromInstitutionalWorkbookArtifact,
  manifestFromRenderedMaterialManifest,
  mostRestrictive,
  releaseState,
  resolveRevision,
  revisionSnapshotIssues,
  revisionSubstance,
  type ArtifactBlock,
  type ArtifactDependencyLink,
  type ArtifactRevision,
  type LegacyRow,
  type LineageHeads,
} from "./artifact-protocol";
import {documentWorkProductSchema} from "./document-work-product";

const hex = (seed: string) => seed.repeat(64).slice(0, 64);
const id = (n: number) => `a1b2c3d4-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-09-26T12:00:00.000Z";
const provenance = {producer: "document-worker:conversation", jobId: id(1), taskRunId: null, messageId: id(2), capability: "artifact-revision.v1"};

type ManifestInput = z.input<typeof artifactManifestSchema>;
type RevisionInput = z.input<typeof artifactRevisionSchema>;
type BlockInput = z.input<typeof artifactBlockSchema>;
type ClaimInput = z.input<typeof artifactClaimSchema>;
type LegacyInput = z.input<typeof manifestLegacySchema>;

function manifest(overrides: Partial<ManifestInput> = {}): ManifestInput {
  return {
    schemaVersion: artifactManifestSchemaVersion, kind: "answer", audience: "internal", format: "text", bytes: null, method: null,
    execution: null, inputSnapshot: null, institutionalResult: null, sources: [], claims: [], traces: [], template: null, provenance, legacy: null,
    ...overrides,
  };
}

function revision(overrides: Partial<RevisionInput> = {}, manifestOverrides: Partial<ManifestInput> = {}): ArtifactRevision {
  const audience = overrides.audience ?? "internal";
  return freezeArtifactValue(artifactRevisionSchema.parse({
    id: id(10), artifactId: id(3), revisionNo: 1, previousRevisionId: null, manifestFingerprint: hex("1"), audience, origin: "worker",
    manifest: manifest({audience, ...manifestOverrides}), contentSha256: null, byteLength: null, createdAt: at, legacyRef: null,
    ...overrides,
  }));
}

function block(overrides: Partial<BlockInput> = {}): ArtifactBlock {
  return freezeArtifactValue(artifactBlockSchema.parse({
    id: id(20), revisionId: id(10), blockNo: 1, blockKey: "answer.body", kind: "paragraph",
    content: {text: "A estrutura atual comporta o alongamento pedido."}, claims: [], contentFingerprint: hex("2"), ...overrides,
  }));
}

const claim: ClaimInput = {claimId: "claim-gross-debt", kind: "calculation", value: "5670186", unit: "BRL_thousand", period: "2026-05-31", supportIds: ["obs-1"]};
const sourceA = {sourceVersionId: id(31), rightsVersionId: id(41)};
const sourceB = {sourceVersionId: id(32), rightsVersionId: id(42)};
const link = (source: {sourceVersionId: string; rightsVersionId: string | null}): ArtifactDependencyLink => ({
  revisionId: id(10), blockId: null, kind: "source_version", sourceVersionId: source.sourceVersionId, rightsVersionId: source.rightsVersionId,
});
const executionRef = {executionId: id(50), resultFingerprint: hex("5"), inputFingerprint: hex("6")};
const institutionalRef = {id: id(60), configurationFingerprint: hex("7")};

describe("artifact manifest v1", () => {
  it("strict manifest rejects unknown keys", () => {
    expect(artifactManifestSchema.safeParse(manifest()).success).toBe(true);
    expect(artifactManifestSchema.safeParse({...manifest(), extra: true}).success).toBe(false);
    expect(artifactManifestSchema.safeParse(manifest({provenance: {...provenance, actor: "x"} as never})).success).toBe(false);
    expect(artifactManifestSchema.safeParse(manifest({format: "xlsx", bytes: {sha256: hex("3"), byteLength: 10, storage: {bucket: "case-artifacts", path: "a/b", etag: "e"}} as never})).success).toBe(false);
    const {template: _absent, ...missingKey} = manifest();
    expect(artifactManifestSchema.safeParse(missingKey).success).toBe(false);
  });

  it("keeps every optional part explicit and refuses shapes that lie about their kind", () => {
    expect(artifactManifestSchema.safeParse(manifest({kind: "execution_result"})).success).toBe(false);
    expect(artifactManifestSchema.safeParse(manifest({kind: "execution_result", execution: executionRef})).success).toBe(true);
    expect(artifactManifestSchema.safeParse(manifest({kind: "model_result"})).success).toBe(false);
    expect(artifactManifestSchema.safeParse(manifest({format: null, bytes: {sha256: hex("3"), byteLength: 10, storage: {bucket: "b", path: "p"}}})).success).toBe(false);
    expect(artifactManifestSchema.safeParse(manifest({format: "xlsx", bytes: {sha256: hex("3"), byteLength: 10, rendered: {renderer: "r", rendererVersion: "1", deterministicInputs: {}}}})).success).toBe(false);
    const legacy: LegacyInput = {table: "capital_project_artifacts", id: id(70), fingerprint: hex("8"), evidence: [{key: "status", value: "draft"}]};
    expect(artifactManifestSchema.safeParse(manifest({legacy, method: {procedureId: "p", platformReleaseId: "r", houseReleaseId: null, version: "1"}})).success).toBe(false);
    expect(artifactManifestSchema.safeParse(manifest({legacy})).success).toBe(true);
    expect(artifactManifestSchema.safeParse(manifest({sources: [sourceA, sourceA]})).success).toBe(false);
  });

  it("binds a revision to its manifest audience, bytes and legacy label", () => {
    expect(() => revision({audience: "advisor"}, {audience: "internal"})).toThrow(/audience_mismatch/);
    expect(() => revision({contentSha256: hex("3")})).toThrow(/bytes_mismatch/);
    expect(() => revision({origin: "legacy"})).toThrow(/legacy_origin_without_ref/);
    expect(() => revision({revisionNo: 2})).toThrow(/previous_revision_mismatch/);
    const legacy: LegacyInput = {table: "case_artifact_manifests", id: id(70), fingerprint: hex("8"), evidence: []};
    expect(() => revision({legacyRef: legacy})).toThrow(/legacy_ref_mismatch/);
    expect(revision({origin: "legacy", legacyRef: legacy}, {legacy}).legacyRef?.fingerprint).toBe(hex("8"));
  });
});

describe("derivation and restriction", () => {
  it("derived from A and B requires both", () => {
    const own = derivedSourceRequirements([link(sourceA), link(sourceB), link(sourceA)]);
    expect(own.requirements).toEqual([sourceA, sourceB]);
    expect(own.unresolvedRevisionIds).toEqual([]);

    const derived: ArtifactDependencyLink[] = [
      {revisionId: id(12), blockId: null, kind: "artifact_revision", derivedFromRevisionId: id(10)},
      {revisionId: id(12), blockId: null, kind: "artifact_revision", derivedFromRevisionId: id(11)},
    ];
    const ancestry = new Map<string, ArtifactDependencyLink[]>([[id(10), [link(sourceA)]], [id(11), [link(sourceB)]]]);
    expect(derivedSourceRequirements(derived, (revisionId) => ancestry.get(revisionId)).requirements).toEqual([sourceA, sourceB]);

    const incomplete = derivedSourceRequirements(derived, (revisionId) => (revisionId === id(10) ? [link(sourceA)] : undefined));
    expect(incomplete.requirements).toEqual([sourceA]);
    expect(incomplete.unresolvedRevisionIds).toEqual([id(11)]);
  });

  it("the most restrictive outcome prevails and an empty set is never widened", () => {
    expect(mostRestrictive(["external", "internal", "advisor"])).toBe("internal");
    expect(mostRestrictive(["advisor", "denied", "external"])).toBe("denied");
    expect(mostRestrictive(["external"])).toBe("external");
    expect(() => mostRestrictive([])).toThrow("artifact_restriction_set_empty");
    expect(audienceWithinRestriction("external", "advisor")).toBe(false);
    expect(audienceWithinRestriction("advisor", "advisor")).toBe(true);
    expect(audienceWithinRestriction("internal", "denied")).toBe(false);
  });

  it("removing a citation from text keeps the link", () => {
    const head = revision({}, {sources: [sourceA]});
    const cited = block({content: {text: "Conforme a nota 15 do ITR [fonte A], a divida bruta subiu."}, claims: [claim], contentFingerprint: hex("2")});
    const uncited = block({content: {text: "Conforme a nota 15 do ITR, a divida bruta subiu."}, claims: [claim], contentFingerprint: hex("3")});
    const links = linksFromManifest(head.id, head.manifest);
    expect(links).toEqual([{revisionId: head.id, blockId: null, kind: "source_version", ...sourceA}]);
    expect(derivedSourceRequirements(links)).toEqual(derivedSourceRequirements(linksFromManifest(head.id, head.manifest)));
    expect(compareRevisions({revision: head, blocks: [cited]}, {revision: head, blocks: [uncited]})).toBe("cosmetic");
  });
});

describe("immutability", () => {
  it("source change does not alter the old revision", () => {
    const first = revision({}, {sources: [sourceA]});
    const before = JSON.parse(JSON.stringify(first));
    const second = revision({id: id(11), revisionNo: 2, previousRevisionId: first.id, manifestFingerprint: hex("4")}, {sources: [sourceA, sourceB]});
    expect(second.previousRevisionId).toBe(first.id);
    expect(second.manifest.sources).toHaveLength(2);
    expect(first.manifest.sources).toHaveLength(1);
    expect(first).toEqual(before);
    expect(Object.isFrozen(first.manifest.sources)).toBe(true);
    expect(() => {(first as {audience: string}).audience = "external";}).toThrow(TypeError);
    expect(() => {(first.manifest.sources as unknown as unknown[]).push(sourceB);}).toThrow(TypeError);
  });
});

describe("substance", () => {
  it("a revision without claim, source or calculation is blocked while an informational answer is allowed", () => {
    expect(revisionSubstance(revision(), [block({claims: [claim]})])).toBe("material");
    expect(revisionSubstance(revision({}, {sources: [sourceA]}), [block()])).toBe("material");
    expect(revisionSubstance(revision({}, {kind: "execution_result", execution: executionRef}), [])).toBe("material");
    expect(revisionSubstance(revision({}, {kind: "model_result", institutionalResult: institutionalRef}), [])).toBe("material");
    expect(revisionSubstance(revision(), [block()])).toBe("informational");
    expect(revisionSubstance(revision(), [block({content: {text: "Qual exercicio, 2025 ou 2026? A data base seria 2026-05-31 ou 31/12/2025?"}})])).toBe("informational");
    expect(revisionSubstance(revision(), [block({content: {text: "A divida bruta e de R$ 5,67 bilhoes."}})])).toBe("without_substance");
    expect(revisionSubstance(revision(), [block({kind: "number", content: {value: "5670186", unit: "BRL_thousand"}})])).toBe("without_substance");
    expect(revisionSubstance(revision(), [])).toBe("without_substance");
    expect(revisionSubstance(revision({}, {kind: "material", format: "json"}), [block()])).toBe("without_substance");
  });
});

describe("material change", () => {
  const base = revision({}, {sources: [sourceA]});
  const blocks = [block({claims: [claim]})];

  it("identical, cosmetic and material comparisons", () => {
    expect(compareRevisions({revision: base, blocks}, {revision: base, blocks: [block({claims: [claim]})]})).toBe("identical");
    expect(compareRevisions({revision: base, blocks}, {revision: base, blocks: [block({claims: [claim], content: {text: "outro texto"}, contentFingerprint: hex("9")})]})).toBe("cosmetic");
    const reordered = [block({blockNo: 2, claims: [claim]}), block({id: id(21), blockNo: 1, blockKey: "answer.intro", contentFingerprint: hex("a")})];
    const ordered = [block({blockNo: 1, claims: [claim]}), block({id: id(21), blockNo: 2, blockKey: "answer.intro", contentFingerprint: hex("a")})];
    expect(compareRevisions({revision: base, blocks: ordered}, {revision: base, blocks: reordered})).toBe("cosmetic");
    const layout = revision({manifestFingerprint: hex("b")}, {sources: [sourceA], template: {templateVersionId: "house@2", fingerprint: hex("c")}});
    expect(compareRevisions({revision: base, blocks}, {revision: layout, blocks})).toBe("cosmetic");
  });

  it.each([
    ["claim_value", {revision: base, blocks: [block({claims: [{...claim, value: "5700000"}]})]}],
    ["claim_set", {revision: base, blocks: [block({claims: [claim, {...claim, claimId: "claim-net-debt"}]})]}],
    ["source_versions", {revision: revision({manifestFingerprint: hex("b")}, {sources: [sourceB]}), blocks}],
    ["method_release", {revision: revision({manifestFingerprint: hex("b")}, {sources: [sourceA], method: {procedureId: "p", platformReleaseId: "rel-2", houseReleaseId: null, version: "2"}}), blocks}],
    ["execution", {revision: revision({manifestFingerprint: hex("b")}, {sources: [sourceA], execution: executionRef}), blocks}],
    ["institutional_result", {revision: revision({manifestFingerprint: hex("b")}, {sources: [sourceA], institutionalResult: institutionalRef}), blocks}],
    ["audience", {revision: revision({audience: "advisor", manifestFingerprint: hex("b")}, {sources: [sourceA]}), blocks}],
  ] as const)("a %s change is material", (reason, next) => {
    const report = describeRevisionChange({revision: base, blocks}, next);
    expect(report.outcome).toBe("material");
    expect(report.reasons).toContain(reason);
  });
});

describe("freshness", () => {
  const links: ArtifactDependencyLink[] = [
    {revisionId: id(10), blockId: null, kind: "execution", executionId: id(50)},
    {revisionId: id(10), blockId: null, kind: "institutional_result", resultId: id(60)},
    link(sourceA),
    {revisionId: id(10), blockId: null, kind: "method_release", platformReleaseId: "rel-1", houseReleaseId: null},
  ];
  const heads = (overrides: Partial<LineageHeads> = {}): LineageHeads => ({
    executions: new Map([[id(50), id(50)]]), institutionalResults: new Map([[id(60), id(60)]]), sourceVersions: new Map([[id(31), id(31)]]), ...overrides,
  });

  it.each([
    ["current", heads(), "current"],
    ["stale by execution head", heads({executions: new Map([[id(50), id(51)]])}), "stale"],
    ["stale by institutional result head", heads({institutionalResults: new Map([[id(60), id(61)]])}), "stale"],
    ["stale by source version", heads({sourceVersions: new Map([[id(31), id(33)]])}), "stale"],
    ["unknown on a missing head", heads({executions: new Map()}), "unknown"],
    ["stale even when another head is missing", heads({executions: new Map(), sourceVersions: new Map([[id(31), id(33)]])}), "stale"],
  ] as const)("%s", (_name, facts, expected) => {
    expect(freshness(links, facts)).toBe(expected);
  });

  it("is current without links that have a lineage", () => {
    expect(freshness([], heads({executions: new Map()}))).toBe("current");
    expect(freshness([links[3]!], {executions: new Map(), institutionalResults: new Map(), sourceVersions: new Map()})).toBe("current");
  });
});

describe("release", () => {
  const confirm = {kind: "artifact_decision", decision: "confirm", artifactFingerprint: hex("1")} as const;

  it.each([
    ["internal", "internal", "released"],
    ["advisor", "internal", "released"],
    ["external", "blocked", "released"],
  ] as const)("release for the %s audience with and without approvals", (audience, without, withApproval) => {
    const current = revision({audience});
    expect(releaseState(current, {workReadAccess: true, facts: []})).toBe(without);
    expect(releaseState(current, {workReadAccess: true, facts: [{...confirm, decision: "request_changes"}]})).toBe(without);
    expect(releaseState(current, {workReadAccess: true, facts: [{...confirm, artifactFingerprint: hex("2")}]})).toBe(without);
    expect(releaseState(current, {workReadAccess: true, facts: [confirm]})).toBe(withApproval);
    expect(releaseState(current, {workReadAccess: false, facts: [confirm]})).toBe("blocked");
    expect(releaseState(current, {workReadAccess: false, facts: []})).toBe("blocked");
  });

  it("recognises each approval fact only on the exact version it names", () => {
    const material = revision({audience: "external", contentSha256: hex("3"), byteLength: 12}, {kind: "material", format: "pptx", bytes: {sha256: hex("3"), byteLength: 12, storage: {bucket: "case-artifacts", path: "o/p/materials/x.pptx"}}});
    expect(releaseState(material, {workReadAccess: true, facts: [{kind: "package_review", status: "approved", materialFingerprint: hex("3")}]})).toBe("released");
    expect(releaseState(material, {workReadAccess: true, facts: [{kind: "package_review", status: "pending_confirmation", materialFingerprint: hex("3")}]})).toBe("blocked");
    expect(releaseState(material, {workReadAccess: true, facts: [{kind: "package_review", status: "approved", materialFingerprint: hex("4")}]})).toBe("blocked");

    const model = revision({}, {kind: "model_result", format: "xlsx", institutionalResult: institutionalRef});
    expect(releaseState(model, {workReadAccess: true, facts: [{kind: "institutional_result", resultId: id(60), established: true}]})).toBe("released");
    expect(releaseState(model, {workReadAccess: true, facts: [{kind: "institutional_result", resultId: id(60), established: false}]})).toBe("internal");
    expect(releaseState(model, {workReadAccess: true, facts: [{kind: "institutional_result", resultId: id(61), established: true}]})).toBe("internal");

    const result = revision({}, {kind: "execution_result", format: "json", execution: executionRef});
    expect(releaseState(result, {workReadAccess: true, facts: [{kind: "execution_receipt", executionId: id(50), resultFingerprint: hex("5")}]})).toBe("released");
    expect(releaseState(result, {workReadAccess: true, facts: [{kind: "execution_receipt", executionId: id(50), resultFingerprint: hex("6")}]})).toBe("internal");

    const legacy: LegacyInput = {table: "capital_project_artifacts", id: id(70), fingerprint: hex("8"), evidence: []};
    const projected = revision({origin: "legacy", legacyRef: legacy}, {legacy});
    expect(releaseState(projected, {workReadAccess: true, facts: [{...confirm, artifactFingerprint: hex("8")}]})).toBe("released");
  });

  it("preview equals download", () => {
    // One evaluation, no purpose parameter: both surfaces pass the same revision and the same facts.
    expect(releaseState.length).toBe(2);
    const current = revision({audience: "external"});
    const input = {workReadAccess: true, facts: [confirm]};
    expect(releaseState(current, input)).toBe(releaseState(current, input));
  });
});

describe("exact revision resolution", () => {
  const artifact = artifactSchema.parse({id: id(3), organizationId: id(4), workId: id(5), kind: "answer", subject: "alongamento", legacyOrigin: null, headRevisionId: id(10)});
  const first = revision();
  const newer = revision({id: id(11), revisionNo: 2, previousRevisionId: id(10), manifestFingerprint: hex("4"), createdAt: "2026-09-27T12:00:00.000Z"});
  const foreign = revision({id: id(12), artifactId: id(6)});

  it("resolve exact revision and refuse an unknown one", () => {
    expect(resolveRevision(artifact, [newer, first, foreign])).toEqual({ok: true, revision: first});
    expect(resolveRevision(artifact, [newer, first], id(11))).toEqual({ok: true, revision: newer});
    expect(resolveRevision(artifact, [newer, first], id(13))).toEqual({ok: false, error: "revision_not_found"});
    expect(resolveRevision(artifact, [newer, first, foreign], id(12))).toEqual({ok: false, error: "revision_not_found"});
    expect(resolveRevision({...artifact, headRevisionId: null}, [newer, first])).toEqual({ok: false, error: "artifact_head_missing"});
    expect(resolveRevision({...artifact, headRevisionId: id(14)}, [newer, first])).toEqual({ok: false, error: "artifact_head_missing"});
  });
});

describe("revision and block consistency", () => {
  it("reports each inconsistency by code", () => {
    const blocks = [block({claims: [claim]})];
    expect(revisionSnapshotIssues({revision: revision({}, {claims: [{blockKey: "answer.body", claimIds: [claim.claimId]}]}), blocks})).toEqual([]);
    expect(revisionSnapshotIssues({revision: revision(), blocks})).toEqual(["claims_summary_mismatch"]);
    expect(revisionSnapshotIssues({revision: revision(), blocks: [block({revisionId: id(11), blockNo: 2})]})).toEqual(["block_revision_mismatch", "block_numbering_gap"]);
    expect(revisionSnapshotIssues({revision: revision(), blocks: [block(), block({id: id(21), blockNo: 2})]})).toEqual(["duplicate_block_key"]);
  });
});

describe("legacy labeling", () => {
  const capital: LegacyRow = {table: "capital_project_artifacts", row: {
    id: id(70), organization_id: id(4), capital_project_id: id(5), plan_id: id(71), task_run_id: id(72), processing_job_id: id(73),
    artifact_type: "meeting_brief", schema_version: "origination-meeting-brief.v1", artifact_version: 3, status: "pending_confirmation",
    input_fingerprint: hex("1"), artifact_fingerprint: hex("2"), created_by_kind: "worker", created_at: at, evidence_refs: [{a: 1}, {b: 2}], dependencies: [{c: 3}],
  }};
  const caseManifest: LegacyRow = {table: "case_artifact_manifests", row: {
    id: id(74), organization_id: id(4), intake_session_id: id(75), processing_run_id: id(76), schema_version: "2026.08.25-v4", locale: "pt-BR",
    input_fingerprint: hex("3"), manifest_fingerprint: hex("4"), created_by: id(77), created_at: at,
    manifest: {runId: "run-9", outputs: [{artifactId: "teaser-1", kind: "teaser", sha256: hex("5")}], sources: [{documentId: id(31), versionId: id(78), sha256: null}]},
  }};
  const institutional: LegacyRow = {table: "institutional_model_results", row: {
    id: id(60), organization_id: id(4), capital_project_id: id(5), intake_session_id: id(75), configuration_id: id(40), configuration_fingerprint: hex("7"),
    source_manifest_fingerprint: hex("e"), status: "completed", created_at: at,
    artifact: {fingerprint: hex("b"), version: "institutional-workbook-editable.v2", workbooks: {pt: {sha256: hex("c"), byteSize: 48213}, en: {sha256: hex("d"), byteSize: 48190}},
      institutional: {activeScenarioId: id(40), scenarios: [{configurationId: id(40), configurationFingerprint: hex("7"), outputFingerprint: hex("2b"), sourceBindings: [{sourceDocument: "ITR 2T26"}]}]}},
  }};
  const material: LegacyRow = {table: "deal_state_objects", row: {
    id: id(80), organization_id: id(4), intake_session_id: id(75), object_type: "material_artifact", object_version: 2, status: "pending_confirmation",
    input_fingerprint: hex("8"), object_fingerprint: hex("9"), created_by: id(77), created_at: at,
    dependencies: [{objectType: "production_plan", objectFingerprint: hex("a")}],
    payload: {materials: [{kind: "teaser", artifactFingerprint: hex("1a")}, {kind: "credit_memo"}], financialModel: {fingerprint: hex("2b"), workbooks: {pt: {sha256: hex("3c"), byteSize: 20000}, en: {sha256: hex("4d"), byteSize: 20001}}}},
  }};

  it.each([
    ["capital project artifact", capital, "work_product", hex("2"), [{key: "artifact_type", value: "meeting_brief"}, {key: "input_fingerprint", value: hex("1")}, {key: "evidence_ref_count", value: "2"}]],
    ["case manifest", caseManifest, "work_product", hex("4"), [{key: "output", value: `teaser:teaser-1:${hex("5")}`}, {key: "source_document", value: `${id(31)}:${id(78)}:unverified`}]],
    ["institutional result", institutional, "model_result", hex("b"), [{key: "workbook_sha256_pt", value: hex("c")}, {key: "output_fingerprint", value: hex("2b")}, {key: "source_binding_count", value: "1"}]],
    ["deal state material artifact", material, "material", hex("9"), [{key: "material", value: `teaser:${hex("1a")}`}, {key: "material", value: "credit_memo:unpinned"}, {key: "depends_on", value: `production_plan:${hex("a")}`}]],
  ] as const)("legacy projection of a %s keeps the fingerprint verbatim", (_name, row, kind, fingerprint, evidence) => {
    const draft = legacyProjection(row);
    expect(artifactRevisionDraftSchema.safeParse(draft).success).toBe(true);
    expect(draft.origin).toBe("legacy");
    expect(draft.audience).toBe("internal");
    expect(draft.manifest.kind).toBe(kind);
    expect(draft.legacyRef).toEqual(draft.manifest.legacy);
    expect(draft.legacyRef?.table).toBe(row.table);
    expect(draft.legacyRef?.fingerprint).toBe(fingerprint);
    expect(draft.contentSha256).toBeNull();
    expect(draft.manifest.bytes).toBeNull();
    for (const entry of evidence) expect(draft.manifest.legacy?.evidence).toContainEqual(entry);
    expect(Object.isFrozen(draft.manifest.legacy)).toBe(true);
  });

  it("refuses to fabricate method, execution, input snapshot or source links", () => {
    const hinted = {
      ...capital,
      row: {...capital.row, execution_id: id(50), method_release_id: "rel-1", input_snapshot_fingerprint: hex("6"), source_version_ids: [id(31)]},
    };
    for (const row of [hinted, caseManifest, institutional, material]) {
      const draft = legacyProjection(row);
      expect(draft.manifest.method).toBeNull();
      expect(draft.manifest.execution).toBeNull();
      expect(draft.manifest.inputSnapshot).toBeNull();
      expect(draft.manifest.sources).toEqual([]);
      expect(draft.manifest.template).toBeNull();
    }
    expect(legacyProjection(hinted).manifest.legacy?.evidence.map((entry) => entry.key)).not.toContain("execution_id");
  });

  it("carries only what each row has: provenance ids and the institutional result", () => {
    expect(legacyProjection(capital).manifest.provenance).toEqual({producer: "legacy:capital_project_artifacts", jobId: id(73), taskRunId: id(72), messageId: null, capability: null});
    const model = legacyProjection(institutional);
    expect(model.manifest.institutionalResult).toEqual({id: id(60), configurationFingerprint: hex("7")});
    expect(model.manifest.provenance.messageId).toBe(id(60));
    expect(revisionSubstance(model, [])).toBe("material");
    // Labeled, not judged: a historical row without claims carries no fabricated substance.
    expect(revisionSubstance(legacyProjection(capital), [])).toBe("without_substance");
    expect(() => legacyProjection({...institutional, row: {...institutional.row, status: "queued", artifact: null}})).toThrow("artifact_legacy_result_not_completed");
    expect(() => legacyProjection({...material, row: {...material.row, object_type: "package_review" as never}})).toThrow();
  });
});

describe("adapters", () => {
  const context = {audience: "internal", provenance} as const;

  it("maps a decision artifact contract", () => {
    const contract = {
      schemaVersion: "2026.09.07-v1", caseId: "gc02", snapshotFingerprint: hex("c"), contractFingerprint: hex("d"),
      claims: [{id: "claim-debt", object: {id: "ledger", type: "debt_ledger", fingerprint: hex("e"), path: "accountingGrossDebt"}}],
      views: [
        {surface: "conversation", blocks: [{id: "chat-debt", claimIds: ["claim-debt"]}, {id: "chat-intro", claimIds: []}]},
        {surface: "workbook", blocks: [{id: "model-debt", claimIds: ["claim-debt"]}]},
      ],
    } as const;
    const mapped = manifestFromDecisionArtifactContract(contract, {...context, sources: [sourceA]});
    expect(artifactManifestSchema.safeParse(mapped).success).toBe(true);
    expect(mapped).toMatchObject({kind: "work_product", format: "json", bytes: null, method: null, execution: null, inputSnapshot: {fingerprint: hex("c")}, sources: [sourceA]});
    expect(mapped.claims).toEqual([{blockKey: "conversation:chat-debt", claimIds: ["claim-debt"]}, {blockKey: "workbook:model-debt", claimIds: ["claim-debt"]}]);
    expect(mapped.traces).toEqual([`decision-contract:${hex("d")}`, `signed-object:debt_ledger:ledger:${hex("e")}`]);
    expect(Object.isFrozen(mapped.claims)).toBe(true);
  });

  it("maps a rendered material manifest and refuses one that is not stored", () => {
    const receipt = {
      schemaVersion: "2026.09.07-v1", id: "gc02-workbook-v1", decisionContractFingerprint: hex("d"), surface: "workbook", format: "xlsx",
      byteLength: 23, contentSha256: hex("f"), renderer: {id: "offroad-financial-workbook", version: "1.0.0"},
      template: {id: "offroad-house-credit", version: "1.0.0", fingerprint: hex("1a"), origin: "offroad_house"},
      storage: {bucket: "case-artifacts", objectPath: `${id(4)}/${id(5)}/materials/${hex("f")}.xlsx`, state: "stored", etag: "etag-v1"},
      claimIds: ["claim-debt"], manifestFingerprint: hex("2b"),
    } as const;
    const mapped = manifestFromRenderedMaterialManifest(receipt, context);
    expect(mapped).toMatchObject({
      kind: "workbook", format: "xlsx", inputSnapshot: {fingerprint: hex("d")}, claims: [{blockKey: "workbook", claimIds: ["claim-debt"]}],
      bytes: {sha256: hex("f"), byteLength: 23, storage: {bucket: "case-artifacts", path: receipt.storage.objectPath}},
      template: {templateVersionId: "offroad-house-credit@1.0.0", fingerprint: hex("1a")},
    });
    expect(manifestFromRenderedMaterialManifest({...receipt, surface: "supporting_document", format: "docx"}, context).kind).toBe("document");
    expect(() => manifestFromRenderedMaterialManifest({...receipt, storage: {...receipt.storage, state: "pending_upload", etag: null}}, context)).toThrow("artifact_adapter_material_not_stored");
  });

  it("maps an institutional workbook artifact for one locale", () => {
    const artifact = {
      modelKind: "institutional", version: "institutional-workbook-editable.v2", fingerprint: hex("b"),
      workbooks: {pt: {sha256: hex("c"), byteSize: 48213}, en: {sha256: hex("d"), byteSize: 48190}},
      renderAudits: {pt: {rendererVersion: "governed-workbook.v3"}, en: {rendererVersion: "governed-workbook.v3"}},
      institutional: {schemaVersion: "institutional-workbook-artifact.v1", activeScenarioId: id(40), sourceManifestFingerprint: hex("e"),
        scenarios: [{configurationId: id(40), configurationFingerprint: hex("7"), inputFingerprint: hex("1a"), outputFingerprint: hex("2b")}]},
    } as const;
    const mapped = manifestFromInstitutionalWorkbookArtifact(artifact, {...context, resultId: id(60), locale: "en"});
    expect(mapped).toMatchObject({
      kind: "model_result", format: "xlsx", institutionalResult: {id: id(60), configurationFingerprint: hex("7")}, inputSnapshot: {fingerprint: hex("1a")},
      bytes: {sha256: hex("d"), byteLength: 48190, rendered: {renderer: "institutional-workbook-editable.v2", rendererVersion: "governed-workbook.v3", deterministicInputs: {locale: "en", artifactFingerprint: hex("b")}}},
      traces: [`institutional-workbook:${hex("b")}`, `institutional-output:${hex("2b")}`],
    });
    expect(() => manifestFromInstitutionalWorkbookArtifact({...artifact, institutional: {...artifact.institutional, activeScenarioId: id(41)}}, {...context, resultId: id(60), locale: "pt"})).toThrow("artifact_adapter_active_scenario_missing");
  });

  it("maps a document work product", () => {
    const product = documentWorkProductSchema.parse({
      schemaVersion: "document-work-product.v1", job: "review", locale: "pt-BR", requestFingerprint: hex("4"), inputFingerprint: hex("5"),
      sections: [
        {key: "transaction", title: "Operacao", observations: [{text: "Debentures simples da terceira emissao.", citations: [{passageId: "p1", quote: "a Emissora obriga-se a manter"}]}]},
        {key: "protections", title: "Protecoes", observations: []},
        {key: "risks", title: "Riscos", observations: []},
      ],
      hypotheses: [], gaps: [],
      sources: [{id: "p1", documentId: "doc-1", documentName: "Escritura da terceira emissao.pdf", version: "v1", hash: hex("3"), anchor: "p. 12",
        text: "Clausula 7.1: a Emissora obriga-se a manter o indice de divida liquida sobre EBITDA inferior a 3,0x."}],
      coverage: {documentsConsidered: 1, omittedPassages: 0, limitations: []},
      calculationStatus: "not_performed", assessmentStatus: "preliminary_document_review", fingerprint: hex("6"), status: "preliminary",
    });
    const mapped = manifestFromDocumentWorkProduct(product, {...context, audience: "advisor"});
    expect(mapped).toMatchObject({kind: "work_product", audience: "advisor", format: "json", inputSnapshot: {fingerprint: hex("5")}, sources: [], claims: []});
    expect(mapped.traces).toEqual([`document-work-product:${hex("6")}`, `approved-request:${hex("4")}`]);
  });

  it("maps a capital procedure packet to an execution result", () => {
    const packet = {
      schemaVersion: "capital-procedure-packet.v2", status: "prepared_for_human_review",
      decision: {procedureId: "prepare-capital-structure-decision", workId: id(5), fingerprint: hex("7"),
        alternatives: [{id: "alt-maintain"}, {id: "alt-extend"}], ratios: [{id: "ratio-leverage", fingerprint: hex("8")}],
        recommendation: {alternativeId: "alt-extend"}, provenance: {financialCoreVersion: "financial-core.2026.09.18"}},
      contractSourceVersionIds: [id(31), id(32)], inputFingerprint: hex("9"), fingerprint: hex("a"),
    } as const;
    const mapped = manifestFromCapitalProcedurePacket(packet, {...context, execution: executionRef, inputSnapshot: {fingerprint: hex("6")}, sources: [sourceA]});
    expect(mapped).toMatchObject({kind: "execution_result", format: "json", execution: executionRef, inputSnapshot: {fingerprint: hex("6")}, method: null});
    // The producer's resolved rights version refines the packet's unpinned reference to the same source version.
    expect(mapped.sources).toEqual([sourceA, {sourceVersionId: id(32), rightsVersionId: null}]);
    expect(mapped.claims).toEqual([
      {blockKey: "alternatives", claimIds: ["alt-maintain", "alt-extend"]},
      {blockKey: "ratios", claimIds: ["ratio-leverage"]},
      {blockKey: "recommendation", claimIds: ["alt-extend"]},
    ]);
    expect(mapped.traces).toContain(`ratio:ratio-leverage:${hex("8")}`);
    const withMethod = manifestFromCapitalProcedurePacket({...packet, decision: {...packet.decision, recommendation: null}}, {...context, execution: executionRef, method: {platformReleaseId: "rel-1", houseReleaseId: null, version: "1"}});
    expect(withMethod.method).toEqual({procedureId: "prepare-capital-structure-decision", platformReleaseId: "rel-1", houseReleaseId: null, version: "1"});
    expect(withMethod.claims.map((entry) => entry.blockKey)).toEqual(["alternatives", "ratios"]);
    expect(revisionSubstance({manifest: withMethod}, [])).toBe("material");
  });
});
