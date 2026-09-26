import {createHash} from "node:crypto";

import {artifactManifestSchemaVersion, type ArtifactAudience, type ArtifactKind, type LegacyTable} from "@offroad/domain-contracts";

/**
 * Synthetic answers of `read_artifact_revision_v1` and `read_artifact_head_v1`, shaped exactly as
 * `private.read_artifact_revision_v1` builds them, for the reader and route tests. The legacy shape
 * is the projection of increment 2b (audience internal, no bytes, no block, no link); the pinned
 * shape is what a command write with rendered bytes returns.
 */

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

export type ReadFixtureInput = {
  workId: string;
  kind: ArtifactKind;
  subject: string;
  revisionId: string;
  artifactId?: string;
  revisionNo?: number;
  audience?: ArtifactAudience;
  release?: "internal" | "released" | "blocked";
  freshness?: "current" | "stale" | "unknown";
  isHead?: boolean;
  createdAt?: string;
  format?: string | null;
  institutionalResult?: {id: string; configurationFingerprint: string} | null;
  template?: {templateVersionId: string; fingerprint: string} | null;
  /** A legacy row: the projection of a historical store. */
  legacy?: {table: LegacyTable; id: string; fingerprint: string};
  /** Rendered bytes pinned by the producer. */
  rendered?: {sha256: string; byteLength: number; renderer: string; rendererVersion: string; deterministicInputs: Record<string, string>};
  stored?: {sha256: string; byteLength: number; bucket: string; path: string};
  blocks?: Array<{blockKey: string; kind: string; content: Record<string, unknown>; claims: Array<Record<string, unknown>>}>;
  sources?: Array<{sourceVersionId: string; rightsVersionId: string | null}>;
  traces?: string[];
  /** The execution an execution_result revision names, as the commit writes it. */
  execution?: {executionId: string; resultFingerprint: string; inputFingerprint: string};
  restriction?: {kind: "source_rights"; linkIds: string[]; unresolvedRevisionIds: string[]} | {kind: "release"; release: "blocked"} | null;
};

export function artifactReadFixture(input: ReadFixtureInput) {
  const audience = input.audience ?? "internal";
  const legacy = input.legacy ? {...input.legacy, evidence: [{key: "status", value: "draft"}]} : null;
  const bytes = input.rendered
    ? {sha256: input.rendered.sha256, byteLength: input.rendered.byteLength, rendered: {renderer: input.rendered.renderer, rendererVersion: input.rendered.rendererVersion, deterministicInputs: input.rendered.deterministicInputs}}
    : input.stored ? {sha256: input.stored.sha256, byteLength: input.stored.byteLength, storage: {bucket: input.stored.bucket, path: input.stored.path}} : null;
  const blocks = (input.blocks ?? []).map((block, index) => ({
    id: `${input.revisionId.slice(0, 24)}${String(index + 1).padStart(12, "0")}`,
    blockNo: index + 1, blockKey: block.blockKey, kind: block.kind, content: block.content, claims: block.claims,
    contentFingerprint: sha(JSON.stringify(block.content)),
  }));
  const manifest = {
    schemaVersion: artifactManifestSchemaVersion,
    kind: input.kind,
    audience,
    format: input.format === undefined ? (bytes ? "docx" : "json") : input.format,
    bytes,
    method: null,
    execution: input.execution ?? null,
    inputSnapshot: null,
    institutionalResult: input.institutionalResult ?? null,
    sources: input.sources ?? [],
    claims: blocks.filter((block) => block.claims.length > 0).map((block) => ({blockKey: block.blockKey, claimIds: block.claims.map((claim) => claim.claimId)})),
    traces: input.traces ?? [],
    template: input.template ?? null,
    provenance: {producer: legacy ? `legacy:${legacy.table}` : "person", jobId: null, taskRunId: null, messageId: null, capability: null},
    legacy,
  };
  const restriction = input.restriction === undefined
    ? (input.release === "blocked" ? {kind: "release" as const, release: "blocked" as const} : null)
    : input.restriction;
  const withheld = restriction !== null;
  const artifactId = input.artifactId ?? `${input.revisionId.slice(0, 24)}aaaaaaaaaaaa`;
  const isHead = input.isHead ?? true;
  return {
    schemaVersion: "artifact-read.2026.09.26-v1",
    artifact: {
      id: artifactId, workId: input.workId, kind: input.kind, subject: input.subject,
      headRevisionId: isHead ? input.revisionId : "9e000000-0000-4000-8000-000000000001",
      legacyOrigin: legacy ? {table: legacy.table, id: legacy.id} : null, createdAt: "2026-09-26T18:39:57.123456+00:00",
    },
    revision: {
      id: input.revisionId, revisionNo: input.revisionNo ?? 1, previousRevisionId: (input.revisionNo ?? 1) > 1 ? "9e000000-0000-4000-8000-000000000002" : null,
      audience, origin: legacy ? "legacy" : "person", manifest: withheld ? null : manifest,
      manifestFingerprint: sha(JSON.stringify(manifest)), contentSha256: bytes?.sha256 ?? null, byteLength: bytes?.byteLength ?? null,
      legacyRef: legacy, createdBy: legacy ? null : "9e000000-0000-4000-8000-000000000003", createdAt: input.createdAt ?? "2026-09-26T18:39:57.123456+00:00",
    },
    isHead,
    blocks: withheld ? [] : blocks,
    links: (input.sources ?? []).map((_, index) => ({id: `9f000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, kind: "source_version", blockId: null})),
    release: input.release ?? "internal",
    freshness: input.freshness ?? "current",
    restriction,
  };
}

type RpcAnswer = {data: unknown; error: unknown};
const notFound: RpcAnswer = {data: null, error: {code: "P0002", message: "artifact_revision_not_found"}};

/**
 * An `rpc` double for the two readers: the head of each (work, kind, subject) and the exact
 * revisions by id; anything else falls through to `fallback`, so a route test keeps its other RPCs.
 */
export function artifactRpc(
  reads: readonly ReturnType<typeof artifactReadFixture>[],
  fallback: (name: string, args: Record<string, unknown>) => Promise<RpcAnswer> | RpcAnswer = () => ({data: null, error: {code: "42883", message: "unexpected rpc"}}),
) {
  return async (name: string, args: Record<string, unknown>): Promise<RpcAnswer> => {
    if (name === "read_artifact_revision_v1") {
      const read = reads.find((candidate) => candidate.revision.id === args.p_revision_id);
      return read ? {data: structuredClone(read), error: null} : notFound;
    }
    if (name === "read_artifact_head_v1") {
      const read = reads.find((candidate) => candidate.isHead && candidate.artifact.workId === args.p_work_id
        && candidate.artifact.kind === args.p_kind && candidate.artifact.subject === args.p_subject);
      return read ? {data: structuredClone(read), error: null} : notFound;
    }
    return fallback(name, args);
  };
}
