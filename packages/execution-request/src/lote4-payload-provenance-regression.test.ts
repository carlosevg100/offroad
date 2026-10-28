import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";

const migrations = join(__dirname, "../../../supabase/migrations");
const body = (file: string) => {
  const text = readFileSync(join(migrations, file), "utf8");
  const start = text.indexOf("create or replace function private.execution_capital_payload_current_v1");
  const end = text.indexOf("revoke all on function private.execution_capital_payload_current_v1(jsonb,jsonb,uuid)", start);
  expect(start).toBeGreaterThanOrEqual(0);
  return text.slice(start, end);
};
const lote4 = ["organize-document-folder", "evaluate-received-proposal", "evaluate-financing-paths", "prepare-board-capital-discussion"];

describe("the provenance walk with the lote 4 methods", () => {
  it("is the quarter close body (20261027010426) byte for byte for every other method", () => {
    const before = body("20261027010426_lote3_quarter_update_priors.sql"), after = body("20261028120400_lote4_payload_provenance.sql");
    const restored = after.split("\n").filter((line) => !line.endsWith(" -- lote 4")).join("\n")
      .replace(`,${lote4.map((m) => `'${m}'`).join(",")}) then return true;end if;`, ") then return true;end if;");
    expect(restored).toBe(before);
    expect(after.split("\n").filter((line) => line.endsWith(" -- lote 4")).length).toBe(28);
    // The null method is still refused, first.
    expect(after.indexOf("if c#>>'{method,methodId}' is null then return false;end if;")).toBeLessThan(after.indexOf("prepare-board-capital-discussion"));
  });
  it("binds each lote 4 method to its version, published manifest and payload schema, and the two that read priors to their records", () => {
    const after = body("20261028120400_lote4_payload_provenance.sql");
    const manifests: Record<string, [string, string]> = {
      "organize-document-folder": ["4378d63bf0b7465838fefe7e3463dbc755cd6c022803a60ac7fe32d368f75248", "document-folder-inventory-packet-input.v1"],
      "evaluate-received-proposal": ["4e092f29299e5cefcf650532b470794a387c077474503ace43909a93c1d040e0", "received-proposal-packet-input.v1"],
      "evaluate-financing-paths": ["e306d411ea0e88bcbabe3bb3a62e80bfd43d1e65055477cfcda042d549606af4", "capital-structure-paths-packet-input.v1"],
      "prepare-board-capital-discussion": ["c47-awaits-publication", "board-capital-discussion-packet-input.v1"],
    };
    for (const [id, [hash, schema]] of Object.entries(manifests)) {
      expect(after.includes(`c#>>'{method,methodId}'='${id}' and (c#>>'{method,methodVersion}' is distinct from '2026.10.27-v1'`), id).toBe(true);
      expect(after.includes(`c#>>'{method,manifestHash}' is distinct from '${hash}'`), id).toBe(true);
      expect(after.includes(`payload->>'schemaVersion' is distinct from '${schema}'`), id).toBe(true);
    }
    expect(after.includes("not private.board_material_priors_recorded_v1(c,payload)")).toBe(true);
    expect(after.includes("not private.document_folder_prior_recorded_v1(c,payload)")).toBe(true);
    expect(after.includes("p->>'assumptionVersionId'=private.execution_json_projection_v1(payload#>>'{analysis,discussion,envelope,canonical}')->>'versionId'")).toBe(true);
  });
  it("pins exactly the manifestHash of each publication record, and refuses C47 until its publication", () => {
    const after = body("20261028120400_lote4_payload_provenance.sql");
    const runs = join(__dirname, "../../credit-playbook/knowledge/reviews/runs");
    const pinOf = (id: string) => {
      const branch = after.slice(after.indexOf(`(c#>>'{method,methodId}'='${id}' and (c#>>'{method,methodVersion}'`));
      return /c#>>'\{method,manifestHash\}' is distinct from '([^']+)'/.exec(branch)![1];
    };
    for (const id of ["organize-document-folder", "evaluate-received-proposal", "evaluate-financing-paths"]) {
      const record = (file: string) => JSON.parse(readFileSync(join(runs, `${id}-2026-10-27-v1-publication`, file), "utf8"));
      const manifest = record("manifest.json");
      expect(manifest.procedure).toMatchObject({id, version: "2026.10.27-v1"});
      // The manifest record, the founder's instruction and the content approval name one published hash; the SQL pins it.
      expect([record("founder-instruction.json").manifestHash, record("content-approval.json").manifestHash]).toEqual([manifest.manifestHash, manifest.manifestHash]);
      expect(pinOf(id), id).toBe(manifest.manifestHash);
    }
    expect(pinOf("prepare-board-capital-discussion")).not.toMatch(/^[a-f0-9]{64}$/);
  });
});
