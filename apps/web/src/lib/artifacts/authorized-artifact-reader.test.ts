import {createHash} from "node:crypto";

import {caseExportVersion} from "@offroad/case-export";
import {releaseState, type ApprovalFact, type ArtifactAudience} from "@offroad/domain-contracts";
import {describe, expect, it, vi} from "vitest";

vi.mock("server-only", () => ({}));

import {artifactReadFixture, artifactRpc} from "./artifact-read.test-support";
import {
  artifactResponseHeaders,
  artifactServing,
  legacyUnpinned,
  parseArtifactRead,
  readArtifactHead,
  readArtifactRevision,
  readGovernedObject,
  resolveRenderer,
  revisionBelongsTo,
  revisionIssuedOn,
  storedRevisionObject,
  uploadGrantObjectPath,
  verifyRenderedBytes,
  type ArtifactRead,
  type GovernedObject,
} from "./authorized-artifact-reader";
import {supabaseDouble} from "./supabase-double.test-support";

// Synthetic organization supplied by the authorized resolver, absent from the reader response.
const organizationId = "90000000-0000-4000-8000-000000000001";
const workId = "10000000-0000-4000-8000-000000000001";
const revisionId = "20000000-0000-4000-8000-000000000001";
const rowId = "30000000-0000-4000-8000-000000000001";
const bytes = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);
const bytesSha = createHash("sha256").update(bytes).digest("hex");

const legacy = (overrides: Partial<Parameters<typeof artifactReadFixture>[0]> = {}) => artifactReadFixture({
  workId, kind: "work_product", subject: "meeting_brief", revisionId, legacy: {table: "capital_project_artifacts", id: rowId, fingerprint: "a".repeat(64)}, ...overrides,
});
const pinned = (overrides: Partial<Parameters<typeof artifactReadFixture>[0]> = {}) => artifactReadFixture({
  workId, kind: "material", subject: `materials:${rowId}`, revisionId, audience: "external", release: "released", format: "docx",
  rendered: {sha256: bytesSha, byteLength: bytes.byteLength, renderer: "case-export.material-docx", rendererVersion: caseExportVersion,
    deterministicInputs: {materialFingerprint: "b".repeat(64), materialKind: "term_sheet", locale: "pt", issuedOn: "2026-09-20"}},
  blocks: [{blockKey: "term_sheet", kind: "section", content: {title: "Termos"}, claims: [{claimId: "claim-1", kind: "fact", value: "100", unit: "BRL", period: "2025", supportIds: ["s1"]}]}],
  ...overrides,
});
function served(value: unknown): Extract<ArtifactRead, {withheld: false}> {
  const result = parseArtifactRead(value);
  if (!result.ok || result.read.withheld) throw new Error("expected a served read");
  return result.read;
}

describe("parsing the reader answer", () => {
  it("returns the contract revision of a legacy projection, unpinned and internal", () => {
    const read = served(legacy());
    expect(read.revision.id).toBe(revisionId);
    expect(read.revision.artifactId).toBe(read.artifact.id);
    expect(read.revision.manifest.legacy?.table).toBe("capital_project_artifacts");
    expect(read.blocks).toEqual([]);
    expect(legacyUnpinned(read.revision)).toBe(true);
    expect(artifactServing(read)).toMatchObject({serve: true, release: "internal"});
  });
  it("parses blocks with their claims and binds them to the revision", () => {
    const read = served(pinned());
    expect(read.blocks).toHaveLength(1);
    expect(read.blocks[0]!.revisionId).toBe(revisionId);
    expect(read.blocks[0]!.claims[0]!.claimId).toBe("claim-1");
    expect(legacyUnpinned(read.revision)).toBe(false);
  });
  it("keeps identity, release and freshness of a withheld revision without any manifest or block", () => {
    const result = parseArtifactRead(pinned({release: "blocked"}));
    expect(result.ok && result.read.withheld).toBe(true);
    if (!result.ok || !result.read.withheld) return;
    expect(result.read.revision).toBeNull();
    expect(result.read.summary.manifestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(artifactServing(result.read)).toEqual({serve: false, refusal: "artifact_release_blocked"});
    const rights = parseArtifactRead(legacy({restriction: {kind: "source_rights", linkIds: ["9f000000-0000-4000-8000-000000000001"], unresolvedRevisionIds: []}}));
    expect(rights.ok && !rights.read.withheld ? null : rights.ok && artifactServing(rights.read)).toEqual({serve: false, refusal: "artifact_source_restricted"});
  });
  it.each([
    ["another schema version", (value: ReturnType<typeof legacy>) => ({...value, schemaVersion: "artifact-read.v0"})],
    ["an extra key", (value: ReturnType<typeof legacy>) => ({...value, extra: true})],
    ["a head flag that contradicts the pointer", (value: ReturnType<typeof legacy>) => ({...value, isHead: false})],
    ["a manifest of another kind", (value: ReturnType<typeof legacy>) => ({...value, artifact: {...value.artifact, kind: "material"}})],
    ["a restriction with a manifest", (value: ReturnType<typeof legacy>) => ({...value, restriction: {kind: "release", release: "blocked"}})],
    ["a missing manifest without restriction", (value: ReturnType<typeof legacy>) => ({...value, revision: {...value.revision, manifest: null}})],
    ["a legacy label that differs from the manifest", (value: ReturnType<typeof legacy>) => ({...value, revision: {...value.revision, legacyRef: {...value.revision.legacyRef!, fingerprint: "c".repeat(64)}}})],
    ["bytes that differ from the manifest", (value: ReturnType<typeof legacy>) => ({...value, revision: {...value.revision, contentSha256: "c".repeat(64), byteLength: 3}})],
  ])("fails closed on %s", (_label, change) => {
    expect(parseArtifactRead(change(legacy()))).toEqual({ok: false, error: "artifact_read_invalid"});
  });
});

describe("serving follows the database's release evaluation and is never looser", () => {
  const fact: ApprovalFact = {kind: "artifact_decision", decision: "confirm", artifactFingerprint: "a".repeat(64)};
  it.each(["internal", "advisor", "external"] as const)("%s audience: served exactly when the contract's releaseState is not blocked", (audience: ArtifactAudience) => {
    for (const approved of [false, true]) {
      const draft = served(legacy({audience, release: "internal"}));
      // The contract's rule over the same revision with the facts the database would find.
      const context = {
        target: {organizationId, workId: draft.artifact.workId,
          artifactId: draft.artifact.id, revisionId: draft.revision.id,
          manifestFingerprint: draft.revision.manifestFingerprint, audience},
        sourceReadAccess: true,
        ancestry: {complete: true, hasExecution: false, institutional: "none" as const}, reviews: [],
      };
      const expected = releaseState(draft.revision, {workReadAccess: true, facts: approved ? [fact] : [], context});
      const answer = legacy({audience, release: expected});
      const result = parseArtifactRead(answer);
      if (!result.ok) throw new Error("unexpected invalid read");
      const decision = artifactServing(result.read);
      expect(decision.serve).toBe(expected !== "blocked");
      if (decision.serve) expect(decision.release).toBe(expected);
    }
    // Without work read access the contract blocks everything; the database answers not found.
    const unreadable = served(legacy({audience}));
    expect(releaseState(unreadable.revision, {workReadAccess: false, facts: [fact], context: {
      target: {organizationId, workId: unreadable.artifact.workId,
        artifactId: unreadable.artifact.id, revisionId: unreadable.revision.id,
        manifestFingerprint: unreadable.revision.manifestFingerprint, audience},
      sourceReadAccess: true, ancestry: {complete: true, hasExecution: false, institutional: "none"}, reviews: [],
    }})).toBe("blocked");
  });
  it("refuses an external revision the database did not release, even without a restriction", () => {
    const read = served(pinned({release: "internal"}));
    expect(artifactServing(read)).toEqual({serve: false, refusal: "artifact_release_blocked"});
  });
  it("refuses a blocked release reported without restriction", () => {
    expect(artifactServing(served(legacy({release: "blocked", restriction: null})))).toEqual({serve: false, refusal: "artifact_release_blocked"});
  });
});

describe("reading through the two RPCs", () => {
  it("reads the exact revision and refuses an answer about another one", async () => {
    const rpc = vi.fn(artifactRpc([legacy()]));
    const supabase = {rpc} as never;
    const result = await readArtifactRevision(supabase, {revisionId});
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("read_artifact_revision_v1", {p_revision_id: revisionId});
    const other = vi.fn(async () => ({data: legacy({revisionId: "20000000-0000-4000-8000-000000000002"}), error: null}));
    expect(await readArtifactRevision({rpc: other} as never, {revisionId})).toEqual({ok: false, error: "artifact_read_invalid"});
  });
  it("answers not found for a missing or unreadable revision and for a malformed id, without calling the database for the latter", async () => {
    const rpc = vi.fn(artifactRpc([]));
    expect(await readArtifactRevision({rpc} as never, {revisionId})).toEqual({ok: false, error: "artifact_revision_not_found"});
    expect(await readArtifactRevision({rpc} as never, {revisionId: "not-a-uuid"})).toEqual({ok: false, error: "artifact_revision_not_found"});
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(2, "record_artifact_access_denial_v1", {p_revision_id: revisionId});
    const failing = vi.fn(async () => ({data: null, error: {code: "57014", message: "canceling statement"}}));
    expect(await readArtifactRevision({rpc: failing} as never, {revisionId})).toEqual({ok: false, error: "artifact_read_failed"});
  });
  it("reads the head by work, kind and subject and refuses a head of another subject or a non-head", async () => {
    const rpc = vi.fn(artifactRpc([legacy()]));
    const target = {workId, kind: "work_product" as const, subject: "meeting_brief"};
    const head = await readArtifactHead({rpc} as never, target);
    expect(head.ok && head.read.isHead).toBe(true);
    expect(rpc).toHaveBeenCalledWith("read_artifact_head_v1", {p_work_id: workId, p_kind: "work_product", p_subject: "meeting_brief"});
    expect(await readArtifactHead({rpc} as never, {...target, subject: "preview_material"})).toEqual({ok: false, error: "artifact_revision_not_found"});
    const wrong = vi.fn(async () => ({data: legacy({subject: "preview_material"}), error: null}));
    expect(await readArtifactHead({rpc: wrong} as never, target)).toEqual({ok: false, error: "artifact_read_invalid"});
    const stale = vi.fn(async () => ({data: legacy({isHead: false}), error: null}));
    expect(await readArtifactHead({rpc: stale} as never, target)).toEqual({ok: false, error: "artifact_read_invalid"});
    expect(revisionBelongsTo(served(legacy()), target)).toBe(true);
    expect(revisionBelongsTo(served(legacy()), {...target, workId: "10000000-0000-4000-8000-000000000009"})).toBe(false);
  });
});

describe("renderer, bytes and headers", () => {
  it("resolves no renderer for a revision without bytes, a stored object, and only a registered renderer in its pinned version", () => {
    expect(resolveRenderer(served(legacy()).revision)).toMatchObject({ok: true, source: "unpinned", legacy: {table: "capital_project_artifacts", id: rowId}});
    expect(resolveRenderer(served(pinned()).revision)).toMatchObject({ok: true, source: "rendered", renderer: "case-export.material-docx", format: "docx"});
    expect(resolveRenderer(served(pinned({stored: {sha256: bytesSha, byteLength: 7, bucket: "case-artifacts", path: "o/p/materials/x.pptx"}, rendered: undefined, format: "pptx"})).revision))
      .toEqual({ok: true, source: "storage", bucket: "case-artifacts", path: "o/p/materials/x.pptx", format: "pptx"});
    const unknown = pinned({rendered: {sha256: bytesSha, byteLength: 7, renderer: "somebody-else.docx", rendererVersion: "1", deterministicInputs: {locale: "pt"}}});
    expect(resolveRenderer(served(unknown).revision)).toEqual({ok: false, error: "artifact_renderer_unknown"});
    const older = pinned({rendered: {sha256: bytesSha, byteLength: 7, renderer: "case-export.material-docx", rendererVersion: "2026.01.01-v1", deterministicInputs: {locale: "pt"}}});
    expect(resolveRenderer(served(older).revision)).toEqual({ok: false, error: "artifact_renderer_version_mismatch"});
    const wrongFormat = pinned({format: "pdf"});
    expect(resolveRenderer(served(wrongFormat).revision)).toEqual({ok: false, error: "artifact_renderer_unknown"});
  });
  it("verifies exactly the pinned rendering and makes no claim otherwise", () => {
    const revision = served(pinned()).revision;
    const rendering = {format: "docx" as const, selectors: {locale: "pt", materialKind: "term_sheet"}};
    expect(verifyRenderedBytes(revision, bytes, rendering)).toEqual({status: "verified", sha256: bytesSha, byteLength: 7});
    expect(verifyRenderedBytes(revision, new Uint8Array([80, 75, 3, 4, 1, 2, 4]), rendering)).toEqual({status: "mismatch", error: "artifact_bytes_mismatch"});
    expect(verifyRenderedBytes(revision, bytes.slice(0, 6), rendering)).toEqual({status: "mismatch", error: "artifact_bytes_mismatch"});
    expect(verifyRenderedBytes(revision, bytes, {...rendering, format: "pdf"})).toEqual({status: "unpinned"});
    expect(verifyRenderedBytes(revision, bytes, {...rendering, selectors: {locale: "en", materialKind: "term_sheet"}})).toEqual({status: "unpinned"});
    expect(verifyRenderedBytes(revision, bytes, {...rendering, selectors: {locale: "pt", materialKind: "teaser"}})).toEqual({status: "unpinned"});
    expect(verifyRenderedBytes(served(legacy()).revision, bytes, {format: "json"})).toEqual({status: "unpinned"});
  });
  it("labels a legacy revision without pinned bytes and claims a hash only for verified bytes", () => {
    const legacyRead = served(legacy({freshness: "stale"}));
    const unpinned = artifactResponseHeaders(legacyRead, {status: "unpinned"});
    expect(unpinned).toEqual({
      "x-artifact-revision": revisionId, "x-artifact-manifest-fingerprint": legacyRead.revision.manifestFingerprint,
      "x-artifact-release": "internal", "x-artifact-freshness": "stale", "x-artifact-bytes": "unpinned", "x-artifact-legacy": "unpinned",
    });
    const verified = artifactResponseHeaders(served(pinned()), {status: "verified", sha256: bytesSha, byteLength: 7});
    expect(verified["x-artifact-content-sha256"]).toBe(bytesSha);
    expect(verified["x-artifact-release"]).toBe("released");
    expect(verified["x-artifact-bytes"]).toBe("pinned");
    expect(verified).not.toHaveProperty("x-artifact-legacy");
  });
  it("takes the issue date from the version, never from the clock", () => {
    vi.useFakeTimers({toFake: ["Date"]});
    try {
      vi.setSystemTime(new Date("2027-01-01T12:00:00Z"));
      expect(revisionIssuedOn(served(pinned()).revision)).toBe("2026-09-20");
      expect(revisionIssuedOn(served(legacy()).revision, "2026-09-08T23:30:00-03:00")).toBe("2026-09-09");
      expect(revisionIssuedOn(served(legacy()).revision)).toBe("2026-09-26");
      expect(revisionIssuedOn(served(pinned({rendered: undefined, format: "json", createdAt: "2026-09-24T10:00:00+00:00"})).revision, "2020-01-01T00:00:00Z")).toBe("2026-09-24");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("stored bytes through the upload grant", () => {
  const organizationId = "40000000-0000-4000-8000-000000000001";
  const grantPath = uploadGrantObjectPath({organizationId, workId, sha256: bytesSha, format: "xlsx"});
  const rotatedPath = `${organizationId}/${workId}/revocable-6a1e8f7c-2b3d-4e5f-8a9b-0c1d2e3f4a5b/${bytesSha}.xlsx`;
  const object = (overrides: Partial<GovernedObject> = {}): GovernedObject => ({
    organizationId, workId, bucket: "case-artifacts", path: grantPath, sha256: bytesSha, byteLength: bytes.byteLength, format: "xlsx", ...overrides,
  });
  const storage = (answer: (path: string) => {data: unknown; error: unknown}) => {
    const paths: string[] = [];
    const double = supabaseDouble({storage: {"case-artifacts": (path) => {paths.push(path); return answer(path);}}});
    return {client: double.client as never, paths};
  };
  const found = (objects: Record<string, Uint8Array>) => (path: string) => objects[path]
    ? {data: new Blob([new Uint8Array(objects[path]!)]), error: null}
    : {data: null, error: {message: "Object not found", statusCode: "404"}};

  it("addresses the object exactly as the grant command writes it", () => {
    expect(grantPath).toBe(`${organizationId}/${workId}/materials/${bytesSha}.xlsx`);
    const revision = served(pinned({rendered: undefined, format: "xlsx", stored: {sha256: bytesSha, byteLength: bytes.byteLength, bucket: "case-artifacts", path: grantPath}})).revision;
    expect(storedRevisionObject(revision, {organizationId, workId})).toEqual(object());
    expect(storedRevisionObject(served(pinned()).revision, {organizationId, workId})).toBeNull();
  });

  it("serves the object at the grant's address only when its size and sha256 match", async () => {
    const {client, paths} = storage(found({[grantPath]: bytes}));
    expect(await readGovernedObject(client, object())).toEqual({ok: true, bytes, sha256: bytesSha, byteLength: bytes.byteLength});
    expect(paths).toEqual([grantPath]);
  });

  it("reports a rotated or missing object as missing, and never looks for it elsewhere", async () => {
    const rotated = storage(found({[rotatedPath]: bytes}));
    expect(await readGovernedObject(rotated.client, object())).toEqual({ok: false, error: "artifact_object_missing"});
    expect(rotated.paths).toEqual([grantPath]);
    const named = storage(found({[rotatedPath]: bytes}));
    expect(await readGovernedObject(named.client, object({path: rotatedPath}))).toEqual({ok: false, error: "artifact_object_missing"});
    expect(named.paths).toEqual([]);
    for (const error of [{message: "Object not found"}, {message: "not_found", status: 404}, {message: "The specified key does not exist.", code: "NoSuchKey"}]) {
      const {client} = storage(() => ({data: null, error}));
      expect(await readGovernedObject(client, object()), JSON.stringify(error)).toEqual({ok: false, error: "artifact_object_missing"});
    }
  });

  it("refuses another size or another hash as a bytes mismatch, and a storage failure as unavailable", async () => {
    const longer = storage(found({[grantPath]: new Uint8Array([...bytes, 0])}));
    expect(await readGovernedObject(longer.client, object())).toEqual({ok: false, error: "artifact_bytes_mismatch"});
    const altered = new Uint8Array(bytes); altered[0] = 0;
    const sameSize = storage(found({[grantPath]: altered}));
    expect(await readGovernedObject(sameSize.client, object())).toEqual({ok: false, error: "artifact_bytes_mismatch"});
    const down = storage(() => ({data: null, error: {message: "upstream timeout", statusCode: "503"}}));
    expect(await readGovernedObject(down.client, object())).toEqual({ok: false, error: "artifact_object_unavailable"});
  });

  it("does not read an address the grant command never writes", async () => {
    const {client, paths} = storage(found({[grantPath]: bytes}));
    for (const overrides of [{bucket: "document-layers"}, {format: "pdf"}, {sha256: "A".repeat(64)}, {workId: "10000000-0000-4000-8000-000000000999"}, {organizationId: "40000000-0000-4000-8000-000000000999"}]) {
      expect(await readGovernedObject(client, object(overrides)), JSON.stringify(overrides)).toEqual({ok: false, error: "artifact_object_missing"});
    }
    expect(paths).toEqual([]);
  });
});
