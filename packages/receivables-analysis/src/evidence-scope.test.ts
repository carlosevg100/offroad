import {describe, expect, it} from "vitest";
import {
  receivablesEvidenceScopeContextSchema,
  receivablesEvidenceScopeSchema,
  type ReceivablesEvidenceScopeContext,
} from "./evidence-scope";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture(): ReceivablesEvidenceScopeContext {
  const source = {
    sourceDocumentId: id(1), documentVersion: 2, contentKind: "document_layer" as const,
    sourceSha256: "a".repeat(64), contentSha256: "b".repeat(64),
    schemaVersion: "2026.08.28-v1" as const, fileName: "Synthetic pool.csv",
  };
  const primaryTape = {documentId: id(1), sheet: "Pool", headerRow: 1};
  return {
    state: "current",
    sourceManifest: {schemaVersion: "receivables-evidence-manifest.v1", fingerprint: "c".repeat(64), sources: [source]},
    candidates: [{...primaryTape, fileName: "Synthetic pool.csv"}],
    scope: {
      schemaVersion: "receivables-evidence-scope.v1", id: id(2), fingerprint: "d".repeat(64),
      sourceManifestFingerprint: "c".repeat(64), primaryTape, complementDocumentIds: [],
      reportingDate: "2026-08-31", sourceRevisions: [structuredClone(source)], confirmedBy: id(3), confirmedAt: "2026-09-08T00:00:00Z",
    },
  };
}

describe("confirmed receivables scope contract", () => {
  it("keeps v1 byte shape and requires explicit v2 support inventory", () => {
    const old = fixture();
    expect(receivablesEvidenceScopeSchema.safeParse({...old.scope!, primarySupportSheets: []}).success).toBe(false);
    const scope = {...old.scope!, schemaVersion: "receivables-evidence-scope.v2", primarySupportSheets: ["Apoio"]};
    expect(receivablesEvidenceScopeContextSchema.safeParse({...old, scope}).success).toBe(false);
    const current = {...old, scope, supportSheetCandidates: [{documentId: scope.primaryTape.documentId, sheet: "Apoio"}]};
    expect(receivablesEvidenceScopeContextSchema.parse(current)).toEqual(current);
    for (const primarySupportSheets of [["Apoio", "Apoio"], ["Pool"], ["Z", "Apoio"]]) {
      expect(receivablesEvidenceScopeContextSchema.safeParse({...current, scope: {...scope, primarySupportSheets}}).success).toBe(false);
    }
  });

  it("accepts the exact discovered table and current source revision", () => {
    expect(receivablesEvidenceScopeContextSchema.parse(fixture())).toEqual(fixture());
  });

  it.each(["documentVersion", "sourceSha256", "contentSha256", "contentKind"] as const)("rejects changed %s", (field) => {
    const input = fixture();
    const source = input.sourceManifest!.sources[0]!;
    if (field === "documentVersion") source.documentVersion = 3;
    else if (field === "contentKind") source.contentKind = "nfe_archive";
    else source[field] = "e".repeat(64);
    expect(receivablesEvidenceScopeContextSchema.safeParse(input).success).toBe(false);
  });

  it.each(["manifest", "revision", "table", "manifest_hash"])("rejects missing or stale %s", (part) => {
    const input = fixture();
    if (part === "manifest") input.sourceManifest = null;
    if (part === "revision") input.sourceManifest!.sources = [];
    if (part === "table") input.candidates = [];
    if (part === "manifest_hash") input.sourceManifest!.fingerprint = "e".repeat(64);
    expect(receivablesEvidenceScopeContextSchema.safeParse(input).success).toBe(false);
  });

  it.each(["manifest_sources", "selected_primary", "revisions"])("rejects duplicated %s", (part) => {
    const input = fixture();
    if (part === "manifest_sources") input.sourceManifest!.sources.push(input.sourceManifest!.sources[0]!);
    if (part === "selected_primary") input.scope!.complementDocumentIds.push(id(1));
    if (part === "revisions") input.scope!.sourceRevisions.push(input.scope!.sourceRevisions[0]!);
    expect(receivablesEvidenceScopeContextSchema.safeParse(input).success).toBe(false);
  });

  it("rejects another title tape as complementary evidence even with matching revisions", () => {
    const input = fixture();
    const second = {...input.sourceManifest!.sources[0]!, sourceDocumentId: id(4)};
    input.sourceManifest!.sources.push(second);
    input.scope!.sourceRevisions.push(second);
    input.scope!.complementDocumentIds.push(id(4));
    input.candidates.push({documentId: id(4), sheet: "Second pool", headerRow: 1, fileName: "Second.csv"});
    expect(receivablesEvidenceScopeContextSchema.safeParse(input).success).toBe(false);
  });

  it.each(["2026-02-29", "2026-04-31", "2026-13-01", ""])("rejects invalid calendar date %s", (date) => {
    expect(receivablesEvidenceScopeSchema.safeParse({...fixture().scope, reportingDate: date}).success).toBe(false);
  });

  it("accepts a real leap day and keeps unconfirmed/unavailable contexts representable", () => {
    expect(receivablesEvidenceScopeSchema.safeParse({...fixture().scope, reportingDate: "2024-02-29"}).success).toBe(true);
    expect(receivablesEvidenceScopeContextSchema.safeParse({...fixture(), state: "unconfirmed", scope: null}).success).toBe(true);
    expect(receivablesEvidenceScopeContextSchema.safeParse({state: "unavailable", scope: null, sourceManifest: null, candidates: []}).success).toBe(true);
    expect(receivablesEvidenceScopeContextSchema.safeParse({...fixture(), state: "current", scope: null}).success).toBe(false);
  });
});
