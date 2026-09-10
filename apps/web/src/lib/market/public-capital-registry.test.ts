import {describe, expect, it} from "vitest";
import {parsePublicCapitalRegistry, publicCapitalRegistry as registry, searchPublicCapitalRegistry} from "./public-capital-registry";

describe("public registry census projection", () => {
  it("retains distinct identity layers without asserting independent capital providers", () => {
    expect(registry.records.filter(row => row.kind === "cvm_manager")).toHaveLength(899);
    expect(registry.records.filter(row => row.kind === "bcb_root")).toHaveLength(1742);
    expect(registry.registryReferenceDate).toBeNull();
    expect(registry.records.every(row => row.identity.length === (row.kind === "cvm_manager" ? 14 : 8))).toBe(true);
    expect(JSON.stringify(registry)).not.toContain('"mandateVerified":true');
  });
  it("searches names and formatted CNPJ without conflating punctuation or paginating beyond results", () => {
    const manager = registry.records.find(row => row.kind === "cvm_manager")!;
    const id = manager.identity;
    const formatted = `${id.slice(0,2)}.${id.slice(2,5)}.${id.slice(5,8)}/${id.slice(8,12)}-${id.slice(12)}`;
    expect(searchPublicCapitalRegistry(registry, formatted, "cvm_manager").rows.map(row => row.id)).toContain(manager.id);
    expect(searchPublicCapitalRegistry(registry, "BANCÓ", "bcb_root").total).toBeGreaterThan(0);
    expect(searchPublicCapitalRegistry(registry, "", "all").rows).toHaveLength(25);
    expect(searchPublicCapitalRegistry(registry, "", "all", 1).rows[0]?.id).not.toBe(searchPublicCapitalRegistry(registry, "", "all").rows[0]?.id);
    expect(searchPublicCapitalRegistry(registry, "definitely absent entity", "all", 999)).toMatchObject({total: 0, page: 0, pages: 0, rows: []});
  });
  it("preserves consortium administrators as registry identities without underwriting claims", () => {
    expect(registry.records.some(row => row.kind === "bcb_root" && row.collection === "SedesConsorcios")).toBe(true);
    expect(registry.records.every(row => !("researchCandidate" in row))).toBe(true);
  });
  it("rejects invented full CNPJ and unresolved evidence", () => {
    const invalid = structuredClone(registry);
    invalid.records[0]!.sourceId = "missing";
    expect(() => parsePublicCapitalRegistry(invalid)).toThrow();
    const root = structuredClone(registry);
    root.records.find(row => row.kind === "bcb_root")!.identity += "000100";
    expect(() => parsePublicCapitalRegistry(root)).toThrow();
  });
});
