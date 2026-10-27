import {z} from "zod";
import {capacityUuid} from "./debt-capacity-premises";
import type {ProposedHypothesis} from "./investment-premises";
import {documentReadingSchema} from "./document-folder-inventory";
import {inventoryDecisionRecordSchema, inventoryEntityRecordSchema, inventoryInformedRecordSchema, inventoryVaultRecordSchema} from "./adopted-document-folder-inventory";

const text = z.string().trim().min(1).max(2000);
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const origins = ["document", "informed", "house", "estimate"] as const;
const originLabel: Record<(typeof origins)[number], string> = {document: "documento", informed: "informado", house: "premissa da casa", estimate: "estimativa"};
/** A value and where it came from; the source names the file read, the message or the project context. */
const fact = <T extends z.ZodType>(value: T) => z.strictObject({value, origin: z.enum(origins), source: text});
type Origin = {origin: (typeof origins)[number]; source: string};
const context = {entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/), definitionVersionId: z.uuid(), openingDate: z.iso.date(), readingDate: z.iso.date()};

/** The folder as facts: each file reading as the extraction produced it from content (origin: document),
 * the company's entities, the decisions in course and the vault (the project context). Nothing is adopted
 * until a person confirms the set. */
export const documentFolderInventoryFactsSchema = z.strictObject({
  inventoryId: z.uuid(), ...context,
  entities: z.array(fact(inventoryEntityRecordSchema.safeExtend({id: key}))).min(1).max(50),
  decisions: z.array(fact(inventoryDecisionRecordSchema.safeExtend({id: key}))).max(12),
  vault: z.array(fact(inventoryVaultRecordSchema.safeExtend({documentId: key}))).max(200),
  /** In arrival order. */
  files: z.array(fact(documentReadingSchema)).min(1).max(200),
}).superRefine((f, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  if (f.readingDate <= f.openingDate) fail("The reading date must come after the start of the window");
  for (const [name, ids] of [["entity", f.entities.map((e) => e.value.id)], ["decision", f.decisions.map((d) => d.value.id)], ["vault entry", f.vault.map((v) => v.value.documentId)], ["file", f.files.map((x) => x.value.fileId)]] as const)
    if (new Set(ids).size !== ids.length) fail(`Duplicate ${name}`);
  if (f.files.some((x) => x.origin !== "document")) fail("A file reading comes from the document");
});
export type DocumentFolderInventoryFacts = z.infer<typeof documentFolderInventoryFactsSchema>;

/** What arrived after the inventory: readings, and facts the person informed with author and date. */
export const documentFolderUpdateFactsSchema = z.strictObject({
  updateId: z.uuid(), ...context, priorFingerprint: fact(hash),
  files: z.array(fact(documentReadingSchema)).max(50),
  informed: z.array(fact(inventoryInformedRecordSchema.safeExtend({id: key}))).max(20),
}).superRefine((f, ctx) => {
  if (f.informed.some((i) => i.origin !== "informed")) ctx.addIssue({code: "custom", message: "An informed fact is informed by the person"});
  if (new Set(f.files.map((x) => x.value.fileId)).size !== f.files.length) ctx.addIssue({code: "custom", message: "Duplicate file"});
});
export type DocumentFolderUpdateFacts = z.infer<typeof documentFolderUpdateFactsSchema>;

export const documentFolderInventoryAnalysisId = (inventoryId: string) => capacityUuid(`offroad:document-folder-inventory:${inventoryId}:analysis`);
export const documentFolderUpdateAnalysisId = (updateId: string) => capacityUuid(`offroad:document-folder-inventory-update:${updateId}:analysis`);
/** The size of one working basis. */
export const maxDocumentFolderInventoryHypotheses = 256;

function proposer(f: z.infer<z.ZodObject<typeof context>>, prefix: string) {
  const out: ProposedHypothesis[] = [];
  const add = (path: string, unit: string, value: ProposedHypothesis["value"], reason: string) => out.push({fieldPath: prefix + path,
    dimensions: {entityId: f.entityId, perimeter: f.perimeter, periodStart: f.openingDate, periodEnd: f.readingDate, currency: f.currency, unit, scale: "1", scenario: "base", definitionVersionId: f.definitionVersionId},
    value, reason});
  const why = (x: Origin) => `Origem: ${originLabel[x.origin]}. ${x.source}`;
  // One record per adoption, as canonical JSON: the reader parses it with the strict schema.
  const json = (path: string, value: unknown, x: Origin) => add(path, "identity", {type: "text", value: JSON.stringify(value)}, why(x));
  const order = (path: string, ids: string[], source: string) => {if (ids.length) add(path, "identity", {type: "list", value: ids}, `Origem: premissa da casa. ${source}`);};
  return {out, json, order, add, why};
}

/** The hypotheses one confirmation adopts for the folder: one record per file reading, entity, decision
 * and vault entry, and the arrival order. Deterministic; nothing is read from a file name here. */
export function proposeDocumentFolderInventoryHypotheses(raw: unknown): ProposedHypothesis[] {
  const f = documentFolderInventoryFactsSchema.parse(raw);
  const {out, json, order} = proposer(f, `document_folder_inventory.${documentFolderInventoryAnalysisId(f.inventoryId)}.`);
  for (const e of f.entities) {const {id, ...v} = e.value; json(`entity.${id}.record`, v, e);}
  for (const d of f.decisions) {const {id, ...v} = d.value; json(`decision.${id}.record`, v, d);}
  for (const x of f.vault) {const {documentId, ...v} = x.value; json(`vault.${documentId}.record`, v, x);}
  for (const x of f.files) json(`file.${x.value.fileId}.reading`, x.value, x);
  order("order.entities", f.entities.map((e) => e.value.id), "Ordem do cadastro como informada");
  order("order.decisions", f.decisions.map((d) => d.value.id), "Ordem das decisões em curso como informada");
  order("order.vault", f.vault.map((v) => v.value.documentId), "Ordem do cofre como informada");
  order("order.files", f.files.map((x) => x.value.fileId), "Ordem de chegada dos arquivos");
  if (out.length > maxDocumentFolderInventoryHypotheses) throw new Error("document_inventory_premises_exceed_basis");
  return out;
}

/** The hypotheses for what arrived later: the readings, the informed facts and the basis it updates. */
export function proposeDocumentFolderUpdateHypotheses(raw: unknown): ProposedHypothesis[] {
  const f = documentFolderUpdateFactsSchema.parse(raw);
  const {out, json, order, add, why} = proposer(f, `document_folder_inventory_update.${documentFolderUpdateAnalysisId(f.updateId)}.`);
  add("prior.fingerprint", "identity", {type: "text", value: f.priorFingerprint.value}, why(f.priorFingerprint));
  for (const x of f.files) json(`file.${x.value.fileId}.reading`, x.value, x);
  for (const i of f.informed) {const {id, ...v} = i.value; json(`informed.${id}.record`, v, i);}
  order("order.files", f.files.map((x) => x.value.fileId), "Ordem de chegada dos arquivos");
  order("order.informed", f.informed.map((i) => i.value.id), "Ordem das informações recebidas");
  if (out.length > maxDocumentFolderInventoryHypotheses) throw new Error("document_inventory_premises_exceed_basis");
  return out;
}
