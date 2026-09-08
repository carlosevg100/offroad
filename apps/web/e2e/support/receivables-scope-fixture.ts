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
  const fiscalBundled = resolve(directory, "fiscal.cjs");
  const parserRequire = createRequire(resolve(__dirname, "../../../../packages/document-parsers/package.json"));
  const JSZip = parserRequire("jszip");
  let fiscalParser;
  let codec;
  try {
    execFileSync(process.execPath, [workerRequire.resolve("esbuild/bin/esbuild"), resolve(__dirname, "../../../document-worker/src/receivables-evidence.ts"), "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundled}`], {stdio: "pipe"});
    codec = workerRequire(bundled);
    execFileSync(process.execPath, [workerRequire.resolve("esbuild/bin/esbuild"), resolve(__dirname, "../../../../packages/document-parsers/src/nfe-archive.ts"), "--bundle", "--platform=node", "--format=cjs", `--outfile=${fiscalBundled}`], {stdio: "pipe"});
    fiscalParser = workerRequire(fiscalBundled);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
  const {documentEvidence, fiscalArchiveEvidence, encodeReceivablesEvidence, fingerprintReceivablesEvidence} = codec;
  const invoiceKey = "1".repeat(44);
  const sources = [];
  const envelopes = [];
  const revisions = [];
  const candidates = [];
  for (const [index, name] of ["Synthetic selected pool.csv", "Synthetic excluded pool.csv", "Synthetic ledger.csv", "Synthetic dilution.csv"].entries()) {
    const id = randomUUID();
    const csv = index < 2
      ? `NUM_TITULO,CNPJ_SACADO,NOME_SACADO,DT_EMISSAO,DT_VENCIMENTO,VLR_TITULO,SITUACAO,CHAVE_NFE\nNF-${index},11222333000144,Synthetic buyer,2026-06-01,2026-07-01,${index === 0 ? 1000 : 999999},ABERTO,${invoiceKey}`
      : index === 2
        ? "DATA,HISTORICO,DOCUMENTO,DEBITO,CREDITO,SALDO\n2026-08-31,Ajuste de conciliacao,ADJ-1,100,0,100\n2026-09-01,Reclassificacao,ADJ-2,900,0,1000\n,Ajuste de conciliacao,ADJ-3,50,0,1050" + Array.from({length: 30}, (_, n) => `\n2026-08-01,Ajuste de conciliacao,SYN-${n},1,0,1`).join("")
        : "MES,DEVOLUCAO DE VENDA,BONIFICACAO,ABATIMENTO COMERCIAL,TOTAL,CONTA CONTABIL\n01/2026,50,0,0,50,Despesas comerciais diversas\n08/2026,50,0,0,50,Despesas comerciais diversas\n09/2026,900,0,0,900,Despesas comerciais diversas";
    const bytes = new TextEncoder().encode(csv);
    const sourceHash = createHash("sha256").update(bytes).digest("hex");
    const parsed = await parseCsv({bytes, documentId: id, documentVersion: 1, fileName: name, localeHint: "pt-BR"});
    const encoded = encodeReceivablesEvidence(documentEvidence({documentId: id, fileName: name, fileHash: sourceHash, parsed}));
    sources.push({id, name, contentKind: "document_layer", sourceHash, contentHash: encoded.contentSha256, payloadHash: encoded.payloadSha256, bytes: encoded.uncompressedBytes, payload: encoded.payloadBase64});
    envelopes.push({source_document_id: id, document_version: 1, content_kind: "document_layer" as "document_layer" | "nfe_archive", schema_version: encoded.schemaVersion, source_sha256: sourceHash, content_sha256: encoded.contentSha256, payload_sha256: encoded.payloadSha256, codec: "gzip-json-v1" as const, uncompressed_bytes: encoded.uncompressedBytes, payload_base64: encoded.payloadBase64});
    revisions.push({sourceDocumentId: id, documentVersion: 1, contentKind: "document_layer", sourceSha256: sourceHash, contentSha256: encoded.contentSha256, schemaVersion: encoded.schemaVersion, fileName: name});
    if (index < 2) candidates.push({documentId: id, fileName: name, sheet: parsed.layer.sheets![0]!.name, headerRow: 1});
  }
  const archiveId = randomUUID();
  const archiveName = "Synthetic fiscal events.zip";
  const zip = new JSZip();
  zip.file("synthetic-cancellation.xml", `<procEventoNFe><evento><infEvento><tpEvento>110111</tpEvento><chNFe>${invoiceKey}</chNFe><dhEvento>2026-09-02T12:00:00-03:00</dhEvento></infEvento></evento><retEvento><infEvento><cStat>135</cStat></infEvento></retEvento></procEventoNFe>`);
  const archiveBytes = await zip.generateAsync({type: "uint8array"});
  const archiveHash = createHash("sha256").update(archiveBytes).digest("hex");
  const fiscal = await fiscalParser.parseNfeArchive({bytes: archiveBytes, archiveId, fileHash: archiveHash});
  const encodedFiscal = encodeReceivablesEvidence(fiscalArchiveEvidence(fiscal));
  sources.push({id: archiveId, name: archiveName, contentKind: "nfe_archive", sourceHash: archiveHash, contentHash: encodedFiscal.contentSha256, payloadHash: encodedFiscal.payloadSha256, bytes: encodedFiscal.uncompressedBytes, payload: encodedFiscal.payloadBase64});
  envelopes.push({source_document_id: archiveId, document_version: 1, content_kind: "nfe_archive" as const, schema_version: encodedFiscal.schemaVersion, source_sha256: archiveHash, content_sha256: encodedFiscal.contentSha256, payload_sha256: encodedFiscal.payloadSha256, codec: "gzip-json-v1" as const, uncompressed_bytes: encodedFiscal.uncompressedBytes, payload_base64: encodedFiscal.payloadBase64});
  revisions.push({sourceDocumentId: archiveId, documentVersion: 1, contentKind: "nfe_archive", sourceSha256: archiveHash, contentSha256: encodedFiscal.contentSha256, schemaVersion: encodedFiscal.schemaVersion, fileName: archiveName});
  return {sources, report: {status: "needs_evidence_scope", sourceManifest: {schemaVersion: "receivables-evidence-manifest.v1", fingerprint: fingerprintReceivablesEvidence(envelopes), sources: revisions}, candidates}};
}
