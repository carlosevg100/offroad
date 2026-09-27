import "server-only";

import {createHash} from "node:crypto";

import {
  artifactAudienceSchema,
  artifactBlockSchema,
  artifactKindSchema,
  artifactManifestSchema,
  artifactRevisionSchema,
  blockKindSchema,
  legacyTableSchema,
  manifestLegacySchema,
  revisionOriginSchema,
  type ArtifactAudience,
  type ArtifactBlock,
  type ArtifactFormat,
  type ArtifactKind,
  type ArtifactRevision,
  type Freshness,
  type LegacyTable,
  type ManifestLegacy,
  type ReleaseState,
} from "@offroad/domain-contracts";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

import type {Database} from "@/types/database";

import {artifactRendererEntry, type ArtifactRendererId} from "./artifact-renderers";

/**
 * The one authorized reader of artifact revisions for the web (stage 19, increment 3).
 *
 * It calls `read_artifact_revision_v1` or `read_artifact_head_v1`, parses the answer with the
 * contract of increment 1 and says whether the exact revision may be served. It never widens what
 * the database decided: the RPC refuses a reader without work access (`artifact_revision_not_found`,
 * the same answer as a revision that does not exist) and evaluates release and freshness; this
 * module only refuses more (a withheld manifest, a blocked release, an external audience the
 * database did not release) and never serves what the database withheld.
 */

export const artifactReadSchemaVersion = "artifact-read.2026.09.26-v1";

const uuid = z.uuid();
const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime({offset: true});
const linkKindSchema = z.enum(["source_version", "execution", "institutional_result", "method_release", "assumption_slot", "artifact_revision"]);

/** The RPC answer exactly as `private.read_artifact_revision_v1` builds it; any drift fails closed. */
const artifactReadRowSchema = z.strictObject({
  schemaVersion: z.literal(artifactReadSchemaVersion),
  artifact: z.strictObject({
    id: uuid,
    workId: uuid,
    kind: artifactKindSchema,
    subject: z.string().min(1).max(300),
    headRevisionId: uuid.nullable(),
    legacyOrigin: z.strictObject({table: legacyTableSchema, id: uuid}).nullable(),
    createdAt: timestamp,
  }),
  revision: z.strictObject({
    id: uuid,
    revisionNo: z.number().int().positive(),
    previousRevisionId: uuid.nullable(),
    audience: artifactAudienceSchema,
    origin: revisionOriginSchema,
    manifest: z.unknown(),
    manifestFingerprint: hex64,
    contentSha256: hex64.nullable(),
    byteLength: z.number().int().positive().nullable(),
    legacyRef: manifestLegacySchema.nullable(),
    createdBy: uuid.nullable(),
    createdAt: timestamp,
  }),
  // SQL compares the head pointer with the revision id; a missing pointer yields null, never true.
  isHead: z.boolean().nullable(),
  blocks: z.array(z.strictObject({
    id: uuid,
    blockNo: z.number().int().positive(),
    blockKey: z.string(),
    kind: blockKindSchema,
    content: z.unknown(),
    claims: z.unknown(),
    contentFingerprint: hex64,
  })),
  links: z.array(z.strictObject({id: uuid, kind: linkKindSchema, blockId: uuid.nullable()})),
  release: z.enum(["internal", "released", "blocked"]),
  freshness: z.enum(["current", "stale", "unknown"]),
  restriction: z.discriminatedUnion("kind", [
    z.strictObject({kind: z.literal("source_rights"), linkIds: z.array(uuid), unresolvedRevisionIds: z.array(uuid)}),
    z.strictObject({kind: z.literal("release"), release: z.literal("blocked")}),
  ]).nullable(),
});

export type ArtifactIdentity = {
  readonly id: string;
  readonly workId: string;
  readonly kind: ArtifactKind;
  readonly subject: string;
  readonly headRevisionId: string | null;
  readonly legacyOrigin: {readonly table: LegacyTable; readonly id: string} | null;
};
/** A link as the reader returns it: identity and kind, never the target (the links table is closed to clients). */
export type ArtifactLinkSummary = {readonly id: string; readonly kind: z.infer<typeof linkKindSchema>; readonly blockId: string | null};
export type ArtifactRestriction = NonNullable<z.infer<typeof artifactReadRowSchema>["restriction"]>;
/** What always comes back, even when the manifest and the blocks are withheld. */
export type RevisionSummary = {
  readonly id: string;
  readonly revisionNo: number;
  readonly audience: ArtifactAudience;
  readonly manifestFingerprint: string;
  readonly contentSha256: string | null;
  readonly legacyRef: ManifestLegacy | null;
  readonly createdAt: string;
};

type ReadCommon = {
  readonly artifact: ArtifactIdentity;
  readonly summary: RevisionSummary;
  readonly isHead: boolean;
  readonly links: readonly ArtifactLinkSummary[];
  readonly release: ReleaseState;
  readonly freshness: Freshness;
};
export type ArtifactRead =
  | (ReadCommon & {readonly withheld: false; readonly revision: ArtifactRevision; readonly blocks: readonly ArtifactBlock[]; readonly restriction: null})
  | (ReadCommon & {readonly withheld: true; readonly revision: null; readonly blocks: readonly []; readonly restriction: ArtifactRestriction});

export type ArtifactReadError = "artifact_revision_not_found" | "artifact_read_failed" | "artifact_read_invalid";
export type ArtifactReadResult = {readonly ok: true; readonly read: ArtifactRead} | {readonly ok: false; readonly error: ArtifactReadError};

/** Parses one RPC answer into the contract types; a withheld manifest yields no revision object at all. */
export function parseArtifactRead(value: unknown): ArtifactReadResult {
  const parsed = artifactReadRowSchema.safeParse(value);
  if (!parsed.success) return {ok: false, error: "artifact_read_invalid"};
  const row = parsed.data;
  const artifact: ArtifactIdentity = {
    id: row.artifact.id, workId: row.artifact.workId, kind: row.artifact.kind, subject: row.artifact.subject,
    headRevisionId: row.artifact.headRevisionId, legacyOrigin: row.artifact.legacyOrigin,
  };
  const summary: RevisionSummary = {
    id: row.revision.id, revisionNo: row.revision.revisionNo, audience: row.revision.audience,
    manifestFingerprint: row.revision.manifestFingerprint, contentSha256: row.revision.contentSha256,
    legacyRef: row.revision.legacyRef, createdAt: row.revision.createdAt,
  };
  // The database reports its own head flag; a flag that contradicts the pointer is a broken answer.
  const isHead = row.isHead === true;
  if (isHead !== (row.artifact.headRevisionId === row.revision.id)) return {ok: false, error: "artifact_read_invalid"};
  const common = {artifact, summary, isHead, links: row.links, release: row.release, freshness: row.freshness};
  if (row.restriction !== null || row.revision.manifest === null) {
    // Withheld: the database returns no manifest and no block, and says why. Both must agree.
    if (row.restriction === null || row.revision.manifest !== null || row.blocks.length > 0) return {ok: false, error: "artifact_read_invalid"};
    return {ok: true, read: {...common, withheld: true, revision: null, blocks: [], restriction: row.restriction}};
  }
  const manifest = artifactManifestSchema.safeParse(row.revision.manifest);
  if (!manifest.success) return {ok: false, error: "artifact_read_invalid"};
  const revision = artifactRevisionSchema.safeParse({
    id: row.revision.id, artifactId: row.artifact.id, revisionNo: row.revision.revisionNo, previousRevisionId: row.revision.previousRevisionId,
    manifestFingerprint: row.revision.manifestFingerprint, audience: row.revision.audience, origin: row.revision.origin,
    manifest: manifest.data, contentSha256: row.revision.contentSha256, byteLength: row.revision.byteLength,
    createdAt: row.revision.createdAt, legacyRef: row.revision.legacyRef,
  });
  if (!revision.success || manifest.data.kind !== row.artifact.kind) return {ok: false, error: "artifact_read_invalid"};
  const blocks: ArtifactBlock[] = [];
  for (const block of row.blocks) {
    const parsedBlock = artifactBlockSchema.safeParse({...block, revisionId: row.revision.id});
    if (!parsedBlock.success) return {ok: false, error: "artifact_read_invalid"};
    blocks.push(parsedBlock.data);
  }
  return {ok: true, read: {...common, withheld: false, revision: revision.data, blocks, restriction: null}};
}

function readError(error: {code?: string; message?: string} | null): ArtifactReadError {
  return error?.code === "P0002" || error?.message?.includes("artifact_revision_not_found") ? "artifact_revision_not_found" : "artifact_read_failed";
}

/** The exact revision. Without read access to its work the answer is the same as for a revision that does not exist. */
export async function readArtifactRevision(supabase: SupabaseClient<Database>, input: {revisionId: string}): Promise<ArtifactReadResult> {
  if (!uuid.safeParse(input.revisionId).success) return {ok: false, error: "artifact_revision_not_found"};
  const {data, error} = await supabase.rpc("read_artifact_revision_v1", {p_revision_id: input.revisionId});
  if (error) return {ok: false, error: readError(error)};
  const result = parseArtifactRead(data);
  return result.ok && result.read.summary.id !== input.revisionId ? {ok: false, error: "artifact_read_invalid"} : result;
}

/** The current revision of a work, kind and subject: the head pointer decides, never the newest by date. */
export async function readArtifactHead(
  supabase: SupabaseClient<Database>,
  input: {workId: string; kind: ArtifactKind; subject: string},
): Promise<ArtifactReadResult> {
  if (!uuid.safeParse(input.workId).success) return {ok: false, error: "artifact_revision_not_found"};
  const {data, error} = await supabase.rpc("read_artifact_head_v1", {p_work_id: input.workId, p_kind: input.kind, p_subject: input.subject});
  if (error) return {ok: false, error: readError(error)};
  const result = parseArtifactRead(data);
  if (!result.ok) return result;
  const {artifact} = result.read;
  return artifact.workId !== input.workId || artifact.kind !== input.kind || artifact.subject !== input.subject || !result.read.isHead
    ? {ok: false, error: "artifact_read_invalid"} : result;
}

/** A revision of another work, kind or subject is not this route's revision. */
export function revisionBelongsTo(read: ArtifactRead, target: {workId: string; kind: ArtifactKind; subject: string}): boolean {
  return read.artifact.workId === target.workId && read.artifact.kind === target.kind && read.artifact.subject === target.subject;
}

// Serving ------------------------------------------------------------------------------------

export type ArtifactRefusal = "artifact_release_blocked" | "artifact_source_restricted";
export type ArtifactServing =
  | {readonly serve: true; readonly revision: ArtifactRevision; readonly blocks: readonly ArtifactBlock[]; readonly release: Exclude<ReleaseState, "blocked">}
  | {readonly serve: false; readonly refusal: ArtifactRefusal};

/**
 * `releaseState` of the contract with the database's own evaluation: every audience needs read
 * access to the work (the RPC already refused without it); an external audience is served only
 * `released`; internal and advisor audiences are served `internal` or `released`. A withheld
 * manifest is never served, and an answer that would be looser than this rule is refused.
 */
export function artifactServing(read: ArtifactRead): ArtifactServing {
  if (read.withheld) return {serve: false, refusal: read.restriction.kind === "source_rights" ? "artifact_source_restricted" : "artifact_release_blocked"};
  if (read.release === "blocked") return {serve: false, refusal: "artifact_release_blocked"};
  if (read.revision.audience === "external" && read.release !== "released") return {serve: false, refusal: "artifact_release_blocked"};
  return {serve: true, revision: read.revision, blocks: read.blocks, release: read.release};
}

// Legacy, renderer and bytes -----------------------------------------------------------------

/** A legacy revision (a row of a historical store) whose manifest pins no bytes: served without any hash claim. */
export function legacyUnpinned(revision: ArtifactRevision): boolean {
  return revision.legacyRef !== null && revision.manifest.bytes === null;
}

export type ArtifactRendererResolution =
  | {readonly ok: true; readonly source: "storage"; readonly bucket: string; readonly path: string; readonly format: ArtifactFormat}
  | {readonly ok: true; readonly source: "rendered"; readonly renderer: ArtifactRendererId; readonly format: ArtifactFormat; readonly deterministicInputs: Readonly<Record<string, string | number | boolean | null>>}
  /** No bytes pinned: the route renders with its own renderer for the format and verifies nothing. */
  | {readonly ok: true; readonly source: "unpinned"; readonly legacy: ManifestLegacy | null}
  | {readonly ok: false; readonly error: "artifact_renderer_unknown" | "artifact_renderer_version_mismatch" | "artifact_format_missing"};

/**
 * Maps the manifest's bytes to the package function that produces them: stored bytes to the object
 * they name, rendered bytes to a registered renderer whose current version is the pinned one. An
 * unknown renderer or another version cannot promise the pinned bytes and is refused.
 */
export function resolveRenderer(revision: ArtifactRevision): ArtifactRendererResolution {
  const {bytes, format} = revision.manifest;
  if (bytes === null) return {ok: true, source: "unpinned", legacy: revision.legacyRef};
  if (format === null) return {ok: false, error: "artifact_format_missing"};
  if ("storage" in bytes) return {ok: true, source: "storage", bucket: bytes.storage.bucket, path: bytes.storage.path, format};
  const entry = artifactRendererEntry(bytes.rendered.renderer);
  if (!entry || entry.format !== format) return {ok: false, error: "artifact_renderer_unknown"};
  if (entry.version !== bytes.rendered.rendererVersion) return {ok: false, error: "artifact_renderer_version_mismatch"};
  return {ok: true, source: "rendered", renderer: entry.id, format, deterministicInputs: bytes.rendered.deterministicInputs};
}

/** What the route produced: the format and the selectors of this one rendering (locale, material kind). */
export type ArtifactRendering = {readonly format: ArtifactFormat; readonly selectors?: Readonly<Record<string, string>>};
export type BytesVerification =
  | {readonly status: "verified"; readonly sha256: string; readonly byteLength: number}
  | {readonly status: "unpinned"}
  | {readonly status: "mismatch"; readonly error: "artifact_bytes_mismatch"};

const selectorKeys = ["locale", "materialKind"] as const;

/** Whether the manifest's pinned bytes are the bytes of this rendering (same format and selectors). */
export function pinnedRenderingMatches(revision: ArtifactRevision, rendering: ArtifactRendering): boolean {
  const {bytes, format} = revision.manifest;
  if (bytes === null || format !== rendering.format) return false;
  if ("storage" in bytes) return true;
  const inputs = bytes.rendered.deterministicInputs;
  return selectorKeys.every((key) => inputs[key] === undefined || inputs[key] === rendering.selectors?.[key]);
}

/**
 * Compares the produced bytes with the manifest. A revision that pins these exact bytes is served
 * only when sha256 and length agree; a revision that pins no bytes, or pins another rendering, makes
 * no claim and nothing is verified.
 */
export function verifyRenderedBytes(revision: ArtifactRevision, bytes: Uint8Array, rendering: ArtifactRendering): BytesVerification {
  const pinned = revision.manifest.bytes;
  if (pinned === null || !pinnedRenderingMatches(revision, rendering)) return {status: "unpinned"};
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return sha256 === pinned.sha256 && bytes.byteLength === pinned.byteLength
    ? {status: "verified", sha256, byteLength: bytes.byteLength}
    : {status: "mismatch", error: "artifact_bytes_mismatch"};
}

/**
 * The response headers of a served revision. `x-artifact-bytes` says whether the served bytes are
 * the ones the revision pins (`pinned`, verified by sha256 and length) or whether nothing was
 * verified (`unpinned`); the hash claim appears only for verified bytes, and a legacy revision says
 * it is a legacy row without pinned bytes.
 */
export function artifactResponseHeaders(read: ArtifactRead & {withheld: false}, verification: BytesVerification): Record<string, string> {
  return {
    "x-artifact-revision": read.revision.id,
    "x-artifact-manifest-fingerprint": read.revision.manifestFingerprint,
    "x-artifact-release": read.release,
    "x-artifact-freshness": read.freshness,
    ...(verification.status === "verified"
      ? {"x-artifact-bytes": "pinned", "x-artifact-content-sha256": verification.sha256}
      : {"x-artifact-bytes": "unpinned"}),
    ...(legacyUnpinned(read.revision) ? {"x-artifact-legacy": "unpinned"} : {}),
  };
}

// Stored bytes -------------------------------------------------------------------------------
//
// Stored bytes exist only for the integration preview. The governed upload writes each file under
// one address, `<organization>/<work>/materials/<sha256>.<format>` in `case-artifacts`, and records it
// in an upload grant (`private.capital_project_material_upload_grants`, closed to clients); the core of
// increment 4 accepts `bytes.storage` only for the path, sha256, size and format of a stored grant of
// the same work. The reader therefore serves the object at the grant's address and nothing else, and
// it reaches that address only through the grant: storage lets a person read a `materials/` path only
// when a stored grant names exactly that path. A moved object (the storage rotation of 1B renamed
// objects to `revocable-<uuid>` without updating grants or manifests) is not at the grant's address,
// so it is reported missing, never looked for elsewhere.

export const governedMaterialBucket = "case-artifacts";
const governedFormats: readonly string[] = ["xlsx", "pptx", "docx"];

/** The object path the upload grant command writes for a work, a content hash and a format. */
export function uploadGrantObjectPath(input: {organizationId: string; workId: string; sha256: string; format: string}): string {
  return `${input.organizationId}/${input.workId}/materials/${input.sha256}.${input.format}`;
}

export type GovernedObject = {
  readonly organizationId: string;
  readonly workId: string;
  readonly bucket: string;
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly format: string;
};
export type StoredObjectFailure = "artifact_object_missing" | "artifact_bytes_mismatch" | "artifact_object_unavailable";
export type StoredObjectRead =
  | {readonly ok: true; readonly bytes: Uint8Array<ArrayBuffer>; readonly sha256: string; readonly byteLength: number}
  | {readonly ok: false; readonly error: StoredObjectFailure};

/** The governed object a revision's manifest names, for the work it belongs to; null when the manifest pins no stored bytes. */
export function storedRevisionObject(revision: ArtifactRevision, scope: {organizationId: string; workId: string}): GovernedObject | null {
  const {bytes, format} = revision.manifest;
  if (bytes === null || !("storage" in bytes) || format === null) return null;
  return {...scope, bucket: bytes.storage.bucket, path: bytes.storage.path, sha256: bytes.sha256, byteLength: bytes.byteLength, format};
}

function storageSaysMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const {status, statusCode, code, message} = error as {status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown};
  return status === 404 || statusCode === "404" || code === "NoSuchKey" || (typeof message === "string" && /not[ _]found/i.test(message));
}

/**
 * Reads a stored object through its upload grant: the address must be the one the grant command
 * writes for this work, hash and format; the object must exist there; its size and then its sha256
 * must match before a byte is served. Each refusal is typed: `artifact_object_missing` (no object at
 * the grant's address, or one this person cannot read, which storage does not distinguish),
 * `artifact_bytes_mismatch` (another size or hash), `artifact_object_unavailable` (storage failed).
 */
export async function readGovernedObject(supabase: SupabaseClient<Database>, object: GovernedObject): Promise<StoredObjectRead> {
  const address = uploadGrantObjectPath(object);
  if (!governedFormats.includes(object.format) || !/^[a-f0-9]{64}$/.test(object.sha256)
    || object.bucket !== governedMaterialBucket || object.path !== address) return {ok: false, error: "artifact_object_missing"};
  const {data, error} = await supabase.storage.from(governedMaterialBucket).download(address);
  if (error) return {ok: false, error: storageSaysMissing(error) ? "artifact_object_missing" : "artifact_object_unavailable"};
  if (!data) return {ok: false, error: "artifact_object_missing"};
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength !== object.byteLength) return {ok: false, error: "artifact_bytes_mismatch"};
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== object.sha256) return {ok: false, error: "artifact_bytes_mismatch"};
  return {ok: true, bytes, sha256, byteLength: bytes.byteLength};
}

/** The date a version was issued: pinned by the renderer inputs, else the historical row's own date for a legacy revision, else the revision's. */
export function revisionIssuedOn(revision: ArtifactRevision, legacyRowCreatedAt?: string | null): string {
  const pinned = revision.manifest.bytes && "rendered" in revision.manifest.bytes ? revision.manifest.bytes.rendered.deterministicInputs.issuedOn : undefined;
  if (typeof pinned === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pinned)) return pinned;
  const source = revision.legacyRef !== null && legacyRowCreatedAt ? legacyRowCreatedAt : revision.createdAt;
  const date = new Date(source);
  if (!Number.isFinite(date.getTime())) throw new Error("artifact_revision_date_invalid");
  return date.toISOString().slice(0, 10);
}
