# @offroad/document-parsers

Deterministic **file → document layer** (P1 plan §5.3, stage E2). No model, no I/O, no
meaning: this package turns bytes into the addressable representation everything downstream
verifies against.

```ts
import {parseDocument} from "@offroad/document-parsers";

const result = await parseDocument({
  bytes,                 // the file, exactly as uploaded
  documentId,            // source_documents.id
  documentVersion,       // source_documents.document_version
  fileName,
  mimeType,              // declared by the uploader — compared, never trusted
});
// result.layer → document_layers object payload
// result.warnings → facts about the file (scanned page, hidden sheet, truncation)
// result.detected → what the bytes actually are, and whether that contradicts the claim
```

## Anchor ids

An anchor is only worth as much as its ability to send a person to the same place in the
file. The ids are stable for a given `(documentId, documentVersion)` and are what
`indexLayer` resolves and the verifier checks a quote against:

| Format | Container | Block / row | Cell |
|---|---|---|---|
| PDF | `p12` | `p12.b3`, `p12.t1.r4` | `p12.t1.r4.c3` |
| XLSX / CSV | `sDRE` | `sDRE.t1.r4` | `sDRE!B14` |
| DOCX | `sec3` | `sec3.p7`, `sec3.t1.r2` | `sec3.t1.r2.c1` |
| PPTX | `sl4` | `sl4.b1`, `sl4.t1.r2` | `sl4.t1.r2.c1` |

Re-parsing the same bytes produces the same ids and the same text — there is a test for it,
because an anchor that moves between runs silently invalidates every fact that cites it.

## What each parser does, and refuses to do

- **PDF** (`pdfjs-dist`) — positioned text runs are grouped into lines, lines split into
  segments by horizontal gaps, and consecutive multi-segment lines clustered into columns to
  rebuild a table. A PDF has no table structure, only alignment, so anything that does not
  look tabular stays a paragraph block. A page with no text layer is marked `scanned` and
  produces **no blocks**: degraded mode until OCR (F6), never invented content.
- **XLSX** (own reader on `jszip` + `fast-xml-parser`) — every cell keeps its cached value,
  its formula, its number format and its merge origin. Nothing is evaluated. A formula stored
  without a cached result is reported (`formula_without_value`) rather than read as empty, and
  hidden sheets are kept and flagged.
  *Why not a spreadsheet library:* the workbooks in this data room declare the SpreadsheetML
  namespace with an `x:` prefix (`<x:worksheet>`), which is valid and which Excel reads —
  and which exceljs's tag matchers miss, returning an empty workbook. Local-name matching
  makes the parser independent of the tool that wrote the file.
- **CSV/TSV** (`csv-parse`, `iconv-lite`) — delimiter and encoding are decided from the bytes
  (`;` and windows-1252 are both routine in Brazilian ERP exports). Values stay literal text.
- **DOCX / PPTX** (`jszip` + `fast-xml-parser`) — sections split at headings, paragraphs and
  tables in document order; slides keep one block per shape plus speaker notes.
- **Legacy `.xls`, `.xlsb`, `.ods`, `.dbf`, SpreadsheetML** (SheetJS) — read in process, into
  exactly the same shape as a modern workbook, so anchors and downstream behaviour do not
  change with the age of the file. Office 97–2003 files all share the OLE2/CFB container, so
  the subtype is decided by the **main stream inside** (`Workbook`, `WordDocument`,
  `PowerPoint Document`), never by the extension — the part an attacker controls.
- **`.doc`, `.ppt`, `.rtf`, `.odt`, `.odp`** — converted to the modern equivalent by the
  worker's `DocumentConverter` and then parsed normally. The conversion is recorded on the
  result (`conversion`) and as a warning, because a converted document puts one more program
  between the anchor and the original file.
- **Images, and PDFs with no text layer** — read through the worker's `OcrEngine`. The page
  stays marked `scanned` even after a successful read, and blocks below a confidence floor are
  not offered as quotable anchors. OCR turns a smudge into a plausible digit, so its output
  never qualifies for automatic acceptance.

### SheetJS is pinned by URL, on purpose

`package.json` depends on `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, not on the
npm `xlsx` package. The npm copy is stranded at 0.18.5 with unfixed prototype-pollution and
ReDoS advisories; the fixes were only ever published on the vendor's own distribution.
**Dependabot cannot see a URL dependency**, so the version has to be checked by hand when
SheetJS publishes a release.

## Capabilities the host lends

The package stays pure — no process spawning, no network, no filesystem — so the two jobs
that need the outside world arrive as interfaces (`./capabilities`) implemented by the worker
inside its isolated container:

```ts
await parseDocument(input, {converter, ocr});
```

Without them, a `.doc` and an image are still handled honestly: a named error for the first,
an empty scanned page plus a warning for the second. Nothing is ever silently empty.

## Scale declarations

`detectScaleDeclarations` reports what a document literally says about its own units — "(Em
milhares de reais)" → `1000` — with the sentence and the anchor where it was seen. It never
infers a scale from the magnitude of the numbers and never applies one: applying is the
extractor's job, and only against a declaration it can point at. A quantity in prose ("3
milhões em 2025") is not a declaration.

## Hostile input

The worker parses files that arrive from outside, so: a size ceiling, a zip-entry count
limit, a decompression-ratio guard (a 40 MB-of-zeros `.docx` is refused, with a test), XML
entity processing disabled, per-page/sheet/table caps, and a global character budget. Every
truncation produces a `limit_reached` warning — silence would let the extractor believe it
saw the whole document.
