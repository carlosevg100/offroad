import {describe, expect, it, vi} from "vitest";
import {inventoryMetadata, loadInventoryMetadata} from "./inventory-metadata";

const profile = () => ({document_version: 2, document_kind: "management_accounts", entity_name: "Synthetic Company", period_start: "2025-01-01", period_end: "2025-12-31", review_state: "proposed" as const});
describe("current-version initial inventory metadata", () => {
  it("localizes the catalog kind while preserving the observed name and date values", () => {
    expect(inventoryMetadata(profile(), 2, "pt-BR")).toEqual({classification: "Relatório gerencial", entityName: "Synthetic Company", periodStart: "2025-01-01", periodEnd: "2025-12-31"});
    expect(inventoryMetadata(profile(), 2, "en-US")?.classification).toBe("Management accounts");
  });
  it("does not use another version or a rejected, superseded or inapplicable profile", () => {
    expect(inventoryMetadata(profile(), 3, "pt-BR")).toBeNull();
    for (const review_state of ["rejected", "superseded", "not_applicable"] as const) expect(inventoryMetadata({...profile(), review_state}, 2, "pt-BR")).toBeNull();
  });
  it("preserves an available cut-off without inventing the missing start or legal name", () => {
    const result = inventoryMetadata({...profile(), entity_name: null, period_start: null}, 2, "pt-BR");
    expect(result).toMatchObject({entityName: null, periodStart: null, periodEnd: "2025-12-31"});
  });
  it("keeps partial metadata without displaying an unknown internal kind or invalid dates", () => {
    expect(inventoryMetadata({...profile(), document_kind: "internal_unknown", period_start: "2025-02-31"}, 2, "pt-BR"))
      .toMatchObject({classification: null, entityName: "Synthetic Company", periodStart: null, periodEnd: "2025-12-31"});
    expect(inventoryMetadata({...profile(), period_start: "2026-01-01"}, 2, "pt-BR")).toMatchObject({periodStart: null, periodEnd: null});
  });
});

describe("metadata loader through source-version authorization", () => {
  function client(rows: unknown[]) {
    const select = vi.fn(), eq = vi.fn(), inIds = vi.fn<(column: string, ids: string[]) => Promise<{data: unknown[]; error: null}>>().mockResolvedValue({data: rows, error: null});
    eq.mockReturnValue({in: inIds}); select.mockReturnValue({eq});
    const from = vi.fn(() => ({select}));
    return {supabase: {from} as unknown as Parameters<typeof loadInventoryMetadata>[0], from, select, eq, inIds};
  }
  it("uses the current source-version relation and organization filter; excludes unrequested or mismatched versions", async () => {
    const c = client([{id: "requested", legacy_document_version: 2, document_profiles: profile()},
      {id: "outside", legacy_document_version: 2, document_profiles: profile()}, {id: "stale", legacy_document_version: 1, document_profiles: profile()}]);
    const result = await loadInventoryMetadata(c.supabase, "organization", [{id: "requested", document_version: 2}, {id: "stale", document_version: 2}], "pt-BR");
    expect(c.from).toHaveBeenCalledWith("source_versions"); expect(c.select.mock.calls[0]![0]).toContain("document_profiles!document_profiles_exact_source_version_fkey");
    expect(c.eq).toHaveBeenCalledWith("organization_id", "organization"); expect(c.inIds).toHaveBeenCalledWith("id", ["requested", "stale"]);
    expect([...result.keys()]).toEqual(["requested"]);
  });
  it("does not substitute cached metadata when current authorization returns no versions", async () => {
    const c = client([]); expect((await loadInventoryMetadata(c.supabase, "organization", [{id: "withdrawn", document_version: 2}], "en-US")).size).toBe(0);
  });
  it("bounds each reference query without dropping files after the first batch", async () => {
    const c = client([]), documents = Array.from({length: 201}, (_, n) => ({id: "doc-" + n, document_version: 1}));
    await loadInventoryMetadata(c.supabase, "organization", documents, "pt-BR");
    expect(c.inIds.mock.calls.map(call => call[1].length)).toEqual([100, 100, 1]);
  });
  it("does not query another surface for an empty inventory", async () => {
    const c = client([]); expect((await loadInventoryMetadata(c.supabase, "organization", [], "pt-BR")).size).toBe(0); expect(c.from).not.toHaveBeenCalled();
  });
});
