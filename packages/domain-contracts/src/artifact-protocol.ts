import {z} from "zod";

import {documentWorkProductSchema, type DocumentWorkProduct} from "./document-work-product";

/**
 * Stage 19 artifact protocol, the pure domain contract.
 *
 * One artifact has immutable, numbered revisions. Each revision is composed of ordered blocks
 * that carry their material claims, and is described by a manifest that names kind, audience,
 * format, bytes, method, execution, input snapshot, institutional result, sources, claims
 * summary, traces, template, provenance and legacy label. Derivation is anchored in dependency
 * links that come from the manifest, never from block text.
 *
 * This module holds no persistence, no reader and no route. SQL computes the manifest and block
 * fingerprints on write (sha256 of jsonb::text) and this contract only carries them; legacy
 * fingerprints are kept verbatim and never recalculated. Every rule here is deterministic so the
 * SQL validator, the worker and the web can mirror it and be checked against it.
 */

export const artifactManifestSchemaVersion = "artifact-manifest.2026.09.26-v1";

export const artifactKindSchema = z.enum([
  "answer", "material", "workbook", "model_result", "work_product", "execution_result", "presentation", "document",
]);
export const artifactAudienceSchema = z.enum(["internal", "advisor", "external"]);
export const revisionOriginSchema = z.enum(["worker", "person", "legacy"]);
export const blockKindSchema = z.enum(["section", "paragraph", "table", "chart", "number", "cell_region"]);
export const artifactFormatSchema = z.enum(["json", "text", "markdown", "html", "xlsx", "pptx", "docx", "pdf"]);
export const legacyTableSchema = z.enum([
  "capital_project_artifacts", "case_artifact_manifests", "institutional_model_results", "deal_state_objects",
]);

export type ArtifactKind = z.infer<typeof artifactKindSchema>;
export type ArtifactAudience = z.infer<typeof artifactAudienceSchema>;
export type RevisionOrigin = z.infer<typeof revisionOriginSchema>;
export type BlockKind = z.infer<typeof blockKindSchema>;
export type ArtifactFormat = z.infer<typeof artifactFormatSchema>;
export type LegacyTable = z.infer<typeof legacyTableSchema>;

/** Value objects of this protocol are frozen after construction; the types say so as well. */
export type DeepReadonly<T> = T extends (infer U)[] ? ReadonlyArray<DeepReadonly<U>>
  : T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepReadonly<U>>
    : T extends object ? {readonly [K in keyof T]: DeepReadonly<T[K]>} : T;

export function freezeArtifactValue<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) freezeArtifactValue(inner);
  }
  return value as DeepReadonly<T>;
}

const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.uuid();
const text = (max: number) => z.string().min(1).max(max);
const timestamp = z.iso.datetime({offset: true});

type JsonValue = string | number | boolean | null | JsonValue[] | {[key: string]: JsonValue};
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema),
]));

function issue(context: z.RefinementCtx, message: string, path: PropertyKey[] = []): void {
  context.addIssue({code: "custom", path, message});
}

function duplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

/** Sorted-key serialization used only for structural equality inside this module. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, inner]) => `${JSON.stringify(key)}:${stable(inner)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// Claims and blocks --------------------------------------------------------------------------

export const claimIdSchema = text(160);
/** Stable across revisions of the same artifact; a block key never carries whitespace. */
export const blockKeySchema = z.string().regex(/^\S{1,160}$/);

export const artifactClaimSchema = z.strictObject({
  claimId: claimIdSchema,
  kind: z.enum(["fact", "calculation", "judgment", "public_source"]),
  value: z.union([z.string().max(2000), z.number().finite(), z.boolean()]).nullable(),
  unit: text(80).nullable(),
  period: text(80).nullable(),
  supportIds: z.array(text(160)).max(200),
});

export const artifactBlockSchema = z.strictObject({
  id: uuid,
  revisionId: uuid,
  blockNo: z.number().int().positive(),
  blockKey: blockKeySchema,
  kind: blockKindSchema,
  content: z.record(z.string(), jsonValueSchema),
  claims: z.array(artifactClaimSchema).max(500),
  contentFingerprint: hex64,
}).superRefine((block, context) => {
  if (duplicates(block.claims.map((claim) => claim.claimId))) issue(context, "duplicate_claim_id", ["claims"]);
});

export type ArtifactClaim = DeepReadonly<z.infer<typeof artifactClaimSchema>>;
export type ArtifactBlock = DeepReadonly<z.infer<typeof artifactBlockSchema>>;

// Manifest v1 --------------------------------------------------------------------------------

const scalarSchema = z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]);

/** Stored bytes point at an object; rendered bytes name the deterministic renderer and its inputs. */
export const manifestBytesSchema = z.union([
  z.strictObject({
    sha256: hex64,
    byteLength: z.number().int().positive(),
    storage: z.strictObject({bucket: text(100), path: text(1000)}),
  }),
  z.strictObject({
    sha256: hex64,
    byteLength: z.number().int().positive(),
    rendered: z.strictObject({
      renderer: text(200),
      rendererVersion: text(200),
      deterministicInputs: z.record(z.string().min(1).max(100), scalarSchema)
        .refine((inputs) => Object.keys(inputs).length > 0, {message: "deterministic_inputs_required"}),
    }),
  }),
]);

/** Same pair as the four pinning tables. A null rights version means the producer did not pin one. */
export const manifestSourceSchema = z.strictObject({sourceVersionId: uuid, rightsVersionId: uuid.nullable()});
export const manifestClaimsSummarySchema = z.strictObject({blockKey: blockKeySchema, claimIds: z.array(claimIdSchema).min(1).max(1000)});
export const legacyEvidenceSchema = z.strictObject({key: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/), value: z.string().max(2000)});
export const manifestLegacySchema = z.strictObject({
  table: legacyTableSchema,
  id: uuid,
  fingerprint: hex64,
  evidence: z.array(legacyEvidenceSchema).max(200),
});

export const artifactManifestSchema = z.strictObject({
  schemaVersion: z.literal(artifactManifestSchemaVersion),
  kind: artifactKindSchema,
  audience: artifactAudienceSchema,
  format: artifactFormatSchema.nullable(),
  bytes: manifestBytesSchema.nullable(),
  method: z.strictObject({
    procedureId: text(200), platformReleaseId: text(200), houseReleaseId: uuid.nullable(), version: text(80),
  }).nullable(),
  execution: z.strictObject({executionId: uuid, resultFingerprint: hex64, inputFingerprint: hex64}).nullable(),
  inputSnapshot: z.strictObject({fingerprint: hex64}).nullable(),
  institutionalResult: z.strictObject({id: uuid, configurationFingerprint: hex64}).nullable(),
  sources: z.array(manifestSourceSchema).max(1000),
  claims: z.array(manifestClaimsSummarySchema).max(1000),
  traces: z.array(text(200)).max(2000),
  template: z.strictObject({templateVersionId: text(200), fingerprint: hex64}).nullable(),
  provenance: z.strictObject({
    producer: text(200), jobId: uuid.nullable(), taskRunId: uuid.nullable(), messageId: uuid.nullable(), capability: text(120).nullable(),
  }),
  legacy: manifestLegacySchema.nullable(),
}).superRefine((manifest, context) => {
  if (manifest.bytes !== null && manifest.format === null) issue(context, "bytes_without_format", ["format"]);
  if (manifest.kind === "execution_result" && manifest.execution === null) issue(context, "execution_result_without_execution", ["execution"]);
  if (manifest.kind === "model_result" && manifest.institutionalResult === null) issue(context, "model_result_without_institutional_result", ["institutionalResult"]);
  // A legacy label never carries links the historical row does not have.
  if (manifest.legacy !== null && (manifest.method !== null || manifest.execution !== null || manifest.inputSnapshot !== null)) {
    issue(context, "legacy_with_fabricated_links", ["legacy"]);
  }
  if (duplicates(manifest.sources.map((source) => source.sourceVersionId))) issue(context, "duplicate_source", ["sources"]);
  if (duplicates(manifest.claims.map((entry) => entry.blockKey))) issue(context, "duplicate_claims_block", ["claims"]);
  if (duplicates(manifest.traces)) issue(context, "duplicate_trace", ["traces"]);
});

export type ArtifactManifest = DeepReadonly<z.infer<typeof artifactManifestSchema>>;
export type ManifestSource = DeepReadonly<z.infer<typeof manifestSourceSchema>>;
export type ManifestBytes = DeepReadonly<z.infer<typeof manifestBytesSchema>>;
export type ManifestLegacy = DeepReadonly<z.infer<typeof manifestLegacySchema>>;
export type ManifestProvenance = ArtifactManifest["provenance"];

// Artifact and revision ----------------------------------------------------------------------

export const artifactSchema = z.strictObject({
  id: uuid,
  organizationId: uuid,
  workId: uuid,
  kind: artifactKindSchema,
  subject: text(300),
  legacyOrigin: z.strictObject({table: legacyTableSchema, id: uuid}).nullable(),
  /** Written only by the command. Null means the artifact has no revision yet. */
  headRevisionId: uuid.nullable(),
});
export type Artifact = DeepReadonly<z.infer<typeof artifactSchema>>;

const revisionDraftShape = {
  audience: artifactAudienceSchema,
  origin: revisionOriginSchema,
  manifest: artifactManifestSchema,
  contentSha256: hex64.nullable(),
  byteLength: z.number().int().positive().nullable(),
  createdAt: timestamp,
  legacyRef: manifestLegacySchema.nullable(),
};

const revisionDraftBase = z.strictObject(revisionDraftShape);
type RevisionDraftLike = z.infer<typeof revisionDraftBase>;

function refineRevisionDraft(draft: RevisionDraftLike, context: z.RefinementCtx): void {
  if (draft.manifest.audience !== draft.audience) issue(context, "audience_mismatch", ["audience"]);
  const bytes = draft.manifest.bytes;
  if (bytes === null ? (draft.contentSha256 !== null || draft.byteLength !== null)
    : (draft.contentSha256 !== bytes.sha256 || draft.byteLength !== bytes.byteLength)) {
    issue(context, "bytes_mismatch", ["contentSha256"]);
  }
  if (draft.origin === "legacy" && draft.legacyRef === null) issue(context, "legacy_origin_without_ref", ["legacyRef"]);
  if (stable(draft.legacyRef) !== stable(draft.manifest.legacy)) issue(context, "legacy_ref_mismatch", ["legacyRef"]);
}

/** A revision before the writer assigns identity, number, previous pointer and SQL fingerprint. */
export const artifactRevisionDraftSchema = revisionDraftBase.superRefine(refineRevisionDraft);

export const artifactRevisionSchema = z.strictObject({
  id: uuid,
  artifactId: uuid,
  revisionNo: z.number().int().positive(),
  previousRevisionId: uuid.nullable(),
  manifestFingerprint: hex64,
  ...revisionDraftShape,
}).superRefine((revision, context) => {
  refineRevisionDraft(revision, context);
  if ((revision.revisionNo === 1) !== (revision.previousRevisionId === null)) issue(context, "previous_revision_mismatch", ["previousRevisionId"]);
  if (revision.previousRevisionId === revision.id) issue(context, "previous_revision_self", ["previousRevisionId"]);
});

export type ArtifactRevisionDraft = DeepReadonly<z.infer<typeof artifactRevisionDraftSchema>>;
export type ArtifactRevision = DeepReadonly<z.infer<typeof artifactRevisionSchema>>;

export type RevisionSnapshot = {
  readonly revision: ArtifactRevision | ArtifactRevisionDraft;
  readonly blocks: readonly ArtifactBlock[];
};

/** The claims summary the manifest must carry for these blocks, in block order. */
export function revisionClaimsSummary(blocks: readonly ArtifactBlock[]): ReadonlyArray<{readonly blockKey: string; readonly claimIds: readonly string[]}> {
  return freezeArtifactValue([...blocks].sort((a, b) => a.blockNo - b.blockNo)
    .filter((block) => block.claims.length > 0)
    .map((block) => ({blockKey: block.blockKey, claimIds: block.claims.map((claim) => claim.claimId)})));
}

export type RevisionIssue =
  | "block_revision_mismatch" | "block_numbering_gap" | "duplicate_block_key" | "duplicate_claim_id" | "claims_summary_mismatch";

/** Consistency between a revision and its blocks; the SQL validator mirrors these codes. */
export function revisionSnapshotIssues(snapshot: RevisionSnapshot): readonly RevisionIssue[] {
  const issues = new Set<RevisionIssue>();
  const ordered = [...snapshot.blocks].sort((a, b) => a.blockNo - b.blockNo);
  const revisionId = "id" in snapshot.revision ? snapshot.revision.id : null;
  if (revisionId !== null && ordered.some((block) => block.revisionId !== revisionId)) issues.add("block_revision_mismatch");
  if (ordered.some((block, index) => block.blockNo !== index + 1)) issues.add("block_numbering_gap");
  if (duplicates(ordered.map((block) => block.blockKey))) issues.add("duplicate_block_key");
  if (duplicates(ordered.flatMap((block) => block.claims.map((claim) => claim.claimId)))) issues.add("duplicate_claim_id");
  if (stable(snapshot.revision.manifest.claims) !== stable(revisionClaimsSummary(ordered))) issues.add("claims_summary_mismatch");
  return [...issues];
}

// Dependency links ---------------------------------------------------------------------------

const linkAnchor = {revisionId: uuid, blockId: uuid.nullable()};

export const artifactDependencyLinkSchema = z.discriminatedUnion("kind", [
  z.strictObject({...linkAnchor, kind: z.literal("source_version"), sourceVersionId: uuid, rightsVersionId: uuid.nullable()}),
  z.strictObject({...linkAnchor, kind: z.literal("execution"), executionId: uuid}),
  z.strictObject({...linkAnchor, kind: z.literal("institutional_result"), resultId: uuid}),
  z.strictObject({...linkAnchor, kind: z.literal("method_release"), platformReleaseId: text(200), houseReleaseId: uuid.nullable()}),
  z.strictObject({...linkAnchor, kind: z.literal("assumption_slot"), assumptionVersionId: uuid, slotKey: hex64}),
  z.strictObject({...linkAnchor, kind: z.literal("artifact_revision"), derivedFromRevisionId: uuid}),
]);
export type ArtifactDependencyLink = DeepReadonly<z.infer<typeof artifactDependencyLinkSchema>>;

/**
 * Revision-level links are a projection of the manifest. Block text has no say: a citation may be
 * added or removed from a paragraph and the links stay exactly what the manifest declares.
 */
type DependencyLinkInput = z.infer<typeof artifactDependencyLinkSchema>;

export function linksFromManifest(revisionId: string, manifest: ArtifactManifest): readonly ArtifactDependencyLink[] {
  const links: DependencyLinkInput[] = manifest.sources.map((source): DependencyLinkInput => ({
    revisionId, blockId: null, kind: "source_version", sourceVersionId: source.sourceVersionId, rightsVersionId: source.rightsVersionId,
  }));
  if (manifest.execution) links.push({revisionId, blockId: null, kind: "execution", executionId: manifest.execution.executionId});
  if (manifest.institutionalResult) links.push({revisionId, blockId: null, kind: "institutional_result", resultId: manifest.institutionalResult.id});
  if (manifest.method) {
    links.push({revisionId, blockId: null, kind: "method_release", platformReleaseId: manifest.method.platformReleaseId, houseReleaseId: manifest.method.houseReleaseId});
  }
  return freezeArtifactValue(links.map((link) => artifactDependencyLinkSchema.parse(link)));
}

// Derivation and restriction -----------------------------------------------------------------

export type SourceRequirement = {readonly sourceVersionId: string; readonly rightsVersionId: string | null};
export type DerivedSourceRequirements = {
  readonly requirements: readonly SourceRequirement[];
  /** Ancestors the lookup could not supply. A reader never treats this list as empty by default. */
  readonly unresolvedRevisionIds: readonly string[];
};

/**
 * Every (source version, rights version) pair a reader must be allowed to use. A revision derived
 * from revisions A and B requires the sources of both; `ancestry` supplies the links of a derived
 * from revision and an ancestor it cannot supply is reported, never skipped.
 */
export function derivedSourceRequirements(
  links: readonly ArtifactDependencyLink[],
  ancestry: (revisionId: string) => readonly ArtifactDependencyLink[] | undefined = () => undefined,
): DerivedSourceRequirements {
  const requirements = new Map<string, SourceRequirement>();
  const unresolved = new Set<string>();
  const visited = new Set<string>();
  const walk = (current: readonly ArtifactDependencyLink[]): void => {
    for (const link of current) {
      if (link.kind === "source_version") {
        requirements.set(`${link.sourceVersionId}:${link.rightsVersionId ?? ""}`, {sourceVersionId: link.sourceVersionId, rightsVersionId: link.rightsVersionId});
      } else if (link.kind === "artifact_revision" && !visited.has(link.derivedFromRevisionId)) {
        visited.add(link.derivedFromRevisionId);
        const parent = ancestry(link.derivedFromRevisionId);
        if (parent === undefined) unresolved.add(link.derivedFromRevisionId);
        else walk(parent);
      }
    }
  };
  walk(links);
  const ordered = [...requirements.values()].sort((a, b) => (
    a.sourceVersionId.localeCompare(b.sourceVersionId) || (a.rightsVersionId ?? "").localeCompare(b.rightsVersionId ?? "")
  ));
  return freezeArtifactValue({requirements: ordered, unresolvedRevisionIds: [...unresolved].sort()});
}

/**
 * One lattice for audience and rights outcomes, from strictest to widest. A rights check that is
 * allowed maps to `external`, a refusal to `denied`; an unknown outcome is mapped by the caller to
 * `denied`, because an incomplete graph never widens what a reader may see.
 */
export const useRestrictionSchema = z.enum(["denied", "internal", "advisor", "external"]);
export type UseRestriction = z.infer<typeof useRestrictionSchema>;
const restrictionRank: Record<UseRestriction, number> = {denied: 0, internal: 1, advisor: 2, external: 3};

export function mostRestrictive(restrictions: readonly UseRestriction[]): UseRestriction {
  if (restrictions.length === 0) throw new Error("artifact_restriction_set_empty");
  return restrictions.reduce((strictest, candidate) => (restrictionRank[candidate] < restrictionRank[strictest] ? candidate : strictest));
}

export function audienceWithinRestriction(audience: ArtifactAudience, restriction: UseRestriction): boolean {
  return restriction !== "denied" && restrictionRank[audience] <= restrictionRank[restriction];
}

// Substance ----------------------------------------------------------------------------------

export type Substance = "material" | "informational" | "without_substance";

const isoDate = /\d{4}-\d{2}-\d{2}/g;
const slashDate = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g;
const year = /\b(?:19|20)\d{2}\b/g;

/** Years and calendar dates are periods, not values; any other digit is a number a claim must back. */
function textCarriesNumber(value: string): boolean {
  return /\d/.test(value.replace(isoDate, " ").replace(slashDate, " ").replace(year, " "));
}

function contentCarriesNumber(content: JsonValue): boolean {
  if (typeof content === "string") return textCarriesNumber(content);
  if (typeof content === "number") return true;
  if (Array.isArray(content)) return content.some(contentCarriesNumber);
  if (content !== null && typeof content === "object") return Object.values(content).some(contentCarriesNumber);
  return false;
}

/**
 * Material when at least one block claim, source, execution or institutional result is present.
 * Informational only for an answer made of sections and paragraphs with no claim and no number.
 * Anything else is without substance and the SQL command refuses it with
 * `artifact_revision_without_substance`.
 */
export function revisionSubstance(revision: {readonly manifest: ArtifactManifest}, blocks: readonly ArtifactBlock[]): Substance {
  const manifest = revision.manifest;
  if (blocks.some((block) => block.claims.length > 0) || manifest.sources.length > 0 || manifest.execution !== null || manifest.institutionalResult !== null) {
    return "material";
  }
  const informational = manifest.kind === "answer" && blocks.length > 0 && blocks.every((block) => (
    (block.kind === "section" || block.kind === "paragraph") && block.claims.length === 0 && !contentCarriesNumber(block.content as unknown as JsonValue)
  ));
  return informational ? "informational" : "without_substance";
}

// Material change ----------------------------------------------------------------------------

export type RevisionChange = "identical" | "cosmetic" | "material";
export type MaterialChangeReason =
  | "claim_set" | "claim_value" | "source_versions" | "method_release" | "execution" | "institutional_result" | "audience";

function claimIndex(blocks: readonly ArtifactBlock[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const block of blocks) {
    for (const claim of block.claims) index.set(claim.claimId, stable({kind: claim.kind, value: claim.value, unit: claim.unit, period: claim.period}));
  }
  return index;
}

function sameBlocks(previous: readonly ArtifactBlock[], next: readonly ArtifactBlock[]): boolean {
  const a = [...previous].sort((x, y) => x.blockNo - y.blockNo);
  const b = [...next].sort((x, y) => x.blockNo - y.blockNo);
  return a.length === b.length && a.every((block, index) => {
    const other = b[index];
    return other !== undefined && block.blockKey === other.blockKey && block.contentFingerprint === other.contentFingerprint
      && stable(block.claims) === stable(other.claims);
  });
}

function sameManifest(previous: RevisionSnapshot["revision"], next: RevisionSnapshot["revision"]): boolean {
  if ("manifestFingerprint" in previous && "manifestFingerprint" in next) return previous.manifestFingerprint === next.manifestFingerprint;
  return stable(previous.manifest) === stable(next.manifest);
}

/**
 * Material when any claim id, claim value, source version, method release, execution,
 * institutional result or audience differs; cosmetic when only text without claims, block order
 * or layout differs; identical when fingerprints match. Stage 20 requires a new approval act on
 * a material change.
 */
export type RevisionChangeReport = {readonly outcome: RevisionChange; readonly reasons: readonly MaterialChangeReason[]};

export function describeRevisionChange(previous: RevisionSnapshot, next: RevisionSnapshot): RevisionChangeReport {
  if (sameManifest(previous.revision, next.revision) && sameBlocks(previous.blocks, next.blocks)) {
    const identical: RevisionChangeReport = {outcome: "identical", reasons: []};
    return freezeArtifactValue(identical);
  }
  const reasons: MaterialChangeReason[] = [];
  const before = claimIndex(previous.blocks);
  const after = claimIndex(next.blocks);
  if (before.size !== after.size || [...before.keys()].some((claimId) => !after.has(claimId))) reasons.push("claim_set");
  if ([...before].some(([claimId, value]) => after.has(claimId) && after.get(claimId) !== value)) reasons.push("claim_value");
  const previousManifest = previous.revision.manifest;
  const nextManifest = next.revision.manifest;
  const sourceKey = (manifest: ArtifactManifest) => stable([...manifest.sources].map((source) => `${source.sourceVersionId}:${source.rightsVersionId ?? ""}`).sort());
  if (sourceKey(previousManifest) !== sourceKey(nextManifest)) reasons.push("source_versions");
  if (stable(previousManifest.method) !== stable(nextManifest.method)) reasons.push("method_release");
  if (stable(previousManifest.execution) !== stable(nextManifest.execution)) reasons.push("execution");
  if (stable(previousManifest.institutionalResult) !== stable(nextManifest.institutionalResult)) reasons.push("institutional_result");
  if (previous.revision.audience !== next.revision.audience) reasons.push("audience");
  const report: RevisionChangeReport = {outcome: reasons.length > 0 ? "material" : "cosmetic", reasons};
  return freezeArtifactValue(report);
}

export function compareRevisions(previous: RevisionSnapshot, next: RevisionSnapshot): RevisionChange {
  return describeRevisionChange(previous, next).outcome;
}

// Freshness ----------------------------------------------------------------------------------

export type Freshness = "current" | "stale" | "unknown";

/** Head facts the reader collects: the live head of each linked lineage and the latest version of each linked source. */
export type LineageHeads = {
  readonly executions: ReadonlyMap<string, string>;
  readonly institutionalResults: ReadonlyMap<string, string>;
  readonly sourceVersions: ReadonlyMap<string, string>;
};

/**
 * Stale when a linked execution or institutional result is no longer the head of its lineage or
 * a linked source has a newer version; unknown when any head is missing. Stale wins over unknown,
 * and an incomplete graph is never current. Stale is not revoked: the revision stays readable.
 */
export function freshness(links: readonly ArtifactDependencyLink[], heads: LineageHeads): Freshness {
  let incomplete = false;
  for (const link of links) {
    const pair = link.kind === "execution" ? [link.executionId, heads.executions.get(link.executionId)]
      : link.kind === "institutional_result" ? [link.resultId, heads.institutionalResults.get(link.resultId)]
        : link.kind === "source_version" ? [link.sourceVersionId, heads.sourceVersions.get(link.sourceVersionId)]
          : null;
    if (pair === null) continue;
    const [linked, head] = pair;
    if (head === undefined) incomplete = true;
    else if (head !== linked) return "stale";
  }
  return incomplete ? "unknown" : "current";
}

// Release ------------------------------------------------------------------------------------

export type ReleaseState = "internal" | "released" | "blocked";

/** The approval facts that exist today, each tied to the exact version it approved. */
export type ApprovalFact =
  | {readonly kind: "artifact_decision"; readonly decision: "confirm" | "request_changes"; readonly artifactFingerprint: string}
  | {readonly kind: "package_review"; readonly status: string; readonly materialFingerprint: string}
  /** Established already includes the adoption of a recomputed result (`institutional_result_established_v1`). */
  | {readonly kind: "institutional_result"; readonly resultId: string; readonly established: boolean}
  | {readonly kind: "execution_receipt"; readonly executionId: string; readonly resultFingerprint: string};

export type ReleaseInput = {
  readonly workReadAccess: boolean;
  readonly facts: readonly ApprovalFact[];
};

/** The fingerprints under which an approval may name this exact revision. */
export function revisionFingerprints(revision: ArtifactRevision): ReadonlySet<string> {
  const fingerprints = new Set<string>([revision.manifestFingerprint]);
  if (revision.contentSha256 !== null) fingerprints.add(revision.contentSha256);
  if (revision.legacyRef !== null) fingerprints.add(revision.legacyRef.fingerprint);
  return fingerprints;
}

function factCoversRevision(revision: ArtifactRevision, fact: ApprovalFact): boolean {
  const fingerprints = revisionFingerprints(revision);
  switch (fact.kind) {
    case "artifact_decision": return fact.decision === "confirm" && fingerprints.has(fact.artifactFingerprint);
    case "package_review": return fact.status === "approved" && fingerprints.has(fact.materialFingerprint);
    case "institutional_result": return fact.established && revision.manifest.institutionalResult?.id === fact.resultId;
    case "execution_receipt": return revision.manifest.execution !== null
      && revision.manifest.execution.executionId === fact.executionId && revision.manifest.execution.resultFingerprint === fact.resultFingerprint;
  }
}

/**
 * Every audience requires read access to the work; without it nothing is served. An external
 * audience is served only when an approval fact names this exact revision; internal and advisor
 * revisions are served as `internal` until approved and `released` afterwards. There is no
 * purpose parameter: preview and download call this same function with the same facts.
 */
export function releaseState(revision: ArtifactRevision, input: ReleaseInput): ReleaseState {
  if (!input.workReadAccess) return "blocked";
  const approved = input.facts.some((fact) => factCoversRevision(revision, fact));
  if (revision.audience === "external") return approved ? "released" : "blocked";
  return approved ? "released" : "internal";
}

// Exact revision resolution ------------------------------------------------------------------

export type ResolvedRevision =
  | {readonly ok: true; readonly revision: ArtifactRevision}
  | {readonly ok: false; readonly error: "revision_not_found" | "artifact_head_missing"};

/** A requested id resolves to that revision or fails; without one, the head pointer decides, never the newest by date. */
export function resolveRevision(artifact: Artifact, revisions: readonly ArtifactRevision[], requestedRevisionId?: string | null): ResolvedRevision {
  const own = revisions.filter((revision) => revision.artifactId === artifact.id);
  if (requestedRevisionId !== undefined && requestedRevisionId !== null) {
    const revision = own.find((candidate) => candidate.id === requestedRevisionId);
    return revision ? {ok: true, revision} : {ok: false, error: "revision_not_found"};
  }
  const head = artifact.headRevisionId === null ? undefined : own.find((candidate) => candidate.id === artifact.headRevisionId);
  return head ? {ok: true, revision: head} : {ok: false, error: "artifact_head_missing"};
}

// Adapters -----------------------------------------------------------------------------------
//
// `case-understanding` and `financial-model` both depend on `reconciliation`, which depends on
// this package, so importing their schemas here would create a cycle. The four external adapters
// are therefore typed against the structural shape of each contract (only the fields they read)
// and tested on fixtures copied from the real shapes. `documentWorkProductSchema` lives in this
// package and is imported directly.

export type ManifestContext = {
  readonly audience: ArtifactAudience;
  readonly provenance: ManifestProvenance;
  /** Source versions the producer resolved in the graph. No contract below carries rights versions. */
  readonly sources?: readonly ManifestSource[];
};

/** One entry per source version; a rights version the producer resolved refines the contract's unpinned reference. */
function mergedSources(context: ManifestContext, own: readonly ManifestSource[] = []): ManifestSource[] {
  const merged = new Map<string, ManifestSource>();
  for (const source of [...own, ...(context.sources ?? [])]) merged.set(source.sourceVersionId, source);
  return [...merged.values()];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function finish(manifest: unknown): ArtifactManifest {
  return freezeArtifactValue(artifactManifestSchema.parse(manifest));
}

const emptyManifestParts = {method: null, execution: null, inputSnapshot: null, institutionalResult: null, template: null, legacy: null, bytes: null} as const;

export type DecisionArtifactContractLike = {
  readonly schemaVersion: "2026.09.07-v1";
  readonly caseId: string;
  readonly snapshotFingerprint: string;
  readonly contractFingerprint: string;
  readonly claims: ReadonlyArray<{
    readonly id: string;
    readonly object: {readonly id: string; readonly type: string; readonly fingerprint: string; readonly path: string};
  }>;
  readonly views: ReadonlyArray<{
    readonly surface: "conversation" | "workbook" | "presentation";
    readonly blocks: ReadonlyArray<{readonly id: string; readonly claimIds: readonly string[]}>;
  }>;
};

/** The decision contract is a governed work product; its case snapshot is the input snapshot and its signed objects are the traces. */
export function manifestFromDecisionArtifactContract(contract: DecisionArtifactContractLike, context: ManifestContext): ArtifactManifest {
  return finish({
    ...emptyManifestParts,
    schemaVersion: artifactManifestSchemaVersion,
    kind: "work_product",
    audience: context.audience,
    format: "json",
    inputSnapshot: {fingerprint: contract.snapshotFingerprint},
    sources: mergedSources(context),
    claims: contract.views.flatMap((view) => view.blocks
      .filter((block) => block.claimIds.length > 0)
      .map((block) => ({blockKey: `${view.surface}:${block.id}`, claimIds: [...block.claimIds]}))),
    traces: unique([
      `decision-contract:${contract.contractFingerprint}`,
      ...contract.claims.map((claim) => `signed-object:${claim.object.type}:${claim.object.id}:${claim.object.fingerprint}`),
    ]),
    provenance: context.provenance,
  });
}

export type RenderedMaterialManifestLike = {
  readonly schemaVersion: "2026.09.07-v1";
  readonly id: string;
  readonly decisionContractFingerprint: string;
  readonly surface: "workbook" | "presentation" | "supporting_document";
  readonly format: "xlsx" | "pptx" | "docx";
  readonly byteLength: number;
  readonly contentSha256: string;
  readonly renderer: {readonly id: string; readonly version: string};
  readonly template: {readonly id: string; readonly version: string; readonly fingerprint: string; readonly origin: "offroad_house" | "client_supplied"};
  readonly storage: {readonly bucket: string; readonly objectPath: string; readonly state: "pending_upload" | "stored"; readonly etag: string | null};
  readonly claimIds: readonly string[];
  readonly manifestFingerprint: string;
};

const surfaceKind = {workbook: "workbook", presentation: "presentation", supporting_document: "document"} as const;

/** A stored file becomes a revision with storage bytes; a receipt whose object is not stored yet is refused. */
export function manifestFromRenderedMaterialManifest(material: RenderedMaterialManifestLike, context: ManifestContext): ArtifactManifest {
  if (material.storage.state !== "stored") throw new Error("artifact_adapter_material_not_stored");
  return finish({
    ...emptyManifestParts,
    schemaVersion: artifactManifestSchemaVersion,
    kind: surfaceKind[material.surface],
    audience: context.audience,
    format: material.format,
    bytes: {sha256: material.contentSha256, byteLength: material.byteLength, storage: {bucket: material.storage.bucket, path: material.storage.objectPath}},
    inputSnapshot: {fingerprint: material.decisionContractFingerprint},
    sources: mergedSources(context),
    claims: material.claimIds.length > 0 ? [{blockKey: material.surface, claimIds: [...material.claimIds]}] : [],
    traces: unique([`rendered-material:${material.manifestFingerprint}`, `renderer:${material.renderer.id}@${material.renderer.version}`]),
    // The versioned template table arrives in a later increment; until then the receipt's id and version name the template version.
    template: {templateVersionId: `${material.template.id}@${material.template.version}`, fingerprint: material.template.fingerprint},
    provenance: context.provenance,
  });
}

export type InstitutionalWorkbookArtifactLike = {
  readonly modelKind: "institutional";
  readonly version: string;
  readonly fingerprint: string;
  readonly workbooks: {readonly pt: {readonly sha256: string; readonly byteSize: number}; readonly en: {readonly sha256: string; readonly byteSize: number}};
  readonly renderAudits: {readonly pt: {readonly rendererVersion: string}; readonly en: {readonly rendererVersion: string}};
  readonly institutional: {
    readonly schemaVersion: "institutional-workbook-artifact.v1";
    readonly activeScenarioId: string;
    readonly sourceManifestFingerprint: string;
    readonly scenarios: ReadonlyArray<{
      readonly configurationId: string;
      readonly configurationFingerprint: string;
      readonly inputFingerprint: string;
      readonly outputFingerprint: string;
    }>;
  };
};

export type InstitutionalManifestContext = ManifestContext & {
  /** The `institutional_model_results` row this artifact belongs to; the artifact does not carry it. */
  readonly resultId: string;
  readonly locale: "pt" | "en";
};

/** One locale of the deterministic workbook, pinned to the established result and its active scenario. */
export function manifestFromInstitutionalWorkbookArtifact(artifact: InstitutionalWorkbookArtifactLike, context: InstitutionalManifestContext): ArtifactManifest {
  const active = artifact.institutional.scenarios.find((scenario) => scenario.configurationId === artifact.institutional.activeScenarioId);
  if (!active) throw new Error("artifact_adapter_active_scenario_missing");
  const workbook = artifact.workbooks[context.locale];
  return finish({
    ...emptyManifestParts,
    schemaVersion: artifactManifestSchemaVersion,
    kind: "model_result",
    audience: context.audience,
    format: "xlsx",
    bytes: {
      sha256: workbook.sha256,
      byteLength: workbook.byteSize,
      rendered: {
        renderer: artifact.version,
        rendererVersion: artifact.renderAudits[context.locale].rendererVersion,
        deterministicInputs: {locale: context.locale, artifactFingerprint: artifact.fingerprint, sourceManifestFingerprint: artifact.institutional.sourceManifestFingerprint},
      },
    },
    inputSnapshot: {fingerprint: active.inputFingerprint},
    institutionalResult: {id: context.resultId, configurationFingerprint: active.configurationFingerprint},
    sources: mergedSources(context),
    claims: [],
    traces: unique([`institutional-workbook:${artifact.fingerprint}`, ...artifact.institutional.scenarios.map((scenario) => `institutional-output:${scenario.outputFingerprint}`)]),
    provenance: context.provenance,
  });
}

/** A documentary work product cites passages, not source versions; the producer resolves those in the graph. */
export function manifestFromDocumentWorkProduct(product: DocumentWorkProduct, context: ManifestContext): ArtifactManifest {
  const parsed = documentWorkProductSchema.parse(product);
  return finish({
    ...emptyManifestParts,
    schemaVersion: artifactManifestSchemaVersion,
    kind: "work_product",
    audience: context.audience,
    format: "json",
    inputSnapshot: {fingerprint: parsed.inputFingerprint},
    sources: mergedSources(context),
    claims: [],
    traces: unique([`document-work-product:${parsed.fingerprint}`, `approved-request:${parsed.requestFingerprint}`]),
    provenance: context.provenance,
  });
}

export type CapitalProcedurePacketLike = {
  readonly schemaVersion: "capital-procedure-packet.v2";
  readonly status: "framed" | "partial" | "prepared_for_human_review";
  readonly decision: {
    readonly procedureId: string;
    readonly workId: string;
    readonly fingerprint: string;
    readonly alternatives: ReadonlyArray<{readonly id: string}>;
    readonly ratios: ReadonlyArray<{readonly id: string; readonly fingerprint: string}>;
    readonly recommendation: {readonly alternativeId: string} | null;
    readonly provenance: {readonly financialCoreVersion: string};
  };
  readonly contractSourceVersionIds: readonly string[];
  readonly inputFingerprint: string;
  readonly fingerprint: string;
};

export type PacketManifestContext = ManifestContext & {
  /** From the execution result receipt: its canonical result fingerprint is not the packet's own JSON fingerprint. */
  readonly execution: {readonly executionId: string; readonly resultFingerprint: string; readonly inputFingerprint: string};
  /** From the execution input snapshot, when the producer has it. */
  readonly inputSnapshot?: {readonly fingerprint: string} | null;
  /** From the execution manifest, when the producer has it; the packet only names the procedure. */
  readonly method?: {readonly platformReleaseId: string; readonly houseReleaseId: string | null; readonly version: string} | null;
};

/** The execution result as an artifact: alternatives, ratios and the recommendation are the claims of its blocks. */
export function manifestFromCapitalProcedurePacket(packet: CapitalProcedurePacketLike, context: PacketManifestContext): ArtifactManifest {
  const claims = [
    {blockKey: "alternatives", claimIds: packet.decision.alternatives.map((alternative) => alternative.id)},
    {blockKey: "ratios", claimIds: packet.decision.ratios.map((ratio) => ratio.id)},
    {blockKey: "recommendation", claimIds: packet.decision.recommendation ? [packet.decision.recommendation.alternativeId] : []},
  ].filter((entry) => entry.claimIds.length > 0);
  return finish({
    ...emptyManifestParts,
    schemaVersion: artifactManifestSchemaVersion,
    kind: "execution_result",
    audience: context.audience,
    format: "json",
    method: context.method ? {procedureId: packet.decision.procedureId, ...context.method} : null,
    execution: context.execution,
    inputSnapshot: context.inputSnapshot ?? null,
    sources: mergedSources(context, packet.contractSourceVersionIds.map((sourceVersionId) => ({sourceVersionId, rightsVersionId: null}))),
    claims,
    traces: unique([
      `capital-procedure-packet:${packet.fingerprint}`,
      `capital-decision-delivery:${packet.decision.fingerprint}`,
      `financial-core:${packet.decision.provenance.financialCoreVersion}`,
      ...packet.decision.ratios.map((ratio) => `ratio:${ratio.id}:${ratio.fingerprint}`),
    ]),
    provenance: context.provenance,
  });
}

// Legacy labeling ----------------------------------------------------------------------------
//
// Four historical shapes become `legacy` revisions. Each keeps the row's own fingerprint verbatim
// in `legacyRef`, lists only what the row carries as evidence and never fills a method, an
// execution, an input snapshot or a source link the row does not have. The historical
// `input_fingerprint` columns are evidence, not input snapshots: no historical table carries one.

const workbookHashes = z.object({sha256: hex64, byteSize: z.number().int().positive()});

export const legacyCapitalProjectArtifactRowSchema = z.object({
  id: uuid, organization_id: uuid, capital_project_id: uuid, plan_id: uuid, task_run_id: uuid, processing_job_id: uuid,
  artifact_type: text(80), schema_version: text(80), artifact_version: z.number().int().positive(), status: text(40),
  input_fingerprint: hex64, artifact_fingerprint: hex64, created_by_kind: z.enum(["worker", "user"]), created_at: timestamp,
  evidence_refs: z.array(z.unknown()).default([]), dependencies: z.array(z.unknown()).default([]),
});

export const legacyCaseArtifactManifestRowSchema = z.object({
  id: uuid, organization_id: uuid, intake_session_id: uuid, processing_run_id: uuid.nullable(), schema_version: text(80),
  locale: z.enum(["pt-BR", "en-US"]), input_fingerprint: hex64, manifest_fingerprint: hex64, created_by: uuid, created_at: timestamp,
  manifest: z.object({
    runId: z.string().optional(),
    outputs: z.array(z.object({artifactId: z.string(), kind: z.string(), sha256: hex64})).default([]),
    sources: z.array(z.object({documentId: z.string(), versionId: z.string(), sha256: hex64.nullable()})).default([]),
  }),
});

export const legacyInstitutionalModelResultRowSchema = z.object({
  id: uuid, organization_id: uuid, capital_project_id: uuid, intake_session_id: uuid, configuration_id: uuid,
  configuration_fingerprint: hex64, source_manifest_fingerprint: hex64, status: z.enum(["queued", "completed", "blocked"]), created_at: timestamp,
  artifact: z.object({
    fingerprint: hex64, version: z.string(), workbooks: z.object({pt: workbookHashes, en: workbookHashes}),
    institutional: z.object({
      activeScenarioId: uuid,
      scenarios: z.array(z.object({configurationId: uuid, configurationFingerprint: hex64, outputFingerprint: hex64, sourceBindings: z.array(z.unknown()).default([])})),
    }),
  }).nullable(),
});

export const legacyDealStateMaterialRowSchema = z.object({
  id: uuid, organization_id: uuid, intake_session_id: uuid, object_type: z.literal("material_artifact"), object_version: z.number().int().positive(),
  status: text(40), input_fingerprint: hex64, object_fingerprint: hex64, created_by: uuid, created_at: timestamp,
  dependencies: z.array(z.object({objectType: z.string(), objectFingerprint: z.string()})).default([]),
  payload: z.object({
    materials: z.array(z.object({kind: z.string(), artifactFingerprint: z.string().optional()})).default([]),
    financialModel: z.object({fingerprint: hex64.optional(), workbooks: z.object({pt: workbookHashes, en: workbookHashes}).optional()}).nullable().default(null),
  }),
});

export const legacyRowSchema = z.discriminatedUnion("table", [
  z.object({table: z.literal("capital_project_artifacts"), row: legacyCapitalProjectArtifactRowSchema}),
  z.object({table: z.literal("case_artifact_manifests"), row: legacyCaseArtifactManifestRowSchema}),
  z.object({table: z.literal("institutional_model_results"), row: legacyInstitutionalModelResultRowSchema}),
  z.object({table: z.literal("deal_state_objects"), row: legacyDealStateMaterialRowSchema}),
]);
export type LegacyRow = z.input<typeof legacyRowSchema>;

type Evidence = {key: string; value: string};
const evidence = (key: string, value: string | number | null | undefined): Evidence[] => (value === null || value === undefined ? [] : [{key, value: String(value)}]);

function legacyDraft(input: {
  kind: ArtifactKind; format: ArtifactFormat | null; table: LegacyTable; id: string; fingerprint: string; evidence: Evidence[];
  createdAt: string; provenance: {jobId: string | null; taskRunId: string | null; messageId: string | null}; institutionalResult?: {id: string; configurationFingerprint: string};
}): ArtifactRevisionDraft {
  const legacy = {table: input.table, id: input.id, fingerprint: input.fingerprint, evidence: input.evidence};
  return freezeArtifactValue(artifactRevisionDraftSchema.parse({
    // A historical row never declared an audience; internal is the least permissive label and implies no external serving.
    audience: "internal",
    origin: "legacy",
    manifest: {
      ...emptyManifestParts,
      schemaVersion: artifactManifestSchemaVersion,
      kind: input.kind,
      audience: "internal",
      format: input.format,
      institutionalResult: input.institutionalResult ?? null,
      sources: [],
      claims: [],
      traces: [],
      provenance: {producer: `legacy:${input.table}`, ...input.provenance, capability: null},
      legacy,
    },
    contentSha256: null,
    byteLength: null,
    createdAt: input.createdAt,
    legacyRef: legacy,
  }));
}

/** Builds a legacy revision draft from one historical row; the writer assigns artifact, number and fingerprint. */
export function legacyProjection(input: LegacyRow): ArtifactRevisionDraft {
  const parsed = legacyRowSchema.parse(input);
  switch (parsed.table) {
    case "capital_project_artifacts": {
      const row = parsed.row;
      return legacyDraft({
        kind: "work_product", format: "json", table: parsed.table, id: row.id, fingerprint: row.artifact_fingerprint, createdAt: row.created_at,
        provenance: {jobId: row.processing_job_id, taskRunId: row.task_run_id, messageId: null},
        evidence: [
          ...evidence("capital_project_id", row.capital_project_id), ...evidence("plan_id", row.plan_id),
          ...evidence("artifact_type", row.artifact_type), ...evidence("schema_version", row.schema_version),
          ...evidence("artifact_version", row.artifact_version), ...evidence("status", row.status),
          ...evidence("input_fingerprint", row.input_fingerprint), ...evidence("created_by_kind", row.created_by_kind),
          ...evidence("evidence_ref_count", row.evidence_refs.length), ...evidence("dependency_count", row.dependencies.length),
        ],
      });
    }
    case "case_artifact_manifests": {
      const row = parsed.row;
      return legacyDraft({
        kind: "work_product", format: "json", table: parsed.table, id: row.id, fingerprint: row.manifest_fingerprint, createdAt: row.created_at,
        provenance: {jobId: null, taskRunId: null, messageId: null},
        evidence: [
          ...evidence("intake_session_id", row.intake_session_id), ...evidence("processing_run_id", row.processing_run_id),
          ...evidence("schema_version", row.schema_version), ...evidence("locale", row.locale),
          ...evidence("input_fingerprint", row.input_fingerprint), ...evidence("run_id", row.manifest.runId),
          ...row.manifest.outputs.flatMap((output) => evidence("output", `${output.kind}:${output.artifactId}:${output.sha256}`)),
          ...row.manifest.sources.flatMap((source) => evidence("source_document", `${source.documentId}:${source.versionId}:${source.sha256 ?? "unverified"}`)),
        ],
      });
    }
    case "institutional_model_results": {
      const row = parsed.row;
      if (row.status !== "completed" || row.artifact === null) throw new Error("artifact_legacy_result_not_completed");
      const artifact = row.artifact;
      const active = artifact.institutional.scenarios.find((scenario) => scenario.configurationId === artifact.institutional.activeScenarioId);
      return legacyDraft({
        kind: "model_result", format: "xlsx", table: parsed.table, id: row.id, fingerprint: artifact.fingerprint, createdAt: row.created_at,
        // The result id is also the assistant message that requested it, by the table's own foreign key.
        provenance: {jobId: null, taskRunId: null, messageId: row.id},
        institutionalResult: {id: row.id, configurationFingerprint: row.configuration_fingerprint},
        evidence: [
          ...evidence("capital_project_id", row.capital_project_id), ...evidence("intake_session_id", row.intake_session_id),
          ...evidence("configuration_id", row.configuration_id), ...evidence("configuration_fingerprint", row.configuration_fingerprint),
          ...evidence("source_manifest_fingerprint", row.source_manifest_fingerprint), ...evidence("artifact_version", artifact.version),
          ...evidence("active_scenario_id", artifact.institutional.activeScenarioId), ...evidence("output_fingerprint", active?.outputFingerprint),
          ...evidence("source_binding_count", active?.sourceBindings.length),
          ...evidence("workbook_sha256_pt", artifact.workbooks.pt.sha256), ...evidence("workbook_byte_size_pt", artifact.workbooks.pt.byteSize),
          ...evidence("workbook_sha256_en", artifact.workbooks.en.sha256), ...evidence("workbook_byte_size_en", artifact.workbooks.en.byteSize),
        ],
      });
    }
    case "deal_state_objects": {
      const row = parsed.row;
      const model = row.payload.financialModel;
      return legacyDraft({
        kind: "material", format: "json", table: parsed.table, id: row.id, fingerprint: row.object_fingerprint, createdAt: row.created_at,
        provenance: {jobId: null, taskRunId: null, messageId: null},
        evidence: [
          ...evidence("intake_session_id", row.intake_session_id), ...evidence("object_version", row.object_version),
          ...evidence("status", row.status), ...evidence("input_fingerprint", row.input_fingerprint),
          ...row.dependencies.flatMap((dependency) => evidence("depends_on", `${dependency.objectType}:${dependency.objectFingerprint}`)),
          ...row.payload.materials.flatMap((material) => evidence("material", `${material.kind}:${material.artifactFingerprint ?? "unpinned"}`)),
          ...evidence("financial_model_fingerprint", model?.fingerprint),
          ...evidence("workbook_sha256_pt", model?.workbooks?.pt.sha256), ...evidence("workbook_byte_size_pt", model?.workbooks?.pt.byteSize),
          ...evidence("workbook_sha256_en", model?.workbooks?.en.sha256), ...evidence("workbook_byte_size_en", model?.workbooks?.en.byteSize),
        ],
      });
    }
  }
}
