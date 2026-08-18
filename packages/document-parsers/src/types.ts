import type {DocumentLayer, LayerKind} from "@offroad/document-intelligence";

/**
 * Everything a parser can report without inventing content. Warnings are facts about the
 * file, not opinions about its meaning: they end up on the run timeline and, when they
 * change what a human must do (a scanned page, a legacy format), become an intake issue.
 */
export type ParserWarningCode =
  | "scanned_page"
  | "no_text"
  | "encrypted"
  | "unsupported_legacy_format"
  | "unsupported_format"
  | "hidden_sheet"
  | "formula_without_value"
  | "limit_reached"
  | "parse_error";

export type ParserWarning = {
  code: ParserWarningCode;
  message: string;
  /** Layer id or file part the warning is about (`p12`, `sBalanço`, `word/document.xml`). */
  where?: string;
};

export type ParseInput = {
  bytes: Uint8Array;
  /** `source_documents.id` — becomes `layer.documentId`. */
  documentId: string;
  /** `source_documents.document_version` — anchors are only stable within a version. */
  documentVersion: number;
  fileName: string;
  /** Declared by the uploader; never trusted on its own (magic bytes decide). */
  mimeType?: string;
  /** Affects only number *reading* in CSV; the layer keeps the literal text either way. */
  localeHint?: "pt-BR" | "en-US";
};

export type ParseResult = {
  layer: DocumentLayer;
  /** Recorded on `document_layers.parser_versions` so a re-parse is comparable. */
  parserVersions: Record<string, string>;
  warnings: ParserWarning[];
  detected: {
    kind: LayerKind;
    /** Content type decided by magic bytes, not by the uploader's claim. */
    mime: string;
    extension: string;
    /** True when the declared mime type disagreed with the bytes. */
    mismatch: boolean;
  };
};

/**
 * Hard limits. A parser runs on files that arrive from outside, so every loop that a
 * document can grow is bounded and the truncation is reported (`limit_reached`) instead of
 * being silent — an unreported truncation would make the extractor believe it saw the whole
 * document (AGENTS.md §2.2, §10).
 */
export const parserLimits = {
  maxBytes: 100 * 1024 * 1024,
  maxPages: 1_500,
  maxSheets: 200,
  maxCellsPerSheet: 300_000,
  maxRowsPerTable: 20_000,
  maxBlocksPerPage: 4_000,
  maxCharactersPerBlock: 20_000,
  maxTotalCharacters: 20_000_000,
  maxZipEntries: 5_000,
  /** Decompressed/compressed ratio that marks a zip bomb. */
  maxZipRatio: 250,
  maxZipEntryBytes: 200 * 1024 * 1024,
} as const;

export class ParserError extends Error {
  readonly code: ParserWarningCode;
  constructor(message: string, code: ParserWarningCode = "parse_error") {
    super(message);
    this.name = "ParserError";
    this.code = code;
  }
}

/** Keeps a running character budget across a whole document. */
export function createBudget(max: number = parserLimits.maxTotalCharacters) {
  let used = 0;
  return {
    take(text: string): string {
      if (used >= max) return "";
      const remaining = max - used;
      if (text.length <= remaining) {
        used += text.length;
        return text;
      }
      used = max;
      return text.slice(0, remaining);
    },
    get exhausted() {
      return used >= max;
    },
    get used() {
      return used;
    },
  };
}
