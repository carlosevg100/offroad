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

describe("the provenance walk after the quarter close priors", () => {
  it("is the lote 3 provenance body (20261026203118, in production) byte for byte for every other method, every lote 3 binding kept", () => {
    const before = body("20261026203118_lote3_payload_provenance.sql"), after = body("20261027010426_lote3_quarter_update_priors.sql");
    const added = after.split("\n").filter((line) => line.endsWith(" -- quarter close"));
    expect(added.length).toBe(6);
    const restored = after.split("\n").filter((line) => !line.endsWith(" -- quarter close")).join("\n");
    expect(restored).toBe(before);
    // Every lote 3 method stays bound by version, manifest and payload schema.
    for (const id of ["build-operating-projection", "challenge-financial-projection", "monetize-receivables-for-working-capital", "update-after-quarter-close"])
      expect(after.includes(`c#>>'{method,methodId}'='${id}' and (c#>>'{method,methodVersion}' is distinct from '2026.10.26-v1'`), id).toBe(true);
  });
});
