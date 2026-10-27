import {createHash} from "node:crypto";
import {z} from "zod";
import {adoptedDocumentFolderInventoryOutputSchema, calculateAdoptedDocumentFolderInventory, documentFolderInventoryAnalysesSchema} from "./adopted-document-folder-inventory";
import {inventoryModes} from "./document-folder-inventory";

export const documentFolderInventoryPacketVersion = "2026.10.27-v1";
const text = z.string().trim().min(1).max(2000), key = z.string().trim().min(1).max(160), hash = z.string().regex(/^[a-f0-9]{64}$/);
const decimal = z.string().regex(/^-?\d{1,30}(?:\.\d{1,20})?$/);
const source = z.strictObject({fileId: key, page: z.number().int().nullable(), section: text.nullable()});

/** One request to organize a folder. The mode is how the conversation framed it: organize (and say what
 * matters for the decisions in course), organize only (no analysis yet) or organize for the debt discussion. */
export const documentFolderInventoryPacketInputSchema = z.strictObject({
  schemaVersion: z.literal("document-folder-inventory-packet-input.v1"),
  question: text,
  mode: z.enum(inventoryModes).default("organize"),
  analysis: documentFolderInventoryAnalysesSchema,
});
export type DocumentFolderInventoryPacketInput = z.input<typeof documentFolderInventoryPacketInputSchema>;
const packetExclusions = ["ratio_calculation", "projection", "recommendation", "document_validation", "third_party_distribution"] as const;

export const documentFolderInventoryPacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("document-folder-inventory-packet.v1"), executorVersion: z.literal(documentFolderInventoryPacketVersion),
  question: text, mode: z.enum(inventoryModes), basisFingerprint: hash, scope: adoptedDocumentFolderInventoryOutputSchema.shape.scope, entityId: z.uuid(),
  result: adoptedDocumentFolderInventoryOutputSchema,
  /** What the answer says, in order: the size and how it was organized, what matters for the decisions in course,
   * the versions, what was not read, what is missing by purpose, and at most two questions. */
  readings: z.strictObject({
    opening: z.strictObject({files: z.number().int(), groups: z.array(text).max(200), duplicates: z.number().int(), superseded: z.number().int(), inVault: z.number().int()}),
    decisionFindings: z.array(z.strictObject({rank: z.number().int(), statement: text, decisionIds: z.array(key).min(1), sources: z.array(source).min(1)})).max(100).nullable(),
    generalFindings: z.array(z.strictObject({rank: z.number().int(), statement: text})).max(100).nullable(),
    versions: z.array(z.strictObject({familyId: key, resolution: key, prevails: z.array(key), superseded: z.array(key), sideBySide: z.array(key), highlighted: z.boolean()})).max(100),
    /** What the documents say, quoted with file and page or sheet; kept apart from everything the method states. */
    documentary: z.array(z.strictObject({findingId: z.string().min(1).max(80), fileId: key, page: z.number().int().nullable(), section: text.nullable(), text})).max(500),
    notRead: z.array(z.strictObject({fileId: key, pages: z.array(z.number().int()).nullable(), statement: text})).max(250),
    gaps: z.array(z.strictObject({item: text, why: text, purposes: z.array(key).min(1), conditional: z.boolean()})).max(100),
    questions: z.array(text).max(2),
    /** A later turn: only the rows what arrived touches, the identity checks it allows, and the facts recorded with author and date. */
    update: z.strictObject({rowsUpdated: z.array(key), rowsAdded: z.array(key), rowsPreserved: z.number().int(), newFindings: z.array(z.strictObject({statement: text, quoted: z.strictObject({fileId: key, page: z.number().int().nullable(), section: text.nullable(), text}).nullable()})),
      identityChecks: z.array(z.strictObject({id: key, status: z.enum(["matches", "differs", "not_run"]), reported: decimal.nullable(), recomposed: decimal.nullable()})),
      informed: z.array(z.strictObject({statement: text, author: text, date: z.iso.date()})), stillOpen: z.array(text)}).nullable(),
    numericAnalysis: z.literal("none"), documentsValidated: z.literal(false),
  }).nullable(),
  gaps: z.array(z.strictObject({operand: text, reason: text})).max(1024),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  exclusions: z.array(z.enum(packetExclusions)).length(5).refine((v) => v.join("|") === packetExclusions.join("|"), "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
export type DocumentFolderInventoryPacket = z.infer<typeof documentFolderInventoryPacketOutputSchema>;

/** Organizes a folder the person dropped: the inventory by subject (and by entity first when the folder
 * spans several companies), each file read by content with entity, period, version and situation; the
 * copy by hash and what was already in the vault; versions resolved without deleting any; amendments read
 * with the original; what was not read, by page; what in the folder matters for the decisions in course,
 * each with its source; the gaps for the purpose; at most two questions. A later turn updates only the rows
 * touched. It never calculates ratios, projects, recommends, validates a document or sends anything. */
export function prepareDocumentFolderInventoryPacket(raw: unknown): DocumentFolderInventoryPacket {
  const input = documentFolderInventoryPacketInputSchema.parse(raw);
  const result = calculateAdoptedDocumentFolderInventory(input.analysis, input.mode);
  // An update that could not be read leaves the base inventory standing, and the packet partial.
  const inv = result.inventory ?? result.priorInventory;
  const readings = inv ? {
    opening: {files: inv.counts.files, groups: [...new Set(inv.groups.map((g) => g.label))], duplicates: inv.counts.duplicates, superseded: inv.counts.superseded, inVault: inv.counts.inVault},
    decisionFindings: inv.decisionFindings?.map((d) => ({rank: d.rank, statement: d.statement, decisionIds: d.decisionIds, sources: d.sources})) ?? null,
    generalFindings: inv.generalFindings?.map((d) => ({rank: d.rank, statement: d.statement})) ?? null,
    versions: inv.families.map((f) => ({familyId: f.id, resolution: f.resolution, prevails: f.prevails, superseded: f.superseded, sideBySide: f.sideBySide, highlighted: f.highlighted})),
    documentary: [...inv.findings.filter((f) => f.quoted !== null && f.status === "open").map((f) => ({findingId: f.id, ...f.quoted!})),
      ...inv.gaps.filter((g) => g.quoted !== null && g.status === "open" && !inv.findings.some((f) => f.id === g.findingId && f.quoted !== null)).map((g) => ({findingId: g.id, ...g.quoted!}))],
    notRead: inv.findings.filter((f) => (f.code === "page_unreadable" || f.code === "file_unreadable") && f.status === "open")
      .map((f) => ({fileId: f.anchor, pages: f.code === "page_unreadable" ? f.sources.flatMap((s) => s.page === null ? [] : [s.page]) : null, statement: f.statement})),
    gaps: inv.gaps.filter((g) => g.status === "open").map((g) => ({item: g.item, why: g.why, purposes: g.purposes, conditional: g.conditional})),
    questions: inv.questions.filter((q) => q.status === "open").map((q) => q.text),
    update: inv.update ? {rowsUpdated: inv.update.rowsUpdated, rowsAdded: inv.update.rowsAdded, rowsPreserved: inv.update.rowsPreserved,
      newFindings: inv.findings.filter((f) => inv.update!.findingsAdded.includes(f.id)).map((f) => ({statement: f.statement, quoted: f.quoted})),
      // Only the checks the arrival made possible are restated.
      identityChecks: inv.identityChecks.filter((c) => result.priorInventory?.identityChecks.some((p) => p.id === c.id && p.status !== c.status) ?? false)
        .map((c) => ({id: c.id, status: c.status, reported: c.reported, recomposed: c.recomposed})),
      informed: inv.informed.map((i) => ({statement: i.statement, author: i.author, date: i.date})),
      stillOpen: inv.gaps.filter((g) => g.status === "open" && !g.conditional).map((g) => g.item)} : null,
    numericAnalysis: "none" as const, documentsValidated: false as const,
  } : null;
  // A copy read two ways is a declared conflict the person resolves; the packet is partial until then.
  const gaps = [...result.gaps, ...(inv?.readingConflicts ?? []).flatMap((c) => c.fileIds.map((id) => ({operand: `document_folder_inventory.${result.analysisId}.file.${id}.reading`, reason: "reading_conflicts_with_same_hash"})))];
  const status = !inv ? (result.status === "base_only" ? "partial" as const : "framed" as const) : gaps.length ? "partial" as const : "prepared_for_human_review" as const;
  const payload = {schemaVersion: "document-folder-inventory-packet.v1" as const, executorVersion: documentFolderInventoryPacketVersion,
    question: input.question, mode: input.mode, basisFingerprint: result.basisFingerprint, scope: result.scope, entityId: result.entityId,
    result, readings, gaps, status, exclusions: packetExclusions, grantsExecution: false as const, grantsPublication: false as const};
  return documentFolderInventoryPacketOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
