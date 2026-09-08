import {resolve} from "node:path";
import {createRequire} from "node:module";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {createHash, randomUUID} from "node:crypto";
import {parseCsv} from "../../../../packages/document-parsers/src/csv";


/** Synthetic parser output used only by the local browser harness. */
export async function receivablesScopeFixture() {
  const workerRequire = createRequire(resolve(__dirname, "../../../document-worker/package.json"));
  const directory = mkdtempSync(resolve(tmpdir(), "offroad-scope-fixture-"));
  const bundled = resolve(directory, "codec.cjs");
  let codec;
  try {
    execFileSync(process.execPath, [workerRequire.resolve("esbuild/bin/esbuild"), resolve(__dirname, "../../../document-worker/src/receivables-evidence.ts"), "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundled}`], {stdio: "pipe"});
    codec = workerRequire(bundled);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
  const {documentEvidence, encodeReceivablesEvidence, fingerprintReceivablesEvidence} = codec;
  const sources = [];
  const envelopes = [];
  const revisions = [];
  const candidates = [];
  for (const [index, name] of ["Synthetic selected pool.csv", "Synthetic excluded pool.csv", "Synthetic support.csv"].entries()) {
    const id = randomUUID();
    const csv = index < 2
      ? `NUM_TITULO,CNPJ_SACADO,NOME_SACADO,DT_EMISSAO,DT_VENCIMENTO,VLR_TITULO,SITUACAO\nNF-${index},11222333000144,Synthetic buyer,2026-06-01,2026-07-01,${index === 0 ? 1000 : 999999},ABERTO`
      : "NOTE,VALUE\nSynthetic supporting evidence,1";
    const bytes = new TextEncoder().encode(csv);
    const sourceHash = createHash("sha256").update(bytes).digest("hex");
    const parsed = await parseCsv({bytes, documentId: id, documentVersion: 1, fileName: name, localeHint: "pt-BR"});
    const encoded = encodeReceivablesEvidence(documentEvidence({documentId: id, fileName: name, fileHash: sourceHash, parsed}));
    sources.push({id, name, sourceHash, contentHash: encoded.contentSha256, payloadHash: encoded.payloadSha256, bytes: encoded.uncompressedBytes, payload: encoded.payloadBase64});
    envelopes.push({source_document_id: id, document_version: 1, content_kind: "document_layer" as const, schema_version: encoded.schemaVersion, source_sha256: sourceHash, content_sha256: encoded.contentSha256, payload_sha256: encoded.payloadSha256, codec: "gzip-json-v1" as const, uncompressed_bytes: encoded.uncompressedBytes, payload_base64: encoded.payloadBase64});
    revisions.push({sourceDocumentId: id, documentVersion: 1, contentKind: "document_layer", sourceSha256: sourceHash, contentSha256: encoded.contentSha256, schemaVersion: encoded.schemaVersion, fileName: name});
    if (index < 2) candidates.push({documentId: id, fileName: name, sheet: parsed.layer.sheets![0]!.name, headerRow: 1});
  }
  return {sources, report: {status: "needs_evidence_scope", sourceManifest: {schemaVersion: "receivables-evidence-manifest.v1", fingerprint: fingerprintReceivablesEvidence(envelopes), sources: revisions}, candidates}};
}
