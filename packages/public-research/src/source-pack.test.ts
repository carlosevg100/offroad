import {describe, expect, it} from "vitest";

import {createSourcePackAcquirer, createSourcePackProvider, sourcePackEntryFromAcquisition, sourcePackEntrySchema, sourcePackSchema, verifySourcePack} from "./source-pack";
import {inMemorySourcePack} from "./source-pack-test-helper";

const query = (topic: "identity" | "news" | "sector" | "regulation" | "market", extra: Record<string, unknown> = {}) => ({
  id: "a".repeat(64),
  topic,
  query: "Camil resultados 1T26",
  domainAllowlist: [],
  ...extra,
}) as never;

describe("source pack", () => {
  const {pack, read, bytes} = inMemorySourcePack({
    caseId: "gc01",
    files: [
      {id: "itr_1t26", topic: "identity", url: "https://ri.camil.com.br/itr-1t26.pdf", bytes: "ITR 1T26", country: "BR"},
      {id: "release_1t26", topic: "news", url: "https://ri.camil.com.br/release-1t26.pdf", bytes: "Release 1T26", country: "BR"},
      {id: "anbima_snapshot", topic: "market", url: "https://data.anbima.com.br/emissoes", bytes: "", licence: {policy: "manual_only", note: "consulta manual"}},
    ],
  });

  it("stores bytes only when the licence allows retention", () => {
    expect(pack.entries.find((entry) => entry.id === "anbima_snapshot")?.path).toBeNull();
    expect(() => sourcePackEntrySchema.parse({...pack.entries[0], licence: {policy: "no_retention"}})).toThrow(/forbids retention/);
    expect(() => sourcePackEntrySchema.parse({...pack.entries[0], path: null})).toThrow(/stores its bytes/);
    expect(() => sourcePackSchema.parse({...pack, entries: [pack.entries[0], pack.entries[0]]})).toThrow(/duplicate/);
  });

  it("answers searches from the pack alone, by topic, country and allowlist", async () => {
    const provider = createSourcePackProvider(pack);
    expect(provider.id).toBe("source_pack");
    const identity = await provider.search(query("identity"));
    expect(identity.map((source) => source.url)).toEqual(["https://ri.camil.com.br/itr-1t26.pdf"]);
    expect(identity[0]?.contentAcquisition?.acquiredBy).toBe("source_pack");
    expect(await provider.search(query("regulation"))).toEqual([]);
    expect(await provider.search(query("news", {country: "US"}))).toEqual([]);
    expect(await provider.search(query("news", {domainAllowlist: ["cvm.gov.br"]}))).toEqual([]);
    expect((await provider.search(query("news", {domainAllowlist: ["camil.com.br"]}))).length).toBe(1);
  });

  it("serves stored bytes, refuses anything outside the pack and notices drift", async () => {
    const acquire = createSourcePackAcquirer(pack, read);
    const acquired = await acquire({url: "https://ri.camil.com.br/itr-1t26.pdf"});
    expect(new TextDecoder().decode(acquired.content as Uint8Array)).toBe("ITR 1T26");
    expect(acquired.lineage.acquiredBy).toBe("source_pack");
    await expect(acquire({url: "https://www.b3.com.br/qualquer"})).rejects.toMatchObject({code: "source_pack_miss"});
    await expect(acquire({url: "https://data.anbima.com.br/emissoes"})).rejects.toMatchObject({code: "source_pack_not_retained"});
    bytes.set("itr_1t26", new TextEncoder().encode("ITR 1T26 alterado"));
    await expect(acquire({url: "https://ri.camil.com.br/itr-1t26.pdf"})).rejects.toMatchObject({code: "source_pack_drift"});
  });

  it("verifies a whole pack against its manifest", async () => {
    const fresh = inMemorySourcePack({caseId: "gc01", files: [{id: "a1", topic: "identity", url: "https://x.example/a", bytes: "A"}, {id: "b1", topic: "news", url: "https://x.example/b", bytes: "B"}]});
    expect((await verifySourcePack(fresh.pack, fresh.read)).ok).toBe(true);
    fresh.bytes.delete("b1");
    fresh.bytes.set("a1", new TextEncoder().encode("changed"));
    const verdict = await verifySourcePack(fresh.pack, fresh.read);
    expect(verdict).toMatchObject({ok: false, drifted: ["a1"], missing: ["b1"]});
  });

  it("builds an entry from a live acquisition once, with the hash of what was fetched", () => {
    const entry = sourcePackEntryFromAcquisition({
      id: "fato_relevante",
      topic: "news",
      title: "Fato relevante",
      asOfDate: "2026-08-15",
      version: "2026-08-15",
      licence: {policy: "public_reusable"},
      path: "fato_relevante.pdf",
      acquired: {
        lineage: {
          sourceUrl: "https://www.cvm.gov.br/fato", finalUrl: "https://www.cvm.gov.br/fato.pdf", publisherSourceId: "cvm_open_data",
          publisherAuthorityTier: 1, acquiredBy: "direct_https", retrievedAt: "2026-09-04T12:00:00.000Z",
          contentType: "application/pdf", byteSize: 4, contentHash: "0".repeat(64),
        },
        content: "fato",
      },
    });
    expect(entry.byteSize).toBe(4);
    expect(entry.sha256).toHaveLength(64);
    expect(entry.publisherSourceId).toBe("cvm_open_data");
  });
});
