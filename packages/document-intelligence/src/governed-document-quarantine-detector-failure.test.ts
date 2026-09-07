import {createHash} from "node:crypto";

import {describe, expect, it, vi} from "vitest";

vi.mock("file-type", () => ({
  fileTypeFromBuffer: vi.fn(async () => { throw new Error("detector crashed"); }),
}));

import {quarantineDocument, type GovernedMalwareScanner} from "./governed-document-quarantine";

const bytes = new TextEncoder().encode("opaque but integrity-bound input");
const hash = createHash("sha256").update(bytes).digest("hex");

describe("governed quarantine detector failures", () => {
  it("runs the scanner first and converts a detector exception into a durable rejection receipt", async () => {
    const scan = vi.fn(async () => ({verdict: "clean" as const}));
    const scanner: GovernedMalwareScanner = {
      scannerId: "test-scanner",
      engineVersion: "1.0.0",
      signatureSetVersion: "2026-09-07",
      scan,
    };
    const receipt = await quarantineDocument({
      bytes,
      binding: {
        organizationId: "11111111-1111-4111-8111-111111111111",
        sourceDocumentId: "22222222-2222-4222-8222-222222222222",
        documentVersion: 1,
        expectedSha256: hash,
        expectedByteSize: bytes.byteLength,
        originalName: "unknown.bin",
        declaredMediaType: null,
        operationId: "33333333-3333-4333-8333-333333333333",
      },
      scanner,
      now: () => "2026-09-07T10:00:00.000Z",
    });

    expect(scan).toHaveBeenCalledOnce();
    expect(receipt).toMatchObject({
      verdict: "rejected",
      reasons: ["malformed_container"],
      detected: null,
      scanner: {verdict: "clean"},
      transitions: [{state: "quarantined"}, {state: "scanning"}, {state: "rejected"}],
    });
  });
});
