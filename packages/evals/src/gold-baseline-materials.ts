import {readFileSync} from "node:fs";
import {join} from "node:path";

import {parsePdf} from "@offroad/document-parsers";
import type {SourcePackEntry} from "@offroad/public-research";

import {filterCsvRows, type BaselineSource} from "./gold-baseline";

/**
 * How the baseline reads a gold case's materials into its information base: PDFs through the
 * product's own parser, page by page, blocks and then tables as rows of cells; large registries
 * filtered to the company's rows; archives as metadata only. Shared by the baseline script and the
 * tests that rebuild a committed run's base from the committed files.
 */
export async function baselinePdfText(bytes: Uint8Array, fileName: string, id: string): Promise<{text: string; pages: number}> {
  const parsed = await parsePdf({bytes, documentId: id, documentVersion: 1, fileName, mimeType: "application/pdf"});
  const pages = parsed.layer.pages ?? [];
  // Blocks are the prose; tables come out of the same layer as rows of cells. Both are rendered,
  // in page order, so the generalist reads exactly what the product's own parser produced.
  const text = pages.map((page) => {
    const blocks = page.blocks.map((block) => block.text).filter((line) => line.trim().length > 0);
    const tables = page.tables.map((table) => {
      const header = table.header && table.header.length > 0 ? [table.header.join(" | ")] : [];
      return [...header, ...table.rows.map((row) => row.cells.map((cell) => cell.text).join(" | "))].join("\n");
    });
    return [`[página ${page.n}]${page.scanned ? " (página sem texto extraível)" : ""}`, ...blocks, ...tables].join("\n");
  }).join("\n\n");
  return {text, pages: pages.length};
}

export async function baselineSourceFromPackEntry(packDir: string, entry: SourcePackEntry, companyPattern: RegExp): Promise<BaselineSource> {
  const common = {
    id: entry.id, title: entry.title, url: entry.url, asOfDate: entry.asOfDate, version: entry.version,
    licencePolicy: entry.licence.policy, contentType: entry.contentType, sha256: entry.path ? entry.sha256 : null,
  };
  if (!entry.path) return {...common, text: null, rendering: "not_retained", note: entry.licence.note ?? "consulta manual, sem bytes"};
  const bytes = new Uint8Array(readFileSync(join(packDir, entry.path)));
  if (/pdf/i.test(entry.contentType)) {
    const {text} = await baselinePdfText(bytes, entry.path, entry.id);
    return {...common, text, rendering: "full_text"};
  }
  if (/csv/i.test(entry.contentType) || entry.path.endsWith(".csv")) {
    const decoded = Buffer.from(bytes).toString(bytes.byteLength > 200_000 ? "latin1" : "utf8");
    if (bytes.byteLength > 200_000) {
      const filtered = filterCsvRows(decoded, companyPattern);
      return {...common, text: filtered.text, rendering: "filtered_rows", note: `${filtered.kept} de ${filtered.total} linhas, as que citam a companhia`};
    }
    return {...common, text: decoded, rendering: "full_text"};
  }
  if (/json|text\//i.test(entry.contentType)) return {...common, text: Buffer.from(bytes).toString("utf8"), rendering: "full_text"};
  return {...common, text: null, rendering: "metadata_only", note: "arquivo compactado; os documentos que ele indexa entram como fontes próprias"};
}
