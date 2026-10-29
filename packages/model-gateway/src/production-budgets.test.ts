import {readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {productionModelCeilingsUsd, productionRunBudget} from "./production-budgets";

/**
 * The run budget travels to `private.begin_processing_run`, which validates it and divides it
 * between the documents and the case analysis. These are the rules of that function (migration
 * 20260829003002_economic_pipeline_guardrails.sql plus the 29 Oct numeric follow-up): a budget outside them is refused with
 * `processing_budget_invalid` and no run starts.
 */
type RunBudget = {[Key in keyof typeof productionRunBudget]: number};
function allocate(budget: RunBudget, paidDocuments: number) {
  const valid = budget.max_cost_usd > 0 && budget.max_cost_usd <= 30
    && budget.max_calls >= 1 && budget.max_calls <= 500
    && budget.document_max_cost_usd > 0 && budget.document_max_cost_usd <= budget.max_cost_usd
    && budget.document_max_calls >= 1 && budget.document_max_calls <= 50
    && budget.case_max_cost_usd > 0 && budget.case_max_cost_usd < budget.max_cost_usd
    && budget.case_max_calls >= 1 && budget.case_max_calls <= 20 && budget.case_max_calls < budget.max_calls;
  return {
    valid,
    documentUsd: Math.min(budget.document_max_cost_usd, (budget.max_cost_usd - budget.case_max_cost_usd) / paidDocuments),
    documentCalls: Math.min(budget.document_max_calls, Math.floor((budget.max_calls - budget.case_max_calls) / paidDocuments)),
  };
}

describe("production budgets", () => {
  it("passes the database's validation and gives an eight-document room the whole per-document ceiling", () => {
    expect(allocate(productionRunBudget, 8)).toEqual({valid: true, documentUsd: productionModelCeilingsUsd.documentPipeline, documentCalls: 50});
    // Beyond eight documents the database divides what the case leaves, as it always has.
    expect(allocate(productionRunBudget, 10).documentUsd).toBeCloseTo((30 - 3.1) / 10, 10);
    expect(productionRunBudget.case_max_cost_usd).toBe(productionModelCeilingsUsd.caseAnalysis);
  });

  it("admits at every room size at least 1.49 times what the old run budget gave a document", () => {
    // 1.49 is the largest ratio of calibrated to former reservation over the document requests:
    // with it no call the former estimate admitted is refused for money by the calibrated one.
    const old: RunBudget = {max_cost_usd: 5, max_calls: 160, document_max_cost_usd: 0.75, document_max_calls: 8, case_max_cost_usd: 1, case_max_calls: 4};
    for (let documents = 1; documents <= 40; documents++) {
      expect(allocate(productionRunBudget, documents).documentUsd / allocate(old, documents).documentUsd, `${documents}`).toBeGreaterThanOrEqual(1.49);
    }
    expect(productionModelCeilingsUsd.caseAnalysis / old.case_max_cost_usd).toBeGreaterThanOrEqual(1.58);
  });

  it("names every ceiling in whole cents of five, never zero", () => {
    for (const [name, value] of Object.entries(productionModelCeilingsUsd)) {
      expect(value, name).toBeGreaterThan(0);
      expect(Math.round(value * 100) % 5, name).toBe(0);
    }
  });
});

/**
 * The ceilings the database holds are written by the migration `*_production_budget_ceilings.sql`,
 * found by name because its stamp becomes the production version once it is applied. Each of its
 * patches rewrites the current body of one function by exact text. This fixture names, per
 * function, the migration the old text comes from and every number the patch changes, in the order
 * they appear, from the old value to the constant it must equal.
 */
const {caseAnalysis} = productionModelCeilingsUsd;
const databaseCeilings: Array<{signature: string; source: string; changes: Array<[number, number]>}> = [
  // The job payload and the run budget: the same text, twice.
  {signature: "private.normalize_origination_runtime_budget_v1()", source: "20260903215610_origination_completion_headroom.sql",
    changes: [[1.5, productionModelCeilingsUsd.originationThesis]]},
  {signature: "private.worker_activate_integration_preview_run_v1(uuid,text,uuid,jsonb)", source: "20260905175807_integration_preview_run_budget_v2.sql",
    changes: [[0.5, productionModelCeilingsUsd.integrationPreview]]},
  // Historical 25 Sep defaults. The 29 Oct follow-up is tested separately below.
  {signature: "private.begin_processing_run(uuid,uuid,text,jsonb,text,jsonb)", source: "20260829003002_economic_pipeline_guardrails.sql",
    changes: [[5, 16], [0.75, 1.6], [1, 3.1]]},
  {signature: "private.enqueue_primary_case_analysis(uuid,uuid,uuid)", source: "20260904040355_preliminary_understanding_completion_budget.sql",
    changes: [[1, caseAnalysis]]},
  // The run, its case share and the job.
  {signature: "private.enqueue_incremental_deal_state_analysis(uuid,uuid,text)", source: "20260829211621_enqueue_material_production_from_approved_plan.sql",
    changes: [[1, caseAnalysis], [1, caseAnalysis], [1, caseAnalysis]]},
  // The run keeps the 0.50 it had above its case share, and the case share is the case job's budget.
  {signature: "private.worker_enqueue_receivables_method_refresh_v1(uuid,text,text,text)", source: "20260907054112_receivables_method_complete_refresh.sql",
    changes: [[1.5, caseAnalysis + 0.5], [1, caseAnalysis]]},
];

const migrations = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
const capturedBodies = fileURLToPath(new URL("../../../docs/build/schema-history/effective-function-bodies/", import.meta.url));
const read = (directory: string, file: string) => readFileSync(join(directory, file), "utf8");
const migrationFiles = readdirSync(migrations).filter((file) => file.endsWith(".sql")).sort();
const ceilingsFile = migrationFiles.filter((file) => file.endsWith("_production_budget_ceilings.sql")).at(-1);
const earlierFiles = ceilingsFile ? migrationFiles.slice(0, migrationFiles.indexOf(ceilingsFile)) : [];
const ceilingsSql = ceilingsFile ? read(migrations, ceilingsFile) : "";
const documentBudgetFile = migrationFiles.find((file) => file.endsWith("_document_processing_budget_headroom.sql"))!;
const documentBudgetSql = read(migrations, documentBudgetFile);
const documentBudgetBefore = /old_text constant text := \$old\$([\s\S]*?)\$old\$/.exec(documentBudgetSql)![1]!;
const documentBudgetAfter = /new_text constant text := \$new\$([\s\S]*?)\$new\$/.exec(documentBudgetSql)![1]!;
const patchBlock = /^do \$(\w+)\$\n([\s\S]*?)^end \$\1\$;$/gm;
const patches = [...ceilingsSql.matchAll(patchBlock)].map(([, , block = ""]) => {
  const texts = new Map([...block.matchAll(/^ +(\w+) constant text := \$(old|new)\$([\s\S]*?)\$\2\$;$/gm)]
    .map(([, name = "", , text = ""]) => [name, text] as const));
  return {
    block,
    signature: /pg_get_functiondef\('([^']+)'::regprocedure\)/.exec(block)?.[1] ?? "",
    // Each guard names one old text and how many times the body must hold it.
    replacements: [...block.matchAll(/length\(replace\(body, (old_\w+), ''\)\)\) \/ length\(\1\) <> (\d+)/g)].map(([, name = "", times = ""]) => ({
      name, before: texts.get(name) ?? "", after: texts.get(name.replace("old_", "new_")) ?? "", occurrences: Number(times),
    })),
  };
});
const countOf = (text: string, part: string) => text.split(part).length - 1;
const cents = (value: number) => Math.round(value * 100);
const NUMBER = /\d+(?:\.\d+)?/g;
/** Where a migration creates the function; its body is the text between the next two `$$`. */
const creation = (signature: string, flags: string) =>
  new RegExp(`create (?:or replace )?function ${signature.slice(0, signature.indexOf("(")).replace(".", "\\.")}\\(`, flags);

describe("production budgets in the database", () => {
  it("patches exactly these six functions and creates, grants or drops nothing", () => {
    expect(ceilingsFile).toBeDefined();
    expect(patches.map((patch) => patch.signature)).toEqual(databaseCeilings.map((ceiling) => ceiling.signature));
    // Outside the patch blocks the migration holds only comments.
    expect(ceilingsSql.replace(patchBlock, "").replace(/^--.*$/gm, "").trim()).toBe("");
    for (const patch of patches) {
      expect(patch.replacements.length, patch.signature).toBeGreaterThan(0);
      expect(patch.block, patch.signature).toMatch(/^ {2}execute replace\(/m);
      for (const {name, before, after} of patch.replacements) {
        expect(before.length * after.length, name).toBeGreaterThan(0);
        expect(patch.block, name).toContain(`, ${name}, ${name.replace("old_", "new_")})`);
      }
    }
  });

  it("changes only numbers, each to the constant the code derives", () => {
    patches.forEach((patch, index) => {
      const changes = patch.replacements.flatMap(({before, after}) => {
        // The same text around the numbers: only a number changes.
        expect(after.replace(NUMBER, "#"), patch.signature).toBe(before.replace(NUMBER, "#"));
        const next = after.match(NUMBER) ?? [];
        return (before.match(NUMBER) ?? []).flatMap((value, at) => value === next[at] ? [] : [[cents(Number(value)), cents(Number(next[at]))]]);
      });
      expect(changes, patch.signature).toEqual(databaseCeilings[index]!.changes.map(([from, to]) => [cents(from), cents(to)]));
    });
  });

  it("finds every old text in the body the database runs, as many times as its guard requires", () => {
    patches.forEach((patch, index) => {
      const {signature, source} = databaseCeilings[index]!;
      // The cited migration is the last one to create the function.
      expect(earlierFiles.filter((file) => creation(signature, "i").test(read(migrations, file))).at(-1), signature).toBe(source);
      const sourceSql = read(migrations, source);
      const start = [...sourceSql.matchAll(creation(signature, "gi"))].at(-1)?.index ?? -1;
      expect(start, signature).toBeGreaterThanOrEqual(0);
      const opening = sourceSql.indexOf("$$", start) + 2;
      const createdBody = sourceSql.slice(opening, sourceSql.indexOf("$$", opening));
      // A function an earlier migration rewrote by text runs the body captured from the database,
      // committed before this migration is applied (old text) or after it (new text).
      const rewritten = earlierFiles.some((file) => [...read(migrations, file).matchAll(/pg_get_functiondef\s*\(\s*'([^']+)'\s*::\s*regprocedure/gi)]
        .some(([, target = ""]) => target.replace(/\s+/g, "").toLowerCase() === signature));
      let captured = rewritten ? read(capturedBodies, `${signature}.sql`) : undefined;
      // The current capture includes the independently checked 29 Oct follow-up. Restore only
      // its exact budget block to test the historical 25 Sep patch against its own version.
      if (captured !== undefined && signature === "private.begin_processing_run(uuid,uuid,text,jsonb,text,jsonb)"
          && countOf(captured, documentBudgetAfter) === 1) {
        expect(countOf(captured, documentBudgetBefore), signature).toBe(0);
        captured = captured.replace(documentBudgetAfter, documentBudgetBefore);
      }
      for (const {before, after, occurrences} of patch.replacements) {
        expect(countOf(createdBody, before), signature).toBe(occurrences);
        if (captured !== undefined) expect([countOf(captured, before), countOf(captured, after)], signature).toContain(occurrences);
      }
    });
  });
});

describe("29 Oct document budget follow-up", () => {
  it("keeps the finite call and spend bounds aligned with code, without grants or new objects", () => {
    const sql = documentBudgetSql;
    const next = documentBudgetAfter;
    const budget = Object.fromEntries([...next.matchAll(/'([a-z_]+)', ([\d.]+)/g)].map((match) => [match[1], Number(match[2])]));
    expect(budget).toEqual(productionRunBudget);
    expect(sql).toContain("'max_cost_usd')::numeric > 30");
    expect(sql).not.toMatch(/\b(?:grant|revoke|create table|alter table)\b/i);
    expect(allocate(productionRunBudget, 8).documentCalls).toBe(50);
    expect(allocate(productionRunBudget, 8).documentUsd).toBe(3.15);
  });

  it("matches the effective function and changes only the declared numbers from its prior version", () => {
    expect(documentBudgetAfter.replace(NUMBER, "#")).toBe(documentBudgetBefore.replace(NUMBER, "#"));
    const captured = read(capturedBodies, "private.begin_processing_run(uuid,uuid,text,jsonb,text,jsonb).sql");
    expect(countOf(captured, documentBudgetAfter)).toBe(1);
    expect(countOf(captured, documentBudgetBefore)).toBe(0);
    expect(countOf(captured, "(effective_budget->>'max_cost_usd')::numeric > 30")).toBe(1);
    expect(countOf(captured, "(effective_budget->>'max_cost_usd')::numeric > 25")).toBe(0);
  });
});
