import {createHash} from "node:crypto";

import {fileTypeFromBuffer} from "file-type";
import JSZip from "jszip";
import {z} from "zod";

export const governedDocumentQuarantineVersion = "governed-document-quarantine.v1";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const uuidSchema = z.uuid();
const isoSchema = z.iso.datetime({offset: true});

export const quarantineReasonSchema = z.enum([
  "empty_file",
  "file_size_exceeded",
  "size_mismatch",
  "hash_mismatch",
  "unsupported_type",
  "declared_type_mismatch",
  "extension_type_mismatch",
  "malformed_container",
  "polyglot_content",
  "encrypted_document",
  "archive_entries_exceeded",
  "archive_member_exceeded",
  "archive_total_uncompressed_exceeded",
  "archive_ratio_exceeded",
  "nested_archive",
  "archive_path_unsafe",
  "active_content_inspection_exceeded",
  "active_macro",
  "active_script",
  "embedded_object",
  "external_relationship",
  "external_formula",
  "formula_injection",
  "scanner_unavailable",
  "malware_detected",
]);
export type QuarantineReason = z.infer<typeof quarantineReasonSchema>;

export const documentQuarantinePolicySchema = z.object({
  policyVersion: z.string().trim().min(1).max(120),
  maxFileBytes: z.number().int().positive(),
  maxArchiveEntries: z.number().int().positive(),
  maxArchiveMemberBytes: z.number().int().positive(),
  maxArchiveTotalUncompressedBytes: z.number().int().positive(),
  maxArchiveCompressionRatio: z.number().positive(),
  /** This slice rejects nested archives; recursive inspection is not implemented. */
  maxArchiveDepth: z.literal(0),
  maxActiveContentInspectionBytes: z.number().int().positive(),
  rejectDeclaredTypeMismatch: z.boolean(),
  rejectExtensionTypeMismatch: z.boolean(),
  rejectEncryptedDocuments: z.boolean(),
  rejectMacros: z.boolean(),
  rejectActiveScripts: z.boolean(),
  rejectEmbeddedObjects: z.boolean(),
  rejectExternalRelationships: z.boolean(),
  rejectExternalFormulas: z.boolean(),
  rejectFormulaInjection: z.boolean(),
  allowedMediaTypes: z.array(z.string().trim().min(1)).min(1),
}).strict();
export type DocumentQuarantinePolicy = z.infer<typeof documentQuarantinePolicySchema>;

export const defaultDocumentQuarantinePolicy: Readonly<DocumentQuarantinePolicy> = deepFreeze(documentQuarantinePolicySchema.parse({
  policyVersion: "offroad.document-quarantine.2026-09-07.v1",
  maxFileBytes: 50 * 1024 * 1024,
  maxArchiveEntries: 5_000,
  maxArchiveMemberBytes: 200 * 1024 * 1024,
  maxArchiveTotalUncompressedBytes: 512 * 1024 * 1024,
  maxArchiveCompressionRatio: 250,
  maxArchiveDepth: 0,
  maxActiveContentInspectionBytes: 8 * 1024 * 1024,
  rejectDeclaredTypeMismatch: true,
  rejectExtensionTypeMismatch: true,
  rejectEncryptedDocuments: true,
  rejectMacros: true,
  rejectActiveScripts: true,
  rejectEmbeddedObjects: true,
  rejectExternalRelationships: true,
  rejectExternalFormulas: true,
  rejectFormulaInjection: true,
  allowedMediaTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "image/png",
    "image/jpeg",
    "image/tiff",
    "application/zip",
  ],
}));

/** Machine-readable honesty boundary for the pure contract in this package. */
export const governedDocumentQuarantineRuntimeBoundary = deepFreeze({
  maturity: "code_complete_candidate",
  exposure: "internal_shadow",
  parserAuthorization: "clean_receipt_required",
  blockers: [
    "append_only_receipt_persistence",
    "atomic_compare_and_swap",
    "immutable_storage_version_binding",
    "scanner_version_and_signature_attestation",
    "runtime_task_isolation",
    "runtime_egress_enforcement",
    "staging_adversarial_validation",
  ],
} as const);

export const quarantineDocumentBindingSchema = z.object({
  organizationId: uuidSchema,
  sourceDocumentId: uuidSchema,
  documentVersion: z.number().int().positive(),
  expectedSha256: sha256Schema,
  expectedByteSize: z.number().int().nonnegative(),
  originalName: z.string().trim().min(1).max(1_024),
  declaredMediaType: z.string().trim().min(1).max(255).nullable(),
  operationId: uuidSchema,
}).strict();
export type QuarantineDocumentBinding = z.infer<typeof quarantineDocumentBindingSchema>;

export type GovernedMalwareScanner = Readonly<{
  scannerId: string;
  engineVersion: string | null;
  signatureSetVersion: string | null;
  scan(bytes: Uint8Array): Promise<Readonly<{verdict: "clean" | "infected"; signature?: string}>>;
}>;

const detectedContentSchema = z.object({
  mediaType: z.string().min(1),
  extension: z.string(),
  container: z.enum(["none", "pdf", "zip", "ooxml", "cfb", "text", "image", "other"]),
  archiveEntries: z.number().int().nonnegative(),
  archiveCompressedBytes: z.number().int().nonnegative(),
  archiveUncompressedBytes: z.number().int().nonnegative(),
  archiveMaxDepth: z.number().int().nonnegative(),
  activeContent: z.array(z.enum(["macro", "script", "embedded_object", "external_relationship", "external_formula", "formula_injection"])),
}).strict();

export const documentQuarantineReceiptSchema = z.object({
  schemaVersion: z.literal(governedDocumentQuarantineVersion),
  receiptId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  receiptFingerprint: sha256Schema,
  organizationId: uuidSchema,
  sourceDocumentId: uuidSchema,
  documentVersion: z.number().int().positive(),
  operationId: uuidSchema,
  expectedSha256: sha256Schema,
  observedSha256: sha256Schema,
  expectedByteSize: z.number().int().nonnegative(),
  observedByteSize: z.number().int().nonnegative(),
  originalName: z.string().min(1),
  declaredMediaType: z.string().nullable(),
  detected: detectedContentSchema.nullable(),
  scanner: z.object({
    scannerId: z.string().min(1),
    engineVersion: z.string().nullable(),
    signatureSetVersion: z.string().nullable(),
    verdict: z.enum(["clean", "infected", "unavailable"]),
    malwareSignature: z.string().min(1).nullable(),
  }).strict(),
  policyVersion: z.string().min(1),
  policyFingerprint: sha256Schema,
  verdict: z.enum(["clean", "rejected"]),
  reasons: z.array(quarantineReasonSchema),
  retryable: z.boolean(),
  transitions: z.tuple([
    z.object({state: z.literal("quarantined"), at: isoSchema}).strict(),
    z.object({state: z.literal("scanning"), at: isoSchema}).strict(),
    z.object({state: z.enum(["clean", "rejected"]), at: isoSchema}).strict(),
  ]),
}).strict();
export type DocumentQuarantineReceipt = z.infer<typeof documentQuarantineReceiptSchema>;

export type AuthorizedParserInput = Readonly<{
  bytes: Uint8Array;
  organizationId: string;
  sourceDocumentId: string;
  documentVersion: number;
  operationId: string;
  originalName: string;
  declaredMediaType: string | null;
  detectedMediaType: string;
  detectedExtension: string;
  observedSha256: string;
  observedByteSize: number;
}>;

export class GovernedDocumentQuarantineError extends Error {
  constructor(readonly code: "receipt_invalid" | "receipt_not_clean" | "binding_mismatch" | "bytes_changed") {
    super(code);
    this.name = "GovernedDocumentQuarantineError";
  }
}

export async function quarantineDocument(input: {
  bytes: Uint8Array;
  binding: QuarantineDocumentBinding;
  scanner: GovernedMalwareScanner | null;
  policy?: DocumentQuarantinePolicy;
  now?: () => string;
}): Promise<DocumentQuarantineReceipt> {
  const binding = quarantineDocumentBindingSchema.parse(structuredClone(input.binding));
  const policy = documentQuarantinePolicySchema.parse(structuredClone(input.policy ?? defaultDocumentQuarantinePolicy));
  const now = input.now ?? (() => new Date().toISOString());
  const quarantinedAt = checkedTimestamp(now());
  const scanningAt = checkedTimestamp(now());
  const immutableBytes = Uint8Array.from(input.bytes);
  const observedSha256 = sha256(immutableBytes);
  const reasons = new Set<QuarantineReason>();

  if (immutableBytes.byteLength === 0) reasons.add("empty_file");
  if (immutableBytes.byteLength > policy.maxFileBytes) reasons.add("file_size_exceeded");
  if (immutableBytes.byteLength !== binding.expectedByteSize) reasons.add("size_mismatch");
  if (observedSha256 !== binding.expectedSha256) reasons.add("hash_mismatch");

  let scannerResult: DocumentQuarantineReceipt["scanner"] = {
    scannerId: input.scanner?.scannerId ?? "none",
    engineVersion: input.scanner?.engineVersion ?? null,
    signatureSetVersion: input.scanner?.signatureSetVersion ?? null,
    verdict: "unavailable",
    malwareSignature: null,
  };

  if (reasons.size === 0 && input.scanner) {
    try {
      const result = await input.scanner.scan(immutableBytes);
      scannerResult = {
        scannerId: input.scanner.scannerId,
        engineVersion: input.scanner.engineVersion,
        signatureSetVersion: input.scanner.signatureSetVersion,
        verdict: result.verdict,
        malwareSignature: result.signature ?? null,
      };
      if (result.verdict === "infected") reasons.add("malware_detected");
    } catch {
      reasons.add("scanner_unavailable");
    }
  } else if (reasons.size === 0) {
    reasons.add("scanner_unavailable");
  }

  // Container detection can invoke complex archive code. It is deliberately sequenced after a
  // clean malware verdict; before that point the gate does only byte count and SHA-256.
  let detected: z.infer<typeof detectedContentSchema> | null = null;
  if (reasons.size === 0 && scannerResult.verdict === "clean") {
    try {
      const inspection = await inspectDocumentBytes(immutableBytes, binding, policy);
      detected = inspection.detected;
      for (const reason of inspection.reasons) reasons.add(reason);
    } catch {
      // A detector/parser crash is itself a malformed input verdict. The gate must still emit a
      // durable rejection receipt; throwing here would leave the document stuck in `scanning`.
      reasons.add("malformed_container");
    }
  }

  const completedAt = checkedTimestamp(now());
  if (Date.parse(scanningAt) < Date.parse(quarantinedAt) || Date.parse(completedAt) < Date.parse(scanningAt)) {
    throw new GovernedDocumentQuarantineError("receipt_invalid");
  }

  const orderedReasons = [...reasons].sort();
  const verdict = orderedReasons.length === 0 && scannerResult.verdict === "clean" ? "clean" : "rejected";
  const policyFingerprint = fingerprint(policy);
  const receiptId = `sha256:${fingerprint({
    operationId: binding.operationId,
    organizationId: binding.organizationId,
    sourceDocumentId: binding.sourceDocumentId,
    documentVersion: binding.documentVersion,
    observedSha256,
    policyVersion: policy.policyVersion,
    policyFingerprint,
  })}`;
  const body = {
    schemaVersion: governedDocumentQuarantineVersion,
    receiptId,
    organizationId: binding.organizationId,
    sourceDocumentId: binding.sourceDocumentId,
    documentVersion: binding.documentVersion,
    operationId: binding.operationId,
    expectedSha256: binding.expectedSha256,
    observedSha256,
    expectedByteSize: binding.expectedByteSize,
    observedByteSize: immutableBytes.byteLength,
    originalName: binding.originalName,
    declaredMediaType: binding.declaredMediaType,
    detected,
    scanner: scannerResult,
    policyVersion: policy.policyVersion,
    policyFingerprint,
    verdict,
    reasons: orderedReasons,
    retryable: orderedReasons.length === 1 && orderedReasons[0] === "scanner_unavailable",
    transitions: [
      {state: "quarantined", at: quarantinedAt},
      {state: "scanning", at: scanningAt},
      {state: verdict, at: completedAt},
    ],
  } as const;
  const receipt = documentQuarantineReceiptSchema.parse({...body, receiptFingerprint: fingerprint(body)});
  return deepFreeze(receipt);
}

export function authorizeParserInput(input: {
  receipt: DocumentQuarantineReceipt;
  binding: QuarantineDocumentBinding;
  bytes: Uint8Array;
  policy?: DocumentQuarantinePolicy;
}): AuthorizedParserInput {
  const receipt = documentQuarantineReceiptSchema.parse(structuredClone(input.receipt));
  const {receiptFingerprint: _fingerprint, ...body} = receipt;
  if (fingerprint(body) !== receipt.receiptFingerprint) throw new GovernedDocumentQuarantineError("receipt_invalid");
  if (receipt.verdict !== "clean" || receipt.scanner.verdict !== "clean" || receipt.reasons.length > 0) {
    throw new GovernedDocumentQuarantineError("receipt_not_clean");
  }
  const binding = quarantineDocumentBindingSchema.parse(input.binding);
  if (
    receipt.organizationId !== binding.organizationId
    || receipt.sourceDocumentId !== binding.sourceDocumentId
    || receipt.documentVersion !== binding.documentVersion
    || receipt.operationId !== binding.operationId
    || receipt.expectedSha256 !== binding.expectedSha256
    || receipt.expectedByteSize !== binding.expectedByteSize
    || receipt.originalName !== binding.originalName
    || receipt.declaredMediaType !== binding.declaredMediaType
  ) throw new GovernedDocumentQuarantineError("binding_mismatch");

  const policy = documentQuarantinePolicySchema.parse(input.policy ?? defaultDocumentQuarantinePolicy);
  if (receipt.policyVersion !== policy.policyVersion || receipt.policyFingerprint !== fingerprint(policy)) {
    throw new GovernedDocumentQuarantineError("binding_mismatch");
  }

  const current = Uint8Array.from(input.bytes);
  if (current.byteLength !== receipt.observedByteSize || sha256(current) !== receipt.observedSha256) {
    throw new GovernedDocumentQuarantineError("bytes_changed");
  }
  if (!receipt.detected) throw new GovernedDocumentQuarantineError("receipt_invalid");
  return Object.freeze({
    bytes: current,
    organizationId: receipt.organizationId,
    sourceDocumentId: receipt.sourceDocumentId,
    documentVersion: receipt.documentVersion,
    operationId: receipt.operationId,
    originalName: receipt.originalName,
    declaredMediaType: receipt.declaredMediaType,
    detectedMediaType: receipt.detected.mediaType,
    detectedExtension: receipt.detected.extension,
    observedSha256: receipt.observedSha256,
    observedByteSize: receipt.observedByteSize,
  });
}

async function inspectDocumentBytes(
  bytes: Uint8Array,
  binding: QuarantineDocumentBinding,
  policy: DocumentQuarantinePolicy,
): Promise<{detected: z.infer<typeof detectedContentSchema>; reasons: QuarantineReason[]}> {
  const sniffed = await fileTypeFromBuffer(bytes);
  const fileExtension = extensionOf(binding.originalName);
  let mediaType = sniffed?.mime ?? "application/octet-stream";
  let extension = sniffed?.ext ?? fileExtension;
  let container: z.infer<typeof detectedContentSchema>["container"] = "other";
  let archiveEntries = 0;
  let archiveCompressedBytes = 0;
  let archiveUncompressedBytes = 0;
  let archiveMaxDepth = 0;
  const activeContent = new Set<z.infer<typeof detectedContentSchema>["activeContent"][number]>();
  const reasons = new Set<QuarantineReason>();

  if (!sniffed && looksTextual(bytes)) {
    mediaType = fileExtension === "txt" ? "text/plain" : "text/csv";
    extension = fileExtension;
    container = "text";
    if (policy.rejectFormulaInjection && hasFormulaInjection(new TextDecoder("utf-8", {fatal: false}).decode(bytes))) {
      activeContent.add("formula_injection");
      reasons.add("formula_injection");
    }
  } else if (mediaType === "application/pdf") {
    container = "pdf";
    const ascii = latin1(bytes);
    if (!ascii.startsWith("%PDF-") || !/%%EOF\s*$/.test(ascii.slice(-8_192))) reasons.add("malformed_container");
    if (policy.rejectEncryptedDocuments && /\/Encrypt\b/.test(ascii)) reasons.add("encrypted_document");
    if (/\/(?:JavaScript|JS|Launch|OpenAction|AA)\b/.test(ascii)) {
      activeContent.add("script");
      if (policy.rejectActiveScripts) reasons.add("active_script");
    }
    if (/\/(?:EmbeddedFile|Filespec)\b/.test(ascii)) {
      activeContent.add("embedded_object");
      if (policy.rejectEmbeddedObjects) reasons.add("embedded_object");
    }
    if (indexOfBytes(bytes, [0x50, 0x4b, 0x03, 0x04], 5) >= 0) reasons.add("polyglot_content");
  } else if (mediaType === "application/zip") {
    container = "zip";
    try {
      const zip = await JSZip.loadAsync(bytes);
      const entries = Object.values(zip.files);
      archiveEntries = entries.length;
      if (entries.length > policy.maxArchiveEntries) reasons.add("archive_entries_exceeded");
      for (const entry of entries) {
        if (entry.unsafeOriginalName && !archivePathSafe(entry.unsafeOriginalName)) reasons.add("archive_path_unsafe");
        const sizes = (entry as unknown as {_data?: {compressedSize?: number; uncompressedSize?: number}})._data;
        const compressed = sizes?.compressedSize ?? 0;
        const uncompressed = sizes?.uncompressedSize ?? 0;
        archiveCompressedBytes += compressed;
        archiveUncompressedBytes += uncompressed;
        if (uncompressed > policy.maxArchiveMemberBytes) reasons.add("archive_member_exceeded");
        const depth = archiveDepth(entry.name);
        archiveMaxDepth = Math.max(archiveMaxDepth, depth);
        if (depth > policy.maxArchiveDepth) reasons.add("nested_archive");
      }
      if (archiveUncompressedBytes > policy.maxArchiveTotalUncompressedBytes) reasons.add("archive_total_uncompressed_exceeded");
      if (archiveCompressedBytes > 0 && archiveUncompressedBytes / archiveCompressedBytes > policy.maxArchiveCompressionRatio) reasons.add("archive_ratio_exceeded");

      const names = entries.map((entry) => entry.name.replaceAll("\\", "/").toLowerCase());
      const ooxmlKind = names.includes("word/document.xml") ? "docx"
        : names.includes("xl/workbook.xml") ? "xlsx"
          : names.includes("ppt/presentation.xml") ? "pptx"
            : null;
      if (ooxmlKind) {
        container = "ooxml";
        mediaType = ooxmlKind === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : ooxmlKind === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        extension = ooxmlKind;
      } else if (!entries.filter((entry) => !entry.dir).every((entry) => entry.name.toLowerCase().endsWith(".xml"))) {
        reasons.add("unsupported_type");
      }

      if (names.some((name) => /(?:^|\/)(?:vbaproject\.bin|macros?\/|_vba_project)/.test(name))) {
        activeContent.add("macro");
        if (policy.rejectMacros) reasons.add("active_macro");
      }
      if (names.some((name) => /\/(?:embeddings|activex)\//.test(name) || /oleobject/.test(name))) {
        activeContent.add("embedded_object");
        if (policy.rejectEmbeddedObjects) reasons.add("embedded_object");
      }

      const declaredLimitFailure = [...reasons].some((reason) => reason.startsWith("archive_") || reason === "nested_archive");
      if (!declaredLimitFailure) {
        let actualTotal = 0;
        for (const entry of entries) {
          if (entry.dir) continue;
          const lower = entry.name.toLowerCase();
          const capture = lower.endsWith(".rels") || /^xl\/worksheets\/.*\.xml$/.test(lower);
          try {
            const result = await readZipEntryBounded(
              entry,
              policy.maxArchiveMemberBytes,
              policy.maxArchiveTotalUncompressedBytes - actualTotal,
              capture ? policy.maxActiveContentInspectionBytes : 0,
            );
            actualTotal += result.bytes;
            if (archiveMagic(result.prefix)) {
              archiveMaxDepth = Math.max(archiveMaxDepth, 1);
              reasons.add("nested_archive");
              break;
            }
            if (!result.source) continue;
            if (lower.endsWith(".rels") && /TargetMode\s*=\s*["']External["']/i.test(result.source)) {
              activeContent.add("external_relationship");
              if (policy.rejectExternalRelationships) reasons.add("external_relationship");
            }
            if (/^xl\/worksheets\/.*\.xml$/.test(lower) && hasExternalFormula(result.source)) {
              activeContent.add("external_formula");
              if (policy.rejectExternalFormulas) reasons.add("external_formula");
            }
          } catch (error) {
            if (error instanceof ArchiveBoundError) {
              reasons.add(error.reason);
              break;
            }
            else throw error;
          }
        }
      }
    } catch {
      reasons.add("malformed_container");
    }
  } else if (mediaType === "application/x-cfb") {
    container = "cfb";
    const markerText = latin1(bytes) + new TextDecoder("utf-16le", {fatal: false}).decode(bytes);
    if (/(?:_VBA_PROJECT|VBA|Macros)/i.test(markerText)) {
      activeContent.add("macro");
      if (policy.rejectMacros) reasons.add("active_macro");
    }
  } else if (mediaType.startsWith("image/")) container = "image";

  if (!policy.allowedMediaTypes.includes(mediaType)) reasons.add("unsupported_type");
  const declared = canonicalMediaType(binding.declaredMediaType);
  if (policy.rejectDeclaredTypeMismatch && declared && !mediaTypesCompatible(declared, mediaType)) reasons.add("declared_type_mismatch");
  if (policy.rejectExtensionTypeMismatch && fileExtension && !extensionCompatible(fileExtension, extension, mediaType)) reasons.add("extension_type_mismatch");

  return {
    detected: detectedContentSchema.parse({
      mediaType,
      extension,
      container,
      archiveEntries,
      archiveCompressedBytes,
      archiveUncompressedBytes,
      archiveMaxDepth,
      activeContent: [...activeContent].sort(),
    }),
    reasons: [...reasons].sort(),
  };
}

function canonicalMediaType(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase().split(";", 1)[0]?.trim() ?? "";
  if (normalized === "application/csv" || normalized === "text/comma-separated-values") return "text/csv";
  if (normalized === "application/x-pdf") return "application/pdf";
  if (normalized === "image/jpg") return "image/jpeg";
  return normalized;
}

function mediaTypesCompatible(left: string, right: string): boolean {
  if (left === right) return true;
  const zipAliases = new Set(["application/zip", "application/x-zip-compressed"]);
  return zipAliases.has(left) && zipAliases.has(right);
}

const extensionMediaTypes: Readonly<Record<string, readonly string[]>> = {
  pdf: ["application/pdf"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  xls: ["application/vnd.ms-excel", "application/x-cfb"],
  xlsb: ["application/vnd.ms-excel.sheet.binary.macroenabled.12", "application/x-cfb"],
  doc: ["application/msword", "application/x-cfb"],
  ppt: ["application/vnd.ms-powerpoint", "application/x-cfb"],
  csv: ["text/csv"], tsv: ["text/csv"], txt: ["text/plain"], prn: ["text/csv"],
  png: ["image/png"], jpg: ["image/jpeg"], jpeg: ["image/jpeg"], tif: ["image/tiff"], tiff: ["image/tiff"],
  zip: ["application/zip"],
};

function extensionCompatible(fileExtension: string, detectedExtension: string, mediaType: string): boolean {
  const expected = extensionMediaTypes[fileExtension];
  if (expected) return expected.includes(mediaType);
  return fileExtension === detectedExtension;
}

function extensionOf(name: string): string {
  const part = name.split(".").pop();
  return part && part !== name ? part.toLowerCase() : "";
}

function looksTextual(bytes: Uint8Array): boolean {
  if (bytes.byteLength === 0) return false;
  const sample = bytes.subarray(0, Math.min(bytes.byteLength, 32_768));
  let controls = 0;
  for (const byte of sample) if (byte === 0 || (byte < 0x09) || (byte > 0x0d && byte < 0x20)) controls += 1;
  return controls / sample.byteLength < 0.01;
}

function hasFormulaInjection(source: string): boolean {
  return source.split(/\r?\n/).some((line) => line.split(/[;,\t]/).some((cell) => /^[\s"']*[=+@]/.test(cell) || /^[\s"']*-[A-Za-z(]/.test(cell)));
}

function hasExternalFormula(source: string): boolean {
  const formulae = [...source.matchAll(/<(?:\w+:)?f(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?f>/gi)].map((match) => match[1] ?? "");
  return formulae.some((formula) => /(?:\[[^\]]+\]|https?:\/\/|file:\/\/|WEBSERVICE\s*\(|HYPERLINK\s*\(|DDE\s*\()/i.test(formula));
}

function archiveDepth(name: string): number {
  return /\.(?:zip|jar|7z|rar|gz|bz2|xz)$/i.test(name) ? 1 : 0;
}

function archivePathSafe(name: string): boolean {
  return !name.startsWith("/")
    && !name.includes("\\")
    && !name.split("/").some((part) => part === "" || part === "." || part === "..");
}

class ArchiveBoundError extends Error {
  constructor(readonly reason: "archive_member_exceeded" | "archive_total_uncompressed_exceeded" | "active_content_inspection_exceeded") {
    super(reason);
    this.name = "ArchiveBoundError";
  }
}

async function readZipEntryBounded(
  entry: JSZip.JSZipObject,
  maxMemberBytes: number,
  maxRemainingTotalBytes: number,
  captureLimit: number,
): Promise<{bytes: number; source: string | null; prefix: Uint8Array}> {
  const stream = entry.nodeStream("nodebuffer");
  const captured: Buffer[] = [];
  const prefix: number[] = [];
  let bytes = 0;
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer | Uint8Array | string) => {
      const body = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
      bytes += body.byteLength;
      for (const byte of body.subarray(0, Math.max(0, 8 - prefix.length))) prefix.push(byte);
      if (bytes > maxMemberBytes) {
        (stream as NodeJS.ReadableStream & {destroy?: () => void}).destroy?.();
        reject(new ArchiveBoundError("archive_member_exceeded"));
        return;
      }
      if (bytes > maxRemainingTotalBytes) {
        (stream as NodeJS.ReadableStream & {destroy?: () => void}).destroy?.();
        reject(new ArchiveBoundError("archive_total_uncompressed_exceeded"));
        return;
      }
      if (captureLimit > 0) {
        if (bytes > captureLimit) {
          (stream as NodeJS.ReadableStream & {destroy?: () => void}).destroy?.();
          reject(new ArchiveBoundError("active_content_inspection_exceeded"));
          return;
        }
        captured.push(body);
      }
    });
    stream.on("error", reject);
    stream.on("end", () => resolve({
      bytes,
      source: captureLimit > 0 ? Buffer.concat(captured).toString("utf8") : null,
      prefix: Uint8Array.from(prefix),
    }));
  });
}

function archiveMagic(prefix: Uint8Array): boolean {
  return (
    startsWith(prefix, [0x50, 0x4b, 0x03, 0x04])
    || startsWith(prefix, [0x1f, 0x8b])
    || startsWith(prefix, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])
    || startsWith(prefix, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])
  );
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function latin1(bytes: Uint8Array): string {
  return new TextDecoder("latin1", {fatal: false}).decode(bytes);
}

function indexOfBytes(bytes: Uint8Array, needle: readonly number[], start = 0): number {
  outer: for (let i = start; i <= bytes.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (bytes[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

function checkedTimestamp(value: string): string {
  return isoSchema.parse(value);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fingerprint(value: unknown): string {
  return sha256(new TextEncoder().encode(stableJson(value)));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
