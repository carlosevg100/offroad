import {canCompileStandaloneDocumentWorkRequest, documentWorkJob} from "@offroad/work-plan";
export {canCompileStandaloneDocumentWorkRequest, documentWorkJob} from "@offroad/work-plan";
import {createHash} from "node:crypto";
import {documentWorkRequestBindingSchema, type DocumentWorkProductInput} from "@offroad/domain-contracts";
import {documentLayerSchema, type DocumentLayer} from "@offroad/document-intelligence";
import {decodeBoundReceivablesEvidence, type ReceivablesEvidenceEnvelope} from "./receivables-evidence";

export const documentWorkRequestSchema = documentWorkRequestBindingSchema;
export type DocumentWorkRequest = ReturnType<typeof documentWorkRequestSchema.parse>;

/** The approved deliverable must explicitly limit execution to documentary work.
 * An ordinary request to compare funding alternatives still follows the financial engine. */
export function isStandaloneDocumentWorkRequest(request: DocumentWorkRequest): boolean {
  return request.executionScope === "documentary_only" && canCompileStandaloneDocumentWorkRequest(request);
}

function* layerPassages(layer: DocumentLayer): Generator<{anchor: string; text: string}> {
  for (const page of layer.pages ?? []) {
    for (const block of page.blocks) yield {anchor: `page:${page.n}/${block.id}`, text: block.text};
    for (const table of page.tables) for (const row of table.rows) yield {anchor: `page:${page.n}/${table.id}/${row.id}`, text: row.cells.map(cell => cell.text).join(" | ")};
  }
  for (const section of layer.sections ?? []) {
    for (const block of section.paragraphs) yield {anchor: `${section.id}/${block.id}`, text: block.text};
    for (const table of section.tables) for (const row of table.rows) yield {anchor: `${section.id}/${table.id}/${row.id}`, text: row.cells.map(cell => cell.text).join(" | ")};
  }
  for (const slide of layer.slides ?? []) {
    for (const block of slide.blocks) yield {anchor: `slide:${slide.n}/${block.id}`, text: block.text};
    for (const table of slide.tables) for (const row of table.rows) yield {anchor: `slide:${slide.n}/${table.id}/${row.id}`, text: row.cells.map(cell => cell.text).join(" | ")};
  }
  for (const sheet of layer.sheets ?? []) {
    // Preserve row relationships (term, value, unit) from parsed tables when present.
    if (sheet.tables.length) {
      for (const table of sheet.tables) for (const row of table.rows) yield {anchor: `sheet:${sheet.name}/${table.id}/${row.id}`, text: row.cells.map(cell => cell.text).join(" | ")};
    } else for (const cell of sheet.cells) if (cell.v !== null) yield {anchor: `sheet:${sheet.name}/${cell.ref}`, text: String(cell.v)};
  }
}

export function buildDocumentWorkInput(input: {
  request: DocumentWorkRequest; locale: "pt-BR" | "en-US";
  sources: Record<string, unknown>[]; envelopes: ReceivablesEvidenceEnvelope[];
}): DocumentWorkProductInput | null {
  const job = documentWorkJob(input.request.objective);
  if (!job) return null;
  const passages: DocumentWorkProductInput["passages"] = [];
  const limitations: string[] = [];
  let omittedPassages = 0;
  let characters = 0;
  let decodedBytes = 0;
  const pt = input.locale === "pt-BR";
  const seen = new Set<string>();
  const sources = new Map(input.sources.map(source => [String(source.id), source]));
  const readDocuments = new Set<string>();
  const documentCount = Math.max(1, input.envelopes.filter(item => item.content_kind === "document_layer").length);
  const perDocumentLimit = Math.max(1, Math.floor(80 / documentCount));
  const perDocumentCharacterLimit = Math.floor(120000 / documentCount);
  for (const envelope of [...input.envelopes].sort((a, b) => a.source_document_id.localeCompare(b.source_document_id))) {
    const source = sources.get(envelope.source_document_id);
    if (!source || source.sha256 !== envelope.source_sha256 || Number(source.document_version) !== envelope.document_version
      || source.processing_status !== "ready") throw new Error("document_work_source_not_current");
    if (seen.has(envelope.source_document_id)) throw new Error("document_work_duplicate_source");
    seen.add(envelope.source_document_id);
    if (envelope.content_kind !== "document_layer") continue;
    if (decodedBytes + envelope.uncompressed_bytes > 16 * 1024 * 1024) continue;
    decodedBytes += envelope.uncompressed_bytes;
    const decoded = decodeBoundReceivablesEvidence(envelope);
    if (decoded.kind !== "document_layer") continue;
    let documentPassages = 0;
    let documentCharacters = 0;
    for (const passage of layerPassages(documentLayerSchema.parse(decoded.evidence.layer))) {
      if (!passage.text.trim()) continue;
      if (documentPassages >= perDocumentLimit || passages.length >= 80 || passage.text.length > 12000 || documentCharacters + passage.text.length > perDocumentCharacterLimit || characters + passage.text.length > 120000 || passage.anchor.length > 500) {omittedPassages++; continue;}
      const id = createHash("sha256").update(JSON.stringify([envelope.source_document_id, envelope.document_version, passage.anchor])).digest("hex");
      if (passages.some(prior => prior.id === id)) throw new Error("document_work_duplicate_anchor");
      passages.push({id, documentId: envelope.source_document_id, documentName: String(source.original_name ?? decoded.evidence.fileName), version: String(envelope.document_version), hash: envelope.source_sha256, ...passage});
      characters += passage.text.length;
      documentCharacters += passage.text.length;
      documentPassages++;
      readDocuments.add(envelope.source_document_id);
    }
  }
  if (!passages.length) return null;
  const unread = sources.size - readDocuments.size;
  if (unread > 0) limitations.push(pt ? `${unread} documento(s) não forneceram trechos para esta leitura.` : `${unread} document(s) supplied no passages for this reading.`);
  if (omittedPassages > 0) limitations.push(pt ? "A leitura é parcial: há trechos fora do limite desta execução." : "This reading is partial: passages exceed this execution's limits.");
  limitations.push(pt ? "Leitura dos trechos disponíveis; não comprova revisão integral dos documentos nem conciliação financeira." : "Reading of available passages; this does not establish complete document review or financial reconciliation.");
  return {job, locale: input.locale, approvedRequest: {text: input.request.objective, fingerprint: input.request.requestFingerprint}, passages,
    coverage: {documentsConsidered: sources.size, omittedPassages, limitations}};
}
