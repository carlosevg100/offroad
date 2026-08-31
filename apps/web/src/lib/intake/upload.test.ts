import {describe, expect, it, vi} from "vitest";

import {sha256HexOf} from "./server";
import {DOCUMENT_ACCEPT, DOCUMENT_ALLOWED_EXTENSIONS, DOCUMENT_MAX_BYTES, formatDocumentSize, isAcceptedDocument, safeObjectName, uploadDocuments} from "./upload-client";

describe("document upload rules", () => {
  it("accepts the supported formats within the size limit and rejects the rest", () => {
    expect(isAcceptedDocument({name: "balanco.PDF", size: 1_000})).toBe(true);
    expect(isAcceptedDocument({name: "erp.xlsx", size: DOCUMENT_MAX_BYTES})).toBe(true);
    expect(isAcceptedDocument({name: "erp.xlsx", size: DOCUMENT_MAX_BYTES + 1})).toBe(false);
    expect(isAcceptedDocument({name: "script.exe", size: 10})).toBe(false);
    expect(isAcceptedDocument({name: "nfe-amostra.zip", size: 10})).toBe(true);
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

  it("shows small documents in KB instead of a misleading 0.0 MB", () => {
    expect(formatDocumentSize(9_145)).toBe("9 KB");
    expect(formatDocumentSize(232_097)).toBe("232 KB");
    expect(formatDocumentSize(1_250_000)).toBe("1.3 MB");
  });
});

describe("the door accepts everything the engine can read", () => {
  /**
   * Named here rather than imported, on purpose. The parser package exposes its capability as
   * mime types and conversion rules, and what a sender's file picker enforces is extensions.
   * Writing the list out makes the two sides visible to the same reader, so widening one without
   * the other fails here instead of failing a company.
   */
  const readsDirectly = ["pdf", "csv", "tsv", "prn", "txt", "xlsx", "xls", "xlsb", "ods", "fods", "dbf", "docx", "pptx", "jpg", "jpeg", "png", "webp", "zip"];
  const convertedByTheWorker = ["doc", "ppt", "rtf", "odt", "odp", "wpd"];

  it.each([...readsDirectly, ...convertedByTheWorker])("accepts .%s", (extension) => {
    expect(isAcceptedDocument({name: `mapa-de-divida.${extension}`, size: 2048})).toBe(true);
  });

  it("still refuses what nothing can read", () => {
    // The list is a capability statement, not an open door: an executable is not a document.
    for (const extension of ["exe", "dmg", "tar", "gz", "rar", "7z", "sh", "app", "sql"]) {
      expect(isAcceptedDocument({name: `x.${extension}`, size: 2048})).toBe(false);
    }
  });

  it("offers the same set to the file picker, so the two cannot drift", () => {
    // `DOCUMENT_ACCEPT` used to be a second hand-written copy of the list, which is how one of
    // them ends up shorter than the other.
    const offered = new Set(DOCUMENT_ACCEPT.split(",").map((entry) => entry.replace(".", "")));
    expect(offered).toEqual(DOCUMENT_ALLOWED_EXTENSIONS);
  });

  it("keeps the size and batch limits", () => {
    expect(isAcceptedDocument({name: "grande.xlsx", size: DOCUMENT_MAX_BYTES + 1})).toBe(false);
    expect(isAcceptedDocument({name: "vazio.xlsx", size: 0})).toBe(false);
  });
});

describe("idempotent document registration", () => {
  function clientReturning(data: unknown) {
    const removed: string[][] = [];
    return {
      removed,
      client: {
        storage: {
          from: () => ({
            upload: vi.fn().mockResolvedValue({error: null}),
            remove: vi.fn().mockImplementation(async (paths: string[]) => {
              removed.push(paths);
              return {error: null};
            }),
          }),
        },
        rpc: vi.fn().mockResolvedValue({data, error: null}),
      },
    };
  }

  it("treats a same-scope content duplicate as a non-error and removes only the temporary object", async () => {
    const stub = clientReturning({id: "existing", original_name: "balanco.pdf", byte_size: 9_145, duplicate: true});
    const result = await uploadDocuments({
      supabase: stub.client as never,
      files: [new File(["same bytes"], "balanco-copia.pdf", {type: "application/pdf"})],
      organizationId: "org",
      userId: "user",
      scope: {kind: "session", sessionId: "session"},
    });

    expect(result).toMatchObject({uploaded: [], duplicateCount: 1, failure: null});
    expect(stub.removed).toHaveLength(1);
  });

  it("accepts bigint fields serialized as strings by the API", async () => {
    const stub = clientReturning({id: "new", original_name: "balanco.pdf", byte_size: "9145", duplicate: false});
    const result = await uploadDocuments({
      supabase: stub.client as never,
      files: [new File(["new bytes"], "balanco.pdf", {type: "application/pdf"})],
      organizationId: "org",
      userId: "user",
      scope: {kind: "session", sessionId: "session"},
    });

    expect(result).toMatchObject({
      uploaded: [{id: "new", original_name: "balanco.pdf", byte_size: 9_145}],
      duplicateCount: 0,
      failure: null,
    });
    expect(stub.removed).toHaveLength(0);
  });
});
