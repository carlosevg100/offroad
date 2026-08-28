import {createHash} from "node:crypto";

import {describe, expect, it} from "vitest";

import {
  decodeReceivablesEvidence,
  encodeReceivablesEvidence,
  receivablesEvidenceEnvelopeSchema,
} from "./receivables-evidence";

const id = "11111111-1111-4111-8111-111111111111";
const sourceHash = "a".repeat(64);

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
