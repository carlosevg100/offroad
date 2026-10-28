import {z} from "zod";
import {artifactBlockDraftSchema, freezeArtifactValue, type ArtifactBlockDraft} from "./artifact-protocol";

/**
 * Result blocks of ficha C09, the folder organized (lote 4, `organize-document-folder`). Each block copies a part of
 * the packet as it is, so the SQL mapping `private.execution_result_document_folder_blocks_v1` mirrors it key for key;
 * nothing is recomputed. The inventory shown is the packet's current one, or the prior one as history when the
 * update could not be read. Readers return null on any unknown, missing or inconsistent block.
 */
type Json = null | boolean | number | string | readonly Json[] | {readonly [k: string]: Json};
type Status = "framed" | "partial" | "prepared_for_human_review";
type Gap = {readonly operand: string; readonly reason: string};
type Claim = {claimId: string; kind: "fact" | "calculation"; value: string; unit: string | null; period: string | null; supportIds: string[]};
type Block = {blockKey: string; kind: "section" | "table"; content: Record<string, Json>; claims: Claim[]};
type BlockLike = {readonly blockKey: string; readonly kind: string; readonly content: unknown; readonly claims: unknown};

type InventoryLike = {
  readonly asOf: string; readonly partitionByEntity: boolean;
  readonly rows: ReadonlyArray<{readonly fileId: string; readonly fileName: string; readonly order: number; readonly partition: string | null; readonly group: string; readonly groupLabel: string;
    readonly kind: string; readonly description: string; readonly entity: string; readonly period: string; readonly version: string; readonly status: string | null;
    readonly situation: {readonly read: string; readonly duplicateOf: string | null; readonly supersededBy: unknown; readonly inVault: string | null; readonly unreadablePages: readonly number[]};
    readonly situationLabel: string; readonly findingIds: readonly string[]}>;
  readonly groups: readonly unknown[];
  readonly findings: ReadonlyArray<{readonly id: string; readonly code: string; readonly anchor: string; readonly statement: string; readonly knowledge: string; readonly sources: readonly unknown[]; readonly status: string}>;
};
/** The folder inventory packet as the result protocol reads it. */
export type DocumentFolderPacketLike = {
  readonly schemaVersion: "document-folder-inventory-packet.v1"; readonly status: Status; readonly question: string; readonly mode: string; readonly fingerprint: string;
  readonly result: {readonly currency: string; readonly inventory: InventoryLike | null; readonly priorInventory: InventoryLike | null};
  readonly readings: null | {
    readonly opening: unknown; readonly decisionFindings: readonly unknown[] | null; readonly generalFindings: readonly unknown[] | null; readonly versions: readonly unknown[];
    readonly documentary: readonly unknown[]; readonly notRead: readonly unknown[]; readonly gaps: readonly unknown[]; readonly questions: readonly string[];
    readonly update: null | {readonly identityChecks: ReadonlyArray<{readonly id: string; readonly recomposed: string | null}>};
    readonly historical: unknown; readonly numericAnalysis: string; readonly documentsValidated: boolean;
  };
  readonly gaps: readonly Gap[]; readonly exclusions: readonly string[];
};

const copy = <T>(value: T): Json => value === undefined ? null : JSON.parse(JSON.stringify(value)) as Json;
/** A claim id is at most 160 characters; an id that cannot carry its prefix within that is unmappable, here and in SQL. */
const claimable = (ids: readonly string[]) => {if (ids.some((id) => id.length > 140)) throw new Error("execution_result_unmappable");};
function finish(drafts: Block[]): readonly ArtifactBlockDraft[] {
  const blocks = drafts.map((draft) => artifactBlockDraftSchema.parse(draft));
  if (new Set(blocks.map((b) => b.blockKey)).size !== blocks.length) throw new Error("duplicate_block_key");
  return freezeArtifactValue(blocks);
}

export function documentFolderPacketBlocks(packet: DocumentFolderPacketLike): readonly ArtifactBlockDraft[] {
  if (packet.schemaVersion !== "document-folder-inventory-packet.v1") throw new Error("execution_result_unmappable");
  const r = packet.readings, inv = packet.result.inventory ?? packet.result.priorInventory, support = [packet.fingerprint];
  const opening = r?.opening as {files: number} | null | undefined;
  const checks = (r?.update?.identityChecks ?? []).filter((c) => c.recomposed !== null);
  claimable(checks.map((c) => c.id));
  const findings = (list: readonly unknown[] | null | undefined) => ({stated: list !== null && list !== undefined, rows: copy(list ?? [])});
  return finish([
    {blockKey: "framing", kind: "section", content: {status: packet.status, question: packet.question, mode: packet.mode, asOf: inv?.asOf ?? null,
      partitionByEntity: inv?.partitionByEntity ?? null, opening: copy(opening ?? null), historical: copy(r?.historical ?? null),
      numericAnalysis: r?.numericAnalysis ?? null, documentsValidated: r?.documentsValidated ?? null},
      claims: opening ? [{claimId: "files", kind: "fact", value: String(opening.files), unit: null, period: inv?.asOf ?? null, supportIds: support}] : []},
    {blockKey: "inventory", kind: "table", claims: [], content: {groups: copy(inv?.groups ?? []), rows: (inv?.rows ?? []).map((x) => ({fileId: x.fileId, fileName: x.fileName, order: x.order,
      partition: x.partition, group: x.group, groupLabel: x.groupLabel, kind: x.kind, description: x.description, entity: x.entity, period: x.period, version: x.version, status: x.status,
      read: x.situation.read, unreadablePages: copy(x.situation.unreadablePages), duplicateOf: x.situation.duplicateOf, supersededBy: copy(x.situation.supersededBy), inVault: x.situation.inVault,
      situationLabel: x.situationLabel, findingIds: copy(x.findingIds)}))}},
    {blockKey: "findings", kind: "table", claims: [], content: {rows: (inv?.findings ?? []).filter((f) => f.status === "open")
      .map((f) => ({id: f.id, code: f.code, anchor: f.anchor, statement: f.statement, knowledge: f.knowledge, sources: copy(f.sources)}))}},
    {blockKey: "decision-findings", kind: "table", claims: [], content: findings(r?.decisionFindings)},
    {blockKey: "general-findings", kind: "table", claims: [], content: findings(r?.generalFindings)},
    {blockKey: "versions", kind: "table", claims: [], content: {rows: copy(r?.versions ?? [])}},
    {blockKey: "documentary", kind: "table", claims: [], content: {rows: copy(r?.documentary ?? [])}},
    {blockKey: "not-read", kind: "table", claims: [], content: {rows: copy(r?.notRead ?? [])}},
    {blockKey: "purpose-gaps", kind: "table", claims: [], content: {rows: copy(r?.gaps ?? [])}},
    {blockKey: "questions", kind: "table", claims: [], content: {rows: (r?.questions ?? []).map((text) => ({text}))}},
    {blockKey: "update", kind: "section", content: {update: copy(r?.update ?? null)},
      claims: checks.map((c) => ({claimId: `identity-check:${c.id}`, kind: "calculation", value: c.recomposed!, unit: packet.result.currency, period: inv?.asOf ?? null, supportIds: support}))},
    {blockKey: "information-gaps", kind: "table", claims: [], content: {rows: packet.gaps.map((g) => ({operand: g.operand, reason: g.reason}))}},
    {blockKey: "exclusions", kind: "section", claims: [], content: {items: [...packet.exclusions]}},
  ]);
}

const num = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const claim = z.strictObject({claimId: z.string(), kind: z.enum(["fact", "calculation"]), value: num, unit: z.string().nullable(), period: z.string().nullable(), supportIds: z.array(z.string())});
const noClaims = z.array(z.never()).length(0);
const rows = <T extends z.ZodType>(row: T) => z.strictObject({rows: z.array(row)});
const source = z.looseObject({fileId: z.string(), page: z.number().nullable(), section: z.string().nullable()});
const findingRows = <T extends z.ZodType>(row: T) => z.strictObject({stated: z.boolean(), rows: z.array(row)});
const spec = {
  framing: {kind: "section" as const, claims: z.array(claim).max(1), content: z.strictObject({status: z.enum(["framed", "partial", "prepared_for_human_review"]), question: z.string(),
    mode: z.enum(["organize", "organize_only", "organize_for_debt"]), asOf: z.string().nullable(), partitionByEntity: z.boolean().nullable(),
    opening: z.looseObject({files: z.number(), groups: z.array(z.string()), duplicates: z.number(), superseded: z.number(), inVault: z.number()}).nullable(),
    historical: z.looseObject({inventoryFingerprint: z.string(), reason: z.literal("update_not_read")}).nullable(),
    numericAnalysis: z.literal("none").nullable(), documentsValidated: z.literal(false).nullable()})},
  inventory: {kind: "table" as const, claims: noClaims, content: z.strictObject({groups: z.array(z.looseObject({partition: z.string().nullable(), group: z.string(), label: z.string(), fileIds: z.array(z.string())})),
    rows: z.array(z.looseObject({fileId: z.string(), fileName: z.string(), order: z.number(), partition: z.string().nullable(), group: z.string(), groupLabel: z.string(), kind: z.string(),
      description: z.string(), entity: z.string(), period: z.string(), version: z.string(), status: z.string().nullable(), read: z.enum(["complete", "partial", "unreadable", "conflicted"]),
      unreadablePages: z.array(z.number()), duplicateOf: z.string().nullable(), supersededBy: z.looseObject({fileId: z.string(), reason: z.string()}).nullable(), inVault: z.string().nullable(),
      situationLabel: z.string(), findingIds: z.array(z.string())}))})},
  findings: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({id: z.string(), code: z.string(), anchor: z.string(), statement: z.string(), knowledge: z.string(), sources: z.array(source)}))},
  "decision-findings": {kind: "table" as const, claims: noClaims, content: findingRows(z.looseObject({rank: z.number(), statement: z.string(), decisionIds: z.array(z.string()), sources: z.array(source)}))},
  "general-findings": {kind: "table" as const, claims: noClaims, content: findingRows(z.looseObject({rank: z.number(), statement: z.string()}))},
  versions: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({familyId: z.string(), resolution: z.string(), prevails: z.array(z.string()), superseded: z.array(z.string()),
    sideBySide: z.array(z.string()), highlighted: z.boolean()}))},
  documentary: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({findingId: z.string(), fileId: z.string(), page: z.number().nullable(), section: z.string().nullable(), text: z.string()}))},
  "not-read": {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({fileId: z.string(), pages: z.array(z.number()).nullable(), statement: z.string()}))},
  "purpose-gaps": {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({item: z.string(), why: z.string(), purposes: z.array(z.string()), conditional: z.boolean()}))},
  questions: {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({text: z.string()}))},
  update: {kind: "section" as const, claims: z.array(claim), content: z.strictObject({update: z.looseObject({rowsUpdated: z.array(z.string()), rowsAdded: z.array(z.string()), rowsPreserved: z.number(),
    newFindings: z.array(z.looseObject({statement: z.string(), quoted: z.looseObject({fileId: z.string(), page: z.number().nullable(), section: z.string().nullable(), text: z.string()}).nullable()})),
    identityChecks: z.array(z.looseObject({id: z.string(), status: z.enum(["matches", "differs", "not_run"]), reported: num.nullable(), recomposed: num.nullable()})),
    informed: z.array(z.looseObject({statement: z.string(), author: z.string(), date: z.string()})), stillOpen: z.array(z.string())}).nullable()})},
  "information-gaps": {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({operand: z.string(), reason: z.string()}))},
  exclusions: {kind: "section" as const, claims: noClaims, content: z.strictObject({items: z.array(z.string())})},
};
type Spec = typeof spec;
type Content<K extends keyof Spec> = z.infer<Spec[K]["content"]>;
export type DocumentFolderResultBlocksView = {
  readonly framing: Content<"framing">; readonly inventory: Content<"inventory">; readonly findings: Content<"findings">["rows"];
  readonly decisionFindings: Content<"decision-findings">; readonly generalFindings: Content<"general-findings">; readonly versions: Content<"versions">["rows"];
  readonly documentary: Content<"documentary">["rows"]; readonly notRead: Content<"not-read">["rows"]; readonly purposeGaps: Content<"purpose-gaps">["rows"];
  readonly questions: Content<"questions">["rows"]; readonly update: Content<"update">["update"]; readonly informationGaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function readDocumentFolderPacketBlocks(blocks: readonly BlockLike[]): DocumentFolderResultBlocksView | null {
  const byKey = new Map<string, BlockLike>();
  for (const b of blocks) {if (byKey.has(b.blockKey)) return null; byKey.set(b.blockKey, b);}
  const out: Record<string, {content: unknown; claims: {claimId: string; value: string; kind: string; period: string | null}[]}> = {};
  for (const [k, s] of Object.entries(spec)) {
    const b = byKey.get(k);
    if (!b || b.kind !== s.kind) return null;
    const content = s.content.safeParse(b.content), claims = s.claims.safeParse(b.claims);
    if (!content.success || !claims.success) return null;
    out[k] = {content: content.data, claims: claims.data as never};
    byKey.delete(k);
  }
  if (byKey.size) return null;
  const framing = out.framing!.content as Content<"framing">, update = (out.update!.content as Content<"update">).update;
  // The count claim names the folder's size; each identity claim carries exactly its check's recomposed total.
  const expected = (framing.opening ? [`files:fact:${framing.opening.files}:${framing.asOf}`] : [])
    .concat((update?.identityChecks ?? []).filter((c) => c.recomposed !== null).map((c) => `identity-check:${c.id}:calculation:${c.recomposed}:${framing.asOf}`));
  const actual = [...out.framing!.claims, ...out.update!.claims].map((c) => `${c.claimId}:${c.kind}:${c.value}:${c.period}`);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) return null;
  const c = <K extends keyof Spec>(k: K) => out[k]!.content as Content<K>;
  return freezeArtifactValue({framing, inventory: c("inventory"), findings: c("findings").rows, decisionFindings: c("decision-findings"), generalFindings: c("general-findings"),
    versions: c("versions").rows, documentary: c("documentary").rows, notRead: c("not-read").rows, purposeGaps: c("purpose-gaps").rows, questions: c("questions").rows,
    update, informationGaps: c("information-gaps").rows, exclusions: c("exclusions").items}) as DocumentFolderResultBlocksView;
}
