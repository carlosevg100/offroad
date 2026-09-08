import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {
  decodeBoundReceivablesEvidence,
  decodeReceivablesEvidence,
  encodeReceivablesEvidence,
  fingerprintReceivablesEvidence,
  fiscalArchiveEvidence,
  receivablesEvidenceEnvelopeSchema,
} from "./receivables-evidence";

const id = "11111111-1111-4111-8111-111111111111";
const sourceHash = "a".repeat(64);

describe("receivables source manifest fingerprint", () => {
  it("is stable across source order", () => {
    const first = envelopeFor({id});
    const second = {...first, source_document_id: "22222222-2222-4222-8222-222222222222"};
    expect(fingerprintReceivablesEvidence([first, second])).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprintReceivablesEvidence([first, second])).toBe(fingerprintReceivablesEvidence([second, first]));
  });

  it.each([
    {document_version: 2},
    {source_sha256: "b".repeat(64)},
    {content_sha256: "c".repeat(64)},
    {content_kind: "nfe_archive" as const},
  ])("changes when source version or semantic identity changes", (change) => {
    const envelope = envelopeFor({id});
    expect(fingerprintReceivablesEvidence([{...envelope, ...change}]))
      .not.toBe(fingerprintReceivablesEvidence([envelope]));
  });

  it.each([{}, {document_version: 2}, {content_kind: "nfe_archive" as const}])("rejects repeated sources regardless of kind/version", (change) => {
    const envelope = envelopeFor({id});
    expect(() => fingerprintReceivablesEvidence([envelope, {...envelope, ...change}]))
      .toThrow(expect.objectContaining({code: "receivables_evidence_duplicate_source"}));
  });

  it("validates envelope metadata before hashing", () => {
    expect(() => fingerprintReceivablesEvidence([{...envelopeFor({id}), document_version: 0}])).toThrow();
  });
});

function envelopeFor(value: unknown) {
  const encoded = encodeReceivablesEvidence(value);
  return receivablesEvidenceEnvelopeSchema.parse({
    source_document_id: id,
    document_version: 1,
    content_kind: "document_layer",
    schema_version: encoded.schemaVersion,
    source_sha256: sourceHash,
    content_sha256: encoded.contentSha256,
    payload_sha256: encoded.payloadSha256,
    codec: "gzip-json-v1",
    uncompressed_bytes: encoded.uncompressedBytes,
    payload_base64: encoded.payloadBase64,
  });
}

describe("receivables evidence codec", () => {
  it("retains PDF cell geometry through the immutable source-bound codec", () => {
    const value = {id, fileName: "synthetic.pdf", fileHash: sourceHash, layer: {
      documentId: id, documentVersion: 1, kind: "pdf", pages: [{n: 1, blocks: [], scanned: false,
        tables: [{id: "p1.t1", rows: [{id: "p1.t1.r1", cells: [
          {id: "p1.t1.r1.c1", text: "Saldo atual", bbox: [10, 20, 90, 30]},
          {id: "p1.t1.r1.c2", text: "", bbox: null},
        ]}]}]}], scaleDeclarations: [], stats: {},
    }};
    expect(decodeBoundReceivablesEvidence(envelopeFor(value))).toEqual({kind: "document_layer", evidence: value});
    const moved = structuredClone(value);
    moved.layer.pages[0]!.tables[0]!.rows[0]!.cells[0]!.bbox = [20, 20, 100, 30];
    expect(envelopeFor(moved).content_sha256).not.toBe(envelopeFor(value).content_sha256);
  });
  it("preserves fiscal event dates and their offsets through source-bound decoding", () => {
    const archive = fiscalArchiveEvidence({archiveId: id, fileHash: sourceHash,
      parserVersion: "nfe-archive-1.0.0", invoices: [], warnings: [],
      cancellations: [{entryName: "event.xml", accessKey: "1".repeat(44), accessKeyValid: true,
        occurredAt: "2026-09-02T23:30:00-03:00", eventCode: "110111", registrationStatus: "135", reason: null}],
    });
    const decoded = decodeBoundReceivablesEvidence({...envelopeFor(archive), content_kind: "nfe_archive"});
    expect(decoded).toEqual({kind: "nfe_archive", evidence: archive});
    expect(archive.cancellations[0]?.occurredAt).toBe("2026-09-02T23:30:00-03:00");
    const changed = {...archive, cancellations: archive.cancellations.map((event) => ({...event, occurredAt: "2026-08-31T23:30:00-03:00"}))};
    expect(envelopeFor(changed).content_sha256).not.toBe(envelopeFor(archive).content_sha256);
  });

  it("keeps legacy cancellation fragments undated rather than manufacturing a date", () => {
    const archive = {archiveId: id, fileHash: sourceHash, invoices: [], cancellations: [{
      entryName: "legacy.xml", accessKey: "1".repeat(44), accessKeyValid: true, registrationStatus: "135",
    }]};
    const decoded = decodeBoundReceivablesEvidence({...envelopeFor(archive), content_kind: "nfe_archive"});
    expect(decoded).toEqual({kind: "nfe_archive", evidence: archive});
    if (decoded.kind !== "nfe_archive") throw new Error("Expected fiscal archive");
    expect(decoded.evidence.cancellations[0]?.occurredAt).toBeUndefined();
  });

  it("round-trips an immutable evidence fragment", () => {
    const value = {id, rows: [{title: "NF-1", amount: "100.00"}]};
    expect(decodeReceivablesEvidence(envelopeFor(value))).toEqual(value);
  });

  it("rejects a payload whose compressed bytes were changed", () => {
    const envelope = envelopeFor({id, value: "original"});
    const tampered = Buffer.from(envelope.payload_base64, "base64");
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(() => decodeReceivablesEvidence({...envelope, payload_base64: tampered.toString("base64")}))
      .toThrow("integrity verification");
  });

  it("rejects valid gzip bytes when their declared content hash is false", () => {
    const envelope = envelopeFor({id, value: "original"});
    const falseHash = createHash("sha256").update("different").digest("hex");
    expect(() => decodeReceivablesEvidence({...envelope, content_sha256: falseHash}))
      .toThrow("integrity verification");
  });
});

describe("receivables evidence source binding", () => {
  const document = {id, fileName: "synthetic.pdf", fileHash: sourceHash,
    layer: {documentId: id, documentVersion: 1, kind: "pdf", scaleDeclarations: [], stats: {}}};
  const archive = {archiveId: id, fileHash: sourceHash, invoices: [], cancellations: []};
  const otherId = "22222222-2222-4222-8222-222222222222";

  it("returns a validated document bound to its envelope", () => {
    expect(decodeBoundReceivablesEvidence(envelopeFor(document)))
      .toEqual({kind: "document_layer", evidence: document});
  });

  it("returns a validated fiscal archive bound to its envelope", () => {
    expect(decodeBoundReceivablesEvidence({...envelopeFor(archive), content_kind: "nfe_archive"}))
      .toEqual({kind: "nfe_archive", evidence: archive});
  });

  it.each([
    {...document, id: otherId},
    {...document, fileHash: "b".repeat(64)},
    {...document, layer: {...document.layer, documentId: otherId}},
    {...document, layer: {...document.layer, documentVersion: 2}},
  ])("rejects internally valid document content with mismatched source identity", (value) => {
    expect(() => decodeBoundReceivablesEvidence(envelopeFor(value)))
      .toThrow(expect.objectContaining({code: "receivables_evidence_source_mismatch"}));
  });

  it.each([
    {...archive, archiveId: otherId},
    {...archive, fileHash: "b".repeat(64)},
  ])("rejects internally valid archive content with mismatched source identity", (value) => {
    expect(() => decodeBoundReceivablesEvidence({...envelopeFor(value), content_kind: "nfe_archive"}))
      .toThrow(expect.objectContaining({code: "receivables_evidence_source_mismatch"}));
  });

  it("rejects a valid generic payload that does not satisfy the declared evidence schema", () => {
    expect(() => decodeBoundReceivablesEvidence(envelopeFor({id}))).toThrow();
    expect(() => decodeBoundReceivablesEvidence({...envelopeFor(document), content_kind: "nfe_archive"})).toThrow();
  });
});
