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
 * Coverage is nonetheless the point of the product: a company sends what it has, which is
 * PDFs, spreadsheets old and new, Word letters, decks and photographs of paper. Everything
 * that can be read in process is read here; the two jobs that need the outside world —
 * converting a legacy binary Office file and reading glyphs out of an image — arrive as
 * capabilities the worker lends to this library (see `./capabilities`), so the package stays
 * pure and testable while the container carries LibreOffice and an OCR engine.
 */
import {fileTypeFromBuffer} from "file-type";
import type {LayerPage} from "@offroad/document-intelligence";
import {ParserError, parserLimits, type ParseInput, type ParseResult, type ParserWarning} from "./types";
import type {OcrEngine, ParseCapabilities} from "./capabilities";
import {parsePdf} from "./pdf";
import {parseXlsx} from "./xlsx";
import {parseLegacySpreadsheet} from "./legacy-spreadsheet";
import {parseCsv} from "./csv";
import {parseDocx} from "./docx";
import {parsePptx} from "./pptx";
import {parseImageWithOcr, pagesFromOcr} from "./ocr";
import {cfbMimeTypes, detectCfbSubtype} from "./cfb";

export const documentParsersVersion = "2026.08.18-parsers-v2";

export * from "./types";
export * from "./scale";
export * from "./capabilities";
export {parsePdf, pdfParserVersion} from "./pdf";
export {parseXlsx, xlsxParserVersion, excelSerialToIso} from "./xlsx";
export {parseLegacySpreadsheet, legacySpreadsheetParserVersion} from "./legacy-spreadsheet";
export {parseCsv, csvParserVersion, columnLetters} from "./csv";
export {parseDocx, docxParserVersion} from "./docx";
export {parsePptx, pptxParserVersion} from "./pptx";
export {parseImageWithOcr, pagesFromOcr, ocrLayerVersion} from "./ocr";
export {detectCfbSubtype, cfbMimeTypes, type CfbSubtype} from "./cfb";

const ooxml = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;

/** Spreadsheet dialects SheetJS reads directly — no conversion step needed. */
const legacySpreadsheetMimes = new Set([
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.binary.macroenabled.12",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/x-dbf",
]);

/**
 * Formats that need another program to become readable. The worker's converter turns them
 * into the modern equivalent (`.doc` → `.docx`, `.ppt` → `.pptx`, `.rtf`/`.odt` → `.docx`),
 * and the result goes back through the normal dispatch.
 */
const convertibleMimes = new Set([
  "application/msword",
  "application/vnd.ms-powerpoint",
  "application/rtf",
  "text/rtf",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.wordperfect",
]);

const textLike = new Set(["csv", "tsv", "txt", "prn"]);

export type DetectedType = {mime: string; extension: string; mismatch: boolean};

/**
 * Decides what a file *is* from its bytes. The uploader's declared type is only compared,
 * never trusted: a spreadsheet renamed to `.pdf` must not reach the PDF parser.
 */
export async function detectType(input: ParseInput): Promise<DetectedType> {
  const sniffed = await fileTypeFromBuffer(input.bytes);
  const extension = (input.fileName.split(".").pop() ?? "").toLowerCase();
  const declared = input.mimeType?.toLowerCase();

  if (sniffed) {
    // Office 97–2003 files share one container, so the magic bytes say "CFB" and nothing
    // more; the main stream inside says whether it is a workbook, a letter or a deck.
    let mime = sniffed.mime;
    let ext = sniffed.ext;
    if (mime === "application/x-cfb") {
      const subtype = detectCfbSubtype(input.bytes);
      if (subtype !== "unknown") {
        mime = cfbMimeTypes[subtype];
        ext = subtype;
      }
    }
    return {
      mime,
      extension: ext,
      mismatch: Boolean(declared && declared !== mime && !isBenignMismatch(declared, mime)),
    };
  }

  // file-type only knows binary signatures; text formats are decided by extension plus the
  // fact that the bytes decode as text.
  if (textLike.has(extension) && looksTextual(input.bytes)) {
    const mime = extension === "txt" ? "text/plain" : "text/csv";
    return {mime, extension, mismatch: Boolean(declared && declared !== mime && !isBenignMismatch(declared, mime))};
  }

  return {mime: "application/octet-stream", extension, mismatch: false};
}

/**
 * Parses any supported document. Throws `ParserError` with a code the caller turns into an
 * intake issue; it never returns a half-empty layer pretending the file was read.
 */
export async function parseDocument(input: ParseInput, capabilities: ParseCapabilities = {}): Promise<ParseResult> {
  if (input.bytes.byteLength === 0) throw new ParserError("the file is empty", "no_text");
  if (input.bytes.byteLength > parserLimits.maxBytes) {
    throw new ParserError(`the file is larger than ${parserLimits.maxBytes} bytes`, "limit_reached");
  }

  const detected = await detectType(input);
  const result = await dispatch(input, detected, capabilities);

  // Keep what the bytes said, including a mismatch with the declared type: the gate turns
  // that into a quality flag on the document profile.
  return {
    ...result,
    detected: {...result.detected, mime: detected.mime, extension: detected.extension, mismatch: detected.mismatch},
  };
}

async function dispatch(
  input: ParseInput,
  detected: DetectedType,
  capabilities: ParseCapabilities,
): Promise<ParseResult> {
  switch (detected.mime) {
    case "application/pdf":
      return parsePdfWithOcrFallback(input, capabilities.ocr);
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

  if (legacySpreadsheetMimes.has(detected.mime)) return parseLegacySpreadsheet(input);
  if (detected.mime.startsWith("image/")) {
    return parseImageWithOcr(
      {
        bytes: input.bytes,
        documentId: input.documentId,
        documentVersion: input.documentVersion,
        mime: detected.mime,
        extension: detected.extension,
        mismatch: detected.mismatch,
      },
      capabilities.ocr,
    );
  }
  if (convertibleMimes.has(detected.mime)) return convertThenParse(input, detected, capabilities);

  throw new ParserError(
    `unsupported file type "${detected.mime}"; send PDF, a spreadsheet, a document, a presentation or an image`,
    "unsupported_format",
  );
}

/**
 * Legacy binary Office and OpenDocument text/presentation files go through the worker's
 * converter and come back as OOXML, which the parsers above read natively.
 */
async function convertThenParse(
  input: ParseInput,
  detected: DetectedType,
  capabilities: ParseCapabilities,
): Promise<ParseResult> {
  const converter = capabilities.converter;
  if (!converter?.supports(detected.mime)) {
    throw new ParserError(
      `"${detected.mime}" needs conversion and no converter is available in this environment`,
      "unsupported_legacy_format",
    );
  }

  let converted;
  try {
    converted = await converter.convert({bytes: input.bytes, mime: detected.mime, fileName: input.fileName});
  } catch (error) {
    throw new ParserError(`the file could not be converted: ${(error as Error).message}`, "unsupported_legacy_format");
  }

  if (converted.bytes.byteLength === 0) {
    throw new ParserError("the converter returned an empty file", "unsupported_legacy_format");
  }

  const convertedInput: ParseInput = {...input, bytes: converted.bytes, fileName: converted.fileName, mimeType: converted.mime};
  const convertedType = await detectType(convertedInput);

  if (convertibleMimes.has(convertedType.mime)) {
    throw new ParserError("the converter produced another format that still needs conversion", "unsupported_legacy_format");
  }

  // One hop only: the converted file may not ask for another conversion.
  const afterConversion: ParseCapabilities = capabilities.ocr ? {ocr: capabilities.ocr} : {};
  const result = await dispatch(convertedInput, convertedType, afterConversion);

  return {
    ...result,
    parserVersions: {...result.parserVersions, [converter.name]: converter.version},
    conversion: {from: detected.mime, to: convertedType.mime, by: converter.name, version: converter.version},
    warnings: [
      ...result.warnings,
      {
        code: "parse_error",
        message: `read after conversion from ${detected.mime} to ${convertedType.mime} by ${converter.name} ${converter.version}`,
      },
    ],
  };
}

/**
 * A PDF whose pages carry no text layer is a scan. With an OCR engine those pages are read;
 * without one they stay empty and flagged. Either way the page keeps `scanned: true`, which
 * is what blocks automatic acceptance downstream.
 */
async function parsePdfWithOcrFallback(input: ParseInput, engine: OcrEngine | undefined): Promise<ParseResult> {
  const result = await parsePdf(input);
  const pages = result.layer.pages ?? [];
  const scanned = pages.filter((page) => page.scanned);

  if (scanned.length === 0 || !engine?.recognizePdfPage) return result;

  const readable = scanned.slice(0, parserLimits.maxOcrPages);
  const warnings: ParserWarning[] = [...result.warnings];
  if (scanned.length > readable.length) {
    warnings.push({
      code: "limit_reached",
      message: `${scanned.length - readable.length} scanned page(s) beyond the OCR limit of ${parserLimits.maxOcrPages} were left unread`,
    });
  }

  const byNumber = new Map<number, LayerPage>();
  for (const page of readable) {
    try {
      const recognized = await engine.recognizePdfPage({bytes: input.bytes, pageNumber: page.n});
      const built = pagesFromOcr([{pageNumber: page.n, result: recognized}]);
      const [ocrPage] = built.pages;
      if (ocrPage) byNumber.set(page.n, ocrPage);
      warnings.push(...built.warnings);
    } catch (error) {
      warnings.push({code: "parse_error", message: `OCR failed: ${(error as Error).message}`, where: `p${page.n}`});
    }
  }

  if (byNumber.size === 0) return {...result, warnings};

  const merged = pages.map((page) => byNumber.get(page.n) ?? page);

  return {
    ...result,
    layer: {...result.layer, pages: merged},
    parserVersions: {...result.parserVersions, [engine.name]: engine.version},
    warnings: [
      ...warnings,
      {
        code: "scanned_page",
        message: `${byNumber.size} page(s) were read by OCR (${engine.name}); every value from them needs review`,
      },
    ],
  };
}

/** Browsers and operating systems disagree about these; the disagreement means nothing. */
function isBenignMismatch(declared: string, sniffed: string): boolean {
  const equivalents: Record<string, readonly string[]> = {
    "text/csv": ["application/csv", "text/plain", "application/vnd.ms-excel"],
    "text/plain": ["text/csv"],
    "application/zip": [ooxml.xlsx, ooxml.docx, ooxml.pptx],
    "application/x-cfb": ["application/vnd.ms-excel", "application/msword", "application/vnd.ms-powerpoint"],
    "application/vnd.ms-excel": ["application/x-cfb"],
    "application/msword": ["application/x-cfb"],
    "application/vnd.ms-powerpoint": ["application/x-cfb"],
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
export {createTesseractEngine, parseTesseractTsv, runTool, toolVersion, withTempDirectory} from "./tesseract";
