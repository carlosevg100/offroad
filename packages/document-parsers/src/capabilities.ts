import type {AnchorPrecision} from "@offroad/credit-ontology";

/**
 * Capabilities the host (the document worker) can lend to the parsers.
 *
 * The parsers are a pure library — no process spawning, no network, no filesystem — but two
 * jobs genuinely need the outside world: converting a legacy binary Office file, and reading
 * glyphs out of an image. Both arrive as interfaces so the package stays testable in
 * milliseconds with fakes, while the worker supplies the real implementations (LibreOffice
 * and an OCR engine) inside the isolated container (ADR 0008 decision 1, D-003).
 *
 * When a capability is absent the parser says so with a named error instead of pretending the
 * document was read.
 */

export type ConvertibleInput = {
  bytes: Uint8Array;
  mime: string;
  fileName: string;
};

export type ConvertedDocument = {
  bytes: Uint8Array;
  /** The format the file was converted to — always one the parsers read natively. */
  mime: string;
  fileName: string;
};

/**
 * Converts what we cannot read directly into an equivalent modern format: `.doc` → `.docx`,
 * `.ppt` → `.pptx`, `.rtf`/`.odt` → `.docx`, and so on.
 *
 * The conversion is a rendering decision made by another program, so it is recorded on the
 * layer (`convertedFrom`) — a value extracted from a converted document carries one more
 * step between the anchor and the original file, and a reviewer should be able to see that.
 */
export type DocumentConverter = {
  name: string;
  version: string;
  supports(mime: string): boolean;
  convert(input: ConvertibleInput): Promise<ConvertedDocument>;
};

export type OcrBlock = {
  text: string;
  /** Mean confidence 0–1 for the block, as reported by the engine. */
  confidence: number;
  bbox?: [number, number, number, number];
};

export type OcrResult = {
  blocks: OcrBlock[];
  /** Mean confidence 0–1 over the page. */
  confidence: number;
};

/**
 * Reads text from an image, or from a page of a PDF that has no text layer.
 *
 * OCR output is *evidence of lower quality by construction*: a misread digit is a wrong
 * number that looks perfectly well formed. So everything it produces stays flagged as coming
 * from a scan (`scanned: true` on the page, `ocr` in the layer's `textSources`), which keeps
 * it out of automatic acceptance — the auto-accept policy requires a verified anchor of
 * cell/row/block precision from a native text layer (P1 plan §7, D-014).
 */
export type OcrEngine = {
  name: string;
  version: string;
  languages: readonly string[];
  recognizeImage(input: {bytes: Uint8Array; mime: string}): Promise<OcrResult>;
  /** Rasterises and reads one page of a PDF. Absent engines simply leave the page scanned. */
  recognizePdfPage?(input: {bytes: Uint8Array; pageNumber: number}): Promise<OcrResult>;
};

export type ParseCapabilities = {
  converter?: DocumentConverter;
  ocr?: OcrEngine;
};

/** Anchors produced from OCR never claim more precision than the engine can support. */
export const ocrAnchorPrecision: AnchorPrecision = "block";

/**
 * Confidence below this is not worth an anchor: the text is reported on the page so a human
 * can see something was there, but it is not offered as a quotable block.
 */
export const minimumOcrConfidence = 0.45;
