import {createHash, randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {resolve} from "node:path";

/** A synthetic workbook parsed by the real parser; no financial output is seeded. */
export async function receivablesR01Fixture() {
  const workerRequire = createRequire(resolve(__dirname, "../../../document-worker/package.json"));
  const parserRequire = createRequire(resolve(__dirname, "../../../../packages/document-parsers/package.json"));
  const xlsx = parserRequire("xlsx");
  const source = JSON.parse(readFileSync(resolve(__dirname, "../../../../supabase/tests/support/receivables_r01_workbook.json"), "utf8"));
  const directory = mkdtempSync(resolve(tmpdir(), "offroad-r01-fixture-"));
  try {
    const bundle = (sourcePath: string, name: string) => {
      const target = resolve(directory, name);
      execFileSync(process.execPath, [workerRequire.resolve("esbuild/bin/esbuild"), resolve(__dirname, sourcePath), "--bundle", "--platform=node", "--format=cjs", `--outfile=${target}`], {stdio: "pipe"});
      return workerRequire(target);
    };
    const parser = bundle("../../../../packages/document-parsers/src/xlsx.ts", "parser.cjs");
    const codec = bundle("../../../document-worker/src/receivables-evidence.ts", "codec.cjs");
    const sources: Array<{id: string; name: string; contentKind: string; sourceHash: string; contentHash: string; payloadHash: string; bytes: number; payload: string}> = [];
    const envelopes = [], revisions = [];
    for (const name of ["Synthetic governed R01.xlsx"]) {
      const workbook = xlsx.utils.book_new();
      for (const sheet of [...source.layer.sheets, {...source.layer.sheets.find((item: {name: string}) => item.name === "CARTEIRA"), name: "Excluded pool"}]) {
        const cells: Record<string, unknown> = {};
        let maxColumn = 0, maxRow = 0;
        for (const cell of sheet.cells) {
          cells[cell.ref] = {t: "s", v: String(cell.v)};
          const position = xlsx.utils.decode_cell(cell.ref);
          maxColumn = Math.max(maxColumn, position.c); maxRow = Math.max(maxRow, position.r);
        }
        cells["!ref"] = xlsx.utils.encode_range({s: {c: 0, r: 0}, e: {c: maxColumn, r: maxRow}});
        xlsx.utils.book_append_sheet(workbook, cells, sheet.name);
      }
      const bytes = xlsx.write(workbook, {type: "buffer", bookType: "xlsx"});
      const id = randomUUID();
      const sourceHash = createHash("sha256").update(bytes).digest("hex");
      const parsed = await parser.parseXlsx({bytes, documentId: id, documentVersion: 1, fileName: name, localeHint: "pt-BR"});
      const encoded = codec.encodeReceivablesEvidence(codec.documentEvidence({documentId: id, fileName: name, fileHash: sourceHash, parsed}));
      envelopes.push({source_document_id: id, document_version: 1, content_kind: "document_layer", schema_version: encoded.schemaVersion, source_sha256: sourceHash, content_sha256: encoded.contentSha256, payload_sha256: encoded.payloadSha256, codec: "gzip-json-v1", uncompressed_bytes: encoded.uncompressedBytes, payload_base64: encoded.payloadBase64});
      sources.push({id, name, contentKind: "document_layer", sourceHash, contentHash: encoded.contentSha256, payloadHash: encoded.payloadSha256, bytes: encoded.uncompressedBytes, payload: encoded.payloadBase64});
      revisions.push({sourceDocumentId: id, documentVersion: 1, contentKind: "document_layer", sourceSha256: sourceHash, contentSha256: encoded.contentSha256, schemaVersion: encoded.schemaVersion, fileName: name});
    }
    return {sources, report: {status: "needs_evidence_scope", sourceManifest: {schemaVersion: "receivables-evidence-manifest.v1", fingerprint: codec.fingerprintReceivablesEvidence(envelopes), sources: revisions}, candidates: ["CARTEIRA", "Excluded pool"].map((sheet) => ({documentId: sources[0]!.id, fileName: sources[0]!.name, sheet, headerRow: 1})), supportSheetCandidates: source.layer.sheets.filter((sheet: {name: string}) => sheet.name !== "CARTEIRA").map((sheet: {name: string}) => ({documentId: sources[0]!.id, sheet: sheet.name}))}};
  } finally {rmSync(directory, {recursive: true, force: true});}
}
