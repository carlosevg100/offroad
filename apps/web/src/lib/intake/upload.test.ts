import {describe, expect, it} from "vitest";

import {sha256HexOf} from "./server";
import {DOCUMENT_MAX_BYTES, isAcceptedDocument, safeObjectName} from "./upload-client";

describe("document upload rules", () => {
  it("accepts the supported formats within the size limit and rejects the rest", () => {
    expect(isAcceptedDocument({name: "balanco.PDF", size: 1_000})).toBe(true);
    expect(isAcceptedDocument({name: "erp.xlsx", size: DOCUMENT_MAX_BYTES})).toBe(true);
    expect(isAcceptedDocument({name: "erp.xlsx", size: DOCUMENT_MAX_BYTES + 1})).toBe(false);
    expect(isAcceptedDocument({name: "script.exe", size: 10})).toBe(false);
    expect(isAcceptedDocument({name: "archive.zip", size: 10})).toBe(false);
    expect(isAcceptedDocument({name: "empty.pdf", size: 0})).toBe(false);
    expect(isAcceptedDocument({name: "noextension", size: 10})).toBe(false);
  });

  it("produces safe object names and keeps the tail of long names", () => {
    expect(safeObjectName("Demonstrações Financeiras 2025 (final).pdf")).toBe("Demonstracoes-Financeiras-2025-final-.pdf");
    expect(safeObjectName("../../etc/passwd")).toBe("..-..-etc-passwd");
    expect(safeObjectName("../../etc/passwd")).not.toContain("/");
    expect(safeObjectName("a".repeat(200) + ".xlsx").length).toBeLessThanOrEqual(140);
    expect(safeObjectName("x".repeat(200) + ".xlsx").endsWith(".xlsx")).toBe(true);
  });

  it("hashes bytes with SHA-256 (RFC test vector)", () => {
    expect(sha256HexOf(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
