/**
 * @offroad/document-parsers — deterministic file → document layer (P1 plan §5.3, stage E2).
 *
 * No model is involved here and no meaning is assigned: the parsers turn bytes into the
 * addressable representation the rest of the pipeline verifies against. Every value that
 * later becomes a financial fact must be quotable from a layer anchor produced here, so two
 * properties matter more than coverage:
 *
 *   * **stable ids** — `p12.t1.r4.c3`, `sDRE!B14`, `sec3.p7`, `sl4.b1` — an anchor is only
 *     as good as its ability to send a human to the same place in the file;
 *   * **no invention** — a page without text is reported as scanned, a formula without a
 *     cached value is reported, a truncation is reported. Silence would let the extractor
 *     believe it saw the whole document.
 *
 * The heavy, Node-only dependencies live in this package (and never in
 * `@offroad/document-intelligence`) so the web app keeps importing the contracts alone.
 */
import {fileTypeFromBuffer} from "file-type";
import {ParserError, parserLimits, type ParseInput, type ParseResult} from "./types";
import {parsePdf} from "./pdf";
import {parseXlsx} from "./xlsx";
import {parseCsv} from "./csv";
import {parseDocx} from "./docx";
import {parsePptx} from "./pptx";

export const documentParsersVersion = "2026.08.18-parsers-v1";

export * from "./types";
export * from "./scale";
export {parsePdf, pdfParserVersion} from "./pdf";
export {parseXlsx, xlsxParserVersion, excelSerialToIso} from "./xlsx";
export {parseCsv, csvParserVersion, columnLetters} from "./csv";
export {parseDocx, docxParserVersion} from "./docx";
export {parsePptx, pptxParserVersion} from "./pptx";

const ooxml = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;

/**
 * Legacy binary Office formats. The product accepts them at upload, and the honest answer
 * today is that we do not parse them: the only npm parser for `.xls` is SheetJS 0.18.5,
 * which carries unfixed advisories on npm (the patched builds are published outside it), and
 * nothing maintained reads `.doc`/`.ppt`. Feeding a hostile file to an unmaintained parser
 * inside the worker is a worse outcome than telling the sender to re-save as `.xlsx`, so the
 * document is refused with a message a person can act on.
 */
const legacyBinary: Record<string, string> = {
  "application/vnd.ms-excel": "xls",
  "application/msword": "doc",
  "application/vnd.ms-powerpoint": "ppt",
  "application/x-cfb": "office-97",
};

const textLike = new Set(["csv", "tsv", "txt"]);

export type DetectedType = {mime: string; extension: string; mismatch: boolean};

/**
 * Decides what a file *is* from its bytes. The uploader's declared type is only compared,
 * never trusted: a spreadsheet renamed to `.pdf` must not reach the PDF parser.
 */
export async function detectType(input: ParseInput): Promise<DetectedType> {
  const sniffed = await fileTypeFromBuffer(input.bytes);
  const extension = (input.fileName.split(".").pop() ?? "").toLowerCase();

  if (sniffed) {
    const declared = input.mimeType?.toLowerCase();
    return {
      mime: sniffed.mime,
      extension: sniffed.ext,
      mismatch: Boolean(declared && declared !== sniffed.mime && !isBenignMismatch(declared, sniffed.mime)),
    };
  }

  // file-type only knows binary signatures; text formats are decided by extension plus the
  // fact that the bytes decode as text.
  if (textLike.has(extension) && looksTextual(input.bytes)) {
    const mime = extension === "txt" ? "text/plain" : "text/csv";
    const declared = input.mimeType?.toLowerCase();
    return {mime, extension, mismatch: Boolean(declared && declared !== mime && !isBenignMismatch(declared, mime))};
  }

  return {mime: "application/octet-stream", extension, mismatch: false};
}

/**
 * Parses any supported document. Throws `ParserError` with a code the caller turns into an
 * intake issue; it never returns a half-empty layer pretending the file was read.
 */
export async function parseDocument(input: ParseInput): Promise<ParseResult> {
  if (input.bytes.byteLength === 0) throw new ParserError("the file is empty", "no_text");
  if (input.bytes.byteLength > parserLimits.maxBytes) {
    throw new ParserError(`the file is larger than ${parserLimits.maxBytes} bytes`, "limit_reached");
  }

  const detected = await detectType(input);

  if (legacyBinary[detected.mime]) {
    throw new ParserError(
      `legacy ${legacyBinary[detected.mime]} format is not processed; re-save the file as .xlsx, .docx or .pptx`,
      "unsupported_legacy_format",
    );
  }

  const result = await dispatch(input, detected);
  // Keep what the bytes said, including a mismatch with the declared type: the gate turns
  // that into a quality flag on the document profile.
  return {...result, detected: {...result.detected, mime: detected.mime, extension: detected.extension, mismatch: detected.mismatch}};
}

async function dispatch(input: ParseInput, detected: DetectedType): Promise<ParseResult> {
  switch (detected.mime) {
    case "application/pdf":
      return parsePdf(input);
    case ooxml.xlsx:
      return parseXlsx(input);
    case ooxml.docx:
      return parseDocx(input);
    case ooxml.pptx:
      return parsePptx(input);
    case "text/csv":
    case "text/plain":
      return parseCsv(input);
    default:
      break;
  }

  if (detected.mime.startsWith("image/")) return imageLayer(input, detected);

  throw new ParserError(
    `unsupported file type "${detected.mime}"; send PDF, XLSX, CSV, DOCX or PPTX`,
    "unsupported_format",
  );
}

/**
 * An image is a document with exactly one page and no text layer. Representing it as a
 * scanned page keeps the pipeline honest: the document exists, carries a page-level anchor,
 * and is blocked from auto-acceptance until OCR (F6).
 */
function imageLayer(input: ParseInput, detected: DetectedType): ParseResult {
  return {
    layer: {
      documentId: input.documentId,
      documentVersion: input.documentVersion,
      kind: "image",
      pages: [{n: 1, blocks: [], tables: [], scanned: true}],
      scaleDeclarations: [],
      stats: {pageCount: 1},
    },
    parserVersions: {image: "image-1.0.0"},
    warnings: [
      {code: "no_text", message: "the document is an image and needs OCR before extraction", where: "p1"},
    ],
    detected: {kind: "image", mime: detected.mime, extension: detected.extension, mismatch: detected.mismatch},
  };
}

/** Browsers and operating systems disagree about these; the disagreement means nothing. */
function isBenignMismatch(declared: string, sniffed: string): boolean {
  const equivalents: Record<string, readonly string[]> = {
    "text/csv": ["application/csv", "text/plain", "application/vnd.ms-excel"],
    "text/plain": ["text/csv"],
    "application/zip": [ooxml.xlsx, ooxml.docx, ooxml.pptx],
  };
  if (equivalents[declared]?.includes(sniffed)) return true;
  if (equivalents[sniffed]?.includes(declared)) return true;
  return false;
}

function looksTextual(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 4_096);
  let control = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) control += 1;
  }
  return control / Math.max(1, sample.length) < 0.05;
}
