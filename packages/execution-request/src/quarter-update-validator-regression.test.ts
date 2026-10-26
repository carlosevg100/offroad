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
  it("is the lote 2 body byte for byte for every other method", () => {
    const before = body("20261023204746_lote2_payload_provenance.sql"), after = body("20261026160400_lote3_quarter_update_priors.sql");
    const added = after.split("\n").filter((line) => line.endsWith(" -- quarter close"));
    expect(added.length).toBe(6);
    const restored = after.split("\n").filter((line) => !line.endsWith(" -- quarter close")).join("\n")
      .replace(",'update-after-quarter-close') then return true;end if;", ") then return true;end if;");
    expect(restored).toBe(before);
    // The only other difference is the quarter close in the list of bound methods.
    expect(after.match(/update-after-quarter-close/g)).toHaveLength(2);
  });
});
