import {createHash} from "node:crypto";
import {z} from "zod";
import {adoptionBasisEntrySchema, readContextualBasis} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {adoptedAnalysisContextSchema, createAnalysisBinding} from "./adopted-analysis-binding";
import {documentFolderInventoryLimits as L, documentFolderInventoryOutputSchema, documentFolderInventoryVersion, documentReadingSchema, inventoryFingerprint, inventoryModes, organizeDocumentFolder,
  type DocumentFolderInventory, type DocumentReading} from "./document-folder-inventory";

// The same limits as the kernel's, from the one source: what is read here is what the inventory can hold.
const key = z.string().regex(new RegExp(`^[a-z0-9][a-z0-9-]{0,${L.key - 1}}$`)), text = z.string().trim().min(1).max(L.text), hash = z.string().regex(/^[a-f0-9]{64}$/);
const label = z.string().trim().min(1).max(L.label);
/** Every slot the reader may read: one gap, one binding and one contribution at most each. */
const slots = L.entities + L.decisions + L.vault + L.baseFiles + L.updateFiles + L.informed + 1;
/** One adopted record is one canonical JSON text: a file reading, an entity, a decision in course, a vault entry or an informed fact. */
const record = <T extends z.ZodType>(schema: T) => z.string().min(2).max(L.record).transform((s, ctx) => {
  try {return JSON.parse(s) as unknown;} catch {ctx.addIssue({code: "custom", message: "document_inventory_record_not_json"}); return z.NEVER;}
}).pipe(schema);
export const inventoryEntityRecordSchema = z.strictObject({label, groupId: key, groupLabel: label, parentId: key.nullable(), ownership: z.string().regex(/^\d{1,4}(?:\.\d{1,8})?$/).nullable()});
export const inventoryDecisionRecordSchema = z.strictObject({label, kind: z.enum(["financing_plan", "investment_project", "debt_discussion"])});
export const inventoryVaultRecordSchema = z.strictObject({sha256: hash, label, instrumentRef: key.nullable()});
export const inventoryInformedRecordSchema = z.strictObject({questionId: z.string().min(1).max(L.id), statement: text, author: text, date: z.iso.date()});
const slot = z.strictObject({id: key, value: selection});

/** The folder as adopted: the registry of the company's entities, the decisions in course, the vault, and
 * one reading per file in arrival order. The analysis period runs to the reading date. */
export const adoptedDocumentFolderInventoryInputSchema = adoptedAnalysisContextSchema.safeExtend({
  analysisId: z.uuid(), scenario: text,
  /** The company under analysis, adopted as a record of its own. */
  subjectEntityId: selection,
  entities: z.array(slot).min(1).max(L.entities), decisions: z.array(slot).max(L.decisions), vault: z.array(slot).max(L.vault), files: z.array(slot).min(1).max(L.baseFiles),
}).refine((i) => i.endDate > i.openingDate, "Invalid reading window");
/** What arrived later, on its own basis: the readings, the facts the person informed, and the basis it updates by fingerprint. */
export const adoptedDocumentFolderUpdateInputSchema = adoptedAnalysisContextSchema.safeExtend({
  analysisId: z.uuid(), scenario: text, priorFingerprint: selection,
  files: z.array(slot).max(L.updateFiles), informed: z.array(slot).max(L.informed),
});
export const documentFolderInventoryAnalysesSchema = z.strictObject({base: adoptedDocumentFolderInventoryInputSchema, update: adoptedDocumentFolderUpdateInputSchema.nullable()});
export type DocumentFolderInventoryAnalyses = z.infer<typeof documentFolderInventoryAnalysesSchema>;

export const documentFolderInventoryExclusions = ["ratio_calculation", "projection", "recommendation", "document_validation", "third_party_distribution", "credit_approval"] as const;
const reference = z.strictObject({analysisId: z.uuid(), basisFingerprint: hash, inventoryFingerprint: hash.nullable()});
export const adoptedDocumentFolderInventoryOutputSchema = z.strictObject({
  schemaVersion: z.literal("adopted-document-folder-inventory.v1"), version: z.literal(documentFolderInventoryVersion),
  scope: adoptedAnalysisContextSchema.shape.scope, analysisId: z.uuid(), entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/), basisFingerprint: hash,
  base: reference, update: reference.nullable(),
  /** The inventory of the latest basis; when an update is read, the base inventory stays as it was produced. */
  inventory: documentFolderInventoryOutputSchema.nullable(), priorInventory: documentFolderInventoryOutputSchema.nullable(),
  gaps: z.array(z.strictObject({operand: text, reason: text})).max(slots),
  bindings: z.array(z.strictObject({operand: text, decisionId: z.uuid().nullable(), interpretationDecisionIds: z.array(z.uuid())})).max(slots),
  contributions: z.array(adoptionBasisEntrySchema).max(slots),
  status: z.enum(["complete", "base_only", "missing_inputs"]),
  derivedDependencies: z.array(z.strictObject({result: text, decisionIds: z.array(z.uuid())})),
  classification: z.enum(["working_hypothesis", "working_selection"]),
  exclusions: z.array(z.enum(documentFolderInventoryExclusions)).length(6).refine((v) => v.join("|") === documentFolderInventoryExclusions.join("|"), "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
export type AdoptedDocumentFolderInventory = z.infer<typeof adoptedDocumentFolderInventoryOutputSchema>;

/** The selections must cover every record the basis holds for the analysis, in the adopted arrival order:
 * leaving a selection out never makes an adopted file (an amendment, a page) disappear from the folder. */
function assertComplete(input: z.infer<typeof adoptedAnalysisContextSchema> & {analysisId: string}, prefix: string, slots: Record<string, {id: string}[]>) {
  const basis = readContextualBasis(input.envelope, input.scope), root = `${prefix}${input.analysisId}.`;
  const pattern = /^(entity|decision|vault|file|informed)\.([a-z0-9][a-z0-9-]{0,39})\.(record|reading)$/;
  const adopted = new Map<string, Set<string>>();
  let order: string[] | null = null;
  for (const e of basis.entries) {
    if (!e.fieldPath.startsWith(root)) continue;
    const rest = e.fieldPath.slice(root.length), m = pattern.exec(rest);
    if (m) adopted.set(m[1]!, (adopted.get(m[1]!) ?? new Set()).add(m[2]!));
    if (rest === "order.files" && e.value.type === "list") order = e.value.value;
  }
  for (const [kind, list] of Object.entries(slots)) {
    const ids = list.map((x) => x.id), held = adopted.get(kind) ?? new Set<string>();
    if (new Set(ids).size !== ids.length || [...held].some((id) => !ids.includes(id))) throw new Error("document_inventory_selection_incomplete");
  }
  if (order && slots.file && JSON.stringify(order) !== JSON.stringify(slots.file.map((f) => f.id))) throw new Error("document_inventory_selection_out_of_order");
}

/** Reads every record of one basis by field path, in the analysis' own dimensions. A record that is
 * not adopted is a named gap; the kernel never runs on a folder with a file it could not read. */
function readBasis<I extends z.infer<typeof adoptedAnalysisContextSchema> & {analysisId: string; scenario: string}>(input: I, prefix: string) {
  const b = createAnalysisBinding(input, []);
  let complete = true;
  const read = <T>(s: z.infer<typeof selection>, path: string, schema: z.ZodType<T>, unit = "identity") => {
    const v = b.read(s, `${prefix}${input.analysisId}.${path}`, input.scenario, unit, "text", schema);
    if (v === null) complete = false;
    return v;
  };
  return {b, read, complete: () => complete};
}

/** The folder inventory over one adopted basis, and optionally a later basis that names it by fingerprint:
 * the base is organized as adopted; the update adds what arrived and what the person informed, and the
 * kernel keeps every row the update does not touch byte for byte. Deterministic; no ratio, projection,
 * recommendation or validation. */
export function calculateAdoptedDocumentFolderInventory(raw: unknown, mode: (typeof inventoryModes)[number] = "organize"): AdoptedDocumentFolderInventory {
  const {base, update} = documentFolderInventoryAnalysesSchema.parse(raw);
  assertComplete(base, "document_folder_inventory.", {entity: base.entities, decision: base.decisions, vault: base.vault, file: base.files});
  if (update) assertComplete(update, "document_folder_inventory_update.", {file: update.files, informed: update.informed});
  const r = readBasis(base, "document_folder_inventory.");
  const entities = base.entities.map((e) => {const v = r.read(e.value, `entity.${e.id}.record`, record(inventoryEntityRecordSchema)); return v && {id: e.id, ...v};});
  const decisions = base.decisions.map((d) => {const v = r.read(d.value, `decision.${d.id}.record`, record(inventoryDecisionRecordSchema)); return v && {id: d.id, ...v};});
  const vault = base.vault.map((x) => {const v = r.read(x.value, `vault.${x.id}.record`, record(inventoryVaultRecordSchema)); return v && {documentId: x.id, ...v};});
  // The company under analysis is named, never inferred: it must be in the registry with no parent there.
  const subjectEntityId = r.read(base.subjectEntityId, "subject.entity", key);
  if (subjectEntityId !== null && entities.every((e) => e !== null)) {
    const subject = entities.find((e) => e!.id === subjectEntityId);
    if (!subject || (subject.parentId !== null && entities.some((e) => e!.id === subject.parentId))) throw new Error("document_inventory_subject_entity_invalid");
  }
  const reading = (f: z.infer<typeof slot>, read: typeof r.read) => {
    const v = read(f.value, `file.${f.id}.reading`, record(documentReadingSchema));
    if (v && v.fileId !== f.id) throw new Error("document_inventory_reading_of_another_file");
    return v;
  };
  const files = base.files.map((f) => reading(f, r.read));
  const baseComplete = r.complete();
  const kernel = (asOf: string, extra: DocumentReading[], informed: {id: string; questionId: string; statement: string; author: string; date: string}[], prior: DocumentFolderInventory | null) =>
    organizeDocumentFolder({asOf, mode, currency: base.currency, subjectEntityId: subjectEntityId!, entities: entities as NonNullable<(typeof entities)[number]>[], decisions: decisions as NonNullable<(typeof decisions)[number]>[],
      vault: vault as NonNullable<(typeof vault)[number]>[], files: [...files as DocumentReading[], ...extra], informed,
      prior: prior && {inventory: prior, fingerprint: inventoryFingerprint(prior)}});
  const baseInventory = baseComplete ? kernel(base.endDate, [], [], null) : null;

  let updateRef: z.infer<typeof reference> | null = null, updated: DocumentFolderInventory | null = null;
  const gaps = [...r.b.gaps], bindings = [...r.b.bindings], used = new Map(r.b.used);
  if (update) {
    if (update.entityId !== base.entityId || update.perimeter !== base.perimeter || update.currency !== base.currency || update.openingDate !== base.openingDate) throw new Error("document_inventory_update_context_mismatch");
    if (update.endDate < base.endDate) throw new Error("document_inventory_update_before_base");
    const u = readBasis(update, "document_folder_inventory_update.");
    const prior = u.read(update.priorFingerprint, "prior.fingerprint", hash);
    // The update names the basis it updates; it never updates another adoption of the folder.
    if (prior !== null && prior !== base.envelope.fingerprint) throw new Error("document_inventory_prior_version_mismatch");
    const extra = update.files.map((f) => reading(f, u.read));
    if (update.files.some((f) => base.files.some((x) => x.id === f.id))) throw new Error("document_inventory_update_repeats_a_file");
    const informed = update.informed.map((i) => {const v = u.read(i.value, `informed.${i.id}.record`, record(inventoryInformedRecordSchema)); return v && {id: i.id, ...v};});
    gaps.push(...u.b.gaps); bindings.push(...u.b.bindings); for (const [k, v] of u.b.used) used.set(k, v);
    if (baseInventory && u.complete()) updated = kernel(update.endDate, extra as DocumentReading[], informed as NonNullable<(typeof informed)[number]>[], baseInventory);
    updateRef = {analysisId: update.analysisId, basisFingerprint: update.envelope.fingerprint, inventoryFingerprint: updated ? inventoryFingerprint(updated) : null};
  }
  const inventory = update ? updated : baseInventory;
  const payload = {schemaVersion: "adopted-document-folder-inventory.v1" as const, version: documentFolderInventoryVersion, scope: (update ?? base).scope, analysisId: base.analysisId,
    entityId: base.entityId, perimeter: base.perimeter, currency: base.currency, basisFingerprint: (update ?? base).envelope.fingerprint,
    base: {analysisId: base.analysisId, basisFingerprint: base.envelope.fingerprint, inventoryFingerprint: baseInventory ? inventoryFingerprint(baseInventory) : null}, update: updateRef,
    inventory, priorInventory: update ? baseInventory : null, gaps, bindings, contributions: [...used.values()],
    status: inventory ? "complete" as const : baseInventory ? "base_only" as const : "missing_inputs" as const,
    derivedDependencies: [{result: "document_folder_inventory", decisionIds: [...used.keys()]}],
    classification: [...used.values()].some((e) => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: documentFolderInventoryExclusions, grantsExecution: false as const, grantsPublication: false as const};
  return adoptedDocumentFolderInventoryOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
