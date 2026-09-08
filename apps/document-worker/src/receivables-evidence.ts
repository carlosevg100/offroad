import {createHash} from "node:crypto";
import {gunzipSync, gzipSync} from "node:zlib";

import type {NfeArchiveParseResult, ParseResult} from "@offroad/document-parsers";
import {documentLayerSchema} from "@offroad/document-intelligence";
import type {
  ReceivablesEvidenceDocument,
  ReceivablesFiscalArchiveEvidence,
} from "@offroad/receivables-analysis";
import {z} from "zod";

export const receivablesEvidenceFragmentVersion = "2026.08.28-v1";
const maxCompressedBytes = 32 * 1024 * 1024;
const maxUncompressedBytes = 200 * 1024 * 1024;

export const receivablesEvidenceEnvelopeSchema = z.object({
  source_document_id: z.uuid(),
  document_version: z.number().int().positive(),
  content_kind: z.enum(["document_layer", "nfe_archive"]),
  schema_version: z.literal(receivablesEvidenceFragmentVersion),
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  payload_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  codec: z.literal("gzip-json-v1"),
  uncompressed_bytes: z.coerce.number().int().min(2).max(maxUncompressedBytes),
  payload_base64: z.string().min(4),
});
export type ReceivablesEvidenceEnvelope = z.infer<typeof receivablesEvidenceEnvelopeSchema>;

export const receivablesEvidenceDocumentSchema = z.object({
  id: z.uuid(),
  fileName: z.string().min(1),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  layer: documentLayerSchema,
});

export const receivablesFiscalArchiveEvidenceSchema = z.object({
  archiveId: z.uuid(),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  invoices: z.array(z.object({
    entryName: z.string().min(1),
    accessKey: z.string().min(1),
    accessKeyValid: z.boolean(),
    issuerTaxId: z.string().nullable(),
  })),
  cancellations: z.array(z.object({
    entryName: z.string().min(1),
    accessKey: z.string().min(1),
    accessKeyValid: z.boolean(),
    registrationStatus: z.string().nullable(),
  })),
});

type EncodedEvidence = {
  schemaVersion: typeof receivablesEvidenceFragmentVersion;
  contentSha256: string;
  payloadSha256: string;
  uncompressedBytes: number;
  payloadBase64: string;
};

const hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** Fingerprints the current source manifest, independently of transport encoding/order. */
export function fingerprintReceivablesEvidence(envelopes: readonly ReceivablesEvidenceEnvelope[]): string {
  const seen = new Set<string>();
  const sources = envelopes.map((input) => {
    const envelope = receivablesEvidenceEnvelopeSchema.parse(input);
    const sourceId = envelope.source_document_id.toLowerCase();
    if (seen.has(sourceId)) {
      throw Object.assign(new Error("receivables evidence contains a repeated source document"), {
        code: "receivables_evidence_duplicate_source",
      });
    }
    seen.add(sourceId);
    return {
      source_document_id: sourceId,
      document_version: envelope.document_version,
      content_kind: envelope.content_kind,
      source_sha256: envelope.source_sha256,
      content_sha256: envelope.content_sha256,
      schema_version: envelope.schema_version,
    };
  }).sort((a, b) => a.source_document_id < b.source_document_id ? -1 : a.source_document_id > b.source_document_id ? 1 : 0);
  return hash(Buffer.from(JSON.stringify({schemaVersion: "receivables-evidence-manifest.v1", sources}), "utf8"));
}

export function encodeReceivablesEvidence(value: unknown): EncodedEvidence {
  const content = Buffer.from(JSON.stringify(value), "utf8");
  if (content.byteLength > maxUncompressedBytes) {
    throw Object.assign(new Error("receivables evidence exceeds the governed uncompressed limit"), {
      code: "receivables_evidence_too_large",
    });
  }
  const compressed = gzipSync(content, {level: 9});
  if (compressed.byteLength > maxCompressedBytes) {
    throw Object.assign(new Error("receivables evidence exceeds the governed compressed limit"), {
      code: "receivables_evidence_too_large",
    });
  }
  return {
    schemaVersion: receivablesEvidenceFragmentVersion,
    contentSha256: hash(content),
    payloadSha256: hash(compressed),
    uncompressedBytes: content.byteLength,
    payloadBase64: compressed.toString("base64"),
  };
}

export function decodeReceivablesEvidence(envelope: ReceivablesEvidenceEnvelope): unknown {
  const compressed = Buffer.from(envelope.payload_base64, "base64");
  if (compressed.byteLength > maxCompressedBytes || hash(compressed) !== envelope.payload_sha256) {
    throw Object.assign(new Error("receivables evidence payload failed integrity verification"), {
      code: "receivables_evidence_payload_invalid",
    });
  }
  const content = gunzipSync(compressed, {maxOutputLength: maxUncompressedBytes});
  if (content.byteLength !== envelope.uncompressed_bytes || hash(content) !== envelope.content_sha256) {
    throw Object.assign(new Error("receivables evidence content failed integrity verification"), {
      code: "receivables_evidence_content_invalid",
    });
  }
  return JSON.parse(content.toString("utf8")) as unknown;
}

export type BoundReceivablesEvidence =
  | {kind: "document_layer"; evidence: ReceivablesEvidenceDocument}
  | {kind: "nfe_archive"; evidence: ReceivablesFiscalArchiveEvidence};

/** Content integrity alone does not bind a fragment to the authorized source. */
export function decodeBoundReceivablesEvidence(envelope: ReceivablesEvidenceEnvelope): BoundReceivablesEvidence {
  const source = receivablesEvidenceEnvelopeSchema.parse(envelope);
  const decoded = decodeReceivablesEvidence(source);
  const mismatch = () => Object.assign(new Error("receivables evidence does not match its source"), {
    code: "receivables_evidence_source_mismatch",
  });
  if (source.content_kind === "nfe_archive") {
    const evidence = receivablesFiscalArchiveEvidenceSchema.parse(decoded);
    if (evidence.archiveId !== source.source_document_id || evidence.fileHash !== source.source_sha256) throw mismatch();
    return {kind: "nfe_archive", evidence};
  }
  const evidence = receivablesEvidenceDocumentSchema.parse(decoded);
  if (evidence.id !== source.source_document_id || evidence.layer.documentId !== source.source_document_id
    || evidence.layer.documentVersion !== source.document_version
    || evidence.fileHash !== source.source_sha256) throw mismatch();
  return {kind: "document_layer", evidence};
}

export function documentEvidence(input: {
  documentId: string;
  fileName: string;
  fileHash: string;
  parsed: ParseResult;
}): ReceivablesEvidenceDocument {
  return {
    id: input.documentId,
    fileName: input.fileName,
    fileHash: input.fileHash,
    layer: input.parsed.layer,
  };
}

export function fiscalArchiveEvidence(parsed: NfeArchiveParseResult): ReceivablesFiscalArchiveEvidence {
  return {
    archiveId: parsed.archiveId,
    fileHash: parsed.fileHash,
    invoices: parsed.invoices.map((invoice) => ({
      entryName: invoice.entryName,
      accessKey: invoice.accessKey,
      accessKeyValid: invoice.accessKeyValid,
      issuerTaxId: invoice.issuerTaxId,
    })),
    cancellations: parsed.cancellations.map((event) => ({
      entryName: event.entryName,
      accessKey: event.accessKey,
      accessKeyValid: event.accessKeyValid,
      registrationStatus: event.registrationStatus,
    })),
  };
}
