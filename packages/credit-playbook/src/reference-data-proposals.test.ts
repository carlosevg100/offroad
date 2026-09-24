import {existsSync, readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

import {referenceDataProposalFamilies, referenceDataProposals} from "./reference-data-proposals";
import {referenceDataRegistry} from "./reference-data";

const knowledge = new URL("../knowledge/reference-data/", import.meta.url);

describe("reference data proposals", () => {
  it("proposes only registered keys, each as a draft that awaits the founder's review", () => {
    const registered = new Map(referenceDataRegistry.map((entry) => [entry.key, entry]));
    for (const [key, proposal] of Object.entries(referenceDataProposals)) {
      const entry = registered.get(key);
      expect(entry, key).toBeDefined();
      expect(entry!.status, key).toBe("draft");
      expect(entry!.value, key).toEqual(proposal.value);
      expect(entry!.validUntil, key).toBeNull();
      expect(proposal.version, key).toMatch(/^\d{4}\.\d{2}\.\d{2}-v\d+$/);
      expect(proposal.source.observedBy ?? "", key).toMatch(/aguardando revisão do fundador/);
    }
  });

  it("keeps the full professional text of each proposal in a parameter card headed by its key", () => {
    for (const [key, proposal] of Object.entries(referenceDataProposals)) {
      const [file, anchor] = proposal.documentation.split("#");
      expect(file, key).toMatch(/^knowledge\/reference-data\/[a-z0-9-]+\.md$/);
      expect(anchor, key).toBe(key);
      const path = new URL(file!.slice("knowledge/reference-data/".length), knowledge);
      expect(existsSync(path), key).toBe(true);
      expect(readFileSync(path, "utf8").split("\n"), key).toContain(`### ${key}`);
    }
  });

  it("leaves approval to the owner: no family carries a status of its own", () => {
    for (const family of Object.values(referenceDataProposalFamilies)) {
      for (const proposal of Object.values(family)) expect(proposal).not.toHaveProperty("status");
    }
  });
});
