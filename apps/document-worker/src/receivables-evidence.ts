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
