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

/** Discover the complete current synthetic corpus, including sources from preceding journey steps. */
export function refreshReceivablesFixtureDiscovery(databaseUrl: string, sessionId: string, ownerEmail: string) {
  const address = new URL(databaseUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(address.hostname) || address.port !== "54322" || address.pathname !== "/postgres" || !/^e2e-.*@example\.com$/.test(ownerEmail)) {
    throw new Error("R01 discovery fixture requires the synthetic loopback owner.");
  }
  const query = `select coalesce(jsonb_agg(jsonb_build_object(
    'source_document_id',chosen.source_document_id,'document_version',chosen.document_version,
    'content_kind',chosen.content_kind,'schema_version',chosen.schema_version,
    'source_sha256',chosen.source_sha256,'content_sha256',chosen.content_sha256,
    'payload_sha256',chosen.payload_sha256,'codec',chosen.codec,
    'uncompressed_bytes',chosen.uncompressed_bytes,'payload_base64',encode(chosen.compressed_payload,'base64'),
    'file_name',chosen.original_name
  ) order by chosen.source_document_id),'[]'::jsonb) from (
    select distinct on (fragment.source_document_id,fragment.document_version) fragment.*,source.original_name
    from private.receivables_evidence_fragments fragment
    join public.source_documents source on source.organization_id=fragment.organization_id
      and source.id=fragment.source_document_id and source.intake_session_id=fragment.intake_session_id
      and source.document_version=fragment.document_version
    join public.document_intake_sessions session on session.organization_id=fragment.organization_id and session.id=fragment.intake_session_id
    join auth.users owner on owner.id=session.started_by
    where session.id=:'session_id'::uuid and owner.email=:'owner_email'
    order by fragment.source_document_id,fragment.document_version,fragment.created_at desc
  ) chosen;`;
  const commandArgs = [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1", "-v", `session_id=${sessionId}`, "-v", `owner_email=${ownerEmail}`];
  const entries = JSON.parse(execFileSync("psql", commandArgs, {encoding: "utf8", input: query}).trim()) as Array<Record<string, unknown> & {source_document_id: string; file_name: string}>;
  if (!entries.length) throw new Error("Synthetic discovery has no current sources.");
  const workerRequire = createRequire(resolve(__dirname, "../../../document-worker/package.json"));
  const directory = mkdtempSync(resolve(tmpdir(), "offroad-r01-discovery-"));
  try {
    const target = resolve(directory, "discovery.cjs");
    execFileSync(process.execPath, [workerRequire.resolve("esbuild/bin/esbuild"), resolve(__dirname, "../../../document-worker/src/receivables-scope-resolution.ts"), "--bundle", "--platform=node", "--format=cjs", `--outfile=${target}`], {stdio: "pipe"});
    const discovery = workerRequire(target).discoverReceivablesEvidence(entries.map((entry) => {const envelope: Record<string, unknown> = {...entry}; delete envelope.file_name; return envelope;}), new Map(entries.map((entry) => [entry.source_document_id, entry.file_name])));
    const report = {status: "needs_evidence_scope", sourceManifest: discovery.sourceManifest, candidates: discovery.candidates, supportSheetCandidates: discovery.supportSheetCandidates};
    execFileSync("psql", [...commandArgs, "-v", `report=${JSON.stringify(report)}`], {encoding: "utf8", input: `update public.document_intake_sessions s set result_summary=jsonb_set(coalesce(result_summary,'{}'),'{case_state}',coalesce(result_summary->'case_state','{}')||jsonb_build_object('receivablesVertical',:'report'::jsonb)) where s.id=:'session_id'::uuid and exists(select 1 from auth.users u where u.id=s.started_by and u.email=:'owner_email');`});
    return report;
  } finally {rmSync(directory, {recursive: true, force: true});}
}
