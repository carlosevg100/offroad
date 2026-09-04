import {describe, expect, it, vi} from "vitest";

import {SourcePackUnavailableError, createResearchRouter, type LoadedSourcePack} from "./research-routing";

const pack = (caseId: string): LoadedSourcePack => ({
  pack: {schemaVersion: "source-pack.v1", caseId, subject: {legalName: "Camil Alimentos S.A.", website: "https://www.camilalimentos.com.br", sector: "Alimentos", geography: "BR"}, frozenAt: "2026-09-04T00:00:00.000Z", entries: []},
  read: async () => new Uint8Array(),
});

describe("research routing per job", () => {
  const live = {providers: [{id: "live", search: vi.fn()} as never], officialResearchProviderFactory: "factory", contentAcquirer: "firecrawl", frozenCaseId: null};

  it("keeps live research for a job without a binding", async () => {
    const route = createResearchRouter({live, packsDir: "/packs", load: vi.fn(), contentAcquirerFromPack: () => "pack-acquirer"});
    const research = await route({source_pack_id: null});
    expect(research.frozenCaseId).toBeNull();
    expect(research.officialResearchProviderFactory).toBe("factory");
    expect(research.contentAcquirer).toBe("firecrawl");
  });

  it("reads the bound pack and nothing else, loading it once", async () => {
    const load = vi.fn(async (directory: string) => {
      expect(directory).toBe("/packs/gc01-analista-ib-camil");
      return pack("gc01-analista-ib-camil");
    });
    const route = createResearchRouter({live, packsDir: "/packs", load, contentAcquirerFromPack: () => "pack-acquirer"});
    const first = await route({source_pack_id: "gc01-analista-ib-camil"});
    const second = await route({source_pack_id: "gc01-analista-ib-camil"});
    expect(first.frozenCaseId).toBe("gc01-analista-ib-camil");
    expect(first.officialResearchProviderFactory).toBeUndefined();
    expect(first.contentAcquirer).toBe("pack-acquirer");
    expect(first.providers.map((provider) => provider.id)).toEqual(["source_pack"]);
    expect(second.frozenCaseId).toBe("gc01-analista-ib-camil");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("fails a bound job instead of going live when the pack cannot be loaded", async () => {
    const noDir = createResearchRouter({live, packsDir: undefined, load: vi.fn(), contentAcquirerFromPack: () => "x"});
    await expect(noDir({source_pack_id: "gc01-analista-ib-camil"})).rejects.toBeInstanceOf(SourcePackUnavailableError);
    const broken = createResearchRouter({live, packsDir: "/packs", load: vi.fn(async () => { throw new Error("ENOENT"); }), contentAcquirerFromPack: () => "x"});
    await expect(broken({source_pack_id: "gc01-analista-ib-camil"})).rejects.toMatchObject({code: "source_pack_unavailable"});
    // A failed load is not cached: the next attempt tries again.
    await expect(broken({source_pack_id: "gc01-analista-ib-camil"})).rejects.toBeInstanceOf(SourcePackUnavailableError);
  });
});
