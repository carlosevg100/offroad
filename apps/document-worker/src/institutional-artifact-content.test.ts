import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {legacyProjection} from "@offroad/domain-contracts";
import {institutionalWorkbookArtifactSchema} from "@offroad/financial-model";
import {institutionalContentAdapterVersion, prepareInstitutionalArtifactContent} from "./institutional-artifact-content";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (c: string) => c.repeat(64);
const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical)
  : v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, canonical(x)])) : v;
function fixture() {
  return institutionalWorkbookArtifactSchema.parse(JSON.parse(readFileSync(new URL("../../../packages/financial-model/src/institutional-workbook-v1.fixture.json", import.meta.url), "utf8")));
}
function rehash(artifact: ReturnType<typeof fixture>) {
  const {fingerprint: _fingerprint, ...body} = artifact;
  return {...body, fingerprint: createHash("sha256").update(JSON.stringify(canonical(body))).digest("hex")};
}
function input(artifact = fixture()) {
  const active = artifact.institutional.scenarios.find(s => s.configurationId === artifact.institutional.activeScenarioId)!;
  const row = {id: id(3), organization_id: id(1), capital_project_id: id(2), intake_session_id: id(4),
    configuration_id: active.configurationId, configuration_fingerprint: active.configurationFingerprint,
    source_manifest_fingerprint: artifact.institutional.sourceManifestFingerprint, status: "completed" as const,
    created_at: "2026-09-10T04:00:00Z", artifact};
  const revision = {...legacyProjection({table: "institutional_model_results", row}), id: id(6), artifactId: id(5),
    revisionNo: 1, previousRevisionId: null, manifestFingerprint: hash("f")};
  return {organizationId: id(1), workId: id(2), resultId: id(3), configurationId: active.configurationId,
    configurationFingerprint: active.configurationFingerprint, sourceManifestFingerprint: row.source_manifest_fingerprint,
    expectedArtifactFingerprint: artifact.fingerprint, locale: "pt" as "pt" | "en", artifact,
    ancestor: {artifact: {id: id(5), organizationId: id(1), workId: id(2), kind: "model_result" as const,
      subject: "institutional-workbook", legacyOrigin: {table: "institutional_model_results" as const, id: id(3)}, headRevisionId: id(99)}, revision}};
}
function reassemble(result: ReturnType<typeof prepareInstitutionalArtifactContent>) {
  const envelope = result.blocks[0]!.content.workbook as Record<string, unknown>;
  return {...envelope, institutional: {...envelope.institutional as Record<string, unknown>,
    scenarios: result.blocks.slice(1).map(block => block.content.scenario)}};
}

describe("institutional native content preparation", () => {
  it("uses the exact legacy revision when its shared artifact originated in an earlier result", () => {
    const request = input();
    const ancestor = {...request.ancestor, artifact: {...request.ancestor.artifact,
      legacyOrigin: {...request.ancestor.artifact.legacyOrigin!, id: id(99)}}};
    expect(reassemble(prepareInstitutionalArtifactContent({...request, ancestor}))).toEqual(request.artifact);
  });

  it("round-trips every field of the persisted workbook without recalculation or approval", () => {
    const request = input();
    const before = JSON.stringify(request);
    const result = prepareInstitutionalArtifactContent(request);
    expect(reassemble(result)).toEqual(request.artifact);
    expect(result.adapterVersion).toBe(institutionalContentAdapterVersion);
    expect(result.prerequisites).toEqual({sourceClosure: "unproven", revisionReview: "required"});
    expect(result.blocks.every(b => b.claims.length === 0)).toBe(true);
    expect(result).not.toHaveProperty("manifest");
    expect(result).not.toHaveProperty("sources");
    expect(JSON.stringify(request)).toBe(before);
    expect(Object.isFrozen(request.artifact)).toBe(false);
    expect(Object.isFrozen(result.blocks[1]!.content.scenario)).toBe(true);
  });
  it("preserves non-active scenarios, order, exact decimals, text and their unique source references", () => {
    const artifact = fixture();
    const second = structuredClone(artifact.institutional.scenarios[0]!);
    second.configurationId = id(20);
    second.input.openingBalanceSheet.unrestrictedCash = "00010.12345678901234567890";
    second.input.assumptionBook.scenarioName = "Cenário fornecido: sem reescrita";
    second.sourceBindings[0]!.sourceDocument = id(21);
    second.lineage[0]!.sourceDocument = id(22);
    artifact.institutional.scenarios.push(second);
    const request = input(rehash(artifact));
    const result = prepareInstitutionalArtifactContent(request);
    expect(reassemble(result)).toEqual(request.artifact);
    expect(result.blocks.map(b => b.blockKey)).toEqual(["workbook", ...artifact.institutional.scenarios.map(s => `scenario:${s.configurationId}`)]);
    expect(result.declaredReferences).toContainEqual({configurationId: id(20), origin: "source_binding", sourceDocument: id(21), version: second.sourceBindings[0]!.version, hash: second.sourceBindings[0]!.hash});
    expect(result.declaredReferences).toContainEqual({configurationId: id(20), origin: "lineage", sourceDocument: id(22), version: second.lineage[0]!.sourceVersion, hash: second.lineage[0]!.sourceHash});
  });
  it("pins the supplied ancestor, never the mutable head, and is deterministic in both locales", () => {
    const request = input();
    const pt = prepareInstitutionalArtifactContent(request);
    const en = prepareInstitutionalArtifactContent({...request, locale: "en"});
    expect(pt).toEqual(prepareInstitutionalArtifactContent(request));
    expect(pt.origin.ancestorRevisionId).toBe(id(6));
    expect(pt.origin.ancestorRevisionId).not.toBe(request.ancestor.artifact.headRevisionId);
    expect(pt.blocks).toEqual(en.blocks);
    expect(pt.declaredReferences).toEqual(en.declaredReferences);
    expect(pt.representation).toEqual({locale: "pt", format: "xlsx", ...request.artifact.workbooks.pt});
    expect(en.representation).toEqual({locale: "en", format: "xlsx", ...request.artifact.workbooks.en});
  });
  it.each(["organizationId", "workId", "resultId", "configurationId"] as const)("rejects mismatched %s", field => {
    expect(() => prepareInstitutionalArtifactContent({...input(), [field]: id(80)})).toThrow();
  });
  it.each(["configurationFingerprint", "sourceManifestFingerprint", "expectedArtifactFingerprint"] as const)("rejects mismatched %s", field => {
    expect(() => prepareInstitutionalArtifactContent({...input(), [field]: hash("0")})).toThrow();
  });
  it("rejects an ancestor from another artifact or fingerprint", () => {
    const request = input();
    expect(() => prepareInstitutionalArtifactContent({...request, ancestor: {...request.ancestor,
      revision: {...request.ancestor.revision, artifactId: id(90)}}})).toThrow("institutional_content_ancestor_mismatch");
    const legacy = {...request.ancestor.revision.legacyRef!, fingerprint: hash("0")};
    expect(() => prepareInstitutionalArtifactContent({...request, ancestor: {...request.ancestor,
      revision: {...request.ancestor.revision, legacyRef: legacy, manifest: {...request.ancestor.revision.manifest, legacy}}}})).toThrow("institutional_content_ancestor_mismatch");
  });
  it("rejects missing or repeated scenarios even with a recomputed content fingerprint", () => {
    const missing = fixture(); missing.institutional.activeScenarioId = id(88);
    expect(() => prepareInstitutionalArtifactContent({...input(), artifact: rehash(missing), expectedArtifactFingerprint: rehash(missing).fingerprint})).toThrow();
    const repeated = fixture(); repeated.institutional.scenarios.push(structuredClone(repeated.institutional.scenarios[0]!));
    expect(() => prepareInstitutionalArtifactContent(input(rehash(repeated)))).toThrow("institutional_content_result_mismatch");
  });
  it("keeps an empty declaration unknown instead of certifying no consumed sources", () => {
    const artifact = fixture();
    for (const scenario of artifact.institutional.scenarios) {scenario.sourceBindings = []; scenario.lineage = [];}
    const result = prepareInstitutionalArtifactContent(input(rehash(artifact)));
    expect(result.declaredReferences).toEqual([]);
    expect(result.prerequisites.sourceClosure).toBe("unproven");
  });
  it("rejects unsupported, tampered or silently stripped content", () => {
    const request = input();
    expect(() => prepareInstitutionalArtifactContent({...request, artifact: {...request.artifact, version: "unknown.v9"}})).toThrow("institutional_content_artifact_invalid");
    expect(() => prepareInstitutionalArtifactContent({...request, artifact: {...request.artifact, periods: ["2099"]}})).toThrow("institutional_content_artifact_invalid");
    expect(() => prepareInstitutionalArtifactContent({...request, artifact: {...request.artifact, renderAudits: {...request.artifact.renderAudits,
      pt: {...request.artifact.renderAudits.pt, undocumented: "do not discard"}}}})).toThrow("institutional_content_artifact_invalid");
  });
});
