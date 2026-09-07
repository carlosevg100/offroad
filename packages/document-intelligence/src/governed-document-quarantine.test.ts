import {createHash} from "node:crypto";

import JSZip from "jszip";
import {describe, expect, it} from "vitest";

import {
  authorizeParserInput,
  defaultDocumentQuarantinePolicy,
  GovernedDocumentQuarantineError,
  governedDocumentQuarantineRuntimeBoundary,
  quarantineDocument,
  type GovernedMalwareScanner,
  type QuarantineDocumentBinding,
} from "./governed-document-quarantine";

const encoder = new TextEncoder();
const ids = {
  organization: "11111111-1111-4111-8111-111111111111",
  otherOrganization: "22222222-2222-4222-8222-222222222222",
  document: "33333333-3333-4333-8333-333333333333",
  operation: "44444444-4444-4444-8444-444444444444",
};
const timestamps = ["2026-09-07T10:00:00.000Z", "2026-09-07T10:00:01.000Z", "2026-09-07T10:00:02.000Z"];

const cleanScanner: GovernedMalwareScanner = {
  scannerId: "test-scanner",
  engineVersion: "1.0.0",
  signatureSetVersion: "2026-09-07",
  async scan() { return {verdict: "clean"}; },
};

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function binding(bytes: Uint8Array, overrides: Partial<QuarantineDocumentBinding> = {}): QuarantineDocumentBinding {
  return {
    organizationId: ids.organization,
    sourceDocumentId: ids.document,
    documentVersion: 1,
    expectedSha256: hash(bytes),
    expectedByteSize: bytes.byteLength,
    originalName: "analysis.pdf",
    declaredMediaType: "application/pdf",
    operationId: ids.operation,
    ...overrides,
  };
}

function clock(): () => string {
  let position = 0;
  return () => timestamps[Math.min(position++, timestamps.length - 1)]!;
}

function pdf(extra = ""): Uint8Array {
  return encoder.encode(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog ${extra} >>\nendobj\nstartxref\n0\n%%EOF\n`);
}

async function workbook(entries: Record<string, string | Uint8Array> = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("xl/workbook.xml", "<workbook/>");
  zip.file("xl/worksheets/sheet1.xml", "<worksheet><sheetData/></worksheet>");
  for (const [name, value] of Object.entries(entries)) zip.file(name, value);
  return zip.generateAsync({type: "uint8array", compression: "DEFLATE", compressionOptions: {level: 9}});
}

async function inspect(bytes: Uint8Array, overrides: Partial<QuarantineDocumentBinding> = {}, scanner: GovernedMalwareScanner | null = cleanScanner) {
  return quarantineDocument({bytes, binding: binding(bytes, overrides), scanner, now: clock()});
}

describe("governed document quarantine", () => {
  it("issues an immutable, deterministic clean receipt and authorizes only those exact bytes", async () => {
    const bytes = pdf();
    const first = await inspect(bytes);
    const second = await inspect(bytes);

    expect(first).toMatchObject({
      receiptId: second.receiptId,
      receiptFingerprint: second.receiptFingerprint,
      verdict: "clean",
      reasons: [],
      transitions: [
        {state: "quarantined"},
        {state: "scanning"},
        {state: "clean"},
      ],
      scanner: {verdict: "clean", scannerId: "test-scanner"},
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.transitions)).toBe(true);
    expect(authorizeParserInput({receipt: first, binding: binding(bytes), bytes})).toEqual(bytes);
  });

  it("fails closed when the scanner is absent, unavailable, or detects malware", async () => {
    const bytes = pdf();
    const absent = await inspect(bytes, {}, null);
    const unavailable = await inspect(bytes, {}, {...cleanScanner, async scan() { throw new Error("offline"); }});
    const infected = await inspect(bytes, {}, {...cleanScanner, async scan() { return {verdict: "infected" as const, signature: "Eicar-Test"}; }});

    expect(absent).toMatchObject({verdict: "rejected", reasons: ["scanner_unavailable"], retryable: true});
    expect(unavailable).toMatchObject({verdict: "rejected", reasons: ["scanner_unavailable"], retryable: true});
    expect(infected).toMatchObject({verdict: "rejected", reasons: ["malware_detected"], scanner: {verdict: "infected", malwareSignature: "Eicar-Test"}});
    for (const receipt of [absent, unavailable, infected]) {
      expect(() => authorizeParserInput({receipt, binding: binding(bytes), bytes})).toThrow("receipt_not_clean");
    }
  });

  it("rejects malformed, encrypted, polyglot, and declared-type-mismatched PDFs before parsing", async () => {
    const malformed = encoder.encode("%PDF-1.7\nnot finished");
    const encrypted = pdf("/Encrypt 2 0 R");
    const scripted = pdf("/OpenAction 2 0 R /JavaScript (app.alert('x'))");
    const polyglot = Uint8Array.from([...pdf(), 0x50, 0x4b, 0x03, 0x04, 0x00]);
    const wrongDeclaration = await inspect(pdf(), {declaredMediaType: "image/png"});

    expect((await inspect(malformed)).reasons).toContain("malformed_container");
    expect((await inspect(encrypted)).reasons).toContain("encrypted_document");
    expect((await inspect(scripted)).reasons).toContain("active_script");
    expect((await inspect(polyglot)).reasons).toContain("polyglot_content");
    expect(wrongDeclaration.reasons).toContain("declared_type_mismatch");
  });

  it("rejects OOXML macros, embedded objects, external relationships and external formulae", async () => {
    const bytes = await workbook({
      "xl/vbaProject.bin": encoder.encode("macro"),
      "xl/embeddings/oleObject1.bin": encoder.encode("object"),
      "xl/_rels/workbook.xml.rels": '<Relationships><Relationship TargetMode="External" Target="https://example.test"/></Relationships>',
      "xl/worksheets/sheet1.xml": "<worksheet><f>[external.xlsx]Sheet1!A1</f></worksheet>",
    });
    const receipt = await inspect(bytes, {
      originalName: "analysis.xlsx",
      declaredMediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(receipt.verdict).toBe("rejected");
    expect(receipt.reasons).toEqual(expect.arrayContaining([
      "active_macro",
      "embedded_object",
      "external_relationship",
      "external_formula",
    ]));
  });

  it("rejects compression bombs, oversized members, nested archives and excessive entries", async () => {
    const bytes = await workbook({
      "xl/media/repeated.bin": encoder.encode("A".repeat(2_000_000)),
      "nested.zip": "PK",
      "../escape.xml": "<unsafe/>",
    });
    const receipt = await quarantineDocument({
      bytes,
      binding: binding(bytes, {
        originalName: "analysis.xlsx",
        declaredMediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      scanner: cleanScanner,
      policy: {
        ...defaultDocumentQuarantinePolicy,
        policyVersion: "test-tight-archive-limits",
        maxArchiveEntries: 3,
        maxArchiveMemberBytes: 1_000,
        maxArchiveTotalUncompressedBytes: 10_000,
        maxArchiveCompressionRatio: 10,
      },
      now: clock(),
    });

    expect(receipt.reasons).toEqual(expect.arrayContaining([
      "archive_entries_exceeded",
      "archive_member_exceeded",
      "archive_total_uncompressed_exceeded",
      "archive_ratio_exceeded",
      "nested_archive",
      "archive_path_unsafe",
    ]));
  });

  it("rejects spreadsheet formula injection in delimited text", async () => {
    const bytes = encoder.encode("name,amount\nlegitimate,100\nattack,=WEBSERVICE(\"https://example.test\")\n");
    const receipt = await inspect(bytes, {originalName: "input.csv", declaredMediaType: "text/csv"});
    expect(receipt).toMatchObject({verdict: "rejected", reasons: ["formula_injection"]});
  });

  it("binds authorization to tenant, document version, operation, policy, and unchanged bytes", async () => {
    const bytes = pdf();
    const receipt = await inspect(bytes);
    const swaps: Partial<QuarantineDocumentBinding>[] = [
      {organizationId: ids.otherOrganization},
      {documentVersion: 2},
      {operationId: "55555555-5555-4555-8555-555555555555"},
    ];
    for (const swap of swaps) {
      expect(() => authorizeParserInput({receipt, binding: binding(bytes, swap), bytes})).toThrow("binding_mismatch");
    }
    expect(() => authorizeParserInput({receipt, binding: binding(bytes), bytes: pdf("/Lang (pt-BR)")})).toThrow("bytes_changed");
    expect(() => authorizeParserInput({
      receipt,
      binding: binding(bytes),
      bytes,
      policy: {...defaultDocumentQuarantinePolicy, policyVersion: "another-policy"},
    })).toThrow("binding_mismatch");
  });

  it("detects receipt tampering before authorizing a parser", async () => {
    const bytes = pdf();
    const receipt = await inspect(bytes);
    const tampered = {...receipt, scanner: {...receipt.scanner, scannerId: "forged"}};
    expect(() => authorizeParserInput({receipt: tampered, binding: binding(bytes), bytes})).toThrow(GovernedDocumentQuarantineError);
    expect(() => authorizeParserInput({receipt: tampered, binding: binding(bytes), bytes})).toThrow("receipt_invalid");
  });

  it("exports unresolved persistence and runtime isolation as blockers, not live claims", () => {
    expect(governedDocumentQuarantineRuntimeBoundary).toMatchObject({
      maturity: "code_complete_candidate",
      exposure: "internal_shadow",
      parserAuthorization: "clean_receipt_required",
      blockers: expect.arrayContaining([
        "append_only_receipt_persistence",
        "atomic_compare_and_swap",
        "runtime_task_isolation",
        "runtime_egress_enforcement",
      ]),
    });
  });
});
