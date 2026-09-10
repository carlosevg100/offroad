import {readFileSync, readdirSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {capitalProjectJobSchema} from "./capital-jobs";
import {documentWorkPlanSnapshot} from "./document-work-plan";

describe("explicit documentary work revision admission", () => {
  it("admits exactly the current compiler graph for all six existing entries", () => {
    const directory = new URL("../../../supabase/migrations/", import.meta.url);
    const file = readdirSync(directory).find(name => name.endsWith("_explicit_documentary_work_revision.sql"));
    expect(file).toBeDefined();
    const sql = readFileSync(new URL(file!, directory), "utf8");
    const contract = JSON.parse(sql.split("$documentary_contract$")[1]!);
    const fixture = readFileSync(new URL("../../../supabase/tests/support/documentary_plan_snapshots.sql", import.meta.url), "utf8");
    expect(JSON.parse(fixture.split("$documentary_contract$")[1]!)).toEqual(contract);
    expect(Object.keys(contract).sort()).toEqual([...capitalProjectJobSchema.options].sort());
    for (const entry of capitalProjectJobSchema.options) {
      expect(contract[entry]).toEqual(documentWorkPlanSnapshot(entry));
      expect(contract[entry].taskSpecs.map((task: {id: string}) => task.id)).toEqual(["Q01", "Q02", "Q03"]);
      expect(contract[entry].parallelBatches).toEqual([["Q01"], ["Q02"], ["Q03"]]);
    }
  });
});
