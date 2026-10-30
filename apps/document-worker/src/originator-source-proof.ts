import {createHash} from "node:crypto";
import {z} from "zod";
import {documentLayerSchema, type DocumentLayer} from "@offroad/document-intelligence";
import {originatorCaseFactsSchema} from "@offroad/financial-model";

/** Supplied by the existing authorized source loader, never by the model. This helper verifies
 * content integrity; it does not confer source access or replace the loader's current rights check. */
export const originatorAuthorizedLayerSchema = z.strictObject({documentId: z.uuid(), sourceVersionId: z.uuid(), documentSha256: z.string().regex(/^[a-f0-9]{64}$/), layerSha256: z.string().regex(/^[a-f0-9]{64}$/), layerJson: z.string().min(2).max(10000000)});
export type OriginatorAuthorizedLayer = z.infer<typeof originatorAuthorizedLayerSchema>;
const foldSpace = (s: string) => s.replace(/\s+/g, " ").trim();
const tables = (ts: NonNullable<DocumentLayer["pages"]>[number]["tables"]) => ts.flatMap(t => t.rows.map(r => r.cells.map(c => c.text).join(" | ")));
function anchorText(layer: DocumentLayer, anchor: string): string[] {
  const page = /^page:([1-9]\d*)$/.exec(anchor), slide = /^slide:([1-9]\d*)$/.exec(anchor), section = /^section:(.+)$/.exec(anchor);
  if (page) return (layer.pages ?? []).filter(p => p.n === Number(page[1])).map(p => [...p.blocks.map(b => b.text), ...tables(p.tables)].join("\n"));
  if (slide) return (layer.slides ?? []).filter(p => p.n === Number(slide[1])).map(p => [...p.blocks.map(b => b.text), ...tables(p.tables)].join("\n"));
  if (section) return [...(layer.sheets ?? []).filter(s => s.name === section[1]).map(s => s.cells.map(c => `${c.ref}: ${c.v ?? ""}`).join("\n")),
    ...(layer.sections ?? []).filter(s => s.id === section[1] || s.heading === section[1]).map(s => [...s.paragraphs.map(p => p.text), ...tables(s.tables)].join("\n"))];
  return [];
}

/** Refuses a model's source pointer unless the exact quoted passage exists at the declared anchor
 * of the authorized stored layer and both immutable version and byte identities agree. */
export function proveOriginatorCaseSources(raw: unknown, rawDocuments: readonly unknown[]) {
  const f = originatorCaseFactsSchema.parse(raw), documents = rawDocuments.map(d => originatorAuthorizedLayerSchema.parse(d));
  const issues: Array<{sourceId: string; code: string}> = [];
  const layers = new Map<string, {document: OriginatorAuthorizedLayer; layer: DocumentLayer}>();
  for (const d of documents) {
    const identity = d.documentId + "/" + d.sourceVersionId;
    if (layers.has(identity)) throw new Error("originator_authorized_layer_identity_conflict");
    if (createHash("sha256").update(d.layerJson).digest("hex") !== d.layerSha256) throw new Error("originator_authorized_layer_hash_mismatch");
    const layer = documentLayerSchema.parse(JSON.parse(d.layerJson));
    if (layer.documentId !== d.documentId) throw new Error("originator_authorized_layer_document_mismatch");
    layers.set(identity, {document: d, layer});
  }
  if (f.kind === "kit") {
    for (const file of f.facts.inventory.files) {
      const matches = documents.filter(d => d.documentId === file.fileId && d.documentSha256 === file.sha256);
      if (matches.length !== 1) issues.push({sourceId: file.fileId, code: "kit_file_not_uniquely_bound_to_authorized_layer"});
    }
  } else for (const source of f.facts.sources) {
    if (source.origin !== "provided_document") {issues.push({sourceId: source.id, code: "public_query_execution_receipt_missing"}); continue;}
    const held = layers.get(source.documentId + "/" + source.sourceVersionId);
    if (!held) {issues.push({sourceId: source.id, code: "source_version_not_in_authorized_layers"}); continue;}
    if (source.sha256 !== held.document.documentSha256) {issues.push({sourceId: source.id, code: "source_document_hash_mismatch"}); continue;}
    const texts = anchorText(held.layer, source.anchor);
    if (texts.length !== 1) {issues.push({sourceId: source.id, code: "source_anchor_missing_or_ambiguous"}); continue;}
    if (!foldSpace(texts[0]!).includes(foldSpace(source.quote))) issues.push({sourceId: source.id, code: "source_quote_not_in_authorized_layer"});
  }
  return {ok: issues.length === 0, issues};
}
